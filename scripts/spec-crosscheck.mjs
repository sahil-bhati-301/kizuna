#!/usr/bin/env node
// Cross-check the spec digests in docs/specs against docs/architecture-design.md (W00-4).
// Reports: word counts outside 1,500–3,000; anchors that do not resolve; numbers from an
// owned architecture section that are missing from every owning digest; numbers that
// appear in more than one digest. Exit code 1 on anything but duplicates.
//
// Usage: node scripts/spec-crosscheck.mjs [--digest <name>] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WORDS_MIN = 1500;
export const WORDS_MAX = 3000;

export const DIGESTS = [
  'content',
  'pipeline',
  'memory',
  'insights',
  'drills',
  'account',
  'web',
  'platform',
];

// Architecture section → digest(s) that must carry its numbers. A section with two or more
// owners is split between them: each number must appear in at least one of the owners.
export const SECTION_OWNERS = {
  2.1: ['platform'],
  2.2: ['platform', 'content', 'memory', 'insights', 'drills', 'account'],
  2.3: ['platform'],
  2.4: ['drills'],
  3.1: ['content'],
  3.2: ['content'],
  3.3: ['pipeline'],
  3.4: ['pipeline'],
  4.1: ['memory'],
  4.2: ['memory'],
  4.3: ['memory'],
  4.4: ['memory'],
  4.5: ['memory'],
  4.6: ['memory'],
  4.7: ['memory'],
  4.8: ['memory'],
  5.1: ['insights'],
  5.2: ['insights'],
  5.3: ['insights'],
  5.4: ['insights'],
  5.5: ['insights'],
  5.6: ['insights'],
  5.7: ['insights'],
  6.1: ['drills'],
  6.2: ['drills'],
  6.3: ['drills'],
  6.4: ['drills'],
  6.5: ['drills'],
  6.6: ['drills'],
  6.7: ['insights'],
  7.1: ['web'],
  7.2: ['web', 'account'],
  7.3: ['web'],
  7.4: ['account'],
  7.5: ['platform', 'content', 'memory', 'insights', 'drills', 'account'],
  7.6: ['platform'],
  7.7: ['account'],
  7.8: ['account'],
  8.1: ['platform'],
  8.2: ['platform'],
  8.3: ['platform'],
  8.4: ['platform'],
  8.5: ['platform'],
  8.6: ['platform'],
  8.7: ['pipeline'],
  13: ['platform'],
  14: ['platform'],
  A: ['platform'],
};

// Not digested: summary, goals, reasoning, roadmap (lives in development-plan.md), references,
// revision history. Their numbers are reported as warnings only when no digest carries them.
export const EXCLUDED = ['contents', '0', '1', '9', '10', '11', '12', 'B', 'C'];

export const isExcluded = (id) => EXCLUDED.includes(String(id).split('.')[0]);

/** Split markdown into sections keyed by the architecture section id. */
export function splitSections(markdown) {
  const sections = new Map();
  let current = 'contents';
  let top = 'contents';
  for (const line of markdown.split('\n')) {
    const h2 = /^## (?:(\d+)\.|Appendix ([A-Z]):)/.exec(line);
    const h3 = /^### (\d+\.\d+) /.exec(line);
    if (h2) {
      top = h2[1] ?? h2[2];
      current = top;
    } else if (h3) {
      current = h3[1];
    } else if (/^### /.test(line)) {
      current = top; // Phase headings, revision entries: belong to their chapter
    }
    if (!sections.has(current)) sections.set(current, []);
    sections.get(current).push(line);
  }
  return new Map([...sections].map(([k, v]) => [k, v.join('\n')]));
}

/** All section ids that an anchor may name: chapters, subsections and appendix letters. */
export function headingIds(markdown) {
  const ids = new Set();
  for (const line of markdown.split('\n')) {
    const m = /^#{2,3} (?:(\d+(?:\.\d+)?)\.? |Appendix ([A-Z]):)/.exec(line);
    if (m) ids.add(m[1] ?? m[2]);
  }
  return ids;
}

/**
 * Numbers that carry meaning: decimals, percentages, and integers of 10 or more.
 * Headings, section references (§4.3), dates, versions and identifiers (W03, p95, FSRS-5) are skipped.
 */
