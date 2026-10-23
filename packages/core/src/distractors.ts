// Option generation. Every distractor records why it is on the card (its source),
// which is what makes error classification free at grading time.
import type { Kanji, KanjiId, Reading, ReadingKind, WordId } from '@kizuna/content';
import type { OptionSource, QuestionType } from './contracts';
import {
  type ContentIndex,
  fullKana,
  meaningsOverlap,
  okuriganaForm,
  partReadingKind,
  partnersOf,
  primaryReading,
  readingsOf,
  relationBetween,
  sharedComponentKanji,
} from './contentIndex';
import { type Rng, shuffle } from './rng';

export const OPTION_COUNT = 4;

export interface QuestionSpec {
  type: QuestionType;
  kanji: KanjiId;
  /** Required for word_reading. */
  wordId?: WordId;
  /** Force this related kanji (visual or semantic partner) onto the card. */
  partner?: KanjiId;
  /** Extra hint appended to the sub-prompt, e.g. a component cue in family drills. */
  cue?: string;
}

export interface DraftOption {
  label: string;
  correct: boolean;
  source: OptionSource;
  fromKanji?: KanjiId;
}

export interface Draft {
  spec: QuestionSpec;
  prompt: string;
  promptKind: 'kanji' | 'meaning' | 'word';
  instruction: string;
  subPrompt?: string;
  /** Answer first, then distractors in priority order (shuffled later). */
  options: DraftOption[];
}

export const INSTRUCTIONS: Record<QuestionType, string> = {
  meaning: 'Choose the meaning',
  reading_on: "Choose the on'yomi",
  reading_kun: "Choose the kun'yomi",
  recognition: 'Choose the kanji for this meaning',
  word_reading: 'Choose the reading of this word',
};

/** Collects distractors, refusing accepted answers and duplicate labels. */
class OptionCollector {
  readonly options: DraftOption[];
  private readonly labels = new Set<string>();
  constructor(
    answer: string,
    private readonly accepted: Set<string>,
  ) {
    this.options = [{ label: answer, correct: true, source: 'answer' }];
    this.labels.add(answer);
  }
  get full(): boolean {
    return this.options.length >= OPTION_COUNT;
  }
  add(label: string | undefined, source: OptionSource, fromKanji?: KanjiId): boolean {
    if (this.full || !label) return false;
    if (this.labels.has(label) || this.accepted.has(label)) return false;
    this.labels.add(label);
    const opt: DraftOption = { label, correct: false, source };
    if (fromKanji !== undefined) opt.fromKanji = fromKanji;
    this.options.push(opt);
    return true;
  }
}

function relationSource(ix: ContentIndex, a: KanjiId, b: KanjiId): OptionSource {
  const r = relationBetween(ix, a, b);
  return r ? r.kind : 'shared_component';
}

/** Kanji in random order (deterministic for the rng), excluding the target. */
function randomPool(ix: ContentIndex, target: KanjiId, rng: Rng): Kanji[] {
  return shuffle(
    ix.ordered.filter((k) => k.id !== target),
    rng,
  );
}

/** Up to three shared-component candidates, rotated by the rng for variety. */
function sharedPool(ix: ContentIndex, target: KanjiId, rng: Rng): KanjiId[] {
  const list = sharedComponentKanji(ix, target);
  const head = shuffle(list.slice(0, 3), rng);
  return [...head, ...list.slice(3)];
}

function visualOrder(ix: ContentIndex, k: KanjiId, forced?: KanjiId): KanjiId[] {
  const vis = partnersOf(ix, k, 'visual').map((p) => p.kanji);
  if (forced && vis.includes(forced)) return [forced, ...vis.filter((v) => v !== forced)];
  return vis;
}

function semanticOrder(ix: ContentIndex, k: KanjiId, forced?: KanjiId): KanjiId[] {
  const sem = partnersOf(ix, k, 'semantic').map((p) => p.kanji);
  if (forced && sem.includes(forced)) return [forced, ...sem.filter((v) => v !== forced)];
  return sem;
}

