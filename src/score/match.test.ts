import { describe, expect, it } from 'vitest';
import { createMatch, exportCSV, matchReducer as dispatch, restoreMatch, serializeMatch } from './match';
const settings = { ready: 1, playing: 10, maintenance: 2 };
function start() { return dispatch(createMatch(settings), { type: 'start', now: 0 }); }
describe('match reducer', () => {
  it('uses exact phase boundaries, including a late tick', () => {
    const s = dispatch(start(), { type: 'tick', now: 13000 });
    expect(s.phase).toBe('playing'); expect(s.set).toBe(2); expect(s.remaining).toBe(10000);
    expect(s.records.map(r => [r.kind, r.at])).toEqual([['세트 시작', 1000], ['무승부 세트', 11000], ['세트 시작', 13000]]);
  });
  it('ends after two set wins', () => {
    let s = dispatch(start(), { type: 'score', team: 'blue', delta: 1, now: 1000 });
    s = dispatch(s, { type: 'tick', now: 13000 });
    s = dispatch(s, { type: 'score', team: 'blue', delta: 1, now: 14000 });
    s = dispatch(s, { type: 'tick', now: 23000 });
    expect(s.phase).toBe('finished'); expect(s.set).toBe(2); expect(s.teams.blue.wins).toBe(2); expect(s.records.at(-1)?.kind).toBe('경기 끝');
  });
  it('draws award no wins and stop after three sets', () => {
    const s = dispatch(start(), { type: 'tick', now: 999999 });
    expect(s.phase).toBe('finished'); expect(s.results).toHaveLength(3); expect(s.results.every(r => r.winner === null)).toBe(true);
    expect(s.teams.blue.wins + s.teams.red.wins).toBe(0);
  });
  it('undoes multiple events including penalties and offside', () => {
    let s = createMatch();
    s = dispatch(s, { type: 'score', team: 'blue', delta: 1, now: 0 });
    s = dispatch(s, { type: 'offside', team: 'red', now: 10 });
    s = dispatch(s, { type: 'penalty', team: 'blue', now: 20 });
    s = dispatch(s, { type: 'undo', now: 30 }); expect(s.teams.blue.penalties).toBe(0);
    s = dispatch(s, { type: 'undo', now: 40 }); expect(s.teams.red.offside).toBe(false);
    s = dispatch(s, { type: 'undo', now: 50 }); expect(s.teams.blue.score).toBe(0); expect(s.records).toHaveLength(0);
  });
  it('restores elapsed time and transitions after reload', () => {
    const s = restoreMatch(serializeMatch(start()), 16000);
    expect(s.set).toBe(2); expect(s.phase).toBe('playing'); expect(s.remaining).toBe(7000);
    const paused = dispatch(s, { type: 'pause', now: 17000 });
    expect(restoreMatch(serializeMatch(paused), 99999).remaining).toBe(6000);
    expect(dispatch(paused, { type: 'resume', now: 100000 }).deadline).toBe(106000);
  });
  it('restores corrupted storage safely', () => {
    expect(restoreMatch('{broken', 0)).toEqual(createMatch());
    const s = createMatch(); (s.teams as unknown) = null;
    expect(restoreMatch(serializeMatch(s), 0)).toEqual(createMatch());
  });
  it('rejects invalid win counts without crashing rendering', () => {
    const s = createMatch(); s.teams.blue.wins = 99;
    expect(restoreMatch(serializeMatch(s), 0)).toEqual(createMatch());
  });
  it('does not change preparation duration after paused start', () => {
    const s = dispatch(start(), { type: 'pause', now: 500 });
    const changed = dispatch(s, { type: 'settings', settings: { ready: 90, playing: 20, maintenance: 5 }, now: 600 });
    expect(changed.settings).toEqual(settings); expect(changed.remaining).toBe(500);
  });
  it('exports Excel BOM, escaped quoted names, CRLF and event metadata', () => {
    let s = dispatch(createMatch(), { type: 'name', team: 'blue', name: '파랑,"팀"', now: 0 });
    s = dispatch(s, { type: 'score', team: 'blue', delta: 1, now: 0 });
    const csv = exportCSV(s); expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain('\r\n'); expect(csv).toContain('"파랑,""팀"""'); expect(csv).toContain('"득점","1:0"');
  });
  it('clamps deductions and blocks scoring after match', () => {
    expect(dispatch(createMatch(), { type: 'score', team: 'blue', delta: -1, now: 0 }).teams.blue.score).toBe(0);
    const ended = dispatch(start(), { type: 'tick', now: 999999 });
    expect(dispatch(ended, { type: 'score', team: 'blue', delta: 1, now: 999999 }).teams.blue.score).toBe(0);
  });
  it('keeps multiple corrections paused across a set boundary', () => {
    let s = dispatch(start(), { type: 'score', team: 'blue', delta: 1, now: 2000 });
    s = dispatch(s, { type: 'tick', now: 13000 });
    for (let i = 0; i < 3; i++) {
      s = dispatch(s, { type: 'undo', now: 14000 + i });
      expect(s.running).toBe(false); expect(s.deadline).toBeNull();
    }
    expect(s.set).toBe(1); expect(s.phase).toBe('playing'); expect(s.teams.blue.score).toBe(0);
    expect(s.remaining).toBe(9000); expect(s.results).toHaveLength(0);
  });
  it('undo of a set end removes win and pauses before transition', () => {
    let s = dispatch(start(), { type: 'score', team: 'blue', delta: 1, now: 1000 });
    s = dispatch(s, { type: 'tick', now: 11000 });
    s = dispatch(s, { type: 'undo', now: 12000 });
    expect(s.phase).toBe('playing'); expect(s.teams.blue.wins).toBe(0); expect(s.results).toHaveLength(0); expect(s.running).toBe(false);
  });
});
