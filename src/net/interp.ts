import type { DroneSnapshot } from './protocol';
interface Frame { tick: number; time: number; drones: DroneSnapshot[] }
export class Interpolator {
  private frames: Frame[] = [];
  push(tick: number, drones: DroneSnapshot[], receivedAt = performance.now()) {
    if (this.frames.length && tick <= this.frames[this.frames.length - 1].tick) return;
    this.frames.push({tick, time: receivedAt, drones: drones.map(d => ({...d}))});
    if (this.frames.length > 60) this.frames.shift();
  }
  sample(now = performance.now()): DroneSnapshot[] {
    if (!this.frames.length) return [];
    const time = now - 100;
    let a = this.frames[0], b = a;
    for (const frame of this.frames) { if (frame.time <= time) a = frame; if (frame.time >= time) { b = frame; break; } b = frame; }
    if (time <= a.time || b.time <= a.time) return a.drones.map(d => ({...d}));
    const t = Math.min(1, (time - a.time) / (b.time - a.time));
    return b.drones.map(d => {
      const prev = a.drones.find(p => p.id === d.id); if (!prev) return {...d};
      const out = {...d};
      for (const key of ['x','y','z','roll','pitch'] as const) out[key] = prev[key] + (d[key] - prev[key]) * t;
      const delta = Math.atan2(Math.sin(d.yaw - prev.yaw), Math.cos(d.yaw - prev.yaw));
      out.yaw = prev.yaw + delta * t; return out;
    });
  }
  clear() { this.frames = []; }
}
