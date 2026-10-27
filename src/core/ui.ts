import Phaser from 'phaser';
import { COLORS, txt, FONT_TITLE } from './theme';
import { playSfx } from './audio';

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  textColor?: string;
  size?: number;
  sfx?: string;
}

/** Chunky retro button: offset shadow, press-down on tap, keyboard-friendly callback. */
export class Button extends Phaser.GameObjects.Container {
  private face: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private onClick: () => void;
  private lift = 8;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOptions = {}) {
    super(scene, x, y);
    const w = o.width ?? 360, h = o.height ?? 96;
    this.onClick = onClick;
    const shadow = scene.add.rectangle(0, this.lift, w, h, 0x000000, 0.55);
    this.face = scene.add.rectangle(0, 0, w, h, o.color ?? COLORS.red).setStrokeStyle(6, 0x000000);
    const hl = scene.add.rectangle(0, -h / 2 + 10, w - 20, 6, 0xffffff, 0.35);
    this.label = txt(scene, 0, 2, text, { title: true, size: o.size ?? 30, color: o.textColor ?? '#ffffff', strokeThickness: 0, shadow: false });
    this.add([shadow, this.face, hl, this.label]);
    this.setSize(w, h + this.lift);
    this.setInteractive({ useHandCursor: true });
    const sfx = o.sfx ?? 'ui-click';
    this.on('pointerdown', () => {
      this.face.y = this.label.y = 4;
      hl.y = -h / 2 + 14;
    });
    const release = () => {
      this.face.y = 0; this.label.y = 2; hl.y = -h / 2 + 10;
    };
    this.on('pointerout', release);
    this.on('pointerup', () => {
      release();
      playSfx(scene, sfx);
      this.onClick();
    });
    scene.add.existing(this);
  }

  setText(s: string): this {
    this.label.setText(s);
    return this;
  }

  /** Programmatic press (keyboard shortcut). */
  press(): void {
    playSfx(this.scene, 'ui-click');
    this.onClick();
  }
}

/** Small square icon button using a Kenney game-icon texture key. */
export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: string, onClick: () => void, size = 72): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, size, size, 0x000000, 0.45).setStrokeStyle(4, 0xffffff, 0.8);
  const img = scene.add.image(0, 0, icon).setDisplaySize(size * 0.62, size * 0.62);
  c.add([bg, img]);
  c.setSize(size, size).setInteractive({ useHandCursor: true });
  c.on('pointerup', () => {
    playSfx(scene, 'ui-click');
    onClick();
  });
  c.setData('icon', img);
  return c;
}

/** Retro HUD: score left, extra info right. Fixed to the camera. */
export class Hud {
  private scoreText: Phaser.GameObjects.Text;
  private rightText: Phaser.GameObjects.Text;
  private centerText: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, label: string) {
    const w = scene.scale.width;
    const style = { fontFamily: FONT_TITLE, fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };
    this.scoreText = scene.add.text(24, 24, `${label} 0`, style).setScrollFactor(0).setDepth(9000);
    this.centerText = scene.add.text(w / 2, 24, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9000);
    this.rightText = scene.add.text(w - 120, 24, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(9000);
    this.label = label;
  }

  private label: string;

  setScore(v: number): void {
    this.scoreText.setText(`${this.label} ${v}`);
  }

  /** Right-aligned slot (lives, level, timer...). Leaves room for the pause button. */
  setRight(s: string): void {
    this.rightText.setText(s);
  }

  setCenter(s: string): void {
    this.centerText.setText(s);
  }

  setVisible(v: boolean): void {
    this.scoreText.setVisible(v);
    this.rightText.setVisible(v);
    this.centerText.setVisible(v);
  }
}

/** Dim full-screen backdrop used by overlays. */
export function backdrop(scene: Phaser.Scene, alpha = 0.7): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale;
  return scene.add.rectangle(0, 0, width, height, COLORS.dark, alpha).setOrigin(0).setInteractive();
}
