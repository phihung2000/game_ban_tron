import type { SocialEvent } from './social';
import { validTable } from './table';
import type { TableRequest, TableState } from './table';
import type { VoiceEvent } from '../audio/voicePolicy';
import { WORLD_LIMIT } from '../shared/world';

export type Animation = 'idle' | 'walk' | 'sit';
export type Pose = { x: number; z: number; yaw: number; animation: Animation };
export type Member = { user_id: string; display_name: string; join_order: number; expires_at: number };
export type Seats = (string | null)[];
export type Snapshot = { revision: number; seats: Seats; table?: TableState };
export type Checkpoint = { epoch: number; saved_at: number; snapshot: Snapshot; poses: Record<string, Pose> };
export type Room = {
  id: string; name: string; is_private: boolean; max_players: number;
  host_peer_id: string | null; host_epoch: number;
  members: Record<string, Member>; snapshot: Snapshot;
  server_time?: number;
  checkpoint?: Checkpoint | null; checkpoint_saved_at?: string | null;
};
export type Entry = { room: Room; invite_code: string | null; recovery_token?: string };
export type RoomListing = Pick<Room, 'id' | 'name' | 'is_private' | 'max_players' | 'host_peer_id'>;
export type PosePacket = { type: 'pose'; instance?: string; seq: number; pose: Pose };
export type RoomEvent =
  | VoiceEvent
  | SocialEvent
  | TableRequest
  | { type: 'table-result'; requestId: string; accepted: boolean; message: string }
  | { type: 'table-clock'; epoch: number; now: number }
  | { type: 'hello' }
  | { type: 'membership-refresh' }
  | { type: 'pose-keyframe'; packet: PosePacket }
  | { type: 'snapshot'; epoch: number; snapshot: Snapshot; hostTime?: number }
  | { type: 'seat'; requestId: string; seat: number | null }
  | { type: 'seat-result'; requestId: string; accepted: boolean; message: string };

export function validPose(value: unknown): value is Pose {
  if (!value || typeof value !== 'object') return false;
  const p = value as Pose;
  return [p.x, p.z, p.yaw].every(Number.isFinite) && Math.abs(p.x) <= WORLD_LIMIT && Math.abs(p.z) <= WORLD_LIMIT
    && ['idle', 'walk', 'sit'].includes(p.animation);
}
export function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Snapshot;
  return Number.isSafeInteger(s.revision) && s.revision >= 0 && Array.isArray(s.seats)
    && s.seats.length === 8 && s.seats.every(v => v === null || typeof v === 'string')
    && new Set(s.seats.filter(v => v !== null)).size === s.seats.filter(v => v !== null).length
    && (s.table === undefined || validTable(s.table) && s.table.owners.every((owner, i) => owner === s.seats[i]));
}
