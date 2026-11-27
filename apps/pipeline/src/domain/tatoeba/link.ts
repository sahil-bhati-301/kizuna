/** Maps index items to loaded JMdict words (W02-4 AC 2). Ambiguous or unknown is never guessed. */
import type { IndexItem } from './parse.ts';

/** The parts of a word row the mapping needs. */
export interface WordForms {
  readonly entSeq: number;
  readonly headword: string;
  readonly kana: string;
  readonly altForms: readonly { readonly kind: 'kanji' | 'kana'; readonly text: string }[];
}

export type Mapping =
  | { readonly status: 'mapped'; readonly entSeq: number }
  | { readonly status: 'unknown' }
  | { readonly status: 'ambiguous'; readonly entSeqs: readonly number[] };

interface Candidate {
  readonly entSeq: number;
  readonly readings: ReadonlySet<string>;
}

export interface WordLookup {
  readonly byForm: ReadonlyMap<string, readonly Candidate[]>;
  readonly entSeqs: ReadonlySet<number>;
}

/** Every written form of a word (headword, kana, other forms) points at the word. */
export function buildWordLookup(words: readonly WordForms[]): WordLookup {
  const map = new Map<string, Candidate[]>();
  for (const w of words) {
    const readings = new Set([
      w.kana,
      ...w.altForms.filter((a) => a.kind === 'kana').map((a) => a.text),
    ]);
    const cand: Candidate = { entSeq: w.entSeq, readings };
    const forms = new Set([w.headword, w.kana, ...w.altForms.map((a) => a.text)]);
    for (const form of forms) {
      const list = map.get(form);
      if (list) list.push(cand);
      else map.set(form, [cand]);
    }
  }
  return { byForm: map, entSeqs: new Set(words.map((w) => w.entSeq)) };
}

/** One candidate: mapped. None: unknown. Several: ambiguous (a reading narrows them first). */
export function mapItem(item: IndexItem, lookup: WordLookup): Mapping {
  if (item.entSeq !== null) {
    return lookup.entSeqs.has(item.entSeq)
      ? { status: 'mapped', entSeq: item.entSeq }
      : { status: 'unknown' };
  }
  let found = lookup.byForm.get(item.headword) ?? [];
  const reading = item.reading;
  if (reading !== null) found = found.filter((c) => c.readings.has(reading));
  if (found.length === 0) return { status: 'unknown' };
  if (found.length === 1) return { status: 'mapped', entSeq: found[0]!.entSeq };
  return { status: 'ambiguous', entSeqs: found.map((c) => c.entSeq).sort((a, b) => a - b) };
}
