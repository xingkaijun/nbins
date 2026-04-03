# NBINS Next-Step Board

> Updated: 2026-04-04 07:56 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M10 — Reduce remaining full-table D1 reads (inspection list rounds)
**Goal:** Improve the D1 inspections list read so it no longer requires N item-scoped queries for `inspection_rounds` and avoids any full-table reads where practical.

**Definition of Done:**
- `readInspectionList()` no longer issues N queries for current rounds (use a single query or batched IN)
- Tests assert fewer D1 queries for the list endpoint (and still no full-table reads for `users/projects/ships/comments`)
- Validation passes (`pnpm qa`)
- Changes committed + pushed
- Update `docs/status-board.md` if capability meaningfully changes

## Task Breakdown

- [x] Change `D1InspectionStorage.readInspectionList()` to fetch current rounds in a single query (or small bounded set)
- [x] Update SQL-recording test for `GET /api/inspections` to assert reduced query count
- [ ] Run validation (`pnpm typecheck && pnpm build && pnpm --filter @nbins/api test`)
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M9 — Add inspections list route + narrow D1 reads (commit: `966da65`)
- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)

## Notes

- This increment switches list-round loading to one item-scoped `inspection_rounds WHERE inspectionItemId IN (...)` query and filters to the current round in memory.
- Remaining work for M10 is validation and, outside this lane, the usual commit/push step if the increment is accepted.
