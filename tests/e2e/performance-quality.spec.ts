import { expect, test } from '@playwright/test';

test('sustained low FPS reduces only visual effects while collision stays every frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One deterministic runtime integration is sufficient');

  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  await page.evaluate(() => window.__NOXCAT_TEST__?.pauseAttacksForVisualTest());

  const reduced = await page.evaluate(() => {
    const hook = window.__NOXCAT_TEST__;
    if (!hook) throw new Error('Development test hook is unavailable');
    hook.forceLowFpsForTest();
    return {
      quality: hook.qualitySnapshot(),
      visual: hook.visualSnapshot(),
    };
  });

  expect(reduced.quality.level).toBe('reduced');
  expect(reduced.quality.consecutiveLowFpsMs).toBeGreaterThanOrEqual(2_000);
  expect(reduced.quality.projectileEffectsReduced).toBe(true);
  expect(reduced.quality.ghostLimit).toBe(5);
  expect(reduced.quality.dropletLimit).toBe(3);
  expect(reduced.visual.ghostLimit).toBe(5);
  expect(reduced.visual.dropletLimit).toBe(3);
  expect(reduced.quality.collisionUpdateCount).toBe(reduced.quality.simulationUpdateCount);

  await page.waitForTimeout(180);
  const after = await page.evaluate(() => window.__NOXCAT_TEST__?.qualitySnapshot());
  if (!after) throw new Error('Quality snapshot is unavailable');
  const simulationFrames = after.simulationUpdateCount - reduced.quality.simulationUpdateCount;
  const collisionFrames = after.collisionUpdateCount - reduced.quality.collisionUpdateCount;
  expect(simulationFrames).toBeGreaterThan(0);
  expect(collisionFrames).toBe(simulationFrames);
});

test('mobile active wave keeps responsive frame cadence without projectile trail batches', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'One mobile GPU profile is sufficient');

  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => (
    (window.__NOXCAT_TEST__?.waveSnapshot().activeProjectileCount ?? 0) >= 6
  ), undefined, { timeout: 12_000 });

  const sample = await page.evaluate(async () => {
    const frameIntervals: number[] = [];
    const startedAt = performance.now();
    let previous = startedAt;
    await new Promise<void>((resolve) => {
      const sampleFrame = (now: number): void => {
        frameIntervals.push(now - previous);
        previous = now;
        if (now - startedAt >= 1_500) resolve();
        else requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
    });
    frameIntervals.shift();
    frameIntervals.sort((first, second) => first - second);
    const meanInterval = frameIntervals.reduce((sum, value) => sum + value, 0)
      / Math.max(1, frameIntervals.length);
    const p90Index = Math.min(
      frameIntervals.length - 1,
      Math.floor(frameIntervals.length * 0.9),
    );
    return {
      measuredFps: 1_000 / meanInterval,
      p90FrameMs: frameIntervals[p90Index] ?? Number.POSITIVE_INFINITY,
      quality: window.__NOXCAT_TEST__?.qualitySnapshot(),
    };
  });

  expect(sample.quality).not.toHaveProperty('speedStreakBatchCount');
  expect(sample.measuredFps).toBeGreaterThanOrEqual(45);
  expect(sample.p90FrameMs).toBeLessThanOrEqual(34);
});
