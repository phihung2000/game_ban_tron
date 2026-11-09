import { useState, useSyncExternalStore } from 'react';
import type { RoomSession } from '../network/RoomSession';
import type { GraphicsController, GraphicsSettings, QualityMode } from '../scene/nature/GraphicsController';

const labels = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };
export function NaturePanel({ graphics, session }: { graphics: GraphicsController; session: RoomSession }) {
  const settings = useSyncExternalStore(graphics.subscribe, graphics.getSnapshot);
  const performance = useSyncExternalStore(graphics.subscribePerformance, graphics.getPerformance);
  const [audioError, setAudioError] = useState('');
  async function toggleSound() {
    if (settings.ambience) { graphics.update({ ambience: false }); return; }
    const ready = await session.ambience.enable(); setAudioError(session.ambience.error);
    graphics.update({ ambience: ready });
  }
  return <aside className="nature-panel panel" aria-label="Thiên nhiên và chất lượng">
    <details open={!matchMedia('(max-width: 720px), (pointer: coarse)').matches}>
      <summary>Thiên nhiên · <b data-testid="nature-fps">{performance.fps || '—'} FPS</b> · {labels[settings.quality]}</summary>
      <label>Chất lượng <select data-testid="nature-quality" value={settings.mode}
        onChange={event => graphics.update({ mode: event.target.value as QualityMode })}>
        <option value="auto">Tự chọn theo thiết bị</option><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option>
      </select></label>
      <label>Bầu trời <select data-testid="nature-time" value={settings.time}
        onChange={event => graphics.update({ time: event.target.value as GraphicsSettings['time'] })}>
        <option value="auto">Ngày đêm tự động · 20 phút</option><option value="day">Ban ngày</option><option value="night">Ban đêm</option>
      </select></label>
      <label>Thời tiết <select data-testid="nature-weather" value={settings.weather}
        onChange={event => graphics.update({ weather: event.target.value as GraphicsSettings['weather'] })}>
        <option value="auto">Tự động · mỗi 3 phút</option><option value="sunny">Nắng</option><option value="fog">Sương</option><option value="rain">Mưa nhẹ</option>
      </select></label>
      <button data-testid="ambience-toggle" aria-pressed={settings.ambience} onClick={() => void toggleSound()}>
        {settings.ambience ? 'Tắt' : 'Bật'} tiếng thiên nhiên
      </button>
      <label>Âm lượng <input aria-label="Âm lượng thiên nhiên" type="range" min="0" max="0.5" step="0.01"
        value={settings.volume} onChange={event => graphics.update({ volume: Number(event.target.value) })} /></label>
      {audioError && <p role="status">{audioError}</p>}
      <small data-testid="nature-metrics" data-quality={settings.quality} data-calls={performance.calls} data-triangles={performance.triangles}>
        {performance.calls} lượt vẽ · {(performance.triangles / 1000).toFixed(0)} nghìn tam giác
      </small>
      <small>Kéo để xoay; cuộn để tiến gần. WASD đi dạo. Mức Thấp dùng phản chiếu HDRI; Vừa/Cao phản chiếu cảnh.</small>
      {performance.slow && <div className="fps-advice" role="status" data-testid="fps-advice">
        Dưới 30 FPS: {settings.mode === 'auto' ? 'Auto sẽ hạ chất lượng khi chậm kéo dài.' : 'Hãy chọn Thấp hoặc Tự động.'}
        <ul><li>Giảm phản chiếu, bóng và mật độ cỏ bằng mức Thấp.</li>
          <li>Thu nhỏ cửa sổ, đóng tab 3D khác và bật tăng tốc phần cứng.</li>
          <li>Nếu nhiều người: giảm giới hạn voice xuống 8.</li></ul>
      </div>}
    </details>
  </aside>;
}
