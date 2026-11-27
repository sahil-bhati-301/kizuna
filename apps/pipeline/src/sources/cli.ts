import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { ChecksumMismatchError, fetchSource, pinSource } from './fetch.ts';
import { parseLock } from './lock.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lockPath = join(root, 'content/sources.lock.yaml');
const sourcesDir = join(root, 'content/sources');

async function main(argv: string[]): Promise<number> {
  const [cmd, id] = argv;
  const text = await readFile(lockPath, 'utf8');
  const lock = parseLock(text);
  const entries = id ? lock.sources.filter((s) => s.id === id) : lock.sources;
  if (entries.length === 0) {
    console.error(`Unknown source "${id}"`);
    return 2;
  }
  if (cmd === 'fetch') {
    for (const entry of entries) {
      try {
        console.log(`${entry.id}: ${await fetchSource(entry, { sourcesDir })}`);
      } catch (e) {
        if (!(e instanceof ChecksumMismatchError)) throw e;
        console.error(e.message);
        return 1;
      }
    }
    return 0;
  }
  if (cmd === 'pin') {
    const doc = parseDocument(text);
    const today = new Date().toISOString().slice(0, 10);
    for (const entry of entries) {
      const sha = await pinSource(entry, { sourcesDir });
      const idx = lock.sources.indexOf(entry);
      doc.setIn(['sources', idx, 'sha256'], sha);
      doc.setIn(['sources', idx, 'fetched'], today);
      console.log(`${entry.id}: pinned ${sha}`);
    }
    await writeFile(lockPath, doc.toString());
    return 0;
  }
  console.error('Usage: cli.ts fetch|pin [source-id]');
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
