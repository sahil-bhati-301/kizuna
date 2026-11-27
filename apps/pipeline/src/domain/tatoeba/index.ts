/** Public API of the Tatoeba parser (W02-4). */
export {
  attributionUrl,
  parseIndexItem,
  parseIndexLine,
  parseLinkLine,
  parseSentenceLine,
} from './parse.ts';
export type { IndexItem, IndexLine, SentenceLine } from './parse.ts';
export { buildWordLookup, mapItem } from './link.ts';
export type { Mapping, WordForms, WordLookup } from './link.ts';
export { buildSentences } from './build.ts';
export type {
  BuildInput,
  BuildResult,
  Provenance,
  SentenceRow,
  TatoebaReport,
  Translation,
  UnmappedItem,
} from './build.ts';
