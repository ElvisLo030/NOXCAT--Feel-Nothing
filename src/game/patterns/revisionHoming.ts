import type { SeededRng } from '../../utils/rng';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import { randomSignedYawOffset } from './fairness';
import {
  createPatternTimeline,
  staggeredSpawnEvents,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

export const REVISION_WARNING_Y = -65;

export function planRevisionHoming(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
): ProjectileConfig[] {
  const count = intensity === 3 ? 3 : 2;
  return Array.from({ length: count }, (_, index) => {
    const fromLeft = index % 2 === 0;
    return {
      kind: 'homing' as const,
      x: fromLeft ? 75 : 465,
      // Spawn well above the arena; the old y=405 origin could overlap a
      // player at the legal y=430 movement boundary before any warning.
      y: REVISION_WARNING_Y - index * 54,
      vx: (fromLeft ? 1 : -1) * rng.range(105, 145) * speedScale,
      vy: rng.range(130, 180) * speedScale,
      yawOffset: randomSignedYawOffset(rng, 10, 26),
      homingMs: 950 + intensity * 160,
      perspectiveTarget: {
        x: fromLeft ? 205 : 335,
        y: 760,
      },
      perspectiveDurationMs: 2_200,
    };
  });
}

export function spawnRevisionHoming(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
): void {
  for (const config of planRevisionHoming(rng, intensity, speedScale)) {
    projectiles.spawn(config);
  }
}

export function runRevisionHoming(context: AttackPatternContext): AttackPatternHandle {
  const configs = planRevisionHoming(
    context.rng,
    context.intensity,
    context.speedScale,
  );
  return createPatternTimeline(
    context.durationMs,
    staggeredSpawnEvents(context.projectiles, configs, 240),
  );
}
