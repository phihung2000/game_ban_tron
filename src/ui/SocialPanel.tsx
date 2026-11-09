import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { CHAT_LIMIT, EMOTES, EMOTE_LABELS, characterCount } from '../network/social';
import type { EmoteKind } from '../network/social';
import { ModerationActions } from './ModerationPanel';
import { Keyboard } from '@capacitor/keyboard';
import { nativePlatform } from '../mobile/platform';

export function SocialPanel({ session }: { session: RoomSession }) {
  const state = session.getSnapshot();
  const [text, setText] = useState(''), [error, setError] = useState('');
  const [emotesOpen, setEmotesOpen] = useState(false), input = useRef<HTMLInputElement>(null);
  const length = characterCount(text);
  const disabled = state.expired;
  function emote(kind: EmoteKind) { setError(session.sendEmote(kind) ?? ''); }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const index = ['1', '2', '3', '4'].indexOf(event.key);
      if (index >= 0) { event.preventDefault(); setError(session.sendEmote(EMOTES[index]) ?? ''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);
  return <section className="social-panel panel" aria-label="Chat và emote">
    <form onSubmit={event => {
      event.preventDefault(); const message = session.sendChat(text);
      setError(message ?? ''); if (!message) { setText(''); input.current?.focus({ preventScroll: true }); }
    }}>
      <label htmlFor="chat-input">Nhắn cho cả phòng <span>{length}/{CHAT_LIMIT}</span></label>
      <div className="chat-row">
        <input ref={input} id="chat-input" data-testid="chat-input" autoComplete="off" enterKeyHint="send" placeholder="Nhắn cho mọi người…"
          value={text} onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}
          aria-invalid={length > CHAT_LIMIT} disabled={disabled} />
        <button data-testid="chat-send" onPointerDown={event => event.preventDefault()} disabled={disabled || !text.trim() || length > CHAT_LIMIT}>Gửi</button>
        <button className="mobile-only emote-toggle" type="button" aria-label="Mở biểu cảm" aria-expanded={emotesOpen}
          onClick={() => setEmotesOpen(!emotesOpen)}>☺</button>
        <button className="keyboard-done" type="button" onClick={() => { input.current?.blur(); if (nativePlatform()) void Keyboard.hide(); }}>Xong</button>
      </div>
    </form>
    <div className="emote-buttons" data-open={emotesOpen} aria-label="Chọn emote">
      {EMOTES.map((kind, index) => <button key={kind} data-testid={`emote-${kind}`} disabled={disabled}
        onClick={() => emote(kind)} aria-keyshortcuts={String(index + 1)}>{index + 1} · {EMOTE_LABELS[kind]}</button>)}
    </div>
    <p className="social-error" data-testid="social-error" role="status">{error}</p>
    {state.connected.length < Object.keys(state.room.members).length - 1 && <small>Tin nhắn chỉ tới những người đang kết nối P2P với bạn.</small>}
    <div className="sr-only" aria-live="polite" data-testid="chat-messages">
      {Object.values(state.social.chats).flat().map(message => <p key={`${message.peer}:${message.id}`}
        data-peer={message.peer}>{state.room.members[message.peer]?.display_name}: {message.text}</p>)}
    </div>
  </section>;
}

export function Participants({ session }: { session: RoomSession }) {
  useSyncExternalStore(session.voice.subscribe, session.voice.getSnapshot);
  const state = session.getSnapshot();
  const members = Object.entries(state.room.members).sort((a, b) => a[1].join_order - b[1].join_order);
  return <details className="participants" open><summary>Người trong phòng ({members.length})</summary>
    <ul data-testid="participants">{members.map(([peer, member]) => <li key={peer} data-peer={peer}
      data-emote={state.social.emotes[peer]?.kind ?? ''} data-speaking={session.voice.isSpeaking(peer)}>
      <span>{member.display_name}{peer === session.peer ? ' (bạn)' : ''}{peer === state.room.host_peer_id ? ' · host' : ''}</span>
      <small>{state.social.emotes[peer] ? EMOTE_LABELS[state.social.emotes[peer].kind]
        : state.seats?.seats.includes(peer) ? 'Đang ngồi' : 'Đang đứng'}
        {' · '}{peer === session.peer || state.connected.includes(peer) ? 'Đã kết nối' : 'Đang kết nối'}
        {session.voice.isSpeaking(peer) ? ' · Đang nói' : ''}</small>
      {session.isBlocked(peer) && <small>Đã chặn trên máy bạn</small>}
      <ModerationActions session={session} peer={peer} />
    </li>)}</ul>
    <p data-testid="moderation-message" role="status">{state.moderationMessage}</p>
  </details>;
}
