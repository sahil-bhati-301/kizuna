/**
 * W02-1 test plan, property tests: on random KanjiVG-shaped bundles,
 *   - every component slug in kanji_component exists in component;
 *   - depth >= 1, and each row's depth, position, role and slug follow its element;
 *   - ord is the pre-order index within the kanji (Q4a): 1..n, unique, so no primary key repeats,
 *     also after split parts are merged (part 2 takes no ord);
 *   - stroke count = number of <path> elements of the kanji.
 * Role rule (Q2a, Q5a): kvg:phon → phonetic; kvg:radical general or tradit in a kanji that has a
 * kvg:phon → semantic; otherwise (nelson, jis, no phon) unknown. The generator never puts kvg:phon and kvg:radical on the same element.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mapPosition, parseKanjivg } from './index.ts';

const PROVENANCE = { source: 'kanjivg', sourceVersion: 'test', license: 'CC BY-SA 3.0' };
const GLYPHS = ['口', '木', '日', '寺', '土', '亻', '氵', '寸'] as const;
const POSITIONS = [
  'left',
  'right',
  'top',
  'bottom',
  'nyo',
  'nyoc',
  'tare',
  'tarec',
  'kamae',
  'kamae1',
  'kamae2',
  'kamaec',
  'middle',
] as const;
const RADICALS = ['general', 'tradit', 'nelson', 'jis'] as const;

interface Node {
  glyph: string | null;
  pos: string | null;
  flag: 'phon' | 'radical' | null;
  radical: (typeof RADICALS)[number];
  paths: number;
  split: boolean;
  children: Node[];
}

const { node } = fc.letrec<{ node: Node }>((tie) => ({
  node: fc.record({
    glyph: fc.option(fc.constantFrom(...GLYPHS), { nil: null }),
    pos: fc.option(fc.constantFrom(...POSITIONS), { nil: null }),
    flag: fc.constantFrom('phon' as const, 'radical' as const, null),
    radical: fc.constantFrom(...RADICALS),
    paths: fc.integer({ min: 0, max: 3 }),
    split: fc.boolean(),
    children: fc.oneof(
      { maxDepth: 3, depthSize: 'small' },
      fc.constant([] as Node[]),
      fc.array(tie('node'), { maxLength: 3 }),
    ),
  }),
}));

interface Expected {
  id: string;
  parent: string | null;
  depth: number;
  slug: string;
  pos: string | null;
  flag: Node['flag'];
  radical: Node['radical'];
}

/** Renders one kanji in release-bundle shape and records what each element should become. */
function renderKanji(cp: number, roots: Node[]) {
  const hex = cp.toString(16).padStart(5, '0');
  const expected: Expected[] = [];
  let strokes = 0;
  let g = 0;
  let s = 0;
  const path = () => {
    strokes++;
    return `<path id="kvg:${hex}-s${++s}" d="M0,0"/>`;
  };
  const attrs = (n: Node, part?: number) =>
    (n.glyph === null ? '' : ` kvg:element="${n.glyph}"`) +
    (part === undefined ? '' : ` kvg:part="${part}"`) +
    (n.pos === null ? '' : ` kvg:position="${n.pos}"`) +
    (n.flag === 'phon' ? ` kvg:phon="${n.glyph ?? 'x'}${part ?? ''}"` : '') +
    (n.flag === 'radical' ? ` kvg:radical="${n.radical}"` : '');

  function list(nodes: Node[], parent: string | null, depth: number): string {
    const splitAt = nodes.findIndex((n) => n.split && n.glyph !== null);
    let out = '';
    nodes.forEach((n, i) => {
      const id = `kvg:${hex}-g${++g}`;
      const part = i === splitAt ? 1 : undefined;
      expected.push({
        id,
        parent,
        depth,
        slug: n.glyph ?? id,
        pos: n.pos,
        flag: n.flag,
        radical: n.radical,
      });
      out += `<g id="${id}"${attrs(n, part)}>`;
      for (let p = 0; p < n.paths; p++) out += path();
      out += list(n.children, id, depth + 1);
      out += '</g>\n';
    });
    if (splitAt >= 0) {
      const n = nodes[splitAt]!;
      out += `<g id="kvg:${hex}-g${++g}"${attrs(n, 2)}>${path()}</g>\n`;
    }
    return out;
  }

  const body = list(roots, null, 1);
  const literal = String.fromCodePoint(cp);
  const xml =
    `<kanji id="kvg:kanji_${hex}">\n<g id="kvg:${hex}" kvg:element="${literal}">\n` +
    `${body}</g>\n</kanji>\n`;
  return { literal, xml, expected, strokes };
}

