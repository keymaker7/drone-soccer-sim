import type { ThrottleMode } from '../sim/climb';
import type { Arena } from '../sim/constants';
export type Team = 'blue' | 'red';
export type Role = 'striker' | 'guide' | 'libero' | 'sweeper' | 'keeper';
export const ROLE_LABELS: Record<Role, string> = { striker: '스트라이커', guide: '가이드', libero: '리베로', sweeper: '스위퍼', keeper: '키퍼' };
export const rolesFor = (max: 3 | 5): Role[] => max === 3 ? ['striker', 'guide', 'keeper'] : ['striker', 'guide', 'libero', 'sweeper', 'keeper'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normalizeRoomCode = (s: string) => s.toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, '').slice(0, 4);
export const generateRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), n => CODE_CHARS[n % CODE_CHARS.length]).join('');
export interface RosterEntry { id: string; nick: string; team: Team; role: Role }
export interface DroneSnapshot { motorThrottle?: number; vy?: number; id: string; team: Team; role: Role; x: number; y: number; z: number; roll: number; pitch: number; yaw: number; armed: boolean }
export interface Controls { throttleMode?: ThrottleMode; climb?: -1 | 0 | 1; fine?: boolean; axes: { pitch: number; roll: number; yaw: number }; throttle: number; armed: boolean }
export type Message =
 | { v: 1; type: 'hello'; nick: string; team: Team; role: Role }
 | ({ v: 1; type: 'input'; seq: number } & Controls)
 | { v: 1; type: 'ping' | 'pong'; t: number }
 | { v: 1; type: 'welcome'; id: string; arena: Arena; maxPerTeam: 3 | 5 }
 | { v: 1; type: 'reject'; reason: string }
 | { v: 1; type: 'roster'; roster: RosterEntry[]; arena?: Arena; maxPerTeam?: 3 | 5 }
 | { v: 1; type: 'state'; tick: number; drones: DroneSnapshot[] };
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown, max = 100) => typeof x === 'string' && x.length > 0 && x.length <= max;
const team = (x: unknown) => x === 'blue' || x === 'red';
const role = (x: unknown) => typeof x === 'string' && Object.hasOwn(ROLE_LABELS, x);
const arena = (x: unknown) => obj(x) && ['halfLength', 'halfWidth', 'height'].every(k => num(x[k]) && (x[k] as number) > 0 && (x[k] as number) <= 100);
const max = (x: unknown) => x === 3 || x === 5;
const identity = (x: unknown) => obj(x) && text(x.id) && team(x.team) && role(x.role);
export function decode(raw: unknown): Message | null {
  try {
    if (typeof raw === 'string') { if (raw.length > 32768) return null; raw = JSON.parse(raw); }
    if (!obj(raw) || raw.v !== 1) return null;
    let valid = false;
    const axes = raw.axes;
    switch (raw.type) {
      case 'hello': valid = text(raw.nick, 8) && (raw.nick as string).trim().length > 0 && team(raw.team) && role(raw.role); break;
      case 'input': valid = Number.isSafeInteger(raw.seq) && (raw.seq as number) >= 0 && obj(raw.axes) && ['pitch','roll','yaw'].every(k => num((axes as Record<string, unknown>)[k]) && Math.abs((axes as Record<string, number>)[k]) <= 1) && num(raw.throttle) && raw.throttle >= 0 && raw.throttle <= 1 && typeof raw.armed === 'boolean' && (raw.throttleMode === undefined || raw.throttleMode === 'easy' || raw.throttleMode === 'manual') && (raw.climb === undefined || raw.climb === -1 || raw.climb === 0 || raw.climb === 1) && (raw.fine === undefined || typeof raw.fine === 'boolean'); break;
      case 'ping': case 'pong': valid = num(raw.t) && raw.t >= 0; break;
      case 'welcome': valid = text(raw.id) && arena(raw.arena) && max(raw.maxPerTeam); break;
      case 'reject': valid = text(raw.reason, 300); break;
      case 'roster': valid = Array.isArray(raw.roster) && raw.roster.length <= 10 && raw.roster.every(r => identity(r) && text(r.nick, 8)) && (raw.arena === undefined || arena(raw.arena)) && (raw.maxPerTeam === undefined || max(raw.maxPerTeam)); break;
      case 'state': valid = Number.isSafeInteger(raw.tick) && (raw.tick as number) >= 0 && Array.isArray(raw.drones) && raw.drones.length <= 10 && raw.drones.every(d => identity(d) && typeof d.armed === 'boolean' && (d.motorThrottle === undefined || num(d.motorThrottle) && d.motorThrottle >= 0 && d.motorThrottle <= 1) && (d.vy === undefined || num(d.vy) && Math.abs(d.vy) <= 10000) && ['x','y','z','roll','pitch','yaw'].every(k => num(d[k]) && Math.abs(d[k]) <= 10000)); break;
    }
    return valid ? raw as unknown as Message : null;
  } catch { return null; }
}
export const encode = (message: Message): string => JSON.stringify(message, (_key, value) => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value);
