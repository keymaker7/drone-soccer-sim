import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMatch, serializeMatch } from './match';
import { createMatchStore } from './store';

afterEach(() => { vi.unstubAllGlobals(); });
describe('shared match store', () => {
  it('shares reducer state and unsubscribes listeners', () => {
    const store = createMatchStore(createMatch()), listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({ type: 'score', team: 'blue', delta: 1, now: 0 });
    expect(store.get().teams.blue.score).toBe(1); expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][1].teams.blue.score).toBe(0);
    unsubscribe(); store.dispatch({ type: 'offside', team: 'blue', on: true, now: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('restores and saves browser storage and syncs external writes without feedback', () => {
    const initial = createMatch(); initial.teams.red.score = 2;
    const setItem = vi.fn(), win = new EventTarget();
    vi.stubGlobal('localStorage', { getItem: () => serializeMatch(initial), setItem }); vi.stubGlobal('window', win);
    const store = createMatchStore(createMatch(), true), listener = vi.fn(); store.subscribe(listener);
    expect(store.get().teams.red.score).toBe(2);
    store.dispatch({ type: 'score', team: 'red', delta: 1, now: 0 });
    expect(JSON.parse(setItem.mock.calls.at(-1)![1]).state.teams.red.score).toBe(3);
    const writes = setItem.mock.calls.length, event = new Event('storage');
    Object.assign(event, { key: 'drone-soccer-match-v1', newValue: serializeMatch(initial) }); win.dispatchEvent(event);
    expect(store.get().teams.red.score).toBe(2); expect(setItem).toHaveBeenCalledTimes(writes); expect(listener).toHaveBeenCalledTimes(2);
  });
  it('keeps custom initial settings when browser storage is empty or unavailable', () => {
    const initial = createMatch({ ready: 2, playing: 3, maintenance: 4 });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    expect(createMatchStore(initial, true).get().settings).toEqual(initial.settings);
    vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } });
    const store = createMatchStore(initial, true); store.dispatch({ type: 'score', team: 'blue', delta: 1, now: 0 });
    expect(store.storageFailed).toBe(true); expect(store.get().teams.blue.score).toBe(1);
  });
});
