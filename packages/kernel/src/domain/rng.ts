/** A source of pseudo-random numbers. Inject it; never use the global RNG. */
export interface Rng {
  /** An integer in [0, 2^32). */
  nextUint32(): number;
  /** A float in [0, 1). */
  next(): number;
}

const UINT32_RANGE = 2 ** 32;

/** splitmix32 step: a bijective mix used only to spread a 32-bit seed over the sfc32 state. */
function splitmix32(state: number): { state: number; value: number } {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z ^= z >>> 15;
  return { state: next, value: z >>> 0 };
}

/**
 * A deterministic RNG: sfc32 (Chris Doty-Humphrey's Small Fast Counting generator, 128-bit state),
 * seeded from an unsigned 32-bit integer through splitmix32. The same seed always gives the same
 * sequence. Not cryptographically secure.
 */
export function createSeededRng(seed: number): Rng {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`seed must be an unsigned 32-bit integer: ${seed}`);
  }
  let s = seed | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = splitmix32(s);
    s = r.state;
    words.push(r.value | 0);
  }
  let [a, b, c, d] = words as [number, number, number, number];

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  // Discard the first outputs so the state is well mixed.
  for (let i = 0; i < 12; i++) nextUint32();

  return {
    nextUint32,
    next: () => nextUint32() / UINT32_RANGE,
  };
}
