import { describe, expect, it } from 'vitest';

import {
  calculateJellyPose,
  clampToLaunchBoundary,
  createReturnArc,
  crossedLaunchBoundary,
  MAX_JELLY_LEAN_RADIANS,
  releasePulse,
  RELEASE_PULSE_DURATION_SECONDS,
  sampleReturnArc,
  springScalar,
} from '../src/game/systems/JellyMotionSystem';
import { POSITION_DAMPING, POSITION_STIFFNESS } from '../src/game/constants';

function simulateSpring(fps: number): readonly [number, number] {
  const durationSeconds = 1.2;
  const frameCount = Math.round(durationSeconds * fps);
  let value = 0.58;
  let velocity = -0.35;

  for (let frame = 0; frame < frameCount; frame += 1) {
    [value, velocity] = springScalar(value, velocity, 1, 90, 13, 1 / fps);
  }

  return [value, velocity];
}

describe('JellyMotionSystem', () => {
  it('keeps the player follow spring fast and frame-rate independent', () => {
    const simulate = (fps: number): number => {
      let position = 0;
      let velocity = 0;
      for (let frame = 0; frame < fps * 0.2; frame += 1) {
        [position, velocity] = springScalar(
          position,
          velocity,
          300,
          POSITION_STIFFNESS,
          POSITION_DAMPING,
          1 / fps,
        );
      }
      return position;
    };

    const at30 = simulate(30);
    const at60 = simulate(60);
    const at120 = simulate(120);
    expect(at30).toBeGreaterThan(270);
    expect(at30).toBeCloseTo(at60, 9);
    expect(at60).toBeCloseTo(at120, 9);
  });

  it('converges consistently at 30, 60, and 120 FPS', () => {
    const at30 = simulateSpring(30);
    const at60 = simulateSpring(60);
    const at120 = simulateSpring(120);

    expect(at30[0]).toBeCloseTo(at60[0], 9);
    expect(at30[0]).toBeCloseTo(at120[0], 9);
    expect(at30[1]).toBeCloseTo(at60[1], 9);
    expect(at30[1]).toBeCloseTo(at120[1], 9);
    expect(at120[0]).toBeCloseTo(1, 3);
  });

  it('produces alternating release rebounds with decaying peaks', () => {
    const duration = RELEASE_PULSE_DURATION_SECONDS;
    const first = releasePulse(duration * 0.1);
    const second = releasePulse(duration * 0.3);
    const third = releasePulse(duration * 0.5);
    const fourth = releasePulse(duration * 0.7);
    const fifth = releasePulse(duration * 0.9);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(0);
    expect(third).toBeGreaterThan(0);
    expect(fourth).toBeLessThan(0);
    expect(fifth).toBeGreaterThan(0);
    expect(Math.abs(first)).toBeGreaterThan(Math.abs(second));
    expect(Math.abs(second)).toBeGreaterThan(Math.abs(third));
    expect(Math.abs(third)).toBeGreaterThan(Math.abs(fourth));
    expect(Math.abs(fourth)).toBeGreaterThan(Math.abs(fifth));
    expect(releasePulse(duration)).toBe(0);
  });

  it('leans left and right symmetrically without wrapping through PI', () => {
    const right = calculateJellyPose({ x: 900, y: 0 });
    const left = calculateJellyPose({ x: -900, y: 0 });
    const extremeLeft = calculateJellyPose({ x: -9_000, y: 0 });

    expect(right.leanRadians).toBeCloseTo(MAX_JELLY_LEAN_RADIANS);
    expect(left.leanRadians).toBeCloseTo(-MAX_JELLY_LEAN_RADIANS);
    expect(extremeLeft.leanRadians).toBeCloseTo(-MAX_JELLY_LEAN_RADIANS);
    expect(left.scaleX).toBeCloseTo(right.scaleX);
    expect(left.scaleY).toBeCloseTo(right.scaleY);
  });

  it('stretches on the dominant velocity axis while staying upright', () => {
    const horizontal = calculateJellyPose({ x: 900, y: 0 });
    const vertical = calculateJellyPose({ x: 0, y: -900 });

    expect(horizontal.scaleX).toBeCloseTo(1.3);
    expect(horizontal.scaleY).toBeCloseTo(0.8);
    expect(vertical.scaleX).toBeCloseTo(0.8);
    expect(vertical.scaleY).toBeCloseTo(1.3);
    expect(vertical.leanRadians).toBe(0);
  });

  it('returns a finite neutral pose at zero speed', () => {
    const pose = calculateJellyPose({ x: 0, y: 0 });

    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    expect(pose.speed).toBe(0);
    expect(pose.speed01).toBe(0);
    expect(pose.scaleX).toBe(1);
    expect(pose.scaleY).toBe(1);
    expect(pose.leanRadians).toBe(0);
  });

  it('returns along a deterministic arc instead of a straight line', () => {
    const arc = createReturnArc({ x: 270, y: 237 }, { x: 270, y: 739 }, -1);
    const halfway = sampleReturnArc(arc, arc.durationSeconds * 0.5);
    const finished = sampleReturnArc(arc, arc.durationSeconds);

    expect(Math.abs(halfway.x - 270)).toBeGreaterThan(20);
    expect(halfway.y).toBeLessThan((237 + 739) / 2 - 20);
    expect(finished).toMatchObject({ x: 270, y: 739, progress: 1 });
  });

  it('detects a launch miss and clamps its bounce point inside the visible frame', () => {
    expect(crossedLaunchBoundary({ x: -110, y: 700 })).toBe(true);
    expect(crossedLaunchBoundary({ x: 270, y: 700 })).toBe(false);
    expect(clampToLaunchBoundary({ x: -110, y: 980 })).toEqual({ x: 30, y: 910 });
  });
});
