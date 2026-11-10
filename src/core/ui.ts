import Phaser from 'phaser';
import { COLORS, txt, FONT_TITLE } from './theme';
import { playSfx } from './audio';
import { isModern, MODERN_TITLE, MODERN_BODY } from './style';

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
  // modern: a round piece of the HUD glass
  const bg = isModern()
    ? scene.add.image(0, 0, chipTexture(scene, size, size))
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

// ---------- HUD chips ----------

/** Height of a HUD chip. */
export const HUD_CHIP_H = 44;
/** Centre line of the top HUD row: level with the pause button. */
export const HUD_ROW_Y = 50;
/** Centre line of the second HUD row, for readouts that do not fit the first. */
export const HUD_ROW2_Y = HUD_ROW_Y + HUD_CHIP_H + 20;
/** Distance of the left and right chips from the screen edges. */
export const HUD_MARGIN = 16;
/** Space between neighbouring chips. */
export const HUD_GAP = 10;
/** Right edge of the right-most chip in the top row: clear of the pause button (72 px at w-52). */
export const hudRightEdge = (scene: Phaser.Scene): number => scene.scale.width - 100;

export type HudChipAlign = 'left' | 'center' | 'right';

export interface HudChipOptions {
  /** Which part of the chip sits at x: its left edge (default), centre or right edge. */
  align?: HudChipAlign;
  /** The readout. */
  text?: string;
  /** A small caption before the text ("SCORE"), dimmed in the modern style, yellow in retro. */
  label?: string;
  /** Texture key of an icon before the text (coin, gem, clock ...). */
  icon?: string;
  /** Frame of the icon texture (spritesheets, atlases). */
  iconFrame?: string | number;
  /** Icon height in px (default 30). */
  iconSize?: number;
  /** Text colour (default white). */
  color?: string;
  /** Font size of the text (default 26 modern, 18 retro). */
  size?: number;
  /** Chips never get narrower than this. */
  minWidth?: number;
  /** Chip height (default HUD_CHIP_H). */
  height?: number;
  /** Retro style: border colour (default the HUD yellow). */
  accent?: number;
  /** Display depth (default 9000, the HUD's). */
  depth?: number;
  /** Other objects to put in the chip, after the icon/label/text (a chip around existing objects). */
  items?: Phaser.GameObjects.GameObject[];
}

/** The HUD text style: no heavy outline; a soft shadow (modern) or a hard 2 px one (retro). */
export function hudText(scene: Phaser.Scene, s: string, size?: number, color = '#ffffff'): Phaser.GameObjects.Text {
  const modern = isModern();
  const t = scene.add.text(0, 0, s, {
    fontFamily: modern ? `"${MODERN_TITLE}", sans-serif` : FONT_TITLE,
    fontStyle: modern ? '700' : 'normal',
    fontSize: `${size ?? (modern ? 26 : 18)}px`,
    color,
  }).setOrigin(0.5);
  if (modern) t.setShadow(0, 1, 'rgba(0,0,0,0.5)', 4, false, true);
  else t.setShadow(2, 2, '#000000', 0, false, true);
  return t;
}

function hudCaption(scene: Phaser.Scene, s: string): Phaser.GameObjects.Text {
  const modern = isModern();
  const t = scene.add.text(0, 0, s, {
    fontFamily: modern ? `"${MODERN_BODY}", sans-serif` : FONT_TITLE,
    fontStyle: modern ? '800' : 'normal',
    fontSize: modern ? '15px' : '12px',
    color: modern ? '#ffffff' : '#ffd23f',
  }).setOrigin(0.5);
  if (modern) t.setAlpha(0.78).setLetterSpacing(1).setShadow(0, 1, 'rgba(0,0,0,0.4)', 3, false, true);
  else t.setShadow(2, 2, '#000000', 0, false, true);
  return t;
}

/** Room around a modern chip in its texture for the soft drop shadow. */
const GLASS_PAD = 12;

function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

/**
 * Draws a chip background of `w` x `h` (plus the shadow pad in the modern style) into `c`.
 * Modern: frosted glass, i.e. a soft shadow, a dark translucent body under a white veil, a top
 * sheen and a hairline rim that is bright on top. Retro: a square dark box with a 3 px border.
 */
