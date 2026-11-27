/**
 * Maps a radical variant form to its Kangxi number (W01-4 AC 4).
 * Position-dependent forms (阝) need a position; without one the result is ambiguous.
 */
import { RADICAL_VARIANTS } from './radical-variants.ts';

export type RadicalPosition = 'left' | 'right';

export type RadicalResult =
  | { kind: 'ok'; kangxi: number }
  | { kind: 'ambiguous'; candidates: number[] }
  | { kind: 'unknown' };

export function radicalNumber(form: string, position?: RadicalPosition): RadicalResult {
  if (!Object.hasOwn(RADICAL_VARIANTS, form)) return { kind: 'unknown' };
  const entry = RADICAL_VARIANTS[form];
  if (entry === undefined) return { kind: 'unknown' };
  if (typeof entry === 'number') return { kind: 'ok', kangxi: entry };
  if (position === undefined) return { kind: 'ambiguous', candidates: [entry.left, entry.right] };
  return { kind: 'ok', kangxi: entry[position] };
}
