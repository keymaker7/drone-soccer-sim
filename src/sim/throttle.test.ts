import { describe, expect, it } from 'vitest';
import { C, MAX_THRUST } from './constants';
import { createInput, loseFocus, readInput, releaseKey, toggleArm } from './input';
import { acceleration, createFlight, stepFlight } from './flight';

function hold(start: number, seconds: number, direction = 'ArrowUp', shift?: string, step: number = C.step) {
  const input = createInput(); input.throttle = start;
  input.keys.add(direction); if (shift) input.keys.add(shift);
  for (let t = 0; t < seconds - 1e-12; t += step) readInput(input, Math.min(step, seconds - t));
  return input;
}

describe('FIX-3 구간별 스로틀', () => {
  it('0 → 55%는 1.5초 이하', () => {
    const input = createInput(); input.keys.add('ArrowUp');
    let elapsed = 0;
    while (input.throttle < 0.55 && elapsed < 2) { readInput(input, C.step); elapsed += C.step; }
    expect(elapsed).toBeLessThanOrEqual(1.5);
    expect(elapsed).toBeCloseTo(1.341666667, 7);
    console.info(`FIX-3 hover: ${elapsed.toFixed(6)}s`);
  });
  it('55%에서 0.1초 톡은 1.5%p 이하, 1초 꾹은 20%p 이하', () => {
    const tap = hold(0.55, 0.1).throttle - 0.55;
    const long = hold(0.55, 1).throttle - 0.55;
    expect(tap).toBeLessThanOrEqual(0.015); expect(tap).toBeCloseTo(0.009, 10);
    expect(long).toBeLessThanOrEqual(0.20); expect(long).toBeCloseTo(0.1873333333, 9);
    console.info(`FIX-3 increase: tap=${tap * 100}pp, hold=${long * 100}pp`);
  });
  it('60%에서 ↓ 0.5초 뒤 50% 이상 유지', () => {
    expect(hold(0.6, 0.5, 'ArrowDown').throttle).toBeCloseTo(0.5208, 10);
    expect(hold(0.6, 0.5, 'ArrowDown').throttle).toBeGreaterThanOrEqual(0.5);
  });
  it.each(['ShiftLeft', 'ShiftRight'])('%s + ↑ 1초는 7.5%p ± 1, 모든 구간에 동일', shift => {
    for (const start of [0.1, 0.39, 0.55, 0.69, 0.8]) {
      const delta = hold(start, 1, 'ArrowUp', shift).throttle - start;
      expect(delta).toBeGreaterThanOrEqual(0.065); expect(delta).toBeLessThanOrEqual(0.085);
      expect(delta).toBeCloseTo(0.0752, 10);
    }
  });
  it.each([0.4, 0.7])('%s 경계에서 양방향 단조·연속, 큰 스텝과 작은 스텝의 결과 일치', boundary => {
    for (const direction of [-1, 1]) {
      const start = boundary - direction * 0.01;
      const key = direction > 0 ? 'ArrowUp' : 'ArrowDown';
      const input = createInput(); input.throttle = start; input.keys.add(key);
      let previous = start;
      for (let i = 0; i < 60; i++) {
        readInput(input, C.step);
        const delta = (input.throttle - previous) * direction;
        expect(delta).toBeGreaterThan(0);
        expect(delta).toBeLessThanOrEqual(0.9 * C.step + 1e-12);
        previous = input.throttle;
      }
      expect((input.throttle - boundary) * direction).toBeGreaterThan(0);
      expect(input.throttle).toBeCloseTo(hold(start, 0.5, key, undefined, 0.5).throttle, 10);
    }
  });
  it('정확한 경계 출발, 여러 경계 및 0.12초를 한 스텝으로 넘어도 동일', () => {
    for (const start of [0, 0.4, 0.7, 1]) for (const key of ['ArrowUp', 'ArrowDown']) {
      expect(hold(start, 2, key, undefined, 2).throttle).toBeCloseTo(hold(start, 2, key).throttle, 10);
    }
  });
  it('해제·재누름, 방향 반전, 동시 누름 뒤 재시작에도 첫 0.12초 감속', () => {
    const input = hold(0.55, 0.3);
    releaseKey(input, 'ArrowUp'); input.keys.add('ArrowUp');
    let before = input.throttle; readInput(input, 0.1);
    expect(input.throttle - before).toBeCloseTo(0.009, 10);
    input.keys = new Set(['ArrowDown']); before = input.throttle; readInput(input, 0.1);
    expect(before - input.throttle).toBeCloseTo(0.009, 10);
    input.keys.add('ArrowUp'); before = input.throttle; readInput(input, 1);
    expect(input.throttle).toBe(before);
    input.keys.delete('ArrowDown'); readInput(input, 0.1);
    expect(input.throttle - before).toBeCloseTo(0.009, 10);
  });
});

describe('FIX-3 모터 추력 지연 및 안전', () => {
  it('55 → 75% 계단, 0.08초 뒤 63% ± 5% 및 정확한 1차 응답', () => {
    const state = createFlight(), input = createInput();
    input.armed = true; input.motorThrottle = 0.55; input.throttle = 0.75;
    stepFlight(state, input, 0.08);
    expect(input.motorThrottle).toBeCloseTo(0.75 - 0.2 / Math.E, 10);
    expect(input.motorThrottle).toBeGreaterThanOrEqual(0.58);
    expect(input.motorThrottle).toBeLessThanOrEqual(0.68);
    state.vel = { x: 0, y: 0, z: 0 };
    expect((acceleration(state, input).y + C.gravity) * C.mass / MAX_THRUST).toBeCloseTo(input.motorThrottle, 10);
    console.info(`FIX-3 motor after 0.08s: ${input.motorThrottle * 100}%`);
  });
  it.each(['disarm', 'blur/hidden', 'step'])('%s는 지연 없이 모터 0, 잔류 추력 없음', action => {
    const state = createFlight(), input = createInput();
    input.armed = true; input.throttle = 0.75; input.motorThrottle = 0.75;
    if (action === 'disarm') toggleArm(input);
    else if (action === 'blur/hidden') loseFocus(input);
    else { input.armed = false; stepFlight(state, input, C.step); }
    expect(input.motorThrottle).toBe(0);
    state.vel = { x: 0, y: 0, z: 0 };
    expect(acceleration(state, input).y).toBe(-C.gravity);
  });
});
