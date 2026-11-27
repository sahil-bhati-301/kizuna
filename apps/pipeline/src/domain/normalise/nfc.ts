/**
 * Unicode NFC normalisation (W01-4 AC 1). Every parser passes text through
 * this before storing it, so the same text always has the same code points.
 * NFC is idempotent: nfc(nfc(s)) === nfc(s).
 */
export function nfc(s: string): string {
  return s.normalize('NFC');
}
