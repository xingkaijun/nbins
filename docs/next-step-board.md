# NBINS Next-Step Board

> Updated: 2026-04-04 06:31 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M7.2 — Reduce D1 narrow-read query count (batch user fetch)
**Goal:** Keep narrow D1 reads, but reduce query count by batching user lookups (avoid N+1 `SELECT users` calls).

**Definition of Done:**
- `readInspectionDetail()` fetches all needed users via a single D1 query (e.g. `WHERE id IN (...)`)
- Tests assert executed SQL no longer includes multiple `SELECT * FROM "users" WHERE "id" = ?` calls
- Validation passes (`pnpm qa`)
- Changes committed + pushed

## Task Breakdown

- [x] Implement batch user fetch in `D1InspectionStorage.readInspectionDetail()`
- [x] Update/extend SQL-recording tests to enforce single users query
- [ ] Keep `docs/status-board.md` in sync (if status meaningfully changes)
- [x] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `e6e8b69`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)
- [x] M3 — Prove D1 runtime path under Wrangler dev (local smoke + docs) (commits: `f09c8ff`, `fb0775e`, `5ec6bfa`, `a0bd69c`)
- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- Current `readInspectionDetail()` does item/ship/project/rounds/comments scoped queries, but fetches users individually.
- M7.2 is intended as a purely-internal performance/ergonomics improvement with no contract changes.
