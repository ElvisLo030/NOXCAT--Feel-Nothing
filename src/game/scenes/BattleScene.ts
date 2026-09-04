import Phaser from 'phaser';
import { classifyProjectileContact, GameSession, type GameSessionSnapshot } from '../../state/GameSession';
import { SeededRng } from '../../utils/rng';
import {
  AIM_MAX_PULL,
  AIM_MIN_PULL,
  GAME_HEIGHT,
  GAME_WIDTH,
  LAUNCH_SPEED,
  NEUTRAL_ENERGY_PER_SECOND,
  POST_HIT_RELIEF_MS,
  REFLECT_MIN_SPEED,
  STAGGER_DURATION_MS,
  VULNERABLE_WINDOW_MS,
} from '../constants';
import { DebugOverlay } from '../debug/DebugOverlay';
import { Boss } from '../entities/Boss';
import { Noxcat } from '../entities/Noxcat';
import { BattleState, isTerminalBattleState } from '../events';
import { getBattleRuntime, type BattleFaceSnapshot } from '../runtime';
import { AimGuide } from '../ui/AimGuide';
import { Hud } from '../ui/Hud';
import { AttackDirector, type SafeLaneHint } from '../systems/AttackDirector';
import { AudioSystem } from '../systems/AudioSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import {
  clampToLaunchBoundary,
  crossedLaunchBoundary,
} from '../systems/JellyMotionSystem';

export interface BattleResultDetail {
  won: boolean;
  bossName: string;
  resultLine: string;
  source: 'ai' | 'fallback';
  grade: 'S' | 'A' | 'B' | 'C';
  snapshot: GameSessionSnapshot;
}

export class BattleScene extends Phaser.Scene {
  private readonly session = new GameSession();
  private noxcat!: Noxcat;
  private boss!: Boss;
  private hud!: Hud;
  private aimGuide!: AimGuide;
  private projectiles!: ProjectileSystem;
  private director!: AttackDirector;
  private audio!: AudioSystem;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private debug?: DebugOverlay;
  private waveGuide!: Phaser.GameObjects.Graphics;
  private dragging = false;
  private activePointerId: number | null = null;
  private aimAnchor = new Phaser.Math.Vector2();
  private aimPointer = new Phaser.Math.Vector2();
  private aimPull = 0;
  private focusPaused = false;
  private pauseResumeTimer?: Phaser.Time.TimerEvent;
  private touchLandscapeQuery?: MediaQueryList;
  private ended = false;
  private firstEnergyTutorial = true;
  private neutralScore: number | null = null;
  private faceSnapshot: BattleFaceSnapshot | null = null;
  private lastFaceTimestamp = -1;
  private hitReliefTimer?: Phaser.Time.TimerEvent;
  private lowFpsClock = 0;
  private lowQuality = false;
  private vulnerableRemainingMs = 0;
  private combatTimeScale = 1;
  private presentationTimeMs = 0;
  private readonly awardedBeams = new Set<number>();

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const runtime = getBattleRuntime();
    this.drawBackground();
    this.waveGuide = this.add.graphics().setDepth(-4).setAlpha(0);
    this.boss = new Boss(this, runtime.boss.bossName, runtime.boss.weakPointLabel);
    this.noxcat = new Noxcat(this);
    this.noxcat.setGogglesVisible(runtime.gogglesVisible);
    this.projectiles = new ProjectileSystem(this);
    this.hud = new Hud(this, runtime.boss.bossName);
    this.aimGuide = new AimGuide(this);
    this.audio = new AudioSystem();
    this.audio.setEnabled(runtime.soundEnabled);
    this.director = new AttackDirector(runtime.boss, new SeededRng(runtime.boss.seed), this.projectiles, {
      onPatternChanged: (pattern) => {
        if (this.debug) this.hud.setStateMessage(pattern.replaceAll('_', ' ').toUpperCase());
      },
      onReturnableTutorial: () => this.hud.flash('↻ 高速撞回去！', 1500),
      getPlayerPosition: () => ({ x: this.noxcat.x, y: this.noxcat.y }),
      onWavePhaseChanged: (phase, _pattern, volley, safeLane) => {
        if (phase === 'TELEGRAPH') {
          this.showSafeLane(safeLane);
          this.hud.setStateMessage('READ THE LANE');
          this.hud.flash(volley === 0 ? '↔ 拖曳到亮線安全區' : '⚠ WAVE INCOMING', 700);
        } else if (phase === 'ACTIVE') {
          this.fadeSafeLane();
          this.hud.setStateMessage('DODGE');
        } else {
          this.hideSafeLane();
          this.hud.setStateMessage('CLEAR');
        }
      },
    });

