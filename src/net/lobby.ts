import { rolesFor, type RosterEntry, type Role, type Team } from './protocol';
export class Lobby {
  readonly members = new Map<string, RosterEntry>();
  constructor(public maxPerTeam: 3 | 5) {}
  join(id: string, nick: string, team: Team, role: Role): string | null {
    if (this.members.has(id)) return '이미 참가했어요';
    if (!rolesFor(this.maxPerTeam).includes(role)) return '3:3에서는 스트라이커·가이드·키퍼만 참가해요';
    const players = [...this.members.values()].filter(p => p.team === team);
    if (players.length >= this.maxPerTeam) return '이 팀은 자리가 없어요';
    if (players.some(p => p.role === role)) return '이미 선택된 역할이에요';
    this.members.set(id, { id, nick: nick.trim(), team, role }); return null;
  }
  leave(id: string) { this.members.delete(id); }
  get roster() { return [...this.members.values()]; }
}
