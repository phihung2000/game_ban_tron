import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Avatar } from '../player/Avatar';
import { PlayerController } from '../player/PlayerController';
import { seatPosition } from '../network/seats';
import type { RoomSession } from '../network/RoomSession';
import { TableObjects } from './TableObjects';
import { useSyncExternalStore } from 'react';
import { NatureScene } from './nature/NatureScene';
import { QUALITY } from './nature/GraphicsController';
import type { GraphicsController } from './nature/GraphicsController';

export function RoomScene({ session, graphics }: { session: RoomSession; graphics: GraphicsController }) {
  const state = session.getSnapshot();
  const settings = useSyncExternalStore(graphics.subscribe, graphics.getSnapshot);
  return (
    <Canvas camera={{ position: [15, 13, 21], fov: 50, near: .1, far: 220 }} dpr={QUALITY[settings.quality].dpr}
      shadows={settings.quality !== 'low'} gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<p>Trình duyệt cần hỗ trợ WebGL.</p>}>
      <NatureScene session={session} graphics={graphics} settings={settings} />
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2, 2, 0.18, 40]} />
        <meshStandardMaterial color="#ad8055" />
      </mesh>
      <TableObjects session={session} />
      {Array.from({ length: 8 }, (_, i) => {
        const p = seatPosition(i), occupied = state.seats?.seats[i];
        return (
          <mesh key={i} castShadow receiveShadow position={[p.x, 0.4, p.z]} onClick={event => {
            if (event.delta > 8) return;
            event.stopPropagation(); session.requestSeat(i);
          }}>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial color={occupied ? '#b16a63' : '#dfbd82'} />
          </mesh>
        );
      })}
      {Object.entries(state.room.members).filter(([peer]) => !session.isBlocked(peer)).map(([peer, member]) => (
        <Avatar key={peer} session={session} peer={peer} name={member.display_name} quality={settings.quality} />
      ))}
      <PlayerController session={session} />
      <OrbitControls makeDefault target={[-3, .5, -2]} maxPolarAngle={Math.PI / 2.12} minDistance={5} maxDistance={65} />
    </Canvas>
  );
}
