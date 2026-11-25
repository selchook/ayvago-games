// Dungeon Rescue: the inner screens, in the menu theme (menu.ts): oak boards strapped with iron with a
// parchment field, heraldic cloth buttons, parchment cards with a wax seal.
//   - The dungeon map (after PLAY): the four wings as tabs, the five levels of the chosen wing as pins
//     on a dotted path with the stars earned (the fifth, the Jailer Chief's, marked with his helmet),
//     the chosen level's name, stars, best time and par, its prisoners and whether its hidden chest was
//     found; PLAY, HIDEOUT and END RUN. The chosen level turns live in the top half (portrait) or
//     right of the board (landscape: the board on the left, clear of the pause button).
//   - The level-clear card: the three stars popping in (all rescued, never spotted, under par), the
//     rescued, coins, time, the bonuses and the score; in landscape a wide card, the stars and the
//     score on the left, the lines on the right.
//   - The hideout: three tabs. CREW: every kind of prisoner as a tile (locked until one is freed),
//     tap to take up to two along as companions, their skill shown below; ARMOUR: the knight's three
//     looks, unlocked by stars; UPGRADES: six lasting upgrades with ranks, paid with coins. The knight
//     and the two companions stand by a campfire in the live 3D preview beside the board.
// The game is adaptive: every screen reads its geometry from LAYOUT, chosen once at boot.
// Touch: tap. Keyboard and pad: arrows move, Enter presses, Esc goes back, Q/E (LB/RB) switch the
// hideout's tabs, H opens the hideout from the map. Everything is painted under the Ayvago intro
// (prebakeScreens): opening a screen only places images and glyph numbers.
import Phaser from 'phaser';
import {
  t, isLandscape, labelTexture, skinTexture, SKIN_PAD, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, labelWidth, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import { UPGRADE, UPGRADE_IDS, WING_IDS, KIND_IDS, CREW, CREW_IDS, LOOKS, PERK, type UpgradeId, type KindId, type LookId } from './defs';
import { LEVEL_COUNT, LEVELS_PER_WING, parOf, prisonersOf, isBossLevel } from './levels';
import { nextPrice, buy, canBuy, starCount, totalStars, toggleCompanion, wear, type Meta } from './meta';
import { makeArt } from './art';
import { INK, CRIMSON, ROYAL, SLATE, MOSS, GOLD } from './paint';
import { fmtTime, levelLabel } from './hud';

export const OVERLAY_DEPTH = 9400;

interface Layout {
  map: { w: number; h: number; x: number; y: number };
  hide: { w: number; h: number; x: number; y: number };
  sum: { w: number; h: number };
}
const PORTRAIT: Layout = {
  map: { w: 690, h: 730, x: 360, y: 880 },
  hide: { w: 700, h: 820, x: 360, y: 846 },
  sum: { w: 640, h: 780 },
};
const LANDSCAPE: Layout = {
  map: { w: 690, h: 700, x: 361, y: 360 },
  hide: { w: 700, h: 690, x: 366, y: 362 },
  sum: { w: 960, h: 540 },
};
let layoutNow: Layout | null = null;
export const LAYOUT = (): Layout => (layoutNow ??= isLandscape() ? LANDSCAPE : PORTRAIT);
/** The themed cards the core paints ahead (the level-clear card in this orientation). */
export const screenCards = (): { w: number; h: number }[] => [LAYOUT().sum];

export const S_TITLE: LabelStyle = { size: 50, fill: ['#fff6cc', '#f2cf6a', '#c8781e'], stroke: INK, strokeWidth: 8 };
const S_SUB: LabelStyle = { size: 19, color: '#3a2410', stroke: null, shadow: false, body: true };
const S_BTN: LabelStyle = { size: 28 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_TAB: LabelStyle = { size: 22 };
const S_WING: LabelStyle = { size: 28, color: '#6a1a1e', stroke: null, shadow: false };
const S_INK: LabelStyle = { size: 22, color: '#2a1a10', stroke: null, shadow: false, body: true };
const S_NAME: LabelStyle = { size: 27, color: '#2a1a10', stroke: null, shadow: false };
const S_SMALL: LabelStyle = { size: 22, color: '#2a1a10', stroke: null, shadow: false };
const S_DESC: LabelStyle = { size: 18, color: '#3a2a1a', stroke: null, shadow: false, body: true };
const S_UNAME: LabelStyle = { size: 23, color: '#2a1a10', stroke: null, shadow: false };
const S_PIN: LabelStyle = { size: 32, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
const S_NUM: LabelStyle = { size: 26, color: '#2a1a10', stroke: null, shadow: false };
const S_PURSE: LabelStyle = { size: 30, color: '#ffd070', stroke: INK, strokeWidth: 6 };
const S_PRICE: LabelStyle = { size: 22, color: '#fff6e0', stroke: INK, strokeWidth: 4 };
const S_SCORE: LabelStyle = { size: 56, fill: ['#fff6cc', '#f2cf6a', '#c8781e'], stroke: INK, strokeWidth: 8 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff6e0', stroke: INK, strokeWidth: 6 };
const S_RIB: LabelStyle = { size: 24, color: '#fff6e0', stroke: INK, strokeWidth: 5 };
const S_LINE: LabelStyle = { size: 24, color: '#2a1a10', stroke: null, shadow: false };
const S_STAR: LabelStyle = { size: 16, color: '#4a2e12', stroke: null, shadow: false, body: true };
const S_TAG: LabelStyle = { size: 18, color: '#fff6e0', stroke: INK, strokeWidth: 4 };
const S_TILE: LabelStyle = { size: 22, color: '#fff6e0', stroke: INK, strokeWidth: 4 };
const S_NAMES: LabelStyle = { size: 17, color: '#ffe8c0', stroke: INK, strokeWidth: 3, body: true };
const GLYPHS = '0123456789:/.,+-×★ ';
const TIME_GLYPHS = '0123456789:-';
const BTN_SIZES: [number, number, number][] = [[220, 70, CRIMSON], [176, 58, ROYAL], [176, 58, SLATE], [160, 52, ROYAL], [150, 54, MOSS], [240, 66, CRIMSON], [220, 60, ROYAL], [128, 46, MOSS], [112, 44, MOSS], [128, 46, ROYAL], [128, 46, CRIMSON]];
/** The hideout's tiles. */
const CREW_TILE = { w: 214, h: 62, hLand: 50 };
const SHOP_TILE = { w: 316, h: 138, gap: 8 };
const SHOP_TILE_L = { w: 316, h: 96, gap: 6 };
/** The effect text's width on an upgrade tile (beside the BUY button). */
const SHOP_DESC_W = 166;
const LOOK_TILE = { w: 200, h: 236 };
const DETAIL_W = 600;

export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  const L = LAYOUT();
  for (const b of [L.map, L.hide]) skinTexture(scene, 'board', b.w, b.h);
  for (const c of screenCards()) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['mapTitle', 'hideTitle', 'sumTitle']) labelTexture(scene, t(k), S_TITLE);
  for (const k of ['crewSub', 'looksSub', 'shopSub']) bakePara(scene, t(k), S_SUB, 600);
  for (const [w, h, c] of BTN_SIZES) bakeButton(scene, 'button', w, h, c, true, true);
  bakeButton(scene, 'round', 84, 84, CRIMSON, true, true);
  bakeButton(scene, 'round', 84, 84, ROYAL, true, true);
  for (const k of ['playBtn', 'hideout', 'endRun', 'buy', 'maxed', 'cont', 'nextBtn', 'pick', 'picked', 'wear', 'worn', 'back']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['tabCrew', 'tabLooks', 'tabShop']) labelTexture(scene, t(k), S_TAB);
  for (const k of ['locked2', 'wingLocked', 'poor', 'bought', 'notFreed']) labelTexture(scene, t(k), S_TOAST);
  for (const w of WING_IDS) { labelTexture(scene, t('wt_' + w), S_TAB); labelTexture(scene, t('w_' + w), S_WING); }
  for (let n = 1; n <= LEVEL_COUNT; n++) { labelTexture(scene, t('l' + n), S_NAME); labelTexture(scene, levelLabel(n), S_WING); labelTexture(scene, t('prisonersN', { n: prisonersOf(n).length }), S_INK); }
  for (let n = 1; n <= LEVELS_PER_WING; n++) labelTexture(scene, String(n), S_PIN);
  for (const k of ['bestTime', 'parTime', 'runScore', 'chestFound', 'chestHidden', 'bossHere']) labelTexture(scene, t(k), S_INK);
  for (const k of ['star1', 'star2', 'star3']) labelTexture(scene, t(k), S_STAR);
  labelTexture(scene, t('sumNew'), S_RIB);
  for (const k of ['sumRescued', 'sumCoins', 'sumTime', 'sumUnseen', 'sumBonus', 'sumChief']) bakeFmt(scene, k, ['n'], S_LINE, GLYPHS);
  labelTexture(scene, t('sumScore'), S_INK);
  for (const k of KIND_IDS) { labelTexture(scene, t('k_' + k), S_TILE); bakePara(scene, t('perk_' + k), S_DESC, DETAIL_W - 50); }
  for (const id of CREW_IDS) labelTexture(scene, CREW[id].name, S_NAMES);
  for (const c of [CRIMSON, ROYAL, SLATE]) bakeButton(scene, 'plate', CREW_TILE.w, isLandscape() ? CREW_TILE.hLand : CREW_TILE.h, c, true, true);
  for (const l of LOOKS) { labelTexture(scene, t('look_' + l.id), S_SMALL); labelTexture(scene, t('needStars', { n: l.stars }), S_TAG); }
  bakeFmt(scene, 'crewN', ['n', 'm'], S_INK, GLYPHS);
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_UNAME);
    for (let r = 1; r <= UPGRADE[u].prices.length; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, SHOP_DESC_W);
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
    const dim = scene.add.rectangle(0, 0, width, height, 0x0c0a0e, o.dim ?? 0.45).setOrigin(0).setInteractive();
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
    const em = this.scene.add.particles(x, y, 'dr-spark', {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }

  protected button(x: number, y: number, w: number, h: number, color: number, label: string, onTap: () => void, o: { size?: 'L' | 'S'; sfx?: string | null; tapWhenOff?: boolean; kind?: 'button' | 'round'; into?: Phaser.GameObjects.Container } = {}): KitButton {
    const b = new KitButton(this.scene, x, y, { w, h, kind: o.kind, color, label, style: o.size === 'S' ? S_BTN_S : S_BTN, sfx: o.sfx === undefined ? 'ui-click' : o.sfx, tapWhenOff: o.tapWhenOff }, onTap);
    (o.into ?? this.content).add(b);
    this.addFocus(b, x, y);
    return b;
  }
}

const iconAt = (s: Phaser.Scene, x: number, y: number, key: string, size: number) => s.add.image(x, y, key).setDisplaySize(size, size);

// ------------------------------------------------------------------ the dungeon map

export interface MapActions {
  select(n: number): void;
  play(n: number): void;
  hideout(): void;
  endRun(): void;
}

export class MapScreen extends Panel {
  private sel: number;
  private wing = 0;
  private tabs: KitButton[] = [];
  private pins: KitButton[] = [];
  private stageLayer: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private playBtn: KitButton;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, sel: number, runScore: number, private act: MapActions) {
    const { w: MAP_W, h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    super(scene, host, { board: [MAP_W, MAP_H, MAP_X, MAP_Y], title: t('mapTitle'), titleX: MAP_X, titleY: MAP_Y - MAP_H / 2 + 84, dim: 0 });
    const s = scene;
    this.sel = sel;
    const top = MAP_Y - MAP_H / 2;
    this.content.add(iconAt(s, MAP_X - 262, top + 140, 'dr-coin', 40));
    this.content.add(new GlyphText(s, MAP_X - 236, top + 140, String(meta.coins), S_PURSE, 0));
    this.content.add(labelAt(s, MAP_X + 130, top + 140, t('runScore'), S_INK, 1));
    this.content.add(new GlyphText(s, MAP_X + 142, top + 140, String(runScore), S_PURSE, 0));
    WING_IDS.forEach((w, i) => {
      const x = MAP_X + (i - 1.5) * 160, y = top + 204;
      const open = meta.unlocked > i * LEVELS_PER_WING;
      const b = new KitButton(s, x, y, { w: 160, h: 52, color: ROYAL, label: t('wt_' + w), style: S_TAB, sfx: 'ui-click', tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('wingLocked'), MAP_X, MAP_Y + MAP_H / 2 - 22); return; }
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
    this.button(MAP_X - 218, by, 176, 58, ROYAL, t('hideout'), () => this.act.hideout(), { size: 'S' });
    this.playBtn = this.button(MAP_X, by - 4, 220, 70, CRIMSON, t('playBtn'), () => this.act.play(this.sel), { sfx: 'start' });
    this.button(MAP_X + 218, by, 176, 58, SLATE, t('endRun'), () => this.act.endRun(), { size: 'S' });
    this.fi = 1;
    this.showFocus();
    this.pick(sel, true);
  }

  private bestIn(w: number): number { return Math.min(this.meta.unlocked, (w + 1) * LEVELS_PER_WING, LEVEL_COUNT); }

  private pick(n: number, first = false): void {
    n = Math.max(1, Math.min(LEVEL_COUNT, Math.min(this.meta.unlocked, n)));
    const w = Math.floor((n - 1) / LEVELS_PER_WING);
    const changed = w !== this.wing || first;
    this.sel = n;
    this.wing = w;
    this.tabs.forEach((b, i) => b.setSelected(i === w));
    if (changed) this.drawStages();
    this.pins.forEach((p, i) => p.setLook(w * LEVELS_PER_WING + i + 1 === n ? CRIMSON : ROYAL, w * LEVELS_PER_WING + i + 1 === n));
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
    L.add(fitWidth(labelAt(s, MAP_X - 40, top + 262, t('w_' + WING_IDS[this.wing]), S_WING), 420));
    const pos = (i: number) => ({ x: MAP_X + (i - 2) * 118, y: top + 336 + (i % 2 ? 26 : -14) });
    for (let i = 0; i < LEVELS_PER_WING - 1; i++) {
      const a = pos(i), b = pos(i + 1);
      for (let k = 1; k < 5; k++) L.add(s.add.image(a.x + ((b.x - a.x) * k) / 5, a.y + ((b.y - a.y) * k) / 5, 'dr-dot').setScale(0.7));
    }
    for (let i = 0; i < LEVELS_PER_WING; i++) {
      const n = this.wing * LEVELS_PER_WING + i + 1, p = pos(i);
      const open = n <= this.meta.unlocked;
      const b = new KitButton(s, p.x, p.y, { w: 84, h: 84, kind: 'round', color: ROYAL, label: open ? String(i + 1) : '', style: S_PIN, sfx: null, tapWhenOff: true }, () => {
        if (!open) { this.deny(b, t('locked2'), MAP_X, MAP_Y + MAP_H / 2 - 22); return; }
        if (n === this.sel) this.act.play(n); else this.pick(n);
      });
      b.setEnabled(open);
      if (!open) b.addContent(s.add.image(0, -2, 'dr-lock').setDisplaySize(36, 36));
      L.add(b);
      if (isBossLevel(n)) L.add(iconAt(s, p.x + 34, p.y - 36, 'dr-chief', 40));
      this.pins.push(b);
      const got = starCount(this.meta.best[n - 1]);
      for (let k = 0; k < 3; k++) L.add(s.add.image(p.x + (k - 1) * 22, p.y + 54, k < got ? 'dr-star-small' : 'dr-star-dim').setDisplaySize(22, 22));
    }
  }

  private drawInfo(): void {
    const { h: MAP_H, x: MAP_X, y: MAP_Y } = LAYOUT().map;
    const s = this.scene, I = this.info, n = this.sel;
    I.removeAll(true);
    const top = MAP_Y - MAP_H / 2;
    const y = top + 452;
    I.add(fitWidth(labelAt(s, MAP_X - 150, y, levelLabel(n) + '  ', S_WING, 1), 120));
    I.add(fitWidth(labelAt(s, MAP_X - 140, y, t('l' + n), S_NAME, 0), 420));
    const b = this.meta.best[n - 1];
    for (let k = 0; k < 3; k++) {
      I.add(iconAt(s, MAP_X - 250 + k * 176, y + 44, (b.stars >> k) & 1 ? 'dr-star' : 'dr-star-empty', 36));
      I.add(fitWidth(labelAt(s, MAP_X - 226 + k * 176, y + 44, t('star' + (k + 1)), S_STAR, 0), 140));
    }
    I.add(labelAt(s, MAP_X - 40, y + 84, t('bestTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X - 30, y + 84, b.time ? fmtTime(b.time) : '-:--', S_INK, 0));
    I.add(labelAt(s, MAP_X + 160, y + 84, t('parTime'), S_INK, 1));
    I.add(new GlyphText(s, MAP_X + 170, y + 84, fmtTime(parOf(n)), S_INK, 0));
    I.add(iconAt(s, MAP_X - 250, y + 120, 'dr-person', 28));
    I.add(labelAt(s, MAP_X - 228, y + 120, t('prisonersN', { n: prisonersOf(n).length }), S_INK, 0));
    if (isBossLevel(n)) { I.add(iconAt(s, MAP_X + 18, y + 120, 'dr-chief', 30)); I.add(fitWidth(labelAt(s, MAP_X + 40, y + 120, t('bossHere'), S_INK, 0), 250)); }
    else { I.add(iconAt(s, MAP_X + 18, y + 120, 'dr-chest', 28).setAlpha(b.chest ? 1 : 0.45)); I.add(fitWidth(labelAt(s, MAP_X + 40, y + 120, t(b.chest ? 'chestFound' : 'chestHidden'), S_INK, 0), 250)); }
    I.add(new GlyphText(s, MAP_X + 296, top + 262, '★ ' + totalStars(this.meta) + '/' + LEVEL_COUNT * 3, S_NUM, 1));
  }

  key(code: string): boolean {
    if (this.closed) return false;
    switch (code) {
      case 'ArrowLeft': case 'KeyA': this.pick(this.sel - 1); return true;
      case 'ArrowRight': case 'KeyD': this.pick(this.sel + 1); return true;
      case 'ArrowUp': case 'KeyW': this.pick(this.sel - LEVELS_PER_WING); return true;
      case 'ArrowDown': this.pick(this.sel + LEVELS_PER_WING); return true;
      case 'KeyH': case 'KeyQ': case 'KeyC': this.act.hideout(); return true;
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
  rescued: string;
  coins: number;
  time: number;
  newBest: boolean;
  unseen: number;
  bonus: number;
  chief: number;
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
    const lx = land ? W / 2 - 220 : W / 2, rx = land ? W / 2 + 225 : W / 2;
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 72 : 80), t('sumTitle'), S_TITLE), 540));
    this.content.add(fitWidth(labelAt(s, W / 2, top + (land ? 122 : 132), t('l' + d.n), S_NAME), 480));
    d.stars.forEach((on, i) => {
      const x = lx + (i - 1) * (land ? 130 : 150), y = top + (land ? 212 : 218);
      const img = iconAt(s, x, y, on ? 'dr-star' : 'dr-star-empty', 92);
      this.content.add(img);
      this.content.add(fitWidth(labelAt(s, x, y + 62, t('star' + (i + 1)), S_STAR), 140));
      if (on) {
        img.setScale(0);
        s.tweens.add({ targets: img, scale: 92 / 96, delay: 250 + i * 260, duration: 260, ease: 'Back.easeOut', onStart: () => { host.sfx('star', 0.55); if (d.newStars[i]) this.sparkle(x, y, [0xffd070, 0xffffff], 18); } });
      }
    });
    const lines: [string, string][] = [['sumRescued', d.rescued], ['sumCoins', String(d.coins)], ['sumTime', fmtTime(d.time)], ['sumUnseen', String(d.unseen)], ['sumBonus', String(d.bonus)]];
    if (d.chief) lines.push(['sumChief', String(d.chief)]);
    lines.forEach(([k, v], i) => this.content.add(new FmtLine(s, rx, top + (land ? 168 : 334) + i * (land ? 44 : 40), S_LINE, 0.5).set(k, { n: v })));
    if (d.newBest) {
      const rib = labelAt(s, land ? rx + 160 : W / 2 + 200, land ? top + 440 : top + 404, t('sumNew'), S_RIB).setAngle(-8);
      this.content.add(rib);
      s.tweens.add({ targets: rib, scale: 1.1, duration: 380, yoyo: true, repeat: -1 });
    }
    this.content.add(labelAt(s, lx, top + (land ? 346 : 588), t('sumScore'), S_INK));
    const sc = new GlyphText(s, lx, top + (land ? 404 : 642), '0', S_SCORE, 0.5);
    this.content.add(sc);
    const tw = { v: 0 };
    s.tweens.add({ targets: tw, v: d.score, duration: 900, delay: 900, ease: 'Cubic.easeOut', onUpdate: () => sc.setText(String(Math.round(tw.v))) });
    this.button(W / 2, cy + SUM_H / 2 + 6, 240, 66, CRIMSON, t('nextBtn'), () => { this.close(); onNext(); });
    this.fi = 0;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ the hideout

export type HideoutTab = 'crew' | 'looks' | 'shop';

export interface HideoutActions {
  /** The knight's look or the companions changed (the preview follows). */
  changed(): void;
  back(): void;
}

export class HideoutScreen extends Panel {
  private tab: HideoutTab;
  private tabs: KitButton[] = [];
  private page: Phaser.GameObjects.Container;
  private purse!: GlyphText;
  private detail: Phaser.GameObjects.Container;
  private backBtn: KitButton;
  private pageFocus = 0;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, tab: HideoutTab, private act: HideoutActions) {
    const { w: W, h: H, x: X, y: Y } = LAYOUT().hide;
    super(scene, host, { board: [W, H, X, Y], title: t('hideTitle'), titleX: X, titleY: Y - H / 2 + 84, dim: 0 });
    const s = scene;
    this.tab = tab;
    const top = Y - H / 2;
    const px = X + W / 2 - 150, py = top + 84;
    this.content.add(iconAt(s, px, py, 'dr-coin', 40));
    this.purse = new GlyphText(s, px + 26, py, String(meta.coins), S_PURSE, 0);
    this.content.add(this.purse);
    (['crew', 'looks', 'shop'] as HideoutTab[]).forEach((k, i) => {
      const b = new KitButton(s, X + (i - 1) * 196, top + 146, { w: 176, h: 58, color: ROYAL, label: t(k === 'crew' ? 'tabCrew' : k === 'looks' ? 'tabLooks' : 'tabShop'), style: S_TAB, sfx: 'ui-click' }, () => this.show(k));
      this.content.add(b);
      this.tabs.push(b);
    });
    this.page = s.add.container(0, 0);
    this.detail = s.add.container(0, 0);
    this.content.add([this.page, this.detail]);
    this.backBtn = this.button(X, Y + H / 2 - 52, 220, 60, CRIMSON, t('cont'), () => { this.close(); this.act.back(); }, { size: 'S' });
    this.show(tab, true);
  }

  protected escape(): void { this.close(); this.act.back(); }

  key(code: string): boolean {
    if (this.closed) return false;
    const order: HideoutTab[] = ['crew', 'looks', 'shop'];
    if (code === 'KeyQ' || code === 'KeyE' || code === 'Tab') {
      const i = order.indexOf(this.tab);
      this.show(order[(i + (code === 'KeyQ' ? 2 : 1)) % 3]);
      return true;
    }
    return super.key(code);
  }

  /** Opens a tab (its tiles replace the page). */
  show(tab: HideoutTab, first = false): void {
    this.tab = tab;
    this.tabs.forEach((b, i) => b.setSelected(['crew', 'looks', 'shop'][i] === tab));
    this.page.removeAll(true);
    this.detail.removeAll(true);
    this.focus = [];
    this.tabs.forEach((b) => this.focus.push({ btn: b, x: b.x, y: b.y }));
    this.focus.push({ btn: this.backBtn, x: this.backBtn.x, y: this.backBtn.y });
    if (tab === 'crew') this.drawCrew();
    else if (tab === 'looks') this.drawLooks();
    else this.drawShop();
    this.fi = Math.min(this.focus.length - 1, Math.max(this.pageFocus, 4));
    if (first) this.fi = this.focus.length > 4 ? 4 : this.focus.length - 1;
    this.showFocus();
    if (!first) this.host.sfx('move', 0.3);
  }

  private sub(key: string): void {
    const { x: X, y: Y, h: H } = LAYOUT().hide;
    this.page.add(new Para(this.scene, X, Y - H / 2 + 196, t(key), S_SUB, 600, 0.5, 22));
  }

  // ---- the crew: two columns of kinds, tap to take one along
  private drawCrew(): void {
    const s = this.scene, { x: X, y: Y, h: H } = LAYOUT().hide;
    this.sub('crewSub');
    // three columns of five (shorter tiles on the landscape board)
    const land = isLandscape();
    const cols = 3, rows = 5;
    const TW = CREW_TILE.w, TH = land ? CREW_TILE.hLand : CREW_TILE.h, gap = land ? 5 : 8, gapX = 10;
    const top = Y - H / 2 + (land ? 262 : 246);
    const freedKinds = new Set(this.meta.crew.map((c) => CREW[c].kind));
    this.page.add(new FmtLine(s, X + 300, Y - H / 2 + (land ? 238 : 220), S_INK, 1).set('crewN', { n: String(this.meta.crew.length), m: String(CREW_IDS.length) }));
    KIND_IDS.forEach((k, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      const x = X + (col - (cols - 1) / 2) * (TW + gapX), y = top + row * (TH + gap) + TH / 2;
      const owned = freedKinds.has(k);
      const members = this.meta.crew.filter((c) => CREW[c].kind === k);
      const chosen = members.some((m) => this.meta.companions.includes(m));
      const b = new KitButton(s, x, y, { w: TW, h: TH, kind: 'plate', color: chosen ? CRIMSON : owned ? ROYAL : SLATE, label: '', style: S_SMALL, sfx: null, tapWhenOff: true, on: chosen }, () => {
        this.showDetail(k);
        if (!owned) { this.deny(b, t('notFreed'), X, Y + H / 2 - 110); return; }
        toggleCompanion(this.meta, members[0]);
        this.host.sfx(chosen ? 'move' : 'buy', 0.5);
        this.pageFocus = this.fi;
        this.show('crew');
        this.showDetail(k);
        this.act.changed();
      });
      b.setEnabled(owned);
      const ix = land ? 28 : 34, tx = land ? 54 : 66;
      b.addContent(iconAt(s, -TW / 2 + ix, 0, 'dr-k-' + k, land ? 38 : 46));
      b.addContent(fitWidth(labelAt(s, -TW / 2 + tx, land ? -10 : -11, t('k_' + k), S_TILE, 0), TW - tx - 46));
      // the members' names, each a painted label, side by side (as many as fit)
      let nx = -TW / 2 + tx;
      for (const m of members.slice(0, 4)) {
        const w = labelWidth(CREW[m].name, S_NAMES);
        if (nx + w > TW / 2 - 44) break;
        b.addContent(labelAt(s, nx, land ? 13 : 15, CREW[m].name, S_NAMES, 0));
        nx += w + 10;
      }
      if (chosen) b.addContent(iconAt(s, TW / 2 - 26, 0, 'dr-star-small', land ? 30 : 34));
      else if (!owned) b.addContent(iconAt(s, TW / 2 - 26, 0, 'dr-lock', land ? 26 : 30));
      this.page.add(b);
      this.focus.push({ btn: b, x, y });
    });
    this.showDetail(this.meta.companions.length ? CREW[this.meta.companions[0]].kind : 'casual');
  }

  private showDetail(k: KindId): void {
    const s = this.scene, { x: X, y: Y, h: H } = LAYOUT().hide;
    this.detail.removeAll(true);
    const y = Y + H / 2 - 128;
    this.detail.add(iconAt(s, X - DETAIL_W / 2 + 20, y, 'dr-k-' + k, 40));
    this.detail.add(new Para(s, X - DETAIL_W / 2 + 48, y - 10, t('perk_' + k), S_DESC, DETAIL_W - 50, 0, 20));
    void PERK;
  }

  // ---- the knight's armour
  private drawLooks(): void {
    const s = this.scene, { x: X, y: Y, h: H } = LAYOUT().hide;
    this.sub('looksSub');
    const stars = totalStars(this.meta);
    const y = Y - H / 2 + 400;
    LOOKS.forEach((l, i) => {
      const x = X + (i - 1) * (LOOK_TILE.w + 18);
      const open = stars >= l.stars, worn = this.meta.look === l.id;
      const g = s.add.graphics();
      g.fillStyle(worn ? 0xffe6a0 : 0xfff2d8, open ? 0.5 : 0.25).fillRoundedRect(x - LOOK_TILE.w / 2, y - LOOK_TILE.h / 2, LOOK_TILE.w, LOOK_TILE.h, 12);
      g.lineStyle(worn ? 4 : 2.5, worn ? GOLD : 0x8a5a24, 0.9).strokeRoundedRect(x - LOOK_TILE.w / 2, y - LOOK_TILE.h / 2, LOOK_TILE.w, LOOK_TILE.h, 12);
      this.page.add(g);
      const helm = iconAt(s, x, y - 52, 'dr-helm', 96);
      if (l.id !== 'knight') helm.setTint(0xffd060);
      if (!open) helm.setAlpha(0.4);
      this.page.add(helm);
      this.page.add(fitWidth(labelAt(s, x, y + 26, t('look_' + l.id), S_SMALL), LOOK_TILE.w - 16));
      if (!open) {
        this.page.add(iconAt(s, x, y + 78, 'dr-lock', 34));
        this.page.add(labelAt(s, x, y + 108, t('needStars', { n: l.stars }), S_TAG));
        return;
      }
      const b = new KitButton(s, x, y + 82, { w: 128, h: 46, color: worn ? MOSS : ROYAL, label: t(worn ? 'worn' : 'wear'), style: S_BTN_S, sfx: null, on: worn }, () => {
        if (worn) return;
        wear(this.meta, l.id as LookId);
        this.host.sfx('buy', 0.5);
        this.pageFocus = this.fi;
        this.show('looks');
        this.act.changed();
      });
      this.page.add(b);
      this.focus.push({ btn: b, x, y: y + 82 });
    });
  }

  // ---- the upgrades
  private drawShop(): void {
    this.sub('shopSub');
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
  }

  private tile(u: UpgradeId, i: number): void {
    // two columns of three: icon, name and rank pips at the top, the next rank's effect below,
    // the price and BUY on the right
    const s = this.scene, { x: X, y: Y, h: H } = LAYOUT().hide;
    const T = isLandscape() ? SHOP_TILE_L : SHOP_TILE;
    const col = i % 2, row = Math.floor(i / 2);
    const x = X + (col - 0.5) * (T.w + 12), y = Y - H / 2 + 252 + T.h / 2 + row * (T.h + T.gap);
    const c = s.add.container(x, y);
    const r = this.meta.ranks[u], def = UPGRADE[u], max = def.prices.length;
    const g = s.add.graphics();
    g.fillStyle(0xfff2d8, 0.42).fillRoundedRect(-T.w / 2, -T.h / 2, T.w, T.h, 12).lineStyle(2.5, 0x8a5a24, 0.9).strokeRoundedRect(-T.w / 2, -T.h / 2, T.w, T.h, 12);
    c.add(g);
    c.add(iconAt(s, -T.w / 2 + 30, -T.h / 2 + 28, UICON[u], 42));
    c.add(fitWidth(labelAt(s, -T.w / 2 + 58, -T.h / 2 + 20, t('u_' + u), S_UNAME, 0), T.w - 58 - 118));
    const pg = s.add.graphics();
    for (let k = 0; k < max; k++) { pg.fillStyle(k < r ? GOLD : 0xc8b898, 1).fillRoundedRect(-T.w / 2 + 58 + k * 26, -T.h / 2 + 38, 20, 10, 4); pg.lineStyle(2, 0x2a1a0c, 0.8).strokeRoundedRect(-T.w / 2 + 58 + k * 26, -T.h / 2 + 38, 20, 10, 4); }
    c.add(pg);
    const showRank = Math.min(max, r + 1);
    c.add(new Para(s, -T.w / 2 + 14, -T.h / 2 + (T.h < 120 ? 54 : 60), t(`u_${u}_${showRank}`), S_DESC, SHOP_DESC_W, 0, 19).setAlpha(r >= max ? 0.55 : 1));
    const price = nextPrice(this.meta, u);
    const bx = T.w / 2 - 64;
    if (price === null) c.add(labelAt(s, bx, 0, t('maxed'), S_RIB));
    else {
      c.add(iconAt(s, bx - 30, -T.h / 2 + 22, 'dr-coin', 26));
      c.add(new GlyphText(s, bx - 12, -T.h / 2 + 22, String(price), S_PRICE, 0));
      const b = new KitButton(s, bx, T.h / 2 - 28, { w: 112, h: 44, color: MOSS, label: t('buy'), style: S_BTN_S, sfx: null, tapWhenOff: true }, () => {
        if (!buy(this.meta, u)) { this.deny(b, t('poor'), x, y); return; }
        this.host.sfx('buy', 0.6);
        this.sparkle(x + bx, y, [0xffd070, 0xffffff], 26);
        this.say(t('bought'), y, x);
        this.purse.setText(String(this.meta.coins));
        this.pageFocus = this.fi;
        this.show('shop');
      });
      b.setEnabled(canBuy(this.meta, u));
      c.add(b);
      this.focus.push({ btn: b, x: x + bx, y: y + T.h / 2 - 28 });
    }
    this.page.add(c);
  }
}

const UICON: Record<UpgradeId, string> = { soft: 'dr-swift', hands: 'dr-key', heart: 'dr-person', arm: 'dr-vase', tricks: 'dr-clock', smoke: 'dr-smoke' };
