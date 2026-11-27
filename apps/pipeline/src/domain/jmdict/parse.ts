/**
 * JMdict → word rows (W02-2 AC 1-4; pipeline.md §3.3, content.md §3.1). Streams the XML: each
 * <entry> is reduced as soon as it closes, and only entries that belong to the subset are kept.
 * Pure: no I/O.
 *
 * Owner decisions (WP OPEN-Q):
 * - Q1: an entry is loaded when any form carries a priority tag.
 * - Q2: kana keep JMdict's script.
 * Choices not fixed by the WP (reported, not guessed silently):
 * - Irregular kanji forms are those tagged iK, io or sK (search-only); an entry whose kanji forms
 *   are all excluded takes its first reading as headword, like a kana-only entry.
 * - A sense with no <pos> inherits the previous sense's, as JMdict defines it.
 * - A gloss with no xml:lang is English ("eng"). Sense restrictions (stagk, stagr) are ignored.
 * - "Number of priority tags" counts the distinct tags over all forms.
 */
import type { NewWord } from '@kizuna/content';
import { nfc } from '../normalise/index.ts';
import { XmlTokenizer } from './xml.ts';
import type { XmlToken } from './xml.ts';

export interface Provenance {
  readonly source: string;
  readonly sourceVersion: string;
  readonly license: string;
}

export interface AltForm {
  readonly kind: 'kanji' | 'kana';
  readonly text: string;
  /** ke_inf / re_inf codes, e.g. `ateji`, `iK`, `sK`, `ok`. */
  readonly info: readonly string[];
  /** ke_pri / re_pri codes, e.g. `ichi1`, `nf12`. */
  readonly priority: readonly string[];
}

export interface Gloss {
  readonly lang: string;
  readonly text: string;
}

export interface Sense {
  readonly pos: readonly string[];
  readonly glosses: readonly Gloss[];
}

export interface WordRow extends Provenance {
  readonly entSeq: number;
  readonly headword: string;
  readonly kana: string;
  readonly altForms: readonly AltForm[];
  readonly senses: readonly Sense[];
  /** Dense rank 1..N over the subset; set by `rankWords`. */
  readonly freqRank: number | null;
  readonly isCommon: boolean;
  readonly jlptApprox: number | null;
}

// Compile-time check: the rows fit the content insert type.
type Assignable<T, U extends T> = U;
export type WordRowFitsSchema = Assignable<
  NewWord,
  Omit<WordRow, 'altForms' | 'senses'> & { altForms: unknown; senses: unknown }
>;

/** What the subset and rank rules need besides the row. */
export interface RankKey {
  readonly entSeq: number;
  /** Smallest nfXX band over all forms, or null. */
  readonly bestNf: number | null;
  /** Distinct priority tags over all forms. */
  readonly priorityCount: number;
}

export interface JmdictReport {
  readonly entriesRead: number;
  readonly entriesLoaded: number;
  readonly commonLoaded: number;
  /** Loaded entries with kanji forms, none usable as headword (the reading is the headword). */
  readonly kanaHeadwordFallbacks: readonly number[];
  /** Loaded entries whose chosen headword has no valid reading; skipped from the rows. */
  readonly noValidReading: readonly number[];
}

export interface JmdictRows {
  /** Source order, `freqRank` still null; pass to `rankWords`. */
  readonly words: readonly WordRow[];
  readonly keys: readonly RankKey[];
  readonly report: JmdictReport;
}

export class JmdictDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JmdictDataError';
  }
}

const COMMON_TAGS: ReadonlySet<string> = new Set(['news1', 'ichi1', 'spec1', 'spec2', 'gai1']);
const IRREGULAR_KANJI: ReadonlySet<string> = new Set(['iK', 'io', 'sK']);

interface RawForm {
  text: string;
  info: string[];
  pri: string[];
  nokanji: boolean;
  restr: string[];
}

interface RawSense {
  pos: string[];
  glosses: Gloss[];
}

interface RawEntry {
  entSeq?: number;
  kanji: RawForm[];
  readings: RawForm[];
  senses: RawSense[];
}

const form = (): RawForm => ({ text: '', info: [], pri: [], nokanji: false, restr: [] });

