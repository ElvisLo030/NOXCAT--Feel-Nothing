import { describe, expect, it } from 'vitest';

import { FALLBACK_BOSS } from '../src/ai/fallbackBoss';
import { PLAYER_HIT_RADIUS } from '../src/game/constants';
import type { ProjectileConfig } from '../src/game/entities/Projectile';
import {
  CLOSING_WALL_SAFE_GAP_HALF_HEIGHT,
  planClosingWalls,
} from '../src/game/patterns/closingWalls';
import {
  COMMENT_SAFE_LANE_HALF_HEIGHT,
  planCommentCrossfire,
} from '../src/game/patterns/commentCrossfire';
import {
  hasMinimumReactionDistance,
  LEFT_WARNING_X,
  PROJECTILE_RECYCLE_TOP,
  RIGHT_WARNING_X,
} from '../src/game/patterns/fairness';
import {
  PAPER_SAFE_LANE_HALF_WIDTH,
  planPaperRain,
} from '../src/game/patterns/paperRain';
import {
  planReturnableBurst,
  RETURNABLE_SAFE_LANE_HALF_WIDTH,
} from '../src/game/patterns/returnableBurst';
import { planRevisionHoming } from '../src/game/patterns/revisionHoming';
import { AttackDirector, type WavePhase } from '../src/game/systems/AttackDirector';
import { nearWallVisualHalfHeight } from '../src/game/systems/ProjectileDepth';
import type { ProjectileSystem } from '../src/game/systems/ProjectileSystem';
import { SeededRng } from '../src/utils/rng';

function speedOf(config: ProjectileConfig): number {
  return Math.hypot(config.vx, config.vy);
}

describe('attack pattern fairness geometry', () => {
  it('keeps the paper-rain lane clear for the full downward flight', () => {
    const laneX = 270;
    const projectiles = planPaperRain(new SeededRng(81), 3, 1, laneX);

    expect(projectiles).toHaveLength(10);
    for (const projectile of projectiles) {
      expect(projectile.y).toBeGreaterThan(PROJECTILE_RECYCLE_TOP);
      const radius = projectile.radius ?? 18;
      const requiredClearance = PAPER_SAFE_LANE_HALF_WIDTH + PLAYER_HIT_RADIUS + radius;
      expect(Math.abs(projectile.x - laneX)).toBeGreaterThan(requiredClearance);
      expect(Math.abs(projectile.x + projectile.vx * 5 - laneX)).toBeGreaterThan(requiredClearance);
      expect(Math.sign(projectile.vx)).toBe(Math.sign(projectile.x - laneX));
    }
  });

  it('alternates crossfire sides while reserving a player-centred safe lane', () => {
    const player = { x: 46, y: 650 };
    const even = planCommentCrossfire(new SeededRng(12), 3, 0, 1, player);
    const odd = planCommentCrossfire(new SeededRng(12), 3, 1, 1, player);

    expect(even.fromLeft).toBe(true);
    expect(odd.fromLeft).toBe(false);
    expect(even.projectiles[0]?.x).toBe(LEFT_WARNING_X);
    expect(odd.projectiles[0]?.x).toBe(RIGHT_WARNING_X);
    for (const projectile of [...even.projectiles, ...odd.projectiles]) {
      const radius = projectile.radius ?? 28;
      expect(Math.abs(projectile.y - player.y)).toBeGreaterThanOrEqual(
        COMMENT_SAFE_LANE_HALF_HEIGHT + PLAYER_HIT_RADIUS + radius,
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
    }
  });

  it('opens a stable lane through returnable bursts and warns from far above', () => {
    const topPlayer = { x: 270, y: 430 };
    const plan = planReturnableBurst(new SeededRng(33), 3, 0, 1, topPlayer);

    expect(plan.projectiles).toHaveLength(8);
    expect(plan.returnableIndex).toBeGreaterThanOrEqual(1);
    expect(plan.projectiles.filter((projectile) => projectile.kind === 'returnable')).toHaveLength(1);
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
    expect(edgePlan.projectiles).toHaveLength(8);
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
    }
  });

  it('produces identical safe geometry for identical seeds and inputs', () => {
    const first = planReturnableBurst(new SeededRng(270_027), 2, 4, 0.87, { x: 333, y: 700 });
    const second = planReturnableBurst(new SeededRng(270_027), 2, 4, 0.87, { x: 333, y: 700 });

    expect(first).toEqual(second);
  });
});

describe('AttackDirector wave pacing', () => {
  it('spawns exactly once per step, clears for recovery, then changes pattern', () => {
    const spawned: ProjectileConfig[] = [];
    const phases: WavePhase[] = [];
    let clears = 0;
    const projectiles = {
      spawn: (config: ProjectileConfig) => {
        spawned.push(config);
        return null;
      },
      clearDangerous: () => { clears += 1; },
    } as unknown as ProjectileSystem;
    const director = new AttackDirector(FALLBACK_BOSS, new SeededRng(FALLBACK_BOSS.seed), projectiles, {
      getPlayerPosition: () => ({ x: 270, y: 720 }),
      onWavePhaseChanged: (phase) => phases.push(phase),
    });

    director.start();
    expect(director.currentPhase).toBe('TELEGRAPH');
    director.update(499, 3);
    expect(spawned).toHaveLength(0);

    director.update(1, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    expect(spawned).toHaveLength(8);
    // fallback paper_rain: 6,500 - 500 telegraph - 900 recovery
    // = 5,100 ms ACTIVE. No second volley may be created inside that window.
    director.update(5_099, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    expect(spawned).toHaveLength(8);
    expect(clears).toBe(0);
    director.update(1, 3);
    expect(director.currentPhase).toBe('RECOVERY');
    expect(spawned).toHaveLength(8);
    expect(clears).toBe(1);
    director.update(899, 3);
    expect(spawned).toHaveLength(8);
    director.update(1, 3);
    expect(director.currentPhase).toBe('TELEGRAPH');
    expect(director.currentPattern).toBe('returnable_burst');
    expect(spawned).toHaveLength(8);
    director.update(549, 3);
    expect(spawned).toHaveLength(8);
    director.update(1, 3);
    expect(director.currentPhase).toBe('ACTIVE');
    expect(spawned.length).toBeGreaterThan(8);
    expect(spawned.slice(8).some((projectile) => projectile.kind === 'returnable')).toBe(true);
    expect(phases).toEqual([
      'TELEGRAPH',
      'ACTIVE',
      'RECOVERY',
      'TELEGRAPH',
      'ACTIVE',
    ]);
  });
});
