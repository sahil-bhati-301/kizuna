// Pattern detectors. Each is a pure function of the analysis context and returns candidate
// patterns with their evidence, explanation and visual.
import type { ComponentId, KanjiId, Relation, RelationKind } from '@kizuna/content';
import type {
  DrillTemplate,
  EvidenceExample,
  Facet,
  GradedAnswer,
  KanjiMastery,
  Pattern,
  PatternType,
  VisualSpec,
} from '../contracts';
import {
  type ContentIndex,
  byCodePoint,
  componentDiff,
  componentGlyph,
  componentKeyword,
} from '../contentIndex';
import { FACET_LABEL, FACETS, pairKey } from '../tags';
import { listAnd, percent, plural, times } from '../text';
import { expectedFor, fitAbility } from '../baseline';
import { betaCdf, groupEffect, round } from './stats';

export const ANALYSIS_CONFIG = {
  /** Prior sd of a group effect δ (logit scale). */
  priorSd: 0.8,
  /** A deficit counts when δ < −τ. */
  tau: 0.4,
  newtonSteps: 3,
  /** Thresholds lowered for a single 60-question test. */
  minN: 5,
  minConfidence: 0.8,
  minKanji: 2,
  minFamilyKanji: 3,
  /**
   * Family robustness: without its single worst kanji the family must still show a deficit,
   * P(δ < −looTau) ≥ minConfidence. τ = 0 here: the gap must persist, not stay as large.
   */
  looTau: 0,
  /** Recency: practice answers count fully; test answers are down-weighted once practice exists. */
  testWeightWithPractice: 0.6,
  halfLifeDays: 21,
  confusion: {
    minConfusions: 2,
    minRate: 0.5,
    minOpportunities: 2,
    /** Confidence = P(confusion rate > this) under Beta(1 + c, 1 + e − c). */
    rateThreshold: 0.25,
  },
  weak: { minAttempts: 2, minFacets: 2 },
  /**
   * Reading kind: confidence is the larger of the group-effect posterior and
   * P(swap rate > rateThreshold) under Beta(1 + swaps, 1 + chances − swaps), once swaps ≥ minSwaps.
   */
  readingSwap: { minSwaps: 3, rateThreshold: 0.2 },
  context: { minIsolatedAccuracy: 0.5 },
  /** Drop a group pattern when this share of its errors is explained by a flagged knot. */
  explainedShare: 0.5,
  maxPatterns: 6,
  maxExamples: 5,
  severity: { deltaScale: 40, wDelta: 0.45, wConf: 0.35, wScope: 0.2, scopeScale: 6 },
};
export type AnalysisConfig = typeof ANALYSIS_CONFIG;

export interface Obs {
  g: GradedAnswer;
  y: number;
  /** Expected probability from the baseline. */
  p: number;
  /** Evidence weight (recency). */
  w: number;
  kanji: KanjiId;
  facet: Facet;
  order: number;
}

export interface DetectorContext {
  ix: ContentIndex;
  obs: Obs[];
  theta: number;
  mastery: Map<KanjiId, KanjiMastery>;
  cfg: AnalysisConfig;
  notes: string[];
}

export interface Summary {
  n: number;
  items: number;
  observed: number;
  expected: number;
  deltaPp: number;
  confidence: number;
  correct: number;
}

/**
 * Re-express a group's expected values against θ fitted WITHOUT that group (leave-group-out),
 * so a big weak group cannot drag down its own baseline and hide itself.
 */
export function rebase(ctx: DetectorContext, obs: readonly Obs[]): Obs[] {
  const inGroup = new Set(obs.map((o) => o.order));
  const rest = ctx.obs.filter((o) => !inGroup.has(o.order)).map((o) => o.g);
  if (rest.length === 0) return obs.slice();
  const theta = fitAbility(rest);
  return obs.map((o) => ({ ...o, p: expectedFor(theta, o.g) }));
}