const altForm = (kind: 'kanji' | 'kana', f: RawForm): AltForm => ({
  kind,
  text: nfc(f.text),
  info: f.info,
  priority: f.pri,
});

function nfBand(tag: string): number | null {
  const m = /^nf(\d+)$/u.exec(tag);
  return m ? Number(m[1]) : null;
}

type Reduced =
  | { skipped: true }
  | { skipped: false; row: WordRow; key: RankKey; fallback: boolean }
  | { skipped: 'no-reading'; entSeq: number };

function reduce(e: RawEntry, provenance: Provenance): Reduced {
  if (e.entSeq === undefined) throw new JmdictDataError('An <entry> has no <ent_seq>');
  const tags = new Set<string>();
  for (const f of [...e.kanji, ...e.readings]) for (const t of f.pri) tags.add(t);
  if (tags.size === 0) return { skipped: true };

  if (e.readings.length === 0) throw new JmdictDataError(`${e.entSeq}: no <r_ele>`);
  const kanji = e.kanji.find((k) => !k.info.some((i) => IRREGULAR_KANJI.has(i)));
  const fallback = e.kanji.length > 0 && kanji === undefined;
  let headword: RawForm;
  let reading: RawForm | undefined;
  if (kanji !== undefined) {
    headword = kanji;
    reading = e.readings.find(
      (r) => !r.nokanji && (r.restr.length === 0 || r.restr.includes(nfc(kanji.text))),
    );
    if (reading === undefined) return { skipped: 'no-reading', entSeq: e.entSeq };
  } else {
    reading =
      e.readings.find((r) => !r.nokanji && !r.info.includes('sk')) ?? (e.readings[0] as RawForm);
    headword = reading;
  }

  const altForms: AltForm[] = [
    ...e.kanji.filter((k) => k !== headword).map((k) => altForm('kanji', k)),
    ...e.readings.filter((r) => r !== reading).map((r) => altForm('kana', r)),
  ];
  const nf = [...tags].map(nfBand).filter((n): n is number => n !== null);
  const row: WordRow = {
    entSeq: e.entSeq,
    headword: nfc(headword.text),
    kana: nfc(reading.text),
    altForms,
    senses: e.senses,
    freqRank: null,
    isCommon: [...tags].some((t) => COMMON_TAGS.has(t)),
    jlptApprox: null,
    source: provenance.source,
    sourceVersion: provenance.sourceVersion,
    license: provenance.license,
  };
  const key: RankKey = {
    entSeq: e.entSeq,
    bestNf: nf.length === 0 ? null : Math.min(...nf),
    priorityCount: tags.size,
  };
  return { skipped: false, row, key, fallback };
}

/** Folds tokens into entries; `onEntry` fires when an </entry> closes. */
class EntryBuilder {
  private entry: RawEntry | undefined;
  private sense: RawSense | undefined;
  private inherit: RawSense | undefined;
  private k: RawForm | undefined;
  private r: RawForm | undefined;
  private name: string | undefined;
  private attrs: Readonly<Record<string, string>> = {};
  private text = '';
  private readonly onEntry: (e: RawEntry) => void;

  constructor(onEntry: (e: RawEntry) => void) {
    this.onEntry = onEntry;
  }

  feed(tokens: readonly XmlToken[]): void {
    for (const t of tokens) this.token(t);
  }

  private token(t: XmlToken): void {
    if (t.type === 'text') {
      if (this.name !== undefined) this.text += t.text;
      return;
    }
    if (t.type === 'open') {
      if (t.name === 'entry') this.entry = { kanji: [], readings: [], senses: [] };
      else if (this.entry) {
        if (t.name === 'k_ele') this.entry.kanji.push((this.k = form()));
        else if (t.name === 're_ele' || t.name === 'r_ele')
          this.entry.readings.push((this.r = form()));
        else if (t.name === 'sense') {
          const prev = this.entry.senses.at(-1);
          this.sense = { pos: [], glosses: [] };
          this.entry.senses.push(this.sense);
          // pos is filled on </sense>: inherited from `prev` when the sense lists none.
          this.inherit = prev;
        }
        if (!t.selfClosing) {
          this.name = t.name;
          this.attrs = t.attrs;
          this.text = '';
        } else if (t.name === 're_nokanji' && this.r) this.r.nokanji = true;
      }
      return;
    }
    if (t.name === 'entry') {
      if (this.entry) this.onEntry(this.entry);
      this.entry = undefined;
    } else if (t.name === 'sense') {
      if (this.sense && this.sense.pos.length === 0 && this.inherit)
        this.sense.pos = this.inherit.pos;
      this.sense = undefined;
    } else if (t.name === 'k_ele') this.k = undefined;
    else if (t.name === 'r_ele' || t.name === 're_ele') this.r = undefined;
    else if (this.entry && this.name === t.name) this.leaf(t.name);
    this.name = undefined;
  }

