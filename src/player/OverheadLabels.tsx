import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import type { Group, OrthographicCamera, PerspectiveCamera, SpriteMaterial } from 'three';
import { bubbleOpacity } from '../network/social';
import type { ChatMessage } from '../network/social';

function textTexture(text: string, bubble: boolean) {
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!;
  canvas.width = 768;
  context.font = '32px system-ui, sans-serif';
  if (!bubble) canvas.width = Math.max(120, Math.min(768, Math.ceil(context.measureText(text).width + 48)));
  context.font = '32px system-ui, sans-serif';
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    if (context.measureText(line + char).width > canvas.width - 48 && line) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  canvas.height = Math.max(90, lines.length * 44 + 36) + (bubble ? 16 : 0);
  // Đổi kích thước canvas sẽ reset context, cần đặt lại font và màu.
  context.font = '32px system-ui, sans-serif';
  context.fillStyle = bubble ? '#f4fcff' : '#10232d';
  context.beginPath(); context.roundRect(4, 4, canvas.width - 8, canvas.height - (bubble ? 20 : 8), 22); context.fill();
  if (bubble) {
    context.beginPath(); context.moveTo(360, canvas.height - 22);
    context.lineTo(384, canvas.height); context.lineTo(408, canvas.height - 22); context.fill();
  }
  context.fillStyle = bubble ? '#142e38' : '#ffffff';
  context.textBaseline = 'middle'; context.textAlign = 'center';
  lines.forEach((value, i) => context.fillText(value, canvas.width / 2, 36 + i * 44));
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return { texture, width: canvas.width * 0.44, height: canvas.height * 0.44 };
}

function Bubble({ message, y }: { message: ChatMessage; y: number }) {
  const label = useMemo(() => textTexture(message.text, true), [message.text]);
  const material = useRef<SpriteMaterial>(null);
  useEffect(() => () => label.texture.dispose(), [label]);
  useFrame(() => { if (material.current) material.current.opacity = bubbleOpacity(message.startedAt, performance.now()); });
  return <sprite position={[0, y + label.height / 2, 0]} scale={[label.width, label.height, 1]} renderOrder={20}>
    <spriteMaterial ref={material} map={label.texture} transparent depthWrite={false} depthTest={false} />
  </sprite>;
}

export function OverheadLabels({ name, messages }: { name: string; messages: ChatMessage[] }) {
  const group = useRef<Group>(null);
  const position = useMemo(() => new Vector3(), []);
  const label = useMemo(() => textTexture(name, false), [name]);
  useEffect(() => () => label.texture.dispose(), [label]);
  // Tin mới ở dưới, tin cũ được đẩy lên. Chiều cao theo số dòng, không đè nhau.
  const stack = useMemo(() => {
    let y = label.height / 2 + 12;
    return [...messages].reverse().map(message => {
      const measuring = textTexture(message.text, true);
      const item = { message, y }; y += measuring.height + 8;
      measuring.texture.dispose(); return item;
    });
  }, [messages, label.height]);
  useFrame(({ camera, size }) => {
    if (!group.current || !size.height) return;
    group.current.getWorldPosition(position); position.applyMatrix4(camera.matrixWorldInverse);
    // Đổi pixel sang đơn vị thế giới để chữ vẫn khoảng 14px khi camera thu/phóng.
    const perspective = camera as PerspectiveCamera;
    const unitsPerPixel = perspective.isPerspectiveCamera
      ? 2 * Math.tan(perspective.fov * Math.PI / 360) * Math.max(0.1, -position.z) / perspective.zoom / size.height
      : ((camera as OrthographicCamera).top - (camera as OrthographicCamera).bottom) / camera.zoom / size.height;
    group.current.scale.setScalar(unitsPerPixel);
  });
  return <group ref={group} position={[0, 2, 0]}>
    <sprite scale={[label.width, label.height, 1]} renderOrder={19}>
      <spriteMaterial map={label.texture} transparent depthWrite={false} depthTest={false} />
    </sprite>
    {stack.map(item => <Bubble key={item.message.id} message={item.message} y={item.y} />)}
  </group>;
}
