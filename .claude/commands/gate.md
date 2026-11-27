---
description: Phase gate review (Opus). Checks exit criteria against evidence and writes the gate report. Usage: /gate <n>
argument-hint: <gate number, e.g. 0>
model: opus
---
Review gate `$ARGUMENTS`.
1. Find the phase's exit criteria in docs/architecture-design.md §12 (grep the heading list, then read only that section).
2. Collect the evidence: CI gate results, test reports, dashboards, release diffs, and the owner's spot-check notes. Reference paths and links; do not paste them.
3. Mark each criterion pass, fail or measured-later. Name the later checkpoint for any data-gated criterion (development-plan §9).
4. Write docs/plan/weeks/GATE-$ARGUMENTS.md with the table, the evidence links and a recommendation.
5. A fail on any criterion that is not data-gated blocks the next phase. Say so plainly.
6. List ADRs needed and the capacity re-calibration for the next phase (§2.7).
7. Stop. The owner decides go or no-go.
