import Phaser from 'phaser';
import type { GameSessionSnapshot } from '../../state/GameSession';
import { BOSS_MAX_HP, ENERGY_MAX } from '../constants';

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

  constructor(scene: Phaser.Scene, bossName: string) {
    this.hearts = scene.add.text(25, 24, '♥ ♥ ♥', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '28px',
      color: '#d7ff32',
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
      color: '#d7ff32'
    }).setDepth(100);
    this.neutralLabel = scene.add.text(514, 907, 'NEUTRAL --', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: '800',
      color: '#d7ff32'
    }).setOrigin(1, 0.5).setDepth(100);
    this.timer = scene.add.text(505, 27, '75', {
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
      backgroundColor: '#d7ff32',
      padding: { x: 16, y: 8 },
      align: 'center'
    }).setOrigin(0.5).setDepth(130).setAlpha(0);
    this.stateLabel = scene.add.text(270, 846, '', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '22px',
      fontStyle: '900',
      color: '#d7ff32'
    }).setOrigin(0.5).setDepth(100);
  }

  update(snapshot: GameSessionSnapshot, neutral: number | null): void {
    this.hearts.setText(Array.from({ length: 3 }, (_, index) => index < snapshot.lives ? '♥' : '♡').join(' '));
    this.timer.setText(String(Math.ceil(snapshot.remainingMs / 1000)).padStart(2, '0'));
    this.neutralLabel.setText(neutral === null ? 'NEUTRAL --' : `NEUTRAL ${Math.round(neutral)}%`);
    this.drawBossBar(snapshot.bossHp / BOSS_MAX_HP);
    this.drawEnergyBar(snapshot.energy / ENERGY_MAX);
  }

  setStateMessage(message: string): void {
    this.stateLabel.setText(message);
  }

  flash(message: string, duration = 1100): void {
    this.toast.setText(message).setAlpha(1).setScale(0.82);
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

  setBossName(name: string): void {
    this.bossName.setText(name);
  }

  private drawBossBar(ratio: number): void {
    const x = 99;
    const y = 66;
    const width = 342;
    this.bossBar.clear();
    this.bossBar.fillStyle(0x0a0c0a, 0.95).fillRoundedRect(x, y, width, 19, 10);
    this.bossBar.lineStyle(2, 0xd7ff32, 0.9).strokeRoundedRect(x, y, width, 19, 10);
    if (ratio > 0) this.bossBar.fillStyle(0xd7ff32, 1).fillRoundedRect(x + 4, y + 4, (width - 8) * ratio, 11, 6);
  }

  private drawEnergyBar(ratio: number): void {
    const x = 25;
    const y = 901;
    const width = 314;
    this.energyBar.clear();
    this.energyBar.fillStyle(0x0a0c0a, 0.95).fillRoundedRect(x, y, width, 31, 16);
    this.energyBar.lineStyle(2, 0xd7ff32, 1).strokeRoundedRect(x, y, width, 31, 16);
    if (ratio > 0) {
      this.energyBar.fillStyle(0xd7ff32, 1).fillRoundedRect(x + 6, y + 6, Math.max(8, (width - 12) * ratio), 19, 10);
    }
    this.energyLabel.setColor(ratio >= 1 ? '#ffffff' : '#d7ff32');
  }
}
