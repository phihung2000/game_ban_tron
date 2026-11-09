import { useState } from 'react';
import type { RoomSession } from '../network/RoomSession';
import { REPORT_REASONS } from '../network/moderation';
import type { ReportReason } from '../network/moderation';

export function ModerationActions({ session, peer }: { session: RoomSession; peer: string }) {
  const state = session.getSnapshot();
  const [reporting, setReporting] = useState(false), [confirmKick, setConfirmKick] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam'), [details, setDetails] = useState('');
  if (peer === session.peer) return null;
  const disabled = state.expired || state.moderationBusy;
  return <div className="moderation-actions">
    <div className="moderation-buttons">
      <button data-testid={`mute-peer-${peer}`} aria-pressed={session.isMuted(peer)} disabled={disabled || session.isBlocked(peer)}
        onClick={() => session.setModeration(peer, 'muted', !session.isMuted(peer))}>{session.isMuted(peer) ? 'Bỏ tắt tiếng' : 'Tắt tiếng'}</button>
      <button data-testid={`block-peer-${peer}`} aria-pressed={session.isBlocked(peer)} disabled={disabled}
        onClick={() => session.setModeration(peer, 'blocked', !session.isBlocked(peer))}>{session.isBlocked(peer) ? 'Bỏ chặn' : 'Chặn'}</button>
      <button data-testid={`report-peer-${peer}`} disabled={disabled} onClick={() => setReporting(!reporting)}>Báo cáo</button>
      {state.room.host_peer_id === session.peer && <button data-testid={`kick-peer-${peer}`} disabled={disabled}
        onClick={() => setConfirmKick(!confirmKick)}>Mời ra</button>}
    </div>
    {confirmKick && <div className="kick-confirm">
      <p>Mời người này ra và chặn tài khoản này vào lại phòng?</p>
      <button data-testid={`confirm-kick-${peer}`} disabled={disabled} onClick={() => { setConfirmKick(false); void session.kick(peer); }}>Xác nhận mời ra</button>
      <button onClick={() => setConfirmKick(false)}>Hủy</button>
    </div>}
    {reporting && <form className="report-form" onSubmit={event => {
      event.preventDefault(); void session.report(peer, reason, details).then(sent => { if (sent) { setReporting(false); setDetails(''); } });
    }}>
      <label>Lý do<select aria-label={`Lý do báo cáo ${peer}`} data-testid={`report-reason-${peer}`} value={reason}
        onChange={event => setReason(event.target.value as ReportReason)}>
        {Object.entries(REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Mô tả (tối đa 500 ký tự)<textarea data-testid={`report-details-${peer}`} maxLength={500}
        value={details} onChange={event => setDetails(event.target.value)} /></label>
      <button data-testid={`submit-report-${peer}`} disabled={disabled}>Gửi báo cáo</button>
      <button type="button" onClick={() => setReporting(false)}>Hủy</button>
    </form>}
  </div>;
}
