import Phaser from 'phaser';
import type { GameSessionSnapshot } from '../../state/GameSession';
import { BOOST_PALETTE, BOOST_PALETTE_CSS, COMBAT_CSS, PALETTE, PALETTE_CSS } from '../../theme/palette';
import { BOSS_MAX_HP, ENERGY_MAX, ROUND_DURATION_MS } from '../constants';
import type { BattleViewportLayout } from '../systems/ViewportLayout';

export class Hud {
  private readonly hearts: Phaser.GameObjects.Text;
  private readonly bossName: Phaser.GameObjects.Text;
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly energyBar: Phaser.GameObjects.Graphics;
  private readonly energyBoostGlow: Phaser.GameObjects.Graphics;
  private readonly energyBoostFx: Phaser.GameObjects.Graphics;
  private readonly energyLabel: Phaser.GameObjects.Text;
  private readonly energyBoostTag: Phaser.GameObjects.Text;
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
  private boostTarget = false;
  private boostIntensity = 0;
  private boostTime = 0;
  private boostReduced = false;
  private lastDrawnIntensity = -1;

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
    this.energyBoostGlow = scene.add.graphics().setDepth(99);
    this.energyBar = scene.add.graphics().setDepth(100);
    this.energyBoostFx = scene.add.graphics().setDepth(101);
    this.energyLabel = scene.add.text(26, 874, 'FEEL NOTHING', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: '800',
      color: PALETTE_CSS.green
    }).setDepth(101);
    this.energyBoostTag = scene.add.text(26, 874, '⚡ NEURAL BOOST', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: '900',
      color: BOOST_PALETTE_CSS.cyan
    }).setDepth(101).setAlpha(0);
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

  setBoostActive(active: boolean): void {
    this.boostTarget = active;
  }

  setVisualQualityReduced(reduced: boolean): void {
    this.boostReduced = reduced;
  }

  update(snapshot: GameSessionSnapshot, neutral: number | null, boostActive?: boolean, deltaMs?: number): void {
    if (typeof boostActive === 'boolean') this.boostTarget = boostActive;
    const dt = deltaMs != null && Number.isFinite(deltaMs) ? Math.max(0, Math.min(deltaMs, 50)) : 16;
    this.boostTime += dt * (this.boostTarget ? 1 : 0.55);
    const target = this.boostTarget ? 1 : 0;
    const k = this.boostTarget ? 7.5 : 5.2;
    const lerp = 1 - Math.exp(-k * (dt / 1000));
    this.boostIntensity += (target - this.boostIntensity) * lerp;
    this.boostIntensity = Math.max(0, Math.min(1, this.boostIntensity));

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
    const intensityQuant = Math.round(this.boostIntensity * 20);
    const needsBarRedraw = energyPixels !== this.lastEnergyPixels || intensityQuant !== this.lastDrawnIntensity;
    if (needsBarRedraw) {
      this.energyRatio = energyRatio;
      this.lastEnergyPixels = energyPixels;
      this.lastDrawnIntensity = intensityQuant;
      this.drawEnergyBar(energyRatio);
    }
    if (this.boostIntensity > 0.015) {
      this.drawBoostGlow(energyRatio);
      this.drawBoostFx(energyRatio);
    } else {
      this.energyBoostGlow.clear();
      this.energyBoostFx.clear();
    }
    this.updateBoostLabels();

    const bossBarNeedsRefresh = false;
    void bossBarNeedsRefresh;
  }

  tick(deltaMs: number): void {
    const dt = Math.max(0, Math.min(deltaMs, 50));
    this.boostTime += dt * (this.boostTarget ? 1 : 0.55);
    const target = this.boostTarget ? 1 : 0;
    const k = this.boostTarget ? 7.5 : 5.2;
    const lerp = 1 - Math.exp(-k * (dt / 1000));
    this.boostIntensity += (target - this.boostIntensity) * lerp;
    this.boostIntensity = Math.max(0, Math.min(1, this.boostIntensity));
    if (this.boostIntensity > 0.015) {
      this.drawBoostGlow(this.energyRatio);
      this.drawBoostFx(this.energyRatio);
    } else {
      this.energyBoostGlow.clear();
      this.energyBoostFx.clear();
    }
    this.updateBoostLabels();
    if (Math.round(this.boostIntensity * 20) !== this.lastDrawnIntensity) {
      this.lastDrawnIntensity = Math.round(this.boostIntensity * 20);
      this.drawEnergyBar(this.energyRatio);
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
    this.energyBoostTag.setPosition(left + 25, bottom - 102);
    this.neutralLabel.setPosition(right - 26, bottom - 53);
    this.stateLabel.setPosition(view.centerX, bottom - 114);
    this.toast.setPosition(view.centerX, view.centerY + 40);
    this.drawBossBar(this.bossRatio);
    this.drawEnergyBar(this.energyRatio);
    if (this.boostIntensity > 0.015) {
      this.drawBoostGlow(this.energyRatio);
      this.drawBoostFx(this.energyRatio);
    }
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
    const intensity = this.boostIntensity;
    this.energyBar.clear();
    this.energyBar.fillStyle(0x0a0c0a, 0.95).fillRoundedRect(x, y, width, 31, 16);
    const borderColor = intensity > 0.5 ? BOOST_PALETTE.cyan : intensity > 0.12 ? BOOST_PALETTE.blue : PALETTE.green;
    const borderAlpha = intensity > 0.01 ? 0.85 + 0.15 * intensity : 1;
    const borderWidth = intensity > 0.35 ? 2.5 : 2;
    this.energyBar.lineStyle(borderWidth, borderColor, borderAlpha).strokeRoundedRect(x, y, width, 31, 16);
    if (ratio > 0) {
      const fillW = Math.max(8, (width - 12) * ratio);
      if (intensity > 0.015) {
        const glowAlpha = 0.95;
        this.energyBar.fillStyle(BOOST_PALETTE.blue, glowAlpha).fillRoundedRect(x + 6, y + 6, fillW, 19, 10);
        const highlightH = 9;
        const highlightAlpha = 0.92 * intensity + 0.08;
        this.energyBar.fillStyle(BOOST_PALETTE.cyan, highlightAlpha).fillRoundedRect(x + 6, y + 7, fillW, highlightH, 5);
        this.energyBar.fillStyle(BOOST_PALETTE.spark, 0.78 * intensity).fillRoundedRect(x + 6, y + 7, fillW, 2.5, 1.5);
        const shimmerW = Math.max(18, Math.min(fillW * 0.34, 86));
        const shimmerOffset = (this.boostTime * 0.16) % (fillW + shimmerW + 40) - shimmerW;
        const sx = x + 6 + shimmerOffset;
        this.energyBar.fillStyle(0xffffff, 0.16 * intensity).fillRoundedRect(sx, y + 6, shimmerW, 19, 10);
      } else {
        this.energyBar.fillStyle(PALETTE.green, 1).fillRoundedRect(x + 6, y + 6, fillW, 19, 10);
      }
    }
    const labelBoost = intensity > 0.22;
    this.energyLabel.setColor(ratio >= 1 ? PALETTE_CSS.white : labelBoost ? BOOST_PALETTE_CSS.cyan : PALETTE_CSS.green);
    if (labelBoost) {
      const pulse = 1 + 0.035 * Math.sin(this.boostTime * 0.012);
      this.energyLabel.setScale(pulse);
    } else {
      this.energyLabel.setScale(1);
    }
  }

  private drawBoostGlow(ratio: number): void {
    const x = this.energyBarX;
    const y = this.energyBarY;
    const width = 314;
    const intensity = this.boostIntensity;
    this.energyBoostGlow.clear();
    if (intensity < 0.015) return;
    const pulse = 0.72 + 0.28 * Math.sin(this.boostTime * 0.007);
    const outerAlpha = 0.18 * intensity * pulse;
    const strokeAlpha = 0.42 * intensity * (0.75 + 0.25 * Math.sin(this.boostTime * 0.011));
    this.energyBoostGlow.fillStyle(BOOST_PALETTE.blue, outerAlpha).fillRoundedRect(x - 5, y - 5, width + 10, 41, 19);
    this.energyBoostGlow.lineStyle(3.5, BOOST_PALETTE.cyan, strokeAlpha).strokeRoundedRect(x - 3, y - 3, width + 6, 37, 18);
    if (ratio > 0.02) {
      const fillW = (width - 12) * ratio;
      const sparkleAlpha = 0.5 * intensity * (0.6 + 0.4 * Math.sin(this.boostTime * 0.018));
      this.energyBoostGlow.fillStyle(BOOST_PALETTE.spark, sparkleAlpha * 0.14).fillRoundedRect(x + 6, y + 6, fillW, 19, 10);
    }
    const flicker = Math.sin(this.boostTime * 0.032) > 0.65 ? 1 : 0;
    if (flicker && intensity > 0.55) {
      this.energyBoostGlow.lineStyle(1.2, BOOST_PALETTE.spark, 0.55 * intensity).strokeRoundedRect(x - 1, y - 1, width + 2, 33, 17);
    }
  }

  private drawBoostFx(ratio: number): void {
    const x = this.energyBarX;
    const y = this.energyBarY;
    const width = 314;
    const intensity = this.boostIntensity;
    this.energyBoostFx.clear();
    if (intensity < 0.02) return;
    if (ratio <= 0.001) return;
    const fillW = (width - 12) * ratio;
    const left = x + 6;
    const top = y + 6;
    const height = 19;
    const centerY = top + height / 2;
    const particleCount = this.boostReduced ? 5 : 12;
    const flowSpeed = 0.17;
    const stripeOffset = (this.boostTime * flowSpeed) % 34;
    this.energyBoostFx.lineStyle(2, BOOST_PALETTE.spark, 0);
    const stripeAlpha = 0.52 * intensity;
    for (let i = -1; i < 10; i += 1) {
      const baseX = left - 18 + i * 34 + stripeOffset;
      if (baseX + 14 < left || baseX > left + fillW) continue;
      const x0 = Math.max(baseX, left);
      const x1 = Math.min(baseX + 13, left + fillW);
      if (x1 - x0 < 2) continue;
      this.energyBoostFx.lineStyle(2.2, BOOST_PALETTE.spark, stripeAlpha * 0.55);
      this.energyBoostFx.lineBetween(x0, top + 2, x1 - 6, top + height - 2);
      this.energyBoostFx.lineStyle(1.1, 0xffffff, stripeAlpha * 0.72);
      this.energyBoostFx.lineBetween(x0 + 1.5, top + 3, x1 - 5, top + height - 3);
    }
    for (let i = 0; i < particleCount; i += 1) {
      const speedJitter = 0.9 + (i % 3) * 0.18 + (i % 5) * 0.04;
      const spacing = fillW / particleCount;
      const phase = (this.boostTime * 0.11 * speedJitter + i * spacing * 1.35) % (fillW + 18) - 9;
      const px = left + phase;
      if (px < left - 4 || px > left + fillW + 4) continue;
      const wobble = Math.sin(this.boostTime * 0.015 + i * 1.7) * 4.2;
      const py = centerY + wobble * 0.55 + (i % 2 === 0 ? -1.2 : 1.2);
      const clampedY = Math.max(top + 4, Math.min(top + height - 4, py));
      const size = i % 3 === 0 ? 3.2 : i % 3 === 1 ? 2.3 : 1.6;
      const alpha = (0.92 - (i % 4) * 0.12) * intensity;
      const tailLen = 10 + (i % 3) * 4;
      const tailX = px - tailLen * 0.85;
      const tailAlpha = alpha * 0.32;
      if (tailX < left + fillW && px > left) {
        const tx0 = Math.max(tailX, left);
        const tx1 = Math.min(px, left + fillW);
        this.energyBoostFx.lineStyle(2, BOOST_PALETTE.cyan, tailAlpha);
        this.energyBoostFx.lineBetween(tx0, clampedY, tx1, clampedY);
        this.energyBoostFx.lineStyle(1, BOOST_PALETTE.spark, tailAlpha * 1.2);
        this.energyBoostFx.lineBetween(tx0 + 1, clampedY, tx1, clampedY);
      }
      this.energyBoostFx.fillStyle(BOOST_PALETTE.spark, alpha).fillCircle(px, clampedY, size);
      this.energyBoostFx.fillStyle(0xffffff, alpha * 0.95).fillCircle(px - 0.6, clampedY - 0.6, size * 0.45);
      if (i % 4 === 0 && intensity > 0.45) {
        this.energyBoostFx.fillStyle(BOOST_PALETTE.cyan, alpha * 0.35).fillCircle(px, clampedY, size + 2.2);
      }
    }
    if (intensity > 0.42 && fillW > 48) {
      const boltPhase = Math.floor(this.boostTime / 110) % 3;
      const shouldBolt = boltPhase !== 1 || Math.sin(this.boostTime * 0.021) > -0.2;
      if (shouldBolt) {
        const boltAlpha = 0.88 * intensity * (0.68 + 0.32 * Math.sin(this.boostTime * 0.027));
        const bx = left + fillW * (0.32 + 0.42 * ((Math.sin(this.boostTime * 0.004) * 0.5 + 0.5)));
        const boltW = 22;
        const boltH = 7;
        this.energyBoostFx.lineStyle(1.6, BOOST_PALETTE.spark, boltAlpha);
        const p0x = Math.max(left + 2, bx - boltW);
        const p0y = centerY - boltH;
        const p1x = bx - 4;
        const p1y = centerY + 1;
        const p2x = bx + 2;
        const p2y = centerY - 1.5;
        const p3x = Math.min(left + fillW - 2, bx + boltW);
        const p3y = centerY + boltH;
        this.energyBoostFx.lineBetween(p0x, p0y, p1x, p1y);
        this.energyBoostFx.lineBetween(p1x, p1y, p2x, p2y);
        this.energyBoostFx.lineBetween(p2x, p2y, p3x, p3y);
        this.energyBoostFx.lineStyle(1, 0xffffff, boltAlpha * 0.9);
        this.energyBoostFx.lineBetween(p0x + 0.7, p0y + 0.4, p1x + 0.7, p1y + 0.4);
        this.energyBoostFx.fillStyle(BOOST_PALETTE.spark, boltAlpha * 0.9).fillCircle(p1x, p1y, 1.2);
        this.energyBoostFx.fillStyle(BOOST_PALETTE.spark, boltAlpha * 0.9).fillCircle(p2x, p2y, 1.2);
      }
    }
    if (intensity > 0.65) {
      const edgePulse = 0.5 + 0.5 * Math.sin(this.boostTime * 0.016);
      this.energyBoostFx.fillStyle(BOOST_PALETTE.spark, 0.22 * intensity * edgePulse).fillCircle(left + fillW, centerY, 3.5);
      this.energyBoostFx.fillStyle(0xffffff, 0.85 * intensity * edgePulse).fillCircle(left + fillW - 0.7, centerY - 0.6, 1.4);
    }
  }

  private updateBoostLabels(): void {
    const intensity = this.boostIntensity;
    if (intensity > 0.04) {
      const tagAlpha = Math.min(1, (intensity - 0.04) / 0.36);
      const tagPulse = 0.88 + 0.12 * Math.sin(this.boostTime * 0.009);
      this.energyBoostTag.setAlpha(tagAlpha * tagPulse);
      this.energyBoostTag.setScale(1 + 0.04 * Math.sin(this.boostTime * 0.011));
      this.energyBoostTag.setColor(BOOST_PALETTE_CSS.cyan);
      const flicker = Math.sin(this.boostTime * 0.04) > 0.82 && intensity > 0.6;
      if (flicker) this.energyBoostTag.setColor(BOOST_PALETTE_CSS.spark);
    } else {
      this.energyBoostTag.setAlpha(0);
    }
    if (intensity > 0.28) {
      const neutralPulse = 1 + 0.045 * Math.sin(this.boostTime * 0.013);
      this.neutralLabel.setScale(neutralPulse);
      this.neutralLabel.setColor(BOOST_PALETTE_CSS.cyan);
      if (intensity > 0.68) {
        const spark = -0.3 + 0.6 * Math.sin(this.boostTime * 0.028);
        if (spark > 0.35) this.neutralLabel.setColor(BOOST_PALETTE_CSS.spark);
      }
    } else if (intensity > 0.01) {
      const t = intensity / 0.28;
      const r = Math.round(0x91 + (0x3b - 0x91) * t);
      const g = Math.round(0xd5 + (0xa8 - 0xd5) * t);
      const b = Math.round(0x00 + (0xff - 0x00) * t);
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      this.neutralLabel.setColor(hex);
      this.neutralLabel.setScale(1);
    } else {
      this.neutralLabel.setColor(PALETTE_CSS.green);
      this.neutralLabel.setScale(1);
    }
  }
}
