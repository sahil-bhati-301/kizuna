/**
 * KanjiVG release bundle → `component` and `kanji_component` rows plus stroke counts (W02-1 AC 1-6;
 * content.md §3.1, pipeline.md §3.3-3.4). Streams the XML: each <kanji> is reduced when it closes.
 * Pure: no I/O.
 *
 * Owner decisions (WP OPEN-Q):
 * - Q1, Q7: positions map at every depth by `mapPosition`; `middle` and other names are `unknown`.
 * - Q2, Q5: kvg:phon → phonetic; kvg:radical general/tradit in a kanji with a kvg:phon → semantic;
 *   everything else unknown. `form` is never produced (curated overrides only).
 * - Q3, Q7: an element with no code point is slugged by its element ID (`kvg:05e73-g1`), glyph 〓.
 * - Q4: `ord` is the pre-order index of the row within the kanji, 1..n.
 * - Q6: a split element (kvg:part 1, 2, ...) is one row at the place of part 1.
 * Consequences of those answers, applied here (documented in the WP handoff):
 * - Parts pair by kvg:element and kvg:number: part n joins the latest part n-1 of the same key.
 *   A part n > 1 with nothing to join stays a row of its own and is counted (`unmatchedParts`).
 * - Elements inside a later part belong to the merged row: parent = part 1, depth = its depth + 1.
 * - The merged row is phonetic (or a semantic candidate) when any of its parts carries the mark.
 * - kvg:element values that are not one code point (CDP-8BB0, ...) have no code point (Q3).
 * - The kanji literal is the code point of the <kanji> ID, kept as is (no NFC), so a
 *   compatibility ideograph does not collide with its unified form.
 */
import { nfc, radicalNumber } from '../normalise/index.ts';
import { XmlTokenizer } from './xml.ts';
import type { XmlToken } from './xml.ts';

export interface Provenance {
  readonly source: string;
  readonly sourceVersion: string;
  readonly license: string;
}

export type KanjiPosition =
  'hen' | 'tsukuri' | 'kanmuri' | 'ashi' | 'nyō' | 'tare' | 'kamae' | 'none' | 'unknown';

export type ComponentRole = 'semantic' | 'phonetic' | 'unknown';

export interface ComponentRow extends Provenance {
  readonly slug: string;
  readonly glyph: string;
  /** The KanjiVG element ID, only for components with no code point. */
  readonly kanjiVgId: string | null;
  /** Kangxi number for radical variant forms (W01-4 table); null otherwise or when ambiguous. */
  readonly radicalNumber: number | null;
}

export interface KanjiComponentRow extends Provenance {
  readonly kanjiLiteral: string;
  readonly componentSlug: string;
  readonly position: KanjiPosition;
  readonly role: ComponentRole;
  /** 1 = direct child of the kanji. */
  readonly depth: number;
  /** Pre-order index within the kanji, 1..n (Q4a). */
  readonly ord: number;
  /** Element ID of the row (part 1 for split elements). */
  readonly kvgId: string;
  /** Element ID of the parent row; null at depth 1. */
  readonly parentKvgId: string | null;
}

export interface StrokeCount {
  readonly kanji: string;
  readonly strokes: number;
}

export interface KanjivgReport {
  readonly kanjiCount: number;
  readonly componentRows: number;
  readonly kanjiComponentRows: number;
  readonly unknownRoles: number;
  readonly unknownPositions: number;
  /** Component rows slugged `kvg:<element id>` (Q3a). */
  readonly codepointlessComponents: number;
  /** Split parts n > 1 with no part n-1 to join; kept as rows of their own. */
  readonly unmatchedParts: number;
  /** Component rows whose radical variant needs a position (阝); radicalNumber is null. */
  readonly ambiguousRadicals: number;
}

export interface KanjivgRows {
  readonly components: readonly ComponentRow[];
  readonly kanjiComponents: readonly KanjiComponentRow[];
  readonly strokes: readonly StrokeCount[];
  readonly report: KanjivgReport;
}

export class KanjivgDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KanjivgDataError';
  }
}

