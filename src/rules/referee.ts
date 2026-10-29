import { C, DEFAULT_ARENA, type Arena } from '../sim/constants';
import type { Vec3 } from '../sim/flight';
import type { Snapshot, Team } from '../score/match';
import type { Role } from '../net/protocol';
import { createPassage, passageStep, type PassageState } from './passage';
import { ringsFor } from './ring';
export type CallReason = 'offside-pass' | 'own-goal-back' | 'rim' | 'not-striker' | 'reverse';
export interface Call { kind: 'goal' | 'offside' | 'offside-clear' | 'penalty' | 'no-goal'; team: Team; id?: string; reason?: CallReason }
export interface RefereeDrone { id: string; team: Team; role: Role; prev: Vec3; pos: Vec3 }
export const createReferee = (arena: Arena = DEFAULT_ARENA) => ({ rings: ringsFor(arena), passages: new Map<string, Record<Team, PassageState>>(), cleared: { blue: false, red: false } });
export type RefereeState = ReturnType<typeof createReferee>;
export function refereeStep(s: RefereeState, drones: RefereeDrone[], match: { active: boolean; offside: Record<Team, boolean> }): Call[] {
  const calls: Call[] = [], offside = { ...match.offside };
  for (const id of s.passages.keys()) if (!drones.some(d => d.id === id)) s.passages.delete(id);
  for (const d of drones) {
    let tracks = s.passages.get(d.id);
    if (!tracks) { tracks = { blue: createPassage(), red: createPassage() }; s.passages.set(d.id, tracks); }
    for (const goal of ['blue', 'red'] as const) for (const event of passageStep(tracks[goal], d.prev, d.pos, s.rings[goal])) {
      if (!match.active) continue;
      const call = (kind: Call['kind'], reason?: CallReason) => calls.push({ kind, team: d.team, id: d.id, ...(reason ? { reason } : {}) });
      if (goal === d.team) { if (event.kind === 'back-entry') call('penalty', 'own-goal-back'); continue; }
      if (event.kind === 'back-entry') continue;
      if (d.role !== 'striker') { if (event.kind === 'pass-forward') call('no-goal', 'not-striker'); continue; }
      if (offside[d.team]) { call('penalty', 'offside-pass'); continue; }
      if (event.kind === 'pass-reverse') call('no-goal', 'reverse');
      else if (!event.clean) call('no-goal', 'rim');
      else call('goal');
      call('offside'); offside[d.team] = true;
    }
  }
  for (const team of ['blue', 'red'] as const) {
    if (!offside[team]) s.cleared[team] = false;
    const teammates = drones.filter(d => d.team === team);
    if (match.active && offside[team] && !s.cleared[team] && teammates.length && teammates.every(d => team === 'blue' ? d.pos.x <= -C.radius : d.pos.x >= C.radius)) {
      calls.push({ kind: 'offside-clear', team }); s.cleared[team] = true;
    }
  }
  return calls;
}
export function armAllowed(s: Pick<Snapshot, 'phase' | 'running' | 'records'> & { history?: Snapshot[] }): boolean {
  return s.phase === 'finished' || s.phase === 'playing' && s.running || s.phase === 'ready' && !s.running && s.records.length === 0 && !s.history?.length;
}
