import { describe, expect, it, vi, afterEach } from 'vitest';
import { C, DEFAULT_ARENA } from '../sim/constants';
import { createInput } from '../sim/input';
import { createFlight, stepFlight } from '../sim/flight';
import { decode, encode, rolesFor, type Message, type DroneSnapshot } from './protocol';
import { Lobby } from './lobby';
import { Interpolator } from './interp';
import { HostSession, collideDrones } from './host';
import { ClientSession } from './client';
import { emptyStats, classifyCandidates, type Transport } from './transport';
class MemoryTransport implements Transport {
  static rooms = new Map<string, MemoryTransport>(); static count = 0;
  id = `client-${MemoryTransport.count++}`; links = new Map<string,MemoryTransport>();
  messages = new Set<(id: string,m: Message)=>void>(); peers = new Set<(id:string,c:boolean)=>void>();
  async open(o:{role:'host'|'client';room:string}) {
    if (o.role==='host') { this.id=`dsoccer-${o.room}`; MemoryTransport.rooms.set(o.room,this); }
    else { const host = MemoryTransport.rooms.get(o.room)!; this.links.set(host.id,host);host.links.set(this.id,this); for(const f of this.peers) f(host.id,true); for(const f of host.peers) f(this.id,true); }
  }
  send(id:string,m:Message) { const target=this.links.get(id); const decoded=decode(encode(m)); if(target && decoded) for(const f of target.messages) f(this.id,decoded); }
  onMessage(f:(id:string,m:Message)=>void) {this.messages.add(f);return()=>{this.messages.delete(f);};}
  onPeer(f:(id:string,c:boolean)=>void) {this.peers.add(f);return()=>{this.peers.delete(f);};}
  onError(_f:(m:string)=>void) {return()=>{};}
  close(){for(const p of this.links.values()){p.links.delete(this.id);for(const f of p.peers)f(this.id,false);}this.links.clear();}
  async stats(){return {...emptyStats(),peers:this.links.size};}
}
const frame=(x:number):DroneSnapshot[]=>[{id:'a',team:'blue',role:'striker',x,y:1,z:0,roll:0,pitch:0,yaw:0,armed:true}];
afterEach(()=>{vi.useRealTimers();MemoryTransport.rooms.clear();});
describe('protocol',()=>{
 it('round trips messages and rounds numeric bandwidth',()=>{const m:Message={v:1,type:'input',seq:1,axes:{pitch:.123456,roll:0,yaw:-1},throttle:.555555,armed:true};expect(decode(encode(m))).toEqual({...m,axes:{...m.axes,pitch:.123},throttle:.556});});
 it('validates optional easy controls while preserving legacy v:1 messages',()=>{
  const base:Message={v:1,type:'input',seq:1,axes:{pitch:0,roll:0,yaw:0},throttle:0,armed:false};
  expect(decode(base)).toEqual(base); expect(decode({...base,throttleMode:'easy',climb:-1,fine:true})).toBeTruthy();
  for(const fields of [{throttleMode:'bad'},{climb:2},{climb:.5},{fine:1}]) expect(decode({...base,...fields})).toBeNull();
 });
 it('ignores malformed or untrusted data',()=>{for(const m of ['{',null,{v:2,type:'ping',t:0},{v:1,type:'input',seq:2,axes:{pitch:NaN,roll:0,yaw:0},throttle:1,armed:true},{v:1,type:'hello',nick:'123456789',team:'blue',role:'striker'},{v:1,type:'welcome',id:'a',arena:{halfLength:0,halfWidth:2,height:4},maxPerTeam:3}])expect(decode(m)).toBeNull();});
});
describe('lobby',()=>{
 for(const max of [3,5] as const)it(`${max}:${max} capacity and reopened role`,()=>{const lobby=new Lobby(max);for(const team of ['blue','red'] as const)for(const role of rolesFor(max))expect(lobby.join(team+role,'pilot',team,role)).toBeNull();expect(lobby.roster).toHaveLength(max*2);expect(lobby.join('extra','pilot','blue','striker')).toBeTruthy();lobby.leave('bluestriker');expect(lobby.join('replacement','pilot','blue','striker')).toBeNull();});
 it('rejects duplicate and unavailable roles',()=>{const lobby=new Lobby(3);lobby.join('a','a','blue','keeper');expect(lobby.join('b','b','blue','keeper')).toBeTruthy();expect(lobby.join('c','c','blue','libero')).toBeTruthy();});
});
describe('interpolation',()=>{
 it('delays by 100ms and interpolates dropped packets without rewind',()=>{const i=new Interpolator();i.push(0,frame(0),0);i.push(12,frame(10),100);expect(i.sample(150)[0].x).toBe(5);i.push(6,frame(100),110);expect(i.sample(150)[0].x).toBe(5);i.push(36,frame(30),300);expect(i.sample(300)[0].x).toBe(20);expect(i.sample(1000)[0].x).toBe(30);});
 it('takes shortest yaw arc',()=>{const i=new Interpolator();i.push(0,[{...frame(0)[0],yaw:Math.PI-.1}],0);i.push(1,[{...frame(0)[0],yaw:-Math.PI+.1}],100);expect(i.sample(150)[0].yaw).toBeCloseTo(Math.PI);});
});
describe('authoritative host and clients',()=>{
 async function setup(count=3){vi.useFakeTimers();const ht=new MemoryTransport();const host=new HostSession({room:'ABCD',arena:DEFAULT_ARENA,maxPerTeam:3,transport:ht});await host.start();const clients:ClientSession[]=[];for(let n=0;n<count;n++){const c=new ClientSession({room:'ABCD',nick:`pilot${n}`,team:n<3?'blue':'red',role:rolesFor(3)[n%3],transport:new MemoryTransport()});await c.start();clients.push(c);}return {host,clients,ht};}
 it('easy host input uses the same controller as local flight, with release descent and HUD telemetry',async()=>{
  const {host,clients}=await setup(1); const client=clients[0]; const drone=host.simulation.get(client.myId!)!;
  const local=createFlight(); local.pos={...drone.flight.pos}; local.yaw=drone.flight.yaw; const input=createInput(); input.armed=true;
  client.sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:1,throttleMode:'easy',climb:0,fine:false}); expect(drone.input.armed).toBe(true);
  for (const climb of [1,0] as const) {
   input.climb=climb;
   for(let n=0;n<240;n++) {
    client.sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:1,throttleMode:'easy',climb,fine:false});
    host.advance(1000/120); stepFlight(local,input,C.step,host.arena,{pitch:0,roll:0,yaw:0});
   }
   expect(drone.flight).toEqual(local);
  }
  expect(Math.abs(drone.flight.vel.y-C.climbSpeed.idle)).toBeLessThan(.15); expect(host.drones[0].vy).toBe(drone.flight.vel.y); expect(host.drones[0].motorThrottle).toBe(drone.input.motorThrottle);
  client.disarm(); expect(drone.input.armed).toBe(false); expect(drone.input.throttleMode).toBe('easy'); expect(drone.input.climb).toBe(0); expect(drone.input.fine).toBe(false);
  host.close(); client.close();
 });
 it('easy host refuses up-to-arm and armed mode changes, but permits disarmed mode changes',async()=>{
  const {host,clients}=await setup(1); const client=clients[0]; const drone=host.simulation.get(client.myId!)!;
  const controls={axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:0,throttleMode:'easy' as const,fine:false};
  client.sendInput({...controls,climb:1}); expect(drone.input.armed).toBe(false);
  client.sendInput({...controls,climb:0}); expect(drone.input.armed).toBe(true);
  client.sendInput({...controls,throttleMode:'manual',throttle:1}); expect(drone.input.throttleMode).toBe('easy');
  client.sendInput({...controls,armed:false,throttleMode:'manual'}); expect(drone.input.throttleMode).toBe('manual'); expect(drone.input.armed).toBe(false);
  host.close(); client.close();
 });
 it('integrates three clients join → input → state → leave',async()=>{const {host,clients}=await setup();expect(host.roster).toHaveLength(3);clients.forEach(c=>{c.sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:0});c.sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:.8});});vi.advanceTimersByTime(500);expect(clients.every(c=>c.drones.length===3)).toBe(true);expect(host.drones.every(d=>d.y>.2)).toBe(true);clients[0].close();expect(host.roster).toHaveLength(2);vi.advanceTimersByTime(50);expect(clients[1].drones).toHaveLength(2);host.close();expect(clients[1].error).toBe('방이 닫혔어요');clients.forEach(c=>c.close());});
 it('simulates six independent inputs and latches global disarm',async()=>{const {host,clients}=await setup(6);clients.forEach((c,n)=>{c.sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:0});c.sendInput({axes:{pitch:n/6,roll:0,yaw:n/6},armed:true,throttle:.6+n*.05});});vi.advanceTimersByTime(600);expect(new Set(host.drones.map(d=>d.y.toFixed(3))).size).toBe(6);host.disarmAll();vi.advanceTimersByTime(100);expect(host.drones.every(d=>!d.armed)).toBe(true);clients[0].disarm();clients[0].sendInput({axes:{pitch:0,roll:0,yaw:0},armed:true,throttle:0});expect(host.drones[0].armed).toBe(true);host.close();clients.forEach(c=>c.close());});
 it('rejects high throttle ARM and times out silent input',async()=>{const {host,clients,ht}=await setup(1);const id=clients[0].myId!;for(const fn of ht.messages)fn(id,{v:1,type:'input',seq:100,axes:{pitch:0,roll:0,yaw:0},throttle:1,armed:true});expect(host.drones[0].armed).toBe(false);for(const fn of ht.messages)fn(id,{v:1,type:'input',seq:101,axes:{pitch:0,roll:0,yaw:0},throttle:0,armed:true});expect(host.drones[0].armed).toBe(true);host.advance(1001,performance.now()+1001);expect(host.drones[0].armed).toBe(false);host.close();clients.forEach(c=>c.close());});
 it('observes occupied roles before joining and receives configuration',async()=>{const {host,clients}=await setup(1);const observer=new ClientSession({room:'ABCD',transport:new MemoryTransport()});await observer.start();expect(observer.roster).toHaveLength(1);expect(observer.myId).toBeNull();observer.join({nick:'next',team:'blue',role:'striker'});expect(observer.error).toContain('이미');observer.join({nick:'next',team:'red',role:'keeper'});expect(observer.myId).toBeTruthy();host.close();observer.close();clients.forEach(c=>c.close());});
 it('resolves six coincident drones against an end wall without penetration',async()=>{const {host,clients}=await setup(6);for(const d of host.simulation.values()){d.flight.pos={x:host.arena.halfLength-.2,y:.2,z:0};}host.advance(1000/120);const ds=host.drones;for(let i=0;i<ds.length;i++)for(let j=i+1;j<ds.length;j++)expect(Math.hypot(ds[i].x-ds[j].x,ds[i].y-ds[j].y,ds[i].z-ds[j].z)).toBeGreaterThanOrEqual(.4-1e-6);host.close();clients.forEach(c=>c.close());});
 it('resolves sphere overlap with restitution',()=>{const a=createFlight(),b=createFlight();a.pos={x:0,y:2,z:0};b.pos={x:.1,y:2,z:0};a.vel.x=1;b.vel.x=-1;collideDrones(a,b);expect(b.pos.x-a.pos.x).toBeCloseTo(.4);expect(a.vel.x).toBeCloseTo(-.35);expect(b.vel.x).toBeCloseTo(.35);});
});
it('classifies ICE selected candidate types',()=>{expect(classifyCandidates('host','host')).toBe('직접(같은 와이파이)');expect(classifyCandidates('srflx','host')).toBe('직접(인터넷 경유)');expect(classifyCandidates('relay','host')).toBe('중계(TURN)');expect(classifyCandidates(undefined,undefined)).toBe('연결 안 됨');});
