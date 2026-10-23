// Public API of the Kizuna core engine. The exported names and signatures are the contract;
// implementations live in their own modules and are re-exported here.
// All functions are pure: time and randomness come in as arguments (now, seed).
import type { ContentSet, KanjiId } from '@kizuna/content';
import type {
  Analysis,
  AnalysisComparison,
  Answer,
  GradedAnswer,
  KanjiMastery,
  LearnerModel,
  PracticeSet,
  Question,
  SessionPhase,
  SimProfile,
  SimProfileId,
} from './contracts';
import { analyze as analyzeImpl } from './analysis/analyze';
import { compareAnalyses as compareImpl } from './analysis/compare';
import { gradeAnswer as gradeImpl } from './grading';
import {
  applyAnswers as applyImpl,
  createLearnerModel as createModelImpl,
  getKanjiMastery as masteryImpl,
} from './memory';
import { createPracticeSet as practiceImpl } from './practice';
import { simProfiles as profiles, simulateAnswers as simulateImpl } from './sim';
import { createTest as createTestImpl } from './testBlueprint';

export * from './contracts';

/** Build the N5 diagnostic test (default ~60 questions), deterministic for a given seed. */
export function createTest(content: ContentSet, opts?: { seed?: number; length?: number }): Question[] {
  return createTestImpl(content, opts);
}

/** Grade one answer and classify the error, if any. */
export function gradeAnswer(question: Question, answer: Answer, content: ContentSet, phase: SessionPhase): GradedAnswer {
  return gradeImpl(question, answer, content, phase);
}

/** An empty learner model. */
export function createLearnerModel(now: number): LearnerModel {
  return createModelImpl(now);
}

/** Return a new model with the answers applied (traces, ability, history). Does not mutate. */
export function applyAnswers(model: LearnerModel, graded: GradedAnswer[], content: ContentSet): LearnerModel {
  return applyImpl(model, graded, content);
}

/** Mastery for one kanji at time `now`. */
export function getKanjiMastery(model: LearnerModel, content: ContentSet, kanji: KanjiId, now: number): KanjiMastery {
  return masteryImpl(model, content, kanji, now);
}

/**
 * Find patterns and weak kanji. By default uses every answer; pass phase "test" to analyse
 * the diagnostic test only (used for before/after comparisons).
 */
export function analyze(
  model: LearnerModel,
  content: ContentSet,
  now: number,
  opts?: { phase?: SessionPhase },
): Analysis {
  return analyzeImpl(model, content, now, opts);
}

/** Build a targeted practice set from an analysis (default ~20 items). */
export function createPracticeSet(
  analysis: Analysis,
  model: LearnerModel,
  content: ContentSet,
  opts?: { seed?: number; size?: number; now?: number },
): PracticeSet {
  return practiceImpl(analysis, model, content, opts);
}

/** Compare two analyses pattern by pattern (matched on Pattern.id). */
export function compareAnalyses(before: Analysis, after: Analysis): AnalysisComparison {
  return compareImpl(before, after);
}

/** Built-in simulated learners for the demo and for tests. */
export const simProfiles: SimProfile[] = profiles;

/** Produce answers as the given simulated learner would, deterministic for a given seed. */
export function simulateAnswers(
  questions: Question[],
  profile: SimProfileId,
  content: ContentSet,
  opts?: { seed?: number; startAt?: number },
): Answer[] {
  return simulateImpl(questions, profile, content, opts);
}
