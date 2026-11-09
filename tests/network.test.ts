import assert from 'node:assert/strict';
import test from 'node:test';
import { decideSeat } from '../src/network/seats.ts';
import { PoseBuffer, angleLerp } from '../src/player/PoseBuffer.ts';
import { validPose, validSnapshot } from '../src/network/types.ts';

test('Hai yêu cầu cùng ghế: chỉ yêu cầu đầu được chấp nhận', () => {
  const first = decideSeat(Array(8).fill(null), 'alice', 0)!;
  assert.equal(first[0], 'alice');
  assert.equal(decideSeat(first, 'bob', 0), null);
  assert.deepEqual(decideSeat(first, 'alice', null), Array(8).fill(null));
});
test('Đổi ghế giải phóng ghế cũ, từ chối ghế ngoài phạm vi', () => {
  const seats = decideSeat(Array(8).fill(null), 'alice', 0)!;
  const moved = decideSeat(seats, 'alice', 7)!;
  assert.equal(moved[0], null); assert.equal(moved[7], 'alice');
  assert.equal(decideSeat(seats, 'bob', 8), null);
  assert.equal(decideSeat(seats, 'bob', NaN), null);
});
test('Nội suy trễ 120ms, bỏ sequence cũ và không vượt mẫu cuối', () => {
  const buffer = new PoseBuffer();
  buffer.push(1, { x: 0, z: 0, yaw: 0, animation: 'walk' }, 1000);
  buffer.push(3, { x: 10, z: 0, yaw: 0, animation: 'walk' }, 1100);
  buffer.push(2, { x: -10, z: 0, yaw: 0, animation: 'idle' }, 1110);
  assert.equal(buffer.sample(1170)!.x, 5);
  assert.equal(buffer.sample(2000)!.x, 10);
});
test('Nội suy hướng qua biên -PI/PI đi theo cung ngắn', () => {
  assert.ok(Math.abs(angleLerp(Math.PI - 0.1, -Math.PI + 0.1, 0.5) - Math.PI) < 1e-9);
});
test('Từ chối packet hỏng và snapshot trùng chủ ghế', () => {
  assert.equal(validPose({ x: Infinity, z: 0, yaw: 0, animation: 'idle' }), false);
  assert.equal(validPose({ x: 0, z: 0, yaw: 0, animation: 'fly' }), false);
  assert.equal(validSnapshot({ revision: 1, seats: ['a', 'a', null, null, null, null, null, null] }), false);
});
