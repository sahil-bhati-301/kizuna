# Kizuna demo MVP: implementation plan

Branch: `mvp` · Date: 2026-10-23 · Parent design: [architecture-design.md](architecture-design.md)

## 1. Scope

The demo must show the full loop on N5 kanji:

1. **N5 kanji test.** A diagnostic test of about 60 multiple-choice questions covering meaning, on'yomi, kun'yomi, recognition among lookalikes, and reading kanji inside words.
2. **Memory model.** One estimate per kanji × facet (*trace*), each with an uncertainty range, updated from every answer.
3. **Pattern spotting.** Finds recurring mistakes and weak kanji. Every finding comes with:
   - a **reason** in plain language,
   - **evidence**: counts, the gap between expected and observed accuracy, and real example mistakes,
   - a **visual** of that evidence.
4. **Practice set.** A targeted practice session built from the analysis, where each item says why it was chosen. After the session the analysis re-runs and shows the before/after change.

**Out of scope for the demo:**
- backend, accounts, billing, database (the demo runs in the browser and saves to `localStorage`);
- long-term scheduling across days;
- randomised experiments.

The domain code is shaped so it can later move behind the API described in the full design without being rewritten.

## 2. How the demo maps to the full design

| Full design (architecture-design.md) | Demo MVP |
|---|---|
| `content` module, versioned release from EDRDG/KanjiVG | `packages/content`: a hand-authored N5 dataset (~80 kanji, components, readings, words, lookalike and related-meaning pairs) with validation tests |
| `memory` module: FSRS + Beta uncertainty (§4) | `packages/core/memory`: per-trace Beta "knows it" posterior with MC guess correction, plus a light stability/forgetting term |
| `insights` module: residual statistics + detectors (§5) | `packages/core/analysis`: error classifier; group effects compared with the learner's own expected accuracy; detectors for component family, visual confusion, semantic confusion, reading type, context gap, weak kanji |
| `drills` module: planner + exercises (§6) | `packages/core/test` + `packages/core/practice`: test blueprint, distractor generation with recorded relation types, practice-set generator with reason codes |
| `packages/sim` (§8.6) | `packages/core/sim`: simulated learner profiles, used by tests and by the "demo learner" button |
| Next.js web app (§7.1) | `apps/web`: Vite + React + TypeScript single-page app |

## 3. Roles and ownership

Each role owns its directory exclusively, and the shared contracts are written before the parallel work starts.

| Role | Owner | Owns | Delivers |
|---|---|---|---|
| Lead / integrator | main session | repo scaffold, `contracts` (type files), integration, verification, docs | Workspace setup, type contracts, wiring, end-to-end check in the browser |
| Content | subagent | `packages/content/**` | N5 dataset + validation tests |
| Core (learning engine) | subagent | `packages/core/**` except `src/contracts.ts` | Grading, memory model, analysis, practice sets, simulator, unit tests |
| UI | subagent | `apps/web/**` | Test runner, insights dashboard with visuals, practice runner, kanji map, persistence |

**Rules:**
- No agent edits another role's directory.
- The contracts (`packages/content/src/types.ts`, `packages/core/src/contracts.ts`) change only through the lead.
- No new dependencies without asking the lead.

## 4. Phases

| Phase | Work | Exit criteria |
|---|---|---|
| A. Foundations | Branch, npm workspaces, TypeScript and Vitest config, Vite app shell, content and core contracts | `npm install` succeeds; the contracts compile |
| B. Parallel build | Content, core and UI agents work against the contracts | Each role's own checks pass (content validation, core unit tests, UI typecheck) |
| C. Integration | Wire the UI to the real core, fix contract drift | `npm run typecheck`, `npm test` and `npm run build` all pass |
| D. Verification | Run the app in the browser: take the test by hand and with each demo learner, read the insights, run the practice set, check before/after | Each demo profile produces its injected pattern with evidence and a visual; the practice set targets it |
| E. Demo readiness | README run instructions; local commit on `mvp` | The user runs the demo; push only on request |

## 5. Detection logic (demo-sized)

- **Expected accuracy per answer** = `γ + (1 − γ)·σ(θ − b)`, where:
  - `γ` = the multiple-choice guess rate,
  - `θ` = the learner's overall ability, fitted from all of their answers,
  - `b` = item difficulty from the content (frequency, strokes, facet).
- **Group effect `δ_g`.** Uses the one-step Laplace estimate from design §5.3, so a group is flagged only when the learner does worse *than their own baseline predicts*. Support thresholds are lowered to fit a single 60-question test.
- **Confusion pairs.** Counts of choosing kanji B (or B's reading or meaning) when A was asked, using the relation type recorded on each distractor.
- **Every pattern carries:** a title, an explanation, evidence stats, example mistakes, a visual spec, and a recommended drill template.
