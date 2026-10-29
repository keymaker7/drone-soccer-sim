import { C, MAX_THRUST } from './constants';
import { readInput, type InputState } from './input';
export interface Vec3 { x: number; y: number; z: number }
export interface FlightState {
  pos: Vec3; vel: Vec3; roll: number; pitch: number; yaw: number;
  rollRate: number; pitchRate: number;
}
export const createFlight = (): FlightState => ({
  pos: { ...C.start }, vel: { x: 0, y: 0, z: 0 },
  roll: 0, pitch: 0, yaw: 0, rollRate: 0, pitchRate: 0,
});
export function acceleration(s: FlightState, input: InputState): Vec3 {
  const thrust = input.armed ? input.throttle * MAX_THRUST / C.mass : 0;
  // R_y(yaw) R_z(pitch) R_x(roll) applied to local +Y motor thrust.
  const x = -Math.sin(s.pitch) * Math.cos(s.roll);
  const y = Math.cos(s.pitch) * Math.cos(s.roll);
  const z = Math.sin(s.roll);
  return {
    x: thrust * (Math.cos(s.yaw) * x + Math.sin(s.yaw) * z) - C.linearDrag * s.vel.x / C.mass,
    y: thrust * y - C.gravity - C.linearDrag * s.vel.y / C.mass,
    z: thrust * (-Math.sin(s.yaw) * x + Math.cos(s.yaw) * z) - C.linearDrag * s.vel.z / C.mass,
  };
}
export function collide(s: FlightState): void {
  const bounds: Record<keyof Vec3, [number, number]> = {
    x: [-C.arena.halfLength + C.radius, C.arena.halfLength - C.radius],
    y: [C.radius, C.arena.height - C.radius],
    z: [-C.arena.halfWidth + C.radius, C.arena.halfWidth - C.radius],
  };
  for (const axis of ['x', 'y', 'z'] as const) {
    const [lo, hi] = bounds[axis];
    if (s.pos[axis] < lo) { s.pos[axis] = lo; if (s.vel[axis] < 0) s.vel[axis] *= -C.restitution; }
    if (s.pos[axis] > hi) { s.pos[axis] = hi; if (s.vel[axis] > 0) s.vel[axis] *= -C.restitution; }
  }
}
export function stepFlight(s: FlightState, input: InputState, dt: number): void {
  const stick = readInput(input, dt);
  // Limit the combined tilt vector to 35 degrees, including diagonal stick input.
  const magnitude = Math.max(1, Math.hypot(stick.pitch, stick.roll));
  for (const axis of ['pitch', 'roll'] as const) {
    const rate = axis === 'pitch' ? 'pitchRate' : 'rollRate';
    const target = input.armed ? stick[axis] * C.maxTilt / magnitude : 0;
    // Semi-implicit Euler at 120 Hz; natural frequency 22 rad/s, critical damping (ratio 1).
    s[rate] += (C.attitudeKp * (target - s[axis]) - C.attitudeKd * s[rate]) * dt;
    s[axis] += s[rate] * dt;
    if (Math.abs(s[axis]) > C.maxTilt) { s[axis] = Math.sign(s[axis]) * C.maxTilt; s[rate] = 0; }
  }
  // A second cap also protects a transient when changing between diagonal axes.
  const tilt = Math.acos(Math.max(-1, Math.min(1, Math.cos(s.pitch) * Math.cos(s.roll))));
  if (tilt > C.maxTilt) {
    const scale = C.maxTilt / tilt;
    s.pitch *= scale; s.roll *= scale; s.pitchRate *= scale; s.rollRate *= scale;
  }
  if (input.armed) s.yaw = (s.yaw + stick.yaw * C.yawRate * dt) % (Math.PI * 2);
  const a = acceleration(s, input);
  for (const axis of ['x', 'y', 'z'] as const) { s.vel[axis] += a[axis] * dt; s.pos[axis] += s.vel[axis] * dt; }
  collide(s);
}
