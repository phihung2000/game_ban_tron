import type { RoomSession } from '../network/RoomSession';

const labels = { connecting: 'Đang kết nối', connected: 'Đã kết nối', retrying: 'Đang thử lại', failed: 'Thất bại', limited: 'Tạm ngắt vì quá nhiều gói' };
export function ConnectionPanel({ session }: { session: RoomSession }) {
  const state = session.getSnapshot();
  const saved = state.room.checkpoint?.saved_at;
  return <details className="connection-panel" open={state.networkStatus !== 'online'}>
    <summary>Kết nối và phục hồi</summary>
    <p data-testid="network-status" data-status={state.networkStatus} role="status">{state.expired ? state.message
      : state.networkStatus === 'offline' ? 'Mất mạng. Chờ mạng trở lại để tự vào lại đúng phòng.'
      : state.networkStatus === 'recovering' ? state.message : 'Phiên phòng đang hoạt động.'}</p>
    <button data-testid="retry-connections" disabled={state.expired} onClick={() => session.retryConnections()}>Thử lại P2P và phòng</button>
    <small>WebRTC tự thử lại tối đa 5 lần, tăng dần thời gian chờ. Nếu vẫn thất bại, kiểm tra mạng và cấu hình TURN.</small>
    <ul data-testid="connection-states">{state.connectionStates.map(link => <li key={link.peer} data-peer={link.peer} data-state={link.state}>
      {state.room.members[link.peer]?.display_name ?? 'Người chơi'}: {labels[link.state]}{link.attempts ? ` (${link.attempts}/5)` : ''}
    </li>)}</ul>
    <p data-testid="checkpoint-info" data-saved-at={saved ?? ''}>
      {saved ? `Checkpoint: ${new Date(saved).toLocaleTimeString('vi-VN')}` : 'Chưa có checkpoint định kỳ.'}
      {' '}Host lưu mỗi 30 giây; ghế và trà/bánh được lưu ngay mỗi lần xác nhận.
    </p>
    {state.checkpointMessage && <p role="status">{state.checkpointMessage}</p>}
    <small>Rớt mạng quá 20 giây có thể mất ghế và quyền host. Vào lại phòng đầy sẽ chờ có chỗ trống.</small>
  </details>;
}
