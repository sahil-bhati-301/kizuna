/**
 * KRADFILE → kanji with component lists (W01-5 AC 1-4; pipeline.md §3.3). Pure: bytes or text in,
 * rows out. Line format: `<kanji> : <component> <component> ...`; `#` starts a comment line.
 */
import type { Provenance } from '../kanjidic/index.ts';
import { radicalNumber } from '../normalise/index.ts';
import { SUBSTITUTES } from './substitutes.ts';

export interface KradComponent {
  readonly component: string;
  /** Kangxi radical number when the W01-4 table knows the component, else null. */
  readonly radical: number | null;
}

export interface KradRow extends Provenance {
  readonly literal: string;
  readonly codepoint: number;
  readonly components: readonly KradComponent[];
}

export interface BadLine {
  /** 1-based line number in the decoded file. */
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

export interface KradRows {
  readonly kanji: readonly KradRow[];
  readonly badLines: readonly BadLine[];
}

/** Decodes EUC-JP bytes to text; throws on invalid sequences. */
export function decodeEucJp(bytes: Uint8Array): string {
  return new TextDecoder('euc-jp', { fatal: true }).decode(bytes);
}

function toComponent(raw: string): KradComponent {
  const sub = SUBSTITUTES.get(raw);
  const component = sub?.component ?? raw;
  const result = radicalNumber(component, sub?.position);
  return { component, radical: result.kind === 'ok' ? result.kangxi : null };
}

const isOneCodePoint = (s: string) => Array.from(s).length === 1;

export function parseKradfile(text: string, provenance: Provenance): KradRows {
  const kanji: KradRow[] = [];
  const badLines: BadLine[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop(); // the newline that ends the file
  lines.forEach((raw, i) => {
    const line = i + 1;
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (text.startsWith('#')) return;
    const bad = (reason: string) => badLines.push({ line, text, reason });
    if (text.trim() === '') return bad('blank line');
    const sep = text.indexOf(' : ');
    if (sep < 0) return bad('missing " : " separator');
    const literal = text.slice(0, sep);
    if (!isOneCodePoint(literal)) return bad('kanji field is not a single character');
    const parts = text.slice(sep + 3).split(' ');
    if (parts.some((p) => p === '' || !isOneCodePoint(p)))
      return bad('component list is empty or has a malformed component');
    if (seen.has(literal)) return bad(`duplicate kanji ${literal}`);
    seen.add(literal);
    kanji.push({
      literal,
      codepoint: literal.codePointAt(0)!,
      components: parts.map(toComponent),
      ...provenance,
    });
  });
  return { kanji, badLines };
}
