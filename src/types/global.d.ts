import type { GameSessionSnapshot } from '../state/GameSession';
import type { NoxcatVisualSnapshot } from '../game/entities/Noxcat';
import type { PatternId } from '../ai/bossSchema';
import type { ProjectileKind } from '../game/entities/Projectile';
import type { SafeLaneHint, WavePhase } from '../game/systems/AttackDirector';
import type { BattleViewportLayout } from '../game/systems/ViewportLayout';
import type { BossDefeatState } from '../game/entities/Boss';

export interface NoxcatWaveSnapshot {
  phase: WavePhase;
  pattern: PatternId;
  activeProjectileCount: number;
  activeDangerous: number;
  safeLane: SafeLaneHint | null;
  combatTimeScale: number;
  vulnerableRemainingMs: number;
  weakPointTweenCount: number;
  dangerOverlayAlpha: number;
}

export interface NoxcatProjectileSnapshot {
  readonly x: number;
  readonly y: number;
  readonly visibleX: number;
  readonly visibleY: number;
  readonly previousCollisionX: number;
  readonly previousCollisionY: number;
  readonly previousCollisionActive: boolean;
  readonly radius: number;
  readonly isDamage: boolean;
  readonly hasGrazedPlayer: boolean;
  readonly kind: ProjectileKind;
  readonly tunnelDepth: number;
  readonly collisionActive: boolean;
  readonly vx: number;
  readonly vy: number;
  readonly continuingOffscreen: boolean;
}

export interface NoxcatQualitySnapshot {
  readonly level: 'full' | 'reduced';
  readonly consecutiveLowFpsMs: number;
  readonly ghostLimit: number;
  readonly dropletLimit: number;
  readonly projectileEffectsReduced: boolean;
  readonly actualFps: number;
  readonly simulationUpdateCount: number;
  readonly collisionUpdateCount: number;
}

export interface NoxcatInputSnapshot {
  readonly event: 'none' | 'down' | 'move' | 'up';
  readonly rawX: number;
  readonly rawY: number;
  readonly worldX: number;
  readonly worldY: number;
}

export interface NoxcatCameraSnapshot {
  readonly zoomX: number;
  readonly zoomY: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly worldLeft: number;
  readonly worldTop: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}

export interface NoxcatBossDefeatSnapshot {
  readonly state: BossDefeatState;
  readonly fragmentCount: number;
}

export interface NoxcatTestHook {
  fillEnergy(): void;
  openWeakPoint(): void;
  damageBoss(): void;
  spawnReflectable(): void;
  spawnPerspectiveProbeForTest(hitPlayer: boolean): void;
  spawnExitProbesForTest(): void;
  pauseAttacksForVisualTest(): void;
  forceLowFpsForTest(): void;
  expireRoundForTest(): void;
  overloadForTest(): void;
  snapshot(): GameSessionSnapshot;
  visualSnapshot(): NoxcatVisualSnapshot;
  qualitySnapshot(): NoxcatQualitySnapshot;
  waveSnapshot(): NoxcatWaveSnapshot;
  projectileSnapshot(): readonly NoxcatProjectileSnapshot[];
  viewportSnapshot(): BattleViewportLayout;
  inputSnapshot(): NoxcatInputSnapshot;
  cameraSnapshot(): NoxcatCameraSnapshot;
  bossDefeatSnapshot(): NoxcatBossDefeatSnapshot;
}

declare global {
  interface Window {
    __NOXCAT_TEST__?: NoxcatTestHook;
  }
}

export {};
