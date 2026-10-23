// Seeded, deterministic randomness. The engine never calls Math.random().

export type Rng = () => number;

/** mulberry32: a tiny, fast 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine values into one 32-bit seed. */
export function seedFrom(...parts: Array<string | number>): number {
  return hashString(parts.map(String).join('␟'));
}

/** RNG derived from a base seed and a key, so streams are independent of call order. */
export function rngFor(seed: number, ...key: Array<string | number>): Rng {
  return mulberry32(seedFrom(seed, ...key));
}

/** Deterministic uniform value in [0, 1) for a key (no state). */
export function hash01(...key: Array<string | number>): number {
  return mulberry32(seedFrom(...key))();
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length)];
}

export function between(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}
