import { describe, expect, it } from 'vitest';

import {
  circlePolygonSeparation,
  compoundPolygonSeparation,
  interpolateThresholdCrossing,
  polygonSeparation,
  sweptAxisDistance,
  sweptPointDistance,
} from '../src/game/systems/CollisionMath';
import {
  createTunnelTrajectory,
  sampleTunnelProjection,
} from '../src/game/systems/ProjectileDepth';

describe('swept collision geometry', () => {
  const card = [
    { x: 40, y: 40 },
    { x: 80, y: 35 },
    { x: 86, y: 90 },
    { x: 35, y: 94 },
  ] as const;

  it('matches circles against the current projected document silhouette', () => {
    expect(circlePolygonSeparation({ x: 60, y: 60, radius: 8 }, card)).toBeLessThanOrEqual(0);
    expect(circlePolygonSeparation({ x: 27, y: 65, radius: 10 }, card)).toBeGreaterThan(0);
    expect(circlePolygonSeparation({ x: 30, y: 65, radius: 10 }, card)).toBeLessThanOrEqual(0);
  });

  it('uses the closest part of a compound cat silhouette', () => {
    const cat = [
      { x: 0, y: 0, radius: 12 },
      { x: 28, y: 0, radius: 16 },
    ] as const;
    expect(compoundPolygonSeparation(cat, card)).toBeGreaterThan(0);
    expect(compoundPolygonSeparation([
      ...cat,
      { x: 42, y: 48, radius: 9 },
    ], card)).toBeLessThanOrEqual(0);
  });

  it('detects exact polygon overlap and keeps nearby separated silhouettes distinct', () => {
    const catOutline = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 35 },
      { x: 45, y: 50 },
      { x: 0, y: 40 },
    ] as const;
    const overlappingCard = [
      { x: 50, y: 25 },
      { x: 75, y: 25 },
      { x: 75, y: 55 },
      { x: 50, y: 55 },
    ] as const;
    const nearbyCard = overlappingCard.map((point) => ({ x: point.x + 40, y: point.y }));

    expect(polygonSeparation(catOutline, overlappingCard, 25)).toBeLessThanOrEqual(0);
    expect(polygonSeparation(catOutline, nearbyCard, 25)).toBeGreaterThan(0);
  });

  it('detects two fast objects crossing between frame endpoints', () => {
    const distance = sweptPointDistance(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
    );

    expect(distance).toBe(0);
  });

  it('returns the closest endpoint when the paths move apart', () => {
    const distance = sweptPointDistance(
      { x: 0, y: 0 },
      { x: -20, y: 0 },
      { x: 30, y: 40 },
      { x: 45, y: 40 },
    );

    expect(distance).toBe(50);
  });

  it('handles stationary points without producing a non-finite result', () => {
    expect(sweptPointDistance(
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 13, y: 14 },
      { x: 13, y: 14 },
    )).toBe(5);
  });

  it('detects a player crossing a horizontal beam between sampled frames', () => {
    expect(sweptAxisDistance(580, 660, 620)).toBe(0);
    expect(sweptAxisDistance(580, 600, 620)).toBe(20);
  });

  it('starts a near-plane overshoot sweep at the exact visible handoff', () => {
    const spawn = { x: 270, y: 155 };
    const velocity = { x: 0, y: 4_000 };
    const player = { x: 270, y: 739 };
    const trajectory = createTunnelTrajectory(spawn, velocity, 18, player, 20);
    // A 20 ms near-plane clock ends at authored y=235. This simulated low-FPS
    // frame begins before it and ends 65 px beyond it: point-only collision at
    // the endpoint misses the 36 px combined hit radius.
    const authoredStart = { x: 270, y: 220 };
    const authoredEnd = { x: 270, y: 300 };
    const entryCollider = interpolateThresholdCrossing(
      authoredStart,
      authoredEnd,
      authoredStart.y - spawn.y,
      authoredEnd.y - spawn.y,
      trajectory.approachLength,
    );
    const visibleEntry = sampleTunnelProjection(trajectory, entryCollider).position;
    const visibleEnd = sampleTunnelProjection(trajectory, authoredEnd).position;

    expect(entryCollider.y).toBeCloseTo(235);
    expect(visibleEntry).toEqual(player);
    expect(Math.hypot(visibleEnd.x - player.x, visibleEnd.y - player.y)).toBeGreaterThan(36);
    expect(sweptPointDistance(visibleEntry, visibleEnd, player, player)).toBe(0);
  });
});
