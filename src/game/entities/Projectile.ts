import Phaser from 'phaser';
import { AssetRegistry } from '../../assets/AssetRegistry';
import { PALETTE, PALETTE_CSS } from '../../theme/palette';
import { interpolateThresholdCrossing } from '../systems/CollisionMath';
import {
  accelerateProjectileExit,
  initialProjectileExitVelocity,
} from '../systems/ProjectileExitMotion';
import {
  BOSS_PROJECTILE_ORIGIN,
  calculateInboundProjectileTransform,
  calculateProjectilePerspectiveQuad,
  calculateTunnelDepthPose,
  createTunnelTrajectory,
  PROJECTILE_CONTACT_DEPTH,
  sampleTunnelProjection,
  type TunnelTrajectory,
  type ProjectileKind,
  WALL_CARD_SCALE_Y,
} from '../systems/ProjectileDepth';

export type { ProjectileKind } from '../systems/ProjectileDepth';

// Keep near-plane cards readable without letting one document cover most of
// NOXCAT's available dodge corridor on a narrow phone.
const PROJECTILE_CARD_WIDTH = 40;
const PROJECTILE_CARD_HEIGHT = 52;
// Closing-wall documents overlap horizontally at the near plane, turning the
// row into a real barrier across both edge lanes instead of two small cards.
const WALL_CARD_WIDTH_SCALE = 2.5;

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
  /** Screen-space point where the far-to-near pass reaches player depth. */
  perspectiveTarget?: Readonly<{ x: number; y: number }>;
  /** Optional wall portal used by attacks that enter from a side of the arena. */
  perspectiveOrigin?: Readonly<{ x: number; y: number }>;
  /** Authored duration of the far-to-near pass, independent of old 2D spawn distance. */
  perspectiveDurationMs?: number;
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
  previousCollisionActive = false;
  previousX = 0;
  previousY = 0;
  tunnelDepth = 0;
  hasGrazedPlayer = false;
  homingRemainingMs = 0;
  ageMs = 0;
  private spinRotation = 0;
  private tunnelTrajectory!: TunnelTrajectory;
  private authoredX = 0;
  private authoredY = 0;
  private projectedX = 0;
  private projectedY = 0;
  private reducedVisualQuality = false;
  private outboundExitActive = false;
  private readonly collisionPoints = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];

  private readonly sprite: Phaser.GameObjects.Image;
  private readonly comment: Phaser.GameObjects.Text;
  private readonly perspectiveMesh?: Phaser.GameObjects.Mesh;
  private readonly depthShadow: Phaser.GameObjects.Ellipse;
  private readonly visualLayer: Phaser.GameObjects.Container;

  get visibleCenterX(): number {
    return this.x + this.visualLayer.x;
  }

  get visibleCenterY(): number {
    return this.y + this.visualLayer.y;
  }

  /** The screen-space centre used by gameplay collision this frame. */
  get collisionCenterX(): number {
    return this.visibleCenterX;
  }

  /** The screen-space centre used by gameplay collision this frame. */
  get collisionCenterY(): number {
    return this.visibleCenterY;
  }

  get isContinuingOffscreen(): boolean {
    return this.outboundExitActive;
  }

  /** Actual screen-space corners of the rendered document this frame. */
  get collisionPolygon(): readonly Readonly<{ x: number; y: number }>[] {
    return this.collisionPoints;
  }

  constructor(scene: Phaser.Scene) {
    super(scene, -200, -200);
    scene.add.existing(this);
    this.depthShadow = scene.add.ellipse(8, 11, 45, 18, 0x000000, 0.38)
      .setStrokeStyle(1, PALETTE.green, 0.12);
    this.sprite = scene.add.image(0, 0, AssetRegistry.key('projectile.paper'))
      .setDisplaySize(PROJECTILE_CARD_WIDTH, PROJECTILE_CARD_HEIGHT);
    this.comment = scene.add.text(0, 0, '', {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '15px',
      fontStyle: '700',
      color: '#10150e',
      backgroundColor: PALETTE_CSS.green,
      padding: { x: 9, y: 6 }
    }).setOrigin(0.5).setVisible(false);
    if (scene.sys.game.renderer.type === Phaser.WEBGL) {
      this.perspectiveMesh = scene.add.mesh(
        0,
        0,
        AssetRegistry.key('projectile.paper'),
      );
      this.perspectiveMesh.addVertices(
        [
          -PROJECTILE_CARD_WIDTH / 2, PROJECTILE_CARD_HEIGHT / 2,
          -PROJECTILE_CARD_WIDTH / 2, -PROJECTILE_CARD_HEIGHT / 2,
          PROJECTILE_CARD_WIDTH / 2, PROJECTILE_CARD_HEIGHT / 2,
          -PROJECTILE_CARD_WIDTH / 2, -PROJECTILE_CARD_HEIGHT / 2,
          PROJECTILE_CARD_WIDTH / 2, -PROJECTILE_CARD_HEIGHT / 2,
          PROJECTILE_CARD_WIDTH / 2, PROJECTILE_CARD_HEIGHT / 2,
        ],
        [
          0, 1,
          0, 0,
          1, 1,
          0, 0,
          1, 0,
          1, 1,
        ],
      );
      this.perspectiveMesh.hideCCW = false;
      this.perspectiveMesh.setOrtho(
        this.perspectiveMesh.width,
        this.perspectiveMesh.height,
      );
    }
    this.visualLayer = scene.add.container(0, 0, [
      this.depthShadow,
      this.sprite,
      ...(this.perspectiveMesh ? [this.perspectiveMesh] : []),
      this.comment,
    ]);
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
    this.outboundExitActive = false;
    this.tunnelDepth = 0;
    this.authoredX = config.x;
    this.authoredY = config.y;
    this.tunnelTrajectory = createTunnelTrajectory(
      { x: config.x, y: config.y },
      { x: config.vx, y: config.vy },
      this.radius,
      config.perspectiveTarget,
      config.perspectiveDurationMs,
      config.perspectiveOrigin,
    );
    const initialProjection = sampleTunnelProjection(
      this.tunnelTrajectory,
      { x: config.x, y: config.y },
    );
    this.collisionActive = initialProjection.collisionActive;
    this.previousCollisionActive = this.collisionActive;
    this.previousX = this.x;
    this.previousY = this.y;
    this.tunnelDepth = initialProjection.depth;
    this.projectedX = initialProjection.position.x;
    this.projectedY = initialProjection.position.y;
    const initialPose = calculateTunnelDepthPose(this.kind, this.tunnelDepth);
    this.visualLayer
      .setPosition(this.projectedX - config.x, this.projectedY - config.y)
      .setRotation(0)
      .setScale(initialPose.scale, initialPose.scale * initialPose.foreshortening);
    this.sprite.setVisible(!this.perspectiveMesh && config.kind !== 'comment');
    this.sprite
      .setTexture(AssetRegistry.key(this.reflectable ? 'projectile.returnable' : 'projectile.paper'))
      .setDisplaySize(PROJECTILE_CARD_WIDTH, PROJECTILE_CARD_HEIGHT);
    this.sprite.clearTint();
    this.sprite.setRotation(0);
    this.depthShadow.setVisible(true).setAlpha(0.18).setScale(0.55);
    this.comment
      .setVisible(!this.perspectiveMesh && config.kind === 'comment')
      .setText(config.text ?? '這裡對齊');
    this.perspectiveMesh
      ?.setVisible(true)
      .setTexture(config.kind === 'comment'
        ? this.comment.texture.key
        : AssetRegistry.key(this.reflectable ? 'projectile.returnable' : 'projectile.paper'),
      undefined,
      false,
      false)
      .clearTint();
    this.perspectiveMesh?.setOrtho(
      this.perspectiveMesh.width,
      this.perspectiveMesh.height,
    );
    // Wall rows overlap enough to read as a barrier, but stay short enough
    // that the rendered cards never visually seal their advertised opening.
    if (config.kind === 'wall') {
      this.sprite.setDisplaySize(
        PROJECTILE_CARD_WIDTH * WALL_CARD_WIDTH_SCALE,
        PROJECTILE_CARD_HEIGHT * WALL_CARD_SCALE_Y,
      );
    }
    this.updatePerspectiveSurface(
      this.projectedX,
      this.projectedY,
      initialPose.progress,
      initialPose.scale,
      initialPose.scale * initialPose.foreshortening,
      true,
    );
    return this.setActive(true).setVisible(true);
  }

  step(deltaSeconds: number, playerX: number, playerY: number, timeScale = 1): void {
    const dt = deltaSeconds * timeScale;
    const positionBeforeStep = { x: this.x, y: this.y };
    const authoredPositionBeforeStep = { x: this.authoredX, y: this.authoredY };
    const tunnelDepthBeforeStep = this.tunnelDepth;
    const collisionWasActive = this.collisionActive;
    this.ageMs += deltaSeconds * 1000;
    if (this.outboundExitActive && !this.friendly) {
      const velocity = accelerateProjectileExit({ x: this.vx, y: this.vy }, dt);
      this.vx = velocity.x;
      this.vy = velocity.y;
    }
    if (this.kind === 'homing' && this.homingRemainingMs > 0 && !this.friendly) {
      this.homingRemainingMs -= deltaSeconds * 1000;
      const desired = Math.atan2(
        playerY - (this.outboundExitActive ? this.y : this.authoredY),
        playerX - (this.outboundExitActive ? this.x : this.authoredX),
      );
      const current = Math.atan2(this.vy, this.vx);
      const angle = Phaser.Math.Angle.RotateTo(current, desired, 1.5 * dt);
      const speed = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
    const followsProjectedApproach = !this.friendly && !this.outboundExitActive;
    if (followsProjectedApproach) {
      this.authoredX += this.vx * dt;
      this.authoredY += this.vy * dt;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    const authoredPositionAfterStep = { x: this.authoredX, y: this.authoredY };
    const projection = followsProjectedApproach
      ? sampleTunnelProjection(
          this.tunnelTrajectory,
          authoredPositionAfterStep,
          this.tunnelDepth,
        )
      : {
          position: { x: this.x, y: this.y },
          depth: 1,
          radialDistance: Math.hypot(
            this.x - BOSS_PROJECTILE_ORIGIN.x,
            this.y - BOSS_PROJECTILE_ORIGIN.y,
          ),
          collisionActive: true,
        };
    const enteredContactDepth = !collisionWasActive && projection.collisionActive;
    const enteredNearPlane = followsProjectedApproach
      && tunnelDepthBeforeStep < 1
      && projection.depth >= 1;
    this.tunnelDepth = projection.depth;
    this.collisionActive = projection.collisionActive;
    if (enteredContactDepth) {
      const startAlongRay = this.distanceAlongAuthoredRay(authoredPositionBeforeStep);
      const endAlongRay = this.distanceAlongAuthoredRay(authoredPositionAfterStep);
      const authoredContactPoint = interpolateThresholdCrossing(
        authoredPositionBeforeStep,
        authoredPositionAfterStep,
        startAlongRay,
        endAlongRay,
        this.tunnelTrajectory.approachLength * PROJECTILE_CONTACT_DEPTH,
      );
      const contactProjection = sampleTunnelProjection(
        this.tunnelTrajectory,
        authoredContactPoint,
        tunnelDepthBeforeStep,
      );
      // A low-FPS frame can cross the contact threshold before collision is
      // sampled. Start the first sweep at the exact projected threshold point.
      this.previousX = contactProjection.position.x;
      this.previousY = contactProjection.position.y;
    }
    if (followsProjectedApproach) {
      // Before contact this root is only an authored clock. From contact depth
      // onward it is the real collider, exactly co-located with the visual.
      this.setPosition(
        this.collisionActive ? projection.position.x : this.authoredX,
        this.collisionActive ? projection.position.y : this.authoredY,
      );
    }
    if (enteredNearPlane) {
      const exitVelocity = initialProjectileExitVelocity(
        this.tunnelTrajectory,
        { x: this.vx, y: this.vy },
      );
      this.vx = exitVelocity.x;
      this.vy = exitVelocity.y;
      this.outboundExitActive = true;
    }
    // The first dangerous sweep begins at the exact contact-depth projection;
    // every subsequent active frame retains the true prior collision centre.
    this.previousCollisionActive = this.collisionActive;
    if (!enteredContactDepth) {
      this.previousX = collisionWasActive ? positionBeforeStep.x : this.x;
      this.previousY = collisionWasActive ? positionBeforeStep.y : this.y;
    }
    if (this.friendly) {
      this.spinRotation += this.rotationSpeed * dt * 0.65;
    } else {
      this.spinRotation = 0;
    }
    const depthPose = calculateTunnelDepthPose(this.kind, this.tunnelDepth);
    const projectedDeltaX = projection.position.x - this.projectedX;
    const projectedDeltaY = projection.position.y - this.projectedY;
    const projectedSpeed = Math.hypot(projectedDeltaX, projectedDeltaY)
      / Math.max(deltaSeconds, 1 / 240);
    const inboundTransform = calculateInboundProjectileTransform(
      this.tunnelDepth,
      projectedSpeed,
      this.rotationSpeed,
    );
    const visualScaleX = depthPose.scale * (this.friendly ? 1 : inboundTransform.scaleX);
    const visualScaleY = depthPose.scale * depthPose.foreshortening
      * (this.friendly ? 1 : inboundTransform.scaleY);
    this.visualLayer.setScale(visualScaleX, visualScaleY);
    this.setAlpha(depthPose.alpha * (this.reducedVisualQuality ? 0.88 : 1))
      .setDepth(depthPose.displayDepth);
    this.visualLayer.setPosition(
      projection.position.x - this.x,
      projection.position.y - this.y,
    );
    // Boss-fired cards remain front-facing: perspective translation plus
    // non-uniform deformation carry the motion. Reflected cards may spin.
    this.visualLayer.setRotation(this.friendly ? this.spinRotation : inboundTransform.rotation);
    this.updatePerspectiveSurface(
      projection.position.x,
      projection.position.y,
      depthPose.progress,
      visualScaleX,
      visualScaleY,
      !this.friendly,
    );
    this.depthShadow
      .setScale(Phaser.Math.Linear(0.55, 1.45, depthPose.progress))
      .setAlpha(Phaser.Math.Linear(0.1, 0.5, depthPose.progress));
    this.sprite.setRotation(0);
    this.projectedX = projection.position.x;
    this.projectedY = projection.position.y;
  }

  reflectTowards(x: number, y: number, speed = 760): void {
    if (this.tunnelDepth < 1) {
      // Contact may happen during the final perspective approach. Promote the
      // projected collision centre before aiming the friendly return so the
      // card never teleports back to its hidden authored coordinate.
      this.setPosition(this.visibleCenterX, this.visibleCenterY);
      this.visualLayer.setPosition(0, 0);
    }
    const angle = Math.atan2(y - this.y, x - this.x);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.friendly = true;
    this.isDamage = false;
    this.reflectable = false;
    this.collisionActive = true;
    this.previousCollisionActive = true;
    this.previousX = this.x;
    this.previousY = this.y;
    this.tunnelDepth = 1;
    this.outboundExitActive = false;
    this.visualLayer.setPosition(0, 0);
    this.sprite
      .setTint(PALETTE.green)
      .setDisplaySize(PROJECTILE_CARD_WIDTH * 1.18, PROJECTILE_CARD_HEIGHT * 1.18);
    this.perspectiveMesh?.setTint(PALETTE.green);
    this.depthShadow.setStrokeStyle(2, PALETTE.green, 0.75);
  }

  setVisualQuality(reduced: boolean): void {
    this.reducedVisualQuality = reduced;
  }

  /**
   * Ends gameplay ownership without visually deleting the card. The pooled
   * projectile keeps flying on its established ray and recycles only after its
   * complete card is outside the padded viewport.
   */
  releaseForOffscreenExit(): void {
    if (!this.active || this.friendly) return;
    this.isDamage = false;
    this.reflectable = false;
    if (!this.collisionActive || this.outboundExitActive) return;
    const exitVelocity = initialProjectileExitVelocity(
      this.tunnelTrajectory,
      { x: this.vx, y: this.vy },
    );
    this.vx = exitVelocity.x;
    this.vy = exitVelocity.y;
    this.outboundExitActive = true;
  }

  recycle(): void {
    this.spinRotation = 0;
    this.outboundExitActive = false;
    this.setRotation(0);
    this.sprite.setRotation(0);
    this.depthShadow.setStrokeStyle(1, PALETTE.green, 0.12);
    this.visualLayer.setPosition(0, 0).setRotation(0).setScale(0.3);
    this.setActive(false).setVisible(false).setPosition(-200, -200);
  }

  override destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
  }

  private distanceAlongAuthoredRay(point: Readonly<{ x: number; y: number }>): number {
    return (point.x - this.tunnelTrajectory.spawn.x) * this.tunnelTrajectory.directionX
      + (point.y - this.tunnelTrajectory.spawn.y) * this.tunnelTrajectory.directionY;
  }

  private updatePerspectiveSurface(
    projectedX: number,
    projectedY: number,
    depth: number,
    visualScaleX: number,
    visualScaleY: number,
    warped: boolean,
  ): void {
    const sourceWidth = this.kind === 'comment'
      ? Math.max(1, this.comment.width)
      : PROJECTILE_CARD_WIDTH * (this.kind === 'wall' ? WALL_CARD_WIDTH_SCALE : 1);
    const sourceHeight = this.kind === 'comment'
      ? Math.max(1, this.comment.height)
      : PROJECTILE_CARD_HEIGHT * (this.kind === 'wall' ? WALL_CARD_SCALE_Y : 1);
    const safeScaleX = Math.max(0.001, Math.abs(visualScaleX));
    const safeScaleY = Math.max(0.001, Math.abs(visualScaleY));
    const quad = warped && Boolean(this.perspectiveMesh)
      ? calculateProjectilePerspectiveQuad(
          { x: projectedX, y: projectedY },
          sourceWidth * safeScaleX,
          sourceHeight * safeScaleY,
          depth,
          this.tunnelTrajectory.nearPoint,
          this.tunnelTrajectory.origin,
        )
      : {
          topLeft: { x: -sourceWidth * safeScaleX / 2, y: -sourceHeight * safeScaleY / 2 },
          topRight: { x: sourceWidth * safeScaleX / 2, y: -sourceHeight * safeScaleY / 2 },
          bottomRight: { x: sourceWidth * safeScaleX / 2, y: sourceHeight * safeScaleY / 2 },
          bottomLeft: { x: -sourceWidth * safeScaleX / 2, y: sourceHeight * safeScaleY / 2 },
        };
    this.collisionPoints[0]!.x = projectedX + quad.topLeft.x;
    this.collisionPoints[0]!.y = projectedY + quad.topLeft.y;
    this.collisionPoints[1]!.x = projectedX + quad.topRight.x;
    this.collisionPoints[1]!.y = projectedY + quad.topRight.y;
    this.collisionPoints[2]!.x = projectedX + quad.bottomRight.x;
    this.collisionPoints[2]!.y = projectedY + quad.bottomRight.y;
    this.collisionPoints[3]!.x = projectedX + quad.bottomLeft.x;
    this.collisionPoints[3]!.y = projectedY + quad.bottomLeft.y;
    if (!this.perspectiveMesh) return;
    const local = {
      topLeft: { x: quad.topLeft.x / safeScaleX, y: quad.topLeft.y / safeScaleY },
      topRight: { x: quad.topRight.x / safeScaleX, y: quad.topRight.y / safeScaleY },
      bottomRight: { x: quad.bottomRight.x / safeScaleX, y: quad.bottomRight.y / safeScaleY },
      bottomLeft: { x: quad.bottomLeft.x / safeScaleX, y: quad.bottomLeft.y / safeScaleY },
    };
    const positions = [
      local.bottomLeft,
      local.topLeft,
      local.bottomRight,
      local.topLeft,
      local.topRight,
      local.bottomRight,
    ];
    for (let index = 0; index < this.perspectiveMesh.vertices.length; index += 1) {
      const point = positions[index];
      const vertex = this.perspectiveMesh.vertices[index];
      if (!point || !vertex) continue;
      vertex.x = point.x;
      // Phaser's orthographic Mesh transform flips local Y. Counter-flip the
      // authored screen-space quad so the Boss-facing edge stays the narrow
      // edge and text on the card remains upright.
      vertex.y = -point.y;
    }
    // Phaser's Mesh cache does not observe direct Vertex.x/y writes. A zero
    // view pan is its cheapest public dirty signal: active meshes transform
    // once, while all inactive pooled meshes can take the cached fast path.
    this.perspectiveMesh.panX(0);
  }
}
