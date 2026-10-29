import { createScene, type RemoteDrone, type RemotePilot } from './scene';
import type { Arena } from '../sim/constants';

/** Reuse the practice arena, camera gestures, goal occlusion and GPU lifecycle. */
export function createNetScene(container: HTMLElement, arena: Arena) {
  const scene = createScene(container, arena);
  scene.setMode(3);
  return {
    draw: (drones: RemoteDrone[], roster: RemotePilot[], myId: string | null, elapsed = 0) => scene.drawMany(drones, roster, myId, elapsed),
    setArena: scene.setArena,
    setMode: (mode: 3 | 5) => scene.setMode(mode),
    resize: scene.resize,
    dispose: scene.dispose,
  };
}
