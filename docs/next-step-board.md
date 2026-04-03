# NBINS Next-Step Board

> Updated: 2026-04-04 07:31 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M9 — Narrow D1 list endpoint reads (inspections index)
**Goal:** Reduce the remaining D1 dependency on snapshot reads by narrowing reads for the inspections list endpoint (the next likely high-traffic surface after detail + submit).

**Definition of Done:**
- Add a narrow D1 read path for the inspections list endpoint (likely `GET /api/inspections`)
- D1 implementation uses scoped `SELECT` queries with `WHERE`/`LIMIT` as appropriate (no full-table snapshot reads)
- Tests assert the D1 list route avoids full-table `SELECT * FROM ...` reads
- Validation passes (`pnpm qa`)
- Changes committed + pushed
- `docs/status-board.md` is updated if the capability meaningfully changes

## Task Breakdown

- [ ] Confirm the actual list endpoint path + response contract (`GET /api/inspections` or similar)
- [ ] Add optional storage method for list read (e.g. `readInspectionList?()`)
- [ ] Implement narrow D1 list read in `D1InspectionStorage` (+ seeded wrapper)
- [ ] Update repository/route to use narrow list read when available; fallback to snapshot otherwise
- [ ] Add/extend SQL-recording tests for the D1 list route
- [ ] Run validation (`pnpm qa`)
- [ ] Commit + push
- [ ] Update `docs/status-board.md`

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M8 — Narrow D1 submission-context reads for current-round result submission (commit: `94aca7a`)
- [x] M7.2 — Batch user fetch for inspection detail reads (commit: `09ab34a`)
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)
- [x] M3 — Prove D1 runtime path under Wrangler dev (local smoke + docs) (commits: `f09c8ff`, `fb0775e`, `5ec6bfa`, `a0bd69c`)
- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- D1 now has narrow reads for inspection detail (`GET /api/inspections/:id`) and pre-submit context for result submission (`PUT /api/inspections/:id/rounds/current/result`).
- The next best ROI is narrowing the list/index endpoint, which is typically hit more often than detail.
