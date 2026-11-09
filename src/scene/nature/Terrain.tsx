import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, PlaneGeometry } from 'three';
import { creekDistance, lakeDistance, smooth, terrainHeight, trailDistance } from '../../shared/world';
import { groundTextures } from './materials';

export function Terrain({ segments }: { segments: number }) {
  const geometry = useMemo(() => {
    const ground = new PlaneGeometry(96, 96, segments, segments).rotateX(-Math.PI / 2);
    const p = ground.attributes.position, colors = new Float32Array(p.count * 3);
    const grass = new Color('#586b42'), soil = new Color('#a18e6c'), sand = new Color('#9b997b'), c = new Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, terrainHeight(x, z));
      const path = 1 - smooth(.7, 1.6, trailDistance(x, z));
      const clearing = 1 - smooth(4.1, 5.4, Math.hypot(x, z));
      const bank = Math.max(1 - smooth(1, 1.26, lakeDistance(x, z)), 1 - smooth(.8, 1.6, creekDistance(x, z)));
      c.copy(grass).lerp(soil, Math.max(path, clearing) * .86).lerp(sand, bank * .65).toArray(colors, i * 3);
    }
    ground.setAttribute('color', new BufferAttribute(colors, 3)); ground.computeVertexNormals(); ground.computeBoundingSphere(); return ground;
  }, [segments]);
  const textures = useMemo(groundTextures, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => { textures.map.dispose(); textures.normalMap.dispose(); }, [textures]);
  return <mesh geometry={geometry} receiveShadow name="nature-terrain">
    <meshStandardMaterial vertexColors roughness={.96} map={textures.map} normalMap={textures.normalMap} normalScale={textures.normalScale} />
  </mesh>;
}
