/**
 * W02-1 AC 1-5: the KanjiVG parser (here, not in domain/: it reads the fixture file) (element tree → `component`, `kanji_component`, stroke counts).
 * Expected values are hand-read from test/fixtures/kanjivg-excerpt.xml (KanjiVG commit 9d7220df).
 * Owner answers: Q1a positions, Q2a roles, Q3a slugs, Q4a ord = pre-order index within the kanji,
 * Q5a only kvg:radical general/tradit count as semantic, Q6a a merged split element takes the
 * place of kvg:part="1", Q7 glyph 〓 for code-point-less components and `middle` → unknown.
 *
 * API expected from `src/domain/kanjivg/index.ts`:
 *   parseKanjivg(chunks: Iterable<string> | AsyncIterable<string>, provenance): Promise<KanjivgRows>
 *     KanjivgRows = { components: ComponentRow[]; kanjiComponents: KanjiComponentRow[];
 *                     strokes: StrokeCount[]; report: KanjivgReport }   (unsorted; the import sorts)
 *     ComponentRow      = { slug, glyph, kanjiVgId: string | null, radicalNumber: number | null, ...provenance }
 *     KanjiComponentRow = { kanjiLiteral, componentSlug, position, role, depth, ord,
 *                           kvgId (element ID of the row, part 1 for split elements),
 *                           parentKvgId: string | null (null at depth 1), ...provenance }
 *     StrokeCount       = { kanji: string; strokes: number }
 *     KanjivgReport     = { kanjiCount, componentRows, kanjiComponentRows, unknownRoles,
 *                           unknownPositions, codepointlessComponents }
 *   mapPosition(kvgPosition: string | undefined): KanjiPosition   (Q1a table; unmapped → 'unknown')
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapPosition, parseKanjivg } from '../domain/kanjivg/index.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const xml = readFileSync(at('../../test/fixtures/kanjivg-excerpt.xml'), 'utf8');
const PROVENANCE = { source: 'kanjivg', sourceVersion: 'test', license: 'CC BY-SA 3.0' };
const GETA = '〓';
const NIKUZUKI = '⺼';

const run = (chunks: Iterable<string> | AsyncIterable<string> = [xml]) =>
  parseKanjivg(chunks, PROVENANCE);

/** The rows of one kanji as { slug, position, role, depth, ord }, sorted by ord. */
async function rowsOf(kanji: string, source = xml) {
  const { kanjiComponents } = await run([source]);
  return kanjiComponents
    .filter((r) => r.kanjiLiteral === kanji)
    .map((r) => ({
      slug: r.componentSlug,
      position: r.position,
      role: r.role,
      depth: r.depth,
      ord: r.ord,
    }))
    .sort((a, b) => a.ord - b.ord);
}

describe('position map (AC 2, Q1a, Q7)', () => {
  it.each([
    ['left', 'hen'],
    ['right', 'tsukuri'],
    ['top', 'kanmuri'],
    ['bottom', 'ashi'],
    ['nyo', 'nyō'],
    ['nyoc', 'nyō'],
    ['tare', 'tare'],
    ['tarec', 'tare'],
    ['kamae', 'kamae'],
    ['kamae1', 'kamae'],
    ['kamae2', 'kamae'],
    ['kamaec', 'kamae'],
    ['middle', 'unknown'],
  ])('maps %s to %s', (kvg, schema) => {
    expect(mapPosition(kvg)).toBe(schema);
  });

  it('maps a missing position to none', () => {
    expect(mapPosition(undefined)).toBe('none');
  });

  it('maps at every depth, not only depth 1 (待: 寺 → 土 top, 寸 bottom)', async () => {
    const rows = await rowsOf('待');
    expect(rows.find((r) => r.slug === '土')).toMatchObject({ depth: 2, position: 'kanmuri' });
    expect(rows.find((r) => r.slug === '寸')).toMatchObject({ depth: 2, position: 'ashi' });
  });

  it('gives middle position unknown and counts it in the report', async () => {
    const mid = xml.replace(
      'kvg:element="也" kvg:position="right"',
      'kvg:element="也" kvg:position="middle"',
    );
    expect(mid).not.toBe(xml);
    expect((await rowsOf('池', mid)).find((r) => r.slug === '也')).toMatchObject({
      position: 'unknown',
    });
    expect((await run([mid])).report.unknownPositions).toBe(1);
    expect((await run()).report.unknownPositions).toBe(0);
  });
});

