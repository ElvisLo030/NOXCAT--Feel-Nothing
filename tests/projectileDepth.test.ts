import { describe, expect, it } from 'vitest';

import {
  BOSS_PROJECTILE_ORIGIN,
  calculateTunnelDepthPose,
  createTunnelTrajectory,
  projectileStreakLength,
  projectTunnelLane,
  sampleTunnelProjection,
} from '../src/game/systems/ProjectileDepth';

describe('shared projectile perspective depth', () => {
  it('renders every attack kind far-small and near-large with correct foreshortening', () => {
    for (const kind of ['paper', 'comment', 'returnable', 'wall', 'homing'] as const) {
      const far = calculateTunnelDepthPose(kind, 0);
      const middle = calculateTunnelDepthPose(kind, 0.5);
      const near = calculateTunnelDepthPose(kind, 1);

      expect(far.scale).toBeCloseTo(0.16);
      expect(middle.scale).toBeGreaterThan(far.scale);
      expect(near.scale).toBeGreaterThan(middle.scale);
      expect(far.foreshortening).toBeLessThan(middle.foreshortening);
      expect(middle.foreshortening).toBeLessThan(near.foreshortening);
      expect(far.alpha).toBeLessThan(near.alpha);
      expect(near.displayDepth).toBeGreaterThan(middle.displayDepth);
    }
  });

  it('expands a polar lane radially away from the Boss vanishing point', () => {
    const far = projectTunnelLane(0.72, 0.84, 0.18);
    const middle = projectTunnelLane(0.72, 0.84, 0.55);
    const near = projectTunnelLane(0.72, 0.84, 0.92);
    const radius = (point: { x: number; y: number }): number => Math.hypot(
      point.x - BOSS_PROJECTILE_ORIGIN.x,
      point.y - BOSS_PROJECTILE_ORIGIN.y,
    );

    expect(radius(far)).toBeLessThan(radius(middle));
    expect(radius(middle)).toBeLessThan(radius(near));
    expect(far.x).toBeGreaterThan(BOSS_PROJECTILE_ORIGIN.x);
    expect(far.y).toBeGreaterThan(BOSS_PROJECTILE_ORIGIN.y);
  });

  it('advances depth monotonically even if a homing collider briefly turns', () => {
    const trajectory = createTunnelTrajectory(
      { x: 75, y: -65 },
      { x: 130, y: 170 },
      18,
    );
    const first = sampleTunnelProjection(trajectory, { x: 110, y: 10 });
    const second = sampleTunnelProjection(trajectory, { x: 155, y: 90 }, first.depth);
    const turned = sampleTunnelProjection(trajectory, { x: 145, y: 82 }, second.depth);

    expect(second.depth).toBeGreaterThan(first.depth);
    expect(turned.depth).toBe(second.depth);
    expect(second.radialDistance).toBeGreaterThan(first.radialDistance);
  });

  it('blends a homing turn into the near plane without a final-frame position snap', () => {
    const trajectory = createTunnelTrajectory(
      { x: 75, y: -65 },
      { x: 130, y: 170 },
      18,
    );
    const almostDepth = 0.985;
    const deviationX = -trajectory.directionY * 58;
    const deviationY = trajectory.directionX * 58;
    const almostCollider = {
      x: trajectory.spawn.x
        + (trajectory.nearPoint.x - trajectory.spawn.x) * almostDepth
        + deviationX,
      y: trajectory.spawn.y
        + (trajectory.nearPoint.y - trajectory.spawn.y) * almostDepth
        + deviationY,
    };
    const almost = sampleTunnelProjection(trajectory, almostCollider);
    const finalCollider = {
      x: trajectory.nearPoint.x + deviationX,
      y: trajectory.nearPoint.y + deviationY,
    };
    const final = sampleTunnelProjection(trajectory, finalCollider, almost.depth);

    expect(almost.collisionActive).toBe(false);
    expect(final.collisionActive).toBe(true);
    expect(Math.hypot(
      final.position.x - almost.position.x,
      final.position.y - almost.position.y,
    )).toBeLessThan(15);
  });

  it('uses a frame-rate-independent near-depth speed trace length', () => {
    expect(projectileStreakLength(0)).toBe(10);
    expect(projectileStreakLength(0.5)).toBeGreaterThan(30);
    expect(projectileStreakLength(1)).toBe(75);
  });

  it('converges exactly on the fixed collider before collision activates', () => {
    const spawn = { x: 270, y: 155 };
    const velocity = { x: 0, y: 300 };
    const trajectory = createTunnelTrajectory(spawn, velocity, 22);
    const before = sampleTunnelProjection(trajectory, { x: 270, y: 360 });
    const atEntry = sampleTunnelProjection(trajectory, trajectory.nearPoint, before.depth);

    expect(before.collisionActive).toBe(false);
    expect(before.position).not.toEqual({ x: 270, y: 360 });
    expect(atEntry.depth).toBe(1);
    expect(atEntry.collisionActive).toBe(true);
    expect(atEntry.position.x).toBeCloseTo(trajectory.nearPoint.x, 10);
    expect(atEntry.position.y).toBeCloseTo(trajectory.nearPoint.y, 10);
  });

  it('uses the same depth ray for top, side, and wall-style spawns', () => {
    const trajectories = [
      createTunnelTrajectory({ x: 90, y: -120 }, { x: 14, y: 230 }, 18),
      createTunnelTrajectory({ x: -170, y: 650 }, { x: 275, y: 0 }, 28),
      createTunnelTrajectory({ x: 710, y: 760 }, { x: -225, y: 0 }, 27),
    ];

    for (const trajectory of trajectories) {
      const spawnProjection = sampleTunnelProjection(trajectory, trajectory.spawn);
      expect(spawnProjection.position.x).toBeCloseTo(BOSS_PROJECTILE_ORIGIN.x, 10);
      expect(spawnProjection.position.y).toBeCloseTo(BOSS_PROJECTILE_ORIGIN.y, 10);
      expect(spawnProjection.collisionActive).toBe(false);
      expect(trajectory.approachLength).toBeGreaterThan(0);
    }
  });
});
