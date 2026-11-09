import type { Entry } from './types';
import { roomStorage } from '../mobile/platform';

export type RecoveryTicket = { user: string; room: string; peer: string; token: string; name: string; code: string | null; savedAt: number };
const KEY = 'ban-tron-room-recovery-v1';
export function readRecovery(user: string): RecoveryTicket | null {
  try {
    const ticket = JSON.parse(roomStorage().getItem(KEY) || 'null') as RecoveryTicket | null;
    if (ticket?.user === user && /^[a-f0-9-]{36}$/i.test(ticket.room) && /^[a-f0-9-]{36}$/i.test(ticket.peer)
      && /^[a-f0-9]{32}$/i.test(ticket.token) && Date.now() - ticket.savedAt < 86_400_000) return ticket;
  } catch { /* Storage có thể bị chặn. */ }
  return null;
}
export function rememberRoom(peer: string, entry: Entry) {
  const member = entry.room.members[peer]; if (!member || !entry.recovery_token) return;
  try { roomStorage().setItem(KEY, JSON.stringify({ user: member.user_id, room: entry.room.id, peer,
    token: entry.recovery_token, name: entry.room.name, code: entry.invite_code, savedAt: Date.now() } satisfies RecoveryTicket)); } catch { /* Thử lại bằng mã mời nếu không lưu được. */ }
}
export function forgetRoom() { try { roomStorage().removeItem(KEY); } catch { /* Không bắt buộc storage. */ } }
