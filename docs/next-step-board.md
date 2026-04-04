# NBINS Next-Step Board

> Updated: 2026-04-04 17:16 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

(none — M16 completed; choose next milestone)

- [x] Decide token transport (Bearer `Authorization` header for now) + secret handling (`JWT_SECRET` env var required in production, safe dev/test fallback in harness)
- [x] Implement JWT creation on login (include user id + role + disciplines)
- [x] Add auth middleware + typed context user
- [x] Protect inspections routes behind auth middleware (add 401 tests + pass Authorization: Bearer <token> for existing route tests) (commit: `7b473ff`)
- [x] Update route tests for login token issuance and auth middleware verification
- [x] Validation + commit + push (JWT issuance + middleware scaffolding)

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M16 — Add JWT session + protect inspection routes (commits: `7812e5d`, `7b473ff`, `46aecbb`)

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
