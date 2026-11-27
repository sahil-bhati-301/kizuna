/**
 * JMdict import (W02-2 AC 3-6): parse the subset, rank it, return rows in ent_seq order.
 * Input arrives as text chunks; `importJmdictFile` adds the one piece of I/O (gunzip stream).
 */
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parseJmdict, rankWords } from '../domain/jmdict/index.ts';
import type { JmdictReport, Provenance, WordRow } from '../domain/jmdict/index.ts';
import { stringify } from './json.ts';

export interface JmdictImportResult {
  /** The subset, sorted by ent_seq, with `freqRank` 1..N. */
  readonly words: readonly WordRow[];
  readonly report: JmdictReport;
}

export async function importJmdict(
  chunks: Iterable<string> | AsyncIterable<string>,
  provenance: Provenance,
): Promise<JmdictImportResult> {
  const parsed = await parseJmdict(chunks, provenance);
  const words = rankWords(parsed).sort((a, b) => a.entSeq - b.entSeq);
  return { words, report: parsed.report };
}

/** Streams a JMdict.gz file through gunzip; never holds the whole XML in memory. */
export async function importJmdictFile(
  path: string,
  provenance: Provenance,
): Promise<JmdictImportResult> {
  const stream = createReadStream(path).pipe(createGunzip());
  stream.setEncoding('utf8');
  return importJmdict(stream as AsyncIterable<string>, provenance);
}

const WORD_KEYS = [
  'entSeq',
  'headword',
  'kana',
  'altForms',
  'senses',
  'freqRank',
  'isCommon',
  'jlptApprox',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof WordRow)[];

/** JSON with a fixed key order and a trailing newline: byte-stable for the same input. */
export function serialiseWords(result: JmdictImportResult): string {
  const words = [...result.words]
    .sort((a, b) => a.entSeq - b.entSeq)
    .map((w) => {
      const out: Record<string, unknown> = {};
      for (const k of WORD_KEYS) out[k] = w[k];
      return out;
    });
  const r = result.report;
  return `${stringify({
    words,
    report: {
      entriesRead: r.entriesRead,
      entriesLoaded: r.entriesLoaded,
      commonLoaded: r.commonLoaded,
      kanaHeadwordFallbacks: r.kanaHeadwordFallbacks,
      noValidReading: r.noValidReading,
    },
  })}\n`;
}
