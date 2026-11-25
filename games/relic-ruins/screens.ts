// Relic Ruins: the inner screens, in the menu theme (menu.ts): sandstone boards with a gold frieze,
// stone buttons, pale tablets.
//   - The ruin map (after PLAY): the four realms as tabs, the five ruins of the chosen realm as pins
//     on a dotted path with the stars found, the chosen ruin's name, stars, best time and par, and
//     PLAY, CAMP and END RUN. The chosen ruin turns live in the top half of the screen (portrait)
//     or right of the board (landscape: the board on the left, clear of the pause button).
//   - The level-clear card: the three stars popping in (relic, every gem, under par), coins, gems,
//     time, the bonuses and the score; in landscape a wide card, the stars and the score on the
//     left, the lines on the right.
//   - The camp: six lasting upgrades with ranks, paid with coins; it opens after each card and from
//     the map. One column of tiles in portrait, two columns of three in landscape.
// The game is adaptive (landscape on desktops and tablets, portrait on phones): every screen reads
// its geometry from LAYOUT, chosen once at boot.
// Touch: tap. Keyboard and pad: arrows move (on the map: the ruin), Enter presses, Esc goes back,
// C opens the camp from the map. Everything is painted under the Ayvago intro (prebakeScreens):
// opening a screen only places images and glyph numbers.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, skinTexture, SKIN_PAD, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import { UPGRADE, UPGRADE_IDS, WORLD_IDS, type UpgradeId } from './defs';
import { LEVEL_COUNT, LEVELS_PER_WORLD, parOf } from './levels';
import { nextPrice, buy, canBuy, starCount, totalStars, type Meta } from './meta';
import { ICON_SHEET, iconFrame, makeArt } from './art';
import { INK, AMBER, VERDIGRIS, GREY, MOSS, GOLD } from './paint';
import { fmtTime, levelLabel } from './hud';

export const OVERLAY_DEPTH = 9400;

/** Each screen's board and card, per orientation (game units: 720 × 1280 or 1280 × 720). */
interface Layout {
  map: { w: number; h: number; x: number; y: number };
  shop: { w: number; h: number; x: number; y: number; cols: number; tileW: number; descW: number; top: number };
  sum: { w: number; h: number };
}
const PORTRAIT: Layout = {
  map: { w: 690, h: 720, x: 360, y: 880 },
  shop: { w: 690, h: 1060, x: 360, y: 650, cols: 1, tileW: 630, descW: 330, top: 230 },
  sum: { w: 640, h: 760 },
};
// landscape: the map's board on the left (the ruin turns on the right, under the pause button),
// the camp's board left of the pause button, the card wide and low
const LANDSCAPE: Layout = {
  map: { w: 690, h: 700, x: 361, y: 360 },
  shop: { w: 1160, h: 690, x: 596, y: 365, cols: 2, tileW: 530, descW: 250, top: 232 },
  sum: { w: 940, h: 520 },
};
let layoutNow: Layout | null = null;
/** The screens' geometry for the orientation this run was given. */
export const LAYOUT = (): Layout => (layoutNow ??= isLandscape() ? LANDSCAPE : PORTRAIT);
const TILE_H = 122;
/** The themed cards the core paints ahead (the level-clear card in this orientation). */
export const screenCards = (): { w: number; h: number }[] => [LAYOUT().sum];

