/**
 * Cross-checks (W02-5 AC 1, 2; pipeline.md §3.3): KRADFILE against KanjiVG decompositions, and the
 * stroke counts of KANJIDIC2, KanjiVG and Unihan. Pure: plain data in, review items out.
 */

export type Check =
  | 'decomposition-missing-in-kanjivg'
  | 'decomposition-missing-in-kradfile'
  | 'decomposition-no-data'
  | 'strokes';

/** Report order of the checks. */
export const CHECKS: readonly Check[] = [
  'decomposition-missing-in-kanjivg',
  'decomposition-missing-in-kradfile',
  'decomposition-no-data',
  'strokes',
];

export interface KanjiInfo {
  readonly literal: string;
  /** KANJIDIC2 stroke count. */
  readonly strokes: number;
  readonly freqRank: number | null;
}

export interface VgComponent {
  readonly slug: string;
  readonly glyph: string;
  /** 1 = direct child of the kanji. */
  readonly depth: number;
}

export interface VgInfo {
  /** In pre-order. */
  readonly components: readonly VgComponent[];
  /** Number of stroke paths. */
  readonly strokes: number;
}

export interface CrosscheckInput {
  /** The kanji to check (the Jōyō set). */
  readonly kanji: readonly KanjiInfo[];
  /** Literal to KRADFILE components (after the W01-5 substitutes). */
  readonly krad: ReadonlyMap<string, readonly string[]>;
  readonly kanjivg: ReadonlyMap<string, VgInfo>;
  /** Literal to Unihan kTotalStrokes values. */
  readonly unihan: ReadonlyMap<string, readonly number[]>;
}

export interface ReviewItem {
  readonly id: string;
  readonly check: Check;
  readonly kanji: string;
  readonly freqRank: number | null;
  readonly evidence: Readonly<Record<string, unknown>>;
  /** What an override would do; null when the sources give no clear answer. */
  readonly suggested: Readonly<Record<string, unknown>> | null;
  /** Set when the owner decided this item but the evidence differs from what they saw. */
  readonly changedSinceDecision?: {
    readonly decision: string;
    readonly decidedEvidence: Readonly<Record<string, unknown>>;
  };
}

const MEAT_RADICAL = '⺼'; // ⺼, KanjiVG's form of 月 as 肉 (W01-5 note)

/** 月 and ⺼ count as the same component. */
export function canonical(glyph: string): string {
  return glyph === MEAT_RADICAL ? '月' : glyph;
}

/** `U+4E00` form of a one-code-point string. */
export function hex(glyph: string): string {
  return `U+${glyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

function unique<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

export function checkDecomposition(input: CrosscheckInput): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const k of input.kanji) {
    const krad = input.krad.get(k.literal);
    const vg = input.kanjivg.get(k.literal);
    const base = { kanji: k.literal, freqRank: k.freqRank };
    if (!krad || !vg) {
      for (const [name, present] of [
        ['kradfile', !!krad],
        ['kanjivg', !!vg],
      ] as const) {
        if (present) continue;
        items.push({
          ...base,
          id: `decomposition-no-data:${hex(k.literal)}:${name}`,
          check: 'decomposition-no-data',
          evidence: { missingIn: name, kradfile: krad ?? null, kanjivg: vg ? true : null },
          suggested: null,
        });
      }
      continue;
    }
    const vgAll = unique(vg.components.map((c) => canonical(c.glyph)));
    const kradCanon = new Set(krad.map(canonical));
    const self = canonical(k.literal);
    const evidence = {
      kradfile: [...krad],
      kanjivg: unique(vg.components.map((c) => c.glyph)),
    };
    for (const c of unique(krad)) {
      if (canonical(c) === self || vgAll.includes(canonical(c))) continue;
      items.push({
        ...base,
        id: `decomposition-missing-in-kanjivg:${hex(k.literal)}:${hex(c)}`,
        check: 'decomposition-missing-in-kanjivg',
        evidence: { component: c, ...evidence },
        suggested: { field: 'components', remove: c },
      });
    }
    const seen = new Set<string>();
    for (const c of vg.components) {
      if (c.depth !== 1 || seen.has(c.slug)) continue;
      seen.add(c.slug);
      if (canonical(c.glyph) === self || kradCanon.has(canonical(c.glyph))) continue;
      items.push({
        ...base,
        id: `decomposition-missing-in-kradfile:${hex(k.literal)}:${c.slug}`,
        check: 'decomposition-missing-in-kradfile',
        evidence: { component: c.glyph, slug: c.slug, ...evidence },
        suggested: { field: 'components', add: c.glyph },
      });
    }
  }
  return items;
}

/** The value most sources agree on, or null when there is no strict winner of at least two. */
function suggestStrokes(
  kd: number,
  vg: number | null,
  uni: readonly number[] | null,
): number | null {
  const candidates = unique([kd, ...(vg === null ? [] : [vg]), ...(uni ?? [])]);
  const votes = candidates.map((v) => ({
    v,
    n: (kd === v ? 1 : 0) + (vg === v ? 1 : 0) + (uni?.includes(v) ? 1 : 0),
  }));
  votes.sort((a, b) => b.n - a.n);
  const [top, next] = votes;
  return top && top.n >= 2 && (!next || next.n < top.n) ? top.v : null;
}

export function checkStrokes(input: CrosscheckInput): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const k of input.kanji) {
    const vg = input.kanjivg.get(k.literal)?.strokes ?? null;
    const uni = input.unihan.get(k.literal) ?? null;
    const agrees = (vg === null || vg === k.strokes) && (uni === null || uni.includes(k.strokes));
    if (agrees) continue;
    const suggestion = suggestStrokes(k.strokes, vg, uni);
    items.push({
      id: `strokes:${hex(k.literal)}`,
      check: 'strokes',
      kanji: k.literal,
      freqRank: k.freqRank,
      evidence: { kanjidic2: k.strokes, kanjivg: vg, unihan: uni ? [...uni] : null },
      suggested: suggestion === null ? null : { field: 'strokes', value: suggestion },
    });
  }
  return items;
}
