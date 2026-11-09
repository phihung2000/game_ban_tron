import { PoseBuffer } from '../player/PoseBuffer';
import { Mesh } from './Mesh';
import { commitSeats, commitTable, kickMember, resumeRoom, saveCheckpoint, submitReport, syncRoom } from './roomApi';
import { decideSeat, seatPosition } from './seats';
import { errorMessage, RpcError } from './supabase';
import { validPose, validSnapshot } from './types';
import type { Entry, Pose, PosePacket, Room, RoomEvent, Snapshot } from './types';
import { CHAT_LIFETIME, CHAT_LIMIT, EMOTE_DURATION, characterCount, cleanChat, isEmote, SocialState } from './social';
import type { EmoteKind, SocialEvent, SocialView } from './social';
import { activeAction, decideTable, tableSeatBusy } from './table';
import type { TableKind, TableRequest, TableState } from './table';
import { InteractionAudio } from '../audio/InteractionAudio';
import { VoiceManager } from '../audio/VoiceManager';
import { AmbientAudio } from '../audio/AmbientAudio';
import { LocalModeration } from './moderation';
import type { ReportReason } from './moderation';
import { forgetRoom, rememberRoom } from './recovery';
import { HostWorkQueue, TrafficGate } from './rateLimit';
import type { PeerConnectionStatus } from './retry';
import { TouchInput } from '../player/touchInput';

type View = { room: Room; seats: Snapshot | null; connected: string[]; message: string;
  pending: boolean; sent: number; received: number; expired: boolean; social: SocialView;
  table: TableState | null; tablePending: boolean; tableMessage: string; tableRetry: boolean; tableTime: number;
  networkStatus: 'online' | 'offline' | 'recovering' | 'removed' | 'error'; connectionStates: PeerConnectionStatus[];
  moderationVersion: number; moderationMessage: string; moderationBusy: boolean; checkpointMessage: string };

export class RoomSession {
  private listeners = new Set<() => void>();
  private view: View;
  private mesh: Mesh;
  private stopped = false;
  private syncing = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private tick?: ReturnType<typeof setInterval>;
  private hostQueue = new HostWorkQueue(error => this.patch({ message: errorMessage(error), tableMessage: errorMessage(error) }));
  private pending?: { id: string; timer: ReturnType<typeof setTimeout> };
  private seq = 0;
  private sent = 0;
  private received = 0;
  private lastPose = '';
  private lastAnimation = '';
  private syncSerial = 0;
  private social = new SocialState();
  private pendingSocial = new Map<string, { event: SocialEvent; receivedAt: number }[]>();
  private clockBase = { time: Date.now(), local: performance.now() };
  private clockTick = 0;
  private tableSeq = 0;
  private tableRequest?: TableRequest;
  private tableTimer?: ReturnType<typeof setTimeout>;
  private heardActions = new Set<string>();
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private checkpointBusy = false;
  private syncFailures = 0;
  private nextSyncAt = 0;
  private moderation: LocalModeration;
  private localGate = new TrafficGate();
  private instance = crypto.randomUUID();
  private poseInstances = new Map<string, string>();
  readonly audio = new InteractionAudio();
  readonly touch = new TouchInput();
  readonly ambience = new AmbientAudio();
  readonly voice: VoiceManager;
  readonly poses = new Map<string, PoseBuffer>();
  localPose: Pose;

