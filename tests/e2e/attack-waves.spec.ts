import { expect, test } from '@playwright/test';
import { FALLBACK_BOSS } from '../../src/ai/fallbackBoss';

test('comment crossfire visibly enters through a left or right wall portal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic wall-portal timing coverage');
  await page.route('**/api/boss', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      source: 'fallback',
      boss: {
        ...FALLBACK_BOSS,
        attacks: [
          { pattern: 'comment_crossfire', intensity: 3, durationMs: 4_500 },
          FALLBACK_BOSS.attacks[0],
          FALLBACK_BOSS.attacks[1],
        ],
      },
    }),
  }));
  await page.goto('/?debug=1');
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });

  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    if (hook?.waveSnapshot().pattern !== 'comment_crossfire') return false;
    return hook.projectileSnapshot().some((projectile) => (
      projectile.kind === 'comment'
      && projectile.tunnelDepth < 0.22
      && (projectile.visibleX < 40 || projectile.visibleX > 500)
    ));
  }, undefined, { timeout: 6_000 });
  const portalEntry = await page.evaluate(() => window.__NOXCAT_TEST__?.projectileSnapshot()
    .find((projectile) => (
      projectile.kind === 'comment'
      && projectile.tunnelDepth < 0.22
      && (projectile.visibleX < 40 || projectile.visibleX > 500)
    )));
  expect(portalEntry).toBeDefined();

  await page.waitForFunction(() => window.__NOXCAT_TEST__?.projectileSnapshot().some(
    (projectile) => projectile.kind === 'comment'
      && projectile.tunnelDepth > 0.55
      && projectile.tunnelDepth < 0.9
      && projectile.visibleX > 40
      && projectile.visibleX < 500,
  ), undefined, { timeout: 2_000 });
});

test('a wave progresses through a clear recovery before the next pattern', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium wave timing coverage');
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });

  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    return hook?.snapshot().state === 'DODGING' && hook.waveSnapshot().phase === 'TELEGRAPH';
  }, undefined, { timeout: 12_000 });
  const telegraph = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(telegraph).toMatchObject({
    phase: 'TELEGRAPH',
    pattern: 'paper_rain',
    activeProjectileCount: 0,
    activeDangerous: 0,
    safeLane: { axis: 'vertical' },
  });
  const [canvasBox, cat] = await Promise.all([
    page.locator('canvas').boundingBox(),
    page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot()),
  ]);
  if (!canvasBox || !cat || telegraph?.safeLane?.center == null) {
    throw new Error('Canvas, NOXCAT, or paper safe lane unavailable');
  }
  const screenPoint = (x: number, y: number) => ({
    x: canvasBox.x + canvasBox.width * (x / 540),
    y: canvasBox.y + canvasBox.height * (y / 960),
  });
  const start = screenPoint(cat.x, cat.y + 72);
  const safeTarget = screenPoint(telegraph.safeLane.center, 892);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(safeTarget.x, safeTarget.y, { steps: 5 });

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'ACTIVE' && wave.pattern === 'paper_rain';
  }, undefined, { timeout: 2_000 });
  const activeSample = await page.evaluate(() => ({
    wave: window.__NOXCAT_TEST__?.waveSnapshot(),
    elapsedMs: window.__NOXCAT_TEST__?.snapshot().elapsedMs,
  }));
  const active = activeSample.wave;
  expect(active?.activeProjectileCount).toBeGreaterThan(0);
  expect(active?.activeDangerous).toBeGreaterThan(0);
  expect(active?.activeDangerous).toBe(active?.activeProjectileCount);
  expect(active?.safeLane).toEqual(telegraph?.safeLane);

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'RECOVERY' && wave.pattern === 'paper_rain';
  }, undefined, { timeout: 12_000 });
  await page.mouse.up();
  const recoverySample = await page.evaluate(() => ({
    wave: window.__NOXCAT_TEST__?.waveSnapshot(),
    elapsedMs: window.__NOXCAT_TEST__?.snapshot().elapsedMs,
  }));
  const recovery = recoverySample.wave;
  expect(recovery?.activeDangerous).toBe(0);
  // The fallback paper step allocates 5,640 ms to ACTIVE, but its last hostile
  // leaves earlier. Director must not burn the empty tail of that allocation.
  expect((recoverySample.elapsedMs ?? 0) - (activeSample.elapsedMs ?? 0)).toBeLessThan(5_400);
  const recoveryObservedAt = performance.now();

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'TELEGRAPH' && wave.pattern === 'returnable_burst';
  }, undefined, { timeout: 1_000 });
  expect(performance.now() - recoveryObservedAt).toBeLessThan(800);
  const nextTelegraph = await page.evaluate(() => window.__NOXCAT_TEST__?.waveSnapshot());
  expect(nextTelegraph).toMatchObject({
    phase: 'TELEGRAPH',
    pattern: 'returnable_burst',
    activeProjectileCount: 0,
    activeDangerous: 0,
    safeLane: { axis: 'vertical' },
  });

  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.phase === 'ACTIVE'
      && wave.pattern === 'returnable_burst'
      && wave.activeProjectileCount === 3;
  }, undefined, { timeout: 2_000 });
  const opening = await page.evaluate(() => window.__NOXCAT_TEST__?.projectileSnapshot());
  expect(opening).toHaveLength(3);
  expect(opening?.every((projectile) => projectile.kind === 'paper')).toBe(true);

  // The ordinary teaching volley is explicitly cleared before the marked
  // document appears. This zero-danger beat is the player's visual reset.
  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    const wave = hook?.waveSnapshot();
    return wave?.phase === 'ACTIVE'
      && wave.pattern === 'returnable_burst'
      && wave.activeDangerous === 0;
  }, undefined, { timeout: 2_000 });
  await page.waitForFunction(() => {
    const projectiles = window.__NOXCAT_TEST__?.projectileSnapshot() ?? [];
    return projectiles.length === 1 && projectiles[0]?.kind === 'returnable';
  }, undefined, { timeout: 1_000 });
  const interactionWindow = await page.evaluate(() => (
    window.__NOXCAT_TEST__?.projectileSnapshot()
  ));
  expect(interactionWindow).toHaveLength(1);
  expect(interactionWindow?.[0]?.kind).toBe('returnable');
  expect(interactionWindow?.[0]?.isDamage).toBe(true);
});
