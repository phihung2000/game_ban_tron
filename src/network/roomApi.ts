import { rpc, supabase } from './supabase';
import type { Entry, Pose, Room, RoomListing, Seats } from './types';
import type { TableState } from './table';
import type { ReportReason } from './moderation';

export const createRoom = (peer: string, name: string, isPrivate: boolean, max: number) =>
  rpc<Entry>('create_room', { p_peer: peer, p_name: name, p_private: isPrivate, p_max: max });
export const joinRoom = (peer: string, room: string | null, code: string | null) =>
  rpc<Entry>('join_room', { p_peer: peer, p_room: room, p_code: code });
export const syncRoom = (room: string, peer: string, leave = false) =>
  rpc<Room>('sync_room', { p_room: room, p_peer: peer, p_leave: leave });
export const resumeRoom = (room: string, peer: string, token: string) =>
  rpc<Entry>('resume_room', { p_room: room, p_peer: peer, p_token: token });
export const saveCheckpoint = (room: Room, peer: string, poses: Record<string, Pose>) =>
  rpc<Room>('save_checkpoint', { p_room: room.id, p_peer: peer, p_epoch: room.host_epoch, p_poses: poses });
export const kickMember = (room: Room, peer: string, target: string) =>
  rpc<Room>('kick_member', { p_room: room.id, p_peer: peer, p_epoch: room.host_epoch, p_target: target });
export const submitReport = (room: string, peer: string, target: string, reason: ReportReason, details: string) =>
  rpc<{ id: string }>('submit_report', { p_room: room, p_peer: peer, p_target: target, p_reason: reason, p_details: details });
export const commitSeats = (room: Room, peer: string, seats: Seats) =>
  rpc<Room>('commit_seats', { p_room: room.id, p_peer: peer,
    p_epoch: room.host_epoch, p_revision: room.snapshot.revision, p_seats: seats });
export const commitTable = (room: Room, peer: string, table: TableState) =>
  rpc<Room>('commit_table', { p_room: room.id, p_peer: peer,
    p_epoch: room.host_epoch, p_revision: room.snapshot.revision, p_table: table });

export async function listRooms(): Promise<RoomListing[]> {
  const { data, error } = await supabase.from('rooms')
    .select('id,name,is_private,max_players,host_peer_id').eq('is_private', false)
    .not('host_peer_id', 'is', null).order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
