import Phaser from 'phaser';
import type { Noxcat } from '../entities/Noxcat';
import { Projectile, type ProjectileConfig } from '../entities/Projectile';
import { PROJECTILE_RECYCLE_TOP } from '../patterns/fairness';
import {
  BOSS_PROJECTILE_ORIGIN,
  projectTunnelLane,
  TUNNEL_RADIUS_Y,
} from './ProjectileDepth';

export interface BeamHazard {
  id: number;
  y: number;
  height: number;
  telegraphMs: number;
  totalTelegraphMs: number;
  activeMs: number;
  hitPlayer: boolean;
  perfectAwarded: boolean;
  warning: Phaser.GameObjects.Rectangle;
  beam: Phaser.GameObjects.Rectangle;
}

export class ProjectileSystem {
  private readonly pool: Projectile[] = [];
  private readonly beams: BeamHazard[] = [];
  private beamId = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (let index = 0; index < 54; index += 1) this.pool.push(new Projectile(scene));
  }

  spawn(config: ProjectileConfig): Projectile | null {
    const projectile = this.pool.find((candidate) => !candidate.active);
    return projectile?.reset(config) ?? null;
  }

  spawnBeam(y: number, telegraphMs = 750, activeMs = 520): BeamHazard {
    const warning = this.scene.add.rectangle(
      BOSS_PROJECTILE_ORIGIN.x,
      BOSS_PROJECTILE_ORIGIN.y,
      540,
      5,
      0xd7ff32,
      0.32,
    )
      .setStrokeStyle(1, 0xffffff, 0.75)
      .setScale(0.04, 0.25)
      .setDepth(6);
    const beam = this.scene.add.rectangle(270, y, 540, 34, 0xd7ff32, 0.88)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(34)
      .setVisible(false);
    const hazard: BeamHazard = {
      id: this.beamId,
      y,
      height: 34,
      telegraphMs,
      totalTelegraphMs: telegraphMs,
      activeMs,
      hitPlayer: false,
      perfectAwarded: false,
      warning,
      beam
    };
    this.beamId += 1;
    this.beams.push(hazard);
    return hazard;
  }

  update(deltaSeconds: number, player: Noxcat, timeScale = 1): void {
    for (const projectile of this.pool) {
      if (!projectile.active) continue;
      projectile.step(deltaSeconds, player.x, player.y, timeScale);
      // Paper rain intentionally starts as far back as y=-235 so its small,
      // Boss-origin projection is visible before it flies toward the camera.
      if (projectile.x < -180 || projectile.x > 720 || projectile.y < PROJECTILE_RECYCLE_TOP || projectile.y > 1140) {
        projectile.recycle();
      }
    }

    const deltaMs = deltaSeconds * 1000;
    for (let index = this.beams.length - 1; index >= 0; index -= 1) {
      const hazard = this.beams[index];
      if (!hazard) continue;
      if (hazard.telegraphMs > 0) {
        hazard.telegraphMs -= deltaMs;
        const depth = Phaser.Math.Clamp(
          1 - hazard.telegraphMs / Math.max(1, hazard.totalTelegraphMs),
          0,
          1,
        );
        const laneRadius = (hazard.y - BOSS_PROJECTILE_ORIGIN.y) / TUNNEL_RADIUS_Y;
        const projected = projectTunnelLane(Math.PI / 2, laneRadius, depth);
        const fullDistance = Math.max(1, hazard.y - BOSS_PROJECTILE_ORIGIN.y);
        const expansion = Phaser.Math.Clamp(
          (projected.y - BOSS_PROJECTILE_ORIGIN.y) / fullDistance,
          0,
          1,
        );
        hazard.warning
          .setPosition(BOSS_PROJECTILE_ORIGIN.x, projected.y)
          .setScale(Math.max(0.04, expansion), Phaser.Math.Linear(0.25, 1, depth))
          .setDepth(6 + depth * 27);
        hazard.warning.alpha = 0.18 + (Math.sin(hazard.telegraphMs * 0.045) + 1) * 0.2;
        if (hazard.telegraphMs <= 0) {
          hazard.warning.setVisible(false);
          hazard.beam.setVisible(true);
        }
      } else {
        hazard.activeMs -= deltaMs;
        hazard.beam.alpha = 0.62 + (Math.sin(hazard.activeMs * 0.06) + 1) * 0.17;
        if (hazard.activeMs <= 0) {
          hazard.warning.destroy();
          hazard.beam.destroy();
          this.beams.splice(index, 1);
        }
      }
    }
  }

  activeProjectiles(): readonly Projectile[] {
    return this.pool.filter((projectile) => projectile.active);
  }

  activeBeams(): readonly BeamHazard[] {
    return this.beams;
  }

  clearDangerous(fade = true): void {
    for (const projectile of this.pool) {
      if (!projectile.active || projectile.friendly) continue;
      if (fade) {
        projectile.isDamage = false;
        this.scene.tweens.add({
          targets: projectile,
          alpha: 0,
          duration: 180,
          onComplete: () => projectile.recycle()
        });
      } else {
        projectile.recycle();
      }
    }
    for (const hazard of this.beams.splice(0)) {
      hazard.warning.destroy();
      hazard.beam.destroy();
    }
  }

  setVisualQuality(low: boolean): void {
    for (const projectile of this.pool) {
      if (projectile.active) projectile.setAlpha(low ? 0.86 : 1);
    }
  }

  destroy(): void {
    this.clearDangerous(false);
    this.pool.forEach((projectile) => projectile.destroy());
    this.pool.length = 0;
  }
}
