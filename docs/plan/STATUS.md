# STATUS

Phase 0 · Week W00 (Setup and calibration) · Updated: session 4
Light: ⚪ unknown (owner band at session 4: weekly <25%). Use /budget if needed.

## Active WPs
| WP | Title | Tier/Size | State |
|---|---|---|---|
| W00-4 | Spec digests | C/M | ⬜ todo |
| W00-6 | Local dev and DB harness | B/S | ⬜ todo |

## Merged this week
- W00-3 Agent scaffolding, W00-7 Budget guard and checkpoints (PR #2); W00-1 Monorepo, verify scripts (PR #3); W00-2 CI (PR #4; O-2 branch protection done by the owner); W00-5 kernel (PR #5; OQ-1 still with the owner)

## Blockers
- (none)

## OPEN-Q
- (none)

## Last decisions
- Plan: docs/development-plan.md is the source for workflow; docs/architecture-design.md wins design conflicts.
- Until W00-1 lands, the only test command is `node --test "scripts/claude/*.test.mjs"`.
- W00-1 worked on the session branch claude/gallant-davinci-z3yvft instead of wp/W00-1-monorepo (cloud session branch restriction). W00-2 likewise, in the same session at the owner's request. W00-5 likewise (session 3).

- W00-5 OQ-1 closed by owner: kernel gains a domain/ folder (follow-up in backlog Should-fix).

## Flaky tests
- None
