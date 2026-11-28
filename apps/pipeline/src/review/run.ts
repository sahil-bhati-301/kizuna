/** File I/O for `review:build` (W02-5 AC 4): reads the sources, writes queue.yaml and summary.txt. */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip, gunzipSync } from 'node:zlib';
import { summaryLines } from '../domain/crosscheck/index.ts';
import { buildReview } from './build.ts';
import { readZipEntry } from './zip.ts';

export interface ReviewPaths {
  readonly kanjidicGz: string;
  readonly joyoTsv: string;
  readonly kradfileGz: string;
  readonly kanjivgGz: string;
  /** Unihan.zip, or a plain-text file holding the kTotalStrokes lines. */
  readonly unihan: string;
  readonly decisions: string;
  readonly outDir: string;
}

const gz = (path: string) => {
  const stream = createReadStream(path).pipe(createGunzip());
  stream.setEncoding('utf8');
  return stream as AsyncIterable<string>;
};

async function readUnihan(path: string): Promise<string> {
  const bytes = await readFile(path);
  return path.endsWith('.zip')
    ? readZipEntry(bytes, 'Unihan_IRGSources.txt').toString('utf8')
    : bytes.toString('utf8');
}

/** Builds the queue and writes `queue.yaml` and `summary.txt` into `outDir`; returns the summary lines. */
export async function runReview(paths: ReviewPaths): Promise<string[]> {
  const { queue, yaml } = await buildReview({
    kanjidic: gz(paths.kanjidicGz),
    joyo: await readFile(paths.joyoTsv, 'utf8'),
    kradfile: gunzipSync(await readFile(paths.kradfileGz)),
    kanjivg: gz(paths.kanjivgGz),
    unihan: await readUnihan(paths.unihan),
    decisions: await readFile(paths.decisions, 'utf8').catch(() => ''),
  });
  const lines = summaryLines(queue.summary);
  await mkdir(paths.outDir, { recursive: true });
  await writeFile(join(paths.outDir, 'queue.yaml'), yaml);
  await writeFile(join(paths.outDir, 'summary.txt'), `${lines.join('\n')}\n`);
  return lines;
}
