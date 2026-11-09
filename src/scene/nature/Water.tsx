import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, MeshPhysicalMaterial } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { creekX, LAKE } from '../../shared/world';
import { QUALITY } from './GraphicsController';
import type { Quality } from './GraphicsController';
import type { WindUniforms } from './materials';

export function Water({ quality, uniforms }: { quality: Quality; uniforms: WindUniforms }) {
  const config = QUALITY[quality];
  const resources = useMemo(() => {
    const lake = new CircleGeometry(1, 72).scale(LAKE.rx, LAKE.rz, 1).rotateX(-Math.PI / 2);
    const stream = new BufferGeometry(), vertices: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 80; i++) {
      const z = -8 - i / 80 * 31;
      vertices.push(creekX(z) - .85, -.07, z, creekX(z) + .85, -.07, z); uv.push(0, i / 8, 1, i / 8);
      if (i < 80) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    stream.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    stream.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2)); stream.setIndex(indices); stream.computeVertexNormals();
    const material = new MeshPhysicalMaterial({ color: '#497e7d', roughness: .16, metalness: .25,
      transparent: true, opacity: config.reflection ? .32 : .88, clearcoat: 1, clearcoatRoughness: .12, side: DoubleSide, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.uniforms.uWaterTime = uniforms.time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterPosition = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWaterTime; varying vec3 vWaterPosition;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float ripple = sin(vWaterPosition.x * 3.8 + uWaterTime * 1.5) * cos(vWaterPosition.z * 3.1 - uWaterTime);
          normal = normalize(normal + vec3(ripple * .08, 0., cos(vWaterPosition.z * 5. + uWaterTime) * .06));`);
    };
    material.customProgramCacheKey = () => 'nature-water-v1';
    const reflector = config.reflection ? new Reflector(new CircleGeometry(1, 64).scale(LAKE.rx, LAKE.rz, 1), {
      textureWidth: config.reflection, textureHeight: config.reflection, color: '#b1d1cf', clipBias: .003, multisample: 0,
    }) : null;
    if (reflector) {
      reflector.rotation.x = -Math.PI / 2; reflector.position.set(LAKE.x, LAKE.y - .015, LAKE.z);
      const render = reflector.onBeforeRender.bind(reflector); let frame = 0;
      // Phản chiếu thật cần thêm một lượt vẽ; giảm tần suất, không dùng độ phân giải màn hình.
      reflector.onBeforeRender = (...args) => { if (frame++ % config.reflectionEvery === 0) render(...args); };
      reflector.name = 'nature-lake-reflection';
    }
    return { lake, stream, material, reflector };
  }, [config, uniforms]);
  useEffect(() => () => {
    resources.lake.dispose(); resources.stream.dispose(); resources.material.dispose();
    if (resources.reflector) { resources.reflector.geometry.dispose(); resources.reflector.dispose(); }
  }, [resources]);
  return <group name="nature-water">
    {resources.reflector && <primitive object={resources.reflector} />}
    <mesh geometry={resources.lake} material={resources.material} position={[LAKE.x, LAKE.y, LAKE.z]} />
    <mesh geometry={resources.stream} material={resources.material} />
  </group>;
}
