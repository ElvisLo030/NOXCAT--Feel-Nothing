import type { SeededRng } from '../../utils/rng';
import { DEADLINE_BEAM_TELEGRAPH_MS } from '../constants';
import type { ProjectileSystem } from '../systems/ProjectileSystem';

export function spawnDeadlineBeam(projectiles: ProjectileSystem, rng: SeededRng): void {
  projectiles.spawnBeam(rng.range(500, 790), DEADLINE_BEAM_TELEGRAPH_MS, 520);
}
