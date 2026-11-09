export const CUP_CAPACITY = 200;
export const POUR_AMOUNT = 150;
export const SIP_AMOUNT = 80;
export const AMBIENT_C = 22;
export const COOLING_MS = 35000;
export const TABLE_KINDS = ['pour', 'offer', 'drink', 'dump', 'take-cake', 'take-candy', 'eat', 'throw'] as const;
export type TableKind = typeof TABLE_KINDS[number];
export type Snack = 'cake' | 'candy';
export const ACTION_DURATION: Record<TableKind, number> = {
  pour: 1800, offer: 1800, drink: 2200, dump: 1200,
  'take-cake': 1100, 'take-candy': 1100, eat: 1700, throw: 1000,
};
export type CupState = { fromMl: number; toMl: number; startedAt: number; durationMs: number; heatC: number; heatedAt: number };
export type TableAction = { id: string; peer: string; kind: TableKind; seat: number;
  targetSeat: number; startedAt: number; durationMs: number; snack: Snack | null };
export type TableRequest = { type: 'table-request'; requestId: string; seq: number; kind: TableKind; targetSeat?: number };
export type TableState = {
  version: 1;
  owners: (string | null)[];
  pot: { ml: number; heatC: number; heatedAt: number; busyUntil: number };
  plate: { cake: number; candy: number };
  cups: CupState[];
  hands: (Snack | null)[];
  actions: Record<string, TableAction>;
  lastRequests: Record<string, { seq: number; id: string; message: string }>;
};
export function emptyCup(): CupState {
  return { fromMl: 0, toMl: 0, startedAt: 0, durationMs: 0, heatC: AMBIENT_C, heatedAt: 0 };
}
export function initialTable(owners: (string | null)[], now: number): TableState {
  return { version: 1, owners: [...owners], pot: { ml: 2400, heatC: 90, heatedAt: now, busyUntil: 0 },
    plate: { cake: 12, candy: 16 }, cups: Array.from({ length: 8 }, emptyCup),
    hands: Array(8).fill(null), actions: {}, lastRequests: {} };
}
export function isTableKind(value: unknown): value is TableKind {
  return typeof value === 'string' && (TABLE_KINDS as readonly string[]).includes(value);
}
export function cupMl(cup: CupState, now: number) {
  const t = cup.durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - cup.startedAt) / cup.durationMs));
  return cup.fromMl + (cup.toMl - cup.fromMl) * t;
}
export function temperature(heatC: number, heatedAt: number, now: number, coolingMs = COOLING_MS) {
  return AMBIENT_C + (heatC - AMBIENT_C) * Math.exp(-Math.max(0, now - heatedAt) / coolingMs);
}
export function cupBusy(cup: CupState, now: number) { return now < cup.startedAt + cup.durationMs; }
export function activeAction(table: TableState, peer: string, now: number): TableAction | undefined {
  const action = table.actions[peer];
  return action && now >= action.startedAt && now < action.startedAt + action.durationMs ? action : undefined;
}
export function tableSeatBusy(table: TableState, peer: string, now: number) {
  const seat = table.owners.indexOf(peer);
  return Boolean(activeAction(table, peer, now) || seat >= 0 && cupBusy(table.cups[seat], now));
}

const bounded = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function validTable(value: unknown): value is TableState {
  if (!record(value)) return false;
  const t = value as unknown as TableState;
  if (t.version !== 1 || !Array.isArray(t.owners) || t.owners.length !== 8
    || !t.owners.every(v => v === null || typeof v === 'string' && v.length <= 64)
    || !record(t.pot) || !bounded(t.pot.ml, 2400) || !bounded(t.pot.heatC, 95)
    || !bounded(t.pot.heatedAt, 1e15) || !bounded(t.pot.busyUntil, 1e15)
    || !record(t.plate) || !Number.isInteger(t.plate.cake) || !bounded(t.plate.cake, 12)
    || !Number.isInteger(t.plate.candy) || !bounded(t.plate.candy, 16)
    || !Array.isArray(t.cups) || t.cups.length !== 8 || !Array.isArray(t.hands) || t.hands.length !== 8
    || !t.hands.every(v => v === null || v === 'cake' || v === 'candy')
    || !record(t.actions) || Object.keys(t.actions).length > 30
    || !record(t.lastRequests) || Object.keys(t.lastRequests).length > 30) return false;
  if (!t.cups.every(c => record(c) && bounded(c.fromMl, CUP_CAPACITY) && bounded(c.toMl, CUP_CAPACITY)
    && bounded(c.startedAt, 1e15) && bounded(c.durationMs, 5000) && bounded(c.heatC, 95) && bounded(c.heatedAt, 1e15))) return false;
  if (!Object.entries(t.actions).every(([peer, a]) => record(a) && a.peer === peer && typeof a.id === 'string'
    && a.id.length <= 64 && isTableKind(a.kind) && Number.isInteger(a.seat) && bounded(a.seat, 7)
    && Number.isInteger(a.targetSeat) && bounded(a.targetSeat, 7) && bounded(a.startedAt, 1e15)
    && bounded(a.durationMs, 5000) && a.durationMs > 0 && (a.snack === null || a.snack === 'cake' || a.snack === 'candy'))) return false;
  return Object.values(t.lastRequests).every(v => record(v) && Number.isSafeInteger(v.seq) && bounded(v.seq, 1e12)
    && typeof v.id === 'string' && v.id.length <= 64 && typeof v.message === 'string' && v.message.length <= 200);
}

