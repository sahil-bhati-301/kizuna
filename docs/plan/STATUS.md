# STATUS

Phase 0 · Week W01 (Pipeline I: parse and normalise the core sources) · Updated: session 8 (W01-2)
Light: 🟢 green at session 8 (week 22%, 5h 67%). Run /budget with /usage figures at the start and end of every session.

## Active WPs
| WP | Title | Tier/Size | State |
|---|---|---|---|
| W01-1 | Pipeline app, sources lock, fetcher | B/S | ✅ merged (PR #9) |
| W01-6 | kernel: pure code under src/domain/ | B/S | ✅ merged (PR #10) |
| W01-2 | content Drizzle schema and types | B/M | 🔄 in review (PR #12, session 8) |
| W01-7 | CI hygiene: Node 24 actions, .nvmrc | C/S | ⬜ todo |
| W01-4 | Normalisation library | A/M | ✅ merged (PR #11) |
| W01-3 | KANJIDIC2 parser and Jōyō import | A/M | ⬜ todo |
| W01-5 | KRADFILE parser | B/S | ⬜ todo |

## Merged last week (W00, all 7 WPs)
- W00-7 Budget guard and checkpoints, W00-3 Agent scaffolding (PR #2)
- W00-1 Monorepo, verify scripts (PR #3) · W00-2 CI (PR #4)
- W00-5 kernel (PR #5) · W00-4 Spec digests (PR #6) · W00-6 Local dev and DB harness (PR #7)

## Owner tasks
- O-3: done, ADR-0001 accepted (Fly.io, Vercel, Neon, R2, Better Auth).
- O-4: done, approved by the owner (session 5).
- O-5 (W01): done. The "kizuna" cloud environment allows www.edrdg.org.
- O-6 (W01): re-verify the KANJIDIC2 and KRADFILE licences at source.

## Blockers
- (none)

## OPEN-Q
- (none)

## Last decisions
- W01-2: content migrations live in packages/persistence/drizzle/ and the content integration test in packages/persistence/test/ (harness not exported). Keywords are a separate `item_keyword` table; owner may revert to a column at PR review.
- W01-4 OPEN-Q 1-3 resolved by the owner: standard radical-variant set, ヴ/ヵ/ヶ by offset, KANJIDIC hyphen convention (trailing `-` = prefix). 月 as 肉 is keyed ⺼; KRADFILE mapping is for W01-3/W01-5.
- W01-6: end-to-end depcruise fixture test deferred to backlog (frozen boundaries.test.ts; AC 5).
- W01 plan approved. Sources are committed to the repo under content/sources/ (W01-1 Q1); the Jōyō table is a checked-in TSV (W01-3 Q1).
- Plan: docs/development-plan.md is the source for workflow; docs/architecture-design.md wins design conflicts.
- Cloud sessions cannot push wp/ branches: each WP works on its session branch (W00-1, 2, 4, 5, 6).
- Capacity stays at the assumed 8 M-eq for W01; calibration happens at the W01 retro (§2.7). W01 WPs carry Est. % (7.5% per M-eq).
- W00-5 OQ-1: kernel gains a domain/ folder (backlog Should-fix; candidate W01 WP).
- W00-4 OQ-1: content and web digests keep their honest length (floor 1,000).
- Local DB: `pnpm db:up`, `pnpm db:migrate`, `pnpm db:down`. In a cloud session, start Docker with `dockerd &` before the harness test.

## Flaky tests
- None
