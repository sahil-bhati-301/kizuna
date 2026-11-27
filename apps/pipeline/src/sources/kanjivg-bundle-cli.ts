/**
 * `pnpm --filter @kizuna/pipeline kanjivg:bundle <kanjivg clone>`: builds
 * content/sources/kanjivg.xml.gz from the clone's kanji/*.svg at its HEAD commit and prints the
 * sha256 to pin under `bundled:` in content/sources.lock.yaml. Refuses a dirty kanji/ directory.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleKanjivg, gzipReproducible, KANJIVG_BASE_FILE } from './kanjivg-bundle.ts';
import { parseBundled } from './lock.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo = process.argv[2];
if (repo === undefined) {
  console.log('Usage: kanjivg:bundle <path to a KanjiVG clone>');
  process.exit(2);
}
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
if (git('status', '--porcelain', '--', 'kanji').trim() !== '') {
  console.log(`${repo}: kanji/ has uncommitted changes; bundle from a clean checkout`);
  process.exit(1);
}
const [commit, date] = git('log', '-1', '--format=%H %cs').trim().split(' ') as [string, string];

const dir = join(repo, 'kanji');
const names = (await readdir(dir)).filter((n) => KANJIVG_BASE_FILE.test(n));
const files = await Promise.all(
  names.map(async (name) => ({ name, svg: await readFile(join(dir, name), 'utf8') })),
);
const gz = gzipReproducible(bundleKanjivg(files, { commit, date }));
const out = join(root, 'content/sources/kanjivg.xml.gz');
await writeFile(out, gz);
const sha256 = createHash('sha256').update(gz).digest('hex');

const pin = parseBundled(await readFile(join(root, 'content/sources.lock.yaml'), 'utf8')).find(
  (e) => e.id === 'kanjivg',
);
const verdict =
  pin === undefined
    ? 'not pinned yet'
    : pin.commit === commit && pin.sha256 === sha256
      ? 'matches the lock'
      : 'differs from the lock';
console.log(
  `kanjivg: ${files.length} files, commit ${commit} (${date}), ${gz.length} bytes, ` +
    `sha256 ${sha256}, ${verdict}`,
);
