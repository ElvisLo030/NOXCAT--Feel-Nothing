import Phaser from 'phaser';
import type { BossDNA } from '../../ai/bossSchema';
import type { BattleFaceSnapshot } from '../runtime';
import type { Noxcat } from '../entities/Noxcat';
import type { GameSession } from '../../state/GameSession';
import type { SafeLaneHint } from '../systems/AttackDirector';
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

  constructor(
    scene: Phaser.Scene,
    private readonly dna: BossDNA,
    actions: DebugActions
  ) {
    this.info = scene.add.text(8, 100, '', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#d7ff32',
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
      scene.add.text(8 + index * 81, 188, label, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#071008',
        backgroundColor: '#d7ff32',
        padding: { x: 5, y: 4 }
      }).setInteractive({ useHandCursor: true }).setDepth(300).on('pointerdown', action);
    });
    this.dnaText = scene.add.text(8, 219, JSON.stringify(dna, null, 2), {
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
  ): void {
    const baseline = face?.baseline;
    const rawNeutral = face?.rawNeutral;
    const smoothedNeutral = face?.neutral;
    this.info.setText([
      `FPS ${fps.toFixed(0)} | ${session.state} | ${pattern}`,
      `HP ${session.bossHp} | EN ${session.energy.toFixed(1)} | L ${session.lives}`,
      `VEL ${noxcat.speed.toFixed(0)} | SCALE ${noxcat.visual.scaleX.toFixed(2)},${noxcat.visual.scaleY.toFixed(2)}`,
      `NEU RAW ${rawNeutral == null ? '--' : rawNeutral.toFixed(0)} | EMA ${smoothedNeutral == null ? '--' : smoothedNeutral.toFixed(1)}`,
      `BASE ${baseline == null ? '--' : `${baseline.smile.toFixed(2)}/${baseline.jawOpen.toFixed(2)}/${baseline.browUp.toFixed(2)}/${baseline.eyeWide.toFixed(2)}`}`,
      `FACE ${face == null ? '--' : `${face.mode} ${face.inferenceMs.toFixed(1)}ms`} | ${face?.faceFound ? 'FOUND' : 'LOST'}`,
      `SEED ${this.dna.seed}`
    ]);
    this.hitboxGraphics.clear();
    if (!this.showHitboxes) return;
    if (safeLane?.axis === 'vertical') {
      this.hitboxGraphics.lineStyle(2, 0x53c7ff, 0.72).strokeRect(
        safeLane.center - safeLane.halfWidth,
        402,
        safeLane.halfWidth * 2,
        492,
      );
    } else if (safeLane) {
      this.hitboxGraphics.lineStyle(2, 0x53c7ff, 0.72).strokeRect(
        22,
        safeLane.center - safeLane.halfWidth,
        496,
        safeLane.halfWidth * 2,
      );
    }
    for (const projectile of projectiles.activeProjectiles()) {
      const colour = projectile.friendly ? 0x53c7ff : projectile.isDamage ? 0xff5c7a : 0xffffff;
      this.hitboxGraphics.lineStyle(2, colour, 0.8)
        .strokeCircle(projectile.x, projectile.y, projectile.radius)
        .lineBetween(
          projectile.x,
          projectile.y,
          projectile.x + projectile.vx * 0.22,
          projectile.y + projectile.vy * 0.22,
        );
    }
    for (const beam of projectiles.activeBeams()) {
      this.hitboxGraphics.lineStyle(2, beam.telegraphMs > 0 ? 0xd7ff32 : 0xff5c7a, 0.8)
        .strokeRect(0, beam.y - beam.height / 2, 540, beam.height);
    }
    this.hitboxGraphics.lineStyle(2, 0xff5c7a, 0.9).strokeCircle(noxcat.x, noxcat.y, 18);
    this.hitboxGraphics.lineStyle(2, 0xd7ff32, 0.65).strokeCircle(noxcat.x, noxcat.y, 43);
  }
}
