import { useSyncExternalStore } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { VOICE_LIMITS } from '../audio/voicePolicy';
import type { VoiceLimit } from '../audio/voicePolicy';

export function VoicePanel({ session }: { session: RoomSession }) {
  const voice = session.voice;
  const state = useSyncExternalStore(voice.subscribe, voice.getSnapshot);
  return <section className="voice-panel" aria-label="Trò chuyện bằng giọng nói" data-testid="voice-panel"
    data-mic={state.mic} data-speaking={state.speaking} data-links={state.linkCount}
    data-connected={JSON.stringify(state.connected)} data-selected={JSON.stringify(state.selected)}>
    <h2>Giọng nói</h2>
    <div className="voice-buttons">
      <button data-testid="voice-mic" disabled={state.requesting} aria-pressed={state.mic} onClick={() => {
        if (state.mic) voice.muteMicrophone(); else void voice.enableMicrophone();
      }}>{state.mic ? 'Tắt mic' : 'Bật mic'}</button>
      <button data-testid="voice-listen" onClick={() => void voice.listen()}>{state.receiveBlocked ? 'Bật loa' : state.ready ? 'Đang nghe' : 'Chỉ nghe'}</button>
      {state.requesting && <button data-testid="voice-cancel" onClick={() => voice.muteMicrophone()}>Hủy xin mic</button>}
      {state.ready && <button data-testid="voice-leave" onClick={() => voice.leave()}>Rời voice</button>}
    </div>
    <label>Micro
      <select data-testid="voice-device" value={state.deviceId} disabled={state.requesting} onChange={event => void voice.changeDevice(event.target.value)}>
        <option value="default">Micro mặc định</option>
        {state.devices.filter(d => d.deviceId && d.deviceId !== 'default').map((device, index) =>
          <option key={device.deviceId} value={device.deviceId}>{device.label || `Micro ${index + 1}`}</option>)}
      </select>
    </label>
    <label>Giới hạn người nghe/nói cùng lúc<select data-testid="voice-limit" value={state.limit}
      onChange={event => voice.setLimit(Number(event.target.value) as VoiceLimit)}>
      {VOICE_LIMITS.map(limit => <option key={limit} value={limit}>{limit} người</option>)}
    </select></label>
    <p>{state.requesting ? 'Đang xin quyền micro…' : state.mic ? state.speaking ? 'Bạn đang nói' : 'Mic đang bật' : 'Mic đang tắt'}
      {' · '}Voice: <b data-testid="voice-count">{state.connected.length}</b>/{state.limit}</p>
    <meter data-testid="voice-level" min={0} max={1} value={state.level} aria-label="Mức âm lượng micro" />
    <p>Voice ↑ <b data-testid="voice-up">{state.voiceBandwidth.upKbps.toFixed(1)}</b> ↓ <b data-testid="voice-down">{state.voiceBandwidth.downKbps.toFixed(1)}</b> kb/s</p>
    <p>Dữ liệu P2P ↑ <b>{state.dataBandwidth.upKbps.toFixed(1)}</b> ↓ <b>{state.dataBandwidth.downKbps.toFixed(1)}</b> kb/s</p>
    <small>Bán kính nghe 12 m · Ưu tiên người cùng bàn · Tự ngắt người xa nhất</small>
    <small>Số đo WebRTC mỗi 2 giây, không gồm tải trang hoặc Supabase.</small>
    <p data-testid="voice-error" role="status">{state.message}</p>
  </section>;
}
