# NBINS Next-Step Board

> Updated: 2026-04-04 02:56 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M3 — Prove D1 runtime path under Wrangler dev (actual run + persistence) ✅
**Goal:** Actually run `wrangler dev` with a real D1 binding, bootstrap schema, and demonstrate that writes persist (no mock fallback).

**Definition of Done:**
- You can run `pnpm dev:api` with `D1_DRIVER=d1`
- Schema bootstrap against the bound D1 works (`wrangler d1 execute ... --file=...`)
- A PUT submission persists (GET detail shows updated state after a restart)
- Default/mock path still works when `D1_DRIVER` or the binding is missing
- Steps are documented (commands + what to expect)
- Changes committed + pushed

## Task Breakdown

- [x] T1. Run local D1 end-to-end under Wrangler dev (with DB binding)
- [x] T2. Bootstrap schema into local D1 using generated SQL (document exact command)
- [x] T3. Exercise GET + PUT routes on D1 and confirm persistence after restart
- [x] T4. Document a single copy-paste "smoke script" section (commands + expected outputs)
  - See: `docs/m3-d1-smoke.md`
- [x] T5. Run full validation (`typecheck`, `build`, `api test`)
- [x] T6. Commit and push

## Rules

1. Only one active milestone at a time
2. No new parallel big goals until the active milestone is closed or explicitly re-scoped
3. Every finished sub-goal must leave the repo in a validated state
4. Commit + push after each meaningful completed increment
5. After a successful push, if the active milestone still has unchecked tasks, immediately dispatch the next Codex task for the next smallest safe increment

## Recent Completed Milestones

- [x] M2 — D1 dev docs + bootstrap SQL generator (commits: `1af7280`, `c2af8d9`, `1340d1f`)
- [x] M1 — D1 adapter + driver switch (commits: `58a0d94`, `3eaca21`)
- [x] D1 schema bootstrap foundation (`2bb1116`)
- [x] Fine-grained status board + README status surface (`7810669`)

## Notes

- Current D1 path is a snapshot bridge (read/write entire repository snapshot). That is acceptable for proving wiring; narrow queries can follow after we confirm runtime behavior.

## Next Milestone

### M4 — Make D1 demo usable: seed + docs + one-liner bootstrap
**Goal:** Make it trivial to run D1 mode locally with seeded demo data and a single bootstrap command, without 500s.

**Candidate Tasks:**
- [ ] Ensure D1 dev starts with schema present (document: run `pnpm --filter @nbins/api run gen:bootstrap-sql -- src/db/d1-bootstrap.sql` then `pnpm --filter @nbins/api exec node packages/api/scripts/bootstrap-local-d1.mjs`)
- [ ] Add `pnpm d1:bootstrap` root script to wrap the above
- [ ] Add `pnpm dev:api:d1` script that sets `D1_DRIVER=d1` + warns if schema missing
- [ ] Add one integration test to confirm seeded snapshot inserted on first D1 read
- [ ] Commit + push
