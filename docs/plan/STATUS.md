# STATUS

Phase 0 · Week W00 (Setup and calibration) · Updated: session 2
Light: ⚪ unknown until the budget guard runs (W00-7). Use /budget if needed.

## Active WPs
| WP | Title | Tier/Size | State |
|---|---|---|---|
| W00-1 | Monorepo, verify scripts | B/M | 🔄 in review (session 2) |
| W00-2 | CI and branch protection | B/S | ⬜ todo |
| W00-4 | Spec digests | C/M | ⬜ todo |
| W00-5 | kernel package | A/S | ⬜ todo |
| W00-6 | Local dev and DB harness | B/S | ⬜ todo |

## Merged this week
- W00-3 Agent scaffolding, W00-7 Budget guard and checkpoints (PR #2)

## Blockers
- (none)

## OPEN-Q
- (none)

## Last decisions
- Plan: docs/development-plan.md is the source for workflow; docs/architecture-design.md wins design conflicts.
- Until W00-1 lands, the only test command is `node --test "scripts/claude/*.test.mjs"`.
- W00-1 worked on the session branch claude/gallant-davinci-z3yvft instead of wp/W00-1-monorepo (cloud session branch restriction).

## Flaky tests
- None
