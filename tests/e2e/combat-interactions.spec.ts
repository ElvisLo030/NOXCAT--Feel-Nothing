import { expect, test, type Page } from '@playwright/test';

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function startFallbackBattle(page: Page) {
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1&demo=off');
  await page.getByTestId('quick-需求一直改').click();
  await page.getByTestId('generate-boss').click();
  await page.getByTestId('skip-camera').click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 8_000 });
  await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
  return canvas;
}

function toScreen(box: CanvasBox, x: number, y: number): { x: number; y: number } {
  return {
    x: box.x + box.width * (x / 540),
    y: box.y + box.height * (y / 960),
  };
}

test('a real pointer drag into a real paper-rain card damages NOXCAT', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic mouse timing covers the live Phaser collision path');

  const canvas = await startFallbackBattle(page);
  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    return hook?.waveSnapshot().pattern === 'paper_rain'
      && hook.waveSnapshot().phase === 'ACTIVE'
      && hook.projectileSnapshot().some((projectile) => (
        projectile.kind === 'paper' && projectile.isDamage
      ));
  }, undefined, { timeout: 4_000 });

  const [box, visual] = await Promise.all([
    canvas.boundingBox(),
    page.evaluate(() => window.__NOXCAT_TEST__?.visualSnapshot()),
  ]);
  if (!box || !visual) throw new Error('Canvas or NOXCAT position unavailable');
  const start = toScreen(box, visual.x, visual.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  let observedRealPaper = false;
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(() => {
      const hook = window.__NOXCAT_TEST__;
      const papers = (hook?.projectileSnapshot() ?? [])
        .filter((projectile) => projectile.kind === 'paper' && projectile.isDamage)
        .sort((first, second) => second.tunnelDepth - first.tunnelDepth);
      return {
        lives: hook?.snapshot().lives ?? 0,
        target: papers[0] ?? null,
      };
    });
    if (sample.lives < 3) break;
    if (sample.target) {
      observedRealPaper = true;
      const target = toScreen(
        box,
        sample.target.visibleX,
        Math.min(956, sample.target.visibleY),
      );
      await page.mouse.move(target.x, target.y);
    }
    await page.waitForTimeout(12);
  }
  await page.mouse.up();

  const result = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot());
  expect(observedRealPaper).toBe(true);
  expect(result?.lives).toBe(2);
});

test('the full NOXCAT silhouette fits through the advertised paper safe lane', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic mouse timing covers the live Phaser safe lane');

  const canvas = await startFallbackBattle(page);
  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.pattern === 'paper_rain'
      && wave.phase === 'TELEGRAPH'
      && wave.safeLane?.axis === 'vertical';
  });
  const [box, state] = await Promise.all([
    canvas.boundingBox(),
    page.evaluate(() => ({
      cat: window.__NOXCAT_TEST__?.visualSnapshot(),
      laneX: window.__NOXCAT_TEST__?.waveSnapshot().safeLane?.center,
    })),
  ]);
  if (!box || !state.cat || state.laneX == null) {
    throw new Error('Canvas, NOXCAT, or paper safe lane unavailable');
  }
  const start = toScreen(box, state.cat.x, state.cat.y);
  const target = toScreen(box, state.laneX, 892);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.waitForFunction(
    (laneX) => Math.abs((window.__NOXCAT_TEST__?.visualSnapshot().x ?? -999) - laneX) < 10,
    state.laneX,
  );
  await page.waitForFunction(() => {
    const wave = window.__NOXCAT_TEST__?.waveSnapshot();
    return wave?.pattern === 'paper_rain' && wave.phase === 'RECOVERY';
  }, undefined, { timeout: 10_000 });
  await page.mouse.up();

  expect(await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().lives)).toBe(3);
});

test('a real high-speed flick returns the real marked document to the Boss', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Deterministic mouse timing covers the live Phaser collision path');

  const canvas = await startFallbackBattle(page);
  await page.waitForFunction(() => {
    const hook = window.__NOXCAT_TEST__;
    return hook?.waveSnapshot().pattern === 'returnable_burst'
      && hook.waveSnapshot().phase === 'ACTIVE'
      && hook.projectileSnapshot().some((projectile) => projectile.kind === 'returnable');
  }, undefined, { timeout: 15_000 });

  const [box, initial] = await Promise.all([
    canvas.boundingBox(),
    page.evaluate(() => ({
      cat: window.__NOXCAT_TEST__?.visualSnapshot(),
      card: window.__NOXCAT_TEST__?.projectileSnapshot()
        .find((projectile) => projectile.kind === 'returnable'),
      lives: window.__NOXCAT_TEST__?.snapshot().lives,
    })),
  ]);
  if (!box || !initial.cat || !initial.card) {
    throw new Error('Canvas, NOXCAT, or real returnable card unavailable');
  }
  const direction = initial.card.x < 270 ? -1 : 1;
  const interactionX = Math.min(480, Math.max(60, initial.card.x + direction * 10));
  const startX = Math.min(494, Math.max(46, interactionX - direction * 130));
  const endX = Math.min(494, Math.max(46, interactionX + direction * 100));
  const start = toScreen(box, startX, 892);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForFunction(
    ({ expectedX }) => {
      const cat = window.__NOXCAT_TEST__?.visualSnapshot();
      return cat != null && Math.abs(cat.x - expectedX) < 12 && Math.abs(cat.y - 820) < 12;
    },
    { expectedX: startX },
    { timeout: 1_500 },
  );
  await page.waitForFunction(() => {
    const card = window.__NOXCAT_TEST__?.projectileSnapshot()
      .find((projectile) => projectile.kind === 'returnable');
    return card != null && card.tunnelDepth >= 0.76;
  }, undefined, { timeout: 2_000 });
  const livesAfterSlowContact = await page.evaluate(
    () => window.__NOXCAT_TEST__?.snapshot().lives,
  );
  expect(livesAfterSlowContact).toBe(initial.lives);

  const end = toScreen(box, endX, 892);
  await page.mouse.move(end.x, end.y);
  await page.waitForFunction(
    () => (window.__NOXCAT_TEST__?.snapshot().reflectCount ?? 0) >= 1,
    undefined,
    { timeout: 3_000 },
  );
  await page.mouse.up();

  const result = await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot());
  expect(result).toMatchObject({ lives: initial.lives, reflectCount: 1, bossHp: 94 });
  expect(result?.energy ?? 0).toBeGreaterThanOrEqual(18);
});
