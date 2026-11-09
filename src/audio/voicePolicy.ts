export const HEARING_RADIUS = 12;
export const CONNECT_RADIUS = 11.5;
export const VOICE_LIMITS = [8, 10, 12] as const;
export type VoiceLimit = typeof VOICE_LIMITS[number];
export type VoicePosition = { x: number; z: number; yaw: number };
export type VoicePerson = { id: string; position: VoicePosition | null; seated: boolean;
  ready: boolean; mic: boolean; connected: boolean };
export type VoiceStatus = { type: 'voice-status'; instance: string; seq: number; ready: boolean;
  mic: boolean; speaking: boolean; level: number; limit: VoiceLimit; wanted: string[] };
export type VoiceSignal = { type: 'voice-signal'; session: string; kind: 'offer' | 'answer' | 'candidate' | 'bye';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
export type VoiceEvent = VoiceStatus | VoiceSignal;

export function validVoiceStatus(value: unknown): value is VoiceStatus {
  if (!value || typeof value !== 'object') return false;
  const s = value as VoiceStatus;
  return s.type === 'voice-status' && typeof s.instance === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(s.instance)
    && Number.isSafeInteger(s.seq) && s.seq >= 0 && typeof s.ready === 'boolean' && typeof s.mic === 'boolean'
    && typeof s.speaking === 'boolean' && Number.isFinite(s.level) && s.level >= 0 && s.level <= 1
    && (!s.speaking || s.mic) && (!s.mic || s.ready) && (VOICE_LIMITS as readonly number[]).includes(s.limit)
    && Array.isArray(s.wanted) && s.wanted.length <= s.limit && new Set(s.wanted).size === s.wanted.length
    && s.wanted.every(id => typeof id === 'string' && id.length <= 64);
}
export function chooseVoicePeers(self: VoicePosition, seated: boolean, mic: boolean, people: VoicePerson[],
  previous: readonly string[], limit: VoiceLimit): string[] {
  // Luôn dành chỗ cho người cùng bàn (tối đa 7), rồi lấy người gần nhất.
  return people.filter(p => p.connected && p.ready && (mic || p.mic) && p.position)
    .map(p => ({ id: p.id, table: seated && p.seated,
      distance: Math.hypot(p.position!.x - self.x, p.position!.z - self.z) }))
    .filter(p => p.table || p.distance <= (previous.includes(p.id) ? HEARING_RADIUS : CONNECT_RADIUS))
    .sort((a, b) => Number(b.table) - Number(a.table) || a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, limit).map(p => p.id);
}
export function voiceGate(distance: number, sameTable: boolean) {
  return sameTable ? 1 : Math.max(0, Math.min(1, (HEARING_RADIUS - distance) / 2));
}
export function rms(samples: ArrayLike<number>) {
  if (!samples.length) return 0;
  let sum = 0; for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}
export function microphoneError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Bạn chưa cho phép micro. Mở quyền micro của trang rồi thử lại; bạn vẫn có thể chỉ nghe.';
  if (name === 'NotFoundError') return 'Không tìm thấy micro. Hãy cắm hoặc chọn thiết bị khác.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Không mở được micro; kiểm tra ứng dụng khác đang dùng thiết bị rồi thử lại.';
  if (name === 'OverconstrainedError') return 'Micro đã chọn không còn khả dụng. Hãy chọn micro mặc định hoặc thiết bị khác.';
  if (name === 'NotSupportedError') return 'Trình duyệt hiện không mở được micro. Thử Chrome/Safari mới, kiểm tra quyền micro của trình duyệt trong hệ điều hành; bạn vẫn có thể chỉ nghe.';
  return error instanceof Error ? error.message : 'Không mở được micro. Hãy kiểm tra quyền và thiết bị.';
}
