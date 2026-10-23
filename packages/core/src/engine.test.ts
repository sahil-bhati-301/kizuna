import { describe, expect, it } from 'vitest';
import { n5 } from '@kizuna/content';
import type { Analysis, Evidence, GradedAnswer, Question } from './contracts';
import {
  analyze,
  applyAnswers,
  compareAnalyses,
  createLearnerModel,
  createPracticeSet,
  createTest,
  getKanjiMastery,
  gradeAnswer,
  simProfiles,
  simulateAnswers,
} from './index';
import { mini } from './__fixtures__/mini';
import { T0, gradeAll, runProfile } from './__fixtures__/pipeline';
import { blueprintSuite, detectionSuite } from './__fixtures__/suites';
import { hash01, mulberry32, rngFor, shuffle } from './rng';
import { retrievability } from './memory';
import { betaCdf, normCdf } from './analysis/stats';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
  it('derives independent, repeatable streams and shuffles', () => {
    expect(rngFor(1, 'q', 3)()).toBe(rngFor(1, 'q', 3)());
    expect(rngFor(1, 'q', 3)()).not.toBe(rngFor(1, 'q', 4)());
    expect(hash01('a', 1)).toBe(hash01('a', 1));
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items, mulberry32(7))).toEqual(shuffle(items, mulberry32(7)));
    expect([...shuffle(items, mulberry32(7))].sort()).toEqual(items);
  });
});

describe('stats helpers', () => {
  it('normal and beta CDFs are sane', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.2816)).toBeCloseTo(0.9, 3);
    expect(betaCdf(0.5, 2, 2)).toBeCloseTo(0.5, 6);
    expect(betaCdf(0.25, 2, 2)).toBeCloseTo(0.15625, 6);
  });
});

describe('createTest (fixture)', () => {
  blueprintSuite(mini);
  it('honours other lengths', () => {
    expect(createTest(mini, { seed: 3, length: 30 })).toHaveLength(30);
  });
  it('builds kun questions with the okurigana form and full-kana options', () => {
    const q = createTest(mini, { seed: 1 }).find((x) => x.type === 'reading_kun' && x.kanji === '話');
    if (q) {
      expect(q.subPrompt).toContain('話す');
      expect(q.options.find((o) => o.correct)!.label).toBe('はなす');
      expect(q.options.every((o) => o.label.endsWith('す'))).toBe(true);
    }
  });
  it('tags pairs sorted by code point when a partner is on the card', () => {
    const qs = createTest(mini, { seed: 2 });
    const q = qs.find((x) => x.options.some((o) => o.source === 'visual'))!;
    const pair = q.tags.find((t) => t.startsWith('pair:'))!;
    const [a, b] = pair.slice(5).split('/');
    expect(a < b).toBe(true);
  });
});

function question(type: Question['type'] = 'meaning'): Question {
  return createTest(mini, { seed: 1 }).find((q) => q.type === type)!;
}

describe('gradeAnswer', () => {
  const q = question('meaning');
  const answer = (optionId: string | null) => ({ questionId: q.id, optionId, latencyMs: 2000, answeredAt: T0 });
  it('grades correct, wrong and "I don\'t know"', () => {
    const right = gradeAnswer(q, answer(q.options.find((o) => o.correct)!.id), mini, 'test');
    expect(right.correct).toBe(true);
    expect(right.errorClasses).toEqual([]);
    const dk = gradeAnswer(q, answer(null), mini, 'test');
    expect(dk.correct).toBe(false);
    expect(dk.errorClasses).toEqual(['DONT_KNOW']);
    expect(dk.chosenLabel).toBeNull();
  });
  it('classifies errors by distractor source', () => {
    const expected: Record<string, string> = {
      visual: 'VISUAL_CONFUSION',
      semantic: 'SEMANTIC_CONFUSION',
      shared_component: 'SHARED_COMPONENT_CONFUSION',
      other_reading_kind: 'READING_KIND_SWAP',
      random: 'RANDOM_ERROR',
    };
    const seen = new Set<string>();
    for (const qq of createTest(mini, { seed: 1 })) {
      for (const o of qq.options.filter((x) => !x.correct)) {
        const g = gradeAnswer(qq, { questionId: qq.id, optionId: o.id, latencyMs: 1000, answeredAt: T0 }, mini, 'test');
        expect(g.errorClasses[0]).toBe(expected[o.source]);
        expect(g.confusedWith).toBe(o.fromKanji);
        if (qq.type === 'word_reading') expect(g.errorClasses).toContain('CONTEXT_MISREAD');
        else expect(g.errorClasses).not.toContain('CONTEXT_MISREAD');
        seen.add(o.source);
      }
    }
    expect(seen.size).toBe(5);
  });
});

