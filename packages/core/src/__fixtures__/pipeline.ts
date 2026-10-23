// Test helper: run a simulated learner through test → grading → model → analysis.
import type { ContentSet } from '@kizuna/content';
import type { Analysis, GradedAnswer, LearnerModel, Question, SimProfileId } from '../contracts';
import { analyze, applyAnswers, createLearnerModel, createTest, gradeAnswer, simulateAnswers } from '../index';

export const T0 = 1_760_000_000_000;

export interface Run {
  questions: Question[];
  graded: GradedAnswer[];
  model: LearnerModel;
  analysis: Analysis;
}

export function gradeAll(questions: Question[], profile: SimProfileId, content: ContentSet, seed: number, startAt: number, phase: 'test' | 'practice'): GradedAnswer[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return simulateAnswers(questions, profile, content, { seed, startAt }).map((a) => gradeAnswer(byId.get(a.questionId)!, a, content, phase));
}

export function runProfile(content: ContentSet, profile: SimProfileId, seed: number): Run {
  const questions = createTest(content, { seed });
  const graded = gradeAll(questions, profile, content, seed, T0, 'test');
  const model = applyAnswers(createLearnerModel(T0), graded, content);
  const analysis = analyze(model, content, T0 + 3_600_000);
  return { questions, graded, model, analysis };
}

export const EXPECTED_PATTERN: Record<Exclude<SimProfileId, 'strong_beginner'>, string> = {
  visual_confuser: 'visual_confusion',
  kun_struggler: 'reading_kind',
  context_gap: 'context_gap',
  component_gap: 'component_family',
};
