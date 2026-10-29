import { C, DEFAULT_ARENA, layoutFor, type Arena } from '../sim/constants';
import type { FlightState, Vec3 } from '../sim/flight';
import type { Team } from '../score/match';
export interface Ring { x: number; y: number; z: number; innerRadius: number; outerRadius: number; depth: number }
export function ringsFor(arena: Arena = DEFAULT_ARENA): Record<Team, Ring> {
  const g = layoutFor(arena).goal;
  const ring = { x: g.x, y: g.height, z: 0, innerRadius: g.innerRadius, outerRadius: g.outerRadius, depth: g.depth };
  return { blue: { ...ring, x: -g.x }, red: ring };
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function nearest(p: Vec3, ring: Ring): Vec3 {
  const y = p.y - ring.y, z = p.z - ring.z, rho = Math.hypot(y, z), radius = clamp(rho, ring.innerRadius, ring.outerRadius);
  return { x: ring.x + clamp(p.x - ring.x, -ring.depth / 2, ring.depth / 2), y: ring.y + (rho < 1e-9 ? radius : y * radius / rho), z: ring.z + (rho < 1e-9 ? 0 : z * radius / rho) };
}
export function ringDistance(p: Vec3, ring: Ring): number {
  const q = nearest(p, ring); return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}
export function collideRing(s: FlightState, ring: Ring): void {
  const q = nearest(s.pos, ring), n = { x: s.pos.x - q.x, y: s.pos.y - q.y, z: s.pos.z - q.z };
  const distance = Math.hypot(n.x, n.y, n.z);
  if (distance >= C.radius) return;
  let push = C.radius - distance;
  if (distance > 1e-12) { n.x /= distance; n.y /= distance; n.z /= distance; }
  else {
    const x = s.pos.x - ring.x, y = s.pos.y - ring.y, z = s.pos.z - ring.z, rho = Math.hypot(y, z);
    const faces = [ring.depth / 2 - Math.abs(x), rho - ring.innerRadius, ring.outerRadius - rho];
    const face = faces.indexOf(Math.min(...faces)); push += faces[face];
    n.x = face === 0 ? (x < 0 ? -1 : 1) : 0;
    n.y = face === 0 ? 0 : (rho < 1e-9 ? 1 : y / rho) * (face === 1 ? -1 : 1);
    n.z = face === 0 ? 0 : (rho < 1e-9 ? 0 : z / rho) * (face === 1 ? -1 : 1);
  }
  const inward = s.vel.x * n.x + s.vel.y * n.y + s.vel.z * n.z;
  for (const axis of ['x', 'y', 'z'] as const) {
    s.pos[axis] += n[axis] * push;
    if (inward < 0) s.vel[axis] -= (1 + C.restitution) * inward * n[axis];
  }
}
