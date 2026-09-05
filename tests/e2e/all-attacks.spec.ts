import { expect, test } from '@playwright/test';
import { PatternIdSchema } from '../../src/ai/bossSchema';
import { FALLBACK_BOSS } from '../../src/ai/fallbackBoss';

for (const source of ['ai', 'fallback'] as const) {
  test(`${source} uses all nine attacks in shuffled rounds by default`, async ({ page }) => {
    await page.route('**/api/boss', (route) => source === 'fallback'
      ? route.abort('failed')
      : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ source, boss: FALLBACK_BOSS }) }));
    await page.goto('/?debug=1');
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
    }, PatternIdSchema.options.length * 3);

    const size = PatternIdSchema.options.length;
    for (let offset = 0; offset < visited.length; offset += size) {
      expect([...visited.slice(offset, offset + size)].sort()).toEqual([...PatternIdSchema.options].sort());
      if (offset > 0) expect(visited[offset]).not.toBe(visited[offset - 1]);
    }
    expect(visited.slice(0, size)).not.toEqual(visited.slice(size, size * 2));
  });
}
