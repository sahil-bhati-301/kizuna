import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { gradeAnswer, type GradedAnswer, type Question, type SessionPhase } from '@kizuna/core';
import { useStore } from '../app/store';
import { Auto, Ja, hasJapanese } from './Ja';

export interface QuestionCardProps {
  question: Question;
  phase: SessionPhase;
  /** Called when the learner moves on (after feedback). */
  onDone?: (graded: GradedAnswer) => void;
  /** Demo replay: show this answer immediately, no input. */
  replay?: GradedAnswer;
  /** Extra content above the prompt, e.g. the practice block title and "Why this?". */
  header?: ReactNode;
  /** Auto-advance delay after a correct answer. */
  autoAdvanceMs?: number;
}

const promptClass: Record<Question['promptKind'], string> = {
  kanji: 'qc-prompt--kanji',
  word: 'qc-prompt--word',
  meaning: 'qc-prompt--meaning',
};

export function QuestionCard({ question, phase, onDone, replay, header, autoAdvanceMs = 900 }: QuestionCardProps) {
  const { content, run } = useStore();
  const [graded, setGraded] = useState<GradedAnswer | null>(replay ?? null);
  const shownAt = useRef<number>(performance.now());
  const doneRef = useRef(false);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const isReplay = !!replay;
  const view = replay ?? graded;

  // Latency is measured from when the card is actually on screen.
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);

  const answer = useCallback(
    (optionId: string | null) => {
      if (graded || isReplay) return;
      const latencyMs = Math.max(0, Math.round(performance.now() - shownAt.current));
      run(() => {
        const g = gradeAnswer(question, { questionId: question.id, optionId, latencyMs, answeredAt: Date.now() }, content, phase);
        setGraded(g);
      });
    },
    [graded, isReplay, run, question, content, phase],
  );

  const finish = useCallback(() => {
    if (!graded || doneRef.current) return;
    doneRef.current = true;
    onDone?.(graded);
  }, [graded, onDone]);

  // Correct answers move on by themselves; wrong ones wait for the learner.
  useEffect(() => {
    if (!graded || isReplay) return;
    nextBtn.current?.focus({ preventScroll: true });
    if (!graded.correct) return;
    const t = window.setTimeout(finish, autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [graded, isReplay, finish, autoAdvanceMs]);

  // Keyboard: 1–9 pick an option, 0 = "I don't know", Enter/Space = next.
  useEffect(() => {
    if (isReplay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!graded) {
        if (e.key === '0') {
          e.preventDefault();
          answer(null);
          return;
        }
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= question.options.length) {
          e.preventDefault();
          answer(question.options[n - 1].id);
        }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        // A focused button handles its own activation.
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'SUMMARY' || target.tagName === 'A')) return;
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isReplay, graded, answer, finish, question.options]);

  const answered = !!view;
  // subPrompt carries the okurigana form, a word's meaning, or a practice cue: all safe to show up front.
  const showSub = !!question.subPrompt;
  const state = !view ? 'asking' : view.correct ? 'correct' : 'wrong';
  const promptIsJa = question.promptKind !== 'meaning' || hasJapanese(question.prompt);

  return (
    <article
      className={`card qc qc--${state}${isReplay ? ' qc--replay' : ''}`}
      aria-labelledby={`qc-prompt-${question.id}`}
    >
      {header && <div className="qc-header">{header}</div>}
      <p className="qc-instruction">
        <Auto text={question.instruction} />
      </p>
      <div className="qc-prompt-wrap">
        <h2 id={`qc-prompt-${question.id}`} className={`qc-prompt ${promptClass[question.promptKind] ?? ''}`}>
          {promptIsJa && question.promptKind !== 'meaning' ? (
            <Ja serif>{question.prompt}</Ja>
          ) : (
            <Auto text={question.prompt} />
          )}
        </h2>
        {showSub && (
          <p className="qc-sub">
            <Auto text={question.subPrompt} />
          </p>
        )}
      </div>

      <div className="qc-options" role="group" aria-label="Answer options">
        {question.options.map((o, i) => {
          const chosen = view?.optionId === o.id;
          const cls = [
            'qc-option',
            hasJapanese(o.label) ? 'qc-option--ja' : '',
            view && o.correct ? 'is-correct' : '',
            view && chosen && !o.correct ? 'is-wrong' : '',
            view && !o.correct && !chosen ? 'is-dim' : '',
            chosen ? 'is-chosen' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={o.id}
              type="button"
              className={cls}
              style={isReplay ? { animationDelay: `${i * 12}ms` } : undefined}
              onClick={() => answer(o.id)}
              disabled={answered}
              aria-keyshortcuts={String(i + 1)}
            >
              <span className="qc-key" aria-hidden="true">
                {i + 1}
              </span>
              <span className="qc-label">
                {hasJapanese(o.label) ? <Ja>{o.label}</Ja> : o.label}
              </span>
              {view && o.correct && (
                <span className="qc-mark">
                  <span aria-hidden="true">✓</span>
                  <span className="sr-only">(correct answer)</span>
                </span>
              )}
              {view && chosen && !o.correct && (
                <span className="qc-mark">
                  <span aria-hidden="true">✗</span>
                  <span className="sr-only">(your answer)</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!answered && (
        <div className="qc-idk-row">
          <button type="button" className="btn btn-ghost qc-idk" onClick={() => answer(null)} aria-keyshortcuts="0">
            I don’t know <kbd aria-hidden="true">0</kbd>
          </button>
        </div>
      )}

      <div className="qc-feedback" aria-live={isReplay ? 'off' : 'polite'}>
        {view && !isReplay && <Feedback graded={view} />}
        {view && isReplay && (
          <p className={`qc-replay-note ${view.correct ? 'ok' : 'bad'}`}>
            {view.correct ? '✓ Correct' : view.optionId === null ? '… Didn’t know' : '✗ Missed'}
          </p>
        )}
      </div>

      {graded && !isReplay && (
        <div className="qc-next-row">
          <button ref={nextBtn} type="button" className="btn btn-primary qc-next" onClick={finish}>
            {graded.correct ? 'Next' : 'Got it, next'} <kbd aria-hidden="true">Enter</kbd>
          </button>
        </div>
      )}
    </article>
  );
}

function Feedback({ graded }: { graded: GradedAnswer }) {
  if (graded.correct) {
    return (
      <p className="fb fb--ok">
        <span className="fb-icon" aria-hidden="true">
          ✓
        </span>
        Correct!
      </p>
    );
  }
  return (
    <div className="fb fb--bad">
      <p>
        <span className="fb-icon" aria-hidden="true">
          {graded.optionId === null ? '…' : '✗'}
        </span>
        {graded.optionId === null ? 'No problem. ' : 'Not quite. '}
        The answer is{' '}
        <strong>
          <Auto text={graded.correctLabel} />
        </strong>
        .
      </p>
      {graded.confusedWith && (
        <p className="chip chip--thread fb-confused">
          Mixed up with <Ja serif>{graded.confusedWith}</Ja>?
        </p>
      )}
    </div>
  );
}
