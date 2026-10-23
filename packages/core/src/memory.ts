// Memory model: one trace per kanji × facet (and per word for context), each a Beta posterior
// for "knows it" plus a light stability / forgetting term.
//
// HEURISTIC, documented: the Beta update below is not an exact posterior under a guessing
// model. A correct multiple-choice answer adds (1 − γ) to alpha, because a fraction γ of correct
// answers would be lucky guesses; a wrong answer or "I don't know" adds a full 1 to beta.
// Intervals are an 80% normal approximation of that Beta, clamped to [0, 1].
import type { ContentSet, KanjiId } from '@kizuna/content';
import type { Estimate, Facet, GradedAnswer, KanjiMastery, KanjiStage, LearnerModel, TraceState } from './contracts';
import { fitAbility, guessRate } from './baseline';
import { FACET_OF, KANJI_FACETS } from './tags';

export const MEMORY_CONFIG = {
  priorAlpha: 1,
  priorBeta: 1,
  initialStabilityDays: 1,
  successGrowth: 2.5,
  slowSuccessGrowth: 1.5,
  slowLatencyMs: 8000,
  failureFactor: 0.3,
  minStabilityDays: 0.2,
  /** z for an 80% two-sided interval. */
  z80: 1.2816,
  /** Kanji stage thresholds on the overall mean. */
  stage: { weak: 0.35, shaky: 0.6, learning: 0.8 },
};

const DAY_MS = 86_400_000;

export function createLearnerModel(now: number): LearnerModel {
  return { version: 1, createdAt: now, updatedAt: now, traces: {}, answers: [], ability: 0 };
}

function newTrace(g: GradedAnswer): TraceState {
  const q = g.question;
  const isWord = q.type === 'word_reading';
  return {
    traceId: q.traceId,
    itemType: isWord ? 'word' : 'kanji',
    itemId: isWord ? (q.wordId ?? q.kanji) : q.kanji,
    facet: FACET_OF[q.type],
    alpha: MEMORY_CONFIG.priorAlpha,
    beta: MEMORY_CONFIG.priorBeta,
    attempts: 0,
    correct: 0,
    stabilityDays: MEMORY_CONFIG.initialStabilityDays,
    lastSeenAt: null,
  };
}

/** Apply one graded answer to a trace, returning a new trace. */
export function updateTrace(t: TraceState, g: GradedAnswer): TraceState {
  const gamma = guessRate(g.question.options.length);
  const next: TraceState = { ...t, attempts: t.attempts + 1 };
  if (g.correct) {
    next.alpha = t.alpha + (1 - gamma);
    next.correct = t.correct + 1;
    const growth = g.latencyMs > MEMORY_CONFIG.slowLatencyMs ? MEMORY_CONFIG.slowSuccessGrowth : MEMORY_CONFIG.successGrowth;
    next.stabilityDays = t.stabilityDays * growth;
  } else {
    next.beta = t.beta + 1;
    next.stabilityDays = Math.max(MEMORY_CONFIG.minStabilityDays, t.stabilityDays * MEMORY_CONFIG.failureFactor);
  }
  next.lastSeenAt = t.lastSeenAt === null ? g.answeredAt : Math.max(t.lastSeenAt, g.answeredAt);
  return next;
}

const answerKey = (g: GradedAnswer) => `${g.questionId}@${g.answeredAt}`;

/** Return a new model with the answers applied. Never mutates `model` or `graded`. */
export function applyAnswers(model: LearnerModel, graded: GradedAnswer[], _content: ContentSet): LearnerModel {
  const seen = new Set(model.answers.map(answerKey));
  const fresh: GradedAnswer[] = [];
  for (const g of graded) {
    const k = answerKey(g);
    if (seen.has(k)) continue;
    seen.add(k);
    fresh.push(JSON.parse(JSON.stringify(g)) as GradedAnswer);
  }
  fresh.sort((a, b) => a.answeredAt - b.answeredAt);
  const traces: Record<string, TraceState> = { ...model.traces };
  for (const g of fresh) {
    const id = g.question.traceId;
    traces[id] = updateTrace(traces[id] ?? newTrace(g), g);
  }
  const answers = [...model.answers, ...fresh];
  const updatedAt = fresh.reduce((m, g) => Math.max(m, g.answeredAt), model.updatedAt);
  return { version: 1, createdAt: model.createdAt, updatedAt, traces, answers, ability: fitAbility(answers) };
}