  constructor(readonly peer: string, readonly entry: Entry) {
    const order = entry.room.members[peer].join_order;
    this.moderation = new LocalModeration(entry.room.members[peer].user_id);
    this.localPose = { x: Math.sin(order * 2.4) * 5, z: Math.cos(order * 2.4) * 5, yaw: 0, animation: 'idle' };
    const restored = entry.room.checkpoint?.poses[peer];
    if (validPose(restored)) this.localPose = { ...restored };
    this.view = { room: entry.room, seats: null, connected: [], message: 'Đang kết nối P2P…',
      pending: false, sent: 0, received: 0, expired: false, social: this.social.view,
      table: null, tablePending: false, tableMessage: '', tableRetry: false, tableTime: entry.room.server_time ?? Date.now(),
      networkStatus: 'online', connectionStates: [], moderationVersion: 0, moderationMessage: '', moderationBusy: false, checkpointMessage: '' };
    this.setTableClock(entry.room.server_time ?? Date.now(), true);
    this.mesh = new Mesh(entry.room.id, peer, (id, event) => this.event(id, event),
      (id, packet) => this.receivePose(id, packet), () => this.connections(),
      message => this.patch({ message }), id => this.sendPose(id));
    this.voice = new VoiceManager(peer, {
      send: (id, event) => this.mesh.send(id, event), broadcast: event => this.mesh.broadcast(event),
      dataBandwidth: () => this.mesh.bandwidth(), muted: id => this.isMuted(id), blocked: id => this.isBlocked(id), world: () => {
        const seats = this.view.seats?.seats ?? this.view.room.snapshot.seats;
        const connected = new Set(this.mesh.connected()), ownSeat = seats.indexOf(this.peer);
        return { self: ownSeat >= 0 ? seatPosition(ownSeat) : this.localPose, seated: ownSeat >= 0,
          people: Object.keys(this.view.room.members).filter(id => id !== this.peer).map(id => {
            const seat = seats.indexOf(id);
            return { id, seated: seat >= 0, position: seat >= 0 ? seatPosition(seat) : this.poses.get(id)?.sample() ?? null,
              ready: false, mic: false, connected: connected.has(id) && !this.isBlocked(id) };
          }) };
      },
    });
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.view;
  private patch(next: Partial<View>) {
    if (this.stopped) return;
    this.view = { ...this.view, ...next, sent: this.sent, received: this.received };
    for (const listener of this.listeners) listener();
  }

  async start() {
    try {
      rememberRoom(this.peer, this.entry);
      this.applyRoom(this.entry.room);
      window.addEventListener('online', this.online); window.addEventListener('offline', this.offline);
      this.checkpointTimer = setInterval(() => { void this.checkpoint(); }, 30000);
      this.voice.start();
      this.heartbeat = setInterval(() => { void this.sync(); }, 4000);
      await this.mesh.start();
      if (this.stopped || this.view.expired) return;
      this.mesh.update(Object.keys(this.view.room.members).filter(id => id !== this.peer));
      this.connections();
      this.tick = setInterval(() => {
        this.sendPose();
        this.clockTick++;
        if (this.clockTick % 5 === 0) this.patch({ tableTime: this.tableNow() });
        if (this.clockTick % 10 === 0 && this.view.room.host_peer_id === this.peer) {
          this.mesh.broadcast({ type: 'table-clock', epoch: this.view.room.host_epoch, now: this.tableNow() });
        }
        if (this.social.prune(Object.keys(this.view.room.members))) this.patch({ social: this.social.view });
        if (this.clockTick % 20 === 0 && !this.view.seats && this.view.room.host_peer_id) this.mesh.send(this.view.room.host_peer_id, { type: 'hello' });
      }, 100);
    } catch (error) { this.patch({ message: errorMessage(error) }); }
  }

  private applyRoom(room: Room) {
    const old = this.view.room;
    // Một RPC cũ không được ghi đè kết quả commit snapshot mới hơn.
    if (room.host_epoch < old.host_epoch) return;
    if (room.host_epoch === old.host_epoch && room.snapshot.revision < old.snapshot.revision) room.snapshot = old.snapshot;
    const changed = old.host_epoch !== room.host_epoch;
    this.patch({ room, ...(changed ? { seats: null, message: 'Đã chuyển host, đang nhận snapshot…' } : {}) });
    if (changed || !this.poses.size) this.restorePoses(room);
    if (room.host_peer_id === this.peer) {
      if (Number.isFinite(room.server_time)) this.setTableClock(room.server_time!, changed);
      this.acceptSnapshot(room.snapshot);
      this.mesh.broadcast({ type: 'snapshot', epoch: room.host_epoch, snapshot: room.snapshot, hostTime: this.tableNow() });
    } else if (changed && room.host_peer_id) this.mesh.send(room.host_peer_id, { type: 'hello' });
    for (const id of this.poses.keys()) if (!room.members[id]) this.poses.delete(id);
    for (const id of this.poseInstances.keys()) if (!room.members[id]) this.poseInstances.delete(id);
    this.mesh.update(Object.keys(room.members).filter(id => id !== this.peer));
    this.connections();
    // Peer có thể kết nối trước khi heartbeat mang danh sách thành viên mới về.
    // Hỏi lại mẫu vị trí sau khi nhận metadata, kể cả người mới đang đứng yên.
    for (const id of Object.keys(room.members)) {
      if (id !== this.peer && !old.members[id]) this.mesh.send(id, { type: 'hello' });
    }
    // Kết nối có thể mở trước khi REST xác nhận người mới; giữ gói ngắn hạn rồi xác minh.
    let socialChanged = false;
    for (const [peer, queued] of this.pendingSocial) {
      const fresh = queued.filter(item => performance.now() - item.receivedAt < CHAT_LIFETIME);
      if (room.members[peer]) {
        for (const item of fresh) {
          if (item.event.type === 'emote' && (!isEmote(item.event.kind)
            || performance.now() - item.receivedAt >= EMOTE_DURATION[item.event.kind])) continue;
          if (!this.isBlocked(peer) && this.social.accept(peer, item.event, item.receivedAt)) socialChanged = true;
        }
        this.pendingSocial.delete(peer);
      } else if (fresh.length) this.pendingSocial.set(peer, fresh);
      else this.pendingSocial.delete(peer);
    }
    if (socialChanged) this.patch({ social: this.social.view });
  }

  private online = () => { this.nextSyncAt = 0; void this.sync(true); };
  private offline = () => this.patch({ networkStatus: 'offline', message: 'Mất mạng. Giữ phòng hiện tại; sẽ tự phục hồi khi có mạng.' });
  private async sync(force = false) {
    if (this.stopped || this.syncing || this.view.expired || !force && Date.now() < this.nextSyncAt) return;
    if (!navigator.onLine) { this.offline(); return; }
    this.syncing = true;
    const serial = ++this.syncSerial;
    try {
      let room: Room;
      try { room = await syncRoom(this.view.room.id, this.peer); }
      catch (error) {
        if (!(error instanceof RpcError) || error.code !== 'P7001' || !this.entry.recovery_token) throw error;
        this.patch({ networkStatus: 'recovering', message: 'Phiên hết hạn; đang vào lại đúng phòng…' });
        const recovered = await resumeRoom(this.view.room.id, this.peer, this.entry.recovery_token);
        rememberRoom(this.peer, { ...recovered, invite_code: this.entry.invite_code }); room = recovered.room;
      }
      if (!this.stopped && serial === this.syncSerial) {
        const recovering = this.view.networkStatus !== 'online';
        this.syncFailures = 0; this.nextSyncAt = 0; this.patch({ networkStatus: 'online' }); this.applyRoom(room);
        if (recovering) this.mesh.retryFailed();
      }
    } catch (error) {
      if (this.stopped) return;
      const permanent = error instanceof RpcError && ['P7002', 'P7003'].includes(error.code);
      if (permanent || error instanceof RpcError && error.code === 'P7001' && !this.entry.recovery_token) {
        forgetRoom(); this.patch({ expired: true, networkStatus: permanent ? 'removed' : 'error', message: errorMessage(error) });
        this.voice.stop(); this.ambience.close(); this.mesh.stop(); clearInterval(this.tick); clearInterval(this.heartbeat); clearInterval(this.checkpointTimer);
      } else {
        this.syncFailures++; this.nextSyncAt = Date.now() + Math.min(30000, 2000 * 2 ** Math.min(4, this.syncFailures - 1));
        this.patch({ networkStatus: 'recovering', message: `Đang thử phục hồi phòng: ${errorMessage(error)}` });
      }
    } finally { this.syncing = false; }
  }
  retryConnections() {
    this.nextSyncAt = 0;
    void this.sync(true).then(() => { if (!this.stopped && !this.view.expired && this.view.networkStatus === 'online') this.mesh.retryFailed(); });
  }
  private restorePoses(room: Room) {
    for (const [id, pose] of Object.entries(room.checkpoint?.poses ?? {})) {
      if (id === this.peer || !room.members[id] || this.poses.has(id) || !validPose(pose)) continue;
      const buffer = new PoseBuffer(); buffer.push(0, pose); this.poses.set(id, buffer);
    }
  }
  private async checkpoint() {
    if (this.stopped || this.view.expired || this.checkpointBusy || this.view.room.host_peer_id !== this.peer || !navigator.onLine) return;
    this.checkpointBusy = true;
    const poses: Record<string, Pose> = { [this.peer]: { ...this.localPose } };
    for (const [id, buffer] of this.poses) { const pose = buffer.sample(); if (pose && this.view.room.members[id]) poses[id] = pose; }
    try {
      const room = await saveCheckpoint(this.view.room, this.peer, poses);
      if (!this.stopped) { this.applyRoom(room); this.patch({ checkpointMessage: '' }); }
    } catch (error) { this.patch({ checkpointMessage: `Chưa lưu được checkpoint: ${errorMessage(error)}. Sẽ thử ở lượt 30 giây tiếp theo.` }); }
    finally { this.checkpointBusy = false; }
  }
  isBlocked(peer: string) { const user = this.view.room.members[peer]?.user_id; return peer !== this.peer && Boolean(user && this.moderation.get(user).blocked); }
  isMuted(peer: string) { const user = this.view.room.members[peer]?.user_id; const flags = user && this.moderation.get(user); return peer !== this.peer && Boolean(flags && (flags.muted || flags.blocked)); }
  setModeration(peer: string, field: 'muted' | 'blocked', value: boolean) {
    const user = this.view.room.members[peer]?.user_id; if (!user || peer === this.peer) return;
    this.moderation.set(user, field, value);
    if (field === 'blocked' && value) for (const [id, member] of Object.entries(this.view.room.members)) {
      if (member.user_id === user) { this.social.forget(id); this.pendingSocial.delete(id); }
    }
    this.patch({ moderationVersion: this.view.moderationVersion + 1, social: this.social.view }); this.voice.refresh();
  }
  async report(peer: string, reason: ReportReason, details: string) {
    if (this.view.moderationBusy || this.view.expired || details.length > 500) return false;
    this.patch({ moderationBusy: true, moderationMessage: '' });
    try { await submitReport(this.view.room.id, this.peer, peer, reason, details);
      this.patch({ moderationMessage: 'Đã ghi báo cáo. Báo cáo sẽ được xem trong Supabase; không tự động xử phạt người chơi.' }); return true;
    } catch (error) { this.patch({ moderationMessage: errorMessage(error) }); return false; }
    finally { this.patch({ moderationBusy: false }); }
  }
  async kick(peer: string) {
    if (this.view.moderationBusy || this.view.expired || this.view.room.host_peer_id !== this.peer) return;
    this.patch({ moderationBusy: true, moderationMessage: '' });
    try {
      const room = await kickMember(this.view.room, this.peer, peer);
      this.applyRoom(room); this.mesh.broadcast({ type: 'membership-refresh' });
      this.patch({ moderationMessage: 'Đã mời người chơi ra khỏi phòng.' });
    } catch (error) { this.patch({ moderationMessage: errorMessage(error) }); }
    finally { this.patch({ moderationBusy: false }); }
  }

  private connections() {
    const connected = this.mesh.connected();
    const previous = new Set(this.view.connected);
    this.patch({ connected, connectionStates: this.mesh.status(), ...(this.view.networkStatus === 'online' && !this.view.expired ? { message: connected.length === Object.keys(this.view.room.members).length - 1
      ? 'Các kết nối P2P đã sẵn sàng.' : 'Đang kết nối P2P…' } : {}) });
    for (const peer of connected) if (!previous.has(peer)) this.mesh.send(peer, { type: 'hello' });
    this.voice?.refresh();
  }

  private event(peer: string, event: RoomEvent) {
    if (this.stopped || this.view.expired || !event || typeof event !== 'object') return;
    if (peer === this.peer && !this.localGate.allow(peer, event.type, JSON.stringify(event).length)) return;
    const room = this.view.room;
    if (!room.members[peer]) {
      if ((event.type === 'chat' || event.type === 'emote') && (this.pendingSocial.has(peer) || this.pendingSocial.size < 30)) {
        const queued = this.pendingSocial.get(peer) ?? [];
        this.pendingSocial.set(peer, [...queued, { event, receivedAt: performance.now() }].slice(-8));
      }
      void this.sync(); return;
    }
    if (event.type === 'membership-refresh') { if (peer === room.host_peer_id) void this.sync(true); return; }
    if (this.isBlocked(peer) && (event.type === 'chat' || event.type === 'emote')) return;
    if (event.type === 'voice-status' || event.type === 'voice-signal') {
      this.voice.receive(peer, event);
    } else if (event.type === 'table-clock') {
      if (peer === room.host_peer_id && event.epoch === room.host_epoch && Number.isFinite(event.now)) this.setTableClock(event.now);
    } else if (event.type === 'table-request') {
      if (typeof event.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(event.requestId)) return;
      if (room.host_peer_id === this.peer && !this.hostQueue.submit(peer, () => this.arbitrateTable(peer, event))) {
        const result: RoomEvent = { type: 'table-result', requestId: event.requestId, accepted: false, message: 'Host đang bận; hãy chờ rồi thử lại.' };
        if (peer === this.peer) this.event(peer, result); else this.mesh.send(peer, result);
      }
    } else if (event.type === 'table-result') {
      if (peer === room.host_peer_id && event.requestId === this.tableRequest?.requestId) {
        clearTimeout(this.tableTimer); this.tableRequest = undefined;
        this.patch({ tablePending: false, tableRetry: false, tableMessage: event.message });
      }
    } else if (event.type === 'chat' || event.type === 'emote') {
      // Lấy người gửi từ kết nối, không tin peer_id do gói tin tự khai.
      if (this.social.accept(peer, event)) this.patch({ social: this.social.view });
    } else if (event.type === 'hello') {
      this.voice.announce(peer);
      // Mẫu ban đầu và mẫu dừng đi qua kênh tin cậy, tránh đứng sai chỗ nếu gói cuối bị mất.
      this.mesh.send(peer, { type: 'pose-keyframe', packet: {
        type: 'pose', instance: this.instance, seq: ++this.seq, pose: { ...this.localPose },
      } });
      if (room.host_peer_id === this.peer && this.view.seats) this.mesh.send(peer,
        { type: 'snapshot', epoch: room.host_epoch, snapshot: this.view.seats, hostTime: this.tableNow() });
      else if (peer === room.host_peer_id) this.mesh.send(peer, { type: 'hello' });
    } else if (event.type === 'pose-keyframe') {
      this.receivePose(peer, event.packet);
    } else if (event.type === 'snapshot') {
      if (peer === room.host_peer_id && event.epoch === room.host_epoch && validSnapshot(event.snapshot)) {
        if (Number.isFinite(event.hostTime)) this.setTableClock(event.hostTime!);
        this.acceptSnapshot(event.snapshot);
      }
      else if (event.epoch > room.host_epoch) void this.sync();
    } else if (event.type === 'seat' && room.host_peer_id === this.peer && typeof event.requestId === 'string') {
      // Mọi yêu cầu ghế chạy nối tiếp; hai người không thể cùng thắng một ghế.
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(event.requestId)) return;
      if (!this.hostQueue.submit(peer, () => this.arbitrate(peer, event.requestId, event.seat))) {
        const result: RoomEvent = { type: 'seat-result', requestId: event.requestId, accepted: false, message: 'Host đang bận; hãy chờ rồi thử lại.' };
        if (peer === this.peer) this.event(peer, result); else this.mesh.send(peer, result);
      }
    } else if (event.type === 'seat-result' && peer === room.host_peer_id && event.requestId === this.pending?.id) {
      clearTimeout(this.pending.timer); this.pending = undefined;
      this.patch({ pending: false, message: event.message });
    }
  }

