/** `pnpm --filter @kizuna/pipeline review:build`: writes content/review/queue.yaml and summary.txt. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundled, parseLock } from '../sources/index.ts';
import { runReview } from './run.ts';

const content = join(dirname(fileURLToPath(import.meta.url)), '../../../../content');
const lockText = await readFile(join(content, 'sources.lock.yaml'), 'utf8');
const pins = [...parseLock(lockText).sources, ...parseBundled(lockText)];
const file = (id: string): string => {
  const pin = pins.find((s) => s.id === id);
  if (!pin) throw new Error(`${id} is not pinned in content/sources.lock.yaml`);
  return join(content, 'sources', pin.file);
};

const lines = await runReview({
  kanjidicGz: file('kanjidic2'),
  joyoTsv: join(content, 'joyo/joyo.tsv'),
  kradfileGz: file('kradfile'),
  kanjivgGz: file('kanjivg'),
  unihan: file('unihan'),
  decisions: join(content, 'review/decisions.yaml'),
  outDir: join(content, 'review'),
});
for (const line of lines) console.log(line);
