import type { Pattern } from '@kizuna/core';
import { ERROR_CLASS_LABELS, PATTERN_TYPE_LABELS, pct, plural, pp } from '../app/format';
import { Visual } from '../visuals/Visual';
import { ConfidenceBadge, Facts } from './bits';
import { Auto } from './Ja';

export function KnotCard({ pattern, index }: { pattern: Pattern; index: number }) {
  const ev = pattern.evidence;
  const headingId = `knot-${index}`;
  return (
    <article className="card knot" aria-labelledby={headingId} style={{ animationDelay: `${index * 70}ms` }}>
      <header className="knot-head">
        <div className="knot-icon" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40">
            <path
              d="M2 26 C 10 26, 12 10, 20 12 C 28 14, 20 30, 14 24 C 8 18, 28 14, 38 18"
              fill="none"
              stroke="var(--thread)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="knot-titles">
          <span className="eyebrow">{PATTERN_TYPE_LABELS[pattern.type] ?? pattern.type}</span>
          <h3 id={headingId} className="knot-title">
            <Auto text={pattern.title} />
          </h3>
        </div>
        <ConfidenceBadge confidence={pattern.confidence} />
      </header>

      <p className="knot-reason">
        <Auto text={pattern.reason} />
      </p>

      <dl className="knot-numbers">
        <div>
          <dt>You</dt>
          <dd className="num-thread">{pct(ev.observed)}</dd>
        </div>
        <div>
          <dt>Expected</dt>
          <dd>{pct(ev.expected)}</dd>
        </div>
        <div>
          <dt>Gap</dt>
          <dd className={ev.deltaPp < 0 ? 'num-thread' : ''}>{pp(ev.deltaPp)}</dd>
        </div>
        <div>
          <dt>Based on</dt>
          <dd>
            {plural(ev.n, 'answer')}
            <span className="muted sub-line">across {plural(ev.items, 'kanji', 'kanji')}</span>
          </dd>
        </div>
        {ev.confusions !== undefined && ev.opportunities !== undefined && (
          <div>
            <dt>Mix-ups</dt>
            <dd>
              {ev.confusions}
              <span className="muted"> of {plural(ev.opportunities, 'chance')}</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="knot-grid">
        <div className="knot-evidence">
          <h4 className="mini-heading">Evidence</h4>
          <Facts facts={ev.facts} />
        </div>
        <div className="knot-visual">
          <Visual spec={pattern.visual} />
        </div>
      </div>

      {ev.examples.length > 0 && (
        <details className="knot-mistakes">
          <summary>See the mistakes ({ev.examples.length})</summary>
          <table className="mistakes">
            <thead>
              <tr>
                <th scope="col">Prompt</th>
                <th scope="col">Question</th>
                <th scope="col">Your answer</th>
                <th scope="col">Correct</th>
              </tr>
            </thead>
            <tbody>
              {ev.examples.map((ex) => (
                <tr key={ex.questionId}>
                  <td data-label="Prompt" className="mistake-prompt">
                    <div>
                      <Auto text={ex.prompt} />
                    </div>
                  </td>
                  <td data-label="Question">
                    <div>
                      <Auto text={ex.instruction} />
                      {ex.errorClasses.length > 0 && (
                        <span className="mistake-tags">
                          {ex.errorClasses.map((c) => (
                            <span key={c} className="chip chip--tiny">
                              {ERROR_CLASS_LABELS[c] ?? c}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Your answer" className="mistake-chosen">
                    <div>{ex.chosen === null ? <span className="muted">I don’t know</span> : <Auto text={ex.chosen} />}</div>
                  </td>
                  <td data-label="Correct" className="mistake-correct">
                    <div>
                      <Auto text={ex.correct} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="knot-rec">
        <span className="knot-rec-label">How to untie it</span>
        <strong>
          <Auto text={pattern.recommendation.label} />
        </strong>
        <p>
          <Auto text={pattern.recommendation.description} />
        </p>
      </div>
    </article>
  );
}