export const S_TITLE: LabelStyle = { size: 46, fill: ['#fff6cc', '#f6cf6a', '#c8781e'], stroke: INK, strokeWidth: 8 };
const S_SUB: LabelStyle = { size: 19, color: '#3a2410', stroke: null, shadow: false, body: true };
const S_BTN: LabelStyle = { size: 27 };
const S_BTN_S: LabelStyle = { size: 21 };
const S_TAB: LabelStyle = { size: 20 };
const S_WORLD: LabelStyle = { size: 26, color: '#6a2e0c', stroke: null, shadow: false };
const S_INK: LabelStyle = { size: 22, color: '#2a1a0c', stroke: null, shadow: false, body: true };
const S_NAME: LabelStyle = { size: 26, color: '#2a1a0c', stroke: null, shadow: false };
const S_DESC: LabelStyle = { size: 18, color: '#3a2a1a', stroke: null, shadow: false, body: true };
const S_PIN: LabelStyle = { size: 30, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
const S_NUM: LabelStyle = { size: 26, color: '#2a1a0c', stroke: null, shadow: false };
const S_PURSE: LabelStyle = { size: 30, color: '#ffd070', stroke: INK, strokeWidth: 6 };
const S_PRICE: LabelStyle = { size: 22, color: '#fff6e0', stroke: INK, strokeWidth: 4 };
const S_SCORE: LabelStyle = { size: 54, fill: ['#fff6cc', '#f6cf6a', '#c8781e'], stroke: INK, strokeWidth: 8 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff6e0', stroke: INK, strokeWidth: 6 };
const S_RIB: LabelStyle = { size: 24, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
const S_LINE: LabelStyle = { size: 23, color: '#2a1a0c', stroke: null, shadow: false };
const S_STAR: LabelStyle = { size: 16, color: '#4a2e12', stroke: null, shadow: false, body: true };
const GLYPHS = '0123456789:/.,+-×★ ';
const TIME_GLYPHS = '0123456789:-';
const BTN_SIZES: [number, number, number, boolean][] = [[220, 70, AMBER, true], [160, 58, VERDIGRIS, true], [160, 58, GREY, true], [156, 52, VERDIGRIS, true], [150, 54, MOSS, true], [240, 66, AMBER, true], [220, 60, VERDIGRIS, true]];

export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  const L = LAYOUT();
  for (const b of [L.map, L.shop]) skinTexture(scene, 'board', b.w, b.h);
  for (const c of screenCards()) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['mapTitle', 'shopTitle', 'sumTitle']) labelTexture(scene, t(k), S_TITLE);
  bakePara(scene, t('shopSub'), S_SUB, 560);
  for (const [w, h, c, off] of BTN_SIZES) bakeButton(scene, 'button', w, h, c, off, true);
  bakeButton(scene, 'round', 80, 80, AMBER, true, true);
  bakeButton(scene, 'round', 80, 80, VERDIGRIS, true, true);
  for (const k of ['play', 'shop', 'endRun', 'buy', 'maxed', 'cont', 'nextBtn']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['locked', 'worldLocked', 'poor', 'bought']) labelTexture(scene, t(k), S_TOAST);
  for (const w of WORLD_IDS) { labelTexture(scene, t('wt_' + w), S_TAB); labelTexture(scene, t('w_' + w), S_WORLD); }
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_NAME); labelTexture(scene, levelLabel(n), S_WORLD); }
  for (let n = 1; n <= LEVELS_PER_WORLD; n++) labelTexture(scene, String(n), S_PIN);
  for (const k of ['bestTime', 'parTime', 'runScore']) labelTexture(scene, t(k), S_INK);
  for (const k of ['star1', 'star2', 'star3']) labelTexture(scene, t(k), S_STAR);
  labelTexture(scene, t('sumNew'), S_RIB);
  for (const k of ['sumCoins', 'sumGems', 'sumTime', 'sumBonus', 'sumNoHit']) bakeFmt(scene, k, ['n'], S_LINE, GLYPHS);
  labelTexture(scene, t('sumScore'), S_INK);
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_NAME);
    for (let r = 1; r <= UPGRADE[u].prices.length; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, L.shop.descW);
  }
  for (const o of [S_PURSE, S_PRICE, S_SCORE, S_NUM]) glyphAtlas(scene, o, GLYPHS);
  glyphAtlas(scene, S_INK, TIME_GLYPHS);
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

interface Focusable { btn: KitButton; x: number; y: number }

