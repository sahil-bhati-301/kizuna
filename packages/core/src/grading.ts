// Grading and deterministic error classification (design §5.2, demo-sized).
import type { ContentSet } from '@kizuna/content';
import type { Answer, ErrorClass, GradedAnswer, OptionSource, Question, SessionPhase } from './contracts';

const CLASS_OF: Record<Exclude<OptionSource, 'answer'>, ErrorClass> = {
  visual: 'VISUAL_CONFUSION',
  semantic: 'SEMANTIC_CONFUSION',
  shared_component: 'SHARED_COMPONENT_CONFUSION',
  other_reading_kind: 'READING_KIND_SWAP',
  random: 'RANDOM_ERROR',
};

export function gradeAnswer(question: Question, answer: Answer, _content: ContentSet, phase: SessionPhase): GradedAnswer {
  const correctOption = question.options.find((o) => o.correct);
  const chosen = answer.optionId === null ? undefined : question.options.find((o) => o.id === answer.optionId);
  const correct = !!chosen?.correct;
  const errorClasses: ErrorClass[] = [];
  if (!correct) {
    if (!chosen) {
      errorClasses.push('DONT_KNOW');
    } else {
      errorClasses.push(chosen.source === 'answer' ? 'RANDOM_ERROR' : CLASS_OF[chosen.source]);
      if (question.type === 'word_reading') errorClasses.push('CONTEXT_MISREAD');
    }
  }
  const graded: GradedAnswer = {
    questionId: question.id,
    question: JSON.parse(JSON.stringify(question)) as Question,
    optionId: chosen ? chosen.id : null,
    chosenLabel: chosen ? chosen.label : null,
    correctLabel: correctOption?.label ?? '',
    correct,
    errorClasses,
    latencyMs: answer.latencyMs,
    answeredAt: answer.answeredAt,
    phase,
  };
  if (!correct && chosen?.fromKanji !== undefined) graded.confusedWith = chosen.fromKanji;
  return graded;
}
