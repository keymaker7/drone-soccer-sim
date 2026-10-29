import './style.css';
import { ARENA_PRESETS, DEFAULT_ARENA } from '../sim/constants';
import { changeThrottleMode, createInput, loadThrottleMode, loseFocus, readInput, releaseKey, saveThrottleMode, toggleArm } from '../sim/input';
import type { ThrottleMode } from '../sim/climb';
import { axesFromKeys } from '../sim/keymap';
import { guideStep } from '../sim/guide';
import { createNetScene } from '../render/net-scene';
import { HostSession } from './host';
import { ClientSession } from './client';
import { generateRoomCode, normalizeRoomCode, rolesFor, ROLE_LABELS, type Team, type Role } from './protocol';

export function mountNet(root: HTMLElement) {
  let active = false;
  let page: 'home' | 'join' | 'host' | 'flight' = 'home';
  let session: HostSession | ClientSession | undefined;
  let scene: ReturnType<typeof createNetScene> | undefined;
  let unsubscribe: (() => void) | undefined;
  let frameId = 0;
  let previous = 0;
  let team: Team = 'blue';
  let selectedRole: Role = 'striker';
  let roomDraft = '';
  let nickDraft = '';
  let stats = { linkType: '연결 안 됨', rttMs: 0, statesPerSec: 0, disconnects: 0, peers: 0 };
  let peerStats: Record<string, typeof stats> = {};
  let message = '';
  let sceneArena = '';
  let guideSuccessAt = 0;
  let remoteArmed = false;
  let rolesSignature = '';
  const input = createInput();
  input.throttleMode = loadThrottleMode();
  const find = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`#net-${id}`)!;
  const button = (id: string, fn: () => void) => find(id)?.addEventListener('click', fn);
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]!));
  const isHost = () => session instanceof HostSession;
  const client = () => session instanceof ClientSession ? session : undefined;
  function safeStop() {
    loseFocus(input); client()?.disarm();
    guideSuccessAt = 0;
    remoteArmed = false;
  }
  function leave() {
    safeStop(); unsubscribe?.(); unsubscribe = undefined; session?.close(); session = undefined;
    stats = { linkType: '연결 안 됨', rttMs: 0, statesPerSec: 0, disconnects: 0, peers: 0 };
    peerStats = {}; message = ''; nickDraft = ''; page = 'home'; render();
  }
  function watch() {
    unsubscribe = session?.onChange(() => {
      const c = client();
      const remote = c?.drones.find(d => d.id === c.myId);
      if (c && (c.status === 'closed' || c.status === 'error')) loseFocus(input);
      if (remoteArmed && remote && !remote.armed && input.armed) { safeStop(); message = '선생님 PC에서 시동을 껐어요. 안전을 확인한 뒤 Space로 다시 시작해요.'; }
      remoteArmed = remote?.armed ?? false;
      if (client()?.myId && page === 'join') { page = 'flight'; render(); }
      if (page === 'join') renderRoles();
      refresh();
    });
  }
  function sceneStart() {
    const container = find('scene');
    if (!container) return;
    try {
      scene = createNetScene(container, session?.arena ?? DEFAULT_ARENA);
      sceneArena = JSON.stringify(session?.arena ?? DEFAULT_ARENA);
    } catch { container.innerHTML = '<p class="net-scene-failure" role="alert">3D 화면을 열 수 없어요. WebGL을 지원하는 브라우저에서 다시 열어 주세요.</p>'; }
  }
  const statusMarkup = () => `<aside class="net-network" aria-label="연결 상태"><span class="net-live-dot"></span><strong id="net-link">연결 안 됨</strong><span id="net-stats">왕복 — ms · 상태 0/s · 끊김 0회</span><button id="net-copy" type="button">시험 결과 복사</button><span id="net-copy-result" role="status"></span></aside>`;
  function resetLiveScroll() {
    if (page !== 'flight' && page !== 'host') return;
    // The join form may have scrolled its workspace while focusing the submit button.
    for (let node: HTMLElement | null = root; node; node = node.parentElement) {
      node.scrollTop = 0; node.scrollLeft = 0;
    }
  }
  function render() {
    scene?.dispose(); scene = undefined; rolesSignature = '';
    root.className = `net-workspace net-${page}`;
    const top = `<header class="net-heading"><div><p class="net-kicker">DRONE SOCCER / CONNECTION TEST</p><h1>함께 경기<span>접속 시험판</span></h1></div>${page !== 'home' ? '<button id="net-leave" class="net-quiet" type="button">'+(page === 'host' ? '방 닫기' : page === 'flight' ? '방 나가기' : '처음으로')+'</button>' : '<span class="net-tag">학교 와이파이 · 3:3 / 5:5</span>'}</header>`;
    let body = '';
    if (page === 'home') {
      body = `<section class="net-welcome"><p class="net-kicker">같은 경기장, 각자의 조종석</p><h2>친구의 드론이<br>움직이는 순간.</h2><p>교사 PC가 경기장을 열고, 학생은 방 코드로 들어와요.<br>먼저 연결을 확인하고 함께 날아 보세요.</p><div class="net-entry-grid"><button id="net-create" class="net-entry" type="button"><span class="net-entry-number">01 / TEACHER</span><strong>방 만들기 <small>(교사 PC)</small></strong><span>큰 화면에 경기장을 열어요 <b>↗</b></span></button><button id="net-join-screen" class="net-entry" type="button"><span class="net-entry-number">02 / PILOT</span><strong>방 참가 <small>(학생)</small></strong><span>4자리 코드로 조종석에 앉아요 <b>↗</b></span></button></div><p class="net-footnote">연결 시험용 · 자동 득점 판정은 아직 없어요 · 키보드가 필요해요</p></section>`;
    } else if (page === 'join') {
      body = `<section class="net-join-card"><div class="net-join-title"><span class="net-entry-number">PILOT CHECK-IN</span><h2>내 조종석 고르기</h2></div><form id="net-form"><fieldset><legend>1. 선생님의 방 코드</legend><div class="net-code-inputs">${[0,1,2,3].map(i => `<input id="net-code-${i}" aria-label="방 코드 ${i+1}번째 문자" maxlength="1" autocapitalize="characters" autocomplete="off" spellcheck="false" value="${escape(roomDraft[i] ?? '')}">`).join('')}</div><button id="net-connect" class="net-primary" type="button">방 연결 · 빈자리 확인</button><p id="net-connect-state" class="net-muted">코드를 입력하고 빈자리를 확인하세요.</p></fieldset><fieldset><legend>2. 별명과 팀</legend><label class="net-nick-label">별명 <input id="net-nick" maxlength="8" autocomplete="off" placeholder="예: 날쌘감자" value="${escape(nickDraft)}" required></label><p class="net-muted">실명은 쓰지 마세요. 별명은 저장하지 않아요. (최대 8자)</p><div class="net-team-picks"><button id="net-blue" type="button" data-team="blue" aria-pressed="${team === 'blue'}">파랑 팀</button><button id="net-red" type="button" data-team="red" aria-pressed="${team === 'red'}">빨강 팀</button></div></fieldset><fieldset><legend>3. 내 역할 <small>회색 자리는 다른 친구가 조종 중</small></legend><div id="net-roles" class="net-role-picks"></div></fieldset><button id="net-enter" class="net-primary net-wide" type="submit" disabled>이 자리로 참가하기</button></form></section>`;
    } else {
      body = `<div class="net-live-layout"><aside class="net-side">${page === 'host' ? hostMarkup() : flightMarkup()}</aside><section class="net-arena-wrap" aria-label="함께 비행 경기장"><div id="net-scene" class="net-scene"></div><div class="net-arena-caption"><span>${page === 'host' ? '전체 경기장' : '우리 팀 조종석 · LOS'}</span><span>${page === 'host' ? '3 전체 보기 / 5 심판 시점' : '내 드론도 선생님 PC에서 받은 위치로 보여요'}</span></div></section></div>`;
    }
    root.innerHTML = top + `<div id="net-error" class="net-error" role="alert" hidden></div>` + body + statusMarkup();
    button('create', () => { page = 'host'; session = new HostSession({ room: generateRoomCode(), arena: DEFAULT_ARENA, maxPerTeam: 3 }); watch(); render(); void session.start().catch(handleError); });
    button('join-screen', () => { page = 'join'; render(); });
    button('leave', leave); button('copy', () => { void copyResults(); });
    if (page === 'join') bindJoin();
    if (page === 'host') {
      button('disarm', () => session instanceof HostSession && session.disarmAll());
      button('copy-url', () => { void copyText(joinUrl(), '참가 주소를 복사했어요.'); });
      find<HTMLSelectElement>('size').addEventListener('change', configure);
      find<HTMLSelectElement>('map').addEventListener('change', configure);
    }
    if (page === 'flight') {
      for (const mode of [1,2] as const) button(`mode-${mode}`, () => { if (input.armed) { message = '착륙하고 시동을 끈 뒤 모드를 바꿔요.'; } else { input.stickMode = mode; input.keys.clear(); input.throttleDirection = 0; input.throttleHeldSeconds = 0; message = ''; } find(`mode-${mode}`).blur(); refresh(); });
      for (const mode of ['easy','manual'] as const) button(`throttle-${mode}`, () => { setThrottleMode(mode); find(`throttle-${mode}`).blur(); });
      button('arm', () => { armToggle(); find('arm').blur(); });
      button('stop', () => { safeStop(); find('stop').blur(); refresh(); });
    }
    resetLiveScroll();
    renderRoles(); sceneStart(); refresh();
  }
  function hostMarkup() {
    return `<section class="net-room-board"><p class="net-kicker">ROOM CODE / 학생에게 알려 주세요</p><strong class="net-room-code">${escape(session?.room ?? '')}</strong><button id="net-copy-url" class="net-quiet" type="button">참가 주소 복사 ↗</button><p class="net-room-url">${escape(joinUrl())}</p></section><div class="net-settings"><label>경기 인원<select id="net-size"><option value="3">3 : 3</option><option value="5">5 : 5</option></select></label><label>경기장 크기<select id="net-map">${Object.entries(ARENA_PRESETS).map(([key,preset]) => `<option value="${key}" ${key === 'practice' ? 'selected' : ''}>${preset.label}</option>`).join('')}</select></label><p class="net-muted">인원·크기는 참가자가 없을 때 바꿀 수 있어요.</p></div><section class="net-roster-section"><h2>참가자 <span id="net-count">0 / 6</span></h2><div id="net-roster" class="net-roster"></div></section><button id="net-disarm" class="net-danger" type="button">모두 시동 끄기 · DISARM</button>`;
  }
  function flightMarkup() {
    return `<div class="net-flight-hud"><div class="net-pilot-label" id="net-pilot-label"></div><div class="net-flight-status"><button id="net-arm" class="net-quiet" type="button">DISARM · 시동 꺼짐</button><button id="net-stop" class="net-danger" type="button">안전 정지</button></div><div class="net-throttle"><label for="net-meter"><span id="net-throttle-label">추력</span> <strong id="net-throttle">0%</strong></label><meter id="net-meter" min="0" max="100" value="0"></meter><span id="net-altitude">높이 0.20 m</span><span id="net-vertical-speed">수직 속도 0.0 m/s</span></div></div><div class="net-flight-scroll" tabindex="0" aria-label="비행 조작 안내"><div class="net-mode"><button id="net-mode-2" type="button" aria-pressed="true">모드 2 · 기본</button><button id="net-mode-1" type="button" aria-pressed="false">모드 1</button></div><div class="net-sticks">${['left','right'].map(side => `<div><span id="net-${side}-label"></span><div class="net-stick-well"><i id="net-${side}-dot"></i></div><span id="net-${side}-keys"></span></div>`).join('')}</div><section class="net-guide" id="net-guide"><p class="net-kicker">FIRST FLIGHT / <span id="net-guide-progress">01 / 04</span></p><h2>처음이면 이렇게 해요</h2><ol><li id="net-step-1"></li><li id="net-step-2">Space · 시동 걸기</li><li id="net-step-3"></li><li id="net-step-4">방향 조종 · 기울여 보기</li></ol><strong id="net-guide-hint"></strong></section><details class="net-safety"><summary>조작과 안전 규칙</summary><div class="net-throttle-mode" role="group" aria-label="스로틀 방식"><span>스로틀</span><button id="net-throttle-easy" type="button">쉬움</button><button id="net-throttle-manual" type="button">실제</button></div><p id="net-throttle-help"></p><p>Space 시동 켜기·끄기 · M 조작 모드 · T 스로틀 방식<br>A / D 방향 돌리기 · ← / → 좌우 기울이기</p><p id="net-arm-help"></p><p>창·탭을 떠나면 즉시 시동이 꺼져요.<br>입력이 1초 끊기면 선생님 PC도 시동을 꺼요.</p></details></div>`;
  }
  function joinUrl() { return `${location.origin}${location.pathname}#join=${session?.room ?? roomDraft}`; }
  function handleError(error: unknown) { message = session?.error || (error instanceof Error ? error.message : '연결을 시작하지 못했어요.'); refresh(); }
  function bindJoin() {
    const boxes = [0,1,2,3].map(i => find<HTMLInputElement>(`code-${i}`));
    const codeChanged = () => {
      if (session && session.room !== roomDraft) { unsubscribe?.(); unsubscribe = undefined; session.close(); session = undefined; message = ''; stats = {...stats,linkType:'연결 안 됨',peers:0}; }
      renderRoles(); refresh();
    };
    boxes.forEach((box,i) => {
      box.addEventListener('input', () => { box.value = normalizeRoomCode(box.value).slice(-1); roomDraft = boxes.map(b => b.value).join(''); codeChanged(); if (box.value) boxes[i+1]?.focus(); });
      box.addEventListener('keydown', e => { if (e.key === 'Backspace' && !box.value) boxes[i-1]?.focus(); });
      box.addEventListener('paste', e => { const code = normalizeRoomCode(e.clipboardData?.getData('text') ?? '').slice(0,4); if (!code) return; e.preventDefault(); boxes.forEach((b,n) => { b.value = code[n] ?? ''; }); roomDraft = code; codeChanged(); boxes[Math.min(code.length,3)].focus(); });
    });
    find<HTMLInputElement>('nick').addEventListener('input', e => { nickDraft = (e.target as HTMLInputElement).value; });
    for (const value of ['blue','red'] as const) button(value, () => { team = value; renderRoles(); });
    button('connect', () => {
      roomDraft = boxes.map(b => b.value).join('');
      if (roomDraft.length !== 4) { message = '방 코드 4자리를 모두 입력해 주세요.'; refresh(); return; }
      unsubscribe?.(); session?.close(); session = new ClientSession({ room: roomDraft }); message = ''; watch();
      void session.start().then(() => { renderRoles(); refresh(); }).catch(handleError); refresh();
    });
    find<HTMLFormElement>('form').addEventListener('submit', e => {
      e.preventDefault(); nickDraft = find<HTMLInputElement>('nick').value.trim().slice(0,8);
      if (!nickDraft) { find('nick').focus(); return; }
      message = ''; client()?.join({ nick: nickDraft, team, role: selectedRole }); refresh();
    });
  }
  function renderRoles() {
    if (page !== 'join' || !find('roles')) return;
    const c = client(); const connected = c?.status === 'connected';
    const signature = JSON.stringify([c?.status,c?.maxPerTeam,c?.roster,team,selectedRole]);
    if (signature === rolesSignature) return;
    const roles = rolesFor(c?.maxPerTeam ?? 3);
    const occupied = (role: Role) => c?.roster.some(entry => entry.team === team && entry.role === role);
    if (!roles.includes(selectedRole) || occupied(selectedRole)) selectedRole = roles.find(role => !occupied(role)) ?? roles[0];
    for (const value of ['blue','red']) find(value).setAttribute('aria-pressed', String(team === value));
    find('roles').innerHTML = roles.map(role => `<button type="button" data-role="${role}" aria-pressed="${selectedRole === role}" ${occupied(role) || !connected ? 'disabled' : ''}>${ROLE_LABELS[role]}<small>${occupied(role) ? '참가 중' : connected ? '빈자리' : '연결 후 선택'}</small></button>`).join('');
    find('roles').querySelectorAll<HTMLButtonElement>('button').forEach(el => el.addEventListener('click', () => { selectedRole = el.dataset.role as Role; renderRoles(); }));
    find<HTMLButtonElement>('enter').disabled = !connected || roles.every(occupied);
    rolesSignature = JSON.stringify([c?.status,c?.maxPerTeam,c?.roster,team,selectedRole]);
  }
  function configure() {
    if (!(session instanceof HostSession)) return;
    const map = find<HTMLSelectElement>('map').value as keyof typeof ARENA_PRESETS;
    if (!session.setConfig({ arena: ARENA_PRESETS[map].arena, maxPerTeam: Number(find<HTMLSelectElement>('size').value) as 3|5 })) message = '참가자가 모두 나간 뒤 설정을 바꿔 주세요.';
    refresh();
  }
  function setThrottleMode(mode: ThrottleMode) {
    if (!changeThrottleMode(input, mode)) message = '착륙하고 시동을 끈 뒤 스로틀 방식을 바꿔요.';
    else { saveThrottleMode(mode); guideSuccessAt = 0; message = ''; sendInput(); }
    refresh();
  }
  function armToggle() {
    if (!toggleArm(input)) message = input.throttleMode === 'easy' ? `시동이 안 걸려요 · ${input.stickMode === 2 ? 'W' : '↑'} 올림 키에서 손을 뗀 뒤 Space` : `시동이 안 걸려요 · 스로틀 ${Math.round(input.throttle*100)}% · ${input.stickMode === 2 ? 'S' : '↓'}를 꾹 눌러 0%로 내린 뒤 Space`;
    else message = '';
    sendInput(); refresh();
  }
  function sendInput() { const { pitch, roll, yaw, throttle } = axesFromKeys(input.keys,input.stickMode); if (page === 'flight') client()?.sendInput({ axes: {pitch, roll, yaw}, throttle: input.throttle, armed: input.armed, throttleMode: input.throttleMode, climb: throttle as -1|0|1, fine: input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') }); }
  function refresh() {
    const error = session?.error || message || (client()?.status === 'closed' ? '방이 닫혔어요' : '');
    if (find('error')) { find('error').hidden = !error; find('error').textContent = error; }
    find('link').textContent = stats.linkType;
    find('stats').textContent = `왕복 ${Math.round(stats.rttMs)} ms · 상태 ${stats.statesPerSec}/s · 끊김 ${stats.disconnects}회`;
    root.dataset.connected = String(session?.status === 'connected');
    if (page === 'join') {
      find('connect-state').textContent = session?.status === 'connected' ? `방 ${session.room} 연결됨 · ${client()?.maxPerTeam ?? 3}:${client()?.maxPerTeam ?? 3} · 아래에서 자리를 골라요` : session?.status === 'connecting' ? '방에 연결 중이에요… 최대 10초 기다려 주세요.' : '코드를 입력하고 빈자리를 확인하세요.';
      find<HTMLButtonElement>('connect').disabled = session?.status === 'connecting';
    }
    if (page === 'host' && session instanceof HostSession) {
      find('count').textContent = `${session.roster.length} / ${session.maxPerTeam * 2}`;
      find<HTMLSelectElement>('size').disabled = session.roster.length > 0;
      find<HTMLSelectElement>('map').disabled = session.roster.length > 0;
      const html = session.roster.length ? session.roster.map(p => `<div class="net-roster-person" data-team="${p.team}"><span class="net-team-dot"></span><div><strong>${escape(p.nick)}</strong><span>${p.team === 'blue' ? '파랑' : '빨강'} · ${ROLE_LABELS[p.role]}</span></div><small>${Math.round(peerStats[p.id]?.rttMs ?? 0)} ms<br>${escape(peerStats[p.id]?.linkType ?? '확인 중')}</small></div>`).join('') : '<div class="net-empty-roster">아직 도착한 조종사가 없어요.<br>화면의 방 코드를 알려 주세요.</div>';
      if (find('roster').innerHTML !== html) find('roster').innerHTML = html;
    }
    if (page === 'flight') refreshFlight();
  }
  function refreshFlight() {
    const c = client(); const me = c?.roster.find(p => p.id === c.myId); const drone = c?.drones.find(d => d.id === c.myId);
    find('pilot-label').textContent = me ? `${me.team === 'blue' ? '파랑' : '빨강'} 팀 / ${ROLE_LABELS[me.role]} / ${me.nick}` : '내 조종석';
    find('arm').textContent = input.armed ? 'ARM · 모터 켜짐' : 'DISARM · 모터 꺼짐';
    find('arm').classList.toggle('net-armed', input.armed);
    const easy = input.throttleMode === 'easy';
    const thrust = drone?.motorThrottle ?? 0;
    find('throttle-label').textContent = easy ? '추력' : '스로틀';
    find('throttle').textContent = `${Math.round((easy ? thrust : input.throttle)*100)}%`; find<HTMLMeterElement>('meter').value = (easy ? thrust : input.throttle)*100;
    const vy = drone?.vy ?? 0;
    find('vertical-speed').textContent = `${vy > 0 ? '상승 +' : vy < 0 ? '하강 −' : '수직 속도 '}${Math.abs(vy).toFixed(1)} m/s`;
    for (const throttleMode of ['easy','manual']) find(`throttle-${throttleMode}`).setAttribute('aria-pressed', String(input.throttleMode === throttleMode));
    find('altitude').textContent = `높이 ${(drone?.y ?? .2).toFixed(2)} m`;
    const mode = input.stickMode; const axes = axesFromKeys(input.keys,mode);
    for (const m of [1,2]) find(`mode-${m}`).setAttribute('aria-pressed', String(mode === m));
    find('left-label').textContent = `왼쪽 · ${mode === 2 ? '스로틀' : '피치'} / 요`; find('right-label').textContent = `오른쪽 · ${mode === 1 ? '스로틀' : '피치'} / 롤`;
    find('left-keys').textContent = 'W / S · A / D'; find('right-keys').textContent = '↑ / ↓ · ← / →';
    const throttleY = easy ? -axes.throttle : 1-input.throttle*2;
    find('left-dot').style.transform = `translate(${-axes.yaw*25}px,${(mode === 2 ? throttleY : axes.pitch)*25}px)`;
    find('right-dot').style.transform = `translate(${axes.roll*25}px,${(mode === 1 ? throttleY : axes.pitch)*25}px)`;
    const down = mode === 2 ? 'S' : '↓'; const up = mode === 2 ? 'W' : '↑';
    find('step-1').textContent = easy ? `${up} · 올림 키에서 손 떼기` : `${down} · 스로틀 0%로 내리기`;
    find('step-3').textContent = easy ? `${up} 꾹 — 떠올라요, 떼면 천천히 내려와요` : `${up} · 약 55%까지 올리기`;
    find('step-4').textContent = `${mode === 2 ? '방향키' : 'W / S · ← / →'} · 기울여 보기`;
    find('throttle-help').textContent = easy ? `${up} 꾹: 올라가기 · 손 떼기: 천천히 내려오기 · ${down}: 빠르게 내려오기 · Shift + ${up}: 천천히 올라가기` : '스로틀은 키를 놓아도 유지돼요. Shift + 스로틀 키로 천천히 조절해요.';
    find('arm-help').textContent = easy ? `${up} 올림 키에서 손을 뗀 뒤 Space로 시동을 걸어요. 스로틀 방식은 시동을 끈 상태에서만 바꿔요.` : '스로틀 5% 이하에서만 시동이 걸려요. 스로틀 방식은 시동을 끈 상태에서만 바꿔요.';
    const step = guideStep({ armed: input.armed, throttle: easy ? (input.keys.has(mode === 2 ? 'KeyW' : 'ArrowUp') ? 1 : 0) : input.throttle, altitude: drone?.y ?? .2 });
    if (step !== 4) guideSuccessAt = 0; else if (!guideSuccessAt) guideSuccessAt = performance.now();
    find('guide').hidden = !!guideSuccessAt && performance.now()-guideSuccessAt > 5000;
    find('guide-progress').textContent = `0${step} / 04`;
    for (let n=1;n<=4;n++) { find(`step-${n}`).classList.toggle('active',n===step); if(n===step) find(`step-${n}`).setAttribute('aria-current','step'); else find(`step-${n}`).removeAttribute('aria-current'); }
    find('guide-hint').textContent = step === 1 ? (easy ? `${up} 올림 키에서 손을 떼요` : `${down}를 꾹 눌러 0%로 내려요`) : step === 2 ? 'Space를 눌러 시동을 걸어요' : step === 3 ? (easy ? `${up} 꾹 — 떠올라요, 떼면 천천히 내려와요` : `${up}를 천천히 눌러 띄워요 · 약 55%`) : '잘했어요! 기울여서 움직여 보세요';
  }
  async function copyText(text: string, success: string) {
    try { await navigator.clipboard.writeText(text); find('copy-result').textContent = success; }
    catch { find('copy-result').textContent = '자동 복사가 막혔어요. 아래 글을 선택해서 복사하세요.'; let fallback = root.querySelector<HTMLTextAreaElement>('.net-copy-fallback'); if (!fallback) { fallback = document.createElement('textarea'); fallback.className = 'net-copy-fallback'; fallback.setAttribute('aria-label','복사할 시험 결과'); root.append(fallback); } fallback.value = text; fallback.focus(); fallback.select(); }
  }
  async function copyResults() { await copyText(`드론축구 NET-1 접속 시험\n시각: ${new Date().toISOString()}\n브라우저: ${navigator.userAgent}\n역할: ${isHost() ? '교사 PC' : client() ? '학생' : '미접속'}\n방 코드: ${session?.room ?? '-'}\n연결 방식: ${stats.linkType}\n왕복 지연: ${Math.round(stats.rttMs)} ms\n초당 받은 상태 수: ${stats.statesPerSec}\n끊긴 횟수: ${stats.disconnects}\n접속 기기 수: ${stats.peers}`, '시험 결과를 복사했어요.'); }
  const keys = new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyM','KeyT','Backspace']);
  window.addEventListener('keydown', e => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey || document.hidden || (e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea,a,summary,[contenteditable]'))) return;
    if (page === 'host' && ['Digit3','Digit5'].includes(e.code)) { e.preventDefault(); scene?.setMode(e.code === 'Digit3' ? 3 : 5); return; }
    if (page !== 'flight' || !keys.has(e.code) || client()?.status !== 'connected') return;
    e.preventDefault(); input.keys.add(e.code);
    if (!e.repeat && e.code === 'Space') armToggle();
    if (!e.repeat && e.code === 'Backspace') safeStop();
    if (!e.repeat && e.code === 'KeyT') setThrottleMode(input.throttleMode === 'easy' ? 'manual' : 'easy');
    if (!e.repeat && e.code === 'KeyM') find(`mode-${input.stickMode === 2 ? 1 : 2}`).click();
    sendInput(); refreshFlight();
  });
  window.addEventListener('keyup', e => { if (active && page === 'flight' && keys.has(e.code)) { releaseKey(input,e.code); sendInput(); refreshFlight(); } });
  window.addEventListener('blur', safeStop);
  window.addEventListener('pagehide', () => { safeStop(); session?.close(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) safeStop(); });
  window.addEventListener('resize', () => scene?.resize());
  setInterval(() => {
    if (!session) return;
    const current = session;
    void current.stats().then(value => { if (session === current) { stats = value; refresh(); } }).catch(() => {});
    if (current instanceof HostSession) void current.peerStats().then(value => { if (session === current) peerStats = value; }).catch(() => {});
  },1000);
  function frame(time: number) {
    frameId = 0; if (!active) return;
    const elapsed = previous ? Math.min(.05,(time-previous)/1000) : 0; previous = time;
    if (page === 'flight' && client()?.status === 'connected' && !document.hidden) { readInput(input,elapsed); sendInput(); refreshFlight(); }
    const arena = session?.arena ?? DEFAULT_ARENA;
    if (scene && sceneArena !== JSON.stringify(arena)) { scene.setArena(arena); sceneArena = JSON.stringify(arena); }
    if (session) scene?.draw(client()?.sample(time) ?? session.drones,session.roster,client()?.myId ?? null,elapsed);
    frameId = requestAnimationFrame(frame);
  }
  function applyHash() {
    const match = /^#join=([^&]*)/i.exec(location.hash);
    if (match && !session) { roomDraft = normalizeRoomCode(match[1]).slice(0,4); page = 'join'; render(); }
  }
  window.addEventListener('hashchange', applyHash);
  render(); applyHash();
  return {
    setActive(value: boolean) { active = value; if (!value) { safeStop(); cancelAnimationFrame(frameId); frameId=0; previous=0; } else { const preferred = loadThrottleMode(); if (!input.armed && preferred !== input.throttleMode) changeThrottleMode(input, preferred); applyHash(); if (page === 'flight') refreshFlight(); resetLiveScroll(); scene?.resize(); if (!frameId) frameId = requestAnimationFrame(frame); } },
    state: () => ({ throttleMode: input.throttleMode, vy: client()?.drones.find(d => d.id === client()?.myId)?.vy ?? 0, role: session ? isHost() ? 'host' : 'client' : null, room: session?.room ?? '', peers: stats.peers, rttMs: stats.rttMs, linkType: stats.linkType, statesPerSec: stats.statesPerSec, disconnects: stats.disconnects, drones: session?.drones.map(d => ({...d})) ?? [], myId: client()?.myId ?? null }),
  };
}
