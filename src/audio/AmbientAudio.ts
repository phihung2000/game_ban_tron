import { creekX, terrainHeight } from '../shared/world';
import type { SkyState } from '../shared/world';

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: { source: AudioBufferSourceNode; gain: GainNode; panner: PannerNode }[] = [];
  private bird: PannerNode | null = null;
  private nextBird = 0;
  private closed = false;
  error = '';
  async enable() {
    if (this.closed) return false;
    try {
      if (!this.context) this.create();
      await this.context!.resume(); this.error = ''; return this.context!.state === 'running';
    } catch { this.error = 'Không mở được loa; hãy chạm vào trang và kiểm tra âm thanh trình duyệt.'; return false; }
  }
  private create() {
    const context = new AudioContext(); this.context = context;
    const master = context.createGain(); master.gain.value = 0; master.connect(context.destination); this.master = master;
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate), data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .08) / 1.025; data[i] = brown * 3; }
    const specs = [ { frequency: 1700, type: 'highpass' as BiquadFilterType, position: [creekX(-15), 0, -15] },
      { frequency: 450, type: 'lowpass' as BiquadFilterType, position: [8, 4, 7] },
      { frequency: 2300, type: 'highpass' as BiquadFilterType, position: [0, 6, 0] } ];
    this.sources = specs.map(spec => {
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = context.createBiquadFilter(); filter.type = spec.type; filter.frequency.value = spec.frequency;
      const gain = context.createGain(); gain.gain.value = 0;
      const panner = this.panner(spec.position); source.connect(filter).connect(gain).connect(panner).connect(master); source.start();
      return { source, gain, panner };
    });
    this.bird = this.panner([5, 5, -8]); this.bird.connect(master);
  }
  private panner(position: number[]) {
    const panner = this.context!.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 4; panner.maxDistance = 65; panner.rolloffFactor = .9;
    panner.positionX.value = position[0]; panner.positionY.value = position[1]; panner.positionZ.value = position[2]; return panner;
  }
  update(x: number, z: number, heading: number, sky: SkyState, enabled: boolean, volume: number) {
    const context = this.context, master = this.master; if (!context || !master || context.state !== 'running') return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(enabled ? volume : 0, now, .2);
    const listener = context.listener;
    listener.positionX.value = x; listener.positionY.value = terrainHeight(x, z) + 1.5; listener.positionZ.value = z;
    listener.forwardX.value = Math.sin(heading); listener.forwardY.value = 0; listener.forwardZ.value = Math.cos(heading);
    listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
    this.sources[0].gain.gain.setTargetAtTime(.7, now, .3);
    this.sources[1].gain.gain.setTargetAtTime(.22 + sky.wind * .32, now, .3);
    this.sources[2].gain.gain.setTargetAtTime(sky.weather === 'rain' ? .35 : 0, now, .5);
    if (enabled && sky.daylight > .2 && now > this.nextBird && this.bird) {
      this.nextBird = now + 3 + Math.random() * 5;
      this.bird.positionX.value = 8 * Math.cos(sky.time * .15); this.bird.positionZ.value = -8 + 5 * Math.sin(sky.time * .15);
      for (let i = 0; i < 3; i++) {
        const oscillator = context.createOscillator(), gain = context.createGain(), start = now + i * .16;
        oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(2200 + i * 150, start);
        oscillator.frequency.exponentialRampToValueAtTime(3700, start + .06);
        oscillator.frequency.exponentialRampToValueAtTime(2500, start + .12);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.1, start + .02); gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
        oscillator.connect(gain).connect(this.bird); oscillator.start(start); oscillator.stop(start + .15);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    }
  }
  close() {
    this.closed = true;
    for (const item of this.sources) { item.source.stop(); item.source.disconnect(); item.gain.disconnect(); item.panner.disconnect(); }
    this.sources = []; this.bird?.disconnect(); this.master?.disconnect(); void this.context?.close(); this.context = null;
  }
  suspend() { if (this.context?.state === 'running') void this.context.suspend().catch(() => {}); }
  resumeIfCreated() { if (this.context?.state === 'suspended') void this.context.resume().catch(() => {}); }
}
