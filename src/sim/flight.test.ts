import { describe, expect, it } from 'vitest';
import { C, DEG } from './constants';
import { acceleration, createFlight, stepFlight } from './flight';
import { createInput, loseFocus, readInput, toggleArm } from './input';
import { createFixedClock } from './clock';

function airborne(throttle: number = C.hoverThrottle, armed = true) {
  const state = createFlight(); state.pos = { x: 0, y: 2, z: 0 };
  const input = createInput(); input.armed = armed; input.throttle = throttle; input.motorThrottle = armed ? throttle : 0;
  return { state, input };
}
function run(seconds: number, fn: () => void) { for (let n = 0; n < Math.round(seconds / C.step); n++) fn(); }

describe('비행 모델', () => {
  it('55% 호버에서 수직 가속도 절댓값 0.3 m/s² 미만', () => {
    const { state, input } = airborne();
    expect(Math.abs(acceleration(state, input).y)).toBeLessThan(0.3);
    run(1, () => stepFlight(state, input, C.step)); expect(state.pos.y).toBeCloseTo(2, 8);
  });
  it('100% 상승, 0% 및 DISARM에서 낙하', () => {
    for (const [throttle, armed, direction] of [[1, true, 1], [0, true, -1], [1, false, -1]] as const) {
      const { state, input } = airborne(throttle, armed);
      run(0.2, () => stepFlight(state, input, C.step));
      expect((state.pos.y - 2) * direction).toBeGreaterThan(0);
      expect(state.vel.y * direction).toBeGreaterThan(0);
    }
  });
  it('최대 피치 35° 이하, 스틱 해제 후 2초 이내 3° 이내 복원', () => {
    const { state, input } = airborne(); input.keys.add('ArrowUp');
    run(3, () => { stepFlight(state, input, C.step); expect(Math.abs(state.pitch) * DEG).toBeLessThanOrEqual(35 + 1e-8); });
    expect(Math.abs(state.pitch) * DEG).toBeGreaterThan(34);
    input.keys.clear(); run(2, () => stepFlight(state, input, C.step));
    expect(Math.abs(state.pitch) * DEG).toBeLessThan(3);
  });
  it('↑는 전진 +x, →는 오른쪽 +z, A는 왼쪽 요 회전', () => {
    for (const [key, axis] of [['ArrowUp', 'x'], ['ArrowRight', 'z']] as const) {
      const { state, input } = airborne(); input.keys.add(key);
      run(0.5, () => stepFlight(state, input, C.step)); expect(state.vel[axis]).toBeGreaterThan(0);
    }
    const { state, input } = airborne(); input.keys.add('KeyA');
    stepFlight(state, input, C.step); expect(state.yaw).toBeGreaterThan(0);
  });
  it('대각선 입력과 방향 전환에서도 전체 기울기 35° 이하', () => {
    const { state, input } = airborne();
    for (const keys of [['ArrowUp'], ['ArrowUp', 'ArrowRight'], ['ArrowDown', 'ArrowLeft'], ['ArrowRight']]) {
      input.keys = new Set(keys);
      run(2, () => {
        stepFlight(state, input, C.step);
        expect(Math.acos(Math.cos(state.pitch) * Math.cos(state.roll)) * DEG).toBeLessThanOrEqual(35 + 1e-8);
      });
    }
  });
  it('6개 경계 고속 충돌 후 반지름을 포함해 경기장 안에 유지', () => {
    const bounds = {
      x: [-C.arena.halfLength + C.radius, C.arena.halfLength - C.radius],
      y: [C.radius, C.arena.height - C.radius],
      z: [-C.arena.halfWidth + C.radius, C.arena.halfWidth - C.radius],
    };
    for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
      const { state, input } = airborne(0, false); state.vel[axis] = sign * 10000;
      stepFlight(state, input, C.step);
      expect(state.vel[axis] * sign).toBeLessThan(0);
      run(2, () => {
        stepFlight(state, input, C.step);
        for (const a of ['x', 'y', 'z'] as const) {
          expect(state.pos[a]).toBeGreaterThanOrEqual(bounds[a][0]); expect(state.pos[a]).toBeLessThanOrEqual(bounds[a][1]);
        }
      });
    }
  });
});
describe('입력 및 ARM 안전 규칙', () => {
  it('첫 로드 상태는 DISARM, 스로틀 0이고 이륙하지 않음', () => {
    const input = createInput(), state = createFlight();
    expect(input.armed).toBe(false); expect(input.throttle).toBe(0);
    run(5, () => stepFlight(state, input, C.step)); expect(state.pos).toEqual(C.start);
  });
  it('5% 초과 ARM 거부, 5% 이하 ARM 허용, DISARM은 항상 허용', () => {
    for (const value of [0, 0.05, 0.050001, 1]) {
      const input = createInput(); input.throttle = value;
      expect(toggleArm(input)).toBe(value <= C.armThreshold); expect(input.armed).toBe(value <= C.armThreshold);
    }
    const input = createInput(); input.armed = true; input.throttle = 1;
    expect(toggleArm(input)).toBe(true); expect(input.armed).toBe(false);
  });
  it('blur/hidden 공용 안전 처리 → 즉시 DISARM + 스로틀 0 + 눌린 키 해제', () => {
    const input = createInput(); input.armed = true; input.throttle = 0.8; input.keys.add('KeyW'); input.keys.add('ArrowUp');
    loseFocus(input); expect(input.armed).toBe(false); expect(input.throttle).toBe(0); expect(input.keys.size).toBe(0);
    readInput(input, 1); expect(input.throttle).toBe(0);
  });
  it('스로틀은 누르는 동안 증감, 해제 시 유지, 0~100% 제한', () => {
    const input = createInput(); input.keys.add('KeyW'); readInput(input, 1); expect(input.throttle).toBeCloseTo(0.4892);
    input.keys.clear(); readInput(input, 2); expect(input.throttle).toBeCloseTo(0.4892);
    input.keys.add('KeyW'); readInput(input, 10); expect(input.throttle).toBe(1);
    input.keys = new Set(['KeyS']); readInput(input, 10); expect(input.throttle).toBe(0);
  });
});
describe('120 Hz accumulator', () => {
  it('16 ms와 50 ms 화면 간격에서 1초 후 위치 차이 1 cm 미만, 정확히 120회 실행', () => {
    function simulate(frame: number) {
      const { state, input } = airborne(0.6); input.keys.add('ArrowUp'); input.keys.add('KeyW');
      let steps = 0;
      const clock = createFixedClock(dt => { expect(dt).toBe(C.step); steps++; stepFlight(state, input, dt); });
      let elapsed = 0;
      while (elapsed < 1 - 1e-10) { const dt = Math.min(frame, 1 - elapsed); clock.advance(dt); elapsed += dt; }
      expect(steps).toBe(120); return state;
    }
    const a = simulate(0.016), b = simulate(0.050);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z)).toBeLessThan(0.01);
  });
  it('긴 프레임은 0.25초로 제한하며 reset은 남은 누적 시간을 지움', () => {
    let count = 0; const clock = createFixedClock(() => count++);
    clock.advance(10); expect(count).toBe(30);
    clock.advance(C.step / 2); clock.reset(); clock.advance(C.step / 2); expect(count).toBe(30);
  });
});

