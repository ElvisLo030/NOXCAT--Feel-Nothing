import { describe, expect, it } from 'vitest';

import {
  calculateNeutralBaseline,
  calculateNeutralScore,
  smoothNeutralScore,
  type FaceActivitySample,
} from '../src/face/neutralScore';

const BASELINE: FaceActivitySample = {
  smile: 0.12,
  jawOpen: 0.08,
  browUp: 0.1,
  eyeWide: 0.09,
};

describe('neutral score', () => {
  it('is near 100 when the visible face activity matches baseline', () => {
    expect(calculateNeutralScore(BASELINE, BASELINE)).toBe(100);
  });

  it('drops as smile or jaw activity rises', () => {
    const smiling = calculateNeutralScore({ ...BASELINE, smile: 0.55 }, BASELINE);
    const openMouth = calculateNeutralScore({ ...BASELINE, jawOpen: 0.55 }, BASELINE);

    expect(smiling).not.toBeNull();
    expect(openMouth).not.toBeNull();
    expect(smiling as number).toBeLessThan(50);
    expect(openMouth as number).toBeLessThan(50);
  });

  it('returns no score when the camera cannot find a face', () => {
    expect(calculateNeutralScore(null, BASELINE)).toBeNull();
    expect(calculateNeutralScore(undefined, BASELINE)).toBeNull();
  });

  it('smooths changes using the specified EMA alpha', () => {
    expect(smoothNeutralScore(100, 0)).toBeCloseTo(78);
    expect(smoothNeutralScore(78, 100)).toBeCloseTo(82.84);
  });

  it('uses component medians for calibration baseline', () => {
    const samples: FaceActivitySample[] = [
      { smile: 0.1, jawOpen: 0.2, browUp: 0.3, eyeWide: 0.4 },
      { smile: 0.2, jawOpen: 0.3, browUp: 0.4, eyeWide: 0.5 },
      { smile: 0.9, jawOpen: 0.9, browUp: 0.9, eyeWide: 0.9 },
    ];

    expect(calculateNeutralBaseline(samples)).toEqual({
      smile: 0.2,
      jawOpen: 0.3,
      browUp: 0.4,
      eyeWide: 0.5,
    });
    expect(calculateNeutralBaseline([])).toBeNull();
  });
});
