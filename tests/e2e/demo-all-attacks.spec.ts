import { expect, test } from '@playwright/test';

import { demoPatternOrder } from '../../src/game/demoBattle';

test('development showcase wires all nine attacks into one browser battle', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One browser integration covers the development-only sequence');

  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1&demo=all');
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');

  const visited = await page.evaluate((count) => {
    const hook = window.__NOXCAT_TEST__;
    if (!hook) return [];
    const patterns = [hook.waveSnapshot().pattern];
    for (let index = 1; index < count; index += 1) {
      hook.advanceAttackForTest();
      patterns.push(hook.waveSnapshot().pattern);
    }
    return patterns;
  }, demoPatternOrder().length);

  expect(visited).toEqual(demoPatternOrder());
});
