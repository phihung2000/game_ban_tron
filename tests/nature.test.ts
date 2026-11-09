import assert from 'node:assert/strict';
import test from 'node:test';
import { canPlant, canWalk, creekX, hashText, LAKE, randomSeed, skyState, terrainHeight, WORLD_LIMIT } from '../src/shared/world.ts';
import { detectQuality, GraphicsController, QUALITY } from '../src/scene/nature/GraphicsController.ts';
import { validPose } from '../src/network/types.ts';

test('Địa hình giữ bàn/ghế phẳng, tạo lòng hồ/suối và cấm đi xuống nước', () => {
  for (const [x, z] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
    assert.equal(terrainHeight(x, z), 0); assert.equal(canWalk(x, z), true); assert.equal(canPlant(x, z), false);
  }
  assert.ok(terrainHeight(LAKE.x, LAKE.z) < LAKE.y);
  assert.equal(canWalk(LAKE.x, LAKE.z), false); assert.equal(canPlant(LAKE.x, LAKE.z), false);
  assert.ok(terrainHeight(creekX(-20), -20) < -.1); assert.equal(canWalk(creekX(-20), -20), false);
  assert.equal(canWalk(WORLD_LIMIT + .01, 0), false);
});
test('Giới hạn vị trí mạng trùng vùng đi bộ mới và vẫn chặn dữ liệu hỏng', () => {
  const pose = { x: WORLD_LIMIT, z: -WORLD_LIMIT, yaw: 1, animation: 'walk' };
  assert.equal(validPose(pose), true); assert.equal(validPose({ ...pose, x: WORLD_LIMIT + .1 }), false);
  assert.equal(validPose({ ...pose, x: NaN }), false);
});
test('Seed và đồng hồ phòng cho cùng cây/cùng trời, không cần gói mạng', () => {
  const a = randomSeed(hashText('room-a')), b = randomSeed(hashText('room-a'));
  assert.deepEqual(Array.from({ length: 50 }, a), Array.from({ length: 50 }, b));
  const now = 1794145000000;
  assert.deepEqual(skyState(now, 'room-a', 'auto', 'auto'), skyState(now, 'room-a', 'auto', 'auto'));
  assert.equal(skyState(now, 'room-a', 'day', 'fog').daylight, 1);
  assert.equal(skyState(now, 'room-a', 'night', 'rain').daylight, 0);
  assert.equal(skyState(now, 'room-a', 'night', 'rain').weather, 'rain');
  assert.ok(Math.abs(skyState(now, 'room-a', 'auto', 'sunny').sunY - skyState(now + 1_200_000, 'room-a', 'auto', 'sunny').sunY) < .00001);
});
test('Thiết bị nhẹ chọn Thấp; ngân sách đồ họa tăng dần', () => {
  assert.equal(detectQuality({ mobile: true, cores: 8, memory: 8, pixels: 1_000_000 }), 'low');
  assert.equal(detectQuality({ mobile: false, cores: 4, pixels: 1_000_000 }), 'low');
  assert.equal(detectQuality({ mobile: false, cores: 6, memory: 8, pixels: 1_000_000 }), 'medium');
  assert.equal(detectQuality({ mobile: false, cores: 12, memory: 16, pixels: 2_000_000 }), 'high');
  assert.equal(QUALITY.low.reflection, 0);
  assert.ok(QUALITY.low.grass < QUALITY.medium.grass && QUALITY.medium.grass < QUALITY.high.grass);
  assert.ok(QUALITY.high.reflection <= 512);
});
test('Auto hạ mức khi chậm kéo dài, có cooldown; chọn tay được giữ nguyên', () => {
  const graphics = new GraphicsController(); graphics.update({ mode: 'high' });
  for (let i = 0; i < 12; i++) graphics.report(12, 120, 400000);
  assert.equal(graphics.getSnapshot().quality, 'high'); assert.equal(graphics.getPerformance().slow, true);
  graphics.update({ mode: 'auto' });
  for (let i = 0; i < 5; i++) graphics.report(20, 100, 250000);
  assert.equal(graphics.getSnapshot().quality, 'medium');
  graphics.report(20, 100, 250000); assert.equal(graphics.getSnapshot().quality, 'medium');
  for (let i = 0; i < 12; i++) graphics.report(20, 80, 120000);
  assert.equal(graphics.getSnapshot().quality, 'low');
  for (let i = 0; i < 5; i++) graphics.report(60, 80, 120000);
  assert.equal(graphics.getPerformance().slow, false);
});
