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

export interface ProjectilePerspectiveQuad {
  readonly topLeft: ProjectileDepthPoint;
  readonly topRight: ProjectileDepthPoint;
  readonly bottomRight: ProjectileDepthPoint;
  readonly bottomLeft: ProjectileDepthPoint;
}

/**
 * Reusable pinhole transform for one rigid projectile plane. Keeping this
 * separate from the sampled UV point lets the subdivided runtime mesh project
 * every vertex with one shared camera calculation and no per-frame garbage.
 */
export interface ProjectilePerspectiveProjection {
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly cosineYaw: number;
  readonly sineYaw: number;
  readonly cosinePitch: number;
  readonly sinePitch: number;
  readonly focalLength: number;
}

export interface MutableProjectileDepthPoint {
  x: number;
  y: number;
}

export interface ProjectilePerspectiveGridData {
  readonly vertices: number[];
  readonly uvs: number[];
}

/** Shared vanishing point: the Boss' lower bezel and every floor ray meet here. */
export const BOSS_PROJECTILE_ORIGIN: ProjectileDepthPoint = { x: 270, y: 385 };
export const TUNNEL_RADIUS_X = 300;
export const TUNNEL_RADIUS_Y = 670;
export const PROJECTILE_COLLISION_ENTRY_Y = 386;
/**
 * At 0.80 the card reaches display depth 30, matching NOXCAT's render depth.
 * Its projected centre therefore becomes the gameplay collider here. Earlier
 * depth remains presentation-only; radial exit motion still begins at depth 1.
 */
export const PROJECTILE_CONTACT_DEPTH = 0.80;
export const FLOOR_GRID_EXPONENT = 1.8;

export interface TunnelTrajectory {
  /** Vanishing point for this ray. Side attacks use a wall portal here. */
  readonly origin: ProjectileDepthPoint;
  readonly spawn: ProjectileDepthPoint;
  /** Endpoint used only to measure progress along the authored pattern path. */
  readonly approachPoint: ProjectileDepthPoint;
  /** Authored point where the Boss-origin ray reaches near player depth. */
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

/** 改變可見瞄準射線但保留原接近時鐘，避免追蹤時深度倒退或突然命中。 */
export function retargetTunnelTrajectory(
  trajectory: TunnelTrajectory,
  target: ProjectileDepthPoint,
): TunnelTrajectory {
  const x = (target.x - trajectory.origin.x) / TUNNEL_RADIUS_X;
  const y = (target.y - trajectory.origin.y) / TUNNEL_RADIUS_Y;
  return { ...trajectory, nearPoint: target, laneAngle: Math.atan2(y, x), laneRadius: Math.hypot(x, y) };
}

export const WALL_CARD_SCALE_Y = 1;
const PROJECTILE_TEXTURE_HEIGHT = 52;
const FAR_DEPTH_SCALE = 0.13;
const WALL_NEAR_DEPTH_SCALE = 1.55;
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
  const expansion = projectileDepthExpansion(progress);
  const scaleDepth = Math.pow(progress, 1.18);
  const endScale = kind === 'returnable'
    ? 1.78
    : kind === 'wall'
      ? WALL_NEAR_DEPTH_SCALE
      : kind === 'comment'
        ? 1.55
        : kind === 'homing'
          ? 1.65
          : 1.65;
  return {
    progress,
    alignment: expansion,
    scale: lerp(FAR_DEPTH_SCALE, endScale, scaleDepth),
    foreshortening: lerp(kind === 'comment' ? 0.84 : 0.82, 1, scaleDepth),
    alpha: lerp(0.16, 1, Math.sqrt(progress)),
    // Far cards begin behind the Boss shell, then cross in front of the player
    // only at near depth. This gives the perspective pass correct occlusion.
    displayDepth: 6 + progress * 30,
  };
}

/**
 * Creates the shared deterministic ray used by every physical document. The
 * near point is the authored impact-depth target (or a safe fallback entry);
 * until then the card is rendered on a polar lane inside the elliptical tunnel.
 */
