import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { Group } from 'three';
import { avatarDetail } from './lod';
import type { AvatarDetail } from './lod';
import type { Quality } from '../scene/nature/GraphicsController';
import type { RoomSession } from '../network/RoomSession';
import { seatPosition } from '../network/seats';
import { angleLerp } from './PoseBuffer';
import { sampleEmote } from './emotes';
import { OverheadLabels } from './OverheadLabels';
import { activeAction } from '../network/table';
import { sampleTableAction } from './tableAnimations';
import { CupModel, SnackModel } from '../scene/TableObjects';
import { SpeakingIndicator } from './SpeakingIndicator';
import { terrainHeight } from '../shared/world';

export function Avatar({ session, peer, name, quality }: { session: RoomSession; peer: string; name: string; quality: Quality }) {
  const group = useRef<Group>(null), body = useRef<Group>(null);
  const head = useRef<Group>(null), leftArm = useRef<Group>(null), rightArm = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const rightLimb = useRef<Group>(null), hand = useRef<Group>(null), heldCup = useRef<Group>(null);
  const heldCake = useRef<Group>(null), heldCandy = useRef<Group>(null);
  const local = peer === session.peer;
  const near = useRef<Group>(null), far = useRef<Group>(null), detail = useRef<AvatarDetail>('near');
  const world = useMemo(() => new Vector3(), []);
  const messages = session.getSnapshot().social.chats[peer] ?? [];
  useFrame(({ clock, camera }, delta) => {
    if (!group.current || !body.current) return;
    const state = session.getSnapshot();
    const seat = state.seats?.seats.indexOf(peer) ?? -1;
    const pose = seat >= 0 ? { ...seatPosition(seat), animation: 'sit' }
      : local ? session.localPose : session.poses.get(peer)?.sample();
    group.current.visible = Boolean(pose);
    if (!pose) return;
    const t = local ? 1 : 1 - Math.exp(-20 * delta);
    group.current.position.x += (pose.x - group.current.position.x) * t;
    group.current.position.z += (pose.z - group.current.position.z) * t;
    group.current.position.y = terrainHeight(group.current.position.x, group.current.position.z);
    group.current.rotation.y = angleLerp(group.current.rotation.y, pose.yaw, t);
    group.current.getWorldPosition(world);
    detail.current = local ? 'near' : avatarDetail(camera.position.distanceTo(world), quality, detail.current);
    if (near.current) near.current.visible = detail.current === 'near';
    if (far.current) far.current.visible = detail.current === 'far';
    group.current.userData.avatarDetail = detail.current;
    if (detail.current === 'far') {
      body.current.position.y = pose.animation === 'sit' ? .55 : 0; body.current.rotation.x = 0;
      return; // Người xa vẫn nội suy vị trí; bỏ blend tay/mặt và đồ cầm.
    }
    const emote = sampleEmote(state.social.emotes[peer], performance.now());
    const tableAction = state.table ? activeAction(state.table, peer, session.tableNow()) : undefined;
    const interaction = sampleTableAction(tableAction, session.tableNow());
    body.current.position.y = (pose.animation === 'sit' ? 0.55
      : pose.animation === 'walk' ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.09 : 0) + emote.bounce;
    body.current.rotation.x = (pose.animation === 'sit' ? -0.1 : 0) + interaction.lean;
    if (head.current) head.current.rotation.x = tableAction ? interaction.headX : emote.headX;
    if (mouth.current) mouth.current.scale.y = emote.laugh ? 2.4 : 1;
    if (leftArm.current) { leftArm.current.rotation.x = tableAction ? interaction.leftX : emote.leftX; leftArm.current.rotation.z = tableAction ? interaction.leftZ : emote.leftZ; }
    if (rightArm.current) { rightArm.current.rotation.x = tableAction ? interaction.rightX : emote.rightX; rightArm.current.rotation.z = tableAction ? interaction.rightZ : emote.rightZ; }
    if (rightLimb.current) rightLimb.current.scale.y = interaction.reach;
    if (hand.current) hand.current.position.y = -0.48 * interaction.reach;
    if (heldCup.current) heldCup.current.visible = interaction.cup;
    const snack = tableAction ? interaction.snack ? tableAction.snack : null : seat >= 0 ? state.table?.hands[seat] : null;
    if (heldCake.current) heldCake.current.visible = snack === 'cake';
    if (heldCandy.current) heldCandy.current.visible = snack === 'candy';
  });
  return (
    <group ref={group} name={`avatar-${peer}`}>
      <group ref={body}>
        <group ref={near}>
        <mesh position={[0, 0.8, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.65, 4, 8]} />
          <meshStandardMaterial color={local ? '#5be0c5' : '#91acff'} />
        </mesh>
        <group ref={head} position={[0, 1.45, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.25, 12, 8]} />
          <meshStandardMaterial color="#f1c7a2" />
        </mesh>
        <mesh position={[0, 0.05, 0.24]}>
          <boxGeometry args={[0.12, 0.08, 0.08]} />
          <meshStandardMaterial color="#243147" />
        </mesh>
        <group ref={mouth} position={[0, -0.1, 0.235]}>
          <mesh><boxGeometry args={[0.14, 0.035, 0.035]} /><meshStandardMaterial color="#773a39" /></mesh>
        </group>
        </group>
        <group ref={leftArm} position={[-0.32, 1.05, 0]}>
          <mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.085, 0.35, 4, 8]} /><meshStandardMaterial color="#f1c7a2" /></mesh>
        </group>
        <group ref={rightArm} position={[0.32, 1.05, 0]}>
          <group ref={rightLimb}><mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.085, 0.35, 4, 8]} /><meshStandardMaterial color="#f1c7a2" /></mesh></group>
          <group ref={hand} position={[0, -0.48, 0]}>
            <group ref={heldCup} visible={false} position={[0, 0, 0.1]}><CupModel now={() => session.tableNow()}
              cup={() => { const current = session.getSnapshot(); const i = current.seats?.seats.indexOf(peer) ?? -1; return i >= 0 ? current.table?.cups[i] : undefined; }} /></group>
            <group ref={heldCake} visible={false} position={[0, 0, 0.06]}><SnackModel kind="cake" /></group>
            <group ref={heldCandy} visible={false} position={[0, 0, 0.06]}><SnackModel kind="candy" /></group>
          </group>
        </group>
        </group>
        <group ref={far} visible={false}>
          <mesh position={[0, .8, 0]}><cylinderGeometry args={[.23, .23, 1, 6]} /><meshStandardMaterial color="#91acff" roughness={.9} /></mesh>
          <mesh position={[0, 1.45, 0]}><sphereGeometry args={[.25, 6, 4]} /><meshStandardMaterial color="#f1c7a2" roughness={.9} /></mesh>
        </group>
        <OverheadLabels name={`${name}${local ? ' (bạn)' : ''}`} messages={messages} />
        <SpeakingIndicator session={session} peer={peer} />
      </group>
    </group>
  );
}
