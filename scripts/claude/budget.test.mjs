import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeDay, computeLine, computeLight, computeLevel, DEFAULTS } from './budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'budget.mjs');
const NOW = 1800000000;
const cfg = { ...DEFAULTS, weeklyCeiling: 75 };
const fixture = (n) => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kizuna-test-'));
});

function run(cmd, input, { cwd, args = [] } = {}) {
  const r = spawnSync('node', [SCRIPT, cmd, ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input ?? {}),
    cwd: cwd || dir,
    encoding: 'utf8',
    env: { ...process.env, KIZUNA_STATE_DIR: path.join(dir, 'state'), KIZUNA_NOW: String(NOW) },
  });
  assert.equal(r.status, 0);
  return r.stdout.trim();
}
const readUsage = () => JSON.parse(fs.readFileSync(path.join(dir, 'state', 'usage.json'), 'utf8'));
const writeUsage = (u) => {
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state', 'usage.json'), JSON.stringify({ writtenAt: NOW * 1000, ...u }));
};
function makeRepo(branch) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kizuna-repo-'));
  const g = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  g('init', '-q', '-b', branch);
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.txt'), '1');
  g('add', '.');
  g('commit', '-qm', 'init');
  return repo;
}

test('day and line math from resets_at', () => {
  const weekStart = NOW - 3.5 * 86400;
  assert.equal(computeDay(weekStart + 7 * 86400, NOW), 4);
  assert.equal(computeLine(4), 60);
  assert.equal(computeDay(NOW + 7 * 86400 - 10, NOW), 1);
  assert.equal(computeDay(NOW + 10, NOW), 7);
  assert.equal(computeDay(NOW - 5, NOW), 7); // clamp
  assert.equal(computeLine(1), 15);
  assert.equal(computeLine(6), 77.5);
  assert.equal(computeLine(7), 80);
  // fallback: local weekday, Mon=1
  assert.equal(computeDay(null, NOW, new Date(2026, 0, 5)), 1); // Monday
  assert.equal(computeDay(null, NOW, new Date(2026, 0, 11)), 7); // Sunday
});

const base = { weeklyResetsAt: NOW + 3.5 * 86400, writtenAt: NOW * 1000 }; // day 4, line 60
test('lights', () => {
  const l = (weekly) => computeLight({ ...base, weekly }, cfg, NOW).light;
  assert.equal(l(60), 'green');
  assert.equal(l(60.5), 'amber');
  assert.equal(l(70), 'amber');
  assert.equal(l(75.5), 'red'); // above ceiling 75
  assert.equal(l(91), 'hardstop');
  // red via line + band (day 1, line 15)
  const d1 = { weeklyResetsAt: NOW + 7 * 86400 - 10, writtenAt: NOW * 1000 };
  assert.equal(computeLight({ ...d1, weekly: 26 }, cfg, NOW).light, 'red');
  assert.equal(computeLight({ ...d1, weekly: 25 }, cfg, NOW).light, 'amber');
});

test('stale or missing cache is unknown', () => {
  assert.equal(computeLight(null, cfg, NOW).light, 'unknown');
  assert.equal(computeLight({ ...base, weekly: 10, writtenAt: (NOW - 16 * 60) * 1000 }, cfg, NOW).light, 'unknown');
  assert.equal(computeLight({ ...base, weekly: 10, writtenAt: (NOW - 14 * 60) * 1000 }, cfg, NOW).light, 'green');
});

test('levels', () => {
  const lv = (u, extra = {}) => {
    const usage = { ...base, weekly: 10, fiveHour: 10, context: 10, ...u };
    const { light, line } = computeLight(usage, cfg, NOW);
    return computeLevel(usage, cfg, { light, line, ...extra }).level;
  };
  assert.equal(lv({}), 'OK');
  assert.equal(lv({ fiveHour: 75 }), 'WRAP-UP');
  assert.equal(lv({ fiveHour: 88 }), 'CHECKPOINT-NOW');
  assert.equal(lv({ weekly: 60 }), 'WRAP-UP'); // weekly >= line
  assert.equal(lv({ weekly: 65 }), 'WRAP-UP');
  assert.equal(lv({ weekly: 75 }), 'CHECKPOINT-NOW'); // min(line+10, ceiling)=70 -> >=70
  assert.equal(lv({ context: 50 }), 'WRAP-UP');
  assert.equal(lv({ context: 70 }), 'CHECKPOINT-NOW');
  assert.equal(lv({ context: null }), 'OK');
});

