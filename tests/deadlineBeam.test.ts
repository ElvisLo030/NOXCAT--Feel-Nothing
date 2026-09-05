import { describe, expect, it } from 'vitest';

import { PLAYER_HIT_RADIUS, PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../src/game/constants';
import {
  BEAM_HALF_THICKNESS,
  distanceToBeam,
  planDeadlineBeams,
} from '../src/game/patterns/deadlineBeam';
import { SeededRng } from '../src/utils/rng';

describe('deadline beam volleys', () => {
  it('emits two or three uniquely oriented lasers and keeps a safe pocket', () => {
    const counts = new Set<number>();
    const angleCounts = new Set<number>();
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const intensity of [1, 2, 3] as const) {
        const beams = planDeadlineBeams(new SeededRng(seed), intensity);
        counts.add(beams.length);
        angleCounts.add(new Set(beams.map((beam) => Math.round(beam.angle * 1000))).size);
        expect(beams.length).toBeGreaterThanOrEqual(2);
        expect(beams.length).toBeLessThanOrEqual(3);
        expect(new Set(beams.map((beam) => Math.round(beam.angle * 1000))).size).toBe(beams.length);
        if (intensity === 1) expect(beams).toHaveLength(2);
        if (intensity === 3) expect(beams).toHaveLength(3);

        const clearance = PLAYER_HIT_RADIUS + BEAM_HALF_THICKNESS + 36;
        let pocket = false;
        for (let x = PLAYER_MIN_X; x <= PLAYER_MAX_X && !pocket; x += 18) {
          for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y; y += 18) {
            if (beams.every((beam) => distanceToBeam(x, y, beam) >= clearance)) {
              pocket = true;
              break;
            }
          }
        }
        expect(pocket).toBe(true);
      }
    }
    expect(counts.has(2)).toBe(true);
    expect(counts.has(3)).toBe(true);
    expect(angleCounts.has(2)).toBe(true);
    expect(angleCounts.has(3)).toBe(true);
  });

  it('reproduces the same volley for the same seed', () => {
    expect(planDeadlineBeams(new SeededRng(91), 3))
      .toEqual(planDeadlineBeams(new SeededRng(91), 3));
    expect(planDeadlineBeams(new SeededRng(91), 3))
      .not.toEqual(planDeadlineBeams(new SeededRng(92), 3));
  });
});
