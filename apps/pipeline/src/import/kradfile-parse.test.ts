/**
 * W01-5 AC 1-4: KRADFILE decoding, comments, substitute characters, bad lines.
 *
 * API these tests expect from `src/domain/kradfile/index.ts`:
 *   decodeEucJp(bytes: Uint8Array): string               // throws on invalid EUC-JP
 *   parseKradfile(text: string, provenance: Provenance)
 *     : { kanji: KradRow[]; badLines: { line: number; text: string; reason: string }[] }
 *     KradRow: { literal, codepoint, components: { component: string; radical: number | null }[], source, sourceVersion, license }
 * Rows keep file order; sorting belongs to the import layer. Expected values are hand-read from
 * test/fixtures/kradfile-excerpt.euc-jp.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeEucJp, parseKradfile } from '../domain/kradfile/index.ts';

const bytes = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL('../../test/fixtures/kradfile-excerpt.euc-jp', import.meta.url)),
  ),
);
const PROVENANCE = { source: 'kradfile', sourceVersion: 'v-test', license: 'CC BY-SA 4.0' };
const parse = (text = decodeEucJp(bytes)) => parseKradfile(text, PROVENANCE);
const forms = (literal: string) =>
  parse()
    .kanji.find((k) => k.literal === literal)
    ?.components.map((c) => c.component);

describe('decodeEucJp (AC 1)', () => {
  it('decodes EUC-JP bytes to text', () => {
    expect(decodeEucJp(new Uint8Array([0xb0, 0xa1, 0x20, 0x3a]))).toBe('亜 :');
    expect(decodeEucJp(bytes)).toContain('唖 : ｜ 一 口');
  });

  it('throws on bytes that are not valid EUC-JP', () => {
    expect(() => decodeEucJp(new Uint8Array([0xff, 0xff]))).toThrow();
  });
});

describe('parseKradfile: lines (AC 1, 2)', () => {
  it('skips comment lines and keeps one row per data line, in file order', () => {
    expect(parse().kanji.map((k) => k.literal)).toEqual([
      '唖',
      '亜',
      '化',
      '花',
      '都',
      '阡',
      '小',
      '月',
    ]);
  });

  it('keeps components in file order, with the code point of the kanji', () => {
    const row = parse().kanji[0];
    expect(row?.codepoint).toBe(0x5516);
    expect(row?.components.map((c) => c.component)).toEqual(['｜', '一', '口']);
  });

  it('carries source, source_version and license on every row', () => {
    for (const k of parse().kanji) {
      expect(k).toMatchObject({
        source: 'kradfile',
        sourceVersion: 'v-test',
        license: 'CC BY-SA 4.0',
      });
    }
  });
});

describe('parseKradfile: substitute characters (AC 3)', () => {
  it('maps a substitute to the intended component and its Kangxi radical', () => {
    expect(parse().kanji.find((k) => k.literal === '花')?.components).toEqual([
      { component: '艹', radical: 140 },
      { component: '亻', radical: 9 },
    ]);
  });

  it('maps 邦 to right 阝 (163) and 阡 to left 阝 (170)', () => {
    expect(
      parse()
        .kanji.find((k) => k.literal === '都')
        ?.components.at(-1),
    ).toEqual({
      component: '阝',
      radical: 163,
    });
    expect(
      parse()
        .kanji.find((k) => k.literal === '阡')
        ?.components.at(-1),
    ).toEqual({
      component: '阝',
      radical: 170,
    });
  });

  it('maps a substitute with no radical-table entry to its documented code point', () => {
    expect(parse().kanji.find((k) => k.literal === '小')?.components).toEqual([
      { component: '⺌', radical: null },
    ]);
  });

  it('does not map the kanji literal itself, only components', () => {
    expect(parse().kanji.find((k) => k.literal === '化')?.literal).toBe('化');
    expect(forms('化')).toEqual(['亻', '匕']);
  });

  it('leaves ordinary components alone, including plain 月 (no radical)', () => {
    expect(parse().kanji.find((k) => k.literal === '月')?.components).toEqual([
      { component: '月', radical: null },
    ]);
  });
});

describe('parseKradfile: bad lines (AC 4)', () => {
  it('reports a malformed line with its line number and keeps parsing', () => {
    const { badLines, kanji } = parse();
    expect(badLines).toEqual([
      { line: 26, text: 'this line is malformed', reason: expect.any(String) },
    ]);
    expect(kanji.map((k) => k.literal)).toContain('月');
  });

  it('reports blank lines, a kanji with no components, and duplicates', () => {
    const { kanji, badLines } = parse('亜 : 口\n\n日 : \n亜 : 一\r\n木 : 木\n');
    expect(kanji.map((k) => k.literal)).toEqual(['亜', '木']);
    expect(badLines.map((b) => b.line)).toEqual([2, 3, 4]);
  });
});
