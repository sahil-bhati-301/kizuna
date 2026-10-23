import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GradedAnswer } from '@kizuna/core';
import { useStore, type TestSession } from '../app/store';
import { finishTest } from '../app/flows';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressBar } from '../components/bits';

export function TestScreen() {
  const { state } = useStore();
  const test = state.test;
  if (!test) return <MissingSession />;
  return test.mode === 'demo' ? <DemoReplay test={test} /> : <RealTest test={test} />;
}

function MissingSession() {
  const { dispatch } = useStore();
  return (
    <div className="screen center">
      <p>There’s no test in progress.</p>
      <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'welcome' })}>
        Back to start
      </button>
    </div>
  );
}

function RealTest({ test }: { test: TestSession }) {
  const { dispatch, content, run } = useStore();
  const idx = test.answers.length;
  const total = test.questions.length;
  const question = test.questions[idx];

  const onDone = useCallback(
    (g: GradedAnswer) => {
      if (idx >= total - 1) {
        run(() => dispatch(finishTest(content, [...test.answers, g])));
      } else {
        dispatch({ type: 'test/answer', graded: g });
      }
    },
    [idx, total, run, dispatch, content, test.answers],
  );

  const correctSoFar = test.answers.filter((a) => a.correct).length;

  return (
    <div className="screen runner">
      <div className="runner-bar">
        <ProgressBar value={idx} total={total} label="Test progress" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'go', screen: 'welcome' })}>
          Pause &amp; quit
        </button>
      </div>
      {question ? (
        <QuestionCard key={`${idx}-${question.id}`} question={question} phase="test" onDone={onDone} />
      ) : (
        <div className="card center">
          <p>All questions answered.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => run(() => dispatch(finishTest(content, test.answers)))}
          >
            See my results
          </button>
        </div>
      )}
      <p className="runner-foot muted" aria-hidden="true">
        {idx > 0 ? `${correctSoFar} right so far. ` : ''}Progress is saved as you go.
      </p>
    </div>
  );
}

const REPLAY_MS = 150;

function DemoReplay({ test }: { test: TestSession }) {
  const { dispatch, content, run } = useStore();
  const [i, setI] = useState(0);
  const finished = useRef(false);
  const total = test.questions.length;
  const byId = useMemo(() => new Map(test.answers.map((a) => [a.questionId, a])), [test.answers]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    run(() => dispatch(finishTest(content, test.answers)));
  }, [run, dispatch, content, test.answers]);

  useEffect(() => {
    if (i >= total) {
      const t = window.setTimeout(finish, 500);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setI((x) => x + 1), REPLAY_MS);
    return () => window.clearTimeout(t);
  }, [i, total, finish]);

  const shown = Math.min(i, total - 1);
  const question = test.questions[shown];
  const graded = question ? byId.get(question.id) : undefined;
  const seen = test.questions.slice(0, Math.min(i + 1, total));
  const correct = seen.filter((q) => byId.get(q.id)?.correct).length;

  return (
    <div className="screen runner demo-runner">
      <div className="demo-banner" role="status">
        <span className="demo-dot" aria-hidden="true" />
        <span>
          <strong>Demo</strong> · {test.profileLabel ?? 'A simulated learner'} is taking the test
        </span>
        <span className="demo-tally">
          {correct}/{seen.length} right
        </span>
      </div>
      <div className="runner-bar">
        <ProgressBar value={Math.min(i + 1, total)} total={total} label="Demo progress" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={finish}>
          Skip to results ⏭
        </button>
      </div>
      {question && graded ? (
        <QuestionCard key={`${shown}-${question.id}`} question={question} phase="test" replay={graded} />
      ) : (
        <div className="card center">
          <p>Tying it all together…</p>
        </div>
      )}
      <p className="runner-foot muted">The answers are simulated; the analysis that follows is real.</p>
    </div>
  );
}
