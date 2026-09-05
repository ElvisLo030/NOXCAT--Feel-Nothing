import type { SeededRng } from '../../utils/rng';
import type { ProjectileConfig } from '../entities/Projectile';
import { clearVerticalSafeWedgeForTunnelTarget } from '../systems/DangerTelegraph';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import { PLAYER_HIT_RADIUS } from '../constants';
import {
  ATTACK_NEAR_MAX_X,
  ATTACK_NEAR_MIN_X,
  evenlySpaced,
} from './fairness';
import {
  createPatternTimeline,
  staggeredSpawnEvents,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

// The gameplay collider follows the complete jelly-cat silhouette rather than
// an 18 px centre circle. Reserve enough room for that wide bun-shaped body
// plus the reduced near-plane document surface.
export const PAPER_SAFE_LANE_HALF_WIDTH = 72;
const PAPER_PROJECTILE_RADIUS = 18;
const PAPER_LANE_EXCLUSION = PAPER_SAFE_LANE_HALF_WIDTH
  + PAPER_PROJECTILE_RADIUS
  + PLAYER_HIT_RADIUS
  + 4;

export function planPaperRain(
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneCentre: number,
): ProjectileConfig[] {
  // A whole AttackStep is one wave. Keep enough documents in that single
  // formation for graze-based players to charge without continuous spawning.
  const count = 7 + intensity;
  const wideLaneCentres = evenlySpaced(ATTACK_NEAR_MIN_X, ATTACK_NEAR_MAX_X, count);
  const durationBands = [1_450, 1_850, 2_300, 2_750] as const;
  return Array.from({ length: count }, (_, index) => {
    // Build every formation across an overscanned near plane. Pure random
    // x-coordinates occasionally left both screen edges empty, allowing a
    // player to camp there for a complete wave.
    let x = wideLaneCentres[index]! + rng.range(-14, 14);
    if (Math.abs(x - safeLaneCentre) < PAPER_LANE_EXCLUSION) {
      const leftCandidate = safeLaneCentre - PAPER_LANE_EXCLUSION;
      const rightCandidate = safeLaneCentre + PAPER_LANE_EXCLUSION;
      x = x < safeLaneCentre
        ? leftCandidate >= ATTACK_NEAR_MIN_X ? leftCandidate : rightCandidate
        : rightCandidate <= ATTACK_NEAR_MAX_X ? rightCandidate : leftCandidate;
    }
    const side = x < safeLaneCentre ? -1 : 1;
    const y = -55 - rng.range(0, 180);
    const vy = rng.range(180, 235 + intensity * 34) * speedScale;
    const vx = side * rng.range(4, 30) * speedScale;
    const perspectiveY = 820;
    const perspectiveTime = (perspectiveY - y) / Math.max(1, vy);
    const perspectiveTarget = clearVerticalSafeWedgeForTunnelTarget(
      {
        x: Math.min(ATTACK_NEAR_MAX_X, Math.max(ATTACK_NEAR_MIN_X, x + vx * perspectiveTime)),
        y: perspectiveY,
      },
      { center: safeLaneCentre, halfWidth: PAPER_SAFE_LANE_HALF_WIDTH },
      side,
      PAPER_PROJECTILE_RADIUS + PLAYER_HIT_RADIUS + 4,
    );
    return {
      kind: 'paper' as const,
      x,
      y,
      // Drift away from the reserved lane so it remains safe for the volley's
      // whole descent instead of only at the spawn frame.
      vx,
      vy,
      radius: PAPER_PROJECTILE_RADIUS,
      rotationSpeed: rng.range(-1.3, 1.3),
      perspectiveTarget: {
        x: Math.min(ATTACK_NEAR_MAX_X, Math.max(ATTACK_NEAR_MIN_X, perspectiveTarget.x)),
        y: perspectiveY,
      },
      // Independent deterministic depth clocks combine with timeline staging
      // so cards occupy visibly different near/mid/far planes.
      perspectiveDurationMs: durationBands[index % durationBands.length]!
        + Math.round(rng.range(-45, 45)),
    };
  });
}

export function spawnPaperRain(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  intensity: 1 | 2 | 3,
  speedScale: number,
  safeLaneCentre: number
): void {
  for (const config of planPaperRain(rng, intensity, speedScale, safeLaneCentre)) {
    projectiles.spawn(config);
  }
}

export function runPaperRain(
  context: AttackPatternContext,
  safeLaneCentre: number,
): AttackPatternHandle {
  const configs = planPaperRain(
    context.rng,
    context.intensity,
    context.speedScale,
    safeLaneCentre,
  );
  return createPatternTimeline(
    context.durationMs,
    staggeredSpawnEvents(context.projectiles, configs, 145),
  );
}
