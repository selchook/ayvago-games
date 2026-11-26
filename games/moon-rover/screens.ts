// Moon Rover: the inner screens, in the menu theme (menu.ts): brushed-steel boards with hazard stripes
// and bolts, smoked glass fields, signal-orange and teal buttons.
//   - The mission map (after PLAY): the four regions as tabs, the five missions of the chosen region
//     as pins on a dotted route with the stars found (the fifth, the region's set-piece, a rocket or
//     a generator badge), the chosen mission's name, stars, best time and par, whether its alien was
//     found, and DRIVE, HANGAR and END RUN. The chosen mission's ground turns live above the board
//     (portrait) or right of it (landscape: the board on the left, clear of the pause button).
//   - The mission card: the three stars popping in (every crystal, the whole crew, under par), the
//     crystals, crew, time, the bonuses, the credits and the score; in landscape a wide card, the
//     stars and the score on the left, the lines on the right. A set-piece adds its own line.
//   - The hangar: six ranked upgrades paid with credits and six paint jobs unlocked with stars, the
//     rover turning on its pad beside the board (landscape) or above it (portrait). It opens after
//     each card and from the map.
// Touch: tap. Keyboard and pad: arrows move (on the map: the mission), Enter presses, Esc goes back,
// C opens the hangar from the map. Everything is painted under the Ayvago intro (prebakeScreens):
// opening a screen only places images and glyph numbers.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, skinTexture, SKIN_PAD, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import { UPGRADE, UPGRADE_IDS, REGION_IDS, SKINS, type UpgradeId, type SkinId } from './defs';
import { LEVEL_COUNT, LEVELS_PER_REGION, parOf, RAW } from './levels';
import { nextPrice, buy, canBuy, starCount, totalStars, paint, type Meta } from './meta';
import { ic, makeArt } from './art';
import { INK, ORANGE, TEAL, GREY, GREEN, HAZARD } from './paint';
import { fmtTime, levelLabel } from './hud';

export const OVERLAY_DEPTH = 9400;

/** Each screen's board and card, per orientation (game units: 720 × 1280 or 1280 × 720). */
interface Layout {
  map: { w: number; h: number; x: number; y: number };
  shop: { w: number; h: number; x: number; y: number };
  /** The paint plate, beside the turning rover. */
  paint: { x: number; y: number };
  sum: { w: number; h: number };
}
const PORTRAIT: Layout = {
  map: { w: 690, h: 700, x: 360, y: 902 },
  shop: { w: 690, h: 740, x: 360, y: 896 },
  paint: { x: 360, y: 448 },
  sum: { w: 640, h: 780 },
};
// landscape: the boards on the left (the mission turns on the right, under the pause button), the
// card wide and low
const LANDSCAPE: Layout = {
  map: { w: 690, h: 700, x: 361, y: 360 },
  shop: { w: 700, h: 700, x: 366, y: 360 },
  paint: { x: 990, y: 628 },
  sum: { w: 960, h: 540 },
};
let layoutNow: Layout | null = null;
/** The screens' geometry for the orientation this run was given. */
export const LAYOUT = (): Layout => (layoutNow ??= isLandscape() ? LANDSCAPE : PORTRAIT);
const TILE_W = 630, TILE_H = 64;
const PAINT_W = 600, PAINT_H = 132;
/** The themed cards the core paints ahead (the mission card in this orientation). */
export const screenCards = (): { w: number; h: number }[] => [LAYOUT().sum];

