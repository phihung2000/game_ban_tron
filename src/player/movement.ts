import { useEffect, useRef } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { canWalk, clamp, WORLD_LIMIT } from '../shared/world';
import { cameraRelativeAxes } from './touchInput';

export function useMovementKeys() {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,textarea,select,button')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault();
      keys.current.add(event.key.toLowerCase());
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  return keys;
}

export function advancePlayer(session: RoomSession, keys: Set<string>, delta: number) {
  const state = session.getSnapshot();
  if (state.expired || !state.seats || state.seats.seats.includes(session.peer)) return;
  let x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  let z = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  const length = Math.hypot(x, z);
  if (length) { x /= length; z /= length; }
  else { const axes = cameraRelativeAxes(session.touch.axes, session.touch.heading); x = axes.x; z = axes.z; }
  const moving = Math.hypot(x, z) > .01;
  const pose = session.localPose, step = Math.min(delta, 0.05) * 3;
  const nextX = clamp(pose.x + x * step, -WORLD_LIMIT, WORLD_LIMIT);
  const nextZ = clamp(pose.z + z * step, -WORLD_LIMIT, WORLD_LIMIT);
  if (canWalk(nextX, pose.z)) pose.x = nextX;
  if (canWalk(pose.x, nextZ)) pose.z = nextZ;
  pose.animation = moving ? 'walk' : 'idle';
  if (moving) pose.yaw = Math.atan2(x, z);
}
