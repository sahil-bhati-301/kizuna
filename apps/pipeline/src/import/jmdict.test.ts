/**
 * W02-2 AC 1-5: the JMdict subset import (parser, headword and kana choice, flags, rank, golden).
 * Expected values are hand-read from test/fixtures/jmdict-excerpt.xml. Regenerate the golden with
 * UPDATE_GOLDEN=1 and review the diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseJmdict, rankWords } from '../domain/jmdict/index.ts';
import { importJmdict, serialiseWords } from './index.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const xml = readFileSync(at('../../test/fixtures/jmdict-excerpt.xml'), 'utf8');
const GOLDEN = at('./__golden__/jmdict-import.json');
const PROVENANCE = { source: 'jmdict', sourceVersion: 'test', license: 'CC BY-SA 4.0' };

const run = (chunks: Iterable<string> | AsyncIterable<string> = [xml]) =>
  importJmdict(chunks, PROVENANCE);
const byId = async (id: number) => (await run()).words.find((w) => w.entSeq === id)!;

/** The fixture with its <entry> elements in reverse order. */
function reversedEntries(source: string): string {
  const start = source.indexOf('<entry>');
  const end = source.lastIndexOf('</JMdict>');
  const entries = source.slice(start, end).split(/(?=<entry>)/u);
  return source.slice(0, start) + entries.reverse().join('') + source.slice(end);
}

describe('subset and flags (AC 3)', () => {
  it('loads only entries with a priority tag and reports the counts', async () => {
    const { words, report } = await run();
    expect(report).toMatchObject({ entriesRead: 14, entriesLoaded: 12, commonLoaded: 7 });
    expect(words.map((w) => w.entSeq)).not.toContain(1000010);
    expect(words.map((w) => w.entSeq)).not.toContain(1000220);
  });

  it('flags is_common for news1, ichi1, spec1, spec2 and gai1, not for news2, ichi2, gai2', async () => {
    const common = (await run()).words.filter((w) => w.isCommon).map((w) => w.entSeq);
    expect(common).toEqual([1000100, 1000110, 1000120, 1000130, 1000140, 1000160, 1000170]);
  });
});

describe('headword and kana (AC 2)', () => {
  it('takes the first kanji form and its first reading', async () => {
    expect(await byId(1000100)).toMatchObject({ headword: '食べる', kana: 'たべる' });
  });

  it('skips search-only and irregular kanji forms for the headword', async () => {
    expect(await byId(1000140)).toMatchObject({ headword: '淋しい', kana: 'さびしい' });
  });

  it('respects re_restr and skips re_nokanji', async () => {
    expect(await byId(1000150)).toMatchObject({ headword: '台所', kana: 'だいどころ' });
    expect(await byId(1000160)).toMatchObject({ headword: '土産', kana: 'みやげ' });
  });

  it('uses the reading as headword for kana-only entries, keeping katakana', async () => {
    expect(await byId(1000120)).toMatchObject({ headword: 'ありがとう', kana: 'ありがとう' });
    expect(await byId(1000180)).toMatchObject({ headword: 'ワイン', kana: 'ワイン' });
    expect(await byId(1000130)).toMatchObject({ headword: '珈琲', kana: 'コーヒー' });
  });

  it('falls back to the reading when every kanji form is irregular, and reports it', async () => {
    const { words, report } = await run();
    expect(words.find((w) => w.entSeq === 1000170)).toMatchObject({
      headword: 'いる',
      kana: 'いる',
    });
    expect(report.kanaHeadwordFallbacks).toEqual([1000170]);
  });

  it('keeps NFC text', async () => {
    const decomposed = xml.replace('<reb>たべる</reb>', '<reb>たへ\u3099る</reb>');
    expect(decomposed).not.toBe(xml);
    const { words } = await run([decomposed]);
    expect(words.find((w) => w.entSeq === 1000100)!.kana).toBe('たべる');
  });
});

describe('review fixes', () => {
  it('matches re_restr against the NFC form of an NFD keb', async () => {
    const nfd = xml.replace('<keb>台所</keb>', '<keb>' + '台所'.normalize('NFD') + '</keb>');
    const { words } = await run([nfd]);
    expect(words.find((w) => w.entSeq === 1000150)).toMatchObject({
      headword: '台所',
      kana: 'だいどころ',
    });
  });

  it('takes the first non-nokanji, non-search-only reading in the all-irregular fallback', async () => {
    const entry = xml.replace(
      '<reb>いる</reb>',
      '<reb>ゐる</reb>\n<re_inf>&sk;</re_inf>\n</r_ele>\n<r_ele>\n<reb>いる</reb>',
    );
    const { words } = await run([entry]);
    expect(words.find((w) => w.entSeq === 1000170)).toMatchObject({
      headword: 'いる',
      kana: 'いる',
    });
  });

  it('has no entry without a valid reading on the fixture', async () => {
    expect((await run()).report.noValidReading).toHaveLength(0);
  });
});

