/** Public API of the Jōyō table import (W01-3). */
export { JoyoTableError, applyJoyo, parseJoyoTable } from './joyo.ts';
export type {
  AmbiguousReading,
  JoyoApplied,
  JoyoEntry,
  JoyoKind,
  JoyoReport,
  MissingKanji,
} from './joyo.ts';
