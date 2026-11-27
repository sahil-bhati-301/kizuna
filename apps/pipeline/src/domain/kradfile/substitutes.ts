/**
 * Substitute characters in KRADFILE components (file header, W01-5 AC 3).
 *
 * JIS X 0208 has no code point for some elements, so the file uses a kanji that contains the
 * element instead (艾 for the top kusa-kanmuri, 邦 for the right kozato, and so on). The header
 * lists the Unicode element each stands for. Where the W01-4 radical-variant table knows the
 * element we use its form, so the Kangxi number comes from that table; otherwise we use the
 * header's code point and the radical is null.
 */
import type { RadicalPosition } from '../normalise/index.ts';

export interface Substitute {
  /** The intended component. */
  readonly component: string;
  /** Needed for position-dependent forms (阝). */
  readonly position?: RadicalPosition;
}

const u = (cp: number): string => String.fromCodePoint(cp);

export const SUBSTITUTES: ReadonlyMap<string, Substitute> = new Map<string, Substitute>([
  ['化', { component: '亻' }], // U+2E85
  ['个', { component: u(0x201a2) }],
  ['并', { component: u(0x4e37) }],
  ['刈', { component: '刂' }], // U+2E89
  ['込', { component: '辶' }], // U+2ECC
  ['尚', { component: u(0x2e8c) }],
  ['忙', { component: '忄' }], // U+2E96
  ['扎', { component: '扌' }], // U+2E98
  ['汁', { component: '氵' }], // U+2EA1
  ['犯', { component: '犭' }], // U+2EA8
  ['艾', { component: '艹' }], // U+2EBE
  ['邦', { component: '阝', position: 'right' }], // U+2ECF
  ['阡', { component: '阝', position: 'left' }], // U+2ED6
  ['老', { component: u(0x2eb9) }],
  ['杰', { component: '灬' }], // U+2EA3
  ['礼', { component: '礻' }], // U+2EAD
  ['疔', { component: u(0x2f67) }],
  ['禹', { component: u(0x2f71) }],
  ['初', { component: '衤' }], // U+2EC2
  ['買', { component: '罒' }], // U+2EB2
  ['滴', { component: u(0x5547) }],
  ['乞', { component: u(0x20089) }],
]);
