import type { SeededRng } from '../../utils/rng';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  clamp,
  clampPlayerPosition,
  LEFT_WARNING_X,
  RIGHT_WARNING_X,
  type PlayerPosition,
} from './fairness';

const COMMENTS = ['這裡對齊', '字再大一點', '再改一下', 'ASAP', 'FINAL?'] as const;

export const COMMENT_SAFE_LANE_HALF_HEIGHT = 74;
const COMMENT_LANE_OFFSET = 142;

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
  const primaryAbove = Math.floor(volley / 2) % 2 === 0;
  const primaryY = safeLaneY + (primaryAbove ? -COMMENT_LANE_OFFSET : COMMENT_LANE_OFFSET);
  const secondaryY = safeLaneY - (primaryAbove ? -COMMENT_LANE_OFFSET : COMMENT_LANE_OFFSET);
  const projectile = (
    y: number,
    startsLeft: boolean,
    speedMultiplier: number,
  ): ProjectileConfig => ({
    kind: 'comment',
    x: startsLeft ? LEFT_WARNING_X : RIGHT_WARNING_X,
    y,
    vx: (startsLeft ? 1 : -1) * speed * speedMultiplier,
    vy: 0,
    radius: 28,
    text: rng.pick(COMMENTS),
  });

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
