/**
 * W01-3 AC 3, 4, 5, 6: the KANJIDIC2 + Jōyō import as a whole.
 *
 * API these tests expect from `./index.ts`:
 *   importKanjidic({ kanjidic: Iterable<string> | AsyncIterable<string>, joyo: string, provenance })
 *     : Promise<{ kanji; readings; report: { missingKanji; missingReadings } }>
 *   serialiseRows(result): string   // sorted JSON rows, byte-stable
 * The full-data test expects the checked-in Jōyō table at content/joyo/joyo.tsv (WP OPEN-Q Q1),
 * in the same format as test/fixtures/joyo-sample.tsv.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseJoyoTable } from '../domain/joyo/index.ts';
import { importKanjidic, serialiseRows } from './index.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const xml = readFileSync(at('../../test/fixtures/kanjidic2-excerpt.xml'), 'utf8');
const tsv = readFileSync(at('../../test/fixtures/joyo-sample.tsv'), 'utf8');
const GOLDEN = at('./__golden__/kanjidic-import.json');
const PROVENANCE = { source: 'kanjidic2', sourceVersion: '2026-331', license: 'CC BY-SA 4.0' };

const run = (kanjidic: Iterable<string> | AsyncIterable<string>, joyo = tsv) =>
  importKanjidic({ kanjidic, joyo, provenance: PROVENANCE });

/** The fixture with its <character> entries in reverse order. */
function reversedEntries(source: string): string {
  const start = source.indexOf('<!-- Entry for Kanji');
  const end = source.lastIndexOf('</kanjidic2>');
  const entries = source.slice(start, end).split(/(?=<!-- Entry for Kanji)/u);
  return source.slice(0, start) + entries.reverse().join('') + source.slice(end);
}

describe('import provenance (AC 6)', () => {
  it('every kanji and reading row carries non-empty source, source_version and license', async () => {
    const { kanji, readings } = await run([xml]);
    for (const row of [...kanji, ...readings]) {
      for (const key of ['source', 'sourceVersion', 'license'] as const) {
        expect(typeof row[key]).toBe('string');
        expect(row[key]).not.toBe('');
      }
    }
  });
});

describe('import report (AC 4)', () => {
  it('reports unmatched Jōyō kanji and readings', async () => {
    const { report } = await run([xml]);
    expect(report.missingKanji).toContainEqual({
      kanji: '丼',
      readings: [expect.objectContaining({ kind: 'kun', reading: 'どんぶり' })],
    });
    expect(report.missingReadings).toContainEqual({ literal: '食', kind: 'kun', reading: 'め.し' });
  });
});

describe('compatibility ideographs (Q7)', () => {
  const COMPAT = '\uFA67'; // NFC folds it onto 逸 U+9038

  it('leaves a CJK compatibility ideograph out of the rows', async () => {
    const { kanji, readings } = await run([xml]);
    for (const lit of [COMPAT, '\u9038']) {
      expect(kanji.some((k) => k.literal === lit)).toBe(false);
      expect(readings.some((r) => r.kanjiLiteral === lit)).toBe(false);
    }
  });

  it('lists it in report.excludedCharacters instead of dropping it silently', async () => {
    const { report } = await run([xml]);
    expect(report.excludedCharacters).toEqual([expect.objectContaining({ literal: COMPAT })]);
  });
});

describe('determinism (AC 5)', () => {
  it('gives byte-identical output for the same inputs, however they are chunked', async () => {
    const a = serialiseRows(await run([xml]));
    const b = serialiseRows(await run(Array.from(xml)));
    expect(b).toBe(a);
  });

  it('sorts rows by a stable key, so input entry order does not change the bytes', async () => {
    const a = serialiseRows(await run([xml]));
    const b = serialiseRows(await run([reversedEntries(xml)]));
    expect(b).toBe(a);
  });

  // TODO(W01-3 golden): the golden file is NOT checked in, because its exact bytes are not fully
  // determined by the spec (reading-ID kana form, okurigana null vs '', affix storage, JSON layout:
  // see WP OPEN-Q). Once the OPEN-Qs are answered, generate it with serialiseRows, review it by hand
  // against the fixture, and commit it as __golden__/kanjidic-import.json.
  it('matches the reviewed golden file byte for byte', async () => {
    expect(existsSync(GOLDEN), 'TODO: golden file pending WP OPEN-Q answers').toBe(true);
    expect(serialiseRows(await run([xml]))).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});

describe('full Jōyō teach set (AC 3, 4)', () => {
  const JOYO = at('../../../../content/joyo/joyo.tsv');
  const KANJIDIC = at('../../../../content/sources/kanjidic2.xml.gz');

  it('the checked-in Jōyō table lists exactly 2,136 distinct kanji', () => {
    const entries = parseJoyoTable(readFileSync(JOYO, 'utf8'));
    expect(new Set(entries.map((e) => e.literal)).size).toBe(2136);
  });

  it(
    'exactly 2,136 kanji get is_joyo = true from the pinned KANJIDIC2',
    { timeout: 120_000 },
    async () => {
      const joyo = readFileSync(JOYO, 'utf8');
      const full = gunzipSync(readFileSync(KANJIDIC)).toString('utf8');
      const { kanji, report } = await run([full], joyo);
      const flagged = kanji.filter((k) => k.isJoyo === true).map((k) => k.literal);
      expect(flagged).toHaveLength(2136);
      expect(new Set(flagged)).toEqual(new Set(parseJoyoTable(joyo).map((e) => e.literal)));
      expect(report.missingKanji).toEqual([]);
    },
  );
});
