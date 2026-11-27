/**
 * W01-3 AC 1, 2, 6: KANJIDIC2 element mapping (pipeline.md §3.3, content.md §3.1).
 *
 * API these tests expect from `src/domain/kanjidic/index.ts`:
 *   parseKanjidic(chunks: Iterable<string> | AsyncIterable<string>, provenance: Provenance)
 *     : Promise<{ kanji: KanjiRow[]; readings: ReadingRow[] }>
 * Row field names follow `NewKanji` / `NewReading` from @kizuna/content.
 * Expected values are hand-read from test/fixtures/kanjidic2-excerpt.xml.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseKanjidic } from '../domain/kanjidic/index.ts';

const FIXTURE = fileURLToPath(
  new URL('../../test/fixtures/kanjidic2-excerpt.xml', import.meta.url),
);
const xml = readFileSync(FIXTURE, 'utf8');
const PROVENANCE = { source: 'kanjidic2', sourceVersion: '2026-331', license: 'CC BY-SA 4.0' };

async function parse() {
  return parseKanjidic([xml], PROVENANCE);
}

type Row = {
  id: string;
  kanjiLiteral: string;
  kind: string;
  kana: string;
  okurigana?: string | null;
};
function find<T extends Row>(
  rows: readonly T[],
  kanji: string,
  kind: string,
  kana: string,
  okurigana = '',
) {
  return rows.filter(
    (r) =>
      r.kanjiLiteral === kanji &&
      r.kind === kind &&
      r.kana === kana &&
      (r.okurigana ?? '') === okurigana,
  );
}

describe('parseKanjidic: kanji rows (AC 1)', () => {
  it('emits one kanji row per <character>, keyed by literal', async () => {
    const { kanji } = await parse();
    expect(kanji.map((k) => k.literal).sort()).toEqual(
      ['唖', '御', '犀', '狼', '生', '日', '食'].sort(),
    );
  });

  it('maps literal, codepoint, strokes, classical radical, grade, freq_rank for 食', async () => {
    const { kanji } = await parse();
    expect(kanji.find((k) => k.literal === '食')).toMatchObject({
      literal: '食',
      codepoint: 0x98df,
      strokes: 9,
      radicalNumber: 184,
      grade: 2,
      freqRank: 328,
    });
  });

  it('takes the classical radical, not nelson_c, and the first stroke_count (犀)', async () => {
    const { kanji } = await parse();
    expect(kanji.find((k) => k.literal === '犀')).toMatchObject({
      codepoint: 0x7280,
      radicalNumber: 93,
      strokes: 12,
      grade: 9,
      freqRank: 2426,
    });
  });

  it('gives null grade and freq_rank when the source has none (唖)', async () => {
    const { kanji } = await parse();
    const row = kanji.find((k) => k.literal === '唖');
    expect(row).toMatchObject({ codepoint: 0x5516, strokes: 10, radicalNumber: 30 });
    expect(row?.grade ?? null).toBeNull();
    expect(row?.freqRank ?? null).toBeNull();
  });

  it('maps meanings with language tags; a meaning without m_lang is English', async () => {
    const { kanji } = await parse();
    expect(kanji.find((k) => k.literal === '食')?.meanings).toEqual([
      { lang: 'en', text: 'eat' },
      { lang: 'en', text: 'food' },
      { lang: 'fr', text: 'manger' },
      { lang: 'fr', text: 'nourriture' },
      { lang: 'es', text: 'alimento' },
      { lang: 'es', text: 'comida' },
      { lang: 'es', text: 'eclipse' },
      { lang: 'es', text: 'comer' },
      { lang: 'pt', text: 'comer' },
      { lang: 'pt', text: 'comida' },
      { lang: 'pt', text: 'alimento' },
    ]);
    expect(kanji.find((k) => k.literal === '犀')?.meanings).toEqual([
      { lang: 'en', text: 'rhinoceros' },
    ]);
  });
});

describe('parseKanjidic: reading rows (AC 1, 2)', () => {
  it('emits only ja_on, ja_kun and nanori readings (pinyin, korean, vietnam ignored)', async () => {
    const { readings } = await parse();
    const count = (k: string) => readings.filter((r) => r.kanjiLiteral === k).length;
    expect(count('食')).toBe(7); // 2 on + 4 kun + 1 nanori
    expect(count('狼')).toBe(2);
    expect(count('唖')).toBe(3);
    expect(count('犀')).toBe(2);
    expect(count('日')).toBe(17); // 2 on + 3 kun + 12 nanori
    expect(count('御')).toBe(6); // 2 on + 3 kun + 1 nanori
    expect(new Set(readings.map((r) => r.kind))).toEqual(new Set(['on', 'kun', 'nanori']));
  });

  it('makes nanori separate reading rows of kind nanori', async () => {
    const { readings } = await parse();
    const nanori = readings
      .filter((r) => r.kanjiLiteral === '日' && r.kind === 'nanori')
      .map((r) => r.kana);
    expect(nanori.sort()).toEqual(
      ['あ', 'あき', 'いる', 'く', 'くさ', 'こう', 'す', 'たち', 'に', 'にっ', 'につ', 'へ'].sort(),
    );
    expect(find(readings, '食', 'nanori', 'ぐい')).toHaveLength(1);
    expect(find(readings, '食', 'kun', 'ぐい')).toHaveLength(0);
  });

  it('stores on readings in hiragana (セイ -> せい)', async () => {
    const { readings } = await parse();
    expect(find(readings, '生', 'on', 'せい')).toHaveLength(1);
    expect(find(readings, '生', 'on', 'しょう')).toHaveLength(1);
    expect(find(readings, '食', 'on', 'しょく')).toHaveLength(1);
    for (const r of readings) expect(r.kana).not.toMatch(/[ァ-ヶ]/u);
  });

  it('splits okurigana: た.べる -> stem た, okurigana べる', async () => {
    const { readings } = await parse();
    expect(find(readings, '食', 'kun', 'た', 'べる')).toHaveLength(1);
    expect(find(readings, '食', 'kun', 'く', 'う')).toHaveLength(1);
    expect(find(readings, '食', 'kun', 'く', 'らう')).toHaveLength(1);
    expect(find(readings, '生', 'kun', 'うま', 'れる')).toHaveLength(1);
    expect(find(readings, '生', 'kun', 'う', 'まれる')).toHaveLength(1);
  });

  it('a reading with no dot has empty okurigana (狼 おおかみ)', async () => {
    const { readings } = await parse();
    expect(find(readings, '狼', 'kun', 'おおかみ', '')).toHaveLength(1);
  });

  it('strips affix markers from the kana (日 -び, 御 お-)', async () => {
    const { readings } = await parse();
    expect(find(readings, '日', 'kun', 'び')).toHaveLength(1);
    expect(find(readings, '日', 'kun', 'か')).toHaveLength(1);
    expect(find(readings, '御', 'kun', 'お')).toHaveLength(1);
    expect(find(readings, '御', 'kun', 'おん')).toHaveLength(1);
    for (const r of readings) {
      expect(r.kana).not.toMatch(/[.-]/u);
      expect(r.okurigana ?? '').not.toMatch(/[.-]/u);
    }
  });

  it('gives every reading row the ID kanji:kind:… with its own kanji and kind', async () => {
    const { readings } = await parse();
    for (const r of readings) expect(r.id.startsWith(`${r.kanjiLiteral}:${r.kind}:`)).toBe(true);
    expect(find(readings, '生', 'on', 'せい')[0]?.id).toBe('生:on:せい');
  });
});

describe('parseKanjidic: streaming input (AC 1)', () => {
  it('gives the same rows when the XML arrives in small chunks', async () => {
    const whole = await parse();
    const chars = Array.from(xml);
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += 7) chunks.push(chars.slice(i, i + 7).join(''));
    async function* stream() {
      for (const c of chunks) yield c;
    }
    expect(await parseKanjidic(stream(), PROVENANCE)).toEqual(whole);
  });
});

describe('parseKanjidic: provenance (AC 6)', () => {
  it('stamps source, source_version and license on every kanji and reading row', async () => {
    const { kanji, readings } = await parse();
    expect(kanji.length).toBeGreaterThan(0);
    expect(readings.length).toBeGreaterThan(0);
    for (const row of [...kanji, ...readings]) {
      expect(row).toMatchObject(PROVENANCE);
    }
  });
});
