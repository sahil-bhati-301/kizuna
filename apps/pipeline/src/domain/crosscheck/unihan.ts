/**
 * Unihan `kTotalStrokes` reader (W02-5 Q1 a). Pure: text in, map out.
 * Line format: `U+4E00<TAB>kTotalStrokes<TAB>1`; `#` starts a comment. The value is one or more
 * space-separated counts (a character with regional differences lists more than one).
 */

const LINE = /^U\+([0-9A-F]{4,6})\tkTotalStrokes\t(\d+(?: \d+)*)$/u;

/** Maps a kanji (one code point) to its listed stroke counts, in file order. */
export function parseUnihanStrokes(text: string): Map<string, readonly number[]> {
  const out = new Map<string, readonly number[]>();
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trimEnd());
    if (!m) continue;
    out.set(String.fromCodePoint(parseInt(m[1]!, 16)), m[2]!.split(' ').map(Number));
  }
  return out;
}
