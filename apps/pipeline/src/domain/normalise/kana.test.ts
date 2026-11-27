import { describe, expect, it } from 'vitest';
import { KANA_EXCEPTIONS, toHiragana, toKatakana } from './kana.ts';

// Unicode kana blocks: Hiragana, Katakana, Katakana Phonetic Extensions.
const BLOCKS: Array<[number, number]> = [
  [0x3040, 0x309f],
  [0x30a0, 0x30ff],
  [0x31f0, 0x31ff],
];
const ASSIGNED = /\p{Assigned}/u;
const HIRAGANA_BLOCK = (cp: number) => cp >= 0x3040 && cp <= 0x309f;
const KATAKANA_BLOCKS = (cp: number) =>
  (cp >= 0x30a0 && cp <= 0x30ff) || (cp >= 0x31f0 && cp <= 0x31ff);

function kanaIn(test: (cp: number) => boolean): string[] {
  const out: string[] = [];
  for (const [lo, hi] of BLOCKS)
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      if (test(cp) && ASSIGNED.test(ch)) out.push(ch);
    }
  return out;
}

const exceptionChars = new Set(KANA_EXCEPTIONS.map((e) => e.char));

describe('kana conversion (AC 2)', () => {
  it('converts on/kun examples between scripts', () => {
    expect(toHiragana('ショク')).toBe('しょく');
    expect(toKatakana('しょく')).toBe('ショク');
    expect(toHiragana('ガッコウ')).toBe('がっこう');
  });

  it('passes non-kana text through unchanged', () => {
    expect(toHiragana('食べる')).toBe('食べる');
    expect(toKatakana('食A1')).toBe('食A1');
  });

  it('lists ヴ, ヵ and ヶ in the exception set', () => {
    for (const ch of ['ヴ', 'ヵ', 'ヶ']) expect(exceptionChars.has(ch)).toBe(true);
  });

  it('documents the handling of every exception and lists only kana-block characters', () => {
    for (const e of KANA_EXCEPTIONS) {
      expect([...e.char]).toHaveLength(1);
      const cp = e.char.codePointAt(0)!;
      expect(HIRAGANA_BLOCK(cp) || KATAKANA_BLOCKS(cp)).toBe(true);
      expect(typeof e.handling).toBe('string');
      expect(e.handling.trim().length).toBeGreaterThan(0);
    }
  });

  it('converts each exception deterministically without throwing', () => {
    for (const { char } of KANA_EXCEPTIONS) {
      expect(toHiragana(char)).toBe(toHiragana(char));
      expect(toKatakana(char)).toBe(toKatakana(char));
    }
  });

  it('property: every non-exception katakana round-trips through hiragana', () => {
    for (const k of kanaIn(KATAKANA_BLOCKS)) {
      if (exceptionChars.has(k)) continue;
      const h = toHiragana(k);
      expect([...h], `toHiragana(${k})`).toHaveLength(1);
      expect(HIRAGANA_BLOCK(h.codePointAt(0)!), `toHiragana(${k}) = ${h}`).toBe(true);
      expect(toKatakana(h), `round-trip ${k}`).toBe(k);
    }
  });

  it('property: every non-exception hiragana round-trips through katakana', () => {
    for (const h of kanaIn(HIRAGANA_BLOCK)) {
      if (exceptionChars.has(h)) continue;
      const k = toKatakana(h);
      expect([...k], `toKatakana(${h})`).toHaveLength(1);
      expect(KATAKANA_BLOCKS(k.codePointAt(0)!), `toKatakana(${h}) = ${k}`).toBe(true);
      expect(toHiragana(k), `round-trip ${h}`).toBe(h);
    }
  });

  it('property: whole non-exception strings round-trip', () => {
    const pool = kanaIn(KATAKANA_BLOCKS).filter((k) => !exceptionChars.has(k));
    let s = 7;
    for (let i = 0; i < 500; i++) {
      let str = '';
      for (let j = 0; j < 1 + (i % 8); j++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        str += pool[s % pool.length];
      }
      expect(toKatakana(toHiragana(str))).toBe(str);
    }
  });
});
