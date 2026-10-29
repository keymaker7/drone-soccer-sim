import { describe, expect, it } from 'vitest';
import { guideStep, needsTakeoff } from './guide';

describe('시동 안내 경계값', () => {
  it.each([[0, 2], [0.05, 2], [0.050001, 1], [1, 1]] as const)(
    'DISARM 스로틀 %s → 단계 %s', (throttle, expected) => {
      expect(guideStep({ armed: false, throttle, altitude: 2 })).toBe(expected);
    });
  it.each([[0.2, 3], [0.399999, 3], [0.4, 4], [0.400001, 4]] as const)(
    'ARM 고도 %s → 단계 %s', (altitude, expected) => {
      expect(guideStep({ armed: true, throttle: 0.6, altitude })).toBe(expected);
    });
  it.each([[0.249999, 0.499999, true], [0.25, 0.499999, false], [0.249999, 0.5, false], [0.25, 0.5, false]] as const)(
    '착지/이륙 안내 경계 고도 %s, 스로틀 %s', (altitude, throttle, expected) => {
      expect(needsTakeoff({ armed: true, throttle, altitude })).toBe(expected);
    });
  it('DISARM과 초기화 상태는 항상 다시 안내', () => {
    expect(needsTakeoff({ armed: false, throttle: 1, altitude: 2 })).toBe(true);
    expect(guideStep({ armed: false, throttle: 0, altitude: 0.2 })).toBe(2);
  });
});