function draftMeaning(ix: ContentIndex, spec: QuestionSpec, target: Kanji, rng: Rng): Draft | null {
  const oc = new OptionCollector(target.keyword, new Set());
  const ok = (c: Kanji | undefined): c is Kanji => !!c && c.id !== target.id && !meaningsOverlap(target, c);
  const tryKanji = (id: KanjiId, source: OptionSource) => {
    const c = ix.kanji.get(id);
    return ok(c) && oc.add(c.keyword, source, c.id);
  };
  if (spec.partner) tryKanji(spec.partner, relationSource(ix, target.id, spec.partner));
  const hasVisual = () => oc.options.some((o) => o.source === 'visual');
  const hasSemantic = () => oc.options.some((o) => o.source === 'semantic');
  if (!hasVisual()) for (const v of visualOrder(ix, target.id)) if (tryKanji(v, 'visual')) break;
  if (!hasSemantic()) for (const s of semanticOrder(ix, target.id)) if (tryKanji(s, 'semantic')) break;
  for (const s of sharedPool(ix, target.id, rng)) {
    if (oc.options.filter((o) => o.source === 'shared_component').length >= 1) break;
    tryKanji(s, 'shared_component');
  }
  for (const c of randomPool(ix, target.id, rng)) {
    if (oc.full) break;
    if (ok(c)) oc.add(c.keyword, 'random');
  }
  if (!oc.full) return null;
  return {
    spec,
    prompt: target.id,
    promptKind: 'kanji',
    instruction: INSTRUCTIONS.meaning,
    subPrompt: spec.cue,
    options: oc.options,
  };
}

function draftReadingOn(ix: ContentIndex, spec: QuestionSpec, target: Kanji, rng: Rng): Draft | null {
  const answer = primaryReading(target, 'on');
  if (!answer) return null;
  const accepted = new Set(readingsOf(target, 'on').map((r) => r.kana));
  const oc = new OptionCollector(answer.kana, accepted);
  const kun = primaryReading(target, 'kun');
  if (kun) oc.add(fullKana(kun), 'other_reading_kind');
  const onOf = (id: KanjiId) => primaryReading(ix.kanji.get(id), 'on')?.kana;
  if (spec.partner && spec.partner !== target.id) oc.add(onOf(spec.partner), relationSource(ix, target.id, spec.partner), spec.partner);
  if (!oc.options.some((o) => o.source === 'visual')) {
    for (const v of visualOrder(ix, target.id)) if (oc.add(onOf(v), 'visual', v)) break;
  }
  for (const s of sharedPool(ix, target.id, rng)) if (oc.add(onOf(s), 'shared_component', s)) break;
  for (const c of randomPool(ix, target.id, rng)) {
    if (oc.full) break;
    oc.add(onOf(c.id), 'random');
  }
  if (!oc.full) return null;
  return {
    spec,
    prompt: target.id,
    promptKind: 'kanji',
    instruction: INSTRUCTIONS.reading_on,
    subPrompt: spec.cue,
    options: oc.options,
  };
}

function draftReadingKun(ix: ContentIndex, spec: QuestionSpec, target: Kanji, rng: Rng): Draft | null {
  const answer = primaryReading(target, 'kun');
  if (!answer) return null;
  const oki = answer.okurigana;
  const kuns = readingsOf(target, 'kun');
  const accepted = new Set<string>();
  for (const r of kuns) {
    accepted.add(fullKana(r));
    accepted.add(r.kana);
    accepted.add(r.kana + oki);
  }
  // Labels for another reading, shaped like the answer (same okurigana when the answer has one).
  const shape = (r: Reading | undefined): string | undefined => {
    if (!r) return undefined;
    if (oki) return r.kana + oki;
    return r.kind === 'kun' ? fullKana(r) : r.kana;
  };
  const oc = new OptionCollector(fullKana(answer), accepted);
  oc.add(shape(primaryReading(target, 'on')), 'other_reading_kind');
  const kunOf = (id: KanjiId) => shape(primaryReading(ix.kanji.get(id), 'kun'));
  if (spec.partner && spec.partner !== target.id) oc.add(kunOf(spec.partner), relationSource(ix, target.id, spec.partner), spec.partner);
  if (!oc.options.some((o) => o.source === 'visual')) {
    for (const v of visualOrder(ix, target.id)) if (oc.add(kunOf(v), 'visual', v)) break;
  }
  if (!oc.options.some((o) => o.source === 'semantic')) {
    for (const s of semanticOrder(ix, target.id)) if (oc.add(kunOf(s), 'semantic', s)) break;
  }
  for (const c of randomPool(ix, target.id, rng)) {
    if (oc.full) break;
    oc.add(kunOf(c.id), 'random');
  }
  if (!oc.full) return null;
  const form = oki ? okuriganaForm(target, answer) : undefined;
  const sub = [form, spec.cue].filter(Boolean).join(' · ') || undefined;
  return {
    spec,
    prompt: target.id,
    promptKind: 'kanji',
    instruction: INSTRUCTIONS.reading_kun,
    subPrompt: sub,
    options: oc.options,
  };
}