test('weekly checkpoint threshold is min(line+band, ceiling)', () => {
  const usage = { ...base, weekly: 70, fiveHour: 0 };
  const { light, line } = computeLight(usage, cfg, NOW);
  assert.equal(computeLevel(usage, cfg, { light, line }).level, 'CHECKPOINT-NOW');
  const usage2 = { ...base, weekly: 69, fiveHour: 0 };
  assert.equal(computeLevel(usage2, cfg, { light: 'amber', line }).level, 'WRAP-UP');
});

test('fallback tool-call cap when light unknown', () => {
  const l = (n) => computeLevel(null, cfg, { light: 'unknown', line: 15, toolCalls: n }).level;
  assert.equal(l(149), 'OK');
  assert.equal(l(150), 'WRAP-UP');
  assert.equal(l(194), 'WRAP-UP');
  assert.equal(l(195), 'CHECKPOINT-NOW');
});

test('statusline writes cache and prints a line', () => {
  const line = run('statusline', fixture('statusline-full.json'));
  assert.match(line, /^🟢 week 41% \/ line 60% · 5h 23% · ctx 31%/);
  const u = readUsage();
  assert.equal(u.weekly, 41);
  assert.equal(u.weeklyResetsAt, 1800302400);
  assert.equal(u.fiveHour, 23);
  assert.equal(u.source, 'statusline');
  assert.equal(u.model, 'Opus');
});

test('statusline keeps absent windows and handles missing rate_limits', () => {
  run('statusline', fixture('statusline-full.json'));
  // only seven_day present: five_hour kept
  run('statusline', { rate_limits: { seven_day: { used_percentage: 50, resets_at: 1800302400 } }, context_window: { used_percentage: 5 } });
  let u = readUsage();
  assert.equal(u.weekly, 50);
  assert.equal(u.fiveHour, 23);
  assert.equal(u.fiveHourResetsAt, 1800007200);
  // no rate_limits at all: still prints, cache values preserved
  const line = run('statusline', fixture('statusline-no-limits.json'));
  assert.match(line, /week 50%/);
  u = readUsage();
  assert.equal(u.weekly, 50);
  assert.equal(u.fiveHour, 23);
});

test('statusline without any data prints usage n/a', () => {
  assert.match(run('statusline', fixture('statusline-no-limits.json')), /usage n\/a/);
});

