import { useCallback, useMemo, useState } from 'react';
import type { GradedAnswer, PracticeBlock, PracticeItem } from '@kizuna/core';
import { useStore } from '../app/store';
import { finishPractice } from '../app/flows';
import { plural } from '../app/format';
import { QuestionCard } from '../components/QuestionCard';
import { ProgressBar } from '../components/bits';
import { Auto } from '../components/Ja';

function NoPractice() {
  const { dispatch } = useStore();
  return (
    <div className="screen center">
      <p>There’s no practice set yet.</p>
      <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'insights' })}>
        Back to insights
      </button>
    </div>
  );
}

const TEMPLATE_ICON: Record<PracticeBlock['template'], string> = {
  contrast_pair: '⇄',
  family_drill: '⌘',
  reading_focus: 'あ',
  context_words: '語',
  weak_kanji_review: '↻',
};

export function PracticePreview() {
  const { state, dispatch } = useStore();
  const practice = state.practice;
  if (!practice) return <NoPractice />;
  const { set } = practice;
  const extras = set.items.length - set.blocks.reduce((s, b) => s + b.itemIds.length, 0);

  return (
    <div className="screen practice-preview">
      <header className="screen-head">
        <span className="eyebrow">Practice set {practice.round > 1 ? `#${practice.round}` : ''}</span>
        <h1>
          <Auto text={set.title} />
        </h1>
        <p className="muted">
          {plural(set.items.length, 'question')} · about {plural(Math.max(1, Math.round(set.estimatedMinutes)), 'minute')}
        </p>
      </header>

      <ol className="blocks">
        {set.blocks.map((b, i) => (
          <li key={b.id} className="card block" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="block-icon" aria-hidden="true" lang="ja">
              {TEMPLATE_ICON[b.template] ?? '•'}
            </span>
            <div className="block-body">
              <h2 className="block-title">
                <Auto text={b.title} />
              </h2>
              <p className="muted">
                <Auto text={b.description} />
              </p>
            </div>
            <span className="block-count">{plural(b.itemIds.length, 'item')}</span>
          </li>
        ))}
      </ol>
      {extras > 0 && (
        <p className="hint">Plus {plural(extras, 'warm-up or check question')} mixed in, to keep things honest.</p>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn-thread btn-lg" onClick={() => dispatch({ type: 'practice/start' })}>
          {practice.answers.length > 0 ? 'Continue practice' : 'Start practice'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => dispatch({ type: 'go', screen: 'insights' })}>
          Back to insights
        </button>
      </div>
    </div>
  );
}

const REASON_LABEL: Record<PracticeItem['reason']['code'], string> = {
  FOCUS: 'Focus',
  WEAK: 'Weak kanji',
  CHECK: 'Check',
  WARMUP: 'Warm-up',
};

function WhyChip({ item }: { item: PracticeItem }) {
  const [open, setOpen] = useState(false);
  const id = `why-${item.question.id}`;
  return (
    <div className="why">
      <button
        type="button"
        className={`chip chip--why reason--${item.reason.code}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        Why this?
      </button>
      <p id={id} className="why-text" hidden={!open}>
        <Auto text={item.reason.text} />
      </p>
    </div>
  );
}

export function PracticeRunner() {
  const { state, dispatch, content, run } = useStore();
  const practice = state.practice;
  const blockOf = useMemo(() => {
    const m = new Map<string, PracticeBlock>();
    for (const b of practice?.set.blocks ?? []) for (const id of b.itemIds) if (!m.has(id)) m.set(id, b);
    return m;
  }, [practice?.set]);

  const idx = practice?.answers.length ?? 0;
  const total = practice?.set.items.length ?? 0;

  const onDone = useCallback(
    (g: GradedAnswer) => {
      if (!practice) return;
      if (idx >= total - 1) {
        const model = state.model;
        const testAnalysis = state.testAnalysis;
        run(() => {
          if (!model || !testAnalysis) throw new Error('Practice finished without a learner model or test analysis.');
          dispatch(finishPractice(content, model, testAnalysis, [...practice.answers, g]));
        });
      } else {
        dispatch({ type: 'practice/answer', graded: g });
      }
    },
    [practice, idx, total, state.model, state.testAnalysis, run, dispatch, content],
  );

  if (!practice) return <NoPractice />;
  const item = practice.set.items[idx];
  const block = item ? blockOf.get(item.question.id) : undefined;
  const blockTitle = block?.title ?? (item ? REASON_LABEL[item.reason.code] : '');

  return (
    <div className="screen runner">
      <div className="runner-bar">
        <ProgressBar value={idx} total={total} label="Practice progress" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'go', screen: 'practice-preview' })}>
          Pause
        </button>
      </div>
      {item ? (
        <QuestionCard
          key={`${idx}-${item.question.id}`}
          question={item.question}
          phase="practice"
          onDone={onDone}
          header={
            <>
              <span className="qc-block">
                <Auto text={blockTitle} />
              </span>
              <WhyChip item={item} />
            </>
          }
        />
      ) : (
        <div className="card center">
          <p>All done.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              run(() => {
                if (!state.model || !state.testAnalysis) throw new Error('Missing learner model or test analysis.');
                dispatch(finishPractice(content, state.model, state.testAnalysis, practice.answers));
              })
            }
          >
            See how it went
          </button>
        </div>
      )}
    </div>
  );
}
