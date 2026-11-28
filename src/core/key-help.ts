import Phaser from 'phaser';
import { t } from './i18n';
import { currentGame, isLandscape } from './registry';
import { storage } from './storage';
import { isModern, MODERN_BODY, MODERN_TITLE } from './style';
import { FONT_BODY, FONT_TITLE } from './theme';

// The keyboard controls, drawn as key caps (desktop only: touch devices show their own buttons).
//
// A game lists its keys in its definition (`keyHelp`); the core then
// - adds a strip along the bottom of the pause screen with every key, and
// - gives the game `showKeyHelp()`: the same keys along the bottom of the play screen, without a
//   band, that the game shows once, the first time a round starts on this browser. The round goes
//   on underneath; the keys fade after a few seconds.
//
// A row is a few key groups and what they do: `{ keys: ['W', 'Up'], label: 'kh_gas' }` draws
// [W] / [↑] Gas. Caps inside a group are separated by spaces ('A D' is [A][D]). Up, Down, Left
// and Right draw arrows; Space is drawn wide and localized; anything else is printed as written.
// `label` is a string key (the game's strings), shown as is when there is no such key.

export interface KeyHelpRow {
  keys: string[];
  label: string;
}

const ARROWS: Record<string, number> = { Right: 0, Down: 90, Left: 180, Up: 270 };
const INK = '#1d2436';

const bodyFont = (): string => (isModern() ? `"${MODERN_BODY}", sans-serif` : FONT_BODY);
const titleFont = (): string => (isModern() ? `"${MODERN_TITLE}", sans-serif` : FONT_TITLE);

function forced(): boolean {
  try {
    return new URLSearchParams(location.search).has('keyhelp');
  } catch {
    return false;
  }
}

function rows(): KeyHelpRow[] {
  try {
    return currentGame().keyHelp ?? [];
  } catch {
    return [];
  }
}

/** Whether this device gets the key help: not on touch screens (they show touch buttons). `?keyhelp` forces it. */
export function keyHelpShown(scene: Phaser.Scene): boolean {
  if (!rows().length) return false;
  return forced() || !scene.sys.game.device.input.touch;
}

const seenKey = (): string => `keyhelp:${currentGame().meta.id}`;

/**
 * Whether the first-time keys are due: a desktop that has not seen them. Automated browsers (smoke
 * tests, store art) skip them, so screenshots stay clean; `?keyhelp` shows them every time.
 */
export function keyHelpDue(scene: Phaser.Scene): boolean {
  if (!keyHelpShown(scene)) return false;
  if (forced()) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  return !storage.get(seenKey(), false);
}

interface Piece {
  obj: Phaser.GameObjects.Container;
  w: number;
}

function cap(scene: Phaser.Scene, k: string, h: number): Piece {
  const c = scene.add.container(0, 0);
  const deg = ARROWS[k];
  const arrow = deg !== undefined;
  let label: Phaser.GameObjects.Text | null = null;
  if (!arrow) {
    label = scene.add.text(0, -1, k === 'Space' ? t('kh_space') : k, {
      fontFamily: bodyFont(), fontSize: `${Math.round(h * (k.length > 1 ? 0.42 : 0.5))}px`, color: INK, fontStyle: 'bold',
    }).setOrigin(0.5);
  }
  let w = arrow ? h : Math.max(h, Math.ceil(label!.width) + h * 0.55);
  if (k === 'Space') w = Math.max(w, h * 2.8);
  const r = Math.round(h * 0.22);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
  g.fillStyle(0x8e9ab8, 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
  g.fillStyle(0xf3f6fd, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 1, r);
  g.fillStyle(0xffffff, 0.9).fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h * 0.3, Math.max(2, r - 3));
  if (arrow) {
    const a = Phaser.Math.DegToRad(deg), s = h * 0.24;
    const pt = (dx: number, dy: number): [number, number] => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a) - 1];
    const [x1, y1] = pt(s, 0), [x2, y2] = pt(-s * 0.7, -s * 0.85), [x3, y3] = pt(-s * 0.7, s * 0.85);
    g.fillStyle(0x1d2436, 1).fillTriangle(x1, y1, x2, y2, x3, y3);
  }
  c.add(g);
  if (label) c.add(label);
  return { obj: c, w };
}

/** Pieces laid left to right with a gap, centred on the container's origin (like every piece). */
function row(scene: Phaser.Scene, parts: Piece[], gap: number): Piece {
  const c = scene.add.container(0, 0);
  const w = parts.reduce((a, p) => a + p.w, 0) + gap * Math.max(0, parts.length - 1);
  let x = -w / 2;
  for (const p of parts) {
    p.obj.x = x + p.w / 2;
    c.add(p.obj);
    x += p.w + gap;
  }
  return { obj: c, w };
}

function text(scene: Phaser.Scene, s: string, size: number, color: string, outline = false): Piece {
  const tx = scene.add.text(0, 0, s, {
    fontFamily: bodyFont(), fontSize: `${size}px`, color, fontStyle: 'bold',
    stroke: outline ? '#0a0e1c' : undefined, strokeThickness: outline ? 5 : 0,
  }).setOrigin(0.5);
  if (outline) tx.setShadow(0, 2, 'rgba(0,0,0,0.6)', 6, true, true);
  const c = scene.add.container(0, 0, [tx]);
  return { obj: c, w: Math.ceil(tx.width) };
}

/** The key groups of a row: [W] / [↑]. */
function keys(scene: Phaser.Scene, r: KeyHelpRow, h: number, outline = false): Piece {
  const parts: Piece[] = [];
  r.keys.forEach((grp, i) => {
    if (i) parts.push(text(scene, '/', Math.round(h * 0.5), outline ? '#c9d3ec' : '#8f9cc0', outline));
    parts.push(row(scene, grp.split(' ').filter(Boolean).map((k) => cap(scene, k, h)), Math.round(h * 0.15)));
  });
  return row(scene, parts, Math.round(h * 0.22));
}

