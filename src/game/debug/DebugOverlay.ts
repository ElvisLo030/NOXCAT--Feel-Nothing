import Phaser from 'phaser';
import { PALETTE, PALETTE_CSS } from '../../theme/palette';
import type { BossDNA } from '../../ai/bossSchema';
import type { BossSource } from '../../ai/bossClient';
import type { BattleFaceSnapshot } from '../runtime';
import type { Noxcat } from '../entities/Noxcat';
import type { GameSession } from '../../state/GameSession';
import type { SafeLaneHint } from '../systems/AttackDirector';
import type { PacingScale } from '../systems/PacingDirector';
import type { ProjectileSystem } from '../systems/ProjectileSystem';

export interface DebugActions {
  fillEnergy: () => void;
  openWeakPoint: () => void;
  damageBoss: () => void;
  spawnReflectable: () => void;
  toggleHitboxes: () => void;
}

export class DebugOverlay {
  private readonly info: Phaser.GameObjects.Text;
  private readonly dnaText: Phaser.GameObjects.Text;
  private readonly hitboxGraphics: Phaser.GameObjects.Graphics;
  private showDna = false;
  private showHitboxes = false;
  private nextInfoUpdateMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly dna: BossDNA,
    private readonly source: BossSource,
    actions: DebugActions
  ) {
    this.info = scene.add.text(8, 100, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: PALETTE_CSS.green,
      backgroundColor: 'rgba(0,0,0,.68)',
      padding: { x: 5, y: 4 }
    }).setDepth(300);
    const controls = [
      ['FILL', actions.fillEnergy],
      ['OPEN', actions.openWeakPoint],
      ['DMG', actions.damageBoss],
      ['REFLECT', actions.spawnReflectable],
      ['HITBOX', actions.toggleHitboxes],
      ['DNA', () => { this.showDna = !this.showDna; this.dnaText.setVisible(this.showDna); }]
    ] as const;
    controls.forEach(([label, action], index) => {
      scene.add.text(8 + index * 81, 258, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#071008',
        backgroundColor: PALETTE_CSS.green,
        padding: { x: 5, y: 4 }
      }).setInteractive({ useHandCursor: true }).setDepth(300).on('pointerdown', action);
    });
    this.dnaText = scene.add.text(8, 289, JSON.stringify(dna, null, 2), {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#f4f7f2',
      backgroundColor: 'rgba(0,0,0,.82)',
      padding: { x: 6, y: 6 },
      wordWrap: { width: 390 }
    }).setDepth(300).setVisible(false);
    this.hitboxGraphics = scene.add.graphics().setDepth(290);
  }

  toggleHitboxes(): void {
    this.showHitboxes = !this.showHitboxes;
    if (!this.showHitboxes) this.hitboxGraphics.clear();
  }

  update(
    session: GameSession,
    noxcat: Noxcat,
    fps: number,
    pattern: string,
    face: BattleFaceSnapshot | null,
    projectiles: ProjectileSystem,
    safeLane?: SafeLaneHint,
    pacing?: PacingScale | null,
  ): void {
    const now = this.info.scene.time.now;
    if (now >= this.nextInfoUpdateMs) {
      this.nextInfoUpdateMs = now + 125;
      const baseline = face?.baseline;
      const rawNeutral = face?.rawNeutral;
      const smoothedNeutral = face?.neutral;
      const transitionHistory = session.transitions.slice(-4);
      const latestTransition = transitionHistory.at(-1);
      const transitionPath = transitionHistory.length === 0
        ? '--'
        : [transitionHistory[0]?.from, ...transitionHistory.map(({ to }) => to)].join('>');
      this.info.setText([
        `FPS ${fps.toFixed(0)} | ${session.state} | ${pattern}`,
        `HP ${session.bossHp} | EN ${session.energy.toFixed(1)} | L ${session.lives}`,
        `VEL ${noxcat.speed.toFixed(0)} | SCALE ${noxcat.visual.scaleX.toFixed(2)},${noxcat.visual.scaleY.toFixed(2)}`,
        `NEU RAW ${rawNeutral == null ? '--' : rawNeutral.toFixed(0)} | EMA ${smoothedNeutral == null ? '--' : smoothedNeutral.toFixed(1)}`,
        `BASE ${baseline == null ? '--' : `${baseline.smile.toFixed(2)}/${baseline.jawOpen.toFixed(2)}/${baseline.browUp.toFixed(2)}/${baseline.eyeWide.toFixed(2)}`}`,
        `FACE ${face == null ? '--' : `${face.mode} ${face.inferenceMs.toFixed(1)}ms`} | ${face?.faceFound ? 'FOUND' : 'LOST'}`,
        `PACE U${pacing == null ? '--' : pacing.urgency.toFixed(2)} R${pacing == null ? '--' : pacing.relief.toFixed(2)} SPD ${pacing == null ? '--' : pacing.speedScale.toFixed(2)} TEL ${pacing == null ? '--' : pacing.telegraphScale.toFixed(2)} REC ${pacing == null ? '--' : pacing.recoveryScale.toFixed(2)}`,
        `SEED ${this.dna.seed} | SOURCE ${this.source.toUpperCase()}`,
        `TX PATH ${transitionPath}`,
        `TX LAST ${latestTransition == null ? '--' : `${latestTransition.reason ?? 'unspecified'} @${(latestTransition.elapsedMs / 1000).toFixed(1)}s`}`,
      ]);
    }
    this.hitboxGraphics.clear();
    if (!this.showHitboxes) return;
    if (safeLane?.axis === 'vertical') {
      this.hitboxGraphics.lineStyle(2, PALETTE.green, 0.72).strokeRect(
        safeLane.center - safeLane.halfWidth,
        402,
        safeLane.halfWidth * 2,
        492,
      );
    } else if (safeLane) {
      this.hitboxGraphics.lineStyle(2, PALETTE.green, 0.72).strokeRect(
        22,
        safeLane.center - safeLane.halfWidth,
        496,
        safeLane.halfWidth * 2,
      );
    }
    for (const projectile of projectiles.activeProjectiles()) {
      // Far-depth cards are visual-only until they reach contact depth. Do
      // not draw a fake collider at their authored simulation coordinate.
      if (!projectile.collisionActive) continue;
      const colour = projectile.friendly ? PALETTE.green : projectile.isDamage ? PALETTE.midGray : PALETTE.white;
      const polygon = projectile.collisionPolygon;
      this.hitboxGraphics.lineStyle(2, colour, 0.8)
        .strokePoints([...polygon, polygon[0]!], true)
        .lineBetween(
          projectile.collisionCenterX,
          projectile.collisionCenterY,
          projectile.collisionCenterX + projectile.vx * 0.22,
          projectile.collisionCenterY + projectile.vy * 0.22,
        );
    }
    for (const beam of projectiles.activeBeams()) {
      this.hitboxGraphics.lineStyle(2, beam.telegraphMs > 0 ? PALETTE.green : PALETTE.midGray, 0.8)
        .strokeRect(0, beam.y - beam.height / 2, 540, beam.height);
    }
    const noxcatPolygon = noxcat.collisionPolygon();
    this.hitboxGraphics.lineStyle(2, PALETTE.white, 0.9)
      .strokePoints([...noxcatPolygon, noxcatPolygon[0]!], true);
  }
}
