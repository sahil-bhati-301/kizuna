// Core engine contract for the Kizuna demo. Owned by the lead; change only through the lead.
// Everything here is plain JSON-serialisable data, so the UI can persist it in localStorage.
import type { KanjiId, WordId } from '@kizuna/content';

// ---------------------------------------------------------------------------
// Traces and questions
// ---------------------------------------------------------------------------

/** The dimension of knowledge being tested. */
export type Facet = 'meaning' | 'reading_on' | 'reading_kun' | 'recognition' | 'context';
export type ItemType = 'kanji' | 'word';
/** `${itemType}:${itemId}:${facet}`, e.g. "kanji:日:meaning", "word:日本:context". */
export type TraceId = string;

/**
 * meaning      kanji → pick its meaning            (facet meaning)
 * reading_on   kanji → pick its primary on'yomi    (facet reading_on)
 * reading_kun  kanji → pick its primary kun'yomi   (facet reading_kun; prompt shows okurigana form)
 * recognition  meaning → pick the kanji            (facet recognition; distractors are lookalikes)
 * word_reading word → pick its reading            (facet context, word trace)
 */
export type QuestionType = 'meaning' | 'reading_on' | 'reading_kun' | 'recognition' | 'word_reading';

/** Why an option is on the card. Distractor sources drive error classification. */
export type OptionSource =
  | 'answer'
  | 'visual' // taken from a visually similar kanji (Relation kind "visual")
  | 'semantic' // taken from a related-meaning kanji (Relation kind "semantic")
  | 'shared_component' // taken from a kanji sharing a component
  | 'other_reading_kind' // a valid reading of the same kanji, but of the other kind (on vs kun)
  | 'random';

export interface Option {
  id: string;
  /** Text shown on the button: a kanji literal, a meaning, or kana. */
  label: string;
  correct: boolean;
  source: OptionSource;
  /** The kanji a distractor was taken from (absent for the answer and random options). */
  fromKanji?: KanjiId;
}

export interface Question {
  id: string;
  type: QuestionType;
  traceId: TraceId;
  /** Target kanji. For word_reading: the kanji the word was chosen to probe. */
  kanji: KanjiId;
  wordId?: WordId;
  /** What is shown big on the card: a kanji, an English meaning, or a word. */
  prompt: string;
  promptKind: 'kanji' | 'meaning' | 'word';
  /** E.g. "Choose the on'yomi". */
  instruction: string;
  /** Optional helper, e.g. the okurigana form "食べる" or a word's meaning after answering. */
  subPrompt?: string;
  /** Already shuffled; exactly one option has correct = true. */
  options: Option[];
  /** Item difficulty b on the logit scale, used by the baseline model. */
  difficulty: number;
  /**
   * Feature tags used for grouping, e.g. "facet:reading_kun", "reading_kind:kun", "radical:言",
   * "component:言", "field:number", "pair:人/入" (pair tags sort the two kanji by code point).
   */
  tags: string[];
}

export interface Answer {
  questionId: string;
  /** null means the learner pressed "I don't know". */
  optionId: string | null;
  latencyMs: number;
  /** Epoch milliseconds. */
  answeredAt: number;
}

export type SessionPhase = 'test' | 'practice';

export type ErrorClass =
  | 'VISUAL_CONFUSION' // chose an option from a visually similar kanji
  | 'SEMANTIC_CONFUSION' // chose an option from a related-meaning kanji
  | 'SHARED_COMPONENT_CONFUSION' // chose an option from a kanji sharing a component
  | 'READING_KIND_SWAP' // gave the other kind of reading (kun for on, or on for kun)
  | 'CONTEXT_MISREAD' // misread a kanji inside a word
  | 'RANDOM_ERROR' // wrong, with no specific relation
  | 'DONT_KNOW'; // pressed "I don't know"

export interface GradedAnswer {
  questionId: string;
  /** Full copy of the question so the history is self-contained. */
  question: Question;
  optionId: string | null;
  chosenLabel: string | null;
  correctLabel: string;
  correct: boolean;
  /** Empty when correct. */
  errorClasses: ErrorClass[];
  /** The kanji the learner seems to have mixed the target up with, if any. */
  confusedWith?: KanjiId;
  latencyMs: number;
  answeredAt: number;
  phase: SessionPhase;
}

// ---------------------------------------------------------------------------
// Memory model
// ---------------------------------------------------------------------------

/** A probability estimate with an 80% credible interval. */
export interface Estimate {
  mean: number;
  low: number;
  high: number;
  /** Number of observations behind the estimate. */
  n: number;
}

export interface TraceState {
  traceId: TraceId;
  itemType: ItemType;
  itemId: string;
  facet: Facet;
  /** Beta posterior parameters for "knows it" (after correcting for MC guessing). */
  alpha: number;
  beta: number;
  attempts: number;
  correct: number;
  /** Days until predicted recall drops to 90%; grows on success, shrinks on failure. */
  stabilityDays: number;
  lastSeenAt: number | null;
}

export interface LearnerModel {
  version: 1;
  createdAt: number;
  updatedAt: number;
  traces: Record<TraceId, TraceState>;
  /** Full answer history (the event log); state can be rebuilt from it. */
  answers: GradedAnswer[];
  /** Overall ability θ on the logit scale, refitted from all answers. */
  ability: number;
}

export type KanjiStage = 'untested' | 'weak' | 'shaky' | 'learning' | 'solid';

