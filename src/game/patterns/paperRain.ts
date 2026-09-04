import type { SeededRng } from '../../utils/rng';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import { PLAYER_HIT_RADIUS } from '../constants';

export const PAPER_SAFE_LANE_HALF_WIDTH = 48;
const PAPER_PROJECTILE_RADIUS = 18;
const PAPER_LANE_EXCLUSION = PAPER_SAFE_LANE_HALF_WIDTH
  + PAPER_PROJECTILE_RADIUS
  + PLAYER_HIT_RADIUS
  + 4;

export function planPaperRain(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneCentre: number,
): ProjectileConfig[] {
  // A whole AttackStep is one wave. Keep enough documents in that single
  // formation for graze-based players to charge without continuous spawning.
  const count = 7 + intensity;
  return Array.from({ length: count }, () => {
    let x = rng.range(28, 512);
    if (Math.abs(x - safeLaneCentre) < PAPER_LANE_EXCLUSION) {
      x = x < safeLaneCentre
        ? safeLaneCentre - PAPER_LANE_EXCLUSION
        : safeLaneCentre + PAPER_LANE_EXCLUSION;
    }
    const side = x < safeLaneCentre ? -1 : 1;
    return {
      kind: 'paper' as const,
      x,
      y: -55 - rng.range(0, 180),
      // Drift away from the reserved lane so it remains safe for the volley's
      // whole descent instead of only at the spawn frame.
      vx: side * rng.range(4, 30) * speedScale,
      vy: rng.range(180, 235 + intensity * 34) * speedScale,
      radius: PAPER_PROJECTILE_RADIUS,
      rotationSpeed: rng.range(-1.3, 1.3),
    };
  });
}

export function spawnPaperRain(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneCentre: number
): void {
  for (const config of planPaperRain(rng, intensity, speedScale, safeLaneCentre)) {
    projectiles.spawn(config);
  }
}
