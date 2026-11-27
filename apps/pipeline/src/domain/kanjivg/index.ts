/** Public API of the KanjiVG parser (W02-1). */
export { KanjivgDataError, mapPosition, parseKanjivg } from './parse.ts';
export type {
  ComponentRole,
  ComponentRow,
  KanjiComponentRow,
  KanjiPosition,
  KanjivgReport,
  KanjivgRows,
  Provenance,
  StrokeCount,
} from './parse.ts';
export { XmlSyntaxError } from './xml.ts';
