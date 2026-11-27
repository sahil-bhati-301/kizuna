/**
 * Jōyō table import and teach-set flags (W01-3 AC 3, 4; pipeline.md §3.3 Teach set).
 * Pure: the TSV arrives as a string.
 *
 * Owner decisions (WP OPEN-Q):
 * - Q3, Q9: matching tries the exact form (markers included) first and ignores affix markers
 *   only when no exact row exists (生 なま flags なま, not なま-; 日 か flags -か). The okurigana
 *   split always counts (う.まれる does not match うま.れる).
 * - Q5, Q8: a Jōyō kanji absent from KANJIDIC2 is reported once in missingKanji, with its
 *   readings attached; they are not repeated in missingReadings.
 */
import type { KanjiRow, KanjidicRows, ReadingRow } from '../kanjidic/index.ts';
import { parseReadingId } from '@kizuna/content';
import { joinReading, nfc, parseReading, toHiragana } from '../normalise/index.ts';
import type { Reading } from '../normalise/index.ts';

export type JoyoKind = 'on' | 'kun';

export interface JoyoEntry {
  readonly literal: string;
  readonly kind: JoyoKind;
  /** KANJIDIC notation: on'yomi in katakana, kun'yomi in hiragana, `.` before okurigana. */
  readonly reading: string;
}

export interface MissingKanji {
  readonly kanji: string;
  readonly readings: readonly JoyoEntry[];
}

export interface JoyoReport {
  /** Jōyō kanji with no KANJIDIC2 entry, in table order, each with its Jōyō readings (Q5, Q8). */
  readonly missingKanji: readonly MissingKanji[];
  /** Jōyō readings of kanji that KANJIDIC2 has but whose reading it does not list, in table order. */
  readonly missingReadings: readonly JoyoEntry[];
}

export interface JoyoApplied {
  readonly kanji: readonly KanjiRow[];
  readonly readings: readonly ReadingRow[];
  readonly report: JoyoReport;
}

export class JoyoTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JoyoTableError';
  }
}

const HEADER = ['literal', 'kind', 'reading'];

/** Parses the TSV: `#` comment lines and blank lines are skipped, the header is checked. */
export function parseJoyoTable(tsv: string): JoyoEntry[] {
  const entries: JoyoEntry[] = [];
  let sawHeader = false;
  const lines = tsv.split(/\r?\n/u);
  lines.forEach((line, index) => {
    if (line.trim() === '' || line.startsWith('#')) return;
    const fields = line.split('\t');
    const where = `Jōyō table line ${index + 1}`;
    if (!sawHeader) {
      if (fields.join('\t') !== HEADER.join('\t'))
        throw new JoyoTableError(`${where}: expected header ${HEADER.join(' TAB ')}`);
      sawHeader = true;
      return;
    }
    const [literal, kind, reading] = fields.map((f) => nfc(f.trim()));
    if (fields.length !== 3 || !literal || !reading)
      throw new JoyoTableError(`${where}: expected 3 non-empty fields`);
    if (kind !== 'on' && kind !== 'kun')
      throw new JoyoTableError(`${where}: kind must be on or kun, got ${kind ?? ''}`);
    if (Array.from(literal).length !== 1)
      throw new JoyoTableError(`${where}: literal must be one character`);
    entries.push({ literal, kind, reading });
  });
  if (!sawHeader) throw new JoyoTableError('Jōyō table has no header');
  return entries;
}

interface EntryForms {
  /** Kind and full KANJIDIC form, markers included (`kun\tなま`). */
  readonly exact: string;
  /** Kind, stem and okurigana, markers ignored. */
  readonly loose: string;
}

function forms(kind: string, r: Reading): EntryForms {
  return {
    exact: `${kind}\t${joinReading(r)}`,
    loose: `${kind}\t${r.stem}\t${r.okurigana}`,
  };
}

function entryForms(e: JoyoEntry): EntryForms {
  const parsed = parseReading(toHiragana(e.reading));
  if (!parsed.ok)
    throw new JoyoTableError(
      `Jōyō ${e.literal} ${e.kind}: malformed reading ${e.reading} (${parsed.error.kind})`,
    );
  return forms(e.kind, parsed.value);
}

/** The row's full form comes from its ID, which keeps the markers (Q2, Q3). */
function rowForms(r: ReadingRow): EntryForms {
  const id = parseReadingId(r.id);
  const parsed = id ? parseReading(id.kana) : undefined;
  if (!parsed?.ok) throw new JoyoTableError(`reading row has a malformed ID: ${r.id}`);
  return forms(r.kind, parsed.value);
}

/**
 * Flags Jōyō kanji and readings and reports Jōyō entries KANJIDIC2 cannot match.
 * Each entry flags the rows with its exact form; only when there are none does it flag the rows
 * that match with markers ignored (Q9).
 */
export function applyJoyo(parsed: KanjidicRows, entries: readonly JoyoEntry[]): JoyoApplied {
  const rowsByKanji = new Map<string, { index: number; forms: EntryForms }[]>();
  parsed.readings.forEach((r, index) => {
    const list = rowsByKanji.get(r.kanjiLiteral) ?? [];
    list.push({ index, forms: rowForms(r) });
    rowsByKanji.set(r.kanjiLiteral, list);
  });

  const present = new Set(parsed.kanji.map((k) => k.literal));
  const joyoKanji = new Set(entries.map((e) => e.literal));
  const flagged = new Set<number>();
  const missing = new Map<string, JoyoEntry[]>();
  const missingReadings: JoyoEntry[] = [];
  for (const e of entries) {
    const entry: JoyoEntry = { literal: e.literal, kind: e.kind, reading: e.reading };
    const f = entryForms(e);
    if (!present.has(e.literal)) {
      const list = missing.get(e.literal) ?? [];
      list.push(entry);
      missing.set(e.literal, list);
      continue;
    }
    const rows = rowsByKanji.get(e.literal) ?? [];
    let hits = rows.filter((r) => r.forms.exact === f.exact);
    if (hits.length === 0) hits = rows.filter((r) => r.forms.loose === f.loose);
    if (hits.length === 0) missingReadings.push(entry);
    for (const h of hits) flagged.add(h.index);
  }

  const kanji = parsed.kanji.map((k) => ({ ...k, isJoyo: joyoKanji.has(k.literal) }));
  const readings = parsed.readings.map((r, index) => ({ ...r, isJoyo: flagged.has(index) }));
  const missingKanji = Array.from(missing, ([k, readings]) => ({ kanji: k, readings }));
  return { kanji, readings, report: { missingKanji, missingReadings } };
}
