export type ScalarSpringResult = readonly [value: number, velocity: number];

export interface JellyVelocity {
  x: number;
  y: number;
}

export interface JellyPoint {
  readonly x: number;
  readonly y: number;
}

export interface ReturnArc {
  readonly start: JellyPoint;
  readonly control: JellyPoint;
  readonly target: JellyPoint;
  readonly durationSeconds: number;
}

export interface ReturnArcSample extends JellyPoint {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly progress: number;
}

export interface LaunchBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface JellyPoseOptions {
  maxSpeed?: number;
  stretchAmount?: number;
  squashAmount?: number;
  maxLeanRadians?: number;
}

export interface JellyPose {
  speed: number;
  speed01: number;
  horizontalWeight: number;
  scaleX: number;
  scaleY: number;
  leanRadians: number;
}

export const MAX_JELLY_LEAN_RADIANS = Math.PI / 10;
export const RELEASE_PULSE_DURATION_SECONDS = 0.62;
export const LAUNCH_BOUNCE_BOUNDS: LaunchBounds = {
  left: 30,
  right: 510,
  top: 50,
  bottom: 910,
};

const SPRING_EPSILON = 1e-8;

/**
 * Advances a scalar damped spring by an exact analytical step.
 *
 * Unlike an Euler step, this preserves almost the same motion at 30, 60, and
 * 120 FPS and remains stable when a browser delivers one unusually long frame.
 */
export function springScalar(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  deltaSeconds: number,
): ScalarSpringResult {
  if (stiffness < 0 || damping < 0) {
    throw new RangeError('Spring stiffness and damping must be non-negative');
  }

  if (deltaSeconds <= 0) {
    return [value, velocity];
  }

  const displacement = value - target;

  // With no restoring force, integrate exponentially damped velocity exactly.
  if (stiffness === 0) {
    if (damping === 0) {
      return [value + velocity * deltaSeconds, velocity];
    }

    const decay = Math.exp(-damping * deltaSeconds);
    return [value + velocity * (1 - decay) / damping, velocity * decay];
  }

  const halfDamping = damping * 0.5;
  const frequencySquared = stiffness - halfDamping * halfDamping;
  const criticalTolerance = SPRING_EPSILON * Math.max(1, stiffness, halfDamping * halfDamping);

  if (frequencySquared > criticalTolerance) {
    const frequency = Math.sqrt(frequencySquared);
    const phase = frequency * deltaSeconds;
    const decay = Math.exp(-halfDamping * deltaSeconds);
    const cosine = Math.cos(phase);
    const sine = Math.sin(phase);
    const sinePosition = (velocity + halfDamping * displacement) / frequency;
    const nextDisplacement = decay * (displacement * cosine + sinePosition * sine);
    const nextVelocity = decay * (
      velocity * cosine
      - (halfDamping * velocity + stiffness * displacement) * sine / frequency
    );

    return [target + nextDisplacement, nextVelocity];
  }

  if (frequencySquared < -criticalTolerance) {
    const root = Math.sqrt(-frequencySquared);
    const slowRate = -halfDamping + root;
    const fastRate = -halfDamping - root;
    const slowCoefficient = (velocity - fastRate * displacement) / (slowRate - fastRate);
    const fastCoefficient = displacement - slowCoefficient;
    const slowDecay = Math.exp(slowRate * deltaSeconds);
    const fastDecay = Math.exp(fastRate * deltaSeconds);
    const nextDisplacement = slowCoefficient * slowDecay + fastCoefficient * fastDecay;
    const nextVelocity = (
      slowCoefficient * slowRate * slowDecay
      + fastCoefficient * fastRate * fastDecay
    );

    return [target + nextDisplacement, nextVelocity];
  }

  // Critical damping is the limit where the two characteristic roots meet.
  const decay = Math.exp(-halfDamping * deltaSeconds);
  const linearCoefficient = velocity + halfDamping * displacement;
  const nextDisplacement = (displacement + linearCoefficient * deltaSeconds) * decay;
  const nextVelocity = (
    velocity - halfDamping * linearCoefficient * deltaSeconds
  ) * decay;

  return [target + nextDisplacement, nextVelocity];
}

/**
 * Maps world-space velocity to an upright squash/stretch pose.
 *
 * The body stretches on the dominant screen axis while its lean is derived
 * only from horizontal velocity. That keeps a leftward cat leaning left rather
 * than treating atan2's +/-PI direction as an upside-down rotation.
 */