function drawChip(c: CanvasRenderingContext2D, w: number, h: number, accent: number): void {
  if (!isModern()) {
    c.fillStyle = 'rgba(0,0,0,0.62)';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#' + accent.toString(16).padStart(6, '0');
    c.fillRect(0, 0, w, 3); c.fillRect(0, h - 3, w, 3);
    c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
    return;
  }
  const x = GLASS_PAD, y = GLASS_PAD, r = h / 2;
  // drop shadow, outside the glass only (the body is translucent)
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.42)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
  roundRectPath(c, x, y, w, h, r); c.fillStyle = '#000'; c.fill();
  c.restore();
  c.save();
  c.globalCompositeOperation = 'destination-out';
  roundRectPath(c, x, y, w, h, r); c.fill();
  c.restore();
  // body: a dark tint, a little deeper at the bottom, under a white veil
  const body = c.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, 'rgba(30,36,60,0.42)');
  body.addColorStop(1, 'rgba(10,13,28,0.52)');
  roundRectPath(c, x, y, w, h, r); c.fillStyle = body; c.fill();
  c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
  // top sheen
  c.save();
  roundRectPath(c, x, y, w, h, r); c.clip();
  const sheen = c.createLinearGradient(0, y, 0, y + h * 0.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sheen; c.fillRect(x, y, w, h * 0.6);
  c.restore();
  // hairline rim, bright on top
  const rim = c.createLinearGradient(0, y, 0, y + h);
  rim.addColorStop(0, 'rgba(255,255,255,0.75)');
  rim.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  rim.addColorStop(1, 'rgba(255,255,255,0.14)');
  roundRectPath(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r - 0.75);
  c.lineWidth = 1.5; c.strokeStyle = rim; c.stroke();
}

