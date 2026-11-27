import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createSeededRng, type Rng } from './index.js';

// Public API (AC3):
//   interface Rng { nextUint32(): number /* integer in [0, 2^32) */; next(): number /* [0, 1) */ }
//   createSeededRng(seed: number): Rng   — seed is an unsigned 32-bit integer

const seed = fc.integer({ min: 0, max: 0xffff_ffff });
const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextUint32());

describe('seeded RNG', () => {
  it('same seed gives the same sequence (property)', () => {
    fc.assert(
      fc.property(seed, fc.integer({ min: 1, max: 64 }), (s, n) => {
        expect(take(createSeededRng(s), n)).toEqual(take(createSeededRng(s), n));
      }),
    );
  });

  it('different seeds diverge within the first 8 values (property)', () => {
    fc.assert(
      fc.property(seed, seed, (a, b) => {
        fc.pre(a !== b);
        expect(take(createSeededRng(a), 8)).not.toEqual(take(createSeededRng(b), 8));
      }),
    );
  });

  it('nextUint32 yields unsigned 32-bit integers (property)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        for (const v of take(createSeededRng(s), 32)) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(0xffff_ffff);
        }
      }),
    );
  });

  it('next yields floats in [0, 1) and is deterministic (property)', () => {
    fc.assert(
      fc.property(seed, (s) => {
        const a = createSeededRng(s);
        const b = createSeededRng(s);
        for (let i = 0; i < 32; i++) {
          const v = a.next();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
          expect(b.next()).toBe(v);
        }
      }),
    );
  });

  it('a sequence is not constant', () => {
    expect(new Set(take(createSeededRng(42), 16)).size).toBeGreaterThan(1);
  });
});
