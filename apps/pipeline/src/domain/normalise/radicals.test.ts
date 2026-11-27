import { describe, expect, it } from 'vitest';
import { radicalNumber } from './radicals.ts';
import { RADICAL_VARIANTS } from './radical-variants.ts';

// Only the mappings the WP and spec state (W01-4 AC 4; arch §3.3 gives 氵 → 85).
const STATED: Array<[string, number]> = [
  ['氵', 85],
  ['亻', 9],
  ['扌', 64],
  ['忄', 61],
  ['艹', 140],
  ['辶', 162],
];

describe('radical variants (AC 4)', () => {
  it.each(STATED)('maps %s to Kangxi %i', (form, kangxi) => {
    expect(radicalNumber(form)).toEqual({ kind: 'ok', kangxi });
  });

  it.each(STATED)('the checked-in table holds %s → %i', (form, kangxi) => {
    expect(RADICAL_VARIANTS[form]).toBe(kangxi);
  });

  it('every table entry is a Kangxi number 1-214', () => {
    for (const n of Object.values(RADICAL_VARIANTS)) {
      if (typeof n !== 'number') continue;
      expect(Number.isInteger(n) && n >= 1 && n <= 214).toBe(true);
    }
  });

  it('阝 on the left maps to 170 阜', () => {
    expect(radicalNumber('阝', 'left')).toEqual({ kind: 'ok', kangxi: 170 });
  });

  it('阝 on the right maps to 163 邑', () => {
    expect(radicalNumber('阝', 'right')).toEqual({ kind: 'ok', kangxi: 163 });
  });

  it('阝 without a position is ambiguous, not an exception', () => {
    const r = radicalNumber('阝');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect([...r.candidates].sort((a, b) => a - b)).toEqual([163, 170]);
  });

  it('an unknown form returns an unknown result without throwing', () => {
    expect(radicalNumber('A')).toEqual({ kind: 'unknown' });
  });
});
