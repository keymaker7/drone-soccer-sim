import { expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_PRESETS, C, DEFAULT_ARENA, layoutFor } from './constants';
import { collide, createFlight, stepFlight } from './flight';
import { createInput } from './input';
import { overviewPosition } from '../render/overview';

it('defaults to the practice arena and keeps layout calculation pure', () => {
  expect(DEFAULT_ARENA).toEqual({ halfLength: 12, halfWidth: 5.25, height: 6 });
  const arena = Object.freeze({ ...DEFAULT_ARENA });
  const first = layoutFor(arena);
  first.start.x = 100;
  expect(layoutFor(arena).start.x).toBe(-9.5);
});

for (const [name, { arena }] of Object.entries(ARENA_PRESETS)) {
  it(`${name}: places goals, spawn and static cameras from arena dimensions`, () => {
    const layout = layoutFor(arena);
    expect(layout.goal.x).toBe(arena.halfLength - 1.5);
    expect(layout.goal.height).toBe(3);
    expect(createFlight(arena).pos).toEqual(layout.start);
    expect(layout.start.x).toBeGreaterThan(-arena.halfLength + C.radius);
    expect(layout.start.x).toBeLessThan(0);
    expect(layout.camera.los.x).toBe(-arena.halfLength - 1.5);
    expect(layout.camera.referee.y).toBe(arena.height / 2);
    expect(layout.camera.referee.z).toBeGreaterThan(arena.halfWidth);
  });
  it(`${name}: collision and flight enforce the selected six walls`, () => {
    for (const sign of [-1, 1]) {
      const flight = createFlight(arena);
      flight.pos = { x: sign * 100, y: sign * 100, z: sign * 100 };
      flight.vel = { x: sign * 2, y: sign * 2, z: sign * 2 };
      collide(flight, arena);
      expect(flight.pos.x).toBe(sign * (arena.halfLength - C.radius));
      expect(flight.pos.y).toBe(sign > 0 ? arena.height - C.radius : C.radius);
      expect(flight.pos.z).toBe(sign * (arena.halfWidth - C.radius));
      expect(flight.vel.x).toBe(-sign * 2 * C.restitution);
    }
    const flight = createFlight(arena);
    flight.pos.x = arena.halfLength + 1;
    stepFlight(flight, createInput(), C.step, arena);
    expect(flight.pos.x).toBe(arena.halfLength - C.radius);
  });
  it.each([16 / 9, 4 / 3, 9 / 16])(`${name}: overview fits corners at aspect %s`, aspect => {
    const camera = new THREE.PerspectiveCamera(C.camera.fov, aspect, C.camera.near, C.camera.far);
    camera.position.copy(overviewPosition(aspect, C.camera.fov, arena));
    camera.lookAt(0, arena.height / 2, 0);
    camera.updateMatrixWorld();
    for (const x of [-arena.halfLength, arena.halfLength])
      for (const y of [0, arena.height])
        for (const z of [-arena.halfWidth, arena.halfWidth]) {
          const point = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(0.900001);
          expect(Math.abs(point.z)).toBeLessThan(1);
        }
  });
}
