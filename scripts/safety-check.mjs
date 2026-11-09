import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function prepareSafetyContext(context) {
  await context.addInitScript(() => {
    window.__failOffers = 0;
    const Native = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Native {
      async createOffer(...args) {
        if (!this.getTransceivers().length && window.__failOffers > 0) {
          window.__failOffers--; throw new DOMException('Mô phỏng WebRTC tạo offer thất bại', 'OperationError');
        }
        return super.createOffer(...args);
      }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (this instanceof PannerNode && args[0] instanceof GainNode) { this.__gain = args[0]; this.__active = true; }
      return connect.apply(this, args);
    };
    const disconnect = AudioNode.prototype.disconnect;
    AudioNode.prototype.disconnect = function (...args) {
      if (this instanceof PannerNode) this.__active = false;
      return disconnect.apply(this, args);
    };
  });
}
async function voiceCount(page, count) {
  await page.waitForFunction(n => document.querySelector('[data-testid="voice-count"]')?.textContent === String(n), count, { timeout: 45000 });
}
export async function exerciseSafety(pages, contexts, ids, waitText, code) {
  const [host, second, third] = pages;
  await host.getByTestId('take-cake').click();
  await Promise.all(pages.map(page => waitText(page, 'cake-count', 11)));
  await Promise.all(pages.map(page => page.getByTestId('voice-mic').click()));
  await Promise.all(pages.map(page => voiceCount(page, 2)));
  try {
    await host.waitForFunction(() => window.__voiceTest.panners.filter(p => p.refDistance === 2 && p.__active && p.__gain?.gain.value > .01).length === 2);
  } catch (error) {
    console.error('Panner QA:', await host.evaluate(() => window.__voiceTest.panners.map(p => ({ reference: p.refDistance, active: p.__active, gain: p.__gain?.gain.value })))); throw error;
  }
  await host.getByTestId(`mute-peer-${ids[1]}`).click();
  await host.waitForFunction(() => window.__voiceTest.panners.filter(p => p.refDistance === 2 && p.__active && p.__gain && p.__gain.gain.value < .001).length === 1);
  assert.equal(await host.getByTestId(`mute-peer-${ids[1]}`).getAttribute('aria-pressed'), 'true');
  await host.getByTestId(`block-peer-${ids[1]}`).click();
  await Promise.all([voiceCount(host, 1), voiceCount(second, 1), voiceCount(third, 2)]);
  await second.getByTestId('chat-input').fill('Tin chỉ người chưa chặn nhìn thấy');
  await second.getByTestId('chat-send').click();
  await third.waitForFunction(() => document.querySelector('[data-testid="chat-messages"]')?.textContent.includes('Tin chỉ người chưa chặn'));
  assert.equal((await host.getByTestId('chat-messages').textContent()).includes('Tin chỉ người chưa chặn'), false);
  await host.getByTestId(`block-peer-${ids[1]}`).click();
  await host.getByTestId(`mute-peer-${ids[1]}`).click();
  await Promise.all(pages.map(page => voiceCount(page, 2)));
  console.log('PASS: Mute làm gain bằng 0; chặn ẩn chat và ngắt voice hai chiều; bỏ chặn nối lại.');

  const initiator = pages[ids.indexOf([...ids].sort().at(-1))];
  await initiator.evaluate(() => {
    window.__failOffers = 1;
    for (const pc of window.__voiceTest.pcs) if (pc.connectionState === 'connected' && !pc.getTransceivers().length) pc.close();
  });
  await initiator.waitForFunction(() => document.querySelector('[data-testid="connection-states"] [data-state="retrying"]'));
  await Promise.all(pages.map(page => waitText(page, 'connection-count', 2, 60000)));
  await Promise.all(pages.map(page => voiceCount(page, 2)));
  console.log('PASS: WebRTC đóng bất ngờ + createOffer lỗi; tự backoff rồi phục hồi data và voice.');
  await initiator.evaluate(() => {
    window.__failOffers = 100;
    for (const pc of window.__voiceTest.pcs) if (pc.connectionState === 'connected' && !pc.getTransceivers().length) pc.close();
  });
  const receivers = pages.filter(page => page !== initiator);
  await Promise.all(receivers.map(page => page.waitForFunction(() => document.querySelector('[data-testid="connection-count"]')?.textContent !== '2')));
  for (const page of receivers) {
    await page.locator('.connection-panel summary').click();
    await page.getByTestId('retry-connections').click();
  }
  await Promise.all(pages.map(page => waitText(page, 'connection-count', 2, 60000)));
  const lowest = pages[ids.indexOf([...ids].sort()[0])];
  assert.equal(await lowest.evaluate(() => window.__voiceTest.pcs.some(pc => pc.connectionState === 'connected'
    && !pc.getTransceivers().length && pc.localDescription?.type === 'offer')), true);
  await initiator.evaluate(() => { window.__failOffers = 0; });
  console.log('PASS: Nút thử lại ở đầu nhận cũng tạo được kết nối khi đầu tạo offer bị lỗi liên tục.');

  await second.reload();
  await waitText(second, 'self-id', ids[1]);
  await Promise.all(pages.map(page => waitText(page, 'connection-count', 2, 60000)));
  assert.equal(await second.getByTestId('host-id').textContent(), ids[0]);
  await second.getByTestId('voice-mic').click();
  await Promise.all(pages.map(page => voiceCount(page, 2)));
  console.log('PASS: Reload tự phục hồi đúng phòng riêng và peer, không cần nhập lại mã mời.');

  await second.context().setOffline(true);
  await second.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.getAttribute('data-status') === 'offline');
  await host.waitForFunction(() => document.querySelector('[data-testid="member-count"]')?.textContent === '2', undefined, { timeout: 40000 });
  await second.context().setOffline(false);
  await Promise.all(pages.map(page => waitText(page, 'member-count', 3, 45000)));
  await Promise.all(pages.map(page => waitText(page, 'connection-count', 2, 60000)));
  assert.equal(await second.getByTestId('self-id').textContent(), ids[1]);
  console.log('PASS: Mất mạng quá lease 20 giây rồi có mạng: tự vào lại đúng phòng bằng khóa phục hồi.');

  const reportResponse = second.waitForResponse(response => response.url().endsWith('/rpc/submit_report'));
  await second.getByTestId(`report-peer-${ids[2]}`).click();
  await second.getByTestId(`report-details-${ids[2]}`).fill('Báo cáo kiểm thử giai đoạn 7');
  await second.getByTestId(`submit-report-${ids[2]}`).click();
  const report = await (await reportResponse).json(); assert.ok(report.id);
  await second.waitForFunction(() => document.querySelector('[data-testid="moderation-message"]')?.textContent.includes('Đã ghi báo cáo'));
  await host.getByTestId(`kick-peer-${ids[2]}`).click(); await host.getByTestId(`confirm-kick-${ids[2]}`).click();
  await third.waitForFunction(() => document.querySelector('[data-testid="network-status"]')?.getAttribute('data-status') === 'removed', undefined, { timeout: 15000 });
  assert.equal(await third.evaluate(() => window.__voiceTest.stream.getAudioTracks().every(track => track.readyState === 'ended')), true);
  await third.getByTestId('leave').click(); await third.getByTestId('invite-input').fill(code); await third.getByTestId('join-code').click();
  await third.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(element => element.textContent.includes('mời khỏi')));
  assert.equal(await third.getByTestId('member-count').count(), 0);
  console.log('PASS: Báo cáo ghi PostgreSQL; host kick dừng mic, không lách bằng peer mới/mã mời.');

  await host.waitForFunction(() => Number(document.querySelector('[data-testid="checkpoint-info"]')?.getAttribute('data-saved-at')) > 0, undefined, { timeout: 40000 });
  const checkpoint = Number(await host.getByTestId('checkpoint-info').getAttribute('data-saved-at'));
  await mkdir('artifacts', { recursive: true });
  await host.locator('.connection-panel summary').click();
  await host.screenshot({ path: 'artifacts/phase7-safety.png' });
  await contexts[0].close();
  await waitText(second, 'host-id', ids[1], 45000);
  await waitText(second, 'cake-count', 11);
  assert.ok(Number(await second.getByTestId('checkpoint-info').getAttribute('data-saved-at')) >= checkpoint);
  await second.reload(); await waitText(second, 'self-id', ids[1]); await waitText(second, 'host-id', ids[1]);
  await waitText(second, 'cake-count', 11);
  console.log('PASS: Tắt host giữa chừng, host mới nạp trạng thái DB; reload vẫn giữ phòng và 11 bánh.');
}
