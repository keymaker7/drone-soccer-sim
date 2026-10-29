import { describe, expect, it } from 'vitest';
import { segmentIntersectsRing } from './occlusion';
import { C } from './constants';

const ring = { ...C.goal, x: -C.goal.x };
const point = (x: number, y: number, z = 0) => ({ x, y, z });
describe('finite segment against thick goal annulus', () => {
  it('detects the own goal masking the launching drone', () => {
    expect(segmentIntersectsRing(C.camera.los, point(C.start.x, 2.9), ring)).toBe(true);
  });
  it('does not occlude through the central hole', () => {
    expect(segmentIntersectsRing(point(-13.5, 3), point(-9.5, 3), ring)).toBe(false);
  });
  it('misses outside the outer radius', () => {
    expect(segmentIntersectsRing(point(-13.5, 4), point(-9.5, 4), ring)).toBe(false);
  });
  it('excludes a ring behind either endpoint', () => {
    expect(segmentIntersectsRing(point(-10, 3.4), point(-9, 3.4), ring)).toBe(false);
    expect(segmentIntersectsRing(point(-12, 3.4), point(-11, 3.4), ring)).toBe(false);
  });
  it('supports both segment directions and the opposite goal', () => {
    expect(segmentIntersectsRing(point(-9, 3.4), point(-12, 3.4), ring)).toBe(true);
    expect(segmentIntersectsRing(point(12, 3.4), point(9, 3.4), C.goal)).toBe(true);
  });
  it('detects parallel segments within the thickness, including hole to rim', () => {
    expect(segmentIntersectsRing(point(ring.x + 0.07, 3), point(ring.x + 0.07, 4), ring)).toBe(true);
    expect(segmentIntersectsRing(point(ring.x + 0.09, 3), point(ring.x + 0.09, 4), ring)).toBe(false);
  });
  it('detects the side wall even when the center plane is crossed in the hole', () => {
    expect(segmentIntersectsRing(point(ring.x - 0.1, 2.6), point(ring.x + 0.1, 3.4), ring)).toBe(true);
  });
  it('handles stationary points inside the hole and rim', () => {
    expect(segmentIntersectsRing(point(ring.x, 3), point(ring.x, 3), ring)).toBe(false);
    expect(segmentIntersectsRing(point(ring.x, 3.4), point(ring.x, 3.4), ring)).toBe(true);
  });
});