/** Summary of a group. 'leave_out' (default) uses the leave-group-out baseline. */
export function summarize(
  ctx: DetectorContext,
  input: readonly Obs[],
  mode: 'leave_out' | 'global' = 'leave_out',
  tau = ctx.cfg.tau,
): Summary {
  const obs = mode === 'leave_out' ? rebase(ctx, input) : input;
  const n = obs.length;
  const items = new Set(obs.map((o) => o.kanji)).size;
  const correct = obs.reduce((a, o) => a + o.y, 0);
  // Recency-weighted means (equal to plain means when every answer has the same weight,
  // e.g. a test-only analysis), so practice shows up in before/after comparisons.
  const wSum = obs.reduce((a, o) => a + o.w, 0);
  const observed = wSum ? obs.reduce((a, o) => a + o.w * o.y, 0) / wSum : 0;
  const expected = wSum ? obs.reduce((a, o) => a + o.w * o.p, 0) / wSum : 0;
  const eff = groupEffect(obs, ctx.cfg.priorSd, tau, ctx.cfg.newtonSteps);
  return {
    n,
    items,
    observed: round(observed),
    expected: round(expected),
    deltaPp: round((observed - expected) * 100, 1),
    confidence: n ? round(eff.pBelow) : 0,
    correct,
  };
}

function flagged(ctx: DetectorContext, s: Summary, minKanji: number): boolean {
  return s.n >= ctx.cfg.minN && s.confidence >= ctx.cfg.minConfidence && s.items >= minKanji;
}

export function toExample(g: GradedAnswer): EvidenceExample {
  return {
    questionId: g.questionId,
    kanji: g.question.kanji,
    prompt: g.question.prompt,
    instruction: g.question.instruction,
    chosen: g.chosenLabel,
    correct: g.correctLabel,
    errorClasses: g.errorClasses.slice(),
  };
}

/** Wrong answers, ordered by a detector-specific priority, then surprise, spreading over kanji. */
function pickExamples(ctx: DetectorContext, obs: readonly Obs[], priority: (o: Obs) => number): EvidenceExample[] {
  const wrong = obs
    .filter((o) => o.y === 0)
    .slice()
    .sort((a, b) => priority(b) - priority(a) || b.p - a.p || b.order - a.order);
  const out: Obs[] = [];
  const usedKanji = new Set<string>();
  for (const o of wrong) {
    if (out.length >= ctx.cfg.maxExamples) break;
    if (usedKanji.has(o.kanji)) continue;
    usedKanji.add(o.kanji);
    out.push(o);
  }
  for (const o of wrong) {
    if (out.length >= ctx.cfg.maxExamples) break;
    if (!out.includes(o)) out.push(o);
  }
  out.sort((a, b) => priority(b) - priority(a) || b.p - a.p || b.order - a.order);
  return out.map((o) => toExample(o.g));
}

const RECOMMENDATION: Record<PatternType, DrillTemplate> = {
  visual_confusion: 'contrast_pair',
  semantic_confusion: 'contrast_pair',
  component_family: 'family_drill',
  reading_kind: 'reading_focus',
  context_gap: 'context_words',
  weak_kanji: 'weak_kanji_review',
};

function recommendation(type: PatternType, kanji: KanjiId[], extra: string): Pattern['recommendation'] {
  const template = RECOMMENDATION[type];
  switch (template) {
    case 'contrast_pair':
      return {
        template,
        label: 'Contrast drill',
        description: `Practise ${listAnd(kanji)} side by side, with both always on the card, until the difference sticks.`,
      };
    case 'family_drill':
      return {
        template,
        label: 'Family drill',
        description: `Work through the ${extra} family, with the component's meaning shown as a cue.`,
      };
    case 'reading_focus':
      return {
        template,
        label: 'Reading focus',
        description: `Practise ${extra} for ${listAnd(kanji)}, with the other kind of reading as a decoy.`,
      };
    case 'context_words':
      return {
        template,
        label: 'Words in context',
        description: `Read ${listAnd(kanji)} inside words, using words you haven't seen in the test.`,
      };
    case 'weak_kanji_review':
      return {
        template,
        label: 'Rebuild this kanji',
        description: `Go over every side of ${listAnd(kanji)}: meaning, readings and recognition.`,
      };
  }
}

export function severityOf(ctx: DetectorContext, deltaPp: number, confidence: number, scope: number): number {
  const s = ctx.cfg.severity;
  return round(
    s.wDelta * Math.min(1, Math.abs(Math.min(0, deltaPp)) / s.deltaScale) +
      s.wConf * confidence +
      s.wScope * Math.min(1, scope / s.scopeScale),
    4,
  );
}

interface PatternInput {
  type: PatternType;
  groupKey: string;
  title: string;
  kanji: KanjiId[];
  summary: Summary;
  confidence?: number;
  reason: string;
  facts: string[];
  examples: EvidenceExample[];
  visual: VisualSpec;
  recommendationExtra?: string;
  confusions?: number;
  opportunities?: number;
}

