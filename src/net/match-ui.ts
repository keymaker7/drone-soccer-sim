import { formatClock } from '../score/match';
import type { MatchSnapshot, RuleCall, RosterEntry } from './protocol';
import { ROLE_LABELS } from './protocol';
export const PHASE_LABELS = { ready:'준비', playing:'경기', maintenance:'정비', finished:'종료' };
export function callText(call: RuleCall, roster: RosterEntry[] = []): string {
  const team = call.team === 'blue' ? '파랑 팀' : '빨강 팀';
  const pilot = roster.find(p => p.id === call.id);
  const who = call.nick ?? pilot?.nick;
  const reason = { 'offside-pass':'오프사이드 중 통과', 'own-goal-back':'자기 골대 뒤로 들어감', rim:'테두리에 닿았어요', 'not-striker':'스트라이커만 골을 넣을 수 있어요', reverse:'역방향 통과는 점수가 없어요' };
  if (call.kind === 'goal') return `${team} 골!${who ? ` · ${who}(${pilot ? ROLE_LABELS[pilot.role] : '스트라이커'})` : ''}`;
  if (call.kind === 'offside') return `${team} 오프사이드`;
  if (call.kind === 'offside-clear') return `${team} 오프사이드 해제`;
  if (call.kind === 'penalty') return `${team} 페널티${call.reason ? ` · ${reason[call.reason]}` : ''}`;
  return call.reason === 'not-striker' ? reason[call.reason] : `무효${call.reason ? ` · ${reason[call.reason]}` : ''}`;
}
export function phaseHint(s: MatchSnapshot, free = false): string {
  if (free) return '자유 연습 중 · 경기 시작을 누르면 모두 출발 자리로';
  if (s.phase === 'finished') {
    const {blue,red} = s.teams;
    return `경기 끝 · ${blue.wins === red.wins ? '무승부' : `${blue.wins > red.wins ? blue.name : red.name} 승리`} ${blue.wins} : ${red.wins}`;
  }
  if (!s.running) return '일시정지 중이에요';
  if (s.phase === 'ready') return `준비 ${Math.ceil(s.remaining/1000)} · 출발 자리에서 기다려요`;
  if (s.phase === 'maintenance') return `정비 ${formatClock(s.remaining)} · 다음 세트 준비`;
  return '';
}
// Only the host decides whether ARM is allowed; missing fields support older hosts.
export function armLockReason(s: MatchSnapshot | null | undefined): string {
  if (s?.armAllowed !== false) return '';
  if (s.phase === 'maintenance') return '정비 시간이에요';
  if (s.phase === 'ready') return '경기 시작 신호를 기다려요';
  if (s.phase === 'playing' && !s.running) return '일시정지 중이에요';
  return '경기 시작 신호를 기다려요';
}
export function createCallQueue(duration: number) {
  const queue: {text:string;emphasis:boolean}[] = [];
  let until = 0, current = {text:'',emphasis:false};
  return {
    push(text: string, emphasis = false) { queue.push({text,emphasis}); },
    read(now: number) { if (now >= until) { current = queue.shift() ?? {text:'',emphasis:false}; until = current.text ? now + duration : now; } return current; },
    clear() { queue.length=0; current={text:'',emphasis:false}; until=0; },
  };
}
