# NBINS Next-Step Board

> Updated: 2026-04-04 11:55 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M14 — Fix seed/localId + keep D1 route tests stable
**Goal:** Ensure all seeded CommentRecords include numeric `localId` so D1 mapping stays strict, and make D1 seeding behavior not explode the narrow-query tests.

**Definition of Done:**
- Baseline mock snapshot comments include `localId`
- Seed snapshot generator assigns `localId` per inspection item
- `pnpm --filter @nbins/api test` passes
- Changes committed + pushed

## Task Breakdown

- [x] Add `localId` to baseline mock snapshot comments
- [x] Assign `localId` during seed snapshot generation
- [x] Keep D1 narrow-query tests stable (limit seed expansion + adjust expected list size)
- [x] Run validation (`pnpm --filter @nbins/api test`)
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M13 — Deduplicate joined summary SQL constants (commit: `fc219b6`)
- [x] M12 — Collapse remaining D1 detail/list summary reads (detail + list joined summary reads) (commits: `63f44ee`, `813310c`, `a74c0de`)
- [x] M11 — Narrow post-submit detail refresh path (commit: `bf317bc`)
- [x] M10 — Batch list round reads for inspections route (commit: `83e89af`)
- [x] M9 — Add inspections list route + narrow D1 reads (commit: `966da65`)
- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)

## Notes

- Note: `pnpm qa` is now unblocked after adding missing `ENGINE`/`CTNMT` disciplines to shared types.