export const S_TITLE: LabelStyle = { size: 44, fill: ['#ffffff', '#ffe08a', '#ff9a2a'], stroke: INK, strokeWidth: 8 };
const S_SUB: LabelStyle = { size: 18, color: '#d8e6f8', stroke: null, shadow: false, body: true };
const S_BTN: LabelStyle = { size: 27 };
const S_BTN_S: LabelStyle = { size: 20 };
const S_TAB: LabelStyle = { size: 19 };
const S_REGION: LabelStyle = { size: 26, color: '#ffd070', stroke: INK, strokeWidth: 4 };
const S_INK: LabelStyle = { size: 21, color: '#eaf2ff', stroke: null, shadow: false, body: true };
const S_NAME: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_UNAME: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_DESC: LabelStyle = { size: 16, color: '#c8d8ee', stroke: null, shadow: false, body: true };
const S_PIN: LabelStyle = { size: 30, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_NUM: LabelStyle = { size: 24, color: '#ffe08a', stroke: INK, strokeWidth: 4 };
const S_PURSE: LabelStyle = { size: 30, color: '#ffd070', stroke: INK, strokeWidth: 6 };
const S_PRICE: LabelStyle = { size: 22, color: '#fff6e0', stroke: INK, strokeWidth: 4 };
const S_SCORE: LabelStyle = { size: 56, fill: ['#ffffff', '#ffe08a', '#ff9a2a'], stroke: INK, strokeWidth: 8 };
const S_TOAST: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 6 };
const S_RIB: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_LINE: LabelStyle = { size: 23, color: '#eaf2ff', stroke: INK, strokeWidth: 3 };
const S_STAR: LabelStyle = { size: 16, color: '#c8d8ee', stroke: null, shadow: false, body: true };
const S_SP: LabelStyle = { size: 22, color: '#ffd070', stroke: INK, strokeWidth: 4 };
const GLYPHS = '0123456789:/.,+-×★ ';
const TIME_GLYPHS = '0123456789:-';
const BTN_SIZES: [number, number, number][] = [[220, 70, ORANGE], [170, 58, TEAL], [170, 58, GREY], [158, 50, TEAL], [110, 46, GREEN], [240, 66, ORANGE], [220, 60, TEAL], [196, 50, TEAL]];

export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  const L = LAYOUT();
  for (const b of [L.map, L.shop]) skinTexture(scene, 'board', b.w, b.h);
  skinTexture(scene, 'plate', PAINT_W, PAINT_H);
  for (const c of screenCards()) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['mapTitle', 'shopTitle', 'sumTitle']) labelTexture(scene, t(k), S_TITLE);
  bakePara(scene, t('shopSub'), S_SUB, 600);
  for (const [w, h, c] of BTN_SIZES) bakeButton(scene, 'button', w, h, c, true, true);
  bakeButton(scene, 'round', 80, 80, ORANGE, true, true);
  bakeButton(scene, 'round', 80, 80, TEAL, true, true);
  bakeButton(scene, 'round', 70, 70, GREY, true, true);
  for (const k of ['play', 'shop', 'endRun', 'buy', 'maxed', 'cont', 'nextBtn', 'tabUp', 'tabPaint', 'wear', 'wearing']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['locked', 'regionLocked', 'poor', 'bought', 'painted', 'needStars']) labelTexture(scene, t(k), S_TOAST);
  for (const r of REGION_IDS) { labelTexture(scene, t('rt_' + r), S_TAB); labelTexture(scene, t('r_' + r), S_REGION); }
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_NAME); labelTexture(scene, levelLabel(n), S_REGION); }
  for (let n = 1; n <= LEVELS_PER_REGION; n++) labelTexture(scene, String(n), S_PIN);
  for (const k of ['bestTime', 'parTime', 'runScore', 'alienFound', 'alienHidden', 'sumScore']) labelTexture(scene, t(k), S_INK);
  for (const k of ['star1', 'star2', 'star3']) labelTexture(scene, t(k), S_STAR);
  for (const k of ['sp_minerDone', 'sp_escapeDone']) labelTexture(scene, t(k), S_SP);
  labelTexture(scene, t('sumNew'), S_RIB);
  for (const k of ['sumCrystals', 'sumCrew', 'sumTime', 'sumBonus', 'sumUnharmed', 'sumCredits']) bakeFmt(scene, k, ['n'], S_LINE, GLYPHS);
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_UNAME);
    for (let r = 1; r <= UPGRADE[u].prices.length; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, 178);
  }
  for (const s of SKINS) labelTexture(scene, t('s_' + s.id), S_DESC);
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
  /** Plain objects this panel's count-up tweens animate (stopped with the panel). */
  protected counters: object[] = [];
  private release: () => void;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number, number]; title?: string; titleY?: number; titleX?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x04060c, o.dim ?? 0.4).setOrigin(0).setInteractive();
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2], o.board[3] + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    if (o.title) this.root.add(fitWidth(labelAt(scene, o.titleX ?? width / 2, o.titleY ?? 64, o.title, S_TITLE), 520));
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
    if (this.closed) return;
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
    // a quick tap on NEXT closes the card while its stars and count-up still run: they stop here
    this.scene.tweens.getTweens().forEach((tw) => { if (this.ownTween(tw)) tw.stop(); });
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 120, onComplete: () => this.root.destroy() });
  }

  /** A tween of this panel: it moves something inside it, or counts a number shown in it. */
  private ownTween(tw: Phaser.Tweens.Tween): boolean {
    const inside = (o: unknown): boolean => {
      for (let p = o as Phaser.GameObjects.GameObject | null; p; p = (p as Phaser.GameObjects.GameObject).parentContainer) if (p === this.root) return true;
      return false;
    };
    return tw.targets.some((o) => inside(o) || this.counters.includes(o));
  }

  protected sparkle(x: number, y: number, tint: number[], n = 30): void {
    if (this.closed) return;
    const em = this.scene.add.particles(x, y, ic('spark'), {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => { if (em.active) em.destroy(); });
  }

  protected button(x: number, y: number, w: number, h: number, color: number, label: string, onTap: () => void, o: { size?: 'L' | 'S'; sfx?: string | null; tapWhenOff?: boolean; kind?: 'button' | 'round' } = {}): KitButton {
    const b = new KitButton(this.scene, x, y, { w, h, kind: o.kind, color, label, style: o.size === 'S' ? S_BTN_S : S_BTN, sfx: o.sfx === undefined ? 'ui-click' : o.sfx, tapWhenOff: o.tapWhenOff }, onTap);
    this.content.add(b);
    this.addFocus(b, x, y);
    return b;
  }
}

