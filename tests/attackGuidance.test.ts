import { describe, expect, it } from 'vitest';
import { DANGER_INSTRUCTION } from '../src/game/ui/attackCues';
import { COMBAT_COLORS } from '../src/theme/palette';
import { trackHomingTarget } from '../src/game/systems/HomingGuidance';
import { createTunnelTrajectory, retargetTunnelTrajectory, sampleTunnelProjection } from '../src/game/systems/ProjectileDepth';
import { PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y } from '../src/game/constants';

describe('attack guidance', () => {
  it('uses one consistent red-zone instruction and a distinct danger colour', () => {
    expect(DANGER_INSTRUCTION).toBe('離開紅色區域');
    expect(COMBAT_COLORS.danger).toBe(0xff5364);
    expect(COMBAT_COLORS.danger).not.toBe(COMBAT_COLORS.safe);
  });

  it('moves the visible homing aim with the player without teleporting', () => {
    const current = { x: 200, y: 750 };
    const player = { x: 440, y: 850 };
    const result = trackHomingTarget(current, player, 0.1, 1000);
    expect(result.x).toBeGreaterThan(current.x);
    expect(result.y).toBeGreaterThan(current.y);
    expect(Math.hypot(result.x - current.x, result.y - current.y)).toBeLessThanOrEqual(18.001);
  });

  it('locks the target at timeout and never spends more than the remaining tracking time', () => {
    const current = { x: 200, y: 750 };
    const target = { x: 450, y: 850 };
    expect(trackHomingTarget(current, target, 0.1, 0)).toEqual(current);
    expect(trackHomingTarget(current, target, -1, 1000)).toEqual(current);
    expect(trackHomingTarget(current, target, 0.1, 20))
      .toEqual(trackHomingTarget(current, target, 0.02, 1000));
  });

  it('uses the same bounded homing result at 30, 60 and 120 FPS', () => {
    const simulate = (fps: number) => {
      let current = { x: 200, y: 750 };
      for (let frame = 0; frame < fps; frame++) current = trackHomingTarget(current, { x: 430, y: 840 }, 1 / fps, 2000);
      return current;
    };
    for (const fps of [30, 120]) {
      expect(simulate(fps).x).toBeCloseTo(simulate(60).x, 8);
      expect(simulate(fps).y).toBeCloseTo(simulate(60).y, 8);
    }
    const clamped = trackHomingTarget({ x: 270, y: 750 }, { x: 5000, y: -100 }, 10, 10000);
    expect(clamped).toEqual({ x: PLAYER_MAX_X, y: PLAYER_MIN_Y });
    const opposite = trackHomingTarget(clamped, { x: -5000, y: 5000 }, 10, 10000);
    expect(opposite).toEqual({ x: PLAYER_MIN_X, y: PLAYER_MAX_Y });
  });

  it('retargets the visible perspective ray while preserving its depth clock', () => {
    const original = createTunnelTrajectory({ x: 75, y: -65 }, { x: 130, y: 160 }, 18, { x: 205, y: 760 }, 2200);
    const changed = retargetTunnelTrajectory(original, { x: 350, y: 800 });
    expect(changed.approachPoint).toEqual(original.approachPoint);
    expect(changed.approachLength).toBe(original.approachLength);
    expect(original.nearPoint).toEqual({ x: 205, y: 760 });
    const clock = { x: (original.spawn.x + original.approachPoint.x) / 2, y: (original.spawn.y + original.approachPoint.y) / 2 };
    expect(sampleTunnelProjection(changed, clock).depth).toBe(sampleTunnelProjection(original, clock).depth);
    expect(sampleTunnelProjection(changed, clock).position.x).toBeGreaterThan(sampleTunnelProjection(original, clock).position.x);
  });
});
