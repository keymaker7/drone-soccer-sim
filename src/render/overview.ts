import * as THREE from 'three';
import { C } from '../sim/constants';

// Fit all eight arena corners to 70% width, with 90% height as a narrow-screen cap.
export function overviewPosition(aspect: number, fov: number) {
  const target = new THREE.Vector3(0, C.arena.height / 2, 0);
  const back = new THREE.Vector3(C.camera.overview.x, C.camera.overview.y, C.camera.overview.z).sub(target).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const tangent = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const corners: { depth: number; horizontal: number; vertical: number }[] = [];
  for (const x of [-C.arena.halfLength, C.arena.halfLength]) {
    for (const y of [-C.arena.height / 2, C.arena.height / 2]) {
      for (const z of [-C.arena.halfWidth, C.arena.halfWidth]) {
        const corner = new THREE.Vector3(x, y, z);
        corners.push({ depth: corner.dot(back), horizontal: corner.dot(right), vertical: corner.dot(up) });
      }
    }
  }
  let near = Math.max(...corners.map(c => c.depth)) + C.camera.near;
  let far = near + 10 * Math.hypot(C.arena.halfLength, C.arena.halfWidth, C.arena.height) / Math.min(aspect, 1);
  for (let i = 0; i < 32; i++) {
    const distance = (near + far) / 2;
    const horizontal = corners.map(c => c.horizontal / ((distance - c.depth) * tangent * aspect));
    const width = (Math.max(...horizontal) - Math.min(...horizontal)) / 2;
    const height = Math.max(...corners.map(c => Math.abs(c.vertical / ((distance - c.depth) * tangent))));
    if (width > 0.7 || height > 0.9) near = distance;
    else far = distance;
  }
  return back.multiplyScalar(far).add(target);
}
