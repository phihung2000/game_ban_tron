import { BandwidthMeter } from '../network/bandwidth';
import type { Bandwidth } from '../network/bandwidth';
import { Microphone } from './Microphone';
import { VoiceGraph } from './VoiceGraph';
import { VoiceTransport } from './VoiceTransport';
import { chooseVoicePeers, microphoneError, validVoiceStatus } from './voicePolicy';
import type { VoiceEvent, VoiceLimit, VoicePerson, VoicePosition, VoiceStatus } from './voicePolicy';

type World = { self: VoicePosition; seated: boolean; people: VoicePerson[] };
export type VoiceView = { ready: boolean; mic: boolean; requesting: boolean; devices: MediaDeviceInfo[]; deviceId: string;
  speaking: boolean; level: number; limit: VoiceLimit; selected: string[]; connected: string[]; linkCount: number;
  message: string; voiceBandwidth: Bandwidth; dataBandwidth: Bandwidth; receiveBlocked: boolean };
type Options = { world: () => World; send: (peer: string, event: VoiceEvent) => boolean;
  broadcast: (event: VoiceEvent) => void; dataBandwidth: () => Promise<Bandwidth>;
  muted?: (peer: string) => boolean; blocked?: (peer: string) => boolean };

export class VoiceManager {
  private view: VoiceView = { ready: false, mic: false, requesting: false, devices: [], deviceId: 'default',
    speaking: false, level: 0, limit: 10, selected: [], connected: [], linkCount: 0,
    message: '', voiceBandwidth: { upKbps: 0, downKbps: 0 }, dataBandwidth: { upKbps: 0, downKbps: 0 }, receiveBlocked: false };
  private listeners = new Set<() => void>();
  private statuses = new Map<string, { status: VoiceStatus; heardAt: number }>();
  private graph = new VoiceGraph();
  private transport: VoiceTransport;
  private microphone: Microphone;
  private meter = new BandwidthMeter();
  private timer?: ReturnType<typeof setInterval>;
  private statsTimer?: ReturnType<typeof setInterval>;
  private closed = false;
  private instance = crypto.randomUUID();
  private seq = 0;
  private lastPublished = '';
  private lastPublishTime = -Infinity;
  private lastSpeech = -Infinity;
  private measuring = false;
  private heading?: number;
  private captureSerial = 0;
  private joinSerial = 0;

