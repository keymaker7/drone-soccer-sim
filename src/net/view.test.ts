import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Controls, DroneSnapshot, RosterEntry, Role, Team } from './protocol';

const doubles = vi.hoisted(() => {
  class Session {
    room: string; status = 'idle'; error = ''; myId: string | null = null;
    arena = {halfLength:12,halfWidth:5.25,height:6}; maxPerTeam: 3|5 = 3;
    roster: RosterEntry[] = []; drones: DroneSnapshot[] = [];
    callbacks = new Set<() => void>();
    sendInput = vi.fn<(controls: Controls) => void>();
    disarm = vi.fn();
    close = vi.fn(() => { this.status = 'closed'; this.emit(); });
    constructor(options: {room:string}) { this.room = options.room; }
    onChange(fn: () => void) { this.callbacks.add(fn); return () => this.callbacks.delete(fn); }
    emit() { for (const fn of this.callbacks) fn(); }
    async start() { this.status = 'connected'; this.emit(); }
    sample() { return this.drones; }
    async stats() { return {linkType:'직접(같은 와이파이)',rttMs:12,statesPerSec:30,disconnects:0,peers:1}; }
  }
  class Client extends Session {
    static instances: Client[] = [];
    constructor(options: {room:string}) { super(options); Client.instances.push(this); }
    join(options: {nick:string;team:Team;role:Role}) {
      this.myId = 'pilot-1'; this.roster = [{id:this.myId,...options}];
      this.drones = [{id:this.myId,team:options.team,role:options.role,x:0,y:.2,z:0,roll:0,pitch:0,yaw:0,armed:false}]; this.emit();
    }
  }
  class Host extends Session {
    static instances: Host[] = [];
    constructor(options: {room:string}) { super(options); Host.instances.push(this); }
    disarmAll = vi.fn();
    setConfig = vi.fn(() => true);
    async peerStats() { return {}; }
  }
  return { Client, Host, scene: {draw:vi.fn(),dispose:vi.fn(),resize:vi.fn(),setMode:vi.fn(),setArena:vi.fn()} };
});
vi.mock('./client', () => ({ClientSession:doubles.Client}));
vi.mock('./host', () => ({HostSession:doubles.Host}));
vi.mock('../render/net-scene', () => ({createNetScene:() => doubles.scene}));

