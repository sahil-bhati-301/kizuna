import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFakeClock, createSeededRng, isUuidV7, type Rng } from './index.js';
import { COUNTER_MAX, MAX_MS, createIdGeneratorFromState } from './ids.js';

// Review follow-up for W00-5: clock rollback, counter overflow and range checks.
// The frozen spec tests stay in ids.test.ts; these use the internal seam in ids.ts.

const timestampOf = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 12), 16);
const fromState = (startMs: number, state: { lastMs: number; counter: number }, rng?: Rng) => {
  const clock = createFakeClock(new Date(startMs));
  const newId = createIdGeneratorFromState({ clock, rng: rng ?? createSeededRng(1) }, state);
  return { clock, newId };
};
const fresh = (startMs: number, seed: number) =>
  fromState(startMs, { lastMs: -1, counter: 0 }, createSeededRng(seed));

describe('UUIDv7 edge cases', () => {
  it('stays strictly increasing when the clock goes backwards, reusing the last timestamp (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: MAX_MS - 1_000_000 }),
        fc.integer({ min: 0, max: 0xffff_ffff }),
        fc.array(fc.integer({ min: -5, max: 5 }), { minLength: 2, maxLength: 200 }),
        (startMs, seed, deltas) => {
          const { clock, newId } = fresh(startMs, seed);
          let maxSeen = -1;
          let prev = '';
          for (const d of deltas) {
            clock.advance(d);
            maxSeen = Math.max(maxSeen, clock.now().getTime());
            const id = newId();
            expect(isUuidV7(id)).toBe(true);
            expect(timestampOf(id)).toBe(maxSeen);
            expect(prev < id).toBe(true);
            prev = id;
          }
        },
      ),
    );
  });

  it('bumps the timestamp by 1 ms when the counter overflows', () => {
    const t = Date.UTC(2026, 0, 1);
    const { newId } = fromState(t, { lastMs: t, counter: COUNTER_MAX - 1 });
    const a = newId(); // counter reaches COUNTER_MAX
    const b = newId(); // overflow: timestamp t + 1, fresh counter
    expect(timestampOf(a)).toBe(t);
    expect(a.slice(14, 23)).toBe('7fff-bfff');
    expect(timestampOf(b)).toBe(t + 1);
    expect(isUuidV7(b)).toBe(true);
    expect(a < b).toBe(true);
  });

  it('a fresh counter has its top bit clear, even when the RNG returns all ones', () => {
    const ones: Rng = { nextUint32: () => 0xffff_ffff, next: () => 1 - 2 ** -32 };
    const { newId } = fromState(0, { lastMs: -1, counter: 0 }, ones);
    expect(newId()).toBe('00000000-0000-77ff-bfff-ffffffffffff');
  });

  it('throws when the counter overflows at the largest timestamp', () => {
    const { newId } = fromState(MAX_MS, { lastMs: MAX_MS, counter: COUNTER_MAX });
    expect(() => newId()).toThrow(RangeError);
  });

  it('throws when the clock is outside the 48-bit range', () => {
    expect(() => fresh(-1, 1).newId()).toThrow(RangeError);
    expect(() => fresh(MAX_MS + 1, 1).newId()).toThrow(RangeError);
  });
});
