export const WORLD_LIMIT = 32;
export const LAKE = { x: -14, z: -5, rx: 6, rz: 4.5, y: -0.08 };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t);
};
export function randomSeed(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function hashText(text: string) {
  let h = 2166136261; for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return h >>> 0;
}
export function lakeDistance(x: number, z: number) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
}
export function creekX(z: number) { return -13 + Math.sin((z + 9) * 0.19) * 2.2; }
export function creekDistance(x: number, z: number) {
  return z < -8 && z > -39 ? Math.abs(x - creekX(z)) : 100;
}
const trail = [[3, 34], [3, 15], [1, 7], [0, 0], [-5, -1], [-7, -5], [-7, -17], [-3, -32]];
export function trailDistance(x: number, z: number) {
  let distance = Infinity;
  for (let i = 1; i < trail.length; i++) {
    const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
    const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
  }
  return distance;
}
export function terrainHeight(x: number, z: number) {
  const radius = Math.hypot(x, z);
  const hills = (Math.sin(x * .15) * Math.cos(z * .13) * .65 + Math.sin(z * .26 + x * .1) * .18)
    * smooth(6, 14, radius) + smooth(28, 46, radius) * 2.4;
  const lake = 1 - smooth(.88, 1.15, lakeDistance(x, z));
  const creek = 1 - smooth(.55, 1.2, creekDistance(x, z));
  return hills * (1 - Math.max(lake, creek)) - lake * .65 - creek * .32;
}
export function canWalk(x: number, z: number) {
  return Math.abs(x) <= WORLD_LIMIT && Math.abs(z) <= WORLD_LIMIT
    && lakeDistance(x, z) > 1.08 && creekDistance(x, z) > 1.1;
}
export function canPlant(x: number, z: number) {
  return Math.hypot(x, z) > 5.4 && lakeDistance(x, z) > 1.12 && creekDistance(x, z) > 1.25 && trailDistance(x, z) > 1.2;
}
export type Weather = 'sunny' | 'fog' | 'rain';
export interface SkyState { time: number; daylight: number; sunY: number; weather: Weather; wind: number }
// Mọi máy tính cùng giờ từ đồng hồ phòng; chỉ là hàm thuần, không gửi gói mạng.
export function skyState(now: number, room: string, timeMode: string, weatherMode: string): SkyState {
  const seed = hashText(room);
  const phase = timeMode === 'day' ? .25 : timeMode === 'night' ? .75 : (now / 1_200_000 + seed / 4294967296) % 1;
  const sunY = Math.sin(phase * Math.PI * 2);
  const weather = weatherMode === 'auto'
    ? (['sunny', 'sunny', 'fog', 'rain'] as const)[hashText(`${seed}:${Math.floor(now / 180_000)}`) % 4]
    : weatherMode as Weather;
  return { time: now / 1000, daylight: smooth(-.18, .3, sunY), sunY, weather,
    wind: weather === 'rain' ? 1.1 : weather === 'fog' ? .3 : .65 };
}
