import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

export async function readTable(page) {
  return JSON.parse(await page.getByTestId('table-state').getAttribute('data-json'));
}
export async function waitTable(page, path, value) {
  await page.waitForFunction(({ path, value }) => {
    const raw = document.querySelector('[data-testid="table-state"]')?.getAttribute('data-json');
    if (!raw) return false;
    return path.split('.').reduce((current, key) => current?.[key], JSON.parse(raw)) === value;
  }, { path, value }, { timeout: 25000, polling: 100 });
}

export async function exerciseTable(pages, ids, waitSeat) {
  const all = (path, value) => Promise.all(pages.map(page => waitTable(page, path, value)));
  await all('pot.ml', 2400);
  await pages[1].getByTestId('seat-1').click();
  await pages[2].getByTestId('seat-3').click();
  await Promise.all(pages.map(async page => { await waitSeat(page, 1, ids[1]); await waitSeat(page, 3, ids[2]); }));
  await Promise.all([0, 1].map(i => pages[i].evaluate(() => document.querySelector('[data-testid="tea-pour"]').click())));
  await all('pot.ml', 2250);
  const afterRace = await readTable(pages[0]);
  assert.equal(afterRace.cups[1].toMl + afterRace.cups[2].toMl, 150);
  console.log('PASS: Hai người dùng cùng ấm, chỉ một lần rót được trừ.');
  if (afterRace.cups[2].toMl === 0) {
    await pages[0].getByTestId('tea-pour').click();
    await all('cups.2.toMl', 150);
  }
  await pages[0].getByTestId('tea-offer-1').click();
  await all('cups.3.toMl', 150);
  const afterOffer = await readTable(pages[0]);
  assert.equal(afterOffer.actions[ids[0]].kind, 'offer');
  const hostRequest = afterOffer.lastRequests[ids[0]];
  assert.ok(hostRequest.seq > 0);
  console.log('PASS: Mời người ở ghế cạnh, mọi peer nhận cùng mực trà.');
  if (process.env.RENDER_3D === '1') {
    await mkdir('artifacts', { recursive: true });
    await pages[0].screenshot({ path: 'artifacts/phase4-tea.png' });
  }
  await pages[0].getByTestId('tea-drink').click();
  await all('cups.2.toMl', 70);
  assert.equal((await readTable(pages[0])).cups[2].fromMl, 150);
  await pages[0].getByTestId('tea-dump').click();
  await all('cups.2.toMl', 0);
  await pages[0].getByTestId('take-cake').click();
  await all('hands.2', 'cake'); await all('plate.cake', 11);
  await pages[0].getByTestId('snack-eat').click();
  await all('hands.2', null); await all('plate.cake', 11);
  await pages[0].getByTestId('take-candy').click();
  await all('hands.2', 'candy'); await all('plate.candy', 15);
  await pages[0].getByTestId('snack-throw').click();
  await all('hands.2', null); await all('plate.candy', 15);
  await Promise.all([pages[1].getByTestId('take-cake').click(), pages[2].getByTestId('take-cake').click()]);
  await all('plate.cake', 9); await all('hands.1', 'cake'); await all('hands.3', 'cake');
  const expected = await readTable(pages[0]);
  for (const page of pages) assert.deepEqual(await readTable(page), expected);
  console.log('PASS: Uống, đổ, lấy/ăn/vứt bánh kẹo; lấy đồng thời không mất cập nhật.');
  assert.match(await pages[0].getByTestId('sound-toggle').textContent(), /Âm thanh: bật/);
  for (const page of pages.slice(1, 3)) {
    await page.waitForFunction(() => !document.querySelector('[data-testid="stand"]').disabled);
    await page.getByTestId('stand').evaluate(button => button.click());
  }
  await Promise.all(pages.map(async page => { await waitSeat(page, 1, null); await waitSeat(page, 3, null); }));
  await all('hands.1', null); await all('hands.3', null); await all('cups.3.toMl', 0);
  console.log('PASS: Đổi/rời ghế dọn ly và đồ cầm, không làm đầy lại đĩa.');
}

export async function prepareHostRecovery(pages, ids, waitSeat) {
  await pages[2].getByTestId('seat-3').click();
  await Promise.all(pages.map(page => waitSeat(page, 3, ids[2])));
  await pages[2].getByTestId('tea-pour').click();
  await Promise.all(pages.map(page => waitTable(page, 'cups.3.toMl', 150)));
  await pages[2].getByTestId('take-candy').click();
  await Promise.all(pages.map(page => waitTable(page, 'hands.3', 'candy')));
  return readTable(pages[2]);
}

export async function verifyHostRecovery(pages, expected) {
  for (const page of pages) {
    await waitTable(page, 'cups.3.toMl', 150);
    await waitTable(page, 'hands.3', 'candy');
    const table = await readTable(page);
    assert.deepEqual(table.plate, expected.plate);
    assert.equal(table.pot.ml, expected.pot.ml);
    assert.deepEqual(table.lastRequests, Object.fromEntries(Object.entries(expected.lastRequests)
      .filter(([peer]) => table.lastRequests[peer])));
  }
}
