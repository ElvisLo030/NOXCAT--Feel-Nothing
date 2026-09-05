import { expect, test } from '@playwright/test';

test('perspective collider activates at visible contact depth and sweeps its handoff', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One deterministic live Phaser integration covers the projection handoff');

  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  await page.evaluate(() => {
    const hook = window.__NOXCAT_TEST__;
    hook?.pauseAttacksForVisualTest();
    hook?.spawnPerspectiveProbeForTest(false);
  });

  const far = await page.evaluate(() => ({
    session: window.__NOXCAT_TEST__?.snapshot(),
    projectile: window.__NOXCAT_TEST__?.projectileSnapshot().find((item) => item.isDamage),
  }));
  expect(far.session?.lives).toBe(3);
  expect(far.projectile?.collisionActive).toBe(false);
  // While depth is remote, authored/world motion is deliberately separate
  // from the rendered perspective centre and must not be collision-active.
  expect(Math.hypot(
    (far.projectile?.visibleX ?? 0) - (far.projectile?.x ?? 0),
    (far.projectile?.visibleY ?? 0) - (far.projectile?.y ?? 0),
  )).toBeGreaterThan(100);

  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().some((item) => item.isDamage && item.collisionActive)
  ), undefined, { timeout: 1_500 });
  const near = await page.evaluate(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().find((item) => item.isDamage && item.collisionActive)
  ));
  expect(near?.previousCollisionActive).toBe(true);
  expect(near?.visibleX).toBeCloseTo(near?.x ?? Number.NaN, 5);
  expect(near?.visibleY).toBeCloseTo(near?.y ?? Number.NaN, 5);

  await page.evaluate(() => window.__NOXCAT_TEST__?.pauseAttacksForVisualTest());
  await page.waitForFunction(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot().every((item) => !item.isDamage)
  ));
  // Spawn and snapshot in the same browser task: the intentionally tiny
  // 20 ms depth window can otherwise complete between two Playwright calls.
  const beforeHandoff = await page.evaluate(() => {
    const hook = window.__NOXCAT_TEST__;
    hook?.spawnPerspectiveProbeForTest(true);
    return {
      lives: hook?.snapshot().lives,
      projectile: hook?.projectileSnapshot().find((item) => item.isDamage),
    };
  });
  expect(beforeHandoff.lives).toBe(3);
  expect(beforeHandoff.projectile?.collisionActive).toBe(false);

  // At 4,000 px/s and a 20 ms perspective clock, the first contact-depth frame
  // finishes beyond the combined hit radius. This life loss therefore proves
  // the exact handoff-to-end swept segment is used rather than its endpoint.
  await page.waitForFunction(
    () => window.__NOXCAT_TEST__?.snapshot().lives === 2,
    undefined,
    { timeout: 1_500 },
  );
});
