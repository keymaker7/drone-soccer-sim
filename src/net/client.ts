import { DEFAULT_ARENA, type Arena } from '../sim/constants';
import { Interpolator } from './interp';
import type { Controls, DisarmReason, DroneSnapshot, Message, MatchSnapshot, RuleCall, Role, RosterEntry, Team } from './protocol';
import { PeerTransport, type Transport } from './transport';
import type { SessionStatus } from './host';
export type ClientEvent = {type: 'forcedDisarm'; reason: DisarmReason};
type Join = {nick: string; team: Team; role: Role};
export class ClientSession {
  readonly room: string; status: SessionStatus = 'idle'; error = ''; myId: string | null = null; arena: Arena = DEFAULT_ARENA; maxPerTeam: 3 | 5 = 3;
  match: (MatchSnapshot & {receivedAt: number}) | null = null; calls: RuleCall[] = [];
  lastDisarmReason: DisarmReason | null = null;
  roster: RosterEntry[] = []; drones: DroneSnapshot[] = [];
  private transport: Transport; private host = ''; private initial?: Join; private listeners = new Set<(event?: ClientEvent) => void>(); private interp = new Interpolator();
  private controls: Controls = {axes:{pitch:0,roll:0,yaw:0},throttle:0,armed:false}; private seq = 0;
  private timer?: ReturnType<typeof setInterval>; private pingTimer?: ReturnType<typeof setInterval>; private rtts: number[] = []; private pending = new Set<number>(); private received: number[] = []; private newestTick = -1;
  constructor(options: {room: string; transport?: Transport} & Partial<Join>) {
    this.room = options.room; this.transport = options.transport ?? new PeerTransport();
    if (options.nick && options.team && options.role) this.initial = options as Join;
    this.transport.onPeer((id, connected) => { if (connected) this.host = id; else if (id === this.host && this.status !== 'closed') { this.status = 'closed'; this.error = '방이 닫혔어요'; this.stopTimers(); this.changed(); } });
    this.transport.onError(error => { this.error = error; this.status = 'error'; this.changed(); });
    this.transport.onMessage((id, message) => { if (id === this.host) this.receive(message); });
  }
  onChange(fn: (event?: ClientEvent) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(event?: ClientEvent) { for (const fn of this.listeners) fn(event); }
  async start() {
    this.status = 'connecting'; this.changed();
    try { await this.transport.open({role:'client',room:this.room}); if ((this.status as SessionStatus) === 'closed') return; this.status = 'connected'; if (this.initial) this.join(this.initial);
      this.timer = setInterval(() => this.transmitInput(),1000/30);
      this.pingTimer = setInterval(() => { const t = Math.round(performance.now()*1000)/1000; this.pending.add(t); if (this.pending.size>10) this.pending.delete(this.pending.values().next().value!); this.transport.send(this.host,{v:1,type:'ping',t}); },1000); this.changed();
    } catch(e) { this.error = e instanceof Error ? e.message : String(e); this.status = 'error'; this.changed(); throw e; }
  }
  join(options: Join) { if (!this.host || this.myId) return; this.error = ''; this.transport.send(this.host,{v:1,type:'hello',...options}); }
  sendInput(controls: Controls) {
    const next = {...controls,axes:{...controls.axes}};
    // Enforce ARM safety on both sides of the network boundary.
    const unsafeArm = next.throttleMode === 'easy' ? (next.climb ?? 0) > 0 : next.throttle > .05;
    if (!this.controls.armed && next.armed && unsafeArm) next.armed = false;
    const changed = JSON.stringify(next) !== JSON.stringify(this.controls); this.controls = next;
    if (changed) this.transmitInput();
  }
  private transmitInput() { if (this.myId && this.status === 'connected') this.transport.send(this.host,{v:1,type:'input',seq:this.seq++,...this.controls}); }
  disarm() { this.controls = {axes:{pitch:0,roll:0,yaw:0},throttle:0,armed:false,throttleMode:this.controls.throttleMode,climb:0,fine:false}; this.transmitInput(); }
  private receive(message: Message) {
    if (message.type === 'match') { const {v:_,type:__,...snapshot} = message; this.match = {...snapshot,receivedAt:performance.now()}; }
    else if (message.type === 'call') { const {v:_,type:__,...call} = message; this.calls = [...this.calls,call].slice(-5); }
    else if (message.type === 'disarm') { this.lastDisarmReason = message.reason; this.disarm(); this.changed({type:'forcedDisarm',reason:message.reason}); return; }
    else if (message.type === 'welcome') { this.myId = message.id; this.arena = message.arena; this.maxPerTeam = message.maxPerTeam; this.transmitInput(); }
    else if (message.type === 'roster') { this.roster = message.roster; if (message.arena) this.arena = message.arena; if (message.maxPerTeam) this.maxPerTeam = message.maxPerTeam; }
    else if (message.type === 'reject') this.error = message.reason;
    else if (message.type === 'state') { if (message.tick <= this.newestTick) return; this.newestTick = message.tick; const now = performance.now(); this.drones = message.drones; this.interp.push(message.tick,message.drones,now); this.received.push(now); this.received = this.received.filter(t => now-t<1000); }
    else if (message.type === 'pong' && this.pending.has(message.t)) { this.pending.delete(message.t); this.rtts.push(performance.now()-message.t); if (this.rtts.length>10) this.rtts.shift(); }
    else if (message.type === 'ping') this.transport.send(this.host,{v:1,type:'pong',t:message.t});
    this.changed();
  }
  remaining(now = performance.now()) { return this.match ? Math.max(0,this.match.remaining-(this.match.running ? now-this.match.receivedAt : 0)) : 0; }
  sample(now = performance.now()) { return this.interp.sample(now); }
  async stats() { const s = await this.transport.stats(this.host); const now = performance.now(); return {...s,rttMs:this.rtts.length ? Math.round(this.rtts.reduce((a,b)=>a+b,0)/this.rtts.length) : s.rttMs,statesPerSec:this.received.filter(t => now-t<1000).length}; }
  private stopTimers() { if (this.timer) clearInterval(this.timer); if (this.pingTimer) clearInterval(this.pingTimer); }
  close() { this.disarm(); this.status = 'closed'; this.stopTimers(); this.transport.close(); this.interp.clear(); this.drones = []; this.changed(); }
}
