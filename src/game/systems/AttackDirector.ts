import type { BossDNA, PatternId } from '../../ai/bossSchema';
import type { SeededRng } from '../../utils/rng';
import {
  CLOSING_WALL_SAFE_GAP_HALF_HEIGHT,
  spawnClosingWalls,
} from '../patterns/closingWalls';
import {
  COMMENT_SAFE_LANE_HALF_HEIGHT,
  spawnCommentCrossfire,
} from '../patterns/commentCrossfire';
import { spawnDeadlineBeam } from '../patterns/deadlineBeam';
import {
  PAPER_SAFE_LANE_HALF_WIDTH,
  spawnPaperRain,
} from '../patterns/paperRain';
import {
  RETURNABLE_SAFE_LANE_HALF_WIDTH,
  spawnReturnableBurst,
} from '../patterns/returnableBurst';
import { spawnRevisionHoming } from '../patterns/revisionHoming';
import {
  clamp,
  clampPlayerPosition,
  moveTowards,
  type PlayerPosition,
} from '../patterns/fairness';
import type { PacingScale } from './PacingDirector';
import type { ProjectileSystem } from './ProjectileSystem';

export type WavePhase = 'TELEGRAPH' | 'ACTIVE' | 'RECOVERY';

export interface SafeLaneHint {
  axis: 'vertical' | 'horizontal';
  center: number;
  halfWidth: number;
}

const TELEGRAPH_MS: Readonly<Record<PatternId, number>> = {
  paper_rain: 500,
  comment_crossfire: 550,
  deadline_beam: 750,
  closing_walls: 650,
  revision_homing: 650,
  returnable_burst: 550,
};

const RECOVERY_MS: Readonly<Record<PatternId, number>> = {
  paper_rain: 900,
  comment_crossfire: 950,
  deadline_beam: 900,
  closing_walls: 1_100,
  revision_homing: 1_000,
  returnable_burst: 950,
};

export interface AttackDirectorHooks {
  onPatternChanged?: (pattern: PatternId) => void;
  onReturnableTutorial?: () => void;
  onWavePhaseChanged?: (
    phase: WavePhase,
    pattern: PatternId,
    volley: number,
    safeLane?: SafeLaneHint,
  ) => void;
  getPlayerPosition?: () => PlayerPosition;
}

export class AttackDirector {
  private stepIndex = 0;
  private phaseElapsedMs = 0;
  private wavePhase: WavePhase = 'TELEGRAPH';
  private volley = 0;
  private running = false;
  private returnableTutorialShown = false;
  private paperSafeLane = 270;
  private commentSafeLane = 650;
  private returnableSafeLane = 270;
  private wallSafeGap = 650;
  private pacing: PacingScale | null = null;

  constructor(
    private readonly dna: BossDNA,
    private readonly rng: SeededRng,
    private readonly projectiles: ProjectileSystem,
    private readonly hooks: AttackDirectorHooks = {}
  ) {}

  get currentPattern(): PatternId {
    return this.dna.attacks[this.stepIndex]?.pattern ?? 'paper_rain';
  }

  get currentPhase(): WavePhase {
    return this.wavePhase;
  }

  get currentSafeLane(): SafeLaneHint | undefined {
    switch (this.currentPattern) {
      case 'paper_rain':
        return { axis: 'vertical', center: this.paperSafeLane, halfWidth: PAPER_SAFE_LANE_HALF_WIDTH };
      case 'comment_crossfire':
        return { axis: 'horizontal', center: this.commentSafeLane, halfWidth: COMMENT_SAFE_LANE_HALF_HEIGHT };
      case 'closing_walls':
        return { axis: 'horizontal', center: this.wallSafeGap, halfWidth: CLOSING_WALL_SAFE_GAP_HALF_HEIGHT };
      case 'returnable_burst':
        return { axis: 'vertical', center: this.returnableSafeLane, halfWidth: RETURNABLE_SAFE_LANE_HALF_WIDTH };
      default:
        return undefined;
    }
  }

