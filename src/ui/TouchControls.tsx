import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { joystickAxes } from '../player/touchInput';

export function TouchControls({ session, enabled }: { session: RoomSession; enabled: boolean }) {
  const pointer = useRef<number | null>(null), center = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const state = session.getSnapshot();
  const voice = useSyncExternalStore(session.voice.subscribe, session.voice.getSnapshot);
  const disabled = !enabled || state.expired || !state.seats || state.seats.seats.includes(session.peer);
  const reset = () => { pointer.current = null; session.touch.reset(); setKnob({ x: 0, y: 0 }); };
  useEffect(() => {
    const stop = () => { pointer.current = null; session.touch.reset(); setKnob({ x: 0, y: 0 }); };
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement)?.matches('input,textarea,select')) stop(); };
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', stop);
    document.addEventListener('focusin', focus);
    return () => { window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', stop); document.removeEventListener('focusin', focus); session.touch.reset(); };
  }, [session]);
  useEffect(() => { if (disabled) reset(); }, [disabled]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current !== event.pointerId || disabled) return;
    event.preventDefault(); event.stopPropagation();
    const axes = joystickAxes(event.clientX - center.current.x, event.clientY - center.current.y);
    session.touch.set(axes.x, axes.z); setKnob({ x: axes.x * 38, y: axes.z * 38 });
  }
  return <div className="touch-controls" data-testid="touch-controls">
    <div className={`joystick${disabled ? ' disabled' : ''}`} role="group" aria-label="Joystick di chuyển" data-testid="joystick"
      onPointerDown={event => {
        if (disabled || pointer.current !== null || event.button !== 0) return;
        const bounds = event.currentTarget.getBoundingClientRect(); center.current = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event);
      }} onPointerMove={move} onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={reset}>
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span className="joystick-label">{state.expired ? 'Hết phiên' : !state.seats ? 'Đang kết nối' : disabled ? 'Đang ngồi' : 'Di chuyển'}</span>
    </div>
    <small className="touch-hint">Chạm ghế để ngồi · Kéo cảnh để xoay</small>
    <div className="touch-actions">
      {state.seats?.seats.includes(session.peer) && <button data-testid="touch-stand" disabled={state.pending || state.expired}
        onClick={() => session.requestSeat(null)}>Đứng dậy</button>}
      <button data-testid="touch-mic" disabled={voice.requesting || state.expired} aria-pressed={voice.mic}
        onClick={() => { if (voice.mic) session.voice.muteMicrophone(); else void session.voice.enableMicrophone(); }}>
        {voice.mic ? 'Tắt mic' : 'Bật mic'}
      </button>
    </div>
  </div>;
}
