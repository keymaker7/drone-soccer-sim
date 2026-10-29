import { C, MAX_THRUST } from './constants';
export type ThrottleMode = 'easy' | 'manual';
export type ClimbDirection = -1 | 0 | 1;
export const targetClimbSpeed = (climb: ClimbDirection, fine: boolean): number => climb > 0 ? (fine ? C.climbSpeed.fineUp : C.climbSpeed.up) : climb < 0 ? C.climbSpeed.down : C.climbSpeed.idle;

// Pure PI controller. The integral is explicit so local and authoritative host
// simulations run precisely the same controller, independent of rendering.
export function climbControl(state: {
  altitude: number; vy: number; pitch: number; roll: number; integral: number;
}, climb: ClimbDirection, fine: boolean, armed: boolean, dt: number) {
  const grounded = state.altitude <= C.radius + 0.02 && climb <= 0;
  if (!armed || grounded) return { throttle: 0, integral: 0, grounded };
  const target = targetClimbSpeed(climb, fine);
  const error = target - state.vy;
  const compensation = Math.min(1.4, 1 / Math.max(0.01, Math.cos(state.pitch) * Math.cos(state.roll)));
  const integral = Math.max(-2, Math.min(2, state.integral + error * dt));
  const thrust = (C.gravity + 5 * error + 1.5 * integral + C.linearDrag * target / C.mass) * C.mass * compensation / MAX_THRUST;
  // Freeze integration while saturated in the same direction as the error.
  const nextIntegral = (thrust > 1 && error > 0) || (thrust < 0 && error < 0) ? state.integral : integral;
  return { throttle: Math.max(0, Math.min(1, thrust)), integral: nextIntegral, grounded };
}
