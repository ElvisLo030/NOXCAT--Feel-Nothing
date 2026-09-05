import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import { clearVerticalSafeWedgeForTunnelTarget } from '../systems/DangerTelegraph';
import { clamp, randomSignedYawOffset } from './fairness';
import {
  createPatternTimeline,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

export const ALTERNATING_ZIPPER_SAFE_LANE_HALF_WIDTH = 72;
export const ALTERNATING_ZIPPER_INTERVALS_MS = [620, 560, 500, 440, 380, 340, 300] as const;

const PROJECTILE_RADIUS = 18;
const TARGET_CLEARANCE = ALTERNATING_ZIPPER_SAFE_LANE_HALF_WIDTH
  + PLAYER_HIT_RADIUS
  + PROJECTILE_RADIUS
  + 18;

export interface AlternatingZipperShot {
  readonly atMs: number;
  readonly side: -1 | 1;
  readonly projectile: ProjectileConfig;
}

export interface AlternatingZipperPlan {
  readonly safeLaneX: number;
  readonly shots: readonly AlternatingZipperShot[];
}

/** Left/right single shots accelerate into a zipper while one lane stays open. */
export function planAlternatingZipper(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  waveIndex: number,
  speedScale: number,
  safeLaneX: number,
): AlternatingZipperPlan {
  const shotCount = 5 + intensity;
  const firstSide: -1 | 1 = waveIndex % 2 === 0 ? -1 : 1;
  const depthClockScale = Math.max(0.1, speedScale);
  let atMs = 0;
  const shots = Array.from({ length: shotCount }, (_, index): AlternatingZipperShot => {
    const side: -1 | 1 = index % 2 === 0 ? firstSide : (firstSide === -1 ? 1 : -1);
    const rawTarget = {
      x: clamp(
        safeLaneX + side * (TARGET_CLEARANCE + rng.range(18, 96)),
        -36,
        576,
      ),
      y: 760 + (index % 3) * 52,
    };
    const target = clearVerticalSafeWedgeForTunnelTarget(
      rawTarget,
      { center: safeLaneX, halfWidth: ALTERNATING_ZIPPER_SAFE_LANE_HALF_WIDTH },
      side,
      PROJECTILE_RADIUS + PLAYER_HIT_RADIUS + 4,
    );
    const shot = {
      atMs,
      side,
      projectile: {
        kind: 'paper' as const,
        x: 270 + side * 12,
        y: 150,
        vx: side * rng.range(22, 44) * speedScale,
        vy: (285 + intensity * 22) * speedScale,
        radius: PROJECTILE_RADIUS,
        yawOffset: randomSignedYawOffset(rng, 10, 24),
        perspectiveTarget: target,
        perspectiveDurationMs: Math.round((760 + (index % 2) * 80) / depthClockScale),
      },
    };
    atMs += ALTERNATING_ZIPPER_INTERVALS_MS[
      Math.min(index, ALTERNATING_ZIPPER_INTERVALS_MS.length - 1)
    ]!;
    return shot;
  });

  return { safeLaneX, shots };
}

export function runAlternatingZipper(
  context: AttackPatternContext,
  safeLaneX: number,
): AttackPatternHandle {
  const plan = planAlternatingZipper(
    context.rng,
    context.intensity,
    context.waveIndex,
    context.speedScale,
    safeLaneX,
  );
  return createPatternTimeline(
    context.durationMs,
    plan.shots.map((shot) => ({
      atMs: shot.atMs,
      emit: () => { context.projectiles.spawn(shot.projectile); },
    })),
  );
}