// Small event/element doubles run the real view module without a DOM dependency.
// They deliberately do not validate CSS layout, canvas rendering, or WebRTC.
let elements: Map<string, Element>;
class Element extends EventTarget {
  parentElement: Element | null = null; scrollTop = 0; scrollLeft = 0;
  textContent = ''; hidden = false; value: string|number = ''; disabled = false; className = '';
  dataset: Record<string,string> = {}; attributes = new Map<string,string>();
  style = {transform:''}; classes = new Set<string>();
  classList = { toggle:(name:string,on:boolean) => on ? this.classes.add(name) : this.classes.delete(name) };
  private html = ''; private buttons: Element[] = [];
  constructor(readonly isRoot = false) { super(); }
  set innerHTML(html:string) {
    this.html = html;
    if (this.isRoot) elements.clear();
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
      const node = new Element(); const markup = match[0];
      node.value = /\bvalue="([^"]*)"/.exec(markup)?.[1] ?? '';
      node.disabled = /\bdisabled\b/.test(markup);
      elements.set(match[1],node);
    }
    this.buttons = [...html.matchAll(/<button\b[^>]*data-role="([^"]+)"[^>]*>/g)].map(match => {
      const node = new Element(); node.dataset.role = match[1]; node.disabled = /\bdisabled\b/.test(match[0]);
      node.attributes.set('aria-pressed',/aria-pressed="([^"]+)"/.exec(match[0])?.[1] ?? 'false'); return node;
    });
  }
  get innerHTML() { return this.html; }
  querySelector(selector:string) { return elements.get(selector.slice(1)) ?? null; }
  querySelectorAll() { return this.buttons; }
  setAttribute(name:string,value:string) { this.attributes.set(name,value); }
  removeAttribute(name:string) { this.attributes.delete(name); }
  closest() { return null; }
  blur() {}
  focus() {}
  select() {}
  append() {}
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
let win: EventTarget;
let doc: EventTarget & {hidden:boolean};
let root: Element;
let frame: (time:number)=>void;
let now: number;
let view: ReturnType<typeof import('./view')['mountNet']>;
const el = (id:string) => elements.get(`net-${id}`)!;
const current = () => doubles.Client.instances.at(-1)!;
function key(code:string,type='keydown') { const event = new Event(type,{cancelable:true}); Object.assign(event,{code,repeat:false}); win.dispatchEvent(event); }
function tick(ms:number) { for (let end=now+ms;now<end;) { now=Math.min(end,now+16); frame(now); } }
async function boot(hash='') {
  vi.resetModules(); elements = new Map(); now=0; frame=()=>{};
  doubles.Client.instances=[]; doubles.Host.instances=[];
  root = new Element(true); win = new EventTarget(); doc = Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Element()});
  vi.stubGlobal('window',win); vi.stubGlobal('document',doc); vi.stubGlobal('HTMLElement',Element);
  vi.stubGlobal('location',{hash,origin:'https://school.example',pathname:'/drone-soccer-sim/'});
  vi.stubGlobal('performance',{now:()=>now});
  vi.stubGlobal('requestAnimationFrame',vi.fn((fn:typeof frame)=>{frame=fn;return 1;}));
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('setInterval',vi.fn());
  vi.stubGlobal('localStorage',{getItem:vi.fn(),setItem:vi.fn()});
  vi.stubGlobal('navigator',{userAgent:'Offline test',clipboard:{writeText:vi.fn(async()=>{})}});
  const {mountNet} = await import('./view'); view=mountNet(root as unknown as HTMLElement); view.setActive(true);
}
async function enterFlight() {
  await boot('#join=ABCD'); el('connect').click(); await Promise.resolve();
  el('nick').value='감자'; el('form').dispatchEvent(new Event('submit',{cancelable:true}));
  expect(view.state().myId).toBe('pilot-1');
}
beforeEach(async()=>{ vi.clearAllMocks(); await boot(); });
afterEach(()=>{ vi.unstubAllGlobals(); });

