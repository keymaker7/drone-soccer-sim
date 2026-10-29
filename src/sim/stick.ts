export interface StickState { pitch: number; roll: number; yaw: number }
export const createStick = (): StickState => ({ pitch: 0, roll: 0, yaw: 0 });

// Pure, time-based integration. Reversals spend only the time needed returning
// to center, then use the remaining time to lean toward the opposite end.
export function stepStick(current: Readonly<StickState>, target: Readonly<StickState>, dt: number, fine = false): StickState {
  const next = createStick();
  const limit = fine ? 0.5 : 1;
  for (const axis of ['pitch', 'roll', 'yaw'] as const) {
    let value = Math.max(-limit, Math.min(limit, current[axis]));
    let remaining = Math.max(0, dt);
    const goal = Math.max(-limit, Math.min(limit, target[axis]));
    if (value * goal < 0) {
      const returnTime = Math.abs(value) / 12.5;
      const used = Math.min(remaining, returnTime);
      value = used === returnTime ? 0 : value - Math.sign(value) * 12.5 * used;
      remaining -= used;
    }
    const rate = goal === 0 ? 12.5 : axis === 'yaw' ? 3.3 : 2.5;
    next[axis] = value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), rate * remaining);
  }
  return next;
}