export function extractNumbers(text) {
  const cleaned = text
    .replace(/^#{1,6} .*$/gm, ' ')
    .replace(/§\s?[\dA-Z]+(?:\.\d+)*/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\bv\d+(?:\.\d+)*/gi, ' ');
  const found = new Set();
  const re = /(?<![\w.,\-/])(\d+(?:[.,]\d+)*)(%?)(?![\w])/g;
  for (const m of cleaned.matchAll(re)) {
    const raw = m[1].replace(/[.,]$/, '');
    const isDecimal = /\.\d/.test(raw);
    const value = Number(raw.replace(/,/g, ''));
    if (!isDecimal && !m[2] && value < 10) continue;
    found.add(raw + m[2]);
  }
  return found;
}

export function anchorsIn(text) {
  return [...text.matchAll(/→ arch §\s?([\dA-Z]+(?:\.\d+)?)/g)].map((m) => m[1]);
}

export const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

/** Pure core: takes file contents, returns a report. */
export function crossCheck(arch, digests, only) {
  const sections = splitSections(arch);
  const ids = headingIds(arch);
  const numbersIn = Object.fromEntries(
    Object.entries(digests).map(([k, v]) => [k, extractNumbers(v)]),
  );
  const report = { words: [], badAnchors: [], missing: [], duplicated: [], unowned: [], warn: [] };
  const names = only ? [only] : DIGESTS;

  for (const name of names) {
    const text = digests[name];
    if (text === undefined) {
      report.words.push({ digest: name, words: 0, problem: 'file missing' });
      continue;
    }
    const words = countWords(text);
    if (words < WORDS_MIN || words > WORDS_MAX) report.words.push({ digest: name, words });
    for (const a of anchorsIn(text))
      if (!ids.has(a)) report.badAnchors.push({ digest: name, anchor: a });
  }

  const seen = new Set();
  for (const [id, body] of sections) {
    const owners = SECTION_OWNERS[id];
    const numbers = extractNumbers(body);
    if (!owners && !isExcluded(id) && numbers.size > 0) report.unowned.push(id);
    for (const n of numbers) {
      const carriers = DIGESTS.filter((d) => numbersIn[d]?.has(n));
      if (owners) {
        const relevant = only ? owners.includes(only) : true;
        if (relevant && !owners.some((o) => numbersIn[o]?.has(n)))
          report.missing.push({ section: id, number: n, owners: only ? [only] : owners });
      } else if (!only && carriers.length === 0) {
        report.warn.push({ section: id, number: n });
      }
      if (!only && carriers.length > 1 && !seen.has(n)) {
        seen.add(n);
        report.duplicated.push({ number: n, digests: carriers });
      }
    }
  }
  return report;
}

export function format(report) {
  const out = [];
  for (const w of report.words)
    out.push(`✗ words ${w.digest}: ${w.problem ?? `${w.words} (want ${WORDS_MIN}–${WORDS_MAX})`}`);
  for (const a of report.badAnchors) out.push(`✗ anchor ${a.digest}: §${a.anchor} has no heading`);
  for (const id of report.unowned) out.push(`✗ section §${id} has no owner in SECTION_OWNERS`);
  for (const m of report.missing)
    out.push(`✗ missing §${m.section}: ${m.number} (owner ${m.owners.join('/')})`);
  for (const d of report.duplicated) out.push(`· duplicated ${d.number}: ${d.digests.join(', ')}`);
  for (const w of report.warn) out.push(`· excluded §${w.section}: ${w.number} in no digest`);
  const failures =
    report.words.length + report.badAnchors.length + report.unowned.length + report.missing.length;
  out.push(
    failures === 0
      ? `✅ spec cross-check green (${report.duplicated.length} duplicated, ${report.warn.length} excluded-only)`
      : `❌ ${failures} problem(s)`,
  );
  return { text: out.join('\n'), failures };
}

function main(argv) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const di = argv.indexOf('--digest');
  const only = di >= 0 ? argv[di + 1] : undefined;
  const arch = readFileSync(`${root}docs/architecture-design.md`, 'utf8');
  const digests = {};
  for (const name of DIGESTS) {
    const p = `${root}docs/specs/${name}.md`;
    if (existsSync(p)) digests[name] = readFileSync(p, 'utf8');
  }
  const report = crossCheck(arch, digests, only);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return report.words.length + report.badAnchors.length + report.missing.length ? 1 : 0;
  }
  const { text, failures } = format(report);
  console.log(text);
  return failures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