  private acceptSnapshot(snapshot: Snapshot) {
    if (!validSnapshot(snapshot) || this.view.seats && snapshot.revision < this.view.seats.revision) return;
    if (snapshot.seats.some(id => id !== null && !this.view.room.members[id])) { void this.sync(); return; }
    this.patch({ seats: snapshot, table: snapshot.table ?? null });
    if (snapshot.table) {
      for (const action of Object.values(snapshot.table.actions)) {
        if (this.heardActions.has(action.id)) continue;
        this.heardActions.add(action.id);
        if (this.heardActions.size > 256) this.heardActions.delete(this.heardActions.values().next().value!);
        if (!activeAction(snapshot.table, action.peer, this.tableNow())) continue;
        const position = seatPosition(action.seat);
        this.audio.play(action.kind, Math.hypot(position.x - this.localPose.x, position.z - this.localPose.z));
      }
    }
    const seat = snapshot.seats.indexOf(this.peer);
    if (seat >= 0) this.localPose = { ...seatPosition(seat), animation: 'sit' };
    else if (this.localPose.animation === 'sit') this.localPose = { ...this.localPose, animation: 'idle' };
  }

  requestSeat(seat: number | null) {
    if (this.view.pending || !this.view.seats || this.view.expired) return;
    const id = crypto.randomUUID();
    this.pending = { id, timer: setTimeout(() => {
      this.pending = undefined; this.patch({ pending: false, message: 'Host chưa trả lời; kiểm tra P2P rồi thử lại.' });
    }, 10000) };
    this.patch({ pending: true, message: 'Đang chờ host phân xử…' });
    const event: RoomEvent = { type: 'seat', requestId: id, seat };
    if (this.view.room.host_peer_id === this.peer) this.event(this.peer, event);
    else if (this.view.room.host_peer_id) this.mesh.send(this.view.room.host_peer_id, event);
  }

