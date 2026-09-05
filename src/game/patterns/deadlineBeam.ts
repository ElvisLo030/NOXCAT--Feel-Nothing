import type { SeededRng } from '../../utils/rng';
import { DEADLINE_BEAM_TELEGRAPH_MS, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  createPatternTimeline,
  type AttackPatternContext,
  type AttackPatternHandle,
} from './types';

export function spawnDeadlineBeam(
  projectiles: ProjectileSystem,
  rng: SeededRng,
  plannedY?: number,
  telegraphMs = DEADLINE_BEAM_TELEGRAPH_MS,
): void {
  projectiles.spawnBeam(plannedY ?? rng.range(PLAYER_MIN_Y + 24, PLAYER_MAX_Y - 24), telegraphMs, 520);
}

export function runDeadlineBeam(
  context: AttackPatternContext,
  plannedY?: number,
): AttackPatternHandle {
  const beamY = plannedY ?? context.rng.range(PLAYER_MIN_Y + 24, PLAYER_MAX_Y - 24);
  return createPatternTimeline(context.durationMs, [{
    atMs: 0,
    // AttackDirector owns the mandatory 750 ms warning phase.
    emit: () => context.projectiles.spawnBeam(beamY, 0, 520),
  }]);
}
