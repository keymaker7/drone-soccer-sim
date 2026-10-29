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

it('renders remote teams, role markers, labels and team-end LOS seats without a phantom drone', () => {
  const context = { fillRect: vi.fn(), fillText: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ width:0,height:0,getContext: () => context }) });
  const view = setup();
  const drones = [
    {id:'b1',team:'blue',role:'striker',x:-5,y:1,z:0,roll:0,pitch:0,yaw:0,armed:true},
    {id:'b2',team:'blue',role:'guide',x:-4,y:2,z:1,roll:0,pitch:0,yaw:0,armed:true},
    {id:'r1',team:'red',role:'keeper',x:5,y:1,z:0,roll:0,pitch:0,yaw:0,armed:false},
  ];
  const roster = drones.map(d => ({...d,nick:`pilot-${d.id}`}));
  view.drawMany(drones, roster, 'b1');
  const scene = captured.render.mock.lastCall![0] as THREE.Scene;
  const camera = captured.render.mock.lastCall![1] as THREE.PerspectiveCamera;
  const groups = scene.children.filter(o => o instanceof THREE.Group);
  expect(groups.filter(g => g.visible)).toHaveLength(3);
  expect(groups.filter(g => !g.visible)).toHaveLength(1);
  expect(context.fillText).toHaveBeenCalledWith('pilot-b1',128,32,240);
  expect(camera.position.x).toBe(-C.arena.halfLength - 1.5);
  const firstZ = camera.position.z;
  view.drawMany(drones, roster, 'b2');
  expect(camera.position.z - firstZ).toBe(1);
  view.drawMany(drones, roster, 'r1');
  expect(camera.position.x).toBe(C.arena.halfLength + 1.5);
  const removed = groups.find(g => g.visible)!;
  const mesh = removed.children[0] as THREE.Mesh;
  const disposed = vi.spyOn(mesh.geometry,'dispose');
  view.drawMany(drones.slice(1), roster.slice(1), 'r1');
  expect(disposed).toHaveBeenCalled();
  expect(scene.children.filter(o => o instanceof THREE.Group && o.visible)).toHaveLength(2);
});
