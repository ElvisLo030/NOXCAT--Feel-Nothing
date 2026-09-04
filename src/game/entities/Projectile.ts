import Phaser from 'phaser';
import { AssetRegistry } from '../../assets/AssetRegistry';
import {
  calculateTunnelDepthPose,
  createTunnelTrajectory,
  projectileStreakLength,
  sampleTunnelProjection,
  type TunnelTrajectory,
  type ProjectileKind,
  WALL_CARD_SCALE_Y,
} from '../systems/ProjectileDepth';

export type { ProjectileKind } from '../systems/ProjectileDepth';

export interface ProjectileConfig {
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius?: number;
  rotationSpeed?: number;
  damage?: boolean;
  homingMs?: number;
  text?: string;
}

export class Projectile extends Phaser.GameObjects.Container {
  kind: ProjectileKind = 'paper';
  vx = 0;
  vy = 0;
  radius = 18;
  rotationSpeed = 0;
  isDamage = true;
  reflectable = false;
  friendly = false;
  collisionActive = false;
  tunnelDepth = 0;
  hasGrazedPlayer = false;
  homingRemainingMs = 0;
  ageMs = 0;
  private spinRotation = 0;
  private tunnelTrajectory!: TunnelTrajectory;
  private projectedX = 0;
  private projectedY = 0;
  private streakDirectionX = 0;
  private streakDirectionY = 1;