  constructor(readonly self: string, private options: Options) {
    this.transport = new VoiceTransport(self, (peer, signal) => options.send(peer, signal),
      (peer, track) => this.graph.add(peer, track), peer => this.graph.remove(peer), () => this.connections());
    this.microphone = new Microphone({ getUserMedia: constraints => {
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('Micro cần HTTPS hoặc localhost. Trên điện thoại hãy mở địa chỉ HTTPS.'));
      return navigator.mediaDevices.getUserMedia(constraints);
    } }, async stream => {
      await this.transport.setTrack(stream?.getAudioTracks()[0] ?? null); this.graph.setLocal(stream);
    }, () => { this.captureSerial++; this.patch({ mic: false, requesting: false, speaking: false, level: 0,
      message: 'Micro đã ngắt hoặc quyền bị thu hồi. Chọn thiết bị khác rồi bật mic lại.' }); this.update(true); });
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.view;
  private patch(value: Partial<VoiceView>) {
    if (this.closed) return;
    this.view = { ...this.view, ...value }; for (const listener of this.listeners) listener();
  }
  start() {
    if (this.closed || this.timer) return;
    this.timer = setInterval(() => this.update(), 100);
    this.statsTimer = setInterval(() => void this.measure(), 2000);
    navigator.mediaDevices?.addEventListener('devicechange', this.devicesChanged);
    void this.refreshDevices();
  }
  async listen(): Promise<boolean> {
    if (this.closed) return false;
    const serial = this.joinSerial;
    try {
      const running = await this.graph.resume();
      if (this.closed || serial !== this.joinSerial) return false;
      this.patch({ ready: running, receiveBlocked: !running, message: running ? '' : 'Bấm Bật loa để cho phép phát voice.' });
      this.update(true); return Boolean(running);
    } catch { this.patch({ message: 'Không mở được âm thanh. Hãy bấm Bật loa hoặc dùng trình duyệt hỗ trợ Web Audio.', receiveBlocked: true }); return false; }
  }
  async enableMicrophone(deviceId = this.view.deviceId) {
    if (this.closed || this.view.requesting) return;
    const serial = ++this.captureSerial;
    this.patch({ requesting: true, message: '' });
    try {
      if (!await this.listen() || this.closed || serial !== this.captureSerial) return;
      const opened = await this.microphone.open(deviceId);
      if (!opened || this.closed || serial !== this.captureSerial) return;
      this.patch({ mic: true, requesting: false, deviceId: this.microphone.stream?.getAudioTracks()[0]?.getSettings().deviceId || deviceId, message: '' });
      await this.refreshDevices(); this.update(true);
    } catch (error) {
      if (this.closed || serial !== this.captureSerial) return;
      const stillLive = this.microphone.stream?.getAudioTracks()[0]?.readyState === 'live';
      this.patch({ requesting: false, mic: Boolean(stillLive),
        message: `${microphoneError(error)}${stillLive ? ' Vẫn đang dùng micro cũ.' : ''}` });
      this.update(true);
    } finally { if (!this.closed && serial === this.captureSerial) this.patch({ requesting: false }); }
  }
  muteMicrophone() {
    this.captureSerial++; this.lastSpeech = -Infinity; this.microphone.stop();
    this.patch({ requesting: false, mic: false, speaking: false, level: 0, message: '' }); this.update(true);
  }
  async changeDevice(deviceId: string) {
    if (this.view.requesting) return;
    if (this.view.mic) await this.enableMicrophone(deviceId);
    else this.patch({ deviceId });
  }
  setLimit(limit: VoiceLimit) {
    if (![8, 10, 12].includes(limit)) return;
    this.patch({ limit }); this.update(true);
  }
  setHeading(heading: number) { if (Number.isFinite(heading)) this.heading = heading; }
  refresh() { this.update(); }
  isSpeaking(peer: string) {
    if (this.options.muted?.(peer)) return false;
    if (peer === this.self) return this.view.mic && this.view.speaking;
    const remote = this.statuses.get(peer);
    return Boolean(remote?.status.mic && remote.status.speaking && performance.now() - remote.heardAt < 6000);
  }
  receive(peer: string, event: VoiceEvent) {
    if (this.closed || this.options.blocked?.(peer)) return;
    if (event.type === 'voice-status') {
      if (!validVoiceStatus(event)) return;
      const old = this.statuses.get(peer);
      if (old?.status.instance === event.instance && event.seq <= old.status.seq) return;
      this.statuses.set(peer, { status: event, heardAt: performance.now() });
      if (!old || old.status.speaking !== event.speaking || old.status.mic !== event.mic || old.status.ready !== event.ready) this.patch({});
      this.update();
    } else if (event.type === 'voice-signal') this.transport.receive(peer, event);
  }
  announce(peer: string) { this.options.send(peer, this.status()); }
  private status(): VoiceStatus {
    return { type: 'voice-status', instance: this.instance, seq: ++this.seq,
      ready: this.view.ready, mic: this.view.mic, speaking: this.view.speaking, level: this.view.level,
      limit: this.view.limit, wanted: [...this.view.selected] };
  }
  private update(force = false) {
    if (this.closed) return;
    const world = this.options.world(), now = performance.now();
    for (const peer of this.statuses.keys()) if (!world.people.some(p => p.id === peer)) this.statuses.delete(peer);
    const people = world.people.map(person => {
      const remote = this.statuses.get(person.id), active = remote && now - remote.heardAt < 6000;
      return { ...person, ready: Boolean(active && remote.status.ready), mic: Boolean(active && remote.status.mic) };
    });
    const level = this.view.mic ? Math.min(1, this.graph.level() * 6) : 0;
    if (this.view.mic && level > 0.12) this.lastSpeech = now;
    const speaking = this.view.mic && now - this.lastSpeech < 350;
    const selected = this.view.ready ? chooseVoicePeers(world.self, world.seated, this.view.mic, people, this.view.selected, this.view.limit) : [];
    const changed = [...selected].sort().join(',') !== [...this.view.selected].sort().join(',');
    if (changed || speaking !== this.view.speaking || Math.abs(level - this.view.level) > 0.08) {
      this.patch({ selected, speaking, level: Math.round(level * 10) / 10 });
    }
    // Mức âm lượng chỉ cập nhật UI tại máy; mạng chỉ cần trạng thái nói, nhóm nghe và heartbeat.
    const signature = JSON.stringify([this.view.ready, this.view.mic, this.view.speaking, this.view.limit, this.view.selected]);
    if (force || changed || now - this.lastPublishTime >= 200 && (signature !== this.lastPublished || now - this.lastPublishTime >= 2000)) {
      this.lastPublishTime = now; this.lastPublished = signature; this.options.broadcast(this.status());
    }
    // Gửi danh sách chọn trước SDP trên cùng kênh có thứ tự, tránh offer tới khi bên kia chưa biết mình được chọn.
    const mutual = selected.filter(peer => this.statuses.get(peer)?.status.wanted.includes(this.self));
    this.transport.reconcile(mutual);
    this.graph.update(world.self, this.heading ?? world.self.yaw,
      people.filter(p => mutual.includes(p.id) && p.position).map(p => ({ id: p.id, position: p.position!, sameTable: world.seated && p.seated,
        muted: this.options.muted?.(p.id) ?? false })));
    if (this.view.ready && !this.graph.running && !this.view.receiveBlocked) this.patch({ receiveBlocked: true, message: 'Loa đang bị tạm dừng. Bấm Bật loa để nghe lại.' });
  }
  private connections() { this.patch({ connected: this.transport.connected(), linkCount: this.transport.count() }); }
  private async measure() {
    if (this.measuring || this.closed) return;
    this.measuring = true;
    try {
      const [counters, dataBandwidth] = await Promise.all([this.transport.counters(), this.options.dataBandwidth()]);
      this.patch({ voiceBandwidth: this.meter.sample(counters), dataBandwidth }); this.connections();
    } finally { this.measuring = false; }
  }
  private devicesChanged = () => { void this.refreshDevices(true); };
  private async refreshDevices(checkCurrent = false) {
    try {
      const devices = (await navigator.mediaDevices?.enumerateDevices() ?? []).filter(d => d.kind === 'audioinput');
      if (this.closed) return;
      this.patch({ devices });
      const currentId = this.microphone.stream?.getAudioTracks()[0]?.getSettings().deviceId;
      if (checkCurrent && this.view.mic && currentId && !devices.some(d => d.deviceId === currentId)) {
        this.muteMicrophone(); this.patch({ deviceId: 'default', message: 'Micro đã bị tháo. Hãy chọn micro khác rồi bật lại.' });
      }
    } catch { /* Trình duyệt có thể không cho liệt kê thiết bị trước khi được cấp quyền. */ }
  }
  leave() {
    this.joinSerial++;
    this.muteMicrophone(); this.patch({ ready: false, selected: [], connected: [], receiveBlocked: false });
    this.transport.reconcile([]); this.update(true);
  }
  stop() {
    if (this.closed) return;
    this.leave(); this.closed = true; this.captureSerial++;
    clearInterval(this.timer); clearInterval(this.statsTimer);
    navigator.mediaDevices?.removeEventListener('devicechange', this.devicesChanged);
    this.transport.close(); this.graph.close(); this.statuses.clear(); this.listeners.clear();
  }
}
