export const RETRY_LIMIT = 5;
export class RetrySchedule {
  attempts = 0;
  nextAt = 0;
  exhausted = false;
  fail(now: number, jitter = Math.random()) {
    this.attempts++;
    this.exhausted = this.attempts >= RETRY_LIMIT;
    this.nextAt = now + Math.min(30000, 1500 * 2 ** (this.attempts - 1)) + Math.floor(jitter * 750);
  }
  ready(now: number) { return !this.exhausted && now >= this.nextAt; }
  reset() { this.attempts = 0; this.nextAt = 0; this.exhausted = false; }
}
export type PeerConnectionStatus = { peer: string; state: 'connecting' | 'connected' | 'retrying' | 'failed' | 'limited'; attempts: number };
