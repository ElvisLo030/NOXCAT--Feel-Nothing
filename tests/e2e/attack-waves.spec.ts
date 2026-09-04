import { expect, test } from '@playwright/test';

test('a wave progresses through a clear recovery before the next pattern', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium wave timing coverage');
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });

  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    return hook?.snapshot().state === 'DODGING' && hook.waveSnapshot().phase === 'TELEGRAPH';
  }, undefined, { timeout: 8_000 });
  const telegraph = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(telegraph).toMatchObject({
    phase: 'TELEGRAPH',
    pattern: 'paper_rain',
    activeProjectileCount: 0,
    activeDangerous: 0,
    safeLane: { axis: 'vertical' },
  });

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'ACTIVE' && wave.pattern === 'paper_rain';
  }, undefined, { timeout: 2_000 });
  const active = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(active?.activeProjectileCount).toBeGreaterThan(0);
  expect(active?.activeDangerous).toBeGreaterThan(0);
  expect(active?.activeDangerous).toBe(active?.activeProjectileCount);
  expect(active?.safeLane).toEqual(telegraph?.safeLane);

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'RECOVERY' && wave.pattern === 'paper_rain';
  }, undefined, { timeout: 8_000 });
  const recovery = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(recovery?.activeDangerous).toBe(0);

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'TELEGRAPH' && wave.pattern === 'returnable_burst';
  }, undefined, { timeout: 2_000 });
  const nextTelegraph = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(nextTelegraph).toMatchObject({
    phase: 'TELEGRAPH',
    pattern: 'returnable_burst',
    activeProjectileCount: 0,
    activeDangerous: 0,
    safeLane: { axis: 'vertical' },
  });
});
