#!/usr/bin/env node
// Terse verification output (development plan 3.4).
//   node scripts/verify-summary.mjs run [--affected]   run every check, print the summary
//   node scripts/verify-summary.mjs summarise <dir>    summarise existing vitest JSON reports
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_LINES = 60;
const STACK_LINES = 5;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const REPORT = '.vitest-report.json';

const clean = (text) => text.replace(ANSI, '');

/** Failures and test count from parsed vitest JSON reports. */
export function parseReports(reports) {
  let tests = 0;
  const failures = [];
  for (const report of reports) {
    tests += report.numTotalTests ?? 0;
    for (const file of report.testResults ?? []) {
      const results = file.assertionResults ?? [];
      for (const t of results) {
        if (t.status !== 'failed') continue;
        failures.push({
          name: t.fullName ?? t.title,
          message: (t.failureMessages ?? []).join('\n'),
        });
      }
      if (file.status === 'failed' && !results.some((t) => t.status === 'failed')) {
        failures.push({ name: file.name, message: file.message ?? 'Test file failed to run' });
      }
    }
  }
  return { tests, failures };
}

/** Test name, the assertion and the first five stack lines. */
export function formatFailure({ name, message }) {
  const lines = clean(message).split('\n');
  const stackStart = lines.findIndex((l) => /^\s+at /.test(l));
  const assertion = (stackStart === -1 ? lines : lines.slice(0, stackStart)).filter((l) =>
    l.trim(),
  );
  const stack = stackStart === -1 ? [] : lines.slice(stackStart).filter((l) => /^\s+at /.test(l));
  return [`✗ ${name}`, ...assertion.map((l) => `  ${l.trim()}`), ...stack.slice(0, STACK_LINES)];
}

export function cap(lines, max = MAX_LINES) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), `… ${lines.length - (max - 1)} more lines truncated`];
}

/**
 * @param {{tests: number, failures: {name: string, message: string}[], toolFailures?: {step: string, lines: string[]}[]}} input
 * @returns {string} summary text, at most MAX_LINES lines
 */
export function summarise({ tests, failures, toolFailures = [] }) {
  if (failures.length === 0 && toolFailures.length === 0) return `✅ all green (${tests} tests)`;
  const lines = [];
  for (const f of failures) lines.push(...formatFailure(f));
  for (const t of toolFailures) lines.push(`✗ ${t.step}`, ...t.lines.map((l) => `  ${l}`));
  return cap(lines).join('\n');
}

function findReports(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === '.turbo') continue;
      const p = join(dir, entry);
      if (entry === REPORT) found.push(p);
      else if (statSync(p).isDirectory()) walk(p);
    }
  };
  walk(root);
  return found;
}

const loadReports = (root) => findReports(root).map((p) => JSON.parse(readFileSync(p, 'utf8')));

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    env: { ...process.env, DO_NOT_TRACK: '1' },
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: clean(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

const noise =
  /^\s*•|cache miss|^\S+:\S+: (>|$)|^\s*(Tasks|Cached|Time|Summary|Failed|Ran \d+ tasks?)\b|^\s*$|ELIFECYCLE|WARN|^ERROR: command finished/;
const toolLines = (out) =>
  out
    .split('\n')
    .filter((l) => !/:test: /.test(l) && !noise.test(l))
    .slice(0, 20);

function run(root, affected) {
  for (const p of findReports(root)) rmSync(p);
  let scriptTests = 0;
  const toolFailures = [];

  const scripts = sh('node', ['--test', 'scripts/**/*.test.mjs'], root);
  scriptTests = Number(/^# pass (\d+)/m.exec(scripts.out)?.[1] ?? 0);
  if (scripts.code !== 0) {
    const bad = scripts.out
      .split('\n')
      .filter((l) => /^\s*not ok|^# fail|Error/.test(l))
      .slice(0, 15);
    toolFailures.push({ step: 'scripts tests', lines: bad });
  }

  const base = process.env.VERIFY_BASE ?? 'origin/main';
  const turboArgs = [
    'turbo',
    'run',
    'lint',
    'format:check',
    'typecheck',
    'test',
    '--continue',
    '--output-logs=errors-only',
  ];
  if (affected) turboArgs.push(`--filter=...[${base}]`);
  const turbo = sh('pnpm', ['exec', ...turboArgs], root);
  if (turbo.code !== 0)
    toolFailures.push({
      step: 'turbo (lint, format, typecheck, test)',
      lines: toolLines(turbo.out),
    });

  const bounds = sh(
    'pnpm',
    ['exec', 'depcruise', '--config', '.dependency-cruiser.cjs', 'packages'],
    root,
  );
  if (bounds.code !== 0) toolFailures.push({ step: 'boundaries', lines: toolLines(bounds.out) });

  const { tests, failures } = parseReports(loadReports(root));
  // Without per-test failures, a failing turbo run is already represented by tool output.
  const realTool = toolFailures.filter(
    (t) => !(failures.length && t.step.startsWith('turbo') && t.lines.length === 0),
  );
  const text = summarise({ tests: tests + scriptTests, failures, toolFailures: realTool });
  console.log(text);
  return text.startsWith('✅') ? 0 : 1;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  const root = resolve(here, '..');
  if (cmd === 'run') process.exit(run(root, process.argv.includes('--affected')));
  else if (cmd === 'summarise' && arg && existsSync(arg)) {
    const r = parseReports(loadReports(resolve(arg)));
    console.log(summarise(r));
    process.exit(r.failures.length ? 1 : 0);
  } else {
    console.error('usage: verify-summary.mjs run [--affected] | summarise <dir>');
    process.exit(2);
  }
}
