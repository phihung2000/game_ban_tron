import type { Pose } from '../network/types';

export function angleLerp(a: number, b: number, t: number) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

export class PoseBuffer {
  private samples: { time: number; pose: Pose }[] = [];
  private lastSeq = -1;

  push(seq: number, pose: Pose, now = performance.now()) {
    // DataChannel vị trí không có thứ tự: bỏ gói cũ đến muộn.
    if (!Number.isSafeInteger(seq) || seq <= this.lastSeq) return;
    this.lastSeq = seq;
    this.samples.push({ time: now, pose: { ...pose } });
    this.samples = this.samples.slice(-20);
  }

  sample(now = performance.now()): Pose | null {
    if (!this.samples.length) return null;
    const target = now - 120; // Trễ hiển thị 120ms để có hai mẫu nội suy.
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[1];
    if (!b) return { ...a.pose };
    const t = Math.max(0, Math.min(1, (target - a.time) / Math.max(1, b.time - a.time)));
    return { x: a.pose.x + (b.pose.x - a.pose.x) * t,
      z: a.pose.z + (b.pose.z - a.pose.z) * t,
      yaw: angleLerp(a.pose.yaw, b.pose.yaw, t),
      animation: t < 0.5 ? a.pose.animation : b.pose.animation };
  }
}
