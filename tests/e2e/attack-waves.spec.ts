import { expect, test, type Page } from '@playwright/test';
import { FALLBACK_BOSS } from '../../src/ai/fallbackBoss';
import { PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MIN_X, PLAYER_MAX_X } from '../../src/game/constants';
import { clipLineToBounds } from '../../src/game/systems/LineGeometry';
import { verticalSafeWedgeBoundsAtY } from '../../src/game/systems/DangerTelegraph';

for (const y of [PLAYER_MIN_Y, 810, PLAYER_MAX_Y]) {
  test(`pulse barrage leaves the visible safe centre clear at y=${y}`, async ({ page }) => {
    await page.route('**/api/boss', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ source: 'fallback', boss: {
        ...FALLBACK_BOSS,
        seed: 12,
        attacks: Array.from({ length: 3 }, () => ({
          pattern: 'pulse_barrage', intensity: 2, durationMs: 6_500,
        })),
      } }),
    }));
    await page.goto('/?capture=1&demo=off');
    await page.getByTestId('generate-boss').click();
    await page.getByTestId('skip-camera').click();
    await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
    const lane = await page.evaluate(() => window.__NOXCAT_TEST__!.waveSnapshot().safeLane!);
    const wedge = verticalSafeWedgeBoundsAtY(lane, y);
    await moveToBattlePosition(page, (wedge.left + wedge.right) / 2, y);
    await page.waitForFunction(() => window.__NOXCAT_TEST__!.projectileSnapshot().some((card) => (
      card.isDamage && card.collisionActive
    )));
    await page.waitForFunction(() => {
      const hook = window.__NOXCAT_TEST__!;
      return hook.snapshot().lives < 3 || hook.snapshot().state === 'VULNERABLE'
        || hook.waveSnapshot().phase === 'RECOVERY';
    });
    expect(await page.evaluate(() => window.__NOXCAT_TEST__!.snapshot().lives)).toBe(3);
  });
}

for (const position of ['safe_left', 'safe_center', 'safe_right', 'danger'] as const) {
  test(`closing walls reach the lower dodge area at ${position}`, async ({ page }) => {
    await page.route('**/api/boss', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ source: 'fallback', boss: {
        ...FALLBACK_BOSS,
        seed: 12,
        attacks: Array.from({ length: 3 }, () => ({
          pattern: 'closing_walls', intensity: 3, durationMs: 6_500,
        })),
      } }),
    }));
    await page.goto('/?capture=1&demo=off');
    await page.getByTestId('generate-boss').click();
    await page.getByTestId('skip-camera').click();
    await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
    const before = await page.evaluate(() => ({
      lives: window.__NOXCAT_TEST__!.snapshot().lives,
      lane: window.__NOXCAT_TEST__!.waveSnapshot().safeLane!,
    }));
    const safe = position !== 'danger';
    const x = position === 'safe_left' ? PLAYER_MIN_X : position === 'safe_right' ? PLAYER_MAX_X : 270;
    const y = safe ? before.lane.center : PLAYER_MAX_Y - 6;
    if (!safe) expect(y).toBeGreaterThan(before.lane.center + before.lane.halfWidth);
    await moveToBattlePosition(page, x, y);
    if (safe) {
      // 不能只檢查沒扣血：必須先確認有可碰撞文件橫穿下方，再等整波結束。
      await page.waitForFunction(({ minY, maxY }) => (
        window.__NOXCAT_TEST__!.projectileSnapshot().some((card) => (
          card.kind === 'wall' && card.isDamage && card.collisionActive
          && card.visibleX >= 200 && card.visibleX <= 340
          && card.visibleY >= minY && card.visibleY <= maxY
        ))
      ), { minY: PLAYER_MIN_Y, maxY: PLAYER_MAX_Y });
      await page.waitForFunction(() => window.__NOXCAT_TEST__!.waveSnapshot().phase === 'RECOVERY');
      expect(await page.evaluate(() => window.__NOXCAT_TEST__!.snapshot().lives)).toBe(before.lives);
    } else {
      await expect.poll(() => page.evaluate(() => window.__NOXCAT_TEST__!.snapshot().lives))
        .toBe(before.lives - 1);
    }
  });
}