  private readonly sprite: Phaser.GameObjects.Image;
  private readonly comment: Phaser.GameObjects.Text;
  private readonly depthShadow: Phaser.GameObjects.Ellipse;
  private readonly visualLayer: Phaser.GameObjects.Container;
  private readonly speedStreak: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    super(scene, -200, -200);
    scene.add.existing(this);
    this.speedStreak = scene.add.graphics().setDepth(11);
    this.depthShadow = scene.add.ellipse(8, 11, 45, 18, 0x000000, 0.38)
      .setStrokeStyle(1, 0xd7ff32, 0.12);
    this.sprite = scene.add.image(0, 0, AssetRegistry.key('projectile.paper'));
    this.comment = scene.add.text(0, 0, '', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: '700',
      color: '#10150e',
      backgroundColor: '#d7ff32',
      padding: { x: 9, y: 6 }
    }).setOrigin(0.5).setVisible(false);
    this.visualLayer = scene.add.container(0, 0, [this.depthShadow, this.sprite, this.comment]);
    this.add(this.visualLayer);
    this.setDepth(18).setActive(false).setVisible(false);
  }

  reset(config: ProjectileConfig): this {
    this.kind = config.kind;
    this.setPosition(config.x, config.y)
      .setRotation(0)
      .setAlpha(0.24)
      .setScale(1)
      .setDepth(18);
    this.vx = config.vx;
    this.vy = config.vy;
    this.radius = config.radius ?? (config.kind === 'comment' ? 24 : 18);
    this.rotationSpeed = config.rotationSpeed ?? 0;
    this.isDamage = config.damage ?? true;
    this.reflectable = config.kind === 'returnable';
    this.friendly = false;
    this.hasGrazedPlayer = false;
    this.homingRemainingMs = config.homingMs ?? 0;
    this.ageMs = 0;
    this.spinRotation = 0;
    this.tunnelDepth = 0;
    this.tunnelTrajectory = createTunnelTrajectory(
      { x: config.x, y: config.y },
      { x: config.vx, y: config.vy },
      this.radius,
    );
    const initialProjection = sampleTunnelProjection(
      this.tunnelTrajectory,
      { x: config.x, y: config.y },
    );
    this.collisionActive = initialProjection.collisionActive;
    this.tunnelDepth = initialProjection.depth;
    this.projectedX = initialProjection.position.x;
    this.projectedY = initialProjection.position.y;
    const initialDirectionX = this.tunnelTrajectory.nearPoint.x - this.projectedX;
    const initialDirectionY = this.tunnelTrajectory.nearPoint.y - this.projectedY;
    const initialDirectionLength = Math.hypot(initialDirectionX, initialDirectionY);
    this.streakDirectionX = initialDirectionLength > 0
      ? initialDirectionX / initialDirectionLength
      : 0;
    this.streakDirectionY = initialDirectionLength > 0
      ? initialDirectionY / initialDirectionLength
      : 1;
    const initialPose = calculateTunnelDepthPose(this.kind, this.tunnelDepth);
    this.visualLayer
      .setPosition(this.projectedX - config.x, this.projectedY - config.y)
      .setRotation(0)
      .setScale(initialPose.scale, initialPose.scale * initialPose.foreshortening);
    this.speedStreak.clear();
    this.sprite.setVisible(config.kind !== 'comment');
    this.sprite.setTexture(AssetRegistry.key(this.reflectable ? 'projectile.returnable' : 'projectile.paper'));
    this.sprite.clearTint();
    this.sprite.setRotation(0);
    this.depthShadow.setVisible(true).setAlpha(0.18).setScale(0.55);
    this.comment.setVisible(config.kind === 'comment').setText(config.text ?? '這裡對齊');
    // Wall rows overlap enough to read as a barrier, but stay short enough
    // that the rendered cards never visually seal their advertised opening.
    if (config.kind === 'wall') this.sprite.setScale(1.15, WALL_CARD_SCALE_Y);
    else this.sprite.setScale(1);
    return this.setActive(true).setVisible(true);
  }

  step(deltaSeconds: number, playerX: number, playerY: number, timeScale = 1): void {
    const dt = deltaSeconds * timeScale;
    this.ageMs += deltaSeconds * 1000;
    if (this.kind === 'homing' && this.homingRemainingMs > 0 && !this.friendly) {
      this.homingRemainingMs -= deltaSeconds * 1000;
      const desired = Math.atan2(playerY - this.y, playerX - this.x);
      const current = Math.atan2(this.vy, this.vx);
      const angle = Phaser.Math.Angle.RotateTo(current, desired, 1.5 * dt);
      const speed = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const projection = sampleTunnelProjection(
      this.tunnelTrajectory,
      { x: this.x, y: this.y },
      this.tunnelDepth,
    );
    this.tunnelDepth = projection.depth;
    this.collisionActive = projection.collisionActive;
    this.spinRotation += this.rotationSpeed * dt * (0.35 + this.tunnelDepth * 1.25);
    const depthPose = calculateTunnelDepthPose(this.kind, this.tunnelDepth);
    this.visualLayer.setScale(
      depthPose.scale,
      depthPose.scale * depthPose.foreshortening,
    );
    this.setAlpha(depthPose.alpha).setDepth(depthPose.displayDepth);
    this.visualLayer.setPosition(
      projection.position.x - this.x,
      projection.position.y - this.y,
    );
    // Spin only the rendered card. Rotating the root would rotate the large
    // perspective offset around the collider and make distant cards orbit.
    this.visualLayer.setRotation(this.spinRotation);
    this.depthShadow
      .setScale(Phaser.Math.Linear(0.55, 1.45, depthPose.progress))
      .setAlpha(Phaser.Math.Linear(0.1, 0.5, depthPose.progress));
    const lateral = Phaser.Math.Clamp(this.vx / 520, -1, 1);
    this.sprite.setRotation((1 - depthPose.progress) * lateral * 0.22);
    this.drawSpeedStreak(projection.position.x, projection.position.y, depthPose);
  }

  reflectTowards(x: number, y: number, speed = 760): void {
    const angle = Math.atan2(y - this.y, x - this.x);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.friendly = true;
    this.isDamage = false;
    this.reflectable = false;
    this.collisionActive = true;
    this.tunnelDepth = 1;
    this.visualLayer.setPosition(0, 0);
    this.sprite.setTint(0xd7ff32).setScale(1.18);
    this.depthShadow.setStrokeStyle(2, 0xd7ff32, 0.75);
  }

  recycle(): void {
    this.spinRotation = 0;
    this.setRotation(0);
    this.sprite.setRotation(0);
    this.depthShadow.setStrokeStyle(1, 0xd7ff32, 0.12);
    this.speedStreak.clear();
    this.visualLayer.setPosition(0, 0).setRotation(0).setScale(0.3);
    this.setActive(false).setVisible(false).setPosition(-200, -200);
  }

  override destroy(fromScene?: boolean): void {
    this.speedStreak.destroy();
    super.destroy(fromScene);
  }

  private drawSpeedStreak(
    projectedX: number,
    projectedY: number,
    pose: Readonly<{ progress: number; displayDepth: number }>,
  ): void {
    const dx = projectedX - this.projectedX;
    const dy = projectedY - this.projectedY;
    const speed = Math.hypot(dx, dy);
    this.speedStreak.clear().setDepth(pose.displayDepth - 0.5);
    if (speed > 0.01) {
      this.streakDirectionX = dx / speed;
      this.streakDirectionY = dy / speed;
    }
    if (pose.progress > 0.08 && speed > 0.15) {
      const traceLength = projectileStreakLength(pose.progress);
      const tailX = projectedX - this.streakDirectionX * traceLength;
      const tailY = projectedY - this.streakDirectionY * traceLength;
      const colour = this.kind === 'returnable' ? 0xe5ff6d : 0xb8e91d;
      this.speedStreak.lineStyle(
        Phaser.Math.Linear(3.4, 6, pose.progress),
        colour,
        0.055,
      );
      this.speedStreak.lineBetween(tailX, tailY, projectedX, projectedY);
      this.speedStreak.lineStyle(Phaser.Math.Linear(1.8, 3, pose.progress), colour, 0.13);
      this.speedStreak.lineBetween(
        Phaser.Math.Linear(projectedX, tailX, 0.72),
        Phaser.Math.Linear(projectedY, tailY, 0.72),
        projectedX,
        projectedY,
      );
      this.speedStreak.lineStyle(1, 0xf2ffad, 0.24);
      this.speedStreak.lineBetween(
        Phaser.Math.Linear(projectedX, tailX, 0.34),
        Phaser.Math.Linear(projectedY, tailY, 0.34),
        projectedX,
        projectedY,
      );
    }
    this.projectedX = projectedX;
    this.projectedY = projectedY;
  }
}
