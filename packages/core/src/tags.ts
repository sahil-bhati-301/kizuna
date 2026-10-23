// Feature tags and item difficulty. Tags drive grouping in the analysis.
import type { KanjiId } from '@kizuna/content';
import type { Facet, QuestionType } from './contracts';
import { type ContentIndex, byCodePoint, relationBetween } from './contentIndex';
import type { Draft } from './distractors';

export const FACET_OF: Record<QuestionType, Facet> = {
  meaning: 'meaning',
  reading_on: 'reading_on',
  reading_kun: 'reading_kun',
  recognition: 'recognition',
  word_reading: 'context',
};

export const FACET_LABEL: Record<Facet, string> = {
  meaning: 'Meaning',
  reading_on: "On'yomi",
  reading_kun: "Kun'yomi",
  recognition: 'Recognition',
  context: 'In words',
};

export const FACETS: Facet[] = ['meaning', 'reading_on', 'reading_kun', 'recognition', 'context'];
export const KANJI_FACETS: Facet[] = ['meaning', 'reading_on', 'reading_kun', 'recognition'];

export function pairKey(a: KanjiId, b: KanjiId): string {
  const [x, y] = [a, b].sort(byCodePoint);
  return `${x}/${y}`;
}

export function traceIdFor(type: QuestionType, kanji: KanjiId, wordId?: string): string {
  if (type === 'word_reading') return `word:${wordId}:context`;
  return `kanji:${kanji}:${FACET_OF[type]}`;
}

export function tagsFor(ix: ContentIndex, draft: Draft): string[] {
  const { type, kanji, wordId } = draft.spec;
  const k = ix.kanji.get(kanji);
  const tags = [`facet:${FACET_OF[type]}`, `kanji:${kanji}`];
  if (type === 'reading_on') tags.push('reading_kind:on');
  if (type === 'reading_kun') tags.push('reading_kind:kun');
  if (wordId) tags.push(`word:${wordId}`);
  if (k) {
    tags.push(`radical:${k.radical}`);
    for (const c of ix.componentsOf.get(kanji) ?? []) tags.push(`component:${c}`);
    tags.push(`field:${k.semanticField}`);
  }
  const pairs = new Set<string>();
  for (const o of draft.options) {
    if (o.fromKanji && o.fromKanji !== kanji && relationBetween(ix, kanji, o.fromKanji)) pairs.add(pairKey(kanji, o.fromKanji));
  }
  for (const p of [...pairs].sort(byCodePoint)) tags.push(`pair:${p}`);
  return [...new Set(tags)];
}

/** Base difficulty per question type (logit scale). Meaning is easiest, words hardest. */
export const TYPE_DIFFICULTY: Record<QuestionType, number> = {
  meaning: -0.6,
  recognition: -0.4,
  reading_on: -0.15,
  reading_kun: 0,
  word_reading: 0.2,
};

/**
 * Item difficulty b: type base + frequency (rarer is harder) + stroke count, plus a little
 * for longer words. Deterministic; a stand-in for a population-fitted Rasch difficulty.
 */
export function difficultyFor(ix: ContentIndex, draft: Draft): number {
  const { type, kanji, wordId } = draft.spec;
  const n = Math.max(1, ix.ordered.length - 1);
  const rankIndex = ix.ordered.findIndex((k) => k.id === kanji);
  const freq = rankIndex < 0 ? 0 : rankIndex / n - 0.5;
  const strokes = ix.kanji.get(kanji)?.strokes ?? 7;
  const strokeTerm = Math.max(-0.25, Math.min(0.25, 0.025 * (strokes - 7)));
  const word = wordId ? ix.words.get(wordId) : undefined;
  const wordTerm = word ? 0.15 * Math.max(0, word.parts.length - 1) : 0;
  const b = TYPE_DIFFICULTY[type] + 0.6 * freq + strokeTerm + wordTerm;
  return Math.round(Math.max(-3, Math.min(3, b)) * 1000) / 1000;
}
