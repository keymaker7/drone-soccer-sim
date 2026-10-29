import { C } from './constants';
import { axesFromKeys, type StickMode } from './keymap';
export interface InputState {
  stickMode: StickMode; armed: boolean; throttle: number; motorThrottle: number; keys: Set<string>;
  throttleDirection: number; throttleHeldSeconds: number;
}
export const createInput = (): InputState => ({ stickMode: 2, armed: false, throttle: 0, motorThrottle: 0, keys: new Set(), throttleDirection: 0, throttleHeldSeconds: 0 });
export function toggleArm(input: InputState): boolean {
  if (input.armed) { input.armed = false; input.motorThrottle = 0; return true; }
  if (input.throttle > C.armThreshold) return false;
  input.armed = true;
  return true;
}
// Shared by blur, hidden visibility and reset: held keys must not survive focus loss.
export function loseFocus(input: InputState): void {
  input.armed = false; input.throttle = 0; input.motorThrottle = 0; input.keys.clear();
  input.throttleDirection = 0; input.throttleHeldSeconds = 0;
}
export function readInput(input: InputState, dt: number) {
  const { throttle: direction, pitch, roll, yaw } = axesFromKeys(input.keys, input.stickMode);
  if (direction !== input.throttleDirection || direction === 0) input.throttleHeldSeconds = 0;
  input.throttleDirection = direction;
  if (direction !== 0) {
    // Half-speed time is integrated separately even when one step crosses 0.12 s.
    const tapTime = Math.min(dt, Math.max(0, C.throttleTapSeconds - input.throttleHeldSeconds));
    let remaining = dt - tapTime + tapTime * C.throttleTapScale;
    const fine = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    while (remaining > 0 && (direction > 0 ? input.throttle < 1 : input.throttle > 0)) {
      // At an exact boundary choose the band in the direction of travel.
      const band = C.throttleBands.find(b => direction > 0
        ? input.throttle >= b.min && input.throttle < b.max
        : input.throttle > b.min && input.throttle <= b.max)!;
      const rate = fine ? C.fineThrottleRate : band.rate;
      const boundary = direction > 0 ? band.max : band.min;
      const crossingTime = Math.abs(boundary - input.throttle) / rate;
      if (remaining < crossingTime) {
        input.throttle += direction * rate * remaining;
        remaining = 0;
      } else {
        input.throttle = boundary;
        remaining -= crossingTime;
      }
    }
    input.throttleHeldSeconds += dt;
  }
  return { pitch, roll, yaw };
}

export function releaseKey(input: InputState, code: string): void {
  input.keys.delete(code);
  if ((input.stickMode === 2 ? ['KeyW', 'KeyS'] : ['ArrowUp', 'ArrowDown']).includes(code)) {
    input.throttleDirection = 0; input.throttleHeldSeconds = 0;
  }
}
