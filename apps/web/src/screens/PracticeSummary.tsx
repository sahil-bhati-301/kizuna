import { useStore } from '../app/store';
import { buildPractice } from '../app/flows';
import { deltaPoints, pct, plural, pp } from '../app/format';
import { MeterLegend, MeterRow, StatusPill } from '../components/bits';
import { Auto } from '../components/Ja';

export function PracticeSummary() {
  const { state, dispatch, content, run } = useStore();
  const result = state.practiceResult;
  if (!result || !state.model) {
    return (
      <div className="screen center">
        <p>No practice results yet.</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'insights' })}>
          Back to insights
        </button>
      </div>
    );
  }
  const { comparison, sessionCorrect, sessionTotal } = result;
  const delta = deltaPoints(comparison.accuracyBefore, comparison.accuracyAfter);
  const untied = comparison.patterns.filter((p) => p.status === 'resolved').length;
  const improved = comparison.patterns.filter((p) => p.status === 'improved').length;
  const model = state.model;

  const another = () => run(() => dispatch(buildPractice(content, result.after, model)));

  return (
    <div className="screen summary">
      <header className="screen-head">
        <span className="eyebrow">Practice complete</span>
        <h1>{untied > 0 ? `${plural(untied, 'knot')} untied!` : improved > 0 ? 'Threads are loosening' : 'Nice work'}</h1>
        <p className="muted">
          You got {sessionCorrect} of {sessionTotal} practice questions right.
        </p>
      </header>

      <section className="card acc-change" aria-label="Accuracy change">
        <div className="acc-col">
          <span className="stat-label">Diagnostic test</span>
          <span className="acc-num">{pct(comparison.accuracyBefore)}</span>
        </div>
        <div className={`acc-arrow ${delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : ''}`} aria-hidden="true">
          →
        </div>
        <div className="acc-col">
          <span className="stat-label">With practice</span>
          <span className="acc-num">{pct(comparison.accuracyAfter)}</span>
        </div>
        <div className={`acc-delta ${delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : ''}`}>{pp(delta)}</div>
        <p className="sr-only">
          Accuracy went from {pct(comparison.accuracyBefore)} to {pct(comparison.accuracyAfter)}, a change of {pp(delta)}.
        </p>
      </section>

      <section className="section" aria-labelledby="cmp-title">
        <div className="section-head">
          <h2 id="cmp-title">Your knots, before and after</h2>
        </div>
        {comparison.patterns.length === 0 ? (
          <p className="card muted">There were no knots to compare. Your practice reinforced your weakest kanji.</p>
        ) : (
          <ul className="cmp-list">
            {comparison.patterns.map((p) => (
              <li key={p.patternId} className={`card cmp cmp--${p.status}`}>
                <div className="cmp-head">
                  <h3>
                    <Auto text={p.title} />
                  </h3>
                  <StatusPill status={p.status} />
                </div>
                <div className="cmp-bars">
                  {p.before ? (
                    <MeterRow label="Before" observed={p.before.observed} expected={p.before.expected} n={p.before.n} tone="muted" />
                  ) : (
                    <NotFlagged label="Before" />
                  )}
                  {p.after ? (
                    <MeterRow
                      label="After"
                      observed={p.after.observed}
                      expected={p.after.expected}
                      n={p.after.n}
                      tone={p.status === 'worse' || p.status === 'new' ? 'thread' : 'indigo'}
                    />
                  ) : (
                    <NotFlagged label="After" />
                  )}
                </div>
                <p className="cmp-note muted">
                  {p.before && p.after
                    ? `Gap to expected: ${pp(p.before.deltaPp)} → ${pp(p.after.deltaPp)}`
                    : p.status === 'resolved'
                      ? 'No longer stands out from your overall level.'
                      : p.status === 'new'
                        ? 'Showed up with the extra answers from practice.'
                        : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
        {comparison.patterns.length > 0 && <MeterLegend observedLabel="Accuracy in this area" />}
      </section>

      <div className="btn-row">
        <button type="button" className="btn btn-thread btn-lg" onClick={another}>
          Another practice set
        </button>
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => dispatch({ type: 'go', screen: 'insights' })}>
          Back to insights
        </button>
      </div>

      <p className="fineprint">
        Real progress is measured over days, with spaced reviews that check what sticks. This demo shows a single sitting,
        so treat these numbers as a first signal rather than proof.
      </p>
    </div>
  );
}

function NotFlagged({ label }: { label: string }) {
  return (
    <div className="meter meter--none">
      <div className="meter-label">{label}</div>
      <div className="meter-none-text">Not flagged</div>
    </div>
  );
}
