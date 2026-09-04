import Phaser from 'phaser';
import { BOSS_MAX_HP } from '../constants';

export class Boss extends Phaser.GameObjects.Container {
  readonly weakPoint: Phaser.GameObjects.Arc;
  private readonly shell: Phaser.GameObjects.Graphics;
  private readonly screen: Phaser.GameObjects.Rectangle;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly crack: Phaser.GameObjects.Graphics;
  private readonly weakLabel: Phaser.GameObjects.Text;
  private hp = BOSS_MAX_HP;

  constructor(scene: Phaser.Scene, name: string, weakPointLabel: string) {
    super(scene, 270, 250);
    scene.add.existing(this);
    this.setDepth(8);

    const paperStack = scene.add.graphics();
    paperStack.fillStyle(0x141a12, 1);
    for (let index = 0; index < 9; index += 1) {
      paperStack.fillRect(-65 + ((index % 3) - 1) * 5, 98 + index * 8, 130, 12);
    }

    this.shell = scene.add.graphics();
    this.drawShell(0xd7ff32, 0.3);
    this.screen = scene.add.rectangle(0, -15, 218, 139, 0x061006, 1)
      .setStrokeStyle(5, 0x202a1c, 1);
    this.face = scene.add.graphics();
    this.drawFace(1);
    this.crack = scene.add.graphics().setVisible(false);
    this.label = scene.add.text(0, 72, weakPointLabel, {
      fontFamily: 'Inter, Noto Sans TC, system-ui, sans-serif',
      fontSize: '16px',
      fontStyle: '700',
      color: '#071008',
      backgroundColor: '#d7ff32',
      padding: { x: 7, y: 3 }
    }).setOrigin(0.5).setRotation(-0.08);
    this.weakPoint = scene.add.circle(0, -13, 38, 0xd7ff32, 0.12)
      .setStrokeStyle(4, 0xd7ff32, 0.95)
      .setVisible(false);
    this.weakLabel = scene.add.text(0, -13, 'WEAK', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#d7ff32'
    }).setOrigin(0.5).setVisible(false);

    const hands = scene.add.graphics();
    hands.fillStyle(0x080b08, 1);
    hands.lineStyle(3, 0x71851e, 0.65);
    hands.fillRoundedRect(-187, 65, 105, 49, 22);
    hands.strokeRoundedRect(-187, 65, 105, 49, 22);
    hands.fillRoundedRect(82, 65, 105, 49, 22);
    hands.strokeRoundedRect(82, 65, 105, 49, 22);
    this.add([paperStack, this.shell, this.screen, this.face, this.crack, this.label, hands, this.weakPoint, this.weakLabel]);

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

  setHp(hp: number): void {
    this.hp = Phaser.Math.Clamp(hp, 0, BOSS_MAX_HP);
    const ratio = this.hp / BOSS_MAX_HP;
    this.drawFace(ratio);
    this.crack.clear();
    if (ratio <= 0.68) {
      this.crack.setVisible(true);
      this.crack.lineStyle(3, 0xd7ff32, ratio <= 0.33 ? 0.95 : 0.58);
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
    this.screen.setFillStyle(major ? 0xcfff36 : 0x375312, major ? 0.56 : 0.35);
    this.scene.time.delayedCall(95, () => this.screen.setFillStyle(0x061006, 1));
  }

  pulse(time: number): void {
    const glow = 0.18 + (Math.sin(time * 0.004) + 1) * 0.08;
    this.drawShell(0xd7ff32, glow);
  }

  private drawShell(colour: number, glowAlpha: number): void {
    this.shell.clear();
    this.shell.fillStyle(0xd7ddba, 0.2);
    this.shell.lineStyle(9, colour, glowAlpha);
    this.shell.fillRoundedRect(-132, -103, 264, 212, 26);
    this.shell.strokeRoundedRect(-132, -103, 264, 212, 26);
    this.shell.fillStyle(0x0c110c, 1);
    this.shell.fillCircle(109, 65, 7);
    this.shell.fillStyle(0xd7ff32, 1);
    this.shell.fillCircle(109, 88, 5);
  }

  private drawFace(hpRatio: number): void {
    this.face.clear();
    this.face.lineStyle(13, 0xd7ff32, 1);
    if (hpRatio > 0.33) {
      this.face.lineBetween(-68, -43, -20, -18);
      this.face.lineBetween(20, -18, 68, -43);
      this.face.lineBetween(-51, 31, 0, 13);
      this.face.lineBetween(0, 13, 51, 31);
    } else {
      this.face.lineBetween(-63, -31, -27, -26);
      this.face.lineBetween(27, -26, 63, -31);
      this.face.lineBetween(-44, 18, 0, 35);
      this.face.lineBetween(0, 35, 44, 18);
    }
  }
}
