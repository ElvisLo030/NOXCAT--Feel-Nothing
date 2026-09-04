import { expect, test, type Page } from '@playwright/test';

test('small phone can reach the primary action without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'Small touch viewport coverage');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const action = page.getByTestId('generate-boss');
  await action.scrollIntoViewIfNeeded();
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 568) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const screenOverflow = await page.locator('.screen').evaluate(
    (screen) => screen.scrollHeight - screen.clientHeight,
  );
  expect(screenOverflow).toBeLessThanOrEqual(1);

  await page.getByTestId('quick-需求一直改').click();
  await action.click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
});

test('touch landscape overlay pauses battle and resumes after portrait countdown', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-chromium', 'Touch orientation coverage');
  await startBattle(page);
  const before = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().elapsedMs ?? 0);

  await page.setViewportSize({ width: 844, height: 390 });
  const warning = page.locator('.landscape-warning');
  await expect(warning).toBeVisible();
  const pausedAt = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().elapsedMs ?? 0);
  await page.waitForTimeout(800);
  const stillPaused = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().elapsedMs ?? 0);
  expect(stillPaused - pausedAt).toBeLessThanOrEqual(75);
  expect(pausedAt).toBeGreaterThanOrEqual(before);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(warning).toBeHidden();
  await page.waitForTimeout(1_200);
  const resumed = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().elapsedMs ?? 0);
  expect(resumed).toBeGreaterThan(stillPaused + 75);
});

test('low-height desktop is not blocked by the touch landscape warning', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop viewport coverage');
  await page.setViewportSize({ width: 1366, height: 560 });
  await page.goto('/');
  await expect(page.locator('.landscape-warning')).toBeHidden();
  await expect(page.getByTestId('generate-boss')).toBeVisible();
});

test('releasing outside the canvas ends the active desktop drag', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop pointer-outside coverage');
  await startBattle(page);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas does not have a bounding box');
  const startX = box.x + box.width * 0.5;
  const pointerY = box.y + box.height * 0.865;

  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 4, pointerY, { steps: 5 });
  await page.mouse.move(Math.max(0, box.x - 18), pointerY);
  await page.mouse.up();
  await page.waitForTimeout(80);

  const visual = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());
  expect(visual?.isDragging).toBe(false);
});

async function startBattle(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
}