/** An overlay screen: an optional dim layer, an optional board, keyboard focus over its buttons, toasts. */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  private toastImg: Phaser.GameObjects.Image | null = null;
  closed = false;
  private release: () => void;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number, number]; title?: string; titleY?: number; titleX?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x0e0904, o.dim ?? 0.45).setOrigin(0).setInteractive();
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2], o.board[3] + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    if (o.title) this.root.add(fitWidth(labelAt(scene, o.titleX ?? width / 2, o.titleY ?? 64, o.title, S_TITLE), 560));
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    this.release = pushModal(scene);
  }

  protected addFocus(btn: KitButton, x: number, y: number): KitButton { this.focus.push({ btn, x, y }); return btn; }

  protected showFocus(): void {
    if (this.host.touch) return;
    this.focus.forEach((f, i) => f.btn.emit(i === this.fi ? 'pointerover' : 'pointerout'));
  }

  protected moveFocus(dx: number, dy: number): void {
    if (!this.focus.length) return;
    if (this.fi < 0 || this.fi >= this.focus.length) { this.fi = 0; this.showFocus(); return; }
    const cur = this.focus[this.fi];
    let best = -1, bd = Infinity;
    this.focus.forEach((f, i) => {
      if (i === this.fi) return;
      const vx = f.x - cur.x, vy = f.y - cur.y, d = Math.hypot(vx, vy);
      if (d < 1) return;
      const along = (vx * dx + vy * dy) / d;
      if (along < 0.45) return;
      const score = d * (2 - along);
      if (score < bd) { bd = score; best = i; }
    });
    if (best >= 0) { this.fi = best; this.showFocus(); this.host.sfx('move', 0.3); }
  }

  /** Keyboard: true when the key was used. */
  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.moveFocus(-1, 0); return true;
      case 'ArrowRight': case 'KeyD': this.moveFocus(1, 0); return true;
      case 'ArrowUp': case 'KeyW': this.moveFocus(0, -1); return true;
      case 'ArrowDown': case 'KeyS': this.moveFocus(0, 1); return true;
      case 'Enter': case 'Space': case 'NumpadEnter': {
        const f = this.focus[this.fi];
        if (f) f.btn.emit('pointerup', { wasTouch: false });
        return true;
      }
      case 'Escape': case 'KeyX': this.escape(); return true;
    }
    return false;
  }

  protected escape(): void { /* screens with a way back override this */ }

  say(text: string, y = this.scene.scale.height - 40, x = this.scene.scale.width / 2): void {
    this.toastImg?.destroy();
    this.toastImg = labelAt(this.scene, x, y, text, S_TOAST);
    this.root.add(this.toastImg);
    const img = this.toastImg;
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1300, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  protected deny(b: Phaser.GameObjects.Container, text: string, x?: number, y?: number): void {
    const x0 = (b.getData('x0') as number | undefined) ?? b.x;
    b.setData('x0', x0);
    this.scene.tweens.killTweensOf(b);
    b.x = x0;
    this.scene.tweens.add({ targets: b, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => { b.x = x0; } });
    this.host.sfx('deny', 0.45);
    this.say(text, y, x);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.release();
    const off = (o: Phaser.GameObjects.GameObject): void => {
      if (o.input) o.disableInteractive();
      if (o instanceof Phaser.GameObjects.Container) o.list.forEach(off);
    };
    off(this.root);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.destroy() });
  }

  protected sparkle(x: number, y: number, tint: number[], n = 30): void {
    const em = this.scene.add.particles(x, y, 'rr-spark', {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }

  protected button(x: number, y: number, w: number, h: number, color: number, label: string, onTap: () => void, o: { size?: 'L' | 'S'; sfx?: string | null; tapWhenOff?: boolean; kind?: 'button' | 'round' } = {}): KitButton {
    const b = new KitButton(this.scene, x, y, { w, h, kind: o.kind, color, label, style: o.size === 'S' ? S_BTN_S : S_BTN, sfx: o.sfx === undefined ? 'ui-click' : o.sfx, tapWhenOff: o.tapWhenOff }, onTap);
    this.content.add(b);
    this.addFocus(b, x, y);
    return b;
  }
}

const iconAt = (s: Phaser.Scene, x: number, y: number, key: string, size: number) => (key.startsWith('rr-') ? s.add.image(x, y, key) : s.add.image(x, y, ICON_SHEET, iconFrame(key))).setDisplaySize(size, size);

// ------------------------------------------------------------------ the ruin map

export interface MapActions {
  select(n: number): void;
  play(n: number): void;
  shop(): void;
  endRun(): void;
}

export class MapScreen extends Panel {
  private sel: number;
  private world = 0;
  private tabs: KitButton[] = [];
  private pins: KitButton[] = [];
  private stageLayer: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private playBtn: KitButton;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, sel: number, private runScore: number, private act: MapActions) {
    const { w: MAP_W, h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    super(scene, host, { board: [MAP_W, MAP_H, MAP_X, MAP_Y], title: t('mapTitle'), titleX: MAP_X, titleY: MAP_Y - MAP_H / 2 + 76, dim: 0 });
    const s = scene;
    this.sel = sel;
    const top = MAP_Y - MAP_H / 2;
    // purse and run score
    this.content.add(iconAt(s, MAP_X - 270, top + 132, 'coin', 40));
    this.content.add(new GlyphText(s, MAP_X - 246, top + 132, String(meta.coins), S_PURSE, 0));
    this.content.add(labelAt(s, MAP_X + 130, top + 132, t('runScore'), S_INK, 1));
    this.content.add(new GlyphText(s, MAP_X + 142, top + 132, String(runScore), S_PURSE, 0));
    // realm tabs
    WORLD_IDS.forEach((w, i) => {
      const x = MAP_X + (i - 1.5) * 160, y = top + 196;
      const open = meta.unlocked > i * LEVELS_PER_WORLD;
      const b = new KitButton(s, x, y, { w: 156, h: 52, color: VERDIGRIS, label: t('wt_' + w), style: S_TAB, sfx: 'ui-click', tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('worldLocked'), MAP_X, MAP_Y + MAP_H / 2 - 22); return; }
        this.pick(this.bestIn(i));
      });
      b.setEnabled(open);
      this.content.add(b);
      this.tabs.push(b);
    });
    this.stageLayer = s.add.container(0, 0);
    this.info = s.add.container(0, 0);
    this.content.add([this.stageLayer, this.info]);
    const by = MAP_Y + MAP_H / 2 - 74;
    this.button(MAP_X - 214, by, 160, 58, VERDIGRIS, t('shop'), () => this.act.shop(), { size: 'S' });
    this.playBtn = this.button(MAP_X, by - 4, 220, 70, AMBER, t('play'), () => this.act.play(this.sel), { sfx: 'start' });
    this.button(MAP_X + 214, by, 160, 58, GREY, t('endRun'), () => this.act.endRun(), { size: 'S' });
    this.fi = 1;
    this.showFocus();
    this.pick(sel, true);
  }

  /** The ruin to show when a realm's tab is tapped: the furthest one open in it. */
  private bestIn(w: number): number { return Math.min(this.meta.unlocked, (w + 1) * LEVELS_PER_WORLD, LEVEL_COUNT); }

  private pick(n: number, first = false): void {
    n = Math.max(1, Math.min(LEVEL_COUNT, Math.min(this.meta.unlocked, n)));
    const w = Math.floor((n - 1) / LEVELS_PER_WORLD);
    const worldChanged = w !== this.world || first;
    this.sel = n;
    this.world = w;
    this.tabs.forEach((b, i) => b.setSelected(i === w));
    if (worldChanged) this.drawStages();
    this.pins.forEach((p, i) => p.setLook(w * LEVELS_PER_WORLD + i + 1 === n ? AMBER : VERDIGRIS, w * LEVELS_PER_WORLD + i + 1 === n));
    this.drawInfo();
    if (!first) this.host.sfx('move', 0.3);
    this.act.select(n);
  }

  private drawStages(): void {
    const { h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    const s = this.scene, L = this.stageLayer;
    L.removeAll(true);
    this.pins = [];
    const top = MAP_Y - MAP_H / 2;
    L.add(fitWidth(labelAt(s, MAP_X - 40, top + 262, t('w_' + WORLD_IDS[this.world]), S_WORLD), 420));
    const pos = (i: number) => ({ x: MAP_X + (i - 2) * 118, y: top + 346 + (i % 2 ? 30 : -16) });
    for (let i = 0; i < LEVELS_PER_WORLD - 1; i++) {
      const a = pos(i), b = pos(i + 1);
      for (let k = 1; k < 5; k++) L.add(s.add.image(a.x + ((b.x - a.x) * k) / 5, a.y + ((b.y - a.y) * k) / 5, 'rr-dot').setScale(0.7));
    }
    for (let i = 0; i < LEVELS_PER_WORLD; i++) {
      const n = this.world * LEVELS_PER_WORLD + i + 1, p = pos(i);
      const open = n <= this.meta.unlocked;
      const b = new KitButton(s, p.x, p.y, { w: 80, h: 80, kind: 'round', color: VERDIGRIS, label: open ? String(i + 1) : '', style: S_PIN, sfx: null, tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('locked'), MAP_X, MAP_Y + MAP_H / 2 - 22); return; }
        if (n === this.sel) this.act.play(n); else this.pick(n);
      });
      b.setEnabled(open);
      if (!open) b.addContent(s.add.image(0, -2, 'rr-lock').setDisplaySize(36, 36));
      L.add(b);
      this.pins.push(b);
      const got = starCount(this.meta.best[n - 1]);
      for (let k = 0; k < 3; k++) L.add(s.add.image(p.x + (k - 1) * 22, p.y + 52, k < got ? 'rr-star-small' : 'rr-star-dim').setDisplaySize(22, 22));
    }
  }

  private drawInfo(): void {
    const { h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    const s = this.scene, I = this.info, n = this.sel;
    I.removeAll(true);
    const top = MAP_Y - MAP_H / 2;
    const y = top + 462;
    I.add(fitWidth(labelAt(s, MAP_X, y, levelLabel(n) + '  ', S_WORLD, 1), 120).setX(MAP_X - 150));
    I.add(fitWidth(labelAt(s, MAP_X - 140, y, t('l' + n), S_NAME, 0), 420));
    const b = this.meta.best[n - 1];
    for (let k = 0; k < 3; k++) {
      I.add(iconAt(s, MAP_X - 220 + k * 110, y + 52, (b.stars >> k) & 1 ? 'star' : 'star-empty', 38));
      I.add(fitWidth(labelAt(s, MAP_X - 198 + k * 110, y + 52, t('star' + (k + 1)), S_STAR, 0), 72));
    }
    I.add(labelAt(s, MAP_X - 40, y + 104, t('bestTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X - 30, y + 104, b.time ? fmtTime(b.time) : '-:--', S_INK, 0));
    I.add(labelAt(s, MAP_X + 160, y + 104, t('parTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X + 170, y + 104, fmtTime(parOf(n)), S_INK, 0));
    I.add(new GlyphText(s, MAP_X + 296, top + 262, '★ ' + totalStars(this.meta) + '/' + LEVEL_COUNT * 3, S_NUM, 1));
  }

  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.pick(this.sel - 1); return true;
      case 'ArrowRight': case 'KeyD': this.pick(this.sel + 1); return true;
      case 'ArrowUp': case 'KeyW': this.pick(this.sel - LEVELS_PER_WORLD); return true;
      case 'ArrowDown': this.pick(this.sel + LEVELS_PER_WORLD); return true;
      case 'KeyC': case 'KeyQ': this.act.shop(); return true;
      case 'Enter': case 'Space': case 'NumpadEnter': this.playBtn.emit('pointerup', { wasTouch: false }); return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ the level-clear card

export interface SummaryData {
  n: number;
  stars: boolean[];
  newStars: boolean[];
  coins: number;
  gems: string;
  time: number;
  newBest: boolean;
  bonus: number;
  noHit: number;
  score: number;
}

export class SummaryScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, d: SummaryData, onNext: () => void) {
    super(scene, host, { dim: 0.35 });
    const s = scene, W = s.scale.width, H = s.scale.height;
    const { w: SUM_W, h: SUM_H } = LAYOUT().sum;
    const land = SUM_W > SUM_H;
    const cy = land ? H / 2 - 10 : H / 2 + 10;
    this.content.add(themeCard(s, W / 2, cy, SUM_W, SUM_H));
    const top = cy - SUM_H / 2;
    // portrait: one column; landscape: the stars and the score on the left, the lines on the right
    const lx = land ? W / 2 - 215 : W / 2, rx = land ? W / 2 + 215 : W / 2;
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 70 : 78), t('sumTitle'), S_TITLE), 540));
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 118 : 128), t('l' + d.n), S_NAME), 480));
    d.stars.forEach((on, i) => {
      const x = lx + (i - 1) * (land ? 130 : 150), y = top + (land ? 210 : 214);
      const img = iconAt(s, x, y, on ? 'star' : 'star-empty', 92);
      this.content.add(img);
      this.content.add(fitWidth(labelAt(s, x, y + 62, t('star' + (i + 1)), S_STAR), 140));
      if (on) {
        img.setScale(0);
        s.tweens.add({ targets: img, scale: 92 / 128, delay: 250 + i * 260, duration: 260, ease: 'Back.easeOut', onStart: () => { host.sfx('star', 0.55); if (d.newStars[i]) this.sparkle(x, y, [0xffd070, 0xffffff], 18); } });
      }
    });
    const lines: [string, string][] = [['sumCoins', String(d.coins)], ['sumGems', d.gems], ['sumTime', fmtTime(d.time)], ['sumBonus', '+' + d.bonus], ['sumNoHit', '+' + d.noHit]];
    lines.forEach(([k, v], i) => this.content.add(new FmtLine(s, rx, top + (land ? 182 : 330) + i * (land ? 44 : 40), S_LINE, 0.5).set(k, { n: v })));
    if (d.newBest) {
      const rib = labelAt(s, land ? rx + 150 : W / 2 + 200, land ? top + 400 : top + 410, t('sumNew'), S_RIB).setAngle(-8);
      this.content.add(rib);
      s.tweens.add({ targets: rib, scale: 1.1, duration: 380, yoyo: true, repeat: -1 });
    }
    this.content.add(labelAt(s, lx, top + (land ? 340 : 562), t('sumScore'), S_INK));
    const sc = new GlyphText(s, lx, top + (land ? 396 : 616), '0', S_SCORE, 0.5);
    this.content.add(sc);
    const tw = { v: 0 };
    s.tweens.add({ targets: tw, v: d.score, duration: 900, delay: 900, ease: 'Cubic.easeOut', onUpdate: () => sc.setText(String(Math.round(tw.v))) });
    this.button(W / 2, cy + SUM_H / 2 + 10, 240, 66, AMBER, t('nextBtn'), () => { this.close(); onNext(); });
    this.fi = 0;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ the camp

