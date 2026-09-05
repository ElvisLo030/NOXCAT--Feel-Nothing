import { clipLineToBounds } from '../src/game/systems/LineGeometry';
import { describe, expect, it } from 'vitest';

import {
  COMBAT_ARENA,
  dangerRectsOutsideSafeLane,
  dangerZonesForPattern,
  projectDangerRayHatch,
  projectDangerRectToVanishingQuad,
  projectDangerTargetCone,
} from '../src/game/systems/DangerTelegraph';
import { BOSS_PROJECTILE_ORIGIN } from '../src/game/systems/ProjectileDepth';

describe('danger telegraph geometry', () => {
  it('clips horizontal, vertical and diagonal cues without reversing their arrow direction', () => {
    const bounds = { left: 14, right: 526, top: 683, bottom: 896 };
    for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 2, y: -1 }]) {
      const path = clipLineToBounds({ x: 270, y: 810 }, direction, bounds)!;
      for (const point of [path.entry, path.exit]) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.left - 1e-7);
        expect(point.x).toBeLessThanOrEqual(bounds.right + 1e-7);
        expect(point.y).toBeGreaterThanOrEqual(bounds.top - 1e-7);
        expect(point.y).toBeLessThanOrEqual(bounds.bottom + 1e-7);
      }
      const dx = path.exit.x - path.entry.x;
      const dy = path.exit.y - path.entry.y;
      expect(dx * direction.x + dy * direction.y).toBeGreaterThan(0);
      expect(dx * direction.y - dy * direction.x).toBeCloseTo(0, 8);
    }
    expect(clipLineToBounds({ x: 0, y: 600 }, { x: 1, y: 0 }, bounds)).toBeUndefined();
    expect(clipLineToBounds({ x: 270, y: 810 }, { x: 0, y: 0 }, bounds)).toBeUndefined();
  });

  it('overscans both screen edges so neither side is an implicit safe strip', () => {
    expect(COMBAT_ARENA.x).toBeLessThan(0);
    expect(COMBAT_ARENA.x + COMBAT_ARENA.width).toBeGreaterThan(540);
  });

  it('highlights only the attacked complement of a vertical safe lane', () => {
    const safeLeft = 220;
    const safeRight = 320;
    const zones = dangerRectsOutsideSafeLane({ axis: 'vertical', center: 270, halfWidth: 50 });

    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({ x: COMBAT_ARENA.x, width: safeLeft - COMBAT_ARENA.x });
    expect(zones[1]).toMatchObject({ x: safeRight });
    for (const zone of zones) {
      const zoneRight = zone.x + zone.width;
      expect(zoneRight <= safeLeft || zone.x >= safeRight).toBe(true);
    }
  });

  it('highlights only the attacked complement of a horizontal safe lane', () => {
    const safeTop = 580;
    const safeBottom = 720;
    const zones = dangerRectsOutsideSafeLane({ axis: 'horizontal', center: 650, halfWidth: 70 });

    expect(zones).toHaveLength(2);
    for (const zone of zones) {
      const zoneBottom = zone.y + zone.height;
      expect(zoneBottom <= safeTop || zone.y >= safeBottom).toBe(true);
    }
  });

  it('uses an exact beam band and a non-colour-only target marker for dynamic homing', () => {
    expect(dangerZonesForPattern('deadline_beam', undefined, undefined, 612)).toEqual([{
      kind: 'rect',
      x: COMBAT_ARENA.x,
      y: 590,
      width: COMBAT_ARENA.width,
      height: 44,
      projection: 'screen',
    }]);
    expect(dangerZonesForPattern('revision_homing', undefined, { x: 270, y: 710 }, 0)).toEqual([{
      kind: 'target',
      x: 270,
      y: 710,
      radius: 52,
    }]);
  });

  it('projects rectangular warnings as trapezoids converging on the Boss', () => {
    const quad = projectDangerRectToVanishingQuad({
      kind: 'rect',
      ...COMBAT_ARENA,
    });
    const width = (
      left: Readonly<{ x: number; y: number }>,
      right: Readonly<{ x: number; y: number }>,
    ): number => Math.hypot(right.x - left.x, right.y - left.y);
    const crossFromOrigin = (
      first: Readonly<{ x: number; y: number }>,
      second: Readonly<{ x: number; y: number }>,
    ): number => (
      (first.x - BOSS_PROJECTILE_ORIGIN.x) * (second.y - BOSS_PROJECTILE_ORIGIN.y)
      - (first.y - BOSS_PROJECTILE_ORIGIN.y) * (second.x - BOSS_PROJECTILE_ORIGIN.x)
    );

    expect(width(quad.topLeft, quad.topRight))
      .toBeLessThan(width(quad.bottomLeft, quad.bottomRight) * 0.05);
    expect(crossFromOrigin(quad.topLeft, quad.bottomLeft)).toBeCloseTo(0, 8);
    expect(crossFromOrigin(quad.topRight, quad.bottomRight)).toBeCloseTo(0, 8);
  });

  it('keeps every warning hatch on the same vanishing rays as the floor grid', () => {
    const horizontalDangerBand = dangerRectsOutsideSafeLane({
      axis: 'horizontal',
      center: 650,
      halfWidth: 70,
    })[0]!;
    const quad = projectDangerRectToVanishingQuad(horizontalDangerBand);

    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const hatch = projectDangerRayHatch(quad, fraction);
      const cross = (
        (hatch.start.x - BOSS_PROJECTILE_ORIGIN.x)
          * (hatch.end.y - BOSS_PROJECTILE_ORIGIN.y)
        - (hatch.start.y - BOSS_PROJECTILE_ORIGIN.y)
          * (hatch.end.x - BOSS_PROJECTILE_ORIGIN.x)
      );
      expect(cross).toBeCloseTo(0, 8);
    }
  });

  it('opens target warnings from the same Boss vanishing point', () => {
    const target = { kind: 'target' as const, x: 430, y: 760, radius: 52 };
    const cone = projectDangerTargetCone(target);
    const midpoint = (
      first: Readonly<{ x: number; y: number }>,
      second: Readonly<{ x: number; y: number }>,
    ): { x: number; y: number } => ({
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    });
    const originWidth = Math.hypot(
      cone.originRight.x - cone.originLeft.x,
      cone.originRight.y - cone.originLeft.y,
    );
    const targetWidth = Math.hypot(
      cone.targetRight.x - cone.targetLeft.x,
      cone.targetRight.y - cone.targetLeft.y,
    );
    const originMidpoint = midpoint(cone.originLeft, cone.originRight);
    const targetMidpoint = midpoint(cone.targetLeft, cone.targetRight);
    const cross = (
      (originMidpoint.x - BOSS_PROJECTILE_ORIGIN.x)
        * (targetMidpoint.y - BOSS_PROJECTILE_ORIGIN.y)
      - (originMidpoint.y - BOSS_PROJECTILE_ORIGIN.y)
        * (targetMidpoint.x - BOSS_PROJECTILE_ORIGIN.x)
    );

    expect(originWidth).toBeLessThan(targetWidth * 0.1);
    expect(targetMidpoint).toEqual({ x: target.x, y: target.y });
    expect(cross).toBeCloseTo(0, 8);
  });
});
