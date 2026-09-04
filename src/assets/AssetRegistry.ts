import Phaser from 'phaser';
import {
  NOXCAT_EYES,
  NOXCAT_FACE_TEXTURE,
  NOXCAT_GOGGLE_LENSES,
  NOXCAT_OFFICIAL_BLACK,
  NOXCAT_OFFICIAL_GREEN,
  sampleNoxcatBunOutline,
} from './noxcatDesign';

export type AssetKey =
  | 'noxcat.body'
  | 'noxcat.eyes'
  | 'noxcat.goggles'
  | 'noxcat.hit'
  | 'boss.crt'
  | 'projectile.paper'
  | 'projectile.returnable';

const textureKeys: Record<AssetKey, string> = {
  'noxcat.body': 'flat-noxcat-logo-bun-v5',
  'noxcat.eyes': 'noxcat-runtime-eyes',
  'noxcat.goggles': 'noxcat-runtime-goggles',
  'noxcat.hit': 'noxcat-runtime-hit',
  'boss.crt': 'boss-runtime-crt',
  'projectile.paper': 'projectile-runtime-paper',
  'projectile.returnable': 'projectile-runtime-returnable'
};

/**
 * The only place that knows whether art is supplied, derived, or procedural.
 * The start screen uses the unchanged official wordmark; this registry owns the
 * approved game redraw and runtime textures so scenes never hard-code paths.
 */
export class AssetRegistry {
  static readonly usesOfficialNoxcat = true;

  static preload(scene: Phaser.Scene): void {
    const key = this.key('noxcat.body');
    if (!scene.textures.exists(key)) {
      scene.load.svg(key, '/assets/ip/noxcat/noxcat-logo-bun-v5.svg', {
        width: 400,
        height: 368,
      });
    }
  }

  static key(key: AssetKey): string {
    return textureKeys[key];
  }

  static createRuntimeTextures(scene: Phaser.Scene): void {
    this.makeNoxcatBody(scene);
    this.makeNoxcatEyes(scene);
    this.makeNoxcatGoggles(scene);
    this.makeHitFlash(scene);
    this.makePaper(scene, false);
    this.makePaper(scene, true);
  }

  private static makeNoxcatBody(scene: Phaser.Scene): void {
    const key = this.key('noxcat.body');
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    // Official primary black from the supplied character usage guide.
    graphics.fillStyle(NOXCAT_OFFICIAL_BLACK, 1);
    graphics.fillPoints(sampleNoxcatBunOutline(), true, true);
    graphics.generateTexture(key, 200, 184);
    graphics.destroy();
  }

  private static makeNoxcatEyes(scene: Phaser.Scene): void {
    const key = this.key('noxcat.eyes');
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);

    // Keep the Logo's clean oval language: one official-green fill per eye,
    // without pupils, irises, gradients or highlights.
    graphics.fillStyle(NOXCAT_OFFICIAL_GREEN, 1);
    for (const eye of NOXCAT_EYES) {
      graphics.fillEllipse(eye.x, eye.y, eye.width, eye.height);
    }

    graphics.generateTexture(key, NOXCAT_FACE_TEXTURE.width, NOXCAT_FACE_TEXTURE.height);
    graphics.destroy();
  }

  private static makeNoxcatGoggles(scene: Phaser.Scene): void {
    const key = this.key('noxcat.goggles');
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);

    // A separate optional flat accessory: dark strap, medium-grey frame and
    // bridge, with the official green as the only saturated lens colour.
    graphics.lineStyle(3, NOXCAT_OFFICIAL_BLACK, 1);
    graphics.lineBetween(1, 8, 51, 8);
    graphics.fillStyle(NOXCAT_OFFICIAL_GREEN, 0.78);
    graphics.lineStyle(2, 0xb2b2b2, 1);
    for (const lens of NOXCAT_GOGGLE_LENSES) {
      graphics.fillRoundedRect(lens.x, lens.y, lens.width, lens.height, lens.radius);
      graphics.strokeRoundedRect(lens.x, lens.y, lens.width, lens.height, lens.radius);
    }
    graphics.lineBetween(23, 7, 29, 7);

    graphics.generateTexture(key, NOXCAT_FACE_TEXTURE.width, NOXCAT_FACE_TEXTURE.height);
    graphics.destroy();
  }

  private static makeHitFlash(scene: Phaser.Scene): void {
    const key = this.key('noxcat.hit');
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 0.92);
    graphics.fillCircle(48, 48, 42);
    graphics.generateTexture(key, 96, 96);
    graphics.destroy();
  }

  private static makePaper(scene: Phaser.Scene, returnable: boolean): void {
    const asset: AssetKey = returnable ? 'projectile.returnable' : 'projectile.paper';
    const key = this.key(asset);
    if (scene.textures.exists(key)) return;
    const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
    // Offset backing, face and top highlight give each card a readable 2.5D
    // thickness before Projectile applies its camera-depth scale animation.
    graphics.fillStyle(0x050805, 0.78);
    graphics.fillRoundedRect(6, 8, 40, 52, 3);
    graphics.fillStyle(returnable ? 0x10160f : 0xe9f0d9, 1);
    graphics.lineStyle(returnable ? 4 : 2, returnable ? 0xd7ff32 : 0x879071, 1);
    graphics.fillRoundedRect(3, 3, 42, 56, 3);
    graphics.strokeRoundedRect(3, 3, 42, 56, 3);
    graphics.lineStyle(2, returnable ? 0xe7ff77 : 0xffffff, 0.72);
    graphics.lineBetween(6, 6, 41, 6);
    graphics.lineBetween(6, 6, 6, 52);
    graphics.lineStyle(3, returnable ? 0xd7ff32 : 0x1b2219, 1);
    graphics.lineBetween(12, 43, 35, 43);
    graphics.lineBetween(12, 49, 29, 49);
    if (returnable) {
      graphics.strokeCircle(24, 23, 11);
      graphics.beginPath();
      graphics.moveTo(30, 12);
      graphics.lineTo(36, 19);
      graphics.lineTo(27, 19);
      graphics.closePath();
      graphics.fillStyle(0xd7ff32, 1);
      graphics.fillPath();
    } else {
      graphics.lineBetween(13, 14, 35, 34);
      graphics.lineBetween(35, 14, 13, 34);
    }
    graphics.generateTexture(key, 48, 62);
    graphics.destroy();
  }
}
