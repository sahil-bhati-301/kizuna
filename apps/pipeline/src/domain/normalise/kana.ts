/**
 * Kana conversion (W01-4 AC 2). Readings are stored in hiragana and on'yomi
 * are displayed in katakana. Conversion is a fixed code-point offset between
 * the Hiragana and Katakana blocks; anything else passes through unchanged.
 */

const OFFSET = 0x60;

export interface KanaException {
  /** A single kana-block character that needs a note on how it is handled. */
  char: string;
  handling: string;
}

const PASS_THROUGH =
  'No counterpart in the other script; passes through both conversions unchanged.';
const SHARED = 'Used with both scripts; passes through both conversions unchanged.';
const OFFSET_PAIR = (pair: string) =>
  `Converts by plain offset to ${pair} and round-trips. Counter use (e.g. ヶ月) is left to later pipeline stages.`;

/** Kana whose handling differs from, or needs more care than, plain round-tripping. */
export const KANA_EXCEPTIONS: readonly KanaException[] = [
  { char: 'ヴ', handling: OFFSET_PAIR('ゔ') },
  { char: 'ヵ', handling: OFFSET_PAIR('ゕ') },
  { char: 'ヶ', handling: OFFSET_PAIR('ゖ') },
  { char: '゙', handling: `Combining voiced sound mark. ${SHARED}` },
  { char: '゚', handling: `Combining semi-voiced sound mark. ${SHARED}` },
  { char: '゛', handling: `Spacing voiced sound mark. ${SHARED}` },
  { char: '゜', handling: `Spacing semi-voiced sound mark. ${SHARED}` },
  { char: 'ゟ', handling: `Hiragana digraph yori. ${PASS_THROUGH}` },
  { char: '゠', handling: `Katakana-hiragana double hyphen. ${SHARED}` },
  { char: 'ヷ', handling: `Katakana va (ワ with dakuten). ${PASS_THROUGH}` },
  { char: 'ヸ', handling: `Katakana vi (ヰ with dakuten). ${PASS_THROUGH}` },
  { char: 'ヹ', handling: `Katakana ve (ヱ with dakuten). ${PASS_THROUGH}` },
  { char: 'ヺ', handling: `Katakana vo (ヲ with dakuten). ${PASS_THROUGH}` },
  { char: '・', handling: `Katakana middle dot. ${SHARED}` },
  { char: 'ー', handling: `Prolonged sound mark. ${SHARED}` },
  { char: 'ヿ', handling: `Katakana digraph koto. ${PASS_THROUGH}` },
  // Katakana Phonetic Extensions U+31F0–U+31FF (small ㇰ … ㇿ, used for Ainu).
  ...Array.from({ length: 16 }, (_, i) => ({
    char: String.fromCodePoint(0x31f0 + i),
    handling: `Small katakana for Ainu. ${PASS_THROUGH}`,
  })),
];

function mapCodePoints(s: string, map: (cp: number) => number): string {
  let out = '';
  for (const ch of s) out += String.fromCodePoint(map(ch.codePointAt(0)!));
  return out;
}

function katakanaToHiragana(cp: number): number {
  // ァ…ヶ → ぁ…ゖ, ヽヾ → ゝゞ
  if ((cp >= 0x30a1 && cp <= 0x30f6) || cp === 0x30fd || cp === 0x30fe) return cp - OFFSET;
  return cp;
}

function hiraganaToKatakana(cp: number): number {
  // ぁ…ゖ → ァ…ヶ, ゝゞ → ヽヾ
  if ((cp >= 0x3041 && cp <= 0x3096) || cp === 0x309d || cp === 0x309e) return cp + OFFSET;
  return cp;
}

/** Converts katakana to hiragana; all other characters pass through. */
export function toHiragana(s: string): string {
  return mapCodePoints(s, katakanaToHiragana);
}

/** Converts hiragana to katakana; all other characters pass through. */
export function toKatakana(s: string): string {
  return mapCodePoints(s, hiraganaToKatakana);
}
