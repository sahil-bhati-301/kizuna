# STATUS

Phase 0 · Week W01 (Pipeline I: parse and normalise the core sources) · Updated: W00 retro (session 5)
Light: 🟢 green at session 5 (week 20%, 5h 42%). Run /budget with /usage figures at the start and end of every session.

## Active WPs
| WP | Title | Tier/Size | State |
|---|---|---|---|
| (none) | W01 not planned yet: run /plan-week W01 | | |

## Merged last week (W00, all 7 WPs)
- W00-7 Budget guard and checkpoints, W00-3 Agent scaffolding (PR #2)
- W00-1 Monorepo, verify scripts (PR #3) · W00-2 CI (PR #4)
- W00-5 kernel (PR #5) · W00-4 Spec digests (PR #6) · W00-6 Local dev and DB harness (PR #7)

## Owner tasks open
- O-3: ADR-0001 hosting (Vercel, Fly.io or Render, Neon, Cloudflare R2; confirm Better Auth).
- O-4: approve root CLAUDE.md, agent definitions and spec digests.

## Blockers
- (none)

## OPEN-Q
- (none)

## Last decisions
- Plan: docs/development-plan.md is the source for workflow; docs/architecture-design.md wins design conflicts.
- Cloud sessions cannot push wp/ branches: each WP works on its session branch (W00-1, 2, 4, 5, 6).
- Capacity stays at the assumed 8 M-eq for W01; calibration happens at the W01 retro (§2.7). W01 WPs carry Est. % (7.5% per M-eq).
- W00-5 OQ-1: kernel gains a domain/ folder (backlog Should-fix; candidate W01 WP).
- W00-4 OQ-1: content and web digests keep their honest length (floor 1,000).
- Local DB: `pnpm db:up`, `pnpm db:migrate`, `pnpm db:down`. In a cloud session, start Docker with `dockerd &` before the harness test.

## Flaky tests
- None
