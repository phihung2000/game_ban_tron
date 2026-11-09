import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createRoom, joinRoom, listRooms } from '../network/roomApi';
import { errorMessage, supabase } from '../network/supabase';
import type { Entry, RoomListing } from '../network/types';

export function Lobby({ user, onEnter, recovery, onRecover, recoveryMessage }: { user: User; onEnter: (peer: string, entry: Entry) => void;
  recovery?: string; onRecover?: () => void; recoveryMessage?: string }) {
  const [name, setName] = useState('Khách'), [roomName, setRoomName] = useState('Bàn trà');
  const [isPrivate, setPrivate] = useState(false), [max, setMax] = useState(12), [code, setCode] = useState('');
  const [rooms, setRooms] = useState<RoomListing[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    try { setRooms(await listRooms()); } catch (error) { setMessage(errorMessage(error)); }
  }, []);
  useEffect(() => {
    let active = true;
    void supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (active && data) setName(data.display_name);
    });
    void refresh(); const timer = setInterval(() => void refresh(), 8000);
    return () => { active = false; clearInterval(timer); };
  }, [user.id, refresh]);

  async function enter(action: (peer: string) => Promise<Entry>) {
    setBusy(true); setMessage('');
    try {
      if (!name.trim()) throw new Error('Hãy nhập tên hiển thị');
      const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: name.trim() });
      if (error) throw error;
      const peer = crypto.randomUUID();
      const entry = await action(peer); onEnter(peer, entry);
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  return (
    <main className="page"><div className="lobby">
      <header><p className="eyebrow">BÀN TRÒN 3D</p><h1>Sảnh phòng</h1>
        <button onClick={() => void supabase.auth.signOut()}>Đăng xuất</button></header>
      {recovery && <section className="panel"><p>Phòng trước: {recovery}</p>
        <button data-testid="resume-room" onClick={onRecover}>Thử vào lại phòng trước</button></section>}
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      <section className="panel">
        <label>Tên hiển thị<input data-testid="display-name" maxLength={32} value={name} onChange={e => setName(e.target.value)} /></label>
      </section>
      <section className="panel"><h2>Tạo phòng</h2>
        <form onSubmit={e => { e.preventDefault(); void enter(peer => createRoom(peer, roomName, isPrivate, max)); }}>
          <label>Tên phòng<input data-testid="room-name" required maxLength={60} value={roomName} onChange={e => setRoomName(e.target.value)} /></label>
          <label>Số người tối đa<input type="number" min={2} max={30} value={max} onChange={e => setMax(Number(e.target.value))} /></label>
          <label className="inline"><input data-testid="private-room" type="checkbox" checked={isPrivate} onChange={e => setPrivate(e.target.checked)} />Phòng riêng tư</label>
          <button data-testid="create-room" disabled={busy}>Tạo và vào phòng</button>
        </form>
      </section>
      <section className="panel"><h2>Vào bằng mã mời</h2>
        <form onSubmit={e => { e.preventDefault(); void enter(peer => joinRoom(peer, null, code.trim())); }}>
          <input data-testid="invite-input" aria-label="Mã mời" required value={code} onChange={e => setCode(e.target.value)} />
          <button data-testid="join-code" disabled={busy}>Vào phòng</button>
        </form>
      </section>
      <section className="panel"><h2>Phòng công khai</h2><button onClick={() => void refresh()}>Làm mới</button>
        {rooms.length === 0 && <p>Chưa có phòng công khai đang hoạt động.</p>}
        {rooms.map(room => <div className="room-row" key={room.id}>
          <span>{room.name} · tối đa {room.max_players} người</span>
          <button disabled={busy} onClick={() => void enter(peer => joinRoom(peer, room.id, null))}>Tham gia</button>
        </div>)}
      </section>
      <p role="status">{message}</p>
    </div></main>
  );
}