describe('tree, depth and order (AC 1, Q4a)', () => {
  it('flattens 持 with depth (1 = direct child) and pre-order ord within the kanji', async () => {
    expect(await rowsOf('持')).toEqual([
      { slug: '扌', position: 'hen', role: 'semantic', depth: 1, ord: 1 },
      { slug: '寺', position: 'tsukuri', role: 'phonetic', depth: 1, ord: 2 },
      { slug: '土', position: 'none', role: 'unknown', depth: 2, ord: 3 },
      { slug: '寸', position: 'none', role: 'unknown', depth: 2, ord: 4 },
    ]);
  });

  it('flattens 待 in pre-order: a child follows its parent', async () => {
    expect(await rowsOf('待')).toEqual([
      { slug: '彳', position: 'hen', role: 'semantic', depth: 1, ord: 1 },
      { slug: '亻', position: 'none', role: 'unknown', depth: 2, ord: 2 },
      { slug: '寺', position: 'tsukuri', role: 'phonetic', depth: 1, ord: 3 },
      { slug: '土', position: 'kanmuri', role: 'unknown', depth: 2, ord: 4 },
      { slug: '寸', position: 'ashi', role: 'unknown', depth: 2, ord: 5 },
    ]);
  });

  it('keeps both 立 (and both 亠, 口, 兄, 儿, 丿) of 競 with distinct primary keys', async () => {
    const rows = await rowsOf('競');
    expect(rows.map((r) => [r.slug, r.depth, r.ord])).toEqual([
      ['kvg:07af6-g1', 1, 1],
      ['立', 2, 2],
      ['亠', 3, 3],
      ['kvg:07af6-g4', 3, 4],
      ['兄', 2, 5],
      ['口', 3, 6],
      ['儿', 3, 7],
      ['丿', 4, 8],
      ['kvg:07af6-g9', 1, 9],
      ['立', 2, 10],
      ['亠', 3, 11],
      ['kvg:07af6-g12', 3, 12],
      ['兄', 2, 13],
      ['口', 3, 14],
      ['儿', 3, 15],
      ['丿', 4, 16],
    ]);
    const pks = rows.map((r) => `${r.slug}|${r.depth}|${r.ord}`);
    expect(new Set(pks).size).toBe(16);
  });

  it('links each row to its parent element (null at depth 1)', async () => {
    const { kanjiComponents } = await run();
    const ji = kanjiComponents.filter((r) => r.kanjiLiteral === '待');
    expect(ji.find((r) => r.componentSlug === '亻')).toMatchObject({
      kvgId: 'kvg:05f85-g2',
      parentKvgId: 'kvg:05f85-g1',
    });
    expect(ji.find((r) => r.componentSlug === '寺')).toMatchObject({
      kvgId: 'kvg:05f85-g3',
      parentKvgId: null,
    });
  });

  it('shares 寺 across 持, 待 and 特 as one component row', async () => {
    const { components, kanjiComponents } = await run();
    expect(components.filter((c) => c.slug === '寺')).toHaveLength(1);
    const users = kanjiComponents
      .filter((r) => r.componentSlug === '寺')
      .map((r) => r.kanjiLiteral);
    expect(users.sort()).toEqual(['待', '持', '特'].sort());
  });

  it('gives the same rows however the text is chunked', async () => {
    const whole = await run();
    for (const size of [1, 7, 64]) {
      const chunks = xml.match(new RegExp(`[\\s\\S]{1,${size}}`, 'gu')) ?? [];
      expect(await run(chunks)).toEqual(whole);
    }
  });

  it('accepts an async iterable', async () => {
    async function* gen() {
      yield xml.slice(0, 1000);
      yield xml.slice(1000);
    }
    expect(await run(gen())).toEqual(await run());
  });
});

