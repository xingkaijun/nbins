# NBINS Next-Step Board

> Updated: 2026-04-04 06:31 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M7 — Replace snapshot model with real persistence (scoped)
**Goal:** After M6 proved at least one narrow write path, progressively migrate the remaining snapshot bridge to real D1 queries (read + write), in a controlled, test-driven way.

**Definition of Done (for M7 initial slice):**
- Add at least one **narrow D1 read** path for a high-value endpoint (recommended: `GET /api/inspections/:id`)
- Keep mock path unchanged
- Validation passes (`pnpm qa`)
- Changes committed + pushed

## Task Breakdown (M7 initial slice)

- [ ] Pick the smallest safe narrow-read target (recommended: `GET /api/inspections/:id`)
- [ ] Define a minimal storage/repository interface to support narrow reads (keep the existing `read()` snapshot path intact)
- [ ] Implement narrow read(s) in the D1 storage adapter (seeded wrapper included)
- [ ] Add/extend tests to prove the narrow-read path is used for D1 and does not regress mock
- [ ] Keep `docs/status-board.md` in sync
- [ ] Commit + push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)
- [x] M3 — Prove D1 runtime path under Wrangler dev (local smoke + docs) (commits: `f09c8ff`, `fb0775e`, `5ec6bfa`, `a0bd69c`)
- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- Current D1 path is still a snapshot bridge for most reads/writes. Narrow queries should replace that incrementally, starting with the highest-value endpoints.
