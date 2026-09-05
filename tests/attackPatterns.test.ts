import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';

import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';
import type { BossDNA } from '../src/ai/bossSchema';
import { PLAYER_HIT_RADIUS } from '../src/game/constants';
import type { Noxcat } from '../src/game/entities/Noxcat';
import type { ProjectileConfig } from '../src/game/entities/Projectile';
import {
  CLOSING_WALL_SAFE_GAP_HALF_HEIGHT,
  planClosingWallWave,
  planClosingWalls,
} from '../src/game/patterns/closingWalls';
import {
  COMMENT_SAFE_LANE_HALF_HEIGHT,
  planCommentCrossfire,
} from '../src/game/patterns/commentCrossfire';
import {
  hasMinimumReactionDistance,
  LEFT_WARNING_X,
  ATTACK_NEAR_MAX_X,
  ATTACK_NEAR_MIN_X,
  PROJECTILE_RECYCLE_TOP,
  RIGHT_WARNING_X,
  SIDE_ATTACK_ORIGIN_LEFT_X,
  SIDE_ATTACK_ORIGIN_RIGHT_X,
  SIDE_ATTACK_ORIGIN_Y,
} from '../src/game/patterns/fairness';
import {
  PAPER_SAFE_LANE_HALF_WIDTH,
  planPaperRain,
} from '../src/game/patterns/paperRain';
import {
  planReturnableBurst,
  RETURNABLE_INTERACTION_GAP_MS,
  RETURNABLE_MIN_NEAR_PLANE_MS,
  RETURNABLE_OPENING_CLEAR_MS,
  RETURNABLE_PATH_SEPARATION,
  RETURNABLE_SAFE_LANE_HALF_WIDTH,
  RETURNABLE_WINDOW_START_MS,
  runReturnableBurst,
} from '../src/game/patterns/returnableBurst';
import type { AttackPatternContext } from '../src/game/patterns/types';
import { planRevisionHoming } from '../src/game/patterns/revisionHoming';
import {
  ATTACK_MIN_ACTIVE_MS,
  ATTACK_RECOVERY_MS,
  ATTACK_TELEGRAPH_MS,
  AttackDirector,
  type WavePhase,
} from '../src/game/systems/AttackDirector';
import {
  createTunnelTrajectory,
  nearWallVisualHalfHeight,
  PROJECTILE_CONTACT_DEPTH,
  radialNearPlaneVelocity,
  sampleTunnelProjection,
} from '../src/game/systems/ProjectileDepth';
import { verticalSafeWedgeBoundsAtY } from '../src/game/systems/DangerTelegraph';
import type { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { SeededRng } from '../src/utils/rng';

function speedOf(config: ProjectileConfig): number {
  return Math.hypot(config.vx, config.vy);
}

function createPatternRuntime(
  x = 270,
  y = 720,
): Pick<AttackPatternContext, 'scene' | 'player'> {
  // Pattern code only reads the public position in these headless unit tests.
  // Explicit annotations keep the harness aligned with the production
  // Phaser.Scene/Noxcat contract without starting a WebGL renderer.
  const scene: Phaser.Scene = Object.create(null);
  const player: Noxcat = Object.create(null);
  player.x = x;
  player.y = y;
  return { scene, player };
}

function expectNearRayOutsideLane(
  config: ProjectileConfig,
  laneY: number,
  halfWidth: number,
): void {
  const radius = config.radius ?? 18;
  const trajectory = createTunnelTrajectory(
    { x: config.x, y: config.y },
    { x: config.vx, y: config.vy },
    radius,
    config.perspectiveTarget,
    config.perspectiveDurationMs,
    config.perspectiveOrigin,
  );
  const velocity = radialNearPlaneVelocity(trajectory, speedOf(config));
  for (let index = 0; index <= 40; index += 1) {
    const seconds = index * 0.05;
    const point = {
      x: trajectory.nearPoint.x + velocity.x * seconds,
      y: trajectory.nearPoint.y + velocity.y * seconds,
    };
    if (point.x < 46 || point.x > 494) continue;
    expect(Math.abs(point.y - laneY)).toBeGreaterThan(
      halfWidth + PLAYER_HIT_RADIUS + radius,
    );
  }
}

function expectNearRayOutsideVerticalLane(
  config: ProjectileConfig,
  laneX: number,
  halfWidth: number,
): void {
  const radius = config.radius ?? 18;
  const trajectory = createTunnelTrajectory(
    { x: config.x, y: config.y },
    { x: config.vx, y: config.vy },
    radius,
    config.perspectiveTarget,
    config.perspectiveDurationMs,
    config.perspectiveOrigin,
  );
  const velocity = radialNearPlaneVelocity(trajectory, speedOf(config));
  for (let index = 0; index <= 40; index += 1) {
    const seconds = index * 0.05;
    const point = {
      x: trajectory.nearPoint.x + velocity.x * seconds,
      y: trajectory.nearPoint.y + velocity.y * seconds,
    };
    if (point.y < 430 || point.y > 884) continue;
    expect(Math.abs(point.x - laneX)).toBeGreaterThanOrEqual(
      halfWidth + PLAYER_HIT_RADIUS + radius,
    );
  }
}

function expectProjectedCollisionIntervalOutsideVerticalSafeWedge(
  config: ProjectileConfig,
  laneX: number,
  halfWidth: number,
): void {
  const radius = config.radius ?? 18;
  const trajectory = createTunnelTrajectory(
    { x: config.x, y: config.y },
    { x: config.vx, y: config.vy },
    radius,
    config.perspectiveTarget,
    config.perspectiveDurationMs,
    config.perspectiveOrigin,
  );
  const side = trajectory.nearPoint.x < laneX ? -1 : 1;
  const collisionClearance = radius + PLAYER_HIT_RADIUS;
  let minimumClearance = Number.POSITIVE_INFINITY;
  let collisionStayedActive = true;

  for (let index = 0; index <= 40; index += 1) {
    const depth = PROJECTILE_CONTACT_DEPTH
      + (1 - PROJECTILE_CONTACT_DEPTH) * index / 40;
    const authoredPoint = {
      x: trajectory.spawn.x
        + (trajectory.approachPoint.x - trajectory.spawn.x) * depth,
      y: trajectory.spawn.y
        + (trajectory.approachPoint.y - trajectory.spawn.y) * depth,
    };
    const projection = sampleTunnelProjection(trajectory, authoredPoint);
    const wedge = verticalSafeWedgeBoundsAtY(
      { center: laneX, halfWidth },
      projection.position.y,
    );
    collisionStayedActive &&= projection.collisionActive;
    const clearance = side < 0
      ? wedge.left - (projection.position.x + collisionClearance)
      : (projection.position.x - collisionClearance) - wedge.right;
    minimumClearance = Math.min(minimumClearance, clearance);
  }

  expect(collisionStayedActive).toBe(true);
  expect(minimumClearance).toBeGreaterThanOrEqual(-1e-7);
}

describe('attack pattern fairness geometry', () => {
  it('keeps the paper-rain lane clear for the full downward flight', () => {
    const laneX = 270;
    const projectiles = planPaperRain(new SeededRng(81), 3, 1, laneX);

    expect(projectiles).toHaveLength(10);
    const nearTargets = projectiles.map((projectile) => projectile.perspectiveTarget?.x ?? projectile.x);
    expect(Math.min(...nearTargets)).toBeLessThan(0);
    expect(Math.max(...nearTargets)).toBeGreaterThan(540);
    for (const projectile of projectiles) {
      expect(projectile.y).toBeGreaterThan(PROJECTILE_RECYCLE_TOP);
      const radius = projectile.radius ?? 18;
      const requiredClearance = PAPER_SAFE_LANE_HALF_WIDTH + PLAYER_HIT_RADIUS + radius;
      expect(Math.abs(projectile.x - laneX)).toBeGreaterThan(requiredClearance);
      expect(Math.abs(projectile.x + projectile.vx * 5 - laneX)).toBeGreaterThan(requiredClearance);
      expect(Math.sign(projectile.vx)).toBe(Math.sign(projectile.x - laneX));
    }
  });

  it('sweeps both legal screen edges before overscanned paper lanes leave the viewport', () => {
    const projectiles = planPaperRain(new SeededRng(81), 3, 1, 270);
    const projectedCentres = projectiles.map((projectile) => {
      const radius = projectile.radius ?? 18;
      const trajectory = createTunnelTrajectory(
        { x: projectile.x, y: projectile.y },
        { x: projectile.vx, y: projectile.vy },
        radius,
        projectile.perspectiveTarget,
        projectile.perspectiveDurationMs,
        projectile.perspectiveOrigin,
      );
      const depth = PROJECTILE_CONTACT_DEPTH;
      return sampleTunnelProjection(trajectory, {
        x: trajectory.spawn.x
          + (trajectory.approachPoint.x - trajectory.spawn.x) * depth,
        y: trajectory.spawn.y
          + (trajectory.approachPoint.y - trajectory.spawn.y) * depth,
      }).position.x;
    });
    const collisionReach = PLAYER_HIT_RADIUS + 18;

    expect(projectedCentres.some((x) => Math.abs(x - 46) <= collisionReach)).toBe(true);
    expect(projectedCentres.some((x) => Math.abs(x - 494) <= collisionReach)).toBe(true);
  });

  it('alternates crossfire sides while reserving a player-centred safe lane', () => {
    const player = { x: 46, y: 650 };
    const even = planCommentCrossfire(new SeededRng(12), 3, 0, 1, player);
    const odd = planCommentCrossfire(new SeededRng(12), 3, 1, 1, player);

    expect(even.fromLeft).toBe(true);
    expect(odd.fromLeft).toBe(false);
    expect(even.projectiles[0]?.x).toBe(LEFT_WARNING_X);
    expect(odd.projectiles[0]?.x).toBe(RIGHT_WARNING_X);
    expect(even.projectiles[0]?.perspectiveOrigin).toEqual({
      x: SIDE_ATTACK_ORIGIN_LEFT_X,
      y: SIDE_ATTACK_ORIGIN_Y,
    });
    expect(odd.projectiles[0]?.perspectiveOrigin).toEqual({
      x: SIDE_ATTACK_ORIGIN_RIGHT_X,
      y: SIDE_ATTACK_ORIGIN_Y,
    });
    expect(even.projectiles[0]?.perspectiveTarget?.x).toBe(ATTACK_NEAR_MAX_X);
    expect(odd.projectiles[0]?.perspectiveTarget?.x).toBe(ATTACK_NEAR_MIN_X);
    for (const projectile of [...even.projectiles, ...odd.projectiles]) {
      const radius = projectile.radius ?? 28;
      expect(Math.abs(projectile.vy)).toBeGreaterThan(0);
      expect(Math.sign(projectile.vy)).toBe(Math.sign(projectile.y - player.y));
      expect(Math.abs(projectile.y - player.y)).toBeGreaterThanOrEqual(
        COMMENT_SAFE_LANE_HALF_HEIGHT + PLAYER_HIT_RADIUS + radius,
      );
      expect(Math.abs((projectile.perspectiveTarget?.y ?? projectile.y) - player.y))
        .toBeGreaterThan(Math.abs(projectile.y - player.y));
      const edgePlayer = {
        x: projectile.vx > 0 ? 46 : 494,
        y: projectile.y,
      };
      expect(hasMinimumReactionDistance(
        { x: projectile.x, y: projectile.y },
        edgePlayer,
        speedOf(projectile),
        radius,
      )).toBe(true);
      expectNearRayOutsideLane(projectile, player.y, COMMENT_SAFE_LANE_HALF_HEIGHT);
    }
  });

  it('opens a stable lane through returnable bursts and warns from far above', () => {
    const topPlayer = { x: 270, y: 430 };
    const plan = planReturnableBurst(new SeededRng(33), 3, 0, 1, topPlayer);

    expect(plan.projectiles).toHaveLength(5);
    expect(plan.returnableIndex).toBeGreaterThanOrEqual(1);
    expect(plan.returnableIndices).toEqual([plan.openingProjectiles.length]);
    expect(plan.projectiles.filter((projectile) => projectile.kind === 'returnable')).toHaveLength(1);
    expect(plan.openingProjectiles).toHaveLength(4);
    expect(plan.openingProjectiles.every((projectile) => projectile.kind === 'paper')).toBe(true);
    expect(plan.returnableProjectiles).toHaveLength(1);
    expect(plan.returnableProjectiles.every((projectile) => (
      projectile.kind === 'returnable'
    ))).toBe(true);
    const returnableTargetX = plan.returnableProjectiles[0]?.perspectiveTarget?.x;
    expect(returnableTargetX).toBeDefined();
    for (const paper of plan.openingProjectiles) {
      expect(Math.abs(paper.x - plan.interactionLaneX)).toBeGreaterThanOrEqual(
        RETURNABLE_PATH_SEPARATION,
      );
      expect(Math.abs((paper.perspectiveTarget?.x ?? paper.x) - (returnableTargetX ?? 0)))
        .toBeGreaterThanOrEqual(80);
      expect(paper.perspectiveDurationMs).toBeLessThan(RETURNABLE_OPENING_CLEAR_MS);
    }
    for (const projectile of plan.projectiles) {
      const radius = projectile.radius ?? 18;
      expect(Math.abs(projectile.x - plan.safeLaneX)).toBeGreaterThanOrEqual(
        RETURNABLE_SAFE_LANE_HALF_WIDTH + PLAYER_HIT_RADIUS + radius + 4,
      );
      expect(Math.sign(projectile.vx)).toBe(Math.sign(projectile.x - plan.safeLaneX));
      expect(hasMinimumReactionDistance(
        { x: projectile.x, y: projectile.y },
        { x: projectile.x, y: topPlayer.y },
        speedOf(projectile),
        radius,
      )).toBe(true);
    }

    const edgePlan = planReturnableBurst(new SeededRng(34), 3, 0, 1, { x: 46, y: 430 });
    expect(edgePlan.safeLaneX).toBe(70);
    expect(edgePlan.projectiles).toHaveLength(5);
    expect(edgePlan.interactionLaneX).toBe(190);
    expect(edgePlan.openingProjectiles.every((paper) => (
      paper.x - edgePlan.interactionLaneX >= RETURNABLE_PATH_SEPARATION
    ))).toBe(true);
    expect(edgePlan.projectiles.every((projectile) => (
      Math.abs(projectile.x - edgePlan.safeLaneX)
        >= RETURNABLE_SAFE_LANE_HALF_WIDTH
          + PLAYER_HIT_RADIUS
          + (projectile.radius ?? 18)
          + 4
    ))).toBe(true);
  });

  it('spawns homing revisions far enough away to prevent a near-boundary hit', () => {
    const projectiles = planRevisionHoming(new SeededRng(5), 3, 1);

    expect(projectiles).toHaveLength(3);
    for (const projectile of projectiles) {
      const radius = projectile.radius ?? 18;
      expect(hasMinimumReactionDistance(
        { x: projectile.x, y: projectile.y },
        { x: projectile.x, y: 430 },
        speedOf(projectile),
        radius,
      )).toBe(true);
    }
  });

  it('keeps a 2.5-player-diameter gap through both closing walls', () => {
    const gapY = 650;
    const plan = planClosingWalls(new SeededRng(44), 3, 1, gapY);

    expect(CLOSING_WALL_SAFE_GAP_HALF_HEIGHT * 2).toBeGreaterThanOrEqual(PLAYER_HIT_RADIUS * 2 * 2.5);
    const nearestWallCenter = CLOSING_WALL_SAFE_GAP_HALF_HEIGHT
      + 27
      + PLAYER_HIT_RADIUS
      + 4;
    const renderedOpening = 2 * (nearestWallCenter - nearWallVisualHalfHeight());
    expect(renderedOpening).toBeGreaterThanOrEqual(PLAYER_HIT_RADIUS * 2 * 2.5);
    for (const projectile of plan.projectiles) {
      const radius = projectile.radius ?? 27;
      expect(Math.abs(projectile.y - gapY)).toBeGreaterThan(
        CLOSING_WALL_SAFE_GAP_HALF_HEIGHT + PLAYER_HIT_RADIUS + radius,
      );
      const edgePlayer = {
        x: projectile.vx > 0 ? 46 : 494,
        y: projectile.y,
      };
      expect(hasMinimumReactionDistance(
        { x: projectile.x, y: projectile.y },
        edgePlayer,
        speedOf(projectile),
        radius,
      )).toBe(true);
      expectNearRayOutsideLane(projectile, gapY, CLOSING_WALL_SAFE_GAP_HALF_HEIGHT);
    }
  });

  it('moves the closing-wall gap slowly across the whole wave without narrowing it', () => {
    const wave = planClosingWallWave(new SeededRng(144), 3, 1, 650, 5_200);
    const gapPath = wave.formations.map((formation) => formation.safeGapY);
    const deltas = gapPath.slice(1).map((gap, index) => gap - gapPath[index]!);

    expect(wave.formations).toHaveLength(4);
    expect(wave.formations[0]?.atMs).toBe(0);
    expect(wave.formations.at(-1)?.atMs).toBe(3_600);
    expect(gapPath.at(0)).toBe(wave.startGapY);
    expect(gapPath.at(-1)).toBe(wave.endGapY);
    expect(Math.abs(wave.endGapY - wave.startGapY)).toBeLessThanOrEqual(74);
    expect(deltas.every((delta) => Math.sign(delta) === Math.sign(deltas[0]!))).toBe(true);
    for (const formation of wave.formations) {
      for (const projectile of formation.projectiles) {
        expect(Math.abs(projectile.y - formation.safeGapY)).toBeGreaterThan(
          CLOSING_WALL_SAFE_GAP_HALF_HEIGHT
            + PLAYER_HIT_RADIUS
            + (projectile.radius ?? 27),
        );
      }
    }
  });

  it('produces identical safe geometry for identical seeds and inputs', () => {
    const first = planReturnableBurst(new SeededRng(270_027), 2, 4, 0.87, { x: 333, y: 700 });
    const second = planReturnableBurst(new SeededRng(270_027), 2, 4, 0.87, { x: 333, y: 700 });

    expect(first).toEqual(second);
  });

  it('keeps advertised safe lanes clear across seeds, intensities, and edge positions', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const intensity of [1, 2, 3] as const) {
        for (const laneX of [90, 270, 450]) {
          for (const projectile of planPaperRain(new SeededRng(seed), intensity, 1, laneX)) {
            expectNearRayOutsideVerticalLane(projectile, laneX, PAPER_SAFE_LANE_HALF_WIDTH);
          }
          const burst = planReturnableBurst(
            new SeededRng(seed),
            intensity,
            seed % 7,
            1,
            { x: laneX, y: 720 },
          );
          for (const projectile of burst.projectiles) {
            expectNearRayOutsideVerticalLane(
              projectile,
              burst.safeLaneX,
              RETURNABLE_SAFE_LANE_HALF_WIDTH,
            );
          }
        }

        for (const laneY of [535, 650, 805]) {
          const crossfire = planCommentCrossfire(
            new SeededRng(seed),
            intensity,
            seed,
            1,
            { x: 270, y: laneY },
          );
          for (const projectile of crossfire.projectiles) {
            expectNearRayOutsideLane(projectile, crossfire.safeLaneY, COMMENT_SAFE_LANE_HALF_HEIGHT);
          }
          const walls = planClosingWalls(new SeededRng(seed), intensity, 1, laneY);
          for (const projectile of walls.projectiles) {
            expectNearRayOutsideLane(projectile, walls.safeGapY, CLOSING_WALL_SAFE_GAP_HALF_HEIGHT);
          }
        }
      }
    }
  });

  it('keeps projected hit circles outside vertical safe wedges for every active depth', () => {
    const paperLanes = [90, 120, 270, 420, 450] as const;
    const returnableLanes = [70, 90, 150, 270, 390, 450, 470] as const;

    for (let seed = 1; seed <= 100; seed += 1) {
      for (const intensity of [1, 2, 3] as const) {
        for (const laneX of paperLanes) {
          const configs = planPaperRain(new SeededRng(seed), intensity, 1, laneX);
          for (const config of configs) {
            expectProjectedCollisionIntervalOutsideVerticalSafeWedge(
              config,
              laneX,
              PAPER_SAFE_LANE_HALF_WIDTH,
            );
          }
        }

        for (const laneX of returnableLanes) {
          const plan = planReturnableBurst(
            new SeededRng(seed),
            intensity,
            seed % 7,
            1,
            { x: laneX, y: 720 },
          );
          for (const config of plan.projectiles) {
            expectProjectedCollisionIntervalOutsideVerticalSafeWedge(
              config,
              plan.safeLaneX,
              RETURNABLE_SAFE_LANE_HALF_WIDTH,
            );
          }
        }
      }
    }
  });
});

