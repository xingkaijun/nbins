# NBINS Next-Step Board

> Updated: 2026-04-04 01:29 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M2 — Exercise D1 Path in Wrangler Dev + Document Setup
**Goal:** Prove the D1 runtime path actually works end-to-end under Wrangler dev with a real D1 binding, and document the exact steps.

**Definition of Done:**
- `wrangler dev` can run the API with a D1 database binding
- Schema bootstrap can be executed against that binding
- With `D1_DRIVER=d1`, API routes work (GET detail; PUT submit result persists)
- With default settings (no driver/binding), mock path still works
- Add minimal docs for local D1 dev setup (where to add binding + how to run)
- `pnpm typecheck`, `pnpm build`, `pnpm --filter @nbins/api test` still pass
- Changes committed + pushed
- `docs/status-board.md` updated if needed

## Task Breakdown

- [x] T1. Add D1 binding and driver env docs for local dev (wrangler config + commands)
- [x] T2. Add minimal script/command for schema bootstrap against bound D1 (local)
- [ ] T3. Add a focused integration-ish test or a dev check note for D1 path (no network)
- [x] T4. Validate mock default remains stable
- [x] T5. Run full validation (`typecheck`, `build`, `api test`)
- [ ] T6. Commit and push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- Current D1 path is a snapshot bridge (read/write entire repository snapshot). That is acceptable for proving wiring; narrow queries can follow after we confirm runtime behavior.
- T1 delivered in [`packages/api/wrangler.jsonc`](/workspace/nbins/packages/api/wrangler.jsonc) and [`packages/api/README.md`](/workspace/nbins/packages/api/README.md): local D1 binding `DB`, `wrangler d1 create` flow, local/remote `wrangler d1 execute --file=...`, and `D1_DRIVER=d1 pnpm dev:api` guidance. Mock remains the default when the driver or binding is absent.
