/**
 * KANJIDIC2 + Jōyō import (W01-3 AC 3-6): parse, flag the teach set, sort by stable keys.
 * Input arrives as text; reading files is the caller's job.
 */
import { applyJoyo, parseJoyoTable } from '../domain/joyo/index.ts';
import type { JoyoEntry, JoyoReport } from '../domain/joyo/index.ts';
import { parseKanjidic } from '../domain/kanjidic/index.ts';
import { parseKradfileBytes } from '../domain/kradfile/index.ts';
import type { BadLine, KradRow } from '../domain/kradfile/index.ts';
import { stringify } from './json.ts';
import type {
  ExcludedCharacter,
  KanjiRow,
  Provenance,
  ReadingRow,
} from '../domain/kanjidic/index.ts';

export interface ImportReport extends JoyoReport {
  /** KANJIDIC2 entries left out of the rows (compatibility ideographs; WP OPEN-Q Q7). */
  readonly excludedCharacters: readonly ExcludedCharacter[];
}

export interface ImportResult {
  readonly kanji: readonly KanjiRow[];
  readonly readings: readonly ReadingRow[];
  readonly report: ImportReport;
}

export interface ImportInput {
  readonly kanjidic: Iterable<string> | AsyncIterable<string>;
  /** The Jōyō TSV (content/joyo/joyo.tsv format). */
  readonly joyo: string;
  readonly provenance: Provenance;
}

/** Compares strings by Unicode code point (not UTF-16 unit), so astral kanji sort correctly. */
function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] as string).codePointAt(0)! - (y[i] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

const KIND_ORDER: Readonly<Record<string, number>> = { on: 0, kun: 1, nanori: 2 };

/** Kanji by code point; readings by kanji, kind (on, kun, nanori), then ID. */
export function sortRows(result: ImportResult): ImportResult {
  const codepoint = new Map(result.kanji.map((k) => [k.literal, k.codepoint]));
  const cp = (literal: string) => codepoint.get(literal) ?? literal.codePointAt(0)!;
  const kanji = [...result.kanji].sort((a, b) => a.codepoint - b.codepoint);
  const readings = [...result.readings].sort(
    (a, b) =>
      cp(a.kanjiLiteral) - cp(b.kanjiLiteral) ||
      (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3) ||
      compareCodePoints(a.id, b.id),
  );
  const excludedCharacters = [...result.report.excludedCharacters].sort(
    (a, b) => a.codepoint - b.codepoint,
  );
  return { kanji, readings, report: { ...result.report, excludedCharacters } };
}

/** Parses KANJIDIC2, applies the Jōyō table and returns rows in stable order. */
export async function importKanjidic(input: ImportInput): Promise<ImportResult> {
  const parsed = await parseKanjidic(input.kanjidic, input.provenance);
  const applied = applyJoyo(parsed, parseJoyoTable(input.joyo));
  return sortRows({
    ...applied,
    report: { ...applied.report, excludedCharacters: parsed.excluded },
  });
}

const KANJI_KEYS = [
  'literal',
  'codepoint',
  'strokes',
  'radicalNumber',
  'grade',
  'freqRank',
  'isJoyo',
  'meanings',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof KanjiRow)[];

const READING_KEYS = [
  'id',
  'kanjiLiteral',
  'kind',
  'kana',
  'okurigana',
  'isJoyo',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof ReadingRow)[];

function pick<T extends object>(row: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k as string] = row[k];
  return out;
}

const entry = (e: JoyoEntry) => ({ literal: e.literal, kind: e.kind, reading: e.reading });

/** Sorted JSON rows with a fixed key order: byte-stable for the same inputs. */
export function serialiseRows(result: ImportResult): string {
  const sorted = sortRows(result);
  return `${stringify({
    kanji: sorted.kanji.map((k) => pick(k, KANJI_KEYS)),
    readings: sorted.readings.map((r) => pick(r, READING_KEYS)),
    report: {
      missingKanji: sorted.report.missingKanji.map((m) => ({
        kanji: m.kanji,
        readings: m.readings.map(entry),
      })),
      missingReadings: sorted.report.missingReadings.map(entry),
      ambiguousReadings: sorted.report.ambiguousReadings.map((e) => ({
        kanji: e.kanji,
        kind: e.kind,
        reading: e.reading,
      })),
      excludedCharacters: sorted.report.excludedCharacters.map((e) => ({
        literal: e.literal,
        codepoint: e.codepoint,
        nfcLiteral: e.nfcLiteral,
        reason: e.reason,
      })),
    },
  })}\n`;
}

export interface KradfileResult {
  readonly kanji: readonly KradRow[];
  readonly badLines: readonly BadLine[];
}

/** Decodes and parses KRADFILE bytes; kanji sorted by code point (the file is not). */
export function importKradfile(bytes: Uint8Array, provenance: Provenance): KradfileResult {
  const parsed = parseKradfileBytes(bytes, provenance);
  return {
    kanji: [...parsed.kanji].sort((a, b) => a.codepoint - b.codepoint),
    badLines: parsed.badLines,
  };
}

/** JSON with a fixed key order and a trailing newline: byte-stable for the same input. */
export function serialiseKradfile(result: KradfileResult): string {
  return `${stringify({
    kanji: result.kanji.map((k) => ({
      literal: k.literal,
      codepoint: k.codepoint,
      components: k.components.map((c) => ({ component: c.component, radical: c.radical })),
      source: k.source,
      sourceVersion: k.sourceVersion,
      license: k.license,
    })),
    badLines: result.badLines.map((b) => ({ line: b.line, text: b.text, reason: b.reason })),
  })}\n`;
}

export { importJmdict, importJmdictFile, serialiseWords } from './jmdict.ts';
export type { JmdictImportResult } from './jmdict.ts';
