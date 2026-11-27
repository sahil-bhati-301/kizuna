import { readFile, writeFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import {
  ChecksumMismatchError,
  downloadForPin,
  fetchSource,
  storeSource,
  type FetchFn,
} from './fetch.ts';
import { parseLock } from './lock.ts';

export interface RunOptions {
  lockPath: string;
  sourcesDir: string;
  fetchFn?: FetchFn;
  today: string;
  log?: (line: string) => void;
}

/** Runs a sources command and returns the process exit code. */
export async function run(argv: string[], opts: RunOptions): Promise<number> {
  const log = opts.log ?? console.log;
  const [cmd, id] = argv;
  const text = await readFile(opts.lockPath, 'utf8');
  const lock = parseLock(text);
  const entries = id ? lock.sources.filter((s) => s.id === id) : lock.sources;
  if (entries.length === 0) {
    log(`Unknown source "${id}"`);
    return 2;
  }
  const fetchOpts = {
    sourcesDir: opts.sourcesDir,
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
  };
  if (cmd === 'fetch') {
    for (const entry of entries) {
      try {
        log(`${entry.id}: ${await fetchSource(entry, fetchOpts)}`);
      } catch (e) {
        if (!(e instanceof ChecksumMismatchError)) throw e;
        log(e.message);
        return 1;
      }
    }
    return 0;
  }
  if (cmd === 'pin') {
    // Download everything first, so a failure leaves files and lock untouched.
    const got = [];
    for (const entry of entries) got.push(await downloadForPin(entry, opts.fetchFn));
    const doc = parseDocument(text);
    for (const [i, entry] of entries.entries()) {
      const g = got[i]!;
      await storeSource(entry, g.bytes, opts.sourcesDir);
      const idx = lock.sources.indexOf(entry);
      doc.setIn(['sources', idx, 'sha256'], g.sha256);
      doc.setIn(['sources', idx, 'fetched'], opts.today);
      log(`${entry.id}: pinned ${g.sha256}`);
    }
    await writeFile(opts.lockPath, doc.toString());
    return 0;
  }
  log('Usage: cli.ts fetch|pin [source-id]');
  return 2;
}
