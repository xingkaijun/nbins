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
pnpm --filter @nbins/api run gen:bootstrap-sql -- /tmp/nbins-api-bootstrap.sql
```

3. Bootstrap schema into local D1 state:

```bash
pnpm --filter @nbins/api exec wrangler d1 execute DB --local --file=/tmp/nbins-api-bootstrap.sql
```

4. Run the API against D1:

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
