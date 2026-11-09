// Token bucket dùng đồng hồ đơn điệu. Có giới hạn theo loại, tổng gói và tổng byte.
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(readonly rate: number, readonly burst: number, now = performance.now()) { this.tokens = burst; this.last = now; }
  take(cost = 1, now = performance.now()) {
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) * this.rate / 1000); this.last = now;
    if (!Number.isFinite(cost) || cost < 0 || cost > this.tokens) return false;
    this.tokens -= cost; return true;
  }
}
export const MESSAGE_LIMITS: Record<string, readonly [number, number]> = {
  pose: [15, 20], 'pose-keyframe': [4, 8], hello: [.5, 3], snapshot: [4, 8],
  seat: [2, 3], 'seat-result': [3, 6], 'table-request': [2, 3], 'table-result': [4, 8],
  'table-clock': [2, 3], chat: [1, 1], emote: [2, 2],
  'voice-status': [6, 12], 'voice-signal': [16, 64], 'membership-refresh': [.5, 2],
};
type PeerGate = { all: TokenBucket; bytes: TokenBucket; types: Map<string, TokenBucket> };
export class TrafficGate {
  private peers = new Map<string, PeerGate>();
  private wire = new Map<string, { packets: TokenBucket; bytes: TokenBucket }>();
  allow(peer: string, type: string, bytes: number, now = performance.now()) {
    const limit = Object.hasOwn(MESSAGE_LIMITS, type) ? MESSAGE_LIMITS[type] : undefined;
    if (!limit || !Number.isInteger(bytes) || bytes < 1 || bytes > 65536) return false;
    let gate = this.peers.get(peer);
    if (!gate) {
      if (this.peers.size >= 30) return false;
      gate = { all: new TokenBucket(80, 120, now), bytes: new TokenBucket(131072, 262144, now), types: new Map() }; this.peers.set(peer, gate);
    }
    if (!gate.all.take(1, now) || !gate.bytes.take(bytes, now)) return false;
    let bucket = gate.types.get(type);
    if (!bucket) { bucket = new TokenBucket(limit[0], limit[1], now); gate.types.set(type, bucket); }
    return bucket.take(1, now);
  }
  // Trước JSON.parse: gói hỏng vẫn tiêu ngân sách CPU/byte, không thể lách bằng loại giả.
  raw(peer: string, bytes: number, now = performance.now()) {
    if (bytes < 1 || bytes > 65536) return false;
    let gate = this.wire.get(peer);
    if (!gate) {
      if (this.wire.size >= 30) return false;
      gate = { packets: new TokenBucket(100, 160, now), bytes: new TokenBucket(131072, 262144, now) }; this.wire.set(peer, gate);
    }
    return gate.packets.take(1, now) && gate.bytes.take(bytes, now);
  }
  forget(peer: string) { this.peers.delete(peer); this.wire.delete(peer); }
}

export class SignalGate {
  private peers = new Map<string, Map<string, TokenBucket>>();
  allow(peer: string, kind: string, now = performance.now()) {
    if (!['offer', 'answer', 'candidate'].includes(kind)) return false;
    let buckets = this.peers.get(peer);
    if (!buckets) { if (this.peers.size >= 30) return false; buckets = new Map(); this.peers.set(peer, buckets); }
    let bucket = buckets.get(kind);
    if (!bucket) { bucket = kind === 'candidate' ? new TokenBucket(10, 60, now) : new TokenBucket(.25, 2, now); buckets.set(kind, bucket); }
    return bucket.take(1, now);
  }
  forget(peer: string) { this.peers.delete(peer); }
}

// Rate limit không đủ nếu DB chậm hơn tốc độ yêu cầu: phải chặn cả số việc đang chờ.
export class HostWorkQueue {
  private tail = Promise.resolve();
  private pending = new Map<string, number>();
  private closed = false;
  size = 0;
  constructor(private onError: (error: unknown) => void, private capacity = 64, private perPeer = 2) {}
  submit(peer: string, job: () => Promise<void>) {
    const count = this.pending.get(peer) ?? 0;
    if (this.closed || this.size >= this.capacity || count >= this.perPeer) return false;
    this.size++; this.pending.set(peer, count + 1);
    this.tail = this.tail.then(async () => { if (!this.closed) await job(); })
      .catch(error => { this.onError(error); }).finally(() => {
        this.size--; const left = (this.pending.get(peer) ?? 1) - 1;
        if (left > 0) this.pending.set(peer, left); else this.pending.delete(peer);
      });
    return true;
  }
  idle() { return this.tail; }
  close() { this.closed = true; }
}
