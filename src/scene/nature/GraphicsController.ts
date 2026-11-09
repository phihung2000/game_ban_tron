export type Quality = 'low' | 'medium' | 'high';
export type QualityMode = Quality | 'auto';
export interface GraphicsSettings {
  mode: QualityMode; quality: Quality; weather: 'auto' | 'sunny' | 'fog' | 'rain';
  time: 'auto' | 'day' | 'night'; ambience: boolean; volume: number;
}
export const QUALITY = {
  low: { dpr: 1, shadows: 0, trees: 66, grass: 2400, flowers: 160, segments: 72, reflection: 0, reflectionEvery: 1, range: 23, rain: 250, wildlife: 12 },
  medium: { dpr: 1.25, shadows: 1024, trees: 114, grass: 7200, flowers: 320, segments: 104, reflection: 256, reflectionEvery: 4, range: 34, rain: 600, wildlife: 24 },
  high: { dpr: 1.75, shadows: 2048, trees: 174, grass: 14400, flowers: 520, segments: 144, reflection: 512, reflectionEvery: 2, range: 48, rain: 1100, wildlife: 40 },
} as const;
export function detectQuality(device: { memory?: number; cores: number; mobile: boolean; pixels: number }): Quality {
  if (device.mobile || (device.memory ?? 8) <= 4 || device.cores <= 4) return 'low';
  if ((device.memory ?? 8) >= 8 && device.cores >= 8 && device.pixels < 5_000_000) return 'high';
  return 'medium';
}
export interface PerformanceSample { fps: number; calls: number; triangles: number; slow: boolean }
export class GraphicsController {
  private settings: GraphicsSettings;
  private performance: PerformanceSample = { fps: 0, calls: 0, triangles: 0, slow: false };
  private listeners = new Set<() => void>();
  private perfListeners = new Set<() => void>();
  private slowSeconds = 0;
  private samples = 0;
  private cooldown = 0;
  constructor() {
    const nav = typeof navigator === 'undefined' ? undefined : navigator as Navigator & { deviceMemory?: number };
    const detected = detectQuality({ memory: nav?.deviceMemory, cores: nav?.hardwareConcurrency ?? 4,
      mobile: nativePlatform() || typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
      pixels: typeof screen === 'undefined' ? 1_000_000 : screen.width * screen.height * (globalThis.devicePixelRatio || 1) ** 2 });
    let saved: Partial<GraphicsSettings> = {};
    try { const value = JSON.parse(localStorage.getItem('ban-tron-nature-v1') || '{}'); if (value && typeof value === 'object') saved = value; } catch { /* Chế độ riêng tư có thể chặn storage. */ }
    const mode = ['auto', 'low', 'medium', 'high'].includes(saved.mode ?? '') ? saved.mode! : 'auto';
    this.settings = { mode, quality: mode === 'auto' ? detected : mode,
      weather: ['auto', 'sunny', 'fog', 'rain'].includes(saved.weather ?? '') ? saved.weather! : 'auto',
      time: ['auto', 'day', 'night'].includes(saved.time ?? '') ? saved.time! : 'auto', ambience: saved.ambience === true,
      volume: typeof saved.volume === 'number' ? Math.max(0, Math.min(.5, saved.volume)) : .16 };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribePerformance = (listener: () => void) => { this.perfListeners.add(listener); return () => { this.perfListeners.delete(listener); }; };
  getSnapshot = () => this.settings;
  getPerformance = () => this.performance;
  update(patch: Partial<Omit<GraphicsSettings, 'quality'>>) {
    this.settings = { ...this.settings, ...patch };
    if (patch.mode && patch.mode !== 'auto') this.settings.quality = patch.mode;
    this.slowSeconds = 0;
    try { localStorage.setItem('ban-tron-nature-v1', JSON.stringify(this.settings)); } catch { /* Không bắt buộc storage. */ }
    this.listeners.forEach(listener => listener());
  }
  report(fps: number, calls: number, triangles: number) {
    this.samples++; this.cooldown = Math.max(0, this.cooldown - 1);
    this.slowSeconds = fps < 30 ? this.slowSeconds + 1 : Math.max(0, this.slowSeconds - 2);
    this.performance = { fps: Math.round(fps), calls, triangles, slow: this.slowSeconds >= 3 };
    this.perfListeners.forEach(listener => listener());
    // Đợi biên dịch shader lúc mới vào; chỉ tự hạ khi Auto, không đổi lựa chọn tay.
    if (this.settings.mode === 'auto' && this.samples > 5 && this.slowSeconds >= 5 && !this.cooldown && fps < 27) {
      const next = this.settings.quality === 'high' ? 'medium' : 'low';
      if (next !== this.settings.quality) {
        this.settings = { ...this.settings, quality: next }; this.cooldown = 12; this.slowSeconds = 0;
        this.listeners.forEach(listener => listener());
      }
    }
  }
}
import { nativePlatform } from '../../mobile/platform';

