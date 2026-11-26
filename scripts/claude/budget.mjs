#!/usr/bin/env node
// Kizuna budget guard: status line recorder, hook checker, logger. Plain Node, no dependencies.
// Hooks must never break a session: everything is wrapped, always exits 0, no network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULTS = {
  dailyCaps: [15, 15, 15, 15, 15, 2.5, 2.5],
  weeklyCeiling: 80,
  hardStop: 90,
  amberBand: 10,
  fiveHour: { wrapUp: 75, checkpointNow: 88 },
  context: { wrapUp: 50, checkpointNow: 70 },
  staleAfterMinutes: 15,
  fallbackToolCallCap: 150,
};

const DAY = 86400;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nowSec = () => (process.env.KIZUNA_NOW ? Number(process.env.KIZUNA_NOW) : Math.floor(Date.now() / 1000));
const fmt = (v) => (isNum(v) ? `${Math.round(v * 10) / 10}%` : '?');

// ---------- config & state ----------
export function loadConfig(file) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(file || path.join(HERE, '..', '..', '.claude', 'budget.json'), 'utf8'));
  } catch {}
  return {
    ...DEFAULTS,
    ...user,
    fiveHour: { ...DEFAULTS.fiveHour, ...(user.fiveHour || {}) },
    context: { ...DEFAULTS.context, ...(user.context || {}) },
  };
}

export const stateDir = () => process.env.KIZUNA_STATE_DIR || path.join(os.homedir(), '.claude', 'kizuna');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
export const readUsage = () => readJson(path.join(stateDir(), 'usage.json'), null);
export const writeUsage = (u) => writeJson(path.join(stateDir(), 'usage.json'), u);
const readGuard = () => readJson(path.join(stateDir(), 'guard-state.json'), {});
const writeGuard = (g) => writeJson(path.join(stateDir(), 'guard-state.json'), g);

function sessionState(guard, id) {
  const sid = id || 'unknown';
  guard[sid] ||= { toolCalls: 0 };
  // keep the file small: drop oldest sessions
  const keys = Object.keys(guard);
  if (keys.length > 50) for (const k of keys.slice(0, keys.length - 50)) if (k !== sid) delete guard[k];
  return guard[sid];
}

// ---------- pure computations ----------
export function computeDay(weeklyResetsAt, now, localDate = new Date(now * 1000)) {
  if (isNum(weeklyResetsAt)) {
    const weekStart = weeklyResetsAt - 7 * DAY;
    return Math.min(7, Math.max(1, Math.floor((now - weekStart) / DAY) + 1));
  }
  return ((localDate.getDay() + 6) % 7) + 1; // Mon=1 .. Sun=7
}

export function computeLine(day, caps = DEFAULTS.dailyCaps) {
  let sum = 0;
  for (let i = 0; i < day && i < caps.length; i++) sum += caps[i];
  return sum;
}

export function isStale(usage, cfg, now) {
  if (!usage || !isNum(usage.writtenAt)) return true;
  return now - usage.writtenAt / 1000 > cfg.staleAfterMinutes * 60;
}

export function computeLight(usage, cfg = DEFAULTS, now = nowSec()) {
  const day = computeDay(usage && usage.weeklyResetsAt, now);
  const line = computeLine(day, cfg.dailyCaps);
  if (isStale(usage, cfg, now) || !isNum(usage.weekly)) return { light: 'unknown', day, line };
  const w = usage.weekly;
  let light = 'green';
  if (w > cfg.hardStop) light = 'hardstop';
  else if (w > cfg.weeklyCeiling || w > line + cfg.amberBand) light = 'red';
  else if (w > line) light = 'amber';
  return { light, day, line };
}