describe('NET-1 actual UI event wiring (offline)',()=>{
  it('resets scrolled join ancestors on entry and keeps the HUD outside scrollable guidance',async()=>{
    await boot('#join=ABCD'); el('connect').click(); await Promise.resolve();
    const panel = new Element(); const body = new Element();
    root.parentElement = panel; panel.parentElement = body;
    for (const node of [root,panel,body]) { node.scrollTop=142; node.scrollLeft=20; }
    el('nick').value='감자'; el('form').dispatchEvent(new Event('submit',{cancelable:true}));
    expect(root.className).toBe('net-workspace net-flight');
    for (const node of [root,panel,body]) { expect(node.scrollTop).toBe(0); expect(node.scrollLeft).toBe(0); }
    const [hud,guidance] = root.innerHTML.split('<div class="net-flight-scroll"');
    expect(hud).toContain('id="net-arm"'); expect(hud).toContain('id="net-throttle"');
    expect(guidance).toContain('id="net-guide"');
    expect(guidance).toContain('<details class="net-safety">');
    expect(guidance).not.toContain('id="net-arm"');
  });
  it('resets live workspace scroll when reactivating the flight tab',async()=>{
    await enterFlight(); const panel = new Element(); root.parentElement=panel;
    view.setActive(false); root.scrollTop=90; panel.scrollTop=142;
    view.setActive(true);
    expect(root.scrollTop).toBe(0); expect(panel.scrollTop).toBe(0);
    expect(doubles.scene.resize).toHaveBeenCalled();
  });
  it('resets the teacher workspace on room creation',()=>{
    const panel = new Element(); root.parentElement=panel; panel.scrollTop=142;
    el('create').click();
    expect(root.className).toBe('net-workspace net-host'); expect(panel.scrollTop).toBe(0);
  });
  it('mounting does not connect; #join pre-fills four boxes without storage',async()=>{
    expect(doubles.Client.instances).toHaveLength(0); expect(doubles.Host.instances).toHaveLength(0);
    await boot('#join=ABCD');
    expect([0,1,2,3].map(n=>el(`code-${n}`).value).join('')).toBe('ABCD');
    expect(doubles.Client.instances).toHaveLength(0);
    expect(el('enter').disabled).toBe(true);
    expect(localStorage.getItem).toHaveBeenCalled(); expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('changing room code invalidates the connected observer and disables entry',async()=>{
    await boot('#join=ABCD'); el('connect').click(); await Promise.resolve();
    expect(el('enter').disabled).toBe(false);
    const observer=current(); el('code-0').value='Z'; el('code-0').dispatchEvent(new Event('input'));
    expect(observer.close).toHaveBeenCalledOnce(); expect(view.state().role).toBeNull(); expect(el('enter').disabled).toBe(true);
    el('connect').click(); expect(current().room).toBe('ZBCD');
  });
  it('occupied roles grey out and become available when roster changes',async()=>{
    await boot('#join=ABCD'); el('connect').click(); await Promise.resolve();
    const observer=current(); observer.roster=[{id:'other',nick:'친구',team:'blue',role:'striker'}]; observer.emit();
    const striker = () => el('roles').querySelectorAll().find(button=>button.dataset.role==='striker')!;
    expect(striker().disabled).toBe(true);
    observer.roster=[]; observer.emit(); expect(striker().disabled).toBe(false);
    observer.maxPerTeam=5; observer.emit(); expect(el('roles').querySelectorAll()).toHaveLength(5);
  });
  it.each(['tab','blur','hidden','pagehide'])('%s immediately disarms and clears held throttle',async kind=>{
    await enterFlight(); el('throttle-manual').click(); key('Space'); key('KeyW'); tick(800);
    expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({armed:true});
    expect(current().sendInput.mock.calls.at(-1)?.[0].throttle).toBeGreaterThan(0);
    current().disarm.mockClear();
    if(kind==='tab') view.setActive(false);
    else if(kind==='hidden') { doc.hidden=true; doc.dispatchEvent(new Event('visibilitychange')); }
    else win.dispatchEvent(new Event(kind));
    expect(current().disarm).toHaveBeenCalled();
    if(kind==='pagehide') expect(current().close).toHaveBeenCalled();
    else { doc.hidden=false; view.setActive(true); tick(16); expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({armed:false,throttle:0,axes:{pitch:0,roll:0,yaw:0}}); }
  });
  it('authoritative true-to-false disarm resets controls, while initial false does not cancel ARM',async()=>{
    await enterFlight(); key('Space'); current().emit();
    expect(el('arm').textContent).toBe('ARM · 모터 켜짐');
    current().drones[0].armed=true; current().emit(); key('KeyW'); tick(800);
    current().drones[0].armed=false; current().emit();
    expect(current().disarm).toHaveBeenCalled(); expect(el('arm').textContent).toBe('DISARM · 모터 꺼짐');
    expect(el('error').textContent).toContain('선생님 PC에서 시동을 껐어요');
    tick(16); expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({armed:false,throttle:0});
    key('Space'); expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({armed:true,throttle:0});
  });
  it('QA snapshots cannot mutate live client drone arrays or objects',async()=>{
    await enterFlight(); const snapshot=view.state(); snapshot.drones[0].x=999; snapshot.drones.pop();
    expect(current().drones).toHaveLength(1); expect(current().drones[0].x).toBe(0); expect(view.state().drones[0].x).toBe(0);
  });
  it('closed host produces room-closed feedback and leaves input disarmed',async()=>{
    await enterFlight(); key('Space'); current().status='closed'; current().emit();
    expect(el('error').textContent).toBe('방이 닫혔어요'); expect(el('arm').textContent).toBe('DISARM · 모터 꺼짐');
  });
  it('ARM threshold and armed mode-switch restrictions use existing input rules',async()=>{
    await enterFlight(); el('throttle-manual').click(); vi.mocked(localStorage.setItem).mockClear(); key('KeyW'); tick(1000); key('KeyW','keyup'); key('Space');
    expect(current().sendInput.mock.calls.at(-1)?.[0].armed).toBe(false); expect(el('error').textContent).toContain('시동이 안 걸려요');
    key('Backspace'); key('Space'); el('mode-1').click();
    expect(el('mode-2').attributes.get('aria-pressed')).toBe('true');
    key('Space'); el('mode-1').click(); expect(el('mode-1').attributes.get('aria-pressed')).toBe('true');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it('defaults to easy and sends held climb and fine immediately, centering the spring stick on release',async()=>{
    await enterFlight();
    expect(view.state().throttleMode).toBe('easy');
    expect(el('left-dot').style.transform).toBe('translate(0px,0px)');
    key('Space'); key('KeyW');
    expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({throttleMode:'easy',climb:1,fine:false,armed:true});
    expect(el('left-dot').style.transform).toBe('translate(0px,-25px)');
    key('ShiftLeft');
    expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({climb:1,fine:true});
    key('KeyW','keyup');
    expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({climb:0});
    expect(el('left-dot').style.transform).toBe('translate(0px,0px)');
    key('KeyS'); expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({climb:-1});
  });
  it('easy ARM blocks held up keys and T only changes throttle while disarmed',async()=>{
    await enterFlight(); key('KeyW'); key('Space');
    expect(current().sendInput.mock.calls.at(-1)?.[0].armed).toBe(false);
    expect(el('error').textContent).toContain('올림 키에서 손을 뗀 뒤');
    key('KeyW','keyup'); key('Space'); key('KeyT');
    expect(view.state().throttleMode).toBe('easy');
    expect(localStorage.setItem).not.toHaveBeenCalled();
    key('Space'); key('KeyT');
    expect(view.state().throttleMode).toBe('manual');
    expect(localStorage.setItem).toHaveBeenCalled();
    el('throttle-easy').click(); expect(view.state().throttleMode).toBe('easy');
  });
  it('refreshes the saved preference on tab activation without writing it',async()=>{
    await enterFlight(); view.setActive(false);
    vi.mocked(localStorage.getItem).mockReturnValue('manual');
    view.setActive(true);
    expect(view.state().throttleMode).toBe('manual');
    expect(el('throttle-manual').attributes.get('aria-pressed')).toBe('true');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
  it.each(['tab','blur','hidden','pagehide'])('easy %s safety clears climb and fine before resuming',async kind=>{
    await enterFlight(); key('Space'); key('KeyW'); key('ShiftLeft');
    if(kind==='tab') view.setActive(false);
    else if(kind==='hidden') { doc.hidden=true; doc.dispatchEvent(new Event('visibilitychange')); }
    else win.dispatchEvent(new Event(kind));
    expect(current().disarm).toHaveBeenCalled();
    if(kind!=='pagehide') {
      doc.hidden=false; view.setActive(true); tick(16);
      expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({armed:false,throttleMode:'easy',climb:0,fine:false});
    }
  });
  it('mode 1 easy uses arrow climb and displays authoritative thrust and vertical speed',async()=>{
    await enterFlight(); el('mode-1').click(); key('ArrowUp');
    expect(current().sendInput.mock.calls.at(-1)?.[0]).toMatchObject({climb:1});
    expect(el('right-dot').style.transform).toBe('translate(0px,-25px)');
    expect(el('step-3').textContent).toContain('↑ 꾹');
    key('ArrowUp','keyup'); key('Space');
    Object.assign(current().drones[0],{motorThrottle:.63,vy:-.5}); current().emit();
    expect(el('throttle').textContent).toBe('63%');
    expect(el('vertical-speed').textContent).toBe('하강 −0.5 m/s');
    expect(view.state().vy).toBe(-.5);
  });
  it('host buttons disarm all; changing tab keeps host session running',()=>{
    el('create').click(); const host=doubles.Host.instances[0]; el('disarm').click(); expect(host.disarmAll).toHaveBeenCalledOnce();
    key('Digit3'); expect(doubles.scene.setMode).toHaveBeenLastCalledWith(3);
    view.setActive(false); expect(host.close).not.toHaveBeenCalled();
    el('leave').click(); expect(host.close).toHaveBeenCalledOnce(); expect(view.state().role).toBeNull();
  });
});
