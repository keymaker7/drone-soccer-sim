import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render/scene', () => ({
  CAMERA_NAMES: { 1: 'LOS' },
  createScene: () => ({ mode: 1, draw: vi.fn(), setMode: vi.fn() }),
}));

// Minimal DOM/event doubles exercise the real entry point without a new package.
// These tests do not claim browser layout or native dialog validation.
class Element extends EventTarget {
  textContent = ''; hidden = false; open = false; value = 0; offsetWidth = 10;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, on: boolean) => on ? this.classes.add(name) : this.classes.delete(name),
  };
  closest() { return null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  querySelectorAll() { return steps; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
let steps: Element[];
let elements: Map<string, Element>;
let win: EventTarget & { innerWidth: number; __DRONE_QA?: { state(): { armed: boolean; throttle: number; pos: { y: number } } } };
let doc: EventTarget & { hidden: boolean; getElementById(id: string): Element };
let frame: (time: number) => void;
let now: number;
const el = (id: string) => elements.get(id)!;
function key(code: string, type = 'keydown', repeat = false) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { code, repeat }); win.dispatchEvent(event);
}
function tick(ms: number) {
  const end = now + ms;
  while (now < end) { now = Math.min(now + 16, end); frame(now); }
}
async function boot(width = 1440, coarse = false, hover = true) {
  vi.resetModules(); now = 0;
  steps = [1, 2, 3, 4].map(step => { const item = new Element(); item.dataset.step = String(step); return item; });
  elements = new Map();
  win = Object.assign(new EventTarget(), { innerWidth: width });
  doc = Object.assign(new EventTarget(), { hidden: false, getElementById(id: string) {
    if (!elements.has(id)) elements.set(id, new Element());
    return el(id);
  } });
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc); vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (callback: typeof frame) => { frame = callback; });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' ? coarse : hover }));
  await import('./main'); frame(0);
}
beforeEach(async () => { await boot(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('시동 안내 실제 엔트리 포인트 이벤트 연결', () => {
  it('로드만으로 이륙하지 않고 단계 2, 넓은 화면 도움말 열림, QA 읽기 전용', () => {
    tick(2000);
    expect(win.__DRONE_QA!.state()).toMatchObject({ armed: false, throttle: 0, pos: { y: 0.2 } });
    expect(el('startup-guide').dataset.step).toBe('2');
    expect(el('help').open).toBe(true);
    expect(Object.getOwnPropertyDescriptor(win, '__DRONE_QA')).toMatchObject({ writable: false, configurable: false });
    expect(Object.isFrozen(win.__DRONE_QA)).toBe(true);
  });
  it('스로틀 먼저 올리면 ARM 거부, 중앙 알림 2.5초, 막대 흔들기', () => {
    key('ArrowUp'); tick(1000); key('ArrowUp', 'keyup'); key('Space');
    expect(win.__DRONE_QA!.state().armed).toBe(false);
    expect(el('startup-guide').dataset.step).toBe('1');
    expect(el('guide-status').textContent).toContain('지금 45%');
    expect(el('flight-toast').textContent).toContain('스로틀이 45%예요');
    expect(el('throttle-meter').classes.has('shake')).toBe(true);
    tick(2499); expect(el('flight-toast').hidden).toBe(false);
    tick(1); expect(el('flight-toast').hidden).toBe(true);
  });
  it('바닥 이동 알림은 키 반복을 포함해 3초에 한 번만', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']) key(code);
    expect(el('flight-toast').textContent).toBe('먼저 Space로 시동 → ↑로 띄워야 움직여요');
    tick(2500); key('KeyW', 'keydown', true); expect(el('flight-toast').hidden).toBe(true);
    tick(499); key('KeyE'); expect(el('flight-toast').hidden).toBe(true);
    tick(1); key('KeyW', 'keydown', true); expect(el('flight-toast').hidden).toBe(false);
  });
  it('시동 거부 알림은 바닥 이동 입력으로 덮어쓰지 않음', () => {
    key('ArrowUp'); tick(1000); key('ArrowUp', 'keyup'); key('Space'); key('KeyW');
    expect(el('flight-toast').textContent).toContain('시동이 안 걸려요');
  });
  it('시동→이륙 성공 5초 뒤 숨김→ARM 착지 때 재등장→DISARM 및 초기화', () => {
    key('Space'); expect(el('startup-guide').dataset.step).toBe('3');
    key('ArrowUp'); tick(1400); key('ArrowUp', 'keyup');
    for (let n = 0; n < 100 && el('startup-guide').dataset.step !== '4'; n++) tick(16);
    expect(el('startup-guide').dataset.step).toBe('4');
    expect(el('guide-status').textContent).toContain('잘했어요!');
    tick(4999); expect(el('startup-guide').hidden).toBe(false);
    tick(1); expect(el('startup-guide').hidden).toBe(true);
    key('ArrowDown'); tick(1500); key('ArrowDown', 'keyup'); tick(4000);
    expect(win.__DRONE_QA!.state().armed).toBe(true);
    expect(el('startup-guide').hidden).toBe(false);
    expect(el('startup-guide').dataset.step).toBe('3');
    key('KeyQ'); expect(el('flight-toast').hidden).toBe(false);
    key('Space'); expect(el('startup-guide').dataset.step).toBe('2');
    key('Backspace'); expect(el('startup-guide').hidden).toBe(false);
    expect(win.__DRONE_QA!.state()).toMatchObject({ armed: false, throttle: 0, pos: { y: 0.2 } });
  });
  it.each(['blur', 'hidden'])('%s 즉시 안전 정지하고 안내 재등장', kind => {
    key('Space'); key('ArrowUp'); tick(1500);
    if (kind === 'blur') win.dispatchEvent(new Event('blur'));
    else { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    expect(win.__DRONE_QA!.state()).toMatchObject({ armed: false, throttle: 0 });
    expect(el('startup-guide').hidden).toBe(false);
    expect(el('startup-guide').dataset.step).toBe('2');
  });
  it.each([[1099, false], [1100, true]])('화면 폭 %s 도움말 열림 %s', async (width, open) => {
    await boot(width); expect(el('help').open).toBe(open);
  });
  it.each([[true, false, true], [true, true, false], [false, false, false], [false, true, false]])(
    'coarse=%s hover=%s 안내 덮개=%s', async (coarse, hover, shown) => {
      await boot(390, coarse, hover); expect(el('keyboard-overlay').open).toBe(shown);
      if (shown) {
        key('Space'); expect(win.__DRONE_QA!.state().armed).toBe(false);
        el('close-keyboard').dispatchEvent(new Event('click'));
        expect(el('keyboard-overlay').open).toBe(false);
        key('Space'); expect(win.__DRONE_QA!.state().armed).toBe(true);
      }
    });
});
