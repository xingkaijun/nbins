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