export type TableDecision = { accepted: boolean; message: string; state?: TableState; duplicate?: boolean };
export function decideTable(current: TableState, peer: string, request: TableRequest,
  seats: (string | null)[], members: string[], now: number): TableDecision {
  const reject = (message: string): TableDecision => ({ accepted: false, message });
  if (!isTableKind(request.kind) || typeof request.requestId !== 'string'
    || !/^[a-zA-Z0-9-]{1,64}$/.test(request.requestId) || !Number.isSafeInteger(request.seq)
    || request.seq < 1 || request.seq > 1e12) return reject('Yêu cầu không hợp lệ.');
  if (!members.includes(peer)) return reject('Bạn không còn trong phòng.');
  const previous = current.lastRequests[peer];
  // Số thứ tự được lưu cùng snapshot: gửi lại sau đổi host cũng không trừ trà/bánh hai lần.
  if (previous && request.seq <= previous.seq) return request.seq === previous.seq && request.requestId === previous.id
    ? { accepted: true, message: previous.message, duplicate: true }
    : reject('Yêu cầu cũ đã được xử lý; không thực hiện lại.');
  const seat = seats.indexOf(peer);
  if (seat < 0) return reject('Hãy ngồi vào ghế trước.');
  if (current.owners.some((owner, i) => owner !== seats[i])) return reject('Ghế vừa thay đổi; hãy thử lại.');
  if (activeAction(current, peer, now)) return reject('Hãy chờ thao tác hiện tại hoàn tất.');
  const state: TableState = structuredClone(current);
  state.actions = Object.fromEntries(Object.entries(state.actions).filter(([id, a]) => members.includes(id) && now < a.startedAt + a.durationMs));
  state.lastRequests = Object.fromEntries(Object.entries(state.lastRequests).filter(([id]) => members.includes(id)));
  let targetSeat = seat, snack: Snack | null = null, message = '';
  const kind = request.kind, durationMs = ACTION_DURATION[kind];
  if (kind === 'pour' || kind === 'offer') {
    if (state.pot.busyUntil > now) return reject('Ấm đang được dùng; hãy thử lại sau.');
    if (kind === 'offer') {
      const target = request.targetSeat;
      if (!Number.isInteger(target) || target === undefined || target < 0 || target > 7
        || !seats[target] || ![(seat + 1) % 8, (seat + 7) % 8].includes(target)) return reject('Chỉ mời được người đang ngồi ở hai ghế cạnh bạn.');
      targetSeat = target;
    }
    const cup = state.cups[targetSeat];
    if (cupBusy(cup, now)) return reject('Ly đang được dùng; hãy thử lại sau.');
    const fromMl = cupMl(cup, now), amount = Math.min(POUR_AMOUNT, CUP_CAPACITY - fromMl, state.pot.ml);
    if (amount <= 0.01) return reject(state.pot.ml <= 0 ? 'Ấm đã hết trà.' : 'Ly đã đầy.');
    const toMl = fromMl + amount;
    const heatC = (fromMl * temperature(cup.heatC, cup.heatedAt, now)
      + amount * temperature(state.pot.heatC, state.pot.heatedAt, now, 180000)) / toMl;
    state.cups[targetSeat] = { fromMl, toMl, heatC, heatedAt: now, startedAt: now, durationMs };
    state.pot.ml -= amount; state.pot.busyUntil = now + durationMs;
    message = kind === 'pour' ? `Đã rót ${Math.round(amount)} ml vào ly của bạn.` : `Đã mời ghế ${targetSeat + 1} ${Math.round(amount)} ml trà.`;
  } else if (kind === 'drink' || kind === 'dump') {
    const cup = state.cups[seat];
    if (cupBusy(cup, now)) return reject('Ly đang được dùng; hãy thử lại sau.');
    const fromMl = cupMl(cup, now);
    if (fromMl <= 0.01) return reject('Ly chưa có trà.');
    const toMl = kind === 'dump' ? 0 : Math.max(0, fromMl - SIP_AMOUNT);
    state.cups[seat] = { fromMl, toMl, heatC: temperature(cup.heatC, cup.heatedAt, now),
      heatedAt: now, startedAt: now, durationMs };
    message = kind === 'drink' ? 'Đang uống trà.' : 'Đã đổ bỏ trà.';
  } else if (kind === 'take-cake' || kind === 'take-candy') {
    if (state.hands[seat]) return reject('Tay bạn đang cầm đồ ăn.');
    snack = kind === 'take-cake' ? 'cake' : 'candy';
    if (state.plate[snack] <= 0) return reject(snack === 'cake' ? 'Đĩa đã hết bánh.' : 'Đĩa đã hết kẹo.');
    state.plate[snack]--; state.hands[seat] = snack;
    message = snack === 'cake' ? 'Đã lấy một chiếc bánh.' : 'Đã lấy một viên kẹo.';
  } else {
    snack = state.hands[seat];
    if (!snack) return reject('Bạn chưa cầm bánh hoặc kẹo.');
    state.hands[seat] = null;
    message = kind === 'eat' ? 'Đang ăn.' : 'Đã vứt đồ ăn vào thùng.';
  }
  state.actions[peer] = { id: request.requestId, peer, kind, seat, targetSeat, startedAt: now, durationMs, snack };
  state.lastRequests[peer] = { seq: request.seq, id: request.requestId, message };
  return { accepted: true, message, state };
}
