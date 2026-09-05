import Phaser from 'phaser';
import { PALETTE } from '../../theme/palette';
import { AIM_MAX_PULL } from '../constants';

export class AimGuide {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(40).setVisible(false);
  }

  show(anchorX: number, anchorY: number, pointerX: number, pointerY: number): number {
    const pullVector = new Phaser.Math.Vector2(pointerX - anchorX, pointerY - anchorY);
    const pull = Math.min(AIM_MAX_PULL, pullVector.length());
    if (pullVector.lengthSq() === 0) pullVector.set(0, 1);
    pullVector.normalize();
    const launchVector = pullVector.clone().negate();
    const startX = anchorX;
    const startY = anchorY;
    const length = 74 + 215 * (pull / AIM_MAX_PULL);
    const endX = startX + launchVector.x * length;
    const endY = startY + launchVector.y * length;
    this.graphics.setVisible(true).clear();
    this.graphics.lineStyle(4, PALETTE.green, 0.92);
    this.graphics.lineBetween(startX, startY, endX, endY);
    this.graphics.fillStyle(PALETTE.green, 1);
    const perpendicular = new Phaser.Math.Vector2(-launchVector.y, launchVector.x);
    this.graphics.fillTriangle(
      endX,
      endY,
      endX - launchVector.x * 25 + perpendicular.x * 12,
      endY - launchVector.y * 25 + perpendicular.y * 12,
      endX - launchVector.x * 25 - perpendicular.x * 12,
      endY - launchVector.y * 25 - perpendicular.y * 12
    );
    this.graphics.lineStyle(2, 0xffffff, 0.32);
    for (let index = 1; index <= 3; index += 1) {
      const t = index / 4;
      const x = startX + launchVector.x * length * t;
      const y = startY + launchVector.y * length * t;
      this.graphics.strokeCircle(x, y, 4);
    }
    return pull;
  }

  hide(): void {
    this.graphics.clear().setVisible(false);
  }
}
