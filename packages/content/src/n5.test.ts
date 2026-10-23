import { describe, expect, it } from 'vitest';
import { n5 } from './index';
import type { Kanji, Reading } from './types';

const HIRAGANA = /^[ぁ-ゖ]+$/u;
const KANJI_CHAR = /\p{Script=Han}/u;

/**
 * Kanji that may appear in no word. Keep this empty unless a kanji truly has no common
 * N5 word; add a comment explaining why for each entry.
 */
const NO_WORD_ALLOWED = new Set<string>([]);

/**
 * Primary readings with no word in the set yet (beginner words for them need kanji outside
 * the set, e.g. 行 こう in 銀行). Kept explicit so new gaps are noticed.
 */
const PRIMARY_WITHOUT_WORD: string[] = [
  '行:on:こう', // 銀行, 旅行
  '安:on:あん', // 安心, 安全
  '目:on:もく', // 目的, 科目
  '白:on:はく', // 白鳥, 白紙
  '買:on:ばい', // 売買
  '耳:on:じ', // 耳鼻科
];

const kanjiById = new Map(n5.kanji.map((k) => [k.id, k]));
const componentById = new Map(n5.components.map((c) => [c.id, c]));
const allReadings: Reading[] = n5.kanji.flatMap((k) => k.readings);
const readingById = new Map(allReadings.map((r) => [r.id, r]));

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const dups = new Set<T>();
  for (const v of values) (seen.has(v) ? dups : seen).add(v);
  return [...dups];
}

