export type ProjectileKind = 'paper' | 'comment' | 'returnable' | 'wall' | 'homing';

export interface ProjectileDepthPose {
  progress: number;
  alignment: number;
  scale: number;
  foreshortening: number;
  alpha: number;
  displayDepth: number;
}

export interface ProjectileDepthPoint {
  readonly x: number;
  readonly y: number;
}

export const BOSS_PROJECTILE_ORIGIN: ProjectileDepthPoint = { x: 270, y: 260 };
export const TUNNEL_RADIUS_X = 300;
export const TUNNEL_RADIUS_Y = 670;
export const PROJECTILE_COLLISION_ENTRY_Y = 386;

export interface TunnelTrajectory {
  readonly spawn: ProjectileDepthPoint;
  readonly nearPoint: ProjectileDepthPoint;
  readonly laneAngle: number;
  readonly laneRadius: number;
  readonly approachLength: number;
  readonly directionX: number;
  readonly directionY: number;
}

export interface TunnelProjection {
  readonly position: ProjectileDepthPoint;
  readonly depth: number;
  readonly radialDistance: number;
  readonly collisionActive: boolean;
}

export const WALL_CARD_SCALE_Y = 1.6;
const PROJECTILE_TEXTURE_HEIGHT = 62;
const WALL_NEAR_DEPTH_SCALE = 1.42;
const PLAYER_MIN_X = 46;
const PLAYER_MAX_X = 494;
const PLAYER_MIN_Y = 430;
const PLAYER_MAX_Y = 884;
const PLAYER_HIT_RADIUS = 18;
const TUNNEL_EPSILON = 1e-6;

export function nearWallVisualHalfHeight(): number {
  return PROJECTILE_TEXTURE_HEIGHT * WALL_CARD_SCALE_Y * WALL_NEAR_DEPTH_SCALE / 2;
}

/** Compatibility wrapper used by presentation tests and non-tunnel callers. */
export function calculateProjectileDepthPose(
  kind: ProjectileKind,
  ageMs: number,
  distanceTravelled: number,
): ProjectileDepthPose {
  const travelForFullScale = kind === 'comment' || kind === 'wall' ? 520 : 640;
  const travelProgress = Math.max(0, distanceTravelled) / travelForFullScale;
  const timeProgress = Math.max(0, ageMs) / 3_000;
  const progress = clamp(Math.max(travelProgress, timeProgress * 0.72), 0, 1);
  return calculateTunnelDepthPose(kind, progress);
}

/** Perspective appearance for one explicit far-to-near tunnel depth. */
export function calculateTunnelDepthPose(
  kind: ProjectileKind,
  depth: number,
): ProjectileDepthPose {
  const progress = clamp(depth, 0, 1);
  const expansion = perspectiveExpansion(progress);
  const scaleDepth = Math.pow(progress, 1.18);
  const endScale = kind === 'returnable'
    ? 1.72
    : kind === 'wall'
      ? WALL_NEAR_DEPTH_SCALE
      : kind === 'comment'
        ? 1.48
        : 1.55;
  return {
    progress,
    alignment: expansion,
    scale: lerp(0.16, endScale, scaleDepth),
    foreshortening: lerp(kind === 'comment' ? 0.5 : 0.34, 1, scaleDepth),
    alpha: lerp(0.16, 1, Math.sqrt(progress)),
    // Far cards begin behind the Boss shell, then cross in front of the player
    // only at near depth. This gives the perspective pass correct occlusion.
    displayDepth: 6 + progress * 30,
  };
}

/**
 * Creates the shared deterministic ray used by every physical document. The
 * near point is where its fixed collider first enters the player contact area;
 * until then the card is rendered on a polar lane inside the elliptical tunnel.
 */
export function createTunnelTrajectory(
  spawn: ProjectileDepthPoint,
  velocity: ProjectileDepthPoint,
  projectileRadius: number,
): TunnelTrajectory {
  const padding = PLAYER_HIT_RADIUS + Math.max(0, projectileRadius);
  const collisionBounds = {
    left: PLAYER_MIN_X - padding,
    right: PLAYER_MAX_X + padding,
    top: PLAYER_MIN_Y - padding,
    bottom: PLAYER_MAX_Y + padding,
  };
  const entryTime = rayRectangleEntryTime(spawn, velocity, collisionBounds);
  const fallbackTime = firstForwardBoundaryTime(spawn, velocity);
  const travelTime = entryTime ?? fallbackTime;
  const nearPoint = Number.isFinite(travelTime)
    ? {
        x: spawn.x + velocity.x * travelTime,
        y: spawn.y + velocity.y * travelTime,
      }
    : { x: spawn.x, y: spawn.y };
  const approachX = nearPoint.x - spawn.x;
  const approachY = nearPoint.y - spawn.y;
  const approachLength = Math.hypot(approachX, approachY);
  const normalizedX = (nearPoint.x - BOSS_PROJECTILE_ORIGIN.x) / TUNNEL_RADIUS_X;
  const normalizedY = (nearPoint.y - BOSS_PROJECTILE_ORIGIN.y) / TUNNEL_RADIUS_Y;
  const laneRadius = Math.hypot(normalizedX, normalizedY);

  return {
    spawn: { ...spawn },
    nearPoint,
    laneAngle: Math.atan2(normalizedY, normalizedX),
    laneRadius,
    approachLength,
    directionX: approachLength > TUNNEL_EPSILON ? approachX / approachLength : 0,
    directionY: approachLength > TUNNEL_EPSILON ? approachY / approachLength : 0,
  };
}

