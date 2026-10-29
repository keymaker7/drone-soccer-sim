// SI units. All tunable simulation, input and view coefficients live here.
export const C = {
  mass: 0.9, gravity: 9.81, hoverThrottle: 0.55,
  radius: 0.20, arena: { halfLength: 8, halfWidth: 3.5, height: 4.5 },
  goal: { x: 6.5, height: 3, innerRadius: 0.30, outerRadius: 0.50, depth: 0.16 },
  start: { x: -5.5, y: 0.20, z: 0 },
  step: 1 / 120, maxFrameTime: 0.25, clockEpsilon: 1e-10,
  maxTilt: 35 * Math.PI / 180, attitudeKp: 32, attitudeKd: 11,
  yawRate: 100 * Math.PI / 180, linearDrag: 0.22, restitution: 0.35,
  throttleRate: 0.45, armThreshold: 0.05,
  camera: {
    los: { x: -9.5, y: 1.7, z: 0 },
    overview: { x: -13, y: 11, z: 13 }, referee: { x: 0, y: 3, z: 10 },
    followDistance: 2.4, followHeight: 1.2,
    fov: 65, minFov: 30, maxFov: 90, near: 0.05, far: 150,
    dragSensitivity: 0.003, maxOffset: 1.2, wheelSensitivity: 0.04,
  },
  render: {
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
