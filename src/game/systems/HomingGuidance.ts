import { PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';
import type { ProjectileDepthPoint } from './ProjectileDepth';

/** 每秒最多移動 180 logical px；鎖定後不再改變玩家看得到的落點。 */
export function trackHomingTarget(
  current: ProjectileDepthPoint,
  player: ProjectileDepthPoint,
  deltaSeconds: number,
  remainingMs: number,
): ProjectileDepthPoint {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || remainingMs <= 0) return current;
  const target = {
    x: Math.min(PLAYER_MAX_X, Math.max(PLAYER_MIN_X, player.x)),
    y: Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, player.y)),
  };
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  const step = 180 * Math.min(deltaSeconds, remainingMs / 1000);
  if (distance <= step) return target;
  return { x: current.x + dx / distance * step, y: current.y + dy / distance * step };
}
