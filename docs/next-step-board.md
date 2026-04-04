# NBINS Next-Step Board

> Updated: 2026-04-04 20:07 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

(none — M20 completed; choose next milestone)

(next: choose post-M20 follow-up milestone)

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M19 — Add project-scoped authorization skeleton (project_members + membership lookup service)
- [x] M20 — Apply allowed-project filtering to inspection list/detail read endpoints (commit: `347909e`)
- [x] M18 — Harden bearer auth by revalidating JWT subject against current user state (commit: `7dd2d80`)

- [x] M17 — Add /api/auth/me + narrow storage lookup for me endpoint (commits: `98725db`, `d49bb69`)
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
