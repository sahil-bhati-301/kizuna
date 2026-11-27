/** Public API of the W01-4 normalisation library (pipeline.md §3.3 Normalisation). */
export { nfc } from './nfc.ts';
export { KANA_EXCEPTIONS, toHiragana, toKatakana } from './kana.ts';
export type { KanaException } from './kana.ts';
export { joinReading, parseReading } from './markers.ts';
export type { ParseReadingResult, Reading, ReadingError, ReadingErrorKind } from './markers.ts';
export { radicalNumber } from './radicals.ts';
export type { RadicalPosition, RadicalResult } from './radicals.ts';
