import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SourceEntry } from './lock.ts';

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; bytes: Uint8Array }>;

export const defaultFetch: FetchFn = async (url) => {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
};

export class ChecksumMismatchError extends Error {
  readonly source: string;
  readonly expected: string;
  readonly actual: string;
  constructor(source: string, expected: string, actual: string) {
    super(
      `Checksum mismatch for source "${source}": expected ${expected}, got ${actual}. ` +
        `If the upstream change is intended, re-pin with: pnpm --filter @kizuna/pipeline sources:pin ${source}`,
    );
    this.source = source;
    this.expected = expected;
    this.actual = actual;
  }
}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export const sourcePath = (sourcesDir: string, entry: SourceEntry): string =>
  join(sourcesDir, entry.file);

async function download(entry: SourceEntry, fetchFn: FetchFn): Promise<Uint8Array> {
  const res = await fetchFn(entry.url);
  if (!res.ok) throw new Error(`Source "${entry.id}": HTTP ${res.status} from ${entry.url}`);
  return res.bytes;
}

async function store(path: string, bytes: Uint8Array, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.part`;
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Returns 'cached' when the committed file already matches the pin; no network is touched. */
export async function fetchSource(
  entry: SourceEntry,
  opts: { sourcesDir: string; fetchFn?: FetchFn },
): Promise<'cached' | 'downloaded'> {
  const path = sourcePath(opts.sourcesDir, entry);
  try {
    if (sha256(await readFile(path)) === entry.sha256) return 'cached';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const bytes = await download(entry, opts.fetchFn ?? defaultFetch);
  const actual = sha256(bytes);
  if (actual !== entry.sha256) throw new ChecksumMismatchError(entry.id, entry.sha256, actual);
  await store(path, bytes, opts.sourcesDir);
  return 'downloaded';
}

/** Downloads unconditionally and returns the bytes and checksum; writes nothing. */
export async function downloadForPin(
  entry: SourceEntry,
  fetchFn: FetchFn = defaultFetch,
): Promise<{ bytes: Uint8Array; sha256: string }> {
  const bytes = await download(entry, fetchFn);
  return { bytes, sha256: sha256(bytes) };
}

/** Writes a downloaded file into the sources directory. */
export const storeSource = (
  entry: SourceEntry,
  bytes: Uint8Array,
  sourcesDir: string,
): Promise<void> => store(sourcePath(sourcesDir, entry), bytes, sourcesDir);

/** Downloads unconditionally, stores the file and returns the new checksum. */
export async function pinSource(
  entry: SourceEntry,
  opts: { sourcesDir: string; fetchFn?: FetchFn },
): Promise<string> {
  const got = await downloadForPin(entry, opts.fetchFn);
  await storeSource(entry, got.bytes, opts.sourcesDir);
  return got.sha256;
}
