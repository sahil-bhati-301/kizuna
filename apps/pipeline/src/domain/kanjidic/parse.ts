/**
 * KANJIDIC2 → kanji and reading rows (W01-3 AC 1, 2, 6; pipeline.md §3.3, content.md §3.1).
 * Streams the XML: each <character> becomes rows as soon as it closes. Pure: no I/O.
 *
 * Owner decisions (WP OPEN-Q):
 * - Q2/Q3: the reading ID keeps KANJIDIC markers (`食:kun:た.べる`, `生:kun:なま-`); the stored
 *   kana has none. Readings that differ only by marker are separate rows.
 * - Q4: a reading without a dot has okurigana NULL.
 */
import { buildReadingId } from '@kizuna/content';
import type { NewKanji, NewReading, ReadingKind } from '@kizuna/content';
import { joinReading, nfc, parseReading, toHiragana } from '../normalise/index.ts';
import { XmlTokenizer } from './xml.ts';
import type { XmlToken } from './xml.ts';

export interface Provenance {
  readonly source: string;
  readonly sourceVersion: string;
  readonly license: string;
}

export interface Meaning {
  readonly lang: string;
  readonly text: string;
}

export interface KanjiRow extends Provenance {
  readonly literal: string;
  readonly codepoint: number;
  readonly strokes: number;
  readonly radicalNumber: number;
  readonly grade: number | null;
  readonly freqRank: number | null;
  readonly isJoyo: boolean;
  readonly meanings: readonly Meaning[];
}

export interface ReadingRow extends Provenance {
  readonly id: string;
  readonly kanjiLiteral: string;
  readonly kind: ReadingKind;
  /** Hiragana, no markers. */
  readonly kana: string;
  /** Hiragana after the `.` marker; null when the source reading has no dot (Q4). */
  readonly okurigana: string | null;
  readonly isJoyo: boolean;
}

/**
 * A <character> left out of the rows because its literal is not in NFC: a CJK compatibility
 * ideograph (e.g. U+FA67) that NFC folds onto a unified kanji (U+9038 逸), whose literal it would
 * duplicate. Provisional until WP OPEN-Q Q7 is answered; reported, never dropped silently.
 */
export interface ExcludedCharacter {
  /** The source literal, as written in KANJIDIC2. */
  readonly literal: string;
  readonly codepoint: number;
  /** The NFC form it folds onto. */
  readonly nfcLiteral: string;
  readonly reason: 'compatibility-ideograph';
}

export interface KanjidicRows {
  readonly kanji: readonly KanjiRow[];
  readonly readings: readonly ReadingRow[];
  readonly excluded: readonly ExcludedCharacter[];
}

// Compile-time check: the rows fit the content insert types.
type Assignable<T, U extends T> = U;
export type KanjiRowFitsSchema = Assignable<
  NewKanji,
  Omit<KanjiRow, 'meanings'> & { meanings: unknown }
>;
export type ReadingRowFitsSchema = Assignable<NewReading, ReadingRow>;

export class KanjidicDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KanjidicDataError';
  }
}

interface RawReading {
  kind: ReadingKind;
  text: string;
}

interface RawCharacter {
  literal?: string;
  codepoint?: number;
  radicalNumber?: number;
  strokes?: number;
  grade?: number;
  freqRank?: number;
  meanings: Meaning[];
  readings: RawReading[];
}

function toInt(text: string, field: string, literal: string | undefined): number {
  const n = Number(text.trim());
  if (!Number.isInteger(n))
    throw new KanjidicDataError(`${literal ?? '?'}: ${field} is not an integer: ${text}`);
  return n;
}

function readingRow(literal: string, raw: RawReading, provenance: Provenance): ReadingRow {
  const normalised = toHiragana(nfc(raw.text));
  const parsed = parseReading(normalised);
  if (!parsed.ok)
    throw new KanjidicDataError(
      `${literal}: malformed ${raw.kind} reading ${JSON.stringify(raw.text)} (${parsed.error.kind})`,
    );
  const r = parsed.value;
  return {
    id: buildReadingId({ kanji: literal, kind: raw.kind, kana: joinReading(r) }),
    kanjiLiteral: literal,
    kind: raw.kind,
    kana: r.stem,
    okurigana: r.okurigana === '' ? null : r.okurigana,
    isJoyo: false,
    ...provenanceOf(provenance),
  };
}

function provenanceOf(p: Provenance): Provenance {
  return { source: p.source, sourceVersion: p.sourceVersion, license: p.license };
}

