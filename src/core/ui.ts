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

// ---------- HUD icons ----------
const HEART_PIXELS = [
  '.XX...XX.',
  'XHHX.XRRX',
  'XHRRXRRRX',
  'XRRRRRRRX',
  'XRRRRRRDX',
  '.XRRRRDX.',
  '..XRRDX..',
  '...XDX...',
  '....X....',
];
const FLAG_PIXELS = [
  'PRRRRR.',
  'PRRRRRR',
  'PRRRRR.',
  'PRRRR..',
  'P......',
  'P......',
  'P......',
  'P......',
];

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

function pixelArt(c: CanvasRenderingContext2D, rows: string[], p: number, colors: Record<string, string>): void {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!colors[ch]) return;
    c.fillStyle = colors[ch]; c.fillRect(x * p, y * p, p, p);
  }));
}

function heartPath(c: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number): void {
  c.beginPath();
  c.moveTo(cx, top + h * 0.3);
  c.bezierCurveTo(cx, top, cx - w / 2, top, cx - w / 2, top + h * 0.32);
  c.bezierCurveTo(cx - w / 2, top + h * 0.6, cx - w * 0.15, top + h * 0.78, cx, top + h);
  c.bezierCurveTo(cx + w * 0.15, top + h * 0.78, cx + w / 2, top + h * 0.6, cx + w / 2, top + h * 0.32);
  c.bezierCurveTo(cx + w / 2, top, cx, top, cx, top + h * 0.3);
  c.closePath();
}

/** Heart (full and empty) and level-flag icons, pixel art in the retro style, smooth in the modern one. */
function hudIcons(scene: Phaser.Scene): { heart: string; empty: string; flag: string } {
  if (!isModern()) {
    return {
      heart: canvasTex(scene, 'hud-heart-r', 27, 27, (c) => pixelArt(c, HEART_PIXELS, 3, { X: '#1a0a0a', R: '#ec3013', H: '#ffb3a6', D: '#a21d10' })),
      empty: canvasTex(scene, 'hud-heart-r0', 27, 27, (c) => pixelArt(c, HEART_PIXELS, 3, { X: '#1a0a0a', R: '#3a2a30', H: '#4a3a40', D: '#2a1a20' })),
      flag: canvasTex(scene, 'hud-flag-r', 21, 24, (c) => pixelArt(c, FLAG_PIXELS, 3, { P: '#f3f2f2', R: '#ffd23f' })),
    };
  }
  const heart = (key: string, fill: [string, string], gloss: boolean) => canvasTex(scene, key, 34, 32, (c) => {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
    heartPath(c, 17, 3, 28, 25);
    const g = c.createLinearGradient(0, 3, 0, 28);
    g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]);
    c.fillStyle = g; c.fill(); c.restore();
    heartPath(c, 17, 3, 28, 25);
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
    if (gloss) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(10.5, 10, 4, 2.6, -0.6, 0, Math.PI * 2); c.fill(); }
  });
  return {
    heart: heart('hud-heart-m', ['#ff6f8e', '#e0244f'], true),
    empty: heart('hud-heart-m0', ['rgba(30,24,50,0.7)', 'rgba(20,16,36,0.7)'], false),
    flag: canvasTex(scene, 'hud-flag-m', 24, 26, (c) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(3, 2, 3, 22, 1.5); c.fill();
      const g = c.createLinearGradient(6, 3, 22, 14);
      g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#ffb52e');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(6, 3); c.quadraticCurveTo(14, 0, 22, 4); c.lineTo(22, 13); c.quadraticCurveTo(14, 9, 6, 14); c.closePath(); c.fill();
    }),
  };
}

/** Most hearts drawn one by one; above this the HUD shows one heart and the number. */
const MAX_HEARTS = 5;

/**
 * Game HUD, fixed to the camera: score left, a centre slot and a right slot (which leaves room
 * for the pause button). Games with lives or levels use the standard widgets:
 * - `setLives(n, max?)`: hearts in the right slot (one heart and the number above five lives;
 *   with `max`, lost lives show as empty hearts).
 * - `setLevel(n)`: a flag badge with the level number in the centre slot. A centre text set
 *   with `setCenter()` takes its place while it is not empty.
 */
export class Hud {
  private scoreText: Phaser.GameObjects.Text;
  private rightText: Phaser.GameObjects.Text;
  private centerText: Phaser.GameObjects.Text;
  private icons: { heart: string; empty: string; flag: string };
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesNum: Phaser.GameObjects.Text;
  private lives = -1;
  private livesMax = 0;
  private level: Phaser.GameObjects.Container;
  private levelBg: Phaser.GameObjects.Graphics;
  private levelText: Phaser.GameObjects.Text;
  private levelSet = false;
  private visible = true;
  private label: string;
  private readonly rightX: number;

