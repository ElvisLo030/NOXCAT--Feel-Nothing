import { describe, expect, it } from 'vitest';

import {
  calculateBattleViewportLayout,
  viewportPointToWorld,
} from '../src/game/systems/ViewportLayout';

describe('responsive battle viewport', () => {
  it('keeps the authored 9:16 world exact on a matching display', () => {
    expect(calculateBattleViewportLayout(540, 960)).toEqual({
      zoom: 1,
      left: 0,
      top: 0,
      width: 540,
      height: 960,
      right: 540,
      bottom: 960,
      centerX: 270,
      centerY: 480,
    });
  });

  it('extends vertical world space on a tall phone without stretching', () => {
    const layout = calculateBattleViewportLayout(390, 844);
    expect(layout.width).toBeCloseTo(540, 8);
    expect(layout.height).toBeGreaterThan(960);
    expect(layout.top).toBeLessThan(0);
    expect(layout.bottom).toBeGreaterThan(960);
    expect(layout.zoom).toBeCloseTo(390 / 540, 8);
  });

  it('extends horizontal world space on a wider viewport', () => {
    const layout = calculateBattleViewportLayout(390, 600);
    expect(layout.height).toBeCloseTo(960, 8);
    expect(layout.width).toBeGreaterThan(540);
    expect(layout.left).toBeLessThan(0);
    expect(layout.right).toBeGreaterThan(540);
  });

  it('maps touch coordinates through the extended viewport', () => {
    const layout = calculateBattleViewportLayout(390, 844);
    const world = viewportPointToWorld(layout, 195, 609.2);
    expect(world.x).toBeCloseTo(270, 8);
    expect(world.y).toBeCloseTo(739.2, 8);
  });
});
