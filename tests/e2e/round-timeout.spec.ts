import { expect, test, type Page } from '@playwright/test';

test('round timeout shows the escaped result and both replay choices work', async ({ page }) => {
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await startBattle(page);
  await expireRound(page);

  await expect(page.getByTestId('result-title')).toHaveText('BOSS ESCAPED', { timeout: 5_000 });
  await expect(page.getByTestId('result-title')).toBeFocused();
  await expect(page.locator('.result-screen')).toHaveClass(/lost/);
  await expect(page.getByTestId('result-eyebrow')).toHaveText('TIME UP');
  await expect(page.getByTestId('result-line')).toHaveText('時間到了，Boss 溜走了。');
  await expect(page.getByTestId('result-line')).not.toHaveText('你終於交出了真正的最終版。');
  await expect(page.locator('[data-stat="time"]')).toHaveText('90.0 秒');
  const retry = page.getByTestId('retry');
  const changeAnnoyance = page.getByTestId('change-annoyance');
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(retry).toHaveText('再挑戰一次');
  await expect(changeAnnoyance).toBeVisible();
  await expect(changeAnnoyance).toBeEnabled();
  await expect(changeAnnoyance).toHaveText('換一個煩惱');
  await expect(page.locator('.result-actions button')).toHaveCount(2);

  await retry.click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  await expireRound(page);
  await expect(page.getByTestId('result-title')).toHaveText('BOSS ESCAPED', { timeout: 5_000 });

  await page.getByTestId('change-annoyance').click();
  await expect(page.getByRole('heading', { name: /NOXCAT FEEL NOTHING/ })).toBeVisible();
});

async function startBattle(page: Page): Promise<void> {
  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
}

async function expireRound(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hook = window.__NOXCAT_TEST__;
    if (!hook) throw new Error('Development test hook is unavailable');
    hook.expireRoundForTest();
  });
}