function toRows(
  c: RawCharacter,
  provenance: Provenance,
): { kanji: KanjiRow; readings: ReadingRow[] } | ExcludedCharacter {
  const literal = c.literal === undefined ? undefined : nfc(c.literal);
  if (c.literal === undefined || literal === undefined || literal === '')
    throw new KanjidicDataError('A <character> has no <literal>');
  const missing = (field: string) =>
    new KanjidicDataError(`${literal}: <character> has no ${field}`);
  if (c.codepoint === undefined) throw missing('ucs codepoint');
  if (literal !== c.literal)
    return {
      literal: c.literal,
      codepoint: c.codepoint,
      nfcLiteral: literal,
      reason: 'compatibility-ideograph',
    };
  if (c.codepoint !== literal.codePointAt(0))
    throw new KanjidicDataError(`${literal}: ucs codepoint ${c.codepoint.toString(16)} differs`);
  if (c.strokes === undefined) throw missing('stroke_count');
  if (c.radicalNumber === undefined) throw missing('classical radical');

  const kanji: KanjiRow = {
    literal,
    codepoint: c.codepoint,
    strokes: c.strokes,
    radicalNumber: c.radicalNumber,
    grade: c.grade ?? null,
    freqRank: c.freqRank ?? null,
    isJoyo: false,
    meanings: c.meanings,
    ...provenanceOf(provenance),
  };
  const seen = new Set<string>();
  const readings: ReadingRow[] = [];
  for (const raw of c.readings) {
    const row = readingRow(literal, raw, provenance);
    if (seen.has(row.id)) continue; // the same reading listed twice is one row
    seen.add(row.id);
    readings.push(row);
  }
  return { kanji, readings };
}

const READING_KINDS: Readonly<Record<string, ReadingKind>> = { ja_on: 'on', ja_kun: 'kun' };

/** Folds tokens into characters; `onCharacter` fires when a </character> closes. */
class CharacterBuilder {
  private current: RawCharacter | undefined;
  private open: { name: string; attrs: Readonly<Record<string, string>> } | undefined;
  private text = '';
  private readonly onCharacter: (c: RawCharacter) => void;

  constructor(onCharacter: (c: RawCharacter) => void) {
    this.onCharacter = onCharacter;
  }

  feed(tokens: readonly XmlToken[]): void {
    for (const t of tokens) this.token(t);
  }

  private token(t: XmlToken): void {
    if (t.type === 'open') {
      if (t.name === 'character') {
        this.current = { meanings: [], readings: [] };
      } else if (this.current && !t.selfClosing) {
        this.open = { name: t.name, attrs: t.attrs };
        this.text = '';
      }
      return;
    }
    if (t.type === 'text') {
      if (this.open) this.text += t.text;
      return;
    }
    if (t.name === 'character') {
      if (this.current) this.onCharacter(this.current);
      this.current = undefined;
      this.open = undefined;
      return;
    }
    if (this.current && this.open && this.open.name === t.name) {
      this.leaf(this.current, t.name, this.open.attrs, this.text);
    }
    this.open = undefined;
  }

  private leaf(
    c: RawCharacter,
    name: string,
    attrs: Readonly<Record<string, string>>,
    text: string,
  ): void {
    switch (name) {
      case 'literal':
        c.literal = text.trim();
        break;
      case 'cp_value':
        if (attrs['cp_type'] === 'ucs') c.codepoint = Number.parseInt(text.trim(), 16);
        break;
      case 'rad_value':
        if (attrs['rad_type'] === 'classical')
          c.radicalNumber = toInt(text, 'classical radical', c.literal);
        break;
      case 'stroke_count':
        // The first stroke_count is the accepted one; later ones are common miscounts.
        if (c.strokes === undefined) c.strokes = toInt(text, 'stroke_count', c.literal);
        break;
      case 'grade':
        c.grade = toInt(text, 'grade', c.literal);
        break;
      case 'freq':
        c.freqRank = toInt(text, 'freq', c.literal);
        break;
      case 'meaning':
        c.meanings.push({ lang: attrs['m_lang'] ?? 'en', text: nfc(text.trim()) });
        break;
      case 'reading': {
        const kind = READING_KINDS[attrs['r_type'] ?? ''];
        if (kind !== undefined) c.readings.push({ kind, text: text.trim() });
        break;
      }
      case 'nanori':
        c.readings.push({ kind: 'nanori', text: text.trim() });
        break;
      default:
        break;
    }
  }
}

/**
 * Parses KANJIDIC2 XML arriving in chunks. Rows keep source order; readings follow
 * on, kun, nanori as listed per character. Throws KanjidicDataError on data it cannot map.
 */
export async function parseKanjidic(
  chunks: Iterable<string> | AsyncIterable<string>,
  provenance: Provenance,
): Promise<KanjidicRows> {
  const kanji: KanjiRow[] = [];
  const readings: ReadingRow[] = [];
  const excluded: ExcludedCharacter[] = [];
  const literals = new Set<string>();
  const builder = new CharacterBuilder((c) => {
    const rows = toRows(c, provenance);
    if (!('kanji' in rows)) {
      excluded.push(rows);
      return;
    }
    if (literals.has(rows.kanji.literal))
      throw new KanjidicDataError(`${rows.kanji.literal}: listed twice`);
    literals.add(rows.kanji.literal);
    kanji.push(rows.kanji);
    readings.push(...rows.readings);
  });
  const tokenizer = new XmlTokenizer();
  for await (const chunk of chunks) builder.feed(tokenizer.push(chunk));
  builder.feed(tokenizer.end());
  return { kanji, readings, excluded };
}
