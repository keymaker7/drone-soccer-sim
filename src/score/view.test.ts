import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatch, matchReducer, restoreMatch, serializeMatch } from './match';
import { mountScore } from './view';

// DOM doubles verify actual wiring; these are not browser layout/native activation tests.
class Node extends EventTarget {
  innerHTML = ''; textContent = ''; value = ''; hidden = false; disabled = false;
  dataset: Record<string, string> = {};
  tag = 'div';
  children: Node[] = [];
  nodes = new Map<string, Node>();
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = { add: (s: string) => this.classes.add(s), toggle: (s: string, on: boolean) => on ? this.classes.add(s) : this.classes.delete(s) };
  elements = { namedItem: (name: string) => this.querySelector(`[name=${name}]`) };
  querySelector(selector: string): Node { if (!this.nodes.has(selector)) this.nodes.set(selector, new Node()); return this.nodes.get(selector)!; }
  querySelectorAll(): Node[] { return []; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  replaceChildren() { this.children = []; }
  append(node: Node) { this.children.push(node); }
  insertRow() { const n = new Node(); this.append(n); return n; }
  insertCell() { return this.insertRow(); }
  closest(selector: string): Node | null {
    if (selector === 'button[data-action]') return this.dataset.action ? this : null;
    return selector.split(',').map(v => v.trim()).includes(this.tag) ? this : null;
  }
}
const KEY = 'drone-soccer-match-v1';
let root: Node;
let win: EventTarget;
let doc: { activeElement: Node | null; createElement(): Node };
let stored: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
let score: ReturnType<typeof mountScore>;
function persisted() { return restoreMatch(stored.get(KEY) ?? null, Date.now()); }
function key(code: string, key: string, target = new Node(), shiftKey = false) {
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { code, key, shiftKey }); Object.defineProperty(event, 'target', { value: target });
  win.dispatchEvent(event); return event;
}
function click(action: string, team?: string, delta?: string) {
  const target = new Node(); target.dataset = { action, ...(team ? { team } : {}), ...(delta ? { delta } : {}) };
  const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); root.dispatchEvent(event);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  root = new Node(); win = new EventTarget(); stored = new Map();
  doc = { activeElement: null, createElement: () => new Node() };
  setItem = vi.fn((key: string, value: string) => stored.set(key, value));
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem });
  score = mountScore(root as unknown as HTMLElement);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('score view real event wiring', () => {
  it('scopes shortcuts to active tab and excludes edited names', () => {
    key('Digit1', '1'); expect(persisted().teams.blue.score).toBe(0);
    score.setActive(true); key('Digit1', '1'); expect(persisted().teams.blue.score).toBe(1);
    const input = new Node(); input.tag = 'input'; key('Digit2', '2', input);
    expect(persisted().teams.red.score).toBe(0);
    key('Digit1', '!', new Node(), true); expect(persisted().teams.blue.score).toBe(0);
    key('KeyO', 'o'); expect(persisted().teams.blue.offside).toBe(true);
    score.setActive(false); key('KeyP', 'p'); expect(persisted().teams.red.offside).toBe(false);
  });
  it('dispatch and button paths update displayed scores and event rows', () => {
    click('score', 'red', '1');
    expect(root.querySelector('[data-team="red"]').querySelector('.score-number').textContent).toBe('1');
    expect(root.querySelector('tbody').children).toHaveLength(1);
    click('penalty', 'blue'); expect(persisted().teams.blue.penalties).toBe(1);
    score.dispatch({ type: 'undo', now: Date.now() }); expect(persisted().teams.blue.penalties).toBe(0);
  });
  it('Space starts clock on background but leaves focused native controls alone', () => {
    score.setActive(true);
    for (const tag of ['button', 'a', 'summary']) { const target = new Node(); target.tag = tag; expect(key('Space', ' ', target).defaultPrevented).toBe(false); }
    expect(persisted().running).toBe(false);
    expect(key('Space', ' ').defaultPrevented).toBe(true); expect(persisted().running).toBe(true);
    key('Space', ' '); expect(persisted().running).toBe(false);
  });
  it('restores persisted deadline on mount and synchronizes storage without feedback writes', () => {
    const running = matchReducer(createMatch(), { type: 'start', now: 0 });
    stored.set(KEY, serializeMatch(running)); vi.setSystemTime(5000);
    const otherRoot = new Node(); mountScore(otherRoot as unknown as HTMLElement);
    expect(otherRoot.querySelector('.score-clock').textContent).toBe('00:05');
    const remote = matchReducer(running, { type: 'score', team: 'blue', delta: 1, now: 5000 });
    const event = new Event('storage'); Object.assign(event, { key: KEY, newValue: serializeMatch(remote) });
    const writes = setItem.mock.calls.length; win.dispatchEvent(event);
    expect(setItem.mock.calls).toHaveLength(writes);
    expect(root.querySelector('[data-team="blue"]').querySelector('.score-number').textContent).toBe('1');
    expect(root.querySelector('.score-clock').textContent).toBe('00:05');
  });
  it('continues running while tab is inactive and survives storage failure', () => {
    score.dispatch({ type: 'start', now: Date.now() }); score.setActive(false);
    setItem.mockImplementation(() => { throw new Error('storage blocked'); });
    vi.advanceTimersByTime(11000);
    expect(root.querySelector('.score-phase').textContent).toBe('경기');
    expect(root.querySelector('.score-save-status').textContent).toContain('현재 창에서만');
  });
});
