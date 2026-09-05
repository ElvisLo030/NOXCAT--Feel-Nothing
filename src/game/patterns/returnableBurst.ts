import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import {
  clamp,
  clampPlayerPosition,
  evenlySpaced,
  randomSignedYawOffset,
  type PlayerPosition,
} from './fairness';
import {
  createPatternTimeline,
  spawnConfigs,
  staggeredSpawnEvents,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';
import { clearVerticalSafeWedgeForTunnelTarget } from '../systems/DangerTelegraph';

export const RETURNABLE_SAFE_LANE_HALF_WIDTH = 76;
export const RETURNABLE_WARNING_Y = 155;
export const RETURNABLE_OPENING_CLEAR_MS = 1_250;
export const RETURNABLE_INTERACTION_GAP_MS = 240;
export const RETURNABLE_WINDOW_START_MS = RETURNABLE_OPENING_CLEAR_MS
  + RETURNABLE_INTERACTION_GAP_MS;
export const RETURNABLE_MIN_NEAR_PLANE_MS = 650;
export const RETURNABLE_PATH_SEPARATION = 96;
const RETURNABLE_PROJECTILE_RADIUS = 22;
const PAPER_PROJECTILE_RADIUS = 18;
const RETURNABLE_LANE_EXCLUSION = RETURNABLE_SAFE_LANE_HALF_WIDTH
  + PLAYER_HIT_RADIUS
  + RETURNABLE_PROJECTILE_RADIUS
  + 4;
const PAPER_LANE_EXCLUSION = RETURNABLE_SAFE_LANE_HALF_WIDTH
  + PLAYER_HIT_RADIUS
  + PAPER_PROJECTILE_RADIUS
  + 4;

export interface ReturnableBurstPlan {
  readonly safeLaneX: number;
  readonly interactionLaneX: number;
  /** First returnable index retained for debug/backward-compatible callers. */
  readonly returnableIndex: number;
  readonly returnableIndices: readonly number[];
  readonly openingProjectiles: readonly ProjectileConfig[];
  readonly returnableProjectiles: readonly ProjectileConfig[];
  readonly projectiles: readonly ProjectileConfig[];
}

export function planReturnableBurst(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  burstIndex: number,
  speedScale: number,
  playerPosition?: PlayerPosition,
): ReturnableBurstPlan {
  const player = clampPlayerPosition(playerPosition);
  const safeLaneX = clamp(player?.x ?? rng.range(150, 390), 70, 470);
  // Keep one marked document in a dedicated, reachable corridor. Opening
  // papers take the opposite, roomier side whenever possible. At the extreme
  // edges both stages share the available side but retain a wide separation.
  // Timeline staging below releases every paper before the marked card.
  const leftRoom = safeLaneX - RETURNABLE_LANE_EXCLUSION - 45;
  const rightRoom = 495 - safeLaneX - RETURNABLE_LANE_EXCLUSION;
  const leftAvailable = leftRoom >= 0;
  const rightAvailable = rightRoom >= 0;
  const interactionSide = leftAvailable && rightAvailable
    ? (leftRoom === rightRoom ? (burstIndex % 2 === 0 ? -1 : 1) : (leftRoom < rightRoom ? -1 : 1))
    : (leftAvailable ? -1 : 1);
  const interactionLaneX = clamp(
    safeLaneX + interactionSide * RETURNABLE_LANE_EXCLUSION,
    45,
    495,
  );
  const openingCount = intensity === 3 ? 4 : 3;
  let openingMinX = interactionSide < 0
    ? safeLaneX + PAPER_LANE_EXCLUSION
    : 45;
  let openingMaxX = interactionSide < 0
    ? 495
    : safeLaneX - PAPER_LANE_EXCLUSION;
  if (openingMaxX < openingMinX) {
    openingMinX = interactionSide > 0
      ? interactionLaneX + RETURNABLE_PATH_SEPARATION
      : 45;
    openingMaxX = interactionSide > 0
      ? 495
      : interactionLaneX - RETURNABLE_PATH_SEPARATION;
  }
  const openingXs = evenlySpaced(openingMinX, openingMaxX, openingCount);
  const openingProjectiles = openingXs.map((x, index): ProjectileConfig => {
    const side = x < safeLaneX ? -1 : 1;
    const y = RETURNABLE_WARNING_Y - Math.abs(index - (openingCount - 1) / 2) * 8;
    const vx = side * rng.range(5, 18) * speedScale;
    const vy = rng.range(210, 290 + intensity * 28) * speedScale;
    const perspectiveY = 820;
    const perspectiveTime = (perspectiveY - y) / Math.max(1, vy);
    const perspectiveTarget = clearVerticalSafeWedgeForTunnelTarget(
      {
        x: Math.min(504, Math.max(36, x + vx * perspectiveTime)),
        y: perspectiveY,
      },
      { center: safeLaneX, halfWidth: RETURNABLE_SAFE_LANE_HALF_WIDTH },
      side,
      PAPER_PROJECTILE_RADIUS + PLAYER_HIT_RADIUS + 4,
    );
    return {
      kind: 'paper',
      x,
      y,
      vx,
      vy,
      radius: PAPER_PROJECTILE_RADIUS,
      yawOffset: randomSignedYawOffset(rng, 8, 22),
      perspectiveTarget: {
        x: clamp(perspectiveTarget.x, 36, 504),
        y: perspectiveY,
      },
      // Each paper reaches the player plane before the 1.25 s clear beat.
      perspectiveDurationMs: 720 + index * 70 + Math.round(rng.range(-24, 24)),
    };
  });
  const returnableVx = interactionSide * rng.range(4, 12) * speedScale;
  const returnableVy = rng.range(235, 270 + intensity * 18) * speedScale;
  const returnableTarget = clearVerticalSafeWedgeForTunnelTarget(
    {
      x: clamp(interactionLaneX + interactionSide * 10, 36, 504),
      y: 820,
    },
    { center: safeLaneX, halfWidth: RETURNABLE_SAFE_LANE_HALF_WIDTH },
    interactionSide,
    RETURNABLE_PROJECTILE_RADIUS + PLAYER_HIT_RADIUS + 4,
  );
  const returnableProjectiles: readonly ProjectileConfig[] = [{
    kind: 'returnable',
    x: interactionLaneX,
    y: RETURNABLE_WARNING_Y,
    vx: returnableVx,
    vy: returnableVy,
    radius: RETURNABLE_PROJECTILE_RADIUS,
    yawOffset: randomSignedYawOffset(rng, 16, 30),
    perspectiveTarget: {
      x: clamp(returnableTarget.x, 36, 504),
      y: 820,
    },
    perspectiveDurationMs: 1_450 + Math.round(rng.range(-40, 40)),
  }];
  const returnableIndex = openingProjectiles.length;
  const returnableIndices = [returnableIndex];
  const projectiles = [...openingProjectiles, ...returnableProjectiles];
  return {
    safeLaneX,
    interactionLaneX,
    returnableIndex,
    returnableIndices,
    openingProjectiles,
    returnableProjectiles,
    projectiles,
  };
}

export function runReturnableBurst(
  context: AttackPatternContext,
  safeLaneX: number,
  onReturnablesSpawned?: () => void,
): AttackPatternHandle {
  const plan = planReturnableBurst(
    context.rng,
    context.intensity,
    context.waveIndex,
    context.speedScale,
    { x: safeLaneX, y: context.player.y },
  );
  // Even the shortest schema-valid step retains a full isolated near-plane
  // interaction beat. There are no ordinary papers in this second stage.
  const maxReturnablePerspectiveMs = Math.max(
    650,
    context.durationMs - RETURNABLE_WINDOW_START_MS - RETURNABLE_MIN_NEAR_PLANE_MS,
  );
  const returnableProjectiles = plan.returnableProjectiles.map((config) => ({
    ...config,
    perspectiveDurationMs: Math.min(
      config.perspectiveDurationMs ?? maxReturnablePerspectiveMs,
      maxReturnablePerspectiveMs,
    ),
  }));
  return createPatternTimeline(context.durationMs, [
    ...staggeredSpawnEvents(context.projectiles, plan.openingProjectiles, 100),
    {
      atMs: RETURNABLE_OPENING_CLEAR_MS,
      // Preserve the documents' camera-bound momentum. By the end of the
      // following gap they have crossed the padded exit independently, while
      // gameplay ownership is already removed for the marked-card lesson.
      emit: () => context.projectiles.releaseDangerousForExit(),
    },
    {
      atMs: RETURNABLE_WINDOW_START_MS,
      emit: () => {
        spawnConfigs(context.projectiles, returnableProjectiles);
        onReturnablesSpawned?.();
      },
    },
  ]);
}
