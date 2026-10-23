// Lookups over a ContentSet, built once per set and cached.
import type {
  Component,
  ComponentId,
  ContentSet,
  Kanji,
  KanjiId,
  Reading,
  ReadingKind,
  Relation,
  RelationKind,
  Word,
  WordId,
} from '@kizuna/content';

export interface Partner {
  kanji: KanjiId;
  relation: Relation;
}

export interface Family {
  component: ComponentId;
  /** Members in frequency order. */
  members: KanjiId[];
  /** Members whose classification radical is this component. */
  radicalMembers: number;
}

/** A word's kana split along its text: kanji parts and literal kana runs. */
export interface WordSegment {
  kana: string;
  /** Index into word.parts, or null for literal kana in the text. */
  part: number | null;
}

export interface ContentIndex {
  content: ContentSet;
  kanji: Map<KanjiId, Kanji>;
  /** Kanji in frequency order. */
  ordered: Kanji[];
  components: Map<ComponentId, Component>;
  words: Map<WordId, Word>;
  /** Words containing each kanji, shortest/regular first. */
  wordsByKanji: Map<KanjiId, Word[]>;
  /** Partners per kanji and relation kind, strongest first. */
  partners: Map<string, Partner[]>;
  /** Unique components of each kanji (parts plus radical). */
  componentsOf: Map<KanjiId, ComponentId[]>;
  /** Kanji per component (parts or radical), frequency order. */
  families: Map<ComponentId, KanjiId[]>;
  /** Non-trivial families with ≥ 3 members, largest first (deterministic). */
  rankedFamilies: Family[];
  segments: Map<WordId, WordSegment[] | null>;
}

/** Stroke-level components that do not form a meaningful family. */
const TRIVIAL_COMPONENTS = new Set(['一', '丨', '丶', '丿', 'ノ', '乙', '亅', '亠', '冂', '冖', '丷', '⺊', '𠂉']);

const cache = new WeakMap<ContentSet, ContentIndex>();

export const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function getIndex(content: ContentSet): ContentIndex {
  const hit = cache.get(content);
  if (hit) return hit;
  const ix = buildIndex(content);
  cache.set(content, ix);
  return ix;
}

function buildIndex(content: ContentSet): ContentIndex {
  const kanji = new Map<KanjiId, Kanji>();
  for (const k of content.kanji) kanji.set(k.id, k);
  const ordered = content.kanji
    .slice()
    .sort((a, b) => a.frequencyRank - b.frequencyRank || byCodePoint(a.id, b.id));
  const rankOf = new Map(ordered.map((k, i) => [k.id, i]));
  const byRank = (a: KanjiId, b: KanjiId) => (rankOf.get(a) ?? 1e9) - (rankOf.get(b) ?? 1e9) || byCodePoint(a, b);

  const components = new Map<ComponentId, Component>();
  for (const c of content.components) components.set(c.id, c);

  const words = new Map<WordId, Word>();
  const wordsByKanji = new Map<KanjiId, Word[]>();
  for (const w of content.words) {
    words.set(w.id, w);
    for (const p of new Set(w.parts.map((p) => p.kanji))) {
      if (!kanji.has(p)) continue;
      const list = wordsByKanji.get(p) ?? [];
      list.push(w);
      wordsByKanji.set(p, list);
    }
  }
  for (const list of wordsByKanji.values()) {
    list.sort((a, b) => a.parts.length - b.parts.length || a.text.length - b.text.length || byCodePoint(a.id, b.id));
  }

  const partners = new Map<string, Partner[]>();
  for (const r of content.relations) {
    if (!kanji.has(r.a) || !kanji.has(r.b) || r.a === r.b) continue;
    for (const [x, y] of [
      [r.a, r.b],
      [r.b, r.a],
    ] as const) {
      const key = `${x}|${r.kind}`;
      const list = partners.get(key) ?? [];
      if (!list.some((p) => p.kanji === y)) list.push({ kanji: y, relation: r });
      partners.set(key, list);
    }
  }
  for (const list of partners.values()) {
    list.sort((p, q) => q.relation.strength - p.relation.strength || byRank(p.kanji, q.kanji));
  }

  const componentsOf = new Map<KanjiId, ComponentId[]>();
  const families = new Map<ComponentId, KanjiId[]>();
  for (const k of ordered) {
    const comps = uniq([...k.parts.map((p) => p.component), k.radical].filter(Boolean));
    componentsOf.set(k.id, comps);
    for (const c of comps) {
      const list = families.get(c) ?? [];
      list.push(k.id);
      families.set(c, list);
    }
  }

  const rankedFamilies: Family[] = [];
  for (const [component, members] of families) {
    if (members.length < 3 || TRIVIAL_COMPONENTS.has(component)) continue;
    const radicalMembers = members.filter((m) => kanji.get(m)?.radical === component).length;
    rankedFamilies.push({ component, members, radicalMembers });
  }
  rankedFamilies.sort(
    (a, b) =>
      b.members.length - a.members.length || b.radicalMembers - a.radicalMembers || byCodePoint(a.component, b.component),
  );

  const segments = new Map<WordId, WordSegment[] | null>();
  for (const w of content.words) segments.set(w.id, segmentWord(w));

  return {
    content,
    kanji,
    ordered,
    components,
    words,
    wordsByKanji,
    partners,
    componentsOf,
    families,
    rankedFamilies,
    segments,
  };
}

