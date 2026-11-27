/**
 * W02-1 AC 1, 5, 6: the KanjiVG import (stable sort, unique primary keys, provenance, golden).
 *
 * API expected from `src/import/index.ts`:
 *   importKanjivg(chunks: Iterable<string> | AsyncIterable<string>, provenance): Promise<KanjivgImportResult>
 *     same shape as the domain KanjivgRows, sorted:
 *       components      by slug (code point order);
 *       kanjiComponents by kanji code point, then ord (pre-order index, unique per kanji: Q4a);
 *       strokes         by kanji code point.
 *   serialiseKanjivg(result): string   // fixed key order, trailing newline, byte-stable
 * Regenerate the golden with UPDATE_GOLDEN=1 and review the diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importKanjivg, serialiseKanjivg } from './index.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const xml = readFileSync(at('../../test/fixtures/kanjivg-excerpt.xml'), 'utf8');
const GOLDEN = at('./__golden__/kanjivg-import.json');
const PROVENANCE = { source: 'kanjivg', sourceVersion: 'test', license: 'CC BY-SA 3.0' };

const run = (chunks: Iterable<string> | AsyncIterable<string> = [xml]) =>
  importKanjivg(chunks, PROVENANCE);

/** Compares strings by Unicode code point, not UTF-16 unit. */
function cmp(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** The fixture with its <kanji> elements in reverse order. */
function reversedKanji(source: string): string {
  // Search after the <kanjivg> root: the header comment also mentions `<kanji id=`.
  const start = source.indexOf('<kanji id=', source.indexOf('<kanjivg '));
  const end = source.lastIndexOf('</kanjivg>');
  const parts = source.slice(start, end).split(/(?=<kanji id=)/u);
  return source.slice(0, start) + parts.reverse().join('') + source.slice(end);
}

describe('importKanjivg sorting and keys (AC 1)', () => {
  it('sorts kanji_component by kanji code point, then ord', async () => {
    const { kanjiComponents } = await run();
    const sorted = [...kanjiComponents].sort(
      (a, b) => a.kanjiLiteral.codePointAt(0)! - b.kanjiLiteral.codePointAt(0)! || a.ord - b.ord,
    );
    expect(kanjiComponents).toEqual(sorted);
    expect(kanjiComponents).toHaveLength(49);
  });

  it('sorts components by slug and stroke counts by kanji code point', async () => {
    const { components, strokes } = await run();
    expect(components.map((c) => c.slug)).toEqual(components.map((c) => c.slug).sort(cmp));
    const cps = strokes.map((s) => s.kanji.codePointAt(0)!);
    expect(cps).toEqual([...cps].sort((a, b) => a - b));
    expect(strokes).toHaveLength(11);
  });

  it('has no duplicate primary key (kanji, component slug, depth, ord), even for 競 (Q4a)', async () => {
    const { kanjiComponents, components } = await run();
    const pks = kanjiComponents.map(
      (r) => `${r.kanjiLiteral}|${r.componentSlug}|${r.depth}|${r.ord}`,
    );
    expect(new Set(pks).size).toBe(pks.length);
    expect(new Set(components.map((c) => c.slug)).size).toBe(components.length);
  });

  it('does not depend on the order of the kanji in the input', async () => {
    const reversed = reversedKanji(xml);
    expect(reversed).not.toBe(xml);
    expect((await run([reversed])).kanjiComponents).toHaveLength(49);
    expect(serialiseKanjivg(await run([reversed]))).toBe(serialiseKanjivg(await run()));
  });
});

describe('provenance (AC 6)', () => {
  it('carries source, source_version and license CC BY-SA 3.0 on every row', async () => {
    const { components, kanjiComponents } = await run();
    for (const row of [...components, ...kanjiComponents]) {
      expect(row).toMatchObject({
        source: 'kanjivg',
        sourceVersion: 'test',
        license: 'CC BY-SA 3.0',
      });
    }
  });

  it('reports kanji count, row counts and unknown roles', async () => {
    const { report, kanjiComponents } = await run();
    expect(report).toMatchObject({
      kanjiCount: 11,
      componentRows: 31,
      kanjiComponentRows: 49,
      codepointlessComponents: 6,
      unknownPositions: 0,
      unknownRoles: kanjiComponents.filter((r) => r.role === 'unknown').length,
    });
  });
});

describe('golden (AC 5)', () => {
  it('matches the golden file byte for byte, and is stable across runs', async () => {
    const out = serialiseKanjivg(await run());
    expect(serialiseKanjivg(await run())).toBe(out);
    expect(out.endsWith('}\n')).toBe(true);
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, out);
    expect(out).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
