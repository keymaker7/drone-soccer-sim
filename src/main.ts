import './style.css';
import { C, DEG } from './sim/constants';
import { createFlight, stepFlight } from './sim/flight';
import { createInput, loseFocus, toggleArm } from './sim/input';
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
let view: ReturnType<typeof createScene>;
try { view = createScene(element('app')); }
catch (error) {
  const alert = element('scene-error'); alert.hidden = false;
  alert.textContent = '3D 화면을 시작할 수 없습니다. WebGL을 지원하는 브라우저에서 다시 열어 주세요.';
  throw error;
}
const keys = new Set(['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'Digit5']);
function renderHud() {
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
  e.preventDefault();
  if (document.hidden) return;
  input.keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') {
    const allowed = toggleArm(input);
    notice.textContent = !allowed ? 'ARM 거부: ↓로 스로틀을 5% 이하로 낮추세요.' : input.armed ? '모터 켜짐 · ↑로 스로틀을 천천히 올리세요.' : '모터 꺼짐 · 스로틀 값은 유지됩니다.';
  }
  if (e.code === 'Backspace') {
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
