import type Phaser from 'phaser';
import type { AttackStep, PatternId } from '../../ai/bossSchema';
import { SeededRng } from '../../utils/rng';
import { shuffleAttackRound } from '../attackSequence';
import type { Noxcat } from '../entities/Noxcat';
import { PLAYER_MIN_Y, PLAYER_MAX_Y } from '../constants';
import {
  CLOSING_WALL_SAFE_GAP_HALF_HEIGHT,
  runClosingWalls,
} from '../patterns/closingWalls';
import {
  commentCrossfireLayout,
  runCommentCrossfire,
} from '../patterns/commentCrossfire';
import { runDeadlineBeam } from '../patterns/deadlineBeam';
import {
  PAPER_SAFE_LANE_HALF_WIDTH,
  runPaperRain,
} from '../patterns/paperRain';
import {
  RETURNABLE_SAFE_LANE_HALF_WIDTH,
  runReturnableBurst,
} from '../patterns/returnableBurst';
import { runRevisionHoming } from '../patterns/revisionHoming';
import {
  TOP_DOWNPOUR_SAFE_LANE_HALF_WIDTH,
  runTopDownpour,
} from '../patterns/topDownpour';
import {
  PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH,
  runPulseBarrage,
} from '../patterns/pulseBarrage';
import {
  ALTERNATING_ZIPPER_SAFE_LANE_HALF_WIDTH,
  runAlternatingZipper,
} from '../patterns/alternatingZipper';
import {
  clamp,
  clampPlayerPosition,
  moveTowards,
  type PlayerPosition,
} from '../patterns/fairness';
import type {
  AttackPatternContext,
  AttackPatternHandle,
} from '../patterns/types';
import type { PacingScale } from './PacingDirector';
import type { ProjectileSystem } from './ProjectileSystem';
import {
  dangerZonesForPattern,
  type DangerZoneHint,
  type SafeLaneHint,
  type SafeSpotHint,
} from './DangerTelegraph';

export type WavePhase = 'TELEGRAPH' | 'ACTIVE' | 'RECOVERY';

export type { DangerZoneHint, SafeLaneHint } from './DangerTelegraph';

export const ATTACK_TELEGRAPH_MS: Readonly<Record<PatternId, number>> = {
  paper_rain: 500,
  comment_crossfire: 550,
  deadline_beam: 750,
  closing_walls: 650,
  revision_homing: 650,
  returnable_burst: 550,
  top_downpour: 650,
  pulse_barrage: 650,
  alternating_zipper: 600,
};

export const ATTACK_RECOVERY_MS: Readonly<Record<PatternId, number>> = {
  paper_rain: 360,
  comment_crossfire: 400,
  deadline_beam: 420,
  closing_walls: 500,
  revision_homing: 440,
  returnable_burst: 380,
  top_downpour: 400,
  pulse_barrage: 460,
  alternating_zipper: 420,
};

/**
 * Prevents a failed/instantly-cleared spawn from flashing straight through
 * ACTIVE. Normal waves stay active until their final hostile leaves; the
 * returnable wave additionally preserves its authored interaction beat.
 */
export const ATTACK_MIN_ACTIVE_MS: Readonly<Record<PatternId, number>> = {
  paper_rain: 1_200,
  comment_crossfire: 1_100,
  deadline_beam: 520,
  closing_walls: 1_400,
  revision_homing: 1_500,
  returnable_burst: 2_140,
  top_downpour: 1_300,
  pulse_barrage: 2_400,
  alternating_zipper: 2_800,
};

export interface AttackDirectorHooks {
  scene: Phaser.Scene;
  player: Noxcat;
  onPatternChanged?: (pattern: PatternId) => void;
  onReturnableTutorial?: () => void;
  onWavePhaseChanged?: (
    phase: WavePhase,
    pattern: PatternId,
    volley: number,
    safeLane?: SafeLaneHint,
    dangerZones?: readonly DangerZoneHint[],
  ) => void;
  getPlayerPosition?: () => PlayerPosition;
}

export interface AttackSequenceConfig {
  readonly attacks: readonly AttackStep[];
  readonly shuffleSeed?: number;
}

export class AttackDirector {
  private stepIndex = 0;
  private roundAttacks: readonly AttackStep[];
  private readonly orderRng?: SeededRng;
  private phaseElapsedMs = 0;
  private wavePhase: WavePhase = 'TELEGRAPH';
  private volley = 0;
  private running = false;
  private returnableTutorialShown = false;
  private paperSafeLane = 270;
  private commentLayout?: ReturnType<typeof commentCrossfireLayout>;
  private returnableSafeLane = 270;
  private topDownpourSafeLane = 270;
  private pulseBarrageSafeLane = 270;
  private alternatingZipperSafeLane = 270;
  private wallSafeGap = 650;
  private deadlineBeamY = 650;
  private activePattern?: AttackPatternHandle;
  private pacing: PacingScale | null = null;

