import { describe, expect, it } from 'vitest';

import {
  advancePerformanceQuality,
  createPerformanceQualityState,
  LOW_FPS_THRESHOLD,
  LOW_FPS_TRIGGER_MS,
  visualBudgetForQuality,
} from '../src/game/systems/PerformanceQuality';

describe('performance quality policy', () => {
  it('reduces visuals only after two continuous seconds below 45 FPS', () => {
    let state = createPerformanceQualityState();

    for (let elapsed = 0; elapsed < LOW_FPS_TRIGGER_MS - 50; elapsed += 50) {
      state = advancePerformanceQuality(state, LOW_FPS_THRESHOLD - 1, 50);
    }
    expect(state).toEqual({ level: 'full', consecutiveLowFpsMs: 1_950 });

    state = advancePerformanceQuality(state, LOW_FPS_THRESHOLD - 1, 50);
    expect(state).toEqual({ level: 'reduced', consecutiveLowFpsMs: 2_000 });
    expect(visualBudgetForQuality(state.level)).toEqual({
      ghostLimit: 5,
      dropletLimit: 3,
      reduceProjectileEffects: true,
    });
  });

  it('requires a continuous low-FPS window and ignores zero-FPS startup samples', () => {
    let state = createPerformanceQualityState();
    state = advancePerformanceQuality(state, 44, 1_500);
    state = advancePerformanceQuality(state, 60, 16);
    state = advancePerformanceQuality(state, 44, 1_500);
    expect(state).toEqual({ level: 'full', consecutiveLowFpsMs: 1_500 });

    state = advancePerformanceQuality(state, 0, 5_000);
    expect(state).toEqual({ level: 'full', consecutiveLowFpsMs: 0 });
  });

  it('keeps the reduced visual budget stable to avoid quality thrashing', () => {
    let state = createPerformanceQualityState();
    state = advancePerformanceQuality(state, 30, LOW_FPS_TRIGGER_MS);
    state = advancePerformanceQuality(state, 60, 5_000);

    expect(state.level).toBe('reduced');
    expect(state.consecutiveLowFpsMs).toBe(0);
  });

  it('keeps the full budget limited to visual effect counts', () => {
    expect(visualBudgetForQuality('full')).toEqual({
      ghostLimit: 8,
      dropletLimit: 6,
      reduceProjectileEffects: false,
    });
  });
});
