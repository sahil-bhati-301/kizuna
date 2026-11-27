import { describe, expect, it } from 'vitest';
import { nfc } from './nfc.ts';

// fast-check is not a dependency of @kizuna/pipeline, so properties run over a
// seeded, deterministic generator instead (domain/ lint bans Math.random here too).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

// Code points that exercise composition: kana, voicing marks (combining and
// spacing), Latin with combining accents, Hangul jamo, CJK compatibility ideographs.
const POOL = [
  0x304b, 0x30cf, 0x3099, 0x309a, 0x309b, 0x309c, 0x0065, 0x0301, 0x0308, 0x00e9, 0x1100, 0x1161,
  0x11a8, 0xac00, 0xf900, 0xf91d, 0x6c34, 0x6c35, 0xff76, 0xff9e, 0x0041,
];

function randomString(next: () => number): string {
  const len = next() % 12;
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCodePoint(POOL[next() % POOL.length]!);
  return out;
}

describe('nfc (AC 1)', () => {
  it('composes a decomposed voiced kana', () => {
    expect(nfc('が')).toBe('が');
    expect(nfc('パ')).toBe('パ');
  });

  it('maps a CJK compatibility ideograph to its canonical form', () => {
    expect(nfc('豈')).toBe('豈');
  });

  it('leaves already-NFC text unchanged', () => {
    expect(nfc('食べる')).toBe('食べる');
    expect(nfc('')).toBe('');
  });

  it('property: output equals Unicode NFC and nfc is idempotent', () => {
    const next = lcg(0x4b1d);
    for (let i = 0; i < 2000; i++) {
      const s = randomString(next);
      const once = nfc(s);
      expect(once).toBe(s.normalize('NFC'));
      expect(nfc(once)).toBe(once);
    }
  });
});