describe('forms, senses and entities (AC 1)', () => {
  it('lists the other forms with their info tags and priorities', async () => {
    const w = await byId(1000140);
    expect(w.altForms).toEqual([
      { kind: 'kanji', text: '寂しい', info: ['sK'], priority: [] },
      { kind: 'kanji', text: '寞しい', info: ['iK'], priority: [] },
      { kind: 'kana', text: 'さみしい', info: ['sk'], priority: [] },
    ]);
    expect((await byId(1000130)).altForms).toEqual([]);
    expect((await byId(1000190)).altForms).toContainEqual({
      kind: 'kana',
      text: 'ワサビ',
      info: ['ok'],
      priority: [],
    });
  });

  it('keeps DTD entities as their codes (v5k, n) and lang-tags glosses', async () => {
    expect((await byId(1000110)).senses).toEqual([
      {
        pos: ['v5k', 'vt'],
        glosses: [
          { lang: 'eng', text: 'to write' },
          { lang: 'ger', text: 'schreiben' },
        ],
      },
    ]);
  });

  it('lets a sense without pos inherit the previous one, and decodes predefined entities', async () => {
    const eat = await byId(1000100);
    expect(eat.senses[1]).toEqual({
      pos: ['v1', 'vt'],
      glosses: [
        { lang: 'eng', text: 'to make a living' },
        { lang: 'dut', text: 'de kost verdienen' },
      ],
    });
    expect((await byId(1000160)).senses[0]!.glosses[1]!.text).toBe('Mitbringsel & Geschenk');
  });

  it('gives the same rows however the text is chunked', async () => {
    const whole = serialiseWords(await run());
    for (const size of [1, 7, 64]) {
      const chunks = xml.match(new RegExp(`[\\s\\S]{1,${size}}`, 'gu')) ?? [];
      expect(serialiseWords(await run(chunks))).toBe(whole);
    }
  });
});

describe('freq_rank (AC 4)', () => {
  it('ranks by best nf band, then tag count, then ent_seq; no nf sorts last', async () => {
    const { words } = await run();
    const order = [...words].sort((a, b) => a.freqRank! - b.freqRank!).map((w) => w.entSeq);
    expect(order).toEqual([
      1000110, 1000120, 1000100, 1000130, 1000150, 1000200, 1000210, 1000140, 1000160, 1000170,
      1000180, 1000190,
    ]);
  });

  it('is a permutation of 1..N and every loaded entry has a priority tag', async () => {
    const { words } = await run();
    expect(words.map((w) => w.freqRank!).sort((a, b) => a - b)).toEqual(words.map((_, i) => i + 1));
    const { keys } = await parseJmdict([xml], PROVENANCE);
    expect(keys).toHaveLength(words.length);
    expect(keys.every((k) => k.priorityCount >= 1)).toBe(true);
  });

  it('does not depend on the order of the entries in the input', async () => {
    const forward = await parseJmdict([xml], PROVENANCE);
    const reversed = await parseJmdict([reversedEntries(xml)], PROVENANCE);
    expect(rankWords(reversed).sort((a, b) => a.entSeq - b.entSeq)).toEqual(
      rankWords(forward).sort((a, b) => a.entSeq - b.entSeq),
    );
  });

  it('is a permutation whatever the nf bands and tag counts (property)', () => {
    const key = fc.record({
      bestNf: fc.option(fc.integer({ min: 1, max: 48 }), { nil: null }),
      priorityCount: fc.integer({ min: 1, max: 6 }),
    });
    fc.assert(
      fc.property(fc.array(key, { minLength: 1, maxLength: 60 }), (ks) => {
        const keys = ks.map((k, i) => ({ ...k, entSeq: 1000 + i }));
        const words = keys.map((k) => ({
          entSeq: k.entSeq,
          freqRank: null,
        })) as unknown as Parameters<typeof rankWords>[0]['words'];
        const ranked = rankWords({ words, keys, report: {} as never });
        const ranks = ranked.map((w) => w.freqRank!).sort((a, b) => a - b);
        expect(ranks).toEqual(keys.map((_, i) => i + 1));
        const nf = (id: number) => keys.find((k) => k.entSeq === id)!.bestNf ?? 1e6;
        const nfs = ranked.map((w) => nf(w.entSeq));
        expect(nfs).toEqual([...nfs].sort((a, b) => a - b));
      }),
    );
  });
});

describe('provenance and golden file (AC 5)', () => {
  it('every row carries non-empty source, source_version and license', async () => {
    for (const row of (await run()).words) {
      for (const key of ['source', 'sourceVersion', 'license'] as const) {
        expect(row[key]).not.toBe('');
      }
    }
  });

  it('matches the golden file byte for byte, and is stable across runs and input order', async () => {
    const out = serialiseWords(await run());
    expect(serialiseWords(await run())).toBe(out);
    expect(serialiseWords(await run([reversedEntries(xml)]))).toBe(out);
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, out);
    expect(out).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