  constructor(
    private readonly dna: AttackSequenceConfig,
    private readonly rng: SeededRng,
    private readonly projectiles: ProjectileSystem,
    private readonly hooks: AttackDirectorHooks = {} as AttackDirectorHooks,
  ) {
    // 選招與彈幕布局各用獨立 RNG，避免玩家移動或布局抽樣影響下一輪順序。
    this.orderRng = dna.shuffleSeed === undefined ? undefined : new SeededRng(dna.shuffleSeed);
    this.roundAttacks = this.orderRng
      ? shuffleAttackRound(dna.attacks, this.orderRng)
      : dna.attacks;
  }

  get currentPattern(): PatternId {
    return this.roundAttacks[this.stepIndex]?.pattern ?? 'paper_rain';
  }

  get currentPhase(): WavePhase {
    return this.wavePhase;
  }

  get currentSafeLane(): SafeLaneHint | undefined {
    switch (this.currentPattern) {
      case 'paper_rain':
        return { axis: 'vertical', center: this.paperSafeLane, halfWidth: PAPER_SAFE_LANE_HALF_WIDTH };

      case 'closing_walls':
        return { axis: 'horizontal', center: this.wallSafeGap, halfWidth: CLOSING_WALL_SAFE_GAP_HALF_HEIGHT, projection: 'screen' };
      case 'returnable_burst':
        return { axis: 'vertical', center: this.returnableSafeLane, halfWidth: RETURNABLE_SAFE_LANE_HALF_WIDTH };
      case 'top_downpour':
        return {
          axis: 'vertical',
          center: this.topDownpourSafeLane,
          halfWidth: TOP_DOWNPOUR_SAFE_LANE_HALF_WIDTH,
          projection: 'screen',
        };
      case 'pulse_barrage':
        return { axis: 'vertical', center: this.pulseBarrageSafeLane, halfWidth: PULSE_BARRAGE_SAFE_LANE_HALF_WIDTH };
      case 'alternating_zipper':
        return { axis: 'vertical', center: this.alternatingZipperSafeLane, halfWidth: ALTERNATING_ZIPPER_SAFE_LANE_HALF_WIDTH };
      default:
        return undefined;
    }
  }

  get currentSafeSpot(): SafeSpotHint | undefined {
    return this.currentPattern === 'comment_crossfire' ? this.commentLayout?.safeSpot : undefined;
  }

  get currentDangerZones(): readonly DangerZoneHint[] {
    const zones = dangerZonesForPattern(
      this.currentPattern,
      this.currentSafeLane,
      this.playerPosition(),
      this.deadlineBeamY,
    );
    if (this.currentPattern === 'comment_crossfire' && this.commentLayout) {
      zones.push(...this.commentLayout.rays.map((ray) => ray.warning), this.commentLayout.safeSpot);
    }
    return zones;
  }

  start(): void {
    this.cancelPatternTimeline();
    this.running = true;
    this.beginStep();
  }

  pause(): void {
    this.running = false;
  }

  resume(nextPattern = false): void {
    if (nextPattern) this.advanceStep();
    this.running = true;
  }

  cancelCurrent(): void {
    this.running = false;
    this.cancelPatternTimeline();
    this.projectiles.clearDangerous(true);
  }

  setPacingScale(scale: PacingScale | null): void {
    this.pacing = scale;
  }

  get pacingScale(): PacingScale | null {
    return this.pacing;
  }

