import type { RealtimeChannel } from '@supabase/supabase-js';
import { rtcConfiguration } from './config';
import { errorMessage, supabase } from './supabase';
import type { RoomEvent, PosePacket } from './types';
import { BandwidthMeter, transportCounters } from './bandwidth';
import { SignalGate, TrafficGate } from './rateLimit';
import { RetrySchedule } from './retry';
import type { PeerConnectionStatus } from './retry';

type Signal = { id: string; room_id: string; from_peer: string; to_peer: string;
  payload: { session: string; kind: 'offer' | 'answer' | 'candidate';
    description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } };
type Link = { pc: RTCPeerConnection; session: string; born: number;
  events?: RTCDataChannel; poses?: RTCDataChannel; sendQueue: Promise<void>; described: boolean;
  localIce: RTCIceCandidateInit[]; disconnectedAt?: number; openedAt?: number };

export class Mesh {
  private links = new Map<string, Link>();
  private candidates = new Map<string, RTCIceCandidateInit[]>();
  private queues = new Map<string, Promise<void>>();
  private seen = new Set<string>();
  private members: string[] = [];
  private channel?: RealtimeChannel;
  private poll?: ReturnType<typeof setInterval>;
  private stopped = false;
  private bandwidthMeter = new BandwidthMeter();
  private started = false;
  private inboxBusy = false;
  private pollTick = 0;
  private startup?: ReturnType<typeof setTimeout>;
  private incoming = new TrafficGate();
  private outgoing = new TrafficGate();
  private signalingGate = new SignalGate();
  private retries = new Map<string, RetrySchedule>();
  private violations = new Map<string, { count: number; at: number; until: number }>();
  private pendingSignals = new Map<string, number>();
  private retired = new Set<string>();
  private encoder = new TextEncoder();
  private manualOffers = new Set<string>();

  constructor(private room: string, private self: string,
    private onEvent: (peer: string, event: RoomEvent) => void,
    private onPose: (peer: string, packet: PosePacket) => void,
    private onConnection: () => void,
    private onError: (message: string) => void,
    private onPoseOpen: (peer: string) => void) {}

