// Shared test suites, run against the local fixture and (when present) the real N5 set.
import { expect, it } from 'vitest';
import type { ContentSet } from '@kizuna/content';
import type { Question, SimProfileId } from '../contracts';
import { getIndex, primaryReading, readingsOf, fullKana, meaningsOverlap } from '../contentIndex';
import { createPracticeSet, createTest, simProfiles } from '../index';
import { EXPECTED_PATTERN, T0, runProfile } from './pipeline';

/** Labels that would be accepted answers for the question (besides the correct option). */
function acceptedLabels(content: ContentSet, q: Question): Set<string> {
  const ix = getIndex(content);
  const k = ix.kanji.get(q.kanji)!;
  const out = new Set<string>();
  if (q.type === 'reading_on') for (const r of readingsOf(k, 'on')) out.add(r.kana);
  if (q.type === 'reading_kun') for (const r of readingsOf(k, 'kun')) {
    out.add(fullKana(r));
    out.add(r.kana);
  }
  return out;
}

export function blueprintSuite(content: ContentSet): void {
  const ix = getIndex(content);
  const seeds = [1, 2, 3];

  it('builds 60 questions with unique, stable IDs', () => {
    for (const seed of seeds) {
      const qs = createTest(content, { seed });
      expect(qs).toHaveLength(60);
      expect(new Set(qs.map((q) => q.id)).size).toBe(60);
      qs.forEach((q, i) => expect(q.id).toBe(`t-${i}-${q.type}-${q.kanji}`));
      expect(createTest(content, { seed })).toEqual(qs);
    }
  });

  it('follows the question mix', () => {
    const qs = createTest(content, { seed: 1 });
    const count = (t: string) => qs.filter((q) => q.type === t).length;
    expect(count('meaning')).toBe(16);
    expect(count('reading_on')).toBe(12);
    expect(count('reading_kun')).toBe(10);
    expect(count('recognition')).toBe(12);
    expect(count('word_reading')).toBe(10);
  });

  it('has 4 options, exactly one correct, no duplicate labels, no accepted-answer distractors', () => {
    for (const seed of seeds) {
      for (const q of createTest(content, { seed })) {
        expect(q.options).toHaveLength(4);
        expect(q.options.filter((o) => o.correct)).toHaveLength(1);
        expect(new Set(q.options.map((o) => o.label)).size).toBe(4);
        expect(new Set(q.options.map((o) => o.id)).size).toBe(4);
        const accepted = acceptedLabels(content, q);
        for (const o of q.options.filter((x) => !x.correct)) {
          expect(accepted.has(o.label), `${q.id}: ${o.label}`).toBe(false);
          if ((q.type === 'meaning' || q.type === 'recognition') && o.fromKanji) {
            expect(meaningsOverlap(ix.kanji.get(q.kanji)!, ix.kanji.get(o.fromKanji)!)).toBe(false);
          }
        }
        const correct = q.options.find((o) => o.correct)!;
        if (q.type === 'reading_on') expect(correct.label).toBe(primaryReading(ix.kanji.get(q.kanji), 'on')!.kana);
        if (q.type === 'word_reading') expect(correct.label).toBe(ix.words.get(q.wordId!)!.kana);
        expect(q.tags).toContain(`kanji:${q.kanji}`);
        expect(q.tags.some((t) => t.startsWith('facet:'))).toBe(true);
        expect(Number.isFinite(q.difficulty)).toBe(true);
      }
    }
  });

  it('covers visual pairs with the partner on the card', () => {
    for (const seed of seeds) {
      const qs = createTest(content, { seed });
      const visual = content.relations.filter((r) => r.kind === 'visual');
      const opp = (a: string, b: string) => qs.filter((q) => q.kanji === a && q.options.some((o) => o.fromKanji === b)).length;
      const covered = visual.filter((r) => opp(r.a, r.b) + opp(r.b, r.a) >= 1);
      expect(covered.length / visual.length).toBeGreaterThanOrEqual(0.85);
      const twice = visual.filter((r) => opp(r.a, r.b) + opp(r.b, r.a) >= 2);
      expect(twice.length / visual.length).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('covers 2–3 component families with ≥ 3 members and ≥ 4 questions each', () => {
    for (const seed of seeds) {
      const qs = createTest(content, { seed }).filter((q) => q.type !== 'word_reading');
      const fams = ix.rankedFamilies.filter((f) => {
        const asked = qs.filter((q) => f.members.includes(q.kanji));
        return asked.length >= 4 && new Set(asked.map((q) => q.kanji)).size >= 3;
      });
      expect(fams.length).toBeGreaterThanOrEqual(2);
      // The simulator's target family is always well covered.
      const top = ix.rankedFamilies[0];
      expect(qs.filter((q) => top.members.includes(q.kanji)).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('asks both on and kun for at least 8 kanji, and words only for kanji tested alone', () => {
    for (const seed of seeds) {
      const qs = createTest(content, { seed });
      const on = new Set(qs.filter((q) => q.type === 'reading_on').map((q) => q.kanji));
      const kun = new Set(qs.filter((q) => q.type === 'reading_kun').map((q) => q.kanji));
      expect([...on].filter((k) => kun.has(k)).length).toBeGreaterThanOrEqual(8);
      const alone = new Set(qs.filter((q) => q.type !== 'word_reading').map((q) => q.kanji));
      for (const q of qs.filter((x) => x.type === 'word_reading')) {
        expect(alone.has(q.kanji)).toBe(true);
        expect(q.subPrompt).toBeTruthy();
      }
    }
  });
}

export function detectionSuite(content: ContentSet, seeds: number[]): void {
  for (const profile of Object.keys(EXPECTED_PATTERN) as Array<keyof typeof EXPECTED_PATTERN>) {
    it(`finds ${EXPECTED_PATTERN[profile]} for ${profile} in the top 3 (confidence ≥ 0.8)`, () => {
      for (const seed of seeds) {
        const { analysis } = runProfile(content, profile, seed);
        const top = analysis.patterns.slice(0, 3);
        const hit = top.find((p) => p.type === EXPECTED_PATTERN[profile]);
        expect(hit, `${profile} seed ${seed}: ${top.map((p) => p.id).join(', ')}`).toBeDefined();
        expect(hit!.confidence).toBeGreaterThanOrEqual(0.8);
        expect(hit!.evidence.examples.length).toBeGreaterThan(0);
        expect(hit!.evidence.facts.length).toBeGreaterThanOrEqual(2);
        expect(hit!.evidence.facts.length).toBeLessThanOrEqual(4);
        expect(hit!.reason).toMatch(/\d/);
      }
    });
  }

  it('finds no confident pattern for the strong beginner', () => {
    for (const seed of seeds) {
      const { analysis } = runProfile(content, 'strong_beginner', seed);
      const confident = analysis.patterns.filter((p) => p.confidence >= 0.9);
      expect(confident.map((p) => p.id), `seed ${seed}`).toEqual([]);
    }
  });

  it('targets the top pattern kanji in the practice set', () => {
    for (const profile of simProfiles.map((p) => p.id as SimProfileId).filter((p) => p !== 'strong_beginner')) {
      const { analysis, model } = runProfile(content, profile, seeds[0]);
      const top = analysis.patterns[0];
      const ps = createPracticeSet(analysis, model, content, { seed: 9, now: T0 + 3_600_000 });
      const focus = ps.items.filter((i) => i.reason.patternId === top.id && i.reason.code === 'FOCUS');
      expect(focus.length, profile).toBeGreaterThanOrEqual(4);
      const comp = top.groupKey.replace(/^component:/, '');
      const touches = (k: string) =>
        top.type === 'component_family' ? (getIndex(content).componentsOf.get(k) ?? []).includes(comp) : top.kanji.includes(k);
      const onTarget = focus.filter((i) => touches(i.question.kanji)).length;
      expect(onTarget / focus.length, profile).toBeGreaterThanOrEqual(0.75);
      if (top.type === 'reading_kind') {
        const t = top.groupKey.endsWith(':kun') ? 'reading_kun' : 'reading_on';
        expect(focus.filter((i) => i.question.type === t).length).toBeGreaterThanOrEqual(focus.length / 2 - 1);
      }
    }
  });
}
