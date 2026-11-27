import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossCheck,
  extractNumbers,
  splitSections,
  format,
  SECTION_OWNERS,
  DIGESTS,
} from './spec-crosscheck.mjs';

const arch = [
  '## Contents',
  '- 1. Goals',
  '## 1. Goals',
  'Aim for 90% coverage.',
  '### 3.1 Entities',
  'There are 2,136 kanji and a threshold of 0.85; see §4.3 and v1.2, 2026-11-19, W03, p95.',
  '### 4.2 FSRS',
  'Target retention 0.90, maximum 365 days, 3 tries.',
  '## Appendix A: Glossary',
  'A note on 30 things.',
].join('\n');

const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

test('extractNumbers keeps meaningful numbers and drops refs, dates, versions and ids', () => {
  assert.deepEqual(
    [
      ...extractNumbers(
        '2,136 kanji, 0.85, 25%, 3 tries, §4.3, v1.2, 2026-11-19, W03, p95, FSRS-5',
      ),
    ].sort(),
    ['0.85', '2,136', '25%'],
  );
});

test('splitSections keys subsections, chapters and appendices', () => {
  assert.deepEqual([...splitSections(arch).keys()], ['contents', '1', '3.1', '4.2', 'A']);
});

test('missing numbers are reported against the owning digest', () => {
  const digests = Object.fromEntries(DIGESTS.map((d) => [d, words(1600)]));
  digests.content += ' 2,136 and 0.85 → arch §3.1';
  digests.platform += ' 30 → arch §A';
  const r = crossCheck(arch, digests);
  assert.deepEqual(
    r.missing.map((m) => [m.section, m.number]),
    [
      ['4.2', '0.90'],
      ['4.2', '365'],
    ],
  );
  assert.deepEqual(r.warn, [{ section: '1', number: '90%' }]);
  assert.equal(format(r).failures, 2);
});

test('duplicates, bad anchors and word counts are reported', () => {
  const digests = Object.fromEntries(DIGESTS.map((d) => [d, words(1600)]));
  digests.content += ' 2,136 0.85 → arch §9.9';
  digests.memory += ' 0.90 365 2,136';
  digests.platform += ' 30';
  digests.web = words(100);
  const r = crossCheck(arch, digests);
  assert.deepEqual(r.duplicated, [{ number: '2,136', digests: ['content', 'memory'] }]);
  assert.deepEqual(r.badAnchors, [{ digest: 'content', anchor: '9.9' }]);
  assert.deepEqual(r.words, [{ digest: 'web', words: 100 }]);
  assert.equal(r.missing.length, 0);
});

test('--digest scope checks only that digest', () => {
  const r = crossCheck(arch, { memory: words(1600) + ' 0.90' }, 'memory');
  assert.deepEqual(
    r.missing.map((m) => m.number),
    ['365'],
  );
  assert.equal(r.words.length, 0);
});

test('every owner named in SECTION_OWNERS is a known digest', () => {
  for (const owners of Object.values(SECTION_OWNERS))
    for (const o of owners) assert.ok(DIGESTS.includes(o), o);
});
