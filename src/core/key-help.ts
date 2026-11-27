import Phaser from 'phaser';
import { t } from './i18n';
import { pushModal } from './modal';
import { currentGame, isLandscape } from './registry';
import { storage } from './storage';
import { isModern, MODERN_BODY, MODERN_TITLE } from './style';
import { FONT_BODY, FONT_TITLE } from './theme';

// The keyboard controls, drawn as key caps (desktop only: touch devices show their own buttons).
//
// A game lists its keys in its definition (`keyHelp`); the core then
// - adds a strip along the bottom of the pause screen with every key, and
// - gives the game `showKeyHelp()`: a card with the same keys that the game opens once, the first
//   time a round starts on this browser, and that closes on any key, click or pad button.
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
 * Whether the first-time card is due: a desktop that has not seen it. Automated browsers (smoke
 * tests, store art) skip it, so their runs never wait on it; `?keyhelp` shows it every time.
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

function text(scene: Phaser.Scene, s: string, size: number, color: string): Piece {
  const tx = scene.add.text(0, 0, s, { fontFamily: bodyFont(), fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5);
  const c = scene.add.container(0, 0, [tx]);
  return { obj: c, w: Math.ceil(tx.width) };
}

/** The key groups of a row: [W] / [↑]. */
function keys(scene: Phaser.Scene, r: KeyHelpRow, h: number): Piece {
  const parts: Piece[] = [];
  r.keys.forEach((grp, i) => {
    if (i) parts.push(text(scene, '/', Math.round(h * 0.5), '#8f9cc0'));
    parts.push(row(scene, grp.split(' ').filter(Boolean).map((k) => cap(scene, k, h)), Math.round(h * 0.15)));
  });
  return row(scene, parts, Math.round(h * 0.22));
}

const labelOf = (r: KeyHelpRow): string => {
  const s = t(r.label);
  return s && s !== r.label ? s : r.label;
};

/**
 * The pause screen's strip: every key in one band along the bottom of the screen (two or more
 * lines when it does not fit `maxW`). Returns null when the device gets no key help.
 */
export function keyHelpStrip(scene: Phaser.Scene, o: { y: number; maxW: number; depth?: number }): Phaser.GameObjects.Container | null {
  if (!keyHelpShown(scene)) return null;
  const { width } = scene.scale;
  const H = 34, padX = 26, padY = 14, gapX = 34, gapY = 14;
  const items = rows().map((r) => row(scene, [keys(scene, r, H), text(scene, labelOf(r), 21, '#e8edf8')], 12));
  const inner = o.maxW - padX * 2;
  const lines: Piece[][] = [[]];
  let lw = 0;
  for (const it of items) {
    const cur = lines[lines.length - 1];
    if (cur.length && lw + gapX + it.w > inner) { lines.push([it]); lw = it.w; }
    else { lw += (cur.length ? gapX : 0) + it.w; cur.push(it); }
  }
  const built = lines.map((l) => row(scene, l, gapX));
  const lineH = H + 6;
  const contentW = Math.max(...built.map((b) => b.w));
  const bw = Math.min(o.maxW, contentW + padX * 2), bh = lines.length * lineH + (lines.length - 1) * gapY + padY * 2;
  const c = scene.add.container(width / 2, o.y - bh / 2);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-bw / 2, -bh / 2 + 6, bw, bh, 22);
  g.fillStyle(0x0d1224, 0.82).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 22);
  g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 22);
  c.add(g);
  built.forEach((b, i) => {
    b.obj.x = 0;
    b.obj.y = -bh / 2 + padY + lineH / 2 - 2 + i * (lineH + gapY);
    c.add(b.obj);
  });
  if (contentW + padX * 2 > o.maxW) c.setScale(o.maxW / (contentW + padX * 2));
  c.setDepth(o.depth ?? 5).setScrollFactor(0);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 200, delay: 60 });
  return c;
}

export interface KeyHelpCard {
  /** Closes the card (as a key press would). */
  close(): void;
}

