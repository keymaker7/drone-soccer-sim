import { C, type Arena } from '../sim/constants';
import { createFlight, stepFlight, collide, type FlightState } from '../sim/flight';
import { createInput, type InputState } from '../sim/input';
import { Lobby } from './lobby';
import { armAllowed, createReferee, refereeStep } from '../rules/referee';
import type { MatchStore } from '../score/store';
import { rolesFor, ROLE_LABELS, type Team, type Role, type DisarmReason, type Controls, type DroneSnapshot, type Message } from './protocol';
import { PeerTransport, type Transport, type NetStats } from './transport';
export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';
interface Drone { flight: FlightState; input: InputState; axes: Controls['axes']; lastInput: number; seq: number; lock: boolean }
export function collideDrones(a: FlightState, b: FlightState, arena?: Arena): boolean {
  const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dy, dz); if (dist >= .4) return false;
  // An exact coincidence uses the lateral axis, which also works against an end wall.
  const n = dist > 1e-9 ? {x:dx/dist,y:dy/dist,z:dz/dist} : {x:0,y:0,z:1};
  const capacity = (s: FlightState, direction: number) => {
    if (!arena) return Infinity;
    const bounds = {x:[-arena.halfLength+C.radius,arena.halfLength-C.radius],y:[C.radius,arena.height-C.radius],z:[-arena.halfWidth+C.radius,arena.halfWidth-C.radius]};
    let available = Infinity;
    for (const k of ['x','y','z'] as const) {
      const component = n[k]*direction;
      if (Math.abs(component)>1e-9) available = Math.min(available,Math.max(0,(bounds[k][component>0?1:0]-s.pos[k])/component));
    }
    return available;
  };
  const penetration = .400001-dist;
  const capA = capacity(a,-1), capB = capacity(b,1);
  let moveA = Math.min(penetration/2,capA), moveB = Math.min(penetration-moveA,capB);
  moveA = Math.min(capA,penetration-moveB);
  for (const k of ['x','y','z'] as const) { a.pos[k] -= n[k]*moveA; b.pos[k] += n[k]*moveB; }
  const relative = (b.vel.x-a.vel.x)*n.x + (b.vel.y-a.vel.y)*n.y + (b.vel.z-a.vel.z)*n.z;
  if (relative < 0) for (const k of ['x','y','z'] as const) { const impulse = -(1+.35)*relative/2*n[k]; a.vel[k] -= impulse; b.vel[k] += impulse; }
  return true;
}
export function formationFor(team: Team, role: Role, maxPerTeam: 3 | 5, arena: Arena): FlightState {
  const flight = createFlight(arena), index = rolesFor(maxPerTeam).indexOf(role);
  flight.pos = {x:(team === 'blue' ? -1 : 1)*(arena.halfLength-2.5),y:C.radius,z:(index-(maxPerTeam-1)/2)*.75}; flight.yaw = team === 'blue' ? 0 : Math.PI; return flight;
}
export class HostSession {
  readonly room: string; arena: Arena; maxPerTeam: 3 | 5; status: SessionStatus = 'idle'; error = ''; readonly myId = null;
  readonly lobby: Lobby;
  readonly simulation = new Map<string, Drone>();
  private transport: Transport; private peers = new Set<string>(); private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>; private tick = 0; private lastTime = 0; private accumulator = 0;
  private rtts = new Map<string, number[]>(); private pending = new Map<string, number>(); private lastPing = 0;
  private match?: MatchStore; private unsubscribe?: () => void; private referee: ReturnType<typeof createReferee>;
  constructor(options: { room: string; arena: Arena; maxPerTeam: 3 | 5; transport?: Transport; match?: MatchStore }) {
    this.room = options.room; this.arena = options.arena; this.maxPerTeam = options.maxPerTeam; this.lobby = new Lobby(options.maxPerTeam); this.transport = options.transport ?? new PeerTransport();
    this.referee = createReferee(this.arena); this.match = options.match;
    this.unsubscribe = this.match?.subscribe((state,previous) => {
      if (armAllowed(previous) && !armAllowed(state)) { this.disarmAll(); const reason: DisarmReason = state.phase === 'ready' ? 'ready' : state.phase === 'maintenance' ? 'maintenance' : 'paused'; this.broadcast({v:1,type:'disarm',reason}); }
      if (state.phase === 'ready' && state.running && (!previous.running || previous.phase !== 'ready') || state.phase === 'maintenance' && previous.phase !== 'maintenance') this.resetFormation();
      this.sendMatch();
    });
    this.transport.onPeer((id, connected) => { if (connected) { this.peers.add(id); this.sendRoster(); this.sendMatch(); } else { this.peers.delete(id); this.lobby.leave(id); this.simulation.delete(id); this.rtts.delete(id); this.pending.delete(id); this.sendRoster(); } this.changed(); });
    this.transport.onMessage((id, message) => this.receive(id, message));
    this.transport.onError(error => { this.error = error; this.status = 'error'; this.changed(); });
  }
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { for (const fn of this.listeners) fn(); }
  get roster() { return this.lobby.roster; }
  get drones(): DroneSnapshot[] { return this.roster.flatMap(p => { const d = this.simulation.get(p.id); return d ? [{id:p.id,team:p.team,role:p.role,...d.flight.pos,x:d.flight.pos.x,y:d.flight.pos.y,z:d.flight.pos.z,roll:d.flight.roll,pitch:d.flight.pitch,yaw:d.flight.yaw,armed:d.input.armed,motorThrottle:d.input.motorThrottle,vy:d.flight.vel.y}] : []; }); }
  setConfig(config: {arena: Arena; maxPerTeam: 3 | 5}) { if (this.roster.length) return false; this.arena = config.arena; this.maxPerTeam = config.maxPerTeam; this.lobby.maxPerTeam = config.maxPerTeam; this.referee = createReferee(this.arena); this.sendRoster(); this.changed(); return true; }
  configure(config: {arena: Arena; maxPerTeam: 3 | 5}) { return this.setConfig(config); }
  async start() { this.status = 'connecting'; this.changed(); try { await this.transport.open({role:'host',room:this.room}); if ((this.status as SessionStatus) === 'closed') return; this.status = 'connected'; this.lastTime = performance.now(); this.timer = setInterval(() => { const now = performance.now(); this.advance(now - this.lastTime, now); this.lastTime = now; }, 1000/120); this.changed(); } catch (e) { this.error = e instanceof Error ? e.message : String(e); this.status = 'error'; this.changed(); throw e; } }
  private broadcast(message: Message) { for (const id of this.peers) this.transport.send(id,message); }
  private sendMatch() { if (!this.match) return; const {phase,set,running,remaining,teams} = this.match.get(); this.broadcast({v:1,type:'match',phase,set,running,remaining,teams}); }
  private resetFormation() { for (const p of this.roster) { const d = this.simulation.get(p.id); if (d) { d.flight = formationFor(p.team,p.role,this.maxPerTeam,this.arena); d.axes = {pitch:0,roll:0,yaw:0}; d.input.climbIntegral = 0; } } this.referee = createReferee(this.arena); }
  private judge(prev: Map<string, FlightState['pos']>) {
    if (!this.match) return;
    const now = Date.now(), state = this.match.get();
    if (state.running && state.deadline !== null && now >= state.deadline) { this.match.dispatch({type:'tick',now}); return; }
    const drones = this.roster.flatMap(p => { const d = this.simulation.get(p.id), before = prev.get(p.id); return d && before ? [{id:p.id,team:p.team,role:p.role,prev:before,pos:d.flight.pos}] : []; });
    const calls = refereeStep(this.referee,drones,{active:state.phase === 'playing' && state.running,offside:{blue:state.teams.blue.offside,red:state.teams.red.offside}});
    for (const call of calls) {
      const pilot = this.roster.find(p => p.id === call.id), by = pilot ? `${pilot.nick} · ${ROLE_LABELS[pilot.role]}` : undefined, meta = {team:call.team,by,auto:true,now};
      if (call.kind === 'goal') this.match.dispatch({type:'score',delta:1,...meta});
      else if (call.kind === 'penalty') this.match.dispatch({type:'penalty',reason:call.reason,...meta});
      else if (call.kind === 'offside' || call.kind === 'offside-clear') this.match.dispatch({type:'offside',on:call.kind === 'offside',...meta});
      this.broadcast({v:1,type:'call',...call,...(pilot ? {nick:pilot.nick} : {})});
    }
  }
  private sendRoster() { for (const id of this.peers) this.transport.send(id, {v:1,type:'roster',roster:this.roster,arena:this.arena,maxPerTeam:this.maxPerTeam}); }
  private receive(id: string, message: Message) {
    if (!this.peers.has(id)) return;
    if (message.type === 'hello') {
      const reason = this.lobby.join(id,message.nick,message.team,message.role);
      if (reason) { this.transport.send(id,{v:1,type:'reject',reason}); return; }
      const flight = formationFor(message.team,message.role,this.maxPerTeam,this.arena);
      this.simulation.set(id,{flight,input:createInput('manual'),axes:{pitch:0,roll:0,yaw:0},lastInput:performance.now(),seq:-1,lock:false});
      this.transport.send(id,{v:1,type:'welcome',id,arena:this.arena,maxPerTeam:this.maxPerTeam}); this.sendRoster(); this.changed();
    } else if (message.type === 'input') {
      const d = this.simulation.get(id); if (!d || message.seq <= d.seq) return;
      d.seq = message.seq; d.lastInput = performance.now(); d.axes = {...message.axes};
      if (!message.armed) { d.input.armed = false; d.input.motorThrottle = 0; d.input.climbIntegral = 0; d.lock = false; }
      // Mode changes require DISARM; absent fields preserve v:1 manual clients.
      const mode = message.throttleMode ?? 'manual';
      if (!d.input.armed) d.input.throttleMode = mode;
      if (mode !== d.input.throttleMode) return;
      d.input.climb = message.climb ?? 0; d.input.fine = message.fine ?? false;
      if ((!this.match || armAllowed(this.match.get())) && message.armed && !d.input.armed && !d.lock && (mode === 'easy' ? d.input.climb <= 0 : message.throttle <= C.armThreshold)) d.input.armed = true;
      if (mode === 'manual') d.input.throttle = message.throttle;
    } else if (message.type === 'ping') this.transport.send(id,{v:1,type:'pong',t:message.t});
    else if (message.type === 'pong' && this.pending.get(id) === message.t) { const r = this.rtts.get(id) ?? []; r.push(performance.now()-message.t); if (r.length>10) r.shift(); this.rtts.set(id,r); this.pending.delete(id); }
  }
  advance(elapsedMs: number, now = performance.now()) {
    // Interval callbacks retain elapsed time and always advance in 120 Hz fixed steps.
    this.accumulator += Math.max(0,elapsedMs)/1000;
    for (const d of this.simulation.values()) if (now-d.lastInput >= 1000) { d.input.armed = false; d.input.motorThrottle = 0; d.input.throttle = 0; d.lock = true; }
    // Carry backlog forward, but yield after 240 steps so long OS suspensions cannot freeze the UI.
    let steps = 0;
    while (this.accumulator + 1e-10 >= C.step && steps++ < 240) {
      const match = this.match?.get(), clock = Date.now();
      if (match?.running && match.deadline !== null && clock >= match.deadline) this.match!.dispatch({type:'tick',now:clock});
      const prev = new Map([...this.simulation].map(([id,d]) => [id,{...d.flight.pos}]));
      for (const d of this.simulation.values()) stepFlight(d.flight,d.input,C.step,this.arena,d.axes);
      const ds = [...this.simulation.values()];
      for (let pass=0; pass<200; pass++) { let overlap = false; for (let i=0;i<ds.length;i++) for (let j=i+1;j<ds.length;j++) overlap = collideDrones(ds[i].flight,ds[j].flight,this.arena) || overlap; for (const d of ds) collide(d.flight,this.arena); if (!overlap) break; }
      this.judge(prev); this.tick++; this.accumulator -= C.step;
      if (this.tick % 12 === 0) this.match?.dispatch({type:'tick',now:Date.now()});
      if (this.tick % 4 === 0) for (const id of this.peers) this.transport.send(id,{v:1,type:'state',tick:this.tick,drones:this.drones});
    }
    if (now-this.lastPing >= 1000) { this.lastPing = now; this.sendMatch(); for (const id of this.peers) { const t = Math.round(performance.now()*1000)/1000; this.pending.set(id,t); this.transport.send(id,{v:1,type:'ping',t}); } }
  }
  disarmAll() { for (const d of this.simulation.values()) { d.input.armed = false; d.input.motorThrottle = 0; d.input.throttle = 0; d.lock = true; } this.changed(); }
  async stats(): Promise<NetStats> { const s = await this.transport.stats(); const rtts = [...this.rtts.values()].flat(); return {...s,rttMs:rtts.length ? Math.round(rtts.reduce((a,b)=>a+b,0)/rtts.length) : s.rttMs}; }
  async peerStats() { const entries = await Promise.all([...this.peers].map(async id => { const s = await this.transport.stats(id); const r = this.rtts.get(id) ?? []; return [id,{...s,rttMs:r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : s.rttMs}] as const; })); return Object.fromEntries(entries); }
  close() { this.unsubscribe?.(); if (this.timer) clearInterval(this.timer); this.status = 'closed'; this.transport.close(); this.simulation.clear(); this.lobby.members.clear(); this.peers.clear(); this.changed(); }
}
