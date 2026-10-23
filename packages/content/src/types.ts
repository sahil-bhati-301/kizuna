// Content contract for the Kizuna demo. Owned by the lead; change only through the lead.

/** A kanji literal, e.g. "日". Used as the stable ID. */
export type KanjiId = string;
/** A component glyph or slug, e.g. "言", "亻", "门". */
export type ComponentId = string;
/** A word's written form, e.g. "日本". Unique within the content set. */
export type WordId = string;

export type ReadingKind = 'on' | 'kun';

export interface Reading {
  /**
   * `${kanji}:${kind}:${kana}`, where kana is hiragana and okurigana follow a dot.
   * Examples: "日:on:にち", "食:kun:た.べる", "山:kun:やま".
   */
  id: string;
  kanji: KanjiId;
  kind: ReadingKind;
  /** Hiragana read on the kanji itself (on'yomi stored in hiragana too): "た" for 食べる, "にち" for 日. */
  kana: string;
  /** Okurigana after the kanji in its dictionary form, e.g. "べる". Empty string if none. */
  okurigana: string;
  /** Exactly one primary reading per kind per kanji (when that kind exists). */
  primary: boolean;
}

export type ComponentRole = 'radical' | 'semantic' | 'phonetic' | 'form';
export type PartPosition = 'left' | 'right' | 'top' | 'bottom' | 'enclosure' | 'whole' | 'other';

export interface KanjiPart {
  component: ComponentId;
  role: ComponentRole;
  position: PartPosition;
}

export type SemanticField =
  | 'number'
  | 'time'
  | 'nature'
  | 'person'
  | 'body'
  | 'direction'
  | 'size_amount'
  | 'action'
  | 'place'
  | 'language'
  | 'money'
  | 'other';

export interface Kanji {
  id: KanjiId;
  /** Our own short primary meaning, e.g. "sun, day". */
  keyword: string;
  /** Accepted English meanings (lowercase), including the keyword's words. */
  meanings: string[];
  strokes: number;
  /** 1 = most frequent within this set. */
  frequencyRank: number;
  /** Classification radical (a ComponentId present in `components`). */
  radical: ComponentId;
  /** Visual decomposition. Single-part kanji list themselves with position "whole". */
  parts: KanjiPart[];
  readings: Reading[];
  semanticField: SemanticField;
  /** Short original mnemonic (our own words). */
  mnemonic?: string;
}

export interface Component {
  id: ComponentId;
  /** The glyph to display (may equal id). */
  glyph: string;
  /** Our own short keyword, e.g. "speech" for 言. */
  keyword: string;
  /** True if the component is itself a kanji in this set. */
  isKanji: boolean;
}

export type WordPartPhenomenon = 'regular' | 'sound_change' | 'special';

export interface WordPart {
  kanji: KanjiId;
  /** The base reading used (Reading.id), or null for special readings (jukujikun). */
  readingId: string | null;
  /** The kana this kanji actually takes in this word, e.g. "に" for 日 in 日本. */
  surface: string;
  phenomenon: WordPartPhenomenon;
}

export interface Word {
  id: WordId;
  /** Written form, e.g. "日本", "食べる". */
  text: string;
  /** Full reading in hiragana, e.g. "にほん", "たべる". */
  kana: string;
  /** Short English meaning. */
  meaning: string;
  /** One entry per kanji in `text`, in order. Kana characters in `text` are not listed. */
  parts: WordPart[];
}

export type RelationKind = 'visual' | 'semantic';

/** Undirected relation between two kanji in the set. */
export interface Relation {
  a: KanjiId;
  b: KanjiId;
  kind: RelationKind;
  /** 0–1, how strongly the two are confusable. */
  strength: number;
  /** Short explanation, e.g. "入 is 人 with the strokes swapped". */
  note: string;
}

export interface ContentSet {
  version: string;
  level: 'N5';
  kanji: Kanji[];
  components: Component[];
  words: Word[];
  relations: Relation[];
}
