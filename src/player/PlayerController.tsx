import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { RoomSession } from '../network/RoomSession';
import { advancePlayer, useMovementKeys } from './movement';

export function PlayerController({ session }: { session: RoomSession }) {
  const keys = useMovementKeys();
  useFrame((_state, delta) => advancePlayer(session, keys.current, delta));
  return null;
}

// Chỉ dùng trong bài kiểm thử mạng không dựng Canvas, không đo FPS.
export function NetworkTestController({ session }: { session: RoomSession }) {
  const keys = useMovementKeys();
  useEffect(() => {
    const timer = setInterval(() => advancePlayer(session, keys.current, 0.05), 50);
    return () => clearInterval(timer);
  }, [session, keys]);
  return null;
}
