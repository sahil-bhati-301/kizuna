---
description: Fix red CI on main or a production bug with the smallest safe change (Sonnet). Usage: /hotfix <description or CI run link>
argument-hint: <what is broken>
model: sonnet
---
Fix: `$ARGUMENTS`.
1. Read docs/plan/STATUS.md. This work uses the reserve budget; ignore the daily cap but still obey WRAP-UP and CHECKPOINT-NOW notices.
2. Reproduce the failure. For CI, read the failing job log tail only.
3. Write a regression test that fails for the reported reason.
4. Make the minimal diff that turns it green. No refactors and no scope creep; note other finds in docs/plan/backlog.md.
5. Run `pnpm verify:affected`, then `pnpm verify`.
6. Branch `hotfix/<slug>`, open a PR with .github/pull_request_template.md, and mark Risk clearly.
7. Add a line to the last decisions in docs/plan/STATUS.md.
