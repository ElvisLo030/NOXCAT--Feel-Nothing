import type { GameSessionSnapshot } from '../state/GameSession';
import type { NoxcatVisualSnapshot } from '../game/entities/Noxcat';
import type { PatternId } from '../ai/bossSchema';
import type { ProjectileKind } from '../game/entities/Projectile';
import type { SafeLaneHint, WavePhase } from '../game/systems/AttackDirector';

export interface NoxcatWaveSnapshot {
  phase: WavePhase;
  pattern: PatternId;
  activeProjectileCount: number;
  activeDangerous: number;
  safeLane: SafeLaneHint | null;
  combatTimeScale: number;
  vulnerableRemainingMs: number;
  weakPointTweenCount: number;
}

export interface NoxcatProjectileSnapshot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly isDamage: boolean;
  readonly hasGrazedPlayer: boolean;
  readonly kind: ProjectileKind;
  readonly tunnelDepth: number;
  readonly collisionActive: boolean;
}

export interface NoxcatTestHook {
  fillEnergy(): void;
  openWeakPoint(): void;
  damageBoss(): void;
  spawnReflectable(): void;
  pauseAttacksForVisualTest(): void;
  snapshot(): GameSessionSnapshot;
  visualSnapshot(): NoxcatVisualSnapshot;
  waveSnapshot(): NoxcatWaveSnapshot;
  projectileSnapshot(): readonly NoxcatProjectileSnapshot[];
}

declare global {
  interface Window {
    __NOXCAT_TEST__?: NoxcatTestHook;
  }
}

export {};