function makePattern(ctx: DetectorContext, i: PatternInput): Pattern {
  const confidence = round(i.confidence ?? i.summary.confidence);
  const evidence: Pattern['evidence'] = {
    n: i.summary.n,
    items: i.summary.items,
    observed: i.summary.observed,
    expected: i.summary.expected,
    deltaPp: i.summary.deltaPp,
    confidence,
    examples: i.examples.slice(0, ctx.cfg.maxExamples),
    facts: i.facts.slice(0, 4),
  };
  if (i.confusions !== undefined) evidence.confusions = i.confusions;
  if (i.opportunities !== undefined) evidence.opportunities = i.opportunities;
  return {
    id: `${i.type}:${i.groupKey}`,
    type: i.type,
    title: i.title,
    groupKey: i.groupKey,
    kanji: i.kanji,
    severity: severityOf(ctx, i.summary.deltaPp, confidence, i.kanji.length),
    confidence,
    reason: i.reason,
    evidence,
    visual: i.visual,
    recommendation: recommendation(i.type, i.kanji, i.recommendationExtra ?? ''),
  };
}

const rankOf = (ctx: DetectorContext) => {
  const m = new Map(ctx.ix.ordered.map((k, i) => [k.id, i]));
  return (a: KanjiId, b: KanjiId) => (m.get(a) ?? 0) - (m.get(b) ?? 0) || byCodePoint(a, b);
};

const isolated = (o: Obs) => o.facet !== 'context';

function perKanjiLine(obs: readonly Obs[], order: (a: KanjiId, b: KanjiId) => number): string {
  const by = new Map<KanjiId, { c: number; n: number }>();
  for (const o of obs) {
    const e = by.get(o.kanji) ?? { c: 0, n: 0 };
    e.c += o.y;
    e.n += 1;
    by.set(o.kanji, e);
  }
  return [...by.entries()]
    .sort((a, b) => a[1].c / a[1].n - b[1].c / b[1].n || order(a[0], b[0]))
    .map(([k, e]) => `${k} ${e.c}/${e.n}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// component_family
// ---------------------------------------------------------------------------

/**
 * Families are judged on every facet except those already explained by a flagged
 * facet-level pattern (e.g. kun'yomi or words), so one weakness is not reported twice.
 */
export function detectComponentFamilies(ctx: DetectorContext, excludedFacets: ReadonlySet<Facet> = new Set()): Pattern[] {
  const { ix, cfg } = ctx;
  const order = rankOf(ctx);
  const iso = ctx.obs.filter((o) => !excludedFacets.has(o.facet));
  const candidates: Array<{ c: ComponentId; s: Summary; obs: Obs[]; worst: KanjiId; loo: Summary; members: KanjiId[] }> = [];
  for (const fam of ix.rankedFamilies) {
    const c = fam.component;
    const inFam = new Set(fam.members);
    const obs = iso.filter((o) => inFam.has(o.kanji));
    const s = summarize(ctx, obs);
    if (!flagged(ctx, s, cfg.minFamilyKanji)) continue;
    // Robustness: still flagged without the single worst kanji.
    const resid = new Map<KanjiId, number>();
    for (const o of rebase(ctx, obs)) resid.set(o.kanji, (resid.get(o.kanji) ?? 0) + o.w * (o.y - o.p));
    const worst = [...resid.entries()].sort((a, b) => a[1] - b[1] || order(a[0], b[0]))[0][0];
    const looObs = obs.filter((o) => o.kanji !== worst);
    const loo = summarize(ctx, looObs, 'leave_out', cfg.looTau);
    if (loo.n < 3 || loo.confidence < cfg.minConfidence) continue;
    const members = [...new Set(obs.map((o) => o.kanji))].sort(order);
    candidates.push({ c, s, obs, worst, loo, members });
  }
  candidates.sort((a, b) => b.s.confidence - a.s.confidence || a.s.deltaPp - b.s.deltaPp || byCodePoint(a.c, b.c));
  const accepted: typeof candidates = [];
  for (const cand of candidates) {
    const dup = accepted.some((a) => cand.members.filter((m) => a.members.includes(m)).length * 3 >= cand.members.length * 2);
    if (!dup) accepted.push(cand);
  }
  return accepted.map(({ c, s, obs, worst, loo, members }) => {
    const glyph = componentGlyph(ix, c);
    const kw = componentKeyword(ix, c);
    const famSet = new Set(members);
    const rest = summarize(ctx, iso.filter((o) => !famSet.has(o.kanji)), 'global');
    const expectedRight = Math.round(s.expected * s.n);
    const reason =
      `Kanji containing ${glyph} (${kw}) went right ${s.correct} of ${s.n} times, ` +
      `where your overall level predicts about ${expectedRight}. ` +
      `The gap is still there without ${worst}, so it's the family, not one kanji.`;
    const facts = [
      `By kanji: ${perKanjiLine(obs, order)}.`,
      ...(excludedFacets.size
        ? [`Leaves out ${listAnd([...excludedFacets].map((f) => FACET_LABEL[f].toLowerCase()))} questions, which another pattern already covers.`]
        : []),
      `All other kanji: ${rest.correct} of ${rest.n} right (${percent(rest.observed)}).`,
      `Without ${worst}: ${loo.correct} of ${loo.n} right, ${Math.abs(Math.round(loo.deltaPp))} points below expected.`,
    ];
    const visual: VisualSpec = {
      kind: 'group_bars',
      title: `${glyph} family vs. all other kanji`,
      groups: [
        { key: `component:${c}`, label: `${glyph} (${kw}) family`, observed: s.observed, expected: s.expected, n: s.n, highlight: true },
        { key: 'other', label: 'All other kanji', observed: rest.observed, expected: rest.expected, n: rest.n, highlight: false },
      ],
    };
    return makePattern(ctx, {
      type: 'component_family',
      groupKey: `component:${c}`,
      title: `The ${glyph} (${kw}) family`,
      kanji: members,
      summary: s,
      reason,
      facts,
      examples: pickExamples(ctx, obs, (o) => (o.g.errorClasses.includes('DONT_KNOW') ? 0 : 1)),
      visual,
      recommendationExtra: `${glyph} (${kw})`,
    });
  });
}

