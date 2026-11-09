import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Object3D, ShaderMaterial } from 'three';
import { randomSeed, terrainHeight } from '../../shared/world';
import type { SkyState } from '../../shared/world';
import { QUALITY } from './GraphicsController';
import type { Quality } from './GraphicsController';

function Flyers({ count, kind, sky }: { count: number; kind: 'bird' | 'butterfly' | 'leaf'; sky: RefObject<SkyState> }) {
  const ref = useRef<InstancedMesh>(null);
  const resources = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, -.12, -.5, 0, -.2, -.25, 0, .22, 0, 0, -.12, .25, 0, .22, .5, 0, -.2,
    ]), 3)); geometry.computeVertexNormals();
    const material = new ShaderMaterial({ side: DoubleSide, uniforms: { uTime: { value: 0 },
      uColor: { value: kind === 'bird' ? [ .22, .27, .24 ] : kind === 'leaf' ? [.68, .39, .12] : [.93, .63, .3] } },
      vertexShader: `uniform float uTime; void main(){vec3 p=position;
        p.y+=abs(p.x)*sin(uTime*${kind === 'bird' ? '8.' : '15.'}+instanceMatrix[3].x)*.85;
        gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
      fragmentShader: 'uniform vec3 uColor; void main(){gl_FragColor=vec4(uColor,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    const random = randomSeed(kind === 'bird' ? 16 : kind === 'leaf' ? 17 : 18);
    const seeds = Array.from({ length: count }, () => [random() * Math.PI * 2, random() * 30 - 15, random() * 30 - 15, .5 + random()]);
    return { geometry, material, seeds, object: new Object3D() };
  }, [count, kind]);
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
  useFrame(() => {
    if (!ref.current) return;
    const { time, daylight } = sky.current;
    ref.current.visible = kind === 'leaf' || daylight > .15;
    resources.material.uniforms.uTime.value = time;
    resources.seeds.forEach(([phase, x, z, speed], i) => {
      const t = time * (kind === 'bird' ? .16 : .4) * speed + phase, o = resources.object;
      if (kind === 'bird') o.position.set(x + Math.cos(t) * 9, 7 + Math.sin(t * 2) * 1.8, z + Math.sin(t) * 8);
      else if (kind === 'butterfly') o.position.set(x + Math.cos(t) * 2, Math.max(.2, terrainHeight(x, z)) + .8 + Math.sin(t * 1.4) * .5, z + Math.sin(t) * 2);
      else o.position.set(x + Math.sin(t) * 2, terrainHeight(x, z) + 6 - ((time * .45 * speed + phase) % 6), z + Math.cos(t) * 1.4);
      o.rotation.set(kind === 'leaf' ? t : 0, -t, kind === 'bird' ? Math.sin(t) * .18 : 0);
      o.scale.setScalar(kind === 'bird' ? .6 : kind === 'leaf' ? .24 : .18); o.updateMatrix(); ref.current!.setMatrixAt(i, o.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[resources.geometry, resources.material, count]} frustumCulled={false} name={`nature-${kind}`} />;
}
export function Wildlife({ quality, sky }: { quality: Quality; sky: RefObject<SkyState> }) {
  const config = QUALITY[quality];
  const rain = useMemo(() => {
    const random = randomSeed(19), positions = new Float32Array(config.rain * 6), tips = new Float32Array(config.rain * 2);
    for (let i = 0; i < config.rain; i++) {
      const x = random() * 70 - 35, y = random() * 15, z = random() * 70 - 35;
      positions.set([x, y, z, x, y, z], i * 6); tips[i * 2 + 1] = 1;
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aTip', new BufferAttribute(tips, 1));
    const material = new ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: 'uniform float uTime; attribute float aTip; void main(){vec3 p=position;p.y=mod(p.y-uTime*7.,15.)+aTip*.3;p.x+=sin(uTime*.3)*.4-aTip*.05;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
      fragmentShader: 'uniform float uAlpha; void main(){gl_FragColor=vec4(.7,.82,.85,uAlpha);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }); return { geometry, material };
  }, [config]);
  useEffect(() => () => { rain.geometry.dispose(); rain.material.dispose(); }, [rain]);
  useFrame((_, delta) => {
    rain.material.uniforms.uTime.value = sky.current.time;
    const target = sky.current.weather === 'rain' ? .35 : 0;
    rain.material.uniforms.uAlpha.value += (target - rain.material.uniforms.uAlpha.value) * Math.min(1, delta * .7);
  });
  return <group name="nature-wildlife">
    <Flyers count={Math.max(4, Math.floor(config.wildlife / 3))} kind="bird" sky={sky} />
    <Flyers count={config.wildlife} kind="butterfly" sky={sky} />
    <Flyers count={config.wildlife} kind="leaf" sky={sky} />
    <lineSegments geometry={rain.geometry} material={rain.material} frustumCulled={false} name="nature-rain" />
  </group>;
}
