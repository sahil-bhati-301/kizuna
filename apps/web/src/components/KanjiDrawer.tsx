import { useEffect, useMemo, useRef } from 'react';
import type { KanjiId } from '@kizuna/content';
import { getKanjiMastery, type Facet, type LearnerModel } from '@kizuna/core';
import { useStore } from '../app/store';
import { ERROR_CLASS_LABELS, facetLabel, formatTime, pct } from '../app/format';
import { IntervalBar, StageBadge } from './bits';
import { IntervalLegend } from '../visuals/FacetCompare';
import { Auto, Ja } from './Ja';

const FACET_ORDER: Facet[] = ['meaning', 'reading_on', 'reading_kun', 'recognition', 'context'];

export function KanjiDrawer({ kanji, model, onClose }: { kanji: KanjiId; model: LearnerModel; onClose: () => void }) {
  const { content } = useStore();
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const mastery = useMemo(() => getKanjiMastery(model, content, kanji, Date.now()), [model, content, kanji]);
  const info = useMemo(() => content.kanji.find((k) => k.id === kanji), [content, kanji]);
  const history = useMemo(
    () => model.answers.filter((a) => a.question.kanji === kanji).sort((a, b) => b.answeredAt - a.answeredAt),
    [model, kanji],
  );

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], summary, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const facets = FACET_ORDER.filter((f) => mastery.facets[f]);
  const readings = info?.readings.filter((r) => r.primary) ?? [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className={`drawer-kanji stage--${mastery.stage}`} aria-hidden="true">
            <Ja serif>{kanji}</Ja>
          </div>
          <div className="drawer-titles">
            <h2 id="drawer-title">
              <Ja serif>{kanji}</Ja>
              {info && <span className="drawer-keyword"> · {info.keyword}</span>}
            </h2>
            <div className="drawer-meta">
              <StageBadge stage={mastery.stage} />
              {mastery.overall.n > 0 && <span className="muted">Recall now ≈ {pct(mastery.recallNow)}</span>}
            </div>
            {readings.length > 0 && (
              <p className="drawer-readings">
                {readings.map((r) => (
                  <span key={r.id} className="chip chip--shared">
                    <span className="chip-kind">{r.kind === 'on' ? 'on' : 'kun'}</span>{' '}
                    <Ja>
                      {r.kana}
                      {r.okurigana ? `・${r.okurigana}` : ''}
                    </Ja>
                  </span>
                ))}
              </p>
            )}
          </div>
          <button ref={closeBtn} type="button" className="btn btn-icon" onClick={onClose} aria-label="Close details">
            ✕
          </button>
        </div>

        {info?.mnemonic && (
          <p className="drawer-mnemonic">
            <Auto text={info.mnemonic} />
          </p>
        )}

        <section className="drawer-section">
          <h3 className="mini-heading">How well you know it</h3>
          {facets.length === 0 ? (
            <p className="muted">No answers on this kanji yet.</p>
          ) : (
            <>
              <IntervalBar label="Overall" estimate={mastery.overall} highlight />
              {facets.map((f) => (
                <IntervalBar key={f} label={facetLabel(f)} estimate={mastery.facets[f]!} />
              ))}
              <IntervalLegend />
            </>
          )}
        </section>

        <section className="drawer-section">
          <h3 className="mini-heading">Your answers ({history.length})</h3>
          {history.length === 0 ? (
            <p className="muted">This kanji hasn’t come up yet.</p>
          ) : (
            <ol className="history">
              {history.map((a) => (
                <li key={`${a.questionId}-${a.answeredAt}`} className={a.correct ? 'ok' : 'bad'}>
                  <span className="history-mark" aria-hidden="true">
                    {a.correct ? '✓' : a.optionId === null ? '…' : '✗'}
                  </span>
                  <div className="history-body">
                    <div>
                      <Auto text={a.question.instruction} />: <strong><Auto text={a.question.prompt} /></strong>
                    </div>
                    <div className="muted">
                      {a.correct ? (
                        <>
                          Right: <Auto text={a.correctLabel} />
                        </>
                      ) : (
                        <>
                          You: {a.chosenLabel === null ? 'I don’t know' : <Auto text={a.chosenLabel} />} · Correct:{' '}
                          <Auto text={a.correctLabel} />
                          {a.errorClasses[0] && ` · ${ERROR_CLASS_LABELS[a.errorClasses[0]] ?? a.errorClasses[0]}`}
                        </>
                      )}
                    </div>
                  </div>
                  <span className="history-when muted">
                    <span className="chip chip--tiny">{a.phase}</span> {formatTime(a.answeredAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
