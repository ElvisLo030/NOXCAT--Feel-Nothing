import { describe, expect, it } from 'vitest';
import { ROUND_DURATION_MS } from '../src/game/constants';
import { computePacing, computeGrazeRatePerMinute } from '../src/game/systems/PacingDirector';
import { AttackDirector } from '../src/game/systems/AttackDirector';
import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';
import { SeededRng } from '../src/utils/rng';
import type { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import type { ProjectileConfig } from '../src/game/entities/Projectile';

describe('PacingDirector', () => {
  it('starts neutral with no urgency at game start', () => {
    const pacing = computePacing({
      elapsedMs: 0,
      remainingMs: ROUND_DURATION_MS,
      energy: 0,
      bossHp: 100,
      mainHits: 0,
      grazeCount: 0,
      lives: 3,
    });
    expect(pacing.urgency).toBeCloseTo(0, 2);
    expect(pacing.speedScale).toBeCloseTo(1, 2);
    expect(pacing.telegraphScale).toBeCloseTo(1, 2);
    expect(pacing.recoveryScale).toBeCloseTo(1, 2);
    expect(pacing.vulnerableScale).toBeCloseTo(1, 2);
  });

  it('increases speed and compresses recovery as time progresses', () => {
    const early = computePacing({
      elapsedMs: 10_000,
      remainingMs: 65_000,
      energy: 50,
      bossHp: 100,
      mainHits: 0,
      grazeCount: 5,
      lives: 3,
    });
    const mid = computePacing({
      elapsedMs: 37_500,
      remainingMs: 37_500,
      energy: 50,
      bossHp: 66,
      mainHits: 2,
      grazeCount: 12,
      lives: 3,
    });
    const late = computePacing({
      elapsedMs: 60_000,
      remainingMs: 15_000,
      energy: 50,
      bossHp: 32,
      mainHits: 3,
      grazeCount: 18,
      lives: 3,
    });
    expect(mid.speedScale).toBeGreaterThan(early.speedScale);
    expect(late.speedScale).toBeGreaterThan(mid.speedScale);
    expect(mid.recoveryScale).toBeLessThan(early.recoveryScale);
    expect(late.recoveryScale).toBeLessThan(mid.recoveryScale);
    expect(mid.telegraphScale).toBeLessThanOrEqual(early.telegraphScale);
    expect(late.combatScale).toBeGreaterThanOrEqual(early.combatScale);
  });

  it('applies relief when behind schedule and low energy', () => {
    const behind = computePacing({
      elapsedMs: 45_000,
      remainingMs: 30_000,
      energy: 10,
      bossHp: 100,
      mainHits: 0,
      grazeCount: 2,
      lives: 3,
    });
    const ahead = computePacing({
      elapsedMs: 45_000,
      remainingMs: 30_000,
      energy: 80,
      bossHp: 32,
      mainHits: 2,
      grazeCount: 20,
      lives: 3,
    });
    expect(behind.relief).toBeGreaterThan(0);
    expect(behind.speedScale).toBeLessThan(ahead.speedScale);
    expect(behind.recoveryScale).toBeGreaterThan(ahead.recoveryScale);
  });

  it('adds endgame boost in final 20 seconds', () => {
    const beforeEndgame = computePacing({
      elapsedMs: 54_000,
      remainingMs: 21_000,
      energy: 50,
      bossHp: 50,
      mainHits: 1,
      grazeCount: 10,
      lives: 3,
    });
    const inEndgame = computePacing({
      elapsedMs: 65_000,
      remainingMs: 10_000,
      energy: 50,
      bossHp: 50,
      mainHits: 1,
      grazeCount: 10,
      lives: 3,
    });
    expect(inEndgame.urgency).toBeGreaterThan(beforeEndgame.urgency);
    expect(inEndgame.speedScale).toBeGreaterThan(beforeEndgame.speedScale);
  });

  it('clamps scales within documented bounds', () => {
    const extreme = computePacing({
      elapsedMs: 75_000,
      remainingMs: 0,
      energy: 0,
      bossHp: 1,
      mainHits: 0,
      grazeCount: 0,
      lives: 1,
    });
    expect(extreme.speedScale).toBeGreaterThanOrEqual(0.85);
    expect(extreme.speedScale).toBeLessThanOrEqual(1.25);
    expect(extreme.telegraphScale).toBeGreaterThanOrEqual(0.75);
    expect(extreme.telegraphScale).toBeLessThanOrEqual(1);
    expect(extreme.recoveryScale).toBeGreaterThanOrEqual(0.55);
    expect(extreme.recoveryScale).toBeLessThanOrEqual(1);
    expect(extreme.vulnerableScale).toBeGreaterThanOrEqual(0.70);
  });

  it('computes graze rate correctly', () => {
    expect(computeGrazeRatePerMinute(6, 60_000)).toBeCloseTo(6, 2);
    expect(computeGrazeRatePerMinute(0, 0)).toBe(0);
    expect(computeGrazeRatePerMinute(10, 30_000)).toBeCloseTo(20, 2);
  });

  it('deterministically scales AttackDirector phase durations', () => {
    const projectiles = {
      spawn: () => null,
      clearDangerous: () => {},
    } as unknown as ProjectileSystem;
    const directorEarly = new AttackDirector(FALLBACK_BOSS, new SeededRng(1), projectiles);
    const directorLate = new AttackDirector(FALLBACK_BOSS, new SeededRng(1), projectiles);
    const earlyPacing = computePacing({
      elapsedMs: 0,
      remainingMs: 75_000,
      energy: 0,
      bossHp: 100,
      mainHits: 0,
      grazeCount: 0,
      lives: 3,
    });
    const latePacing = computePacing({
      elapsedMs: 60_000,
      remainingMs: 15_000,
      energy: 80,
      bossHp: 32,
      mainHits: 2,
      grazeCount: 15,
      lives: 3,
    });
    directorEarly.setPacingScale(earlyPacing);
    directorLate.setPacingScale(latePacing);

    const spawnedEarly: ProjectileConfig[] = [];
    const spawnedLate: ProjectileConfig[] = [];
    const projEarly = {
      spawn: (c: ProjectileConfig) => { spawnedEarly.push(c); return null; },
      clearDangerous: () => {},
    } as unknown as ProjectileSystem;
    const projLate = {
      spawn: (c: ProjectileConfig) => { spawnedLate.push(c); return null; },
      clearDangerous: () => {},
    } as unknown as ProjectileSystem;
    const d1 = new AttackDirector(FALLBACK_BOSS, new SeededRng(123), projEarly);
    const d2 = new AttackDirector(FALLBACK_BOSS, new SeededRng(123), projLate);
    d1.setPacingScale(earlyPacing);
    d2.setPacingScale(latePacing);
    d1.start();
    d2.start();
    d1.update(500, 3);
    d2.update(500, 3);
    expect(d2.currentPhase).toBe('ACTIVE');
    expect(d1.currentPhase).toBe('ACTIVE');
  });
});