const POSITIONS: Readonly<Record<string, KanjiPosition>> = {
  left: 'hen',
  right: 'tsukuri',
  top: 'kanmuri',
  bottom: 'ashi',
  nyo: 'nyō',
  nyoc: 'nyō',
  tare: 'tare',
  tarec: 'tare',
  kamae: 'kamae',
  kamae1: 'kamae',
  kamae2: 'kamae',
  kamaec: 'kamae',
};

/** Q1a: KanjiVG position → schema position; no position is `none`, anything unmapped `unknown`. */
export function mapPosition(kvgPosition: string | undefined): KanjiPosition {
  if (kvgPosition === undefined) return 'none';
  return Object.hasOwn(POSITIONS, kvgPosition)
    ? (POSITIONS[kvgPosition] as KanjiPosition)
    : 'unknown';
}

const GETA = '〓';
const NIKUZUKI = '⺼';
const SEMANTIC_RADICALS: ReadonlySet<string> = new Set(['general', 'tradit']);
const KANJI_ID = /^kvg:kanji_([0-9a-f]{5})$/u;

interface RawRow {
  readonly kvgId: string;
  readonly parentKvgId: string | null;
  readonly slug: string;
  readonly glyph: string;
  readonly codepointless: boolean;
  readonly position: KanjiPosition;
  readonly depth: number;
  readonly ord: number;
  phon: boolean;
  semanticRadical: boolean;
}

interface SplitGroup {
  readonly key: string;
  readonly row: RawRow;
  last: number;
}

/** An open <g>: the row its children attach to (null for the kanji root). */
interface Frame {
  readonly row: RawRow | null;
}

/** Component slug and glyph of an element (AC 3): NFC, 月 as 肉 → ⺼, no code point → its ID. */
function slugOf(attrs: Readonly<Record<string, string>>, id: string) {
  const element = attrs['kvg:element'];
  const glyph = element === undefined ? '' : nfc(element);
  if (Array.from(glyph).length !== 1) return { slug: id, glyph: GETA, codepointless: true };
  if (glyph === '月' && attrs['kvg:original'] === '肉')
    return { slug: NIKUZUKI, glyph: NIKUZUKI, codepointless: false };
  return { slug: glyph, glyph, codepointless: false };
}

/** Folds tokens into one tree per <kanji>; `onKanji` fires when a </kanji> closes. */
class KanjiBuilder {
  private literal: string | undefined;
  private rows: RawRow[] = [];
  private groups: SplitGroup[] = [];
  private stack: Frame[] = [];
  private strokes = 0;
  unmatchedParts = 0;
  private readonly onKanji: (literal: string, rows: RawRow[], strokes: number) => void;

  constructor(onKanji: (literal: string, rows: RawRow[], strokes: number) => void) {
    this.onKanji = onKanji;
  }

  feed(tokens: readonly XmlToken[]): void {
    for (const t of tokens) this.token(t);
  }

  private token(t: XmlToken): void {
    if (t.type === 'text') return;
    if (t.type === 'open') {
      if (t.name === 'kanji') this.openKanji(t.attrs);
      else if (this.literal === undefined) return;
      else if (t.name === 'g') this.openGroup(t.attrs, t.selfClosing);
      else if (t.name === 'path') this.strokes++;
      return;
    }
    if (this.literal === undefined) return;
    if (t.name === 'g') this.stack.pop();
    else if (t.name === 'kanji') {
      this.onKanji(this.literal, this.rows, this.strokes);
      this.literal = undefined;
    }
  }

  private openKanji(attrs: Readonly<Record<string, string>>): void {
    const id = attrs['id'] ?? '';
    const m = KANJI_ID.exec(id);
    if (!m) throw new KanjivgDataError(`<kanji> has an unexpected id "${id}"`);
    this.literal = String.fromCodePoint(Number.parseInt(m[1] as string, 16));
    this.rows = [];
    this.groups = [];
    this.stack = [];
    this.strokes = 0;
  }

