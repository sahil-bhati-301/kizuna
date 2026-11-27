/**
 * Tatoeba line parsers (W02-4 AC 1-2). Pure: no I/O. Text is NFC-normalised on the way in.
 * Index (B-line) token: `headword(reading)[sense]{form}~`, every part after the headword optional.
 */
import { nfc } from '../normalise/index.ts';

export interface SentenceLine {
  readonly id: number;
  readonly lang: string;
  readonly text: string;
}

export interface IndexItem {
  /** The dictionary headword Tatoeba indexed (JMdict keb or reb). */
  readonly headword: string;
  readonly reading: string | null;
  /** `(#1234567)`: Tatoeba names the JMdict entry directly (disambiguation), no reading then. */
  readonly entSeq: number | null;
  /** Sense number inside the entry, e.g. `01`. */
  readonly sense: string | null;
  /** The surface form as it appears in the sentence. */
  readonly form: string | null;
  /** `~`: the link was checked by a contributor. */
  readonly checked: boolean;
}

export interface IndexLine {
  readonly sentenceId: number;
  /** Id of the English sentence the index was made against. */
  readonly meaningId: number;
  /** Items that parsed; `badTokens` counts those that did not. */
  readonly items: readonly IndexItem[];
  readonly badTokens: number;
}

const ID = /^[1-9]\d*$/u;
const TOKEN = /^([^([{~]+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?(?:\{([^}]*)\})?(~)?$/u;

/** `id TAB lang TAB text`, or null when the line is malformed. */
export function parseSentenceLine(line: string): SentenceLine | null {
  const f = line.split('\t');
  if (f.length !== 3 || !ID.test(f[0]!) || f[1] === '' || f[2] === '') return null;
  return { id: Number(f[0]), lang: f[1]!, text: nfc(f[2]!) };
}

/** `from TAB to`, or null when the line is malformed. */
export function parseLinkLine(line: string): readonly [number, number] | null {
  const f = line.split('\t');
  if (f.length !== 2 || !ID.test(f[0]!) || !ID.test(f[1]!)) return null;
  return [Number(f[0]), Number(f[1])];
}

export function parseIndexItem(token: string): IndexItem | null {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const paren = m[2] ?? '';
  const direct = /^#(\d+)$/u.exec(paren);
  return {
    headword: nfc(m[1]!),
    reading: paren && !direct ? nfc(paren) : null,
    entSeq: direct ? Number(direct[1]) : null,
    sense: m[3] ? m[3] : null,
    form: m[4] ? nfc(m[4]) : null,
    checked: m[5] === '~',
  };
}

/** `sentence id TAB meaning id TAB index`, or null when the line is malformed. */
export function parseIndexLine(line: string): IndexLine | null {
  const f = line.split('\t');
  if (f.length !== 3 || !ID.test(f[0]!) || !ID.test(f[1]!)) return null;
  const items: IndexItem[] = [];
  let badTokens = 0;
  for (const token of f[2]!.split(/\s+/u).filter((t) => t !== '')) {
    const item = parseIndexItem(token);
    if (item) items.push(item);
    else badTokens++;
  }
  return { sentenceId: Number(f[0]), meaningId: Number(f[1]), items, badTokens };
}

/** The attribution link for a sentence on tatoeba.org (shows author and licence). */
export function attributionUrl(id: number): string {
  return `https://tatoeba.org/en/sentences/show/${id}`;
}
