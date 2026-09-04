import type { BossDNA } from '../ai/bossSchema';
import type { BossSource } from '../ai/bossClient';
import type { FaceActivitySample } from '../face/neutralScore';

export interface BattleFaceSnapshot {
  rawNeutral: number | null;
  neutral: number | null;
  baseline: FaceActivitySample | null;
  faceFound: boolean;
  inferenceMs: number;
  timestampMs: number;
  mode: 'worker' | 'main-thread';
  bonusEligible: boolean;
  activityDetected: boolean;
}

export interface BattleRuntimeConfig {
  boss: BossDNA;
  source: BossSource;
  annoyance: string;
  soundEnabled: boolean;
  gogglesVisible: boolean;
  faceProvider: () => BattleFaceSnapshot | null;
}

let runtimeConfig: BattleRuntimeConfig | null = null;

export function setBattleRuntime(config: BattleRuntimeConfig): void {
  runtimeConfig = config;
}

export function getBattleRuntime(): BattleRuntimeConfig {
  if (!runtimeConfig) throw new Error('Battle runtime was not configured before Phaser boot');
  return runtimeConfig;
}
