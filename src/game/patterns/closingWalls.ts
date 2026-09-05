import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  clamp,
  LEFT_WARNING_X,
  RIGHT_WARNING_X,
  SIDE_ATTACK_ORIGIN_LEFT_X,
  SIDE_ATTACK_ORIGIN_RIGHT_X,
} from './fairness';
import {
  createPatternTimeline,
  spawnConfigs,
  type AttackPatternContext,
  type AttackPatternHandle,
  type AttackIntensity,
} from './types';

export const CLOSING_WALL_SAFE_GAP_HALF_HEIGHT = 68;
const WALL_PROJECTILE_RADIUS = 27;
const WALL_EXCLUSION_FROM_GAP = CLOSING_WALL_SAFE_GAP_HALF_HEIGHT
  + WALL_PROJECTILE_RADIUS
  + PLAYER_HIT_RADIUS
  + 4;
const WALL_NEAR_LEFT_X = 145;
const WALL_NEAR_RIGHT_X = 395;

export interface ClosingWallsPlan {
  readonly safeGapY: number;
  readonly projectiles: readonly ProjectileConfig[];
}

export interface ClosingWallFormation extends ClosingWallsPlan {
  readonly atMs: number;
}

export interface ClosingWallWavePlan {
  readonly formations: readonly ClosingWallFormation[];
  readonly startGapY: number;
  readonly endGapY: number;
}

export function planClosingWalls(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  gapY: number,
  gapTravel = 0,
): ClosingWallsPlan {
  const speed = (150 + intensity * 25) * speedScale;
  // 以缺口向外排列，避免縮小移動區後只剩上方文件列。
  // 加上整波位移量，確保舊文件還在場上時也不會穿過新的缺口。
  const clearance = WALL_EXCLUSION_FROM_GAP + gapTravel + rng.range(0, 4);
  const projectiles: ProjectileConfig[] = [];
  const layers = intensity === 1 ? 1 : 2;
  for (let layer = 0; layer < layers; layer += 1) {
    for (const verticalSide of [-1, 1]) {
      const rowY = gapY + verticalSide * (clearance + layer * 58);
      for (const fromLeft of [true, false]) {
        projectiles.push({
          kind: 'wall',
          x: fromLeft ? LEFT_WARNING_X : RIGHT_WARNING_X,
          y: rowY,
          vx: fromLeft ? speed : -speed,
          vy: 0,
          radius: WALL_PROJECTILE_RADIUS,
          // 入口和近景落點維持同一高度，接近、啟用碰撞與離場都沿缺口外側橫穿。
          perspectiveOrigin: {
            x: fromLeft ? SIDE_ATTACK_ORIGIN_LEFT_X : SIDE_ATTACK_ORIGIN_RIGHT_X,
            y: rowY,
          },
          perspectiveTarget: {
            x: fromLeft ? WALL_NEAR_LEFT_X : WALL_NEAR_RIGHT_X,
            y: rowY,
          },
          perspectiveDurationMs: 1_400,
        });
      }
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

/**
 * Plans several deterministic wall slices instead of one static row. Their
 * opening moves by a small monotonic amount, giving the player a readable
 * route to follow for the complete wave.
 */
export function planClosingWallWave(
  rng: SeededRng,
  intensity: AttackIntensity,
  speedScale: number,
  startGapY: number,
  durationMs: number,
): ClosingWallWavePlan {
  const maximumGapY = PLAYER_MAX_Y - CLOSING_WALL_SAFE_GAP_HALF_HEIGHT;
  const clampedStart = clamp(startGapY, PLAYER_MIN_Y, maximumGapY);
  const direction = rng.int(0, 1) === 0 ? -1 : 1;
  // 下方移動區較矮，整波只移動其高度的 10%，保留重疊文件之間的通路。
  const travel = Math.min(44 + intensity * 10, (PLAYER_MAX_Y - PLAYER_MIN_Y) * 0.1);
  const endGapY = clamp(clampedStart + direction * travel, PLAYER_MIN_Y, maximumGapY);
  const formationCount = intensity === 1 ? 3 : 4;
  // Leave enough time for the final 1.4 s perspective pass to reach the near
  // plane before AttackDirector begins recovery and clears stragglers.
  const lastEmissionMs = Math.max(0, durationMs - 1_600);
  const formations = Array.from({ length: formationCount }, (_, index) => {
    const progress = formationCount <= 1 ? 1 : index / (formationCount - 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    const safeGapY = clampedStart + (endGapY - clampedStart) * easedProgress;
    return {
      ...planClosingWalls(rng, intensity, speedScale, safeGapY, Math.abs(endGapY - clampedStart)),
      atMs: Math.round(lastEmissionMs * progress),
    };
  });
  return { formations, startGapY: clampedStart, endGapY };
}

export function runClosingWalls(
  context: AttackPatternContext,
  startGapY: number,
  onGapMoved?: (safeGapY: number) => void,
): AttackPatternHandle {
  const wave = planClosingWallWave(
    context.rng,
    context.intensity,
    context.speedScale,
    startGapY,
    context.durationMs,
  );
  return createPatternTimeline(
    context.durationMs,
    wave.formations.map((formation) => ({
      atMs: formation.atMs,
      emit: () => {
        onGapMoved?.(formation.safeGapY);
        spawnConfigs(context.projectiles, formation.projectiles);
      },
    })),
  );
}