describe('split elements (AC 2, Q6a)', () => {
  it('merges 囗 part 1 and part 2 in 回 into one row', async () => {
    expect(await rowsOf('回')).toEqual([
      { slug: '囗', position: 'kamae', role: 'unknown', depth: 1, ord: 1 },
      { slug: '口', position: 'none', role: 'unknown', depth: 1, ord: 2 },
    ]);
  });

  it('merges 衣 in 哀 into one row at the place of part 1; part 2 takes no ord', async () => {
    expect(await rowsOf('哀')).toEqual([
      { slug: '衣', position: 'kanmuri', role: 'phonetic', depth: 1, ord: 1 },
      { slug: '亠', position: 'kanmuri', role: 'unknown', depth: 2, ord: 2 },
      { slug: 'kvg:054c0-g3', position: 'ashi', role: 'unknown', depth: 1, ord: 3 },
      { slug: '口', position: 'none', role: 'semantic', depth: 2, ord: 4 },
    ]);
    const { kanjiComponents } = await run();
    expect(
      kanjiComponents.find((r) => r.kanjiLiteral === '哀' && r.componentSlug === '衣'),
    ).toMatchObject({ kvgId: 'kvg:054c0-g1', parentKvgId: null });
  });
});

describe('normalisation (AC 3)', () => {
  it('keys 月 used as 肉 (kvg:original="肉") as ⺼ (slug and glyph), linked to radical 130', async () => {
    const rows = await rowsOf('肝');
    expect(rows.map((r) => r.slug)).toEqual([NIKUZUKI, '干', '十']);
    const { components } = await run();
    expect(components.find((c) => c.slug === NIKUZUKI)).toMatchObject({
      glyph: NIKUZUKI,
      kanjiVgId: null,
      radicalNumber: 130,
    });
  });

  it('keeps plain 月 (no kvg:original) as 月 (明)', async () => {
    const rows = await rowsOf('明');
    expect(rows.find((r) => r.slug === '月')).toMatchObject({ depth: 1, ord: 2 });
    expect(rows.map((r) => r.slug)).not.toContain(NIKUZUKI);
  });

  it.each([
    ['氵', 85],
    ['扌', 64],
    ['亻', 9],
  ])('links the radical variant %s to Kangxi %i', async (slug, kangxi) => {
    const { components } = await run();
    expect(components.find((c) => c.slug === slug)).toMatchObject({ radicalNumber: kangxi });
  });

  it('applies NFC to component glyphs', async () => {
    const compat = xml.replace(
      'kvg:element="月" kvg:position="right"',
      'kvg:element="欄" kvg:position="right"',
    );
    expect(compat).not.toBe(xml);
    const { components, kanjiComponents } = await run([compat]);
    expect(components.map((c) => c.slug)).toContain('欄');
    expect(components.map((c) => c.slug)).not.toContain('欄');
    expect(kanjiComponents.map((r) => r.componentSlug)).not.toContain('欄');
  });

  it('uses the glyph as slug for code-point components, with no kanjivg_id', async () => {
    const { components } = await run();
    expect(components.find((c) => c.slug === '寺')).toMatchObject({ glyph: '寺', kanjiVgId: null });
    expect(components.find((c) => c.slug === '扌')).toMatchObject({ glyph: '扌', kanjiVgId: null });
  });
});

describe('elements with no code point (AC 3, Q3a, Q7)', () => {
  it('slugs the unnamed bottom group of 衣 as kvg:<element id>, glyph 〓, kanjivg_id set', async () => {
    const { components } = await run();
    expect(components.find((c) => c.slug === 'kvg:08863-g2')).toMatchObject({
      glyph: GETA,
      kanjiVgId: 'kvg:08863-g2',
    });
    expect(await rowsOf('衣')).toEqual([
      { slug: '亠', position: 'kanmuri', role: 'unknown', depth: 1, ord: 1 },
      { slug: 'kvg:08863-g2', position: 'ashi', role: 'unknown', depth: 1, ord: 2 },
    ]);
  });

  it('never groups unnamed elements across kanji, and counts them in the report', async () => {
    const { components, report } = await run();
    const kvg = components.filter((c) => c.slug.startsWith('kvg:'));
    expect(kvg.map((c) => c.slug).sort()).toEqual([
      'kvg:054c0-g3',
      'kvg:07af6-g1',
      'kvg:07af6-g12',
      'kvg:07af6-g4',
      'kvg:07af6-g9',
      'kvg:08863-g2',
    ]);
    for (const c of kvg) expect(c).toMatchObject({ glyph: GETA, kanjiVgId: c.slug });
    expect(report.codepointlessComponents).toBe(6);
  });
});

