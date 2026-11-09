import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';

export async function prepareMobileContext(context) {
  await context.addInitScript(() => {
    const qa = { poses: [], keyboardHeight: 0 }; window.__mobileTest = qa;
    const send = RTCDataChannel.prototype.send;
    RTCDataChannel.prototype.send = function (value) {
      if (typeof value === 'string') {
        try { const packet = JSON.parse(value); if (packet.type === 'pose') qa.poses = [...qa.poses, packet.pose].slice(-80); } catch { /* Không phải JSON. */ }
      }
      return send.call(this, value);
    };
    if (window.visualViewport) {
      const height = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height').get;
      Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => qa.keyboardHeight || height.call(window.visualViewport) });
    }
    localStorage.setItem('ban-tron-nature-v1', JSON.stringify({ mode: 'auto', time: 'day', weather: 'sunny', ambience: false, volume: .12 }));
  });
}
export async function exerciseMobile(pages, ids, waitSeat) {
  const page = pages[0]; await mkdir('artifacts', { recursive: true });
  await page.getByTestId('stand').click(); await Promise.all(pages.map(p => waitSeat(p, 2, null)));
  await page.getByTestId('hud-toggle').click();
  const joystick = page.getByTestId('joystick'); await joystick.waitFor();
  const cdp = await page.context().newCDPSession(page), box = await joystick.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.waitForFunction(() => window.__mobileTest.poses.length > 0);
  const before = await page.evaluate(() => window.__mobileTest.poses.at(-1));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 42, y, id: 1 }] });
  await page.waitForTimeout(1400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__mobileTest.poses.at(-1)?.animation === 'idle');
  const after = await page.evaluate(() => window.__mobileTest.poses.at(-1));
  assert.ok(Math.hypot(before.x - after.x, before.z - after.z) > .5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 40, id: 1 }] });
  await page.waitForTimeout(500); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => window.__mobileTest.poses.at(-1)?.animation === 'idle');
  console.log('PASS: Joystick cảm ứng thật tạo vị trí P2P; thả/hủy chạm dừng di chuyển.');

  const input = page.getByTestId('chat-input'); await input.focus();
  await page.evaluate(() => { window.__mobileTest.keyboardHeight = 430; visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => document.documentElement.dataset.keyboard === 'open');
  const chat = await page.locator('.social-panel').boundingBox(); assert.ok(chat.y + chat.height <= 431);
  assert.equal(await joystick.isVisible(), false);
  await input.fill('Xin chào từ điện thoại'); await input.press('Enter');
  await pages[1].waitForFunction(() => document.querySelector('[data-testid="chat-messages"]')?.textContent.includes('Xin chào từ điện thoại'));
  assert.equal(await input.inputValue(), ''); assert.equal(await input.evaluate(node => node === document.activeElement), true);
  await page.screenshot({ path: 'artifacts/phase8-keyboard.png' });
  await page.getByRole('button', { name: 'Xong', exact: true }).click();
  await page.evaluate(() => { window.__mobileTest.keyboardHeight = 0; visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForFunction(() => document.documentElement.dataset.keyboard === 'closed');
  console.log('PASS: Ô chat nằm trên bàn phím, gửi tiếng Việt và giữ focus, đóng bàn phím khôi phục joystick.');

  await page.getByTestId('nature-metrics').waitFor({ state: 'attached' });
  assert.equal(await page.getByTestId('nature-metrics').getAttribute('data-quality'), 'low');
  // Camera mặc định sau khi vào phòng: chiếu tâm ghế sang tọa độ màn hình để chạm thật vào mesh.
  const camera = new PerspectiveCamera(50, 390 / 844, .1, 220);
  camera.position.set(15, 13, 21); camera.lookAt(-3, .5, -2); camera.updateMatrixWorld();
  const projected = new Vector3(3, .4, 0).project(camera);
  const seatX = (projected.x + 1) * 195, seatY = (1 - projected.y) * 422;
  await page.touchscreen.tap(seatX, seatY);
  await Promise.all(pages.map(p => waitSeat(p, 2, ids[0])));
  await page.getByTestId('touch-stand').click(); await Promise.all(pages.map(p => waitSeat(p, 2, null)));
  console.log('PASS: Chạm ghế 3D để ngồi và nút Đứng dậy; thiết bị cảm ứng tự chọn Thấp.');
  await page.screenshot({ path: 'artifacts/phase8-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(500);
  const landscape = await page.locator('.social-panel').boundingBox();
  assert.ok(landscape.x >= 0 && landscape.x + landscape.width <= 844 && landscape.y + landscape.height <= 391);
  await page.screenshot({ path: 'artifacts/phase8-landscape.png' });
  console.log('PASS: Giao diện dọc/ngang không tràn màn hình. Bàn phím OS thật cần kiểm tra trên thiết bị.');
}