describe('memory model', () => {
  const qs = createTest(mini, { seed: 1 });
  const q = qs.find((x) => x.type === 'meaning')!;
  const grade = (correct: boolean, at: number, latencyMs = 2000): GradedAnswer =>
    gradeAnswer(q, { questionId: q.id, optionId: q.options.find((o) => o.correct === correct)!.id, latencyMs, answeredAt: at }, mini, 'test');

  it('never mutates its input and returns a new model', () => {
    const m0 = createLearnerModel(T0);
    const snapshot = JSON.stringify(m0);
    const g = [grade(true, T0 + 1)];
    const gSnap = JSON.stringify(g);
    const m1 = applyAnswers(m0, g, mini);
    expect(JSON.stringify(m0)).toBe(snapshot);
    expect(JSON.stringify(g)).toBe(gSnap);
    expect(m1).not.toBe(m0);
    expect(m1.answers).toHaveLength(1);
    const before = JSON.stringify(m1);
    applyAnswers(m1, [grade(false, T0 + 2)], mini);
    expect(JSON.stringify(m1)).toBe(before);
  });

  it('applies the guess-corrected Beta update and stability rules', () => {
    const m1 = applyAnswers(createLearnerModel(T0), [grade(true, T0 + 1)], mini);
    const t1 = m1.traces[q.traceId];
    expect(t1.alpha).toBeCloseTo(1.75);
    expect(t1.beta).toBe(1);
    expect(t1.stabilityDays).toBeCloseTo(2.5);
    const m2 = applyAnswers(m1, [grade(false, T0 + 2)], mini);
    expect(m2.traces[q.traceId].beta).toBe(2);
    expect(m2.traces[q.traceId].stabilityDays).toBeCloseTo(0.75);
    const slow = applyAnswers(createLearnerModel(T0), [grade(true, T0 + 1, 9000)], mini);
    expect(slow.traces[q.traceId].stabilityDays).toBeCloseTo(1.5);
    let m = createLearnerModel(T0);
    for (let i = 0; i < 4; i++) m = applyAnswers(m, [grade(false, T0 + 10 + i)], mini);
    expect(m.traces[q.traceId].stabilityDays).toBe(0.2);
  });

  it('moves estimates monotonically', () => {
    let m = createLearnerModel(T0);
    let last = getKanjiMastery(m, mini, q.kanji, T0).overall.mean;
    for (let i = 0; i < 3; i++) {
      m = applyAnswers(m, [grade(true, T0 + 100 + i)], mini);
      const now = getKanjiMastery(m, mini, q.kanji, T0 + 200).overall.mean;
      expect(now).toBeGreaterThan(last);
      last = now;
    }
    for (let i = 0; i < 3; i++) {
      m = applyAnswers(m, [grade(false, T0 + 300 + i)], mini);
      const now = getKanjiMastery(m, mini, q.kanji, T0 + 400).overall.mean;
      expect(now).toBeLessThan(last);
      last = now;
    }
    const est = getKanjiMastery(m, mini, q.kanji, T0 + 400).facets.meaning!;
    expect(est.low).toBeLessThanOrEqual(est.mean);
    expect(est.high).toBeGreaterThanOrEqual(est.mean);
    expect(est.low).toBeGreaterThanOrEqual(0);
    expect(est.high).toBeLessThanOrEqual(1);
  });

  it('forgets: recall drops with time since last seen', () => {
    expect(retrievability(0, 1)).toBe(1);
    expect(retrievability(1, 1)).toBeCloseTo(0.9);
    const m = applyAnswers(createLearnerModel(T0), [grade(true, T0)], mini);
    const soon = getKanjiMastery(m, mini, q.kanji, T0).recallNow;
    const later = getKanjiMastery(m, mini, q.kanji, T0 + 30 * 86_400_000).recallNow;
    expect(later).toBeLessThan(soon);
  });

  it('gives untested kanji the untested stage, and refits ability', () => {
    expect(getKanjiMastery(createLearnerModel(T0), mini, '日', T0).stage).toBe('untested');
    const { model } = runProfile(mini, 'strong_beginner', 1);
    expect(model.ability).toBeGreaterThan(0.5);
    const weak = runProfile(mini, 'component_gap', 1).model;
    expect(weak.ability).toBeLessThan(model.ability);
  });

  it('keeps word answers on word traces only', () => {
    const { model } = runProfile(mini, 'context_gap', 1);
    const wordTraces = Object.values(model.traces).filter((t) => t.itemType === 'word');
    expect(wordTraces.length).toBeGreaterThan(0);
    expect(wordTraces.every((t) => t.facet === 'context' && t.traceId.startsWith('word:'))).toBe(true);
    const w = model.answers.find((a) => a.question.type === 'word_reading')!;
    expect(getKanjiMastery(model, mini, w.question.kanji, T0).facets.context).toBeDefined();
  });

  it('survives a JSON round trip', () => {
    const { model } = runProfile(mini, 'visual_confuser', 2);
    const copy = JSON.parse(JSON.stringify(model));
    expect(copy).toEqual(model);
    const a1 = analyze(model, mini, T0 + 5000);
    const a2 = analyze(copy, mini, T0 + 5000);
    expect(JSON.parse(JSON.stringify(a1))).toEqual(a2);
  });
});

