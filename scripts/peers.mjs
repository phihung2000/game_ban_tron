import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { exerciseTable, prepareHostRecovery, verifyHostRecovery } from './table-check.mjs';
import { exerciseVoice, fakeMicrophoneFile, prepareVoiceContext } from './voice-check.mjs';
import { exerciseNature, prepareNatureContext } from './nature-check.mjs';
import { exerciseSafety, prepareSafetyContext } from './safety-check.mjs';
import { exerciseChurn } from './churn-check.mjs';
import { exerciseMobile, prepareMobileContext } from './mobile-check.mjs';

export async function runPeerTest(prepareContext = async () => {}) {
const count = Number(process.env.PEERS || 10);
const voiceTest = process.env.VOICE_TEST === '1';
const natureTest = process.env.NATURE_TEST === '1';
const safetyTest = process.env.SAFETY_TEST === '1';
const churnTest = process.env.CHURN_TEST === '1';
const mobileTest = process.env.MOBILE_TEST === '1';
const natureErrors = [];
if (voiceTest && count > 12) throw new Error('Bài voice tự động dùng PEERS từ 3 đến 12.');
const fakeMicrophone = voiceTest || safetyTest ? await fakeMicrophoneFile() : null;
if (!Number.isInteger(count) || count < 3 || count > 30) throw new Error('PEERS phải từ 3 đến 30');
const url = process.env.APP_URL || 'http://localhost:5173';
const entryUrl = new URL(url);
if (process.env.RENDER_3D !== '1' && !natureTest && !mobileTest) entryUrl.searchParams.set('networkTest', '1');
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', args: [
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  ...(fakeMicrophone ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeMicrophone}`] : []),
] });
const pages = [], contexts = [];
async function waitText(page, testId, value, timeout = 90000) {
  await page.waitForFunction(({ testId, value }) => document.querySelector(`[data-testid="${testId}"]`)?.textContent === value,
    { testId, value: String(value) }, { timeout });
}
async function seats(page) { return JSON.parse(await page.getByTestId('snapshot').getAttribute('data-seats')); }
async function waitSeat(page, index, owner) {
  await page.waitForFunction(({ index, owner }) => {
    const element = document.querySelector('[data-testid="snapshot"]');
    return element && JSON.parse(element.getAttribute('data-seats'))[index] === owner;
  }, { index, owner }, { timeout: 30000 });
}
try {
  let code;
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext(mobileTest
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
      : { viewport: { width: 1100, height: 760 } });
    contexts.push(context);
    await prepareContext(context);
    if (voiceTest || safetyTest) await prepareVoiceContext(context);
    if (safetyTest) await prepareSafetyContext(context);
    if (mobileTest) await prepareMobileContext(context);
    if (natureTest) await prepareNatureContext(context);
    const page = await context.newPage(); pages.push(page);
    page.setDefaultTimeout(natureTest || mobileTest ? 60000 : 15000);
    page.on('pageerror', error => console.error(`Peer ${i + 1}: ${error.message}`));
    if (natureTest) {
      page.on('pageerror', error => natureErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) natureErrors.push(message.text()); });
    }
    const pageUrl = new URL(entryUrl);
    if ((process.env.RENDER_ONE === '1' || natureTest || mobileTest) && i > 0) pageUrl.searchParams.set('networkTest', '1');
    await page.goto(pageUrl.href);
    await page.getByTestId('anonymous').click();
    await page.getByTestId('display-name').waitFor({ timeout: 30000 });
    await page.getByTestId('display-name').fill(`Peer ${i + 1}`);
    if (i === 0) {
      await page.getByTestId('room-name').fill(`Kiểm thử ${count} peer`);
      await page.getByLabel('Số người tối đa').fill(String(Math.max(count, 12)));
      await page.getByTestId('private-room').check();
      await page.getByTestId('create-room').click();
      if (mobileTest) await page.getByTestId('hud-toggle').click();
      await page.getByTestId('invite-code').waitFor();
      code = await page.getByTestId('invite-code').textContent();
      // Mở menu trên điện thoại đã là thao tác unlock âm thanh; đưa về cùng điểm xuất phát.
      if (await page.getByTestId('sound-toggle').getAttribute('aria-pressed') === 'true') await page.getByTestId('sound-toggle').click();
      await page.getByTestId('sound-toggle').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="sound-toggle"]')?.getAttribute('aria-pressed') === 'true');
      await page.getByTestId('sound-toggle').click();
      assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
      const hostId = await page.getByTestId('self-id').textContent();
      await page.getByTestId('seat-2').click();
      await waitSeat(page, 2, hostId);
      assert.equal(await page.getByTestId('sound-toggle').getAttribute('aria-pressed'), 'false');
      await page.getByTestId('sound-toggle').click();
    } else {
      await page.getByTestId('invite-input').fill(code);
      await page.getByTestId('join-code').click();
      if (mobileTest) await page.getByTestId('hud-toggle').click();
    }
    await page.getByTestId('snapshot').waitFor();
    console.log(`Đã vào: ${i + 1}/${count}`);
    await page.waitForTimeout(1200);
  }
  await Promise.all(pages.map(page => waitText(page, 'connection-count', count - 1)));
  console.log(`PASS: ${count} peer, ${count * (count - 1) / 2} kết nối full-mesh.`);
  await Promise.all(pages.map(page => page.waitForFunction(() => document.querySelector('[data-testid="snapshot"]')?.getAttribute('data-ready') === 'true')));
  const ids = await Promise.all(pages.map(page => page.getByTestId('self-id').textContent()));
  await Promise.all(pages.map(page => waitSeat(page, 2, ids[0])));
  console.log('PASS: Người mới nhận snapshot có ghế đang được chiếm từ host.');
  await Promise.all(pages.map(page => page.waitForFunction(count =>
    document.querySelectorAll('[data-testid="participants"] li').length === count, count)));
  if (voiceTest) { await exerciseVoice(pages, ids, waitSeat); return; }
  if (natureTest) { await exerciseNature(pages, natureErrors); return; }
  if (safetyTest) { await exerciseSafety(pages, contexts, ids, waitText, code); return; }
  if (churnTest) { await exerciseChurn(pages, contexts, waitText, code); return; }
  if (mobileTest) { await exerciseMobile(pages, ids, waitSeat); return; }
  const chat = pages[0].getByTestId('chat-input');
  await chat.fill('a'.repeat(201));
  assert.equal(await pages[0].getByTestId('chat-send').isDisabled(), true);
  await chat.fill('Xin chào FUCK');
  // Hai submit trong cùng lượt JS; thao tác click qua driver có thể chậm hơn 1 giây ở WebGL headless.
  await pages[0].evaluate(() => {
    const form = document.querySelector('[data-testid="chat-input"]').closest('form');
    form.requestSubmit(); form.requestSubmit();
  });
  assert.match(await pages[0].getByTestId('social-error').textContent(), /1 tin mỗi giây|nhập nội dung/);
  await Promise.all(pages.map(page => page.waitForFunction(() =>
    document.querySelector('[data-testid="chat-messages"]')?.textContent.includes('Xin chào ****'))));
  for (const page of pages) assert.equal(await page.getByTestId('chat-messages').locator('p').count(), 1);
  await pages[0].waitForTimeout(1100);
  await chat.fill('<img src=x onerror=alert(1)>');
  await pages[0].getByTestId('chat-send').click();
  await Promise.all(pages.map(page => page.waitForFunction(() =>
    document.querySelectorAll('[data-testid="chat-messages"] p').length === 2)));
  for (const page of pages) assert.equal(await page.getByTestId('chat-messages').locator('img').count(), 0);
  await chat.focus(); await pages[0].keyboard.press('1');
  assert.equal(await pages[0].getByTestId('participants').locator(`li[data-peer="${ids[0]}"]`).getAttribute('data-emote'), '');
  await pages[0].evaluate(() => document.activeElement?.blur());
  for (const [i, kind] of ['wave', 'laugh', 'nod', 'clap'].entries()) {
    if (i === 0 || i === 3) await pages[0].getByTestId(`emote-${kind}`).click();
    else await pages[0].keyboard.press(String(i + 1));
    await Promise.all(pages.map(page => page.waitForFunction(({ peer, kind }) =>
      document.querySelector(`[data-testid="participants"] li[data-peer="${peer}"]`)?.getAttribute('data-emote') === kind,
      { peer: ids[0], kind })));
    if (i === 0 && process.env.RENDER_3D === '1') {
      await mkdir('artifacts', { recursive: true });
      await pages[0].screenshot({ path: 'artifacts/phase3-social.png' });
    }
    await pages[0].waitForTimeout(550);
  }
  console.log('PASS: Chat P2P, lọc từ, giới hạn tốc độ/độ dài, tin xếp chồng và 4 emote.');
  await Promise.all(pages.map(page => page.waitForFunction(() =>
    document.querySelectorAll('[data-testid="chat-messages"] p').length === 0, undefined, { timeout: 10000 })));
  console.log('PASS: Bong bóng tự hết hạn; phím emote không kích hoạt khi gõ chat.');
  if (process.env.RENDER_3D === '1') {
    await mkdir('artifacts', { recursive: true });
    await pages[0].screenshot({ path: 'artifacts/phase2-room.png' });
  }
  await Promise.all([pages[1].getByTestId('seat-0').click(), pages[2].getByTestId('seat-0').click()]);
  await pages[0].waitForFunction(() => JSON.parse(document.querySelector('[data-testid="snapshot"]').getAttribute('data-seats'))[0] !== null);
  const winner = (await seats(pages[0]))[0];
  assert.ok([ids[1], ids[2]].includes(winner));
  await Promise.all(pages.map(page => waitSeat(page, 0, winner)));
  console.log('PASS: Tranh ghế, tất cả peer đồng ý một người thắng.');
  const winnerIndex = ids.indexOf(winner);
  await pages[winnerIndex].getByTestId('stand').click();
  await Promise.all(pages.map(page => waitSeat(page, 0, null)));
  await exerciseTable(pages, ids, waitSeat);
  await pages[0].getByTestId('stand').click();
  await Promise.all(pages.map(page => waitSeat(page, 2, null)));
  await Promise.all(pages.map(async page => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('w'); await page.waitForTimeout(1200); await page.keyboard.up('w');
  }));
  await pages[0].waitForTimeout(4500);
  for (const page of pages) {
    const [sent, received] = (await page.getByTestId('pose-count').textContent()).split('/').map(Number);
    assert.ok(sent > 0 && received > 0);
  }
  console.log('PASS: Mọi peer đều gửi và nhận vị trí.');
  const beforeIdle = await Promise.all(pages.map(page => page.getByTestId('pose-count').textContent()));
  await pages[0].waitForTimeout(5000);
  const afterIdle = await Promise.all(pages.map(page => page.getByTestId('pose-count').textContent()));
  assert.deepEqual(afterIdle, beforeIdle);
  console.log('PASS: Đứng yên thì ngừng gửi gói vị trí.');
  const recoveryTable = await prepareHostRecovery(pages, ids, waitSeat);
  await pages[0].getByTestId('leave').click();
  await Promise.all(pages.slice(1).map(page => waitText(page, 'host-id', ids[1])));
  await verifyHostRecovery(pages.slice(1), recoveryTable);
  console.log('PASS: Host rời chủ động, người vào thứ hai được bầu.');
  await contexts[1].close();
  await Promise.all(pages.slice(2).map(page => waitText(page, 'host-id', ids[2], 60000)));
  await verifyHostRecovery(pages.slice(2), recoveryTable);
  console.log('PASS: Host đóng đột ngột, người vào sớm nhất còn sống được bầu.');
  console.log('PASS: Trà, bánh, đồ cầm và số thứ tự yêu cầu được giữ qua hai lần đổi host.');
} catch (error) {
  for (let i = 0; i < pages.length; i++) if (!pages[i].isClosed()) {
    console.error(`Peer ${i + 1}:`, await pages[i].locator('[role="status"]').allTextContents(), {
      members: await pages[i].getByTestId('member-count').textContent().catch(() => '?'),
      connections: await pages[i].getByTestId('connection-count').textContent().catch(() => '?'),
    });
  }
  throw error;
} finally {
  // Rời phòng rõ ràng nếu test còn mở; lease xử lý phần còn lại.
  await Promise.allSettled(pages.filter(page => !page.isClosed()).map(async page => {
    const leave = page.getByTestId('leave'); if (await leave.count()) await leave.click();
  }));
  await browser.close();
}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await runPeerTest();