  constructor(private scene: Phaser.Scene, label: string) {
    const w = scene.scale.width;
    const style = { fontFamily: FONT_TITLE, fontSize: '22px', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };
    this.rightX = w - 120;
    this.scoreText = scene.add.text(24, 24, `${label} 0`, style).setScrollFactor(0).setDepth(9000);
    this.centerText = scene.add.text(w / 2, 24, '', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9000);
    this.rightText = scene.add.text(this.rightX, 24, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(9000);
    this.label = label;
    this.icons = hudIcons(scene);
    this.livesNum = scene.add.text(this.rightX, 24, '', style).setOrigin(1, 0).setScrollFactor(0).setDepth(9000).setVisible(false);
    // level badge: a dark pill with the flag and the number
    this.levelBg = scene.add.graphics();
    const flag = scene.add.image(0, 0, this.icons.flag).setOrigin(0, 0.5);
    this.levelText = scene.add.text(0, 1, '', style).setOrigin(0, 0.5);
    this.level = scene.add.container(w / 2, 36, [this.levelBg, flag, this.levelText]).setScrollFactor(0).setDepth(9000).setVisible(false);
    this.level.setData('flag', flag);
  }

  setScore(v: number): void {
    this.scoreText.setText(`${this.label} ${v}`);
  }

  /** Right-aligned slot (timer, coins ...). Leaves room for the pause button. */
  setRight(s: string): void {
    this.rightText.setText(s);
    this.layoutLives();
  }

  setCenter(s: string): void {
    this.centerText.setText(s);
    this.level.setVisible(this.visible && this.levelSet && !s);
  }

  /** Lives as hearts in the right slot; the lost heart pops, the last one beats. */
  setLives(n: number, max = 0): void {
    n = Math.max(0, Math.floor(n));
    const prev = this.lives;
    if (n === prev && max === this.livesMax) return;
    this.lives = n; this.livesMax = max;
    const s = this.scene;
    const count = max && max <= MAX_HEARTS ? max : n <= MAX_HEARTS ? n : 1;
    const compact = !(max && max <= MAX_HEARTS) && n > MAX_HEARTS;
    // a heart that was just lost pops away
    if (prev > n && !compact && prev <= MAX_HEARTS) {
      for (let i = n; i < Math.min(prev, this.hearts.length); i++) {
        const h = this.hearts[i];
        const ghost = s.add.image(h.x, h.y, this.icons.heart).setScrollFactor(0).setDepth(9001).setScale(h.scale);
        s.tweens.add({ targets: ghost, scale: h.scale * 2, alpha: 0, angle: 25, duration: 380, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
      }
    }
    while (this.hearts.length < count) this.hearts.push(s.add.image(0, 36, this.icons.heart).setScrollFactor(0).setDepth(9000));
    while (this.hearts.length > count) this.hearts.pop()!.destroy();
    this.livesNum.setVisible(this.visible && compact).setText(compact ? String(n) : '');
    this.hearts.forEach((h, i) => {
      s.tweens.killTweensOf(h);
      h.setScale(1).setAngle(0).setTexture(compact || i < n ? this.icons.heart : this.icons.empty).setVisible(this.visible);
    });
    this.layoutLives();
    // a gained heart pops in
    if (n > prev && prev >= 0) {
      const h = compact ? this.hearts[0] : this.hearts[n - 1];
      if (h) s.tweens.add({ targets: h, scale: { from: 1.8, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    }
    // the last life beats
    if (n === 1 && this.hearts[0]) s.tweens.add({ targets: this.hearts[0], scale: 1.25, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Hearts sit at the right end of the right slot, left of any right-slot text. */
  private layoutLives(): void {
    if (!this.hearts.length) return;
    let right = this.rightX - (this.rightText.text ? this.rightText.width + 18 : 0);
    if (this.livesNum.text) { this.livesNum.setX(right); right -= this.livesNum.width + 6; }
    const step = isModern() ? 36 : 32;
    // index 0 sits rightmost, so a lost life empties the leftmost heart
    this.hearts.forEach((h, i) => h.setPosition(right - h.width / 2 - i * step, 36));
  }

  /** The level as a flag badge in the centre slot. */
  setLevel(n: number | string): void {
    const text = String(n);
    const changed = this.levelSet && this.levelText.text !== text;
    this.levelSet = true;
    this.levelText.setText(text);
    const flag = this.level.getData('flag') as Phaser.GameObjects.Image;
    const w = flag.width + 10 + this.levelText.width, pad = 16, h = 42;
    flag.setX(-w / 2);
    this.levelText.setX(-w / 2 + flag.width + 10);
    const g = this.levelBg.clear();
    if (isModern()) {
      g.fillStyle(0x0b1020, 0.55).fillRoundedRect(-w / 2 - pad, -h / 2, w + pad * 2, h, h / 2);
      g.lineStyle(2, 0xffffff, 0.3).strokeRoundedRect(-w / 2 - pad, -h / 2, w + pad * 2, h, h / 2);
    } else {
      g.fillStyle(0x000000, 0.6).fillRect(-w / 2 - pad, -h / 2, w + pad * 2, h);
      g.lineStyle(3, 0xffd23f, 1).strokeRect(-w / 2 - pad, -h / 2, w + pad * 2, h);
    }
    this.level.setVisible(this.visible && !this.centerText.text);
    if (changed) this.scene.tweens.add({ targets: this.level, scale: { from: 1.35, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.scoreText.setVisible(v);
    this.rightText.setVisible(v);
    this.centerText.setVisible(v);
    for (const h of this.hearts) h.setVisible(v);
    this.livesNum.setVisible(v && this.lives > MAX_HEARTS && !(this.livesMax && this.livesMax <= MAX_HEARTS));
    this.level.setVisible(v && this.levelSet && !this.centerText.text);
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
