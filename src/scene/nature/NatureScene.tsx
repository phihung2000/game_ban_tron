import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PCFShadowMap, Vector3 } from 'three';
import type { RoomSession } from '../../network/RoomSession';
import { seatPosition } from '../../network/seats';
import { skyState } from '../../shared/world';
import { Atmosphere } from './Atmosphere';
import { Terrain } from './Terrain';
import { Vegetation } from './Vegetation';
import { Water } from './Water';
import { Wildlife } from './Wildlife';
import { QUALITY } from './GraphicsController';
import type { GraphicsController, GraphicsSettings } from './GraphicsController';

export function NatureScene({ session, graphics, settings }: { session: RoomSession; graphics: GraphicsController; settings: GraphicsSettings }) {
  const gl = useThree(s => s.gl), setDpr = useThree(s => s.setDpr);
  const sky = useRef(skyState(session.tableNow(), session.getSnapshot().room.id, settings.time, settings.weather));
  const uniforms = useMemo(() => ({ time: { value: 0 }, wind: { value: .5 } }), []);
  const forward = useMemo(() => new Vector3(), []), stats = useRef({ elapsed: 0, frames: 0 });
  const config = QUALITY[settings.quality];
  useEffect(() => {
    setDpr(Math.min(devicePixelRatio || 1, config.dpr));
    gl.shadowMap.enabled = config.shadows > 0; gl.shadowMap.type = PCFShadowMap; gl.shadowMap.needsUpdate = true;
  }, [config, gl, setDpr]);
  useEffect(() => {
    if (!settings.ambience) return;
    const unlock = () => { void session.ambience.enable(); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [settings.ambience, session]);
  useFrame(({ camera }, delta) => {
    sky.current = skyState(session.tableNow(), session.getSnapshot().room.id, settings.time, settings.weather);
    sky.current.time %= 4096;
    // Giới hạn thời gian shader để giữ độ chính xác float trên GPU mobile.
    uniforms.time.value = sky.current.time % 4096; uniforms.wind.value = sky.current.wind;
    camera.getWorldDirection(forward); const heading = Math.atan2(forward.x, forward.z);
    session.voice.setHeading(heading);
    session.touch.heading = heading;
    const seats = session.getSnapshot().seats?.seats ?? [], seat = seats.indexOf(session.peer);
    const position = seat >= 0 ? seatPosition(seat) : session.localPose;
    session.ambience.update(position.x, position.z, heading, sky.current, settings.ambience, settings.volume);
    if (document.hidden) { stats.current = { elapsed: 0, frames: 0 }; return; }
    stats.current.elapsed += delta; stats.current.frames++;
    if (stats.current.elapsed >= 1) {
      graphics.report(stats.current.frames / stats.current.elapsed, gl.info.render.calls, gl.info.render.triangles);
      stats.current = { elapsed: 0, frames: 0 };
    }
  }, -1);
  return <group name="nature-world">
    <Atmosphere quality={settings.quality} sky={sky} />
    <Terrain segments={config.segments} />
    <Vegetation quality={settings.quality} uniforms={uniforms} />
    <Water quality={settings.quality} uniforms={uniforms} />
    <Wildlife quality={settings.quality} sky={sky} />
  </group>;
}
