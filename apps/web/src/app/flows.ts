// The only place that sequences core calls for whole flows. Screens call these inside store.run().
import type { ContentSet } from '@kizuna/content';
import {
  analyze,
  applyAnswers,
  compareAnalyses,
  createLearnerModel,
  createPracticeSet,
  createTest,
  gradeAnswer,
  simProfiles,
  simulateAnswers,
  type Analysis,
  type Answer,
  type GradedAnswer,
  type LearnerModel,
  type SimProfileId,
} from '@kizuna/core';
import { randomSeed } from './format';
import type { Action, TestSession } from './store';

export function startRealTest(content: ContentSet): Action {
  const seed = randomSeed();
  const questions = createTest(content, { seed });
  if (!questions.length) throw new Error('createTest returned no questions.');
  const session: TestSession = { mode: 'real', seed, questions, answers: [], startedAt: Date.now() };
  return { type: 'test/start', session };
}

export function startDemoTest(content: ContentSet, profileId: SimProfileId): Action {
  const seed = randomSeed();
  const questions = createTest(content, { seed });
  if (!questions.length) throw new Error('createTest returned no questions.');
  // Pretend the simulated learner sat the test over the last few minutes.
  const startAt = Date.now() - questions.length * 8000;
  const answers = simulateAnswers(questions, profileId, content, { seed, startAt });
  const byId = new Map<string, Answer>(answers.map((a) => [a.questionId, a]));
  const graded: GradedAnswer[] = [];
  questions.forEach((q, i) => {
    const a = byId.get(q.id) ?? answers[i];
    if (a) graded.push(gradeAnswer(q, { ...a, questionId: q.id }, content, 'test'));
  });
  const profile = simProfiles.find((p) => p.id === profileId);
  const session: TestSession = {
    mode: 'demo',
    seed,
    profileId,
    profileLabel: profile?.label ?? profileId,
    questions,
    answers: graded,
    startedAt: Date.now(),
  };
  return { type: 'test/start', session };
}

export function finishTest(content: ContentSet, answers: GradedAnswer[]): Action {
  const now = Date.now();
  const model = applyAnswers(createLearnerModel(now), answers, content);
  const analysis = analyze(model, content, now, { phase: 'test' });
  return { type: 'test/finish', model, analysis, answers };
}

export function buildPractice(content: ContentSet, analysis: Analysis, model: LearnerModel): Action {
  const set = createPracticeSet(analysis, model, content, { seed: randomSeed(), now: Date.now() });
  if (!set.items.length) throw new Error('createPracticeSet returned an empty practice set.');
  return { type: 'practice/create', set };
}

export function finishPractice(
  content: ContentSet,
  model: LearnerModel,
  testAnalysis: Analysis,
  answers: GradedAnswer[],
): Action {
  const now = Date.now();
  const next = applyAnswers(model, answers, content);
  const after = analyze(next, content, now);
  const comparison = compareAnalyses(testAnalysis, after);
  return {
    type: 'practice/finish',
    model: next,
    answers,
    result: {
      after,
      comparison,
      sessionCorrect: answers.filter((a) => a.correct).length,
      sessionTotal: answers.length,
    },
  };
}