export function calculateJellyPose(
  velocity: Readonly<JellyVelocity>,
  options: Readonly<JellyPoseOptions> = {},
): JellyPose {
  const maxSpeed = options.maxSpeed ?? 900;
  const stretchAmount = options.stretchAmount ?? 0.3;
  const squashAmount = options.squashAmount ?? 0.2;
  const maxLeanRadians = options.maxLeanRadians ?? MAX_JELLY_LEAN_RADIANS;

  if (maxSpeed <= 0) {
    throw new RangeError('Jelly pose maxSpeed must be greater than zero');
  }

  const speedSquared = velocity.x * velocity.x + velocity.y * velocity.y;
  const speed = Math.sqrt(speedSquared);
  const speed01 = clamp(speed / maxSpeed, 0, 1);
  const horizontalWeight = speedSquared > 0 ? velocity.x * velocity.x / speedSquared : 0.5;
  const verticalWeight = 1 - horizontalWeight;
  const stretched = 1 + stretchAmount * speed01;
  const squashed = 1 - squashAmount * speed01;
  const scaleRange = stretched - squashed;

  return {
    speed,
    speed01,
    horizontalWeight,
    scaleX: squashed + scaleRange * horizontalWeight,
    scaleY: squashed + scaleRange * verticalWeight,
    leanRadians: clamp(velocity.x / maxSpeed, -1, 1) * maxLeanRadians,
  };
}

/**
 * Returns a signed squash impulse for pointer release.
 *
 * Five alternating lobes create roughly two-and-a-half visible rebounds. The
 * pulse reaches exactly zero after 620 ms, so callers need no lingering timer.
 */
export function releasePulse(
  elapsedSeconds: number,
  amplitude = 0.18,
  durationSeconds = RELEASE_PULSE_DURATION_SECONDS,
): number {
  if (durationSeconds <= 0) {
    throw new RangeError('Release pulse duration must be greater than zero');
  }

  if (elapsedSeconds <= 0 || elapsedSeconds >= durationSeconds || amplitude === 0) {
    return 0;
  }

  const progress = elapsedSeconds / durationSeconds;
  const remaining = 1 - progress;
  const envelope = remaining * remaining * Math.exp(-1.25 * progress);
  return amplitude * envelope * Math.sin(progress * Math.PI * 5);
}

/** Creates a deterministic quadratic arc back to the player's safe position. */
export function createReturnArc(
  start: JellyPoint,
  target: JellyPoint,
  bendSide = 1,
): ReturnArc {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);
  const midpointX = (start.x + target.x) * 0.5;
  const midpointY = (start.y + target.y) * 0.5;
  const side = bendSide < 0 ? -1 : 1;
  const normalX = distance > SPRING_EPSILON ? -dy / distance : 0;
  const normalY = distance > SPRING_EPSILON ? dx / distance : 0;
  const bend = clamp(distance * 0.17, 48, 96) * side;
  const lift = clamp(distance * 0.12, 42, 84);

  return {
    start: { x: start.x, y: start.y },
    control: {
      x: midpointX + normalX * bend,
      y: midpointY + normalY * bend - lift,
    },
    target: { x: target.x, y: target.y },
    durationSeconds: clamp(distance / 850, 0.48, 0.82),
  };
}

/** Samples the return arc and its analytical velocity without frame-rate drift. */
export function sampleReturnArc(arc: ReturnArc, elapsedSeconds: number): ReturnArcSample {
  const progress = clamp(elapsedSeconds / arc.durationSeconds, 0, 1);
  const inverse = 1 - progress;
  const x = inverse * inverse * arc.start.x
    + 2 * inverse * progress * arc.control.x
    + progress * progress * arc.target.x;
  const y = inverse * inverse * arc.start.y
    + 2 * inverse * progress * arc.control.y
    + progress * progress * arc.target.y;
  const velocityScale = 2 / arc.durationSeconds;
  return {
    x,
    y,
    velocityX: velocityScale * (
      inverse * (arc.control.x - arc.start.x)
      + progress * (arc.target.x - arc.control.x)
    ),
    velocityY: velocityScale * (
      inverse * (arc.control.y - arc.start.y)
      + progress * (arc.target.y - arc.control.y)
    ),
    progress,
  };
}

export function crossedLaunchBoundary(
  point: JellyPoint,
  bounds: LaunchBounds = LAUNCH_BOUNCE_BOUNDS,
): boolean {
  return point.x < bounds.left
    || point.x > bounds.right
    || point.y < bounds.top
    || point.y > bounds.bottom;
}

export function clampToLaunchBoundary(
  point: JellyPoint,
  bounds: LaunchBounds = LAUNCH_BOUNCE_BOUNDS,
): JellyPoint {
  return {
    x: clamp(point.x, bounds.left, bounds.right),
    y: clamp(point.y, bounds.top, bounds.bottom),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
