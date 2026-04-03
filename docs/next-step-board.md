# NBINS Next-Step Board

> Updated: 2026-04-04 05:29 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M5 — Harden D1 local dev UX + remove footguns
**Goal:** Make D1 mode start with zero manual steps (or fail with clear message), and keep docs + scripts consistent.

**Definition of Done:**
- `pnpm dev:api:d1` works on first run (auto bootstrap)
- Docs + scripts are consistent
- Validation passes (`pnpm qa`)
- Changes committed + pushed


## Task Breakdown

- [x] Make `pnpm dev:api:d1` auto-run `pnpm d1:bootstrap` before starting Wrangler
- [x] Add a README note about mock vs D1 drivers
- [x] Keep `docs/status-board.md` in sync
- [x] Commit + push


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

### M6 — Improve D1 persistence ergonomics (narrower writes)
**Goal:** Reduce snapshot footgun by narrowing persistence operations once D1 wiring is stable.

**Candidate Tasks:**
- [ ] Identify top 2–3 repository operations to de-snapshot
- [ ] Add D1 queries for those operations
- [ ] Keep tests green
