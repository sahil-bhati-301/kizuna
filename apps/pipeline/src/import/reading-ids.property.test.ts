/**
 * W01-3 test plan, property: every output reading ID parses back to (kanji, kind, kana) and
 * no two reading rows share an ID; chunk boundaries never change the parse.
 *
 * Needs devDependency fast-check and dependency @kizuna/content in apps/pipeline/package.json.
 *
 * "Parses back to kana" is checked without fixing the ID's kana form (WP OPEN-Q): the parsed kana,
 * with `.` and `-` markers removed, must equal the row's kana followed by its okurigana.
 */
import { parseReadingId } from '@kizuna/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseKanjidic } from '../domain/kanjidic/index.ts';

const PROVENANCE = { source: 'kanjidic2', sourceVersion: '2026-331', license: 'CC BY-SA 4.0' };
const HIRA = Array.from(
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわんがぎぐげござじずぜぞ',
);
const KATA = Array.from(
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワンガギグゲゴ',
);

const str = (alphabet: string[], min: number, max: number) =>
  fc.array(fc.constantFrom(...alphabet), { minLength: min, maxLength: max }).map((a) => a.join(''));

const kun = fc
  .tuple(
    str(HIRA, 1, 3),
    fc.option(str(HIRA, 1, 3), { nil: undefined }),
    fc.constantFrom('', 'prefix', 'suffix'),
  )
  .map(([stem, oku, affix]) => {
    const body = oku === undefined ? stem : `${stem}.${oku}`;
    return affix === 'prefix' ? `${body}-` : affix === 'suffix' ? `-${body}` : body;
  });

const entry = fc.record({
  on: fc.array(str(KATA, 1, 3), { maxLength: 4 }),
  kun: fc.array(kun, { maxLength: 6 }),
  nanori: fc.array(str(HIRA, 1, 4), { maxLength: 4 }),
});

const entries = fc
  .uniqueArray(fc.integer({ min: 0x4e00, max: 0x9fff }), { minLength: 1, maxLength: 5 })
  .chain((cps) =>
    fc.tuple(
      ...cps.map((cp) => entry.map((e) => ({ literal: String.fromCodePoint(cp), cp, ...e }))),
    ),
  );

type Entry = { literal: string; cp: number; on: string[]; kun: string[]; nanori: string[] };
function toXml(list: readonly Entry[]): string {
  const chars = list.map(
    (e) => `<character>
<literal>${e.literal}</literal>
<codepoint><cp_value cp_type="ucs">${e.cp.toString(16)}</cp_value></codepoint>
<radical><rad_value rad_type="classical">1</rad_value></radical>
<misc><stroke_count>1</stroke_count></misc>
<reading_meaning>
<rmgroup>
${e.on.map((r) => `<reading r_type="ja_on">${r}</reading>`).join('\n')}
${e.kun.map((r) => `<reading r_type="ja_kun">${r}</reading>`).join('\n')}
<meaning>test</meaning>
</rmgroup>
${e.nanori.map((r) => `<nanori>${r}</nanori>`).join('\n')}
</reading_meaning>
</character>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
<header><file_version>4</file_version><database_version>test</database_version><date_of_creation>2026-11-27</date_of_creation></header>
${chars.join('\n')}
</kanjidic2>
`;
}

describe('reading IDs (property)', () => {
  it('every reading ID parses back to its row kanji, kind and kana; no duplicate IDs', async () => {
    await fc.assert(
      fc.asyncProperty(entries, async (list) => {
        const { readings } = await parseKanjidic([toXml(list)], PROVENANCE);
        const ids = readings.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const r of readings) {
          const parts = parseReadingId(r.id);
          expect(parts, r.id).toBeDefined();
          expect(parts?.kanji).toBe(r.kanjiLiteral);
          expect(parts?.kind).toBe(r.kind);
          expect(parts?.kana.replace(/[.-]/gu, '')).toBe(r.kana + (r.okurigana ?? ''));
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every source reading of kind on, kun or nanori yields a row (nothing silently lost)', async () => {
    await fc.assert(
      fc.asyncProperty(entries, async (list) => {
        const { readings } = await parseKanjidic([toXml(list)], PROVENANCE);
        for (const e of list) {
          const mine = readings.filter((r) => r.kanjiLiteral === e.literal);
          if (e.on.length > 0) expect(mine.some((r) => r.kind === 'on')).toBe(true);
          if (e.kun.length > 0) expect(mine.some((r) => r.kind === 'kun')).toBe(true);
          if (e.nanori.length > 0) expect(mine.some((r) => r.kind === 'nanori')).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('chunk boundaries never change the parse', async () => {
    await fc.assert(
      fc.asyncProperty(
        entries,
        fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 1 }),
        async (list, sizes) => {
          const xml = toXml(list);
          const chars = Array.from(xml);
          const chunks: string[] = [];
          for (let i = 0, j = 0; i < chars.length; j++) {
            const n = sizes[j % sizes.length] ?? 1;
            chunks.push(chars.slice(i, i + n).join(''));
            i += n;
          }
          expect(await parseKanjidic(chunks, PROVENANCE)).toEqual(
            await parseKanjidic([xml], PROVENANCE),
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