export function createTunnelTrajectory(
  spawn: ProjectileDepthPoint,
  velocity: ProjectileDepthPoint,
  projectileRadius: number,
  perspectiveTarget?: ProjectileDepthPoint,
  perspectiveDurationMs?: number,
  perspectiveOrigin: ProjectileDepthPoint = BOSS_PROJECTILE_ORIGIN,
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
  const speed = Math.hypot(velocity.x, velocity.y);
  const targetTravelTime = perspectiveTarget && speed > TUNNEL_EPSILON
    ? Number.isFinite(perspectiveDurationMs) && (perspectiveDurationMs ?? 0) > 0
      ? (perspectiveDurationMs ?? 0) / 1000
      : Math.hypot(
          perspectiveTarget.x - spawn.x,
          perspectiveTarget.y - spawn.y,
        ) / speed
    : null;
  const travelTime = targetTravelTime ?? entryTime ?? fallbackTime;
  const approachPoint = Number.isFinite(travelTime)
    ? {
        x: spawn.x + velocity.x * travelTime,
        y: spawn.y + velocity.y * travelTime,
      }
    : { x: spawn.x, y: spawn.y };
  const intendedTarget = perspectiveTarget ?? approachPoint;
  const bossRay = {
    x: intendedTarget.x - perspectiveOrigin.x,
    y: intendedTarget.y - perspectiveOrigin.y,
  };
  const nearPlaneTime = perspectiveTarget
    ? null
    : rayRectangleEntryTime(perspectiveOrigin, bossRay, collisionBounds);
  // Side-authored patterns used to activate at x=0/540 and then continue
  // radially out of the arena. Intersecting their intended aim ray from the
  // Boss makes the same ray enter and traverse a meaningful part of player
  // space before it exits.
  const nearPoint = nearPlaneTime === null || nearPlaneTime <= TUNNEL_EPSILON
    ? intendedTarget
    : {
        x: perspectiveOrigin.x + bossRay.x * nearPlaneTime,
        y: perspectiveOrigin.y + bossRay.y * nearPlaneTime,
      };
  const approachX = approachPoint.x - spawn.x;
  const approachY = approachPoint.y - spawn.y;
  const approachLength = Math.hypot(approachX, approachY);
  const normalizedX = (nearPoint.x - perspectiveOrigin.x) / TUNNEL_RADIUS_X;
  const normalizedY = (nearPoint.y - perspectiveOrigin.y) / TUNNEL_RADIUS_Y;
  const laneRadius = Math.hypot(normalizedX, normalizedY);

  return {
    origin: { ...perspectiveOrigin },
    spawn: { ...spawn },
    approachPoint,
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
    const deviationX = collider.x - trajectory.approachPoint.x;
    const deviationY = collider.y - trajectory.approachPoint.y;
    const position = {
      x: trajectory.nearPoint.x + deviationX,
      y: trajectory.nearPoint.y + deviationY,
    };
    return {
      position,
      depth: 1,
      radialDistance: distanceFromOrigin(position),
      collisionActive: true,
    };
  }

  const basePosition = projectTunnelLane(
    trajectory.laneAngle,
    trajectory.laneRadius,
    depth,
    trajectory.origin,
  );
  const expectedCollider = {
    x: lerp(trajectory.spawn.x, trajectory.approachPoint.x, depth),
    y: lerp(trajectory.spawn.y, trajectory.approachPoint.y, depth),
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
    collisionActive: depth >= PROJECTILE_CONTACT_DEPTH - TUNNEL_EPSILON,
  };
}

/**
 * Projects a card plane into a four-corner keystone. Each lane gets its own
 * yaw and pitch while roll stays zero. This is intentionally separate from
 * the depth scale: scaling alone preserves a perfect rectangle and reads as a
 * flat UI element growing on screen, while the pinhole projection makes the
 * left and right cards expose opposite faces.
 *
 * Returned points are screen-space offsets around the projected texture
 * centre, which stays on the gameplay ray through the far/near hand-off.
 */
export function calculateProjectilePerspectiveQuad(
  projectedCenter: ProjectileDepthPoint,
  displayWidth: number,
  displayHeight: number,
  depth: number,
  directionReference: ProjectileDepthPoint = projectedCenter,
  vanishingPoint: ProjectileDepthPoint = BOSS_PROJECTILE_ORIGIN,
): ProjectilePerspectiveQuad {
  const projection = createProjectilePerspectiveProjection(
    projectedCenter,
    displayWidth,
    displayHeight,
    depth,
    directionReference,
    vanishingPoint,
  );
  return {
    topLeft: projectProjectilePerspectiveUv(projection, 0, 0),
    topRight: projectProjectilePerspectiveUv(projection, 1, 0),
    bottomRight: projectProjectilePerspectiveUv(projection, 1, 1),
    bottomLeft: projectProjectilePerspectiveUv(projection, 0, 1),
  };
}

/**
 * Builds a regular triangle grid for Phaser's 2D Mesh pipeline. A single quad
 * would interpolate UVs affinely inside two large triangles and visibly kink
 * the document texture across their diagonal. Small cells approximate the
 * pinhole mapping while keeping a deterministic, pooled topology.
 */
