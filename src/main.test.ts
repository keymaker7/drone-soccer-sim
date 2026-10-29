import { C } from './sim/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./score/view', () => ({ mountScore: () => ({ setActive: vi.fn() }) }));
vi.mock('./tactics/view', () => ({ mountTactics: () => ({ setActive: vi.fn(), refresh: vi.fn() }) }));
const sceneSpies = vi.hoisted(() => ({ draw: vi.fn(), setArena: vi.fn(), resize: vi.fn() }));
vi.mock('./render/scene', () => ({
  CAMERA_NAMES: { 1: 'LOS' },
  createScene: () => ({ mode: 1, draw: sceneSpies.draw, setMode: vi.fn(), setArena: sceneSpies.setArena, resize: sceneSpies.resize }),
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
  style = { transform: '' };
  blur() {}
  closest() { return null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  querySelectorAll() { return steps; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
let steps: Element[];
let elements: Map<string, Element>;
let win: EventTarget & { innerWidth: number; location: {hash: string}; __DRONE_QA?: { state(): { stickMode: 1 | 2; armed: boolean; throttle: number; pos: { x: number; y: number }; arena: {length:number;width:number;height:number}; tab:string } } };
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
async function boot(width = 1440, coarse = false, hover = true, storage = { getItem: vi.fn((_key: string): string | null => null), setItem: vi.fn() }, hash = '') {
  vi.resetModules(); now = 0; frame = () => {};
  steps = [1, 2, 3, 4].map(step => { const item = new Element(); item.dataset.step = String(step); return item; });
  elements = new Map();
  win = Object.assign(new EventTarget(), { innerWidth: width, location: { hash } });
  doc = Object.assign(new EventTarget(), { hidden: false, getElementById(id: string) {
    if (!elements.has(id)) elements.set(id, new Element());
    return el(id);
  } });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc); vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: typeof frame) => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' ? coarse : hover }));
  await import('./main'); frame(0);
}
beforeEach(async () => { await boot(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('시동 안내 실제 엔트리 포인트 이벤트 연결', () => {
  it('로드만으로 이륙하지 않고 단계 2, 넓은 화면 도움말 열림, QA 읽기 전용', () => {
    tick(2000);
    expect(win.__DRONE_QA!.state()).toMatchObject({ armed: false, throttle: 0, pos: { y: C.start.y } });
    expect(el('startup-guide').dataset.step).toBe('2');
    expect(el('help').open).toBe(true);
    expect(Object.getOwnPropertyDescriptor(win, '__DRONE_QA')).toMatchObject({ writable: false, configurable: false });
    expect(Object.isFrozen(win.__DRONE_QA)).toBe(true);
  });
  it('스로틀 먼저 올리면 ARM 거부, 중앙 알림 2.5초, 막대 흔들기', () => {
    key('KeyW'); tick(1000); key('KeyW', 'keyup'); key('Space');
    expect(win.__DRONE_QA!.state().armed).toBe(false);
    expect(el('startup-guide').dataset.step).toBe('1');
    expect(el('guide-status').textContent).toContain(`지금 ${49}%`);
    expect(el('flight-toast').textContent).toContain(`스로틀이 ${49}%예요`);
    expect(el('throttle-meter').classes.has('shake')).toBe(true);
    tick(2499); expect(el('flight-toast').hidden).toBe(false);
    tick(1); expect(el('flight-toast').hidden).toBe(true);
  });
  it('바닥 이동 알림은 키 반복을 포함해 3초에 한 번만', () => {
    for (const code of ['ArrowUp', 'KeyA', 'ArrowDown', 'KeyD', 'ArrowLeft', 'ArrowRight']) key(code);
    expect(el('flight-toast').textContent).toBe('먼저 Space로 시동 → W로 띄워야 움직여요');
    tick(2500); key('ArrowUp', 'keydown', true); expect(el('flight-toast').hidden).toBe(true);
    tick(499); key('ArrowRight'); expect(el('flight-toast').hidden).toBe(true);
    tick(1); key('ArrowUp', 'keydown', true); expect(el('flight-toast').hidden).toBe(false);
  });
  it('시동 거부 알림은 바닥 이동 입력으로 덮어쓰지 않음', () => {
    key('KeyW'); tick(1000); key('KeyW', 'keyup'); key('Space'); key('KeyW');
    expect(el('flight-toast').textContent).toContain('시동이 안 걸려요');
  });
  it('시동→이륙 성공 5초 뒤 숨김→ARM 착지 때 재등장→DISARM 및 초기화', () => {
    key('Space'); expect(el('startup-guide').dataset.step).toBe('3');
    key('KeyW'); tick(1500); key('KeyW', 'keyup');
    for (let n = 0; n < 100 && el('startup-guide').dataset.step !== '4'; n++) tick(16);
    expect(el('startup-guide').dataset.step).toBe('4');
    expect(el('guide-status').textContent).toContain('잘했어요!');
    tick(4999); expect(el('startup-guide').hidden).toBe(false);
    tick(1); expect(el('startup-guide').hidden).toBe(true);
    key('KeyS'); tick(1500); key('KeyS', 'keyup'); tick(4000);
    expect(win.__DRONE_QA!.state().armed).toBe(true);
    expect(el('startup-guide').hidden).toBe(false);
    expect(el('startup-guide').dataset.step).toBe('3');
    key('KeyA'); expect(el('flight-toast').hidden).toBe(false);
    key('Space'); expect(el('startup-guide').dataset.step).toBe('2');
    key('Backspace'); expect(el('startup-guide').hidden).toBe(false);
    expect(win.__DRONE_QA!.state()).toMatchObject({ armed: false, throttle: 0, pos: { y: C.start.y } });
  });
  it.each(['blur', 'hidden'])('%s 즉시 안전 정지하고 안내 재등장', kind => {
    key('Space'); key('KeyW'); tick(1500);
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

describe('FIX-2 UI 및 Shift 키 연결', () => {
  it('부제는 실제 경기장 치수를 표시', () => {
    expect(el('arena-subtitle').textContent).toBe(`연습 경기장 ${C.arena.halfLength * 2} × ${C.arena.halfWidth * 2} m`);
  });
  it.each(['ShiftLeft', 'ShiftRight'])('%s 누름/해제가 즉시 미세/일반 스로틀로 전환', shift => {
    key(shift); key('KeyW'); tick(1000);
    expect(win.__DRONE_QA!.state().throttle).toBeCloseTo(0.0752, 8);
    key(shift, 'keyup'); tick(500);
    expect(win.__DRONE_QA!.state().throttle).toBeCloseTo(0.42504, 8);
    key('KeyW', 'keyup'); key(shift); key('KeyS'); tick(1000);
    expect(win.__DRONE_QA!.state().throttle).toBeCloseTo(0.34984, 8);
    win.dispatchEvent(new Event('blur'));
    key('KeyW'); tick(500);
    expect(win.__DRONE_QA!.state().throttle).toBeCloseTo(0.396, 8);
    expect(win.__DRONE_QA!.state().armed).toBe(false);
  });
});

describe('FIX-4 모드 전환 및 실제 HUD 연결', () => {
  it('기본 모드 2, 스틱 좌표와 유지/복귀', () => {
    expect(win.__DRONE_QA!.state().stickMode).toBe(2);
    expect(el('mode-2').attributes.get('aria-pressed')).toBe('true');
    expect(el('left-stick').style.transform).toBe('translate(0px, 22px)');
    key('KeyW'); tick(1000); key('KeyW', 'keyup'); tick(16);
    const throttle = win.__DRONE_QA!.state().throttle;
    const left = el('left-stick').style.transform;
    tick(1000);
    expect(win.__DRONE_QA!.state().throttle).toBe(throttle);
    expect(el('left-stick').style.transform).toBe(left);
    key('ArrowUp'); key('ArrowRight'); tick(16);
    expect(el('right-stick').style.transform).toBe('translate(22px, -22px)');
    key('ArrowUp', 'keyup'); key('ArrowRight', 'keyup'); tick(16);
    expect(el('right-stick').style.transform).toBe('translate(0px, 0px)');
    key('KeyA'); tick(16);
    expect(el('left-stick').style.transform).toContain('translate(-22px,');
  });
  it('M 전환은 키 초기화·스로틀 유지·문구 갱신·저장, 키 반복 무시', () => {
    key('KeyW'); tick(300);
    const before = win.__DRONE_QA!.state().throttle;
    key('KeyM'); tick(200);
    expect(win.__DRONE_QA!.state()).toMatchObject({ stickMode: 1, throttle: before });
    expect(localStorage.setItem).toHaveBeenCalledWith('drone-soccer-stick-mode', '1');
    expect(el('throttle-keys').textContent).toBe('↑ / ↓');
    expect(el('pitch-keys').textContent).toBe('W / S');
    expect(el('guide-down').textContent).toBe('↓');
    expect(el('guide-up').textContent).toBe('↑');
    expect(el('guide-tilt').textContent).toBe('W/S · ←/→');
    expect(el('left-stick-label').textContent).toBe('왼쪽 스틱 · 피치/요');
    expect(el('right-stick-label').textContent).toBe('오른쪽 스틱 · 스로틀/롤');
    expect(el('left-stick').style.transform).toBe('translate(0px, 0px)');
    key('KeyM', 'keydown', true);
    expect(win.__DRONE_QA!.state().stickMode).toBe(1);
    key('ArrowUp'); tick(300); key('ArrowUp', 'keyup'); tick(16);
    expect(win.__DRONE_QA!.state().throttle).toBeGreaterThan(before);
    expect(el('right-stick').style.transform).not.toBe('translate(0px, 0px)');
    key('Space');
    expect(el('flight-toast').textContent).toContain('↓를 꾹');
    el('mode-2').dispatchEvent(new Event('click'));
    expect(el('flight-toast').hidden).toBe(true);
    expect(el('guide-down').textContent).toBe('S');
  });
  it.each(['key', 'button'])('ARM 중 %s 모드 변경 차단, DISARM 후 허용', method => {
    key('Space');
    if (method === 'key') key('KeyM');
    else el('mode-1').dispatchEvent(new Event('click'));
    expect(win.__DRONE_QA!.state()).toMatchObject({ stickMode: 2, armed: true });
    expect(el('flight-toast').textContent).toBe('착륙·시동 끈 뒤 바꿔요');
    expect(localStorage.setItem).not.toHaveBeenCalled();
    key('Space'); el('mode-1').dispatchEvent(new Event('click'));
    expect(win.__DRONE_QA!.state().stickMode).toBe(1);
    key('Backspace');
    expect(win.__DRONE_QA!.state()).toMatchObject({ stickMode: 1, throttle: 0, armed: false });
  });
  it.each(['1', '2', 'invalid', null])('저장 값 %s 복원 및 잘못된 값은 기본값', async stored => {
    await boot(1440, false, true, { getItem: vi.fn(() => stored), setItem: vi.fn() });
    expect(win.__DRONE_QA!.state().stickMode).toBe(stored === '1' ? 1 : 2);
  });
  it('저장소 읽기/쓰기 실패에도 정상 동작', async () => {
    await boot(1440, false, true, {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    });
    expect(win.__DRONE_QA!.state().stickMode).toBe(2);
    key('KeyM');
    expect(win.__DRONE_QA!.state().stickMode).toBe(1);
    key('Space'); key('ArrowUp'); tick(1500); key('ArrowUp', 'keyup');
    expect(win.__DRONE_QA!.state().pos.y).toBeGreaterThan(C.start.y);
    win.dispatchEvent(new Event('blur'));
    expect(win.__DRONE_QA!.state()).toMatchObject({ stickMode: 1, throttle: 0, armed: false });
  });
  it('Q/E는 입력과 바닥 안내를 발생시키지 않음', () => {
    key('KeyQ'); key('KeyE'); tick(16);
    expect(el('flight-toast').textContent).toBe('');
    expect(win.__DRONE_QA!.state()).toMatchObject({ throttle: 0, stickMode: 2 });
  });
});


describe('FIX-5 탭 안전과 맵 통합', () => {
  function navigate(hash: string) { win.location.hash = hash; win.dispatchEvent(new Event('hashchange')); }
  it('비행 탭을 떠나면 즉시 안전 정지, 키와 렌더 중단, 복귀해도 자동 재시동 없음', () => {
    key('Space'); key('KeyW'); tick(1500);
    expect(win.__DRONE_QA!.state().armed).toBe(true);
    navigate('#score');
    expect(win.__DRONE_QA!.state()).toMatchObject({tab:'score', armed:false, throttle:0});
    expect(cancelAnimationFrame).toHaveBeenCalled();
    const calls = sceneSpies.draw.mock.calls.length;
    key('Space'); key('KeyW'); tick(1000);
    expect(sceneSpies.draw.mock.calls.length).toBe(calls);
    expect(win.__DRONE_QA!.state()).toMatchObject({armed:false, throttle:0});
    navigate('#fly'); tick(16);
    expect(win.__DRONE_QA!.state()).toMatchObject({tab:'fly', armed:false, throttle:0});
  });
  it('탭 클릭 자체에서 hashchange 이전에 DISARM', () => {
    key('Space'); el('tab-tactics').dispatchEvent(new Event('click'));
    expect(win.__DRONE_QA!.state()).toMatchObject({tab:'tactics', armed:false, throttle:0});
  });
  it('N과 버튼으로 3개 맵 전환, ARM 차단과 출발점/크기/저장 일치', () => {
    expect(win.__DRONE_QA!.state().arena).toEqual({length:24,width:10.5,height:6});
    key('Space'); key('KeyN');
    expect(el('flight-toast').textContent).toBe('착륙·시동 끈 뒤 바꿔요');
    expect(win.__DRONE_QA!.state().arena.length).toBe(24);
    key('Space'); key('KeyN');
    expect(win.__DRONE_QA!.state()).toMatchObject({arena:{length:32,width:14,height:6},pos:{x:-13.5},armed:false,throttle:0});
    key('KeyN');
    expect(win.__DRONE_QA!.state()).toMatchObject({arena:{length:16,width:7,height:4.5},pos:{x:-5.5}});
    el('map-practice').dispatchEvent(new Event('click'));
    expect(localStorage.setItem).toHaveBeenLastCalledWith('drone-soccer-arena','practice');
    expect(sceneSpies.setArena).toHaveBeenCalled();
  });
  it.each(['#score','#tactics'])('직접 진입 %s 는 폰 덮개 없이 열리고 비행 키를 무시', async hash => {
    await boot(390,true,false,{getItem:vi.fn(() => null),setItem:vi.fn()},hash);
    expect(el('keyboard-overlay').open).toBe(false);
    key('Space'); key('KeyW'); tick(100);
    expect(win.__DRONE_QA!.state()).toMatchObject({tab:hash.slice(1),armed:false,throttle:0});
    expect(el('app').hidden).toBe(true);
  });
  it('맵 저장 값을 복원하고 잘못된 값은 기본 맵', async () => {
    await boot(1440,false,true,{getItem:vi.fn(key => key === 'drone-soccer-arena' ? 'official' : null),setItem:vi.fn()});
    expect(win.__DRONE_QA!.state().arena.length).toBe(16);
    const snapshot = win.__DRONE_QA!.state(); snapshot.arena.length = 1000;
    expect(win.__DRONE_QA!.state().arena.length).toBe(16);
  });
});
