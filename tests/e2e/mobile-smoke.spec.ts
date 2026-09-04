import { expect, test, type Page } from '@playwright/test';

test('player can compile a fallback boss, launch three times, and win', async ({ page }, testInfo) => {
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.__NOXCAT_TEST__));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  for (let hit = 1; hit <= 3; hit += 1) {
    await page.waitForFunction(() => {
      const state = window.__NOXCAT_TEST__?.snapshot().state;
      return state === 'DODGING' || state === 'VULNERABLE';
    });
    await page.evaluate(() => window.__NOXCAT_TEST__?.fillEnergy());
    if (testInfo.project.name === 'mobile-webkit') {
      // Playwright WebKit cannot synthesize a trusted drag gesture. The test
      // hook invokes the same aim/release/resolve state-machine path; Chromium
      // above exercises the actual touch-like canvas gesture.
      await page.evaluate(() => window.__NOXCAT_TEST__?.damageBoss());
    } else {
      await launchUpward(page);
    }
    await page.waitForFunction(
      (expectedHits) => (window.__NOXCAT_TEST__?.snapshot().mainAttackHits ?? 0) >= expectedHits,
      hit,
      { timeout: 5_000 },
    );
  }

  await expect(page.getByTestId('result-title')).toHaveText('BOSS DEFEATED', { timeout: 6_000 });
  await expect(page.getByTestId('retry')).toBeVisible();
  await page.getByTestId('retry').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'INTRO');
});

test('client-side API failure still starts a playable local boss', async ({ page }) => {
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1');
  await page.getByTestId('generate-boss').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
  await page.waitForFunction(() => Boolean(window.__NOXCAT_TEST__));
  const snapshot = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot());
  expect(snapshot?.lives).toBe(3);
});

test('goggles default on and the start-screen opt-out reaches the render layer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', '390x844 accessory and layout coverage');
  await page.goto('/?debug=1');

  const gogglesToggle = page.getByTestId('goggles-enabled');
  await expect(gogglesToggle).toBeChecked();
  const screenBox = await page.locator('.start-screen').boundingBox();
  const privacyBox = await page.locator('.privacy-note').boundingBox();
  if (!screenBox || !privacyBox) throw new Error('Start screen does not have measurable bounds');
  expect(privacyBox.y + privacyBox.height).toBeLessThanOrEqual(screenBox.y + screenBox.height + 1);
  const verticalOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(verticalOverflow).toBeLessThanOrEqual(1);

  await page.getByTestId('generate-boss').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.__NOXCAT_TEST__));
  await expect.poll(
    () => page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot().goggleVisible),
  ).toBe(true);

  await page.goto('/?debug=1');
  const optOut = page.getByTestId('goggles-enabled');
  await optOut.uncheck({ force: true });
  await expect(page.locator('.css-goggles')).toBeHidden();
  await optOut.check({ force: true });
  await expect(page.locator('.css-goggles')).toBeVisible();
  await optOut.uncheck({ force: true });
  await page.getByTestId('generate-boss').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.__NOXCAT_TEST__));
  await expect.poll(
    () => page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot().goggleVisible),
  ).toBe(false);
});

test('desktop layout accepts keyboard movement without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop keyboard coverage');
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');

  const before = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(360);
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());

  expect((after?.x ?? 0)).toBeLessThan((before?.x ?? 0) - 8);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
  expect(box?.height ?? 0).toBeGreaterThan(600);
});

