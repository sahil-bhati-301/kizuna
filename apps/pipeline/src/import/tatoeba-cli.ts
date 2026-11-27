/** Full-file run: `pnpm --filter @kizuna/pipeline tatoeba:run` prints counts and the time taken. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLock } from '../sources/index.ts';
import { importJmdictFile } from './jmdict.ts';
import { importTatoebaFiles } from './tatoeba.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lock = parseLock(await readFile(join(root, 'content/sources.lock.yaml'), 'utf8'));
const pin = (id: string) => {
  const p = lock.sources.find((s) => s.id === id);
  if (!p) throw new Error(`${id} is not pinned in content/sources.lock.yaml`);
  return p;
};
const file = (id: string) => join(root, 'content/sources', pin(id).file);

const started = performance.now();
const jm = pin('jmdict');
const { words } = await importJmdictFile(file('jmdict'), {
  source: jm.id,
  sourceVersion: jm.version,
  license: jm.license,
});
const tat = pin('tatoeba-jpn-sentences');
const { sentences, report } = await importTatoebaFiles(
  {
    japanese: file('tatoeba-jpn-sentences'),
    links: file('tatoeba-jpn-eng-links'),
    english: file('tatoeba-eng-sentences'),
    indices: file('tatoeba-jpn-indices'),
  },
  words,
  { source: 'tatoeba', sourceVersion: tat.version, license: tat.license },
);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
const counts: Record<string, unknown> = { ...report };
delete counts.unmapped;
console.log(`tatoeba: ${JSON.stringify(counts)}, rows ${sentences.length}, ${seconds} s`);