  private openGroup(attrs: Readonly<Record<string, string>>, selfClosing: boolean): void {
    if (this.stack.length === 0) {
      // The kanji root <g id="kvg:XXXXX">: not a row.
      if (!selfClosing) this.stack.push({ row: null });
      return;
    }
    const id = attrs['id'];
    if (id === undefined) throw new KanjivgDataError(`${this.literal}: a <g> has no id`);
    const parent = (this.stack.at(-1) as Frame).row;
    const part = attrs['kvg:part'] === undefined ? undefined : Number(attrs['kvg:part']);
    const element = attrs['kvg:element'];
    const key = `${element ?? ''}\u0000${attrs['kvg:number'] ?? ''}`;
    const phon = attrs['kvg:phon'] !== undefined;
    const semanticRadical = SEMANTIC_RADICALS.has(attrs['kvg:radical'] ?? '');

    if (part !== undefined && part > 1 && element !== undefined) {
      const group = this.groups.findLast((g) => g.key === key && g.last === part - 1);
      if (group !== undefined) {
        group.last = part;
        group.row.phon ||= phon;
        group.row.semanticRadical ||= semanticRadical;
        if (!selfClosing) this.stack.push({ row: group.row });
        return;
      }
      this.unmatchedParts++;
    }

    const { slug, glyph, codepointless } = slugOf(attrs, id);
    const row: RawRow = {
      kvgId: id,
      parentKvgId: parent === null ? null : parent.kvgId,
      slug,
      glyph,
      codepointless,
      position: mapPosition(attrs['kvg:position']),
      depth: parent === null ? 1 : parent.depth + 1,
      ord: this.rows.length + 1,
      phon,
      semanticRadical,
    };
    this.rows.push(row);
    if (part === 1 && element !== undefined) this.groups.push({ key, row, last: 1 });
    if (!selfClosing) this.stack.push({ row });
  }
}

/**
 * Parses the KanjiVG release XML arriving in chunks into unsorted rows (the import sorts them).
 * Throws KanjivgDataError on data it cannot map.
 */
export async function parseKanjivg(
  chunks: Iterable<string> | AsyncIterable<string>,
  provenance: Provenance,
): Promise<KanjivgRows> {
  const p = {
    source: provenance.source,
    sourceVersion: provenance.sourceVersion,
    license: provenance.license,
  };
  const components = new Map<string, ComponentRow>();
  const kanjiComponents: KanjiComponentRow[] = [];
  const strokes: StrokeCount[] = [];
  const seen = new Set<string>();
  let ambiguousRadicals = 0;

  const builder = new KanjiBuilder((literal, rows, count) => {
    if (seen.has(literal)) throw new KanjivgDataError(`${literal}: listed twice`);
    seen.add(literal);
    strokes.push({ kanji: literal, strokes: count });
    const hasPhon = rows.some((r) => r.phon);
    for (const r of rows) {
      if (!components.has(r.slug)) {
        const radical = r.codepointless ? { kind: 'unknown' as const } : radicalNumber(r.slug);
        if (radical.kind === 'ambiguous') ambiguousRadicals++;
        components.set(r.slug, {
          slug: r.slug,
          glyph: r.glyph,
          kanjiVgId: r.codepointless ? r.kvgId : null,
          radicalNumber: radical.kind === 'ok' ? radical.kangxi : null,
          ...p,
        });
      }
      kanjiComponents.push({
        kanjiLiteral: literal,
        componentSlug: r.slug,
        position: r.position,
        role: r.phon ? 'phonetic' : r.semanticRadical && hasPhon ? 'semantic' : 'unknown',
        depth: r.depth,
        ord: r.ord,
        kvgId: r.kvgId,
        parentKvgId: r.parentKvgId,
        ...p,
      });
    }
  });
  const tokenizer = new XmlTokenizer();
  for await (const chunk of chunks) builder.feed(tokenizer.push(chunk));
  builder.feed(tokenizer.end());

  const componentRows = [...components.values()];
  return {
    components: componentRows,
    kanjiComponents,
    strokes,
    report: {
      kanjiCount: strokes.length,
      componentRows: componentRows.length,
      kanjiComponentRows: kanjiComponents.length,
      unknownRoles: kanjiComponents.filter((r) => r.role === 'unknown').length,
      unknownPositions: kanjiComponents.filter((r) => r.position === 'unknown').length,
      codepointlessComponents: componentRows.filter((c) => c.kanjiVgId !== null).length,
      unmatchedParts: builder.unmatchedParts,
      ambiguousRadicals,
    },
  };
}
