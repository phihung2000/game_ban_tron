import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function fakeMicrophoneFile() {
  await mkdir('artifacts', { recursive: true });
  const rate = 48000, count = rate * 4, bytes = count * 2, wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate, frequency = 155 + 35 * Math.sin(t * 3);
    const envelope = 0.28 + 0.25 * Math.sin(t * 11) ** 2;
    const value = envelope * (Math.sin(t * frequency * 2 * Math.PI) * 0.55
      + Math.sin(t * frequency * 4 * Math.PI) * 0.25 + Math.sin(t * 730 * Math.PI * 2) * 0.2);
    wav.writeInt16LE(Math.round(value * 28000), 44 + i * 2);
  }
  const path = resolve('artifacts/fake-microphone.wav'); await writeFile(path, wav); return path;
}

export async function prepareVoiceContext(context) {
  await context.grantPermissions(['microphone']);
  await context.addInitScript(() => {
    const qa = { denied: false, missing: false, calls: 0, stream: null, requests: [], pcs: [], panners: [] };
    window.__voiceTest = qa;
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      qa.calls++; qa.requests.push(constraints);
      if (qa.denied) throw new DOMException('Denied by QA', 'NotAllowedError');
      if (qa.missing) throw new DOMException('Missing device by QA', 'NotFoundError');
      const stream = await capture(constraints); qa.stream = stream; return stream;
    };
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(...args) { super(...args); qa.pcs.push(this); }
    };
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      createPanner() { const panner = super.createPanner(); qa.panners.push(panner); return panner; }
    };
  });
}

