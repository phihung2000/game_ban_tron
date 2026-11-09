import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Environment, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { BackSide, DirectionalLight, FogExp2, Group, HemisphereLight, Mesh, ShaderMaterial, Vector3 } from 'three';
import type { SkyState } from '../../shared/world';
import { QUALITY } from './GraphicsController';
import type { Quality } from './GraphicsController';

class EnvironmentFallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export function Atmosphere({ quality, sky }: { quality: Quality; sky: RefObject<SkyState> }) {
  const scene = useThree(s => s.scene), config = QUALITY[quality];
  const sun = useRef<DirectionalLight>(null), hemi = useRef<HemisphereLight>(null);
  const stars = useRef<Group>(null), moon = useRef<Mesh>(null);
  const fog = useMemo(() => new FogExp2('#b4c5bf', .009), []);
  const skyMaterial = useMemo(() => new ShaderMaterial({ side: BackSide, depthWrite: false,
    uniforms: { uDay: { value: 1 }, uFog: { value: 0 }, uSun: { value: new Vector3(0, 1, 0) } },
    vertexShader: `varying vec3 vSky; void main(){vSky=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vSky; uniform float uDay; uniform float uFog; uniform vec3 uSun;
      void main(){vec3 d=normalize(vSky);float h=clamp(d.y,0.,1.);
      vec3 day=mix(vec3(.72,.82,.78),vec3(.19,.46,.68),pow(h,.5));
      vec3 night=mix(vec3(.035,.065,.105),vec3(.008,.016,.045),h);
      vec3 c=mix(night,day,uDay);c=mix(c,vec3(.54,.62,.61)*(.14+.86*uDay),uFog*.65);
      float disk=pow(max(0.,dot(d,normalize(uSun))),1500.);
      float glow=pow(max(0.,dot(d,normalize(uSun))),18.);
      c+=vec3(1.,.79,.48)*(disk*2.+glow*.18)*uDay;
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  }), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  useEffect(() => () => skyMaterial.dispose(), [skyMaterial]);
  useFrame((_, delta) => {
    const state = sky.current, day = state.daylight;
    if (stars.current) stars.current.visible = day < .3;
    if (moon.current) moon.current.visible = day < .4;
    const mist = state.weather === 'fog' ? 1 : state.weather === 'rain' ? .55 : 0;
    skyMaterial.uniforms.uDay.value = day;
    skyMaterial.uniforms.uFog.value += (mist - skyMaterial.uniforms.uFog.value) * Math.min(1, delta * .4);
    skyMaterial.uniforms.uSun.value.set(.55, state.sunY, -.4).normalize();
    fog.density += ((state.weather === 'fog' ? .036 : state.weather === 'rain' ? .019 : .006) - fog.density) * Math.min(1, delta * .5);
    fog.color.set('#a9bbb5').multiplyScalar(.12 + day * .88);
    scene.environmentIntensity = (.16 + day * .7) * (1 - mist * .4);
    if (sun.current) {
      sun.current.position.set(16, 8 + Math.max(0, state.sunY) * 22, -12);
      sun.current.color.set(day > .3 ? '#ffe6b9' : '#97b8e3');
      sun.current.intensity = (.16 + day * 2.7) * (1 - mist * .65);
    }
    if (hemi.current) hemi.current.intensity = .24 + day * .6;
  });
  return <>
    <EnvironmentFallback><Suspense fallback={null}><Environment files={`${import.meta.env.BASE_URL}assets/sky.hdr`} background={false} /></Suspense></EnvironmentFallback>
    <mesh material={skyMaterial} frustumCulled={false} renderOrder={-100}><sphereGeometry args={[130, 24, 16]} /></mesh>
    <group ref={stars}><Stars radius={110} depth={10} count={quality === 'low' ? 300 : 800} factor={2} fade speed={.1} /></group>
    <hemisphereLight ref={hemi} args={['#b7d5e3', '#5b6341', .7]} />
    <directionalLight key={config.shadows} ref={sun} castShadow={Boolean(config.shadows)} shadow-mapSize={[config.shadows || 512, config.shadows || 512]}
      shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24}
      shadow-camera-near={1} shadow-camera-far={90} shadow-normalBias={.045} shadow-bias={-.00015} shadow-radius={3} />
    <mesh ref={moon} position={[-40, 65, -65]}><sphereGeometry args={[1.5, 12, 8]} /><meshBasicMaterial color="#d6e3eb" /></mesh>
  </>;
}