/** Bakes a chip background of w x h (modern: plus the shadow pad) once and returns its texture key. */
function chipTexture(scene: Phaser.Scene, w: number, h: number, accent: number = COLORS.yellow): string {
  const modern = isModern(), pad = modern ? GLASS_PAD : 0;
  const key = `hud-chip-${modern ? 'm' : 'r'}-${h}-${accent.toString(16)}-${w}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w + pad * 2, h + pad * 2);
  if (!tex) return key;
  drawChip(tex.getContext(), w, h, accent);
  tex.refresh();
  tex.setFilter(modern ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** Chip background: a 3-slice in WebGL (cheap to resize, crisp corners), a baked image in Canvas mode. */
class ChipBg {
  readonly obj: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image;
  private readonly pad: number;
  private readonly cap: number;
  private w = -1;

  constructor(private scene: Phaser.Scene, private h: number, private accent: number) {
    const modern = isModern();
    this.pad = modern ? GLASS_PAD : 0;
    this.cap = modern ? h / 2 + this.pad : 6;
    if (scene.sys.renderer.type === Phaser.WEBGL) {
      const tw = this.cap * 2 + 4, th = h + this.pad * 2;
      const key = this.bake(tw - this.pad * 2);
      this.obj = scene.add.nineslice(0, 0, key, undefined, tw, th, this.cap, this.cap, 0, 0);
    } else {
      this.obj = scene.add.image(0, 0, this.bake(h));
    }
  }

  private bake(w: number): string {
    return chipTexture(this.scene, w, this.h, this.accent);
  }

  /** Width of the chip itself, without the shadow pad. */
  setWidth(w: number): void {
    if (w === this.w) return;
    this.w = w;
    if (this.obj instanceof Phaser.GameObjects.NineSlice) this.obj.setSize(w + this.pad * 2, this.h + this.pad * 2);
    else this.obj.setTexture(this.bake(Math.round(w / 4) * 4));
  }
}

/**
 * One HUD readout in its own chip: frosted glass in the modern style, a plain box in retro.
 * The chip lays its content out in a row (icon, caption, text, then any extra items) and fits
 * its width to it; `x` stays at the chosen edge (`align`) as the content changes.
 */
export class HudChip extends Phaser.GameObjects.Container {
  readonly text: Phaser.GameObjects.Text;
  readonly caption?: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  /** Current chip width (without the shadow). */
  chipWidth = 0;
  private bg: ChipBg;
  private extra: Phaser.GameObjects.GameObject[] = [];
  private align: HudChipAlign;
  private readonly chipH: number;
  private readonly minW: number;

  constructor(scene: Phaser.Scene, x: number, y: number, o: HudChipOptions = {}) {
    super(scene, x, y);
    this.align = o.align ?? 'left';
    this.chipH = o.height ?? HUD_CHIP_H;
    this.minW = Math.max(o.minWidth ?? 0, this.chipH);
    this.bg = new ChipBg(scene, this.chipH, o.accent ?? COLORS.yellow);
    this.add(this.bg.obj);
    if (o.label) { this.caption = hudCaption(scene, o.label); this.add(this.caption); }
    this.text = hudText(scene, o.text ?? '', o.size, o.color);
    this.add(this.text);
    if (o.icon) this.setIcon(o.icon, o.iconFrame, o.iconSize);
    this.setDepth(o.depth ?? 9000);
    scene.add.existing(this);
    this.setItems(o.items ?? []);
  }

  /** Replaces the extra content (hearts, a second icon ...) after the icon, caption and text. */
  setItems(items: Phaser.GameObjects.GameObject[]): this {
    for (const it of this.extra) if (!items.includes(it)) this.remove(it);
    this.extra = items;
    for (const it of items) if (it.parentContainer !== this) this.add(it);
    // children follow the camera-fixed container (Phaser applies each child's own scroll factor)
    this.setScrollFactor(0, 0, true);
    return this.layout();
  }

  /**
   * Sets (or with `null` removes) the icon before the text, `size` px high. The icon keeps its
   * slot width while it is tweened (a spinning coin), so the chip does not jitter.
   */
  setIcon(key: string | null, frame?: string | number, size = 30): this {
    if (!key) {
      this.icon?.destroy();
      this.icon = undefined;
      return this.layout();
    }
    if (!this.icon) {
      this.icon = this.scene.add.image(0, 0, key, frame);
      this.addAt(this.icon, 1);
      this.icon.setScrollFactor(0);
    } else this.icon.setTexture(key, frame);
    this.icon.setScale(size / this.icon.height);
    this.icon.setData('chipWidth', this.icon.width * this.icon.scaleX);
    return this.layout();
  }

  setText(s: string | number): this {
    const v = String(s);
    if (v !== this.text.text) { this.text.setText(v); this.layout(); }
    return this;
  }

  setCaption(s: string): this {
    if (this.caption && this.caption.text !== s) { this.caption.setText(s); this.layout(); }
    return this;
  }

  setTextColor(color: string): this {
    this.text.setColor(color);
    return this;
  }

  /** Moves the chip; `align` changes which edge sits at x. */
  setAnchor(x: number, y: number, align: HudChipAlign = this.align): this {
    this.setPosition(x, y);
    if (align === this.align) return this;
    this.align = align;
    return this.layout();
  }

  /** Left and right screen edges of the chip. */
  get left(): number { return this.x + this.offset(); }
  get right(): number { return this.left + this.chipWidth; }

  private offset(): number {
    return this.align === 'left' ? 0 : this.align === 'right' ? -this.chipWidth : -this.chipWidth / 2;
  }

  /** Lays the content out again (call after changing an item's size yourself). */
  layout(): this {
    const modern = isModern();
    const row: [Phaser.GameObjects.GameObject, number][] = [];
    const widthOf = (o: Phaser.GameObjects.GameObject): number => {
      const fixed = o.getData?.('chipWidth') as number | undefined;
      if (fixed !== undefined) return fixed;
      const c = o as unknown as { width?: number; scaleX?: number };
      return (c.width ?? 0) * Math.abs(c.scaleX ?? 1);
    };
    if (this.icon?.visible) row.push([this.icon, widthOf(this.icon)]);
    if (this.caption?.text) row.push([this.caption, this.caption.width]);
    if (this.text.text) row.push([this.text, this.text.width]);
    for (const it of this.extra) if ((it as unknown as { visible: boolean }).visible !== false) row.push([it, widthOf(it)]);
    const gap = modern ? 8 : 10;
    const inner = row.reduce((s, [, w]) => s + w, 0) + gap * Math.max(0, row.length - 1);
    const padX = modern ? 18 : 14;
    let w = Math.max(this.minW, Math.ceil(inner + padX * 2));
    if (!modern) w += w % 2;
    this.chipWidth = w;
    const off = this.offset();
    this.bg.setWidth(w);
    this.bg.obj.setPosition(off + w / 2, 0);
    let cx = off + (w - inner) / 2;
    for (const [o, ow] of row) {
      const t = o as unknown as Phaser.GameObjects.Components.Transform & { setOrigin?: (x: number, y: number) => unknown };
      t.setOrigin?.(0.5, 0.5);
      let x = cx + ow / 2;
      if (!modern) x = Math.round(x);
      // the title fonts sit a little high in their boxes
      t.setPosition(x, o === this.text ? (modern ? 1 : 2) : o === this.caption ? (modern ? 1 : 1) : 0);
      cx += ow + gap;
    }
    return this;
  }
}

/**
 * A HUD readout in a chip at (x, y), y being the chip's centre line (use `HUD_ROW_Y` for the top
 * row). Every always-visible game readout (coins, gems, timer, shots, combo ...) uses one, so the
 * HUD matches the core's score, lives and level chips. Fixed to the camera, depth 9000.
 */
export function hudChip(scene: Phaser.Scene, x: number, y: number, o: HudChipOptions = {}): HudChip {
  return new HudChip(scene, x, y, o);
}

/** Most hearts drawn one by one; above this the HUD shows one heart and the number. */
const MAX_HEARTS = 5;

/**
 * Game HUD, fixed to the camera, every readout in its own chip: the score on the left, a centre
 * slot and a right slot (clear of the pause button). Games with lives or levels use the standard
 * widgets:
 * - `setLives(n, max?)`: hearts in a chip left of the right slot (one heart and the number above
 *   five lives; with `max`, lost lives show as empty hearts).
 * - `setLevel(n)`: a flag chip with the level number in the centre slot. A centre text set
 *   with `setCenter()` takes its place while it is not empty.
 * When the top row is too full, the right text and then the centre move to a second row.
 */
export class Hud {
  /** The chips, for a game that wants to pulse or tint one (`hud.rightChip.icon` ...). */
  readonly scoreChip: HudChip;
  readonly rightChip: HudChip;
  readonly centerChip: HudChip;
  readonly livesChip: HudChip;
  readonly levelChip: HudChip;
  private icons: { heart: string; empty: string; flag: string };
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesNum: Phaser.GameObjects.Text;
  private centerRaw = '';
  private lives = -1;
  private livesMax = 0;
  private levelSet = false;
  private visible = true;
  private label: string;

  constructor(private scene: Phaser.Scene, label: string) {
    this.label = label;
    this.icons = hudIcons(scene);
    const y = HUD_ROW_Y;
    this.scoreChip = hudChip(scene, HUD_MARGIN, y, { label, text: '0' });
    this.centerChip = hudChip(scene, scene.scale.width / 2, y, { align: 'center' });
    this.rightChip = hudChip(scene, hudRightEdge(scene), y, { align: 'right' });
    this.livesNum = hudText(scene, '').setVisible(false);
    this.livesChip = hudChip(scene, hudRightEdge(scene), y, { align: 'right' });
    this.levelChip = hudChip(scene, scene.scale.width / 2, y, { align: 'center', icon: this.icons.flag, iconSize: isModern() ? 26 : 24 });
    this.layout();
  }

  setScore(v: number): void {
    this.scoreChip.setText(v);
    this.layout();
  }

  /**
   * Right-aligned slot (timer, coins ...). Leaves room for the pause button. `icon` (a texture
   * key, with `frame`) goes before the text: a coin before the coin count.
   */
  setRight(s: string, icon?: string, frame?: string | number): void {
    if (icon && (this.rightChip.icon?.texture.key !== icon || this.rightChip.icon.frame.name !== String(frame ?? '__BASE'))) this.rightChip.setIcon(icon, frame);
    this.rightChip.setText(s);
    this.layout();
  }

  setCenter(s: string): void {
    this.centerRaw = s;
    this.centerChip.setText(s.trim());
    this.layout();
  }

  /** Lives as hearts in a chip; the lost heart pops, the last one beats. */
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
        const m = h.getWorldTransformMatrix();
        const ghost = s.add.image(m.tx, m.ty, this.icons.heart).setScrollFactor(0).setDepth(9001).setScale(h.scale);
        s.tweens.add({ targets: ghost, scale: h.scale * 2, alpha: 0, angle: 25, duration: 380, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
      }
    }
    const step = isModern() ? 36 : 32;
    while (this.hearts.length < count) {
      this.hearts.push(s.add.image(0, 0, this.icons.heart).setScrollFactor(0).setData('chipWidth', step - (isModern() ? 8 : 10)));
    }
    while (this.hearts.length > count) this.hearts.pop()!.destroy();
    this.livesNum.setText(compact ? String(n) : '').setVisible(compact);
    this.hearts.forEach((h, i) => {
      s.tweens.killTweensOf(h);
      h.setScale(1).setAngle(0).setTexture(compact || i < n ? this.icons.heart : this.icons.empty);
    });
    // index 0 sits rightmost, so a lost life empties the leftmost heart
    this.livesChip.setItems([...[...this.hearts].reverse(), this.livesNum]);
    this.layout();
    // a gained heart pops in
    if (n > prev && prev >= 0) {
      const h = compact ? this.hearts[0] : this.hearts[n - 1];
      if (h) s.tweens.add({ targets: h, scale: { from: 1.8, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    }
    // the last life beats
    if (n === 1 && this.hearts[0]) s.tweens.add({ targets: this.hearts[0], scale: 1.25, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The level as a flag chip in the centre slot. */
  setLevel(n: number | string): void {
    const text = String(n);
    const changed = this.levelSet && this.levelChip.text.text !== text;
    this.levelSet = true;
    this.levelChip.setText(text);
    this.layout();
    if (changed) this.scene.tweens.add({ targets: this.levelChip, scale: { from: 1.35, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.layout();
  }

  /**
   * Places the chips: score left, lives and the right text right (clear of the pause button),
   * the centre chip between them. A right text that would run into the score moves under the
   * pause button on the second row; a centre chip with no room left moves to the second row too.
   * Call it after changing one of the chips directly (`hud.rightChip.setIcon(...)`).
   */
  layout(): void {
    const s = this.scene, W = s.scale.width, v = this.visible;
    const showRight = v && !!this.rightChip.text.text;
    const showLives = v && this.hearts.length > 0;
    const center = this.centerRaw ? this.centerChip : this.levelChip;
    const showCenter = v && (this.centerRaw ? !!this.centerChip.text.text : this.levelSet);
    this.scoreChip.setVisible(v);
    this.rightChip.setVisible(showRight);
    this.livesChip.setVisible(showLives);
    this.centerChip.setVisible(showCenter && center === this.centerChip);
    this.levelChip.setVisible(showCenter && center === this.levelChip);
    if (!v) return;

    const top = HUD_ROW_Y, edge = hudRightEdge(s);
    const scoreR = this.scoreChip.right;
    // the right group, from the pause button leftwards
    const place = (rightOnRow2: boolean): number => {
      let x = edge;
      if (showRight) {
        if (rightOnRow2) this.rightChip.setAnchor(W - HUD_MARGIN, HUD_ROW2_Y, 'right');
        else { this.rightChip.setAnchor(x, top, 'right'); x = this.rightChip.left - HUD_GAP; }
      }
      if (showLives) { this.livesChip.setAnchor(x, top, 'right'); x = this.livesChip.left - HUD_GAP; }
      return x + HUD_GAP;
    };
    let groupL = place(false);
    let rightOnRow2 = false;
    if (showRight && showLives && groupL < scoreR + HUD_GAP) { groupL = place(true); rightOnRow2 = true; }
    if (!showCenter) return;
    const cw = center.chipWidth;
    const lo = scoreR + HUD_GAP + cw / 2, hi = groupL - HUD_GAP - cw / 2;
    if (lo <= hi) {
      center.setAnchor(Phaser.Math.Clamp(W / 2, lo, hi), top, 'center');
      return;
    }
    let x = W / 2;
    if (rightOnRow2) x = Math.min(x, this.rightChip.left - HUD_GAP - cw / 2);
    center.setAnchor(Math.max(HUD_MARGIN + cw / 2, x), HUD_ROW2_Y, 'center');
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
