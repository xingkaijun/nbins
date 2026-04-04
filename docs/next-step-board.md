# NBINS Next-Step Board

> Updated: 2026-04-04 15:35 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M15 — Add minimal auth login route + password hashing (no JWT yet)
**Goal:** Implement a safe, test-covered `/api/auth/login` endpoint that authenticates seeded/mock users using PBKDF2 password hashes, and keeps D1 reads narrow.

**Definition of Done:**
- `POST /api/auth/login` exists and returns `{ ok: true, data: { user } }` on success
- Invalid credentials return `401` with a generic error
- Mock baseline users have real password hashes (no `dev-only`)
- Seeded snapshot can authenticate at least one known user (`sys-user`)
- D1 storage supports narrow user lookup by username
- `pnpm --filter @nbins/api test` passes
- `pnpm typecheck` passes
- Changes committed + pushed

## Task Breakdown

- [x] Add password hashing utilities (`createPasswordHash`, `verifyPasswordHash`)
- [x] Seed/mock users with PBKDF2 hashes for known dev passwords
- [x] Add `POST /api/auth/login` route + service + user repository
- [x] Add narrow D1 user lookup by username (storage interface + adapters)
- [x] Add tests (password hash, login route, narrow D1 lookup)
- [x] Update web demo to keep `localId` invariant in locally-simulated comments
- [x] Run validation (`pnpm --filter @nbins/api test`, `pnpm typecheck`)
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M14 — Fix seed/localId + keep D1 route tests stable (commit: `947464d`)
- [x] M13 — Deduplicate joined summary SQL constants (commit: `fc219b6`)
- [x] M12 — Collapse remaining D1 detail/list summary reads (detail + list joined summary reads) (commits: `63f44ee`, `813310c`, `a74c0de`)
- [x] M11 — Narrow post-submit detail refresh path (commit: `bf317bc`)
- [x] M10 — Batch list round reads for inspections route (commit: `83e89af`)
- [x] M9 — Add inspections list route + narrow D1 reads (commit: `966da65`)
- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)