test('check is silent on repeat and speaks on change', () => {
  run('statusline', fixture('statusline-full.json'));
  const ev = { hook_event_name: 'PostToolUse', session_id: 's1' };
  assert.equal(run('check', ev), ''); // green/OK baseline
  assert.equal(run('check', ev), '');
  run('statusline', fixture('statusline-high-5h.json')); // 5h 90 -> CHECKPOINT-NOW, weekly 30 green
  const o = JSON.parse(run('check', ev));
  assert.equal(o.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(o.hookSpecificOutput.additionalContext, /CHECKPOINT-NOW \(5h 90%\)/);
  assert.equal(run('check', ev), ''); // repeat silent
  // light change to amber
  run('statusline', { rate_limits: { five_hour: { used_percentage: 10, resets_at: 1800007200 }, seven_day: { used_percentage: 65, resets_at: 1800302400 } } });
  const o2 = JSON.parse(run('check', { ...ev, hook_event_name: 'UserPromptSubmit' }));
  assert.equal(o2.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(o2.hookSpecificOutput.additionalContext, /amber rules: Tier B\/C at effort low/);
  assert.match(o2.hookSpecificOutput.additionalContext, /WRAP-UP/);
  assert.equal(run('check', ev), '');
});

test('check with unknown usage notifies once, then falls back to tool-call cap', () => {
  const ev = { hook_event_name: 'PostToolUse', session_id: 's2' };
  const o = JSON.parse(run('check', ev));
  assert.match(o.hookSpecificOutput.additionalContext, /Usage unknown: ask the owner once for \/usage figures and run \/budget/);
  assert.equal(run('check', ev), '');
  const gp = path.join(dir, 'state', 'guard-state.json');
  const g = JSON.parse(fs.readFileSync(gp, 'utf8'));
  g.s2.toolCalls = 149;
  fs.writeFileSync(gp, JSON.stringify(g));
  assert.match(JSON.parse(run('check', ev)).hookSpecificOutput.additionalContext, /WRAP-UP \(150 tool calls\)/);
});

test('stale cache makes check report unknown', () => {
  writeUsage({ weekly: 10, fiveHour: 10, writtenAt: (NOW - 3600) * 1000 });
  const o = JSON.parse(run('check', { hook_event_name: 'PostToolUse', session_id: 's3' }));
  assert.match(o.hookSpecificOutput.additionalContext, /Usage unknown/);
});

test('set writes a manual cache and prints light and level', () => {
  const line = run('set', '', { args: ['70', '80'] });
  assert.match(line, /week 70%/);
  assert.match(line, /WRAP-UP|CHECKPOINT-NOW/);
  const u = readUsage();
  assert.equal(u.source, 'manual');
  assert.equal(u.weekly, 70);
  assert.equal(u.fiveHour, 80);
});

test('stop-guard: never blocks with stop_hook_active, blocks only once', () => {
  const repo = makeRepo('wp/W07-2-thing');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'changed');
  const ev = { session_id: 'sg', cwd: repo, hook_event_name: 'Stop' };
  assert.equal(run('stop-guard', { ...ev, stop_hook_active: true }, { cwd: repo }), '');
  const o = JSON.parse(run('stop-guard', { ...ev, stop_hook_active: false }, { cwd: repo }));
  assert.equal(o.decision, 'block');
  assert.match(o.reason, /\/checkpoint/);
  assert.equal(run('stop-guard', ev, { cwd: repo }), '');
});

test('stop-guard ignores non-wp branches and clean trees', () => {
  const main = makeRepo('main');
  fs.writeFileSync(path.join(main, 'a.txt'), 'changed');
  assert.equal(run('stop-guard', { session_id: 'x', cwd: main }, { cwd: main }), '');
  const wp = makeRepo('wp/W01-1-x');
  assert.equal(run('stop-guard', { session_id: 'y', cwd: wp }, { cwd: wp }), '');
});

test('session-start card, resume card and dirty warning', () => {
  const repo = makeRepo('wp/W07-2-thing');
  fs.mkdirSync(path.join(repo, 'docs/plan/wp'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs/plan/STATUS.md'), '| W07-2 | ⏸ paused (wrap-up) · resume: /wp W07-2 |\n| W07-3 | todo |\n');
  fs.writeFileSync(path.join(repo, 'docs/plan/wp/W07-2.md'), '## Checkpoint\nBranch: wp/W07-2 · Checkpoint commit: abc123 (pushed) · Usage\nNEXT ACTION: Write the parser test.\n');
  run('statusline', fixture('statusline-full.json'));
  fs.writeFileSync(path.join(repo, 'a.txt'), 'dirty');
  const o = JSON.parse(run('session-start', { session_id: 'ss1', cwd: repo }, { cwd: repo }));
  const t = o.hookSpecificOutput.additionalContext;
  assert.equal(o.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(t, /Budget green: week 41% vs line 60% \(day 4\)/);
  assert.match(t, /Paused W07-2/);
  assert.match(t, /NEXT ACTION: Write the parser test\./);
  assert.match(t, /Checkpoint commit: abc123/);
  assert.match(t, /Uncommitted changes from a previous session/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state', 'guard-state.json'), 'utf8')).ss1.startWeekly, 41);
});

test('session-end queues the row; the next session-start writes it', () => {
  const repo = makeRepo('wp/W07-2-thing');
  run('statusline', fixture('statusline-full.json'));
  run('session-start', { session_id: 'abcdefgh-1', cwd: repo }, { cwd: repo });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'dirty');
  run('session-end', { session_id: 'abcdefgh-1', cwd: repo }, { cwd: repo });
  const logFile = path.join(repo, 'docs/plan/budget-log.md');
  assert.equal(fs.existsSync(logFile), false, 'session-end must not write to the repo');
  const card = run('session-start', { session_id: 'second-01', cwd: repo }, { cwd: repo });
  assert.match(card, /Logged 1 earlier session/);
  const log = fs.readFileSync(logFile, 'utf8');
  run('session-start', { session_id: 'third-001', cwd: repo }, { cwd: repo });
  assert.equal(fs.readFileSync(logFile, 'utf8'), log, 'rows are written once');
  assert.match(log, /^\| Date \| Day \|/);
  assert.match(log, /\| 4 \| abcdefgh \| wp\/W07-2-thing \| Opus \| 41% \| 41% \| \+0 \| 23% \| green \| no-checkpoint \|/);
});

test('pre-compact prints instructions; format-file exits 0 silently', () => {
  assert.match(run('pre-compact', {}), /NEXT ACTION/);
  const r = spawnSync('node', [path.join(HERE, 'format-file.mjs')], { input: '{"tool_input":{"file_path":"/nonexistent"}}', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
