import assert from 'node:assert/strict';
import test from 'node:test';
import { BandwidthMeter, transportCounters } from '../src/network/bandwidth.ts';
import { Microphone } from '../src/audio/Microphone.ts';
import { chooseVoicePeers, microphoneError, rms, validVoiceStatus, voiceGate } from '../src/audio/voicePolicy.ts';
import type { VoicePerson } from '../src/audio/voicePolicy.ts';

const person = (id: string, x: number, seated = false): VoicePerson => ({ id, position: { x, z: 0, yaw: 0 },
  seated, mic: true, ready: true, connected: true });
test('Voice chỉ chọn người gần, không chọn người chưa ready hoặc chưa biết vị trí', () => {
  const people = [person('near', 5), person('far', 13), { ...person('offline', 1), connected: false },
    { ...person('silent', 1), ready: false }, { ...person('unknown', 1), position: null }];
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, true, people, [], 10), ['near']);
});
test('Trần 8/10/12 ưu tiên cùng bàn rồi ngắt người xa nhất', () => {
  const people = [...Array.from({ length: 15 }, (_, i) => person(`near-${i}`, i / 2 + 0.1)), person('table', 20, true)];
  for (const limit of [8, 10, 12] as const) {
    const selected = chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, true, true, people, [], limit);
    assert.equal(selected.length, limit); assert.equal(selected[0], 'table');
    assert.equal(selected.includes('near-14'), false);
    assert.equal(selected.includes('near-0'), true);
  }
});
test('Giữ kết nối đến 12m, chỉ nối mới trong 11,5m để tránh bật/tắt liên tục ở biên', () => {
  const people = [person('edge', 11.8)];
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, true, people, [], 10), []);
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, true, people, ['edge'], 10), ['edge']);
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, true, [person('edge', 12.01)], ['edge'], 10), []);
  assert.equal(voiceGate(12, false), 0); assert.equal(voiceGate(11, false), 0.5); assert.equal(voiceGate(20, true), 1);
});
test('Hai người chỉ nghe không tạo audio link; người tắt mic vẫn nghe người đang bật mic', () => {
  const people = [{ ...person('listener', 1), mic: false }, person('speaker', 2)];
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, false, people, [], 10), ['speaker']);
  assert.deepEqual(chooseVoicePeers({ x: 0, z: 0, yaw: 0 }, false, true, people, [], 10), ['listener', 'speaker']);
});
test('Kiểm tra voice status và đo RMS không chấp nhận dữ liệu hỏng', () => {
  const status = { type: 'voice-status', instance: 'test', seq: 1, ready: true, mic: true,
    speaking: true, level: 0.2, limit: 10, wanted: ['a'] };
  assert.equal(validVoiceStatus(status), true);
  assert.equal(validVoiceStatus({ ...status, wanted: Array(11).fill('a') }), false);
  assert.equal(validVoiceStatus({ ...status, limit: 100 }), false);
  assert.equal(validVoiceStatus({ ...status, mic: false }), false);
  assert.equal(validVoiceStatus({ ...status, level: NaN }), false);
  assert.equal(rms([0, 0]), 0); assert.equal(rms([0.5, -0.5]), 0.5);
  assert.match(microphoneError({ name: 'NotAllowedError' }), /cho phép micro/);
  assert.match(microphoneError({ name: 'NotFoundError' }), /Không tìm thấy/);
});
test('Băng thông lấy delta byte/thời gian, cộng nhiều kết nối, không tăng giả khi reset bộ đếm', () => {
  const meter = new BandwidthMeter();
  assert.deepEqual(meter.sample([{ id: 'a', time: 1000, sent: 100, received: 200 }]), { upKbps: 0, downKbps: 0 });
  assert.deepEqual(meter.sample([{ id: 'a', time: 2000, sent: 1100, received: 2200 }]), { upKbps: 8, downKbps: 16 });
  assert.deepEqual(meter.sample([{ id: 'a', time: 3000, sent: 0, received: 0 }]), { upKbps: 0, downKbps: 0 });
  const report = new Map([
    ['t', { id: 't', type: 'transport', selectedCandidatePairId: 'used' }],
    ['used', { id: 'used', type: 'candidate-pair', timestamp: 1000, bytesSent: 100, bytesReceived: 200 }],
    ['old', { id: 'old', type: 'candidate-pair', timestamp: 1000, bytesSent: 5000, bytesReceived: 5000 }],
  ]) as unknown as RTCStatsReport;
  assert.deepEqual(transportCounters('pc', report), [{ id: 'pc:used', time: 1000, sent: 100, received: 200 }]);
});

function fakeStream(id: string) {
  let stopped = 0;
  const track = { id, onended: null, stop() { stopped++; }, getSettings: () => ({ deviceId: id }) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  return { stream, stopped: () => stopped };
}
test('Hủy lúc hộp quyền mic đang chờ: stream cấp muộn bị dừng ngay', async () => {
  const capture = fakeStream('late');
  let resolve!: (stream: MediaStream) => void;
  const installed: (MediaStream | null)[] = [];
  const mic = new Microphone({ getUserMedia: () => new Promise(r => { resolve = r; }) }, async s => { installed.push(s); }, () => {});
  const pending = mic.open('default'); mic.stop(); resolve(capture.stream);
  assert.equal(await pending, false); assert.equal(capture.stopped(), 1);
  assert.equal(installed.includes(capture.stream), false);
});
test('Đổi mic thay track rồi dừng thiết bị cũ; yêu cầu khử vọng và khử ồn', async () => {
  const a = fakeStream('a'), b = fakeStream('b'), installed: (MediaStream | null)[] = [];
  const mic = new Microphone({ getUserMedia: async constraints => {
    const audio = constraints!.audio as MediaTrackConstraints;
    assert.equal(audio.echoCancellation, true); assert.equal(audio.noiseSuppression, true);
    return (audio.deviceId as ConstrainDOMStringParameters)?.exact === 'b' ? b.stream : a.stream;
  } }, async s => { installed.push(s); }, () => {});
  await mic.open('a'); await mic.open('b');
  assert.equal(mic.stream, b.stream); assert.equal(a.stopped(), 1); assert.equal(b.stopped(), 0);
  assert.deepEqual(installed, [a.stream, b.stream]);
  mic.stop(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(b.stopped(), 1); assert.equal(installed.at(-1), null);
});
test('Đổi thiết bị thất bại không ngắt micro cũ vẫn đang hoạt động', async () => {
  const a = fakeStream('a'), b = fakeStream('b'); let calls = 0;
  const mic = new Microphone({ getUserMedia: async () => ++calls === 1 ? a.stream : b.stream }, async stream => {
    if (stream === b.stream) throw new Error('replace failed');
  }, () => {});
  await mic.open('a'); await assert.rejects(mic.open('b'), /replace failed/);
  assert.equal(mic.stream, a.stream); assert.equal(a.stopped(), 0); assert.equal(b.stopped(), 1); mic.stop();
});
test('Tắt mic khi đang gắn track dừng cả stream đang chờ ngay lập tức', async () => {
  const capture = fakeStream('pending'); let release!: () => void, started!: () => void;
  const installing = new Promise<void>(resolve => { started = resolve; });
  const mic = new Microphone({ getUserMedia: async () => capture.stream }, async stream => {
    if (stream) { started(); await new Promise<void>(resolve => { release = resolve; }); }
  }, () => {});
  const opening = mic.open('default'); await installing;
  mic.stop(); assert.equal(capture.stopped(), 1); release();
  assert.equal(await opening, false); assert.equal(mic.stream, null);
});
