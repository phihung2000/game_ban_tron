import { useState } from 'react';
import { configured, errorMessage, supabase } from '../network/supabase';

export function AuthScreen() {
  const [email, setEmail] = useState(''), [token, setToken] = useState('');
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }
  return (
    <main className="page"><section className="panel auth">
      <p className="eyebrow">BÀN TRÒN 3D</p><h1>Gặp nhau quanh bàn</h1>
      {!configured && <p role="alert">Hãy điền .env, chạy SQL rồi khởi động lại Vite.</p>}
      <button data-testid="anonymous" disabled={!configured || busy} onClick={() => void run(async () => {
        const { error } = await supabase.auth.signInAnonymously(); if (error) throw error;
      })}>Vào ẩn danh</button>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const { error } = await supabase.auth.signInWithOtp({ email }); if (error) throw error;
        setSent(true); setMessage('Đã gửi email. Nếu email chứa liên kết, có thể mở liên kết trong cùng trình duyệt.');
      }); }}>
        <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <button disabled={!configured || busy}>Gửi email đăng nhập</button>
      </form>
      {sent && <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' }); if (error) throw error;
      }); }}>
        <label>Mã OTP trong email (nếu có)<input value={token} onChange={event => setToken(event.target.value)} autoComplete="one-time-code" /></label>
        <button disabled={busy}>Xác nhận mã</button>
      </form>}
      <p role="status">{message}</p>
    </section></main>
  );
}
