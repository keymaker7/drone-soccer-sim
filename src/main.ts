import './style.css';
import { DEG } from './sim/constants';
import { createFlight, stepFlight } from './sim/flight';
import { createInput, loseFocus, toggleArm } from './sim/input';
import { guideStep, needsTakeoff } from './sim/guide';
import { createFixedClock } from './sim/clock';
import { CAMERA_NAMES, createScene, type CameraMode } from './render/scene';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = createInput();
let flight = createFlight();
const clock = createFixedClock(dt => stepFlight(flight, input, dt));
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
  const message = step === 1 ? `지금 ${percent}% · ↓를 꾹 눌러 0%로 내려요`
    : step === 2 ? 'Space를 눌러 시동을 걸어요'
    : step === 3 ? `지금 ${percent}% / 55% · ↑를 꾹 눌러 띄워요`
    : '잘했어요! W/A/S/D로 기울여 보세요';
  if (guideStatus.textContent !== message) guideStatus.textContent = message;
  if (now >= toastUntil) toast.hidden = true;
  if (now >= refusalUntil) meter.classList.remove('shake');
}
element('close-keyboard').addEventListener('click', () => keyboardOverlay.close());
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches) keyboardOverlay.showModal();
let view: ReturnType<typeof createScene>;
try { view = createScene(element('app')); }
catch (error) {
  const alert = element('scene-error'); alert.hidden = false;
  alert.textContent = '3D 화면을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.';
  throw error;
}
const keys = new Set(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'Digit5']);
function renderHud() {
  renderGuide();
  arm.textContent = input.armed ? 'ARM · 모터 켜짐' : 'DISARM · 모터 꺼짐';
  arm.classList.toggle('armed', input.armed);
  throttle.textContent = `${Math.round(input.throttle * 100)}%`; meter.value = input.throttle * 100;
  tilt.textContent = `${(flight.roll * DEG).toFixed(1)}° / ${(flight.pitch * DEG).toFixed(1)}°`;
  speed.textContent = `${Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z).toFixed(2)} m/s`;
  altitude.textContent = `${flight.pos.y.toFixed(2)} m`;
  cameraLabel.textContent = CAMERA_NAMES[view.mode];
}
window.addEventListener('keydown', e => {
  if (!keys.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (keyboardOverlay.open || (e.target instanceof HTMLElement && e.target.closest('button, summary'))) return;
  e.preventDefault();
  if (document.hidden) return;
  input.keys.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)
    && needsTakeoff({ armed: input.armed, throttle: input.throttle, altitude: flight.pos.y })
    && performance.now() - lastGroundHint >= 3000 && performance.now() >= refusalUntil) {
    showToast('먼저 Space로 시동 → ↑로 띄워야 움직여요');
    lastGroundHint = performance.now();
  }
  if (e.repeat) return;
  if (e.code === 'Space') {
    const allowed = toggleArm(input);
    if (!allowed) showToast(`시동이 안 걸려요 · 스로틀이 ${Math.round(input.throttle * 100)}%예요 · ↓를 꾹 눌러 0%로 내린 뒤 Space`, true);
    else { toastUntil = 0; refusalUntil = 0; }
    notice.textContent = !allowed ? 'ARM 거부: ↓로 스로틀을 5% 이하로 낮추세요.' : input.armed ? '모터 켜짐 · ↑로 스로틀을 천천히 올리세요.' : '모터 꺼짐 · 스로틀 값은 유지됩니다.';
  }
  if (e.code === 'Backspace') {
    successAt = undefined; toastUntil = 0; refusalUntil = 0; lastGroundHint = -Infinity;
    loseFocus(input); flight = createFlight(); clock.reset(); notice.textContent = '출발점 초기화 · 스로틀 0% · DISARM';
  }
  const mode = Number(e.code.replace('Digit', ''));
  if ([1, 2, 3, 5].includes(mode)) view.setMode(mode as CameraMode);
  renderHud();
});
window.addEventListener('keyup', e => {
  if (keys.has(e.code)) { e.preventDefault(); input.keys.delete(e.code); }
});
function safetyStop() {
  toastUntil = 0; refusalUntil = 0;
  loseFocus(input); clock.reset(); notice.textContent = '포커스 상실 · 안전 정지 · 다시 Space로 ARM'; renderHud();
}
window.addEventListener('blur', safetyStop);
document.addEventListener('visibilitychange', () => { if (document.hidden) safetyStop(); });
const qa = Object.freeze({ state: () => ({
  armed: input.armed, throttle: input.throttle, pos: { ...flight.pos }, vel: { ...flight.vel },
  rollDeg: flight.roll * DEG, pitchDeg: flight.pitch * DEG, yawDeg: flight.yaw * DEG, camera: view.mode,
}) });
Object.defineProperty(window, '__DRONE_QA', { value: qa, writable: false, configurable: false });
let lastTime: number | undefined;
function frame(time: number) {
  const elapsed = lastTime === undefined ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  if (!document.hidden) clock.advance(elapsed);
  renderHud(); view.draw(flight); requestAnimationFrame(frame);
}
renderHud(); requestAnimationFrame(frame);
