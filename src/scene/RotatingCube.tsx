import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';

export function RotatingCube() {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    // Xoay theo thời gian, không phụ thuộc số FPS của thiết bị.
    // Giới hạn bước để khối không nhảy góc khi quay lại tab vừa bị ẩn.
    const step = Math.min(delta, 0.05);
    meshRef.current.rotation.x += step * 0.35;
    meshRef.current.rotation.y += step * 0.6;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1.8, 1.8, 1.8]} />
      <meshStandardMaterial color="#4dd7bd" roughness={0.3} metalness={0.15} />
    </mesh>
  );
}