for (const seed of [12, 13, 14]) {
  for (const position of ['safe', 'first_ray', 'second_ray'] as const) {
    test(`random simultaneous crossfire seed ${seed} at ${position}`, async ({ page }) => {
      await page.route('**/api/boss', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ source: 'fallback', boss: {
          ...FALLBACK_BOSS,
          seed,
          attacks: Array.from({ length: 3 }, () => ({
            pattern: 'comment_crossfire', intensity: 3, durationMs: 4_500,
          })),
        } }),
      }));
      await page.goto('/?capture=1&demo=off');
      await page.getByTestId('generate-boss').click();
      await page.getByTestId('skip-camera').click();
      await page.waitForFunction(() => window.__NOXCAT_TEST__?.snapshot().state === 'DODGING');
      const before = await page.evaluate(() => ({
        lives: window.__NOXCAT_TEST__?.snapshot().lives,
        spot: window.__NOXCAT_TEST__?.waveSnapshot().safeSpot,
        rays: window.__NOXCAT_TEST__?.waveSnapshot().dangerZones.filter((zone) => zone.kind === 'ray'),
      }));
      expect(before.spot).toBeTruthy();
      expect(before.rays!.length).toBeGreaterThanOrEqual(2);
      let target = before.spot!;
      if (position !== 'safe') {
        const ray = before.rays![position === 'first_ray' ? 0 : 1]!;
        const path = clipLineToBounds(ray.from, { x: ray.to.x - ray.from.x, y: ray.to.y - ray.from.y }, {
          left: PLAYER_MIN_X, right: PLAYER_MAX_X, top: PLAYER_MIN_Y, bottom: PLAYER_MAX_Y,
        })!;
        target = { ...target, x: (path.entry.x + path.exit.x) / 2, y: (path.entry.y + path.exit.y) / 2 };
      }
      await moveToBattlePosition(page, target.x, target.y);
      await page.waitForFunction(({ rayCount, safeX, safeY }) => {
        const hook = window.__NOXCAT_TEST__;
        if (!hook) return false;
        const wave = hook.waveSnapshot();
        const comments = hook.projectileSnapshot().filter((card) => card.kind === 'comment');
        return wave.phase === 'ACTIVE'
          && wave.safeSpot?.x === safeX
          && wave.safeSpot.y === safeY
          && comments.length === rayCount;
      }, {
        rayCount: before.rays!.length,
        safeX: before.spot!.x,
        safeY: before.spot!.y,
      }, { timeout: 3_000 });
      const volley = await page.evaluate(() => window.__NOXCAT_TEST__!.projectileSnapshot().filter((card) => card.kind === 'comment'));
      expect(volley.length).toBeGreaterThanOrEqual(2);
      expect(volley.length).toBeLessThanOrEqual(3);
      expect(volley).toHaveLength(before.rays!.length);
      expect(new Set(volley.map((card) => Math.round(Math.atan2(card.vy, card.vx) * 180 / Math.PI))).size)
        .toBe(volley.length);
      // 相同深度代表同一幀發射，而非只是在畫面上先後出現。
      expect(Math.max(...volley.map((card) => card.tunnelDepth))
        - Math.min(...volley.map((card) => card.tunnelDepth))).toBeLessThan(0.001);
      if (position === 'safe') {
        await page.waitForFunction(({ minY, maxY }) => (
          window.__NOXCAT_TEST__?.projectileSnapshot().some((card) => (
            card.kind === 'comment' && card.collisionActive
            && card.visibleX >= 46 && card.visibleX <= 494
            && card.visibleY >= minY && card.visibleY <= maxY
          ))
        ), { minY: PLAYER_MIN_Y, maxY: PLAYER_MAX_Y });
        await page.waitForFunction(() => window.__NOXCAT_TEST__?.waveSnapshot().phase === 'RECOVERY');
        expect(await page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().lives)).toBe(before.lives);
      } else {
        await expect.poll(() => page.evaluate(() => window.__NOXCAT_TEST__?.snapshot().lives))
          .toBe((before.lives ?? 0) - 1);
      }
    });
  }
}

async function moveToBattlePosition(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  const state = await page.evaluate(() => ({
    cat: window.__NOXCAT_TEST__?.visualSnapshot(),
    viewport: window.__NOXCAT_TEST__?.viewportSnapshot(),
  }));
  if (!box || !state.cat || !state.viewport) throw new Error('Battle viewport unavailable');
  const { cat, viewport } = state;
  const screen = (worldX: number, worldY: number) => ({
    x: box.x + (worldX - viewport.left) * box.width / viewport.width,
    y: box.y + (worldY - viewport.top) * box.height / viewport.height,
  });
  const start = screen(cat.x, cat.y);
  const target = screen(x, y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.waitForFunction((target) => {
    const cat = window.__NOXCAT_TEST__?.visualSnapshot();
    // Canvas CSS scaling can quantize the pointer by slightly more than one
    // logical pixel. Two pixels is still far inside the 18 px safe marker.
    return cat != null && Math.hypot(cat.x - target.x, cat.y - target.y) < 2;
  }, { x, y }, { timeout: 3_000 });
  await page.mouse.up();
}

test('a wave progresses through a clear recovery before the next pattern', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium wave timing coverage');
  await page.route('**/api/boss', (route) => route.abort('failed'));
  await page.goto('/?debug=1&demo=off');
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
  const start = screenPoint(cat.x, cat.y);
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
