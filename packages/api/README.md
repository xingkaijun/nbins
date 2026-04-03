# @nbins/api

Cloudflare Workers-compatible Hono API for the NBINS MVP demo lane.

## Available routes

- `GET /health`
- `GET /api/meta`
- `GET /api/inspections/:id`
- `PUT /api/inspections/:id/rounds/current/result`
- `GET /api/dev/inspection-item-submission`
- `GET /api/dev/inspection-item-submission/examples`
- `GET /api/dev/resolve-item-state`
- `GET /api/dev/resolve-item-state/examples`

## Local development

From the repo root:

```bash
pnpm install
pnpm dev:api
```

Wrangler serves the API at `http://127.0.0.1:8787`.

### D1 under Wrangler dev

By default, the API uses the mock storage path. The mock path is used when either of these is true:

- `D1_DRIVER` is unset or not `d1`
- the Wrangler `DB` binding is missing or unresolved

To exercise the D1 path locally, keep the `DB` binding in [`packages/api/wrangler.jsonc`](/workspace/nbins/packages/api/wrangler.jsonc) and set `D1_DRIVER=d1` when starting dev.

1. Create or select a D1 database:

```bash
pnpm --filter @nbins/api exec wrangler d1 create nbins-local
```

Wrangler will print a `database_name` and `database_id`. Copy those into [`packages/api/wrangler.jsonc`](/workspace/nbins/packages/api/wrangler.jsonc) under the `d1_databases` entry for binding `DB`.

If you want to point at an existing database instead, keep `binding = "DB"` and update `database_name` / `database_id` to that database's values.

2. Generate a bootstrap SQL file from the existing schema helper in [`packages/api/src/db/sql.ts`](/workspace/nbins/packages/api/src/db/sql.ts):

```bash
cat >/tmp/nbins-api-bootstrap.sql <<'SQL'
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "disciplines" TEXT NOT NULL DEFAULT '[]',
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "projects" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "recipients" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "ships" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "projects"("id"),
  "hullNumber" TEXT NOT NULL,
  "shipName" TEXT NOT NULL,
  "shipType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'building',
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "inspection_items" (
  "id" TEXT PRIMARY KEY,
  "shipId" TEXT NOT NULL REFERENCES "ships"("id"),
  "itemName" TEXT NOT NULL,
  "itemNameNormalized" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "workflowStatus" TEXT NOT NULL DEFAULT 'pending',
  "lastRoundResult" TEXT,
  "resolvedResult" TEXT,
  "currentRound" INTEGER NOT NULL DEFAULT 1,
  "openCommentsCount" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "inspection_rounds" (
  "id" TEXT PRIMARY KEY,
  "inspectionItemId" TEXT NOT NULL REFERENCES "inspection_items"("id"),
  "roundNumber" INTEGER NOT NULL,
  "rawItemName" TEXT NOT NULL,
  "plannedDate" TEXT,
  "actualDate" TEXT,
  "yardQc" TEXT,
  "result" TEXT,
  "inspectedBy" TEXT REFERENCES "users"("id"),
  "notes" TEXT,
  "source" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "comments" (
  "id" TEXT PRIMARY KEY,
  "inspectionItemId" TEXT NOT NULL REFERENCES "inspection_items"("id"),
  "createdInRoundId" TEXT NOT NULL REFERENCES "inspection_rounds"("id"),
  "closedInRoundId" TEXT REFERENCES "inspection_rounds"("id"),
  "authorId" TEXT NOT NULL REFERENCES "users"("id"),
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "closedBy" TEXT REFERENCES "users"("id"),
  "closedAt" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
SQL
```

3. Bootstrap schema into local D1 state:

```bash
pnpm --filter @nbins/api exec wrangler d1 execute DB --local --file=/tmp/nbins-api-bootstrap.sql
```

4. Bootstrap schema into the remote D1 database instead:

```bash
pnpm --filter @nbins/api exec wrangler d1 execute DB --remote --file=/tmp/nbins-api-bootstrap.sql
```

5. Run the API against D1:

```bash
D1_DRIVER=d1 pnpm dev:api
```

If you omit `D1_DRIVER=d1`, or if the `DB` binding is not configured correctly in Wrangler, the API falls back to mock storage even while running `pnpm dev:api`.

## Demo curl commands

Fetch one inspection item:

```bash
curl http://127.0.0.1:8787/api/inspections/insp-002
```

Submit `QCC` with tracking comments:

```bash
curl -X PUT http://127.0.0.1:8787/api/inspections/insp-003/rounds/current/result \
  -H 'Content-Type: application/json' \
  -d '{
    "result": "QCC",
    "actualDate": "2026-04-03",
    "submittedAt": "2026-04-03T11:00:00.000Z",
    "submittedBy": "user-inspector-wang",
    "inspectorDisplayName": "Wang Wu",
    "expectedVersion": 5,
    "comments": [
      { "message": "Monitor one repaired weld during close-out." }
    ]
  }'
```

Prove that `AA` cannot introduce new comments:

```bash
curl -X PUT http://127.0.0.1:8787/api/inspections/insp-002/rounds/current/result \
  -H 'Content-Type: application/json' \
  -d '{
    "result": "AA",
    "actualDate": "2026-04-03",
    "submittedAt": "2026-04-03T11:30:00.000Z",
    "submittedBy": "user-inspector-li",
    "inspectorDisplayName": "Li Si",
    "expectedVersion": 3,
    "comments": [
      { "message": "This should fail." }
    ]
  }'
```

## Validation

```bash
pnpm test:api
pnpm qa
```