export function computeLevel(usage, cfg = DEFAULTS, { line, light, toolCalls = 0 } = {}) {
  if (light === 'unknown') {
    const cap = cfg.fallbackToolCallCap;
    if (toolCalls >= cap * 1.3) return { level: 'CHECKPOINT-NOW', reasons: [`${toolCalls} tool calls`] };
    if (toolCalls >= cap) return { level: 'WRAP-UP', reasons: [`${toolCalls} tool calls`] };
    return { level: 'OK', reasons: [] };
  }
  const { weekly: w, fiveHour: h, context: c } = usage;
  const cp = [];
  const wr = [];
  if (isNum(h) && h >= cfg.fiveHour.checkpointNow) cp.push(`5h ${fmt(h)}`);
  if (isNum(w) && w >= Math.min(line + cfg.amberBand, cfg.weeklyCeiling)) cp.push(`weekly ${fmt(w)}`);
  if (isNum(c) && c >= cfg.context.checkpointNow) cp.push(`context ${fmt(c)}`);
  if (cp.length) return { level: 'CHECKPOINT-NOW', reasons: cp };
  if (isNum(h) && h >= cfg.fiveHour.wrapUp) wr.push(`5h ${fmt(h)}`);
  if (isNum(w) && w >= line) wr.push(`weekly ${fmt(w)} >= line ${fmt(line)}`);
  if (isNum(c) && c >= cfg.context.wrapUp) wr.push(`context ${fmt(c)}`);
  if (wr.length) return { level: 'WRAP-UP', reasons: wr };
  return { level: 'OK', reasons: [] };
}

export const LIGHT_ICON = { green: '🟢', amber: '🟡', red: '🔴', hardstop: '⛔', unknown: '⚪' };

export function assess(usage, cfg, toolCalls = 0, now = nowSec()) {
  const l = computeLight(usage, cfg, now);
  const lv = computeLevel(usage, cfg, { line: l.line, light: l.light, toolCalls });
  return { ...l, ...lv };
}

export function levelMessage(level, reasons) {
  const r = reasons.join(', ');
  if (level === 'WRAP-UP')
    return `Budget WRAP-UP (${r}): finish the current step, start nothing new, then run /checkpoint (or complete the WP if one step from done) and end the session.`;
  if (level === 'CHECKPOINT-NOW')
    return `Budget CHECKPOINT-NOW (${r}): stop at the nearest safe point, tell running subagents to return, run /checkpoint now, then end.`;
  return '';
}

export function lightMessage(light, a) {
  const fig = `week ${fmt(a.weekly)} vs line ${fmt(a.line)}`;
  switch (light) {
    case 'green':
      return `Budget light green (${fig}): normal routing.`;
    case 'amber':
      return `Budget light amber (${fig}); amber rules: Tier B/C at effort low, no parallel sessions, skip reviewer for Tier C.`;
    case 'red':
      return `Budget light RED (${fig}): no new WPs; finish only what is past review, answer questions, suggest owner-track work.`;
    case 'hardstop':
      return `Budget HARD STOP (${fig}): production incidents only.`;
    default:
      return 'Usage unknown: ask the owner once for /usage figures and run /budget <weekly%> <5h%>';
  }
}

// ---------- git helpers ----------
function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const repoRoot = (cwd) => git(['rev-parse', '--show-toplevel'], cwd) || cwd || process.cwd();
const branchOf = (cwd) => git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
function dirtyLines(cwd) {
  const out = git(['status', '--porcelain'], cwd);
  if (!out) return [];
  return out.split('\n').filter((l) => l.trim() && !l.trimEnd().endsWith('docs/plan/budget-log.md'));
}