/** Rebuild a model from scratch from a subset of its answers (the event log). */
export function replay(model: LearnerModel, answers: GradedAnswer[], content: ContentSet): LearnerModel {
  return applyAnswers(createLearnerModel(model.createdAt), answers, content);
}

export function estimateFromBeta(alpha: number, beta: number, n: number): Estimate {
  const s = alpha + beta;
  const mean = alpha / s;
  const sd = Math.sqrt((alpha * beta) / (s * s * (s + 1)));
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return {
    mean: r(mean),
    low: r(Math.max(0, mean - MEMORY_CONFIG.z80 * sd)),
    high: r(Math.min(1, mean + MEMORY_CONFIG.z80 * sd)),
    n,
  };
}

export function traceEstimate(t: TraceState): Estimate {
  return estimateFromBeta(t.alpha, t.beta, t.attempts);
}

/** Forgetting curve R(t) = (1 + t / (9·S))^−1, with t and S in days (R(S) = 0.9). */
export function retrievability(elapsedDays: number, stabilityDays: number): number {
  const t = Math.max(0, elapsedDays);
  return 1 / (1 + t / (9 * Math.max(1e-6, stabilityDays)));
}

interface FacetState {
  alpha: number;
  beta: number;
  attempts: number;
  stabilityDays: number;
  lastSeenAt: number | null;
}

/**
 * Per-facet states for a kanji. The context facet pools the word traces of word questions
 * that probed this kanji (they count as observations for it, but are scheduled per word).
 */
function facetStates(model: LearnerModel, kanji: KanjiId): Map<Facet, FacetState> {
  const out = new Map<Facet, FacetState>();
  for (const f of KANJI_FACETS) {
    const t = model.traces[`kanji:${kanji}:${f}`];
    if (t && t.attempts > 0) out.set(f, { ...t });
  }
  const wordTraces = new Set<string>();
  for (const a of model.answers) if (a.question.type === 'word_reading' && a.question.kanji === kanji) wordTraces.add(a.question.traceId);
  let ctx: FacetState | null = null;
  for (const id of wordTraces) {
    const t = model.traces[id];
    if (!t || t.attempts === 0) continue;
    if (!ctx) ctx = { alpha: 1, beta: 1, attempts: 0, stabilityDays: 0, lastSeenAt: null };
    ctx.alpha += t.alpha - MEMORY_CONFIG.priorAlpha;
    ctx.beta += t.beta - MEMORY_CONFIG.priorBeta;
    ctx.stabilityDays = (ctx.stabilityDays * ctx.attempts + t.stabilityDays * t.attempts) / (ctx.attempts + t.attempts);
    ctx.attempts += t.attempts;
    ctx.lastSeenAt = ctx.lastSeenAt === null ? t.lastSeenAt : Math.max(ctx.lastSeenAt, t.lastSeenAt ?? 0);
  }
  if (ctx) out.set('context', ctx);
  return out;
}

export function stageFor(overall: Estimate): KanjiStage {
  if (overall.n === 0) return 'untested';
  const { weak, shaky, learning } = MEMORY_CONFIG.stage;
  if (overall.mean < weak) return 'weak';
  if (overall.mean < shaky) return 'shaky';
  if (overall.mean < learning) return 'learning';
  return 'solid';
}

export function getKanjiMastery(model: LearnerModel, _content: ContentSet, kanji: KanjiId, now: number): KanjiMastery {
  const states = facetStates(model, kanji);
  const facets: Partial<Record<Facet, Estimate>> = {};
  let alpha = MEMORY_CONFIG.priorAlpha;
  let beta = MEMORY_CONFIG.priorBeta;
  let n = 0;
  let recallSum = 0;
  for (const [f, s] of states) {
    const est = estimateFromBeta(s.alpha, s.beta, s.attempts);
    facets[f] = est;
    alpha += s.alpha - MEMORY_CONFIG.priorAlpha;
    beta += s.beta - MEMORY_CONFIG.priorBeta;
    n += s.attempts;
    const elapsed = s.lastSeenAt === null ? 0 : (now - s.lastSeenAt) / DAY_MS;
    recallSum += s.attempts * est.mean * retrievability(elapsed, s.stabilityDays);
  }
  const overall = estimateFromBeta(alpha, beta, n);
  const recallNow = n > 0 ? Math.round((recallSum / n) * 1e4) / 1e4 : 0;
  return { kanji, stage: stageFor(overall), overall, facets, recallNow };
}