  private async arbitrate(peer: string, requestId: string, seat: number | null) {
    if (this.stopped || this.view.room.host_peer_id !== this.peer || !this.view.room.members[peer]) return;
    let message = 'Ghế đã có người hoặc yêu cầu không hợp lệ.', accepted = false;
    if (this.view.table && tableSeatBusy(this.view.table, peer, this.tableNow())) {
      const result: RoomEvent = { type: 'seat-result', requestId, accepted: false, message: 'Hãy chờ thao tác trà/bánh hoàn tất trước khi đổi ghế.' };
      if (peer === this.peer) this.event(this.peer, result); else this.mesh.send(peer, result);
      return;
    }
    const next = decideSeat(this.view.room.snapshot.seats, peer, seat);
    if (next) {
      try {
        const room = await commitSeats(this.view.room, this.peer, next);
        if (this.stopped) return;
        this.applyRoom(room); // Commit bền vững trước khi báo thành công.
        message = seat === null ? 'Đã đứng dậy.' : `Đã ngồi ghế ${seat + 1}.`; accepted = true;
      } catch (error) { message = errorMessage(error); await this.sync(); }
    }
    const result: RoomEvent = { type: 'seat-result', requestId, accepted, message };
    if (peer === this.peer) this.event(this.peer, result); else this.mesh.send(peer, result);
  }

