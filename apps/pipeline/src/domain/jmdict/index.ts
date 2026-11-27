/** Public API of the JMdict parser (W02-2). */
export { JmdictDataError, parseJmdict, rankWords } from './parse.ts';
export type {
  AltForm,
  Gloss,
  JmdictReport,
  JmdictRows,
  Provenance,
  RankKey,
  Sense,
  WordRow,
} from './parse.ts';
export { XmlSyntaxError } from './xml.ts';
