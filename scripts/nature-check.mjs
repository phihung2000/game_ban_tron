import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function prepareNatureContext(context) {
  await context.addInitScript(() => {
    localStorage.setItem('ban-tron-nature-v1', JSON.stringify({ mode: 'low', time: 'day', weather: 'sunny', ambience: false, volume: .12 }));
    window.__natureAudio = { panners: [], contexts: [] };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.__natureAudio.contexts.push(this); }
      createPanner() { const node = super.createPanner(); window.__natureAudio.panners.push(node); return node; }
    };
  });
}
export async function exerciseNature(pages, errors) {
  const page = pages[0]; await mkdir('artifacts', { recursive: true });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="nature-metrics"]')?.getAttribute('data-triangles')) > 1000);
  await page.getByTestId('hud-toggle').click();
  for (const quality of ['low', 'medium', 'high']) {
    await page.getByTestId('nature-quality').selectOption(quality);
    await page.waitForFunction(q => document.querySelector('[data-testid="nature-metrics"]')?.getAttribute('data-quality') === q, quality);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `artifacts/phase6-${quality}.png` });
    console.log(`PASS: ${quality} WebGL, ${await page.getByTestId('nature-metrics').textContent()}.`);
  }
  // Thời tiết/âm thanh kiểm ở Thấp để rasterizer phần mềm không chặn event loop quá lâu.
  await page.getByTestId('nature-quality').selectOption('low');
  for (const weather of ['fog', 'rain', 'sunny']) {
    await page.getByTestId('nature-weather').selectOption(weather); await page.waitForTimeout(1800);
    assert.equal(await page.getByTestId('nature-weather').inputValue(), weather);
    if (weather === 'rain') await page.screenshot({ path: 'artifacts/phase6-rain.png' });
  }
  await page.getByTestId('nature-time').selectOption('night'); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/phase6-night.png' });
  await page.getByTestId('ambience-toggle').click();
  assert.equal(await page.getByTestId('ambience-toggle').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => window.__natureAudio.panners.filter(p => p.panningModel === 'HRTF').length >= 4);
  const spatial = await page.evaluate(() => window.__natureAudio.panners.map(p => [p.positionX.value, p.positionY.value, p.positionZ.value]));
  assert.ok(spatial.some(p => p[2] === -15));
  await page.getByTestId('ambience-toggle').click();
  assert.equal(await page.getByTestId('ambience-toggle').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.getByTestId('nature-quality').inputValue(), 'low');
  console.log('PASS: Ngày/đêm, nắng/sương/mưa; âm thanh HRTF và mức chọn tay được giữ.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nature-panel summary').click();
  await page.screenshot({ path: 'artifacts/phase6-mobile.png' });
  const box = await page.locator('.nature-panel').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.setViewportSize({ width: 1100, height: 760 });
  assert.deepEqual(errors, [], 'Không được có lỗi JS hoặc biên dịch shader WebGL');
  await page.getByTestId('hud-toggle').click();
  await page.getByTestId('leave').click();
  await page.waitForFunction(() => window.__natureAudio.contexts.every(context => context.state === 'closed'));
  console.log('PASS: Rời phòng đóng AudioContext; không lỗi JS/shader. Ảnh ở artifacts/phase6-*.png.');
}
