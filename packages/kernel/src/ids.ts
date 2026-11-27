import type { Clock } from './clock.js';
import type { Rng } from './rng.js';

export const MAX_MS = 2 ** 48 - 1;
export const COUNTER_MAX = 2 ** 42 - 1;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const hex = (value: number, width: number) => value.toString(16).padStart(width, '0');

/**
 * Returns a function that makes lowercase canonical UUIDv7 strings (RFC 9562, section 5.7).
 *
 * Layout: 48-bit unix-ms timestamp from `clock`, version 7, a 42-bit counter in rand_a and the
 * top 30 bits of rand_b (RFC 9562 section 6.2, method 1), variant 0b10, then 32 random bits.
 * The counter starts at a random value with its top bit clear (rollover guard) on each new
 * millisecond and is incremented within the same millisecond, so IDs from one generator are
 * strictly increasing. If the clock goes backwards, the last timestamp is reused; if the
 * counter overflows, the timestamp is bumped by 1 ms.
 */
export function createIdGenerator(deps: { clock: Clock; rng: Rng }): () => string {
  return createIdGeneratorFromState(deps, { lastMs: -1, counter: 0 });
}

/** Internal and test-only seam (not exported from index.ts): start from a given state. */
export function createIdGeneratorFromState(
  deps: { clock: Clock; rng: Rng },
  start: { lastMs: number; counter: number },
): () => string {
  const { clock, rng } = deps;
  let { lastMs, counter } = start;

  const freshCounter = () => (rng.nextUint32() & 0x1ff) * 2 ** 32 + rng.nextUint32();

  return () => {
    const nowMs = clock.now().getTime();
    if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_MS) {
      throw new RangeError(`clock time is outside the UUIDv7 range: ${nowMs}`);
    }
    if (nowMs > lastMs) {
      lastMs = nowMs;
      counter = freshCounter();
    } else if (counter < COUNTER_MAX) {
      counter += 1;
    } else {
      if (lastMs >= MAX_MS) throw new RangeError('UUIDv7 timestamp overflow');
      lastMs += 1;
      counter = freshCounter();
    }

    const randA = Math.floor(counter / 2 ** 30); // counter bits 41..30
    const varPart = 0x8000 | (Math.floor(counter / 2 ** 16) & 0x3fff); // 0b10 + bits 29..16
    const low16 = counter % 2 ** 16; // bits 15..0
    const ts = hex(lastMs, 12);
    return [
      ts.slice(0, 8),
      ts.slice(8),
      hex(0x7000 | randA, 4),
      hex(varPart, 4),
      hex(low16, 4) + hex(rng.nextUint32(), 8),
    ].join('-');
  };
}

/** True for a lowercase canonical UUID with version 7 and variant 0b10. */
export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}