/** Samples radial tunnel expansion and converges exactly on the fixed collider. */
export function sampleTunnelProjection(
  trajectory: TunnelTrajectory,
  collider: ProjectileDepthPoint,
  previousDepth = 0,
): TunnelProjection {
  if (trajectory.approachLength <= TUNNEL_EPSILON) {
    return {
      position: { ...collider },
      depth: 1,
      radialDistance: distanceFromOrigin(collider),
      collisionActive: true,
    };
  }

  const travelledX = collider.x - trajectory.spawn.x;
  const travelledY = collider.y - trajectory.spawn.y;
  const alongRay = travelledX * trajectory.directionX + travelledY * trajectory.directionY;
  const depth = Math.max(clamp(previousDepth, 0, 1), clamp(
    alongRay / trajectory.approachLength,
    0,
    1,
  ));
  if (depth >= 1 - TUNNEL_EPSILON) {
    return {
      position: { ...collider },
      depth: 1,
      radialDistance: distanceFromOrigin(collider),
      collisionActive: true,
    };
  }

  const basePosition = projectTunnelLane(trajectory.laneAngle, trajectory.laneRadius, depth);
  const expectedCollider = {
    x: lerp(trajectory.spawn.x, trajectory.nearPoint.x, depth),
    y: lerp(trajectory.spawn.y, trajectory.nearPoint.y, depth),
  };
  // Homing may bend away from the initial ray. Blend that deviation in over
  // depth so the render path remains smooth and already matches the collider
  // when contact activates, rather than snapping on the final frame.
  const correctionWeight = depth * depth;
  const position = {
    x: basePosition.x + (collider.x - expectedCollider.x) * correctionWeight,
    y: basePosition.y + (collider.y - expectedCollider.y) * correctionWeight,
  };
  return {
    position,
    depth,
    radialDistance: distanceFromOrigin(position),
    collisionActive: false,
  };
}

/** Frame-rate-independent logical length for the short projected speed trace. */
export function projectileStreakLength(depth: number): number {
  return lerp(10, 75, Math.pow(clamp(depth, 0, 1), 1.25));
}

/** Projects one polar lane onto an expanding elliptical tunnel cross-section. */
export function projectTunnelLane(
  laneAngle: number,
  laneRadius: number,
  depth: number,
): ProjectileDepthPoint {
  const expansion = perspectiveExpansion(clamp(depth, 0, 1));
  return {
    x: BOSS_PROJECTILE_ORIGIN.x
      + Math.cos(laneAngle) * TUNNEL_RADIUS_X * laneRadius * expansion,
    y: BOSS_PROJECTILE_ORIGIN.y
      + Math.sin(laneAngle) * TUNNEL_RADIUS_Y * laneRadius * expansion,
  };
}

function perspectiveExpansion(depth: number): number {
  // Objects accelerate radially as they approach the camera; unlike a linear
  // 2D lerp this produces the near-large / far-small tunnel read.
  return Math.pow(clamp(depth, 0, 1), 1.58);
}

function distanceFromOrigin(point: ProjectileDepthPoint): number {
  return Math.hypot(
    point.x - BOSS_PROJECTILE_ORIGIN.x,
    point.y - BOSS_PROJECTILE_ORIGIN.y,
  );
}

interface RectangleBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function rayRectangleEntryTime(
  origin: ProjectileDepthPoint,
  velocity: ProjectileDepthPoint,
  bounds: RectangleBounds,
): number | null {
  let earliest = Number.NEGATIVE_INFINITY;
  let latest = Number.POSITIVE_INFINITY;
  for (const [position, speed, minimum, maximum] of [
    [origin.x, velocity.x, bounds.left, bounds.right],
    [origin.y, velocity.y, bounds.top, bounds.bottom],
  ] as const) {
    if (Math.abs(speed) <= TUNNEL_EPSILON) {
      if (position < minimum || position > maximum) return null;
      continue;
    }
    const first = (minimum - position) / speed;
    const second = (maximum - position) / speed;
    earliest = Math.max(earliest, Math.min(first, second));
    latest = Math.min(latest, Math.max(first, second));
  }
  const entry = Math.max(0, earliest);
  return latest >= entry ? entry : null;
}

function firstForwardBoundaryTime(
  spawn: ProjectileDepthPoint,
  velocity: ProjectileDepthPoint,
): number {
  const times: number[] = [];
  if (Math.abs(velocity.x) > TUNNEL_EPSILON) {
    const xBoundary = velocity.x > 0 ? -30 : 570;
    const time = (xBoundary - spawn.x) / velocity.x;
    if (time > 0) times.push(time);
  }
  if (Math.abs(velocity.y) > TUNNEL_EPSILON) {
    const yBoundary = velocity.y > 0 ? PROJECTILE_COLLISION_ENTRY_Y : 930;
    const time = (yBoundary - spawn.y) / velocity.y;
    if (time > 0) times.push(time);
  }
  return times.length > 0 ? Math.min(...times) : Number.POSITIVE_INFINITY;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
