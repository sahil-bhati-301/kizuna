export type ReadingKind = 'on' | 'kun' | 'nanori';

export interface ReadingIdParts {
  readonly kanji: string;
  readonly kind: ReadingKind;
  readonly kana: string;
}

const kinds: readonly string[] = ['on', 'kun', 'nanori'];

/** Builds a stable reading ID such as `生:on:せい`. */
export function buildReadingId(parts: ReadingIdParts): string {
  if (parts.kanji === '' || parts.kana === '')
    throw new Error('Reading ID parts must be non-empty');
  return `${parts.kanji}:${parts.kind}:${parts.kana}`;
}

/** Parses a reading ID; returns undefined when malformed. Kana may contain `.` or `-` (okurigana marks) but not `:`. */
export function parseReadingId(id: string): ReadingIdParts | undefined {
  const [kanji, kind, kana, ...rest] = id.split(':');
  if (!kanji || !kind || !kana || rest.length > 0 || !kinds.includes(kind)) return undefined;
  return { kanji, kind: kind as ReadingKind, kana };
}