  private leaf(name: string): void {
    const e = this.entry as RawEntry;
    const text = this.text.trim();
    switch (name) {
      case 'ent_seq': {
        const n = Number(text);
        if (!Number.isInteger(n)) throw new JmdictDataError(`ent_seq is not an integer: ${text}`);
        e.entSeq = n;
        break;
      }
      case 'keb':
        if (this.k) this.k.text = text;
        break;
      case 'ke_inf':
        this.k?.info.push(text);
        break;
      case 'ke_pri':
        this.k?.pri.push(text);
        break;
      case 'reb':
        if (this.r) this.r.text = text;
        break;
      case 're_nokanji':
        if (this.r) this.r.nokanji = true;
        break;
      case 're_restr':
        this.r?.restr.push(nfc(text));
        break;
      case 're_inf':
        this.r?.info.push(text);
        break;
      case 're_pri':
        this.r?.pri.push(text);
        break;
      case 'pos':
        this.sense?.pos.push(text);
        break;
      case 'gloss':
        this.sense?.glosses.push({ lang: this.attrs['xml:lang'] ?? 'eng', text: nfc(text) });
        break;
      default:
        break;
    }
  }
}

/**
 * Parses JMdict XML arriving in chunks into the subset of word rows (Q1), in source order with
 * no rank yet. Throws JmdictDataError on data it cannot map.
 */
export async function parseJmdict(
  chunks: Iterable<string> | AsyncIterable<string>,
  provenance: Provenance,
): Promise<JmdictRows> {
  const words: WordRow[] = [];
  const keys: RankKey[] = [];
  const fallbacks: number[] = [];
  const noReading: number[] = [];
  const seen = new Set<number>();
  let read = 0;
  const builder = new EntryBuilder((e) => {
    read++;
    const r = reduce(e, provenance);
    if (r.skipped === true) return;
    if (r.skipped === 'no-reading') {
      noReading.push(r.entSeq);
      return;
    }
    if (seen.has(r.row.entSeq)) throw new JmdictDataError(`${r.row.entSeq}: listed twice`);
    seen.add(r.row.entSeq);
    words.push(r.row);
    keys.push(r.key);
    if (r.fallback) fallbacks.push(r.row.entSeq);
  });
  const tokenizer = new XmlTokenizer();
  for await (const chunk of chunks) builder.feed(tokenizer.push(chunk));
  builder.feed(tokenizer.end());
  return {
    words,
    keys,
    report: {
      entriesRead: read,
      entriesLoaded: words.length,
      commonLoaded: words.filter((w) => w.isCommon).length,
      kanaHeadwordFallbacks: fallbacks,
      noValidReading: noReading,
    },
  };
}

/**
 * Dense freq_rank 1..N: best nfXX band (lower first, none last), then more distinct priority
 * tags, then ent_seq. Returns rows sorted by rank, independent of input order.
 */
export function rankWords(rows: JmdictRows): WordRow[] {
  const keyOf = new Map(rows.keys.map((k) => [k.entSeq, k]));
  const none = 1_000_000; // no nf band sorts last (Infinity - Infinity would be NaN)
  const ordered = [...rows.words].sort((a, b) => {
    const x = keyOf.get(a.entSeq) as RankKey;
    const y = keyOf.get(b.entSeq) as RankKey;
    return (
      (x.bestNf ?? none) - (y.bestNf ?? none) ||
      y.priorityCount - x.priorityCount ||
      a.entSeq - b.entSeq
    );
  });
  return ordered.map((w, i) => ({ ...w, freqRank: i + 1 }));
}
