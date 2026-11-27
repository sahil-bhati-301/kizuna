/** Full-file run: `pnpm --filter @kizuna/pipeline jmdict:run` prints counts and the time taken. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLock } from '../sources/index.ts';
import { importJmdictFile } from './jmdict.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lock = parseLock(await readFile(join(root, 'content/sources.lock.yaml'), 'utf8'));
const pin = lock.sources.find((s) => s.id === 'jmdict');
if (!pin) throw new Error('jmdict is not pinned in content/sources.lock.yaml');

const started = performance.now();
const { words, report } = await importJmdictFile(join(root, 'content/sources', pin.file), {
  source: pin.id,
  sourceVersion: pin.version,
  license: pin.license,
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `jmdict: read ${report.entriesRead}, loaded ${report.entriesLoaded} ` +
    `(common ${report.commonLoaded}), ranks 1..${words.length}, ` +
    `kana-headword fallbacks ${report.kanaHeadwordFallbacks.length}, ` +
    `no valid reading ${report.noValidReading.length}, ${seconds} s`,
);
