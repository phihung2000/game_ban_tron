import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { avatarDetail } from '../src/player/lod.ts';
import { cameraRelativeAxes, joystickAxes, TouchInput } from '../src/player/touchInput.ts';
import { keyboardVisible } from '../src/mobile/viewport.ts';

test('Joystick có deadzone, giới hạn tròn và giữ tốc độ analog', () => {
  assert.deepEqual(joystickAxes(2, 2), { x: 0, z: 0 });
  const diagonal = joystickAxes(100, 100); assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < .00001);
  assert.equal(joystickAxes(24, 0).x, .5);
  assert.deepEqual(joystickAxes(NaN, 0), { x: 0, z: 0 });
  const input = new TouchInput(); input.set(1, 0); input.reset(); assert.deepEqual(input.axes, { x: 0, z: 0 });
});
test('Joystick hướng theo camera; không làm thay đổi WASD theo thế giới', () => {
  const up = { x: 0, z: -1 };
  const forwardZ = cameraRelativeAxes(up, Math.PI); assert.ok(Math.abs(forwardZ.x) < .00001); assert.equal(forwardZ.z, -1);
  const forwardX = cameraRelativeAxes(up, Math.PI / 2); assert.equal(forwardX.x, 1); assert.ok(Math.abs(forwardX.z) < .00001);
});
test('LOD nhân vật tự giảm theo chất lượng, có hysteresis', () => {
  assert.equal(avatarDetail(16, 'low', 'near'), 'far');
  assert.equal(avatarDetail(13, 'low', 'far'), 'far');
  assert.equal(avatarDetail(10, 'low', 'far'), 'near');
  assert.equal(avatarDetail(16, 'high', 'near'), 'near');
});
test('Chỉ coi là bàn phím khi đang nhập và viewport co rõ rệt hoặc native báo mở', () => {
  assert.equal(keyboardVisible(true, 844, 450), true);
  assert.equal(keyboardVisible(false, 844, 450), false);
  assert.equal(keyboardVisible(true, 844, 820), false);
  assert.equal(keyboardVisible(true, 450, 450, true), true);
});
test('Quyền mic và cấu hình native không yêu cầu camera/HTTP tùy ý', async () => {
  const android = await readFile('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(android, /android.permission.RECORD_AUDIO/); assert.ok(!android.includes('android.permission.CAMERA'));
  const ios = await readFile('ios/App/App/Info.plist', 'utf8');
  assert.match(ios, /NSMicrophoneUsageDescription/); assert.ok(!ios.includes('NSAllowsArbitraryLoads'));
  const config = await readFile('capacitor.config.ts', 'utf8'); assert.ok(!/server\s*:\s*\{[^}]*\burl\s*:/s.test(config));
});