export class ShopScreen extends Panel {
  private purse!: GlyphText;
  private tiles = new Map<UpgradeId, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onBuy: (u: UpgradeId) => void, private onBack: () => void) {
    const { w: SHOP_W, h: SHOP_H, x: SHOP_X, y: SHOP_Y } = LAYOUT().shop;
    super(scene, host, { board: [SHOP_W, SHOP_H, SHOP_X, SHOP_Y], title: t('shopTitle'), titleX: SHOP_X, titleY: SHOP_Y - SHOP_H / 2 + 76, dim: 0.55 });
    const s = scene;
    const top = SHOP_Y - SHOP_H / 2;
    this.content.add(new Para(s, SHOP_X, top + 124, t('shopSub'), S_SUB, 560, 0.5, 22));
    const px = SHOP_X + SHOP_W / 2 - 150, py = top + 76;
    this.content.add(iconAt(s, px, py, 'coin', 42));
    this.purse = new GlyphText(s, px + 26, py, String(meta.coins), S_PURSE, 0);
    this.content.add(this.purse);
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    this.button(SHOP_X, SHOP_Y + SHOP_H / 2 - 60, 220, 60, VERDIGRIS, t('cont'), () => { this.close(); onBack(); }, { size: 'S' });
    this.fi = this.focus.length - 1;
    this.showFocus();
  }

  protected escape(): void { this.close(); this.onBack(); }

  private tile(u: UpgradeId, i: number): void {
    const s = this.scene, S = LAYOUT().shop, TILE_W = S.tileW;
    // one column (portrait) or two columns of three (landscape), in the upgrades' order down each column
    const rows = Math.ceil(UPGRADE_IDS.length / S.cols), col = Math.floor(i / rows), row = i % rows;
    const x = S.x + (col - (S.cols - 1) / 2) * (TILE_W + 30), y = S.y - S.h / 2 + S.top + row * (TILE_H + 12);
    this.tiles.get(u)?.destroy();
    const c = s.add.container(x, y);
    const r = this.meta.ranks[u], def = UPGRADE[u], max = def.prices.length;
    const g = s.add.graphics();
    g.fillStyle(0xfff2d8, 0.42).fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12).lineStyle(2.5, 0x8a5a24, 0.9).strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 12);
    c.add(g);
    c.add(iconAt(s, -TILE_W / 2 + 54, 0, UICON[u], 70));
    c.add(fitWidth(labelAt(s, -TILE_W / 2 + 104, -36, t('u_' + u), S_NAME, 0), Math.min(300, TILE_W - 300)));
    const pg = s.add.graphics();
    for (let k = 0; k < max; k++) { pg.fillStyle(k < r ? GOLD : 0xc8b898, 1).fillRoundedRect(-TILE_W / 2 + 106 + k * 30, -12, 24, 12, 4); pg.lineStyle(2, 0x2a1a0c, 0.8).strokeRoundedRect(-TILE_W / 2 + 106 + k * 30, -12, 24, 12, 4); }
    c.add(pg);
    const showRank = Math.min(max, r + 1);
    c.add(new Para(s, -TILE_W / 2 + 106, 10, t(`u_${u}_${showRank}`), S_DESC, S.descW, 0, 20).setAlpha(r >= max ? 0.55 : 1));
    const price = nextPrice(this.meta, u);
    const bx = TILE_W / 2 - 84;
    if (price === null) c.add(labelAt(s, bx, 0, t('maxed'), S_RIB));
    else {
      c.add(iconAt(s, bx - 34, -36, 'coin', 30));
      c.add(new GlyphText(s, bx - 16, -36, String(price), S_PRICE, 0));
      const b = new KitButton(s, bx, 14, { w: 150, h: 54, color: MOSS, label: t('buy'), style: S_BTN_S, sfx: null, tapWhenOff: true }, () => {
        if (!buy(this.meta, u)) { this.deny(b, t('poor'), x, y); return; }
        this.host.sfx('buy', 0.6);
        this.sparkle(x + bx, y, [0xffd070, 0xffffff], 26);
        this.say(t('bought'), y, x);
        this.onBuy(u);
        this.refresh();
      });
      b.setEnabled(canBuy(this.meta, u));
      c.add(b);
      this.focus.push({ btn: b, x: x + bx, y });
    }
    this.content.add(c);
    this.tiles.set(u, c);
  }

  private refresh(): void {
    this.purse.setText(String(this.meta.coins));
    const back = this.focus.find((f) => !UPGRADE_IDS.some((u) => this.tiles.get(u)?.list.includes(f.btn)));
    this.focus = [];
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    if (back) this.focus.push(back);
    this.fi = Math.min(this.fi, this.focus.length - 1);
    this.showFocus();
  }
}

const UICON: Record<UpgradeId, string> = { reservoir: 'rr-oil', wick: 'rr-flame', heart: 'heart', stride: 'rr-boots', powers: 'rr-compass', flare: 'rr-flare' };