    this.setupInput();
    this.setupVisibilityHandling();
    this.showIntro(runtime.boss.bossName, runtime.boss.openingLine, runtime.source);
    this.setupDebug();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  update(_time: number, deltaMs: number): void {
    if (this.focusPaused || this.ended) return;
    const delta = Math.min(deltaMs, 50);
    const dt = delta / 1000;
    const runtime = getBattleRuntime();
    const face = runtime.faceProvider();

    this.updateKeyboard(dt);
    this.presentationTimeMs += delta * this.combatTimeScale;
    this.noxcat.updateMotion(dt * this.combatTimeScale);
    this.boss.pulse(this.presentationTimeMs);

    if (this.session.state !== BattleState.INTRO && !isTerminalBattleState(this.session.state)) {
      this.session.advanceTime(delta);
      this.updateVulnerabilityWindow(delta);
      this.updateNeutral(face, dt);
      this.handleCollisions(delta);
      this.projectiles.update(dt, this.noxcat, this.combatTimeScale);
      if (this.session.state === BattleState.DODGING) {
        this.director.update(delta, this.session.lives);
        if (this.session.energy >= 100 && this.director.currentPhase === 'RECOVERY') {
          this.openVulnerability();
        }
      }
      if (this.session.state === BattleState.LAUNCHED) this.updateLaunch();
    }

    this.hud.update(this.session.snapshot(), this.neutralScore);
    this.debug?.update(
      this.session,
      this.noxcat,
      this.game.loop.actualFps,
      `${this.director.currentPattern}/${this.director.currentPhase}`,
      this.faceSnapshot,
      this.projectiles,
      this.director.currentSafeLane,
    );
    this.adjustQuality(delta);

    if (isTerminalBattleState(this.session.state)) this.finishBattle();
  }

