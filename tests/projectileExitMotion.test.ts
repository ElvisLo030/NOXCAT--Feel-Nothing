import { describe, expect, it } from 'vitest';
import {
  createTunnelTrajectory,
  sampleTunnelProjection,
} from '../src/game/systems/ProjectileDepth';
import {
  accelerateProjectileExit,
  initialProjectileExitVelocity,
  isBeyondProjectileExitBoundary,
  PROJECTILE_EXIT_MIN_SPEED,
  PROJECTILE_EXIT_PADDING,
} from '../src/game/systems/ProjectileExitMotion';

describe('projectile offscreen continuation', () => {
  it('never slows at the near plane and continues on the same Boss-origin ray', () => {
    const authoredVelocity = { x: 0, y: 230 };
    const spawn = { x: 90, y: -120 };
    const durationSeconds = 0.5;
    const trajectory = createTunnelTrajectory(
      spawn,
      authoredVelocity,
      18,
      { x: 90, y: 820 },
      durationSeconds * 1_000,
    );
    const exitVelocity = initialProjectileExitVelocity(trajectory, authoredVelocity);
    const sampleAt = (timeSeconds: number) => sampleTunnelProjection(
      trajectory,
      {
        x: spawn.x + authoredVelocity.x * timeSeconds,
        y: spawn.y + authoredVelocity.y * timeSeconds,
      },
    );
    const oneMillisecondBefore = sampleAt(durationSeconds - 0.001);
    const atHandoff = sampleAt(durationSeconds);
    const finiteDifferenceSpeed = Math.hypot(
      atHandoff.position.x - oneMillisecondBefore.position.x,
      atHandoff.position.y - oneMillisecondBefore.position.y,
    ) / 0.001;
    const ray = {
      x: trajectory.nearPoint.x - 270,
      y: trajectory.nearPoint.y - 385,
    };

    expect(Math.hypot(exitVelocity.x, exitVelocity.y)).toBeGreaterThanOrEqual(
      PROJECTILE_EXIT_MIN_SPEED,
    );
    expect(Math.hypot(exitVelocity.x, exitVelocity.y)).toBeGreaterThan(
      Math.hypot(authoredVelocity.x, authoredVelocity.y),
    );
    expect(Math.abs(
      Math.hypot(exitVelocity.x, exitVelocity.y) - finiteDifferenceSpeed,
    )).toBeLessThan(3);
    expect(ray.x * exitVelocity.y - ray.y * exitVelocity.x).toBeCloseTo(0, 8);
    expect(Math.sign(exitVelocity.x)).toBe(Math.sign(ray.x));
    expect(Math.sign(exitVelocity.y)).toBe(Math.sign(ray.y));

    const accelerated = accelerateProjectileExit(exitVelocity, 0.1);
    expect(Math.hypot(accelerated.x, accelerated.y)).toBeCloseTo(
      Math.hypot(exitVelocity.x, exitVelocity.y) + 105,
      8,
    );
  });

  it('accelerates deterministically and equivalently across frame subdivisions', () => {
    const initial = { x: -320, y: 690 };
    const oneFrame = accelerateProjectileExit(initial, 1 / 30);
    const halfFrame = accelerateProjectileExit(
      accelerateProjectileExit(initial, 1 / 60),
      1 / 60,
    );

    expect(oneFrame.x).toBeCloseTo(halfFrame.x, 10);
    expect(oneFrame.y).toBeCloseTo(halfFrame.y, 10);
    expect(Math.hypot(oneFrame.x, oneFrame.y)).toBeGreaterThan(
      Math.hypot(initial.x, initial.y),
    );
    expect(initial.x * oneFrame.y - initial.y * oneFrame.x).toBeCloseTo(0, 8);
  });

  it('recycles after the complete card clears the padded viewport', () => {
    expect(isBeyondProjectileExitBoundary(
      { x: 270, y: 960 + PROJECTILE_EXIT_PADDING - 1 },
      540,
      960,
    )).toBe(false);
    expect(isBeyondProjectileExitBoundary(
      { x: 270, y: 960 + PROJECTILE_EXIT_PADDING + 1 },
      540,
      960,
    )).toBe(true);
    expect(isBeyondProjectileExitBoundary(
      { x: -PROJECTILE_EXIT_PADDING - 1, y: 700 },
      540,
      960,
    )).toBe(true);
  });
});
