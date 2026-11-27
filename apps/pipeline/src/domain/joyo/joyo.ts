/**
 * Jōyō table import and teach-set flags (W01-3 AC 3, 4; pipeline.md §3.3 Teach set).
 * Pure: the TSV arrives as a string.
 *
 * Owner decisions (WP OPEN-Q):
 * - Q3: matching ignores affix markers (Jōyō 日 か matches KANJIDIC2 -か) but not the
 *   okurigana split (う.まれる does not match うま.れる).
 * - Q5: readings of a Jōyō kanji absent from KANJIDIC2 are not repeated in missingReadings.
 */
import type { KanjiRow, KanjidicRows, ReadingRow } from '../kanjidic/index.ts';
import { nfc, parseReading, toHiragana } from '../normalise/index.ts';

export type JoyoKind = 'on' | 'kun';

export interface JoyoEntry {
  readonly literal: string;
  readonly kind: JoyoKind;
  /** KANJIDIC notation: on'yomi in katakana, kun'yomi in hiragana, `.` before okurigana. */
  readonly reading: string;
}

export interface JoyoReport {
  /** Jōyō kanji with no KANJIDIC2 entry, in table order. */
  readonly missingKanji: readonly string[];
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

/** Marker-free match key: kind, hiragana stem and okurigana. */
function key(kind: string, stem: string, okurigana: string): string {
  return `${kind}\t${stem}\t${okurigana}`;
}

function entryKey(e: JoyoEntry): string {
  const parsed = parseReading(toHiragana(e.reading));
  if (!parsed.ok)
    throw new JoyoTableError(
      `Jōyō ${e.literal} ${e.kind}: malformed reading ${e.reading} (${parsed.error.kind})`,
    );
  return key(e.kind, parsed.value.stem, parsed.value.okurigana);
}

const rowKey = (r: ReadingRow) => key(r.kind, r.kana, r.okurigana ?? '');

/** Flags Jōyō kanji and readings and reports Jōyō entries KANJIDIC2 cannot match. */
export function applyJoyo(parsed: KanjidicRows, entries: readonly JoyoEntry[]): JoyoApplied {
  const keysByKanji = new Map<string, Set<string>>();
  for (const e of entries) {
    const keys = keysByKanji.get(e.literal) ?? new Set<string>();
    keys.add(entryKey(e));
    keysByKanji.set(e.literal, keys);
  }

  const kanji = parsed.kanji.map((k) => ({ ...k, isJoyo: keysByKanji.has(k.literal) }));
  const matched = new Set<string>();
  const readings = parsed.readings.map((r) => {
    const k = rowKey(r);
    const isJoyo = keysByKanji.get(r.kanjiLiteral)?.has(k) ?? false;
    if (isJoyo) matched.add(`${r.kanjiLiteral}\t${k}`);
    return { ...r, isJoyo };
  });

  const present = new Set(parsed.kanji.map((k) => k.literal));
  const missingKanji: string[] = [];
  const missingReadings: JoyoEntry[] = [];
  for (const e of entries) {
    if (!present.has(e.literal)) {
      if (!missingKanji.includes(e.literal)) missingKanji.push(e.literal);
    } else if (!matched.has(`${e.literal}\t${entryKey(e)}`)) {
      missingReadings.push({ literal: e.literal, kind: e.kind, reading: e.reading });
    }
  }
  return { kanji, readings, report: { missingKanji, missingReadings } };
}
