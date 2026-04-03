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

- [x] Pick the smallest safe narrow-read target (recommended: `GET /api/inspections/:id`)
- [x] Define a minimal storage/repository interface to support narrow reads (keep the existing `read()` snapshot path intact)
- [x] Implement narrow read(s) in the D1 storage adapter (seeded wrapper included)
- [x] Add/extend tests to prove the narrow-read path is used for D1 and does not regress mock
- [ ] Keep `docs/status-board.md` in sync
- [x] Commit + push
