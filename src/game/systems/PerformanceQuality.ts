export const LOW_FPS_THRESHOLD = 45;
export const LOW_FPS_TRIGGER_MS = 2_000;

export type PerformanceQualityLevel = 'full' | 'reduced';

export interface PerformanceQualityState {
  readonly level: PerformanceQualityLevel;
  readonly consecutiveLowFpsMs: number;
}

export interface VisualQualityBudget {
  readonly ghostLimit: 8 | 5;
  readonly dropletLimit: 6 | 3;
  readonly reduceProjectileEffects: boolean;
}

const VISUAL_BUDGETS: Readonly<Record<PerformanceQualityLevel, VisualQualityBudget>> = {
  full: {
    ghostLimit: 8,
    dropletLimit: 6,
    reduceProjectileEffects: false,
  },
  reduced: {
    ghostLimit: 5,
    dropletLimit: 3,
    reduceProjectileEffects: true,
  },
};

export function createPerformanceQualityState(): PerformanceQualityState {
  return { level: 'full', consecutiveLowFpsMs: 0 };
}

/**
 * Advances only the visual-quality policy. Physics and collision cadence are
 * deliberately absent from this state so degraded rendering cannot alter
 * gameplay fairness.
 */
export function advancePerformanceQuality(
  state: PerformanceQualityState,
  fps: number,
  deltaMs: number,
): PerformanceQualityState {
  const safeDeltaMs = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const isLowFps = Number.isFinite(fps) && fps > 0 && fps < LOW_FPS_THRESHOLD;
  const consecutiveLowFpsMs = isLowFps
    ? state.consecutiveLowFpsMs + safeDeltaMs
    : 0;
  const level = state.level === 'reduced' || consecutiveLowFpsMs >= LOW_FPS_TRIGGER_MS
    ? 'reduced'
    : 'full';

  return { level, consecutiveLowFpsMs };
}

export function visualBudgetForQuality(
  level: PerformanceQualityLevel,
): VisualQualityBudget {
  return VISUAL_BUDGETS[level];
}
