# NBINS Next-Step Board

> Updated: 2026-04-04 05:48 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M6 — Improve D1 persistence ergonomics (narrower writes)
**Goal:** Reduce snapshot rewrite footgun by narrowing *write* operations to real D1 tables/queries (keep read path stable).

**Definition of Done:**
- Replace at least one snapshot rewrite with narrow D1 writes
- Keep mock path unchanged
- Validation passes (`pnpm qa`)
- Changes committed + pushed


## Task Breakdown

- [x] Pick the smallest safe target write path (recommended: result submission PUT)
- [x] Design minimal D1 table writes needed for that path (no full repo snapshot rewrite)
- [x] Implement narrow write(s) in D1 storage adapter
- [x] Update/extend tests to cover D1 narrow write behavior
- [x] Keep `docs/status-board.md` in sync
- [ ] Commit + push


## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M3 — Prove D1 runtime path under Wrangler dev (local smoke + docs) (commits: `f09c8ff`, `fb0775e`, `5ec6bfa`, `a0bd69c`)
- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- Current D1 path is a snapshot bridge (read/write entire repository snapshot). That is acceptable for proving wiring; narrow queries can follow after we confirm runtime behavior.


## Next Milestone

### M7 — Replace snapshot model with real persistence (scoped)
**Goal:** After M6 proves at least one narrow write path, progressively migrate the rest of the snapshot model to real D1 queries (read + write), in a controlled, test-driven way.

**Candidate Tasks:**
- [ ] Identify the next 2–3 highest-value operations to migrate
- [ ] Add query helpers + tests
- [ ] Reduce snapshot footprint
- [ ] Keep docs/status-board consistent
