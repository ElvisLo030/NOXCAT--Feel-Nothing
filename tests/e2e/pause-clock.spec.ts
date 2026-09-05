import { expect, test } from '@playwright/test';

test('touch landscape freezes intro and combat timers until the ready countdown completes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'One deterministic coarse-pointer browser covers the Phaser clock integration');

  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'INTRO');

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.landscape-warning')).toBeVisible();
  const paused = await page.evaluate(() => ({
    state: window.__NOXCAT_TEST__?.snapshot().state,
    elapsedMs: window.__NOXCAT_TEST__?.snapshot().elapsedMs,
  }));

  // Longer than the normal 1.85 s intro delayed call. Without pausing the
  // Phaser Clock the state would become DODGING behind the blocker.
  await page.waitForTimeout(2_200);
  const afterBlockedWait = await page.evaluate(() => ({
    state: window.__NOXCAT_TEST__?.snapshot().state,
    elapsedMs: window.__NOXCAT_TEST__?.snapshot().elapsedMs,
  }));
  expect(afterBlockedWait).toEqual(paused);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.landscape-warning')).toBeHidden();
  await page.waitForTimeout(850);
  expect(await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().state)).toBe('INTRO');

  await page.waitForFunction(
    () => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING',
    undefined,
    { timeout: 4_000 },
  );
});
