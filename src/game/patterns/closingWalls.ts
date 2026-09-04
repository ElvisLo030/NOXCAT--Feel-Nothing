import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  LEFT_WARNING_X,
  RIGHT_WARNING_X,
} from './fairness';

export const CLOSING_WALL_SAFE_GAP_HALF_HEIGHT = 68;
const WALL_PROJECTILE_RADIUS = 27;
const WALL_EXCLUSION_FROM_GAP = CLOSING_WALL_SAFE_GAP_HALF_HEIGHT
  + WALL_PROJECTILE_RADIUS
  + PLAYER_HIT_RADIUS
  + 4;

export interface ClosingWallsPlan {
  readonly safeGapY: number;
  readonly projectiles: readonly ProjectileConfig[];
}

export function planClosingWalls(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  gapY: number,
): ClosingWallsPlan {
  const speed = (150 + intensity * 25) * speedScale;
  const rowOffset = rng.range(-6, 6);
  const projectiles: ProjectileConfig[] = [];
  for (let y = 460 + rowOffset; y <= 860; y += 58) {
    const leftY = y;
    const rightY = y + 20;
    if (Math.abs(leftY - gapY) >= WALL_EXCLUSION_FROM_GAP) {
      projectiles.push({
        kind: 'wall',
        x: LEFT_WARNING_X,
        y: leftY,
        vx: speed,
        vy: 0,
        radius: WALL_PROJECTILE_RADIUS,
      });
    }
    if (Math.abs(rightY - gapY) >= WALL_EXCLUSION_FROM_GAP) {
      projectiles.push({
        kind: 'wall',
        x: RIGHT_WARNING_X,
        y: rightY,
        vx: -speed,
        vy: 0,
        radius: WALL_PROJECTILE_RADIUS,
      });
    }
  }
  return { safeGapY: gapY, projectiles };
}

export function spawnClosingWalls(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  gapY: number,
): void {
  const plan = planClosingWalls(rng, intensity, speedScale, gapY);
  for (const config of plan.projectiles) projectiles.spawn(config);
}
