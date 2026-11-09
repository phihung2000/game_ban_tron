import { useEffect, useRef, useState } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { activeAction, cupBusy, cupMl, temperature } from '../network/table';
import type { TableKind } from '../network/table';

export function TeaPanel({ session }: { session: RoomSession }) {
  const state = session.getSnapshot(), table = state.table;
  const [sound, setSound] = useState(session.audio.enabled);
  const unlocked = useRef(false);
  useEffect(() => {
    let mounted = true;
    const unlock = (event: Event) => {
      if (unlocked.current || (event.target as HTMLElement)?.closest('[data-testid="sound-toggle"]')) return;
      void session.audio.enable().then(enabled => {
      if (!mounted) return;
      setSound(enabled);
      if (enabled) { unlocked.current = true; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); }
    }); };
    // Trình duyệt chỉ cho phát âm thanh sau thao tác thật của người dùng.
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { mounted = false; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [session]);
  if (!table) return <section className="tea-panel"><h2>Trà và bánh</h2><p>Chờ snapshot từ host. Nếu đã nhận snapshot ghế, hãy chạy supabase/phase4.sql rồi vào lại phòng.</p></section>;
  const seat = state.seats?.seats.indexOf(session.peer) ?? -1, now = session.tableNow();
  const cup = seat >= 0 ? table.cups[seat] : undefined, hand = seat >= 0 ? table.hands[seat] : null;
  const ml = cup ? cupMl(cup, now) : 0, heat = cup ? temperature(cup.heatC, cup.heatedAt, now) : 22;
  const busy = state.tablePending || state.expired || seat < 0 || Boolean(activeAction(table, session.peer, now));
  const potBusy = table.pot.busyUntil > now, ownCupBusy = cup ? cupBusy(cup, now) : true;
  const doAction = (kind: TableKind, target?: number) => session.requestTable(kind, target);
  return <section className="tea-panel" aria-label="Trà và bánh">
    <h2>Trà và bánh</h2>
    <p>Ấm: <b data-testid="pot-ml">{Math.round(table.pot.ml)}</b> ml · Bánh: <b data-testid="cake-count">{table.plate.cake}</b> · Kẹo: <b data-testid="candy-count">{table.plate.candy}</b></p>
    {seat < 0 ? <p>Chọn một ghế để dùng ly của mình và lấy bánh kẹo.</p> : <>
      <p>Ly của bạn: <b data-testid="cup-ml">{Math.round(ml)}</b>/200 ml · <span data-testid="cup-heat">{Math.round(heat)}°C</span>
        {' · '}{ml <= 0 ? 'ly trống' : heat > 55 ? 'nóng' : heat > 35 ? 'ấm' : 'nguội'}</p>
      <p>Đang cầm: <b data-testid="held-snack">{hand === 'cake' ? 'bánh' : hand === 'candy' ? 'kẹo' : 'không có'}</b></p>
    </>}
    <div className="tea-buttons">
      <button data-testid="tea-pour" disabled={busy || potBusy || ownCupBusy || ml >= 199.99 || table.pot.ml <= 0} onClick={() => doAction('pour')}>Rót vào ly mình</button>
      <button data-testid="tea-drink" disabled={busy || ownCupBusy || ml <= 0} onClick={() => doAction('drink')}>Uống trà</button>
      {[-1, 1].map((direction, index) => {
        const target = (seat + direction + 8) % 8, peer = state.seats?.seats[target];
        return <button key={direction} data-testid={`tea-offer-${index}`} disabled={busy || potBusy || !peer || cupBusy(table.cups[target], now)
          || cupMl(table.cups[target], now) >= 199.99 || table.pot.ml <= 0}
          onClick={() => doAction('offer', target)}>Mời {direction < 0 ? 'bên trái' : 'bên phải'}{peer ? ` · ${state.room.members[peer]?.display_name ?? 'khách'}` : ' · ghế trống'}</button>;
      })}
      <button data-testid="tea-dump" disabled={busy || ownCupBusy || ml <= 0} onClick={() => doAction('dump')}>Đổ bỏ trà</button>
      <button data-testid="take-cake" disabled={busy || Boolean(hand) || table.plate.cake <= 0} onClick={() => doAction('take-cake')}>Lấy bánh</button>
      <button data-testid="take-candy" disabled={busy || Boolean(hand) || table.plate.candy <= 0} onClick={() => doAction('take-candy')}>Lấy kẹo</button>
      <button data-testid="snack-eat" disabled={busy || !hand} onClick={() => doAction('eat')}>Ăn</button>
      <button data-testid="snack-throw" disabled={busy || !hand} onClick={() => doAction('throw')}>Vứt vào thùng</button>
      <button data-testid="sound-toggle" aria-pressed={sound} onClick={() => {
        if (session.audio.enabled) { unlocked.current = true; session.audio.mute(); setSound(false); }
        else void session.audio.enable().then(enabled => { if (enabled) unlocked.current = true; setSound(enabled); });
      }}>{sound ? 'Âm thanh: bật' : 'Bật âm thanh'}</button>
    </div>
    {state.tableRetry && <button data-testid="table-retry" onClick={() => session.retryTable()}>Thử lại yêu cầu vừa rồi</button>}
    <p data-testid="table-status" role="status">{state.tableMessage}</p>
    <output className="sr-only" data-testid="table-state" data-revision={state.seats?.revision}
      data-json={JSON.stringify(table)}>Trạng thái trà và bánh đã được host xác nhận.</output>
  </section>;
}
