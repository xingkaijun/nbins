# NBINS Next-Step Board

> Updated: 2026-04-04 07:25 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M8 — Broaden D1 route/runtime coverage beyond current narrow slices
**Goal:** Continue moving the D1 runtime path from a snapshot bridge toward more targeted reads/writes, while keeping mock as the safe default path.

**Definition of Done:**
- One additional meaningful D1 runtime hotspot is narrowed or simplified
- Existing MVP routes remain stable with mock as default
- Validation passes (`pnpm qa`)
- Changes committed + pushed
- `docs/status-board.md` stays aligned with the newly landed capability

## Task Breakdown

- [x] Identify the next highest-value remaining D1 hotspot after M7.2
- [x] Land the next smallest safe D1 runtime increment
- [x] Verify mock remains default and behavior is unchanged for the MVP flow
- [x] Run full validation (`pnpm typecheck && pnpm build && pnpm --filter @nbins/api test`)
- [ ] Commit + push
- [x] Update `docs/status-board.md` and this execution board

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M8 — Narrow D1 submission-context reads for current-round result submission
- [x] M7.2 — Batch user fetch for inspection detail reads
- [x] M7.1 — Narrow D1 reads for inspection detail GET (commit: `b3e8f80`)
- [x] M6 — Improve D1 persistence ergonomics (narrower writes) (commit: `87ae4e8`)
- [x] M3 — Prove D1 runtime path under Wrangler dev (local smoke + docs) (commits: `f09c8ff`, `fb0775e`, `5ec6bfa`, `a0bd69c`)
- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- `readInspectionDetail()` is already item-scoped and now batches related user fetches into a single query.
- This M8 increment is a purely-internal D1 runtime coverage improvement with no contract changes.
- The M8 hotspot chosen here is the D1 pre-submit read for `PUT /api/inspections/:id/rounds/current/result`, which previously still fell back to a full snapshot read before applying domain rules.
- This increment adds `readSubmissionContext()` so the D1 path can load only the target item, its current round row, and the open-comment count before reusing the existing narrow write path.
- Mock remains the default runtime driver, and the mock repository path still falls back to full-snapshot behavior.
