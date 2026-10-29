import { createMatch, exportCSV, formatClock, matchReducer, restoreMatch, serializeMatch } from './match';
import type { MatchEvent, MatchState, Settings, Team } from './match';
import './style.css';

const STORAGE_KEY = 'drone-soccer-match-v1';
const PHASES = { ready: '준비', playing: '경기', maintenance: '정비', finished: '종료' };
export function mountScore(container: HTMLElement): { setActive(active: boolean): void; dispatch(event: MatchEvent): void } {
  let active = false;
  let state = createMatch();
  let audio: AudioContext | undefined;
  let storageFailed = false;
  try { state = restoreMatch(localStorage.getItem(STORAGE_KEY), Date.now()); } catch { storageFailed = true; }
  container.classList.add('score-view');
  container.innerHTML = `<header class="score-heading"><div><span class="score-eyebrow">DRONE SOCCER · MATCH CONTROL</span><h1>우리들의 경기, 지금 시작.</h1></div></header>
  <div class="score-arena"><section class="score-team score-blue" data-team="blue"></section><section class="score-clock-panel"><span class="score-set"></span><strong class="score-phase"></strong><output class="score-clock" aria-label="남은 시간"></output><span class="score-running"></span><div class="score-main-controls"><button data-action="clock" class="score-primary"></button><button data-action="undo">↶ 되돌리기</button></div></section><section class="score-team score-red" data-team="red"></section></div>
  <div class="score-result" role="status"></div><div class="score-set-results"></div>
  <div class="score-toolbar"><button data-action="mute"></button><button data-action="reset">경기 초기화</button><span class="score-save-status"></span></div>
  <details class="score-settings"><summary>경기 시간 설정</summary><form><label>준비 <input name="ready" type="number" min="1" max="3600" required> 초</label><label>세트 <input name="playing" type="number" min="1" max="3600" required> 초</label><label>정비 <input name="maintenance" type="number" min="1" max="3600" required> 초</label><button type="submit">적용</button></form><p>경기 시작 전 설정 · 최대 3세트 / 2세트 선승 · 무승부 세트는 승수 없음</p></details>
  <section class="score-log"><header><h2>경기 기록 <span class="score-record-count"></span></h2><div><button data-action="json">JSON 내려받기</button><button data-action="csv">CSV 내려받기</button></div></header><div class="score-table-scroll"><table><thead><tr><th>세트</th><th>남은 시간</th><th>시각</th><th>팀</th><th>사건</th><th>점수</th></tr></thead><tbody></tbody></table></div></section>
  <p class="score-shortcuts">심판 단축키 · 1 / 2 득점 · Shift + 1 / 2 감점 · O / P 오프사이드 · Z 되돌리기 · Space 시작 / 일시정지 / 계속</p>`;
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
  for (const team of ['blue', 'red'] as const) {
    find(`[data-team="${team}"]`).innerHTML = `<label class="score-name-label">${team === 'blue' ? 'BLUE' : 'RED'} TEAM · 이름을 눌러 변경<input class="score-name" aria-label="${team === 'blue' ? '파랑' : '빨강'} 팀 이름" maxlength="40" data-name="${team}"></label><div class="score-wins" aria-label="세트 승수"></div><output class="score-number" aria-label="점수"></output><div class="score-offside">OFFSIDE</div><div class="score-points"><button data-action="score" data-team="${team}" data-delta="-1" aria-label="${team} 감점">−1</button><button data-action="score" data-team="${team}" data-delta="1" class="score-add">득점 +1</button></div><div class="score-team-tools"><button data-action="offside" data-team="${team}"></button><button data-action="penalty" data-team="${team}">페널티 +1</button></div><span class="score-penalties"></span>`;
  }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, serializeMatch(state)); storageFailed = false; } catch { storageFailed = true; } find('.score-save-status').textContent = storageFailed ? '저장할 수 없어 현재 창에서만 유지됩니다' : '이 브라우저에 자동 저장'; };
  function beep(frequency = 660): void {
    if (!active || state.muted) return;
    try {
      audio ??= new AudioContext();
      void audio.resume().catch(() => {});
      const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.frequency.value = frequency; gain.gain.setValueAtTime(0.07, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + .16);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .17);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch { /* Audio is optional; match controls remain usable. */ }
  }
  function render(): void {
    find('.score-set').textContent = `SET ${state.set} / 3`;
    find('.score-phase').textContent = PHASES[state.phase];
    find('.score-clock').textContent = formatClock(state.remaining);
    find('.score-clock-panel').classList.toggle('is-final-seconds', state.running && state.remaining <= 5000);
    find('.score-running').textContent = state.phase === 'finished' ? 'MATCH COMPLETE' : state.running ? '● LIVE' : state.records.length || state.history.length ? '일시정지' : '경기를 시작해 주세요';
    const clockButton = find<HTMLButtonElement>('[data-action="clock"]');
    clockButton.textContent = state.running ? 'Ⅱ 일시정지' : state.history.length || state.records.length ? '▶ 계속' : '▶ 시작'; clockButton.disabled = state.phase === 'finished';
    find<HTMLButtonElement>('[data-action="undo"]').disabled = !state.history.length;
    find<HTMLButtonElement>('[data-action="mute"]').textContent = state.muted ? '소리 꺼짐 · 켜기' : '소리 켜짐 · 음소거';
    find<HTMLButtonElement>('[data-action="mute"]').setAttribute('aria-pressed', String(state.muted));
    for (const team of ['blue', 'red'] as const) {
      const t = state.teams[team]; const panel = find(`[data-team="${team}"]`);
      const input = panel.querySelector<HTMLInputElement>('input')!;
      if (document.activeElement !== input) input.value = t.name;
      panel.querySelector('.score-number')!.textContent = String(t.score);
      panel.querySelector('.score-wins')!.textContent = '●'.repeat(t.wins) + '○'.repeat(3 - t.wins);
      panel.querySelector('.score-wins')!.setAttribute('aria-label', `세트 ${t.wins}승`);
      panel.classList.toggle('is-offside', t.offside);
      panel.querySelector('.score-penalties')!.textContent = `PENALTY ${t.penalties}`;
      const offside = panel.querySelector<HTMLButtonElement>('[data-action="offside"]')!;
      offside.textContent = `오프사이드 ${t.offside ? '끔' : '켬'}`; offside.setAttribute('aria-pressed', String(t.offside));
      panel.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = state.phase === 'finished' || (button.dataset.delta === '-1' && t.score === 0); });
    }
    const winner = state.teams.blue.wins === state.teams.red.wins ? null : state.teams.blue.wins > state.teams.red.wins ? 'blue' : 'red';
    find('.score-result').textContent = state.phase === 'finished' ? winner ? `🏆 ${state.teams[winner].name} 승리!` : '경기 종료 · 무승부' : '';
    find('.score-result').hidden = state.phase !== 'finished';
    find('.score-set-results').textContent = state.results.map(r => `${r.set}세트 ${r.blue} : ${r.red} · ${r.winner ? `${state.teams[r.winner].name} 승` : '무승부 세트'}`).join('   /   ');
    const form = find<HTMLFormElement>('form');
    for (const key of ['ready', 'playing', 'maintenance'] as const) { const input = form.elements.namedItem(key) as HTMLInputElement; if (document.activeElement !== input) input.value = String(state.settings[key]); input.disabled = state.running || state.records.length > 0 || state.history.length > 0; }
    form.querySelector('button')!.disabled = state.running || state.records.length > 0 || state.history.length > 0;
    const body = find<HTMLTableSectionElement>('tbody'); body.replaceChildren();
    for (const r of [...state.records].reverse()) {
      const row = document.createElement('tr');
      for (const value of [r.set, formatClock(r.remaining), new Date(r.at).toLocaleTimeString('ko-KR'), r.team ? state.teams[r.team].name : '전체', r.kind, r.score]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
      body.append(row);
    }
    if (!state.records.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 6; cell.textContent = '첫 휘슬을 기다리고 있어요. 경기 사건이 여기에 기록됩니다.'; }
    find('.score-record-count').textContent = String(state.records.length);
  }
  function dispatch(event: MatchEvent): void {
    const previous: MatchState = state;
    state = matchReducer(state, event);
    const changed = event.type !== 'tick' || previous.phase !== state.phase || previous.records.length !== state.records.length;
    if (changed) { save(); render(); }
    else { find('.score-clock').textContent = formatClock(state.remaining); find('.score-clock-panel').classList.toggle('is-final-seconds', state.running && state.remaining <= 5000); }
    if ((!previous.running && state.running) || previous.phase !== state.phase) beep(state.phase === 'playing' ? 880 : 440);
    else if (state.running && Math.ceil(previous.remaining / 1000) !== Math.ceil(state.remaining / 1000) && state.remaining > 0 && state.remaining <= 5000) beep();
  }
  const clock = () => dispatch({ type: state.running ? 'pause' : 'start', now: Date.now() });
  function download(format: 'csv' | 'json'): void {
    const blob = new Blob([format === 'csv' ? exportCSV(state) : JSON.stringify({ teams: state.teams, results: state.results, records: state.records }, null, 2)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `drone-soccer-${new Date().toISOString().slice(0, 10)}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  container.addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]'); if (!button) return;
    const { action, team, delta } = button.dataset; const now = Date.now();
    if (action === 'clock') clock();
    else if (action === 'reset') { if (window.confirm('점수와 모든 경기 기록을 지우고 새 경기를 준비할까요?')) dispatch({ type: 'reset', now }); }
    else if (action === 'json' || action === 'csv') download(action);
    else if (action === 'score') dispatch({ type: 'score', team: team as Team, delta: Number(delta) as 1 | -1, now });
    else if (action === 'offside' || action === 'penalty') dispatch({ type: action, team: team as Team, now });
    else if (action === 'undo' || action === 'mute') dispatch({ type: action, now });
  });
  container.addEventListener('change', e => { const input = e.target as HTMLInputElement; if (input.dataset.name) dispatch({ type: 'name', team: input.dataset.name as Team, name: input.value, now: Date.now() }); });
  find('form').addEventListener('submit', e => { e.preventDefault(); const data = new FormData(e.target as HTMLFormElement); const settings = Object.fromEntries(['ready', 'playing', 'maintenance'].map(key => [key, Number(data.get(key))])) as unknown as Settings; dispatch({ type: 'settings', settings, now: Date.now() }); });
  window.addEventListener('keydown', e => {
    if (!active || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.code === 'Space' && (e.target as HTMLElement)?.closest('button, a, summary')) return;
    const now = Date.now(); const key = e.key.toLowerCase();
    if (e.code === 'Digit1' || e.code === 'Digit2') dispatch({ type: 'score', team: e.code === 'Digit1' ? 'blue' : 'red', delta: e.shiftKey ? -1 : 1, now });
    else if (key === 'o' || key === 'p') dispatch({ type: 'offside', team: key === 'o' ? 'blue' : 'red', now });
    else if (key === 'z') dispatch({ type: 'undo', now });
    else if (e.code === 'Space') clock();
    else return;
    e.preventDefault();
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    state = restoreMatch(event.newValue, Date.now());
    render();
  });
  setInterval(() => { if (state.running) dispatch({ type: 'tick', now: Date.now() }); }, 200);
  render(); save();
  return { setActive(value) { active = value; if (value) dispatch({ type: 'tick', now: Date.now() }); }, dispatch };
}
