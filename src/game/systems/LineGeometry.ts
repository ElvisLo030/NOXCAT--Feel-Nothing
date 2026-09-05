import type { ProjectileDepthPoint } from './ProjectileDepth';

export interface LineBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 將有方向的直線裁到矩形；entry 與 exit 的順序維持實際飛行方向。 */
export function clipLineToBounds(
  point: ProjectileDepthPoint,
  direction: ProjectileDepthPoint,
  bounds: LineBounds,
) {
  let enter = Number.NEGATIVE_INFINITY;
  let leave = Number.POSITIVE_INFINITY;
  for (const [position, velocity, min, max] of [
    [point.x, direction.x, bounds.left, bounds.right],
    [point.y, direction.y, bounds.top, bounds.bottom],
  ] as const) {
    if (Math.abs(velocity) < 1e-8) {
      if (position < min || position > max) return undefined;
      continue;
    }
    const first = (min - position) / velocity;
    const last = (max - position) / velocity;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
  }
  if (enter > leave || !Number.isFinite(enter) || !Number.isFinite(leave)) return undefined;
  return {
    entry: { x: point.x + direction.x * enter, y: point.y + direction.y * enter },
    exit: { x: point.x + direction.x * leave, y: point.y + direction.y * leave },
  };
}
