import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChecksumMismatchError, defaultFetch, fetchSource, pinSource, sha256 } from './fetch.ts';
import { LockSchemaError, parseLock, validateLock, type SourceEntry } from './lock.ts';

const body = new TextEncoder().encode('stub payload');
let server: Server;
let base: string;
let hits = 0;
let dir: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits++;
    res.end(Buffer.from(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(async () => {
  hits = 0;
  dir = await mkdtemp(join(tmpdir(), 'pipeline-src-'));
});

const entry = (over: Partial<SourceEntry> = {}): SourceEntry => ({
  id: 'stub',
  url: `${base}/stub.gz`,
  version: '1',
  fetched: '2026-01-01',
  file: 'stub.gz',
  sha256: sha256(body),
  license: 'CC BY-SA 4.0',
  ...over,
});

describe('lock schema', () => {
  const lockText = readFileSync(
    new URL('../../../../content/sources.lock.yaml', import.meta.url),
    'utf8',
  );
  it('accepts the committed lock with KANJIDIC2 and KRADFILE', () => {
    expect(parseLock(lockText).sources.map((s) => s.id)).toEqual(['kanjidic2', 'kradfile']);
  });
  it.each(['id', 'url', 'version', 'fetched', 'file', 'sha256', 'license'])(
    'rejects an entry missing %s',
    (field) => {
      const e: Record<string, unknown> = { ...entry() };
      delete e[field];
      expect(() => validateLock({ sources: [e] })).toThrow(LockSchemaError);
      expect(() => validateLock({ sources: [e] })).toThrow(field);
    },
  );
  it('rejects a malformed sha256', () => {
    expect(() => validateLock({ sources: [entry({ sha256: 'abc' })] })).toThrow(/sha256/);
  });
});

describe('fetchSource', () => {
  it('downloads, verifies and stores on first use', async () => {
    expect(await fetchSource(entry(), { sourcesDir: dir, fetchFn: defaultFetch })).toBe(
      'downloaded',
    );
    expect(sha256(await readFile(join(dir, 'stub.gz')))).toBe(sha256(body));
    expect(hits).toBe(1);
  });
  it('does not download again when the stored file matches', async () => {
    await writeFile(join(dir, 'stub.gz'), body);
    expect(await fetchSource(entry(), { sourcesDir: dir })).toBe('cached');
    expect(hits).toBe(0);
  });
  it('throws naming the source and re-pin command on mismatch, storing nothing', async () => {
    const bad = entry({ sha256: 'f'.repeat(64) });
    const err = await fetchSource(bad, { sourcesDir: dir }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChecksumMismatchError);
    expect((err as Error).message).toContain('"stub"');
    expect((err as Error).message).toContain('sources:pin stub');
    await expect(readFile(join(dir, 'stub.gz'))).rejects.toThrow();
    await rm(dir, { recursive: true });
  });
  it('re-downloads when the stored file is corrupt', async () => {
    await writeFile(join(dir, 'stub.gz'), 'corrupt');
    expect(await fetchSource(entry(), { sourcesDir: dir })).toBe('downloaded');
    expect(hits).toBe(1);
  });
  it('pinSource returns the new checksum', async () => {
    expect(await pinSource(entry({ sha256: '0'.repeat(64) }), { sourcesDir: dir })).toBe(
      sha256(body),
    );
  });
});