export function createProjectilePerspectiveGridData(
  displayWidth: number,
  displayHeight: number,
  columns: number,
  rows: number,
): ProjectilePerspectiveGridData {
  const columnCount = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  const width = Math.max(0, displayWidth);
  const height = Math.max(0, displayHeight);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const addVertex = (u: number, v: number): void => {
    vertices.push((u - 0.5) * width, (v - 0.5) * height);
    uvs.push(u, v);
  };
  for (let row = 0; row < rowCount; row += 1) {
    const top = row / rowCount;
    const bottom = (row + 1) / rowCount;
    for (let column = 0; column < columnCount; column += 1) {
      const left = column / columnCount;
      const right = (column + 1) / columnCount;
      // Match Phaser's established winding for an orthographic textured quad.
      addVertex(left, bottom);
      addVertex(left, top);
      addVertex(right, bottom);
      addVertex(left, top);
      addVertex(right, top);
      addVertex(right, bottom);
    }
  }
  return { vertices, uvs };
}

/** Builds the shared rigid-plane transform used by the quad and UV grid. */
export function createProjectilePerspectiveProjection(
  projectedCenter: ProjectileDepthPoint,
  displayWidth: number,
  displayHeight: number,
  depth: number,
  directionReference: ProjectileDepthPoint = projectedCenter,
  vanishingPoint: ProjectileDepthPoint = BOSS_PROJECTILE_ORIGIN,
): ProjectilePerspectiveProjection {
  const halfWidth = Math.max(0, displayWidth) / 2;
  const halfHeight = Math.max(0, displayHeight) / 2;
  // Use the authored near point as the stable lane reference. This matters
  // visually: two cards at the same depth but on opposite sides now get
  // opposite yaw instead of sharing one generic trapezoid. It also prevents a
  // homing correction or a low-FPS hand-off from making the card's face wobble
  // or flip orientation while it is coming straight toward the camera.
  const horizontalSpan = Math.max(
    vanishingPoint.x - PLAYER_MIN_X,
    PLAYER_MAX_X - vanishingPoint.x,
  );
  const verticalSpan = Math.max(
    1,
    PLAYER_MAX_Y - vanishingPoint.y,
  );
  const laneSource = Math.hypot(
    directionReference.x - vanishingPoint.x,
    directionReference.y - vanishingPoint.y,
  ) > TUNNEL_EPSILON
    ? directionReference
    : projectedCenter;
  const laneX = clamp(
    (laneSource.x - vanishingPoint.x) / Math.max(1, horizontalSpan),
    -1,
    1,
  );
  const laneY = clamp(
    (laneSource.y - vanishingPoint.y) / verticalSpan,
    -1,
    1,
  );

  // This is a small, real 3D projection rather than a 2D scale/shear trick.
  // The card plane has yaw (from its left/right lane) and pitch (from its
  // vertical lane), while screen-space roll is composed later by Projectile.
  // Mirrored lanes therefore produce mirrored keystones before either signed roll.
  const orientationEnvelope = lerp(0.44, 1, smoothstep(0.04, 0.92, depth));
  const degreesToRadians = Math.PI / 180;
  // Screen-space lane direction and 3D plane yaw have opposite signs: a card
  // travelling toward the left side must open its inner (right) edge toward
  // the Boss ray, with the right lane using the exact mirrored orientation.
  const yaw = -laneX * 42 * degreesToRadians * orientationEnvelope;
  const pitch = laneY * 25 * degreesToRadians * orientationEnvelope;
  const cosineYaw = Math.cos(yaw);
  const sineYaw = Math.sin(yaw);
  const cosinePitch = Math.cos(pitch);
  const sinePitch = Math.sin(pitch);
  const focalLength = Math.max(1, Math.max(displayWidth, displayHeight) * 1.55);
  return {
    halfWidth,
    halfHeight,
    cosineYaw,
    sineYaw,
    cosinePitch,
    sinePitch,
    focalLength,
  };
}

/**
 * Projects one texture coordinate through the same 3D plane as every other
 * point on the card. `target` is optional so runtime mesh updates can reuse a
 * single object instead of allocating one point per vertex per frame.
 *
 * The local origin is the projection of UV (0.5, 0.5). We intentionally do
 * not subtract the arithmetic mean of the four corners: under perspective the
 * projected texture centre and a quad's corner average are different points.
 */