const iconAt = (s: Phaser.Scene, x: number, y: number, key: string, size: number) => s.add.image(x, y, ic(key)).setDisplaySize(size, size);

// ------------------------------------------------------------------ the mission map

export interface MapActions {
  select(n: number): void;
  play(n: number): void;
  shop(): void;
  endRun(): void;
}

export class MapScreen extends Panel {
  private sel: number;
  private region = 0;
  private tabs: KitButton[] = [];
  private pins: KitButton[] = [];
  private stageLayer: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private playBtn: KitButton;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, sel: number, runScore: number, private act: MapActions) {
    const { w: MAP_W, h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    super(scene, host, { board: [MAP_W, MAP_H, MAP_X, MAP_Y], title: t('mapTitle'), titleX: MAP_X, titleY: MAP_Y - MAP_H / 2 + 78, dim: 0 });
    const s = scene;
    this.sel = sel;
    const top = MAP_Y - MAP_H / 2;
    // purse and run score
    this.content.add(iconAt(s, MAP_X - 270, top + 134, 'credit', 40));
    this.content.add(new GlyphText(s, MAP_X - 246, top + 134, String(meta.credits), S_PURSE, 0));
    this.content.add(labelAt(s, MAP_X + 130, top + 134, t('runScore'), S_INK, 1));
    this.content.add(new GlyphText(s, MAP_X + 142, top + 134, String(runScore), S_PURSE, 0));
    // region tabs
    REGION_IDS.forEach((r, i) => {
      const x = MAP_X + (i - 1.5) * 162, y = top + 198;
      const open = meta.unlocked > i * LEVELS_PER_REGION;
      const b = new KitButton(s, x, y, { w: 158, h: 50, color: TEAL, label: t('rt_' + r), style: S_TAB, sfx: 'ui-click', tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('regionLocked'), MAP_X, MAP_Y + MAP_H / 2 - 24); return; }
        this.pick(this.bestIn(i));
      });
      b.setEnabled(open);
      this.content.add(b);
      this.tabs.push(b);
    });
    this.stageLayer = s.add.container(0, 0);
    this.info = s.add.container(0, 0);
    this.content.add([this.stageLayer, this.info]);
    const by = MAP_Y + MAP_H / 2 - 76;
    this.button(MAP_X - 220, by, 170, 58, TEAL, t('shop'), () => this.act.shop(), { size: 'S' });
    this.playBtn = this.button(MAP_X, by - 4, 220, 70, ORANGE, t('play'), () => this.act.play(this.sel), { sfx: 'start' });
    this.button(MAP_X + 220, by, 170, 58, GREY, t('endRun'), () => this.act.endRun(), { size: 'S' });
    this.fi = 1;
    this.showFocus();
    this.pick(sel, true);
  }

  /** The mission to show when a region's tab is tapped: the furthest one open in it. */
  private bestIn(r: number): number { return Math.min(this.meta.unlocked, (r + 1) * LEVELS_PER_REGION, LEVEL_COUNT); }

  private pick(n: number, first = false): void {
    n = Math.max(1, Math.min(LEVEL_COUNT, Math.min(this.meta.unlocked, n)));
    const r = Math.floor((n - 1) / LEVELS_PER_REGION);
    const changed = r !== this.region || first;
    this.sel = n;
    this.region = r;
    this.tabs.forEach((b, i) => b.setSelected(i === r));
    if (changed) this.drawStages();
    this.pins.forEach((p, i) => p.setLook(r * LEVELS_PER_REGION + i + 1 === n ? ORANGE : TEAL, r * LEVELS_PER_REGION + i + 1 === n));
    this.drawInfo();
    if (!first) this.host.sfx('move', 0.3);
    this.act.select(n);
  }

  private drawStages(): void {
    const { h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    const s = this.scene, Ly = this.stageLayer;
    Ly.removeAll(true);
    this.pins = [];
    const top = MAP_Y - MAP_H / 2;
    Ly.add(fitWidth(labelAt(s, MAP_X - 50, top + 262, t('r_' + REGION_IDS[this.region]), S_REGION), 440));
    const pos = (i: number) => ({ x: MAP_X + (i - 2) * 118, y: top + 352 + (i % 2 ? 30 : -16) });
    for (let i = 0; i < LEVELS_PER_REGION - 1; i++) {
      const a = pos(i), b = pos(i + 1);
      for (let k = 1; k < 5; k++) Ly.add(s.add.image(a.x + ((b.x - a.x) * k) / 5, a.y + ((b.y - a.y) * k) / 5, ic('dot')).setScale(0.7));
    }
    for (let i = 0; i < LEVELS_PER_REGION; i++) {
      const n = this.region * LEVELS_PER_REGION + i + 1, p = pos(i);
      if (n > LEVEL_COUNT) continue;
      const open = n <= this.meta.unlocked;
      const b = new KitButton(s, p.x, p.y, { w: 80, h: 80, kind: 'round', color: TEAL, label: open ? String(i + 1) : '', style: S_PIN, sfx: null, tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('locked'), MAP_X, MAP_Y + MAP_H / 2 - 24); return; }
        if (n === this.sel) this.act.play(n); else this.pick(n);
      });
      b.setEnabled(open);
      if (!open) b.addContent(s.add.image(0, -2, ic('lock')).setDisplaySize(36, 36));
      Ly.add(b);
      this.pins.push(b);
      // the set-piece's badge
      const sp = RAW[n - 1]?.setpiece;
      if (sp) Ly.add(iconAt(s, p.x + 30, p.y - 32, sp === 'miner' ? 'generator' : 'rocket', 34));
      const got = starCount(this.meta.best[n - 1]);
      for (let k = 0; k < 3; k++) Ly.add(iconAt(s, p.x + (k - 1) * 22, p.y + 52, k < got ? 'star' : 'star-empty', 22));
    }
  }

  private drawInfo(): void {
    const { h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    const s = this.scene, I = this.info, n = this.sel;
    I.removeAll(true);
    const top = MAP_Y - MAP_H / 2;
    const y = top + 468;
    I.add(fitWidth(labelAt(s, MAP_X - 150, y, levelLabel(n), S_REGION, 1), 110));
    I.add(fitWidth(labelAt(s, MAP_X - 130, y, t('l' + n), S_NAME, 0), 430));
    const b = this.meta.best[n - 1];
    for (let k = 0; k < 3; k++) {
      I.add(iconAt(s, MAP_X - 226 + k * 118, y + 54, (b.stars >> k) & 1 ? 'star' : 'star-empty', 38));
      I.add(fitWidth(labelAt(s, MAP_X - 202 + k * 118, y + 54, t('star' + (k + 1)), S_STAR, 0), 84));
    }
    I.add(labelAt(s, MAP_X - 70, y + 104, t('bestTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X - 60, y + 104, b.time ? fmtTime(b.time) : '-:--', S_INK, 0));
    I.add(labelAt(s, MAP_X + 130, y + 104, t('parTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X + 140, y + 104, fmtTime(parOf(n)), S_INK, 0));
    I.add(iconAt(s, MAP_X + 252, y + 104, 'alien', 34).setAlpha(b.alien ? 1 : 0.3));
    I.add(new GlyphText(s, MAP_X + 300, top + 262, '★ ' + totalStars(this.meta) + '/' + LEVEL_COUNT * 3, S_NUM, 1));
  }

  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.pick(this.sel - 1); return true;
      case 'ArrowRight': case 'KeyD': this.pick(this.sel + 1); return true;
      case 'ArrowUp': case 'KeyW': this.pick(this.sel - LEVELS_PER_REGION); return true;
      case 'ArrowDown': this.pick(this.sel + LEVELS_PER_REGION); return true;
      case 'KeyC': case 'KeyQ': this.act.shop(); return true;
      case 'Enter': case 'Space': case 'NumpadEnter': this.playBtn.emit('pointerup', { wasTouch: false }); return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ the mission card

export interface SummaryData {
  n: number;
  stars: boolean[];
  newStars: boolean[];
  credits: number;
  crystals: string;
  crew: string;
  time: number;
  newBest: boolean;
  bonus: number;
  unharmed: number;
  score: number;
  alien: boolean;
  setpiece: 'miner' | 'escape' | null;
}

export class SummaryScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, d: SummaryData, onNext: () => void) {
    super(scene, host, { dim: 0.35 });
    const s = scene, W = s.scale.width, H = s.scale.height;
    const { w: SUM_W, h: SUM_H } = LAYOUT().sum;
    const land = SUM_W > SUM_H;
    const cy = land ? H / 2 - 12 : H / 2 + 10;
    this.content.add(themeCard(s, W / 2, cy, SUM_W, SUM_H));
    const top = cy - SUM_H / 2;
    const lx = land ? W / 2 - 220 : W / 2, rx = land ? W / 2 + 230 : W / 2;
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 72 : 80), t('sumTitle'), S_TITLE), 560));
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 122 : 132), t('l' + d.n), S_NAME), 520));
    d.stars.forEach((on, i) => {
      const x = lx + (i - 1) * (land ? 130 : 150), y = top + (land ? 214 : 222);
      const im = iconAt(s, x, y, on ? 'star' : 'star-empty', 92);
      this.content.add(im);
      this.content.add(fitWidth(labelAt(s, x, y + 62, t('star' + (i + 1)), S_STAR), 140));
      if (on) {
        const full = im.scale;
        im.setScale(0);
        s.tweens.add({ targets: im, scale: full, delay: 250 + i * 260, duration: 260, ease: 'Back.easeOut', onStart: () => { if (this.closed) return; host.sfx('star', 0.55); if (d.newStars[i]) this.sparkle(x, y, [0xffd070, 0xffffff], 18); } });
      }
    });
    const lines: [string, string][] = [['sumCrystals', d.crystals], ['sumCrew', d.crew], ['sumTime', fmtTime(d.time)], ['sumBonus', '+' + d.bonus], ['sumUnharmed', '+' + d.unharmed], ['sumCredits', '+' + d.credits]];
    lines.forEach(([k, v], i) => this.content.add(new FmtLine(s, rx, top + (land ? 178 : 342) + i * (land ? 42 : 38), S_LINE, 0.5).set(k, { n: v })));
    let extraY = top + (land ? 178 + 6 * 42 : 342 + 6 * 38);
    if (d.setpiece) { this.content.add(labelAt(s, rx, extraY, t(d.setpiece === 'miner' ? 'sp_minerDone' : 'sp_escapeDone'), S_SP)); extraY += 36; }
    if (d.alien) this.content.add(iconAt(s, rx + (land ? 170 : 220), top + (land ? 178 : 342), 'alien', 40));
    if (d.newBest) {
      const rib = labelAt(s, land ? lx + 150 : W / 2 + 210, land ? top + 300 : top + 160, t('sumNew'), S_RIB).setAngle(-8);
      this.content.add(rib);
      s.tweens.add({ targets: rib, scale: 1.1, duration: 380, yoyo: true, repeat: -1 });
    }
    this.content.add(labelAt(s, lx, top + (land ? 350 : 600), t('sumScore'), S_INK));
    const sc = new GlyphText(s, lx, top + (land ? 404 : 652), '0', S_SCORE, 0.5);
    this.content.add(sc);
    const tw = { v: 0 };
    this.counters.push(tw);
    s.tweens.add({ targets: tw, v: d.score, duration: 900, delay: 900, ease: 'Cubic.easeOut', onUpdate: () => { if (!this.closed && sc.active) sc.setText(String(Math.round(tw.v))); } });
    this.button(W / 2, cy + SUM_H / 2 + 6, 240, 66, ORANGE, t('nextBtn'), () => { this.close(); onNext(); });
    this.fi = 0;
    this.showFocus();
    void extraY;
  }
}

