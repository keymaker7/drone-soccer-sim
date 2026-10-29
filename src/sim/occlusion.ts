interface Point { x: number; y: number; z: number }
interface Ring { x: number; height: number; innerRadius: number; outerRadius: number; depth: number }

// Intersect a finite segment with an x-normal annulus extruded through depth.
// Over the clipped axial interval, squared radial distance is a convex quadratic.
export function segmentIntersectsRing(from: Point, to: Point, ring: Ring): boolean {
  const dx = to.x - from.x;
  const low = ring.x - ring.depth / 2, high = ring.x + ring.depth / 2;
  let start = 0, end = 1;
  if (Math.abs(dx) < 1e-12) {
    if (from.x < low || from.x > high) return false;
  } else {
    const a = (low - from.x) / dx, b = (high - from.x) / dx;
    start = Math.max(0, Math.min(a, b));
    end = Math.min(1, Math.max(a, b));
    if (start > end) return false;
  }
  const y = from.y - ring.height, z = from.z;
  const dy = to.y - from.y, dz = to.z - from.z;
  const radialSquared = (t: number) => (y + dy * t) ** 2 + (z + dz * t) ** 2;
  const speedSquared = dy * dy + dz * dz;
  const closest = speedSquared === 0 ? start : Math.max(start, Math.min(end, -(y * dy + z * dz) / speedSquared));
  return radialSquared(closest) <= ring.outerRadius ** 2
    && Math.max(radialSquared(start), radialSquared(end)) >= ring.innerRadius ** 2;
}
