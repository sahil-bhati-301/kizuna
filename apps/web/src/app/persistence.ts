import type { AppState } from './store';

export const STORAGE_KEY = 'kizuna.mvp.v1';

interface SavedEnvelope {
  v: 1;
  contentVersion: string;
  savedAt: number;
  state: AppState;
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read saved state. Returns null when storage is unavailable, empty, corrupt, or from another content version. */
export function loadState(contentVersion: string): AppState | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedEnvelope> | null;
    if (!parsed || parsed.v !== 1 || parsed.contentVersion !== contentVersion) return null;
    const s = parsed.state;
    if (!s || typeof s !== 'object' || typeof s.screen !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export function saveState(state: AppState, contentVersion: string): void {
  try {
    const env: SavedEnvelope = { v: 1, contentVersion, savedAt: Date.now(), state };
    storage()?.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    // Storage full or blocked: the app keeps working in memory.
  }
}

export function clearState(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
