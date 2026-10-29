import { C } from './constants';
export interface InputState {
  armed: boolean; throttle: number; keys: Set<string>;
}
export const createInput = (): InputState => ({ armed: false, throttle: 0, keys: new Set() });
export function toggleArm(input: InputState): boolean {
  if (input.armed) { input.armed = false; return true; }
  if (input.throttle > C.armThreshold) return false;
  input.armed = true;
  return true;
}
// Shared by blur, hidden visibility and reset: held keys must not survive focus loss.
export function loseFocus(input: InputState): void {
  input.armed = false; input.throttle = 0; input.keys.clear();
}
export function readInput(input: InputState, dt: number) {
  const axis = (positive: string, negative: string) => Number(input.keys.has(positive)) - Number(input.keys.has(negative));
  const throttleRate = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') ? C.fineThrottleRate : C.throttleRate;
  input.throttle = Math.max(0, Math.min(1, input.throttle + axis('ArrowUp', 'ArrowDown') * throttleRate * dt));
  return { pitch: axis('KeyS', 'KeyW'), roll: axis('KeyD', 'KeyA'), yaw: axis('KeyQ', 'KeyE') };
}
