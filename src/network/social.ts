export const CHAT_LIMIT = 200;
export const CHAT_INTERVAL = 1000;
export const CHAT_LIFETIME = 6000;
export const EMOTE_INTERVAL = 500;
export const EMOTES = ['wave', 'laugh', 'nod', 'clap'] as const;
export type EmoteKind = typeof EMOTES[number];
export const EMOTE_LABELS: Record<EmoteKind, string> = {
  wave: 'Vẫy tay', laugh: 'Cười', nod: 'Gật đầu', clap: 'Vỗ tay',
};
export const EMOTE_DURATION: Record<EmoteKind, number> = { wave: 2200, laugh: 2400, nod: 1800, clap: 2400 };
export type SocialEvent = { type: 'chat'; id: string; text: string }
  | { type: 'emote'; id: string; kind: EmoteKind };
export type ChatMessage = { id: string; peer: string; text: string; startedAt: number };
export type ActiveEmote = { id: string; kind: EmoteKind; startedAt: number };
export type SocialView = { chats: Record<string, ChatMessage[]>; emotes: Record<string, ActiveEmote> };

// Có thể bổ sung từ tại đây. Chỉ thay cả từ để không lọc nhầm một phần tên/từ dài.
const BLOCKED_WORDS = new Set(['địt', 'đụ', 'đéo', 'lồn', 'cặc', 'dm', 'dmm', 'fuck', 'shit']);
export function characterCount(text: string) { return Array.from(text.normalize('NFC')).length; }
export function cleanChat(text: string): string {
  return text.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/gu, ' ').trim()
    .replace(/[\p{L}\p{M}]+/gu, word => BLOCKED_WORDS.has(word.toLocaleLowerCase('vi')) ? '*'.repeat(characterCount(word)) : word);
}
export function isEmote(value: unknown): value is EmoteKind {
  return typeof value === 'string' && (EMOTES as readonly string[]).includes(value);
}
export function bubbleOpacity(startedAt: number, now: number) {
  // Giữ rõ 4,5 giây rồi mờ dần; đúng 6 giây thì xóa.
  return Math.max(0, Math.min(1, (CHAT_LIFETIME - (now - startedAt)) / 1500));
}

export class SocialState {
  view: SocialView = { chats: {}, emotes: {} };
  private lastChat = new Map<string, number>();
  private lastEmote = new Map<string, number>();
  private seen = new Map<string, Set<string>>();

  forget(peer: string) {
    const chats = { ...this.view.chats }, emotes = { ...this.view.emotes };
    delete chats[peer]; delete emotes[peer]; this.view = { chats, emotes };
  }

  accept(peer: string, value: unknown, now = performance.now()): boolean {
    if (!value || typeof value !== 'object') return false;
    const event = value as SocialEvent;
    if (typeof event.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(event.id)) return false;
    if (this.seen.get(peer)?.has(event.id)) return false;
    if (event.type === 'chat') {
      if (typeof event.text !== 'string' || event.text.length > 1000 || characterCount(event.text) > CHAT_LIMIT) return false;
      const text = cleanChat(event.text);
      if (!text || now - (this.lastChat.get(peer) ?? -Infinity) < CHAT_INTERVAL) return false;
      this.lastChat.set(peer, now);
      this.view = { ...this.view, chats: { ...this.view.chats,
        [peer]: [...(this.view.chats[peer] ?? []).filter(m => now - m.startedAt < CHAT_LIFETIME),
          { id: event.id, peer, text, startedAt: now }].slice(-6) } };
    } else if (event.type === 'emote') {
      if (!isEmote(event.kind) || now - (this.lastEmote.get(peer) ?? -Infinity) < EMOTE_INTERVAL) return false;
      this.lastEmote.set(peer, now);
      this.view = { ...this.view, emotes: { ...this.view.emotes,
        [peer]: { id: event.id, kind: event.kind, startedAt: now } } };
    } else return false;
    const ids = this.seen.get(peer) ?? new Set<string>();
    ids.add(event.id); if (ids.size > 256) ids.delete(ids.values().next().value!);
    this.seen.set(peer, ids);
    return true;
  }

  prune(members: string[], now = performance.now()): boolean {
    const live = new Set(members), chats: SocialView['chats'] = {}, emotes: SocialView['emotes'] = {};
    let changed = false;
    for (const [peer, messages] of Object.entries(this.view.chats)) {
      const keep = live.has(peer) ? messages.filter(m => now - m.startedAt < CHAT_LIFETIME) : [];
      if (keep.length) chats[peer] = keep;
      if (keep.length !== messages.length) changed = true;
    }
    for (const [peer, emote] of Object.entries(this.view.emotes)) {
      if (live.has(peer) && now - emote.startedAt < EMOTE_DURATION[emote.kind]) emotes[peer] = emote;
      else changed = true;
    }
    for (const peer of this.seen.keys()) if (!live.has(peer)) {
      this.seen.delete(peer); this.lastChat.delete(peer); this.lastEmote.delete(peer);
    }
    if (changed) this.view = { chats, emotes };
    return changed;
  }
}