  start(): void {
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
      const step = this.dna.attacks[this.stepIndex];
      if (!step) return;
      const phaseRemainingMs = Math.max(
        0,
        this.phaseDuration(step.pattern, step.durationMs, this.wavePhase) - this.phaseElapsedMs,
      );
      const advanceMs = Math.min(remainingMs, phaseRemainingMs);
      this.phaseElapsedMs += advanceMs;
      remainingMs -= advanceMs;

      if (this.phaseElapsedMs >= this.phaseDuration(step.pattern, step.durationMs, this.wavePhase)) {
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
      this.commentSafeLane = clamp(player?.y ?? this.rng.range(520, 790), 500, 814);
    } else if (this.currentPattern === 'closing_walls') {
      const candidate = this.rng.range(535, 755);
      this.wallSafeGap = player
        ? moveTowards(candidate, clamp(player.y, 535, 805), 42)
        : candidate;
    } else if (this.currentPattern === 'returnable_burst') {
      this.returnableSafeLane = clamp(player?.x ?? this.rng.range(150, 390), 70, 470);
    }
    this.hooks.onPatternChanged?.(this.currentPattern);
    this.hooks.onWavePhaseChanged?.(
      this.wavePhase,
      this.currentPattern,
      this.volley,
      this.currentSafeLane,
    );
  }

  private advanceStep(): void {
    this.stepIndex = (this.stepIndex + 1) % this.dna.attacks.length;
    this.beginStep();
  }

  private phaseDuration(pattern: PatternId, stepDurationMs: number, phase: WavePhase): number {
    const telegraph = TELEGRAPH_MS[pattern];
    const recovery = RECOVERY_MS[pattern];
    if (phase === 'TELEGRAPH') return Math.max(1, Math.round(telegraph * (this.pacing?.telegraphScale ?? 1)));
    if (phase === 'RECOVERY') return Math.max(1, Math.round(recovery * (this.pacing?.recoveryScale ?? 1)));
    const scaledTelegraph = telegraph * (this.pacing?.telegraphScale ?? 1);
    const scaledRecovery = recovery * (this.pacing?.recoveryScale ?? 1);
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
      this.spawnPattern(pattern, intensity, speedScale);
      this.volley += 1;
    } else if (this.wavePhase === 'ACTIVE') {
      this.wavePhase = 'RECOVERY';
      // ACTIVE owns the complete projectile travel window. Clear any slow
      // stragglers now so RECOVERY is a genuine empty breathing interval.
      this.projectiles.clearDangerous(true);
    } else {
      this.advanceStep();
      return;
    }
    this.hooks.onWavePhaseChanged?.(
      this.wavePhase,
      pattern,
      this.volley,
      this.currentSafeLane,
    );
  }

  private spawnPattern(pattern: PatternId, intensity: 1 | 2 | 3, speedScale: number): void {
    const player = this.playerPosition();
    switch (pattern) {
      case 'paper_rain': {
        spawnPaperRain(this.projectiles, this.rng, intensity, speedScale, this.paperSafeLane);
        break;
      }
      case 'comment_crossfire':
        spawnCommentCrossfire(
          this.projectiles,
          this.rng,
          intensity,
          this.volley,
          speedScale,
          { x: player?.x ?? 270, y: this.commentSafeLane },
        );
        break;
      case 'deadline_beam':
        spawnDeadlineBeam(this.projectiles, this.rng, this.pacing?.telegraphScale ?? 1);
        break;
      case 'closing_walls': {
        spawnClosingWalls(
          this.projectiles,
          this.rng,
          intensity,
          speedScale,
          this.wallSafeGap,
        );
        break;
      }
      case 'revision_homing':
        spawnRevisionHoming(this.projectiles, this.rng, intensity, speedScale);
        break;
      case 'returnable_burst': {
        const spawned = spawnReturnableBurst(
          this.projectiles,
          this.rng,
          intensity,
          this.volley,
          speedScale,
          { x: this.returnableSafeLane, y: player?.y ?? 720 },
        );
        if (spawned && !this.returnableTutorialShown) {
          this.returnableTutorialShown = true;
          this.hooks.onReturnableTutorial?.();
        }
        break;
      }
    }
  }

  private playerPosition(): PlayerPosition | undefined {
    try {
      return clampPlayerPosition(this.hooks.getPlayerPosition?.());
    } catch {
      // A presentation hook must never be able to stop deterministic attacks.
      return undefined;
    }
  }
}
