/**
 * W02-4 AC 1-5: Tatoeba subset, word links, quality, attribution, golden. Expected values are
 * hand-read from test/fixtures/tatoeba/. Regenerate the golden with UPDATE_GOLDEN=1 and review it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  attributionUrl,
  buildWordLookup,
  mapItem,
  parseIndexItem,
  parseIndexLine,
  parseLinkLine,
  parseSentenceLine,
} from '../domain/tatoeba/index.ts';
import type { WordForms } from '../domain/tatoeba/index.ts';
import { importJmdict, importTatoeba, serialiseSentences } from './index.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const fixture = (name: string) =>
  readFileSync(at(`../../test/fixtures/tatoeba/${name}`), 'utf8')
    .split('\n')
    .filter(Boolean);
const jmdictXml = readFileSync(at('../../test/fixtures/jmdict-excerpt.xml'), 'utf8');
const GOLDEN = at('./__golden__/tatoeba-import.json');
const PROVENANCE = { source: 'tatoeba', sourceVersion: 'test', license: 'CC BY 2.0 FR' };

const run = async (
  overrides: Partial<Record<'japanese' | 'links' | 'english' | 'indices', string[]>> = {},
) => {
  const { words } = await importJmdict([jmdictXml], {
    source: 'jmdict',
    sourceVersion: 't',
    license: 'x',
  });
  return importTatoeba({
    japanese: fixture('jpn_sentences.tsv'),
    links: fixture('jpn-eng_links.tsv'),
    english: fixture('eng_sentences.tsv'),
    indices: fixture('jpn_indices.tsv'),
    ...overrides,
    words,
    provenance: PROVENANCE,
  });
};
const row = async (id: string) => (await run()).sentences.find((s) => s.id === id)!;

describe('line parsing (unit)', () => {
  it('parses every part of an index token', () => {
    expect(parseIndexItem('食べる(たべる)[01]{食べた}~')).toEqual({
      headword: '食べる',
      reading: 'たべる',
      entSeq: null,
      sense: '01',
      form: '食べた',
      checked: true,
    });
    expect(parseIndexItem('は')).toEqual({
      headword: 'は',
      reading: null,
      entSeq: null,
      sense: null,
      form: null,
      checked: false,
    });
    expect(parseIndexItem('ログアウト~')).toMatchObject({ headword: 'ログアウト', checked: true });
    expect(parseIndexItem('が(#2028930)')).toMatchObject({ reading: null, entSeq: 2028930 });
    expect(parseIndexItem('{x}')).toBeNull();
  });

  it('parses index, sentence and link lines, and rejects malformed ones', () => {
    expect(parseIndexLine('7\t8\t私(わたし) {x')).toMatchObject({
      sentenceId: 7,
      meaningId: 8,
      badTokens: 1,
    });
    expect(parseIndexLine('7\t8\t私 は')!.items.map((i) => i.headword)).toEqual(['私', 'は']);
    expect(parseIndexLine('x\t8\tは')).toBeNull();
    expect(parseSentenceLine('5\tjpn\tテキスト')).toEqual({ id: 5, lang: 'jpn', text: 'テキスト' });
    expect(parseSentenceLine('5\tjpn')).toBeNull();
    expect(parseLinkLine('1\t2')).toEqual([1, 2]);
    expect(parseLinkLine('1')).toBeNull();
  });
});

describe('headword to ent_seq (unit)', () => {
  const words: WordForms[] = [
    { entSeq: 1, headword: '橋', kana: 'はし', altForms: [] },
    { entSeq: 2, headword: '箸', kana: 'はし', altForms: [{ kind: 'kana', text: 'ハシ' }] },
    { entSeq: 3, headword: '端', kana: 'はし', altForms: [] },
  ];
  const lookup = buildWordLookup(words);
  const map = (t: string) => mapItem(parseIndexItem(t)!, lookup);

  it('maps a unique headword, also through other forms and readings', () => {
    expect(map('橋')).toEqual({ status: 'mapped', entSeq: 1 });
    expect(map('箸(ハシ)')).toEqual({ status: 'mapped', entSeq: 2 });
  });
  it('reports a shared kana headword as ambiguous, never guessing', () => {
    expect(map('はし')).toEqual({ status: 'ambiguous', entSeqs: [1, 2, 3] });
  });
  it('reports unknown headwords, readings that do not fit and unloaded entry IDs', () => {
    expect(map('猫')).toEqual({ status: 'unknown' });
    expect(map('橋(きょう)')).toEqual({ status: 'unknown' });
    expect(map('橋(#999)')).toEqual({ status: 'unknown' });
  });
  it('trusts a loaded (#id)', () => {
    expect(map('はし(#3)')).toEqual({ status: 'mapped', entSeq: 3 });
  });
});

describe('subset, links and quality (AC 1-3)', () => {
  it('keeps sentences with an English translation and a mapped word (Q1 a)', async () => {
    const { sentences, report } = await run();
    expect(sentences.map((s) => s.id)).toEqual(['101', '102', '103', '104', '107', '109', '110']);
    expect(report).toMatchObject({
      japaneseRead: 10,
      sentencesKept: 7,
      noEnglishTranslation: 2, // 105 has no link; 108 links to a missing English sentence
      noIndexLine: 0,
      noMappedWord: 1, // 106
      optionBKept: 2, // 103 and 107: every item checked
    });
  });

  it('builds NFC Japanese and lang-tagged translations of direct links, sorted by ID', async () => {
    const s = await row('102');
    expect(s.translations).toEqual([
      { lang: 'eng', id: 5002, text: 'I drink coffee in the kitchen.' },
      { lang: 'eng', id: 5003, text: 'Coffee is drunk in the kitchen.' },
    ]);
    const beer = await row('104');
    expect(beer.japanese).toBe('ワインとビール。');
    expect(beer.japanese).toBe(beer.japanese.normalize('NFC'));
  });

  it('maps each index word to an ent_seq, sorted and unique', async () => {
    expect((await row('101')).wordIds).toEqual([1000110, 1000200]);
    expect((await row('102')).wordIds).toEqual([1000130, 1000150]);
    expect((await row('107')).wordIds).toEqual([1000140]); // by the reading さみしい
    expect((await row('110')).wordIds).toEqual([1000100, 1000170]); // 居る via (#1000170)
  });

  it('counts unmapped items in the report and sets quality to mapped / all items (Q2 a)', async () => {
    const { report } = await run();
    expect((await row('101')).quality).toBe(0.4);
    expect((await row('103')).quality).toBe(1);
    expect((await row('104')).quality).toBe(0.333);
    expect(report.unknownItems).toBe(10);
    expect(report.ambiguousItems).toBe(0);
    expect(report.unmapped).toContainEqual({
      sentenceId: 104,
      headword: 'ビール',
      reading: null,
      reason: 'unknown',
    });
  });

  it('uses the lowest linked meaning ID when a sentence has several index lines', async () => {
    // 109 has a line for the unlinked meaning 5011 (ワイン) and one for the linked 5008 (食べる).
    expect((await row('109')).wordIds).toEqual([1000100]);
    const unlinkedOnly = fixture('jpn_indices.tsv').filter((l) => !l.startsWith('109\t5008'));
    const { sentences, report } = await run({ indices: unlinkedOnly });
    expect(sentences.map((s) => s.id)).not.toContain('109');
    expect(report.noIndexLine).toBe(1);
  });

  it('only ever lists loaded words, and every row has a translation (property)', async () => {
    const { words } = await importJmdict([jmdictXml], {
      source: 'j',
      sourceVersion: 't',
      license: 'x',
    });
    const loaded = new Set(words.map((w) => w.entSeq));
    const tokens = [
      '食べる',
      '書く',
      'は',
      '猫',
      '居る(#1000170)',
      '珈琲(コーヒー)',
      '台所~',
      'x(#1)',
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...tokens), { minLength: 1, maxLength: 8 }),
        async (ts) => {
          const { sentences } = await run({ indices: [`102\t5002\t${ts.join(' ')}`] });
          for (const s of sentences) {
            expect(s.translations.length).toBeGreaterThan(0);
            expect(s.wordIds.every((id) => loaded.has(id))).toBe(true);
            expect([...s.wordIds].sort((a, b) => a - b)).toEqual(s.wordIds);
            expect(new Set(s.wordIds).size).toBe(s.wordIds.length);
          }
        },
      ),
    );
  });
});

describe('provenance and attribution (AC 4)', () => {
  it('formats the tatoeba.org link', () => {
    expect(attributionUrl(1297)).toBe('https://tatoeba.org/en/sentences/show/1297');
  });
  it('every row carries source, version, licence and its link', async () => {
    for (const s of (await run()).sentences) {
      expect(s).toMatchObject({
        source: 'tatoeba',
        sourceVersion: 'test',
        license: 'CC BY 2.0 FR',
      });
      expect(s.attributionUrl).toBe(`https://tatoeba.org/en/sentences/show/${s.id}`);
    }
  });
});

describe('golden file (AC 5)', () => {
  it('matches byte for byte, and is stable across runs and input order', async () => {
    const out = serialiseSentences(await run());
    expect(serialiseSentences(await run())).toBe(out);
    const shuffled = await run({
      japanese: fixture('jpn_sentences.tsv').reverse(),
      links: fixture('jpn-eng_links.tsv').reverse(),
      indices: fixture('jpn_indices.tsv').reverse(),
    });
    expect(serialiseSentences(shuffled)).toBe(out);
    if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, out);
    expect(out).toBe(readFileSync(GOLDEN, 'utf8'));
  });
});
