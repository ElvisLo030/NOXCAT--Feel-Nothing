import type { SeededRng } from '../../utils/rng';
import { DEADLINE_BEAM_TELEGRAPH_MS } from '../constants';
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
  projectiles.spawnBeam(plannedY ?? rng.range(500, 790), telegraphMs, 520);
}

export function runDeadlineBeam(
  context: AttackPatternContext,
  plannedY?: number,
): AttackPatternHandle {
  const beamY = plannedY ?? context.rng.range(500, 790);
  return createPatternTimeline(context.durationMs, [{
    atMs: 0,
    // AttackDirector owns the mandatory 750 ms warning phase.
    emit: () => context.projectiles.spawnBeam(beamY, 0, 520),
  }]);
}
