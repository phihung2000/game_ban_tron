export type Bandwidth = { upKbps: number; downKbps: number };
export type Counter = { id: string; time: number; sent: number; received: number };

export class BandwidthMeter {
  private previous = new Map<string, Counter>();
  sample(counters: Counter[]): Bandwidth {
    let upKbps = 0, downKbps = 0;
    const next = new Map<string, Counter>();
    for (const c of counters) {
      if (![c.time, c.sent, c.received].every(Number.isFinite) || c.sent < 0 || c.received < 0) continue;
      const old = this.previous.get(c.id); next.set(c.id, c);
      if (!old || c.time <= old.time || c.sent < old.sent || c.received < old.received) continue;
      // byte * 8 / mili giây = kilobit/giây. Baseline riêng cho mỗi kết nối/generation.
      upKbps += (c.sent - old.sent) * 8 / (c.time - old.time);
      downKbps += (c.received - old.received) * 8 / (c.time - old.time);
    }
    this.previous = next;
    return { upKbps, downKbps };
  }
}
export function transportCounters(connectionId: string, report: RTCStatsReport): Counter[] {
  const selected = new Set<string>();
  report.forEach(stat => { if (stat.type === 'transport' && stat.selectedCandidatePairId) selected.add(stat.selectedCandidatePairId); });
  const counters: Counter[] = [];
  report.forEach(stat => {
    if (stat.type !== 'candidate-pair' || !(selected.has(stat.id) || selected.size === 0 && stat.nominated && stat.state === 'succeeded')) return;
    counters.push({ id: `${connectionId}:${stat.id}`, time: stat.timestamp,
      sent: stat.bytesSent ?? 0, received: stat.bytesReceived ?? 0 });
  });
  return counters;
}