  update(deltaMs: number, playerLives: number): void {
    if (!this.running || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    let remainingMs = deltaMs;
    // BattleScene normally supplies <=50 ms. The loop also keeps phase timing
    // deterministic if a test or recovering browser supplies one long frame.
    while (remainingMs > 0 && this.running) {
      const step = this.roundAttacks[this.stepIndex];
      if (!step) return;
      if (this.canEnterEarlyRecovery(step.pattern)) {
        this.advanceWavePhase(step.pattern, step.intensity, playerLives);
        continue;
      }
      const phaseAtFrameStart = this.wavePhase;
      const phaseRemainingMs = Math.max(
        0,
        this.phaseDuration(step.pattern, step.durationMs, this.wavePhase) - this.phaseElapsedMs,
      );
      const minActiveRemainingMs = this.wavePhase === 'ACTIVE'
        ? Math.max(0, ATTACK_MIN_ACTIVE_MS[step.pattern] - this.phaseElapsedMs)
        : Number.POSITIVE_INFINITY;
      const advanceMs = Math.min(
        remainingMs,
        phaseRemainingMs,
        minActiveRemainingMs > 0 ? minActiveRemainingMs : Number.POSITIVE_INFINITY,
      );
      this.phaseElapsedMs += advanceMs;
      remainingMs -= advanceMs;
      if (phaseAtFrameStart === 'ACTIVE') this.activePattern?.update(advanceMs);

      if (this.phaseElapsedMs >= this.phaseDuration(step.pattern, step.durationMs, this.wavePhase)) {
        this.advanceWavePhase(step.pattern, step.intensity, playerLives);
        continue;
      }
      if (this.canEnterEarlyRecovery(step.pattern)) {
        this.advanceWavePhase(step.pattern, step.intensity, playerLives);
        continue;
      }
      // All durations are positive; this is defensive against a future bad
      // timing table causing a zero-progress loop.
      if (advanceMs <= 0) return;
    }
  }

  private beginStep(): void {
    this.phaseElapsedMs = 0;
    this.wavePhase = 'TELEGRAPH';
    const player = this.playerPosition();
    if (this.currentPattern === 'paper_rain') {
      const candidate = this.rng.range(90, 450);
      this.paperSafeLane = player
        ? moveTowards(candidate, clamp(player.x, 90, 450), 54)
        : candidate;
    } else if (this.currentPattern === 'comment_crossfire') {
      // 隨機組合在預警開始時決定，發射時沿用，避免箭頭與實際方向不符。
      this.commentLayout = commentCrossfireLayout(this.rng, this.roundAttacks[this.stepIndex]!.intensity);
    } else if (this.currentPattern === 'closing_walls') {
      const maximumGapY = PLAYER_MAX_Y - CLOSING_WALL_SAFE_GAP_HALF_HEIGHT;
      const candidate = this.rng.range(PLAYER_MIN_Y, maximumGapY);
      this.wallSafeGap = player
        ? moveTowards(candidate, clamp(player.y, PLAYER_MIN_Y, maximumGapY), 42)
        : candidate;
    } else if (this.currentPattern === 'returnable_burst') {
      this.returnableSafeLane = clamp(player?.x ?? this.rng.range(150, 390), 70, 470);
    } else if (this.currentPattern === 'top_downpour') {
      const candidate = this.rng.range(100, 440);
      this.topDownpourSafeLane = player
        ? moveTowards(candidate, clamp(player.x, 100, 440), 64)
        : candidate;
    } else if (this.currentPattern === 'pulse_barrage') {
      const candidate = this.rng.range(100, 440);
      this.pulseBarrageSafeLane = player
        ? moveTowards(candidate, clamp(player.x, 100, 440), 58)
        : candidate;
    } else if (this.currentPattern === 'alternating_zipper') {
      const candidate = this.rng.range(100, 440);
      this.alternatingZipperSafeLane = player
        ? moveTowards(candidate, clamp(player.x, 100, 440), 58)
        : candidate;
    } else if (this.currentPattern === 'deadline_beam') {
      this.deadlineBeamY = this.rng.range(PLAYER_MIN_Y + 24, PLAYER_MAX_Y - 24);
    }
    this.hooks.onPatternChanged?.(this.currentPattern);
    this.hooks.onWavePhaseChanged?.(
      this.wavePhase,
      this.currentPattern,
      this.volley,
      this.currentSafeLane,
      this.currentDangerZones,
    );
  }

  private advanceStep(): void {
    this.cancelPatternTimeline();
    const previousPattern = this.currentPattern;
    this.stepIndex += 1;
    if (this.stepIndex >= this.roundAttacks.length) {
      this.roundAttacks = this.orderRng
        ? shuffleAttackRound(this.dna.attacks, this.orderRng, previousPattern)
        : this.dna.attacks;
      this.stepIndex = 0;
    }
    this.beginStep();
  }

  private phaseDuration(pattern: PatternId, stepDurationMs: number, phase: WavePhase): number {
    const telegraph = ATTACK_TELEGRAPH_MS[pattern];
    const recovery = ATTACK_RECOVERY_MS[pattern];
    const isBeam = pattern === 'deadline_beam';
    const telegraphScale = isBeam ? 1 : (this.pacing?.telegraphScale ?? 1);
    const recoveryScale = isBeam ? 1 : (this.pacing?.recoveryScale ?? 1);
    if (phase === 'TELEGRAPH') return Math.max(500, Math.round(telegraph * telegraphScale));
    if (phase === 'RECOVERY') return Math.max(1, Math.round(recovery * recoveryScale));
    const scaledTelegraph = Math.max(500, Math.round(telegraph * telegraphScale));
    const scaledRecovery = recovery * recoveryScale;
    return Math.max(1, Math.round(stepDurationMs - scaledTelegraph - scaledRecovery));
  }

  private advanceWavePhase(
    pattern: PatternId,
    intensity: 1 | 2 | 3,
    playerLives: number,
  ): void {
    this.phaseElapsedMs = 0;
    if (this.wavePhase === 'TELEGRAPH') {
      this.wavePhase = 'ACTIVE';
      const baseLifeScale = playerLives <= 1 ? 0.87 : 1;
      const pacingSpeed = this.pacing?.speedScale ?? 1;
      const speedScale = baseLifeScale * pacingSpeed;
      this.activePattern = this.startPattern(pattern, intensity, speedScale);
      this.volley += 1;
    } else if (this.wavePhase === 'ACTIVE') {
      this.wavePhase = 'RECOVERY';
      this.cancelPatternTimeline();
      // Stop gameplay ownership, but let each card preserve its perspective
      // momentum and leave beyond the viewport on its own. Emergency clears
      // (hit / vulnerability / cancellation) still use the explicit fade.
      this.projectiles.releaseDangerousForExit();
    } else {
      this.advanceStep();
      return;
    }
    this.hooks.onWavePhaseChanged?.(
      this.wavePhase,
      pattern,
      this.volley,
      this.currentSafeLane,
      this.currentDangerZones,
    );
  }

  private startPattern(
    pattern: PatternId,
    intensity: 1 | 2 | 3,
    speedScale: number,
  ): AttackPatternHandle {
    const step = this.roundAttacks[this.stepIndex];
    const context: AttackPatternContext = {
      scene: this.hooks.scene,
      rng: this.rng,
      intensity,
      durationMs: this.phaseDuration(pattern, step?.durationMs ?? 4_500, 'ACTIVE'),
      player: this.hooks.player,
      projectiles: this.projectiles,
      speedScale,
      waveIndex: this.volley,
    };
    switch (pattern) {
      case 'paper_rain': {
        return runPaperRain(
          { ...context, speedScale: context.speedScale * 1.15 },
          this.paperSafeLane,
        );
      }
      case 'comment_crossfire':
        return runCommentCrossfire(context, this.commentLayout);
      case 'deadline_beam':
        return runDeadlineBeam(context, this.deadlineBeamY);
      case 'closing_walls': {
        return runClosingWalls(
          context,
          this.wallSafeGap,
          (safeGapY) => { this.wallSafeGap = safeGapY; },
        );
      }
      case 'revision_homing':
        return runRevisionHoming(context);
      case 'returnable_burst': {
        return runReturnableBurst(
          context,
          this.returnableSafeLane,
          () => {
            if (this.returnableTutorialShown) return;
            this.returnableTutorialShown = true;
            this.hooks.onReturnableTutorial?.();
          },
        );
      }
      case 'top_downpour':
        return runTopDownpour(context, this.topDownpourSafeLane);
      case 'pulse_barrage':
        return runPulseBarrage(context, this.pulseBarrageSafeLane);
      case 'alternating_zipper':
        return runAlternatingZipper(context, this.alternatingZipperSafeLane);
    }
  }

  private cancelPatternTimeline(): void {
    this.activePattern?.cancel();
    this.activePattern = undefined;
  }

  private canEnterEarlyRecovery(pattern: PatternId): boolean {
    if (this.wavePhase !== 'ACTIVE'
      || this.phaseElapsedMs < ATTACK_MIN_ACTIVE_MS[pattern]
      || !this.activePattern?.finished) {
      return false;
    }
    const hostileProjectile = this.projectiles.activeProjectiles().some((projectile) => (
      projectile.isDamage && !projectile.friendly
    ));
    // A warning beam is still a scheduled threat even before its damaging
    // segment begins, so retain the wave until the beam object is exhausted.
    const hostileBeam = this.projectiles.activeBeams().some((beam) => (
      beam.telegraphMs > 0 || beam.activeMs > 0
    ));
    return !hostileProjectile && !hostileBeam;
  }

  private playerPosition(): PlayerPosition | undefined {
    let position: PlayerPosition | undefined;
    try {
      position = this.hooks.getPlayerPosition?.();
    } catch {
      // A presentation hook must never be able to stop deterministic attacks.
    }
    const livePlayer = this.hooks.player;
    return clampPlayerPosition(position ?? (livePlayer ? {
      x: livePlayer.x,
      y: livePlayer.y,
    } : undefined));
  }
}
