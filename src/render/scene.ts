import * as THREE from 'three';
import { C, DEFAULT_ARENA, layoutFor, type Arena } from '../sim/constants';
import { segmentIntersectsRing } from '../sim/occlusion';
import { overviewPosition } from './overview';
import type { FlightState } from '../sim/flight';
export interface RemoteDrone { id: string; team: string; role: string; x: number; y: number; z: number; roll: number; pitch: number; yaw: number; armed: boolean }
export interface RemotePilot { id: string; nick: string; team: string; role: string }
export const ROLE_COLORS: Record<string, string> = { striker: '#ffd966', guide: '#8ef0bd', libero: '#d7b8ff', sweeper: '#ffae7a', keeper: '#ffffff' };
export type CameraMode = 1 | 2 | 3 | 5;
export const CAMERA_NAMES: Record<CameraMode, string> = { 1: '1 · LOS 조종자', 2: '2 · 추적 관찰', 3: '3 · 경기장 전체', 5: '5 · 심판 측면' };
export function createScene(container: HTMLElement, arena: Arena = DEFAULT_ARENA) {
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
  let layout = layoutFor(arena);
  let arenaObjects: THREE.Object3D[] = [];
  const goals: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>[] = [];
  function buildArena() {
    const previous = new Set(scene.children);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(arena.halfLength * 2 + C.render.floorMargin, C.render.floorThickness, arena.halfWidth * 2 + C.render.floorMargin), mat('#172e40'));
    floor.position.y = -C.render.floorThickness / 2; scene.add(floor);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(C.render.lineWidth, arena.halfWidth * 2), mat('#b4d6dc'));
    line.rotation.x = -Math.PI / 2; line.position.y = 0.002; scene.add(line);
    const vertices: number[] = [];
    const segment = (a: number[], b: number[]) => vertices.push(...a, ...b);
    const { halfLength: L, halfWidth: W, height: H } = arena;
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
    const ring = new THREE.Shape(); ring.absarc(0, 0, layout.goal.outerRadius, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, layout.goal.innerRadius, 0, Math.PI * 2, true); ring.holes.push(hole);
    const ringGeometry = new THREE.ExtrudeGeometry(ring, { depth: layout.goal.depth, bevelEnabled: false, curveSegments: C.render.goalSegments });
    ringGeometry.translate(0, 0, -layout.goal.depth / 2);
    for (const side of [-1, 1]) {
      const goal = new THREE.Mesh(ringGeometry, mat(side < 0 ? '#438cff' : '#ff6375'));
      goal.material.transparent = true;
      goals.push(goal);
      goal.position.set(side * layout.goal.x, layout.goal.height, 0); goal.rotation.y = -side * Math.PI / 2; scene.add(goal);
    }
    arenaObjects = scene.children.filter(object => !previous.has(object));
  }
  buildArena();
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
  const remote = new Map<string, { group: THREE.Group; label: THREE.Sprite; nick: string }>();
  let remoteLos: { x: number; y: number; z: number } | null = null;
  function releaseObjects(objects: THREE.Object3D[]) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const object of objects) object.traverse(child => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Sprite) {
        if ('geometry' in child) geometries.add(child.geometry);
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
      material.dispose();
    }
  }
  function nameTag(nick: string) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#071321dd'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(nick, 128, 32, 240);
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    label.scale.set(1.05, .2625, 1); label.position.y = .45;
    return label;
  }
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
  const stopDrag = () => { dragging = false; };
  window.addEventListener('blur', stopDrag);
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * C.camera.wheelSensitivity, C.camera.minFov, C.camera.maxFov); camera.updateProjectionMatrix();
  }, { passive: false });
  const overview = new THREE.Vector3();
  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight); camera.updateProjectionMatrix();
    overview.copy(overviewPosition(camera.aspect, C.camera.fov, arena));
  }
  window.addEventListener('resize', resize); resize();
  const api = {
    resize,
    setArena(value: Arena) {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      for (const object of arenaObjects) {
        scene.remove(object);
        object.traverse(child => {
          if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
            geometries.add(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.add(material);
          }
        });
      }
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      goals.length = 0;
      arena = value;
      layout = layoutFor(arena);
      buildArena();
      offsetX = 0; offsetY = 0;
      camera.fov = C.camera.fov;
      resize();
    },
    get mode() { return mode; },
    setMode(value: CameraMode) { mode = value; offsetX = 0; offsetY = 0; },
    drawMany(drones: RemoteDrone[], roster: RemotePilot[], myId: string | null, elapsed = 0) {
      drone.visible = false;
      const ids = new Set(drones.map(d => d.id));
      for (const [id, item] of remote) if (!ids.has(id)) { scene.remove(item.group); releaseObjects([item.group]); remote.delete(id); }
      for (const d of drones) {
        const nick = roster.find(p => p.id === d.id)?.nick ?? '';
        let item = remote.get(d.id);
        if (!item) {
          const group = new THREE.Group();
          const teamColor = d.team === 'blue' ? '#559eff' : '#ff6575';
          group.add(new THREE.Mesh(new THREE.SphereGeometry(C.radius, 16, 10), new THREE.MeshBasicMaterial({ color: teamColor, wireframe: true })));
          group.add(new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .045, 12), mat(teamColor)));
          const roleRing = new THREE.Mesh(new THREE.TorusGeometry(.145, .018, 6, 24), new THREE.MeshBasicMaterial({color: ROLE_COLORS[d.role] ?? '#ffffff'}));
          roleRing.rotation.x = Math.PI / 2; group.add(roleRing);
          const nose = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({color:'#a5ff9e'})); nose.position.x = .15; group.add(nose);
          const label = nameTag(nick); group.add(label); scene.add(group);
          item = { group, label, nick }; remote.set(d.id, item);
        }
        if (item.nick !== nick) {
          item.group.remove(item.label); releaseObjects([item.label]);
          item.label = nameTag(nick); item.nick = nick; item.group.add(item.label);
        }
        item.group.position.set(d.x, d.y, d.z); item.group.rotation.set(d.roll, d.yaw, d.pitch, 'YZX');
        // Keep name tags directly overhead rather than leaning with the cage.
        item.label.position.copy(new THREE.Vector3(0, .45, 0).applyQuaternion(item.group.quaternion.clone().invert()));
      }
      const own = drones.find(d => d.id === myId);
      remoteLos = null;
      if (myId) {
        const pilot = roster.find(p => p.id === myId);
        const teammates = roster.filter(p => p.team === pilot?.team);
        const index = Math.max(0, teammates.findIndex(p => p.id === myId));
        remoteLos = { x: (pilot?.team === 'red' ? 1 : -1) * (arena.halfLength + 1.5), y: 1.7, z: index - (teammates.length - 1) / 2 };
        mode = 1;
      }
      api.draw({ pos: own ? {x:own.x,y:own.y,z:own.z} : {x:0,y:arena.height/2,z:0}, vel:{x:0,y:0,z:0}, roll:own?.roll ?? 0, pitch:own?.pitch ?? 0, yaw:own?.yaw ?? 0, rollRate:0, pitchRate:0 }, elapsed);
    },
    dispose() {
      window.removeEventListener('resize', resize); window.removeEventListener('blur', stopDrag);
      releaseObjects(scene.children); remote.clear(); renderer.dispose(); renderer.domElement.remove();
    },
    draw(s: FlightState, elapsed = 0) {
      drone.position.set(s.pos.x, s.pos.y, s.pos.z);
      drone.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
      target.copy(drone.position);
      if (mode === 1) { const los = remoteLos ?? layout.camera.los; camera.position.set(los.x, los.y, los.z); }
      if (mode === 2) camera.position.set(s.pos.x - Math.cos(s.yaw) * C.camera.followDistance, s.pos.y + C.camera.followHeight, s.pos.z + Math.sin(s.yaw) * C.camera.followDistance);
      if (mode === 3) { camera.position.copy(overview); target.set(0, arena.height / 2, 0); }
      if (mode === 5) { camera.position.set(layout.camera.referee.x, layout.camera.referee.y, layout.camera.referee.z); target.set(0, arena.height / 2, 0); }
      camera.lookAt(target);
      offset.setFromEuler(new THREE.Euler(offsetY, offsetX, 0, 'YXZ')); camera.quaternion.multiply(offset);
      for (const goal of goals) {
        const blocked = segmentIntersectsRing(camera.position, s.pos, { ...layout.goal, x: goal.position.x });
        const opacity = blocked ? C.render.occludedGoalOpacity : 1;
        const step = (1 - C.render.occludedGoalOpacity) * Math.max(0, elapsed) / C.render.goalFadeSeconds;
        goal.material.opacity += Math.sign(opacity - goal.material.opacity) * Math.min(step, Math.abs(opacity - goal.material.opacity));
        goal.material.depthWrite = goal.material.opacity >= 1;
      }
      renderer.render(scene, camera);
    },
  };
  return api;
}
