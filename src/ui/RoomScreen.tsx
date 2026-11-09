import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { RoomSession } from '../network/RoomSession';
import type { Entry } from '../network/types';
import { RoomScene } from '../scene/RoomScene';
import { NetworkTestController } from '../player/PlayerController';
import { Participants, SocialPanel } from './SocialPanel';
import { TeaPanel } from './TeaPanel';
import { tableSeatBusy } from '../network/table';
import { VoicePanel } from './VoicePanel';
import { GraphicsController } from '../scene/nature/GraphicsController';
import { NaturePanel } from './NaturePanel';
import { ConnectionPanel } from './ConnectionPanel';
import { TouchControls } from './TouchControls';
import { useMobileRoom } from '../mobile/useMobileRoom';

export function RoomScreen({ peer, entry, onLeave }: { peer: string; entry: Entry; onLeave: () => void }) {
  // Effect tạo phiên mới ở mỗi lần setup, kể cả StrictMode chạy setup/cleanup hai lần.
  const [session, setSession] = useState<RoomSession | null>(null);
  useEffect(() => {
    const current = new RoomSession(peer, entry); setSession(current); void current.start();
    return () => current.stop();
  }, [peer, entry]);
  if (!session) return <p>Đang mở phòng…</p>;
  return <ConnectedRoom session={session} onLeave={onLeave} />;
}

function ConnectedRoom({ session, onLeave }: { session: RoomSession; onLeave: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [graphics] = useState(() => new GraphicsController());
  const [hud, setHud] = useState(() => !matchMedia('(max-width: 720px), (pointer: coarse)').matches);
  const handleBack = useCallback(() => {
    if (hud) setHud(false); else { void session.leave(); onLeave(); }
  }, [hud, session, onLeave]);
  useMobileRoom(session, handleBack);
  const host = state.room.host_peer_id;
  const itemBusy = Boolean(state.table && tableSeatBusy(state.table, session.peer, session.tableNow()));
  const networkOnly = import.meta.env.DEV && new URLSearchParams(location.search).get('networkTest') === '1';
  return (
    <main className="room-screen" data-hud={hud ? 'open' : 'closed'}>
      {networkOnly ? <NetworkTestController session={session} /> : <RoomScene session={session} graphics={graphics} />}
      {!networkOnly && <NaturePanel graphics={graphics} session={session} />}
      <button className="hud-toggle" data-testid="hud-toggle" aria-expanded={hud} aria-controls="room-menu" onClick={() => setHud(!hud)}>{hud ? 'Đóng' : 'Mở'} menu phòng</button>
      <aside id="room-menu" className="room-hud panel" hidden={!hud}>
        <button className="mobile-only room-menu-close" onClick={() => setHud(false)}>Đóng menu ✕</button>
        <h1>{state.room.name}</h1>
        <p>Host: <strong>{host ? state.room.members[host]?.display_name : 'Đang chọn'}</strong>{host === session.peer ? ' (bạn)' : ''}
          <span className="sr-only" data-testid="host-id">{host}</span></p>
        <span className="sr-only" data-testid="self-id">{session.peer}</span>
        {session.entry.invite_code && <p>Mã mời: <code data-testid="invite-code">{session.entry.invite_code}</code></p>}
        <p>Thành viên: <b data-testid="member-count">{Object.keys(state.room.members).length}</b> · Kết nối P2P: <b data-testid="connection-count">{state.connected.length}</b>/{Object.keys(state.room.members).length - 1}</p>
        <details><summary>Thống kê mạng</summary><p>Nhiệm kỳ host: {state.room.host_epoch} · Gói vị trí gửi/nhận: <span data-testid="pose-count">{state.sent}/{state.received}</span></p></details>
        <p>WASD / phím mũi tên để đi. Kéo chuột để đổi camera.</p>
        <ConnectionPanel session={session} />
        <VoicePanel session={session} />
        <div className="seats">{Array.from({ length: 8 }, (_, i) => (
          <button key={i} data-testid={`seat-${i}`} disabled={state.pending || !state.seats || state.expired || itemBusy}
            onClick={() => session.requestSeat(i)}>
            Ghế {i + 1}: {state.seats?.seats[i] ? state.seats.seats[i] === session.peer ? 'bạn' : 'đã có người' : 'trống'}
          </button>
        ))}</div>
        <button data-testid="stand" disabled={!state.seats || state.pending || state.expired || itemBusy} onClick={() => session.requestSeat(null)}>Đứng dậy</button>
        <button data-testid="leave" onClick={() => { void session.leave(); onLeave(); }}>Rời phòng</button>
        <TeaPanel session={session} />
        <p data-testid="snapshot" data-ready={Boolean(state.seats)} data-seats={JSON.stringify(state.seats?.seats ?? [])}>
          Snapshot: {state.seats ? `#${state.seats.revision}` : 'đang chờ host'}
        </p>
        <p role="status">{state.message}</p>
        <Participants session={session} />
      </aside>
      <div className={`chat-layer${hud ? ' hud-open' : ' hud-closed'}`}><SocialPanel session={session} /></div>
      <TouchControls session={session} enabled={!hud} />
    </main>
  );
}
