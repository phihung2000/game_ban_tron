export class Microphone {
  stream: MediaStream | null = null;
  private serial = 0;
  private queue = Promise.resolve();
  private pending: MediaStream | null = null;
  constructor(private media: Pick<MediaDevices, 'getUserMedia'>,
    private install: (stream: MediaStream | null) => Promise<void>, private onEnded: () => void) {}

  async open(deviceId: string): Promise<boolean> {
    const serial = ++this.serial;
    const stream = await this.media.getUserMedia({ video: false, audio: {
      deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
    } });
    if (serial !== this.serial) { stream.getTracks().forEach(track => track.stop()); return false; }
    const track = stream.getAudioTracks()[0];
    if (!track) { stream.getTracks().forEach(t => t.stop()); throw new Error('Thiết bị không cung cấp track audio.'); }
    const old = this.stream;
    this.pending = stream;
    try { await this.commit(stream); }
    catch (error) {
      stream.getTracks().forEach(track => track.stop());
      if (this.pending === stream) this.pending = null;
      if (serial === this.serial && old) await this.commit(old).catch(() => {});
      throw error;
    }
    if (serial !== this.serial) {
      stream.getTracks().forEach(track => track.stop());
      if (this.pending === stream) this.pending = null;
      return false;
    }
    this.stream = stream;
    if (this.pending === stream) this.pending = null;
    track.onended = () => {
      if (this.stream !== stream) return;
      this.stop(); this.onEnded();
    };
    old?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    return true;
  }
  stop() {
    this.serial++;
    const streams = new Set([this.stream, this.pending]); this.stream = null; this.pending = null;
    for (const stream of streams) stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    // Ngừng capture ngay; không chỉ tắt gain trên loa.
    void this.commit(null).catch(() => {});
  }
  private commit(stream: MediaStream | null) {
    const pending = this.queue.then(() => this.install(stream));
    this.queue = pending.catch(() => {}); return pending;
  }
}