describe('FIX-2 빠른 조종 응답', () => {
  it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('%s 0.20초 안에 31.5° 기울기, 0.30초 안에 복귀, 오버슈트 및 떨림 없음', key => {
    const { state, input } = airborne();
    const axis = key === 'ArrowUp' || key === 'ArrowDown' ? 'pitch' : 'roll';
    input.keys.add(key);
    let riseTime: number | undefined;
    let previous = 0;
    let peak = 0;
    for (let n = 1; n <= 2 / C.step; n++) {
      stepFlight(state, input, C.step);
      const angle = Math.abs(state[axis]) * DEG;
      if (riseTime === undefined && angle >= 31.5) riseTime = n * C.step;
      peak = Math.max(peak, angle);
      expect(angle).toBeGreaterThanOrEqual(previous - 1e-8);
      previous = angle;
    }
    expect(riseTime).toBeDefined();
    expect(riseTime!).toBeLessThanOrEqual(0.20);
    expect(peak).toBeLessThanOrEqual(37);
    input.keys.clear();
    let returnTime: number | undefined;
    for (let n = 1; n <= 2 / C.step; n++) {
      stepFlight(state, input, C.step);
      const angle = Math.abs(state[axis]) * DEG;
      if (returnTime === undefined && angle <= 3) returnTime = n * C.step;
      expect(angle).toBeLessThanOrEqual(previous + 1e-8);
      previous = angle;
    }
    expect(returnTime).toBeDefined();
    expect(returnTime!).toBeLessThanOrEqual(0.30);
    expect(previous).toBeLessThan(0.001);
    if (key === 'ArrowUp') console.info(`FIX-2 response: rise=${riseTime}s, return=${returnTime}s, peak=${peak}deg`);
  });
  it.each(['KeyA', 'KeyD'])('%s 요 속도 160°/초', key => {
    const { state, input } = airborne(); input.keys.add(key);
    run(1, () => stepFlight(state, input, C.step));
    expect(state.yaw * DEG).toBeCloseTo(key === 'KeyA' ? 160 : -160, 8);
  });
  it('골대·출발점·카메라는 경기장 크기에 연동', () => {
    expect(C.goal.x).toBe(C.arena.halfLength - 1.5);
    expect(C.goal.height).toBe(3);
    expect(C.start.x).toBe(-C.goal.x + 1);
    expect(C.start.y).toBe(C.radius);
    expect(C.camera.los.x).toBe(-C.arena.halfLength - 1.5);
    expect(C.camera.los.y).toBe(1.7);
    expect(C.camera.overview.x).toBeLessThan(-C.arena.halfLength);
    expect(C.camera.overview.y).toBeGreaterThan(C.arena.height);
    expect(C.camera.overview.z).toBeGreaterThan(C.arena.halfWidth);
    expect(C.camera.referee.y).toBe(C.arena.height / 2);
    expect(C.camera.referee.z).toBeGreaterThan(C.arena.halfWidth);
  });
});

it('accepts authoritative remote axes without synthesizing keyboard input', () => {
  const remote = createFlight(); const local = createFlight();
  const ri = createInput(); const li = createInput();
  ri.armed = li.armed = true; ri.throttle = li.throttle = .65;
  li.keys.add('ArrowUp'); li.keys.add('KeyD');
  for (let n = 0; n < 120; n++) {
    stepFlight(remote, ri, C.step, C.arena, {pitch:-1,roll:0,yaw:-1});
    stepFlight(local, li, C.step);
  }
  expect(remote).toEqual(local);
  expect(ri.keys.size).toBe(0);
});
