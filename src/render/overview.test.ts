import { expect, it } from 'vitest';
import * as THREE from 'three';
import { C } from '../sim/constants';
import { overviewPosition } from './overview';

it.each([16 / 9, 4 / 3, 9 / 16])('fits arena corners at aspect %s', aspect => {
  const camera = new THREE.PerspectiveCamera(C.camera.fov, aspect, C.camera.near, C.camera.far);
  camera.position.copy(overviewPosition(aspect, C.camera.fov));
  camera.lookAt(0, C.arena.height / 2, 0);
  camera.updateMatrixWorld();
  const points: THREE.Vector3[] = [];
  for (const x of [-C.arena.halfLength, C.arena.halfLength])
    for (const y of [0, C.arena.height])
      for (const z of [-C.arena.halfWidth, C.arena.halfWidth])
        points.push(new THREE.Vector3(x, y, z).project(camera));
  for (const p of points) {
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(0.900001);
    expect(p.z).toBeGreaterThan(-1);
    expect(p.z).toBeLessThan(1);
  }
  const width = (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) / 2;
  expect(width).toBeGreaterThan(0.63);
  expect(width).toBeLessThanOrEqual(0.700001);
  if (aspect === 16 / 9) {
    expect(camera.position.length()).toBeLessThan(new THREE.Vector3(-19.5, 14.667, 19.5).length());
  }
});
