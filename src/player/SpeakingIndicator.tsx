import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Vector3 } from 'three';
import type { PerspectiveCamera, Sprite, SpriteMaterial } from 'three';
import type { RoomSession } from '../network/RoomSession';

export function SpeakingIndicator({ session, peer }: { session: RoomSession; peer: string }) {
  const sprite = useRef<Sprite>(null), position = useMemo(() => new Vector3(), []);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.strokeStyle = '#66ffe0'; context.fillStyle = '#66ffe0'; context.lineWidth = 4;
    context.beginPath(); context.roundRect(24, 10, 16, 28, 8); context.fill();
    context.beginPath(); context.arc(32, 30, 15, 0, Math.PI); context.stroke();
    context.beginPath(); context.moveTo(32, 45); context.lineTo(32, 53); context.moveTo(23, 53); context.lineTo(41, 53); context.stroke();
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ camera, size, clock }) => {
    if (!sprite.current) return;
    sprite.current.visible = session.voice.isSpeaking(peer);
    if (!sprite.current.visible) return;
    sprite.current.getWorldPosition(position); position.applyMatrix4(camera.matrixWorldInverse);
    const perspective = camera as PerspectiveCamera;
    const units = perspective.isPerspectiveCamera ? 2 * Math.tan(perspective.fov * Math.PI / 360)
      * Math.max(0.1, -position.z) / perspective.zoom / size.height : 0.02;
    sprite.current.scale.setScalar(units * (28 + Math.sin(clock.elapsedTime * 10) * 2));
    (sprite.current.material as SpriteMaterial).opacity = 0.85 + Math.sin(clock.elapsedTime * 10) * 0.15;
  });
  return <sprite ref={sprite} visible={false} position={[0.42, 1.85, 0]} renderOrder={25}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
  </sprite>;
}
