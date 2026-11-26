---
description: Run or resume one work package end to end. Usage: /wp <WP-id>
argument-hint: <WP-id, e.g. W07-2>
model: sonnet
---
The work package is `$ARGUMENTS`. Its file is docs/plan/wp/$ARGUMENTS.md.
1. Read docs/plan/STATUS.md and that WP file only. Use the light from the budget card. If the light is unknown, ask the user once for /usage figures and run /budget. On red, stop and say so. On amber, apply the amber rules.
2. If the WP file has a Checkpoint: check out its branch, confirm HEAD matches the checkpoint commit (if not, run git status and git log and reconcile first), and continue at the recorded loop step, giving the checkpoint to the agent as its brief. Otherwise: check the dependencies are merged and create the branch.
3. Tier A: run spec-tester, then implementer-core. Tier B/C: run implementer. Pass file paths and anchors; never paste file contents.
4. When green: Tier A/B → reviewer (Opus for A, Sonnet for B); send must-fix items to the same implementer via SendMessage. Tier C → ui-verifier.
5. Run the full `pnpm verify`. Open the PR with .github/pull_request_template.md.
6. Fill in the WP Handoff and Actuals, clear the Checkpoint section, update STATUS.md. Stop. The guard logs usage.

On a WRAP-UP or CHECKPOINT-NOW notice at any step: tell running subagents to return, then run /checkpoint and stop.