  async start() {
    this.started = true;
    // REST đọc bù tiếp tục chạy nếu websocket bị chặn; vị trí vẫn chỉ đi qua P2P.
    this.poll = setInterval(() => {
      this.update(this.members);
      if (++this.pollTick % 3 === 0) void this.inbox();
    }, 1000);
    await new Promise<void>(resolve => {
      this.startup = setTimeout(() => { this.onError('Websocket signaling chưa sẵn sàng; đang đọc bù SDP/ICE bằng REST.'); resolve(); }, 5000);
      this.channel = supabase.channel(`signals:${this.self}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals',
          filter: `to_peer=eq.${this.self}` }, payload => this.receive(payload.new as Signal))
        .subscribe(status => {
          if (status === 'SUBSCRIBED') { clearTimeout(this.startup); resolve(); void this.inbox(); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(this.startup); this.onError('Websocket signaling mất kết nối; đang dùng REST đọc bù và tự thử lại.'); resolve();
          }
        });
    });
    if (!this.stopped) { this.update(this.members); void this.inbox(); }
  }

  private async inbox() {
    if (this.stopped || this.inboxBusy || !navigator.onLine) return;
    this.inboxBusy = true;
    try {
    const { data, error } = await supabase.from('signals').select('*').eq('room_id', this.room)
      .eq('to_peer', this.self).gte('created_at', new Date(Date.now() - 120000).toISOString())
      .order('created_at').limit(500).abortSignal(AbortSignal.timeout(10000));
    if (error) this.onError(error.message);
    else for (const row of data ?? []) this.receive(row as Signal);
    } catch (error) { this.onError(errorMessage(error)); } finally { this.inboxBusy = false; }
  }

  private receive(row: Signal) {
    if (this.stopped || row.room_id !== this.room || row.to_peer !== this.self || !this.members.includes(row.from_peer) || this.seen.has(row.id)) return;
    const waiting = this.pendingSignals.get(row.from_peer) ?? 0;
    if (waiting >= 128) return;
    this.seen.add(row.id);
    if (this.seen.size > 4000) this.seen.delete(this.seen.values().next().value!);
    if (!this.signalingGate.allow(row.from_peer, row.payload?.kind)) {
      this.violation(row.from_peer); void this.discardSignal(row.id); return;
    }
    this.pendingSignals.set(row.from_peer, waiting + 1);
    const queue = this.queues.get(row.from_peer) ?? Promise.resolve();
    this.queues.set(row.from_peer, queue.then(async () => {
      await this.signal(row);
      await this.discardSignal(row.id);
    }).catch(error => this.onError(errorMessage(error))).finally(() => {
      if (this.members.includes(row.from_peer)) this.pendingSignals.set(row.from_peer, Math.max(0, (this.pendingSignals.get(row.from_peer) ?? 1) - 1));
      else this.pendingSignals.delete(row.from_peer);
    }));
  }
  private async discardSignal(id: string) {
    try { await supabase.from('signals').delete().eq('id', id).abortSignal(AbortSignal.timeout(10000)); }
    catch { /* Seen-set bỏ trùng; lần poll sau vẫn có thể dọn hàng. */ }
  }

  update(members: string[]) {
    if (this.stopped) return;
    this.members = members.slice(0, 29);
    for (const peer of this.links.keys()) if (!members.includes(peer)) this.remove(peer);
    for (const peer of this.retries.keys()) if (!members.includes(peer)) {
      this.retries.delete(peer); this.violations.delete(peer); this.incoming.forget(peer); this.outgoing.forget(peer);
      this.signalingGate.forget(peer);
      this.queues.delete(peer); this.pendingSignals.delete(peer);
      for (const key of this.candidates.keys()) if (key.startsWith(`${peer}:`)) this.candidates.delete(key);
    }
    if (!this.started || !navigator.onLine) return;
    const now = Date.now();
    for (const peer of this.members) {
      if ((this.violations.get(peer)?.until ?? 0) > now) continue;
      let retry = this.retries.get(peer);
      if (!retry) { retry = new RetrySchedule(); this.retries.set(peer, retry); }
      const link = this.links.get(peer);
      const ready = link?.events?.readyState === 'open' && link.poses?.readyState === 'open';
      if (ready && link.pc.connectionState === 'connected') {
        link.openedAt ??= now;
        if (now - link.openedAt > 10000) retry.reset();
        continue;
      }
      const failed = link && (['failed', 'closed'].includes(link.pc.connectionState)
        || (link.disconnectedAt !== undefined && now - link.disconnectedAt > 6000)
        || (now - link.born > 20000 && !ready));
      if (failed) {
        this.remove(peer); retry.fail(now);
        this.onError(retry.exhausted ? 'WebRTC thất bại sau 5 lần. Bấm Thử lại P2P; mạng NAT hạn chế có thể cần TURN.'
          : `WebRTC gián đoạn; sẽ thử lại lần ${retry.attempts}/5.`);
        this.onConnection(); continue;
      }
      // Chỉ đầu UUID lớn tạo offer; đầu còn lại chờ. Backoff chặn vòng tạo PC liên tục.
      if (this.links.has(peer) || !retry.ready(now)) continue;
      if (peer >= this.self && !this.manualOffers.delete(peer)) continue;
      const next = this.makeLink(peer, crypto.randomUUID());
      next.events = this.bind(peer, next, next.pc.createDataChannel('events', { ordered: true }));
      next.poses = this.bind(peer, next, next.pc.createDataChannel('poses', { ordered: false, maxRetransmits: 0 }));
      void this.offer(peer, next).catch(error => {
        if (this.links.get(peer) === next) { this.remove(peer); retry!.fail(Date.now()); this.onError(errorMessage(error)); this.onConnection(); }
      });
    }
  }
  status(): PeerConnectionStatus[] {
    const connected = new Set(this.connected());
    return this.members.map(peer => {
      const retry = this.retries.get(peer), limited = (this.violations.get(peer)?.until ?? 0) > Date.now();
      return { peer, attempts: retry?.attempts ?? 0, state: limited ? 'limited' : connected.has(peer) ? 'connected'
        : retry?.exhausted ? 'failed' : retry?.attempts ? 'retrying' : 'connecting' };
    });
  }
  retryFailed() {
    const connected = new Set(this.connected());
    for (const peer of this.members) if (!connected.has(peer) || this.links.get(peer)?.pc.connectionState !== 'connected') {
      this.retries.get(peer)?.reset(); this.violations.delete(peer); this.remove(peer);
      // Nút thử lại phải dùng được ở cả hai đầu, kể cả đầu thường chỉ nhận offer.
      if (peer >= this.self) this.manualOffers.add(peer);
    }
    this.update(this.members); void this.inbox(); this.onConnection();
  }
  private violation(peer: string) {
    const now = Date.now(), old = this.violations.get(peer);
    const state = old && now - old.at < 10000 ? old : { count: 0, at: now, until: 0 };
    state.count++; this.violations.set(peer, state);
    if (state.count >= 12 && !state.until) {
      state.until = now + 60000; this.remove(peer);
      this.onError('Đã tạm ngắt một peer 60 giây vì vượt giới hạn gói tin.'); this.onConnection();
    }
  }

  private makeLink(peer: string, session: string): Link {
    const pc = new RTCPeerConnection(rtcConfiguration());
    const link: Link = { pc, session, born: Date.now(), sendQueue: Promise.resolve(), described: false, localIce: [] };
    this.links.set(peer, link);
    pc.onicecandidate = event => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (link.described) this.sendSignal(peer, link, { kind: 'candidate', session, candidate });
      else link.localIce.push(candidate);
    };
    pc.ondatachannel = event => this.bind(peer, link, event.channel);
    pc.onconnectionstatechange = () => {
      if (this.links.get(peer) !== link || this.stopped) return;
      if (pc.connectionState === 'disconnected') link.disconnectedAt ??= Date.now();
      else link.disconnectedAt = undefined;
      this.onConnection();
    };
    return link;
  }

  private bind(peer: string, link: Link, channel: RTCDataChannel) {
    if (channel.label === 'events') link.events = channel;
    else if (channel.label === 'poses') link.poses = channel;
    else { channel.close(); return channel; }
    channel.onerror = () => { if (!this.stopped) this.onError('Kênh dữ liệu gặp lỗi; đang kiểm tra và thử kết nối lại.'); };
    channel.onopen = () => {
      if (this.links.get(peer) !== link) return;
      this.onConnection();
      if (channel.label === 'events') this.onEvent(peer, { type: 'hello' });
      else this.onPoseOpen(peer);
    };
    channel.onclose = () => { if (this.links.get(peer) === link) this.onConnection(); };
    channel.onmessage = event => {
      if (this.stopped || this.links.get(peer) !== link) return;
      if (typeof event.data !== 'string' || event.data.length > 65536) { this.violation(peer); return; }
      const bytes = this.encoder.encode(event.data).byteLength;
      if (!this.incoming.raw(peer, bytes)) { this.violation(peer); return; }
      try {
        const packet = JSON.parse(event.data);
        if (!packet || typeof packet !== 'object' || !this.incoming.allow(peer, packet.type, bytes)) { this.violation(peer); return; }
        if (channel.label === 'poses' && packet.type !== 'pose') { this.violation(peer); return; }
        if (channel.label === 'events' && packet.type === 'pose') return;
        if (channel.label === 'events') this.onEvent(peer, packet as RoomEvent);
        else this.onPose(peer, packet as PosePacket);
      } catch { this.violation(peer); }
    };
    return channel;
  }

  private sendSignal(peer: string, link: Link, payload: Signal['payload']) {
    link.sendQueue = link.sendQueue.then(async () => {
      if (this.stopped || this.links.get(peer) !== link) return;
      const { error } = await supabase.from('signals').insert({ room_id: this.room,
        from_peer: this.self, to_peer: peer, payload }).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new Error(error.message);
    }).catch(error => this.onError(errorMessage(error)));
    return link.sendQueue;
  }

  private async description(peer: string, link: Link, kind: 'offer' | 'answer') {
    await this.sendSignal(peer, link, { kind, session: link.session, description: link.pc.localDescription!.toJSON() });
    link.described = true;
    for (const candidate of link.localIce.splice(0)) this.sendSignal(peer, link, { kind: 'candidate', session: link.session, candidate });
  }

  private async offer(peer: string, link: Link) {
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await this.description(peer, link, 'offer');
  }

  private async signal(row: Signal) {
    if (this.stopped) return;
    const peer = row.from_peer, payload = row.payload;
    if (!payload || typeof payload.session !== 'string' || payload.session.length > 64
      || !this.members.includes(peer) || (this.violations.get(peer)?.until ?? 0) > Date.now()
      || payload.kind !== 'offer' && this.retries.get(peer)?.exhausted || this.retired.has(`${peer}:${payload.session}`)) return;
    let link = this.links.get(peer);
    const key = `${peer}:${payload.session}`;
    if (payload.kind === 'offer') {
      if (!payload.description || this.links.size >= 30 && !link) return;
      if (link?.session === payload.session) return;
      // Hai đầu thử lại đồng thời: offer của UUID lớn thắng; đầu nhỏ nhường.
      if (peer < this.self && link?.pc.signalingState === 'have-local-offer') {
        this.retired.add(key); if (this.retired.size > 512) this.retired.delete(this.retired.values().next().value!); return;
      }
      this.retries.get(peer)?.reset();
      this.remove(peer);
      link = this.makeLink(peer, payload.session);
      await link.pc.setRemoteDescription(payload.description);
      if (this.links.get(peer) !== link) return;
      for (const candidate of this.candidates.get(key) ?? []) await link.pc.addIceCandidate(candidate);
      this.candidates.delete(key);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      await this.description(peer, link, 'answer');
    } else if (payload.kind === 'answer' && link?.session === payload.session && payload.description) {
      if (link.pc.signalingState !== 'have-local-offer') return;
      await link.pc.setRemoteDescription(payload.description);
      for (const candidate of this.candidates.get(key) ?? []) await link.pc.addIceCandidate(candidate);
      this.candidates.delete(key);
    } else if (payload.kind === 'candidate' && payload.candidate) {
      if (link?.session === payload.session && link.pc.remoteDescription) await link.pc.addIceCandidate(payload.candidate);
      else {
        if (this.candidates.size > 100) this.candidates.clear();
        this.candidates.set(key, [...(this.candidates.get(key) ?? []), payload.candidate].slice(-100));
      }
    }
  }

  connected() { return [...this.links].filter(([, link]) => link.events?.readyState === 'open' && link.poses?.readyState === 'open').map(([id]) => id); }
  async bandwidth() {
    const counters = await Promise.all([...this.links].map(async ([peer, link]) => {
      try { return transportCounters(`${peer}:${link.session}`, await link.pc.getStats()); } catch { return []; }
    }));
    return this.bandwidthMeter.sample(counters.flat());
  }
  send(peer: string, event: RoomEvent) { return this.write(peer, this.links.get(peer)?.events, event); }
  broadcast(event: RoomEvent) { for (const peer of this.links.keys()) this.send(peer, event); }
  pose(packet: PosePacket, peer?: string) {
    if (peer) this.write(peer, this.links.get(peer)?.poses, packet);
    else for (const [id, link] of this.links) this.write(id, link.poses, packet);
  }
  private write(peer: string, channel: RTCDataChannel | undefined, value: RoomEvent | PosePacket) {
    if (channel?.readyState !== 'open' || channel.bufferedAmount > 131072) return false;
    try {
      const text = JSON.stringify(value);
      if (!this.outgoing.allow(peer, value.type, this.encoder.encode(text).byteLength)) return false;
      channel.send(text); return true;
    } catch { return false; }
  }
  private remove(peer: string) {
    const link = this.links.get(peer);
    this.links.delete(peer);
    if (link) {
      this.retired.add(`${peer}:${link.session}`); if (this.retired.size > 512) this.retired.delete(this.retired.values().next().value!);
      link.pc.onconnectionstatechange = null; link.pc.onicecandidate = null; link.pc.ondatachannel = null;
      for (const channel of [link.events, link.poses]) if (channel) { channel.onopen = null; channel.onclose = null; channel.onmessage = null; channel.onerror = null; channel.close(); }
      link.pc.close();
    }
  }
  stop() {
    this.stopped = true;
    clearInterval(this.poll); clearTimeout(this.startup);
    for (const peer of this.links.keys()) this.remove(peer);
    if (this.channel) void supabase.removeChannel(this.channel);
    this.candidates.clear(); this.queues.clear(); this.retries.clear(); this.pendingSignals.clear(); this.retired.clear(); this.manualOffers.clear();
  }
}
