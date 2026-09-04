import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#070a08',
    transparent: false,
    antialias: true,
    pixelArt: false,
    render: {
      antialias: true,
      roundPixels: false,
      powerPreference: 'high-performance'
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    input: {
      activePointers: 2,
      // The character rig supplies its own spring and wobble. Pointer-level
      // averaging added a second layer of latency that was especially visible
      // on 60 Hz phones.
      smoothFactor: 0
    },
    fps: {
      target: 60,
      min: 30,
      smoothStep: false
    },
    scene: [BootScene, BattleScene]
  };
}
