#!/usr/bin/env bash
# nbins real-port smoke test (needs curl + jq, and `pnpm build:nbins` first):
# fresh database in a temp dir, dist/server.mjs bound to 127.0.0.1 only, then
# health / login / list / detail / write / upload / SPA fallback / SQL console
# (right + wrong secret) / restart persistence, then the server is stopped.
#
#   bash scripts/smoke-local.sh            # PORT=8787 by default
#   SQL_SECRET=<expected secret> bash scripts/smoke-local.sh
#
# The server reads its config (SQL_CONSOLE_SECRET included) from packages/api/.env.
# SQL_SECRET is the secret the test sends; it defaults to the value in that file.
set -u
REPO=$(cd "$(dirname "$0")/.." && pwd)
API=$REPO/packages/api
WORK=${WORK:-$(mktemp -d /tmp/nbins-smoke.XXXXXX)}
SQL_SECRET=${SQL_SECRET:-$(sed -n 's/^SQL_CONSOLE_SECRET=//p' "$API/.env" 2>/dev/null | tail -1)}
echo "work dir: $WORK"
PORT=${PORT:-8787}
BASE=http://127.0.0.1:$PORT
export NBINS_ENV_FILE=$API/.env          # the real runtime env file (SQL_CONSOLE_SECRET comes from here)
export NBINS_DATA_DIR=$WORK/data
export NBINS_HOST=127.0.0.1
export NBINS_PORT=$PORT
export NBINS_WEB_DIST=$REPO/packages/web/dist
export NBINS_WEB_BASE=/nbins/

FAIL=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; else echo "FAIL  $1 expected=$2 actual=$3"; FAIL=1; fi
}
start_server() {
  (cd "$API" && exec node --disable-warning=ExperimentalWarning dist/server.mjs) >>"$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do curl -s -o /dev/null "$BASE/health" && return 0; sleep 0.2; done
  echo "server did not come up"; cat "$WORK/server.log"; exit 1
}
stop_server() { kill -TERM "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null; echo "server exit code after SIGTERM: $?"; SERVER_PID=""; }
SERVER_PID=""
# never leave a server running, even if the script stops early
trap '[ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null' EXIT

mkdir -p "$WORK"; rm -rf "$WORK/data" "$WORK/server.log"
echo "== init fresh database"
(cd "$API" && node dist/cli.mjs init) | sed 's/^/   /'

echo "== start dist/server.mjs"
start_server
sed 's/^/   /' "$WORK/server.log"
echo "== listening sockets for port $PORT"
ss -ltn | awk -v p=":$PORT" '$4 ~ p"$" {print "   " $4}'

code=$(curl -s -o $WORK/health.json -w '%{http_code}' $BASE/health); check "GET /health" 200 "$code"; echo "   $(cat $WORK/health.json)"
code=$(curl -s -o /dev/null -w '%{http_code}' $BASE/nbins/health); check "GET /nbins/health" 200 "$code"

code=$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -d '{"username":"admin1","password":"wrong"}' $BASE/api/auth/login); check "login wrong password" 401 "$code"
TOKEN=$(curl -s -H 'content-type: application/json' -d '{"username":"admin1","password":"1234"}' $BASE/nbins/api/auth/login | jq -r '.data.token // .token // empty')
check "login admin1 via /nbins/api (token issued)" yes "$([ -n "$TOKEN" ] && echo yes || echo no)"
AUTH="Authorization: Bearer $TOKEN"

code=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/inspections); check "list without token" 401 "$code"
code=$(curl -s -o $WORK/list.json -w '%{http_code}' -H "$AUTH" $BASE/api/inspections); check "GET /api/inspections" 200 "$code"
echo "   items in list: $(jq '(.data.items // .data) | length' $WORK/list.json)"

ITEM=insp-ship-A1-0
code=$(curl -s -o $WORK/detail.json -w '%{http_code}' -H "$AUTH" $BASE/api/inspections/$ITEM); check "GET /api/inspections/$ITEM" 200 "$code"
VERSION=$(jq -r '.data.version' $WORK/detail.json)
echo "   status=$(jq -r '.data.workflowStatus' $WORK/detail.json) version=$VERSION"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$AUTH" $BASE/api/inspections/does-not-exist); check "GET unknown inspection" 404 "$code"

BODY=$(jq -nc --argjson v "$VERSION" '{result:"QCC",actualDate:"2026-10-31",submittedAt:"2026-10-31T13:00:00.000Z",submittedBy:"user-admin-1",inspectorDisplayName:"Smoke Test",expectedVersion:$v,comments:[{message:"smoke test comment"}]}')
code=$(curl -s -o $WORK/write.json -w '%{http_code}' -X PUT -H "$AUTH" -H 'content-type: application/json' -d "$BODY" $BASE/api/inspections/$ITEM/rounds/current/result); check "PUT result QCC (write)" 200 "$code"
head -c 300 $WORK/write.json | sed 's/^/   /'; echo
code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "$AUTH" -H 'content-type: application/json' -d "$BODY" $BASE/api/inspections/$ITEM/rounds/current/result); check "PUT same expectedVersion again (stale)" 409 "$code"

