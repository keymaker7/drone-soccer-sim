import { afterEach, describe, expect, it, vi } from 'vitest';
import { C } from './constants';
import { climbControl } from './climb';
import { createFlight, stepFlight } from './flight';
import { changeThrottleMode, createInput, loadThrottleMode, loseFocus, readInput, saveThrottleMode, toggleArm } from './input';
const arena = { halfLength: 100, halfWidth: 100, height: 100 };
afterEach(() => vi.unstubAllGlobals());
describe('FIX-6 easy climb control', () => {
  it.each([[0, false, C.climbSpeed.idle, 0.15], [1, false, 1.5, 0.15], [-1, false, -1.8, 0.2], [1, true, 0.5, 0.1]] as const)('climb %s fine %s converges in two seconds', (climb, fine, target, tolerance) => {
    const flight = createFlight(), input = createInput(); flight.pos = { x: 0, y: 10, z: 0 }; input.armed = true; input.climb = climb; input.fine = fine;
    for (let n = 0; n < 240; n++) stepFlight(flight, input, C.step, arena, { pitch: 0, roll: 0, yaw: 0 });
    expect(Math.abs(flight.vel.y - target)).toBeLessThanOrEqual(tolerance);
  });
  it('releasing up settles to slow descent, then lands without bounce or slide', () => {
    const flight = createFlight(), input = createInput(); toggleArm(input); input.keys.add('KeyW');
    for (let n = 0; n < 240; n++) stepFlight(flight, input, C.step);
    expect(flight.pos.y).toBeGreaterThan(2); input.keys.clear();
    for (let n = 0; n < 240; n++) stepFlight(flight, input, C.step);
    expect(Math.abs(flight.vel.y - C.climbSpeed.idle)).toBeLessThan(.15);
    input.keys.add('ArrowUp');
    for (let n = 0; n < 1200; n++) stepFlight(flight, input, C.step);
    expect(flight.pos.y).toBe(C.radius); expect(flight.vel).toEqual({x:0,y:0,z:0}); expect(input.motorThrottle).toBe(0);
  });
  it('grounded with no up command has zero thrust and keeps position even while tilting', () => {
    const flight = createFlight(), input = createInput(); input.armed = true; input.keys.add('ArrowUp');
    const start = { ...flight.pos };
    for (let n = 0; n < 600; n++) stepFlight(flight, input, C.step);
    expect(flight.pos).toEqual(start); expect(input.throttle).toBe(0); expect(input.motorThrottle).toBe(0);
  });
  it('30 degree forward tilt maintains slow descent', () => {
    const flight = createFlight(), input = createInput(); flight.pos = {x:0,y:10,z:0}; input.armed = true;
    for (let n = 0; n < 240; n++) stepFlight(flight, input, C.step, arena, {pitch:-30/35,roll:0,yaw:0});
    expect(Math.abs(flight.vel.y - C.climbSpeed.idle)).toBeLessThan(.25); expect(flight.vel.x).toBeGreaterThan(1);
  });
  it('held up remains bounded at ceiling and never accumulates runaway integral', () => {
    const flight = createFlight(), input = createInput(); input.armed = true; input.keys.add('KeyW'); let lowest = Infinity;
    for (let n = 0; n < 2400; n++) { stepFlight(flight, input, C.step); expect(flight.pos.y).toBeLessThanOrEqual(C.arena.height-C.radius); if (n > 1200) lowest = Math.min(lowest, flight.pos.y); }
    expect(lowest).toBeGreaterThan(C.arena.height-C.radius-.1); expect(Math.abs(input.climbIntegral)).toBeLessThanOrEqual(2);
  });
  it.each([1,2] as const)('easy ARM checks actual up key in stick mode %s including simultaneous down', mode => {
    const input = createInput(); input.stickMode = mode; const up = mode === 2 ? 'KeyW' : 'ArrowUp', down = mode === 2 ? 'KeyS' : 'ArrowDown';
    input.keys.add(up); expect(toggleArm(input)).toBe(false); input.keys.add(down); expect(toggleArm(input)).toBe(false);
    input.keys.delete(up); input.throttle = .9; expect(toggleArm(input)).toBe(true); expect(toggleArm(input)).toBe(true);
  });
  it('mode change is DISARM-only, clears old input, persists and tolerates unavailable storage', () => {
    const data = new Map<string,string>(); vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k),setItem:(k:string,v:string)=>data.set(k,v)});
    expect(loadThrottleMode()).toBe('easy'); const input=createInput(); input.armed=true;
    expect(changeThrottleMode(input,'manual')).toBe(false); input.armed=false; input.keys.add('KeyW');
    expect(changeThrottleMode(input,'manual')).toBe(true); saveThrottleMode(input.throttleMode); expect(loadThrottleMode()).toBe('manual'); expect(input.keys.size).toBe(0);
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error();},setItem:()=>{throw Error();}});
    expect(loadThrottleMode()).toBe('easy'); expect(()=>saveThrottleMode('manual')).not.toThrow();
  });
  it('reads centered spring input and focus loss cuts every controller state', () => {
    const input=createInput(); input.keys.add('KeyW'); input.keys.add('ShiftRight'); readInput(input,C.step); expect(input.climb).toBe(1); expect(input.fine).toBe(true);
    input.keys.clear(); readInput(input,C.step); expect(input.climb).toBe(0); input.armed=true; input.climbIntegral=2; loseFocus(input);
    expect(input.climbIntegral).toBe(0); expect(input.motorThrottle).toBe(0); expect(input.armed).toBe(false);
    expect(climbControl({altitude:5,vy:1,pitch:0,roll:0,integral:1},1,false,false,C.step).throttle).toBe(0);
  });
});
