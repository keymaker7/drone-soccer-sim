import { C } from '../sim/constants';
import type { Vec3 } from '../sim/flight';
import { ringDistance, type Ring } from './ring';
export interface PassageState { entry: -1 | 1 | null; crossed: boolean; touched: boolean; backEntered: boolean }
export type PassageEvent = { kind: 'pass-forward' | 'pass-reverse'; clean: boolean } | { kind: 'back-entry' };
export const createPassage = (): PassageState => ({ entry: null, crossed: false, touched: false, backEntered: false });
export function passageStep(s: PassageState, prev: Vec3, pos: Vec3, ring: Ring): PassageEvent[] {
  const sign = Math.sign(ring.x), a = (prev.x - ring.x) * sign, b = (pos.x - ring.x) * sign, edge = ring.depth / 2 + C.radius;
  const side = (u: number) => u <= -edge ? -1 : u >= edge ? 1 : 0;
  const events: PassageEvent[] = [];
  if (s.entry === null && (side(a) !== 0) && (side(a) !== side(b) || side(b) === 0)) {
    s.entry = side(a) as -1 | 1; s.crossed = false; s.touched = false;
  }
  if (s.entry !== null) {
    s.touched ||= ringDistance(pos, ring) <= C.radius + 1e-4 || ringDistance(prev, ring) <= C.radius + 1e-4;
    if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
      const t = -a / (b - a), rho = Math.hypot(prev.y + (pos.y - prev.y) * t - ring.y, prev.z + (pos.z - prev.z) * t - ring.z);
      if (rho + C.radius <= ring.innerRadius + 1e-10) s.crossed = true;
    }
    if (s.entry === 1 && !s.backEntered && Math.hypot(pos.y - ring.y, pos.z - ring.z) < ring.innerRadius && b - C.radius < ring.depth / 2) {
      events.push({ kind: 'back-entry' }); s.backEntered = true;
    }
    const exit = side(b);
    if (exit) {
      if (exit !== s.entry && s.crossed) events.push({ kind: s.entry === -1 ? 'pass-forward' : 'pass-reverse', clean: !s.touched });
      s.entry = null; s.crossed = false; s.touched = false;
    }
  }
  if (b >= edge) s.backEntered = false;
  return events;
}
