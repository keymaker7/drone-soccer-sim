import { describe, expect, it } from 'vitest';
import { axesFromKeys, type StickMode } from './keymap';
import { createInput, readInput, releaseKey } from './input';

for (const mode of [1, 2] as const) describe(`모드 ${mode} 네 축`, () => {
  const pairs = {
    throttle: mode === 2 ? ['KeyW', 'KeyS'] : ['ArrowUp', 'ArrowDown'],
    pitch: mode === 2 ? ['ArrowDown', 'ArrowUp'] : ['KeyS', 'KeyW'],
    roll: ['ArrowRight', 'ArrowLeft'], yaw: ['KeyA', 'KeyD'],
  };
  for (const [axis, [positive, negative]] of Object.entries(pairs)) {
    it(`${axis}: 양방향, 반대 키 상쇄, 다른 축 간섭 없음`, () => {
      const neutral = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
      expect(axesFromKeys(new Set([positive!]), mode)).toEqual({ ...neutral, [axis]: 1 });
      expect(axesFromKeys(new Set([negative!]), mode)).toEqual({ ...neutral, [axis]: -1 });
      expect(axesFromKeys(new Set([positive!, negative!]), mode)).toEqual(neutral);
    });
  }
  it('스로틀 유지, 나머지 축 중립 복귀, 재누름 감속', () => {
    const input = createInput(); input.stickMode = mode as StickMode;
    input.throttle = 0.55;
    const throttleKey = pairs.throttle[0]!;
    input.keys.add(throttleKey); readInput(input, 0.3);
    releaseKey(input, throttleKey);
    const held = input.throttle;
    expect(readInput(input, 1)).toEqual({ pitch: 0, roll: 0, yaw: 0 });
    expect(input.throttle).toBe(held);
    input.keys.add(throttleKey); readInput(input, 0.1);
    expect(input.throttle - held).toBeCloseTo(0.009, 10);
  });
  it('Q/E 제거 및 입력 집합 불변', () => {
    const keys = new Set(['KeyQ', 'KeyE']);
    expect(axesFromKeys(keys, mode)).toEqual({ throttle: 0, pitch: 0, roll: 0, yaw: 0 });
    expect([...keys]).toEqual(['KeyQ', 'KeyE']);
  });
});
