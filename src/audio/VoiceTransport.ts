import { rtcConfiguration } from '../network/config';
import { transportCounters } from '../network/bandwidth';
import type { Counter } from '../network/bandwidth';
import type { VoiceSignal } from './voicePolicy';

type Link = { pc: RTCPeerConnection; sender: RTCRtpSender; session: string; born: number;
  described: boolean; ice: RTCIceCandidateInit[]; queue: Promise<void>; lastOffer: number };

export class VoiceTransport {
  private links = new Map<string, Link>();
  private allowed = new Set<string>();
  private candidates = new Map<string, RTCIceCandidateInit[]>();
  private signalQueues = new Map<string, Promise<void>>();
  private track: MediaStreamTrack | null = null;
  private closed = false;

  constructor(private self: string, private send: (peer: string, signal: VoiceSignal) => boolean,
    private onTrack: (peer: string, track: MediaStreamTrack) => void,
    private onRemove: (peer: string) => void, private onChange: () => void) {}

  reconcile(peers: string[]) {
    if (this.closed) return;
    this.allowed = new Set(peers);
    // Đóng người xa/bị loại trước khi mở người mới: không vượt trần ngay cả lúc đổi nhóm.
    for (const peer of this.links.keys()) if (!this.allowed.has(peer)) this.remove(peer, true);
    for (const peer of peers) {
      if (peer >= this.self) continue;
      const old = this.links.get(peer);
      if (old && !['closed', 'failed'].includes(old.pc.connectionState)
        && (old.pc.connectionState === 'connected' || performance.now() - old.born < 15000)) {
        if (old.pc.connectionState !== 'connected' && old.pc.localDescription?.type === 'offer'
          && performance.now() - old.lastOffer > 3000) {
          old.lastOffer = performance.now();
          this.send(peer, { type: 'voice-signal', kind: 'offer', session: old.session, description: old.pc.localDescription.toJSON() });
        }
        continue;
      }
      this.remove(peer, true);
      const link = this.create(peer, crypto.randomUUID());
      if (link) void this.offer(peer, link).catch(() => this.removeCurrent(peer, link));
    }
  }
  private create(peer: string, session: string): Link | null {
    if (this.closed || !this.allowed.has(peer) || this.links.size >= 12) return null;
    const pc = new RTCPeerConnection(rtcConfiguration());
    // Có sẵn m-line audio dù chưa bật mic; đổi mic hoặc tắt mic dùng replaceTrack, không renegotiate data.
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const link: Link = { pc, sender: transceiver.sender, session, born: performance.now(), described: false, ice: [], queue: Promise.resolve(), lastOffer: performance.now() };
    this.links.set(peer, link);
    if (this.track) void link.sender.replaceTrack(this.track).catch(() => this.removeCurrent(peer, link));
    pc.onicecandidate = event => {
      if (!event.candidate || this.links.get(peer) !== link) return;
      const candidate = event.candidate.toJSON();
      if (link.described) this.send(peer, { type: 'voice-signal', kind: 'candidate', session, candidate });
      else link.ice.push(candidate);
    };
    pc.ontrack = event => {
      if (event.track.kind === 'audio' && this.links.get(peer) === link && this.allowed.has(peer)) this.onTrack(peer, event.track);
      else event.track.stop();
    };
    pc.onconnectionstatechange = () => {
      if (this.links.get(peer) !== link) return;
      if (pc.connectionState === 'connected') {
        void this.limitBitrate(link);
        // Một số trình duyệt tạo track nhận từ transceiver trước khi ontrack được gắn.
        for (const receiver of pc.getReceivers()) if (receiver.track.kind === 'audio' && receiver.track.readyState === 'live') this.onTrack(peer, receiver.track);
      }
      this.onChange();
    };
    return link;
  }
  private async limitBitrate(link: Link) {
    try {
      const parameters = link.sender.getParameters();
      if (!parameters.encodings.length) return;
      parameters.encodings[0].maxBitrate = 24000;
      await link.sender.setParameters(parameters);
    } catch { /* Một số trình duyệt tự quản bitrate Opus; vẫn dùng audio bình thường. */ }
  }
  private async description(peer: string, link: Link, kind: 'offer' | 'answer') {
    if (this.links.get(peer) !== link || !link.pc.localDescription) return;
    const sent = this.send(peer, { type: 'voice-signal', kind, session: link.session,
      description: link.pc.localDescription.toJSON() });
    if (!sent) { this.removeCurrent(peer, link); return; }
    link.described = true;
    for (const candidate of link.ice.splice(0)) this.send(peer, { type: 'voice-signal', kind: 'candidate', session: link.session, candidate });
  }
  private async offer(peer: string, link: Link) {
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await this.description(peer, link, 'offer');
  }
  receive(peer: string, signal: VoiceSignal) {
    if (this.closed || !this.allowed.has(peer) || !signal || typeof signal.session !== 'string'
      || !/^[a-zA-Z0-9-]{1,64}$/.test(signal.session)) return;
    const queue = this.signalQueues.get(peer) ?? Promise.resolve();
    this.signalQueues.set(peer, queue.then(() => this.apply(peer, signal)).catch(() => {
      const link = this.links.get(peer); if (link?.session === signal.session) this.remove(peer, true);
    }));
  }
  private async apply(peer: string, signal: VoiceSignal) {
    if (this.closed || !this.allowed.has(peer)) return;
    let link = this.links.get(peer);
    const key = `${peer}:${signal.session}`;
    if (signal.kind === 'bye') { if (link?.session === signal.session) this.remove(peer, false); return; }
    if (signal.kind === 'offer') {
      if (peer <= this.self || signal.description?.type !== 'offer' || typeof signal.description.sdp !== 'string'
        || signal.description.sdp.length > 32000) return;
      if (link?.session === signal.session) {
        if (link.pc.localDescription?.type === 'answer') await this.description(peer, link, 'answer');
        return;
      }
      this.remove(peer, false); link = this.create(peer, signal.session) ?? undefined;
      if (!link) return;
      await link.pc.setRemoteDescription(signal.description);
      for (const candidate of this.candidates.get(key) ?? []) await link.pc.addIceCandidate(candidate);
      this.candidates.delete(key);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      await this.description(peer, link, 'answer');
    } else if (signal.kind === 'answer' && link?.session === signal.session && signal.description?.type === 'answer') {
      if (link.pc.signalingState !== 'have-local-offer' || typeof signal.description.sdp !== 'string' || signal.description.sdp.length > 32000) return;
      await link.pc.setRemoteDescription(signal.description);
      for (const candidate of this.candidates.get(key) ?? []) await link.pc.addIceCandidate(candidate);
      this.candidates.delete(key);
    } else if (signal.kind === 'candidate' && signal.candidate && typeof signal.candidate.candidate === 'string'
      && signal.candidate.candidate.length < 2048) {
      if (link?.session === signal.session && link.pc.remoteDescription) await link.pc.addIceCandidate(signal.candidate);
      else {
        if (this.candidates.size >= 32) this.candidates.delete(this.candidates.keys().next().value!);
        this.candidates.set(key, [...(this.candidates.get(key) ?? []), signal.candidate].slice(-64));
      }
    }
  }
  async setTrack(track: MediaStreamTrack | null) {
    this.track = track;
    await Promise.all([...this.links].map(async ([peer, link]) => {
      link.queue = link.queue.then(async () => {
        if (this.links.get(peer) !== link) return;
        try { await link.sender.replaceTrack(track); }
        catch { this.removeCurrent(peer, link); }
      });
      await link.queue;
    }));
  }
  connected() { return [...this.links].filter(([, link]) => link.pc.connectionState === 'connected').map(([peer]) => peer); }
  count() { return this.links.size; }
  async counters(): Promise<Counter[]> {
    const results = await Promise.all([...this.links].map(async ([peer, link]) => {
      try { return transportCounters(`${peer}:${link.session}`, await link.pc.getStats()); } catch { return []; }
    }));
    return results.flat();
  }
  private removeCurrent(peer: string, link: Link) { if (this.links.get(peer) === link) this.remove(peer, true); }
  private remove(peer: string, notify: boolean) {
    const link = this.links.get(peer); if (!link) return;
    this.links.delete(peer);
    if (notify) this.send(peer, { type: 'voice-signal', kind: 'bye', session: link.session });
    link.pc.ontrack = null; link.pc.onicecandidate = null; link.pc.onconnectionstatechange = null; link.pc.close();
    this.onRemove(peer); this.onChange();
  }
  close() {
    this.closed = true; this.allowed.clear();
    for (const peer of this.links.keys()) this.remove(peer, true);
    this.candidates.clear(); this.signalQueues.clear(); this.track = null;
  }
}