const labelOf = (r: KeyHelpRow): string => {
  const s = t(r.label);
  return s && s !== r.label ? s : r.label;
};

export interface KeyBlockOptions {
  /** Label colour (default a soft white). */
  color?: string;
  /** Labels with a dark edge, to read straight over the game. */
  outline?: boolean;
  /** Key cap height in px (default 34); the labels, gaps and lines follow it. */
  cap?: number;
}

/**
 * Every key with what it does, in lines no wider than `maxW`, centred on the container's origin
 * (`w` and `h` are its drawn size). The pause strip, the first-time keys and the menu's how-to use it.
 */
export function keyHelpBlock(scene: Phaser.Scene, maxW: number, o: KeyBlockOptions = {}): { obj: Phaser.GameObjects.Container; w: number; h: number } {
  const H = o.cap ?? 34, k = H / 34, outline = !!o.outline;
  const gapX = Math.round(34 * k), gapY = Math.round(14 * k), lineH = H + 6;
  const items = rows().map((r) => row(scene, [keys(scene, r, H, outline), text(scene, labelOf(r), Math.round(21 * k), o.color ?? '#e8edf8', outline)], Math.round(12 * k)));
  const lines: Piece[][] = [[]];
  let lw = 0;
  for (const it of items) {
    const cur = lines[lines.length - 1];
    if (cur.length && lw + gapX + it.w > maxW) { lines.push([it]); lw = it.w; }
    else { lw += (cur.length ? gapX : 0) + it.w; cur.push(it); }
  }
  const built = lines.map((l) => row(scene, l, gapX));
  const w = Math.max(...built.map((b) => b.w)), h = lines.length * lineH + (lines.length - 1) * gapY;
  const c = scene.add.container(0, 0);
  built.forEach((b, i) => {
    b.obj.y = -h / 2 + lineH / 2 - 2 + i * (lineH + gapY);
    c.add(b.obj);
  });
  if (w > maxW) c.setScale(maxW / w);
  return { obj: c, w: Math.min(w, maxW), h: h * Math.min(1, maxW / w) };
}

/**
 * The pause screen's strip: every key in one band along the bottom of the screen, its bottom
 * edge at `y` (two or more lines when it does not fit `maxW`). Null when the device gets no key help.
 */
export function keyHelpStrip(scene: Phaser.Scene, o: { y: number; maxW: number; depth?: number }): Phaser.GameObjects.Container | null {
  if (!keyHelpShown(scene)) return null;
  const { width } = scene.scale;
  const padX = 26, padY = 14;
  const k = keyHelpBlock(scene, o.maxW - padX * 2);
  const bw = k.w + padX * 2, bh = k.h + padY * 2;
  const c = scene.add.container(width / 2, o.y - bh / 2);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-bw / 2, -bh / 2 + 6, bw, bh, 22);
  g.fillStyle(0x0d1224, 0.82).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 22);
  g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 22);
  c.add([g, k.obj]);
  c.setDepth(o.depth ?? 5).setScrollFactor(0);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 200, delay: 60 });
  return c;
}

export interface KeyHelpHint {
  /** Fades the keys out now (the round ended early, say). */
  close(): void;
}

/**
 * The first-time keys, if due (keyHelpDue): every key with what it does along the bottom of the
 * play screen, straight over the game (no band), for `ms` of play; then they fade. Nothing waits
 * on them. They hide while the scene is paused (the pause has its own strip) and count as seen
 * once they have faded. Returns null (and does nothing) when they are not due.
 */
export interface KeyHintOptions {
  /** Play time in ms before the keys fade (default 10 s). */
  ms?: number;
  /** Gap in px between the keys' bottom edge and the screen's (default 26 landscape, 60 portrait). */
  bottom?: number;
  /** Widest the keys may be, in px (default the screen less margins); they wrap, then shrink. */
  maxW?: number;
  /** Horizontal centre in px (default the screen's): clear of buttons a game keeps on desktop. */
  x?: number;
}

export function showKeyHelp(scene: Phaser.Scene, o: KeyHintOptions = {}): KeyHelpHint | null {
  if (!keyHelpDue(scene)) return null;
  const { width, height } = scene.scale;
  const land = isLandscape();
  const k = keyHelpBlock(scene, o.maxW ?? (land ? width - 200 : width - 48), { outline: true });
  const root = scene.add.container(o.x ?? width / 2, height - (o.bottom ?? (land ? 26 : 60)) - k.h / 2, [k.obj]).setDepth(9300).setScrollFactor(0);
  root.setAlpha(0);
  root.y += 16;
  scene.tweens.add({ targets: root, alpha: 1, y: root.y - 16, duration: 380, ease: 'Cubic.easeOut' });
  let closed = false;
  const onPause = () => root.setVisible(false);
  const onResume = () => root.setVisible(true);
  scene.events.on(Phaser.Scenes.Events.PAUSE, onPause);
  scene.events.on(Phaser.Scenes.Events.RESUME, onResume);
  const off = () => {
    scene.events.off(Phaser.Scenes.Events.PAUSE, onPause);
    scene.events.off(Phaser.Scenes.Events.RESUME, onResume);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  const close = () => {
    if (closed) return;
    closed = true;
    storage.set(seenKey(), true);
    timer.remove();
    scene.tweens.add({ targets: root, alpha: 0, y: root.y + 12, duration: 600, ease: 'Quad.easeIn', onComplete: () => { off(); root.destroy(); } });
  };
  // the scene's clock: the time paused does not count
  const timer = scene.time.delayedCall(o.ms ?? 10000, close);
  return { close };
}
