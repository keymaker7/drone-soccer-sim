import { describe, expect, it } from 'vitest';
import { createMatch } from '../score/match';
import { armLockReason, callText, createCallQueue, phaseHint } from './match-ui';
describe('match presentation contracts', () => {
  it('explains all automatic calls without exposing internal reason codes', () => {
    expect(callText({kind:'goal',team:'blue',id:'p',nick:'감자'},[{id:'p',nick:'감자',team:'blue',role:'striker'}])).toBe('파랑 팀 골! · 감자(스트라이커)');
    for (const [reason,text] of [['rim','테두리에 닿았어요'],['not-striker','스트라이커만 골을 넣을 수 있어요'],['reverse','역방향 통과는 점수가 없어요']] as const) expect(callText({kind:'no-goal',team:'red',reason})).toContain(text);
    expect(callText({kind:'penalty',team:'blue',reason:'offside-pass'})).toBe('파랑 팀 페널티 · 오프사이드 중 통과');
    expect(callText({kind:'penalty',team:'red',reason:'own-goal-back'})).toContain('자기 골대 뒤로 들어감');
    expect(callText({kind:'offside-clear',team:'blue'})).toBe('파랑 팀 오프사이드 해제');
  });
  it('queues identical repeated calls in order for the full display interval', () => {
    const q = createCallQueue(2500); q.push('골'); q.push('골'); q.push('오프사이드',true);
    expect(q.read(0).text).toBe('골'); expect(q.read(2499).text).toBe('골');
    expect(q.read(2500).text).toBe('골'); expect(q.read(5000)).toEqual({text:'오프사이드',emphasis:true});
    expect(q.read(7500).text).toBe(''); q.push('다음'); q.clear(); expect(q.read(8000).text).toBe('');
  });
  it('renders stages and gates only explicit host ARM denial', () => {
    const s = {...createMatch(),armAllowed:false}; expect(phaseHint(s,true)).toContain('자유 연습 중');
    expect(armLockReason(createMatch())).toBe('');
    expect(armLockReason({...s,armAllowed:true})).toBe('');
    expect(armLockReason(s)).toBe('경기 시작 신호를 기다려요');
    s.running=true; s.remaining=7000; expect(phaseHint(s)).toBe('준비 7 · 출발 자리에서 기다려요');
    s.phase='maintenance'; s.remaining=24000; expect(phaseHint(s)).toBe('정비 00:24 · 다음 세트 준비'); expect(armLockReason(s)).toBe('정비 시간이에요');
    s.phase='playing'; s.armAllowed=true; expect(armLockReason(s)).toBe(''); s.running=false; s.armAllowed=false; expect(armLockReason(s)).toBe('일시정지 중이에요');
    s.phase='finished'; s.armAllowed=true; s.teams.blue.wins=2; s.teams.red.wins=1; expect(phaseHint(s)).toBe('경기 끝 · 파랑 팀 승리 2 : 1'); expect(armLockReason(s)).toBe('');
  });
});
