import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Vector2 } from 'three';
import type { Group, Mesh, Sprite, SpriteMaterial } from 'three';
import type { RoomSession } from '../network/RoomSession';
import { activeAction, cupMl, temperature } from '../network/table';
import type { CupState, Snack, TableAction } from '../network/table';
import { seatPosition } from '../network/seats';

export const BIN_POSITION = [-3.6, 0.5, 3.6] as const;
export function cupPosition(seat: number) {
  const angle = seat * Math.PI / 4;
  return { x: Math.sin(angle) * 1.72, z: Math.cos(angle) * 1.72, yaw: angle + Math.PI };
}

export function TeapotModel() {
  return <group>
    <mesh scale={[0.34, 0.28, 0.34]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#5a9d8c" roughness={0.25} metalness={0.12} /></mesh>
    <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.2, 0.23, 0.06, 20]} /><meshStandardMaterial color="#426e64" /></mesh>
    <mesh position={[0, 0.32, 0]}><sphereGeometry args={[0.06, 12, 8]} /><meshStandardMaterial color="#d3bb72" metalness={0.45} roughness={0.3} /></mesh>
    <mesh position={[0, 0.08, 0.4]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.045, 0.105, 0.35, 12]} /><meshStandardMaterial color="#5a9d8c" /></mesh>
    <mesh position={[0, 0.03, -0.33]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.23, 0.045, 8, 20]} /><meshStandardMaterial color="#426e64" /></mesh>
  </group>;
}

export function SnackModel({ kind }: { kind: Snack }) {
  return kind === 'cake' ? <group>
    <mesh><cylinderGeometry args={[0.105, 0.105, 0.08, 14]} /><meshStandardMaterial color="#d6a25d" roughness={0.9} /></mesh>
    {[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.055, 0.045, i === 0 ? 0.04 : -0.02]}>
      <sphereGeometry args={[0.018, 6, 4]} /><meshStandardMaterial color="#57392c" />
    </mesh>)}
  </group> : <group>
    <mesh scale={[1, 0.65, 1]}><sphereGeometry args={[0.075, 10, 8]} /><meshStandardMaterial color="#e98eac" roughness={0.22} /></mesh>
    {[-1, 1].map(i => <mesh key={i} position={[i * 0.1, 0, 0]} rotation={[0, 0, i * Math.PI / 2]}>
      <coneGeometry args={[0.055, 0.07, 6]} /><meshStandardMaterial color="#f3c0d0" />
    </mesh>)}
  </group>;
}

function steamTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!, gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffb0'); gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}
function Steam({ heat, now, texture, offset }: { heat: () => number; now: () => number; texture: CanvasTexture; offset: number }) {
  const sprites = useRef<(Sprite | null)[]>([]);
  useFrame(() => {
    const strength = Math.max(0, Math.min(1, (heat() - 40) / 50));
    for (let i = 0; i < 3; i++) {
      const sprite = sprites.current[i]; if (!sprite) continue;
      const phase = (now() / 3000 + i / 3 + offset) % 1;
      sprite.position.set(Math.sin(phase * 5 + offset) * 0.07, 0.05 + phase * 0.7, Math.cos(phase * 6 + offset) * 0.04);
      sprite.scale.setScalar(0.12 + phase * 0.28);
      (sprite.material as SpriteMaterial).opacity = strength * (1 - phase) * 0.4;
    }
  });
  return <group>{[0, 1, 2].map(i => <sprite key={i} ref={sprite => { sprites.current[i] = sprite; }}>
    <spriteMaterial map={texture} transparent depthWrite={false} opacity={0} />
  </sprite>)}</group>;
}

export function CupModel({ cup, now }: { cup: () => CupState | undefined; now: () => number }) {
  const tea = useRef<Mesh>(null);
  const profile = useMemo(() => [[0.02, 0], [0.13, 0], [0.15, 0.24], [0.12, 0.24], [0.1, 0.03], [0.02, 0.03]]
    .map(([x, y]) => new Vector2(x, y)), []);
  useFrame(() => {
    if (!tea.current) return;
    const state = cup(), level = state ? cupMl(state, now()) : 0;
    tea.current.visible = level > 0.1;
    tea.current.position.y = 0.035 + Math.min(1, level / 200) * 0.17;
  });
  return <group>
    <mesh><latheGeometry args={[profile, 20]} /><meshStandardMaterial color="#f4e9d2" roughness={0.25} /></mesh>
    <mesh position={[0.15, 0.13, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.085, 0.018, 6, 14]} /><meshStandardMaterial color="#f4e9d2" /></mesh>
    <mesh ref={tea} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.105, 20]} /><meshStandardMaterial color="#a45a17" roughness={0.18} metalness={0.12} /></mesh>
  </group>;
}

function CupOnTable({ session, seat, texture }: { session: RoomSession; seat: number; texture: CanvasTexture }) {
  const group = useRef<Group>(null), position = cupPosition(seat);
  useFrame(() => {
    if (!group.current) return;
    const table = session.getSnapshot().table, owner = table?.owners[seat];
    const action = table && owner ? activeAction(table, owner, session.tableNow()) : undefined;
    group.current.visible = !(action && (action.kind === 'drink' || action.kind === 'dump'));
  });
  const cup = () => session.getSnapshot().table?.cups[seat];
  return <group ref={group} position={[position.x, 1.11, position.z]} rotation={[0, position.yaw, 0]}>
    <CupModel cup={cup} now={() => session.tableNow()} />
    <group position={[0, 0.24, 0]}><Steam texture={texture} offset={seat / 8} now={() => session.tableNow()}
      heat={() => { const value = cup(); return value && cupMl(value, session.tableNow()) > 0.1
        ? temperature(value.heatC, value.heatedAt, session.tableNow()) : 22; }} /></group>
  </group>;
}