function draftRecognition(ix: ContentIndex, spec: QuestionSpec, target: Kanji, rng: Rng): Draft | null {
  const oc = new OptionCollector(target.id, new Set());
  const tryKanji = (id: KanjiId, source: OptionSource) => {
    const c = ix.kanji.get(id);
    if (!c || c.id === target.id || meaningsOverlap(target, c)) return false;
    return oc.add(c.id, source, c.id);
  };
  if (spec.partner) tryKanji(spec.partner, relationSource(ix, target.id, spec.partner));
  for (const v of visualOrder(ix, target.id)) tryKanji(v, 'visual');
  for (const s of sharedPool(ix, target.id, rng)) {
    if (oc.options.filter((o) => o.source === 'shared_component').length >= 1) break;
    tryKanji(s, 'shared_component');
  }
  for (const s of semanticOrder(ix, target.id)) if (tryKanji(s, 'semantic')) break;
  for (const s of sharedPool(ix, target.id, rng)) tryKanji(s, 'shared_component');
  for (const c of randomPool(ix, target.id, rng)) {
    if (oc.full) break;
    if (!meaningsOverlap(target, c)) oc.add(c.id, 'random');
  }
  if (!oc.full) return null;
  return {
    spec,
    prompt: target.keyword,
    promptKind: 'meaning',
    instruction: INSTRUCTIONS.recognition,
    subPrompt: spec.cue,
    options: oc.options,
  };
}

const DAKUTEN: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};
const UNDAKUTEN: Record<string, string> = Object.fromEntries(Object.entries(DAKUTEN).map(([a, b]) => [b, a]));

function toggleVoicing(s: string): string | undefined {
  const first = s[0];
  if (!first) return undefined;
  const t = DAKUTEN[first] ?? UNDAKUTEN[first];
  return t ? t + s.slice(1) : undefined;
}

function toggleLength(s: string): string | undefined {
  if (s.length > 1 && s.endsWith('う')) return s.slice(0, -1);
  if (/[こそとのほもよろごぞどぼょ]$/.test(s)) return s + 'う';
  return undefined;
}

