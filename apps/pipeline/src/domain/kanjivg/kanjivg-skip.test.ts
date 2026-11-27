/** W02-1 orchestrator decision: non-Han <kanji> entries are skipped and counted; Han ones kept. */
import { describe, expect, it } from 'vitest';
import { parseKanjivg } from './index.ts';

/** U+FA10, a compatibility ideograph; its NFC form is U+585A. */
const COMPAT = '\u{fa10}';
const PROVENANCE = { source: 'kanjivg', sourceVersion: 'test', license: 'CC BY-SA 3.0' };
const entry = (hex: string, glyph: string) =>
  `<kanji id="kvg:kanji_${hex}">\n<g id="kvg:${hex}" kvg:element="${glyph}">\n` +
  `<g id="kvg:${hex}-g1" kvg:element="${glyph}"><path id="kvg:${hex}-s1" d="M0,0"/></g>\n</g>\n</kanji>\n`;
const bundle = (...entries: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<kanjivg xmlns:kvg='http://kanjivg.tagaini.net'>\n` +
  `${entries.join('')}</kanjivg>\n`;

describe('non-kanji entries', () => {
  it('skips kana, Latin and 〆, keeps kanji, 々, radical forms and compatibility ideographs', async () => {
    const xml = bundle(
      entry('03042', 'あ'),
      entry('00041', 'A'),
      entry('03006', '〆'),
      entry('03005', '々'),
      entry('02e8c', '⺌'),
      entry('0fa10', COMPAT),
      entry('04e00', '一'),
    );
    const { strokes, kanjiComponents, report } = await parseKanjivg([xml], PROVENANCE);
    expect(strokes.map((s) => s.kanji)).toEqual(['々', '⺌', COMPAT, '一']);
    expect(new Set(kanjiComponents.map((r) => r.kanjiLiteral))).toEqual(
      new Set(['々', '⺌', COMPAT, '一']),
    );
    expect(report).toMatchObject({ kanjiCount: 4, nonKanjiSkipped: 3 });
  });
});
