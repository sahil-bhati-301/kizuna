// analyze(): baseline → observations → detectors → ranked, explained patterns.
import type { ContentSet, KanjiId } from '@kizuna/content';
import type { Analysis, Facet, GradedAnswer, KanjiMastery, LearnerModel, Pattern, SessionPhase } from '../contracts';
import { expectedFor, fitAbility } from '../baseline';
import { getIndex } from '../contentIndex';
import { getKanjiMastery, replay } from '../memory';
import { FACET_LABEL, FACET_OF, FACETS, pairKey as pairKeyOf } from '../tags';
import {
  ANALYSIS_CONFIG,
  type DetectorContext,
  type Obs,
  detectComponentFamilies,
  detectConfusions,
  detectContextGap,
  detectReadingKind,
  findWeakKanji,
  summarize,
  weakKanjiPattern,
} from './detectors';
import { round } from './stats';

const DAY_MS = 86_400_000;

export function buildObservations(answers: readonly GradedAnswer[], theta: number, cfg = ANALYSIS_CONFIG): Obs[] {
  const hasPractice = answers.some((a) => a.phase === 'practice');
  const latest = answers.reduce((m, a) => Math.max(m, a.answeredAt), -Infinity);
  return answers.map((g, order) => {
    const age = Number.isFinite(latest) ? Math.max(0, (latest - g.answeredAt) / DAY_MS) : 0;
    const recency = 2 ** (-age / cfg.halfLifeDays);
    const phaseW = hasPractice && g.phase === 'test' ? cfg.testWeightWithPractice : 1;
    return {
      g,
      y: g.correct ? 1 : 0,
      p: expectedFor(theta, g),
      w: recency * phaseW,
      kanji: g.question.kanji,
      facet: FACET_OF[g.question.type],
      order,
    };
  });
}

/** Share of a pattern's errors explained by confusions inside flagged knots. */
function explainedShare(p: Pattern, obs: readonly Obs[], knotKeys: Set<string>, excluded: ReadonlySet<Facet>): number {
  const inScope = new Set(p.kanji);
  const wrong = obs.filter((o) => o.y === 0 && inScope.has(o.kanji) && scopeMatches(p, o, excluded));
  if (wrong.length === 0) return 0;
  const explained = wrong.filter((o) => o.g.confusedWith && knotKeys.has(pairKeyOf(o.kanji, o.g.confusedWith))).length;
  return explained / wrong.length;
}

function scopeMatches(p: Pattern, o: Obs, excluded: ReadonlySet<Facet>): boolean {
  if (p.type === 'reading_kind') return o.facet === (p.groupKey === 'reading_kind:on' ? 'reading_on' : 'reading_kun');
  if (p.type === 'context_gap') return o.facet === 'context';
  if (p.type === 'component_family') return !excluded.has(o.facet);
  return true;
}

export function analyze(model: LearnerModel, content: ContentSet, now: number, opts?: { phase?: SessionPhase }): Analysis {
  const cfg = ANALYSIS_CONFIG;
  const ix = getIndex(content);
  const phase = opts?.phase;
  const answers = phase ? model.answers.filter((a) => a.phase === phase) : model.answers;
  const scoped = phase ? replay(model, answers, content) : model;
  const theta = phase ? fitAbility(answers) : model.ability;
  const obs = buildObservations(answers, theta, cfg);

  const mastery = new Map<KanjiId, KanjiMastery>();
  for (const k of ix.ordered) mastery.set(k.id, getKanjiMastery(scoped, content, k.id, now));

  const notes: string[] = [];
  const ctx: DetectorContext = { ix, obs, theta, mastery, cfg, notes };

  const knots = [...detectConfusions(ctx, 'visual'), ...detectConfusions(ctx, 'semantic')];
  const knotKeys = new Set<string>();
  for (const k of knots) {
    if (k.visual.kind === 'confusion_pair') for (const pr of k.visual.pairs) knotKeys.add(pairKeyOf(pr.a, pr.b));
  }

  const groups: Pattern[] = [];
  const keep = (p: Pattern, excluded: ReadonlySet<Facet>) => {
    const share = explainedShare(p, obs, knotKeys, excluded);
    if (share >= cfg.explainedShare) {
      notes.push(`${p.title} looks weaker, but most of those mistakes come from mixing up related kanji, so it isn't listed separately.`);
      return false;
    }
    return true;
  };
  // Facet-level patterns first; families are then judged without the facets they explain.
  const excluded = new Set<Facet>();
  for (const p of [...detectReadingKind(ctx), ...detectContextGap(ctx)]) {
    if (!keep(p, excluded)) continue;
    groups.push(p);
    if (p.type === 'context_gap') excluded.add('context');
    if (p.type === 'reading_kind') excluded.add(p.groupKey === 'reading_kind:on' ? 'reading_on' : 'reading_kun');
  }
  for (const p of detectComponentFamilies(ctx, excluded)) if (keep(p, excluded)) groups.push(p);

  const weak = findWeakKanji(ctx);
  const covered = new Set([...knots, ...groups].flatMap((p) => p.kanji));
  const weakPatterns = weak
    .filter((w) => !covered.has(w.kanji))
    .map((w) => weakKanjiPattern(ctx, w))
    .filter((p) => p.confidence >= cfg.minConfidence);

  const patterns = [...knots, ...groups, ...weakPatterns]
    .sort((a, b) => b.severity - a.severity || b.confidence - a.confidence || (a.id < b.id ? -1 : 1))
    .slice(0, cfg.maxPatterns);

  if (answers.length === 0) notes.unshift('No answers yet. Take the test to see your patterns.');
  else if (answers.length < 20) notes.unshift(`Only ${answers.length} answers so far; patterns get clearer after the full test.`);
  if (answers.length > 0 && patterns.length === 0) {
    notes.push('No clear patterns: your mistakes look scattered rather than systematic.');
  }

  const correct = answers.filter((a) => a.correct).length;
  const byFacet = FACETS.map((f) => {
    const s = summarize(ctx, obs.filter((o) => o.facet === f));
    return { facet: f, label: FACET_LABEL[f], observed: s.observed, expected: s.expected, n: s.n };
  });

  return {
    generatedAt: now,
    answered: answers.length,
    accuracy: answers.length ? round(correct / answers.length) : 0,
    ability: round(theta),
    byFacet,
    patterns,
    weakKanji: weak.map((w) => ({ kanji: w.kanji, mastery: mastery.get(w.kanji) as KanjiMastery, reasons: w.reasons })),
    kanjiMap: ix.ordered.map((k) => mastery.get(k.id) as KanjiMastery),
    notes: [...new Set(notes)],
  };
}
