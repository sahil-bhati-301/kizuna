/**
 * KanjiVG import (W02-1 AC 1, 5, 6): parse the release bundle, return rows in stable order.
 * Input arrives as text chunks; `importKanjivgFile` adds the one piece of I/O (gunzip stream).
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parseKanjivg } from '../domain/kanjivg/index.ts';
import type {
  ComponentRow,
  KanjiComponentRow,
  KanjivgReport,
  Provenance,
  StrokeCount,
} from '../domain/kanjivg/index.ts';
import { stringify } from './json.ts';

export interface KanjivgImportResult {
  /** Sorted by slug (code point order). */
  readonly components: readonly ComponentRow[];
  /** Sorted by kanji code point, then ord. */
  readonly kanjiComponents: readonly KanjiComponentRow[];
  /** Sorted by kanji code point. */
  readonly strokes: readonly StrokeCount[];
  readonly report: KanjivgReport;
}

/** Compares strings by Unicode code point (not UTF-16 unit), so astral glyphs sort correctly. */
function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] as string).codePointAt(0)! - (y[i] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

const cp = (literal: string) => literal.codePointAt(0)!;

function sortKanjivg(result: KanjivgImportResult): KanjivgImportResult {
  return {
    components: [...result.components].sort((a, b) => compareCodePoints(a.slug, b.slug)),
    kanjiComponents: [...result.kanjiComponents].sort(
      (a, b) => cp(a.kanjiLiteral) - cp(b.kanjiLiteral) || a.ord - b.ord,
    ),
    strokes: [...result.strokes].sort((a, b) => cp(a.kanji) - cp(b.kanji)),
    report: result.report,
  };
}

export async function importKanjivg(
  chunks: Iterable<string> | AsyncIterable<string>,
  provenance: Provenance,
): Promise<KanjivgImportResult> {
  return sortKanjivg(await parseKanjivg(chunks, provenance));
}

/** Streams a kanjivg.xml.gz file through gunzip; never holds the whole XML in memory. */
export async function importKanjivgFile(
  path: string,
  provenance: Provenance,
): Promise<KanjivgImportResult> {
  const stream = createReadStream(path).pipe(createGunzip());
  stream.setEncoding('utf8');
  return importKanjivg(stream as AsyncIterable<string>, provenance);
}

const COMPONENT_KEYS = [
  'slug',
  'glyph',
  'kanjiVgId',
  'radicalNumber',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof ComponentRow)[];

const KANJI_COMPONENT_KEYS = [
  'kanjiLiteral',
  'componentSlug',
  'position',
  'role',
  'depth',
  'ord',
  'kvgId',
  'parentKvgId',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof KanjiComponentRow)[];

const REPORT_KEYS = [
  'kanjiCount',
  'componentRows',
  'kanjiComponentRows',
  'unknownRoles',
  'unknownPositions',
  'codepointlessComponents',
  'unmatchedParts',
  'nonKanjiSkipped',
  'ambiguousRadicals',
] as const satisfies readonly (keyof KanjivgReport)[];

function pick<T extends object>(row: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k as string] = row[k];
  return out;
}

/** Sorted JSON rows with a fixed key order and a trailing newline: byte-stable for the same input. */
export function serialiseKanjivg(result: KanjivgImportResult): string {
  const sorted = sortKanjivg(result);
  return `${stringify({
    components: sorted.components.map((c) => pick(c, COMPONENT_KEYS)),
    kanjiComponents: sorted.kanjiComponents.map((r) => pick(r, KANJI_COMPONENT_KEYS)),
    strokes: sorted.strokes.map((s) => ({ kanji: s.kanji, strokes: s.strokes })),
    report: pick(sorted.report, REPORT_KEYS),
  })}\n`;
}
