import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import * as kernel from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '../..');
const sources = readdirSync(here, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(join(here, f), 'utf8') }));

describe('public surface (AC4)', () => {
  it('package exports only "." (src/index.ts)', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
    expect(Object.keys(pkg.exports)).toEqual(['.']);
  });

  it('index re-exports every runtime API', () => {
    for (const name of [
      'systemClock',
      'createFixedClock',
      'createFakeClock',
      'createSeededRng',
      'createIdGenerator',
      'isUuidV7',
      'AppError',
      'NotFoundError',
      'ValidationError',
      'ConflictError',
      'ForbiddenError',
      'isAppError',
      'noopLogger',
      'createMemoryLogger',
      'createEvent',
    ]) {
      expect(kernel, name).toHaveProperty(name);
    }
  });

  it('has the expected source files', () => {
    for (const f of [
      'index.ts',
      'domain/ids.ts',
      'clock.ts',
      'domain/clock.ts',
      'domain/rng.ts',
      'domain/errors.ts',
      'logger.ts',
      'domain/events.ts',
    ]) {
      expect(sources.map((s) => s.file)).toContain(f);
    }
  });
});

describe('purity (AC2, AC5)', () => {
  it('only clock.ts reads Date.now()', () => {
    const readers = sources.filter((s) => /\bDate\.now\b/.test(s.text)).map((s) => s.file);
    expect(readers.length).toBeGreaterThan(0);
    expect(readers).toEqual(['clock.ts']);
  });

  it('no kernel source uses Math.random', () => {
    expect(sources.filter((s) => /\bMath\.random\b/.test(s.text)).map((s) => s.file)).toEqual([]);
  });

  it('ESLint rejects Date.now, Math.random and new Date() in domain code', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const code = [
      'export const a = Date.now();',
      'export const b = Math.random();',
      'export const c = new Date();',
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, {
      filePath: join(pkgRoot, 'src/domain/__fixture__.ts'),
    });
    const messages = result!.messages.map((m) => `${m.line}:${m.ruleId}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        '1:no-restricted-properties',
        '2:no-restricted-properties',
        '3:no-restricted-syntax',
      ]),
    );
  }, 30_000);

  it('ESLint allows Date.now outside domain code (e.g. clock.ts)', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText('export const a = Date.now();\n', {
      filePath: join(pkgRoot, 'src/clock.ts'),
    });
    expect(result!.messages.filter((m) => m.severity === 2)).toEqual([]);
  }, 30_000);

  it('dependency-cruiser forbids I/O modules from domain/', async () => {
    const { createRequire } = await import('node:module');
    const config = createRequire(import.meta.url)(join(repoRoot, '.dependency-cruiser.cjs'));
    const rule = config.forbidden.find((r: { name: string }) => r.name === 'domain-no-io');
    expect(rule?.severity).toBe('error');
    expect(rule.from.path).toBe('/src/domain/');
    for (const mod of ['fs', 'node:fs', 'net', 'http', 'child_process']) {
      expect(new RegExp(rule.to.path).test(mod), mod).toBe(true);
    }
  });
});
