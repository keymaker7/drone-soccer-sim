import { C } from './constants';
export function createFixedClock(step: (dt: number) => void) {
  let accumulator = 0;
  return {
    advance(elapsed: number) {
      accumulator += Math.max(0, Math.min(elapsed, C.maxFrameTime));
      while (accumulator + C.clockEpsilon >= C.step) {
        step(C.step); accumulator = Math.max(0, accumulator - C.step);
      }
    },
    reset() { accumulator = 0; },
  };
}
