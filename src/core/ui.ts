import Phaser from 'phaser';
import { COLORS, txt, FONT_TITLE } from './theme';
import { playSfx } from './audio';
import { isModern } from './style';

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  textColor?: string;
  size?: number;
  sfx?: string;
}

/** Lightens (k > 0) or darkens (k < 0) a colour. */
function shade(color: number, k: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

/**
 * Button with a keyboard-friendly callback. Retro style: chunky block with an offset shadow
 * that presses down. Modern style: rounded pill with a soft shadow, a light top sheen and a
 * springy press.
 */
export class Button extends Phaser.GameObjects.Container {
  private face!: Phaser.GameObjects.Rectangle;
  private label!: Phaser.GameObjects.Text;
  private onClick: () => void;
  private lift = 8;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, o: ButtonOptions = {}) {
    super(scene, x, y);
    const w = o.width ?? 360, h = o.height ?? 96;
    this.onClick = onClick;
    if (isModern()) {
      this.buildModern(w, h, text, o);
      return;
    }
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

  private buildModern(w: number, h: number, text: string, o: ButtonOptions): void {
    const scene = this.scene;
    const color = o.color ?? COLORS.red;
    const r = Math.min(h / 2, 30);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(shade(color, -0.25), 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(shade(color, 0.35), 0.5).fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.42, { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
    g.lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r);
    this.label = txt(scene, 0, 0, text, { title: true, size: o.size ?? 30, color: o.textColor ?? '#ffffff', strokeThickness: 0, shadow: false });
    this.label.setShadow(0, 2, 'rgba(0,0,0,0.35)', 4, false, true);
    this.add([g, this.label]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    const sfx = o.sfx ?? 'ui-click';
    const to = (s: number, d = 90) => scene.tweens.add({ targets: this, scale: s, duration: d, ease: 'Quad.easeOut' });
    this.on('pointerover', () => to(1.04, 120));
    this.on('pointerdown', () => to(0.95, 70));
    this.on('pointerout', () => to(1, 120));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
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
  const bg = isModern()
    ? scene.add.circle(0, 0, size / 2, 0x0b1020, 0.55).setStrokeStyle(2, 0xffffff, 0.35)
    : scene.add.rectangle(0, 0, size, size, 0x000000, 0.45).setStrokeStyle(4, 0xffffff, 0.8);
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
  const r = scene.add.rectangle(0, 0, width, height, isModern() ? 0x0b1020 : COLORS.dark, alpha).setOrigin(0).setInteractive();
  if (isModern()) {
    r.setAlpha(0);
    scene.tweens.add({ targets: r, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
  }
  return r;
}

/**
 * Modern style only: a rounded glass card behind overlay content (pause, results), from y0 to y1
 * (fractions of the screen height). Does nothing in the retro style.
 */
export function overlayCard(scene: Phaser.Scene, y0: number, y1: number, width?: number): void {
  if (!isModern()) return;
  const { width: W, height: H } = scene.scale;
  const w = width ?? Math.min(W - 64, 660), top = H * y0, h = H * (y1 - y0);
  const g = scene.add.graphics({ x: W / 2, y: top + h / 2 });
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, 36);
  g.fillStyle(0x151b30, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, 36);
  g.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(-w / 2, -h / 2, w, h, 36);
  g.setScale(0.92).setAlpha(0);
  scene.tweens.add({ targets: g, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
}
