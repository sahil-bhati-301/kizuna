import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAX_LINES, parseReports, summarise } from './verify-summary.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

test('pass: prints the green line with the test count', () => {
  assert.equal(summarise({ tests: 42, failures: [] }), '✅ all green (42 tests)');
});

test('fail: prints name, assertion and exactly five stack lines', () => {
  const message = `AssertionError: expected 1 to be 2\n${Array.from({ length: 9 }, (_, i) => `    at frame${i} (f.ts:${i}:1)`).join('\n')}`;
  const out = summarise({ tests: 3, failures: [{ name: 'suite does a thing', message }] }).split(
    '\n',
  );
  assert.deepEqual(out.slice(0, 2), [
    '✗ suite does a thing',
    '  AssertionError: expected 1 to be 2',
  ]);
  assert.equal(out.filter((l) => l.includes('frame')).length, 5);
  assert.ok(out.includes('    at frame4 (f.ts:4:1)'));
  assert.ok(!out.some((l) => l.includes('frame5')));
});

test('over cap: output is truncated to 60 lines with a marker', () => {
  const failures = Array.from({ length: 30 }, (_, i) => ({
    name: `t${i}`,
    message: `Error: boom\n    at a\n    at b`,
  }));
  const out = summarise({ tests: 30, failures }).split('\n');
  assert.equal(out.length, MAX_LINES);
  assert.match(out.at(-1), /more lines truncated/);
});

test('golden: recorded vitest failure report', () => {
  const { tests, failures } = parseReports([fixture('vitest-failure.report.json')]);
  assert.equal(tests, 2);
  const out = summarise({ tests, failures }).split('\n');
  assert.deepEqual(out.slice(0, 2), [
    '✗ adds numbers',
    '  AssertionError: expected 2 to be 3 // Object.is equality',
  ]);
  assert.equal(out.length, 7);
  assert.match(
    out[2],
    /^\s+at \/home\/user\/kizuna\/packages\/placeholder\/src\/tmp\.test\.ts:3:17$/,
  );
});

test('boundary: dependency-cruiser fails on an import bypassing src/index.ts', () => {
  const run = (dir, ...targets) =>
    spawnSync(
      process.execPath,
      [
        `${root}node_modules/dependency-cruiser/bin/dependency-cruise.mjs`,
        '--config',
        `${root}.dependency-cruiser.cjs`,
        ...targets,
      ],
      { cwd: `${root}test/fixtures/${dir}`, encoding: 'utf8' },
    );
  const bad = run('boundary-violation', 'packages', 'apps');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /module-public-api-only/);
  assert.match(bad.stdout, /web-allow-list/);
  assert.equal(run('boundary-clean', 'packages').status, 0);
});
