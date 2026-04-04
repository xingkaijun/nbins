# NBINS Status Board

> Updated: 2026-04-04 19:10 Asia/Shanghai
> Overall status: **D1 integration stabilized with core bugfixes; sequence-based comment IDs (localId) implemented in the persistent layer, with core inspection MVP flow fully adapted.**

This board is intended to be more concrete than the phase table in the README. It focuses on what is implemented in the current repository, what is partial, and what is still not started in code.

## Status Legend

- `✅` Implemented and usable in the current repo
- `🟡` Partially implemented, scaffolded, or demo-only
- `❌` Not started in product code yet

## At-a-Glance

| Area | Status | Current read |
|------|--------|--------------|
| Engineering foundation | ✅ | Monorepo, package scripts, and typecheck/build structure are in place |
| Shared contracts | ✅ | Shared TypeScript contracts and demo data utilities exist and are used by API and web |
| API | ✅ | Hono API exposes CRUD for projects/ships/users and batch inspection import |
| Domain rules | ✅ | Core inspection result semantics are encoded and covered by tests |
| Persistence | ✅ | D1 persistence is active across core routes (listing, detail, batch import) |
| D1 foundation | ✅ | D1 schema, bootstrap, and seeding are stable; added support for sequence-based `localId` for comments |
| Frontend workspace | ✅ | React/Vite workbench is functional, core pages linked to real D1 API |
| Testing / quality | ✅ | Typecheck plus domain, SQL, and route tests are present |
| Auth / RBAC | 🟡 | Login endpoint returns JWT; auth middleware exists; inspections routes require bearer auth; new /api/auth/me returns the current user profile; Frontend Portal implemented |
| Import / PDF / n8n | 🟡 | Manual batch import is LIVE; automated (n8n/PDF) workflows are planned |

## Engineering Foundation

**Status: `✅`**

What is in place:

- Workspace and package layout are defined in `package.json` and `pnpm-workspace.yaml`.
- Per-package TypeScript configs are present for `shared`, `api`, and `web`.
- Standard workspace scripts exist for `typecheck`, `build`, API dev, and web dev.

Representative files:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `packages/api/tsconfig.json`
- `packages/shared/tsconfig.json`
- `packages/web/tsconfig.app.json`

Delivery read:

- The repo is set up as a working multi-package baseline, not just a design-doc shell.

## Shared Contracts

**Status: `✅`**

What is in place:

- Discipline enum now includes `ENGINE` and `CTNMT` to match existing mock/demo datasets.

- Shared enums and types cover disciplines, roles, workflow statuses, inspection results, detail payloads, comments, and submit request/response shapes.
- Shared demo data builders support the MVP demo path used across packages.

Representative files:

- `packages/shared/src/index.ts`
- `packages/shared/src/inspection-detail.ts`

Delivery read:

- The API and frontend are aligned around one shared contract set, which reduces drift for the MVP flow already implemented.

## API

**Status: `✅`**

What is in place:

- Hono app bootstraps health/meta endpoints and inspection routes.
- `GET /api/inspections/:id` returns a mapped inspection detail payload.
- `PUT /api/inspections/:id/rounds/current/result` validates JSON input, applies domain rules, and returns updated detail data.

Representative files:

- `packages/api/src/index.ts`
- `packages/api/src/routes/inspections.ts`
- `packages/api/src/services/inspection-service.ts`
- `packages/api/src/routes/dev.ts`

Delivery read:

- The API already supports the core inspection-detail, result-submission, and bulk manual import needed for an operational MVP.
- **New endpoints**: `POST /api/inspections/batch`, `GET/POST/PUT /api/projects`, `GET/POST/PUT /api/ships`, `GET/PUT /api/users`.

## Domain Rules

**Status: `✅`**

What is in place:

- Inspection item state transitions are explicitly encoded for `AA`, `QCC`, `OWC`, `RJ`, and `CX`.
- Submission rules prevent invalid `AA` submissions with new comments.
- Pending final acceptance and waiting-for-next-round semantics are modeled in code, not only in docs.

Representative files:

- `packages/api/src/domain/inspection-item-state.ts`
- `packages/api/src/domain/inspection-item-submission.ts`
- `packages/api/src/repositories/inspection-repository.ts`

Delivery read:

- This is one of the strongest parts of the repo today. The key inspection workflow semantics are implemented as domain logic rather than UI-only behavior.

## Persistence

**Status: `🟡`**

What is in place:

- Storage contracts and record shapes exist.
- Repository logic reads from and writes to a storage abstraction.
- Mock baseline data supports realistic API behavior and optimistic locking.
- Storage reads and writes are now async so the same repository path can work with D1 I/O.
- Runtime storage selection is centralized and keeps mock as the safe default path.

What is still missing:

- No production migration or seed lifecycle exists beyond schema bootstrap.
- No deployed D1 environment is verified end to end in this repo yet.

Representative files:

