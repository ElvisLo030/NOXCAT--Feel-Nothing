import { clamp, clamp01, median, smoothstep } from '../utils/math';

export interface FaceActivitySample {
  smile: number;
  jawOpen: number;
  browUp: number;
  eyeWide: number;
}

export const NEUTRAL_SCORE_EMA_ALPHA = 0.22;

function finiteBlendshapeValue(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0;
}

function normalizedActivityDelta(
  current: number,
  baseline: number,
  deadZone: number,
  range: number,
): number {
  const delta = finiteBlendshapeValue(current) - finiteBlendshapeValue(baseline) - deadZone;
  return Math.max(0, delta) / range;
}

/**
 * Returns null when no face sample is available. Missing a face is an absence
 * of input, never a zero-score penalty.
 */
export function calculateNeutralScore(
  current: FaceActivitySample | null | undefined,
  baseline: FaceActivitySample,
): number | null {
  if (current == null) {
    return null;
  }

  const smileDelta = normalizedActivityDelta(current.smile, baseline.smile, 0.08, 0.34);
  const jawDelta = normalizedActivityDelta(current.jawOpen, baseline.jawOpen, 0.06, 0.38);
  const browDelta = normalizedActivityDelta(current.browUp, baseline.browUp, 0.1, 0.34);
  const eyeDelta = normalizedActivityDelta(current.eyeWide, baseline.eyeWide, 0.1, 0.38);
  const activity = clamp01(Math.max(smileDelta, jawDelta, browDelta, eyeDelta));

  return Math.round(100 * (1 - smoothstep(0.08, 0.85, activity)));
}

export function smoothNeutralScore(
  previous: number,
  raw: number,
  alpha = NEUTRAL_SCORE_EMA_ALPHA,
): number {
  if (alpha < 0 || alpha > 1) {
    throw new RangeError('EMA alpha must be between 0 and 1');
  }

  const safePrevious = clamp(previous, 0, 100);
  const safeRaw = clamp(raw, 0, 100);
  return safePrevious + alpha * (safeRaw - safePrevious);
}

export function calculateNeutralBaseline(
  samples: readonly FaceActivitySample[],
): FaceActivitySample | null {
  if (samples.length === 0) {
    return null;
  }

  return {
    smile: median(samples.map((sample) => finiteBlendshapeValue(sample.smile))),
    jawOpen: median(samples.map((sample) => finiteBlendshapeValue(sample.jawOpen))),
    browUp: median(samples.map((sample) => finiteBlendshapeValue(sample.browUp))),
    eyeWide: median(samples.map((sample) => finiteBlendshapeValue(sample.eyeWide))),
  };
}
