import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ChecksumMismatchError, defaultFetch, fetchSource, pinSource, sha256 } from './fetch.ts';
import { run } from './run.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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
afterEach(() => rm(dir, { recursive: true, force: true }));
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
  it('accepts the committed lock with KANJIDIC2, KRADFILE and JMdict', () => {
    expect(parseLock(lockText).sources.map((s) => s.id)).toEqual([
      'kanjidic2',
      'kradfile',
      'jmdict',
    ]);
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

describe('cli run', () => {
  const lockFor = (sha: string) =>
    `sources:\n  - id: stub\n    url: ${base}/stub.gz\n    version: '1'\n    fetched: '2026-01-01'\n    file: stub.gz\n    sha256: '${sha}'\n    license: CC BY-SA 4.0\n`;
  it('exits non-zero on a checksum mismatch, naming source and re-pin command', async () => {
    const lockPath = join(dir, 'lock.yaml');
    await writeFile(lockPath, lockFor('f'.repeat(64)));
    const lines: string[] = [];
    const code = await run(['fetch'], {
      lockPath,
      sourcesDir: join(dir, 's'),
      today: '2026-01-02',
      log: (l) => lines.push(l),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/stub[\s\S]*sources:pin stub/);
  });
  it('pin writes file and lock together', async () => {
    const lockPath = join(dir, 'lock.yaml');
    await writeFile(lockPath, lockFor('0'.repeat(64)));
    const code = await run(['pin'], {
      lockPath,
      sourcesDir: join(dir, 's'),
      today: '2026-01-02',
      log: () => {},
    });
    expect(code).toBe(0);
    expect(parseLock(await readFile(lockPath, 'utf8')).sources[0]?.sha256).toBe(sha256(body));
  });
  it('pin leaves the lock untouched when a download fails', async () => {
    const lockPath = join(dir, 'lock.yaml');
    const text = lockFor('0'.repeat(64))
      .replace('/stub.gz', '/stub.gz')
      .replace(base, 'http://127.0.0.1:1');
    await writeFile(lockPath, text);
    await expect(
      run(['pin'], { lockPath, sourcesDir: join(dir, 's'), today: 'x', log: () => {} }),
    ).rejects.toThrow();
    expect(await readFile(lockPath, 'utf8')).toBe(text);
  });
});

describe('no-app-to-app rule', () => {
  it('fires when one app imports another', () => {
    const root = new URL('../../../../', import.meta.url).pathname;
    mkdirSync(join(dir, 'apps/a'), { recursive: true });
    mkdirSync(join(dir, 'apps/b'), { recursive: true });
    return Promise.all([
      writeFile(join(dir, 'apps/a/x.ts'), "import '../b/y.ts';\nexport {};\n"),
      writeFile(join(dir, 'apps/b/y.ts'), 'export {};\n'),
    ]).then(() => {
      let out = '';
      try {
        execFileSync(
          join(root, 'node_modules/.bin/depcruise'),
          ['--config', join(root, '.dependency-cruiser.cjs'), 'apps'],
          { cwd: dir, encoding: 'utf8', stdio: 'pipe' },
        );
      } catch (e) {
        out = String((e as { stdout?: string }).stdout);
      }
      expect(out).toContain('no-app-to-app');
    });
  });
});
