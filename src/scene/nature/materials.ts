import { BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, IcosahedronGeometry,
  MeshDepthMaterial, MeshStandardMaterial, RepeatWrapping, RGBADepthPacking, SphereGeometry, SRGBColorSpace, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { randomSeed } from '../../shared/world';

export interface WindUniforms { time: { value: number }; wind: { value: number } }
const windCode = `
  vec3 transformed = vec3(position);
  vec3 anchor = vec3(0.0);
  #ifdef USE_INSTANCING
    anchor = instanceMatrix[3].xyz;
  #endif
  float phase = uNatureTime * 1.7 + anchor.x * .53 + anchor.z * .37;
  transformed.x += sin(phase + position.y * .7) * aWindWeight * .19 * uNatureWind;
  transformed.z += cos(phase * .71 + position.x) * aWindWeight * .12 * uNatureWind;
`;
export function windMaterial(uniforms: WindUniforms, color = '#ffffff', roughness = .85) {
  const material = new MeshStandardMaterial({ color, roughness, vertexColors: true });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  for (const item of [material, depth]) {
    item.onBeforeCompile = shader => {
      shader.uniforms.uNatureTime = uniforms.time; shader.uniforms.uNatureWind = uniforms.wind;
      shader.vertexShader = shader.vertexShader.replace('#include <common>',
        '#include <common>\nuniform float uNatureTime; uniform float uNatureWind; attribute float aWindWeight; varying vec3 vNaturePosition; varying float vNatureWeight;')
        .replace('#include <begin_vertex>', `${windCode}\nvNaturePosition = position; vNatureWeight = aWindWeight;`);
      if (item === material) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
          '#include <common>\nvarying vec3 vNaturePosition; varying float vNatureWeight;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            float grain = sin(vNaturePosition.x * 35. + sin(vNaturePosition.z * 29.)) * sin(vNaturePosition.y * 41.);
            float bark = step(.7, vNaturePosition.y) * (1. - step(.005, vNatureWeight));
            float stripe = step(.82, sin(vNaturePosition.y * 48. + sin(vNaturePosition.x * 18.) * 3.));
            diffuseColor.rgb *= 1. + grain * .07 - bark * stripe * .3;`);
      }
    };
    item.customProgramCacheKey = () => 'nature-wind-v1';
  }
  return { material, depth };
}
function colored(geometry: BufferGeometry, color: string, wind: number) {
  geometry.deleteAttribute('uv');
  const count = geometry.attributes.position.count, colors = new Float32Array(count * 3), weights = new Float32Array(count);
  const c = new Color(color), position = geometry.attributes.position;
  for (let i = 0; i < count; i++) { c.toArray(colors, i * 3); weights[i] = wind * Math.max(0, position.getY(i)); }
  geometry.setAttribute('color', new BufferAttribute(colors, 3)); geometry.setAttribute('aWindWeight', new BufferAttribute(weights, 1));
  if (!geometry.index) return geometry;
  const unindexed = geometry.toNonIndexed(); geometry.dispose(); return unindexed;
}
function merge(parts: BufferGeometry[]) {
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); return geometry;
}
export function treeGeometry(kind: number, far: boolean) {
  const parts: BufferGeometry[] = [];
  const height = kind === 1 ? 4.5 : 3.7;
  parts.push(colored(new CylinderGeometry(.09, .22, height, far ? 5 : 7).translate(0, height / 2, 0), kind === 1 ? '#b4b5a1' : '#544533', 0));
  const count = far ? 3 : kind === 2 ? 6 : 10;
  const random = randomSeed(251 + kind);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.4, radius = kind === 2 ? .3 : .5 + random() * .5;
    const scale = kind === 2 ? 1.3 - i * .15 : .65 + random() * .45;
    const y = kind === 2 ? 2 + i * .48 : height - .4 + random() * 1.1;
    const leaf = kind === 2
      ? new CylinderGeometry(0, scale, 1.8, far ? 5 : 7).translate(0, y, 0)
      : (far ? new IcosahedronGeometry(scale, 1) : new SphereGeometry(scale, 9, 7)).scale(1, kind === 1 ? 1.4 : .85, 1)
        .translate(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    parts.push(colored(leaf, kind === 0 ? (i % 2 ? '#426b36' : '#628944') : kind === 1 ? '#89a65b' : '#315f4d', .15));
    if (!far && kind !== 2) parts.push(colored(new CylinderGeometry(.025, .065, 1.4, 4)
      .rotateZ(Math.cos(angle) * .65).rotateX(Math.sin(angle) * .65).translate(0, y - .8, 0), '#635342', 0));
  }
  return merge(parts);
}
export function grassGeometry() {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      -.025, 0, 0, .025, 0, 0, -.014, .18, .025,
      .025, 0, 0, .014, .18, .025, -.014, .18, .025,
      -.014, .18, .025, .014, .18, .025, .02, .38 + i * .03, .075,
    ]), 3));
    geometry.computeVertexNormals(); geometry.rotateY(i * Math.PI / 3);
    parts.push(colored(geometry, i % 2 ? '#496b36' : '#66834a', 1));
  }
  return merge(parts);
}
export function flowerGeometry(kind: number) {
  const parts = [colored(new CylinderGeometry(.012, .016, .48, 4).translate(0, .24, 0), '#53783d', 1)];
  const colors = ['#ffe7ad', '#c3a2de', '#f6c4bb'];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    parts.push(colored(new IcosahedronGeometry(.072, 0).scale(1, .35, 1)
      .translate(Math.cos(a) * .065, .49, Math.sin(a) * .065), colors[kind], 1));
  }
  parts.push(colored(new IcosahedronGeometry(.04, 0).translate(0, .51, 0), '#c69532', 1));
  return merge(parts);
}
export function groundTextures() {
  // Texture tự sinh: không tải thêm ảnh, màu/normal/roughness cùng một hạt ngẫu nhiên.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!, data = context.createImageData(128, 128), random = randomSeed(551);
  const normalCanvas = document.createElement('canvas'); normalCanvas.width = normalCanvas.height = 128;
  const normalContext = normalCanvas.getContext('2d')!, normal = normalContext.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 215 + random() * 40;
    data.data.set([v, v, v, 255], i * 4);
    normal.data.set([120 + random() * 16, 120 + random() * 16, 250, 255], i * 4);
  }
  context.putImageData(data, 0, 0); normalContext.putImageData(normal, 0, 0);
  const map = new CanvasTexture(canvas), normalMap = new CanvasTexture(normalCanvas);
  map.colorSpace = SRGBColorSpace;
  for (const texture of [map, normalMap]) { texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(45, 45); texture.anisotropy = 4; }
  return { map, normalMap, normalScale: new Vector2(.2, .2) };
}