// ------------------------------------------------------------------ the hangar

const UICON: Record<UpgradeId, string> = { battery: 'battery', motor: 'p-boost', grip: 'rover', seats: 'crew', powers: 'p-shield', magnet: 'p-magnet' };

export class ShopScreen extends Panel {
  private purse!: GlyphText;
  private tiles = new Map<UpgradeId, Phaser.GameObjects.Container>();
  private paints: Phaser.GameObjects.Container;
  private back: KitButton;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onChange: (skin: boolean) => void, private onBack: () => void) {
    const { w: SW, h: SH, x: SX, y: SY } = LAYOUT().shop;
    super(scene, host, { board: [SW, SH, SX, SY], title: t('shopTitle'), titleX: SX - 90, titleY: SY - SH / 2 + 78, dim: 0 });
    const s = scene;
    const top = SY - SH / 2;
    const px = SX + SW / 2 - 170, py = top + 78;
    this.content.add(iconAt(s, px, py, 'credit', 42));
    this.purse = new GlyphText(s, px + 26, py, String(meta.credits), S_PURSE, 0);
    this.content.add(this.purse);
    this.content.add(new Para(s, SX, top + 124, t('shopSub'), S_SUB, 600, 0.5, 20));
    // the paint plate beside the rover
    const P = LAYOUT().paint;
    this.content.add(s.add.image(P.x, P.y + SKIN_PAD / 2, skinTexture(s, 'plate', PAINT_W, PAINT_H)));
    this.paints = s.add.container(0, 0);
    this.content.add(this.paints);
    this.back = new KitButton(s, SX, SY + SH / 2 - 56, { w: 220, h: 60, color: TEAL, label: t('cont'), style: S_BTN_S, sfx: 'ui-click' }, () => { this.close(); onBack(); });
    this.content.add(this.back);
    this.refresh();
    this.fi = this.focus.length - 1;
    this.showFocus();
  }

  protected escape(): void { this.close(); this.onBack(); }

  private tile(u: UpgradeId, i: number): void {
    const s = this.scene, S = LAYOUT().shop;
    const x = S.x, y = S.y - S.h / 2 + 184 + i * (TILE_H + 8);
    this.tiles.get(u)?.destroy();
    const c = s.add.container(x, y);
    const r = this.meta.ranks[u], def = UPGRADE[u], max = def.prices.length;
    const g = s.add.graphics();
    g.fillStyle(0x0c1424, 0.55).fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 10).lineStyle(2, 0x9fd8ff, 0.4).strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 10);
    c.add(g);
    c.add(iconAt(s, -TILE_W / 2 + 36, 0, UICON[u], 48));
    c.add(fitWidth(labelAt(s, -TILE_W / 2 + 72, -14, t('u_' + u), S_UNAME, 0), 190));
    const pg = s.add.graphics();
    for (let k = 0; k < max; k++) { pg.fillStyle(k < r ? 0xffc21a : 0x3a4458, 1).fillRoundedRect(-TILE_W / 2 + 72 + k * 26, 10, 20, 10, 3); pg.lineStyle(1.5, 0x0b1020, 0.9).strokeRoundedRect(-TILE_W / 2 + 72 + k * 26, 10, 20, 10, 3); }
    c.add(pg);
    const showRank = Math.min(max, r + 1);
    c.add(new Para(s, -TILE_W / 2 + 262, -12, t(`u_${u}_${showRank}`), S_DESC, 178, 0, 18).setAlpha(r >= max ? 0.55 : 1));
    const price = nextPrice(this.meta, u);
    const bx = TILE_W / 2 - 62;
    if (price === null) c.add(labelAt(s, bx, 0, t('maxed'), S_RIB));
    else {
      // the price beside its BUY button, both inside the tile
      c.add(iconAt(s, bx - 104, 0, 'credit', 24));
      c.add(new GlyphText(s, bx - 88, 0, String(price), S_PRICE, 0));
      const b = new KitButton(s, bx, 0, { w: 110, h: 46, color: GREEN, label: t('buy'), style: S_BTN_S, sfx: null, tapWhenOff: true }, () => {
        if (!buy(this.meta, u)) { this.deny(b, t('poor'), x, y); return; }
        this.host.sfx('buy', 0.6);
        this.sparkle(x + bx, y, [0xffd070, 0xffffff], 26);
        this.say(t('bought'), y, x);
        this.onChange(false);
        this.refresh();
      });
      b.setEnabled(canBuy(this.meta, u));
      c.add(b);
      this.focus.push({ btn: b, x: x + bx, y });
    }
    this.content.add(c);
    this.tiles.set(u, c);
  }

  /** The paint jobs: a swatch each, locked ones with the stars they need. */
  private drawPaints(): void {
    const s = this.scene, Pt = LAYOUT().paint, P = this.paints;
    P.removeAll(true);
    const y = Pt.y - 14;
    const stars = totalStars(this.meta);
    SKINS.forEach((sk, i) => {
      const x = Pt.x + (i - 2.5) * 96;
      const open = stars >= sk.stars;
      const on = this.meta.skin === sk.id;
      const b = new KitButton(s, x, y, { w: 70, h: 70, kind: 'round', color: GREY, label: '', style: S_PIN, sfx: null, tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('needStars'), Pt.x, Pt.y - 96); return; }
        if (paint(this.meta, sk.id as SkinId)) { this.host.sfx('buy', 0.5); this.say(t('painted'), Pt.y - 96, Pt.x); this.onChange(true); this.refresh(); }
      });
      const sw = s.add.graphics();
      sw.fillStyle(sk.body, 1).fillCircle(0, -2, 22).fillStyle(sk.accent, 1).fillRect(-22, -6, 44, 9).lineStyle(3, 0x0b1020, 1).strokeCircle(0, -2, 22);
      b.addContent(sw);
      if (!open) {
        b.addContent(s.add.image(0, -2, ic('lock')).setDisplaySize(30, 30));
        P.add(new GlyphText(s, x, y + 48, '★' + sk.stars, S_PRICE, 0.5));
      } else P.add(fitWidth(labelAt(s, x, y + 48, t('s_' + sk.id), S_DESC), 92));
      b.setEnabled(open);
      if (on) b.setSelected(true);
      P.add(b);
      this.focus.push({ btn: b, x, y });
    });
  }

  private refresh(): void {
    this.purse.setText(String(this.meta.credits));
    this.focus = [];
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    this.drawPaints();
    const S = LAYOUT().shop;
    this.focus.push({ btn: this.back, x: S.x, y: S.y + S.h / 2 - 56 });
    this.fi = Math.max(0, Math.min(this.fi, this.focus.length - 1));
    this.showFocus();
  }
}

export { HAZARD };
