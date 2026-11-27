import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFakeClock, createIdGenerator, createSeededRng, isUuidV7 } from './index.js';

// Public API (AC1, AC6):
//   createIdGenerator(deps: { clock: Clock; rng: Rng }): () => string
//     returns lowercase canonical UUIDv7 strings (RFC 9562): 48-bit unix-ms timestamp from
//     clock.now(), version 7, variant 0b10, remaining bits from rng; IDs from one generator are
//     strictly increasing even within the same millisecond (monotonic counter or equivalent).
//   isUuidV7(value: string): boolean

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const timestampOf = (id: string) => parseInt(id.replace(/-/g, '').slice(0, 12), 16);
const MAX_MS = 2 ** 48 - 1;

const generator = (startMs: number, seed = 1) => {
  const clock = createFakeClock(new Date(startMs));
  return { clock, newId: createIdGenerator({ clock, rng: createSeededRng(seed) }) };
};

describe('UUIDv7 IDs', () => {
  it('has the canonical layout with version 7 and variant 10', () => {
    const { newId } = generator(Date.UTC(2026, 0, 1));
    const id = newId();
    expect(id).toMatch(UUID_V7);
    const bytes = id.replace(/-/g, '');
    expect(parseInt(bytes[12]!, 16) >> 0).toBe(7); // version nibble (byte 6 high)
    expect(parseInt(bytes[16]!, 16) >> 2).toBe(0b10); // variant bits (byte 8 top two)
  });

  it('encodes the clock time in the first 48 bits (RFC 9562 example timestamp)', () => {
    // 1645557742000 ms = 0x017F22E279B0
    const { newId } = generator(1_645_557_742_000);
    expect(newId().startsWith('017f22e2-79b0-7')).toBe(true);
  });

  it('isUuidV7 accepts v7 and rejects other versions and variants', () => {
    expect(isUuidV7('017f22e2-79b0-7cc3-98c4-dc0c0c07398f')).toBe(true);
    expect(isUuidV7('017f22e2-79b0-4cc3-98c4-dc0c0c07398f')).toBe(false); // v4
    expect(isUuidV7('017f22e2-79b0-7cc3-08c4-dc0c0c07398f')).toBe(false); // bad variant
    expect(isUuidV7('017F22E2-79B0-7CC3-98C4-DC0C0C07398F')).toBe(false); // not canonical lowercase
    expect(isUuidV7('not-a-uuid')).toBe(false);
  });

  it('uses the injected clock, not the wall clock', () => {
    const { clock, newId } = generator(0);
    expect(timestampOf(newId())).toBe(0);
    clock.advance(1234);
    expect(timestampOf(newId())).toBe(1234);
  });

  it('is deterministic for the same clock and seed', () => {
    const a = generator(Date.UTC(2026, 0, 1), 7);
    const b = generator(Date.UTC(2026, 0, 1), 7);
    expect([a.newId(), a.newId(), a.newId()]).toEqual([b.newId(), b.newId(), b.newId()]);
  });

  it('different seeds give different IDs at the same instant', () => {
    expect(generator(Date.UTC(2026, 0, 1), 1).newId()).not.toBe(
      generator(Date.UTC(2026, 0, 1), 2).newId(),
    );
  });

  it('IDs generated in order sort in order, including within one millisecond (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MS - 1_000_000 }),
        fc.integer({ min: 0, max: 0xffff_ffff }),
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 2, maxLength: 200 }),
        (startMs, seed, deltas) => {
          const { clock, newId } = generator(startMs, seed);
          const ids: string[] = [];
          for (const d of deltas) {
            clock.advance(d);
            ids.push(newId());
          }
          for (const id of ids) expect(id).toMatch(UUID_V7);
          for (let i = 1; i < ids.length; i++) expect(ids[i - 1]! < ids[i]!).toBe(true);
        },
      ),
    );
  });

  it('timestamp field tracks the clock (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_MS }), (ms) => {
        const { newId } = generator(ms);
        expect(timestampOf(newId())).toBe(ms);
      }),
    );
  });
});