export function projectProjectilePerspectiveUv(
  projection: ProjectilePerspectiveProjection,
  u: number,
  v: number,
  target: MutableProjectileDepthPoint = { x: 0, y: 0 },
): MutableProjectileDepthPoint {
  const localX = (clamp(u, 0, 1) * 2 - 1) * projection.halfWidth;
  const localY = (clamp(v, 0, 1) * 2 - 1) * projection.halfHeight;
  // Rotate the local plane around world Y (lane yaw), then world X (floor
  // pitch). Positive local Z points toward the camera.
  const yawedX = localX * projection.cosineYaw;
  const yawedZ = localX * projection.sineYaw;
  const pitchedY = localY * projection.cosinePitch
    - yawedZ * projection.sinePitch;
  const pitchedZ = localY * projection.sinePitch
    + yawedZ * projection.cosinePitch;
  const perspectiveDivisor = Math.max(
    0.52,
    1 - pitchedZ / projection.focalLength,
  );
  target.x = yawedX / perspectiveDivisor;
  target.y = pitchedY / perspectiveDivisor;
  return target;
}

/**
 * Applies screen-space roll after the paper has already been keystone-
 * projected. This ordering is intentional: rolling the source rectangle
 * before the yaw/pitch projection changes the trapezoid itself, while the
 * desired paper motion rotates one rigid, perspective-correct surface.
 */
export function rotateProjectedSurfacePoint(
  point: ProjectileDepthPoint,
  rollRadians: number,
  target: MutableProjectileDepthPoint = { x: 0, y: 0 },
): MutableProjectileDepthPoint {
  const cosine = Math.cos(rollRadians);
  const sine = Math.sin(rollRadians);
  const x = point.x;
  const y = point.y;
  target.x = x * cosine - y * sine;
  target.y = x * sine + y * cosine;
  return target;
}

/** Non-linear floor rows bunch at the horizon and spread toward the camera. */
export function floorGridY(
  index: number,
  divisions: number,
  bottomY: number,
): number {
  const t = clamp(index / Math.max(1, divisions), 0, 1);
  return BOSS_PROJECTILE_ORIGIN.y
    + (bottomY - BOSS_PROJECTILE_ORIGIN.y) * Math.pow(t, FLOOR_GRID_EXPONENT);
}

/**
 * Continues a card through the near plane along the same screen-space ray it
 * used while approaching the camera. Without this hand-off, legacy pattern
 * velocities make a perspective card abruptly turn into a vertical fall or a
 * flat horizontal slide as soon as depth reaches one.
 */
export function radialNearPlaneVelocity(
  trajectory: TunnelTrajectory,
  speed: number,
): ProjectileDepthPoint {
  const rayX = trajectory.nearPoint.x - trajectory.origin.x;
  const rayY = trajectory.nearPoint.y - trajectory.origin.y;
  const rayLength = Math.hypot(rayX, rayY);
  if (rayLength <= TUNNEL_EPSILON || speed <= 0) return { x: 0, y: 0 };
  return {
    x: rayX / rayLength * speed,
    y: rayY / rayLength * speed,
  };
}

/** Projects one polar lane onto an expanding elliptical tunnel cross-section. */
export function projectTunnelLane(
  laneAngle: number,
  laneRadius: number,
  depth: number,
  origin: ProjectileDepthPoint = BOSS_PROJECTILE_ORIGIN,
): ProjectileDepthPoint {
  const expansion = projectileDepthExpansion(depth);
  return {
    x: origin.x
      + Math.cos(laneAngle) * TUNNEL_RADIUS_X * laneRadius * expansion,
    y: origin.y
      + Math.sin(laneAngle) * TUNNEL_RADIUS_Y * laneRadius * expansion,
  };
}

/** Shared radial expansion used by projectile rays and fairness projections. */
export function projectileDepthExpansion(depth: number): number {
  // A moderate power curve gives the far card a short readable beat without
  // pinning it to the Boss, then increases screen-space travel each quarter as
  // it approaches the camera.
  return Math.pow(clamp(depth, 0, 1), 1.35);
}

/** Projects a ray's authored near point to one explicit tunnel depth. */
export function projectTunnelTargetAtDepth(
  target: ProjectileDepthPoint,
  depth: number,
): ProjectileDepthPoint {
  const expansion = projectileDepthExpansion(depth);
  return {
    x: BOSS_PROJECTILE_ORIGIN.x
      + (target.x - BOSS_PROJECTILE_ORIGIN.x) * expansion,
    y: BOSS_PROJECTILE_ORIGIN.y
      + (target.y - BOSS_PROJECTILE_ORIGIN.y) * expansion,
  };
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
