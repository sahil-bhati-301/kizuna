// Turn a QuestionSpec into a finished, shuffled Question.
import type { Option, Question } from './contracts';
import type { ContentIndex } from './contentIndex';
import { type QuestionSpec, draftQuestion } from './distractors';
import { type Rng, shuffle } from './rng';
import { difficultyFor, tagsFor, traceIdFor } from './tags';

export function buildQuestion(ix: ContentIndex, spec: QuestionSpec, id: string, rng: Rng): Question | null {
  const draft = draftQuestion(ix, spec, rng);
  if (!draft) return null;
  const options: Option[] = shuffle(draft.options, rng).map((o, i) => {
    const opt: Option = { id: `${id}-${String.fromCharCode(97 + i)}`, label: o.label, correct: o.correct, source: o.source };
    if (o.fromKanji !== undefined) opt.fromKanji = o.fromKanji;
    return opt;
  });
  const q: Question = {
    id,
    type: spec.type,
    traceId: traceIdFor(spec.type, spec.kanji, spec.wordId),
    kanji: spec.kanji,
    prompt: draft.prompt,
    promptKind: draft.promptKind,
    instruction: draft.instruction,
    options,
    difficulty: difficultyFor(ix, draft),
    tags: tagsFor(ix, draft),
  };
  if (spec.wordId) q.wordId = spec.wordId;
  if (draft.subPrompt) q.subPrompt = draft.subPrompt;
  return q;
}
