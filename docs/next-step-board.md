# NBINS Next-Step Board

> Updated: 2026-04-04 11:02 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M12 — Collapse remaining D1 detail/list summary reads
**Goal:** Continue shrinking the D1 read path by replacing remaining multi-step item/ship/project lookups with tighter joined summary reads, while keeping mock as the default runtime driver.

**Definition of Done:**
- One or more remaining D1 detail/list summary paths use a joined summary query instead of separate item/ship/project lookups
- Mock remains the default runtime path and unchanged in behavior
- Tests prove the narrowed D1 read behavior without touching frontend files
- Validation passes (`pnpm qa`)
- Changes committed + pushed

## Task Breakdown

- [ ] Implement a joined summary read for `readInspectionDetail()`
- [ ] Implement the next safe joined/narrow summary improvement for `readInspectionList()`
- [ ] Update D1 SQL-recording tests to lock in the reduced query shape
- [ ] Run validation (`pnpm typecheck && pnpm build && pnpm --filter @nbins/api test`)
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M11 — Narrow post-submit detail refresh path (commit: `bf317bc`)
- [x] M10 — Batch list round reads for inspections route (commit: `83e89af`)
- [x] M9 — Add inspections list route + narrow D1 reads (commit: `966da65`)
- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)

## Notes

- Note: `pnpm qa` is now unblocked after adding missing `ENGINE`/`CTNMT` disciplines to shared types.

- M11 is complete and pushed; the next read-path work should stay in API/persistence only and avoid `packages/web/**` entirely.
- This M12 slice is intentionally backend-only because the frontend is currently under manual editing.
