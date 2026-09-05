import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import {
  ATTACK_NEAR_MAX_X,
  ATTACK_NEAR_MIN_X,
  clamp,
  evenlySpaced,
  randomSignedRotationSpeed,
} from './fairness';
import {
  createPatternTimeline,
  staggeredSpawnEvents,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

export const TOP_DOWNPOUR_SAFE_LANE_HALF_WIDTH = 76;
export const TOP_DOWNPOUR_ORIGIN_Y = -72;
export const TOP_DOWNPOUR_TARGET_Y = 910;
export const TOP_DOWNPOUR_STAGGER_MS = 88;

const PROJECTILE_RADIUS = 18;
const LANE_CLEARANCE = TOP_DOWNPOUR_SAFE_LANE_HALF_WIDTH
  + PLAYER_HIT_RADIUS
  + PROJECTILE_RADIUS
  + 4;

export interface TopDownpourPlan {
  readonly safeLaneX: number;
  readonly projectiles: readonly ProjectileConfig[];
}

/**
 * A screen-top rain curtain. Every document owns a separate portal directly
 * above its final x coordinate, so its complete projected ray is vertical
 * rather than converging on the Boss floor vanishing point.
 */
export function planTopDownpour(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneX: number,
): TopDownpourPlan {
  const clampedLane = clamp(safeLaneX, 90, 450);
  const leftMaximum = clampedLane - LANE_CLEARANCE;
  const rightMinimum = clampedLane + LANE_CLEARANCE;
  const totalCount = 8 + intensity * 2;
  const leftSpan = Math.max(0, leftMaximum - ATTACK_NEAR_MIN_X);
  const rightSpan = Math.max(0, ATTACK_NEAR_MAX_X - rightMinimum);
  const combinedSpan = Math.max(1, leftSpan + rightSpan);
  const leftCount = leftSpan <= 0
    ? 0
    : rightSpan <= 0
      ? totalCount
      : Math.max(1, Math.min(totalCount - 1, Math.round(totalCount * leftSpan / combinedSpan)));
  const rightCount = totalCount - leftCount;
  const leftColumns = evenlySpaced(ATTACK_NEAR_MIN_X, leftMaximum, leftCount);
  const rightColumns = evenlySpaced(rightMinimum, ATTACK_NEAR_MAX_X, rightCount);
  // 左右雨柱交錯落下，讓兩邊的紅色預警在開場就有對應文件。
  const columns: number[] = [];
  for (let index = 0; index < Math.max(leftCount, rightCount); index++) {
    if (leftColumns[index] !== undefined) columns.push(leftColumns[index]!);
    if (rightColumns[index] !== undefined) columns.push(rightColumns[index]!);
  }
  const speed = (250 + intensity * 22) * speedScale;
  const depthClockScale = Math.max(0.1, speedScale);
  const projectiles = columns.map((columnX, index): ProjectileConfig => {
    const leftOfLane = columnX < clampedLane;
    const x = clamp(
      columnX + rng.range(-7, 7),
      leftOfLane ? ATTACK_NEAR_MIN_X : rightMinimum,
      leftOfLane ? leftMaximum : ATTACK_NEAR_MAX_X,
    );
    return {
      kind: 'paper',
      x,
      y: TOP_DOWNPOUR_ORIGIN_Y - 28,
      vx: 0,
      vy: speed,
      radius: PROJECTILE_RADIUS,
      rotationSpeed: randomSignedRotationSpeed(rng, 0.55, 1.05),
      perspectiveOrigin: { x, y: TOP_DOWNPOUR_ORIGIN_Y },
      perspectiveTarget: { x, y: TOP_DOWNPOUR_TARGET_Y },
      perspectiveDurationMs: Math.round(
        (1_250 + (index % 3) * 135 + rng.range(-35, 35)) / depthClockScale,
      ),
    };
  });

  return { safeLaneX: clampedLane, projectiles };
}

export function runTopDownpour(
  context: AttackPatternContext,
  safeLaneX: number,
): AttackPatternHandle {
  const plan = planTopDownpour(
    context.rng,
    context.intensity,
    context.speedScale,
    safeLaneX,
  );
  return createPatternTimeline(
    context.durationMs,
    staggeredSpawnEvents(
      context.projectiles,
      plan.projectiles,
      TOP_DOWNPOUR_STAGGER_MS,
    ),
  );
}