function FlyingSnack({ action, session }: { action: TableAction; session: RoomSession }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const progress = (session.tableNow() - action.startedAt) / action.durationMs;
    group.current.visible = progress >= 0.25 && progress < 1;
    const t = Math.max(0, Math.min(1, (progress - 0.25) / 0.75)), from = seatPosition(action.seat);
    group.current.position.set(from.x + (BIN_POSITION[0] - from.x) * t,
      1.7 + (0.65 - 1.7) * t + Math.sin(t * Math.PI) * 1.6,
      from.z + (BIN_POSITION[2] - from.z) * t);
    group.current.rotation.set(t * 12, t * 8, t * 5);
  });
  return <group ref={group}><SnackModel kind={action.snack ?? 'cake'} /></group>;
}

function WaterEffect({ action, session }: { action: TableAction; session: RoomSession }) {
  const group = useRef<Group>(null);
  const drops = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    if (!group.current) return;
    const progress = (session.tableNow() - action.startedAt) / action.durationMs;
    group.current.visible = progress > 0.15 && progress < 0.9;
    const cup = cupPosition(action.targetSeat), from = seatPosition(action.seat);
    drops.current.forEach((drop, i) => {
      if (!drop) return;
      const t = (progress * 3 + i / 7) % 1;
      if (action.kind === 'dump') {
        const length = Math.max(1, Math.hypot(from.x, from.z));
        drop.position.set(from.x + from.x / length * 0.35, 1.45 - t * 1.4, from.z + from.z / length * 0.35);
      }
      else drop.position.set(cup.x, 1.7 - t * 0.45, cup.z);
    });
  });
  return <group ref={group}>{Array.from({ length: 7 }, (_, i) => <mesh key={i} ref={mesh => { drops.current[i] = mesh; }} scale={[0.022, 0.05, 0.022]}>
    <sphereGeometry args={[1, 6, 4]} /><meshStandardMaterial color="#b9762d" transparent opacity={0.75} />
  </mesh>)}</group>;
}

export function TableObjects({ session }: { session: RoomSession }) {
  const state = session.getSnapshot(), table = state.table;
  const pot = useRef<Group>(null);
  const texture = useMemo(steamTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    if (!pot.current) return;
    const current = session.getSnapshot().table, now = session.tableNow();
    const action = current && Object.values(current.actions).find(a => (a.kind === 'pour' || a.kind === 'offer') && activeAction(current, a.peer, now));
    if (!action) { pot.current.position.set(0, 1.4, 0.45); pot.current.rotation.set(0, 0, 0); return; }
    const target = cupPosition(action.targetSeat), progress = (now - action.startedAt) / action.durationMs;
    const weight = Math.min(1, progress / 0.2, (1 - progress) / 0.2);
    const length = Math.hypot(target.x, target.z), x = target.x / length, z = target.z / length;
    pot.current.position.set((target.x + x * 0.4) * weight, 1.4 + 0.3 * weight, 0.45 + (target.z + z * 0.4 - 0.45) * weight);
    pot.current.rotation.set(0.7 * weight, Math.atan2(-x, -z), 0, 'YXZ');
  });
  if (!table) return null;
  return <group>
    <group ref={pot} position={[0, 1.4, 0.45]}><TeapotModel /><group position={[0, 0.3, 0]}>
      <Steam texture={texture} offset={0} now={() => session.tableNow()} heat={() => {
        const value = session.getSnapshot().table?.pot;
        return value && value.ml > 0 ? temperature(value.heatC, value.heatedAt, session.tableNow(), 180000) : 22;
      }} /></group></group>
    {Array.from({ length: 8 }, (_, seat) => <CupOnTable key={seat} session={session} seat={seat} texture={texture} />)}
    <mesh position={[-0.65, 1.12, -0.35]}><cylinderGeometry args={[0.53, 0.45, 0.04, 24]} /><meshStandardMaterial color="#ece1c8" /></mesh>
    {Array.from({ length: table.plate.cake }, (_, i) => <group key={`cake-${i}`}
      position={[-0.95 + i % 4 * 0.2, 1.19, -0.55 + Math.floor(i / 4) * 0.2]}><SnackModel kind="cake" /></group>)}
    <mesh position={[0.65, 1.12, -0.35]}><cylinderGeometry args={[0.48, 0.4, 0.04, 24]} /><meshStandardMaterial color="#ece1c8" /></mesh>
    {Array.from({ length: table.plate.candy }, (_, i) => <group key={`candy-${i}`}
      position={[0.35 + i % 4 * 0.2, 1.2 + Math.floor(i / 8) * 0.07, -0.5 + Math.floor(i / 4) % 2 * 0.22]}><SnackModel kind="candy" /></group>)}
    <group position={[...BIN_POSITION]}>
      <mesh><cylinderGeometry args={[0.38, 0.3, 0.9, 16]} /><meshStandardMaterial color="#35515b" /></mesh>
      <mesh position={[0, 0.46, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.38, 0.04, 8, 16]} /><meshStandardMaterial color="#92aaa9" /></mesh>
    </group>
    {Object.values(table.actions).map(action => action.kind === 'throw' ? <FlyingSnack key={action.id} action={action} session={session} />
      : action.kind === 'pour' || action.kind === 'offer' || action.kind === 'dump' ? <WaterEffect key={action.id} action={action} session={session} /> : null)}
  </group>;
}