export interface KanjiMastery {
  kanji: KanjiId;
  stage: KanjiStage;
  /** Combined estimate across this kanji's facets. */
  overall: Estimate;
  facets: Partial<Record<Facet, Estimate>>;
  /** Predicted probability of recalling it right now (knowledge × forgetting). */
  recallNow: number;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export type PatternType =
  | 'component_family' // weaker on kanji sharing a component or radical
  | 'visual_confusion' // mixes up lookalike kanji
  | 'semantic_confusion' // mixes up related-meaning kanji
  | 'reading_kind' // weaker on on'yomi or on kun'yomi
  | 'context_gap' // knows kanji alone, misreads them in words
  | 'weak_kanji'; // individual kanji failing across facets

export interface EvidenceExample {
  questionId: string;
  kanji: KanjiId;
  prompt: string;
  instruction: string;
  /** null if "I don't know". */
  chosen: string | null;
  correct: string;
  errorClasses: ErrorClass[];
}

export interface Evidence {
  /** Answers in scope. */
  n: number;
  /** Distinct kanji in scope. */
  items: number;
  /** Observed accuracy in scope, 0–1. */
  observed: number;
  /** Accuracy the learner's own baseline predicted for these items, 0–1. */
  expected: number;
  /** observed − expected, in percentage points (negative = worse than expected). */
  deltaPp: number;
  /** Posterior probability that the deficit is real, 0–1. */
  confidence: number;
  /** Confusion patterns: how many times the mix-up happened, out of how many chances. */
  confusions?: number;
  opportunities?: number;
  /** Real mistakes, most telling first (at most 5). */
  examples: EvidenceExample[];
  /** Short evidence lines the UI renders verbatim as bullets. */
  facts: string[];
}

export type VisualSpec =
  | {
      kind: 'group_bars';
      title: string;
      groups: Array<{ key: string; label: string; observed: number; expected: number; n: number; highlight: boolean }>;
    }
  | {
      kind: 'confusion_pair';
      title: string;
      pairs: Array<{
        a: KanjiId;
        b: KanjiId;
        /** Times a was asked and b (or b's reading/meaning) was chosen. */
        aAsB: number;
        bAsA: number;
        opportunities: number;
        /** Component glyphs both share, and those unique to each. */
        shared: string[];
        onlyA: string[];
        onlyB: string[];
        note: string;
      }>;
    }
  | {
      kind: 'facet_compare';
      title: string;
      kanji: KanjiId;
      facets: Array<{ facet: Facet; label: string; estimate: Estimate; highlight: boolean }>;
    }
  | {
      kind: 'kanji_strip';
      title: string;
      cells: Array<{ kanji: KanjiId; correct: number; wrong: number; stage: KanjiStage }>;
    };

export type DrillTemplate = 'contrast_pair' | 'family_drill' | 'reading_focus' | 'context_words' | 'weak_kanji_review';

export interface Pattern {
  /** Stable across re-analysis: `${type}:${groupKey}`. */
  id: string;
  type: PatternType;
  /** E.g. "Knot: 人 ↔ 入". */
  title: string;
  /** E.g. "pair:人/入", "component:言", "reading_kind:kun", "kanji:休". */
  groupKey: string;
  kanji: KanjiId[];
  /** 0–1, for ordering. */
  severity: number;
  /** 0–1. */
  confidence: number;
  /** Plain-language explanation of why we think this. */
  reason: string;
  evidence: Evidence;
  visual: VisualSpec;
  recommendation: { template: DrillTemplate; label: string; description: string };
}

export interface Analysis {
  generatedAt: number;
  answered: number;
  accuracy: number;
  ability: number;
  byFacet: Array<{ facet: Facet; label: string; observed: number; expected: number; n: number }>;
  /** Sorted by severity, highest first. */
  patterns: Pattern[];
  weakKanji: Array<{ kanji: KanjiId; mastery: KanjiMastery; reasons: string[] }>;
  /** Every kanji in the content set, in frequency order. */
  kanjiMap: KanjiMastery[];
  /** E.g. "Not enough answers on kun'yomi yet to judge." */
  notes: string[];
}

export interface AnalysisComparison {
  accuracyBefore: number;
  accuracyAfter: number;
  patterns: Array<{
    patternId: string;
    title: string;
    before: Evidence | null;
    after: Evidence | null;
    status: 'improved' | 'unchanged' | 'worse' | 'resolved' | 'new';
  }>;
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

export type ReasonCode = 'FOCUS' | 'WEAK' | 'CHECK' | 'WARMUP';

export interface PracticeItem {
  question: Question;
  /** Shown in the UI as "Why this?". */
  reason: { code: ReasonCode; patternId?: string; text: string };
}

export interface PracticeBlock {
  id: string;
  title: string;
  description: string;
  template: DrillTemplate;
  patternId?: string;
  /** Question IDs, in order. */
  itemIds: string[];
}

export interface PracticeSet {
  id: string;
  createdAt: number;
  title: string;
  blocks: PracticeBlock[];
  /** All items in session order (blocks concatenated, with warm-ups and checks interleaved). */
  items: PracticeItem[];
  estimatedMinutes: number;
}

// ---------------------------------------------------------------------------
// Simulated learners (demo + tests)
// ---------------------------------------------------------------------------

export type SimProfileId = 'visual_confuser' | 'kun_struggler' | 'context_gap' | 'component_gap' | 'strong_beginner';

export interface SimProfile {
  id: SimProfileId;
  label: string;
  /** What weakness is injected, in plain words. */
  description: string;
}
