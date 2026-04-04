# NBINS Next-Step Board

> Updated: 2026-04-04 16:10 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M16 — Add JWT session + protect inspection routes
**Goal:** Turn the minimal login endpoint into a real session mechanism (JWT) and require auth for `/api/inspections*` (and any other sensitive endpoints).

**Definition of Done:**
- `POST /api/auth/login` returns a signed JWT (and/or sets cookie) on success
- Auth middleware verifies JWT and sets `ctx.var.user` (or equivalent)
- `/api/inspections` and `/api/inspections/:id` require authentication (401 when missing/invalid)
- Route tests updated/added for both authorized and unauthorized cases
- Keep D1 reads narrow (no `SELECT * FROM "users"` etc.)
- `pnpm --filter @nbins/api test` passes
- `pnpm typecheck` passes
- Changes committed + pushed

## Task Breakdown

- [ ] Decide token transport (Bearer header vs cookie) + secret handling
- [ ] Implement JWT creation on login (include user id + role + disciplines)
- [ ] Add auth middleware + typed context user
- [ ] Protect inspections routes behind auth middleware
- [ ] Update route tests (unauthenticated 401 + authenticated happy paths)
- [ ] Validation + commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M15 — Add minimal auth login route + password hashing (no JWT yet) (commits: `3f101b9`, `73787a2`, `eb8344d`)
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
