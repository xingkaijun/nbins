# M3 D1 Wrangler Dev Smoke

This milestone proves the D1 runtime wiring under `wrangler dev` (local mode) with persistence.

## Prereqs

- `pnpm i` at repo root.

## Run worker with local D1 persistence

```bash
pnpm --filter @nbins/api exec wrangler dev --local --persist-to .wrangler/state --port 8787
```

You should see:

- `env.DB (nbins-local) D1 Database local`
- `Ready on http://localhost:8787`

## Bootstrap schema (local D1)

First generate the canonical SQL from schema metadata:

```bash
pnpm --filter @nbins/api run gen:bootstrap-sql -- src/db/d1-bootstrap.sql  # relative to packages/api
```

Then apply it against the local D1 DB used by wrangler dev:

```bash
pnpm --filter @nbins/api exec wrangler d1 execute DB --local --persist-to .wrangler/state --file packages/api/src/db/d1-bootstrap.sql
```

## Exercise GET + PUT

```bash
curl -sS http://localhost:8787/api/meta | jq
curl -sS http://localhost:8787/api/inspections/insp-002 | jq '.data | {id,version,openCommentCount,workflowStatus}'

VERSION=$(curl -sS http://localhost:8787/api/inspections/insp-002 | jq -r '.data.version')

curl -sS -X PUT http://localhost:8787/api/inspections/insp-002/rounds/current/result \
  -H 'content-type: application/json' \
  --data "{\"result\":\"QCC\",\"actualDate\":\"2026-04-04\",\"submittedBy\":\"user-inspector-li\",\"expectedVersion\":${VERSION},\"comments\":[]}" \
  | jq '.ok, .data.item.version, .data.item.openCommentCount, .data.item.workflowStatus'

curl -sS http://localhost:8787/api/inspections/insp-002 | jq '.data | {id,version,openCommentCount,workflowStatus}'
```

## Persistence check

Stop and restart `wrangler dev` with the same `--persist-to .wrangler/state` directory.

Then rerun:

```bash
curl -sS http://localhost:8787/api/inspections/insp-002 | jq '.data | {id,version,openCommentCount,workflowStatus}'
```

The `version` should still reflect the prior PUT (persistence across restart).

## Notes / Known limitation

- The current API contract only supports submitting new comments (message-only). It does not yet support resolving existing comments via the PUT route, so `openCommentCount` does not drop in this smoke.
