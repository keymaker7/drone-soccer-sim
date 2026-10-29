import { describe, expect, it } from 'vitest';
import { createStick, stepStick } from './stick';
import { createInput, loseFocus, readInput } from './input';

const forward = { pitch: -1, roll: 1, yaw: 1 };
describe('time-based keyboard stick', () => {
  it('tap 0.1 s, hold 0.4 s, and release within 0.1 s', () => {
    const tap = stepStick(createStick(), forward, .1);
    expect(tap).toEqual({ pitch: -.25, roll: .25, yaw: .33 });
    const full = stepStick(tap, forward, .3);
    expect(full).toEqual(forward);
    expect(stepStick(full, createStick(), .08)).toEqual(createStick());
  });
  it('Shift limits every axis including a previously full stick', () => {
    expect(stepStick(createStick(), forward, 1, true)).toEqual({ pitch: -.5, roll: .5, yaw: .5 });
    expect(stepStick(forward, forward, .016, true)).toEqual({ pitch: -.5, roll: .5, yaw: .5 });
  });
  it('reverses through zero at 0.08 s and uses remaining time at the leaning rate', () => {
    const opposite = { pitch: 1, roll: -1, yaw: -1 };
    expect(stepStick(forward, opposite, .08)).toEqual(createStick());
    const next = stepStick(forward, opposite, .1);
    expect(next.pitch).toBeCloseTo(.05);
    expect(next.roll).toBeCloseTo(-.05);
    expect(next.yaw).toBeCloseTo(-.066);
  });
  it('16 ms and 50 ms frames agree across hold, reversal, release and fine control', () => {
    function simulate(frame: number) {
      let stick = createStick();
      for (const [seconds, target, fine] of [[.4, forward, false], [.2, {pitch:1,roll:-1,yaw:-1}, false], [.1, createStick(), false], [.3, forward, true]] as const) {
        for (let t = 0; t < seconds;) { const dt = Math.min(frame, seconds-t); stick = stepStick(stick, target, dt, fine); t += dt; }
      }
      return stick;
    }
    const a = simulate(.016), b = simulate(.05);
    for (const axis of ['pitch','roll','yaw'] as const) expect(Math.abs(a[axis]-b[axis])).toBeLessThanOrEqual(.02);
  });
  it.each([1,2] as const)('mode %s: simultaneous keys return to center; safety clears all axes', mode => {
    const input = createInput(); input.stickMode = mode;
    const up = mode === 2 ? 'ArrowUp' : 'KeyW', down = mode === 2 ? 'ArrowDown' : 'KeyS';
    input.keys = new Set([up, 'ArrowRight', 'KeyA']); readInput(input, .4);
    input.keys = new Set([up, down, 'ArrowRight', 'ArrowLeft', 'KeyA', 'KeyD']);
    expect(readInput(input,.08)).toEqual(createStick());
    input.keys = new Set([up]); readInput(input,.1); loseFocus(input);
    expect(input.stick).toEqual(createStick());
  });
  it.each(['easy','manual'] as const)('does not alter %s throttle behavior in either stick mode', throttleMode => {
    for (const mode of [1,2] as const) for (const fine of [false,true]) {
      const baseline = createInput(throttleMode), tilted = createInput(throttleMode);
      baseline.stickMode = tilted.stickMode = mode;
      baseline.keys.add(mode === 2 ? 'KeyW' : 'ArrowUp');
      if (fine) baseline.keys.add('ShiftLeft');
      tilted.keys = new Set([...baseline.keys, mode === 2 ? 'ArrowUp' : 'KeyW', 'ArrowRight', 'KeyA']);
      for (let n=0;n<40;n++) { readInput(baseline,.025); readInput(tilted,.025); }
      expect(tilted.throttle).toBe(baseline.throttle);
      expect(tilted.climb).toBe(1);
      expect(tilted.fine).toBe(fine);
      expect(tilted.stick.pitch).toBe(fine ? -.5 : -1);
    }
  });
});