  private drawBackground(): void {
    const background = this.add.graphics().setDepth(-20);
    background.fillGradientStyle(0x070a08, 0x070a08, 0x121b0d, 0x070a08, 1);
    background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    background.lineStyle(1, 0x97ba22, 0.11);
    for (let y = 420; y < 890; y += 46) {
      const perspective = (y - 390) / 520;
      background.lineBetween(0, y, GAME_WIDTH, y + perspective * 8);
    }
    for (let x = -250; x <= 790; x += 80) background.lineBetween(270, 385, x, 900);
    background.fillStyle(0xd7ff32, 0.035).fillEllipse(270, 450, 510, 560);

    const vignette = this.add.graphics().setDepth(90).setAlpha(0.12);
    vignette.lineStyle(46, 0x000000, 1).strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  private showSafeLane(hint?: SafeLaneHint): void {
    this.tweens.killTweensOf(this.waveGuide);
    this.waveGuide.clear().setAlpha(0);
    if (!hint) return;

    this.waveGuide.fillStyle(0xd7ff32, 0.1);
    this.waveGuide.lineStyle(2, 0xd7ff32, 0.5);
    if (hint.axis === 'vertical') {
      const left = Phaser.Math.Clamp(hint.center - hint.halfWidth, 22, GAME_WIDTH - 22);
      const right = Phaser.Math.Clamp(hint.center + hint.halfWidth, 22, GAME_WIDTH - 22);
      this.waveGuide.fillRect(left, 402, right - left, 492);
      for (let y = 410; y < 894; y += 28) {
        this.waveGuide.lineBetween(left, y, left, Math.min(y + 14, 894));
        this.waveGuide.lineBetween(right, y, right, Math.min(y + 14, 894));
      }
    } else {
      const top = Phaser.Math.Clamp(hint.center - hint.halfWidth, 402, 894);
      const bottom = Phaser.Math.Clamp(hint.center + hint.halfWidth, 402, 894);
      this.waveGuide.fillRect(22, top, GAME_WIDTH - 44, bottom - top);
      for (let x = 24; x < GAME_WIDTH - 22; x += 28) {
        this.waveGuide.lineBetween(x, top, Math.min(x + 14, GAME_WIDTH - 22), top);
        this.waveGuide.lineBetween(x, bottom, Math.min(x + 14, GAME_WIDTH - 22), bottom);
      }
    }
    this.tweens.add({ targets: this.waveGuide, alpha: 1, duration: 140, ease: 'Quad.Out' });
  }

  private fadeSafeLane(): void {
    this.tweens.killTweensOf(this.waveGuide);
    this.tweens.add({
      targets: this.waveGuide,
      // Keep the promised route faintly visible for the whole volley. This is
      // especially important on a phone where the finger covers nearby cards.
      alpha: 0.24,
      duration: 320,
      ease: 'Quad.Out',
    });
  }

  private hideSafeLane(): void {
    this.tweens.killTweensOf(this.waveGuide);
    this.waveGuide.clear().setAlpha(0);
  }

  private showIntro(name: string, line: string, source: 'ai' | 'fallback'): void {
    this.boss.setScale(0.72).setAlpha(0);
    this.tweens.add({ targets: this.boss, alpha: 1, scale: 1, duration: 650, ease: 'Back.Out' });
    const title = this.add.text(270, 425, name, {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '30px',
      fontStyle: '900',
      color: '#f4f7f2',
      stroke: '#000000',
      strokeThickness: 5,
      align: 'center',
      wordWrap: { width: 470 }
    }).setOrigin(0.5).setDepth(120);
    const quote = this.add.text(270, 474, `「${line}」`, {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '18px',
      color: '#d7ff32',
      align: 'center',
      wordWrap: { width: 450 }
    }).setOrigin(0.5).setDepth(120);
    const badge = this.add.text(270, 520, source === 'ai' ? 'AI BOSS DNA COMPILED' : 'LOCAL BOSS DNA READY', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#071008',
      backgroundColor: '#d7ff32',
      padding: { x: 9, y: 5 }
    }).setOrigin(0.5).setDepth(120);
    this.time.delayedCall(1_850, () => {
      this.tweens.add({
        targets: [title, quote, badge],
        alpha: 0,
        y: '-=12',
        duration: 220,
        onComplete: () => {
          title.destroy();
          quote.destroy();
          badge.destroy();
        }
      });
      this.session.startBattle();
      this.director.start();
    });
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      void this.audio.unlock();
      if (this.focusPaused || this.activePointerId !== null) return;
      if (this.session.state === BattleState.VULNERABLE) {
        const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.noxcat.x, this.noxcat.y);
        if (distance <= 86 && this.session.beginAim()) {
          this.activePointerId = pointer.id;
          this.dragging = false;
          this.aimAnchor.set(this.noxcat.x, this.noxcat.y);
          this.aimPointer.set(pointer.x, pointer.y);
          this.noxcat.beginAim();
          this.audio.play('draw');
        }
        return;
      }
      if (this.session.state === BattleState.DODGING) {
        this.activePointerId = pointer.id;
        this.dragging = true;
        this.noxcat.beginDrag();
        this.noxcat.setPointerTarget(pointer.x, pointer.y);
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.activePointerId) return;
      if (this.session.state === BattleState.AIMING) {
        this.aimPointer.set(pointer.x, pointer.y);
        this.aimPull = this.noxcat.updateAim(pointer.x, pointer.y, this.aimAnchor.x, this.aimAnchor.y);
        this.aimGuide.show(this.aimAnchor.x, this.aimAnchor.y, pointer.x, pointer.y);
      } else if (this.dragging && this.session.state === BattleState.DODGING) {
        this.noxcat.setPointerTarget(pointer.x, pointer.y);
      }
    });
    const releasePointer = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id !== this.activePointerId) return;
      this.activePointerId = null;
      const releasedDodge = this.dragging && this.session.state === BattleState.DODGING;
      this.dragging = false;
      if (releasedDodge) this.noxcat.releaseDrag();
      if (this.session.state !== BattleState.AIMING) return;
      this.aimGuide.hide();
      const pullVector = this.aimAnchor.clone().subtract(this.aimPointer);
      const launched = this.session.releaseAim(this.aimPull);
      if (!launched || this.aimPull < AIM_MIN_PULL || pullVector.lengthSq() === 0) {
        this.noxcat.cancelAim(this.aimAnchor.x, this.aimAnchor.y);
        this.hud.setStateMessage('PULL FARTHER');
        this.time.delayedCall(650, () => this.hud.setStateMessage('DO EVERYTHING'));
        return;
      }
      const speed = LAUNCH_SPEED * Phaser.Math.Clamp(this.aimPull / AIM_MAX_PULL, 0.62, 1);
      this.clearVulnerabilityWindow();
      this.setCombatTimeScale(1);
      this.noxcat.launch(pullVector, speed);
      this.boss.setWeakPointVisible(true);
      this.hud.setStateMessage('');
      this.audio.play('launch');
    };
    this.input.on('pointerup', releasePointer);
    this.input.on('pointerupoutside', releasePointer);

    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown', () => void this.audio.unlock());
      this.wasd = this.input.keyboard.addKeys('W,S,A,D') as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };
    }
  }

  private updateKeyboard(dt: number): void {
    if (this.session.state !== BattleState.DODGING) return;
    const dx = Number(Boolean(this.cursors?.right.isDown || this.wasd?.right.isDown))
      - Number(Boolean(this.cursors?.left.isDown || this.wasd?.left.isDown));
    const dy = Number(Boolean(this.cursors?.down.isDown || this.wasd?.down.isDown))
      - Number(Boolean(this.cursors?.up.isDown || this.wasd?.up.isDown));
    if (dx !== 0 || dy !== 0) this.noxcat.nudgeTarget(dx, dy, dt);
  }

  private handleCollisions(deltaMs: number): void {
    for (const projectile of this.projectiles.activeProjectiles()) {
      if (projectile.friendly) {
        const bossDistance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.boss.x, this.boss.y - 13);
        if (bossDistance <= projectile.radius + 42) {
          const hp = this.session.applyReflectedBossHit();
          this.boss.setHp(hp);
          this.boss.hitFeedback(false);
          this.audio.play('bossHit');
          projectile.recycle();
        }
        continue;
      }
      if (
        this.session.state !== BattleState.DODGING
        || !projectile.isDamage
        || !projectile.collisionActive
      ) continue;
      const distance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.noxcat.x, this.noxcat.y);
      if (projectile.reflectable && this.noxcat.speed >= REFLECT_MIN_SPEED && distance <= projectile.radius + this.noxcat.hitRadius) {
        projectile.reflectTowards(this.boss.x, this.boss.y - 13);
        this.hud.flash('RETURN TO SENDER', 650);
        this.audio.play('reflect');
        continue;
      }
      const contact = classifyProjectileContact(distance, projectile.radius);
      if (contact === 'graze' && this.session.registerGraze(projectile)) {
        this.showGraze(projectile.x, projectile.y);
        this.audio.play('graze');
      } else if (contact === 'hit' && this.session.takePlayerHit(this.session.elapsedMs)) {
        projectile.recycle();
        this.noxcat.hitFeedback();
        this.audio.play('hurt');
        this.hud.flash('FEEL THAT?', 650);
        this.beginPostHitRelief();
      }
    }

    for (const beam of this.projectiles.activeBeams()) {
      if (beam.telegraphMs > 0) continue;
      if (beam.activeMs <= deltaMs + 18 && !beam.hitPlayer && !this.awardedBeams.has(beam.id)) {
        this.awardedBeams.add(beam.id);
        this.session.registerPerfectWave();
        this.hud.flash('PERFECT WAVE +12', 700);
      }
      const collides = Math.abs(this.noxcat.y - beam.y) <= this.noxcat.hitRadius + beam.height / 2;
      if (collides && !beam.hitPlayer && this.session.state === BattleState.DODGING) {
        beam.hitPlayer = true;
        if (this.session.takePlayerHit(this.session.elapsedMs)) {
          this.noxcat.hitFeedback();
          this.audio.play('hurt');
          this.beginPostHitRelief();
        }
      }
    }
  }

  private showGraze(x: number, y: number): void {
    const ring = this.add.circle(x, y, 14).setStrokeStyle(3, 0xd7ff32, 0.8).setDepth(25);
    this.tweens.add({
      targets: ring,
      radius: 46,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy()
    });
  }

  private openVulnerability(): void {
    if (!this.session.openVulnerability()) return;
    this.hitReliefTimer?.remove(false);
    this.hitReliefTimer = undefined;
    this.director.cancelCurrent();
    this.boss.setWeakPointVisible(true);
    this.vulnerableRemainingMs = VULNERABLE_WINDOW_MS;
    this.setCombatTimeScale(0.55);
    this.audio.play('full');
    this.hud.setStateMessage('DO EVERYTHING');
    if (this.firstEnergyTutorial) {
      this.firstEnergyTutorial = false;
      this.hud.flash('按住果凍貓・向後拉・放開！', 2_200);
    }
  }

  private updateLaunch(): void {
    const bossDistance = Phaser.Math.Distance.Between(this.noxcat.x, this.noxcat.y, this.boss.x, this.boss.y - 13);
    if (bossDistance <= 68) {
      this.resolveMajorHit();
      return;
    }
    if (crossedLaunchBoundary(this.noxcat)) {
      const bouncePoint = clampToLaunchBoundary(this.noxcat);
      this.noxcat.setPosition(bouncePoint.x, bouncePoint.y);
      this.clearVulnerabilityWindow();
      this.setCombatTimeScale(1);
      this.session.resolveLaunch(false);
      this.boss.setWeakPointVisible(false);
      this.noxcat.startReturn(GAME_WIDTH / 2, GAME_HEIGHT * 0.77);
      this.director.resume(true);
      this.hud.flash('MISS — ENERGY 30', 850);
    }
  }

  private resolveMajorHit(): void {
    if (this.session.state !== BattleState.LAUNCHED) return;
    this.clearVulnerabilityWindow();
    this.setCombatTimeScale(1);
    this.session.resolveLaunch(true);
    this.boss.setHp(this.session.bossHp);
    this.boss.hitFeedback(true);
    this.audio.play('bossHit');
    navigator.vibrate?.(20);
    this.noxcat.setPosition(this.boss.x, this.boss.y - 13);
    this.noxcat.beginImpact();
    const won = this.session.bossHp <= 0;
    this.hud.setStateMessage(won ? 'FEEL NOTHING' : 'BOSS STAGGERED');
    this.time.delayedCall(220, () => this.noxcat.startReturn(GAME_WIDTH / 2, GAME_HEIGHT * 0.77));
    if (won) return;
    this.time.delayedCall(STAGGER_DURATION_MS, () => {
      if (this.session.endStagger()) {
        this.boss.setWeakPointVisible(false);
        this.director.resume(true);
        this.hud.setStateMessage('');
      }
    });
  }

  private updateVulnerabilityWindow(deltaMs: number): void {
    if (this.vulnerableRemainingMs <= 0) return;
    if (this.session.state !== BattleState.VULNERABLE && this.session.state !== BattleState.AIMING) {
      this.clearVulnerabilityWindow();
      return;
    }
    this.vulnerableRemainingMs = Math.max(0, this.vulnerableRemainingMs - deltaMs);
    if (this.vulnerableRemainingMs > 0) return;

    if (this.session.state === BattleState.AIMING) this.cancelPointerInteraction();
    if (!this.session.expireVulnerability()) return;
    this.boss.setWeakPointVisible(false);
    this.setCombatTimeScale(1);
    this.director.resume(true);
    if (this.focusPaused) this.director.pause();
    this.hud.setStateMessage('');
    this.hud.flash('WINDOW CLOSED', 650);
  }

  private clearVulnerabilityWindow(): void {
    this.vulnerableRemainingMs = 0;
  }

  private setCombatTimeScale(scale: number): void {
    this.combatTimeScale = scale;
    this.tweens.timeScale = scale;
  }

  private updateNeutral(face: BattleFaceSnapshot | null, dt: number): void {
    const now = performance.now();
    const current = face != null && now - face.timestampMs <= 500 ? face : null;
    this.faceSnapshot = current;
    this.neutralScore = current?.neutral ?? null;
    const isNewInference = current != null && current.timestampMs !== this.lastFaceTimestamp;
    if (isNewInference) {
      this.lastFaceTimestamp = current.timestampMs;
      this.session.recordNeutralScore(current.neutral);
      if (current.activityDetected) this.hud.flash('FEEL DETECTED', 600);
    }
    if (current?.bonusEligible && this.session.state === BattleState.DODGING) {
      this.session.addEnergy(NEUTRAL_ENERGY_PER_SECOND * dt);
    }
  }

  private beginPostHitRelief(): void {
    this.director.pause();
    this.projectiles.clearDangerous(true);
    this.hitReliefTimer?.remove(false);
    this.hitReliefTimer = this.time.delayedCall(POST_HIT_RELIEF_MS, () => {
      this.hitReliefTimer = undefined;
      if (!this.ended && !this.focusPaused && this.session.state === BattleState.DODGING) {
        this.director.resume(false);
      }
    });
  }

  private adjustQuality(deltaMs: number): void {
    if (this.game.loop.actualFps < 45) this.lowFpsClock += deltaMs;
    else this.lowFpsClock = Math.max(0, this.lowFpsClock - deltaMs * 0.5);
    if (!this.lowQuality && this.lowFpsClock > 2_000) {
      this.lowQuality = true;
      this.noxcat.setGhostQuality(5);
      this.projectiles.setVisualQuality(true);
    }
  }

  private setupVisibilityHandling(): void {
    const touchLandscapeQuery = window.matchMedia(
      '(orientation: landscape) and (max-height: 600px) and (hover: none) and (pointer: coarse)',
    );
    this.touchLandscapeQuery = touchLandscapeQuery;
    const syncPause = (): void => {
      if (this.ended || !this.scene.isActive()) return;
      const shouldPause = document.hidden || touchLandscapeQuery.matches;
      if (shouldPause) {
        this.pauseResumeTimer?.remove(false);
        this.pauseResumeTimer = undefined;
        if (!this.focusPaused) this.cancelPointerInteraction();
        this.focusPaused = true;
        this.director.pause();
        this.hud.setStateMessage('PAUSED');
      } else if (this.focusPaused && !this.pauseResumeTimer) {
        this.hud.setStateMessage('READY…');
        this.pauseResumeTimer = this.time.delayedCall(1_000, () => {
          this.pauseResumeTimer = undefined;
          if (document.hidden || touchLandscapeQuery.matches || this.ended) return;
          this.focusPaused = false;
          if (this.session.state === BattleState.DODGING && !this.hitReliefTimer) {
            this.director.resume(false);
          }
          this.hud.setStateMessage('');
        });
      }
    };
    document.addEventListener('visibilitychange', syncPause);
    window.addEventListener('resize', syncPause, { passive: true });
    window.addEventListener('orientationchange', syncPause, { passive: true });
    touchLandscapeQuery.addEventListener('change', syncPause);
    this.registry.set('pauseHandler', syncPause);
    syncPause();
  }

  private cancelPointerInteraction(): void {
    this.activePointerId = null;
    if (this.dragging) {
      this.dragging = false;
      this.noxcat.cancelDrag();
    }
    if (this.session.state !== BattleState.AIMING) return;
    this.aimGuide.hide();
    this.session.releaseAim(0);
    this.noxcat.cancelAim(this.aimAnchor.x, this.aimAnchor.y);
    this.aimPull = 0;
  }

  private setupDebug(): void {
    const params = new URLSearchParams(location.search);
    const debugEnabled = import.meta.env.DEV || params.get('debug') === '1';
    // Screenshot automation is a local-development convenience, not a
    // production cheat surface. The documented `?debug=1` demo diagnostics
    // remain available in production, but `?capture=1` must never expose the
    // hidden state-mutating hook from a built deployment.
    const captureEnabled = import.meta.env.DEV && params.get('capture') === '1';
    if (!debugEnabled && !captureEnabled) return;
    const actions = {
      fillEnergy: (): void => {
        this.session.setEnergyForDebug(100);
        this.openVulnerability();
      },
      openWeakPoint: (): void => {
        this.session.setEnergyForDebug(100);
        this.openVulnerability();
        this.boss.setWeakPointVisible(true);
      },
      damageBoss: (): void => this.forceMajorHit(),
      spawnReflectable: (): void => {
        this.projectiles.spawn({ kind: 'returnable', x: this.noxcat.x, y: this.noxcat.y - 170, vx: 0, vy: 185, radius: 22, rotationSpeed: 4 });
      },
      pauseAttacksForVisualTest: (): void => {
        this.director.pause();
        this.projectiles.clearDangerous(true);
      },
      toggleHitboxes: (): void => this.debug?.toggleHitboxes()
    };
    if (debugEnabled && !captureEnabled) this.debug = new DebugOverlay(this, getBattleRuntime().boss, actions);
    window.__NOXCAT_TEST__ = {
      ...actions,
      snapshot: () => this.session.snapshot(),
      visualSnapshot: () => this.noxcat.visualSnapshot(),
      waveSnapshot: () => {
        const activeProjectiles = this.projectiles.activeProjectiles();
        const activeBeams = this.projectiles.activeBeams();
        return {
          phase: this.director.currentPhase,
          pattern: this.director.currentPattern,
          activeProjectileCount: activeProjectiles.length,
          activeDangerous: activeProjectiles.filter((projectile) => (
            projectile.isDamage && !projectile.friendly
          )).length + activeBeams.filter((beam) => beam.telegraphMs <= 0 && beam.activeMs > 0).length,
          safeLane: this.director.currentSafeLane ?? null,
          combatTimeScale: this.combatTimeScale,
          vulnerableRemainingMs: this.vulnerableRemainingMs,
          weakPointTweenCount: this.boss.weakPointTweenCount,
        };
      },
      projectileSnapshot: () => this.projectiles.activeProjectiles().map((projectile) => ({
        x: projectile.x,
        y: projectile.y,
        radius: projectile.radius,
        isDamage: projectile.isDamage,
        hasGrazedPlayer: projectile.hasGrazedPlayer,
        kind: projectile.kind,
        tunnelDepth: projectile.tunnelDepth,
        collisionActive: projectile.collisionActive,
      })),
    };
  }

  private forceMajorHit(): void {
    if (isTerminalBattleState(this.session.state)) return;
    if (this.session.state === BattleState.DODGING) {
      this.session.setEnergyForDebug(100);
      this.openVulnerability();
    }
    if (this.session.state === BattleState.VULNERABLE) this.session.beginAim();
    if (this.session.state === BattleState.AIMING) this.session.releaseAim(AIM_MIN_PULL + 1);
    if (this.session.state === BattleState.LAUNCHED) {
      this.resolveMajorHit();
      // The debug hook keeps automated runs deterministic even when a headless
      // WebKit page heavily throttles animation frames.
      if (this.session.snapshot().state === BattleState.STAGGERED && this.session.endStagger()) {
        this.boss.setWeakPointVisible(false);
        this.director.resume(true);
        this.hud.setStateMessage('');
      }
    }
  }

  private finishBattle(): void {
    if (this.ended) return;
    this.ended = true;
    this.hitReliefTimer?.remove(false);
    this.hitReliefTimer = undefined;
    this.clearVulnerabilityWindow();
    this.setCombatTimeScale(1);
    this.director.pause();
    this.projectiles.clearDangerous(true);
    this.boss.setWeakPointVisible(false);
    const won = this.session.state === BattleState.WON;
    this.audio.play(won ? 'win' : 'lose');
    this.hud.setStateMessage(won ? 'BOSS DEFEATED' : 'NOXCAT OVERLOADED');
    const snapshot = this.session.snapshot();
    const detail: BattleResultDetail = {
      won,
      bossName: getBattleRuntime().boss.bossName,
      resultLine: getBattleRuntime().boss.resultLine,
      source: getBattleRuntime().source,
      grade: calculateGrade(snapshot, won),
      snapshot
    };
    const resultDelay = window.__NOXCAT_TEST__ ? 100 : 900;
    this.time.delayedCall(resultDelay, () => window.dispatchEvent(new CustomEvent<BattleResultDetail>('noxcat:battle-result', { detail })));
  }

  private cleanup(): void {
    const pauseHandler = this.registry.get('pauseHandler') as EventListener | undefined;
    if (pauseHandler) {
      document.removeEventListener('visibilitychange', pauseHandler);
      window.removeEventListener('resize', pauseHandler);
      window.removeEventListener('orientationchange', pauseHandler);
      this.touchLandscapeQuery?.removeEventListener('change', pauseHandler);
    }
    this.touchLandscapeQuery = undefined;
    this.pauseResumeTimer?.remove(false);
    this.hitReliefTimer?.remove(false);
    this.clearVulnerabilityWindow();
    this.projectiles?.destroy();
    this.audio?.close();
    delete window.__NOXCAT_TEST__;
  }
}

function calculateGrade(snapshot: GameSessionSnapshot, won: boolean): 'S' | 'A' | 'B' | 'C' {
  if (!won) return snapshot.mainAttackHits >= 2 ? 'B' : 'C';
  const seconds = snapshot.elapsedMs / 1000;
  const score = 100 - seconds * 0.65 + snapshot.grazeCount * 1.8 + snapshot.reflectCount * 4 + snapshot.lives * 6;
  if (score >= 102) return 'S';
  if (score >= 82) return 'A';
  if (score >= 62) return 'B';
  return 'C';
}
