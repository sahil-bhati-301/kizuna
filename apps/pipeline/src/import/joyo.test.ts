/**
 * W01-3 AC 3, 4: Jōyō table import and flags (pipeline.md §3.3 Teach set).
 *
 * API these tests expect from `src/domain/joyo/index.ts`:
 *   parseJoyoTable(tsv: string): JoyoEntry[]   // { literal, kind: 'on' | 'kun', reading }
 *     TSV: `#` comment lines, header `literal<TAB>kind<TAB>reading`, readings in KANJIDIC notation.
 *   applyJoyo(parsed: { kanji, readings }, entries: JoyoEntry[])
 *     : { kanji; readings; report: { missingKanji: { kanji: string; readings: [...] }[]; missingReadings: JoyoEntry[] } }
 * Owner answers (WP OPEN-Q): Q2/Q3 reading IDs keep markers (`食:kun:た.べる`, `生:kun:なま-`);
 * Q5/Q8 a missing kanji's readings are attached to its `missingKanji` entry only;
 * Q9 Jōyō matching tries the exact form first and ignores markers only when no exact row exists.
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

function flagById(rows: readonly (Row & { id: string })[], id: string) {
  const hits = rows.filter((r) => r.id === id);
  expect(hits, id).toHaveLength(1);
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

describe('applyJoyo: exact-first matching (Q3, Q9)', () => {
  it('flags the exact form when one exists: 生 なま flags 生:kun:なま, not 生:kun:なま-', async () => {
    const { readings } = await applied();
    expect(flagById(readings, '生:kun:なま')).toBe(true);
    expect(flagById(readings, '生:kun:なま-')).toBe(false);
  });

  it('ignores markers only when no exact row exists: 日 か flags 日:kun:-か', async () => {
    const { readings } = await applied();
    expect(flagById(readings, '日:kun:-か')).toBe(true);
    expect(flagById(readings, '日:kun:-び')).toBe(false);
  });

  it('does not report a reading matched by the marker-free fallback as missing', async () => {
    const { report } = await applied();
    expect(report.missingReadings).not.toContainEqual({
      literal: '日',
      kind: 'kun',
      reading: 'か',
    });
  });
});

describe('applyJoyo: unmatched entries are reported (AC 4)', () => {
  it('reports a Jōyō kanji absent from KANJIDIC2', async () => {
    const { report, kanji } = await applied();
    expect(report.missingKanji).toEqual([
      {
        kanji: '丼',
        readings: [expect.objectContaining({ kind: 'kun', reading: 'どんぶり' })],
      },
    ]);
    expect(kanji.find((k) => k.literal === '丼')).toBeUndefined();
  });

  it('reports a Jōyō reading KANJIDIC2 does not list, instead of dropping it silently', async () => {
    const { report } = await applied();
    expect(report.missingReadings).toEqual([{ literal: '食', kind: 'kun', reading: 'め.し' }]);
  });

  it('lists the readings of a missing kanji only on its missingKanji entry (Q5)', async () => {
    const { report } = await applied();
    expect(report.missingReadings.some((e) => e.literal === '丼')).toBe(false);
  });

  it('keeps provenance on every row after flagging (AC 6)', async () => {
    const { kanji, readings } = await applied();
    for (const row of [...kanji, ...readings]) expect(row).toMatchObject(PROVENANCE);
  });
});