// ---------------------------------------------------------------------------
// reading_kind
// ---------------------------------------------------------------------------

const KIND_LABEL = { on: "on'yomi", kun: "kun'yomi" } as const;

export function facetBars(ctx: DetectorContext, highlight: Facet | null, title: string): VisualSpec {
  return {
    kind: 'group_bars',
    title,
    groups: FACETS.map((f) => {
      const s = summarize(ctx, ctx.obs.filter((o) => o.facet === f));
      return { key: `facet:${f}`, label: FACET_LABEL[f], observed: s.observed, expected: s.expected, n: s.n, highlight: f === highlight };
    }),
  };
}

export function detectReadingKind(ctx: DetectorContext): Pattern[] {
  const out: Pattern[] = [];
  const order = rankOf(ctx);
  for (const kind of ['on', 'kun'] as const) {
    const facet: Facet = kind === 'on' ? 'reading_on' : 'reading_kun';
    const obs = ctx.obs.filter((o) => o.facet === facet);
    if (obs.length < ctx.cfg.minN) {
      ctx.notes.push(`Answer more ${KIND_LABEL[kind]} questions to judge (${obs.length} so far).`);
      continue;
    }
    const base = summarize(ctx, obs);
    // Second signal (design §4.3): how often the other kind of reading was picked.
    const swapObs = obs.filter((o) => o.g.question.options.some((op) => op.source === 'other_reading_kind'));
    const swaps = obs.filter((o) => o.g.errorClasses.includes('READING_KIND_SWAP')).length;
    const swapConf =
      swaps >= ctx.cfg.readingSwap.minSwaps && base.deltaPp < 0
        ? round(1 - betaCdf(ctx.cfg.readingSwap.rateThreshold, 1 + swaps, 1 + swapObs.length - swaps))
        : 0;
    const s: Summary = { ...base, confidence: Math.max(base.confidence, swapConf) };
    if (!flagged(ctx, s, ctx.cfg.minKanji)) continue;
    const other = kind === 'on' ? 'kun' : 'on';
    const wrong = s.n - s.correct;
    const otherS = summarize(ctx, ctx.obs.filter((o) => o.facet === (kind === 'on' ? 'reading_kun' : 'reading_on')));
    const kanji = [...new Set(obs.map((o) => o.kanji))].sort(order);
    const expectedRight = Math.round(s.expected * s.n);
    let reason = `You got ${s.correct} of ${s.n} ${KIND_LABEL[kind]} questions right, where your overall level predicts about ${expectedRight}.`;
    if (swaps > 0 && swaps === wrong) reason += ` In ${wrong === 1 ? 'that miss' : `all ${wrong} misses`} you picked the ${KIND_LABEL[other]} instead.`;
    else if (swaps > 0) reason += ` In ${swaps} of the ${plural(wrong, 'miss', 'misses')} you picked the ${KIND_LABEL[other]} instead.`;
    const facts = [
      `${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)}: ${s.correct} of ${s.n} right (${percent(s.observed)}), expected about ${percent(s.expected)}.`,
      `Picked the ${KIND_LABEL[other]} instead: ${times(swaps)}.`,
      otherS.n > 0
        ? `${KIND_LABEL[other][0].toUpperCase()}${KIND_LABEL[other].slice(1)} for comparison: ${otherS.correct} of ${otherS.n} right (${percent(otherS.observed)}).`
        : `No ${KIND_LABEL[other]} questions answered yet for comparison.`,
      `Missed on: ${listAnd(
        [...new Set(obs.filter((o) => o.y === 0).map((o) => o.kanji))].sort(order),
        6,
      )}.`,
    ];
    const wrongKanji = [...new Set(obs.filter((o) => o.y === 0).map((o) => o.kanji))].sort(order);
    out.push(
      makePattern(ctx, {
        type: 'reading_kind',
        groupKey: `reading_kind:${kind}`,
        title: `${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)} lags behind`,
        kanji: wrongKanji.length ? wrongKanji : kanji,
        summary: s,
        reason,
        facts,
        examples: pickExamples(ctx, obs, (o) => (o.g.errorClasses.includes('READING_KIND_SWAP') ? 2 : o.g.errorClasses.includes('DONT_KNOW') ? 0 : 1)),
        visual: facetBars(ctx, facet, 'Accuracy by question type'),
        recommendationExtra: `${KIND_LABEL[kind]} next to ${KIND_LABEL[other]}`,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// visual_confusion / semantic_confusion
// ---------------------------------------------------------------------------

interface PairStat {
  rel: Relation;
  key: string;
  aAsB: number;
  bAsA: number;
  oppA: number;
  oppB: number;
  cW: number;
  eW: number;
  obs: Obs[];
}

function pairStats(ctx: DetectorContext, kind: RelationKind): PairStat[] {
  const out: PairStat[] = [];
  const seen = new Set<string>();
  for (const rel of ctx.ix.content.relations) {
    if (rel.kind !== kind || !ctx.ix.kanji.has(rel.a) || !ctx.ix.kanji.has(rel.b) || rel.a === rel.b) continue;
    const key = pairKey(rel.a, rel.b);
    if (seen.has(key)) continue;
    // A pair that is both a lookalike and a meaning pair is reported once, as visual.
    if (kind === 'semantic' && ctx.ix.content.relations.some((r) => r.kind === 'visual' && pairKey(r.a, r.b) === key)) continue;
    seen.add(key);
    const st: PairStat = { rel, key, aAsB: 0, bAsA: 0, oppA: 0, oppB: 0, cW: 0, eW: 0, obs: [] };
    for (const o of ctx.obs) {
      const partner = o.kanji === rel.a ? rel.b : o.kanji === rel.b ? rel.a : null;
      if (!partner) continue;
      if (!o.g.question.options.some((op) => op.fromKanji === partner)) continue;
      st.obs.push(o);
      st.eW += o.w;
      if (o.kanji === rel.a) st.oppA++;
      else st.oppB++;
      if (o.y === 0 && o.g.confusedWith === partner) {
        st.cW += o.w;
        if (o.kanji === rel.a) st.aAsB++;
        else st.bAsA++;
      }
    }
    out.push(st);
  }
  return out;
}

function pairFlagged(ctx: DetectorContext, st: PairStat): boolean {
  const c = ctx.cfg.confusion;
  const eps = 1e-9;
  if (st.cW + eps >= c.minConfusions) return true;
  return st.cW + eps >= 1 && st.eW + eps >= c.minOpportunities && st.cW / st.eW + eps >= c.minRate;
}

function confusionConfidence(ctx: DetectorContext, cW: number, eW: number): number {
  return round(1 - betaCdf(ctx.cfg.confusion.rateThreshold, 1 + cW, 1 + Math.max(0, eW - cW)));
}

export function detectConfusions(ctx: DetectorContext, kind: RelationKind): Pattern[] {
  const stats = pairStats(ctx, kind).filter((s) => pairFlagged(ctx, s));
  // Merge flagged pairs that share a kanji (connected components).
  const parent = new Map<KanjiId, KanjiId>();
  const find = (x: KanjiId): KanjiId => {
    while (parent.get(x) !== x) x = parent.get(x) as KanjiId;
    return x;
  };
  for (const s of stats) {
    for (const k of [s.rel.a, s.rel.b]) if (!parent.has(k)) parent.set(k, k);
    const ra = find(s.rel.a);
    const rb = find(s.rel.b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const clusters = new Map<KanjiId, PairStat[]>();
  for (const s of stats) {
    const r = find(s.rel.a);
    clusters.set(r, [...(clusters.get(r) ?? []), s]);
  }
  const type: PatternType = kind === 'visual' ? 'visual_confusion' : 'semantic_confusion';
  const out: Pattern[] = [];
  for (const pairs of clusters.values()) {
    pairs.sort((x, y) => x.aAsB + x.bAsA - (y.aAsB + y.bAsA) || byCodePoint(x.key, y.key)).reverse();
    const kanji = [...new Set(pairs.flatMap((p) => [p.rel.a, p.rel.b]))].sort(byCodePoint);
    const groupKey = pairs.length === 1 ? `pair:${pairs[0].key}` : `cluster:${kanji.join('/')}`;
    const obsMap = new Map<number, Obs>();
    for (const p of pairs) for (const o of p.obs) obsMap.set(o.order, o);
    const obs = [...obsMap.values()].sort((a, b) => a.order - b.order);
    const s = summarize(ctx, obs);
    const confusions = pairs.reduce((a, p) => a + p.aAsB + p.bAsA, 0);
    const opportunities = pairs.reduce((a, p) => a + p.oppA + p.oppB, 0);
    const cW = pairs.reduce((a, p) => a + p.cW, 0);
    const eW = pairs.reduce((a, p) => a + p.eW, 0);
    const confidence = confusionConfidence(ctx, cW, eW);
    const main = pairs[0];
    const dirs = [
      { x: main.rel.a, y: main.rel.b, c: main.aAsB, e: main.oppA },
      { x: main.rel.b, y: main.rel.a, c: main.bAsA, e: main.oppB },
    ].sort((d1, d2) => d2.c - d1.c || d2.e - d1.e);
    const ofTimes = (c: number, e: number) => (e === 1 ? 'the one time it came up' : `${c} of ${e} times`);
    let reason = `You chose ${dirs[0].y} when asked for ${dirs[0].x} ${ofTimes(dirs[0].c, dirs[0].e)}`;
    if (dirs[1].c > 0) reason += `, and ${dirs[1].y} for ${dirs[1].x} ${ofTimes(dirs[1].c, dirs[1].e)}`;
    reason += '.';
    if (pairs.length > 1) {
      const others = pairs.slice(1).map((p) => `${p.rel.a} ↔ ${p.rel.b}`);
      reason += ` The same mix-up shows up with ${listAnd(others)}.`;
    }
    reason +=
      kind === 'visual'
        ? ' These kanji look alike, so it helps to see them side by side.'
        : ' Their meanings are close, so it helps to contrast them directly.';
    const facts: string[] = [];
    const dirFact = (x: KanjiId, y: KanjiId, c: number, e: number) =>
      e === 0 ? `${x} was not asked with ${y} on the card yet` : `${x} → ${y}: ${c} of ${e} chances`;
    for (const p of pairs.slice(0, 2)) {
      facts.push(`${dirFact(p.rel.a, p.rel.b, p.aAsB, p.oppA)}; ${dirFact(p.rel.b, p.rel.a, p.bAsA, p.oppB)}.`);
    }
    if (main.rel.note) facts.push(`Tell them apart: ${main.rel.note}`);
    if (kind === 'visual') {
      const d = componentDiff(ctx.ix, main.rel.a, main.rel.b);
      if (d.shared.length) facts.push(`Both contain ${d.shared.join(' ')}; ${describeOnly(main.rel.a, d.onlyA, main.rel.b, d.onlyB)}`);
    }
    const partnerWord = kind === 'visual' ? 'the lookalike' : 'the related kanji';
    facts.push(`Accuracy when ${partnerWord} was on the card: ${s.correct} of ${s.n} (${percent(s.observed)}).`);
    const visual: VisualSpec = {
      kind: 'confusion_pair',
      title: kind === 'visual' ? 'Lookalikes you mix up' : 'Related meanings you mix up',
      pairs: pairs.map((p) => {
        const d = componentDiff(ctx.ix, p.rel.a, p.rel.b);
        return {
          a: p.rel.a,
          b: p.rel.b,
          aAsB: p.aAsB,
          bAsA: p.bAsA,
          opportunities: p.oppA + p.oppB,
          shared: d.shared,
          onlyA: d.onlyA,
          onlyB: d.onlyB,
          note: p.rel.note,
        };
      }),
    };
    const confusedKeys = new Set(pairs.map((p) => p.key));
    const isConfusion = (o: Obs) => (o.g.confusedWith && confusedKeys.has(pairKey(o.kanji, o.g.confusedWith)) ? 2 : 0);
    out.push(
      makePattern(ctx, {
        type,
        groupKey,
        title: `${kind === 'visual' ? 'Knot' : 'Mix-up'}: ${kanji.join(' ↔ ')}`,
        kanji,
        summary: s,
        confidence,
        reason,
        facts,
        examples: pickExamples(ctx, obs, isConfusion),
        visual,
        confusions,
        opportunities,
      }),
    );
  }
  return out;
}

function describeOnly(a: KanjiId, onlyA: string[], b: KanjiId, onlyB: string[]): string {
  const parts: string[] = [];
  if (onlyA.length) parts.push(`${a} adds ${onlyA.join(' ')}`);
  if (onlyB.length) parts.push(`${b} adds ${onlyB.join(' ')}`);
  return parts.length ? `${parts.join(', ')}.` : 'the difference is in the strokes.';
}

// ---------------------------------------------------------------------------
// context_gap
// ---------------------------------------------------------------------------

function facetCompare(ctx: DetectorContext, kanji: KanjiId, title: string, highlight: (f: Facet) => boolean): VisualSpec {
  const m = ctx.mastery.get(kanji);
  const facets = FACETS.filter((f) => m?.facets[f]).map((f) => ({
    facet: f,
    label: FACET_LABEL[f],
    estimate: m!.facets[f]!,
    highlight: highlight(f),
  }));
  return { kind: 'facet_compare', title, kanji, facets };
}

export function detectContextGap(ctx: DetectorContext): Pattern[] {
  const order = rankOf(ctx);
  const words = ctx.obs.filter((o) => o.facet === 'context');
  if (words.length < ctx.cfg.minN) {
    ctx.notes.push(`Answer more word questions to judge how you read kanji inside words (${words.length} so far).`);
    return [];
  }
  const s = summarize(ctx, words);
  if (!flagged(ctx, s, ctx.cfg.minKanji)) return [];
  const iso = ctx.obs.filter(isolated);
  const affected: Array<{ k: KanjiId; isoC: number; isoN: number; wC: number; wN: number }> = [];
  for (const k of [...new Set(words.map((o) => o.kanji))]) {
    const isoObs = iso.filter((o) => o.kanji === k);
    const wObs = words.filter((o) => o.kanji === k);
    const isoC = isoObs.reduce((a, o) => a + o.y, 0);
    const wC = wObs.reduce((a, o) => a + o.y, 0);
    if (isoObs.length === 0 || isoC / isoObs.length < ctx.cfg.context.minIsolatedAccuracy) continue;
    if (wC / wObs.length >= 0.5) continue;
    affected.push({ k, isoC, isoN: isoObs.length, wC, wN: wObs.length });
  }
  affected.sort((a, b) => b.wN - b.wC - (a.wN - a.wC) || b.isoC / b.isoN - a.isoC / a.isoN || order(a.k, b.k));
  const kanji = affected.length ? affected.map((a) => a.k) : [...new Set(words.filter((o) => o.y === 0).map((o) => o.kanji))].sort(order);
  const isoC = affected.reduce((a, x) => a + x.isoC, 0);
  const isoN = affected.reduce((a, x) => a + x.isoN, 0);
  const wC = affected.reduce((a, x) => a + x.wC, 0);
  const wN = affected.reduce((a, x) => a + x.wN, 0);
  const expectedRight = Math.round(s.expected * s.n);
  let reason = `You read ${s.correct} of ${s.n} words correctly, where your overall level predicts about ${expectedRight}.`;
  if (affected.length) {
    reason += ` You know ${listAnd(affected.map((a) => a.k))} on ${affected.length === 1 ? 'its' : 'their'} own (${isoC} of ${isoN} right), but got only ${wC} of ${wN} words with ${affected.length === 1 ? 'it' : 'them'} right.`;
  }
  const isoS = summarize(ctx, iso, 'global');
  const facts = [
    `Words: ${s.correct} of ${s.n} right (${percent(s.observed)}), expected about ${percent(s.expected)}.`,
    `Kanji on their own: ${isoS.correct} of ${isoS.n} right (${percent(isoS.observed)}).`,
  ];
  const worstWord = words
    .filter((o) => o.y === 0 && o.g.chosenLabel)
    .sort((a, b) => b.p - a.p || a.order - b.order)[0];
  if (worstWord) facts.push(`For example, you read ${worstWord.g.question.prompt} as ${worstWord.g.chosenLabel} instead of ${worstWord.g.correctLabel}.`);
  const swaps = words.filter((o) => o.g.errorClasses.includes('READING_KIND_SWAP')).length;
  if (swaps) facts.push(`${times(swaps)[0].toUpperCase()}${times(swaps).slice(1)} you used the other kind of reading (on vs. kun) inside a word.`);
  const top = kanji[0];
  return [
    makePattern(ctx, {
      type: 'context_gap',
      groupKey: 'facet:context',
      title: 'Kanji inside words',
      kanji,
      summary: s,
      reason,
      facts,
      examples: pickExamples(ctx, words, (o) => (affected.some((a) => a.k === o.kanji) ? 2 : 0) + (o.g.errorClasses.includes('DONT_KNOW') ? 0 : 1)),
      visual: facetCompare(ctx, top, `${top} on its own vs. in words`, (f) => f === 'context'),
    }),
  ];
}

// ---------------------------------------------------------------------------
// weak_kanji
// ---------------------------------------------------------------------------

export interface WeakKanjiFinding {
  kanji: KanjiId;
  summary: Summary;
  wrongFacets: Facet[];
  reasons: string[];
  obs: Obs[];
}

export function findWeakKanji(ctx: DetectorContext): WeakKanjiFinding[] {
  const order = rankOf(ctx);
  const byKanji = new Map<KanjiId, Obs[]>();
  for (const o of ctx.obs) byKanji.set(o.kanji, [...(byKanji.get(o.kanji) ?? []), o]);
  const out: WeakKanjiFinding[] = [];
  for (const [k, obs] of byKanji) {
    if (obs.length < ctx.cfg.weak.minAttempts) continue;
    const correct = obs.reduce((a, o) => a + o.y, 0);
    if (correct * 2 >= obs.length) continue;
    const wrongFacets = FACETS.filter((f) => obs.some((o) => o.facet === f && o.y === 0));
    if (wrongFacets.length < ctx.cfg.weak.minFacets) continue;
    const s = summarize(ctx, obs);
    const reasons = [
      `Missed ${obs.length - correct} of ${obs.length} questions on ${k}.`,
      `Wrong in ${listAnd(wrongFacets.map((f) => FACET_LABEL[f].toLowerCase()))}.`,
    ];
    const dk = obs.filter((o) => o.g.errorClasses.includes('DONT_KNOW')).length;
    if (dk) reasons.push(`Pressed "I don't know" ${times(dk)}.`);
    const confused = [...new Set(obs.map((o) => o.g.confusedWith).filter((x): x is KanjiId => !!x))];
    if (confused.length) reasons.push(`Mixed it up with ${listAnd(confused)}.`);
    out.push({ kanji: k, summary: s, wrongFacets, reasons, obs });
  }
  return out.sort((a, b) => a.summary.observed - b.summary.observed || b.summary.n - a.summary.n || order(a.kanji, b.kanji));
}

export function weakKanjiPattern(ctx: DetectorContext, f: WeakKanjiFinding): Pattern {
  const wrong = f.summary.n - f.summary.correct;
  const reason =
    `${f.kanji} was missed ${wrong} of ${f.summary.n} times, across ${listAnd(f.wrongFacets.map((x) => FACET_LABEL[x].toLowerCase()))}. ` +
    `That's more than a single slip, so it's worth rebuilding from the parts.`;
  const k = ctx.ix.kanji.get(f.kanji);
  const facts = [
    `${f.summary.correct} of ${f.summary.n} right (${percent(f.summary.observed)}), expected about ${percent(f.summary.expected)}.`,
    ...f.reasons.slice(1, 3),
  ];
  const parts = k ? [...new Set(k.parts.map((p) => componentGlyph(ctx.ix, p.component)))].filter((c) => c !== f.kanji) : [];
  if (k) facts.push(parts.length ? `${f.kanji} means "${k.keyword}" and is built from ${listAnd(parts)}.` : `${f.kanji} means "${k.keyword}".`);
  return makePattern(ctx, {
    type: 'weak_kanji',
    groupKey: `kanji:${f.kanji}`,
    title: `Weak kanji: ${f.kanji}`,
    kanji: [f.kanji],
    summary: f.summary,
    reason,
    facts,
    examples: pickExamples(ctx, f.obs, () => 0),
    visual: facetCompare(ctx, f.kanji, `${f.kanji} by question type`, (x) => f.wrongFacets.includes(x)),
  });
}

