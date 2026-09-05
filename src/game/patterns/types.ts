import type Phaser from 'phaser';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import type { SeededRng } from '../../utils/rng';
import type { Noxcat } from '../entities/Noxcat';

export type AttackIntensity = 1 | 2 | 3;

/**
 * The complete deterministic input shared by every attack pattern.
 *
 * `scene` and `player` are the live battle objects injected by BattleScene.
 * Patterns snapshot any geometry they author at ACTIVE start and must not use
 * Math.random(), which keeps their timelines reproducible in tests and replays.
 */
export interface AttackPatternContext {
  readonly scene: Phaser.Scene;
  readonly rng: SeededRng;
  readonly intensity: AttackIntensity;
  /** Time available to emit this wave, excluding telegraph and recovery. */
  readonly durationMs: number;
  readonly player: Noxcat;
  readonly projectiles: ProjectileSystem;
  readonly speedScale: number;
  readonly waveIndex: number;
  /** BossDNA 專為註解交叉火力產生的短句。 */
  readonly commentLines?: readonly string[];
}

/** A live pattern timeline owned and advanced by AttackDirector. */
export interface AttackPatternHandle {
  readonly cancelled: boolean;
  readonly finished: boolean;
  update(deltaMs: number): void;
  /** Permanently discards all emissions that have not fired yet. */
  cancel(): void;
}

export interface ScheduledPatternEvent {
  readonly atMs: number;
  readonly emit: () => void;
}

/** 保留尾張文件的接近與離場時間；短波次只壓縮發射間隔，不刪掉尾段。 */
export function fitEmissionTimes(
  times: readonly number[],
  durationMs: number,
  tailMs: number,
): number[] {
  const last = Math.max(0, ...times);
  const available = Math.max(0, durationMs - tailMs);
  const scale = last > 0 ? Math.min(1, available / last) : 1;
  return times.map((time) => Math.round(time * scale));
}

/**
 * Builds a clock-independent, cancellable timeline. Due-at-zero events fire
 * immediately; later events advance only when AttackDirector advances ACTIVE.
 */
export function createPatternTimeline(
  durationMs: number,
  events: readonly ScheduledPatternEvent[],
): AttackPatternHandle {
  const orderedEvents = events
    .map((event, order) => ({ ...event, order }))
    .sort((left, right) => left.atMs - right.atMs || left.order - right.order);
  let elapsedMs = 0;
  let nextEventIndex = 0;
  let cancelled = false;
  let finished = false;

  const emitDueEvents = (): void => {
    while (!cancelled && nextEventIndex < orderedEvents.length) {
      const event = orderedEvents[nextEventIndex];
      if (!event || event.atMs > elapsedMs) break;
      nextEventIndex += 1;
      event.emit();
    }
    if (nextEventIndex >= orderedEvents.length) finished = true;
  };

  const handle: AttackPatternHandle = {
    get cancelled() {
      return cancelled;
    },
    get finished() {
      return finished;
    },
    update(deltaMs: number) {
      if (cancelled || finished || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
      elapsedMs = Math.min(Math.max(0, durationMs), elapsedMs + deltaMs);
      emitDueEvents();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      finished = true;
      nextEventIndex = orderedEvents.length;
    },
  };

  emitDueEvents();
  return handle;
}

export function spawnConfigs(
  projectiles: ProjectileSystem,
  configs: readonly Parameters<ProjectileSystem['spawn']>[0][],
): void {
  for (const config of configs) projectiles.spawn(config);
}

/** Creates deterministic front-to-back emissions instead of a flat row. */
export function staggeredSpawnEvents(
  projectiles: ProjectileSystem,
  configs: readonly Parameters<ProjectileSystem['spawn']>[0][],
  intervalMs: number,
  startMs = 0,
): ScheduledPatternEvent[] {
  return configs.map((config, index) => ({
    atMs: startMs + index * intervalMs,
    emit: () => { projectiles.spawn(config); },
  }));
}
