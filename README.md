# Kizuna (絆): adaptive N5 kanji demo

A demo MVP of an adaptive kanji learning app. You take an N5 kanji test, and Kizuna:

1. **models your memory** per kanji and per skill (meaning, on'yomi, kun'yomi, recognition, reading in words), with uncertainty;
2. **spots patterns** in your mistakes, such as lookalike mix-ups (人 ↔ 入), weak component families, on/kun weakness, kanji you know alone but misread in words, and individual weak kanji;
3. **explains each finding** with evidence (counts, expected vs. observed accuracy, your actual mistakes) and a visual;
4. **builds a practice set** that targets what it found, then shows the before/after change.

Everything runs in the browser and saves to `localStorage`. There is no backend yet.

## Run it

Requires Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:5173>.

**Demo tip:** on the welcome screen, use *Demo mode* to watch a simulated learner take the test (for example "visual confuser" or "kun'yomi struggler"). Each one has a built-in weakness that the analysis should find.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests: content validation, memory model, pattern detection, practice sets |
| `npm run typecheck` | TypeScript checks for every package |
| `npm run build` | Production build of the web app (`apps/web/dist`) |

## Layout

| Path | Contents |
|---|---|
| `packages/content` | Hand-authored N5 dataset (kanji, components, readings, words, lookalike and related-meaning pairs) |
| `packages/core` | Learning engine: test generation, grading, memory model, analysis, practice sets, simulated learners |
| `apps/web` | React + Vite user interface |
| `docs/architecture-design.md` | Full product architecture |
| `docs/mvp-plan.md` | Scope, phases and roles for this demo |
