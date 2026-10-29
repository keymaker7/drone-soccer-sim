import Peer, { type DataConnection } from 'peerjs';
import { decode, encode, type Message } from './protocol';
export type LinkType = '직접(같은 와이파이)' | '직접(인터넷 경유)' | '중계(TURN)' | '연결 안 됨';
export interface NetStats { linkType: LinkType; rttMs: number; statesPerSec: number; disconnects: number; peers: number }
export const emptyStats = (): NetStats => ({ linkType: '연결 안 됨', rttMs: 0, statesPerSec: 0, disconnects: 0, peers: 0 });
export interface Transport {
  open(options: { role: 'host' | 'client'; room: string }): Promise<void>;
  send(peer: string, message: Message): void;
  onMessage(handler: (peer: string, message: Message) => void): () => void;
  onPeer(handler: (peer: string, connected: boolean) => void): () => void;
  onError(handler: (message: string) => void): () => void;
  close(): void;
  stats(peer?: string): Promise<NetStats>;
}
export const SIGNAL_ERROR = '중개 서버(0.peerjs.com)에 접속할 수 없어요 — 학교 방화벽일 수 있어요';
export const CHANNEL_ERROR = '기기끼리 직접 연결이 막혀 있어요 — 중계 서버가 필요해요';
export function classifyCandidates(local: string | undefined, remote: string | undefined): LinkType {
  if (local === 'relay' || remote === 'relay') return '중계(TURN)';
  if (local === 'host' && remote === 'host') return '직접(같은 와이파이)';
  if (local && remote) return '직접(인터넷 경유)';
  return '연결 안 됨';
}
export class PeerTransport implements Transport {
  private peer?: Peer;
  private connections = new Map<string, DataConnection>();
  private messages = new Set<(peer: string, message: Message) => void>();
  private peers = new Set<(peer: string, connected: boolean) => void>();
  private errors = new Set<(message: string) => void>();
  private disconnects = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private closed = false;
  private settleOpen?: () => void;
  onMessage(fn: (peer: string, message: Message) => void) { this.messages.add(fn); return () => { this.messages.delete(fn); }; }
  onPeer(fn: (peer: string, connected: boolean) => void) { this.peers.add(fn); return () => { this.peers.delete(fn); }; }
  onError(fn: (message: string) => void) { this.errors.add(fn); return () => { this.errors.delete(fn); }; }
  open({role, room}: {role: 'host' | 'client'; room: string}): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      this.settleOpen = finish;
      const fail = (message: string) => {
        if (this.closed) return;
        if (!settled) {
          // Reject before close settles pending work; retain the original failure.
          settled = true; reject(new Error(message)); this.close();
        }
        for (const fn of this.errors) fn(message);
      };
      const later = (fn: () => void) => { const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, 10000); this.timers.add(timer); return timer; };
      const clear = (timer: ReturnType<typeof setTimeout>) => { clearTimeout(timer); this.timers.delete(timer); };
      const signalTimer = later(() => fail(SIGNAL_ERROR));
      const p = role === 'host' ? new Peer(`dsoccer-${room}`) : new Peer(); this.peer = p;
      const attach = (c: DataConnection) => {
        if (this.connections.has(c.peer)) { c.close(); return; }
        let active = true;
        const timeout = later(() => { if (!c.open) { active = false; c.close(); if (role === 'client') fail(CHANNEL_ERROR); } });
        c.on('open', () => { clear(timeout); if (this.closed || !active) { c.close(); return; } this.connections.set(c.peer, c); for (const fn of this.peers) fn(c.peer, true); if (role === 'client') finish(); });
        c.on('data', raw => { if (this.closed || !active || !c.open || this.connections.get(c.peer) !== c) return; const msg = decode(raw); if (msg) for (const fn of this.messages) fn(c.peer, msg); });
        const removed = () => { active = false; clear(timeout); if (this.connections.get(c.peer) === c) { this.connections.delete(c.peer); this.disconnects++; for (const fn of this.peers) fn(c.peer, false); } };
        c.on('close', removed);
        c.on('error', () => { const wasOpen = this.connections.get(c.peer) === c; removed(); c.close(); if (role === 'client' && !wasOpen) fail(CHANNEL_ERROR); });
      };
      p.on('connection', c => { if (!this.closed && role === 'host') attach(c); else c.close(); });
      p.on('open', () => { clear(signalTimer); if (this.closed) return; if (role === 'host') finish(); else attach(p.connect(`dsoccer-${room}`, { reliable: true, serialization: 'json' })); });
      p.on('error', err => { clear(signalTimer); fail(err.type === 'peer-unavailable' ? CHANNEL_ERROR : err.type === 'unavailable-id' ? '이미 사용 중인 방 코드예요. 새 방을 만들어 주세요.' : SIGNAL_ERROR); });
      p.on('disconnected', () => { if (!this.closed) fail(SIGNAL_ERROR); });
    });
  }
  send(peer: string, message: Message) { const c = this.connections.get(peer); if (c?.open) { try { c.send(encode(message)); } catch { c.close(); } } }
  close() { this.closed = true; this.settleOpen?.(); for (const t of this.timers) clearTimeout(t); this.timers.clear(); for (const c of this.connections.values()) c.close(); this.connections.clear(); this.peer?.destroy(); }
  async stats(peer?: string): Promise<NetStats> {
    const result = {...emptyStats(), disconnects: this.disconnects, peers: this.connections.size};
    const connection = peer ? this.connections.get(peer) : this.connections.values().next().value;
    if (!connection?.open) return result;
    try {
      const report = await connection.peerConnection.getStats();
      let pair: RTCStats | undefined;
      report.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = report.get(s.selectedCandidatePairId); });
      if (!pair) report.forEach(s => { if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated) pair = s; });
      if (pair) {
        const selected = pair as RTCStats & {localCandidateId: string; remoteCandidateId: string; currentRoundTripTime?: number};
        result.linkType = classifyCandidates(report.get(selected.localCandidateId)?.candidateType, report.get(selected.remoteCandidateId)?.candidateType);
        result.rttMs = Math.round((selected.currentRoundTripTime ?? 0) * 1000);
      }
    } catch { /* Browser may not expose ICE diagnostics yet. */ }
    return result;
  }
}
