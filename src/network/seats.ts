import type { Seats } from './types';

export function decideSeat(current: Seats, peer: string, seat: number | null): Seats | null {
  if (seat !== null && (!Number.isInteger(seat) || seat < 0 || seat >= 8)) return null;
  if (seat !== null && current[seat] !== null && current[seat] !== peer) return null;
  const next = current.map(owner => owner === peer ? null : owner);
  if (seat !== null) next[seat] = peer;
  return next;
}

export function seatPosition(index: number) {
  const angle = index * Math.PI / 4;
  return { x: Math.sin(angle) * 3, z: Math.cos(angle) * 3, yaw: angle + Math.PI };
}
