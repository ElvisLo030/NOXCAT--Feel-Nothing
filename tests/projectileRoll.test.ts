import { describe, expect, it } from 'vitest';

import { randomSignedRotationSpeed } from '../src/game/patterns/fairness';
import { planAlternatingZipper } from '../src/game/patterns/alternatingZipper';
import { planPaperRain } from '../src/game/patterns/paperRain';
import { planPulseBarrage } from '../src/game/patterns/pulseBarrage';
import { planReturnableBurst } from '../src/game/patterns/returnableBurst';
import { planRevisionHoming } from '../src/game/patterns/revisionHoming';
import { planTopDownpour } from '../src/game/patterns/topDownpour';
import {
  createProjectilePerspectiveProjection,
  projectProjectilePerspectiveUv,
  rotateProjectedSurfacePoint,
} from '../src/game/systems/ProjectileDepth';
import { SeededRng } from '../src/utils/rng';

function distance(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

describe('projectile perspective roll composition', () => {
  it('rotates the completed trapezoid as one rigid surface', () => {
    const projection = createProjectilePerspectiveProjection(
      { x: 145, y: 700 },
      96,
      124,
      0.86,
      { x: 110, y: 820 },
    );
    const before = [
      projectProjectilePerspectiveUv(projection, 0, 0),
      projectProjectilePerspectiveUv(projection, 1, 0),
      projectProjectilePerspectiveUv(projection, 1, 1),
      projectProjectilePerspectiveUv(projection, 0, 1),
    ];
    const roll = Math.PI / 7;
    const after = before.map((point) => rotateProjectedSurfacePoint(point, roll));

    // Post-projection roll preserves every edge of the already corrected
    // keystone instead of recomputing a different trapezoid.
    for (let index = 0; index < before.length; index += 1) {
      expect(distance(
        before[index]!,
        before[(index + 1) % before.length]!,
      )).toBeCloseTo(distance(
        after[index]!,
        after[(index + 1) % after.length]!,
      ), 10);
    }
    expect(rotateProjectedSurfacePoint({ x: 0, y: 0 }, roll)).toEqual({ x: 0, y: 0 });
    expect(after[1]!.y - after[0]!.y).not.toBeCloseTo(
      before[1]!.y - before[0]!.y,
      4,
    );
  });

  it('assigns deterministic visible clockwise and counter-clockwise speeds', () => {
    const first = new SeededRng(270027);
    const second = new SeededRng(270027);
    const sequence = Array.from(
      { length: 32 },
      () => randomSignedRotationSpeed(first, 0.48, 1.25),
    );
    const replay = Array.from(
      { length: 32 },
      () => randomSignedRotationSpeed(second, 0.48, 1.25),
    );

    expect(replay).toEqual(sequence);
    expect(sequence.some((speed) => speed < 0)).toBe(true);
    expect(sequence.some((speed) => speed > 0)).toBe(true);
    for (const speed of sequence) {
      expect(Math.abs(speed)).toBeGreaterThanOrEqual(0.48);
      expect(Math.abs(speed)).toBeLessThanOrEqual(1.25);
    }
  });

  it('gives every free-flying document a non-zero seeded roll direction', () => {
    const rotations = [
      ...planPaperRain(new SeededRng(11), 3, 1, 270)
        .map(({ rotationSpeed }) => rotationSpeed),
      ...planTopDownpour(new SeededRng(12), 3, 1, 270).projectiles
        .map(({ rotationSpeed }) => rotationSpeed),
      ...planPulseBarrage(new SeededRng(13), 3, 1, 270).formations
        .flatMap(({ projectiles }) => projectiles.map(({ rotationSpeed }) => rotationSpeed)),
      ...planAlternatingZipper(new SeededRng(14), 3, 0, 1, 270).shots
        .map(({ projectile }) => projectile.rotationSpeed),
      ...planRevisionHoming(new SeededRng(15), 3, 1)
        .map(({ rotationSpeed }) => rotationSpeed),
      ...planReturnableBurst(new SeededRng(16), 3, 0, 1).projectiles
        .map(({ rotationSpeed }) => rotationSpeed),
    ];

    expect(rotations.every((speed) => speed != null && Math.abs(speed) >= 0.42)).toBe(true);
    expect(rotations.some((speed) => speed! < 0)).toBe(true);
    expect(rotations.some((speed) => speed! > 0)).toBe(true);
  });
});
