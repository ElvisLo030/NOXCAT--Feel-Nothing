import { describe, expect, it } from 'vitest';
import { PLAYER_MIN_X, PLAYER_MAX_X, PLAYER_MIN_Y, PLAYER_MAX_Y, POSITION_STIFFNESS, POSITION_DAMPING } from '../src/game/constants';
import { DODGE_REPOSITION_X, DODGE_REPOSITION_Y, reachableLane, reachableSafeSpot } from '../src/game/patterns/fairness';
import { planPaperRain } from '../src/game/patterns/paperRain';
import { planTopDownpour } from '../src/game/patterns/topDownpour';
import { planPulseBarrage } from '../src/game/patterns/pulseBarrage';
import { planAlternatingZipper } from '../src/game/patterns/alternatingZipper';
import { planClosingWallWave } from '../src/game/patterns/closingWalls';
import { planCommentCrossfire, commentCrossfireLayout } from '../src/game/patterns/commentCrossfire';
import { planReturnableBurst } from '../src/game/patterns/returnableBurst';
import { planRevisionHoming } from '../src/game/patterns/revisionHoming';
import { planDeadlineBeams, distanceToBeam, BEAM_HALF_THICKNESS } from '../src/game/patterns/deadlineBeam';
import { calculateTunnelContactDepth, calculateProjectilePerspectiveQuad, calculateTunnelDepthPose, createTunnelTrajectory, sampleTunnelProjection } from '../src/game/systems/ProjectileDepth';
import { polygonSeparation } from '../src/game/systems/CollisionMath';
import { springScalar } from '../src/game/systems/JellyMotionSystem';
import { SeededRng } from '../src/utils/rng';
import type { ProjectileConfig } from '../src/game/entities/Projectile';
import {
  NOXCAT_DISPLAY_HEIGHT,
  NOXCAT_DISPLAY_WIDTH,
  NOXCAT_FACE_TEXTURE,
  sampleNoxcatBunOutline,
} from '../src/assets/noxcatDesign';
import { PatternIdSchema } from '../src/ai/bossSchema';
import { AttackDirector } from '../src/game/systems/AttackDirector';
import type { ProjectileSystem } from '../src/game/systems/ProjectileSystem';

const STARTS = [PLAYER_MIN_X, 270, PLAYER_MAX_X].flatMap((x) =>
  [PLAYER_MIN_Y, 657, PLAYER_MAX_Y].map((y) => ({ x, y })));

