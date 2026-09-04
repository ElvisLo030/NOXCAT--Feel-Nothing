import type { SeededRng } from '../../utils/rng';
import { DEADLINE_BEAM_TELEGRAPH_MS } from '../constants';
import type { ProjectileSystem } from '../systems/ProjectileSystem';

export function spawnDeadlineBeam(projectiles: ProjectileSystem, rng: SeededRng, telegraphScale = 1): void {
  const telegraphMs = Math.max(320, Math.round(DEADLINE_BEAM_TELEGRAPH_MS * telegraphScale));
  projectiles.spawnBeam(rng.range(500, 790), telegraphMs, 520);
}
