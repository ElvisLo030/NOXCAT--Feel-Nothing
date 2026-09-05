import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    // These are the authored-world defaults. Scale.RESIZE changes the canvas
    // backing dimensions to the live viewport while BattleScene keeps the
    // render camera uniformly scaled.
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
      // The canvas follows its parent exactly. BattleScene applies a uniform
      // camera zoom and exposes extra world space for non-9:16 phones, which
      // removes letterboxing without distorting game art.
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
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