describe('attacks fitted to the current movement envelope', () => {
  it.each(PatternIdSchema.options)('lets the final %s projectile arrive even at shortest duration and last-life speed', (pattern) => {
    for (const speed of [0.9, 1, 1.75]) {
      let time = 0, activeAt = 0;
      const emitted: { at: number; duration: number }[] = [];
      const projectiles = {
        spawn: (card: ProjectileConfig) => emitted.push({ at: time, duration: card.perspectiveDurationMs ?? 0 }),
        spawnBeam: () => emitted.push({ at: time, duration: 520 }),
        activeProjectiles: () => [{ isDamage: true, friendly: false }],
        activeBeams: () => [],
        releaseDangerousForExit: () => {},
      } as unknown as ProjectileSystem;
      const director = new AttackDirector({ attacks: [{ pattern, intensity: 3, durationMs: 4_500 }] },
        new SeededRng(31), projectiles,
        { player: { x: 270, y: 740 }, onWavePhaseChanged: (phase: string) => { if (phase === 'ACTIVE') activeAt = time; } } as unknown as ConstructorParameters<typeof AttackDirector>[3]);
      director.setPacingScale({ speedScale: speed, telegraphScale: 0.7, recoveryScale: 0.22,
        vulnerableScale: 1, combatScale: 1, urgency: 1, relief: 0 });
      director.start();
      while (time < 9_000 && director.currentPhase !== 'RECOVERY') {
        time += 1;
        director.update(1, 1);
      }
      expect(emitted.length).toBeGreaterThan(0);
      expect(activeAt).toBeGreaterThanOrEqual(500);
      expect(director.currentPhase).toBe('RECOVERY');
      expect(Math.max(...emitted.map((card) => card.at + card.duration))).toBeLessThanOrEqual(time + 1);
    }
  });

  it.each([30, 60, 120])('reaches every advertised destination after 300 ms reaction at %i FPS', (fps) => {
    for (const start of STARTS) for (let seed = 1; seed <= 40; seed++) {
      const target = reachableSafeSpot(new SeededRng(seed), start);
      expect(Math.abs(target.x - start.x)).toBeLessThanOrEqual(DODGE_REPOSITION_X);
      expect(Math.abs(target.y - start.y)).toBeLessThanOrEqual(DODGE_REPOSITION_Y);
      let x = start.x, y = start.y, vx = 0, vy = 0;
      // 最短 500 ms 預警，扣掉 300 ms 辨識，只使用真實彈簧的最後 200 ms。
      for (let frame = 0; frame < fps * 0.2; frame++) {
        [x, vx] = springScalar(x, vx, target.x, POSITION_STIFFNESS, POSITION_DAMPING, 1 / fps);
        [y, vy] = springScalar(y, vy, target.y, POSITION_STIFFNESS, POSITION_DAMPING, 1 / fps);
      }
      expect(Math.hypot(x - target.x, y - target.y)).toBeLessThan(target.radius);
    }
  });

  it('constructs every beam around a nearby full-body safe pocket, including corners', () => {
    for (const start of STARTS) for (let seed = 1; seed <= 60; seed++) {
      const rng = new SeededRng(seed);
      const spot = reachableSafeSpot(rng, start);
      for (const beam of planDeadlineBeams(rng, 3, spot)) {
        expect(distanceToBeam(spot.x, spot.y, beam)).toBeGreaterThan(100 + BEAM_HALF_THICKNESS + spot.radius);
      }
      const comment = commentCrossfireLayout(rng, 3, start);
      expect(Math.abs(comment.safeSpot.x - start.x)).toBeLessThanOrEqual(DODGE_REPOSITION_X);
      expect(Math.abs(comment.safeSpot.y - start.y)).toBeLessThanOrEqual(DODGE_REPOSITION_Y);
      expect(comment.rays.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('locks homing at least 650 ms before any possible contact depth at maximum pacing', () => {
    for (const player of STARTS) for (const speed of [0.87, 1, 1.35, 1.75]) {
      for (const card of planRevisionHoming(new SeededRng(31), 3, speed, player)) {
        for (const target of STARTS) {
          const contact = calculateTunnelContactDepth(card.perspectiveOrigin!, target);
          expect(card.perspectiveDurationMs! * contact - card.homingMs!).toBeGreaterThanOrEqual(649.99);
        }
      }
    }
  });

  it('puts the isolated return card within one sideways swipe at every player height', () => {
    for (const player of STARTS) {
      const plan = planReturnableBurst(new SeededRng(29), 3, 0, 1, player);
      const card = plan.returnableProjectiles[0]!;
      expect(Math.abs(card.perspectiveTarget!.y - player.y)).toBeLessThanOrEqual(40);
      expect(Math.abs(card.perspectiveTarget!.x - player.x)).toBeLessThanOrEqual(DODGE_REPOSITION_X);
    }
  });

  it.each(STARTS)('keeps the complete cat outline clear from $x,$y along every lane and pocket', { timeout: 15_000 }, (start) => {
    for (let seed = 1; seed <= 8; seed++) {
      const rng = new SeededRng(seed);
      const lane = reachableLane(rng, 'x', start);
      const wall = planClosingWallWave(rng, 3, 1, reachableLane(rng, 'y', start), 5_000);
      const comment = planCommentCrossfire(rng, 3, 1, undefined, commentCrossfireLayout(rng, 3, start));
      const configurations: { cards: readonly ProjectileConfig[]; x: number; y: number }[] = [
        { cards: planPaperRain(rng, 3, 1, lane), x: lane, y: start.y },
        { cards: planTopDownpour(rng, 3, 1, lane).projectiles, x: lane, y: start.y },
        { cards: planPulseBarrage(rng, 3, 1, lane).formations.flatMap((wave) => wave.projectiles), x: lane, y: start.y },
        { cards: planAlternatingZipper(rng, 3, 0, 1, lane).shots.map((shot) => shot.projectile), x: lane, y: start.y },
        { cards: comment.projectiles, x: comment.layout.safeSpot.x, y: comment.layout.safeSpot.y },
        ...wall.formations.map((wave) => ({ cards: wall.formations.flatMap((formation) => formation.projectiles), x: start.x, y: wave.safeGapY })),
      ];
      for (const { cards, x, y } of configurations) for (const card of cards) {
        const trajectory = createTunnelTrajectory(card, { x: card.vx, y: card.vy }, card.radius ?? 18,
          card.perspectiveTarget, card.perspectiveDurationMs, card.perspectiveOrigin);
        for (let index = 0; index <= 24; index++) {
          const depth = trajectory.contactDepth + (1 - trajectory.contactDepth) * index / 24;
          const { position } = sampleTunnelProjection(trajectory, {
            x: card.x + (trajectory.approachPoint.x - card.x) * depth,
            y: card.y + (trajectory.approachPoint.y - card.y) * depth,
          });
          const pose = calculateTunnelDepthPose(card.kind, depth, trajectory.contactDepth);
          const quad = calculateProjectilePerspectiveQuad(position,
            (card.kind === 'wall' ? 100 : card.kind === 'comment' ? 120 : 40) * pose.scale,
            (card.kind === 'comment' ? 34 : 52) * pose.scale, depth, trajectory.nearPoint, trajectory.origin, card.yawOffset);
          const polygon = Object.values(quad).map((point) => ({ x: position.x + point.x, y: position.y + point.y }));
          for (const flip of [-1, 1]) {
            // 用近景完整輪廓及 15% 形變檢查；遠景實際角色更小。
            const body = sampleNoxcatBunOutline().map((point) => ({
              x: x + (point.x - NOXCAT_FACE_TEXTURE.width / 2)
                * (NOXCAT_DISPLAY_WIDTH / NOXCAT_FACE_TEXTURE.width) * 1.15 * flip,
              y: y + (point.y - NOXCAT_FACE_TEXTURE.height / 2)
                * (NOXCAT_DISPLAY_HEIGHT / NOXCAT_FACE_TEXTURE.height) * 1.15,
            }));
            expect(polygonSeparation(body, polygon, 1), `${card.kind} seed=${seed} at ${x},${y} depth=${depth}`)
              .toBeGreaterThan(0);
          }
        }
      }
    }
  });

});