export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function partnersOf(ix: ContentIndex, k: KanjiId, kind: RelationKind): Partner[] {
  return ix.partners.get(`${k}|${kind}`) ?? [];
}

export function relationBetween(ix: ContentIndex, a: KanjiId, b: KanjiId): Relation | undefined {
  return (
    partnersOf(ix, a, 'visual').find((p) => p.kanji === b)?.relation ??
    partnersOf(ix, a, 'semantic').find((p) => p.kanji === b)?.relation
  );
}

export function readingsOf(k: Kanji, kind: ReadingKind): Reading[] {
  return k.readings.filter((r) => r.kind === kind);
}

export function primaryReading(k: Kanji | undefined, kind: ReadingKind): Reading | undefined {
  if (!k) return undefined;
  const rs = readingsOf(k, kind);
  return rs.find((r) => r.primary) ?? rs[0];
}

/** Full kana of a reading, stem plus okurigana: "たべる". */
export function fullKana(r: Reading): string {
  return r.kana + r.okurigana;
}

/** Dictionary form with okurigana, e.g. "食べる"; just the kanji when there is none. */
export function okuriganaForm(k: Kanji, r: Reading): string {
  return k.id + r.okurigana;
}

/** Kanji sharing at least one non-trivial component, most shared first, then frequency. */
export function sharedComponentKanji(ix: ContentIndex, k: KanjiId): KanjiId[] {
  const mine = (ix.componentsOf.get(k) ?? []).filter((c) => !TRIVIAL_COMPONENTS.has(c));
  const score = new Map<KanjiId, number>();
  for (const c of mine) {
    for (const other of ix.families.get(c) ?? []) {
      if (other === k) continue;
      score.set(other, (score.get(other) ?? 0) + 1);
    }
  }
  const order = new Map(ix.ordered.map((x, i) => [x.id, i]));
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .map(([id]) => id);
}

/** Visible components shared by two kanji and unique to each (from parts). */
export function componentDiff(ix: ContentIndex, a: KanjiId, b: KanjiId): { shared: string[]; onlyA: string[]; onlyB: string[] } {
  const glyph = (c: ComponentId) => ix.components.get(c)?.glyph ?? c;
  const pa = uniq((ix.kanji.get(a)?.parts ?? []).map((p) => p.component));
  const pb = uniq((ix.kanji.get(b)?.parts ?? []).map((p) => p.component));
  return {
    shared: pa.filter((c) => pb.includes(c)).map(glyph),
    onlyA: pa.filter((c) => !pb.includes(c)).map(glyph),
    onlyB: pb.filter((c) => !pa.includes(c)).map(glyph),
  };
}

export function componentKeyword(ix: ContentIndex, c: ComponentId): string {
  return ix.components.get(c)?.keyword ?? ix.kanji.get(c)?.keyword ?? c;
}

export function componentGlyph(ix: ContentIndex, c: ComponentId): string {
  return ix.components.get(c)?.glyph ?? c;
}

/** Lowercase meaning tokens of a keyword such as "sun, day". */
export function keywordParts(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True if b's keyword would be an accepted answer for a (or they are synonyms). */
export function meaningsOverlap(a: Kanji, b: Kanji): boolean {
  if (a.keyword.trim().toLowerCase() === b.keyword.trim().toLowerCase()) return true;
  const am = new Set([...a.meanings.map((m) => m.toLowerCase().trim()), ...keywordParts(a.keyword)]);
  const bm = new Set([...b.meanings.map((m) => m.toLowerCase().trim()), ...keywordParts(b.keyword)]);
  return keywordParts(b.keyword).some((p) => am.has(p)) || keywordParts(a.keyword).some((p) => bm.has(p));
}

const isKana = (ch: string): boolean => /[぀-ヿー]/.test(ch);

function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * Split a word's reading along its text. Every non-kana character consumes the next part.
 * Returns null when the parts do not line up with word.kana.
 */
export function segmentWord(w: Word): WordSegment[] | null {
  const segs: WordSegment[] = [];
  let pi = 0;
  for (const ch of [...w.text]) {
    if (isKana(ch)) {
      const last = segs[segs.length - 1];
      if (last && last.part === null) last.kana += toHiragana(ch);
      else segs.push({ kana: toHiragana(ch), part: null });
    } else {
      const part = w.parts[pi];
      if (!part) return null;
      segs.push({ kana: part.surface, part: pi });
      pi++;
    }
  }
  if (pi !== w.parts.length) return null;
  if (segs.map((s) => s.kana).join('') !== w.kana) return null;
  return segs;
}

/** Reading kind a word part uses, from its readingId (null for special readings). */
export function partReadingKind(ix: ContentIndex, w: Word, partIndex: number): ReadingKind | null {
  const part = w.parts[partIndex];
  if (!part?.readingId) return null;
  const k = ix.kanji.get(part.kanji);
  const r = k?.readings.find((x) => x.id === part.readingId);
  if (r) return r.kind;
  const m = /:(on|kun):/.exec(part.readingId);
  return m ? (m[1] as ReadingKind) : null;
}
