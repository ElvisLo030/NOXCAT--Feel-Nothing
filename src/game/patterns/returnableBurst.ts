import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  clamp,
  clampPlayerPosition,
  evenlySpaced,
  type PlayerPosition,
} from './fairness';

export const RETURNABLE_SAFE_LANE_HALF_WIDTH = 76;
export const RETURNABLE_WARNING_Y = 155;
const RETURNABLE_PROJECTILE_RADIUS = 22;
const RETURNABLE_LANE_EXCLUSION = RETURNABLE_SAFE_LANE_HALF_WIDTH
  + PLAYER_HIT_RADIUS
  + RETURNABLE_PROJECTILE_RADIUS
  + 4;

export interface ReturnableBurstPlan {
  readonly safeLaneX: number;
  readonly returnableIndex: number;
  readonly projectiles: readonly ProjectileConfig[];
}

export function planReturnableBurst(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  burstIndex: number,
  speedScale: number,
  playerPosition?: PlayerPosition,
): ReturnableBurstPlan {
  const count = 5 + intensity;
  const player = clampPlayerPosition(playerPosition);
  const safeLaneX = clamp(player?.x ?? rng.range(150, 390), 70, 470);
  // The highlighted lane describes where the *whole player collider* may move,
  // not just an empty line through the formation. Keep every card outside the
  // lane plus both collision radii so either displayed edge remains safe.
  const leftEdge = safeLaneX - RETURNABLE_LANE_EXCLUSION;
  const rightEdge = safeLaneX + RETURNABLE_LANE_EXCLUSION;
  const leftWidth = Math.max(0, leftEdge - 45);
  const rightWidth = Math.max(0, 495 - rightEdge);
  const leftCount = leftWidth + rightWidth === 0
    ? Math.floor(count / 2)
    : Math.round(count * (leftWidth / (leftWidth + rightWidth)));
  const rightCount = count - leftCount;
  const xs = [
    ...(leftCount > 0
      ? evenlySpaced(45, leftEdge, leftCount)
      : []),
    ...(rightCount > 0
      ? evenlySpaced(rightEdge, 495, rightCount)
      : []),
  ];
  // There is exactly one burst per AttackStep, so every returnable wave must
  // contain its teaching/interaction document. Offset the seeded pick by the
  // global wave index to keep repeat encounters visually alternating.
  const pickedIndex = rng.int(1, count - 1);
  const returnableIndex = 1 + ((pickedIndex - 1 + burstIndex) % (count - 1));
  const projectiles = xs.map((x, index): ProjectileConfig => {
    const isReturnable = index === returnableIndex;
    const side = x < safeLaneX ? -1 : 1;
    return {
      kind: isReturnable ? 'returnable' : 'paper',
      x,
      // Even the nearest document remains over 550 ms away from the topmost
      // legal player position at maximum intensity and speed.
      y: RETURNABLE_WARNING_Y - Math.abs(index - (count - 1) / 2) * 8,
      vx: side * rng.range(5, 18) * speedScale,
      vy: rng.range(210, 290 + intensity * 28) * speedScale,
      radius: isReturnable ? RETURNABLE_PROJECTILE_RADIUS : 18,
      rotationSpeed: isReturnable ? 4.2 : rng.range(-1.1, 1.1),
    };
  });
  return { safeLaneX, returnableIndex, projectiles };
}

export function spawnReturnableBurst(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  burstIndex: number,
  speedScale: number,
  playerPosition?: PlayerPosition,
): boolean {
  const plan = planReturnableBurst(rng, intensity, burstIndex, speedScale, playerPosition);
  for (const config of plan.projectiles) projectiles.spawn(config);
  return plan.returnableIndex >= 0;
}
