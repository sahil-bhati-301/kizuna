/** W02-5 AC 1-3: component matching, stroke comparison, stable IDs, decided items skipped. */
import { describe, expect, it } from 'vitest';
import { buildQueue, checkDecomposition, checkStrokes, parseUnihanStrokes } from './index.ts';
import type { CrosscheckInput, VgComponent } from './index.ts';

const vc = (glyph: string, depth = 1, slug = glyph): VgComponent => ({ glyph, slug, depth });

function input(over: Partial<CrosscheckInput> = {}): CrosscheckInput {
  return {
    kanji: [{ literal: '肝', strokes: 7, freqRank: 1000 }],
    krad: new Map([['肝', ['月', '干']]]),
    kanjivg: new Map([['肝', { components: [vc('⺼'), vc('干'), vc('十', 2)], strokes: 7 }]]),
    unihan: new Map([['肝', [7]]]),
    ...over,
  };
}

describe('decomposition', () => {
  it('treats 月 and ⺼ as a match', () => {
    expect(checkDecomposition(input())).toEqual([]);
  });

  it('accepts a KRADFILE component found at any depth', () => {
    const i = input({ krad: new Map([['肝', ['月', '十']]]) });
    const items = checkDecomposition(i);
    // 十 is at depth 2 in KanjiVG: not missing. 干 is depth 1 and absent from KRADFILE.
    expect(items.map((x) => x.check)).toEqual(['decomposition-missing-in-kradfile']);
    expect(items[0]!.evidence.component).toBe('干');
  });

  it('lists a KRADFILE component absent from KanjiVG', () => {
    const items = checkDecomposition(input({ krad: new Map([['肝', ['月', '干', '田']]]) }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'decomposition-missing-in-kanjivg:U+809D:U+7530',
      check: 'decomposition-missing-in-kanjivg',
      suggested: { field: 'components', remove: '田' },
    });
  });

  it('lists a kanji missing from one source, and does not compare it', () => {
    const items = checkDecomposition(input({ krad: new Map() }));
    expect(items.map((x) => x.id)).toEqual(['decomposition-no-data:U+809D:kradfile']);
  });

  it('does not list a component that is the kanji itself', () => {
    const i = input({
      kanji: [{ literal: '月', strokes: 4, freqRank: null }],
      krad: new Map([['月', ['月']]]),
      kanjivg: new Map([['月', { components: [], strokes: 4 }]]),
    });
    expect(checkDecomposition(i)).toEqual([]);
  });

  it('lists a depth-1 KanjiVG component once, by slug', () => {
    const i = input({
      krad: new Map([['肝', ['月']]]),
      kanjivg: new Map([
        ['肝', { components: [vc('月'), vc('〓', 1, 'kvg:a'), vc('〓', 1, 'kvg:a')], strokes: 7 }],
      ]),
    });
    expect(checkDecomposition(i).map((x) => x.id)).toEqual([
      'decomposition-missing-in-kradfile:U+809D:kvg:a',
    ]);
  });
});

describe('strokes', () => {
  it('lists no item when all sources agree, or when a source lacks the kanji', () => {
    expect(checkStrokes(input())).toEqual([]);
    expect(checkStrokes(input({ unihan: new Map(), kanjivg: new Map() }))).toEqual([]);
  });

  it('accepts any of several Unihan values', () => {
    expect(checkStrokes(input({ unihan: new Map([['肝', [7, 8]]]) }))).toEqual([]);
  });

  it('lists each source value and suggests the majority', () => {
    const [item] = checkStrokes(input({ unihan: new Map([['肝', [8]]]) }));
    expect(item).toMatchObject({
      id: 'strokes:U+809D',
      evidence: { kanjidic2: 7, kanjivg: 7, unihan: [8] },
      suggested: { field: 'strokes', value: 7 },
    });
  });

  it('suggests nothing without a majority', () => {
    const i = input({
      kanjivg: new Map([['肝', { components: [], strokes: 8 }]]),
      unihan: new Map([['肝', [9]]]),
    });
    expect(checkStrokes(i)[0]!.suggested).toBeNull();
  });
});

describe('queue', () => {
  const bad = input({
    kanji: [
      { literal: '肝', strokes: 7, freqRank: null },
      { literal: '井', strokes: 4, freqRank: 5 },
    ],
    unihan: new Map([
      ['肝', [8]],
      ['井', [5]],
    ]),
    kanjivg: new Map([
      ['肝', { components: [], strokes: 7 }],
      ['井', { components: [], strokes: 4 }],
    ]),
    krad: new Map([
      ['肝', ['肝']],
      ['井', ['井']],
    ]),
  });

  it('orders by check, then frequency (unranked last)', () => {
    expect(buildQueue(bad, []).items.map((i) => i.kanji)).toEqual(['井', '肝']);
  });

  it('gives the same IDs on every run', () => {
    const ids = (q: ReturnType<typeof buildQueue>) => q.items.map((i) => i.id);
    expect(ids(buildQueue(bad, []))).toEqual(ids(buildQueue(bad, [])));
  });

  it('skips decided items, counts them, and reports stale decisions', () => {
    const decision = (id: string) => ({
      id,
      decision: 'accept' as const,
      reason: 'r',
      author: 'a',
    });
    const q = buildQueue(bad, [decision('strokes:U+4E95'), decision('strokes:U+0000:x')]);
    expect(q.items.map((i) => i.kanji)).toEqual(['肝']);
    expect(q.summary).toMatchObject({
      decidedSkipped: 1,
      staleDecisions: ['strokes:U+0000:x'],
      open: { strokes: 1 },
    });
  });
});

describe('changed evidence', () => {
  const base = input({ unihan: new Map([['肝', [8]]]) });
  const decision = (evidence?: Record<string, unknown>) => ({
    id: 'strokes:U+809D',
    decision: 'accept' as const,
    reason: 'r',
    author: 'a',
    ...(evidence ? { evidence } : {}),
  });

  it('keeps the ID when a source value changes', () => {
    const other = input({ unihan: new Map([['肝', [9]]]) });
    expect(checkStrokes(base)[0]!.id).toBe(checkStrokes(other)[0]!.id);
  });

  it('skips an item whose evidence matches the decision', () => {
    const q = buildQueue(base, [decision({ kanjidic2: 7, kanjivg: 7, unihan: [8] })]);
    expect(q.items).toEqual([]);
    expect(q.summary.changedSinceDecision).toBe(0);
  });

  it('lists an item again, marked, when its evidence changed', () => {
    const q = buildQueue(base, [decision({ kanjidic2: 7, kanjivg: 7, unihan: [9] })]);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]!.changedSinceDecision).toMatchObject({ decision: 'accept' });
    expect(q.summary).toMatchObject({ changedSinceDecision: 1, decidedSkipped: 0 });
  });

  it('skips a decision with no recorded evidence', () => {
    expect(buildQueue(base, [decision()]).items).toEqual([]);
  });
});

describe('unihan', () => {
  it('reads kTotalStrokes lines only', () => {
    const text =
      '# c\nU+4E00\tkTotalStrokes\t1\nU+4E00\tkIRG_GSource\tG0\nU+809D\tkTotalStrokes\t7 8\n';
    expect([...parseUnihanStrokes(text)]).toEqual([
      ['一', [1]],
      ['肝', [7, 8]],
    ]);
  });
});
