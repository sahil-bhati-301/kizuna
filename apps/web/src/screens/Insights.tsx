import { useCallback, useRef, useState } from 'react';
import type { KanjiId } from '@kizuna/content';
import type { Analysis } from '@kizuna/core';
import { useStore } from '../app/store';
import { buildPractice } from '../app/flows';
import { abilityLabel, pct, plural } from '../app/format';
import { KnotCard } from '../components/KnotCard';
import { KanjiMap } from '../components/KanjiMap';
import { KanjiDrawer } from '../components/KanjiDrawer';
import { MeterLegend, MeterRow, Stat, StageBadge } from '../components/bits';
import { Auto, Ja } from '../components/Ja';

export function Insights() {
  const { state, dispatch, content, run } = useStore();
  const [view, setView] = useState<'test' | 'latest'>(state.latestAnalysis ? 'latest' : 'test');
  const [openKanji, setOpenKanji] = useState<KanjiId | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const analysis: Analysis | null = (view === 'latest' && state.latestAnalysis) || state.testAnalysis;
  const model = state.model;

  const onOpen = useCallback((k: KanjiId, el: HTMLElement) => {
    opener.current = el;
    setOpenKanji(k);
  }, []);
  const onClose = useCallback(() => {
    setOpenKanji(null);
    opener.current?.focus();
  }, []);

  if (!analysis || !model) {
    return (
      <div className="screen center">
        <p>Take the test first and your insights will appear here.</p>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'go', screen: 'welcome' })}>
          Back to start
        </button>
      </div>
    );
  }

  const ability = abilityLabel(analysis.ability, analysis.accuracy);
  const isDemo = state.test?.mode === 'demo';
  const buildSet = () => run(() => dispatch(buildPractice(content, analysis, model)));

  return (
    <div className="screen insights">
      <header className="screen-head">
        <span className="eyebrow">{isDemo ? `Demo · ${state.test?.profileLabel ?? 'simulated learner'}` : 'Your N5 map'}</span>
        <h1>Here’s what we found</h1>
        {state.latestAnalysis && (
          <div className="segmented" role="group" aria-label="Which answers to analyse">
            <button type="button" aria-pressed={view === 'test'} onClick={() => setView('test')}>
              Diagnostic test
            </button>
            <button type="button" aria-pressed={view === 'latest'} onClick={() => setView('latest')}>
              Test + practice
            </button>
          </div>
        )}
      </header>

      <section className="card stats-card" aria-label="Summary">
        <div className="stats">
          <Stat label="Accuracy" value={pct(analysis.accuracy)} />
          <Stat label="Questions answered" value={analysis.answered} />
          <Stat label="Level" value={<span className="stat-word">{ability.label}</span>} sub={ability.blurb} />
          <Stat label="Knots found" value={analysis.patterns.length} />
        </div>
        {analysis.byFacet.length > 0 && (
          <div className="facet-bars">
            <h2 className="mini-heading">By question type</h2>
            {analysis.byFacet.map((f) => {
              const behind = f.n > 0 && f.observed < f.expected - 0.1;
              return (
                <MeterRow
                  key={f.facet}
                  label={<Auto text={f.label} />}
                  observed={f.observed}
                  expected={f.expected}
                  n={f.n}
                  highlight={behind}
                />
              );
            })}
            <MeterLegend />
            <p className="sr-only">
              {analysis.byFacet
                .map((f) => `${f.label}: ${pct(f.observed)} correct versus ${pct(f.expected)} expected, ${f.n} answers`)
                .join('; ')}
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="knots-title" className="section">
        <div className="section-head">
          <h2 id="knots-title">Knots we found</h2>
          <p className="muted">
            A knot is a pattern where you did clearly worse than your own overall level predicts. We only show ones the
            evidence supports.
          </p>
        </div>
        {analysis.patterns.length === 0 ? (
          <div className="card empty">
            <div className="empty-art" aria-hidden="true">
              <svg viewBox="0 0 120 40" width="120" height="40">
                <path d="M4 22 C 30 10, 50 34, 80 20 S 110 18, 116 22" fill="none" stroke="var(--thread)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <h3>No knots, just a smooth thread</h3>
            <p className="muted">
              We didn’t find any pattern in your mistakes that stands out from chance. That’s a great sign. Practice will
              still strengthen your weakest kanji and keep everything fresh.
            </p>
          </div>
        ) : (
          <div className="knots">
            {analysis.patterns.map((p, i) => (
              <KnotCard key={p.id} pattern={p} index={i} />
            ))}
          </div>
        )}
      </section>

      {analysis.weakKanji.length > 0 && (
        <section aria-labelledby="weak-title" className="section">
          <div className="section-head">
            <h2 id="weak-title">Kanji to strengthen</h2>
          </div>
          <ul className="weak-list">
            {analysis.weakKanji.map((w) => (
              <li key={w.kanji} className="card weak-item">
                <button
                  type="button"
                  className={`weak-kanji stage--${w.mastery.stage}`}
                  onClick={(e) => onOpen(w.kanji, e.currentTarget)}
                  aria-label={`Open details for ${w.kanji}`}
                >
                  <Ja serif>{w.kanji}</Ja>
                </button>
                <div className="weak-body">
                  <div className="weak-top">
                    <StageBadge stage={w.mastery.stage} />
                    {w.mastery.overall.n > 0 && (
                      <span className="muted">
                        ≈ {pct(w.mastery.overall.mean)} · {plural(w.mastery.overall.n, 'answer')}
                      </span>
                    )}
                  </div>
                  <ul className="weak-reasons">
                    {w.reasons.map((r, i) => (
                      <li key={i}>
                        <Auto text={r} />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="map-title" className="section">
        <div className="section-head">
          <h2 id="map-title">Kanji map</h2>
          <p className="muted">Every N5 kanji in the set. Select one to see its estimates and your answers.</p>
        </div>
        <div className="card">
          <KanjiMap map={analysis.kanjiMap} onOpen={onOpen} />
        </div>
      </section>

      {analysis.notes.length > 0 && (
        <section className="notes" aria-label="Notes">
          <h2 className="mini-heading">Notes on the evidence</h2>
          <ul>
            {analysis.notes.map((n, i) => (
              <li key={i}>
                <Auto text={n} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cta-bar">
        <div className="cta-inner">
          <div className="cta-text">
            <strong>Ready to untie {analysis.patterns.length > 0 ? 'these knots' : 'your weak spots'}?</strong>
            <span className="muted"> {analysis.patterns.length > 0 ? 'A short set aimed at exactly these patterns.' : 'A short set to strengthen your weakest kanji.'}</span>
          </div>
          <button type="button" className="btn btn-thread btn-lg" onClick={buildSet}>
            Build my practice set
          </button>
        </div>
      </div>

      {openKanji && <KanjiDrawer kanji={openKanji} model={model} onClose={onClose} />}
    </div>
  );
}