describe('analyze (fixture)', () => {
  detectionSuite(mini, [1, 2, 3]);

  it('fills byFacet, kanjiMap and pattern fields', () => {
    const { analysis } = runProfile(mini, 'visual_confuser', 1);
    expect(analysis.byFacet.map((f) => f.facet)).toEqual(['meaning', 'reading_on', 'reading_kun', 'recognition', 'context']);
    expect(analysis.kanjiMap.map((m) => m.kanji)).toEqual(mini.kanji.slice().sort((a, b) => a.frequencyRank - b.frequencyRank).map((k) => k.id));
    expect(analysis.patterns.length).toBeLessThanOrEqual(6);
    for (const p of analysis.patterns) {
      expect(p.id).toBe(`${p.type}:${p.groupKey}`);
      expect(p.evidence.examples.length).toBeLessThanOrEqual(5);
      expect(p.severity).toBeGreaterThan(0);
    }
    const sev = analysis.patterns.map((p) => p.severity);
    expect(sev).toEqual(sev.slice().sort((a, b) => b - a));
    const knot = analysis.patterns.find((p) => p.type === 'visual_confusion')!;
    expect(knot.title).toMatch(/^Knot: /);
    expect(knot.visual.kind).toBe('confusion_pair');
    expect(knot.recommendation.template).toBe('contrast_pair');
    expect(knot.evidence.confusions).toBeGreaterThanOrEqual(1);
    expect(knot.evidence.opportunities).toBeGreaterThanOrEqual(2);
  });

  it('maps recommendations and visuals per pattern type', () => {
    const fam = runProfile(mini, 'component_gap', 1).analysis.patterns.find((p) => p.type === 'component_family')!;
    expect(fam.recommendation.template).toBe('family_drill');
    expect(fam.visual.kind).toBe('group_bars');
    const kun = runProfile(mini, 'kun_struggler', 1).analysis.patterns.find((p) => p.type === 'reading_kind')!;
    expect(kun.groupKey).toBe('reading_kind:kun');
    expect(kun.recommendation.template).toBe('reading_focus');
    expect(kun.evidence.facts.some((f) => /on'yomi instead/.test(f))).toBe(true);
    const ctx = runProfile(mini, 'context_gap', 1).analysis.patterns.find((p) => p.type === 'context_gap')!;
    expect(ctx.recommendation.template).toBe('context_words');
    expect(ctx.visual.kind).toBe('facet_compare');
  });

  it('restricts to test answers with phase "test" and notes thin evidence', () => {
    const empty = analyze(createLearnerModel(T0), mini, T0);
    expect(empty.answered).toBe(0);
    expect(empty.patterns).toEqual([]);
    expect(empty.notes.length).toBeGreaterThan(0);
    const { model } = runProfile(mini, 'kun_struggler', 1);
    const few = applyAnswers(createLearnerModel(T0), model.answers.slice(0, 12), mini);
    expect(analyze(few, mini, T0).notes.some((n) => /Answer more/.test(n))).toBe(true);
    const testOnly = analyze(model, mini, T0, { phase: 'test' });
    expect(testOnly.answered).toBe(60);
    expect(analyze(model, mini, T0, { phase: 'practice' }).answered).toBe(0);
  });

  it('lists weak kanji with reasons', () => {
    const { analysis } = runProfile(mini, 'component_gap', 1);
    expect(analysis.weakKanji.length).toBeGreaterThan(0);
    for (const w of analysis.weakKanji) {
      expect(w.reasons.length).toBeGreaterThan(0);
      expect(w.mastery.kanji).toBe(w.kanji);
    }
  });
});

describe('createPracticeSet', () => {
  it('builds ~20 items with warm-ups, focus blocks, checks and reasons', () => {
    const { analysis, model } = runProfile(mini, 'visual_confuser', 1);
    const ps = createPracticeSet(analysis, model, mini, { seed: 5, now: T0 + 10 });
    expect(ps.items.length).toBe(20);
    expect(ps.items.slice(0, 2).every((i) => i.reason.code === 'WARMUP')).toBe(true);
    expect(ps.items[ps.items.length - 1].reason.code).toBe('CHECK');
    expect(ps.items.every((i) => i.reason.text.length > 10)).toBe(true);
    expect(ps.items.every((i, n) => i.question.id === `p-5-${n}`)).toBe(true);
    expect(ps.estimatedMinutes).toBeCloseTo((20 * 8) / 60, 1);
    const blockIds = new Set(ps.blocks.flatMap((b) => b.itemIds));
    for (const id of blockIds) expect(ps.items.some((i) => i.question.id === id)).toBe(true);
    const contrast = ps.blocks.find((b) => b.template === 'contrast_pair')!;
    const [a, b] = analysis.patterns[0].kanji;
    const items = contrast.itemIds.map((id) => ps.items.find((i) => i.question.id === id)!.question);
    for (const q of items) {
      const partner = q.kanji === a ? b : a;
      if (analysis.patterns[0].kanji.length === 2) expect(q.options.some((o) => o.fromKanji === partner)).toBe(true);
    }
    expect(createPracticeSet(analysis, model, mini, { seed: 5, now: T0 + 10 })).toEqual(ps);
  });

  it('avoids the same kanji twice in a row outside contrast blocks', () => {
    for (const profile of ['component_gap', 'context_gap', 'kun_struggler', 'strong_beginner'] as const) {
      const { analysis, model } = runProfile(mini, profile, 1);
      const ps = createPracticeSet(analysis, model, mini, { seed: 2 });
      const contrastIds = new Set(ps.blocks.filter((b) => b.template === 'contrast_pair').flatMap((b) => b.itemIds));
      for (let i = 1; i < ps.items.length; i++) {
        const [p, q] = [ps.items[i - 1].question, ps.items[i].question];
        if (contrastIds.has(p.id) && contrastIds.has(q.id)) continue;
        expect(q.kanji === p.kanji, `${profile} at ${i}`).toBe(false);
      }
    }
  });

  it('falls back to a general review when there are no patterns', () => {
    const empty = analyze(createLearnerModel(T0), mini, T0);
    const ps = createPracticeSet(empty, createLearnerModel(T0), mini, { seed: 1, size: 10 });
    expect(ps.items.length).toBeGreaterThan(0);
    expect(ps.blocks[0].template).toBe('weak_kanji_review');
  });

  it('prefers new words for context drills', () => {
    const { analysis, model } = runProfile(mini, 'context_gap', 1);
    const ps = createPracticeSet(analysis, model, mini, { seed: 3 });
    const testWords = new Set(model.answers.map((a) => a.question.wordId).filter(Boolean));
    const focusWords = ps.items.filter((i) => i.reason.code === 'FOCUS').map((i) => i.question.wordId);
    expect(focusWords.some((w) => w && !testWords.has(w))).toBe(true);
  });
});

function ev(deltaPp: number): Evidence {
  return { n: 10, items: 3, observed: 0.5, expected: 0.8, deltaPp, confidence: 0.9, examples: [], facts: [] };
}
describe('compareAnalyses', () => {
  const mk = (accuracy: number, patterns: Array<[string, number]>): Analysis =>
    ({ accuracy, patterns: patterns.map(([id, d]) => ({ id, title: id, evidence: ev(d) })) }) as unknown as Analysis;
  it('assigns statuses', () => {
    const before = mk(0.6, [['a', -30], ['b', -30], ['c', -30], ['d', -30]]);
    const after = mk(0.7, [['a', -20], ['b', -40], ['c', -28], ['e', -25]]);
    const cmp = compareAnalyses(before, after);
    expect(cmp.accuracyBefore).toBe(0.6);
    expect(cmp.accuracyAfter).toBe(0.7);
    const status = Object.fromEntries(cmp.patterns.map((p) => [p.patternId, p.status]));
    expect(status).toEqual({ a: 'improved', b: 'worse', c: 'unchanged', d: 'resolved', e: 'new' });
    expect(cmp.patterns.find((p) => p.patternId === 'd')!.after).toBeNull();
    expect(cmp.patterns.find((p) => p.patternId === 'e')!.before).toBeNull();
  });

  it('shows improvement after simulated practice', () => {
    const { analysis, model } = runProfile(mini, 'kun_struggler', 1);
    const ps = createPracticeSet(analysis, model, mini, { seed: 4, now: T0 + 3_600_000 });
    const graded = gradeAll(ps.items.map((i) => i.question), 'kun_struggler', mini, 1, T0 + 7_200_000, 'practice');
    const after = applyAnswers(model, graded, mini);
    const cmp = compareAnalyses(analyze(after, mini, T0 + 9e6, { phase: 'test' }), analyze(after, mini, T0 + 9e6));
    const kun = cmp.patterns.find((p) => p.patternId === 'reading_kind:reading_kind:kun')!;
    expect(['improved', 'resolved']).toContain(kun.status);
  });
});

describe('simulateAnswers', () => {
  it('exposes the five profiles and is deterministic with rising timestamps', () => {
    expect(simProfiles.map((p) => p.id).sort()).toEqual(['component_gap', 'context_gap', 'kun_struggler', 'strong_beginner', 'visual_confuser']);
    const qs = createTest(mini, { seed: 1 });
    const a = simulateAnswers(qs, 'visual_confuser', mini, { seed: 3, startAt: T0 });
    expect(simulateAnswers(qs, 'visual_confuser', mini, { seed: 3, startAt: T0 })).toEqual(a);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].latencyMs).toBeGreaterThanOrEqual(1500);
      expect(a[i].latencyMs).toBeLessThanOrEqual(7000);
      if (i > 0) expect(a[i].answeredAt).toBeGreaterThan(a[i - 1].answeredAt);
    }
    expect(a[0].answeredAt).toBeGreaterThan(T0);
  });
});

describe.skipIf(n5.kanji.length < 50)('real N5 content', () => {
  blueprintSuite(n5);
  detectionSuite(n5, [1, 2, 3]);
});