- `packages/api/src/persistence/inspection-storage.ts`
- `packages/api/src/persistence/records.ts`
- `packages/api/src/persistence/mock-inspection-db.ts`
- `packages/api/src/repositories/inspection-repository.ts`
- `packages/api/src/repositories/inspection-detail-mapper.ts`

Delivery read:

- Persistence architecture now has a real D1-compatible runtime path, but the shipped MVP still intentionally defaults to mock storage.

## D1 Foundation

**Status: `🟡`**

What is in place:

- D1/SQLite-compatible schema metadata is defined.
- SQL create-table statements can be generated from that schema metadata.
- A bootstrap helper exists to execute schema creation against a D1 database.
- Local dev script can auto-run bootstrap so first-run `pnpm dev:api:d1` is zero-manual-step.
- Prefer `pnpm dev:api:d1` for exercising D1 locally; `pnpm dev:api` stays on mock by default.
- A D1-backed inspection storage adapter can read and rewrite the current repository snapshot model (with dev seeding when empty).
- Route/runtime wiring can switch between mock and D1 via bindings while preserving the default mock flow.
- The `PUT /api/inspections/:id/rounds/current/result` D1 path now uses narrow table updates for `inspection_rounds`, `inspection_items`, and inserted `comments`, instead of forcing a full snapshot rewrite.
- The `PUT /api/inspections/:id/rounds/current/result` D1 path now also uses a narrow submission-context read (`inspection_items` by id, current `inspection_rounds` row, and an open-comment count) before applying domain rules, instead of loading the full repository snapshot first.
- The `PUT /api/inspections/:id/rounds/current/result` D1 path now prefers a dedicated post-submit detail read that joins `inspection_items`/`ships`/`projects` in one scoped query, then reads only that item's `inspection_rounds`, `comments`, and related `users`, instead of bouncing through the broader generic detail-refresh query sequence.
- The `GET /api/inspections` route now exists and returns the shared dashboard/list snapshot contract from repository-backed data instead of frontend-only mock data.
- The `GET /api/inspections/:id` D1 path now uses narrow, item-scoped `SELECT` queries (item/ship/project/rounds/comments + a batched `users` fetch), instead of reading the entire snapshot from every table.
- The `GET /api/inspections` D1 path now limits full-table reads to `inspection_items` only, then resolves related `ships`, `projects`, and current `inspection_rounds` with scoped `WHERE` queries instead of loading the full repository snapshot.
- The `GET /api/inspections` D1 path now batches `inspection_rounds` reads with a single `inspectionItemId IN (...)` query for the listed items, instead of issuing one current-round query per inspection item.
- Coverage asserts the narrow D1 write path, the narrow D1 submission-context read path, and the narrow D1 inspection-detail read path avoid the snapshot rewrite/delete-all flow and full-table reads, while keeping the mock driver behavior unchanged.
- Coverage now also asserts the D1 inspections list route avoids full-table snapshot reads for `users`, `projects`, `ships`, `inspection_rounds`, and `comments`.
Coverage now also asserts the D1 inspections list read uses a single joined summary query for `inspection_items`/`ships`/`projects` rather than separate lookups.
Coverage now also asserts the D1 inspections detail read uses a single joined summary query for `inspection_items`/`ships`/`projects` rather than separate lookups.
- The current narrow-read path now batches user fetches into a single `WHERE id IN (...)` query, removing the remaining per-user `SELECT` pattern from inspection detail reads.
- **Fixed D1 integration blockers**: Resolved `UNIQUE constraint` and `FOREIGN KEY constraint` failures during seeding by aligning project/ship identity logic and auto-seeding missing user references.
- **Comment Sequence IDs**: The D1 storage and repository now support `localId` (per-item sequence numbering) for comments, calculated during submission to ensure permanent user-facing IDs (e.g., Comment #1, #2).

What is still missing:

- No deployed D1-backed environment is exercised in integration tests.
- Only part of the persistence surface is narrowed so far (one high-value write path + two high-value read paths). The remaining operations still rely on the coarse snapshot bridge.

Representative files:

- `packages/api/src/persistence/d1-seeded-inspection-storage.ts`
- `packages/api/scripts/bootstrap-local-d1.mjs`
- `packages/api/src/db/schema.ts`
- `packages/api/src/db/sql.ts`
- `packages/api/src/db/bootstrap.ts`
- `packages/api/src/db/sql.test.mjs`
- `docs/m3-d1-smoke.md`

Delivery read:

- The repo has moved beyond pure D1 foundation work: there is now a live adapter and driver switch, but it is still an incremental bridge rather than the final persistence architecture.

## Frontend Workspace

**Status: `🟡`**

What is in place:

- React/Vite workspace is running with an inspection workbench UI.
- Inspection list, detail panel, round history, comment display, preview logic, and submission interactions are present.
- The web app can attempt to call the API and falls back to demo data when the API is unavailable.

What is still missing:

- The main homepage/workbench still depends on shared mock dashboard data.
- Broader planned workspace areas such as login, project management, reporting center, and admin views are not implemented in code.

Representative files:

- `packages/web/src/App.tsx`
- `packages/web/src/useInspectionDetail.ts`
- `packages/web/src/api.ts`
- `packages/web/src/main.tsx`
- `packages/web/src/styles.css`

Delivery read:

- The frontend is now a usable operational surface. Dashboard, Observation detail, and Manual Import are linked to DB-backed Hono routes.
- **Manual Import (`/import`)**: Optimized for 3-column Excel copy-paste with global date/discipline selection.

## Testing / Quality

**Status: `✅`**

What is in place:

- Workspace-level typecheck script is defined and used.
- Domain behavior is covered by focused tests.
- Route-level API behavior is covered, including optimistic locking and validation failures.
- SQL generation has a dedicated test.

Representative files:

- `packages/api/src/domain/inspection-item-state.test.mjs`
- `packages/api/src/domain/inspection-item-submission.test.mjs`
- `packages/api/src/routes/inspections.test.mjs`
- `packages/api/src/db/sql.test.mjs`
- `docs/m3-d1-smoke.md`
- `package.json`

Delivery read:

- Quality coverage is still lightweight, but it is meaningful for the implemented MVP path.

## Auth / RBAC

- **Bearer token revalidation:** Middleware revalidates JWT subject (`sub`) against the current user record and rejects inactive/deleted users.

**Status: `🟡`**

What is in place:

- `POST /api/auth/login` exists (mock + D1 paths), returning basic user identity on success.
- Password hashing utilities exist (PBKDF2-SHA256) and seeded/mock users now have real password hashes for dev credentials.
- Narrow D1 lookup exists for users by username (no full snapshot read required).
- Auth helper scaffolding exists for bearer token extraction, authenticated-user context injection, and role checks (`createRequireAuth`, `createRequireRole`), with focused route/middleware tests.
- `/api/inspections*` routes now require bearer-token authentication (returns 401 when missing).
- API-level validation for this increment passes via `pnpm --filter @nbins/api test`, `pnpm --filter @nbins/api typecheck`, and `pnpm --filter @nbins/api build`.

What is still missing:

- Refresh/session lifecycle and logout/invalidation behavior.
- Frontend login UI + session storage.

Representative files:

- `packages/api/src/routes/auth.ts`
- `packages/api/src/services/auth-service.ts`
- `packages/api/src/auth/password.ts`
- `packages/api/src/persistence/d1-inspection-storage.ts`
- `packages/api/src/repositories/user-repository.ts`

Delivery read:

- Auth now supports JWT issuance + verification and protects the inspection API routes, but session refresh/logout and frontend login are still pending.

## Import / PDF / n8n

**Status: `❌`**

What is in place:

- **Manual Import Interface**: A Production-grade interface for bulk inspection entry is implemented and connected to the backend.
- Planning documents describe the intended automated import and automation direction.
- The `n8n/` folder exists as a placeholder for future workflow assets.
- Source flags already distinguish `manual` versus `n8n` records in shared/API models.

What is still missing:

- No PDF generation service.
- No webhook handlers for n8n.
- No workflow exports or runnable automation assets.
- Automated email-to-task pipeline (n8n integration).

Representative files:

- `n8n/README.md`
- `docs/n8n-plan.md`
- `docs/architecture.md`
- `packages/shared/src/inspection-detail.ts`
- `packages/api/src/persistence/mock-inspection-db.ts`

Delivery read:

- These areas are still future work, with only model hints and planning material in the repository today.

## Recommended Current Project Readout

- `✅ Complete for MVP baseline`: shared contracts, core domain rules, multi-page routing, Dashboard UI, Project Hall, Login Portal.
- `🟡 Partial / in progress`: persistence architecture hardening, D1 rollout, per-item report triggers, cross-module data syncing.
- `❌ Not started in product code`: protected-route enforcement + RBAC wiring, complex import pipeline, server-side PDF rendering.

## Practical Next Priorities

1. Exercise the D1-backed route path in a real Worker/D1 environment and harden the snapshot-write bridge.
2. (Completed) Move the frontend workbench to API-first data loading and fix D1 blockers.
3. (Completed) Add comment numbering (localId) to the core data model.
4. Add comment close/resolve flow so the current inspection lifecycle can fully close in product code.
5. Introduce auth and project-scoped RBAC before expanding beyond the MVP demo path.
6. Build import and PDF generation only after the core data model is persisted end to end.


# Bootstrap schema (generated SQL)

We generate the bootstrap SQL from the canonical schema metadata in `packages/api/src/db/sql.ts` to avoid hand-maintaining DDL snippets in docs.

## 2026-04-04

- M14: fixed D1 seed snapshots to include CommentRecord.localId and adjusted D1 route tests to match trimmed seed size (5 items).
- M15: added a minimal backend auth increment with `/api/auth/login`, PBKDF2 password hashing, narrow D1 user lookup by username, and auth helper scaffolding (`createRequireAuth` / `createRequireRole`), validated at the API package level.
