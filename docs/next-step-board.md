# NBINS Next-Step Board

> Updated: 2026-04-04 03:00 Asia/Shanghai
> Execution mode: single active milestone, small validated increments, commit+push on each finished sub-goal

## Active Milestone

### M4 — Make D1 demo usable: seed + docs + one-liner bootstrap
**Goal:** Make it trivial to run D1 mode locally with seeded demo data and a single bootstrap command, without 500s.

**Definition of Done:**
- Root scripts make local D1 bootstrap + dev repeatable
- Docs include one copy/paste flow
- Validation passes (`typecheck`, `build`, `api test`)
- Changes committed + pushed

## Task Breakdown

- [x] Ensure D1 dev starts with schema present (via `pnpm d1:bootstrap` and documented smoke)
- [x] Add `pnpm d1:gen` root script to regenerate `packages/api/src/db/d1-bootstrap.sql`
- [x] Add `pnpm d1:bootstrap` root script to wrap the above
- [x] Add `pnpm dev:api:d1` script that sets `D1_DRIVER=d1` and runs wrangler local dev
- [ ] Add one integration test to confirm seeded snapshot inserted on first D1 read
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