const bundleArb = fc.array(fc.array(node, { minLength: 1, maxLength: 4 }), {
  minLength: 1,
  maxLength: 4,
});

function build(kanji: Node[][]) {
  const rendered = kanji.map((roots, i) => renderKanji(0x4e00 + i, roots));
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<kanjivg xmlns:kvg='http://kanjivg.tagaini.net'>\n` +
    `${rendered.map((r) => r.xml).join('')}</kanjivg>\n`;
  return { xml, rendered };
}

describe('kanjivg parser properties', () => {
  it('every kanji_component slug exists in component; slugs and kanjivg_id are unique', async () => {
    await fc.assert(
      fc.asyncProperty(bundleArb, async (kanji) => {
        const { xml } = build(kanji);
        const { components, kanjiComponents } = await parseKanjivg([xml], PROVENANCE);
        const slugs = new Set(components.map((c) => c.slug));
        expect(slugs.size).toBe(components.length);
        for (const r of kanjiComponents) expect(slugs.has(r.componentSlug)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('gives one row per element (split parts merged), with depth >= 1 and the element’s fields', async () => {
    await fc.assert(
      fc.asyncProperty(bundleArb, async (kanji) => {
        const { xml, rendered } = build(kanji);
        const { kanjiComponents } = await parseKanjivg([xml], PROVENANCE);
        for (const k of rendered) {
          const rows = kanjiComponents.filter((r) => r.kanjiLiteral === k.literal);
          expect(rows).toHaveLength(k.expected.length);
          const hasPhon = k.expected.some((e) => e.flag === 'phon');
          for (const e of k.expected) {
            const row = rows.find((r) => r.kvgId === e.id);
            expect(row).toBeDefined();
            expect(row!.depth).toBeGreaterThanOrEqual(1);
            expect(row).toMatchObject({
              depth: e.depth,
              parentKvgId: e.parent,
              componentSlug: e.slug,
              position: mapPosition(e.pos ?? undefined),
              role:
                e.flag === 'phon'
                  ? 'phonetic'
                  : e.flag === 'radical' &&
                      (e.radical === 'general' || e.radical === 'tradit') &&
                      hasPhon
                    ? 'semantic'
                    : 'unknown',
            });
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('numbers ord 1..n per kanji in pre-order; siblings ascend; no primary key repeats', async () => {
    await fc.assert(
      fc.asyncProperty(bundleArb, async (kanji) => {
        const { xml, rendered } = build(kanji);
        const { kanjiComponents } = await parseKanjivg([xml], PROVENANCE);
        for (const k of rendered) {
          const rows = kanjiComponents.filter((r) => r.kanjiLiteral === k.literal);
          expect(rows.map((r) => r.ord).sort((x, y) => x - y)).toEqual(rows.map((_, i) => i + 1));
          // k.expected is in pre-order and leaves out part 2 of a split element.
          k.expected.forEach((e, i) => {
            expect(rows.find((r) => r.kvgId === e.id)?.ord).toBe(i + 1);
          });
          const docOrder = new Map(k.expected.map((e, i) => [e.id, i] as const));
          for (const r of rows) {
            const sameParent = rows.filter((x) => x.parentKvgId === r.parentKvgId);
            for (const x of sameParent) {
              if (docOrder.get(x.kvgId)! < docOrder.get(r.kvgId)!)
                expect(x.ord).toBeLessThan(r.ord);
            }
          }
        }
        const pks = kanjiComponents.map(
          (r) => `${r.kanjiLiteral}|${r.componentSlug}|${r.depth}|${r.ord}`,
        );
        expect(new Set(pks).size).toBe(pks.length);
      }),
      { numRuns: 100 },
    );
  });

  it('counts one stroke per <path> element of each kanji', async () => {
    await fc.assert(
      fc.asyncProperty(bundleArb, async (kanji) => {
        const { xml, rendered } = build(kanji);
        const { strokes, report } = await parseKanjivg([xml], PROVENANCE);
        expect(report.kanjiCount).toBe(rendered.length);
        for (const k of rendered) {
          expect(strokes.find((x) => x.kanji === k.literal)?.strokes).toBe(k.strokes);
        }
      }),
      { numRuns: 100 },
    );
  });
});
