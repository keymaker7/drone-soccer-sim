export type Team = 'blue' | 'red';
export type Phase = 'ready' | 'playing' | 'maintenance' | 'finished';
export interface Settings { ready: number; playing: number; maintenance: number }
export interface TeamState { name: string; score: number; wins: number; penalties: number; offside: boolean }
export interface MatchRecord { set: number; remaining: number; at: number; team: Team | null; kind: string; score: string; drone?: string; auto?: boolean; reason?: string }
export interface SetResult { set: number; blue: number; red: number; winner: Team | null }
export interface Snapshot { phase: Phase; set: number; running: boolean; remaining: number; deadline: number | null; settings: Settings; teams: Record<Team, TeamState>; records: MatchRecord[]; results: SetResult[]; muted: boolean }
export interface MatchState extends Snapshot { history: Snapshot[] }
export type MatchEvent = { now: number } & (
  | { type: 'tick' | 'start' | 'pause' | 'resume' | 'undo' | 'reset' | 'mute' }
  | { type: 'score'; team: Team; delta: 1 | -1; by?: string; auto?: boolean }
  | { type: 'offside'; team: Team; on?: boolean; by?: string; auto?: boolean }
  | { type: 'penalty'; team: Team; reason?: string; by?: string; auto?: boolean }
  | { type: 'name'; team: Team; name: string }
  | { type: 'settings'; settings: Settings }
);
export const DEFAULT_SETTINGS: Settings = { ready: 10, playing: 180, maintenance: 30 };
export function createMatch(settings: Settings = DEFAULT_SETTINGS): MatchState {
  return { phase: 'ready', set: 1, running: false, remaining: settings.ready * 1000, deadline: null, settings: { ...settings }, teams: { blue: { name: '파랑 팀', score: 0, wins: 0, penalties: 0, offside: false }, red: { name: '빨강 팀', score: 0, wins: 0, penalties: 0, offside: false } }, records: [], results: [], muted: false, history: [] };
}
function snapshot(s: MatchState): Snapshot { const { history: _, ...rest } = s; return structuredClone(rest); }
function remember(s: MatchState): void { s.history.push(snapshot(s)); }
function record(s: MatchState, kind: string, at: number, team: Team | null = null, meta: { by?: string; auto?: boolean; reason?: string } = {}): void {
  s.records.push({ set: s.set, remaining: s.remaining, at, team, kind, score: `${s.teams.blue.score}:${s.teams.red.score}`, ...(meta.by === undefined ? {} : { drone: meta.by }), ...(meta.auto === undefined ? {} : { auto: meta.auto }), ...(meta.reason === undefined ? {} : { reason: meta.reason }) });
}
export function remainingAt(s: Snapshot, now: number): number { return s.running && s.deadline !== null ? Math.max(0, s.deadline - now) : s.remaining; }
function advance(s: MatchState, now: number): void {
  while (s.running && s.deadline !== null && now >= s.deadline && s.phase !== 'finished') {
    const boundary = s.deadline;
    s.remaining = 0;
    remember(s);
    if (s.phase === 'ready' || s.phase === 'maintenance') {
      if (s.phase === 'maintenance') {
        s.set++;
        for (const team of Object.values(s.teams)) { team.score = 0; team.penalties = 0; team.offside = false; }
      }
      s.phase = 'playing'; s.remaining = s.settings.playing * 1000;
      record(s, '세트 시작', boundary);
    } else {
      const { blue, red } = s.teams;
      const winner = blue.score === red.score ? null : blue.score > red.score ? 'blue' : 'red';
      if (winner) s.teams[winner].wins++;
      s.results.push({ set: s.set, blue: blue.score, red: red.score, winner });
      record(s, winner ? '세트 끝' : '무승부 세트', boundary, winner);
      if (blue.wins >= 2 || red.wins >= 2 || s.set >= 3) {
        s.phase = 'finished'; s.running = false; s.deadline = null; record(s, '경기 끝', boundary); return;
      }
      s.phase = 'maintenance'; s.remaining = s.settings.maintenance * 1000;
    }
    s.deadline = boundary + s.remaining;
  }
  s.remaining = remainingAt(s, now);
}
export function matchReducer(state: MatchState, event: MatchEvent): MatchState {
  const s = structuredClone(state);
  if (event.type === 'undo') {
    const previous = s.history.pop();
    if (!previous) return s;
    // Undo pauses at the event's captured time so it cannot instantly expire again.
    return { ...previous, running: false, deadline: null, history: s.history };
  }
  advance(s, event.now);
  if (event.type === 'tick') return s;
  if (event.type === 'reset') return { ...createMatch(s.settings), muted: s.muted, teams: { blue: { ...createMatch().teams.blue, name: s.teams.blue.name }, red: { ...createMatch().teams.red, name: s.teams.red.name } } };
  if (event.type === 'name') { s.teams[event.team].name = event.name.trim().slice(0, 40) || (event.team === 'blue' ? '파랑 팀' : '빨강 팀'); return s; }
  if (event.type === 'mute') { s.muted = !s.muted; return s; }
  if (event.type === 'settings') {
    if (s.records.length || s.history.length || s.running) return s;
    if (!Object.values(event.settings).every(n => Number.isInteger(n) && n >= 1 && n <= 3600)) return s;
    s.settings = { ...event.settings }; s.remaining = s.settings.ready * 1000; return s;
  }
  if (s.phase === 'finished') return s;
  if (event.type === 'start' || event.type === 'resume') {
    if (s.running) return s;
    remember(s); s.running = true; s.deadline = event.now + s.remaining; return s;
  }
  if (event.type === 'pause') {
    if (!s.running) return s;
    remember(s); s.running = false; s.deadline = null; return s;
  }
  if (event.type === 'score' && s.teams[event.team].score + event.delta < 0) return s;
  if (event.type === 'offside' && event.on !== undefined && event.on === s.teams[event.team].offside) return s;
  remember(s);
  if (event.type === 'score') { s.teams[event.team].score += event.delta; record(s, event.delta > 0 ? '득점' : '감점', event.now, event.team, event); }
  if (event.type === 'offside') { s.teams[event.team].offside = event.on ?? !s.teams[event.team].offside; record(s, s.teams[event.team].offside ? '오프사이드 켬' : '오프사이드 끔', event.now, event.team, event); }
  if (event.type === 'penalty') { s.teams[event.team].penalties++; record(s, '페널티', event.now, event.team, event); }
  return s;
}
export function serializeMatch(s: MatchState): string { return JSON.stringify({ version: 1, state: s }); }
function validSnapshot(s: Snapshot): boolean {
  return !!s && ['ready', 'playing', 'maintenance', 'finished'].includes(s.phase) && Number.isInteger(s.set) && s.set >= 1 && s.set <= 3
    && typeof s.running === 'boolean' && typeof s.muted === 'boolean' && Number.isFinite(s.remaining) && s.remaining >= 0
    && (s.deadline === null || Number.isFinite(s.deadline)) && (!s.running || s.deadline !== null)
    && !!s.settings && ['ready', 'playing', 'maintenance'].every(key => { const n = s.settings[key as keyof Settings]; return Number.isInteger(n) && n >= 1 && n <= 3600; })
    && !!s.teams && (['blue', 'red'] as const).every(key => { const t = s.teams[key]; return !!t && typeof t.name === 'string' && t.name.length <= 40 && typeof t.offside === 'boolean' && t.wins <= 3 && [t.score, t.wins, t.penalties].every(n => Number.isInteger(n) && n >= 0); })
    && Array.isArray(s.records) && s.records.every(r => !!r && Number.isFinite(r.at) && Number.isFinite(r.remaining) && Number.isInteger(r.set) && (r.team === null || r.team === 'blue' || r.team === 'red') && typeof r.kind === 'string' && typeof r.score === 'string' && (r.drone === undefined || typeof r.drone === 'string') && (r.auto === undefined || typeof r.auto === 'boolean') && (r.reason === undefined || typeof r.reason === 'string'))
    && Array.isArray(s.results) && s.results.every(r => !!r && Number.isInteger(r.set) && Number.isFinite(r.blue) && Number.isFinite(r.red) && (r.winner === null || r.winner === 'blue' || r.winner === 'red'));
}
export function restoreMatch(raw: string | null, now: number): MatchState {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (data?.version !== 1 || !validSnapshot(data.state) || !Array.isArray(data.state.history) || !data.state.history.every(validSnapshot)) return createMatch();
    return matchReducer(data.state, { type: 'tick', now });
  } catch { return createMatch(); }
}
export function formatClock(ms: number): string { const seconds = Math.ceil(ms / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
export function exportCSV(s: MatchState): string {
  const cell = (v: unknown) => { const value = String(v); return `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`; };
  return '\uFEFF' + [['세트', '남은 시간', '시각', '팀', '종류', '점수', '기체'], ...s.records.map(r => [r.set, formatClock(r.remaining), new Date(r.at).toISOString(), r.team ? s.teams[r.team].name : '전체', r.kind, r.score, r.drone ?? ''])].map(row => row.map(cell).join(',')).join('\r\n');
}