describe('n5 content set', () => {
  it('has the expected label, version and size', () => {
    expect(n5.level).toBe('N5');
    expect(n5.version).toBe('0.1.0');
    expect(n5.kanji.length).toBeGreaterThanOrEqual(95);
    expect(n5.words.length).toBeGreaterThanOrEqual(120);
    expect(n5.relations.filter((r) => r.kind === 'visual').length).toBeGreaterThanOrEqual(15);
    expect(n5.relations.filter((r) => r.kind === 'semantic').length).toBeGreaterThanOrEqual(15);
  });

  describe('IDs', () => {
    it('kanji IDs are unique single kanji characters', () => {
      expect(duplicates(n5.kanji.map((k) => k.id))).toEqual([]);
      for (const k of n5.kanji) {
        expect([...k.id].length, k.id).toBe(1);
        expect(KANJI_CHAR.test(k.id), k.id).toBe(true);
      }
    });
    it('component IDs are unique', () => {
      expect(duplicates(n5.components.map((c) => c.id))).toEqual([]);
    });
    it('word IDs are unique and equal the written form', () => {
      expect(duplicates(n5.words.map((w) => w.id))).toEqual([]);
      for (const w of n5.words) expect(w.id).toBe(w.text);
    });
    it('reading IDs are unique', () => {
      expect(duplicates(allReadings.map((r) => r.id))).toEqual([]);
    });
  });

  describe('kanji', () => {
    it('reading IDs follow `${kanji}:${kind}:${kana}[.okurigana]`', () => {
      for (const r of allReadings) {
        const expected = `${r.kanji}:${r.kind}:${r.kana}${r.okurigana ? `.${r.okurigana}` : ''}`;
        expect(r.id).toBe(expected);
      }
    });

    it("every reading's kanji matches its parent", () => {
      for (const k of n5.kanji) for (const r of k.readings) expect(r.kanji, r.id).toBe(k.id);
    });

    it('reading kana and okurigana are hiragana only', () => {
      for (const r of allReadings) {
        expect(HIRAGANA.test(r.kana), r.id).toBe(true);
        if (r.okurigana !== '') expect(HIRAGANA.test(r.okurigana), r.id).toBe(true);
      }
    });

    it('has exactly one primary reading per kind present, and at least one reading', () => {
      for (const k of n5.kanji) {
        expect(k.readings.length, k.id).toBeGreaterThan(0);
        for (const kind of ['on', 'kun'] as const) {
          const ofKind = k.readings.filter((r) => r.kind === kind);
          if (ofKind.length === 0) continue;
          expect(ofKind.filter((r) => r.primary).length, `${k.id} ${kind}`).toBe(1);
        }
      }
    });

    it('radical and every part component exist; parts are not repeated', () => {
      for (const k of n5.kanji) {
        expect(componentById.has(k.radical), `${k.id} radical ${k.radical}`).toBe(true);
        expect(k.parts.length, k.id).toBeGreaterThan(0);
        for (const p of k.parts) expect(componentById.has(p.component), `${k.id} part ${p.component}`).toBe(true);
        expect(duplicates(k.parts.map((p) => p.component)), k.id).toEqual([]);
      }
    });

    it('single-part kanji list themselves with position "whole"', () => {
      for (const k of n5.kanji) {
        const whole = k.parts.filter((p) => p.position === 'whole');
        if (whole.length > 0) {
          expect(k.parts.length, k.id).toBe(1);
          expect(whole[0].component, k.id).toBe(k.id);
        }
      }
    });

    it('frequencyRank is unique and covers 1..N', () => {
      const ranks = n5.kanji.map((k) => k.frequencyRank).sort((a, b) => a - b);
      expect(ranks).toEqual(n5.kanji.map((_, i) => i + 1));
    });

    it('strokes are positive integers', () => {
      for (const k of n5.kanji) {
        expect(Number.isInteger(k.strokes) && k.strokes > 0, k.id).toBe(true);
      }
    });

    it('meanings are lowercase and include every keyword word', () => {
      for (const k of n5.kanji) {
        expect(k.keyword, k.id).toBe(k.keyword.toLowerCase());
        for (const m of k.meanings) expect(m, k.id).toBe(m.toLowerCase());
        for (const word of k.keyword.split(',').map((s) => s.trim())) {
          expect(k.meanings, k.id).toContain(word);
        }
        expect(duplicates(k.meanings), k.id).toEqual([]);
      }
    });

    it('the 40 most frequent kanji have a mnemonic', () => {
      const top = [...n5.kanji].sort((a, b) => a.frequencyRank - b.frequencyRank).slice(0, 40);
      for (const k of top) expect(k.mnemonic?.trim(), k.id).toBeTruthy();
    });
  });

  describe('components', () => {
    it('isKanji is true exactly for kanji in this set', () => {
      for (const c of n5.components) expect(c.isKanji, c.id).toBe(kanjiById.has(c.id));
    });

    it('every component is used by some kanji (as a part or radical)', () => {
      const used = new Set(n5.kanji.flatMap((k) => [k.radical, ...k.parts.map((p) => p.component)]));
      for (const c of n5.components) expect(used.has(c.id), c.id).toBe(true);
    });

    it('several component families have 3 or more members', () => {
      const families = new Map<string, Set<string>>();
      for (const k of n5.kanji) {
        for (const p of k.parts) {
          if (!families.has(p.component)) families.set(p.component, new Set());
          families.get(p.component)!.add(k.id);
        }
      }
      const big = [...families].filter(([, members]) => members.size >= 3).map(([id]) => id);
      expect(big.length).toBeGreaterThanOrEqual(8);
      for (const id of ['口', '日', '木', '言', '亻']) expect(big, id).toContain(id);
    });
  });

  describe('words', () => {
    it('text is made of kanji and hiragana only; kana is hiragana', () => {
      for (const w of n5.words) {
        for (const ch of w.text) expect(KANJI_CHAR.test(ch) || HIRAGANA.test(ch), `${w.id}: ${ch}`).toBe(true);
        expect(HIRAGANA.test(w.kana), w.id).toBe(true);
        expect(w.meaning.trim(), w.id).not.toBe('');
      }
    });

    it("parts' kanji equal the kanji characters of text, in order", () => {
      for (const w of n5.words) {
        const chars = [...w.text].filter((ch) => KANJI_CHAR.test(ch));
        expect(w.parts.map((p) => p.kanji), w.id).toEqual(chars);
        for (const p of w.parts) expect(kanjiById.has(p.kanji), `${w.id}: ${p.kanji}`).toBe(true);
      }
    });

    it('every readingId exists and belongs to its kanji', () => {
      for (const w of n5.words) {
        for (const p of w.parts) {
          if (p.readingId === null) continue;
          const r = readingById.get(p.readingId);
          expect(r, `${w.id}: ${p.readingId}`).toBeDefined();
          expect(r!.kanji, `${w.id}: ${p.readingId}`).toBe(p.kanji);
        }
      }
    });

    it('phenomena are consistent with readingId and surface', () => {
      for (const w of n5.words) {
        for (const p of w.parts) {
          const label = `${w.id}: ${p.kanji}`;
          expect(HIRAGANA.test(p.surface), label).toBe(true);
          if (p.phenomenon === 'special') {
            expect(p.readingId, label).toBeNull();
          } else {
            expect(p.readingId, label).not.toBeNull();
            const r = readingById.get(p.readingId!)!;
            if (p.phenomenon === 'regular') expect(p.surface, label).toBe(r.kana);
            else expect(p.surface, label).not.toBe(r.kana);
          }
        }
      }
    });

    it('surfaces plus the kana of text, in text order, spell word.kana', () => {
      for (const w of n5.words) {
        let i = 0;
        let spelled = '';
        for (const ch of w.text) spelled += KANJI_CHAR.test(ch) ? w.parts[i++].surface : ch;
        expect(spelled, w.id).toBe(w.kana);
      }
    });

    it('every kanji appears in at least one word', () => {
      const used = new Set(n5.words.flatMap((w) => w.parts.map((p) => p.kanji)));
      const missing = n5.kanji.map((k: Kanji) => k.id).filter((id) => !used.has(id) && !NO_WORD_ALLOWED.has(id));
      expect(missing).toEqual([]);
    });

    it('every primary reading is used by at least one word', () => {
      const usedReadings = new Set(n5.words.flatMap((w) => w.parts.map((p) => p.readingId)));
      const unused = allReadings.filter((r) => r.primary && !usedReadings.has(r.id)).map((r) => r.id);
      expect(unused).toEqual(PRIMARY_WITHOUT_WORD);
    });
  });

  describe('relations', () => {
    it('reference existing kanji, with no self-relations', () => {
      for (const r of n5.relations) {
        expect(kanjiById.has(r.a), r.a).toBe(true);
        expect(kanjiById.has(r.b), r.b).toBe(true);
        expect(r.a, `${r.a}/${r.b}`).not.toBe(r.b);
      }
    });

    it('have no duplicates (undirected, per kind)', () => {
      const keys = n5.relations.map((r) => `${r.kind}:${[r.a, r.b].sort().join('/')}`);
      expect(duplicates(keys)).toEqual([]);
    });

    it('have a strength in (0, 1] and a note', () => {
      for (const r of n5.relations) {
        expect(r.strength > 0 && r.strength <= 1, `${r.a}/${r.b}`).toBe(true);
        expect(r.note.trim(), `${r.a}/${r.b}`).not.toBe('');
      }
    });
  });
});

