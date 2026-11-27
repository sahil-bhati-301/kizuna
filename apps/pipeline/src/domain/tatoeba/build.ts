/**
 * Tatoeba → sentence rows (W02-4 AC 1-4). Pure: callers feed parsed pieces.
 *
 * Owner decisions (WP OPEN-Q, session 12):
 * - Q1 a: keep a Japanese sentence with at least one directly linked English translation and an
 *   index line with at least one item that maps. The count option b would keep (all items checked
 *   with `~`) is reported.
 * - Q2 a: quality = mapped items / index items (0-1).
 * Choices not fixed by the WP:
 * - Only index lines whose meaning ID is a directly linked English translation count; of several,
 *   the lowest meaning ID is used.
 * - Items that did not parse count as unmapped (they stay in the quality denominator).
 */
import { buildWordLookup, mapItem } from './link.ts';
import type { WordForms } from './link.ts';
import { attributionUrl } from './parse.ts';
import type { IndexLine, SentenceLine } from './parse.ts';

export interface Provenance {
  readonly source: string;
  readonly sourceVersion: string;
  readonly license: string;
}

export interface Translation {
  readonly lang: string;
  readonly id: number;
  readonly text: string;
}

export interface SentenceRow extends Provenance {
  /** Tatoeba ID as text (content.sentence.id). */
  readonly id: string;
  readonly japanese: string;
  readonly translations: readonly Translation[];
  /** Sorted, unique JMdict ent_seq values. */
  readonly wordIds: readonly number[];
  readonly quality: number;
  /** Per-sentence attribution link (CC BY 2.0 FR). */
  readonly attributionUrl: string;
}

export interface UnmappedItem {
  readonly sentenceId: number;
  readonly headword: string;
  readonly reading: string | null;
  readonly reason: 'unknown' | 'ambiguous' | 'unparsed';
}

export interface TatoebaReport {
  readonly japaneseRead: number;
  readonly sentencesKept: number;
  readonly noEnglishTranslation: number;
  readonly noIndexLine: number;
  readonly noMappedWord: number;
  readonly wordLinks: number;
  readonly unknownItems: number;
  readonly ambiguousItems: number;
  readonly unparsedItems: number;
  /** Kept sentences option b (every index item checked) would keep. */
  readonly optionBKept: number;
  /** The unmapped items of kept sentences, in sentence then token order. */
  readonly unmapped: readonly UnmappedItem[];
}

export interface BuildInput {
  readonly japanese: readonly SentenceLine[];
  /** Japanese ID → directly linked English IDs. */
  readonly links: ReadonlyMap<number, readonly number[]>;
  /** English ID → text, for the IDs that are linked. */
  readonly english: ReadonlyMap<number, string>;
  /** Index lines of Japanese sentences. */
  readonly indices: readonly IndexLine[];
  readonly words: readonly WordForms[];
  readonly provenance: Provenance;
}

export interface BuildResult {
  readonly sentences: readonly SentenceRow[];
  readonly report: TatoebaReport;
}

const cmp = (a: number, b: number) => a - b;

export function buildSentences(input: BuildInput): BuildResult {
  const lookup = buildWordLookup(input.words);
  const indexBySentence = new Map<number, IndexLine[]>();
  for (const line of input.indices) {
    const list = indexBySentence.get(line.sentenceId);
    if (list) list.push(line);
    else indexBySentence.set(line.sentenceId, [line]);
  }

  const rows: SentenceRow[] = [];
  const unmapped: UnmappedItem[] = [];
  const c = {
    noEng: 0,
    noIndex: 0,
    noWord: 0,
    links: 0,
    unknown: 0,
    ambiguous: 0,
    unparsed: 0,
    b: 0,
  };

  for (const jp of [...input.japanese].sort((a, b) => a.id - b.id)) {
    const engIds = [...new Set(input.links.get(jp.id) ?? [])].sort(cmp);
    const translations: Translation[] = [];
    for (const id of engIds) {
      const text = input.english.get(id);
      if (text !== undefined) translations.push({ lang: 'eng', id, text });
    }
    if (translations.length === 0) {
      c.noEng++;
      continue;
    }
    const usable = (indexBySentence.get(jp.id) ?? [])
      .filter((l) => translations.some((t) => t.id === l.meaningId))
      .sort((a, b) => a.meaningId - b.meaningId);
    const line = usable[0];
    if (!line) {
      c.noIndex++;
      continue;
    }
    const ids = new Set<number>();
    const misses: UnmappedItem[] = [];
    for (const item of line.items) {
      const m = mapItem(item, lookup);
      if (m.status === 'mapped') ids.add(m.entSeq);
      else {
        misses.push({
          sentenceId: jp.id,
          headword: item.headword,
          reading: item.reading,
          reason: m.status,
        });
      }
    }
    if (ids.size === 0) {
      c.noWord++;
      continue;
    }
    const total = line.items.length + line.badTokens;
    const mappedCount = total - misses.length - line.badTokens;
    for (let i = 0; i < line.badTokens; i++) {
      misses.push({ sentenceId: jp.id, headword: '', reading: null, reason: 'unparsed' });
    }
    for (const miss of misses) {
      if (miss.reason === 'unknown') c.unknown++;
      else if (miss.reason === 'ambiguous') c.ambiguous++;
      else c.unparsed++;
    }
    unmapped.push(...misses);
    if (line.badTokens === 0 && line.items.every((i) => i.checked)) c.b++;
    c.links += ids.size;
    rows.push({
      id: String(jp.id),
      japanese: jp.text,
      translations,
      wordIds: [...ids].sort(cmp),
      quality: Math.round((mappedCount / total) * 1000) / 1000,
      attributionUrl: attributionUrl(jp.id),
      ...input.provenance,
    });
  }

  return {
    sentences: rows,
    report: {
      japaneseRead: input.japanese.length,
      sentencesKept: rows.length,
      noEnglishTranslation: c.noEng,
      noIndexLine: c.noIndex,
      noMappedWord: c.noWord,
      wordLinks: c.links,
      unknownItems: c.unknown,
      ambiguousItems: c.ambiguous,
      unparsedItems: c.unparsed,
      optionBKept: c.b,
      unmapped,
    },
  };
}