async function waitCount(page, count) {
  await page.waitForFunction(count => document.querySelector('[data-testid="voice-count"]')?.textContent === String(count), count,
    { timeout: 40000, polling: 100 });
}
async function micState(page, enabled) {
  await page.waitForFunction(enabled => document.querySelector('[data-testid="voice-panel"]')?.getAttribute('data-mic') === String(enabled), enabled);
}
async function move(page, keys, ms) {
  await page.evaluate(() => document.activeElement?.blur());
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
}
export async function exerciseVoice(pages, ids, waitSeat) {
  for (const page of pages) assert.equal(await page.evaluate(() => window.__voiceTest.calls), 0);
  await pages[0].getByTestId('voice-listen').click();
  assert.equal(await pages[0].evaluate(() => window.__voiceTest.calls), 0);
  await pages[0].evaluate(() => { window.__voiceTest.denied = true; });
  await pages[0].getByTestId('voice-mic').click();
  await pages[0].waitForFunction(() => document.querySelector('[data-testid="voice-error"]')?.textContent.includes('chưa cho phép'));
  await micState(pages[0], false);
  await pages[0].evaluate(() => { window.__voiceTest.denied = false; });
  if (pages.length > 11) await Promise.all(pages.map(page => page.getByTestId('voice-limit').selectOption('12')));
  await Promise.all(pages.map(page => page.getByTestId('voice-mic').click()));
  await Promise.all(pages.map(page => micState(page, true)));
  await Promise.all(pages.map(page => waitCount(page, pages.length - 1)));
  console.log('PASS: Chỉ nghe không xin mic; từ chối quyền có thông báo; bật lại kết nối voice gần nhau.');
  await Promise.all(pages.map(page => page.waitForFunction(async () => {
    const pcs = window.__voiceTest.pcs.filter(pc => pc.connectionState === 'connected' && pc.getTransceivers().length);
    const reports = await Promise.all(pcs.map(pc => pc.getStats()));
    return reports.some(report => [...report.values()].some(stat => stat.type === 'inbound-rtp'
      && stat.kind === 'audio' && stat.bytesReceived > 100));
  }, undefined, { timeout: 30000, polling: 200 })));
  await Promise.all(pages.map(page => page.waitForFunction(() =>
    Number(document.querySelector('[data-testid="voice-up"]')?.textContent) > 0
    && Number(document.querySelector('[data-testid="voice-down"]')?.textContent) > 0, undefined, { timeout: 15000 })));
  for (const page of pages) {
    const spatial = await page.evaluate(() => window.__voiceTest.panners.some(p =>
      p.panningModel === 'HRTF' && p.distanceModel === 'inverse' && p.refDistance === 2));
    assert.equal(spatial, true, JSON.stringify(await page.evaluate(() => ({
      panners: window.__voiceTest.panners.map(p => ({ model: p.panningModel, distance: p.distanceModel, reference: p.refDistance })),
      constructor: window.AudioContext.name,
    }))));
  }
  await Promise.all(pages.map(page => page.waitForFunction(peer =>
    document.querySelector(`[data-testid="participants"] li[data-peer="${peer}"]`)?.getAttribute('data-speaking') === 'true', ids[0],
    { timeout: 20000 })));
  console.log('PASS: Audio RTP thật truyền/nhận, PannerNode HRTF, biểu tượng nói và băng thông getStats.');
  if (process.env.RENDER_3D === '1') {
    await mkdir('artifacts', { recursive: true }); await pages[0].screenshot({ path: 'artifacts/phase5-voice.png' });
  }
  await pages[0].getByTestId('voice-mic').click(); await micState(pages[0], false);
  assert.equal(await pages[0].evaluate(() => window.__voiceTest.stream.getAudioTracks().every(t => t.readyState === 'ended')), true);
  await pages[0].waitForFunction(() => window.__voiceTest.pcs.filter(pc => pc.connectionState === 'connected' && pc.getTransceivers().length)
    .every(pc => pc.getSenders().every(sender => sender.track === null)));
  assert.equal(await pages[0].getByTestId('voice-count').textContent(), String(pages.length - 1));
  await pages[0].getByTestId('voice-mic').click(); await micState(pages[0], true);
  await pages[0].evaluate(() => { window.__voiceOldTrack = window.__voiceTest.stream.getAudioTracks()[0]; });
  await pages[0].getByTestId('voice-device').selectOption('default');
  await pages[0].waitForFunction(() => window.__voiceOldTrack.readyState === 'ended'
    && window.__voiceTest.stream.getAudioTracks()[0].id !== window.__voiceOldTrack.id);
  await pages[0].evaluate(() => { window.__voiceTest.missing = true; });
  await pages[0].getByTestId('voice-device').selectOption('default');
  await pages[0].waitForFunction(() => document.querySelector('[data-testid="voice-error"]')?.textContent.includes('Vẫn đang dùng micro cũ'));
  await micState(pages[0], true);
  await pages[0].evaluate(() => { window.__voiceTest.missing = false; });
  console.log('PASS: Tắt mic dừng capture/RTP sender, vẫn nghe được; đổi track và giữ mic cũ khi đổi thất bại.');
  await move(pages[2], ['d', 's'], 6000);
  await waitCount(pages[2], 0);
  await Promise.all(pages.filter((_, i) => i !== 2).map(page => page.waitForFunction(peer =>
    !JSON.parse(document.querySelector('[data-testid="voice-panel"]').getAttribute('data-connected')).includes(peer), ids[2])));
  for (const page of pages) assert.equal(await page.getByTestId('connection-count').textContent(), String(pages.length - 1));
  await move(pages[2], ['a', 'w'], 5650);
  await Promise.all(pages.map(page => waitCount(page, pages.length - 1)));
  console.log('PASS: Đi xa ngắt audio, đi gần nối lại; các DataChannel vẫn giữ nguyên.');
  await Promise.all(pages.map(page => page.getByTestId('voice-limit').selectOption('8')));
  await pages[0].waitForTimeout(2000);
  for (const page of pages) {
    assert.ok(Number(await page.getByTestId('voice-panel').getAttribute('data-links')) <= 8);
    assert.ok(Number(await page.getByTestId('voice-count').textContent()) <= 8);
  }
  await pages[0].getByTestId('stand').click();
  await Promise.all(pages.map(page => waitSeat(page, 2, null)));
  const seated = Math.min(8, pages.length);
  for (let i = 0; i < seated; i++) {
    await pages[i].getByTestId(`seat-${i}`).click();
    await Promise.all(pages.map(page => waitSeat(page, i, ids[i])));
  }
  await Promise.all(pages.slice(0, seated).map((page, i) => page.waitForFunction(({ ids, self }) => {
    const connected = JSON.parse(document.querySelector('[data-testid="voice-panel"]').getAttribute('data-connected'));
    return ids.filter(id => id !== self).every(id => connected.includes(id));
  }, { ids: ids.slice(0, seated), self: ids[i] }, { timeout: 30000 })));
  console.log('PASS: Không vượt trần 8, ưu tiên đủ người cùng bàn.');
  await pages[0].getByTestId('voice-leave').click();
  await waitCount(pages[0], 0); await micState(pages[0], false);
  assert.equal(await pages[0].evaluate(() => window.__voiceTest.stream.getAudioTracks().every(t => t.readyState === 'ended')), true);
  console.log('PASS: Rời voice giải phóng micro và toàn bộ audio connection.');
  await pages[0].getByTestId('leave').click();
  await Promise.all(pages.slice(1).map(page => page.waitForFunction(host =>
    document.querySelector('[data-testid="host-id"]')?.textContent === host, ids[1], { timeout: 15000 })));
  assert.equal(await pages[1].getByTestId('voice-panel').getAttribute('data-mic'), 'true');
  await pages[2].getByTestId('leave').click();
  assert.equal(await pages[2].evaluate(() => window.__voiceTest.stream.getAudioTracks().every(t => t.readyState === 'ended')), true);
  await pages[1].waitForFunction(peer => !JSON.parse(document.querySelector('[data-testid="voice-panel"]')
    .getAttribute('data-connected')).includes(peer), ids[2]);
  console.log('PASS: Đổi host không tắt mic người còn lại; rời phòng tự dừng thu âm.');
}
