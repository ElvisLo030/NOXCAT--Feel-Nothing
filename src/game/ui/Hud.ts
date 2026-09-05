import Phaser from 'phaser';
import type { GameSessionSnapshot } from '../../state/GameSession';
import { COMBAT_CSS, PALETTE, PALETTE_CSS } from '../../theme/palette';
import { BOSS_MAX_HP, ENERGY_MAX, ROUND_DURATION_MS } from '../constants';
import type { BattleViewportLayout } from '../systems/ViewportLayout';

export class Hud {
  private readonly hearts: Phaser.GameObjects.Text;
  private readonly bossName: Phaser.GameObjects.Text;
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly energyBar: Phaser.GameObjects.Graphics;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly neutralLabel: Phaser.GameObjects.Text;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly toast: Phaser.GameObjects.Text;
  private readonly stateLabel: Phaser.GameObjects.Text;
  private bossBarX = 99;
  private bossBarY = 66;
  private energyBarX = 25;
  private energyBarY = 901;
  private bossRatio = 1;
  private energyRatio = 0;
  private lastLives = -1;
  private lastSeconds = -1;
  private lastNeutralText = '';
  private lastBossPixels = -1;
  private lastEnergyPixels = -1;

  constructor(scene: Phaser.Scene, bossName: string) {
    this.hearts = scene.add.text(25, 24, '♥ ♥ ♥', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '28px',
      color: PALETTE_CSS.green,
      stroke: '#23300d',
      strokeThickness: 2
    }).setDepth(100);
    this.bossName = scene.add.text(270, 36, bossName, {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: '700',
      color: '#f4f7f2',
      align: 'center'
    }).setOrigin(0.5).setDepth(100);
    this.bossBar = scene.add.graphics().setDepth(100);
    this.energyBar = scene.add.graphics().setDepth(100);
    this.energyLabel = scene.add.text(26, 874, 'FEEL NOTHING', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: '800',
      color: PALETTE_CSS.green
    }).setDepth(100);
    this.neutralLabel = scene.add.text(514, 907, 'NEUTRAL --', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: '800',
      color: PALETTE_CSS.green
    }).setOrigin(1, 0.5).setDepth(100);
    this.timer = scene.add.text(505, 27, String(Math.ceil(ROUND_DURATION_MS / 1000)), {
      fontFamily: 'monospace',
      fontSize: '22px',
      fontStyle: '700',
      color: '#f4f7f2'
    }).setOrigin(1, 0).setDepth(100);
    this.toast = scene.add.text(270, 520, '', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: '900',
      color: '#071008',
      backgroundColor: PALETTE_CSS.green,
      padding: { x: 16, y: 8 },
      align: 'center'
    }).setOrigin(0.5).setDepth(130).setAlpha(0);
    this.stateLabel = scene.add.text(270, 846, '', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: '900',
      color: PALETTE_CSS.green
    }).setOrigin(0.5).setDepth(100);
  }

  update(snapshot: GameSessionSnapshot, neutral: number | null): void {
    if (snapshot.lives !== this.lastLives) {
      this.lastLives = snapshot.lives;
      this.hearts.setText(Array.from(
        { length: 3 },
        (_, index) => index < snapshot.lives ? '♥' : '♡',
      ).join(' '));
    }
    const seconds = Math.ceil(snapshot.remainingMs / 1000);
    if (seconds !== this.lastSeconds) {
      this.lastSeconds = seconds;
      this.timer.setText(String(seconds).padStart(2, '0'));
    }
    const neutralText = neutral === null ? 'NEUTRAL --' : `NEUTRAL ${Math.round(neutral)}%`;
    if (neutralText !== this.lastNeutralText) {
      this.lastNeutralText = neutralText;
      this.neutralLabel.setText(neutralText);
    }
    const bossRatio = snapshot.bossHp / BOSS_MAX_HP;
    const bossPixels = Math.round(bossRatio * 334);
    if (bossPixels !== this.lastBossPixels) {
      this.bossRatio = bossRatio;
      this.lastBossPixels = bossPixels;
      this.drawBossBar(bossRatio);
    }
    const energyRatio = snapshot.energy / ENERGY_MAX;
    const energyPixels = Math.round(energyRatio * 302);
    if (energyPixels !== this.lastEnergyPixels) {
      this.energyRatio = energyRatio;
      this.lastEnergyPixels = energyPixels;
      this.drawEnergyBar(energyRatio);
    }
  }

  relayout(view: BattleViewportLayout): void {
    const left = view.left;
    const right = view.right;
    const top = view.top;
    const bottom = view.bottom;
    this.hearts.setPosition(left + 25, top + 24);
    this.bossName.setPosition(view.centerX, top + 36);
    this.timer.setPosition(right - 35, top + 27);
    this.bossBarX = view.centerX - 171;
    this.bossBarY = top + 66;
    this.energyLabel.setPosition(left + 25, bottom - 86);
    this.energyBarX = left + 25;
    this.energyBarY = bottom - 59;
    this.neutralLabel.setPosition(right - 26, bottom - 53);
    this.stateLabel.setPosition(view.centerX, bottom - 114);
    this.toast.setPosition(view.centerX, view.centerY + 40);
    this.drawBossBar(this.bossRatio);
    this.drawEnergyBar(this.energyRatio);
  }

  setStateMessage(message: string, danger = false): void {
    this.stateLabel.setText(message).setColor(danger ? COMBAT_CSS.danger : PALETTE_CSS.green);
  }

  flash(message: string, duration = 1100, danger = false): void {
    this.toast.setText(message).setAlpha(1).setScale(0.82);
    this.toast.setBackgroundColor(danger ? COMBAT_CSS.danger : PALETTE_CSS.green);
    this.toast.scene.tweens.killTweensOf(this.toast);
    this.toast.scene.tweens.add({
      targets: this.toast,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.9, to: 1.05 },
      delay: Math.max(0, duration - 320),
      duration: 320,
      ease: 'Sine.Out'
    });
  }

  clearFlash(): void {
    this.toast.scene.tweens.killTweensOf(this.toast);
    this.toast.setText('').setAlpha(0);
  }

  setBossName(name: string): void {
    this.bossName.setText(name);
  }

  private drawBossBar(ratio: number): void {
    const x = this.bossBarX;
    const y = this.bossBarY;
    const width = 342;
    this.bossBar.clear();
    this.bossBar.fillStyle(0x0a0c0a, 0.95).fillRoundedRect(x, y, width, 19, 10);
    this.bossBar.lineStyle(2, PALETTE.green, 0.9).strokeRoundedRect(x, y, width, 19, 10);
    if (ratio > 0) this.bossBar.fillStyle(PALETTE.green, 1).fillRoundedRect(x + 4, y + 4, (width - 8) * ratio, 11, 6);
  }

  private drawEnergyBar(ratio: number): void {
    const x = this.energyBarX;
    const y = this.energyBarY;
    const width = 314;
    this.energyBar.clear();
    this.energyBar.fillStyle(0x0a0c0a, 0.95).fillRoundedRect(x, y, width, 31, 16);
    this.energyBar.lineStyle(2, PALETTE.green, 1).strokeRoundedRect(x, y, width, 31, 16);
    if (ratio > 0) {
      this.energyBar.fillStyle(PALETTE.green, 1).fillRoundedRect(x + 6, y + 6, Math.max(8, (width - 12) * ratio), 19, 10);
    }
    this.energyLabel.setColor(ratio >= 1 ? PALETTE_CSS.white : PALETTE_CSS.green);
  }
}
