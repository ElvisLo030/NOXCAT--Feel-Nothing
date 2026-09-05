import { describe, expect, it } from 'vitest';

import { randomSignedYawOffset } from '../src/game/patterns/fairness';
import { planAlternatingZipper } from '../src/game/patterns/alternatingZipper';
import { planPaperRain } from '../src/game/patterns/paperRain';
import { planPulseBarrage } from '../src/game/patterns/pulseBarrage';
import { planReturnableBurst } from '../src/game/patterns/returnableBurst';
import { planRevisionHoming } from '../src/game/patterns/revisionHoming';
import { planTopDownpour } from '../src/game/patterns/topDownpour';
import {
  createProjectilePerspectiveProjection,
  projectProjectilePerspectiveUv,
} from '../src/game/systems/ProjectileDepth';
import { SeededRng } from '../src/utils/rng';

describe('projectile fixed vertical-axis yaw', () => {
  it('adds launch yaw to the lane correction without introducing screen roll', () => {
    const launchYaw = 18 * Math.PI / 180;
    const base = createProjectilePerspectiveProjection(
      { x: 145, y: 700 },
      96,
      124,
      0.2,
      { x: 110, y: 820 },
    );
    const oriented = createProjectilePerspectiveProjection(
      { x: 145, y: 700 },
      96,
      124,
      0.9,
      { x: 110, y: 820 },
      undefined,
      launchYaw,
    );

    expect(oriented.yawRadians - base.yawRadians).toBeCloseTo(launchYaw, 10);
    expect(oriented.pitchRadians).toBeCloseTo(base.pitchRadians, 10);

    // A vertical-axis yaw foreshortens the card in 3D, but its central vertical
    // line remains vertical in screen space; a 2D roll would move these Xs.
    const topCentre = projectProjectilePerspectiveUv(oriented, 0.5, 0);
    const bottomCentre = projectProjectilePerspectiveUv(oriented, 0.5, 1);
    expect(topCentre.x).toBeCloseTo(0, 10);
    expect(bottomCentre.x).toBeCloseTo(0, 10);
  });

  it('keeps the same lane yaw and pitch at every flight depth', () => {
    const createAtDepth = (depth: number) => createProjectilePerspectiveProjection(
      { x: 390, y: 690 },
      96,
      124,
      depth,
      { x: 430, y: 820 },
      undefined,
      -14 * Math.PI / 180,
    );
    const far = createAtDepth(0.08);
    const near = createAtDepth(0.94);

    expect(near.yawRadians).toBeCloseTo(far.yawRadians, 12);
    expect(near.pitchRadians).toBeCloseTo(far.pitchRadians, 12);
  });

  it('assigns deterministic visible clockwise and counter-clockwise yaw offsets', () => {
    const first = new SeededRng(270027);
    const second = new SeededRng(270027);
    const sequence = Array.from(
      { length: 32 },
      () => randomSignedYawOffset(first, 8, 24),
    );
    const replay = Array.from(
      { length: 32 },
      () => randomSignedYawOffset(second, 8, 24),
    );

    expect(replay).toEqual(sequence);
    expect(sequence.some((yaw) => yaw < 0)).toBe(true);
    expect(sequence.some((yaw) => yaw > 0)).toBe(true);
    for (const yaw of sequence) {
      expect(Math.abs(yaw)).toBeGreaterThanOrEqual(8 * Math.PI / 180);
      expect(Math.abs(yaw)).toBeLessThanOrEqual(24 * Math.PI / 180);
    }
  });

  it('gives every free-flying document one non-zero seeded yaw offset', () => {
    const yaws = [
      ...planPaperRain(new SeededRng(11), 3, 1, 270)
        .map(({ yawOffset }) => yawOffset),
      ...planTopDownpour(new SeededRng(12), 3, 1, 270).projectiles
        .map(({ yawOffset }) => yawOffset),
      ...planPulseBarrage(new SeededRng(13), 3, 1, 270).formations
        .flatMap(({ projectiles }) => projectiles.map(({ yawOffset }) => yawOffset)),
      ...planAlternatingZipper(new SeededRng(14), 3, 0, 1, 270).shots
        .map(({ projectile }) => projectile.yawOffset),
      ...planRevisionHoming(new SeededRng(15), 3, 1)
        .map(({ yawOffset }) => yawOffset),
      ...planReturnableBurst(new SeededRng(16), 3, 0, 1).projectiles
        .map(({ yawOffset }) => yawOffset),
    ];

    expect(yaws.every((yaw) => yaw != null && Math.abs(yaw) >= 7 * Math.PI / 180)).toBe(true);
    expect(yaws.some((yaw) => yaw! < 0)).toBe(true);
    expect(yaws.some((yaw) => yaw! > 0)).toBe(true);
  });
});
