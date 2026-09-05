import { expect, test, type Page } from '@playwright/test';

test('a life-loss defeat uses fail copy instead of the victory punchline', async ({ page }) => {
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await startBattle(page);
  await page.evaluate(() => {
    const hook = window.__NOXCAT_TEST__;
    if (!hook) throw new Error('Development test hook is unavailable');
    hook.pauseAttacksForVisualTest();
    hook.overloadForTest();
  });

  await expect(page.getByTestId('result-title')).toHaveText('NOXCAT OVERLOADED', { timeout: 5_000 });
  await expect(page.locator('.result-screen')).toHaveClass(/lost/);
  await expect(page.getByTestId('result-eyebrow')).toHaveText('ROUND FAILED');
  await expect(page.getByTestId('result-line')).toHaveText('煩惱把果凍貓壓垮了，再玩一次');
  await expect(page.getByTestId('result-line')).not.toHaveText('你終於交出了真正的最終版。');
  const background = await page.locator('.result-screen').evaluate((element) => (
    getComputedStyle(element).backgroundImage
  ));
  expect(background).toContain('255, 92, 122');
  expect(background).not.toContain('156, 211, 30');
  await expect(page.getByTestId('retry')).toBeVisible();
  await expect(page.getByTestId('change-annoyance')).toBeVisible();
});

async function startBattle(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
}
