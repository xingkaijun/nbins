# NBINS Status Board

> Updated: 2026-04-04 02:57 Asia/Shanghai
> Overall status: **MVP baseline implemented, with core inspection flow working and D1 runtime integration advanced to an adapter plus driver-switch stage**

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
| API | ✅ | Hono API exposes inspection detail read and current-round result submission |
| Domain rules | ✅ | Core inspection result semantics are encoded and covered by tests |
| Persistence | 🟡 | Repository/storage now support async mock or D1-backed snapshots, but mock remains the default runtime path |
| D1 foundation | 🟡 | D1 schema metadata, SQL generation, bootstrap helper, seeded runtime storage, and Wrangler-local smoke steps exist, but D1 is not yet the default shipped path |
| Frontend workspace | 🟡 | React/Vite workbench is functional, but parts of the experience still fall back to shared mock data |
| Testing / quality | ✅ | Typecheck plus domain, SQL, and route tests are present |
| Auth / RBAC | ❌ | Roles are defined in shared types, but no login, JWT, or authorization enforcement exists in code |
| Import / PDF / n8n | ❌ | Only planning/docs placeholders exist; no production workflow code yet |

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

- The API already supports the core inspection-detail and result-submission use case needed for an MVP walkthrough.

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
- A D1-backed inspection storage adapter can read and rewrite the current repository snapshot model (with dev seeding when empty).
- Route/runtime wiring can switch between mock and D1 via bindings while preserving the default mock flow.

What is still missing:

- No deployed D1-backed environment is exercised in integration tests.
- The runtime write strategy is still a coarse snapshot rewrite, not a narrower repository/query layer.

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

- The frontend is a usable MVP demo surface for one inspection workflow, not yet a full operational workspace.

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

**Status: `❌`**

What is in place:

- Shared role constants exist.
- Mock user records include role and discipline fields.

What is still missing:

- No login endpoint.
- No password verification flow.
- No JWT/session implementation.
- No route guards or project-scope RBAC enforcement.

Representative files:

- `packages/shared/src/index.ts`
- `packages/api/src/persistence/mock-inspection-db.ts`
- `docs/architecture.md`
- `docs/frontend-plan.md`

Delivery read:

- Auth and authorization are defined in the design direction, but not implemented in product code.

## Import / PDF / n8n

**Status: `❌`**

What is in place:

- Planning documents describe the intended import and automation direction.
- The `n8n/` folder exists as a placeholder for future workflow assets.
- Source flags already distinguish `manual` versus `n8n` records in shared/API models.

What is still missing:

- No import endpoints or import parser.
- No PDF generation service.
- No webhook handlers for n8n.
- No workflow exports or runnable automation assets.

Representative files:

- `n8n/README.md`
- `docs/n8n-plan.md`
- `docs/architecture.md`
- `packages/shared/src/inspection-detail.ts`
- `packages/api/src/persistence/mock-inspection-db.ts`

Delivery read:

- These areas are still future work, with only model hints and planning material in the repository today.

## Recommended Current Project Readout

- `✅ Complete for MVP baseline`: shared contracts, core domain rules, detail/read API, result submission API, mock-backed repository flow, basic tests
- `🟡 Partial / in progress`: persistence architecture hardening, D1 rollout, frontend integration depth, production-grade data flow
- `❌ Not started in product code`: auth, RBAC, import pipeline, PDF reports, n8n automation

## Practical Next Priorities

1. Exercise the D1-backed route path in a real Worker/D1 environment and harden the snapshot-write bridge.
2. Move the frontend workbench from mixed demo/API mode to API-first data loading.
3. Add comment close/resolve flow so the current inspection lifecycle can fully close in product code.
4. Introduce auth and project-scoped RBAC before expanding beyond the MVP demo path.
5. Build import and PDF generation only after the core data model is persisted end to end.


# Bootstrap schema (generated SQL)

We generate the bootstrap SQL from the canonical schema metadata in `packages/api/src/db/sql.ts` to avoid hand-maintaining DDL snippets in docs.