/**
 * The first-time card, if due (keyHelpDue): the keys in a table over the dimmed game, "press any
 * key". It is a modal (Esc closes it instead of pausing); it is marked seen when it closes, and
 * `onClose` runs then. Returns null (and does nothing) when it is not due.
 */
export function showKeyHelp(scene: Phaser.Scene, onClose?: () => void): KeyHelpCard | null {
  if (!keyHelpDue(scene)) return null;
  const { width, height } = scene.scale;
  const land = isLandscape();
  const release = pushModal(scene);
  const root = scene.add.container(0, 0).setDepth(9900).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, width, height, 0x050814, 0.6).setOrigin(0).setInteractive();
  root.add(dim);

  const H = land ? 44 : 48, rowGap = land ? 18 : 22, colGap = 28;
  const list = rows().map((r) => ({ k: keys(scene, r, H), l: text(scene, labelOf(r), land ? 26 : 30, '#f3f6fd') }));
  const kw = Math.max(...list.map((r) => r.k.w)), lw = Math.max(...list.map((r) => r.l.w));
  const title = scene.add.text(0, 0, t('kh_title'), {
    fontFamily: titleFont(), fontSize: `${land ? 40 : 46}px`, color: '#ffd23f', stroke: '#000000', strokeThickness: isModern() ? 0 : 6,
  }).setOrigin(0.5);
  const hint = scene.add.text(0, 0, t('kh_any'), { fontFamily: bodyFont(), fontSize: `${land ? 22 : 26}px`, color: '#aeb9d6', fontStyle: 'bold' }).setOrigin(0.5);
  const tableW = kw + colGap + lw;
  const cw = Math.min(width - 48, Math.max(tableW, title.width, hint.width) + 96);
  const top = 40, titleH = title.height, rowH = H + 6;
  const ch = top + titleH + 34 + list.length * rowH + (list.length - 1) * rowGap + 40 + hint.height + 36;
  const card = scene.add.container(width / 2, height / 2);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-cw / 2, -ch / 2 + 10, cw, ch, 32);
  g.fillStyle(0x121a30, 0.96).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 32);
  g.lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 32);
  card.add(g);
  let y = -ch / 2 + top + titleH / 2;
  title.y = y;
  card.add(title);
  y += titleH / 2 + 34 + rowH / 2;
  const scale = Math.min(1, (cw - 64) / tableW);
  const table = scene.add.container(0, 0).setScale(scale);
  const x0 = -tableW / 2;
  let ty = 0;
  for (const r of list) {
    r.k.obj.x = x0 + kw - r.k.w / 2;
    r.k.obj.y = ty;
    r.l.obj.x = x0 + kw + colGap + r.l.w / 2;
    r.l.obj.y = ty;
    table.add([r.k.obj, r.l.obj]);
    ty += rowH + rowGap;
  }
  table.y = y;
  card.add(table);
  hint.y = ch / 2 - 36 - hint.height / 2;
  card.add(hint);
  root.add(card);
  scene.tweens.add({ targets: hint, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  card.setScale(0.9).setAlpha(0);
  dim.setAlpha(0);
  scene.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: dim, alpha: 1, duration: 200 });

  let closed = false;
  const opened = scene.time.now;
  const kb = scene.input.keyboard;
  const close = () => {
    if (closed) return;
    closed = true;
    kb?.off('keydown', onKey);
    dim.off('pointerdown', onTap);
    storage.set(seenKey(), true);
    release();
    scene.tweens.killTweensOf([hint, card, dim]);
    scene.tweens.add({ targets: root, alpha: 0, duration: 180, onComplete: () => root.destroy() });
    onClose?.();
  };
  const ready = () => scene.time.now - opened > 350;
  const onKey = () => { if (ready()) close(); };
  const onTap = () => { if (ready()) close(); };
  kb?.on('keydown', onKey);
  dim.on('pointerdown', onTap);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { kb?.off('keydown', onKey); release(); });
  return { close };
}
