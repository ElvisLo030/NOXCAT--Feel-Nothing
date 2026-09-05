import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS } from '../constants';
import type { ProjectileConfig } from '../entities/Projectile';
import { clearVerticalSafeWedgeForTunnelTarget } from '../systems/DangerTelegraph';
import {
  ATTACK_NEAR_MAX_X,
  ATTACK_NEAR_MIN_X,
  evenlySpaced,
  randomSignedYawOffset,
} from './fairness';
import {
  createPatternTimeline,
  spawnConfigs,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

export const PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH = 76;
export const PULSE_BARRAGE_GAP_MS = 760;

const PROJECTILE_RADIUS = 18;

export interface PulseBarrageFormation {
  readonly atMs: number;
  readonly projectiles: readonly ProjectileConfig[];
}

export interface PulseBarragePlan {
  readonly safeLaneX: number;
  readonly formations: readonly PulseBarrageFormation[];
}

/** Compact simultaneous curtains separated by a clearly readable rest beat. */
export function planPulseBarrage(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneX: number,
): PulseBarragePlan {
  const pulseCount = intensity + 1;
  const cardsPerPulse = 5 + intensity;
  const depthClockScale = Math.max(0.1, speedScale);
  const formations = Array.from({ length: pulseCount }, (_, pulseIndex) => {
    const halfStep = pulseIndex % 2 === 0
      ? 0
      : (ATTACK_NEAR_MAX_X - ATTACK_NEAR_MIN_X) / Math.max(1, cardsPerPulse - 1) / 2;
    const targets = evenlySpaced(
      ATTACK_NEAR_MIN_X - halfStep,
      ATTACK_NEAR_MAX_X + halfStep,
      cardsPerPulse,
    );
    const projectiles = targets.map((targetX, index): ProjectileConfig => {
      const side: -1 | 1 = targetX < safeLaneX ? -1 : 1;
      const target = clearVerticalSafeWedgeForTunnelTarget(
        { x: targetX, y: 835 },
        { center: safeLaneX, halfWidth: PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH },
        side,
        PROJECTILE_RADIUS + PLAYER_HIT_RADIUS + 4,
      );
      return {
        kind: 'paper',
        x: 270 + rng.range(-16, 16),
        y: 148 - pulseIndex * 8,
        vx: rng.range(-12, 12) * speedScale,
        vy: (270 + intensity * 24) * speedScale,
        radius: PROJECTILE_RADIUS,
        yawOffset: randomSignedYawOffset(rng, 7, 18),
        perspectiveTarget: target,
        perspectiveDurationMs: Math.round((980 + (index % 2) * 90) / depthClockScale),
      };
    });
    return {
      atMs: pulseIndex * PULSE_BARRAGE_GAP_MS,
      projectiles,
    };
  });

  return { safeLaneX, formations };
}

export function runPulseBarrage(
  context: AttackPatternContext,
  safeLaneX: number,
): AttackPatternHandle {
  const plan = planPulseBarrage(
    context.rng,
    context.intensity,
    context.speedScale,
    safeLaneX,
  );
  return createPatternTimeline(
    context.durationMs,
    plan.formations.map((formation) => ({
      atMs: formation.atMs,
      emit: () => spawnConfigs(context.projectiles, formation.projectiles),
    })),
  );
}