  private sendPose(peer?: string) {
    if (this.stopped || this.view.expired) return;
    const p = this.localPose;
    const pose: Pose = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100,
      yaw: Math.round(p.yaw * 100) / 100, animation: p.animation };
    const key = JSON.stringify(pose);
    if (!peer && key === this.lastPose) return;
    if (!peer) this.lastPose = key;
    const packet: PosePacket = { type: 'pose', instance: this.instance, seq: ++this.seq, pose };
    this.mesh.pose(packet, peer);
    if (!peer && pose.animation !== this.lastAnimation) {
      this.lastAnimation = pose.animation;
      this.mesh.broadcast({ type: 'pose-keyframe', packet });
    }
    this.sent++; // UI đọc lại mỗi heartbeat, không render 10 lần/giây.
  }

  private receivePose(peer: string, packet: PosePacket) {
    if (!this.view.room.members[peer] || !packet || packet.type !== 'pose' || !validPose(packet.pose)) return;
    if (typeof packet.instance === 'string' && packet.instance.length <= 64 && this.poseInstances.get(peer) !== packet.instance) {
      this.poses.delete(peer); this.poseInstances.set(peer, packet.instance);
    }
    let buffer = this.poses.get(peer);
    if (!buffer) { buffer = new PoseBuffer(); this.poses.set(peer, buffer); }
    buffer.push(packet.seq, packet.pose); this.received++;
  }

  async leave() {
    forgetRoom(); this.stop();
    try { await syncRoom(this.view.room.id, this.peer, true); } catch { /* Lease tự hết hạn nếu mất mạng. */ }
  }
  tableNow() { return this.clockBase.time + performance.now() - this.clockBase.local; }
  private setTableClock(time: number, reset = false) {
    if (!Number.isFinite(time) || time < 0 || time > 1e15) return;
    this.clockBase = { time: reset ? time : Math.max(time, this.tableNow()), local: performance.now() };
  }
  requestTable(kind: TableKind, targetSeat?: number) {
    if (this.view.tablePending || this.view.expired || !this.view.table || this.stopped) return;
    this.tableRequest = { type: 'table-request', requestId: crypto.randomUUID(), seq: ++this.tableSeq, kind, targetSeat };
    this.transmitTableRequest();
  }
  retryTable() { if (this.tableRequest && !this.view.tablePending) this.transmitTableRequest(); }
  private transmitTableRequest() {
    const request = this.tableRequest;
    if (!request || this.stopped || this.view.expired) return;
    this.patch({ tablePending: true, tableRetry: false, tableMessage: 'Đang chờ host xác nhận…' });
    clearTimeout(this.tableTimer);
    this.tableTimer = setTimeout(() => this.patch({ tablePending: false, tableRetry: true,
      tableMessage: 'Chưa nhận xác nhận. Có thể thử lại cùng yêu cầu; không bị trừ đồ hai lần.' }), 10000);
    if (this.view.room.host_peer_id === this.peer) this.event(this.peer, request);
    else if (this.view.room.host_peer_id) this.mesh.send(this.view.room.host_peer_id, request);
  }
  private async arbitrateTable(peer: string, request: TableRequest) {
    if (this.stopped || this.view.expired || this.view.room.host_peer_id !== this.peer) return;
    const table = this.view.room.snapshot.table;
    let accepted = false, message = 'Hãy chạy migration supabase/phase4.sql trước.';
    if (table) {
      const decision = decideTable(table, peer, request, this.view.room.snapshot.seats,
        Object.keys(this.view.room.members), this.tableNow());
      message = decision.message; accepted = decision.accepted;
      if (decision.state) {
        try {
          const room = await commitTable(this.view.room, this.peer, decision.state);
          if (this.stopped) return;
          this.applyRoom(room);
        } catch (error) { accepted = false; message = errorMessage(error); await this.sync(); }
      } else if (decision.duplicate) {
        const snapshot: RoomEvent = { type: 'snapshot', epoch: this.view.room.host_epoch,
          snapshot: this.view.room.snapshot, hostTime: this.tableNow() };
        if (peer === this.peer) this.acceptSnapshot(this.view.room.snapshot); else this.mesh.send(peer, snapshot);
      }
    }
    const result: RoomEvent = { type: 'table-result', requestId: request.requestId, accepted, message };
    if (peer === this.peer) this.event(this.peer, result); else this.mesh.send(peer, result);
  }
  sendChat(text: string): string | null {
    if (characterCount(text) > CHAT_LIMIT) return 'Tin nhắn tối đa 200 ký tự.';
    const cleaned = cleanChat(text);
    if (!cleaned) return 'Hãy nhập nội dung tin nhắn.';
    return this.sendSocial({ type: 'chat', id: crypto.randomUUID(), text: cleaned });
  }
  sendEmote(kind: EmoteKind): string | null {
    if (!isEmote(kind)) return 'Emote không hợp lệ.';
    return this.sendSocial({ type: 'emote', id: crypto.randomUUID(), kind });
  }
  private sendSocial(event: SocialEvent): string | null {
    if (this.stopped || this.view.expired) return 'Phiên phòng đã kết thúc.';
    const peers = Object.keys(this.view.room.members).filter(id => id !== this.peer);
    const connected = this.mesh.connected();
    if (peers.length && !connected.length) return 'Hãy chờ kết nối P2P trước khi gửi.';
    if (!this.social.accept(this.peer, event)) return event.type === 'chat'
      ? 'Bạn chỉ được gửi 1 tin mỗi giây.' : 'Hãy chờ nửa giây trước emote tiếp theo.';
    this.patch({ social: this.social.view });
    this.mesh.broadcast(event);
    return null;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true; this.syncSerial++;
    this.touch.reset();
    this.hostQueue.close();
    clearInterval(this.heartbeat); clearInterval(this.tick); clearInterval(this.checkpointTimer);
    window.removeEventListener('online', this.online); window.removeEventListener('offline', this.offline);
    if (this.pending) clearTimeout(this.pending.timer);
    this.voice.stop(); this.mesh.stop(); this.listeners.clear();
    this.pendingSocial.clear();
    clearTimeout(this.tableTimer); this.audio.close(); this.ambience.close();
  }
}
