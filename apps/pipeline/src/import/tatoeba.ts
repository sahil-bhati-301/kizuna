/**
 * Tatoeba import (W02-4): joins sentences, links, English text and the word index into `sentence`
 * rows. Input arrives as lines; `importTatoebaFiles` adds the I/O (bzip2 and tar child processes,
 * because Node has no bzip2).
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  buildSentences,
  parseIndexLine,
  parseLinkLine,
  parseSentenceLine,
} from '../domain/tatoeba/index.ts';
import type {
  BuildResult,
  IndexLine,
  Provenance,
  SentenceLine,
  SentenceRow,
  TatoebaReport,
  WordForms,
} from '../domain/tatoeba/index.ts';
import { stringify } from './json.ts';

type Lines = Iterable<string> | AsyncIterable<string>;

export interface TatoebaInput {
  readonly japanese: Lines;
  readonly links: Lines;
  readonly english: Lines;
  readonly indices: Lines;
  /** The loaded words (JMdict import rows). */
  readonly words: readonly WordForms[];
  readonly provenance: Provenance;
}

export type TatoebaImportResult = BuildResult;

export async function importTatoeba(input: TatoebaInput): Promise<TatoebaImportResult> {
  const japanese: SentenceLine[] = [];
  for await (const line of input.japanese) {
    const s = parseSentenceLine(line);
    if (s && s.lang === 'jpn') japanese.push(s);
  }
  const jpIds = new Set(japanese.map((s) => s.id));

  const links = new Map<number, number[]>();
  const wanted = new Set<number>();
  for await (const line of input.links) {
    const l = parseLinkLine(line);
    if (!l || !jpIds.has(l[0])) continue;
    const list = links.get(l[0]);
    if (list) list.push(l[1]);
    else links.set(l[0], [l[1]]);
    wanted.add(l[1]);
  }

  const english = new Map<number, string>();
  for await (const line of input.english) {
    const tab = line.indexOf('\t');
    if (tab < 1 || !wanted.has(Number(line.slice(0, tab)))) continue;
    const s = parseSentenceLine(line);
    if (s && s.lang === 'eng') english.set(s.id, s.text);
  }

  const indices: IndexLine[] = [];
  for await (const line of input.indices) {
    const tab = line.indexOf('\t');
    if (tab < 1 || !jpIds.has(Number(line.slice(0, tab)))) continue;
    const l = parseIndexLine(line);
    if (l) indices.push(l);
  }

  return buildSentences({
    japanese,
    links,
    english,
    indices,
    words: input.words,
    provenance: input.provenance,
  });
}

/** Decompressed lines of a file, via `bzip2 -dc` (or `tar -xOjf` for the indices tarball). */
export async function* bzLines(path: string, tar = false): AsyncGenerator<string> {
  const child = tar
    ? spawn('tar', ['-xOjf', path], { stdio: ['ignore', 'pipe', 'inherit'] })
    : spawn('bzip2', ['-dc', path], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  yield* createInterface({ input: child.stdout, crlfDelay: Infinity });
  const code = await exited;
  if (code !== 0)
    throw new Error(`${tar ? 'tar' : 'bzip2'} failed on ${path} (exit ${String(code)})`);
}

export interface TatoebaFiles {
  readonly japanese: string;
  readonly links: string;
  readonly english: string;
  readonly indices: string;
}

export function importTatoebaFiles(
  files: TatoebaFiles,
  words: readonly WordForms[],
  provenance: Provenance,
): Promise<TatoebaImportResult> {
  return importTatoeba({
    japanese: bzLines(files.japanese),
    links: bzLines(files.links),
    english: bzLines(files.english),
    indices: bzLines(files.indices, true),
    words,
    provenance,
  });
}

const ROW_KEYS = [
  'id',
  'japanese',
  'translations',
  'wordIds',
  'quality',
  'attributionUrl',
  'source',
  'sourceVersion',
  'license',
] as const satisfies readonly (keyof SentenceRow)[];

const REPORT_KEYS = [
  'japaneseRead',
  'sentencesKept',
  'noEnglishTranslation',
  'noIndexLine',
  'noMappedWord',
  'wordLinks',
  'unknownItems',
  'ambiguousItems',
  'unparsedItems',
  'optionBKept',
] as const satisfies readonly (keyof TatoebaReport)[];

/** JSON with a fixed key order and a trailing newline: byte-stable for the same input. */
export function serialiseSentences(result: TatoebaImportResult): string {
  const sentences = [...result.sentences]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((s) => {
      const out: Record<string, unknown> = {};
      for (const k of ROW_KEYS) out[k] = s[k];
      return out;
    });
  const report: Record<string, unknown> = {};
  for (const k of REPORT_KEYS) report[k] = result.report[k];
  report.unmapped = result.report.unmapped.map((u) => ({
    sentenceId: u.sentenceId,
    headword: u.headword,
    reading: u.reading,
    reason: u.reason,
  }));
  return `${stringify({ sentences, report })}\n`;
}
