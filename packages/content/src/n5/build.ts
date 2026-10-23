// Small builders that turn the compact hand-authored tables into contract shapes.
// The data files stay short and readable; validation lives in ../n5.test.ts.
import type {
  Component,
  ComponentId,
  ComponentRole,
  Kanji,
  KanjiId,
  KanjiPart,
  PartPosition,
  Reading,
  ReadingKind,
  SemanticField,
  Word,
  WordPart,
} from '../types';

/** True for a kanji character (Han script). Kana and punctuation are false. */
export const isKanjiChar = (ch: string): boolean => /\p{Script=Han}/u.test(ch);

/** The kanji characters of a written form, in order. */
export const kanjiOf = (text: string): string[] => [...text].filter(isKanjiChar);

// ---------------------------------------------------------------------------
// Kanji

export type PartSpec = [component: ComponentId, role: ComponentRole, position: PartPosition];

export interface KanjiSpec {
  id: KanjiId;
  /** Our own keyword. Comma-separated words must all appear in `meanings`. */
  keyword: string;
  /** Extra accepted meanings (the keyword's words are added automatically). */
  meanings?: string[];
  strokes: number;
  radical: ComponentId;
  /** Omit for a single-part kanji: it then lists itself with position "whole". */
  parts?: PartSpec[];
  field: SemanticField;
  /** On'yomi in hiragana. The first one is the primary reading. */
  on?: string[];
  /** Kun'yomi, okurigana after a dot ("た.べる"). The first one is the primary reading. */
  kun?: string[];
  mnemonic?: string;
}

function readings(kanji: KanjiId, kind: ReadingKind, specs: string[] = []): Reading[] {
  return specs.map((spec, i) => {
    const [kana, okurigana = ''] = spec.split('.');
    return {
      id: `${kanji}:${kind}:${spec}`,
      kanji,
      kind,
      kana,
      okurigana,
      primary: i === 0,
    };
  });
}

/** Builds the kanji list. Array order is frequency order: rank = index + 1. */
export function buildKanji(specs: KanjiSpec[]): Kanji[] {
  return specs.map((s, i) => {
    const keywordWords = s.keyword.split(',').map((w) => w.trim());
    const meanings = [...new Set([...keywordWords, ...(s.meanings ?? [])])];
    const parts: KanjiPart[] = s.parts
      ? s.parts.map(([component, role, position]) => ({ component, role, position }))
      : [{ component: s.id, role: s.radical === s.id ? 'radical' : 'form', position: 'whole' }];
    return {
      id: s.id,
      keyword: s.keyword,
      meanings,
      strokes: s.strokes,
      frequencyRank: i + 1,
      radical: s.radical,
      parts,
      readings: [...readings(s.id, 'on', s.on), ...readings(s.id, 'kun', s.kun)],
      semanticField: s.field,
      ...(s.mnemonic ? { mnemonic: s.mnemonic } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Components

/** [id, keyword, glyph?]. Glyph defaults to the id. */
export type ComponentSpec = [id: ComponentId, keyword: string, glyph?: string];

export function buildComponents(specs: ComponentSpec[], kanjiIds: Set<KanjiId>): Component[] {
  return specs.map(([id, keyword, glyph]) => ({
    id,
    glyph: glyph ?? id,
    keyword,
    isKanji: kanjiIds.has(id),
  }));
}

// ---------------------------------------------------------------------------
// Words

/**
 * One token per kanji in `text`, space-separated, in order:
 *  - `on:がく`        regular: reading 学:on:がく, surface = its kana
 *  - `on:がく>がっ`   sound change (voicing, gemination, shortening) with the actual surface
 *  - `*きょ`          special reading (jukujikun): readingId null, surface as given
 * The reading ID is formed from the kanji at that position, e.g. "学" + "on:がく".
 */
export function w(text: string, kana: string, meaning: string, tokens: string): Word {
  const chars = kanjiOf(text);
  const toks = tokens.trim().split(/\s+/);
  if (chars.length !== toks.length) {
    throw new Error(`Word ${text}: ${chars.length} kanji but ${toks.length} reading tokens`);
  }
  const parts: WordPart[] = toks.map((tok, i) => {
    const kanji = chars[i];
    if (tok.startsWith('*')) {
      return { kanji, readingId: null, surface: tok.slice(1), phenomenon: 'special' };
    }
    const [reading, changed] = tok.split('>');
    const [kind, spec] = reading.split(':');
    const base = spec.split('.')[0];
    return {
      kanji,
      readingId: `${kanji}:${kind}:${spec}`,
      surface: changed ?? base,
      phenomenon: changed ? 'sound_change' : 'regular',
    };
  });
  return { id: text, text, kana, meaning, parts };
}
