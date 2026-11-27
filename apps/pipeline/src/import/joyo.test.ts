/**
 * W01-3 AC 3, 4: Jōyō table import and flags (pipeline.md §3.3 Teach set).
 *
 * API these tests expect from `src/domain/joyo/index.ts`:
 *   parseJoyoTable(tsv: string): JoyoEntry[]   // { literal, kind: 'on' | 'kun', reading }
 *     TSV: `#` comment lines, header `literal<TAB>kind<TAB>reading`, readings in KANJIDIC notation.
 *   applyJoyo(parsed: { kanji, readings }, entries: JoyoEntry[])
 *     : { kanji; readings; report: { missingKanji: string[]; missingReadings: JoyoEntry[] } }
 * Expected values are hand-read from test/fixtures/joyo-sample.tsv and kanjidic2-excerpt.xml.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseKanjidic } from '../domain/kanjidic/index.ts';
import { applyJoyo, parseJoyoTable } from '../domain/joyo/index.ts';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../test/fixtures/${name}`, import.meta.url)), 'utf8');
const xml = fixture('kanjidic2-excerpt.xml');
const tsv = fixture('joyo-sample.tsv');
const PROVENANCE = { source: 'kanjidic2', sourceVersion: '2026-331', license: 'CC BY-SA 4.0' };

async function applied() {
  return applyJoyo(await parseKanjidic([xml], PROVENANCE), parseJoyoTable(tsv));
}

type Row = {
  kanjiLiteral: string;
  kind: string;
  kana: string;
  okurigana?: string | null;
  isJoyo?: boolean;
};
function joyoFlag(rows: readonly Row[], kanji: string, kind: string, kana: string, okurigana = '') {
  const hits = rows.filter(
    (r) =>
      r.kanjiLiteral === kanji &&
      r.kind === kind &&
      r.kana === kana &&
      (r.okurigana ?? '') === okurigana,
  );
  expect(hits, `${kanji}:${kind}:${kana}.${okurigana}`).toHaveLength(1);
  return hits[0]?.isJoyo;
}

describe('parseJoyoTable', () => {
  it('skips comments and the header and reads one entry per row', () => {
    const entries = parseJoyoTable(tsv);
    expect(entries).toHaveLength(25);
    expect(entries[0]).toEqual({ literal: '食', kind: 'on', reading: 'ショク' });
    expect(entries.at(-1)).toEqual({ literal: '丼', kind: 'kun', reading: 'どんぶり' });
  });
});

describe('applyJoyo: kanji flags (AC 3)', () => {
  it('sets is_joyo on exactly the Jōyō kanji present in KANJIDIC2', async () => {
    const { kanji } = await applied();
    const joyo = kanji.filter((k) => k.isJoyo === true).map((k) => k.literal);
    expect(joyo.sort()).toEqual(['御', '生', '日', '食'].sort());
    for (const lit of ['犀', '唖', '狼'])
      expect(kanji.find((k) => k.literal === lit)?.isJoyo).toBe(false);
  });
});

describe('applyJoyo: reading flags (AC 3)', () => {
  it('marks readings listed in the Jōyō table true', async () => {
    const { readings } = await applied();
    expect(joyoFlag(readings, '食', 'on', 'しょく')).toBe(true);
    expect(joyoFlag(readings, '食', 'on', 'じき')).toBe(true);
    expect(joyoFlag(readings, '食', 'kun', 'た', 'べる')).toBe(true);
    expect(joyoFlag(readings, '食', 'kun', 'く', 'う')).toBe(true);
    expect(joyoFlag(readings, '食', 'kun', 'く', 'らう')).toBe(true);
    expect(joyoFlag(readings, '生', 'kun', 'う', 'まれる')).toBe(true);
    expect(joyoFlag(readings, '生', 'kun', 'き')).toBe(true);
    expect(joyoFlag(readings, '日', 'kun', 'ひ')).toBe(true);
    expect(joyoFlag(readings, '御', 'on', 'ぎょ')).toBe(true);
  });

  it('marks readings listed only in KANJIDIC2 false', async () => {
    const { readings } = await applied();
    expect(joyoFlag(readings, '食', 'kun', 'は', 'む')).toBe(false);
    expect(joyoFlag(readings, '生', 'kun', 'うま', 'れる')).toBe(false); // same kana, different split
    expect(joyoFlag(readings, '生', 'kun', 'な', 'る')).toBe(false);
    expect(joyoFlag(readings, '狼', 'on', 'ろう')).toBe(false);
    expect(joyoFlag(readings, '日', 'kun', 'び')).toBe(false);
  });

  it('never marks a nanori reading Jōyō', async () => {
    const { readings } = await applied();
    const nanori = readings.filter((r) => r.kind === 'nanori');
    expect(nanori.length).toBeGreaterThan(0);
    for (const r of nanori) expect(r.isJoyo).toBe(false);
  });
});

describe('applyJoyo: unmatched entries are reported (AC 4)', () => {
  it('reports a Jōyō kanji absent from KANJIDIC2', async () => {
    const { report, kanji } = await applied();
    expect(report.missingKanji).toEqual(['丼']);
    expect(kanji.find((k) => k.literal === '丼')).toBeUndefined();
  });

  it('reports a Jōyō reading KANJIDIC2 does not list, instead of dropping it silently', async () => {
    const { report } = await applied();
    const forKnownKanji = report.missingReadings.filter((e) => e.literal !== '丼');
    expect(forKnownKanji).toEqual([{ literal: '食', kind: 'kun', reading: 'め.し' }]);
  });

  it('keeps provenance on every row after flagging (AC 6)', async () => {
    const { kanji, readings } = await applied();
    for (const row of [...kanji, ...readings]) expect(row).toMatchObject(PROVENANCE);
  });
});