printf '\x89PNG\r\n\x1a\nsmoke' > $WORK/smoke.png
code=$(curl -s -o $WORK/upload.json -w '%{http_code}' -H "$AUTH" -F shipId=ship-A1 -F 'file=@'$WORK/smoke.png';type=image/png' $BASE/api/media/upload); check "POST /api/media/upload (file store)" 200 "$code"
echo "   $(head -c 300 $WORK/upload.json)"
echo "   files under storage: $(find $NBINS_DATA_DIR/storage -type f | sed "s#$NBINS_DATA_DIR/##" | tr '\n' ' ')"

code=$(curl -s -o $WORK/spa.html -w '%{http_code}' $BASE/nbins/inspections/$ITEM); check "SPA fallback /nbins/inspections/$ITEM" 200 "$code"
check "SPA fallback body is index.html" yes "$(grep -q '<div id="root"' $WORK/spa.html && echo yes || echo no)"
ASSET=$(grep -o '/nbins/assets/index-[^"]*\.js' $WORK/spa.html | head -1)
code=$(curl -s -o /dev/null -w '%{http_code}' $BASE$ASSET); check "GET $ASSET" 200 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' $BASE/nbins/assets/missing.js); check "missing asset is not index.html" 404 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' $BASE/nbins); check "/nbins redirects to /nbins/" 301 "$code"

SQL='{"sql":"SELECT COUNT(*) AS n FROM users"}'
# The console needs a logged-in user (Bearer token, like the web app sends) AND X-SQL-Secret.
code=$(curl -s -o $WORK/sql-ok.json -w '%{http_code}' -H "$AUTH" -H "X-SQL-Secret: $SQL_SECRET" -H 'content-type: application/json' -d "$SQL" $BASE/api/sql/execute); check "SQL console, token + secret from .env" 200 "$code"
echo "   $(cat $WORK/sql-ok.json)"
code=$(curl -s -o $WORK/sql-ok2.json -w '%{http_code}' -H "$AUTH" -H "X-SQL-Secret: $SQL_SECRET" $BASE/nbins/api/sql/export-db); check "SQL console export-db via /nbins/api, secret from .env" 200 "$code"
echo "   tables exported: $(jq -c '.data | keys' $WORK/sql-ok2.json)"
code=$(curl -s -o $WORK/sql-bad.json -w '%{http_code}' -H "$AUTH" -H 'X-SQL-Secret: wrong-secret' -H 'content-type: application/json' -d "$SQL" $BASE/api/sql/execute); check "SQL console, token + wrong secret" 401 "$code"
echo "   $(cat $WORK/sql-bad.json)"
code=$(curl -s -o $WORK/sql-nosecret.json -w '%{http_code}' -H "$AUTH" -H 'content-type: application/json' -d "$SQL" $BASE/api/sql/execute); check "SQL console, token + no secret header" 401 "$code"
echo "   $(cat $WORK/sql-nosecret.json)"
code=$(curl -s -o $WORK/sql-notoken.json -w '%{http_code}' -H "X-SQL-Secret: $SQL_SECRET" -H 'content-type: application/json' -d "$SQL" $BASE/api/sql/execute); check "SQL console, right secret but no login token" 401 "$code"
echo "   $(cat $WORK/sql-notoken.json)"

echo "== restart server, check the write persisted on disk"
stop_server
start_server
code=$(curl -s -o $WORK/detail2.json -w '%{http_code}' -H "$AUTH" $BASE/api/inspections/$ITEM); check "GET detail after restart" 200 "$code"
echo "   status=$(jq -r '.data.workflowStatus' $WORK/detail2.json) lastRoundResult=$(jq -r '.data.lastRoundResult' $WORK/detail2.json) version=$(jq -r '.data.version' $WORK/detail2.json)"
check "version advanced after write" yes "$([ "$(jq -r '.data.version' $WORK/detail2.json)" -gt "$VERSION" ] && echo yes || echo no)"
stop_server
check "port $PORT closed after stop" 000 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/health)"

echo "== server log"
sed 's/^/   /' "$WORK/server.log"
echo "== backup + check on the smoke database"
(cd "$API" && node dist/cli.mjs backup && node dist/cli.mjs check) | sed 's/^/   /'

if [ $FAIL = 0 ]; then echo "SMOKE RESULT: ALL PASS"; else echo "SMOKE RESULT: FAILURES"; fi
exit $FAIL