test('jelly body follows a fast drag without a tail, glows, rebounds, and keeps a fixed hit body', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium provides deterministic mouse-drag timing for visual sampling');
  await page.goto('/?debug=1');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  await page.evaluate(() => window.__NOXCAT_TEST__?.pauseAttacksForVisualTest());
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas does not have a bounding box');

  const startX = box.x + box.width * 0.5;
  const pointerY = box.y + box.height * 0.865;
  const endX = box.x + box.width * 0.08;
  await page.mouse.move(startX, pointerY);
  await page.mouse.down();
  for (let step = 1; step <= 7; step += 1) {
    await page.mouse.move(startX + (endX - startX) * (step / 7), pointerY);
    await page.waitForTimeout(28);
  }

  const dragging = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());
  expect(dragging?.hitRadius).toBe(18);
  // A full-width swipe should be almost caught up within ~200 ms; this guards
  // against reintroducing pointer smoothing or the old sluggish follow spring.
  expect(dragging?.x ?? 999).toBeLessThan(115);
  expect(dragging?.eyeX).toBeLessThan(0);
  // Ordinary movement is carried entirely by the bun body. The rejected
  // triangular ribbon and launch-only particles must not appear while dragging.
  expect(dragging).not.toHaveProperty('trailStrength');
  expect(dragging).not.toHaveProperty('activeTrailPoints');
  expect(dragging?.activeGhosts).toBe(0);
  expect(dragging?.activeDroplets).toBe(0);
  expect(dragging?.glowLayerCount).toBe(3);
  expect(dragging?.glowOuterAlpha).toBeGreaterThan(0.04);
  expect(dragging?.bodyDisplayWidth).toBe(158);
  expect(dragging?.bodyDisplayHeight).toBe(145);
  // The logo-led bun body visibly deforms while the round head stays intact.
  expect((dragging?.scaleX ?? 0) - (dragging?.scaleY ?? 0)).toBeGreaterThan(0.08);

  await page.mouse.up();
  await page.waitForTimeout(30);
  const released = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());
  expect(released?.activeGhosts).toBe(0);
  expect(released?.activeDroplets).toBe(0);

  expect(released?.isDragging).toBe(false);
  // The five alternating release lobes are verified frame-rate-independently
  // in jellyMotion.test.ts. Sampling a lobe here aliases badly when a busy
  // browser coalesces frames, so verify the rendered body reaches rest instead.
  await page.waitForTimeout(650);
  const settled = await page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot());
  expect(Math.abs((settled?.scaleX ?? 1) - 1)).toBeLessThan(0.06);
  expect(Math.abs((settled?.scaleY ?? 1) - 1)).toBeLessThan(0.06);
});

test('optional camera disclosure can be skipped without blocking play', async ({ page }) => {
  await page.goto('/');
  await page.locator('.toggle-row').click();
  await expect(page.locator('#camera-enabled')).toBeChecked();
  await page.getByTestId('generate-boss').click();
  await expect(page.getByText('面無表情加成')).toBeVisible();
  await expect(page.getByText('鏡頭畫面不會上傳、不會錄影', { exact: false })).toBeVisible();
  await page.getByTestId('skip-camera').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 });
});

test('camera permission failure degrades to standard mode', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium provides deterministic headless permission denial');
  await page.goto('/');
  await page.locator('.toggle-row').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('start-calibration').click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 12_000 });
});

async function launchUpward(page: Page): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas does not have a bounding box');
  const x = box.x + box.width * 0.5;
  const startY = box.y + box.height * 0.79;
  const pullY = box.y + box.height * 0.91;
  const hasTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (!hasTouch) {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, pullY, { steps: 7 });
    await page.mouse.up();
    return;
  }
  // Dispatch touch-like PointerEvents so this exercises Phaser's mobile input
  // path consistently in mobile browser emulation.
  await page.evaluate(
    ({ x, startY, pullY }) => {
      const target = document.querySelector('canvas');
      if (!target) throw new Error('Canvas was removed before launch');
      if (navigator.maxTouchPoints > 0 && typeof Touch === 'function') {
        const touch = (y: number): Touch => new Touch({
          identifier: 7,
          target,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          pageX: x,
          pageY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1
        });
        const fireTouch = (type: string, y: number, active: boolean): void => {
          const point = touch(y);
          target.dispatchEvent(new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            touches: active ? [point] : [],
            targetTouches: active ? [point] : [],
            changedTouches: [point]
          }));
        };
        fireTouch('touchstart', startY, true);
        for (let step = 1; step <= 7; step += 1) {
          fireTouch('touchmove', startY + (pullY - startY) * (step / 7), true);
        }
        fireTouch('touchend', pullY, false);
        return;
      }
      const event = (type: string, y: number, buttons: number): PointerEvent => new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        buttons,
        button: 0,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y
      });
      target.dispatchEvent(event('pointerdown', startY, 1));
      for (let step = 1; step <= 7; step += 1) {
        const y = startY + (pullY - startY) * (step / 7);
        target.dispatchEvent(event('pointermove', y, 1));
      }
      window.dispatchEvent(event('pointerup', pullY, 0));
    },
    { x, startY, pullY },
  );
}
