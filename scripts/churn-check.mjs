import assert from 'node:assert/strict';

export async function exerciseChurn(pages, contexts, waitText, code) {
  const rounds = Number(process.env.CHURN_ROUNDS || 3);
  if (!Number.isInteger(rounds) || rounds < 2 || rounds > 6) throw new Error('CHURN_ROUNDS phải từ 2 đến 6');
  assert.equal(pages.length, 10, 'Churn dùng đúng 10 người');
  await pages[0].getByTestId('take-cake').click();
  await Promise.all(pages.map(page => waitText(page, 'cake-count', 11)));
  for (let round = 0; round < rounds; round++) {
    // Chín người rời cùng lúc; host còn lại giữ phòng và đồ vật.
    await Promise.all(pages.slice(1).map(page => page.getByTestId('leave').click()));
    await waitText(pages[0], 'member-count', 1, 30000); await waitText(pages[0], 'connection-count', 0, 15000);
    await Promise.all(pages.slice(1).map(async page => {
      await page.getByTestId('invite-input').fill(code); await page.getByTestId('join-code').click();
      await page.getByTestId('snapshot').waitFor();
    }));
    await Promise.all(pages.map(page => waitText(page, 'member-count', 10, 45000)));
    await Promise.all(pages.map(page => waitText(page, 'connection-count', 9, 90000)));
    await Promise.all(pages.map(page => waitText(page, 'cake-count', 11)));
    const ids = await Promise.all(pages.map(page => page.getByTestId('self-id').textContent()));
    assert.equal(new Set(ids).size, 10);
    for (const page of pages) {
      const values = await page.getByTestId('connection-states').locator('li').evaluateAll(items => items.map(item => item.dataset.state));
      assert.equal(values.length, 9); assert.ok(values.every(value => value === 'connected'));
    }
    console.log(`PASS: Vòng ${round + 1}/${rounds}: 9 người rời/vào đồng thời, đủ 10 người/45 link, giữ 11 bánh.`);
  }
  const nextHost = await pages[1].getByTestId('self-id').textContent();
  // Thứ tự Promise join không đảm bảo page[1] vào sớm nhất; lấy join_order của danh sách UI.
  const expected = await pages[0].getByTestId('participants').locator('li').nth(1).getAttribute('data-peer');
  assert.ok(nextHost);
  await pages[0].waitForFunction(() => Number(document.querySelector('[data-testid="checkpoint-info"]')?.getAttribute('data-saved-at')) > 0, undefined, { timeout: 40000 });
  await contexts[0].close();
  await Promise.all(pages.slice(1).map(page => waitText(page, 'host-id', expected, 45000)));
  await Promise.all(pages.slice(1).map(page => waitText(page, 'member-count', 9, 45000)));
  await Promise.all(pages.slice(1).map(page => waitText(page, 'connection-count', 8, 45000)));
  await Promise.all(pages.slice(1).map(page => waitText(page, 'cake-count', 11)));
  console.log('PASS: Sau churn tắt host bất ngờ; 9 người còn lại thống nhất host sớm nhất và giữ snapshot.');
}
