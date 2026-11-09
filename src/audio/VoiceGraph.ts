import { rms, voiceGate } from './voicePolicy';
import type { VoicePosition } from './voicePolicy';
import { terrainHeight } from '../shared/world';

type RemoteAudio = { source: MediaStreamAudioSourceNode; panner: PannerNode; gain: GainNode; element: HTMLAudioElement; trackId: string };

export class VoiceGraph {
  private context?: AudioContext;
  private master?: GainNode;
  private localSource?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private silent?: GainNode;
  private samples = new Float32Array(1024);
  private remotes = new Map<string, RemoteAudio>();
  private closed = false;
  get running() { return this.context?.state === 'running'; }

  async resume() {
    if (this.closed) return false;
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain();
      this.master.gain.value = 0.85; this.master.connect(this.context.destination);
    }
    await this.context.resume(); return this.running;
  }
  setLocal(stream: MediaStream | null) {
    this.localSource?.disconnect(); this.analyser?.disconnect(); this.silent?.disconnect();
    this.localSource = undefined; this.analyser = undefined; this.silent = undefined;
    if (!stream || !this.context || this.closed) return;
    this.localSource = this.context.createMediaStreamSource(stream);
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024;
    this.silent = this.context.createGain(); this.silent.gain.value = 0;
    // Nhánh phân tích luôn chạy nhưng tuyệt đối không phát lại tiếng mic vào loa của mình.
    this.localSource.connect(this.analyser); this.analyser.connect(this.silent); this.silent.connect(this.context.destination);
  }
  level() {
    if (!this.analyser || !this.running) return 0;
    this.analyser.getFloatTimeDomainData(this.samples); return rms(this.samples);
  }
  add(peer: string, track: MediaStreamTrack) {
    if (!this.context || !this.master || this.closed) return;
    if (this.remotes.get(peer)?.trackId === track.id) return;
    this.remove(peer);
    const stream = new MediaStream([track]);
    const source = this.context.createMediaStreamSource(stream), panner = this.context.createPanner(), gain = this.context.createGain();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2;
    panner.maxDistance = 12; panner.rolloffFactor = 1; panner.coneInnerAngle = 360;
    gain.gain.value = 0; source.connect(panner); panner.connect(gain); gain.connect(this.master);
    // Sink tắt tiếng giúp audio WebRTC được kéo dữ liệu trên các trình duyệt cần media element.
    // Chỉ đường qua PannerNode được phát ra loa, tránh tiếng phẳng hoặc bị phát hai lần.
    const element = new Audio(); element.muted = true; element.autoplay = true;
    element.setAttribute('playsinline', ''); element.srcObject = stream;
    void element.play().catch(() => {});
    this.remotes.set(peer, { source, panner, gain, element, trackId: track.id });
  }
  update(self: VoicePosition, heading: number, people: { id: string; position: VoicePosition; sameTable: boolean; muted?: boolean }[]) {
    const context = this.context; if (!context) return;
    const now = context.currentTime, listener = context.listener;
    const ease = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, 0.04);
    ease(listener.positionX, self.x); ease(listener.positionY, terrainHeight(self.x, self.z) + 1.5); ease(listener.positionZ, self.z);
    ease(listener.forwardX, Math.sin(heading)); ease(listener.forwardY, 0); ease(listener.forwardZ, Math.cos(heading));
    ease(listener.upX, 0); ease(listener.upY, 1); ease(listener.upZ, 0);
    for (const [peer, remote] of this.remotes) {
      const person = people.find(p => p.id === peer);
      if (!person) { ease(remote.gain.gain, 0); continue; }
      ease(remote.panner.positionX, person.position.x); ease(remote.panner.positionY, terrainHeight(person.position.x, person.position.z) + 1.5); ease(remote.panner.positionZ, person.position.z);
      ease(remote.gain.gain, person.muted ? 0 : voiceGate(Math.hypot(person.position.x - self.x, person.position.z - self.z), person.sameTable));
    }
  }
  remove(peer: string) {
    const audio = this.remotes.get(peer); if (!audio) return;
    audio.source.disconnect(); audio.panner.disconnect(); audio.gain.disconnect();
    audio.element.pause(); audio.element.srcObject = null; this.remotes.delete(peer);
  }
  close() {
    this.closed = true; this.setLocal(null);
    for (const peer of this.remotes.keys()) this.remove(peer);
    if (this.context) void this.context.close().catch(() => {});
  }
}
