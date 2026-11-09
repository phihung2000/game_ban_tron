import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Detailed } from '@react-three/drei';
import { BufferGeometry, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { canPlant, LAKE, randomSeed, terrainHeight } from '../../shared/world';
import { flowerGeometry, grassGeometry, treeGeometry, windMaterial } from './materials';
import type { WindUniforms } from './materials';
import { QUALITY } from './GraphicsController';
import type { Quality } from './GraphicsController';

type Instance = { x: number; z: number; scale: number; angle: number };
function instances(count: number, seed: number, trees = false) {
  const random = randomSeed(seed), items: Instance[] = [];
  for (let tries = 0; items.length < count && tries < count * 20; tries++) {
    const x = (random() - .5) * 80, z = (random() - .5) * 80;
    if (!canPlant(x, z) || (trees && (Math.hypot(x, z) < 12 || (x > 0 && z > 0 && Math.hypot(x, z) < 23)))) continue;
    items.push({ x, z, scale: trees ? .7 + random() * .8 : .6 + random() * .8, angle: random() * Math.PI * 2 });
  }
  return items;
}
function Batch({ items, geometry, material, depth, shadow = false, range = 100, origin = [0, 0] }: {
  items: Instance[]; geometry: BufferGeometry; material: MeshStandardMaterial;
  depth?: ReturnType<typeof windMaterial>['depth']; shadow?: boolean; range?: number; origin?: number[];
}) {
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current; if (!mesh) return;
    const object = new Object3D();
    items.forEach((item, i) => {
      object.position.set(item.x - origin[0], terrainHeight(item.x, item.z), item.z - origin[1]);
      object.rotation.set(0, item.angle, 0); object.scale.setScalar(item.scale); object.updateMatrix(); mesh.setMatrixAt(i, object.matrix);
    });
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.instanceMatrix.needsUpdate = true;
    // Culling theo từng cụm; nới biên vì GPU dịch đỉnh theo gió.
    mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 1.5;
    mesh.boundingBox?.expandByScalar(1.5);
  }, [items, geometry, origin[0], origin[1]]);
  useFrame(({ camera }) => {
    if (ref.current && range < 100) ref.current.visible = Math.hypot(camera.position.x - origin[0], camera.position.z - origin[1]) < range;
  });
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={shadow} receiveShadow
    customDepthMaterial={depth} frustumCulled name="nature-instance-batch" />;
}
export function Vegetation({ quality, uniforms }: { quality: Quality; uniforms: WindUniforms }) {
  const config = QUALITY[quality];
  const resources = useMemo(() => ({ grass: grassGeometry(), flowers: [0, 1, 2].map(flowerGeometry),
    trees: [0, 1, 2].map(k => [treeGeometry(k, false), treeGeometry(k, true)]),
    stone: new IcosahedronGeometry(1, 1), wind: windMaterial(uniforms), rock: new MeshStandardMaterial({ color: '#7f8178', roughness: .92 }) }), [uniforms]);
  useEffect(() => () => {
    resources.grass.dispose(); resources.flowers.forEach(g => g.dispose()); resources.trees.flat().forEach(g => g.dispose());
    resources.stone.dispose(); resources.wind.material.dispose(); resources.wind.depth.dispose(); resources.rock.dispose();
  }, [resources]);
  const chunks = useMemo(() => {
    const trees = instances(config.trees, 11, true), grass = instances(config.grass, 12), flowers = instances(config.flowers, 13);
    // 16 cụm có bounding sphere riêng thay vì một InstancedMesh phủ cả thế giới.
    return Array.from({ length: 16 }, (_, i) => {
      const x = (i % 4 - 1.5) * 20, z = (Math.floor(i / 4) - 1.5) * 20;
      const within = (p: Instance) => p.x >= x - 10 && p.x < x + 10 && p.z >= z - 10 && p.z < z + 10;
      return { x, z, trees: trees.filter(within), grass: grass.filter(within), flowers: flowers.filter(within) };
    });
  }, [config]);
  const rocks = useMemo(() => {
    const random = randomSeed(14), items = instances(44, 15).map(p => ({ ...p, scale: p.scale * .6 }));
    for (let i = 0; i < 38; i++) {
      const a = i / 38 * Math.PI * 2;
      items.push({ x: LAKE.x + Math.cos(a) * (LAKE.rx + .3 + random()), z: LAKE.z + Math.sin(a) * (LAKE.rz + .3 + random()),
        scale: .18 + random() * .38, angle: a });
    }
    return items;
  }, []);
  return <group name="nature-vegetation">
    {chunks.map((chunk, i) => <group key={i} position={[chunk.x, 0, chunk.z]}>
      <Batch items={chunk.grass} geometry={resources.grass} material={resources.wind.material} range={config.range} origin={[chunk.x, chunk.z]} />
      {[0, 1, 2].map(k => <Batch key={k} items={chunk.flowers.filter((_, j) => j % 3 === k)} geometry={resources.flowers[k]}
        material={resources.wind.material} range={config.range + 5} origin={[chunk.x, chunk.z]} />)}
      {[0, 1, 2].map(k => {
        const items = chunk.trees.filter((_, j) => j % 3 === k);
        if (!items.length) return null;
        return <Detailed key={k} distances={[0, quality === 'low' ? 18 : quality === 'medium' ? 35 : 45]} hysteresis={.12}>
          {[0, 1].map(level => <Batch key={level} items={items} geometry={resources.trees[k][level]}
            material={resources.wind.material} depth={resources.wind.depth} shadow={quality !== 'low' && level === 0} origin={[chunk.x, chunk.z]} />)}
        </Detailed>;
      })}
    </group>)}
    <Batch items={rocks} geometry={resources.stone} material={resources.rock} shadow={quality !== 'low'} />
  </group>;
}
