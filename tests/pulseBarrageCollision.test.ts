import { describe, expect, it } from 'vitest';
import { sampleNoxcatBunOutline } from '../src/assets/noxcatDesign';
import { planPulseBarrage, PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH } from '../src/game/patterns/pulseBarrage';
import { polygonSeparation } from '../src/game/systems/CollisionMath';
import { verticalSafeWedgeBoundsAtY } from '../src/game/systems/DangerTelegraph';
import {
  calculateProjectilePerspectiveQuad,
  calculateTunnelDepthPose,
  createTunnelTrajectory,
  PROJECTILE_CONTACT_DEPTH,
  rotateProjectedSurfacePoint,
  sampleTunnelProjection,
} from '../src/game/systems/ProjectileDepth';
import { SeededRng } from '../src/utils/rng';

describe('pulse barrage in the lower dodge area', () => {
  it.each([735, 810, 884])('keeps the visible cat clear on the safe centre at y=%i', (playerY) => {
    // 瀏覽器重現的 seed 與通道，保留 Director 抽選通道時消耗的亂數。
    const rng = new SeededRng(12);
    rng.range(100, 440);
    const plan = planPulseBarrage(rng, 2, 1, 255.97131060622633);
    const lane = verticalSafeWedgeBoundsAtY({
      center: plan.safeLaneX, halfWidth: PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH,
    }, playerY);
    const playerX = (lane.left + lane.right) / 2;
    const bodies = [-1, 1].map((flip) => sampleNoxcatBunOutline(8).map((point) => ({
      x: playerX + (point.x - 100) * (138 / 200) * flip,
      y: playerY + (point.y - 92) * (126 / 184),
    })));
    for (const config of plan.formations.flatMap((formation) => formation.projectiles)) {
      const trajectory = createTunnelTrajectory(
        { x: config.x, y: config.y }, { x: config.vx, y: config.vy },
        config.radius ?? 18, config.perspectiveTarget,
        config.perspectiveDurationMs, config.perspectiveOrigin,
      );
      for (let index = 0; index <= 20; index += 1) {
        const depth = PROJECTILE_CONTACT_DEPTH + (1 - PROJECTILE_CONTACT_DEPTH) * index / 20;
        const { position, collisionActive } = sampleTunnelProjection(trajectory, {
          x: config.x + (trajectory.approachPoint.x - config.x) * depth,
          y: config.y + (trajectory.approachPoint.y - config.y) * depth,
        });
        expect(collisionActive).toBe(true);
        const pose = calculateTunnelDepthPose(config.kind, depth);
        const quad = calculateProjectilePerspectiveQuad(
          position, 40 * pose.scale, 52 * pose.scale, depth,
          trajectory.nearPoint, trajectory.origin,
        );
        const roll = (config.rotationSpeed ?? 0) * (config.perspectiveDurationMs! / 1_000) * depth;
        const card = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((point) => {
          const rotated = rotateProjectedSurfacePoint(point, roll);
          return { x: position.x + rotated.x, y: position.y + rotated.y };
        });
        for (const body of bodies) {
          expect(polygonSeparation(body, card, 1), `visible overlap at depth ${depth}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
