import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import { BOSS_PROJECTILE_ORIGIN } from '../systems/ProjectileDepth';
import {
  clamp,
  LEFT_WARNING_X,
  PLAYER_MIN_X,
  PLAYER_MAX_X,
  RIGHT_WARNING_X,
  SIDE_ATTACK_ORIGIN_LEFT_X,
  SIDE_ATTACK_ORIGIN_RIGHT_X,
  SIDE_ATTACK_ORIGIN_Y,
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

function perspectiveTargetY(rowY: number, gapY: number, targetX: number): number {
  if (rowY >= gapY) return rowY;
  const startsLeft = targetX < BOSS_PROJECTILE_ORIGIN.x;
  const originX = startsLeft ? SIDE_ATTACK_ORIGIN_LEFT_X : SIDE_ATTACK_ORIGIN_RIGHT_X;
  const exitX = startsLeft ? PLAYER_MAX_X : PLAYER_MIN_X;
  const targetFraction = Math.abs(targetX - originX)
    / Math.max(1, Math.abs(exitX - originX));
  // Upper cards would otherwise continue downward through the opening after
  // near-plane hand-off. Solve against the actual side portal so their ray
  // reaches the authored row only at the opposite legal edge. The small extra
  // offset absorbs mesh/collision rounding without visually widening the gap.
  return Math.max(
    430,
    SIDE_ATTACK_ORIGIN_Y
      + (rowY - SIDE_ATTACK_ORIGIN_Y) * targetFraction
      - 6,
  );
}

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
        perspectiveOrigin: {
          x: SIDE_ATTACK_ORIGIN_LEFT_X,
          y: SIDE_ATTACK_ORIGIN_Y,
        },
        perspectiveTarget: {
          x: WALL_NEAR_LEFT_X,
          y: perspectiveTargetY(leftY, gapY, WALL_NEAR_LEFT_X),
        },
        perspectiveDurationMs: 1_400,
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
        perspectiveOrigin: {
          x: SIDE_ATTACK_ORIGIN_RIGHT_X,
          y: SIDE_ATTACK_ORIGIN_Y,
        },
        perspectiveTarget: {
          x: WALL_NEAR_RIGHT_X,
          y: perspectiveTargetY(rightY, gapY, WALL_NEAR_RIGHT_X),
        },
        perspectiveDurationMs: 1_400,
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
  const clampedStart = clamp(startGapY, 535, 805);
  const direction = rng.int(0, 1) === 0 ? -1 : 1;
  const endGapY = clamp(clampedStart + direction * (44 + intensity * 10), 535, 805);
  const formationCount = intensity === 1 ? 3 : 4;
  // Leave enough time for the final 1.4 s perspective pass to reach the near
  // plane before AttackDirector begins recovery and clears stragglers.
  const lastEmissionMs = Math.max(0, durationMs - 1_600);
  const formations = Array.from({ length: formationCount }, (_, index) => {
    const progress = formationCount <= 1 ? 1 : index / (formationCount - 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    const safeGapY = clampedStart + (endGapY - clampedStart) * easedProgress;
    return {
      ...planClosingWalls(rng, intensity, speedScale, safeGapY),
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
