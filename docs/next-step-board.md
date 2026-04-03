# NBINS Next-Step Board

> Updated: 2026-04-04 00:00 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M1 — D1 Adapter + Driver Switch
**Goal:** Move NBINS from “D1 foundation exists” to “runtime can switch between mock and D1-backed storage without breaking current MVP flow”.

**Definition of Done:**
- D1-backed storage/adapter exists for current repository needs
- Runtime wiring supports mock default + optional D1 path
- Existing MVP routes keep working
- `pnpm typecheck` passes
- `pnpm build` passes
- `pnpm --filter @nbins/api test` passes
- Changes are committed and pushed
- `docs/status-board.md` updated to reflect the new status

## Task Breakdown

- [x] T1. Review current D1 foundation files and define minimal runtime adapter shape
- [x] T2. Implement D1-backed storage adapter for repository-compatible read/write path
- [x] T3. Add driver/factory wiring so routes/app can choose mock vs D1 safely
- [x] T4. Verify mock remains default and MVP demo path is not broken
- [x] T5. Run full validation (`typecheck`, `build`, `api test`)
- [ ] T6. Commit and push
- [x] T7. Update `docs/status-board.md`

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until M1 is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Current Increment Notes

- Storage contract is now async so the repository/service path can support D1 I/O without a separate codepath.
- `D1InspectionStorage` implements snapshot read/write against the current D1 schema tables.
- Runtime storage resolution keeps mock as the default and only uses D1 when `D1_DRIVER=d1` and `DB` are both available.
- Route tests verify the default mock path still preserves writes across sequential requests.

## Next Smallest Safe Increment After This

- Exercise the D1-backed route path against a real Worker binding and schema bootstrap flow.
- Replace coarse snapshot rewrite behavior with narrower D1 repository operations once the adapter path is proven.
