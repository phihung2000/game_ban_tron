import test from 'node:test';
import assert from 'node:assert/strict';
import { HostWorkQueue, MESSAGE_LIMITS, SignalGate, TokenBucket, TrafficGate } from '../src/network/rateLimit.ts';
import { RetrySchedule } from '../src/network/retry.ts';
import { LocalModeration } from '../src/network/moderation.ts';

test('Token bucket giới hạn burst, hồi theo thời gian và không tăng vì đồng hồ lùi', () => {
  const bucket = new TokenBucket(2, 3, 0);
  assert.equal(bucket.take(3, 0), true); assert.equal(bucket.take(1, 0), false);
  assert.equal(bucket.take(1, 500), true); assert.equal(bucket.take(1, 400), false);
  assert.equal(bucket.take(NaN, 500), false); assert.equal(bucket.take(-1, 500), false);
});
test('Mỗi loại tin bị giới hạn, peer khác không bị ảnh hưởng; gói lạ/quá lớn bị chặn', () => {
  for (const [type, [, burst]] of Object.entries(MESSAGE_LIMITS)) {
    const gate = new TrafficGate();
    for (let i = 0; i < burst; i++) assert.equal(gate.allow('a', type, 10, 0), true, type);
    assert.equal(gate.allow('a', type, 10, 0), false, type);
    assert.equal(gate.allow('b', type, 10, 0), true, type);
  }
  const gate = new TrafficGate();
  assert.equal(gate.allow('a', 'unknown', 50, 0), false);
  assert.equal(gate.allow('a', '__proto__', 50, 0), false);
  assert.equal(gate.allow('a', 'constructor', 50, 0), false);
  assert.equal(gate.allow('a', 'snapshot', 65537, 0), false);
  assert.equal(gate.raw('a', 65536, 0), true); assert.equal(gate.raw('a', 65536, 0), true);
  assert.equal(gate.raw('a', 65536, 0), true); assert.equal(gate.raw('a', 65536, 0), true);
  assert.equal(gate.raw('a', 1, 0), false);
  gate.forget('a'); assert.equal(gate.raw('a', 1, 0), true);
});
test('SDP giới hạn riêng, không để ICE chiếm ngân sách SDP hoặc tạo nhiều PC liên tục', () => {
  const gate = new SignalGate();
  assert.equal(gate.allow('a', 'offer', 0), true); assert.equal(gate.allow('a', 'offer', 0), true);
  assert.equal(gate.allow('a', 'offer', 0), false); assert.equal(gate.allow('a', 'offer', 4000), true);
  for (let i = 0; i < 60; i++) assert.equal(gate.allow('a', 'candidate', 0), true);
  assert.equal(gate.allow('a', 'candidate', 0), false); assert.equal(gate.allow('a', 'answer', 0), true);
  assert.equal(gate.allow('b', 'offer', 0), true); assert.equal(gate.allow('a', '__proto__', 0), false);
});
test('Retry tăng thời gian chờ, dừng sau 5 lần và nút thử lại đặt lại lịch', () => {
  const retry = new RetrySchedule(); let last = 0;
  for (let i = 0; i < 5; i++) {
    retry.fail(0, 0); assert.ok(retry.nextAt > last); last = retry.nextAt;
    assert.equal(retry.ready(0), false);
  }
  assert.equal(retry.exhausted, true); assert.equal(retry.ready(999999), false);
  retry.reset(); assert.equal(retry.ready(0), true); assert.equal(retry.attempts, 0);
});
test('Chặn/tắt tiếng tách theo tài khoản; bỏ chặn không thay lựa chọn mute', () => {
  const moderation = new LocalModeration('owner');
  moderation.set('other', 'muted', true); moderation.set('other', 'blocked', true);
  moderation.set('other', 'blocked', false);
  assert.deepEqual(moderation.get('other'), { muted: true, blocked: false });
  assert.deepEqual(moderation.get('new-user'), { muted: false, blocked: false });
  assert.deepEqual(new LocalModeration('different-owner').get('other'), { muted: false, blocked: false });
});
test('DB chậm không làm hàng đợi host tăng vô hạn; việc lỗi không chặn những việc sau', async () => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; }), calls: string[] = [], errors: unknown[] = [];
  const queue = new HostWorkQueue(error => errors.push(error), 3, 2);
  assert.equal(queue.submit('a', async () => { await barrier; calls.push('a1'); }), true);
  assert.equal(queue.submit('a', async () => { calls.push('a2'); throw new Error('DB mô phỏng'); }), true);
  assert.equal(queue.submit('a', async () => { calls.push('bị chặn'); }), false);
  assert.equal(queue.submit('b', async () => { calls.push('b'); }), true);
  assert.equal(queue.submit('c', async () => { calls.push('quá trần'); }), false);
  assert.equal(queue.size, 3); release(); await queue.idle();
  assert.deepEqual(calls, ['a1', 'a2', 'b']); assert.equal(errors.length, 1); assert.equal(queue.size, 0);
  queue.close(); assert.equal(queue.submit('a', async () => {}), false);
});
