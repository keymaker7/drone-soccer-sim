// SI units. All tunable simulation, input and view coefficients live here.
export interface Arena { readonly halfLength: number; readonly halfWidth: number; readonly height: number }
export const ARENA_PRESETS = {
  official: { label: '실제 규격 16 × 7 × 4.5', arena: { halfLength: 8, halfWidth: 3.5, height: 4.5 } },
  practice: { label: '연습 24 × 10.5 × 6', arena: { halfLength: 12, halfWidth: 5.25, height: 6 } },
  large: { label: '큰 맵 32 × 14 × 6', arena: { halfLength: 16, halfWidth: 7, height: 6 } },
} as const;
export const DEFAULT_ARENA: Arena = ARENA_PRESETS.practice.arena;
const radius = 0.20;
export function layoutFor(arena: Arena) {
  const goalX = arena.halfLength - 1.5;
  return {
    goal: { x: goalX, height: 3, innerRadius: 0.30, outerRadius: 0.50, depth: 0.16 },
    start: { x: -goalX + 1, y: radius, z: 0 },
    camera: {
      los: { x: -arena.halfLength - 1.5, y: 1.7, z: 0 },
      overview: { x: -arena.halfLength * 1.1, y: arena.height * 1.6, z: arena.halfWidth * 4 },
      referee: { x: 0, y: arena.height / 2, z: Math.max(arena.halfWidth * 20 / 7, arena.halfLength * 1.6) },
    },
  };
}
const defaultLayout = layoutFor(DEFAULT_ARENA);
export const C = {
  mass: 0.9, gravity: 9.81, hoverThrottle: 0.55,
  radius, arena: DEFAULT_ARENA,
  goal: defaultLayout.goal,
  start: defaultLayout.start,
  step: 1 / 120, maxFrameTime: 0.25, clockEpsilon: 1e-10,
  maxTilt: 35 * Math.PI / 180, attitudeKp: 484, attitudeKd: 44,
  yawRate: 160 * Math.PI / 180, linearDrag: 0.22, restitution: 0.35,
  throttleBands: [
    { min: 0, max: 0.4, rate: 0.9 },
    { min: 0.4, max: 0.7, rate: 0.18 },
    { min: 0.7, max: 1, rate: 0.35 },
  ],
  fineThrottleRate: 0.08, throttleTapSeconds: 0.12, throttleTapScale: 0.5,
  // Easy throttle target vertical speeds (m/s): hold up / Shift+up / no key / hold down.
  climbSpeed: { up: 1.5, fineUp: 0.5, idle: -1.0, down: -1.8 },
  motorTimeConstant: 0.08, armThreshold: 0.05,
  camera: {
    ...defaultLayout.camera,
    followDistance: 2.4, followHeight: 1.2,
    fov: 65, minFov: 30, maxFov: 90, near: 0.05, far: 150,
    dragSensitivity: 0.003, maxOffset: 1.2, wheelSensitivity: 0.04,
  },
  render: {
    occludedGoalOpacity: 0.25, goalFadeSeconds: 0.15,
    maxPixelRatio: 2, netSpacing: 0.5, netOpacity: 0.12,
    floorMargin: 2, floorThickness: 0.08, lineWidth: 0.04,
    cageSegments: 16, cageRings: 10, bodyRadius: 0.075, bodyHeight: 0.045,
    armSpan: 0.26, armWidth: 0.018, rotorOffset: 0.092, rotorRadius: 0.05,
    markerRadius: 0.045, markerX: 0.12, goalSegments: 64,
    ambientIntensity: 2, sunIntensity: 3,
  },
} as const;
export const MAX_THRUST = C.mass * C.gravity / C.hoverThrottle;
export const DEG = 180 / Math.PI;
