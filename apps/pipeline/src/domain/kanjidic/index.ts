/** Public API of the KANJIDIC2 parser (W01-3). */
export { KanjidicDataError, parseKanjidic } from './parse.ts';
export type {
  ExcludedCharacter,
  KanjiRow,
  KanjidicRows,
  Meaning,
  Provenance,
  ReadingRow,
} from './parse.ts';
export { XmlSyntaxError } from './xml.ts';
