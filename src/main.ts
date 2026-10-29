import './style.css';
import { axesFromKeys, type StickMode } from './sim/keymap';
import { DEG, ARENA_PRESETS, type Arena } from './sim/constants';
import { createFlight, stepFlight } from './sim/flight';
import { createInput, loseFocus, releaseKey, toggleArm } from './sim/input';
import { guideStep, needsTakeoff } from './sim/guide';
import { createFixedClock } from './sim/clock';
import { CAMERA_NAMES, createScene, type CameraMode } from './render/scene';

import { mountScore } from './score/view';
import { mountTactics } from './tactics/view';
import { mountNet } from './net/view';

type Tab = 'fly' | 'net' | 'score' | 'tactics';
const tabFromHash = (): Tab => window.location.hash === '#net' || window.location.hash.startsWith('#join=') ? 'net' : window.location.hash === '#score' ? 'score' : window.location.hash === '#tactics' ? 'tactics' : 'fly';
let tab: Tab = tabFromHash();
type MapId = keyof typeof ARENA_PRESETS;
const mapIds: MapId[] = ['official', 'practice', 'large'];
let mapId: MapId = 'practice';
try {
  const stored = localStorage.getItem('drone-soccer-arena');
  if (mapIds.includes(stored as MapId)) mapId = stored as MapId;
} catch { /* Default practice arena remains available. */ }
let arena: Arena = ARENA_PRESETS[mapId].arena;
const arenaSize = () => ({ length: arena.halfLength * 2, width: arena.halfWidth * 2, height: arena.height });
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const input = createInput();
const modeStorageKey = 'drone-soccer-stick-mode';
try { if (localStorage.getItem(modeStorageKey) === '1') input.stickMode = 1; } catch { /* Storage can be unavailable. */ }
const throttleUp = () => input.stickMode === 2 ? 'W' : '↑';
const throttleDown = () => input.stickMode === 2 ? 'S' : '↓';
const tiltKeys = () => input.stickMode === 2 ? '방향키' : 'W/S · ←/→';
let flight = createFlight(arena);
const clock = createFixedClock(dt => stepFlight(flight, input, dt, arena));
const notice = element('notice');
const arm = element('arm');
const throttle = element('throttle');
const meter = element<HTMLMeterElement>('throttle-meter');
const tilt = element('tilt');
const speed = element('speed');
const altitude = element('altitude');
const cameraLabel = element('camera');
const guide = element('startup-guide');
const guideStatus = element('guide-status');
const guideProgress = element('guide-progress');
const guideItems = [...guide.querySelectorAll<HTMLElement>('[data-step]')];
const toast = element('flight-toast');
const keyboardOverlay = element<HTMLDialogElement>('keyboard-overlay');
element<HTMLDetailsElement>('help').open = window.innerWidth >= 1100;
let successAt: number | undefined;
let toastUntil = 0;
let refusalUntil = 0;
let lastGroundHint = -Infinity;
function showToast(message: string, refusal = false) {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.toggle('refusal', refusal);
  toastUntil = performance.now() + 2500;
  if (refusal) {
    refusalUntil = toastUntil;
    meter.classList.remove('shake');
    void meter.offsetWidth;
    meter.classList.add('shake');
  }
}
function renderGuide() {
  const now = performance.now();
  const state = { armed: input.armed, throttle: input.throttle, altitude: flight.pos.y };
  const step = guideStep(state);
  if (needsTakeoff(state)) successAt = undefined;
  if (step === 4 && successAt === undefined) successAt = now;
  guide.hidden = successAt !== undefined && now - successAt >= 5000;
  guide.dataset.step = String(step);
  guideProgress.textContent = `0${step} / 04`;
  for (const item of guideItems) {
    const active = Number(item.dataset.step) === step;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  }
  const percent = Math.round(input.throttle * 100);
  const message = step === 1 ? `지금 ${percent}% · ${throttleDown()}를 꾹 눌러 0%로 내려요`
    : step === 2 ? 'Space를 눌러 시동을 걸어요'
    : step === 3 ? `지금 ${percent}% / 55% · ${throttleUp()}를 꾹 눌러 띄워요`
    : `잘했어요! ${tiltKeys()}로 기울여 보세요`;
  if (guideStatus.textContent !== message) guideStatus.textContent = message;
  if (now >= toastUntil) toast.hidden = true;
  if (now >= refusalUntil) meter.classList.remove('shake');
}
element('close-keyboard').addEventListener('click', () => keyboardOverlay.close());
let keyboardAcknowledged = false;
element('close-keyboard').addEventListener('click', () => { keyboardAcknowledged = true; });
let view: ReturnType<typeof createScene> | undefined;
function ensureScene() {
  if (view) { view.resize(); return; }
  try { view = createScene(element('app'), arena); }
  catch {
    const alert = element('scene-error'); alert.hidden = false;
    alert.textContent = '3D 화면을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요. 스코어판·전술판은 사용할 수 있어요.';
  }
}
const keys = new Set(['ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyM', 'KeyN', 'Space', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'Digit5']);
function renderHud() {
  renderGuide();
  const axes = axesFromKeys(input.keys, input.stickMode);
  const leftY = input.stickMode === 2 ? 1 - input.throttle * 2 : axes.pitch;
  const rightY = input.stickMode === 1 ? 1 - input.throttle * 2 : axes.pitch;
  element('left-stick').style.transform = `translate(${-axes.yaw * 22}px, ${leftY * 22}px)`;
  element('right-stick').style.transform = `translate(${axes.roll * 22}px, ${rightY * 22}px)`;
  arm.textContent = input.armed ? 'ARM · 모터 켜짐' : 'DISARM · 모터 꺼짐';
  arm.classList.toggle('armed', input.armed);
  throttle.textContent = `${Math.round(input.throttle * 100)}%`; meter.value = input.throttle * 100;
  tilt.textContent = `${(flight.roll * DEG).toFixed(1)}° / ${(flight.pitch * DEG).toFixed(1)}°`;
  speed.textContent = `${Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z).toFixed(2)} m/s`;
  altitude.textContent = `${flight.pos.y.toFixed(2)} m`;
  cameraLabel.textContent = CAMERA_NAMES[view?.mode ?? 1];
}
function renderMode() {
  for (const mode of [1, 2] as const) element(`mode-${mode}`).setAttribute('aria-pressed', String(input.stickMode === mode));
  element('throttle-keys').textContent = `${throttleUp()} / ${throttleDown()}`;
  element('pitch-keys').textContent = input.stickMode === 2 ? '↑ / ↓' : 'W / S';
  element('guide-down').textContent = throttleDown();
  element('guide-up').textContent = throttleUp();
  element('guide-tilt').textContent = tiltKeys();
  element('takeoff-help').textContent = `ARM 후 ${throttleUp()}로 약 55%까지 올리면 떠오릅니다.`;
  element('left-stick-label').textContent = `왼쪽 스틱 · ${input.stickMode === 2 ? '스로틀' : '피치'}/요`;
  element('right-stick-label').textContent = `오른쪽 스틱 · ${input.stickMode === 1 ? '스로틀' : '피치'}/롤`;
}
function changeStickMode(mode: StickMode) {
  if (input.armed) { showToast('착륙·시동 끈 뒤 바꿔요'); return; }
  if (input.stickMode === mode) return;
  input.stickMode = mode;
  input.keys.clear(); input.throttleDirection = 0; input.throttleHeldSeconds = 0;
  try { localStorage.setItem(modeStorageKey, String(mode)); } catch { /* Session selection still works. */ }
  toastUntil = 0; refusalUntil = 0; lastGroundHint = -Infinity;
  notice.textContent = `모드 ${mode} · 스로틀 ${throttleDown()}로 내림 / ${throttleUp()}로 올림`;
  renderMode(); renderHud();
}
for (const mode of [1, 2] as const) element(`mode-${mode}`).addEventListener('click', () => {
  changeStickMode(mode);
  // Return flight shortcuts to the page after clicking the toggle.
  element(`mode-${mode}`).blur();
});
renderMode();
window.addEventListener('keydown', e => {
  if (tab !== 'fly') return;
  if (!keys.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (keyboardOverlay.open || (e.target instanceof HTMLElement && e.target.closest('button, summary, a, input, textarea, select, [contenteditable]'))) return;
  e.preventDefault();
  if (document.hidden) return;
  input.keys.add(e.code);
  if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', ...(input.stickMode === 2 ? ['ArrowUp', 'ArrowDown'] : ['KeyW', 'KeyS'])].includes(e.code)
    && needsTakeoff({ armed: input.armed, throttle: input.throttle, altitude: flight.pos.y })
    && performance.now() - lastGroundHint >= 3000 && performance.now() >= refusalUntil) {
    showToast(`먼저 Space로 시동 → ${throttleUp()}로 띄워야 움직여요`);
    lastGroundHint = performance.now();
  }
  if (e.repeat) return;
  if (e.code === 'KeyN') changeMap(mapIds[(mapIds.indexOf(mapId) + 1) % mapIds.length]);
  if (e.code === 'KeyM') changeStickMode(input.stickMode === 2 ? 1 : 2);
  if (e.code === 'Space') {
    const allowed = toggleArm(input);
    if (!allowed) showToast(`시동이 안 걸려요 · 스로틀이 ${Math.round(input.throttle * 100)}%예요 · ${throttleDown()}를 꾹 눌러 0%로 내린 뒤 Space`, true);
    else { toastUntil = 0; refusalUntil = 0; }
    notice.textContent = !allowed ? `ARM 거부: ${throttleDown()}로 스로틀을 5% 이하로 낮추세요.` : input.armed ? `모터 켜짐 · ${throttleUp()}로 스로틀을 천천히 올리세요.` : '모터 꺼짐 · 스로틀 값은 유지됩니다.';
  }
  if (e.code === 'Backspace') {
    successAt = undefined; toastUntil = 0; refusalUntil = 0; lastGroundHint = -Infinity;
    loseFocus(input); flight = createFlight(arena); clock.reset(); notice.textContent = '출발점 초기화 · 스로틀 0% · DISARM';
  }
  const mode = Number(e.code.replace('Digit', ''));
  if ([1, 2, 3, 5].includes(mode)) view?.setMode(mode as CameraMode);
  renderHud();
});
window.addEventListener('keyup', e => {
  if (tab === 'fly' && keys.has(e.code)) { e.preventDefault(); releaseKey(input, e.code); }
});
function safetyStop() {
  toastUntil = 0; refusalUntil = 0;
  loseFocus(input); clock.reset(); notice.textContent = '포커스 상실 · 안전 정지 · 다시 Space로 ARM'; renderHud();
}
window.addEventListener('blur', safetyStop);
document.addEventListener('visibilitychange', () => { if (document.hidden) safetyStop(); });
const qa = Object.freeze({ state: () => ({
  stickMode: input.stickMode, armed: input.armed, throttle: input.throttle, pos: { ...flight.pos }, vel: { ...flight.vel },
  net: netView.state(),
  rollDeg: flight.roll * DEG, pitchDeg: flight.pitch * DEG, yawDeg: flight.yaw * DEG, camera: view?.mode ?? 1, arena: arenaSize(), tab,
}) });
Object.defineProperty(window, '__DRONE_QA', { value: qa, writable: false, configurable: false });
const netView = mountNet(element('net-root'));
const scoreView = mountScore(element('score-root'));
const tacticsView = mountTactics(element('tactics-root'), arenaSize);
function renderMap() {
  for (const id of mapIds) element(`map-${id}`).setAttribute('aria-pressed', String(mapId === id));
  const name = mapId === 'practice' ? '연습 경기장' : mapId === 'official' ? '실제 규격 경기장' : '큰 경기장';
  element('arena-subtitle').textContent = `${name} ${arena.halfLength * 2} × ${arena.halfWidth * 2} m`;
}
function changeMap(next: MapId) {
  if (tab !== 'fly') return;
  if (input.armed) { showToast('착륙·시동 끈 뒤 바꿔요'); return; }
  if (mapId === next) return;
  loseFocus(input); clock.reset();
  mapId = next; arena = ARENA_PRESETS[next].arena;
  flight = createFlight(arena); view?.setArena(arena);
  successAt = undefined; toastUntil = 0; refusalUntil = 0; lastGroundHint = -Infinity;
  try { localStorage.setItem('drone-soccer-arena', next); } catch { /* Keep selection for this session. */ }
  notice.textContent = '경기장 변경 · 출발점으로 이동 · 스로틀 0% · DISARM';
  renderMap(); renderHud(); tacticsView.refresh();
}
for (const id of mapIds) element(`map-${id}`).addEventListener('click', () => {
  changeMap(id); element(`map-${id}`).blur();
});
let lastTime: number | undefined;
let frameId: number | undefined;
function stopFrames() {
  if (frameId !== undefined) cancelAnimationFrame(frameId);
  frameId = undefined; lastTime = undefined; clock.reset();
}
function startFrames() {
  if (tab === 'fly' && !document.hidden && frameId === undefined) frameId = requestAnimationFrame(frame);
}
function frame(time: number) {
  frameId = undefined;
  if (tab !== 'fly' || document.hidden) return;
  const elapsed = lastTime === undefined ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  clock.advance(elapsed);
  renderHud(); view?.draw(flight, elapsed); startFrames();
}
function selectTab(next: Tab) {
  if (tab === 'fly' && next !== 'fly') safetyStop();
  stopFrames(); tab = next;
  element('app').hidden = next !== 'fly';
  element('net-panel').hidden = next !== 'net';
  netView.setActive(next === 'net');
  element('score-panel').hidden = next !== 'score';
  element('tactics-panel').hidden = next !== 'tactics';
  for (const name of ['fly', 'net', 'score', 'tactics'] as const) {
    if (next === name) element(`tab-${name}`).setAttribute('aria-current', 'page');
    else element(`tab-${name}`).removeAttribute('aria-current');
  }
  scoreView.setActive(next === 'score'); tacticsView.setActive(next === 'tactics');
  if (next === 'fly') {
    ensureScene(); renderHud(); startFrames();
    if (!keyboardAcknowledged && matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches && !keyboardOverlay.open) keyboardOverlay.showModal();
  } else if (keyboardOverlay.open) keyboardOverlay.close();
}
window.addEventListener('hashchange', () => selectTab(tabFromHash()));
// Stop motors synchronously on navigation click, before the hashchange task runs.
for (const name of ['fly', 'net', 'score', 'tactics'] as const) element(`tab-${name}`).addEventListener('click', () => selectTab(name));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopFrames(); else startFrames(); });
window.addEventListener('storage', e => {
  if (e.key !== 'drone-soccer-arena' || !mapIds.includes(e.newValue as MapId) || input.armed) return;
  mapId = e.newValue as MapId; arena = ARENA_PRESETS[mapId].arena;
  loseFocus(input); flight = createFlight(arena); clock.reset(); view?.setArena(arena);
  renderMap(); renderHud(); tacticsView.refresh();
});
renderMap(); selectTab(tab);
