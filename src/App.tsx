import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { configured, errorMessage, RpcError, supabase } from './network/supabase';
import type { Entry } from './network/types';
import { AuthScreen } from './ui/AuthScreen';
import { Lobby } from './ui/Lobby';
import { RoomScreen } from './ui/RoomScreen';
import { forgetRoom, readRecovery, rememberRoom } from './network/recovery';
import { resumeRoom } from './network/roomApi';
import { useMobileViewport } from './mobile/viewport';

export default function App() {
  useMobileViewport();
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(configured);
  const [entry, setEntry] = useState<{ peer: string; value: Entry } | null>(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (!configured) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.message);
      setUser(data.session?.user ?? null); setLoading(false);
    }).catch(error => { if (active) { setError(errorMessage(error)); setLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null); setLoading(false);
      if (!session) { forgetRoom(); setEntry(null); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    const ticket = readRecovery(user.id); if (!ticket) return;
    let active = true; setRestoring(true);
    void resumeRoom(ticket.room, ticket.peer, ticket.token).then(value => {
      if (!active) return;
      const restored = { ...value, invite_code: ticket.code }; rememberRoom(ticket.peer, restored);
      setEntry({ peer: ticket.peer, value: restored }); setError('');
    }).catch(error => {
      if (!active) return;
      if (error instanceof RpcError && ['P7002', 'P7003'].includes(error.code)) forgetRoom();
      setError(errorMessage(error));
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [user?.id]);
  async function recover() {
    if (!user) return;
    const ticket = readRecovery(user.id); if (!ticket) return;
    setRestoring(true);
    try {
      const value = await resumeRoom(ticket.room, ticket.peer, ticket.token);
      const restored = { ...value, invite_code: ticket.code }; rememberRoom(ticket.peer, restored);
      setEntry({ peer: ticket.peer, value: restored }); setError('');
    } catch (error) {
      if (error instanceof RpcError && ['P7002', 'P7003'].includes(error.code)) forgetRoom();
      setError(errorMessage(error));
    } finally { setRestoring(false); }
  }
  if (loading) return <p className="page">Đang kiểm tra đăng nhập…</p>;
  if (!user) return <><AuthScreen />{error && <p role="alert">{error}</p>}</>;
  if (restoring) return <p className="page" role="status">Đang phục hồi phòng trước…</p>;
  if (entry) return <RoomScreen peer={entry.peer} entry={entry.value} onLeave={() => setEntry(null)} />;
  return <Lobby user={user} recovery={readRecovery(user.id)?.name} onRecover={() => void recover()} recoveryMessage={error}
    onEnter={(peer, value) => { rememberRoom(peer, value); setEntry({ peer, value }); setError(''); }} />;
}
