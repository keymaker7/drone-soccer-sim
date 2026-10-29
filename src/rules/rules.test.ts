import { describe, expect, it } from 'vitest';
import { C } from '../sim/constants';
import { createFlight } from '../sim/flight';
import { createMatch, matchReducer } from '../score/match';
import { collideRing, ringDistance, ringsFor } from './ring';
import { createPassage, passageStep } from './passage';
import { armAllowed, createReferee, refereeStep, type RefereeDrone } from './referee';
import { createPractice, practiceStep } from './practice';
const ring = ringsFor().red;
const point = (u: number, rho = 0) => ({ x: ring.x + u, y: ring.y + rho, z: 0 });
function transit(speed = 3, rho = 0, reverse = false) {
  const state = createPassage(), flight = createFlight(), events = [];
  flight.pos = point(reverse ? 0.6 : -0.6, rho); flight.vel = { x: reverse ? -speed : speed, y: 0, z: 0 };
  for (let i = 0; i < 300; i++) {
    const prev = { ...flight.pos };
    for (const axis of ['x', 'y', 'z'] as const) flight.pos[axis] += flight.vel[axis] * C.step;
    collideRing(flight, ring); events.push(...passageStep(state, prev, flight.pos, ring));
  }
  return events;
}
describe('ring and passage', () => {
  it('records one clean centered forward passage at 3 and 30 m/s', () => {
    for (const speed of [3, 30]) expect(transit(speed).filter(e => e.kind === 'pass-forward')).toEqual([{ kind: 'pass-forward', clean: true }]);
  });
  it('keeps 0.09 clean and records a 0.12 rim passage despite its bounce', () => {
    expect(transit(3, 0.09).filter(e => e.kind === 'pass-forward')).toEqual([{ kind: 'pass-forward', clean: true }]);
    expect(transit(3, 0.12).filter(e => e.kind === 'pass-forward')).toEqual([{ kind: 'pass-forward', clean: false }]);
  });
  it('reflects a body strike and never leaves penetration', () => {
    const flight = createFlight(); flight.pos = point(-0.6, 0.4); flight.vel.x = 3;
    let reflected = false;
    for (let i = 0; i < 100; i++) { flight.pos.x += flight.vel.x * C.step; collideRing(flight, ring); expect(ringDistance(flight.pos, ring)).toBeGreaterThanOrEqual(C.radius - 1e-6); reflected ||= flight.vel.x < 0; expect(flight.pos.x).toBeLessThan(ring.x); }
    expect(reflected).toBe(true);
  });
  it('ejects an embedded center through the closest face', () => {
    const flight = createFlight(); flight.pos = point(0, 0.4); collideRing(flight, ring); expect(ringDistance(flight.pos, ring)).toBeCloseTo(C.radius);
  });
  it('does not count returning through the entry side', () => {
    const state = createPassage(), events = []; let prev = point(-0.6);
    for (const u of [-0.2, 0.05, -0.1, -0.6]) { const pos = point(u); events.push(...passageStep(state, prev, pos, ring)); prev = pos; }
    expect(events).toEqual([]);
  });
  it('uses interpolated plane radius instead of either endpoint radius', () => {
    const valid = createPassage(), invalid = createPassage();
    passageStep(valid, point(-0.6, 0.2), point(-0.25, 0.2), ring);
    expect(passageStep(valid, point(-0.25, 0.2), point(0.25, -0.2), ring)).toEqual([]);
    expect(passageStep(valid, point(0.25, -0.2), point(0.4, -0.2), ring).map(e => e.kind)).toEqual(['pass-forward']);
    passageStep(invalid, point(-0.6, 0.18), point(-0.1, 0.18), ring);
    expect(passageStep(invalid, point(-0.1, 0.18), point(0.5, 0), ring)).toEqual([]);
  });
  it('records reverse once', () => expect(transit(3, 0, true).filter(e => e.kind === 'pass-reverse')).toEqual([{ kind: 'pass-reverse', clean: true }]));
});
const drone = (id = 's'): RefereeDrone => ({ id, team: 'blue', role: 'striker', prev: point(-0.6), pos: point(-0.6) });
function judge(role: RefereeDrone['role'], active = true, offside = false, reverse = false, rho = 0) {
  const s = createReferee(), d = drone(), calls = []; d.role = role; d.pos = point(reverse ? 0.6 : -0.6, rho);
  for (const u of reverse ? [0.2, -0.05, -0.3] : [-0.2, 0.05, 0.3]) { d.prev = d.pos; d.pos = point(u, rho); calls.push(...refereeStep(s, [d], { active, offside: { blue: offside, red: false } })); }
  return calls;
}
describe('referee', () => {
  it('awards a striker goal and offside, or only penalty when already offside', () => {
    expect(judge('striker').map(c => c.kind)).toEqual(['goal', 'offside']);
    expect(judge('striker', true, true)).toEqual([{ kind: 'penalty', team: 'blue', id: 's', reason: 'offside-pass' }]);
  });
  it('judges both mirrored goals with their inward-facing front', () => {
    for (const team of ['blue', 'red'] as const) {
      const s = createReferee(), goal = s.rings[team === 'blue' ? 'red' : 'blue'], sign = Math.sign(goal.x), d = drone(), calls = [];
      d.team = team; d.pos = { x: goal.x - sign * 0.6, y: goal.y, z: 0 };
      for (const u of [-0.2, 0.05, 0.3]) { d.prev = d.pos; d.pos = { x: goal.x + sign * u, y: goal.y, z: 0 }; calls.push(...refereeStep(s, [d], { active: true, offside: { blue: false, red: false } })); }
      expect(calls.map(c => [c.kind, c.team])).toEqual([['goal', team], ['offside', team]]);
    }
  });
  it('rejects guides without offside and rejects reverse striker passages with offside', () => {
    expect(judge('guide')).toEqual([{ kind: 'no-goal', team: 'blue', id: 's', reason: 'not-striker' }]);
    expect(judge('striker', true, false, true).map(c => [c.kind, c.reason])).toEqual([['no-goal', 'reverse'], ['offside', undefined]]);
  });
  it('clears offside once only when every body is home', () => {
    const s = createReferee(), a = drone('a'), b = drone('b'), match = { active: true, offside: { blue: true, red: false } };
    a.prev = a.pos = { x: -1, y: 1, z: 0 }; b.prev = b.pos = { x: -0.1, y: 1, z: 0 };
    expect(refereeStep(s, [a,b], match)).toEqual([]); b.pos.x = -0.2;
    expect(refereeStep(s, [a,b], match)).toEqual([{ kind: 'offside-clear', team: 'blue' }]); expect(refereeStep(s, [a,b], match)).toEqual([]);
  });
  it('penalizes own-goal back entry once until a full retreat', () => {
    const s = createReferee(), d = drone(), calls = []; d.role = 'keeper'; d.pos = { x: -ring.x - 0.6, y: 3, z: 0 };
    for (const u of [0.2, 0.1, 0.2, 0.6, 0.2]) { d.prev = d.pos; d.pos = { x: -ring.x - u, y: 3, z: 0 }; calls.push(...refereeStep(s, [d], { active: true, offside: { blue: false, red: false } })); }
    expect(calls).toEqual(Array.from({ length: 2 }, () => ({ kind: 'penalty', team: 'blue', id: 's', reason: 'own-goal-back' })));
  });
  it('retains the back-entry latch across a forward exit until fully behind again', () => {
    const s = createReferee(), d = drone(), calls = []; d.role = 'keeper'; d.pos = { x: -ring.x - 0.6, y: 3, z: 0 };
    for (const u of [0.2, -0.1, -0.4, -0.2, 0.1, 0.6, 0.2]) { d.prev = d.pos; d.pos = { x: -ring.x - u, y: 3, z: 0 }; calls.push(...refereeStep(s, [d], { active: true, offside: { blue: false, red: false } })); }
    expect(calls.filter(c => c.reason === 'own-goal-back')).toHaveLength(2);
  });
  it('records a rim no-goal with offside after an actual collision', () => {
    const s = createReferee(), d = drone(), flight = createFlight(), calls = [];
    flight.pos = point(-0.6, 0.12); flight.vel.x = 3;
    for (let i = 0; i < 100; i++) {
      d.prev = { ...flight.pos };
      for (const axis of ['x', 'y', 'z'] as const) flight.pos[axis] += flight.vel[axis] * C.step;
      collideRing(flight, ring); d.pos = { ...flight.pos };
      calls.push(...refereeStep(s, [d], { active: true, offside: { blue: false, red: false } }));
    }
    expect(calls.map(c => [c.kind, c.reason])).toEqual([['no-goal', 'rim'], ['offside', undefined]]);
  });
  it('updates tracking without calls when inactive', () => expect(judge('striker', false)).toEqual([]));
  it('allows only free practice, active play and finished', () => {
    const s = createMatch(); expect(armAllowed(s)).toBe(true); s.running = true; expect(armAllowed(s)).toBe(false);
    s.phase = 'playing'; expect(armAllowed(s)).toBe(true); s.running = false; expect(armAllowed(s)).toBe(false);
    const paused = matchReducer(matchReducer(createMatch(), { type: 'start', now: 0 }), { type: 'pause', now: 1 }); expect(armAllowed(paused)).toBe(false);
    s.phase = 'maintenance'; expect(armAllowed(s)).toBe(false); s.phase = 'finished'; expect(armAllowed(s)).toBe(true);
  });
});
it('practice counts clean passes and rising rim contacts only', () => {
  const s = createPractice(); let prev = point(-0.6);
  for (const u of [-0.2, 0.05, 0.3]) { const pos = point(u); practiceStep(s, prev, pos); prev = pos; }
  expect(s.passes).toBe(1);
  const touch = point(0, 0.1); practiceStep(s, prev, touch); practiceStep(s, touch, touch); expect(s.rimTouches).toBe(1);
  practiceStep(s, touch, point(-0.6)); for(let i=1;i<60;i++) practiceStep(s, point(-0.6), point(-0.6)); practiceStep(s, point(-0.6), touch); expect(s.rimTouches).toBe(2);
});
