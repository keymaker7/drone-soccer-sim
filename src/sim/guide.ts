import { C } from './constants';

export interface GuideState { armed: boolean; throttle: number; altitude: number }
export function guideStep(state: GuideState): 1 | 2 | 3 | 4 {
  if (!state.armed) return state.throttle > C.armThreshold ? 1 : 2;
  return state.altitude < 0.4 ? 3 : 4;
}
export function needsTakeoff(state: GuideState): boolean {
  return !state.armed || (state.altitude < 0.25 && state.throttle < 0.5);
}