describe('AttackDirector wave pacing', () => {
  it('spawns exactly once per step, releases cards through recovery, then changes pattern', () => {
    const spawned: ProjectileConfig[] = [];
    const phases: WavePhase[] = [];
    let clears = 0;
    let releases = 0;
    const projectiles = {
      spawn: (config: ProjectileConfig) => {
        spawned.push(config);
        return null;
      },
      activeProjectiles: () => [{ isDamage: true, friendly: false }],
      activeBeams: () => [],
      clearDangerous: () => { clears += 1; },
      releaseDangerousForExit: () => { releases += 1; },
    } as unknown as ProjectileSystem;
    const runtime = createPatternRuntime();
    const director = new AttackDirector(FALLBACK_BOSS, new SeededRng(FALLBACK_BOSS.seed), projectiles, {
      ...runtime,
      getPlayerPosition: () => ({ x: 270, y: 720 }),
      onWavePhaseChanged: (phase) => phases.push(phase),
    });

    director.start();
    expect(director.currentPhase).toBe('TELEGRAPH');
    director.update(ATTACK_TELEGRAPH_MS.paper_rain - 1, 3);
    expect(spawned).toHaveLength(0);

    director.update(1, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    expect(spawned).toHaveLength(1);
    director.update(144, 3);
    expect(spawned).toHaveLength(1);
    director.update(1, 3);
    expect(spawned).toHaveLength(2);
    const paperActiveMs = FALLBACK_BOSS.attacks[0].durationMs
      - ATTACK_TELEGRAPH_MS.paper_rain
      - ATTACK_RECOVERY_MS.paper_rain;
    director.update(paperActiveMs - 146, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    expect(spawned).toHaveLength(8);
    expect(clears).toBe(0);
    expect(releases).toBe(0);
    director.update(1, 3);
    expect(director.currentPhase).toBe('RECOVERY');
    expect(spawned).toHaveLength(8);
    expect(clears).toBe(0);
    expect(releases).toBe(1);
    director.update(ATTACK_RECOVERY_MS.paper_rain - 1, 3);
    expect(spawned).toHaveLength(8);
    director.update(1, 3);
    expect(director.currentPhase).toBe('TELEGRAPH');
    expect(director.currentPattern).toBe('returnable_burst');
    expect(spawned).toHaveLength(8);
    director.update(ATTACK_TELEGRAPH_MS.returnable_burst - 1, 3);
    expect(spawned).toHaveLength(8);
    director.update(1, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    // The returnable pattern teaches with a front-to-back paper queue first.
    expect(spawned.slice(8)).toHaveLength(1);
    director.update(99, 3);
    expect(spawned.slice(8)).toHaveLength(1);
    director.update(1, 3);
    expect(spawned.slice(8)).toHaveLength(2);
    expect(spawned.slice(8).every((projectile) => projectile.kind === 'paper')).toBe(true);
    director.update(RETURNABLE_OPENING_CLEAR_MS - 101, 3);
    expect(spawned.slice(8)).toHaveLength(3);
    expect(spawned.slice(8).every((projectile) => projectile.kind === 'paper')).toBe(true);
    expect(clears).toBe(0);
    director.update(1, 3);
    expect(clears).toBe(0);
    expect(releases).toBe(2);
    director.update(RETURNABLE_INTERACTION_GAP_MS - 1, 3);
    expect(spawned.slice(8)).toHaveLength(3);
    director.update(1, 3);
    expect(spawned.slice(8)).toHaveLength(4);
    expect(spawned.at(-1)?.kind).toBe('returnable');
    expect(phases).toEqual([
      'TELEGRAPH',
      'ACTIVE',
      'RECOVERY',
      'TELEGRAPH',
      'ACTIVE',
    ]);
  });

  it('cancels a live pattern handle before its delayed returnables can spawn', () => {
    const spawned: ProjectileConfig[] = [];
    const projectiles = {
      spawn: (config: ProjectileConfig) => {
        spawned.push(config);
        return null;
      },
    } as unknown as ProjectileSystem;
    const runtime = createPatternRuntime();
    const context: AttackPatternContext = {
      ...runtime,
      rng: new SeededRng(270_027),
      intensity: 3,
      durationMs: 5_500,
      projectiles,
      speedScale: 1,
      waveIndex: 0,
    };
    const handle = runReturnableBurst(context, 270);

    expect(spawned).toHaveLength(1);
    expect(spawned.every((projectile) => projectile.kind === 'paper')).toBe(true);
    handle.update(RETURNABLE_OPENING_CLEAR_MS - 1);
    expect(spawned).toHaveLength(4);
    handle.cancel();
    handle.update(10_000);

    expect(handle.cancelled).toBe(true);
    expect(handle.finished).toBe(true);
    expect(spawned).toHaveLength(4);
  });

  it('keeps delayed returnables reachable in the shortest valid ACTIVE window', () => {
    const spawned: ProjectileConfig[] = [];
    let liveDangerous: ProjectileConfig[] = [];
    let releases = 0;
    const projectiles = {
      spawn: (config: ProjectileConfig) => {
        spawned.push(config);
        liveDangerous.push(config);
        return null;
      },
      releaseDangerousForExit: () => {
        releases += 1;
        liveDangerous = [];
      },
    } as unknown as ProjectileSystem;
    const runtime = createPatternRuntime();
    const activeDurationMs = 3_000;
    const handle = runReturnableBurst({
      ...runtime,
      rng: new SeededRng(18),
      intensity: 3,
      durationMs: activeDurationMs,
      projectiles,
      speedScale: 1,
      waveIndex: 0,
    }, 270);

    expect(liveDangerous).toHaveLength(1);
    expect(liveDangerous.every((projectile) => projectile.kind === 'paper')).toBe(true);
    handle.update(RETURNABLE_OPENING_CLEAR_MS);
    expect(releases).toBe(1);
    expect(liveDangerous).toHaveLength(0);
    handle.update(RETURNABLE_INTERACTION_GAP_MS - 1);
    expect(liveDangerous).toHaveLength(0);
    handle.update(1);
    expect(liveDangerous).toHaveLength(1);
    expect(liveDangerous.every((projectile) => projectile.kind === 'returnable')).toBe(true);
    const returnables = spawned.slice(4);
    for (const projectile of returnables) {
      expect(projectile.perspectiveDurationMs).toBeLessThanOrEqual(
        activeDurationMs - RETURNABLE_WINDOW_START_MS - RETURNABLE_MIN_NEAR_PLANE_MS,
      );
    }
  });

  it('makes AttackDirector cancellation discard a pattern\'s pending emissions', () => {
    const spawned: ProjectileConfig[] = [];
    let clears = 0;
    let tutorials = 0;
    const projectiles = {
      spawn: (config: ProjectileConfig) => {
        spawned.push(config);
        return null;
      },
      clearDangerous: () => { clears += 1; },
    } as unknown as ProjectileSystem;
    const returnableFirst: BossDNA = {
      ...FALLBACK_BOSS,
      attacks: [
        { pattern: 'returnable_burst', intensity: 3, durationMs: 7_000 },
        FALLBACK_BOSS.attacks[0],
        FALLBACK_BOSS.attacks[2],
      ],
    };
    const director = new AttackDirector(
      returnableFirst,
      new SeededRng(returnableFirst.seed),
      projectiles,
      {
        ...createPatternRuntime(),
        getPlayerPosition: () => ({ x: 270, y: 720 }),
        onReturnableTutorial: () => { tutorials += 1; },
      },
    );

    director.start();
    director.update(ATTACK_TELEGRAPH_MS.returnable_burst, 3);
    expect(spawned).toHaveLength(1);
    expect(spawned.every((projectile) => projectile.kind === 'paper')).toBe(true);

    director.cancelCurrent();
    director.update(10_000, 3);
    expect(clears).toBe(1);
    expect(tutorials).toBe(0);
    expect(spawned).toHaveLength(1);
  });

  it('uses short recoveries without reducing required high-speed warnings', () => {
    expect(Math.min(...Object.values(ATTACK_TELEGRAPH_MS))).toBeGreaterThanOrEqual(500);
    expect(ATTACK_TELEGRAPH_MS.deadline_beam).toBeGreaterThanOrEqual(750);
    expect(ATTACK_RECOVERY_MS).toEqual({
      paper_rain: 360,
      comment_crossfire: 400,
      deadline_beam: 420,
      closing_walls: 500,
      revision_homing: 440,
      returnable_burst: 380,
    });
    expect(Math.max(...Object.values(ATTACK_RECOVERY_MS))).toBeLessThanOrEqual(500);
  });

  it('starts recovery as soon as a finished timeline has no enemy threats', () => {
    let enemyProjectilePresent = true;
    let friendlyProjectilePresent = false;
    let beamPresent = false;
    let clears = 0;
    let releases = 0;
    const projectiles = {
      spawn: () => null,
      activeProjectiles: () => {
        if (enemyProjectilePresent) return [{ isDamage: true, friendly: false }];
        if (friendlyProjectilePresent) return [{ isDamage: false, friendly: true }];
        return [];
      },
      activeBeams: () => (beamPresent
        ? [{ telegraphMs: 120, activeMs: 520 }]
        : []),
      clearDangerous: () => { clears += 1; },
      releaseDangerousForExit: () => { releases += 1; },
    } as unknown as ProjectileSystem;
    const director = new AttackDirector(
      FALLBACK_BOSS,
      new SeededRng(FALLBACK_BOSS.seed),
      projectiles,
      {
        ...createPatternRuntime(),
        getPlayerPosition: () => ({ x: 270, y: 720 }),
      },
    );

    director.start();
    director.update(ATTACK_TELEGRAPH_MS.paper_rain, 3);
    director.update(ATTACK_MIN_ACTIVE_MS.paper_rain + 500, 3);
    expect(director.currentPhase).toBe('ACTIVE');

    // Friendly reflected cards must not stall pacing, but a live beam warning
    // still represents a future hostile segment and keeps ACTIVE open.
    enemyProjectilePresent = false;
    friendlyProjectilePresent = true;
    beamPresent = true;
    director.update(500, 3);
    expect(director.currentPhase).toBe('ACTIVE');

    beamPresent = false;
    director.update(ATTACK_RECOVERY_MS.paper_rain - 1, 3);
    expect(director.currentPhase).toBe('RECOVERY');
    expect(clears).toBe(0);
    expect(releases).toBe(1);
    director.update(1, 3);
    expect(director.currentPhase).toBe('TELEGRAPH');
    expect(director.currentPattern).toBe('returnable_burst');
  });

  it('does not recover early while a pattern timeline still has pending emissions', () => {
    const closingFirst: BossDNA = {
      ...FALLBACK_BOSS,
      attacks: [
        { pattern: 'closing_walls', intensity: 1, durationMs: 4_500 },
        FALLBACK_BOSS.attacks[1],
        FALLBACK_BOSS.attacks[2],
      ],
    };
    const projectiles = {
      spawn: () => null,
      activeProjectiles: () => [],
      activeBeams: () => [],
      clearDangerous: () => undefined,
      releaseDangerousForExit: () => undefined,
    } as unknown as ProjectileSystem;
    const director = new AttackDirector(
      closingFirst,
      new SeededRng(closingFirst.seed),
      projectiles,
      {
        ...createPatternRuntime(),
        getPlayerPosition: () => ({ x: 270, y: 720 }),
      },
    );

    director.start();
    director.update(ATTACK_TELEGRAPH_MS.closing_walls, 3);
    director.update(ATTACK_MIN_ACTIVE_MS.closing_walls, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    // 4,500 - 650 telegraph - 500 recovery = 3,350 ACTIVE;
    // the last closing-wall emission is deliberately scheduled at 1,750 ms.
    director.update(349, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    director.update(1, 3);
    expect(director.currentPhase).toBe('RECOVERY');
  });
});