function draftWordReading(ix: ContentIndex, spec: QuestionSpec, target: Kanji, rng: Rng): Draft | null {
  const word = spec.wordId ? ix.words.get(spec.wordId) : undefined;
  if (!word) return null;
  const segs = ix.segments.get(word.id);
  if (!segs) return null;
  const focusPart = word.parts.findIndex((p) => p.kanji === target.id);
  if (focusPart < 0) return null;
  const focusSeg = segs.findIndex((s) => s.part === focusPart);
  const replace = (segIndex: number, kana: string | undefined) =>
    kana === undefined ? undefined : segs.map((s, i) => (i === segIndex ? kana : s.kana)).join('');
  const surface = segs[focusSeg].kana;
  const kind = partReadingKind(ix, word, focusPart);
  const oc = new OptionCollector(word.kana, new Set([word.kana]));

  // 1. Same kanji, the other kind of reading.
  const otherKinds: ReadingKind[] = kind === 'on' ? ['kun'] : kind === 'kun' ? ['on'] : ['on', 'kun'];
  for (const k of otherKinds) {
    const r = primaryReading(target, k);
    if (r && r.kana !== surface && oc.add(replace(focusSeg, r.kana), 'other_reading_kind')) break;
  }
  // 2. A visual partner's reading of the same kind.
  const sameKind: ReadingKind = kind ?? 'on';
  const vis = visualOrder(ix, target.id, spec.partner);
  for (const v of vis) {
    const vk = ix.kanji.get(v);
    const r = primaryReading(vk, sameKind) ?? primaryReading(vk, sameKind === 'on' ? 'kun' : 'on');
    if (r && oc.add(replace(focusSeg, r.kana), 'visual', v)) break;
  }
  // 3. Plausible variants: another kanji of the word read the other way, a different reading
  //    of the same kind, or a kana-detail slip.
  for (let si = 0; si < segs.length && !oc.full; si++) {
    const seg = segs[si];
    if (seg.part === null || seg.part === focusPart) continue;
    const pk = ix.kanji.get(word.parts[seg.part].kanji);
    const pkind = partReadingKind(ix, word, seg.part);
    const r = primaryReading(pk, pkind === 'on' ? 'kun' : 'on');
    if (r && r.kana !== seg.kana && oc.add(replace(si, r.kana), 'other_reading_kind')) break;
  }
  const variants: Array<string | undefined> = shuffle(
    [
      ...readingsOf(target, sameKind)
        .filter((r) => r.kana !== surface)
        .map((r) => replace(focusSeg, r.kana)),
      replace(focusSeg, toggleVoicing(surface)),
      replace(focusSeg, toggleLength(surface)),
    ],
    rng,
  );
  for (const v of variants) if (oc.add(v, 'random')) break;
  for (const v of variants) {
    if (oc.full) break;
    oc.add(v, 'random');
  }
  for (const c of randomPool(ix, target.id, rng)) {
    if (oc.full) break;
    oc.add(replace(focusSeg, primaryReading(c, sameKind)?.kana), 'random');
  }
  if (!oc.full) return null;
  return {
    spec,
    prompt: word.text,
    promptKind: 'word',
    instruction: INSTRUCTIONS.word_reading,
    subPrompt: [word.meaning, spec.cue].filter(Boolean).join(' · '),
    options: oc.options,
  };
}

export function draftQuestion(ix: ContentIndex, spec: QuestionSpec, rng: Rng): Draft | null {
  const target = ix.kanji.get(spec.kanji);
  if (!target) return null;
  switch (spec.type) {
    case 'meaning':
      return draftMeaning(ix, spec, target, rng);
    case 'reading_on':
      return draftReadingOn(ix, spec, target, rng);
    case 'reading_kun':
      return draftReadingKun(ix, spec, target, rng);
    case 'recognition':
      return draftRecognition(ix, spec, target, rng);
    case 'word_reading':
      return draftWordReading(ix, spec, target, rng);
  }
}

/** Can this question type be asked about this kanji at all? */
export function canAsk(ix: ContentIndex, type: QuestionType, k: KanjiId): boolean {
  const kanji = ix.kanji.get(k);
  if (!kanji) return false;
  if (type === 'reading_on') return !!primaryReading(kanji, 'on');
  if (type === 'reading_kun') return !!primaryReading(kanji, 'kun');
  if (type === 'word_reading') return usableWords(ix, k).length > 0;
  return true;
}

/** Words usable for word_reading on this kanji (segmentable), regular readings first. */
export function usableWords(ix: ContentIndex, k: KanjiId): WordId[] {
  // A one-character word is just the kanji on its own, so it says nothing about context.
  const list = (ix.wordsByKanji.get(k) ?? []).filter((w) => ix.segments.get(w.id) && [...w.text].length > 1);
  const score = (w: (typeof list)[number]) => {
    const p = w.parts.find((x) => x.kanji === k);
    const regular = p && p.readingId && p.phenomenon === 'regular' ? 0 : 1;
    const okuriganaOnly = w.parts.length === 1 ? 0.5 : 0;
    return regular + okuriganaOnly;
  };
  return list
    .map((w, i) => ({ w, i, s: score(w) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.w.id);
}
