export type StickMode = 1 | 2;

// Signs match the flight model: forward pitch is negative, left yaw is positive.
export function axesFromKeys(keys: ReadonlySet<string>, mode: StickMode) {
  const axis = (positive: string, negative: string) => Number(keys.has(positive)) - Number(keys.has(negative));
  return {
    throttle: mode === 2 ? axis('KeyW', 'KeyS') : axis('ArrowUp', 'ArrowDown'),
    pitch: mode === 2 ? axis('ArrowDown', 'ArrowUp') : axis('KeyS', 'KeyW'),
    roll: axis('ArrowRight', 'ArrowLeft'),
    yaw: axis('KeyA', 'KeyD'),
  };
}
