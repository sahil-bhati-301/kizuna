/** W02-5 AC 3-5: zip reader, golden queue from fixtures, CLI file run. Never touches the network. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildReview, DecisionsError, parseDecisions } from './build.ts';
import { runReview } from './run.ts';
import { ZipError, readZipEntry } from './zip.ts';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const fx = (name: string) => at(`../../test/fixtures/${name}`);
const GOLDEN = at('./__golden__/review-queue.yaml');
const text = (path: string) => readFileSync(path, 'utf8');

const sources = (decisions: string) => ({
  kanjidic: [text(fx('review/kanjidic2-crosscheck.xml'))],
  joyo: text(fx('review/joyo-crosscheck.tsv')),
  kradfile: readFileSync(fx('review/kradfile-crosscheck.euc-jp')),
  kanjivg: [text(fx('kanjivg-excerpt.xml'))],
  unihan: text(fx('review/unihan-crosscheck.txt')),
  decisions,
});

describe('golden', () => {
  it('writes the same queue bytes for the same inputs', async () => {
    const decisions = text(fx('review/decisions-crosscheck.yaml'));
    const { yaml } = await buildReview(sources(decisions));
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, yaml);
    expect(yaml).toBe(readFileSync(GOLDEN, 'utf8'));
    expect((await buildReview(sources(decisions))).yaml).toBe(yaml);
  });

  it('skips the decided item and keeps the rest', async () => {
    const withDecision = await buildReview(sources(text(fx('review/decisions-crosscheck.yaml'))));
    const without = await buildReview(sources(''));
    expect(without.queue.items.length - withDecision.queue.items.length).toBe(1);
    expect(withDecision.queue.summary.decidedSkipped).toBe(1);
  });
});

describe('decisions file', () => {
  it('accepts an empty file and rejects bad entries', () => {
    expect(parseDecisions('')).toEqual([]);
    expect(parseDecisions('decisions: []\n')).toEqual([]);
    expect(() =>
      parseDecisions('decisions:\n  - {id: a, decision: maybe, reason: r, author: o}\n'),
    ).toThrow(DecisionsError);
  });
});

describe('zip reader', () => {
  /** A one-entry ZIP with the given method (0 stored, 8 deflated). */
  function zip(name: string, data: Buffer, method: 0 | 8): Buffer {
    const body = method === 8 ? deflateRawSync(data) : data;
    const nm = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nm.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nm.length, 28);
    const dirOffset = local.length + nm.length + body.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + nm.length, 12);
    end.writeUInt32LE(dirOffset, 16);
    return Buffer.concat([local, nm, body, central, nm, end]);
  }

  it('reads stored and deflated entries', () => {
    const data = Buffer.from('U+4E00\tkTotalStrokes\t1\n');
    expect(readZipEntry(zip('a.txt', data, 0), 'a.txt').equals(data)).toBe(true);
    expect(readZipEntry(zip('a.txt', data, 8), 'a.txt').equals(data)).toBe(true);
  });

  it('rejects a missing entry and a non-zip', () => {
    expect(() => readZipEntry(zip('a.txt', Buffer.from('x'), 0), 'b.txt')).toThrow(ZipError);
    expect(() => readZipEntry(Buffer.from('not a zip at all, just text'), 'a')).toThrow(ZipError);
  });
});

describe('cli run', () => {
  it('writes queue.yaml and summary.txt from fixture files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'review-'));
    const gz = async (name: string, data: string | Buffer) => {
      const p = join(dir, name);
      await writeFile(p, gzipSync(data));
      return p;
    };
    const lines = await runReview({
      kanjidicGz: await gz('kd.gz', readFileSync(fx('review/kanjidic2-crosscheck.xml'))),
      joyoTsv: fx('review/joyo-crosscheck.tsv'),
      kradfileGz: await gz('krad.gz', readFileSync(fx('review/kradfile-crosscheck.euc-jp'))),
      kanjivgGz: await gz('kvg.gz', readFileSync(fx('kanjivg-excerpt.xml'))),
      unihan: fx('review/unihan-crosscheck.txt'),
      decisions: join(dir, 'missing-decisions.yaml'),
      outDir: join(dir, 'out'),
    });
    expect(lines[0]).toBe('kanji checked: 5');
    expect(await readFile(join(dir, 'out/summary.txt'), 'utf8')).toBe(`${lines.join('\n')}\n`);
    const { yaml } = await buildReview(sources(''));
    expect(await readFile(join(dir, 'out/queue.yaml'), 'utf8')).toBe(yaml);
  });
});
