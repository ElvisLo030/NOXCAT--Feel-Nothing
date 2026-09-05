import type { TunnelTrajectory } from './ProjectileDepth';

export interface ProjectileVelocity {
  readonly x: number;
  readonly y: number;
}

/** Keeps the complete perspective-warped card outside the viewport before recycling. */
export const PROJECTILE_EXIT_PADDING = 120;
export const PROJECTILE_EXIT_MIN_SPEED = 760;
export const PROJECTILE_EXIT_ACCELERATION = 1_050;
export const PROJECTILE_EXIT_MAX_SPEED = 1_450;
export const PROJECTILE_MAX_LIFETIME_MS = 12_000;

const TUNNEL_NEAR_DERIVATIVE = 1.35;
const EPSILON = 1e-6;

/**
 * Matches the near-plane continuation to the apparent end speed of the depth
 * projection, then points it along the same authored ray. A clamp prevents
 * short authored perspective clocks from producing an unplayable impulse,
 * while an already faster projectile is never slowed down.
 */
export function initialProjectileExitVelocity(
  trajectory: TunnelTrajectory,
  authoredVelocity: ProjectileVelocity,
): ProjectileVelocity {
  const authoredSpeed = Math.hypot(authoredVelocity.x, authoredVelocity.y);
  // 側面入口必須延續自身射線，否則近景交接會突然轉向安全車道。
  const rayX = trajectory.nearPoint.x - trajectory.origin.x;
  const rayY = trajectory.nearPoint.y - trajectory.origin.y;
  const rayLength = Math.hypot(rayX, rayY);
  if (authoredSpeed <= EPSILON || rayLength <= EPSILON) return authoredVelocity;

  const approachDurationSeconds = trajectory.approachLength / authoredSpeed;
  const projectedEndSpeed = approachDurationSeconds > EPSILON
    ? rayLength * TUNNEL_NEAR_DERIVATIVE / approachDurationSeconds
    : authoredSpeed;
  const exitSpeed = Math.max(
    authoredSpeed,
    PROJECTILE_EXIT_MIN_SPEED,
    Math.min(PROJECTILE_EXIT_MAX_SPEED, projectedEndSpeed),
  );
  return {
    x: rayX / rayLength * exitSpeed,
    y: rayY / rayLength * exitSpeed,
  };
}

/** Advances outbound speed without changing the established perspective ray. */
export function accelerateProjectileExit(
  velocity: ProjectileVelocity,
  deltaSeconds: number,
): ProjectileVelocity {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed <= EPSILON || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return velocity;
  }
  // Preserve intentionally faster debug/special projectiles instead of
  // clamping them backwards to the normal visual ceiling.
  const nextSpeed = speed >= PROJECTILE_EXIT_MAX_SPEED
    ? speed
    : Math.min(
        PROJECTILE_EXIT_MAX_SPEED,
        Math.max(speed, PROJECTILE_EXIT_MIN_SPEED)
          + PROJECTILE_EXIT_ACCELERATION * deltaSeconds,
      );
  return {
    x: velocity.x / speed * nextSpeed,
    y: velocity.y / speed * nextSpeed,
  };
}

export function isBeyondProjectileExitBoundary(
  point: Readonly<{ x: number; y: number }>,
  width: number,
  height: number,
  padding = PROJECTILE_EXIT_PADDING,
  origin: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
): boolean {
  return point.x < origin.x - padding
    || point.x > origin.x + width + padding
    || point.y < origin.y - padding
    || point.y > origin.y + height + padding;
}
