import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_LIFETIME, EMOTES, EMOTE_DURATION, SocialState, bubbleOpacity, characterCount, cleanChat } from '../src/network/social.ts';
import { sampleEmote } from '../src/player/emotes.ts';

test('Đếm Unicode, chuẩn hóa tiếng Việt và giới hạn 200 ký tự ở bên nhận', () => {
  assert.equal(characterCount('😀'.repeat(200)), 200);
  assert.equal(characterCount('a\u0301'), 1);
  const state = new SocialState();
  assert.equal(state.accept('a', { type: 'chat', id: 'long', text: '😀'.repeat(201) }, 0), false);
  assert.equal(state.accept('a', { type: 'chat', id: 'max', text: '😀'.repeat(200) }, 0), true);
});
test('Lọc cả từ, không lọc từ dài chứa chuỗi con; bỏ ký tự điều khiển', () => {
  assert.equal(cleanChat('  Xin\nchào   FUCK  '), 'Xin chào ****');
  assert.equal(cleanChat('ĐỊT đụ đéo lồn cặc'), '*** ** *** *** ***');
  assert.equal(cleanChat('classical bookmark'), 'classical bookmark');
  assert.equal(cleanChat('\u202eXin\u200b chào'), 'Xin chào');
});
test('Một tin mỗi giây theo từng peer, bỏ gói trùng, không tiêu quota vì gói hỏng', () => {
  const state = new SocialState();
  assert.equal(state.accept('a', { type: 'chat', id: 'empty', text: '   ' }, 0), false);
  assert.equal(state.accept('a', { type: 'chat', id: 'first', text: 'A' }, 0), true);
  assert.equal(state.accept('a', { type: 'chat', id: 'fast', text: 'B' }, 999), false);
  assert.equal(state.accept('b', { type: 'chat', id: 'first', text: 'B' }, 999), true);
  assert.equal(state.accept('a', { type: 'chat', id: 'first', text: 'A' }, 1000), false);
  assert.equal(state.accept('a', { type: 'chat', id: 'second', text: 'B' }, 1000), true);
  assert.equal(state.view.chats.a.length, 2);
});
test('Bong bóng xếp chồng và tự hết hạn sau đúng 6 giây', () => {
  const state = new SocialState();
  for (let i = 0; i < 6; i++) state.accept('a', { type: 'chat', id: `m-${i}`, text: `${i}` }, i * 1000);
  assert.equal(state.view.chats.a.length, 6);
  assert.equal(bubbleOpacity(0, 4500), 1);
  assert.equal(bubbleOpacity(0, 5250), 0.5);
  assert.equal(bubbleOpacity(0, 6000), 0);
  assert.equal(state.prune(['a'], CHAT_LIFETIME), true);
  assert.equal(state.view.chats.a.length, 5);
  state.prune(['a'], 11000);
  assert.equal(state.view.chats.a, undefined);
});
test('Emote có cooldown riêng, chỉ nhận 4 loại, trở về tư thế nghỉ sau animation', () => {
  const state = new SocialState();
  assert.equal(state.accept('a', { type: 'emote', id: 'bad', kind: 'fly' }, 0), false);
  assert.equal(state.accept('a', { type: 'emote', id: 'wave', kind: 'wave' }, 0), true);
  assert.equal(state.accept('a', { type: 'emote', id: 'fast', kind: 'nod' }, 499), false);
  assert.equal(state.accept('a', { type: 'emote', id: 'nod', kind: 'nod' }, 500), true);
  assert.equal(state.accept('a', { type: 'chat', id: 'chat', text: 'Xin chào' }, 500), true);
  state.prune(['a'], 2300);
  assert.equal(state.view.emotes.a, undefined);
  for (const kind of EMOTES) {
    const emote = { id: 'test', kind, startedAt: 0 };
    const middle = sampleEmote(emote, 450);
    assert.ok(Object.values(middle).some(value => typeof value === 'number' && Math.abs(value) > 0));
    assert.deepEqual(sampleEmote(emote, EMOTE_DURATION[kind]), sampleEmote(undefined, 0));
  }
});
test('Dọn dữ liệu người đã rời và từ chối payload hỏng', () => {
  const state = new SocialState();
  for (const invalid of [null, 1, {}, { type: 'chat', id: 'x', text: {} }, { type: 'chat', id: '<script>', text: 'A' }]) {
    assert.equal(state.accept('a', invalid, 0), false);
  }
  state.accept('a', { type: 'chat', id: 'hello', text: '<img src=x onerror=alert(1)>' }, 0);
  assert.equal(state.view.chats.a[0].text, '<img src=x onerror=alert(1)>');
  state.accept('a', { type: 'emote', id: 'wave', kind: 'wave' }, 0);
  state.prune([], 100);
  assert.deepEqual(state.view, { chats: {}, emotes: {} });
});
