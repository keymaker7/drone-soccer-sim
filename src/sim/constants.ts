// SI units. All tunable simulation, input and view coefficients live here.
// Competition size: { halfLength: 8, halfWidth: 3.5, height: 4.5 } (16 × 7 × 4.5 m).
const arena = { halfLength: 12, halfWidth: 5.25, height: 6 };
const radius = 0.20;
const goalX = arena.halfLength - 1.5;
export const C = {
  mass: 0.9, gravity: 9.81, hoverThrottle: 0.55,
  radius, arena,
  goal: { x: goalX, height: 3, innerRadius: 0.30, outerRadius: 0.50, depth: 0.16 },
  start: { x: -goalX + 1, y: radius, z: 0 },
  step: 1 / 120, maxFrameTime: 0.25, clockEpsilon: 1e-10,
  maxTilt: 35 * Math.PI / 180, attitudeKp: 484, attitudeKd: 44,
  yawRate: 160 * Math.PI / 180, linearDrag: 0.22, restitution: 0.35,
  throttleRate: 0.9, fineThrottleRate: 0.25, armThreshold: 0.05,
  camera: {
    los: { x: -arena.halfLength - 1.5, y: 1.7, z: 0 },
    overview: { x: -arena.halfLength * 1.1, y: arena.height * 1.6, z: arena.halfWidth * 4 },
    referee: { x: 0, y: arena.height / 2, z: Math.max(arena.halfWidth * 20 / 7, arena.halfLength * 1.6) },
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
