import { useEffect, useRef } from 'react';
import { useStore, type Screen } from './store';
import { Wordmark } from '../components/Brand';
import { Welcome } from '../screens/Welcome';
import { TestScreen } from '../screens/TestScreen';
import { Insights } from '../screens/Insights';
import { PracticePreview, PracticeRunner } from '../screens/Practice';
import { PracticeSummary } from '../screens/PracticeSummary';

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'test':
      return <TestScreen />;
    case 'insights':
      return <Insights />;
    case 'practice-preview':
      return <PracticePreview />;
    case 'practice':
      return <PracticeRunner />;
    case 'practice-summary':
      return <PracticeSummary />;
    case 'welcome':
    default:
      return <Welcome />;
  }
}

const NAV_LABEL: Partial<Record<Screen, string>> = {
  test: 'Test',
  insights: 'Insights',
  'practice-preview': 'Practice',
  practice: 'Practice',
  'practice-summary': 'Results',
};

export function App() {
  const { state, dispatch } = useStore();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // On every screen change: back to the top, and move focus to the new screen for screen readers.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    main.current?.focus({ preventScroll: true });
  }, [state.screen]);

  const inSession = state.screen === 'test' || state.screen === 'practice';

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={`topbar ${inSession ? 'topbar--quiet' : ''}`}>
        <div className="topbar-inner">
          <button
            type="button"
            className="brand-btn"
            onClick={() => dispatch({ type: 'go', screen: 'welcome' })}
            aria-label="Kizuna home"
          >
            <Wordmark />
          </button>
          <nav className="topnav" aria-label="Sections">
            {state.testAnalysis && state.screen !== 'insights' && !inSession && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: 'go', screen: 'insights' })}>
                Insights
              </button>
            )}
            {NAV_LABEL[state.screen] && <span className="topnav-current">{NAV_LABEL[state.screen]}</span>}
          </nav>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1} className="main">
        <div key={state.screen} className="screen-anim">
          <ScreenView screen={state.screen} />
        </div>
      </main>
    </>
  );
}
