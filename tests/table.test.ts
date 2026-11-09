import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION_DURATION, activeAction, cupMl, decideTable, initialTable, tableSeatBusy, temperature, validTable } from '../src/network/table.ts';
import type { TableKind, TableRequest, TableState } from '../src/network/table.ts';
import { sampleTableAction } from '../src/player/tableAnimations.ts';

const seats = ['a', 'b', 'c', null, null, null, null, 'h'];
const members = ['a', 'b', 'c', 'h', 'walking'];
const request = (kind: TableKind, seq = 1, targetSeat?: number): TableRequest => ({ type: 'table-request', kind, seq, requestId: `request-${seq}`, targetSeat });
function accepted(table: TableState, peer: string, action: TableRequest, now: number) {
  const decision = decideTable(table, peer, action, seats, members, now);
  assert.equal(decision.accepted, true, decision.message); assert.ok(decision.state);
  assert.equal(validTable(decision.state), true); return decision.state!;
}

test('Rót trà bảo toàn thể tích, tăng dần mực ly, không tràn', () => {
  let table = initialTable(seats, 1000);
  table = accepted(table, 'a', request('pour'), 1000);
  assert.equal(table.pot.ml, 2250); assert.equal(cupMl(table.cups[0], 1000), 0);
  assert.equal(cupMl(table.cups[0], 1900), 75); assert.equal(cupMl(table.cups[0], 2800), 150);
  table = accepted(table, 'a', request('pour', 2), 3000);
  assert.equal(table.cups[0].toMl, 200); assert.equal(table.pot.ml, 2200);
  assert.equal(decideTable(table, 'a', request('pour', 3), seats, members, 5000).accepted, false);
});
test('Mời hai ghế liền kề kể cả vòng 0/7; cấm người đứng, ghế xa và ly đang dùng', () => {
  const table = initialTable(seats, 1000);
  assert.equal(decideTable(table, 'walking', request('pour'), seats, members, 1000).accepted, false);
  assert.equal(decideTable(table, 'a', request('offer', 1, 2), seats, members, 1000).accepted, false);
  assert.equal(decideTable(table, 'a', request('offer', 1, 3), seats, members, 1000).accepted, false);
  const next = accepted(table, 'a', request('offer', 1, 7), 1000);
  assert.equal(next.cups[7].toMl, 150);
  assert.equal(tableSeatBusy(next, 'h', 1100), true);
  assert.equal(tableSeatBusy(next, 'h', 2900), false);
  assert.equal(decideTable(next, 'h', request('drink'), seats, members, 1100).accepted, false);
});
test('Hai người cùng lấy ấm hoặc chiếc bánh cuối: chỉ một người thắng', () => {
  let table = initialTable(seats, 1000); table.plate.cake = 1;
  table = accepted(table, 'a', request('take-cake'), 1000);
  assert.equal(table.plate.cake, 0); assert.equal(table.hands[0], 'cake');
  const second = decideTable(table, 'b', request('take-cake'), seats, members, 1000);
  assert.equal(second.accepted, false); assert.match(second.message, /hết bánh/);
  table = accepted(table, 'b', request('pour', 2), 1000);
  const potRace = decideTable(table, 'c', request('pour'), seats, members, 1000);
  assert.equal(potRace.accepted, false); assert.match(potRace.message, /Ấm đang/);
});
test('Uống giảm từ từ 80ml, đổ hết, nguội liên tục và không xuống dưới nhiệt độ phòng', () => {
  let table = accepted(initialTable(seats, 1000), 'a', request('pour'), 1000);
  table = accepted(table, 'a', request('drink', 2), 3000);
  assert.equal(cupMl(table.cups[0], 3000), 150); assert.equal(cupMl(table.cups[0], 4100), 110);
  assert.equal(cupMl(table.cups[0], 5200), 70);
  table = accepted(table, 'a', request('dump', 3), 6000);
  assert.equal(cupMl(table.cups[0], 6600), 35); assert.equal(cupMl(table.cups[0], 7200), 0);
  assert.equal(temperature(90, 1000, 1000), 90);
  assert.ok(temperature(90, 1000, 50000) < 40); assert.ok(temperature(90, 1000, 1e9) >= 22);
  assert.equal(decideTable(table, 'a', request('drink', 4), seats, members, 8000).accepted, false);
});
test('Mỗi tay một món; ăn và vứt không hoàn lại đĩa', () => {
  let table = accepted(initialTable(seats, 1000), 'a', request('take-candy'), 1000);
  assert.equal(table.hands[0], 'candy'); assert.equal(table.plate.candy, 15);
  assert.equal(decideTable(table, 'a', request('take-cake', 2), seats, members, 2500).accepted, false);
  table = accepted(table, 'a', request('eat', 2), 2500);
  assert.equal(table.hands[0], null); assert.equal(table.plate.candy, 15);
  table = accepted(table, 'a', request('take-cake', 3), 5000);
  table = accepted(table, 'a', request('throw', 4), 6500);
  assert.equal(table.hands[0], null); assert.equal(table.plate.cake, 11);
});
test('Gửi lại sau đổi host không thực hiện lại; số thứ tự cũ không được tái sử dụng', () => {
  const table = accepted(initialTable(seats, 1000), 'a', request('pour'), 1000);
  const recovered = structuredClone(table);
  const duplicate = decideTable(recovered, 'a', request('pour'), seats, members, 20000);
  assert.equal(duplicate.accepted, true); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.state, undefined);
  assert.equal(recovered.pot.ml, 2250);
  const second = accepted(recovered, 'a', request('drink', 2), 20000);
  assert.equal(decideTable(second, 'a', request('pour'), seats, members, 25000).accepted, false);
});
test('Snapshot hỏng, owner không khớp và yêu cầu giả bị từ chối', () => {
  const table = initialTable(seats, 1000); assert.equal(validTable(table), true);
  const broken = structuredClone(table); broken.cups[0].toMl = 201; assert.equal(validTable(broken), false);
  assert.equal(validTable({}), false); assert.equal(validTable(null), false);
  assert.equal(decideTable(table, 'fake', request('pour'), seats, members, 1000).accepted, false);
  assert.equal(decideTable(table, 'a', { ...request('pour'), seq: NaN }, seats, members, 1000).accepted, false);
  const changedSeats = [...seats]; changedSeats[0] = null;
  assert.equal(decideTable(table, 'b', request('pour'), changedSeats, members, 1000).accepted, false);
});
test('Mỗi hành động có chuyển động hữu hạn và tự trở về tư thế nghỉ', () => {
  for (const [kind, durationMs] of Object.entries(ACTION_DURATION)) {
    const action = { id: 'x', peer: 'a', kind: kind as TableKind, seat: 0, targetSeat: 0, startedAt: 1000, durationMs, snack: 'cake' as const };
    const table = initialTable(seats, 1000); table.actions.a = action;
    assert.ok(activeAction(table, 'a', 1200));
    const pose = sampleTableAction(action, 1400);
    assert.ok(pose.weight > 0); assert.notEqual(pose.rightX, 0);
    assert.ok(Object.values(pose).every(value => typeof value !== 'number' || Number.isFinite(value)));
    assert.deepEqual(sampleTableAction(action, 1000 + durationMs), sampleTableAction(undefined, 0));
  }
});
