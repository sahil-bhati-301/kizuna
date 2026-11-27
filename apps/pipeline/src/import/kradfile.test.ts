/**
 * W01-5 AC 5: deterministic, sorted output with provenance (golden file).
 *
 * API expected from `src/import/index.ts`:
 *   importKradfile(bytes: Uint8Array, provenance): { kanji: KradRow[]; badLines: BadLine[] }  // sorted by code point
 *   serialiseKradfile(result): string                                                         // fixed key order, trailing newline
 * Regenerate the golden with UPDATE_GOLDEN=1.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importKradfile, serialiseKradfile } from './index.ts';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const bytes = new Uint8Array(readFileSync(at('../../test/fixtures/kradfile-excerpt.euc-jp')));
const PROVENANCE = { source: 'kradfile', sourceVersion: 'v-test', license: 'CC BY-SA 4.0' };
const GOLDEN = at('./__golden__/kradfile-import.json');

describe('importKradfile (AC 5)', () => {
  it('sorts kanji by code point', () => {
    const cps = importKradfile(bytes, PROVENANCE).kanji.map((k) => k.codepoint);
    expect(cps).toEqual([...cps].sort((a, b) => a - b));
    expect(cps).toHaveLength(8);
  });

  it('matches the golden file byte for byte, and is stable across runs', () => {
    const out = serialiseKradfile(importKradfile(bytes, PROVENANCE));
    expect(serialiseKradfile(importKradfile(bytes, PROVENANCE))).toBe(out);
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, out);
    expect(out).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
