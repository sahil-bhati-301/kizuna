import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { n5, type ContentSet } from '@kizuna/content';
import type {
  Analysis,
  AnalysisComparison,
  GradedAnswer,
  LearnerModel,
  PracticeSet,
  Question,
  SimProfileId,
} from '@kizuna/core';
import { clearState, loadState, saveState } from './persistence';

export type Screen = 'welcome' | 'test' | 'insights' | 'practice-preview' | 'practice' | 'practice-summary';

export interface TestSession {
  mode: 'real' | 'demo';
  seed: number;
  profileId?: SimProfileId;
  profileLabel?: string;
  questions: Question[];
  /** Real mode: answers so far, in order. Demo mode: every simulated answer, graded up front. */
  answers: GradedAnswer[];
  startedAt: number;
}

export interface PracticeSession {
  set: PracticeSet;
  answers: GradedAnswer[];
  round: number;
}

export interface PracticeResult {
  after: Analysis;
  comparison: AnalysisComparison;
  sessionCorrect: number;
  sessionTotal: number;
}

export interface AppState {
  screen: Screen;
  /** The last non-welcome screen, used by "Resume". */
  lastScreen: Screen | null;
  test: TestSession | null;
  model: LearnerModel | null;
  /** analyze(model, n5, now, {phase: 'test'}) right after the diagnostic test. */
  testAnalysis: Analysis | null;
  /** analyze(model, n5, now) over every answer, after the latest practice. */
  latestAnalysis: Analysis | null;
  practice: PracticeSession | null;
  practiceResult: PracticeResult | null;
  practiceRounds: number;
}

export const initialState: AppState = {
  screen: 'welcome',
  lastScreen: null,
  test: null,
  model: null,
  testAnalysis: null,
  latestAnalysis: null,
  practice: null,
  practiceResult: null,
  practiceRounds: 0,
};

export type Action =
  | { type: 'go'; screen: Screen }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'test/start'; session: TestSession }
  | { type: 'test/answer'; graded: GradedAnswer }
  | { type: 'test/finish'; model: LearnerModel; analysis: Analysis; answers: GradedAnswer[] }
  | { type: 'practice/create'; set: PracticeSet }
  | { type: 'practice/start' }
  | { type: 'practice/answer'; graded: GradedAnswer }
  | { type: 'practice/finish'; model: LearnerModel; answers: GradedAnswer[]; result: PracticeResult };

function go(state: AppState, screen: Screen): AppState {
  return { ...state, screen, lastScreen: screen === 'welcome' ? state.lastScreen : screen };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'go':
      return go(state, action.screen);
    case 'resume':
      return state.lastScreen ? go(state, state.lastScreen) : state;
    case 'reset':
      return initialState;
    case 'test/start':
      return go({ ...initialState, test: action.session }, 'test');
    case 'test/answer':
      if (!state.test) return state;
      return { ...state, test: { ...state.test, answers: [...state.test.answers, action.graded] } };
    case 'test/finish':
      return go(
        {
          ...state,
          test: state.test ? { ...state.test, answers: action.answers } : state.test,
          model: action.model,
          testAnalysis: action.analysis,
          latestAnalysis: null,
          practice: null,
          practiceResult: null,
          practiceRounds: 0,
        },
        'insights',
      );
    case 'practice/create':
      return go(
        { ...state, practice: { set: action.set, answers: [], round: state.practiceRounds + 1 }, practiceResult: null },
        'practice-preview',
      );
    case 'practice/start':
      return state.practice ? go(state, 'practice') : state;
    case 'practice/answer':
      if (!state.practice) return state;
      return { ...state, practice: { ...state.practice, answers: [...state.practice.answers, action.graded] } };
    case 'practice/finish':
      return go(
        {
          ...state,
          model: action.model,
          practice: state.practice ? { ...state.practice, answers: action.answers } : state.practice,
          latestAnalysis: action.result.after,
          practiceResult: action.result,
          practiceRounds: state.practice?.round ?? state.practiceRounds + 1,
        },
        'practice-summary',
      );
    default:
      return state;
  }
}

function hydrate(): AppState {
  const saved = loadState(n5.version);
  if (!saved) return initialState;
  // Always open on the welcome screen; "Resume" returns to where the learner was.
  const lastScreen = saved.screen !== 'welcome' ? saved.screen : saved.lastScreen;
  return { ...initialState, ...saved, screen: 'welcome', lastScreen: lastScreen ?? null };
}

interface StoreValue {
  state: AppState;
  dispatch: (a: Action) => void;
  content: ContentSet;
  /** Run code that calls the core; any error is shown by the error boundary. */
  run: (fn: () => void) => void;
  resetEverything: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);
  // Errors thrown in event handlers do not reach error boundaries, so rethrow them during render.
  const [, setCrash] = useState<null>(null);

  useEffect(() => {
    saveState(state, n5.version);
  }, [state]);

  const run = useCallback((fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setCrash(() => {
        throw e;
      });
    }
  }, []);

  const resetEverything = useCallback(() => {
    clearState();
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ state, dispatch, content: n5, run, resetEverything }),
    [state, run, resetEverything],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}

export function hasSavedProgress(state: AppState): boolean {
  return Boolean(state.test || state.model || state.testAnalysis);
}
