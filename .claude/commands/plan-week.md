---
description: Plan the next week (Opus). Writes the weekly plan and its WP files, then stops for approval. Usage: /plan-week <Wnn>
argument-hint: <week id, e.g. W01>
model: opus
---
Plan week `$ARGUMENTS`.
1. Read docs/plan/roadmap.md, docs/plan/STATUS.md, docs/plan/backlog.md, and the last retro in docs/plan/weeks/ (the Retro section only).
2. Read the schedule row for this week in docs/development-plan.md §7 (grep for the week id; do not read the whole file).
3. Take capacity and calibration factor from the last retro. If none exists, mark capacity "uncalibrated".
4. Fit the WP list within `capacity × 0.9` M-equivalents. Flag the week if more than 50% of the WPs are Tier A. Split any WP larger than M.
5. Write docs/plan/weeks/$ARGUMENTS.md from template A.2 (development-plan Appendix A).
6. Write one file per WP in docs/plan/wp/ from template A.1, with 3 to 6 testable acceptance criteria each and cited digest anchors.
7. List the owner tasks and any OPEN-Qs at the end of the weekly file.
8. Stop and ask the owner to approve. Do not start any WP.
