import { ROUND_DURATION_MS } from '../constants';
import { clamp } from '../../utils/math';

export interface PacingInput {
  elapsedMs: number;
  remainingMs: number;
  energy: number;
  bossHp: number;
  mainHits: number;
  grazeCount: number;
  lives: number;
}

export interface PacingScale {
  speedScale: number;
  telegraphScale: number;
  recoveryScale: number;
  vulnerableScale: number;
  combatScale: number;
  urgency: number;
  relief: number;
}

export function computeExpectedHits(progress01: number): number {
  return progress01 * 3.2;
}

export function computeGrazeRatePerMinute(grazeCount: number, elapsedMs: number): number {
  if (!Number.isFinite(grazeCount) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return (grazeCount / elapsedMs) * 60_000;
}

export function computePacing(input: PacingInput): PacingScale {
  const elapsed = Number.isFinite(input.elapsedMs) ? clamp(input.elapsedMs, 0, ROUND_DURATION_MS) : 0;
  const remaining = Number.isFinite(input.remainingMs) ? clamp(input.remainingMs, 0, ROUND_DURATION_MS) : ROUND_DURATION_MS - elapsed;
  const energy = Number.isFinite(input.energy) ? clamp(input.energy, 0, 100) : 0;
  const mainHits = Number.isFinite(input.mainHits) ? clamp(input.mainHits, 0, 10) : 0;
  const grazeCount = Number.isFinite(input.grazeCount) ? Math.max(0, input.grazeCount) : 0;

  const progress = clamp(elapsed / ROUND_DURATION_MS, 0, 1);
  const expectedHits = computeExpectedHits(progress);
  const hitsBehind = expectedHits - mainHits;

  const endgameBoost = remaining < 20_000 ? ((20_000 - remaining) / 20_000) * 0.18 : 0;
  const baseUrgency = clamp(progress * 0.32 + endgameBoost, 0, 0.52);

  let relief = 0;
  if (hitsBehind > 0.65) relief += clamp(hitsBehind * 0.08, 0, 0.12);
  if (energy < 30 && progress > 0.35 && hitsBehind > 0.3) relief += 0.05;
  const grazeRate = computeGrazeRatePerMinute(grazeCount, elapsed);
  if (grazeRate < 4 && progress > 0.3 && hitsBehind > 0.25) relief += 0.04;
  if (input.lives <= 1 && hitsBehind > 0) relief += 0.03;
  relief = clamp(relief, 0, 0.18);

  const urgency = clamp(baseUrgency, 0, 0.65);

  const rawSpeedBoost = urgency * 0.55;
  const rawTelegraphReduction = urgency * 0.20;
  const rawRecoveryReduction = urgency * 0.75;
  const rawVulnerableReduction = urgency * 0.18;

  const speedScale = clamp(1 + rawSpeedBoost - relief, 0.85, 1.35);
  const telegraphScale = clamp(1 - rawTelegraphReduction + relief * 0.30, 0.75, 1);
  const recoveryScale = clamp(1 - rawRecoveryReduction + relief * 0.60, 0.40, 1);
  const vulnerableScale = clamp(1 - rawVulnerableReduction + relief * 0.40, 0.70, 1);
  const combatScale = clamp(0.55 + urgency * 0.08 - relief * 0.05, 0.52, 0.65);

  return {
    speedScale,
    telegraphScale,
    recoveryScale,
    vulnerableScale,
    combatScale,
    urgency,
    relief,
  };
}

export function computeTelegraphMs(baseMs: number, scale: number): number {
  return Math.max(1, Math.round(baseMs * scale));
}

export function computeRecoveryMs(baseMs: number, scale: number): number {
  return Math.max(1, Math.round(baseMs * scale));
}

export function computeVulnerableMs(baseMs: number, scale: number): number {
  return Math.max(1, Math.round(baseMs * scale));
}
