import Phaser from 'phaser';
import { AssetRegistry } from '../../assets/AssetRegistry';
import { PALETTE, PALETTE_CSS } from '../../theme/palette';
import { BOSS_MAX_HP } from '../constants';

const BOSS_ART_SIZE = 420;
const BOSS_ART_SCALE = BOSS_ART_SIZE / 580;
const BOSS_FADE_START = 0.72;
const BOSS_FADE_STRIPS = 8;
const DEFEAT_STRIP_COUNT = 9;
export const BOSS_DEFEAT_DURATION_MS = 2_800;

export type BossDefeatState = 'idle' | 'collapsing' | 'complete';

export class Boss extends Phaser.GameObjects.Container {
  readonly weakPoint: Phaser.GameObjects.Arc;
  private readonly glowImage: Phaser.GameObjects.Image;
  private readonly screenFlash: Phaser.GameObjects.Rectangle;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly crack: Phaser.GameObjects.Graphics;
  private readonly weakLabel: Phaser.GameObjects.Text;
  private readonly visualLayers: Array<Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible>;
  private hp = BOSS_MAX_HP;
  private defeatState: BossDefeatState = 'idle';
  private defeatFragmentCount = 0;

  constructor(scene: Phaser.Scene, name: string, weakPointLabel: string) {
    super(scene, 270, 250);
    scene.add.existing(this);
    this.setDepth(8);

    // The generated cutout carries the concept-art materials and silhouette.
    // Its blank CRT glass remains a live surface for the procedural face,
    // damage cracks and weak-point feedback below.
    this.glowImage = scene.add.image(0, 150 * BOSS_ART_SCALE, AssetRegistry.key('boss.crt'))
      .setDisplaySize(BOSS_ART_SIZE, BOSS_ART_SIZE)
      .setTintFill(PALETTE.green)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.035);
    const baseImage = scene.add.image(0, 150 * BOSS_ART_SCALE, AssetRegistry.key('boss.crt'))
      .setDisplaySize(BOSS_ART_SIZE, BOSS_ART_SIZE);
    const textureWidth = baseImage.frame.realWidth;
    const textureHeight = baseImage.frame.realHeight;
    const fadeStartY = Math.floor(textureHeight * BOSS_FADE_START);
    baseImage.setCrop(0, 0, textureWidth, fadeStartY);
    const fadedBaseStrips = Array.from({ length: BOSS_FADE_STRIPS }, (_, index) => {
      const stripTop = Math.floor(Phaser.Math.Linear(
        fadeStartY,
        textureHeight,
        index / BOSS_FADE_STRIPS,
      ));
      const stripBottom = Math.ceil(Phaser.Math.Linear(
        fadeStartY,
        textureHeight,
        (index + 1) / BOSS_FADE_STRIPS,
      ));
      const opacity = Math.pow(1 - (index + 0.5) / BOSS_FADE_STRIPS, 1.35);
      return scene.add.image(0, 150 * BOSS_ART_SCALE, AssetRegistry.key('boss.crt'))
        .setDisplaySize(BOSS_ART_SIZE, BOSS_ART_SIZE)
        .setCrop(0, stripTop, textureWidth, stripBottom - stripTop)
        .setAlpha(opacity);
    });
    this.screenFlash = scene.add.rectangle(
      0,
      -14 * BOSS_ART_SCALE,
      250 * BOSS_ART_SCALE,
      164 * BOSS_ART_SCALE,
      PALETTE.green,
      0,
    );
    this.face = scene.add.graphics().setScale(BOSS_ART_SCALE);
    this.drawFace(1);
    this.crack = scene.add.graphics().setScale(BOSS_ART_SCALE).setVisible(false);
    this.label = scene.add.text(
      117 * BOSS_ART_SCALE,
      47 * BOSS_ART_SCALE,
      weakPointLabel,
      {
        fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: '700',
        color: PALETTE_CSS.black,
        backgroundColor: PALETTE_CSS.green,
        padding: { x: 6, y: 4 },
      },
    ).setOrigin(0.5).setRotation(-0.08);
    this.weakPoint = scene.add.circle(0, -13, 32, PALETTE.green, 0.12)
      .setStrokeStyle(4, PALETTE.green, 0.95)
      .setVisible(false);
    this.weakLabel = scene.add.text(0, -13, 'WEAK', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: PALETTE_CSS.green
    }).setOrigin(0.5).setVisible(false);

    this.visualLayers = [
      this.glowImage,
      baseImage,
      ...fadedBaseStrips,
      this.screenFlash,
      this.face,
      this.crack,
      this.label,
      this.weakPoint,
      this.weakLabel,
    ];
    this.add(this.visualLayers);

    this.name = name;
  }

  setWeakPointVisible(visible: boolean): void {
    this.scene.tweens.killTweensOf([this.weakPoint, this.weakLabel]);
    this.weakPoint.setVisible(visible).setAlpha(1).setScale(1);
    this.weakLabel.setVisible(visible).setAlpha(1).setScale(1);
    if (visible) {
      this.scene.tweens.add({
        targets: [this.weakPoint, this.weakLabel],
        alpha: { from: 0.45, to: 1 },
        scale: { from: 0.86, to: 1.08 },
        duration: 430,
        yoyo: true,
        repeat: -1
      });
    }
  }

  get weakPointTweenCount(): number {
    return this.scene.tweens.getTweensOf(this.weakPoint).length;
  }

  get defeatAnimationState(): BossDefeatState {
    return this.defeatState;
  }

  get activeDefeatFragments(): number {
    return this.defeatFragmentCount;
  }

  setHp(hp: number): void {
    this.hp = Phaser.Math.Clamp(hp, 0, BOSS_MAX_HP);
    const ratio = this.hp / BOSS_MAX_HP;
    this.drawFace(ratio);
    this.crack.clear();
    if (ratio <= 0.68) {
      this.crack.setVisible(true);
      this.crack.lineStyle(3, PALETTE.green, ratio <= 0.33 ? 0.95 : 0.58);
      this.crack.beginPath();
      this.crack.moveTo(24, -76);
      this.crack.lineTo(8, -47);
      this.crack.lineTo(27, -28);
      this.crack.lineTo(2, -2);
      this.crack.strokePath();
      if (ratio <= 0.33) {
        this.crack.beginPath();
        this.crack.moveTo(-85, 33);
        this.crack.lineTo(-48, 17);
        this.crack.lineTo(-26, 48);
        this.crack.strokePath();
      }
    }
  }

  hitFeedback(major: boolean): void {
    this.scene.cameras.main.shake(major ? 150 : 70, major ? 0.014 : 0.005);
    this.scene.tweens.add({
      targets: this,
      x: { from: this.x - (major ? 13 : 5), to: this.x + (major ? 13 : 5) },
      duration: 35,
      yoyo: true,
      repeat: major ? 4 : 1,
      onComplete: () => this.setX(270)
    });
    this.screenFlash.setFillStyle(PALETTE.green, major ? 0.56 : 0.35);
    this.scene.time.delayedCall(95, () => this.screenFlash.setFillStyle(PALETTE.green, 0));
  }

  pulse(time: number): void {
    if (this.defeatState !== 'idle') return;
    this.glowImage.setAlpha(0.025 + (Math.sin(time * 0.004) + 1) * 0.025);
  }

  /**
   * Break the rendered Boss into horizontal floors. The base gives way first,
   * then the upper floors successively drop, compress and disappear into dust,
   * so the silhouette reads as a collapsing building instead of a flat fade.
   */
  playDefeatCollapse(): number {
    if (this.defeatState !== 'idle') return BOSS_DEFEAT_DURATION_MS;
    this.defeatState = 'collapsing';
    this.scene.tweens.killTweensOf([this, this.weakPoint, this.weakLabel]);
    this.setPosition(270, 250);
    this.visualLayers.forEach((layer) => layer.setVisible(false));

    const key = AssetRegistry.key('boss.crt');
    const textureFrame = this.scene.textures.getFrame(key);
    const sourceWidth = textureFrame.realWidth;
    const sourceHeight = textureFrame.realHeight;
    const sourceScaleX = BOSS_ART_SIZE / sourceWidth;
    const sourceScaleY = BOSS_ART_SIZE / sourceHeight;
    const artCenterY = 150 * BOSS_ART_SCALE;
    const slices: Phaser.GameObjects.Image[] = [];

    for (let index = 0; index < DEFEAT_STRIP_COUNT; index += 1) {
      const sourceTop = Math.floor(sourceHeight * index / DEFEAT_STRIP_COUNT);
      const sourceBottom = Math.ceil(sourceHeight * (index + 1) / DEFEAT_STRIP_COUNT);
      const sourceSliceHeight = sourceBottom - sourceTop;
      const slice = this.scene.add.image(
        0,
        artCenterY,
        key,
      )
        .setCrop(0, sourceTop, sourceWidth, sourceSliceHeight)
        .setScale(sourceScaleX, sourceScaleY);
      this.add(slice);
      slices.push(slice);
      this.defeatFragmentCount += 1;

      const bottomFirstDelay = (DEFEAT_STRIP_COUNT - 1 - index) * 135;
      const sideDrift = (index % 2 === 0 ? -1 : 1) * (10 + index * 1.8);
      this.scene.tweens.add({
        targets: slice,
        delay: bottomFirstDelay,
        x: sideDrift,
        y: slice.y + 135 + (DEFEAT_STRIP_COUNT - index) * 9,
        scaleY: sourceScaleY * 0.12,
        angle: (index % 2 === 0 ? -1 : 1) * (2 + index * 0.55),
        alpha: { from: 1, to: 0 },
        duration: 1_350,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.defeatFragmentCount = Math.max(0, this.defeatFragmentCount - 1);
          slice.destroy();
        },
      });
    }

    this.createDefeatBlast();
    this.scene.cameras.main.shake(1_350, 0.015);
    this.scene.time.delayedCall(BOSS_DEFEAT_DURATION_MS, () => {
      this.defeatState = 'complete';
      slices.forEach((slice) => {
        if (slice.active) slice.destroy();
      });
      this.defeatFragmentCount = 0;
    });
    return BOSS_DEFEAT_DURATION_MS;
  }

  private createDefeatBlast(): void {
    const flash = this.scene.add.rectangle(270, 480, 1_300, 1_300, PALETTE.green, 0.16)
      .setDepth(40)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    const core = this.scene.add.circle(0, -5, 25, PALETTE.green, 0.92)
      .setBlendMode(Phaser.BlendModes.ADD);
    const shockwave = this.scene.add.ellipse(0, 175, 90, 20, PALETTE.green, 0)
      .setStrokeStyle(5, PALETTE.green, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.add([core, shockwave]);
    this.scene.tweens.add({
      targets: core,
      scale: 7.2,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });
    this.scene.tweens.add({
      targets: shockwave,
      scaleX: 5.5,
      scaleY: 2.7,
      alpha: 0,
      duration: 1_100,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy(),
    });

    const burstSites = [
      { x: -94, y: 162, delay: 80 },
      { x: 88, y: 151, delay: 230 },
      { x: -54, y: 98, delay: 390 },
      { x: 72, y: 55, delay: 560 },
      { x: -82, y: 12, delay: 720 },
      { x: 45, y: -40, delay: 890 },
      { x: 0, y: -83, delay: 1_060 },
    ] as const;
    burstSites.forEach((burst, index) => this.createLocalizedBlast(
      burst.x,
      burst.y,
      burst.delay,
      index,
    ));

    for (let index = 0; index < 26; index += 1) {
      const angle = -Math.PI + index * (Math.PI * 2 / 26);
      const distance = 95 + (index % 5) * 18;
      const debris = this.scene.add.rectangle(
        0,
        35,
        5 + (index % 3) * 3,
        10 + (index % 4) * 4,
        index % 4 === 0 ? PALETTE.green : 0x48543f,
        0.95,
      ).setRotation(angle * 0.35);
      this.add(debris);
      this.scene.tweens.add({
        targets: debris,
        delay: 90 + (index % 6) * 65,
        x: Math.cos(angle) * distance,
        y: 35 + Math.sin(angle) * distance + 125,
        angle: debris.angle + (index % 2 === 0 ? 210 : -210),
        alpha: 0,
        duration: 1_150 + (index % 5) * 95,
        ease: 'Quad.easeOut',
        onComplete: () => debris.destroy(),
      });
    }

    for (let index = 0; index < 16; index += 1) {
      const dust = this.scene.add.circle(
        -150 + index * 20,
        180 + (index % 3) * 9,
        22 + (index % 4) * 7,
        index % 3 === 0 ? PALETTE.green : 0x5f6958,
        index % 3 === 0 ? 0.28 : 0.5,
      );
      this.add(dust);
      this.scene.tweens.add({
        targets: dust,
        delay: 180 + index * 48,
        x: dust.x + (index - 7.5) * 9,
        y: dust.y - 65 - (index % 3) * 18,
        scale: 2.2,
        alpha: 0,
        duration: 1_550,
        ease: 'Quad.easeOut',
        onComplete: () => dust.destroy(),
      });
    }
  }

  private createLocalizedBlast(x: number, y: number, delay: number, index: number): void {
    this.scene.time.delayedCall(delay, () => {
      if (!this.active) return;
      const core = this.scene.add.circle(x, y, 11 + index % 3 * 3, PALETTE.white, 0.96)
        .setBlendMode(Phaser.BlendModes.ADD);
      const halo = this.scene.add.circle(x, y, 20 + index % 2 * 5, PALETTE.green, 0.72)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ring = this.scene.add.circle(x, y, 17, PALETTE.green, 0)
        .setStrokeStyle(4, PALETTE.green, 0.95)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.add([halo, core, ring]);

      this.scene.tweens.add({
        targets: [core, halo],
        scale: { from: 0.5, to: 4.2 + index * 0.14 },
        alpha: 0,
        duration: 620 + index * 35,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          core.destroy();
          halo.destroy();
        },
      });
      this.scene.tweens.add({
        targets: ring,
        scale: 4.8,
        alpha: 0,
        duration: 820,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });

      for (let sparkIndex = 0; sparkIndex < 4; sparkIndex += 1) {
        const sparkAngle = index * 0.71 + sparkIndex * Math.PI / 2;
        const spark = this.scene.add.rectangle(x, y, 3, 15, PALETTE.green, 0.95)
          .setRotation(sparkAngle);
        this.add(spark);
        this.scene.tweens.add({
          targets: spark,
          x: x + Math.cos(sparkAngle) * (48 + index * 4),
          y: y + Math.sin(sparkAngle) * (48 + index * 4),
          scaleY: 0.2,
          alpha: 0,
          duration: 650,
          ease: 'Quad.easeOut',
          onComplete: () => spark.destroy(),
        });
      }
    });
  }

  private drawFace(hpRatio: number): void {
    this.face.clear();
    this.face.lineStyle(13, PALETTE.green, 1);
    if (hpRatio > 0.33) {
      this.face.lineBetween(-78, -45, -23, -17);
      this.face.lineBetween(23, -17, 78, -45);
      this.face.lineBetween(-58, 33, 0, 12);
      this.face.lineBetween(0, 12, 58, 33);
    } else {
      this.face.lineBetween(-72, -31, -30, -26);
      this.face.lineBetween(30, -26, 72, -31);
      this.face.lineBetween(-50, 18, 0, 36);
      this.face.lineBetween(0, 36, 50, 18);
    }
  }

}
