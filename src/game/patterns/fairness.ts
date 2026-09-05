import type { SeededRng } from '../../utils/rng';
import { PLAYER_HIT_RADIUS, PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';

export { PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';

export interface PlayerPosition {
  readonly x: number;
  readonly y: number;
}

/** Near-plane attack centres intentionally extend past both screen edges. */
export const ATTACK_NEAR_MIN_X = -40;
export const ATTACK_NEAR_MAX_X = 580;

/** Visible wall portals for box-tunnel attacks; cards emerge here, not at the Boss. */
export const SIDE_ATTACK_ORIGIN_LEFT_X = -24;
export const SIDE_ATTACK_ORIGIN_RIGHT_X = 564;
export const SIDE_ATTACK_ORIGIN_Y = 385;

/** Side-spawned hazards stay inside ProjectileSystem's recycle boundary. */
export const LEFT_WARNING_X = -170;
export const RIGHT_WARNING_X = 710;
export const PROJECTILE_RECYCLE_TOP = -300;

/** Fast hazards must remain unable to touch the sampled player for this long. */
export const MIN_REACTION_MS = 550;

export function clampPlayerPosition(position: PlayerPosition | undefined): PlayerPosition | undefined {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return undefined;
  return {
    x: clamp(position.x, PLAYER_MIN_X, PLAYER_MAX_X),
    y: clamp(position.y, PLAYER_MIN_Y, PLAYER_MAX_Y),
  };
}

export function minimumReactionDistance(speed: number, projectileRadius: number): number {
  return Math.max(0, speed) * (MIN_REACTION_MS / 1000)
    + PLAYER_HIT_RADIUS
    + Math.max(0, projectileRadius);
}

export function hasMinimumReactionDistance(
  spawn: PlayerPosition,
  player: PlayerPosition,
  speed: number,
  projectileRadius: number,
): boolean {
  return Math.hypot(spawn.x - player.x, spawn.y - player.y)
    >= minimumReactionDistance(speed, projectileRadius);
}

export function moveTowards(current: number, target: number, maximumDelta: number): number {
  const delta = clamp(target - current, -Math.abs(maximumDelta), Math.abs(maximumDelta));
  return current + delta;
}

export function evenlySpaced(minimum: number, maximum: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(minimum + maximum) / 2];
  return Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1),
  );
}

/** A deterministic, visibly non-zero clockwise/counter-clockwise paper roll. */
export function randomSignedRotationSpeed(
  rng: SeededRng,
  minimumMagnitude: number,
  maximumMagnitude: number,
): number {
  const minimum = Math.max(0, Math.min(minimumMagnitude, maximumMagnitude));
  const maximum = Math.max(minimum, minimumMagnitude, maximumMagnitude);
  // One draw carries both sign and magnitude. Existing patterns that already
  // sampled a signed speed therefore keep the same RNG cadence for layout.
  const signedSample = rng.range(-1, 1);
  const magnitude = minimum + (maximum - minimum) * Math.abs(signedSample);
  return signedSample < 0 ? -magnitude : magnitude;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
