import { useState } from 'react';
import { simProfiles, type SimProfileId } from '@kizuna/core';
import { hasSavedProgress, useStore, type Screen } from '../app/store';
import { startDemoTest, startRealTest } from '../app/flows';
import { BrandMark, ThreadKnot } from '../components/Brand';

const RESUME_LABEL: Record<Screen, string> = {
  welcome: 'Resume',
  test: 'Resume the test',
  insights: 'Back to your insights',
  'practice-preview': 'Resume your practice set',
  practice: 'Resume practice',
  'practice-summary': 'See your practice results',
};

export function Welcome() {
  const { state, dispatch, content, run, resetEverything } = useStore();
  const [profile, setProfile] = useState<SimProfileId | ''>(simProfiles[0]?.id ?? '');
  const [confirmReset, setConfirmReset] = useState(false);
  const saved = hasSavedProgress(state);
  const kanjiCount = content.kanji.length;

  const takeTest = () => run(() => dispatch(startRealTest(content)));
  const runDemo = () => {
    if (!profile) return;
    run(() => dispatch(startDemoTest(content, profile)));
  };

  return (
    <div className="screen welcome">
      <section className="hero">
        <ThreadKnot className="hero-thread" />
        <div className="hero-mark">
          <BrandMark size={72} />
        </div>
        <h1 className="hero-title">
          Kizuna <span lang="ja" className="ja-serif hero-ja">絆</span>
        </h1>
        <p className="hero-tagline">Find the knots in your kanji, then untie them.</p>
        <p className="hero-pitch">
          Take a short N5 test and Kizuna maps what you really know: every kanji’s meaning and readings, with honest
          uncertainty. It spots the patterns behind your mistakes, like lookalikes you swap, readings you mix up or
          words that trip you, shows you the evidence, and builds a practice set aimed squarely at them.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary btn-xl" onClick={takeTest}>
            Take the N5 kanji test
            <span className="btn-sub">~60 questions · ~8 min</span>
          </button>
          {saved && state.lastScreen && (
            <button type="button" className="btn btn-secondary btn-xl" onClick={() => dispatch({ type: 'resume' })}>
              {RESUME_LABEL[state.lastScreen]}
            </button>
          )}
        </div>
        {saved && <p className="hint">Starting a new test replaces your saved results.</p>}
        <p className="hint">
          Covers {kanjiCount} N5 kanji · keyboard friendly: <kbd>1</kbd>–<kbd>4</kbd> to answer, <kbd>0</kbd> for “I don’t
          know”
        </p>
      </section>

      <section className="card demo-panel" aria-labelledby="demo-title">
        <div className="demo-head">
          <span className="eyebrow">Demo mode</span>
          <h2 id="demo-title">Watch a simulated learner</h2>
          <p className="muted">
            Each learner has one weakness built in. Watch them take the test, then see whether Kizuna finds it.
          </p>
        </div>
        {simProfiles.length === 0 ? (
          <p className="muted">No simulated learners are available yet.</p>
        ) : (
          <>
            <fieldset className="profile-picker">
              <legend className="sr-only">Choose a simulated learner</legend>
              {simProfiles.map((p) => (
                <label key={p.id} className={`profile-option ${profile === p.id ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="sim-profile"
                    value={p.id}
                    checked={profile === p.id}
                    onChange={() => setProfile(p.id)}
                  />
                  <span className="profile-text">
                    <strong>{p.label}</strong>
                    <span className="muted">{p.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <button type="button" className="btn btn-thread" onClick={runDemo} disabled={!profile}>
              ▶ Run the demo
            </button>
          </>
        )}
      </section>

      {saved && (
        <section className="reset-row">
          {!confirmReset ? (
            <button type="button" className="btn btn-link" onClick={() => setConfirmReset(true)}>
              Reset everything
            </button>
          ) : (
            <div className="confirm" role="group" aria-label="Confirm reset">
              <span>Erase your test, insights and practice from this browser?</span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  resetEverything();
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