describe('roles (AC 4, Q2a, Q5a)', () => {
  it('gives phonetic for kvg:phon and semantic for the general radical of a phono-semantic kanji', async () => {
    const { kanjiComponents } = await run();
    const role = (k: string, s: string) =>
      kanjiComponents.find((r) => r.kanjiLiteral === k && r.componentSlug === s)?.role;
    expect([role('持', '扌'), role('持', '寺')]).toEqual(['semantic', 'phonetic']);
    expect([role('特', '牛'), role('特', '寺')]).toEqual(['semantic', 'phonetic']);
    expect([role('肝', NIKUZUKI), role('肝', '干')]).toEqual(['semantic', 'phonetic']);
    expect([role('池', '氵'), role('池', '也')]).toEqual(['semantic', 'phonetic']);
  });

  it('counts kvg:radical="tradit" as semantic, "nelson" not (哀: 口 semantic, 亠 unknown)', async () => {
    const rows = await rowsOf('哀');
    expect(rows.find((r) => r.slug === '口')?.role).toBe('semantic');
    expect(rows.find((r) => r.slug === '亠')?.role).toBe('unknown');
  });

  it('gives jis radicals unknown', async () => {
    const jis = xml.replace(
      'kvg:element="氵" kvg:variant="true" kvg:original="水" kvg:position="left" kvg:radical="general"',
      'kvg:element="氵" kvg:variant="true" kvg:original="水" kvg:position="left" kvg:radical="jis"',
    );
    expect(jis).not.toBe(xml);
    expect((await rowsOf('池', jis)).find((r) => r.slug === '氵')?.role).toBe('unknown');
  });

  it('leaves a kvg:radical element unknown when the kanji has no kvg:phon (明, 回, 競)', async () => {
    const { kanjiComponents } = await run();
    const roles = kanjiComponents
      .filter((r) => ['明', '回', '競'].includes(r.kanjiLiteral))
      .map((r) => r.role);
    expect(new Set(roles)).toEqual(new Set(['unknown']));
  });

  it('never produces form (curated overrides only), and counts unknown roles', async () => {
    const { kanjiComponents, report } = await run();
    expect(kanjiComponents.every((r) => ['semantic', 'phonetic', 'unknown'].includes(r.role))).toBe(
      true,
    );
    expect(report.unknownRoles).toBe(kanjiComponents.filter((r) => r.role === 'unknown').length);
    expect(report.unknownRoles).toBeGreaterThan(0);
  });
});

describe('stroke counts and report (AC 5, 6)', () => {
  it('counts stroke paths per kanji', async () => {
    const { strokes } = await run();
    const byKanji = Object.fromEntries(strokes.map((s) => [s.kanji, s.strokes]));
    expect(byKanji).toEqual({
      哀: 9,
      回: 6,
      待: 9,
      持: 9,
      明: 8,
      池: 6,
      特: 10,
      競: 20,
      肝: 7,
      衣: 6,
    });
  });

  it('reports kanji, component and kanji_component counts', async () => {
    const { report, components, kanjiComponents } = await run();
    expect(report).toMatchObject({ kanjiCount: 10, componentRows: 29, kanjiComponentRows: 45 });
    expect(components).toHaveLength(29);
    expect(kanjiComponents).toHaveLength(45);
  });

  it('carries source, source_version and license on every row', async () => {
    const { components, kanjiComponents } = await run();
    for (const row of [...components, ...kanjiComponents]) {
      expect(row).toMatchObject({
        source: 'kanjivg',
        sourceVersion: 'test',
        license: 'CC BY-SA 3.0',
      });
    }
  });
});
