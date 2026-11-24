// Trap Trail: the inner screens, in the menu theme (menu.ts): island-slice boards, toy buttons,
// cream cards.
//   - The trail map (after PLAY): the four worlds as tabs, the five stages of the chosen world as
//     pins on a dotted trail with the stars found, the chosen stage's name, stars, best time and
//     par, and PLAY, SHOP and END RUN. The live 3D stage turns on the right.
//   - The summary after a stage: stars popping in, coins, gems, time, the bonuses and the score.
//   - The upgrade shop: six upgrades with ranks, paid with coins; it opens after each summary and
//     from the map.
// Touch: tap. Keyboard and pad: arrows move (on the map: the stage), Enter presses, Esc goes back,
// S opens the shop from the map. Everything is painted under the Ayvago intro (prebakeScreens):
// opening a screen only places images and glyph numbers.
import Phaser from 'phaser';
import {
  t, labelTexture, skinTexture, SKIN_PAD, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import { UPGRADE, UPGRADE_IDS, WORLD_IDS, type UpgradeId } from './defs';
import { STAGE_COUNT, STAGES_PER_WORLD, worldOf, parOf } from './levels';
import { nextPrice, buy, canBuy, starCount, totalStars, type Meta } from './meta';
import { ICON_SHEET, iconFrame } from './icons';
import { makeArt } from './art';
import { INK, ORANGE, BLUE, GREEN, GREY, GOLD } from './paint';
import { fmtTime, stageLabel } from './hud';

export const OVERLAY_DEPTH = 9400;

const MAP_W = 620, MAP_H = 610, MAP_X = 340, MAP_Y = 395;
const SHOP_W = 1060, SHOP_H = 600, SHOP_Y = 404, TILE_W = 498, TILE_H = 122;
export const SUM_W = 640, SUM_H = 560;
export const SCREEN_CARDS = [{ w: SUM_W, h: SUM_H }];

export const S_TITLE: LabelStyle = { size: 46, fill: ['#fff8c8', '#ffd23a', '#f07a12'], stroke: INK, strokeWidth: 8 };
const S_SUB: LabelStyle = { size: 18, color: '#5a3a1a', stroke: null, shadow: false, body: true };
const S_BTN: LabelStyle = { size: 28 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_TAB: LabelStyle = { size: 19 };
const S_HEAD: LabelStyle = { size: 34, fill: ['#ffffff', '#fff0b0'], stroke: INK, strokeWidth: 6 };
const S_WORLD: LabelStyle = { size: 24, color: '#c45a12', stroke: null, shadow: false };
const S_INK: LabelStyle = { size: 21, color: '#3a2a1a', stroke: null, shadow: false, body: true };
const S_NAME: LabelStyle = { size: 24, color: '#1b2a4a', stroke: null, shadow: false };
const S_DESC: LabelStyle = { size: 16, color: '#4a3a2a', stroke: null, shadow: false, body: true };
const S_PIN: LabelStyle = { size: 30, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_NUM: LabelStyle = { size: 26, color: '#1b2a4a', stroke: null, shadow: false };
const S_PURSE: LabelStyle = { size: 30, color: '#ffd23a', stroke: INK, strokeWidth: 6 };
const S_PRICE: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_SCORE: LabelStyle = { size: 54, fill: ['#fff8c8', '#ffd23a', '#f07a12'], stroke: INK, strokeWidth: 8 };
const S_TOAST: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 6 };
const S_RIB: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_LINE: LabelStyle = { size: 22, color: '#3a2a1a', stroke: null, shadow: false };
const GLYPHS = '0123456789:/.,+-×★ ';

const TIME_GLYPHS = '0123456789:-';
const BTN_SIZES: [number, number, number, boolean][] = [[210, 66, ORANGE, true], [150, 56, BLUE, true], [150, 56, GREY, true], [136, 50, BLUE, true], [136, 50, ORANGE, true], [118, 52, GREEN, true], [230, 62, ORANGE, true], [200, 58, BLUE, true]];

export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const [w, h] of [[MAP_W, MAP_H], [SHOP_W, SHOP_H]]) skinTexture(scene, 'board', w, h);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['mapTitle', 'shopTitle', 'sumTitle']) labelTexture(scene, t(k), S_TITLE);
  bakePara(scene, t('shopSub'), S_SUB, 760);
  for (const [w, h, c, off] of BTN_SIZES) bakeButton(scene, 'button', w, h, c, off, true);
  bakeButton(scene, 'round', 76, 76, ORANGE, true, true);
  bakeButton(scene, 'round', 76, 76, BLUE, true, true);
  for (const k of ['play', 'shop', 'endRun', 'buy', 'maxed', 'cont', 'back', 'nextBtn']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['locked', 'worldLocked', 'poor', 'bought']) labelTexture(scene, t(k), S_TOAST);
  for (const w of WORLD_IDS) { labelTexture(scene, t('w_' + w), S_TAB); labelTexture(scene, t('w_' + w), S_WORLD); }
  for (let n = 1; n <= STAGE_COUNT; n++) { labelTexture(scene, t('s' + n), S_HEAD); labelTexture(scene, t('s' + n), S_NAME); labelTexture(scene, stageLabel(n), S_WORLD); }
  for (let n = 1; n <= STAGES_PER_WORLD; n++) labelTexture(scene, String(n), S_PIN);
  for (const k of ['bestTime', 'parTime', 'runScore']) labelTexture(scene, t(k), S_INK);
  labelTexture(scene, t('sumNew'), S_RIB);
  for (const k of ['sumCoins', 'sumGems', 'sumTime', 'sumBonus', 'sumNoHit']) bakeFmt(scene, k, ['n'], S_LINE, GLYPHS);
  labelTexture(scene, t('sumScore'), S_INK);
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_NAME);
    for (let r = 1; r <= UPGRADE[u].prices.length; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, 250);
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

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number, number]; title?: string; titleY?: number; titleX?: number; dim?: number; block?: boolean } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x0a1a3a, o.dim ?? 0.45).setOrigin(0).setInteractive();
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

  say(text: string, y = this.scene.scale.height - 36, x = this.scene.scale.width / 2): void {
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
    const em = this.scene.add.particles(x, y, 'tt-spark', {
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

const iconAt = (s: Phaser.Scene, x: number, y: number, key: string, size: number) => s.add.image(x, y, ICON_SHEET, iconFrame(key)).setDisplaySize(size, size);

// ------------------------------------------------------------------ the trail map

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
    super(scene, host, { board: [MAP_W, MAP_H, MAP_X, MAP_Y], title: t('mapTitle'), titleX: MAP_X, titleY: MAP_Y - MAP_H / 2 + 68, dim: 0 });
    const s = scene;
    this.sel = sel;
    const top = MAP_Y - MAP_H / 2;
    // purse and run score
    this.content.add(iconAt(s, MAP_X - 250, top + 122, 'coin', 40));
    this.content.add(new GlyphText(s, MAP_X - 226, top + 122, String(meta.coins), S_PURSE, 0));
    this.content.add(labelAt(s, MAP_X + 70, top + 122, t('runScore'), S_INK, 1));
    this.content.add(new GlyphText(s, MAP_X + 82, top + 122, String(runScore), S_PURSE, 0));
    // world tabs
    WORLD_IDS.forEach((w, i) => {
      const x = MAP_X + (i - 1.5) * 146, y = top + 182;
      const open = meta.unlocked > i * STAGES_PER_WORLD;
      const b = new KitButton(s, x, y, { w: 136, h: 50, color: BLUE, label: t('w_' + w), style: S_TAB, sfx: 'ui-click', tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('worldLocked'), MAP_X, MAP_Y + MAP_H / 2 - 18); return; }
        this.pick(this.bestIn(i));
      });
      b.setEnabled(open);
      this.content.add(b);
      this.tabs.push(b);
    });
    this.stageLayer = s.add.container(0, 0);
    this.info = s.add.container(0, 0);
    this.content.add([this.stageLayer, this.info]);
    // the buttons
    const by = MAP_Y + MAP_H / 2 - 62;
    this.button(MAP_X - 196, by, 150, 56, BLUE, t('shop'), () => this.act.shop(), { size: 'S' });
    this.playBtn = this.button(MAP_X, by - 4, 210, 66, ORANGE, t('play'), () => this.act.play(this.sel), { sfx: 'start' });
    this.button(MAP_X + 196, by, 150, 56, GREY, t('endRun'), () => this.act.endRun(), { size: 'S' });
    this.fi = 1;
    this.showFocus();
    this.pick(sel, true);
  }

  /** The stage to show when a world's tab is tapped: the furthest one open in it. */
  private bestIn(w: number): number { return Math.min(this.meta.unlocked, (w + 1) * STAGES_PER_WORLD, STAGE_COUNT); }

  private pick(n: number, first = false): void {
    n = Math.max(1, Math.min(STAGE_COUNT, Math.min(this.meta.unlocked, n)));
    const w = Math.floor((n - 1) / STAGES_PER_WORLD);
    const worldChanged = w !== this.world || first;
    this.sel = n;
    this.world = w;
    this.tabs.forEach((b, i) => b.setSelected(i === w));
    if (worldChanged) this.drawStages();
    this.pins.forEach((p, i) => p.setLook(w * STAGES_PER_WORLD + i + 1 === n ? ORANGE : BLUE, w * STAGES_PER_WORLD + i + 1 === n));
    this.drawInfo();
    if (!first) this.host.sfx('move', 0.3);
    this.act.select(n);
  }

  private drawStages(): void {
    const s = this.scene, L = this.stageLayer;
    L.removeAll(true);
    this.pins = [];
    const top = MAP_Y - MAP_H / 2;
    L.add(labelAt(s, MAP_X, top + 236, t('w_' + WORLD_IDS[this.world]), S_WORLD));
    const pos = (i: number) => ({ x: MAP_X + (i - 2) * 112, y: top + 318 + (i % 2 ? 36 : -14) });
    // the dotted trail between the pins
    for (let i = 0; i < STAGES_PER_WORLD - 1; i++) {
      const a = pos(i), b = pos(i + 1);
      for (let k = 1; k < 5; k++) L.add(s.add.image(a.x + ((b.x - a.x) * k) / 5, a.y + ((b.y - a.y) * k) / 5, 'tt-dot').setScale(0.7));
    }
    for (let i = 0; i < STAGES_PER_WORLD; i++) {
      const n = this.world * STAGES_PER_WORLD + i + 1, p = pos(i);
      const open = n <= this.meta.unlocked;
      const b = new KitButton(s, p.x, p.y, { w: 76, h: 76, kind: 'round', color: BLUE, label: open ? String(i + 1) : '', style: S_PIN, sfx: null, tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('locked'), MAP_X, MAP_Y + MAP_H / 2 - 18); return; }
        if (n === this.sel) this.act.play(n); else this.pick(n);
      });
      b.setEnabled(open);
      if (!open) b.addContent(s.add.image(0, -2, 'tt-lock').setDisplaySize(36, 36));
      L.add(b);
      this.pins.push(b);
      // the stars found
      const got = starCount(this.meta.best[n - 1]);
      for (let k = 0; k < 3; k++) L.add(s.add.image(p.x + (k - 1) * 22, p.y + 50, k < got ? 'tt-star-small' : 'tt-star-dim').setDisplaySize(22, 22));
    }
  }

  private drawInfo(): void {
    const s = this.scene, I = this.info, n = this.sel;
    I.removeAll(true);
    const top = MAP_Y - MAP_H / 2;
    const y = top + 452;
    I.add(fitWidth(labelAt(s, MAP_X, y, t('s' + n), S_NAME), 420));
    const b = this.meta.best[n - 1];
    for (let k = 0; k < 3; k++) I.add(iconAt(s, MAP_X - 210 + k * 34, y + 44, (b.stars >> k) & 1 ? 'star' : 'star-empty', 34));
    I.add(labelAt(s, MAP_X - 30, y + 44, t('bestTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X - 22, y + 44, b.time ? fmtTime(b.time) : '-:--', S_INK, 0));
    I.add(labelAt(s, MAP_X + 150, y + 44, t('parTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X + 158, y + 44, fmtTime(parOf(n)), S_INK, 0));
    I.add(new GlyphText(s, MAP_X + 260, top + 236, '★ ' + totalStars(this.meta) + '/' + STAGE_COUNT * 3, S_NUM, 1));
  }

  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.pick(this.sel - 1); return true;
      case 'ArrowRight': case 'KeyD': this.pick(this.sel + 1); return true;
      case 'ArrowUp': case 'KeyW': this.pick(this.sel - STAGES_PER_WORLD); return true;
      case 'ArrowDown': this.pick(this.sel + STAGES_PER_WORLD); return true;
      case 'KeyS': case 'KeyQ': this.act.shop(); return true;
      case 'Enter': case 'Space': case 'NumpadEnter': this.playBtn.emit('pointerup', { wasTouch: false }); return true;
    }
    return false;
  }
}

// ------------------------------------------------------------------ the summary

export interface SummaryData {
  n: number;
  stars: boolean[];
  newStars: boolean[];
  coins: number;
  gems: number;
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
    const cy = H / 2 + 10;
    this.content.add(themeCard(s, W / 2, cy, SUM_W, SUM_H));
    const top = cy - SUM_H / 2;
    this.content.add(fitWidth(labelAt(s, W / 2, top + 62, t('sumTitle'), S_TITLE), 520));
    this.content.add(fitWidth(labelAt(s, W / 2, top + 108, t('s' + d.n), S_NAME), 480));
    // the stars pop in one by one
    d.stars.forEach((on, i) => {
      const img = iconAt(s, W / 2 + (i - 1) * 96, top + 180, on ? 'star' : 'star-empty', 84);
      this.content.add(img);
      if (on) {
        img.setScale(0);
        s.tweens.add({ targets: img, scale: 84 / 128, delay: 250 + i * 260, duration: 260, ease: 'Back.easeOut', onStart: () => { host.sfx('star', 0.55); if (d.newStars[i]) this.sparkle(W / 2 + (i - 1) * 96, top + 180, [0xffd23a, 0xffffff], 18); } });
      }
    });
    const lines: [string, string][] = [['sumCoins', String(d.coins)], ['sumGems', String(d.gems)], ['sumTime', fmtTime(d.time)], ['sumBonus', '+' + d.bonus], ['sumNoHit', '+' + d.noHit]];
    lines.forEach(([k, v], i) => this.content.add(new FmtLine(s, W / 2, top + 258 + i * 34, S_LINE, 0.5).set(k, { n: v })));
    if (d.newBest) {
      const rib = labelAt(s, W / 2 + 190, top + 326, t('sumNew'), S_RIB).setAngle(-8);
      this.content.add(rib);
      s.tweens.add({ targets: rib, scale: 1.1, duration: 380, yoyo: true, repeat: -1 });
    }
    this.content.add(labelAt(s, W / 2, top + 442, t('sumScore'), S_INK));
    const sc = new GlyphText(s, W / 2, top + 482, '0', S_SCORE, 0.5);
    this.content.add(sc);
    const tw = { v: 0 };
    s.tweens.add({ targets: tw, v: d.score, duration: 900, delay: 900, ease: 'Cubic.easeOut', onUpdate: () => sc.setText(String(Math.round(tw.v))) });
    this.button(W / 2, cy + SUM_H / 2 + 6, 230, 62, ORANGE, t('nextBtn'), () => { this.close(); onNext(); });
    this.fi = 0;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ the shop

export class ShopScreen extends Panel {
  private purse!: GlyphText;
  private tiles = new Map<UpgradeId, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onBuy: (u: UpgradeId) => void, private onBack: () => void) {
    super(scene, host, { board: [SHOP_W, SHOP_H, scene.scale.width / 2, SHOP_Y], title: t('shopTitle'), titleY: SHOP_Y - SHOP_H / 2 + 72, dim: 0.5 });
    const s = scene, W = s.scale.width;
    const top = SHOP_Y - SHOP_H / 2;
    this.content.add(new Para(s, W / 2, top + 106, t('shopSub'), S_SUB, 760, 0.5, 21));
    const px = W / 2 + SHOP_W / 2 - 190, py = top + 72;
    this.content.add(iconAt(s, px, py, 'coin', 44));
    this.purse = new GlyphText(s, px + 26, py, String(meta.coins), S_PURSE, 0);
    this.content.add(this.purse);
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    this.button(W / 2, SHOP_Y + SHOP_H / 2 - 50, 200, 58, BLUE, t('cont'), () => { this.close(); onBack(); }, { size: 'S' });
    this.fi = this.focus.length - 1;
    this.showFocus();
  }

  protected escape(): void { this.close(); this.onBack(); }

  private tile(u: UpgradeId, i: number): void {
    const s = this.scene, W = s.scale.width;
    const x = W / 2 + (i % 2 ? 1 : -1) * (TILE_W / 2 + 8), y = SHOP_Y - SHOP_H / 2 + 196 + Math.floor(i / 2) * (TILE_H + 12);
    this.tiles.get(u)?.destroy();
    const c = s.add.container(x, y);
    const r = this.meta.ranks[u], def = UPGRADE[u], max = def.prices.length;
    const g = s.add.graphics();
    g.fillStyle(0xffffff, 0.55).fillRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 14).lineStyle(2.5, 0xc89a5a, 0.9).strokeRoundedRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H, 14);
    c.add(g);
    const ic = def.icon === 'dash' ? s.add.image(-TILE_W / 2 + 46, 0, 'tt-dash').setDisplaySize(62, 62).setTint(0x3aa8ff) : iconAt(s, -TILE_W / 2 + 46, 0, def.icon, 70);
    c.add(ic);
    c.add(fitWidth(labelAt(s, -TILE_W / 2 + 90, -36, t('u_' + u), S_NAME, 0), 230));
    // rank pips
    const pg = s.add.graphics();
    for (let k = 0; k < max; k++) { pg.fillStyle(k < r ? GOLD : 0xd8cbb4, 1).fillRoundedRect(-TILE_W / 2 + 92 + k * 28, -16, 22, 12, 4); pg.lineStyle(2, 0x1b2a4a, 0.8).strokeRoundedRect(-TILE_W / 2 + 92 + k * 28, -16, 22, 12, 4); }
    c.add(pg);
    const showRank = Math.min(max, r + 1);
    c.add(new Para(s, -TILE_W / 2 + 92, 4, t(`u_${u}_${showRank}`), S_DESC, 250, 0, 19).setAlpha(r >= max ? 0.55 : 1));
    const price = nextPrice(this.meta, u);
    const bx = TILE_W / 2 - 74;
    if (price === null) c.add(labelAt(s, bx, 0, t('maxed'), S_RIB));
    else {
      c.add(iconAt(s, bx - 30, -34, 'coin', 30));
      c.add(new GlyphText(s, bx - 12, -34, String(price), S_PRICE, 0));
      const b = new KitButton(s, bx, 14, { w: 118, h: 52, color: GREEN, label: t('buy'), style: S_BTN_S, sfx: null, tapWhenOff: true }, () => {
        // the word shows on the tile itself (the bottom row is the CONTINUE button's)
        if (!buy(this.meta, u)) { this.deny(b, t('poor'), x, y); return; }
        this.host.sfx('buy', 0.6);
        this.sparkle(x + bx, y, [0xffd23a, 0xffffff], 26);
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
