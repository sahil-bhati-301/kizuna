/**
 * KANJIDIC reading markers (W01-4 AC 3, pipeline.md §3.3).
 * - `.` separates the stem from the okurigana: `た.べる` → stem `た`, okurigana `べる`.
 * - A trailing `-` marks a prefix (`お-`); a leading `-` marks a suffix (`-な`).
 * Malformed input returns a typed error and never throws.
 */

export interface Reading {
  stem: string;
  okurigana: string;
  /** Trailing `-` in the source: the reading attaches before another element. */
  prefix: boolean;
  /** Leading `-` in the source: the reading attaches after another element. */
  suffix: boolean;
}

export type ReadingErrorKind = 'multiple-dots' | 'empty-stem' | 'empty-okurigana';

export interface ReadingError {
  kind: ReadingErrorKind;
  input: string;
}

export type ParseReadingResult = { ok: true; value: Reading } | { ok: false; error: ReadingError };

const MARKER = '-';
const DOT = '.';

export function parseReading(input: string): ParseReadingResult {
  let body = input;
  const suffix = body.startsWith(MARKER);
  if (suffix) body = body.slice(MARKER.length);
  const prefix = body.endsWith(MARKER);
  if (prefix) body = body.slice(0, -MARKER.length);

  const parts = body.split(DOT);
  if (parts.length > 2) return { ok: false, error: { kind: 'multiple-dots', input } };
  const stem = parts[0] ?? '';
  if (stem === '') return { ok: false, error: { kind: 'empty-stem', input } };
  const okurigana = parts[1];
  // `た.` would not re-join to its input, so a dot needs okurigana after it.
  if (okurigana === '') return { ok: false, error: { kind: 'empty-okurigana', input } };

  return { ok: true, value: { stem, okurigana: okurigana ?? '', prefix, suffix } };
}

/** Inverse of parseReading: joinReading(parseReading(s).value) === s for every valid s. */
export function joinReading(r: Reading): string {
  const okurigana = r.okurigana === '' ? '' : `${DOT}${r.okurigana}`;
  return `${r.suffix ? MARKER : ''}${r.stem}${okurigana}${r.prefix ? MARKER : ''}`;
}
