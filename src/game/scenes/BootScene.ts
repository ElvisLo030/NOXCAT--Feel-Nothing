import Phaser from 'phaser';
import { AssetRegistry } from '../../assets/AssetRegistry';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    AssetRegistry.preload(this);
  }

  create(): void {
    AssetRegistry.createRuntimeTextures(this);
    this.scene.start('BattleScene');
  }
}
