/** Full-file run: `pnpm --filter @kizuna/pipeline kanjivg:run` prints counts and the time taken. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBundled } from '../sources/index.ts';
import { importKanjivgFile } from './kanjivg.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const lock = parseBundled(await readFile(join(root, 'content/sources.lock.yaml'), 'utf8'));
const pin = lock.find((s) => s.id === 'kanjivg');
if (!pin) throw new Error('kanjivg is not pinned under bundled: in content/sources.lock.yaml');

const started = performance.now();
const { report: r, components } = await importKanjivgFile(join(root, 'content/sources', pin.file), {
  source: pin.id,
  sourceVersion: pin.version,
  license: pin.license,
});
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `kanjivg: kanji ${r.kanjiCount} (non-kanji skipped ${r.nonKanjiSkipped}), ` +
    `component ${r.componentRows}, kanji_component ${r.kanjiComponentRows}, ` +
    `unknown roles ${r.unknownRoles}, unknown positions ${r.unknownPositions}, ` +
    `kvg: slugs ${components.filter((c) => c.slug.startsWith('kvg:')).length}, ` +
    `unmatched parts ${r.unmatchedParts}, ambiguous radicals ${r.ambiguousRadicals}, ${seconds} s`,
);
