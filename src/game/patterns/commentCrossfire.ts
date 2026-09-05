import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  clamp,
  clampPlayerPosition,
  ATTACK_NEAR_MAX_X,
  ATTACK_NEAR_MIN_X,
  LEFT_WARNING_X,
  RIGHT_WARNING_X,
  SIDE_ATTACK_ORIGIN_LEFT_X,
  SIDE_ATTACK_ORIGIN_RIGHT_X,
  SIDE_ATTACK_ORIGIN_Y,
  type PlayerPosition,
} from './fairness';
import {
  createPatternTimeline,
  staggeredSpawnEvents,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

const COMMENTS = ['這裡對齊', '字再大一點', '再改一下', 'ASAP', 'FINAL?'] as const;

export const COMMENT_SAFE_LANE_HALF_HEIGHT = 74;
const COMMENT_LANE_OFFSET = 142;
const COMMENT_DIAGONAL_SLOPE = 0.24;
const COMMENT_REQUIRED_CLEARANCE = COMMENT_SAFE_LANE_HALF_HEIGHT
  + PLAYER_HIT_RADIUS
  + 28
  + 4;

export interface CommentCrossfirePlan {
  readonly safeLaneY: number;
  readonly fromLeft: boolean;
  readonly projectiles: readonly ProjectileConfig[];
}

export function planCommentCrossfire(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  volley: number,
  speedScale: number,
  playerPosition?: PlayerPosition,
): CommentCrossfirePlan {
  const player = clampPlayerPosition(playerPosition);
  const safeLaneY = clamp(player?.y ?? rng.range(520, 790), 500, 814);
  const fromLeft = volley % 2 === 0;
  // Intensity adds pressure through a second lane while speed remains low
  // enough to preserve >550 ms warning for a player hugging either edge.
  const speed = (235 + intensity * 20) * speedScale;
  const alternatingAbove = Math.floor(volley / 2) % 2 === 0;
  // Keep the primary projectile inside the playable vertical span even when
  // the player-centred safe lane sits near its top or bottom boundary.
  const primaryAbove = safeLaneY - COMMENT_LANE_OFFSET < 430
    ? false
    : safeLaneY + COMMENT_LANE_OFFSET > 884
      ? true
      : alternatingAbove;
  const primaryY = safeLaneY + (primaryAbove ? -COMMENT_LANE_OFFSET : COMMENT_LANE_OFFSET);
  const oppositeY = safeLaneY - (primaryAbove ? -COMMENT_LANE_OFFSET : COMMENT_LANE_OFFSET);
  const oppositeLaneFits = oppositeY >= 430
    && oppositeY <= 884
    && Math.abs(oppositeY - safeLaneY) >= COMMENT_REQUIRED_CLEARANCE;
  const secondaryY = oppositeLaneFits
    ? oppositeY
    : safeLaneY + (primaryAbove ? -1 : 1) * (COMMENT_LANE_OFFSET + 72);
  const projectile = (
    y: number,
    startsLeft: boolean,
    speedMultiplier: number,
  ): ProjectileConfig => {
    // Every shot travels diagonally *away* from the reserved band. This makes
    // the crossfire read as two real crossing depth rays while preventing a
    // late vertical drift into the advertised safe height.
    const verticalDirection = y < safeLaneY ? -1 : 1;
    const scaledSpeed = speed * speedMultiplier;
    return {
      kind: 'comment',
      x: startsLeft ? LEFT_WARNING_X : RIGHT_WARNING_X,
      y,
      vx: (startsLeft ? 1 : -1) * scaledSpeed,
      vy: verticalDirection * scaledSpeed * COMMENT_DIAGONAL_SLOPE,
      radius: 28,
      text: rng.pick(COMMENTS),
      perspectiveOrigin: {
        x: startsLeft ? SIDE_ATTACK_ORIGIN_LEFT_X : SIDE_ATTACK_ORIGIN_RIGHT_X,
        y: SIDE_ATTACK_ORIGIN_Y,
      },
      perspectiveTarget: {
        // Cross all the way through the opposite near edge. At contact depth
        // this ray already occupies the boundary lane, then visibly exits
        // past the corner instead of dying in the narrow centre corridor.
        x: startsLeft ? ATTACK_NEAR_MAX_X : ATTACK_NEAR_MIN_X,
        // The near-plane continuation follows the same Boss-origin ray. A
        // generous vertical target offset keeps that complete radial segment,
        // not only the authored collider path, outside the safe band.
        y: clamp(safeLaneY + verticalDirection * 260, 430, 884),
      },
      perspectiveDurationMs: 1_500,
    };
  };

  const projectiles: ProjectileConfig[] = [projectile(primaryY, fromLeft, 1)];
  if (intensity >= 2) projectiles.push(projectile(secondaryY, !fromLeft, 0.9));

  return { safeLaneY, fromLeft, projectiles };
}

export function spawnCommentCrossfire(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  volley: number,
  speedScale: number,
  playerPosition?: PlayerPosition,
): void {
  const plan = planCommentCrossfire(rng, intensity, volley, speedScale, playerPosition);
  for (const config of plan.projectiles) projectiles.spawn(config);
}

export function runCommentCrossfire(
  context: AttackPatternContext,
  safeLaneY: number,
): AttackPatternHandle {
  const plan = planCommentCrossfire(
    context.rng,
    context.intensity,
    context.waveIndex,
    context.speedScale,
    { x: context.player.x, y: safeLaneY },
  );
  return createPatternTimeline(
    context.durationMs,
    staggeredSpawnEvents(context.projectiles, plan.projectiles, 220),
  );
}
