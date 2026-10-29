import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createScene, type CameraMode } from './scene';
import { createFlight } from '../sim/flight';
import { C } from '../sim/constants';
import { segmentIntersectsRing } from '../sim/occlusion';

const captured = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    domElement = { setAttribute() {}, addEventListener() {} };
    setPixelRatio() {}
    setSize() {}
    render = captured.render;
  },
}));
afterEach(() => { vi.unstubAllGlobals(); captured.render.mockClear(); });
function setup() {
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('window', { addEventListener() {} });
  return createScene({ clientWidth: 1600, clientHeight: 900, prepend() {} } as unknown as HTMLElement);
}
function goals() {
  const scene = captured.render.mock.lastCall![0] as THREE.Scene;
  return scene.children.filter((o): o is THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial> =>
    o instanceof THREE.Mesh && o.geometry instanceof THREE.ExtrudeGeometry);
}
it('fades the own goal to 0.25 in 150ms and restores opacity/depth writing', () => {
  const view = setup();
  const flight = createFlight(); flight.pos.y = 2.9;
  view.draw(flight, 0.075);
  expect(goals()[0].material.opacity).toBeCloseTo(0.625);
  expect(goals()[0].material.depthWrite).toBe(false);
  view.draw(flight, 0.075);
  expect(goals()[0].material.opacity).toBeCloseTo(0.25);
  expect(goals()[1].material.opacity).toBe(1);
  flight.pos.y = 0.2;
  view.draw(flight, 0.15);
  expect(goals()[0].material.opacity).toBe(1);
  expect(goals()[0].material.depthWrite).toBe(true);
});
it.each<CameraMode>([1, 2, 3, 5])('updates both goals using actual camera %s', mode => {
  const view = setup(); view.setMode(mode);
  const flight = createFlight(); flight.pos.y = 2.9;
  view.draw(flight, 0.15);
  const camera = captured.render.mock.lastCall![1] as THREE.PerspectiveCamera;
  for (const goal of goals()) {
    const blocked = segmentIntersectsRing(camera.position, flight.pos, { ...C.goal, x: goal.position.x });
    expect(goal.material.opacity).toBeCloseTo(blocked ? 0.25 : 1);
  }
});

it('rebuilds the arena, disposes old geometry and updates camera and occlusion layout', async () => {
  const { ARENA_PRESETS, layoutFor } = await import('../sim/constants');
  const view = setup();
  view.draw(createFlight(), 0);
  const oldGoalGeometry = goals()[0].geometry;
  const dispose = vi.spyOn(oldGoalGeometry, 'dispose');
  for (const { arena } of Object.values(ARENA_PRESETS)) {
    view.setArena(arena);
    view.setMode(1);
    const flight = createFlight(arena); flight.pos.y = 2.9;
    view.draw(flight, 0.15);
    const camera = captured.render.mock.lastCall![1] as THREE.PerspectiveCamera;
    const layout = layoutFor(arena);
    expect(camera.position.x).toBe(layout.camera.los.x);
    expect(goals()).toHaveLength(2);
    expect(goals().map(goal => goal.position.x)).toEqual([-layout.goal.x, layout.goal.x]);
    for (const goal of goals()) {
      const blocked = segmentIntersectsRing(camera.position, flight.pos, { ...layout.goal, x: goal.position.x });
      expect(goal.material.opacity).toBe(blocked ? 0.25 : 1);
    }
    view.setMode(5); view.draw(flight);
    expect(camera.position.y).toBe(layout.camera.referee.y);
    expect(camera.position.z).toBe(layout.camera.referee.z);
  }
  expect(dispose).toHaveBeenCalledTimes(1);
});