// ---------- IO helpers ----------
function readStdin() {
  try {
    const t = fs.readFileSync(0, 'utf8');
    return t.trim() ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
const out = (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n');
const emitContext = (event, text) =>
  out(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));

// ---------- subcommands ----------
export function cmdStatusline(input, cfg) {
  const now = nowSec();
  const prev = readUsage() || {};
  const rl = input.rate_limits || {};
  const pick = (v, p) => (isNum(v) ? v : isNum(p) ? p : null);
  const usage = {
    weekly: pick(rl.seven_day && rl.seven_day.used_percentage, prev.weekly),
    weeklyResetsAt: pick(rl.seven_day && rl.seven_day.resets_at, prev.weeklyResetsAt),
    fiveHour: pick(rl.five_hour && rl.five_hour.used_percentage, prev.fiveHour),
    fiveHourResetsAt: pick(rl.five_hour && rl.five_hour.resets_at, prev.fiveHourResetsAt),
    context: isNum(input.context_window && input.context_window.used_percentage) ? input.context_window.used_percentage : null,
    model: (input.model && input.model.display_name) || prev.model || null,
    source: 'statusline',
    writtenAt: now * 1000,
  };
  // Only overwrite the shared cache when this update carries rate-limit data or no cache exists yet.
  if (input.rate_limits || !readUsage()) writeUsage(usage);
  const a = assess(usage, cfg, 0, now);
  const cwd = (input.workspace && input.workspace.current_dir) || input.cwd || process.cwd();
  const branch = branchOf(cwd);
  const parts = [];
  if (isNum(usage.weekly)) parts.push(`${LIGHT_ICON[a.light]} week ${fmt(usage.weekly)} / line ${fmt(a.line)}`);
  else parts.push(`${LIGHT_ICON.unknown} usage n/a`);
  if (isNum(usage.fiveHour)) parts.push(`5h ${fmt(usage.fiveHour)}`);
  if (isNum(usage.context)) parts.push(`ctx ${fmt(usage.context)}`);
  if (branch) parts.push(branch);
  out(parts.join(' · '));
}

export function cmdCheck(input, cfg) {
  const now = nowSec();
  const event = input.hook_event_name || 'PostToolUse';
  const guard = readGuard();
  const s = sessionState(guard, input.session_id);
  s.toolCalls = (s.toolCalls || 0) + 1;
  const usage = readUsage();
  const a = assess(usage, cfg, s.toolCalls, now);
  const prev = s.notified || { light: 'green', level: 'OK' };
  const msgs = [];
  if (a.light !== prev.light) msgs.push(lightMessage(a.light, { ...a, weekly: usage && usage.weekly }));
  if (a.level !== prev.level && a.level !== 'OK') msgs.push(levelMessage(a.level, a.reasons));
  s.notified = { light: a.light, level: a.level };
  writeGuard(guard);
  if (msgs.length) emitContext(event, msgs.join(' '));
}

function resumeCards(root) {
  const cards = [];
  let status = '';
  try {
    status = fs.readFileSync(path.join(root, 'docs', 'plan', 'STATUS.md'), 'utf8');
  } catch {
    return cards;
  }
  const lines = status.split('\n').filter((l) => l.includes('⏸')).slice(0, 5);
  for (const line of lines) {
    const id = (line.match(/W\d\d-\d+/) || [])[0];
    if (!id) continue;
    let card = `Paused ${id}: ${line.replace(/\s+/g, ' ').trim().slice(0, 160)}`;
    try {
      const wp = fs.readFileSync(path.join(root, 'docs', 'plan', 'wp', `${id}.md`), 'utf8');
      const next = (wp.match(/NEXT ACTION:[^\n]*/) || [])[0];
      const cp = (wp.match(/Checkpoint commit:\s*[^·\n]*/) || [])[0];
      if (next) card += `\n  ${next.trim()}`;
      if (cp) card += `\n  ${cp.trim()}`;
    } catch {}
    cards.push(card);
  }
  return cards;
}

export function cmdSessionStart(input, cfg) {
  const now = nowSec();
  const cwd = input.cwd || process.cwd();
  const root = repoRoot(cwd);
  const usage = readUsage();
  const guard = readGuard();
  const s = sessionState(guard, input.session_id);
  const a = assess(usage, cfg, 0, now);
  s.startWeekly = a.light === 'unknown' ? null : usage.weekly;
  s.toolCalls = 0;
  s.blocked = false;
  s.notified = { light: a.light, level: a.level };
  writeGuard(guard);

  const lines = [];
  if (a.light === 'unknown') {
    lines.push(`${LIGHT_ICON.unknown} ${lightMessage('unknown', a)}`);
  } else {
    let l = `${LIGHT_ICON[a.light]} Budget ${a.light}: week ${fmt(usage.weekly)} vs line ${fmt(a.line)} (day ${a.day}), 5h ${fmt(usage.fiveHour)}`;
    if (isNum(usage.fiveHourResetsAt)) l += ` (resets in ${Math.max(0, Math.round((usage.fiveHourResetsAt - now) / 60))} min)`;
    l += `, ceiling ${cfg.weeklyCeiling}%.`;
    lines.push(l);
    if (a.level !== 'OK') lines.push(levelMessage(a.level, a.reasons));
    if (a.light === 'red' || a.light === 'hardstop') lines.push('Light is red: no new WPs; suggest owner-track work.');
  }
  lines.push(...resumeCards(root));
  if (dirtyLines(cwd).length) lines.push('Uncommitted changes from a previous session: inspect git status/log before resuming.');
  const text = lines.join('\n').slice(0, 1500);
  emitContext('SessionStart', text);
}

export function cmdStopGuard(input) {
  if (input.stop_hook_active) return;
  const cwd = input.cwd || process.cwd();
  const branch = branchOf(cwd);
  if (!branch || !branch.startsWith('wp/')) return;
  if (!dirtyLines(cwd).length) return;
  const guard = readGuard();
  const s = sessionState(guard, input.session_id);
  if (s.blocked) return;
  s.blocked = true;
  writeGuard(guard);
  out(JSON.stringify({ decision: 'block', reason: 'Uncommitted WP work: run /checkpoint (or commit if the WP is complete) before ending.' }));
}

export function cmdPreCompact() {
  out(
    'When summarising, keep verbatim: the WP id, the current loop step, the NEXT ACTION, all open review findings, and the full tried-and-rejected (do not retry) list.',
  );
}

const LOG_HEADER =
  '| Date | Day | Session | WP | Models | Weekly % start | Weekly % end | Δ | 5h % end | Light | Ended by |\n|---|---|---|---|---|---|---|---|---|---|---|\n';

export function cmdSessionEnd(input, cfg) {
  const now = nowSec();
  const cwd = input.cwd || process.cwd();
  const root = repoRoot(cwd);
  const usage = readUsage();
  const guard = readGuard();
  const s = sessionState(guard, input.session_id);
  const a = assess(usage, cfg, s.toolCalls || 0, now);
  const branch = branchOf(cwd);
  const dirty = branch && branch.startsWith('wp/') && dirtyLines(cwd).length > 0;
  const start = isNum(s.startWeekly) ? s.startWeekly : null;
  const end = usage && isNum(usage.weekly) ? usage.weekly : null;
  const delta = start !== null && end !== null ? `${end - start >= 0 ? '+' : ''}${Math.round((end - start) * 10) / 10}` : '?';
  const d = new Date(now * 1000);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const cell = (v) => String(v == null || v === '' ? '?' : v).replace(/\|/g, '/');
  const row = [
    date,
    a.day,
    (input.session_id || '?').slice(0, 8),
    branch || '?',
    (usage && usage.model) || '?',
    start === null ? '?' : fmt(start),
    end === null ? '?' : fmt(end),
    delta,
    usage && isNum(usage.fiveHour) ? fmt(usage.fiveHour) : '?',
    a.light,
    dirty ? 'no-checkpoint' : '—',
  ].map(cell);
  const file = path.join(root, 'docs', 'plan', 'budget-log.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, LOG_HEADER);
  fs.appendFileSync(file, `| ${row.join(' | ')} |\n`);
}

export function cmdSet(args, cfg) {
  const [w, h] = args.map(Number);
  if (!isNum(w) || !isNum(h)) {
    out('usage: budget.mjs set <weekly%> <5h%>');
    return;
  }
  const now = nowSec();
  const prev = readUsage() || {};
  const usage = {
    weekly: w,
    weeklyResetsAt: isNum(prev.weeklyResetsAt) ? prev.weeklyResetsAt : null,
    fiveHour: h,
    fiveHourResetsAt: isNum(prev.fiveHourResetsAt) ? prev.fiveHourResetsAt : null,
    context: null,
    model: prev.model || null,
    source: 'manual',
    writtenAt: now * 1000,
  };
  writeUsage(usage);
  const a = assess(usage, cfg, 0, now);
  out(`${LIGHT_ICON[a.light]} ${a.light}: week ${fmt(w)} vs line ${fmt(a.line)} (day ${a.day}), 5h ${fmt(h)}, level ${a.level}${a.reasons.length ? ` (${a.reasons.join(', ')})` : ''}`);
}

// ---------- CLI ----------
export function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    const cfg = loadConfig();
    if (cmd === 'set') return cmdSet(rest, cfg);
    if (cmd === 'pre-compact') {
      readStdin();
      return cmdPreCompact();
    }
    const input = readStdin();
    switch (cmd) {
      case 'statusline': return cmdStatusline(input, cfg);
      case 'check': return cmdCheck(input, cfg);
      case 'session-start': return cmdSessionStart(input, cfg);
      case 'stop-guard': return cmdStopGuard(input, cfg);
      case 'session-end': return cmdSessionEnd(input, cfg);
      default: out('usage: budget.mjs statusline|check|session-start|stop-guard|pre-compact|session-end|set <weekly> <5h>');
    }
  } catch {
    // never break a session
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
  process.exitCode = 0;
}
