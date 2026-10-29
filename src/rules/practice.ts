import { C, DEFAULT_ARENA, type Arena } from '../sim/constants';
import type { Vec3 } from '../sim/flight';
import { createPassage, passageStep } from './passage';
import { ringDistance, ringsFor } from './ring';
export const createPractice = (arena: Arena = DEFAULT_ARENA) => ({ passes: 0, rimTouches: 0, rings: ringsFor(arena), passages: { blue: createPassage(), red: createPassage() }, touching: { blue: false, red: false } });
export function practiceStep(s: ReturnType<typeof createPractice>, prev: Vec3, pos: Vec3): void {
  for (const team of ['blue', 'red'] as const) {
    for (const event of passageStep(s.passages[team], prev, pos, s.rings[team])) if (event.kind === 'pass-forward' && event.clean) s.passes++;
    const touching = ringDistance(pos, s.rings[team]) <= C.radius + 1e-4;
    if (touching && !s.touching[team]) s.rimTouches++;
    s.touching[team] = touching;
  }
}
