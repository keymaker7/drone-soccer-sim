import { matchReducer, restoreMatch, serializeMatch } from './match';
import type { MatchEvent, MatchState } from './match';

const STORAGE_KEY = 'drone-soccer-match-v1';
type Listener = (state: MatchState, previous: MatchState, event?: MatchEvent) => void;
export interface MatchStore { get(): MatchState; dispatch(event: MatchEvent): void; subscribe(listener: Listener): () => void; readonly storageFailed: boolean }
export function createMatchStore(initial: MatchState, persist = false): MatchStore {
  let state = initial, storageFailed = false;
  const listeners = new Set<Listener>();
  const save = () => { if (persist) try { localStorage.setItem(STORAGE_KEY, serializeMatch(state)); storageFailed = false; } catch { storageFailed = true; } };
  if (persist) {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw !== null) state = restoreMatch(raw, Date.now()); } catch { storageFailed = true; }
    if (typeof window !== 'undefined') window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      const previous = state; state = restoreMatch(event.newValue, Date.now());
      listeners.forEach(listener => listener(state, previous));
    });
    save();
  }
  return {
    get: () => state,
    get storageFailed() { return storageFailed; },
    dispatch(event) {
      const previous = state; state = matchReducer(state, event);
      if (event.type !== 'tick' || previous.phase !== state.phase || previous.records.length !== state.records.length) save();
      listeners.forEach(listener => listener(state, previous, event));
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
