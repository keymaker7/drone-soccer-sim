import * as THREE from 'three';
import { C } from '../sim/constants';
import { segmentIntersectsRing } from '../sim/occlusion';
import { overviewPosition } from './overview';
import type { FlightState } from '../sim/flight';
export type CameraMode = 1 | 2 | 3 | 5;
export const CAMERA_NAMES: Record<CameraMode, string> = { 1: '1 · LOS 조종자', 2: '2 · 추적 관찰', 3: '3 · 경기장 전체', 5: '5 · 심판 측면' };
export function createScene(container: HTMLElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#091323');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, C.render.maxPixelRatio));
  renderer.domElement.setAttribute('aria-label', '드론축구 3D 경기장');
  container.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(C.camera.fov, 1, C.camera.near, C.camera.far);
  scene.add(new THREE.HemisphereLight('#c7e6ff', '#283a44', C.render.ambientIntensity));
  const light = new THREE.DirectionalLight('#ffffff', C.render.sunIntensity);
  light.position.set(-3, 10, 4); scene.add(light);
  const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(C.arena.halfLength * 2 + C.render.floorMargin, C.render.floorThickness, C.arena.halfWidth * 2 + C.render.floorMargin), mat('#172e40'));
  floor.position.y = -C.render.floorThickness / 2; scene.add(floor);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(C.render.lineWidth, C.arena.halfWidth * 2), mat('#b4d6dc'));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.002; scene.add(line);
  const vertices: number[] = [];
  const segment = (a: number[], b: number[]) => vertices.push(...a, ...b);
  const { halfLength: L, halfWidth: W, height: H } = C.arena;
  for (let x = -L; x <= L; x += C.render.netSpacing) {
    for (const z of [-W, W]) segment([x, 0, z], [x, H, z]);
    segment([x, H, -W], [x, H, W]);
  }
  for (let z = -W; z <= W; z += C.render.netSpacing) {
    for (const x of [-L, L]) segment([x, 0, z], [x, H, z]);
    segment([-L, H, z], [L, H, z]);
  }
  for (let y = 0; y <= H; y += C.render.netSpacing) {
    for (const z of [-W, W]) segment([-L, y, z], [L, y, z]);
    for (const x of [-L, L]) segment([x, y, -W], [x, y, W]);
  }
  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  scene.add(new THREE.LineSegments(netGeometry, new THREE.LineBasicMaterial({ color: '#8cb5cd', transparent: true, opacity: C.render.netOpacity, depthWrite: false })));
  const boundary = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-L, 0, -W), new THREE.Vector3(L, H, W)), new THREE.Color('#51758e'));
  scene.add(boundary);
  // Extruded annulus: exact inner/outer diameters and axial thickness.
  const ring = new THREE.Shape(); ring.absarc(0, 0, C.goal.outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, C.goal.innerRadius, 0, Math.PI * 2, true); ring.holes.push(hole);
  const ringGeometry = new THREE.ExtrudeGeometry(ring, { depth: C.goal.depth, bevelEnabled: false, curveSegments: C.render.goalSegments });
  ringGeometry.translate(0, 0, -C.goal.depth / 2);
  const goals: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>[] = [];
  for (const side of [-1, 1]) {
    const goal = new THREE.Mesh(ringGeometry, mat(side < 0 ? '#438cff' : '#ff6375'));
    goal.material.transparent = true;
    goals.push(goal);
    goal.position.set(side * C.goal.x, C.goal.height, 0); goal.rotation.y = -side * Math.PI / 2; scene.add(goal);
  }
  const drone = new THREE.Group(); scene.add(drone);
  const cage = new THREE.Mesh(new THREE.SphereGeometry(C.radius, C.render.cageSegments, C.render.cageRings), new THREE.MeshBasicMaterial({ color: '#5ba2ff', wireframe: true }));
  drone.add(cage);
  drone.add(new THREE.Mesh(new THREE.CylinderGeometry(C.render.bodyRadius, C.render.bodyRadius, C.render.bodyHeight, 16), mat('#297bff')));
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(C.render.armSpan, C.render.armWidth, C.render.armWidth), mat('#c5d9ec'));
    arm.rotation.y = angle; drone.add(arm);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(C.render.rotorRadius, C.render.rotorRadius, C.render.armWidth / 2, 20), mat('#153e75'));
    rotor.position.set(x * C.render.rotorOffset, C.render.bodyHeight / 2, z * C.render.rotorOffset); drone.add(rotor);
  }
  const marker = new THREE.Mesh(new THREE.SphereGeometry(C.render.markerRadius, 12, 8), new THREE.MeshBasicMaterial({ color: '#63ff96' }));
  marker.position.set(C.render.markerX, C.render.bodyHeight, 0); drone.add(marker);
  let mode: CameraMode = 1;
  let offsetX = 0, offsetY = 0;
  const target = new THREE.Vector3();
  const offset = new THREE.Quaternion();
  let dragging = false;
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button === 2) { dragging = true; renderer.domElement.setPointerCapture(e.pointerId); }
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!dragging) return;
    offsetX = THREE.MathUtils.clamp(offsetX - e.movementX * C.camera.dragSensitivity, -C.camera.maxOffset, C.camera.maxOffset);
    offsetY = THREE.MathUtils.clamp(offsetY - e.movementY * C.camera.dragSensitivity, -C.camera.maxOffset, C.camera.maxOffset);
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(event, () => { dragging = false; });
  window.addEventListener('blur', () => { dragging = false; });
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * C.camera.wheelSensitivity, C.camera.minFov, C.camera.maxFov); camera.updateProjectionMatrix();
  }, { passive: false });
  const overview = new THREE.Vector3();
  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight); camera.updateProjectionMatrix();
    overview.copy(overviewPosition(camera.aspect, C.camera.fov));
  }
  window.addEventListener('resize', resize); resize();
  return {
    get mode() { return mode; },
    setMode(value: CameraMode) { mode = value; offsetX = 0; offsetY = 0; },
    draw(s: FlightState, elapsed = 0) {
      drone.position.set(s.pos.x, s.pos.y, s.pos.z);
      drone.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
      target.copy(drone.position);
      if (mode === 1) camera.position.set(C.camera.los.x, C.camera.los.y, C.camera.los.z);
      if (mode === 2) camera.position.set(s.pos.x - Math.cos(s.yaw) * C.camera.followDistance, s.pos.y + C.camera.followHeight, s.pos.z + Math.sin(s.yaw) * C.camera.followDistance);
      if (mode === 3) { camera.position.copy(overview); target.set(0, H / 2, 0); }
      if (mode === 5) { camera.position.set(C.camera.referee.x, C.camera.referee.y, C.camera.referee.z); target.set(0, H / 2, 0); }
      camera.lookAt(target);
      offset.setFromEuler(new THREE.Euler(offsetY, offsetX, 0, 'YXZ')); camera.quaternion.multiply(offset);
      for (const goal of goals) {
        const blocked = segmentIntersectsRing(camera.position, s.pos, { ...C.goal, x: goal.position.x });
        const opacity = blocked ? C.render.occludedGoalOpacity : 1;
        const step = (1 - C.render.occludedGoalOpacity) * Math.max(0, elapsed) / C.render.goalFadeSeconds;
        goal.material.opacity += Math.sign(opacity - goal.material.opacity) * Math.min(step, Math.abs(opacity - goal.material.opacity));
        goal.material.depthWrite = goal.material.opacity >= 1;
      }
      renderer.render(scene, camera);
    },
  };
}
