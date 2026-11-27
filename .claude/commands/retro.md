---
description: Friday retro (Sonnet). Fills in the retro, rewrites STATUS.md, updates the roadmap. Usage: /retro <Wnn>
argument-hint: <week id, e.g. W00>
model: sonnet
---
Run the retro for week `$ARGUMENTS`.
1. Read docs/plan/weeks/$ARGUMENTS.md, each WP file's Actuals section, and the week's rows in docs/plan/budget-log.md.
2. Append the "## Retro" section to the weekly file using template A.3 (development-plan Appendix A): estimated vs actual % per WP, strikes, must-fix counts, merged state.
3. Compute total used (against the 80% line), peak day, and the calibration factor (actual ÷ estimate). Give next week's capacity in M-equivalents.
4. List carry-overs, what slowed the week, and at most 2 changes for next week.
5. Rewrite docs/plan/STATUS.md (60 lines at most) for the new week.
6. Update docs/plan/roadmap.md: tick finished weeks, mark carry-overs.
7. Move any should-fix items recorded in WP Handoffs into docs/plan/backlog.md.
