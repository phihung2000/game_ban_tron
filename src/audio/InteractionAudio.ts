import type { TableKind } from '../network/table';

export class InteractionAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private muted = false;
  private closed = false;
  private noise?: AudioBuffer;
  get enabled() { return this.context?.state === 'running' && !this.muted; }

  async enable(): Promise<boolean> {
    if (this.closed) return false;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain(); this.master.gain.value = 0.18;
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      this.muted = false; this.master!.gain.value = 0.18;
      await this.context.resume(); return this.enabled;
    } catch { return false; }
  }
  mute() { this.muted = true; if (this.master) this.master.gain.value = 0; }

  play(kind: TableKind, distance: number) {
    const context = this.context;
    if (!context || !this.enabled || !this.master || distance > 10 || !this.noise) return;
    const now = context.currentTime, volume = 0.16 / (1 + Math.max(0, distance) / 3);
    const length = kind === 'pour' || kind === 'offer' ? 1.2 : kind === 'drink' ? 0.8 : kind === 'eat' ? 0.55 : 0.3;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = this.noise; filter.type = kind === 'eat' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'eat' ? 1800 : kind === 'drink' ? 400 : kind === 'throw' ? 180 : 950;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.001, now); gain.gain.linearRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    source.start(now); source.stop(now + length);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    const oscillator = context.createOscillator(), tone = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(kind === 'drink' ? 210 : kind === 'throw' ? 120 : 1100, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'drink' ? 100 : 420, now + 0.16);
    tone.gain.setValueAtTime(volume * 0.5, now); tone.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.connect(tone); tone.connect(this.master); oscillator.start(now); oscillator.stop(now + 0.2);
    oscillator.onended = () => { oscillator.disconnect(); tone.disconnect(); };
  }
  close() { this.closed = true; if (this.context) void this.context.close().catch(() => {}); }
}
