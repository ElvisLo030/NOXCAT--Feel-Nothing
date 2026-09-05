import { expect, test } from '@playwright/test';

test('near-plane cards accelerate and recycle independently beyond the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One deterministic Phaser integration covers outbound lifecycle');

  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  await page.evaluate(() => window.__NOXCAT_TEST__?.pauseAttacksForVisualTest());
  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().length === 0
  ));
  await page.evaluate(() => window.__NOXCAT_TEST__?.spawnExitProbesForTest());

  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().some((item) => (
      item.kind === 'paper' && item.continuingOffscreen
    ))
  ), undefined, { timeout: 1_500 });
  const near = await page.evaluate(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().find((item) => (
      item.kind === 'paper' && item.continuingOffscreen
    ))
  ));
  const nearSpeed = Math.hypot(near?.vx ?? 0, near?.vy ?? 0);
  expect(near?.collisionActive).toBe(true);
  expect(near?.visibleX).toBeCloseTo(near?.x ?? Number.NaN, 5);
  expect(near?.visibleY).toBeCloseTo(near?.y ?? Number.NaN, 5);
  expect(nearSpeed).toBeGreaterThanOrEqual(760);
  expect(near?.vx).toBeLessThan(0);
  expect(near?.vy).toBeGreaterThan(0);

  await page.waitForFunction((speed) => {
    const paper = window.__NOXCAT_TEST__?.projectileSnapshot().find((item) => (
      item.kind === 'paper' && item.continuingOffscreen
    ));
    return paper != null && Math.hypot(paper.vx, paper.vy) >= speed + 20;
  }, nearSpeed, { timeout: 500 });
  const later = await page.evaluate(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().find((item) => (
      item.kind === 'paper' && item.continuingOffscreen
    ))
  ));
  expect(later).toBeDefined();
  expect(later?.visibleY).toBeGreaterThan(near?.visibleY ?? 0);
  expect(Math.hypot(later?.vx ?? 0, later?.vy ?? 0)).toBeGreaterThanOrEqual(nearSpeed);

  // The faster paper leaves and is recycled while the later comment keeps
  // moving. This guards against the former whole-wave fade/recycle behavior.
  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().length === 1
      && window.__NOXCAT_TEST__?.projectileSnapshot()[0]?.kind === 'comment'
  ), undefined, { timeout: 1_000 });
  const survivor = await page.evaluate(() => window.__NOXCAT_TEST__?.projectileSnapshot()[0]);
  expect(survivor?.kind).toBe('comment');

  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().length === 0
  ), undefined, { timeout: 1_000 });
});
