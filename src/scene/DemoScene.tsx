import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { RotatingCube } from './RotatingCube';

export function DemoScene() {
  return (
    <Canvas
      camera={{ position: [4, 3, 5], fov: 45, near: 0.1, far: 100 }}
      // Giới hạn mật độ điểm ảnh để giảm tải màn hình Retina/điện thoại.
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<p className="fallback">Trình duyệt cần hỗ trợ WebGL để hiển thị 3D.</p>}
    >
      <color attach="background" args={['#101c29']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 3]} intensity={3} />
      <directionalLight position={[-3, 1, -2]} intensity={1.5} color="#7faaff" />
      <RotatingCube />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={12} />
      <Stats showPanel={0} className="fps-meter" />
    </Canvas>
  );
}
