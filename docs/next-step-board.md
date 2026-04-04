# NBINS Next-Step Board

> Updated: 2026-04-04 07:53 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M11 — Narrow post-submit detail refresh on the D1 path
**Goal:** After `submitCurrentRoundResult()` completes on D1, avoid immediately falling back to the broader inspection-detail read path if a narrower post-submit refresh can return the same contract safely.

**Definition of Done:**
- The D1 submit flow refreshes only the detail records it truly needs after a write
- Mock remains the default runtime path and unchanged in behavior
- Tests prove the D1 submit path avoids unnecessary broader reads after mutation
- Validation passes (`pnpm qa`)
- Changes committed + pushed

## Task Breakdown

- [ ] Identify the minimum post-submit read surface needed for the response contract
- [ ] Land the next smallest safe D1 refresh-path increment
- [ ] Update tests to assert the narrower D1 post-submit refresh behavior
- [ ] Run validation (`pnpm typecheck && pnpm build && pnpm --filter @nbins/api test`)
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M10 — Batch list round reads for inspections route (commit: `83e89af`)
- [x] M9 — Add inspections list route + narrow D1 reads (commit: `966da65`)
- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)

## Notes

- This increment switches list-round loading to one item-scoped `inspection_rounds WHERE inspectionItemId IN (...)` query and filters to the current round in memory.
- Remaining work for M10 is validation and, outside this lane, the usual commit/push step if the increment is accepted.
