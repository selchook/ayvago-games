// Neon Ronin: the inner screens, in the menu theme (menu.ts): neon-framed black glass, magenta and
// cyan buttons with hazard strips.
//   - The district map: four districts of three levels and a boss, each node with its stars, locked
//     ones dark; the gears, the stars collected, CYBERWARE and PLAY.
//   - The level brief: the level's name, its three star goals (earned ones lit), the best time,
//     START, CYBERWARE, MAP.
//   - The ripperdoc: six cyberware tracks, three ranks each, bought with gears.
//   - The implant draft: three cards, one reroll, LATER (on the results screen, from the pause, after
//     a boss); never opened by play itself.
//   - The level results: stars, time against par, wrecked foes, gears, chips, best combo, the
//     score counted up, a new record, a new ability, the implant earned (PICK); NEXT, RETRY, MAP.
//   - The Moves screen: every blade move with its input (keys or touch), what it does and how it
//     unlocks (from the menu row and the pause).
//   - The district-clear and campaign cards; beside the pause: the run's implants (PICK when one is
//     banked), the moves and the level's goals.
// Touch: tap a tile or a button. Keys: arrows move the focus, Enter presses, number keys pick, Esc
// goes back. Everything is painted under the Ayvago intro (`prebakeScreens`): opening a screen only
// places images (and a few live numbers as glyphs).
import Phaser from 'phaser';
import {
  t, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, upper, keyHelpShown, type LabelStyle,
} from '@core';
import { LEVELS, DISTRICT_LEVELS } from './levels';
import {
  CARDS, CARD, UPGRADE, UPGRADE_IDS, MAX_RANK, RARITY_COLOR, RARITIES, ABILITY_IDS, MOVES, moveOpen,
  type CardId, type UpgradeId, type Rarity, type AbilityId, type Ranks, type MoveDef,
} from './powers';
import { makeArt, icon } from './art';
import { nextPrice, buy, starCount, totalStars, type Meta } from './meta';
import { INK, MAGENTA, CYAN, YELLOW, LIME, VIOLET, STEEL, hazard } from './palette';
import { TUNING, type Mode } from './defs';

export const OVERLAY_DEPTH = 9700;
const DISTRICT_COL = ['#3ff0ff', '#ff3fa8', '#ffb04a', '#b08bff'];
const DISTRICT_HEX = [CYAN, MAGENTA, 0xffb04a, VIOLET];

// ------------------------------------------------------------------ sizes

const BOARD_W = 1220, BOARD_H = 560;
const NODE_W = 150, NODE_H = 92;
const UP_W = 282, UP_H = 248;
const SHOP_W = 1220, SHOP_H = 600;
export const CARD_W = 262, CARD_H = 350;
const BRIEF_W = 720, BRIEF_H = 480;
const RES_W = 780, RES_H = 600;
const END_W = 700, END_H = 420;
export const PSIDE_W = 300, PSIDE_H = 560;
/** The side cards' height on desktops, where the core's key strip runs along the bottom of the pause. */
export const PSIDE_H_KEYS = 474;
const MOVES_W = 1220, MOVES_H = 660, MROW_W = 584, MROW_H = 80;
const SIDE_X = 190, SIDE_PARA = 300;

export const SCREEN_CARDS = [{ w: BRIEF_W, h: BRIEF_H }, { w: RES_W, h: RES_H }, { w: END_W, h: END_H }, { w: PSIDE_W, h: PSIDE_H }, { w: PSIDE_W, h: PSIDE_H_KEYS }, { w: UP_W, h: UP_H }];

// ------------------------------------------------------------------ styles

export const S_TITLE: LabelStyle = { size: 52, fill: ['#ffffff', '#ffc4ea', '#ff3fa8'], stroke: INK, strokeWidth: 8 };
const S_TITLE_C: LabelStyle = { size: 46, fill: ['#ffffff', '#c4fbff', '#3ff0ff'], stroke: INK, strokeWidth: 8 };
export const S_SUB: LabelStyle = { size: 19, color: '#cfc8ff', stroke: INK, strokeWidth: 3, body: true };
const S_BTN: LabelStyle = { size: 30 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_HEAD: LabelStyle = { size: 28, color: '#3ff0ff', stroke: INK, strokeWidth: 5 };
const S_NAME: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_NODE: LabelStyle = { size: 28, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const S_DESC: LabelStyle = { size: 16, color: '#cfc8ff', stroke: null, shadow: false, body: true };
const S_DESC_L: LabelStyle = { size: 18, color: '#dcd6ff', stroke: null, shadow: false, body: true };
const S_SMALL: LabelStyle = { size: 15, color: '#8f88c4', stroke: null, shadow: false, body: true };
const S_NUM: LabelStyle = { size: 30, color: '#ffe040', stroke: INK, strokeWidth: 5 };
const S_PRICE: LabelStyle = { size: 24, color: '#ffe8a0', stroke: INK, strokeWidth: 4 };
const S_STAT: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_STAT_L: LabelStyle = { size: 20, color: '#cfc8ff', stroke: null, shadow: false, body: true };
const S_SCORE: LabelStyle = { size: 50, fill: ['#ffffff', '#fff1a0', '#ffc23a'], stroke: INK, strokeWidth: 7 };
const S_TOAST: LabelStyle = { size: 24, color: '#ffe040', stroke: INK, strokeWidth: 5 };
const S_KEYS: LabelStyle = { size: 15, color: '#8f88c4', stroke: INK, strokeWidth: 3, body: true };
const S_TAG: LabelStyle = { size: 18, color: '#0a0614', stroke: null, shadow: false };
const S_DISTRICT = (i: number): LabelStyle => ({ size: 26, color: DISTRICT_COL[i], stroke: INK, strokeWidth: 5 });
const S_CARD: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_RAR = (r: Rarity): LabelStyle => ({ size: 16, color: RARITY_COLOR[r].css, stroke: INK, strokeWidth: 3 });
const P_HEAD: LabelStyle = { size: 24, color: '#3ff0ff', stroke: INK, strokeWidth: 4 };
const P_NAME: LabelStyle = { size: 17, color: '#ffffff', stroke: null, shadow: false, body: true };
const M_NAME: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const M_IN: LabelStyle = { size: 18, color: '#5ff4ff', stroke: null, shadow: false, body: true };
const M_DESC: LabelStyle = { size: 16, color: '#cfc8ff', stroke: null, shadow: false, body: true };
const M_LOCK: LabelStyle = { size: 16, color: '#ffb04a', stroke: null, shadow: false, body: true };
const M_OPEN: LabelStyle = { size: 15, color: '#7cff6a', stroke: null, shadow: false, body: true };
const S_LATER: LabelStyle = { size: 22 };
const CARD_KEY = (r: Rarity): string => 'nr-card-' + r;
const CARD_GLOW = 'nr-card-glow';

/** Seconds as m:ss. */
export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const levelName = (i: number): string => upper(t('lv_' + LEVELS[i].id));

// ------------------------------------------------------------------ the prebake

/** Paints, in the current language, everything the inner screens show (Boot, under the intro). */
export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const [w, h] of [[BOARD_W, BOARD_H], [SHOP_W, SHOP_H], [1000, 640], [MOVES_W, MOVES_H]]) skinTexture(scene, 'board', w, h);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['mapTitle', 'shopTitle', 'draftTitle', 'resTitle', 'resBoss', 'districtTitle', 'campaignTitle']) { labelTexture(scene, t(k), S_TITLE); labelTexture(scene, t(k), S_TITLE_C); }
  for (const k of ['mapSub', 'shopSub', 'draftSub', 'bossDraft', 'districtSub', 'campaignSub']) { bakePara(scene, t(k), S_SUB, 620); bakePara(scene, t(k), S_SUB, SIDE_PARA); bakePara(scene, t(k), S_SUB, END_W - 100); }
  // buttons: faces and labels
  for (const [w, h, col, off] of [[260, 72, MAGENTA, true], [250, 64, CYAN, false], [180, 64, CYAN, false], [240, 70, CYAN, true], [230, 64, MAGENTA, false], [150, 52, LIME, true], [200, 64, CYAN, false], [240, 64, MAGENTA, false], [180, 70, STEEL, false], [200, 60, CYAN, false], [260, 54, MAGENTA, false], [240, 52, CYAN, false], [280, 72, MAGENTA, false]] as [number, number, number, boolean][]) bakeButton(scene, 'button', w, h, col, off);
  for (const d of DISTRICT_HEX) { bakeButton(scene, 'plate', NODE_W, NODE_H, d, true, true); bakeButton(scene, 'plate', NODE_W + 20, NODE_H, d, true, true); }
  bakeButton(scene, 'plate', CARD_W, CARD_H, CYAN);
  for (const k of ['play', 'cyberware', 'start', 'map', 'done', 'reroll', 'next', 'retry', 'toMap', 'maxed', 'back', 'moves', 'pickImplant', 'later']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); labelTexture(scene, t(k), S_LATER); }
  for (const k of ['poor', 'bought', 'maxed', 'locked']) labelTexture(scene, t(k), S_TOAST);
  for (const o of [S_NUM, S_PRICE, S_STAT, S_SCORE, S_NODE]) glyphAtlas(scene, o);
  labelTexture(scene, t('draftKeys'), S_KEYS);
  labelTexture(scene, t('mapKeys'), S_KEYS);
  // the map and the brief
  for (let d = 0; d < 4; d++) labelTexture(scene, t('d' + d), S_DISTRICT(d));
  for (let i = 0; i < LEVELS.length; i++) {
    labelTexture(scene, LEVELS[i].id, S_NODE);
    labelTexture(scene, levelName(i), S_TITLE_C);
    labelTexture(scene, levelName(i), P_HEAD);
  }
  bakeFmt(scene, 'levelN', ['n'], S_SUB);
  for (const k of ['goalFinish', 'goalChips', 'goalNoHit', 'noBest', 'bossLevel']) labelTexture(scene, t(k), S_NAME);
  bakeFmt(scene, 'goalTime', ['t'], S_NAME);
  bakeFmt(scene, 'bestTime', ['t'], S_STAT_L);
  labelTexture(scene, t('bossLevel'), S_TAG);
  // the ripperdoc
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_NAME);
    for (let r = 1; r <= MAX_RANK; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, UP_W - 36);
  }
  bakeFmt(scene, 'rankN', ['n'], S_SMALL);
  // the draft and the card faces
  prebakeCards(scene);
  // the results
  for (const k of ['resTime', 'resKills', 'resGears', 'resChips', 'resCombo', 'resScore', 'resBonus']) labelTexture(scene, t(k), S_STAT_L);
  labelTexture(scene, t('newRecord'), S_TAG);
  labelTexture(scene, t('newAbility'), P_HEAD);
  for (const a of ABILITY_IDS) { labelTexture(scene, t('ab_' + a), S_NAME); bakePara(scene, t('abd_' + a), S_DESC, 250); }
  // the implant on the results card
  labelTexture(scene, t('implantNote'), S_NAME);
  labelTexture(scene, t('implantNote'), P_NAME);
  // the Moves screen
  labelTexture(scene, t('moves'), S_TITLE);
  bakePara(scene, t('movesSub'), S_SUB, 900);
  labelTexture(scene, t('movesKeys'), S_KEYS);
  labelTexture(scene, t('mvOpen'), M_OPEN);
  for (const m of MOVES) {
    labelTexture(scene, t(m.name), M_NAME);
    labelTexture(scene, t(m.name), P_NAME);
    labelTexture(scene, t(`mv_${m.id}_k`), M_IN);
    labelTexture(scene, t(`mv_${m.id}_t`), M_IN);
    labelTexture(scene, t('md_' + m.id), M_DESC);
    if (m.unlock.kind !== 'start') labelTexture(scene, t('lock_' + m.id), M_LOCK);
  }
  // beside the pause
  for (const k of ['yourChips', 'combos', 'moves']) labelTexture(scene, t(k), P_HEAD);
  bakePara(scene, t('noChips'), P_NAME, PSIDE_W - 50);
  for (const k of ['comboA', 'comboB', 'comboC', 'comboD']) bakePara(scene, t(k), P_NAME, PSIDE_W - 90);
  bakePara(scene, t('comboNote'), S_SMALL, PSIDE_W - 50);
  labelTexture(scene, t('lockedAbility'), S_SMALL);
  bakeFmt(scene, 'objChips', ['n'], P_NAME);
  bakeFmt(scene, 'objTime', ['t'], P_NAME);
  bake(scene, 'nr-scan', 4, 4, (c) => { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, 1, 4, 1); });
}


/** A card face: black glass, a neon frame in the rarity's colour, a glowing hexagon for the icon. */
function paintCard(c: CanvasRenderingContext2D, w: number, h: number, r: Rarity): void {
  const col = RARITY_COLOR[r];
  const hex = (v: number, a = 1) => `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  c.save();
  c.translate(14, 14);
  const k = 22;
  const shape = () => { c.beginPath(); c.moveTo(k, 0); c.lineTo(w, 0); c.lineTo(w, h - k); c.lineTo(w - k, h); c.lineTo(0, h); c.lineTo(0, k); c.closePath(); };
  c.shadowColor = hex(col.frame, r === 'legendary' ? 1 : 0.8); c.shadowBlur = r === 'common' ? 8 : r === 'legendary' ? 22 : 14;
  shape(); c.fillStyle = '#0b0818'; c.fill();
  c.shadowBlur = 0;
  c.save(); shape(); c.clip();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hex(col.glow, 0.35)); g.addColorStop(0.45, 'rgba(12,8,26,0.9)'); g.addColorStop(1, hex(col.glow, 0.25));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 1; y < h; y += 3) c.fillRect(0, y, w, 1);
  c.restore();
  c.lineWidth = 4; c.strokeStyle = hex(col.frame); shape(); c.stroke();
  c.lineWidth = 1.2; c.strokeStyle = hex(col.frame, 0.5);
  c.beginPath(); c.moveTo(k + 8, 10); c.lineTo(w - 10, 10); c.lineTo(w - 10, h - k - 8); c.stroke();
  // the hexagon
  const cx = w / 2, cy = 116, R = 56;
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } c.closePath();
  const d = c.createRadialGradient(cx, cy, 6, cx, cy, R);
  d.addColorStop(0, hex(col.glow, 0.8)); d.addColorStop(1, hex(col.glow, 0.1));
  c.fillStyle = d; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = hex(col.frame); c.stroke();
  if (r === 'legendary' || r === 'epic') hazard(c, w - 90, h - 8, 70, 8, 7);
  c.restore();
}

function prebakeCards(scene: Phaser.Scene): void {
  for (const r of RARITIES) bake(scene, CARD_KEY(r), CARD_W + 28, CARD_H + 28, (c) => paintCard(c, CARD_W, CARD_H, r));
  bake(scene, CARD_GLOW, CARD_W + 48, CARD_H + 48, (c) => { c.shadowColor = 'rgba(63,240,255,1)'; c.shadowBlur = 18; c.strokeStyle = 'rgba(160,250,255,1)'; c.lineWidth = 5; c.strokeRect(24, 24, CARD_W, CARD_H); });
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), S_RAR(r));
  for (const card of CARDS) {
    labelTexture(scene, t('k_' + card.id), S_CARD);
    labelTexture(scene, t('k_' + card.id), P_NAME);
    bakePara(scene, t('kd_' + card.id), S_DESC_L, CARD_W - 44);
  }
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

interface Focusable { btn: KitButton; x: number; y: number }

/** An overlay screen: a dim layer, an optional board with a title, keyboard focus, painted toasts. */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  private toastImg: Phaser.GameObjects.Image | null = null;
  closed = false;
  private release: () => void;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number?, number?]; title?: string; titleStyle?: LabelStyle; titleX?: number; titleY?: number; titleW?: number; sub?: string; subW?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x05030f, o.dim ?? 0.66).setOrigin(0).setInteractive();
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2] ?? width / 2, (o.board[3] ?? height / 2) + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    const tx = o.titleX ?? width / 2, ty = o.titleY ?? 64;
    if (o.title) this.root.add(fitWidth(labelAt(scene, tx, ty, o.title, o.titleStyle ?? S_TITLE), o.titleW ?? 560));
    if (o.sub) this.root.add(new Para(scene, tx, ty + 32, o.sub, S_SUB, o.subW ?? 620, 0.5, 23));
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 140 });
    this.release = pushModal(scene);
  }

  protected addFocus(btn: KitButton, x: number, y: number): KitButton {
    this.focus.push({ btn, x, y });
    return btn;
  }

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
      case 'Enter': case 'Space': case 'NumpadEnter': case 'KeyJ': {
        const f = this.focus[this.fi];
        if (f) f.btn.emit('pointerup', { wasTouch: false });
        return true;
      }
      case 'Escape': this.escape(); return true;
    }
    return false;
  }

  protected escape(): void { this.close(); }

  toast(key: string, y = this.scene.scale.height - 40, x = this.scene.scale.width / 2): void {
    this.toastImg?.destroy();
    const img = labelAt(this.scene, x, y, t(key), S_TOAST);
    this.toastImg = img;
    this.root.add(img);
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1200, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  protected deny(b: Phaser.GameObjects.Container, why: string): void {
    const x0 = b.x;
    this.scene.tweens.add({ targets: b, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => b.setX(x0) });
    this.host.sfx('deny', 0.4);
    this.toast(why);
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

  /** A burst of sparks at (x, y). */
  protected sparkle(x: number, y: number, tint: number[], n = 30): void {
    const em = this.scene.add.particles(x, y, 'nr-spark', {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }
}

const iconImg = (s: Phaser.Scene, x: number, y: number, id: string, size: number): Phaser.GameObjects.Image => {
  const img = s.add.image(x, y, icon(id));
  img.setScale(size / img.height);
  return img;
};

/** Three small stars in a row (lit by bits). */
function starRow(s: Phaser.Scene, x: number, y: number, bits: number, size: number, gap: number): Phaser.GameObjects.Image[] {
  return [0, 1, 2].map((i) => iconImg(s, x + (i - 1) * gap, y, bits & (1 << i) ? 'star' : 'starOff', size));
}

// ------------------------------------------------------------------ the district map

/** Four districts, four nodes each; a tap opens that level's brief. */
export class MapScreen extends Panel {
  private sel = 0;
  private nodes: KitButton[] = [];

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onLevel: (i: number) => void, private onShop: () => void) {
    super(scene, host, { board: [BOARD_W, BOARD_H, 640, 372], title: t('mapTitle'), titleY: 46, sub: t('mapSub'), dim: 0.5 });
    const s = scene, m = meta;
    // the purse and the stars, top-left
    this.root.add(iconImg(s, 46, 48, 'gear', 40));
    this.root.add(new GlyphText(s, 72, 50, String(m.gears), S_NUM, 0));
    this.root.add(iconImg(s, 46, 92, 'star', 36));
    this.root.add(new GlyphText(s, 72, 94, t('starsN', { n: totalStars(m) }), S_NUM, 0));
    const g = s.add.graphics();
    this.root.add(g);
    for (let d = 0; d < 4; d++) {
      const y = 158 + d * 122;
      const col = DISTRICT_HEX[d];
      this.root.add(fitWidth(labelAt(s, 70, y - 14, t('d' + d), S_DISTRICT(d), 0), 290));
      let got = 0;
      for (let k = 0; k < DISTRICT_LEVELS; k++) got += starCount(m.stars[d * 4 + k]);
      const sr = iconImg(s, 82, y + 22, 'star', 24);
      this.root.add(sr);
      this.root.add(new GlyphText(s, 98, y + 23, `${got}/12`, S_PRICE, 0).setScale(0.8));
      hazardLine(g, 70, y + 44, 260, col);
      for (let k = 0; k < DISTRICT_LEVELS; k++) {
        const i = d * 4 + k;
        const L = LEVELS[i];
        const x = 470 + k * 190 + (L.boss ? 10 : 0);
        const locked = i > m.unlocked;
        if (k > 0) {
          g.lineStyle(3, col, locked ? 0.25 : 0.8).lineBetween(x - 190 + NODE_W / 2 + 4, y, x - NODE_W / 2 - (L.boss ? 14 : 4), y);
        }
        const w = L.boss ? NODE_W + 20 : NODE_W;
        const b = new KitButton(s, x, y, { w, h: NODE_H, kind: 'plate', color: col, tapWhenOff: true, sfx: null }, () => {
          if (i > this.meta.unlocked) { this.deny(b, 'locked'); return; }
          this.host.sfx('pick', 0.5);
          this.onLevel(i);
        });
        b.setEnabled(!locked);
        b.addContent(labelAt(s, 0, -14, L.id, S_NODE));
        if (locked) b.addContent(iconImg(s, w / 2 - 22, -NODE_H / 2 + 20, 'lock', 26));
        else b.addContent(...starRow(s, 0, 24, m.stars[i], 22, 26));
        if (L.boss) b.addContent(iconImg(s, -w / 2 + 22, -NODE_H / 2 + 20, 'boss', 28));
        this.root.add(b);
        this.nodes.push(b);
        this.addFocus(b, x, y);
      }
    }
    const shop = new KitButton(s, 470, 676, { w: 250, h: 64, color: CYAN, label: t('cyberware'), style: S_BTN_S, sfx: null }, () => { this.host.sfx('pick', 0.5); this.onShop(); });
    this.root.add(shop);
    this.addFocus(shop, 470, 676);
    const go = new KitButton(s, 810, 676, { w: 260, h: 72, color: MAGENTA, label: t('play'), style: S_BTN, sfx: null }, () => { this.host.sfx('pick', 0.5); this.onLevel(Math.min(this.meta.unlocked, this.sel)); });
    this.root.add(go);
    this.addFocus(go, 810, 676);
    if (!host.touch) this.root.add(fitWidth(labelAt(s, 1236, 630, t('mapKeys'), S_KEYS, 1), 520));
    // focus the newest level
    this.sel = Math.min(m.unlocked, LEVELS.length - 1);
    this.fi = host.touch ? -1 : this.sel;
    this.showFocus();
  }

  key(code: string): boolean {
    if (code === 'KeyC') { this.onShop(); return true; }
    if (code === 'Escape') return true;
    const r = super.key(code);
    if (this.fi >= 0 && this.fi < this.nodes.length) this.sel = this.fi;
    return r;
  }
}

function hazardLine(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, col: number): void {
  g.lineStyle(2, col, 0.6).lineBetween(x, y, x + w, y);
  g.fillStyle(0xffd23a, 0.9);
  for (let i = 0; i < 6; i++) g.fillRect(x + w - 60 + i * 10, y - 3, 5, 6);
}

// ------------------------------------------------------------------ the level brief

export class BriefScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, meta: Meta, i: number, mode: Mode, private go: () => void, private shop: () => void, private map: () => void) {
    super(scene, host, { dim: 0.5 });
    const s = scene, cx = 640, cy = 380, top = cy - BRIEF_H / 2;
    const L = LEVELS[i];
    const card = themeCard(s, cx, cy, BRIEF_W, BRIEF_H);
    this.root.add(card);
    this.root.add(fitWidth(labelAt(s, cx, top + 42, t('d' + L.district), S_DISTRICT(L.district)), BRIEF_W - 80));
    this.root.add(fitWidth(labelAt(s, cx, top + 92, levelName(i), S_TITLE_C), BRIEF_W - 80));
    this.root.add(new FmtLine(s, cx, top + 136, S_SUB, 0.5).set('levelN', { n: L.id }));
    if (L.boss) this.root.add(labelAt(s, cx, top + 166, t('bossLevel'), S_TAG).setTint(0xff4a5a));
    const bits = meta.stars[i];
    const par = L.par + TUNING[mode].parBonus;
    const goals: Array<[string | FmtLine, number]> = [
      [t('goalFinish'), 1],
      [t(L.boss ? 'goalNoHit' : 'goalChips'), 2],
      [new FmtLine(s, 0, 0, S_NAME, 0).set('goalTime', { t: clock(par) }), 4],
    ];
    goals.forEach(([g, bit], k) => {
      const y = top + 206 + k * 52;
      const x0 = cx - 230;
      this.root.add(iconImg(s, x0, y, bits & bit ? 'star' : 'starOff', 40));
      if (typeof g === 'string') this.root.add(fitWidth(labelAt(s, x0 + 36, y, g, S_NAME, 0), 420));
      else { g.setPosition(x0 + 36, y); this.root.add(g); }
    });
    if (meta.times[i] > 0) this.root.add(new FmtLine(s, cx, top + 370, S_STAT_L, 0.5).set('bestTime', { t: clock(meta.times[i]) }));
    else this.root.add(labelAt(s, cx, top + 370, t('noBest'), S_NAME).setScale(0.8).setAlpha(0.7));
    const by = top + BRIEF_H - 56;
    const mapB = new KitButton(s, cx - 245, by, { w: 180, h: 64, color: CYAN, label: t('map'), style: S_BTN_S, sfx: null }, () => { this.host.sfx('pick', 0.4); this.close(); this.map(); });
    const shopB = new KitButton(s, cx - 25, by, { w: 240, h: 64, color: CYAN, label: t('cyberware'), style: S_BTN_S, sfx: null }, () => { this.host.sfx('pick', 0.4); this.shop(); });
    const goB = new KitButton(s, cx + 225, by, { w: 240, h: 70, color: MAGENTA, label: t('start'), style: S_BTN, sfx: null }, () => this.start());
    this.root.add([mapB, shopB, goB]);
    this.addFocus(mapB, cx - 245, by);
    this.addFocus(shopB, cx - 25, by);
    this.addFocus(goB, cx + 225, by);
    this.fi = 2;
    this.showFocus();
    card.setScale(0.92);
    s.tweens.add({ targets: card, scale: 1, duration: 240, ease: 'Back.easeOut' });
  }

  key(code: string): boolean {
    if (code === 'KeyC') { this.shop(); return true; }
    return super.key(code);
  }
  protected escape(): void { this.close(); this.map(); }
  private start(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.go();
  }
}

// ------------------------------------------------------------------ the ripperdoc

/** Six cyberware tiles (3 × 2) right of a column with the title, the purse and DONE. */
export class ShopScreen extends Panel {
  private purse!: GlyphText;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onBuy: (u: UpgradeId) => void, private onDone: () => void) {
    super(scene, host, { board: [SHOP_W, SHOP_H, 640, 400], title: t('shopTitle'), titleX: SIDE_X, titleY: 160, titleW: 320, sub: t('shopSub'), subW: SIDE_PARA, dim: 0.6 });
    const s = scene;
    this.root.add(iconImg(s, SIDE_X - 70, 182 + 140, 'ripper', 86).setAlpha(0.9));
    this.root.add(iconImg(s, SIDE_X - 40, 440, 'gear', 52));
    this.purse = new GlyphText(s, SIDE_X - 8, 442, String(meta.gears), S_NUM, 0);
    this.root.add(this.purse);
    this.build();
    const go = new KitButton(s, SIDE_X, 630, { w: 260, h: 72, color: MAGENTA, label: t('done'), style: S_BTN, sfx: null }, () => this.finish());
    this.root.add(go);
    this.addFocus(go, SIDE_X, 630);
    this.fi = this.host.touch ? -1 : this.focus.length - 1;
    this.showFocus();
  }

  private build(): void {
    const s = this.scene, m = this.meta;
    const keepFi = this.fi;
    const go = this.focus.find((f) => f.btn.o.label === t('done'));
    this.content.removeAll(true);
    this.focus = [];
    UPGRADE_IDS.forEach((u, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 520 + col * (UP_W + 10), y = 252 + row * (UP_H + 12);
      const c = s.add.container(x, y);
      c.add(themeCard(s, 0, 0, UP_W, UP_H));
      const L = -UP_W / 2 + 22, T = -UP_H / 2;
      c.add(iconImg(s, L + 30, T + 44, UPGRADE[u].icon, 60));
      c.add(fitWidth(labelAt(s, L + 70, T + 32, t('u_' + u), S_NAME, 0), UP_W - 104));
      const r = m.ranks[u];
      const g = s.add.graphics();
      for (let k = 0; k < MAX_RANK; k++) {
        const px = L + 80 + k * 26, py = T + 62;
        g.fillStyle(k < r ? UPGRADE[u].color : 0x1a1530, 1).fillRect(px - 9, py - 5, 18, 10).lineStyle(1.5, UPGRADE[u].color, 0.9).strokeRect(px - 9, py - 5, 18, 10);
      }
      c.add(g);
      const price = nextPrice(m, u);
      if (price === null) {
        c.add(new Para(s, L - 4, T + 92, t(`u_${u}_${MAX_RANK}`), S_DESC, UP_W - 36, 0, 19));
        c.add(labelAt(s, 0, UP_H / 2 - 36, t('maxed'), S_TOAST));
      } else {
        c.add(new FmtLine(s, L - 4, T + 92, S_SMALL, 0).set('rankN', { n: r + 1 }));
        c.add(new Para(s, L - 4, T + 104, t(`u_${u}_${r + 1}`), S_DESC, UP_W - 36, 0, 19));
        const afford = price <= m.gears;
        const b = new KitButton(s, 0, UP_H / 2 - 38, { w: 150, h: 52, color: LIME, tapWhenOff: true, sfx: null }, () => {
          if (!b.enabled) { this.deny(b, 'poor'); return; }
          if (buy(m, u)) {
            this.host.sfx('buy', 0.6);
            this.onBuy(u);
            this.sparkle(x, y, [UPGRADE[u].color, 0xffffff, 0xffe040], 34);
            this.toast('bought', 700, 830);
            this.purse.setText(String(m.gears));
            this.fi = this.focus.findIndex((f) => f.btn === b);
            this.build();
          }
        });
        const gi = iconImg(s, -44, 0, 'gear', 30), num = new GlyphText(s, -24, 1, String(price), S_PRICE, 0);
        b.addContent(gi, num);
        b.setEnabled(afford);
        if (!afford) { gi.setAlpha(0.5); num.setAlpha(0.5); }
        c.add(b);
        this.addFocus(b, x, y + UP_H / 2 - 38);
      }
      this.content.add(c);
    });
    if (go) this.focus.push(go);
    this.fi = keepFi;
    this.showFocus();
  }

  protected escape(): void { this.finish(); }
  private finish(): void {
    if (this.closed) return;
    this.host.sfx('pick', 0.5);
    this.close();
    this.onDone();
  }
}

// ------------------------------------------------------------------ implant cards

export function cardFace(s: Phaser.Scene, x: number, y: number, id: CardId): Phaser.GameObjects.Container {
  const def = CARD[id];
  const c = s.add.container(x, y);
  c.add(s.add.image(0, 0, CARD_KEY(def.rarity)));
  c.add(labelAt(s, 0, -CARD_H / 2 + 30, t('r_' + def.rarity), S_RAR(def.rarity)));
  c.add(iconImg(s, 0, -CARD_H / 2 + 116, def.icon, 76));
  c.add(fitWidth(labelAt(s, 0, 30, t('k_' + id), S_CARD), CARD_W - 40));
  c.add(new Para(s, 0, 56, t('kd_' + id), S_DESC_L, CARD_W - 44, 0.5, 22));
  return c;
}

/**
 * Three cards side by side, one reroll; a tap (Enter on the focused card, or 1–3) takes one. With
 * `onLater` the pick may wait (LATER, Esc): it stays banked for the pause or the next results.
 */
export class DraftScreen extends Panel {
  private faces: { c: Phaser.GameObjects.Container; id: CardId; hit: KitButton }[] = [];
  private glow: Phaser.GameObjects.Image;
  private rerolled = false;
  private picked = false;
  private reroll!: KitButton;
  private y = 372;

  private laterBtn: KitButton | null = null;

  constructor(scene: Phaser.Scene, host: ScreenHost, private offer: CardId[], private dealAgain: () => CardId[], private onPick: (id: CardId) => void, boss = false, private onLater?: () => void) {
    super(scene, host, { board: [1000, 640, 640, 372], title: t('draftTitle'), titleY: 92, sub: t(boss ? 'bossDraft' : 'draftSub'), dim: 0.55 });
    this.glow = scene.add.image(0, 0, CARD_GLOW).setVisible(false);
    this.root.add(this.glow);
    this.deal(false);
  }

  private deal(again: boolean): void {
    const s = this.scene, x0 = 640, y = this.y + 20;
    for (const f of this.faces) f.c.destroy();
    this.faces = [];
    this.focus = [];
    this.offer.forEach((id, i) => {
      const x = x0 + (i - (this.offer.length - 1) / 2) * (CARD_W + 30);
      const c = cardFace(s, x, y, id);
      const hit = new KitButton(s, 0, 0, { w: CARD_W, h: CARD_H, kind: 'plate', color: CYAN, sfx: null }, () => this.take(i));
      hit.face.setAlpha(0.001);
      hit.on('pointerover', () => { this.fi = i; this.showGlow(); });
      c.add(hit);
      this.root.add(c);
      this.faces.push({ c, id, hit });
      this.addFocus(hit, x, y);
      c.setScale(0.2, 1).setAlpha(0);
      s.tweens.add({ targets: c, scaleX: 1, alpha: 1, duration: 220, delay: 60 + i * 100, ease: 'Back.easeOut' });
      if (CARD[id].rarity === 'legendary') s.time.delayedCall(260 + i * 100, () => { if (!this.closed) this.host.sfx('fanfare', 0.35); });
    });
    const rx = this.onLater ? x0 - 130 : x0;
    if (!this.reroll) {
      this.reroll = new KitButton(s, rx, y + CARD_H / 2 + 44, { w: 240, h: 70, color: CYAN, label: t('reroll'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (this.rerolled || this.picked) { this.deny(this.reroll, 'maxed'); return; }
        this.rerolled = true;
        this.offer = this.dealAgain();
        this.host.sfx('card', 0.5);
        this.reroll.setEnabled(false);
        this.deal(true);
      });
      this.root.add(this.reroll);
      if (this.onLater) {
        this.laterBtn = new KitButton(s, x0 + 110, y + CARD_H / 2 + 44, { w: 180, h: 70, color: STEEL, label: t('later'), style: S_LATER, sfx: null }, () => this.later());
        this.root.add(this.laterBtn);
      }
      if (!this.host.touch) this.root.add(fitWidth(labelAt(s, x0 + 400, y + CARD_H / 2 + 44, t('draftKeys'), S_KEYS), 200));
    }
    this.addFocus(this.reroll, rx, y + CARD_H / 2 + 44);
    if (this.laterBtn) this.addFocus(this.laterBtn, x0 + 110, y + CARD_H / 2 + 44);
    this.fi = this.host.touch ? -1 : 1;
    this.showGlow();
    this.host.sfx(again ? 'card' : 'deal', 0.45);
  }

  private showGlow(): void {
    const f = this.faces[this.fi];
    if (!f || this.host.touch) { this.glow.setVisible(false); return; }
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    this.root.bringToTop(this.glow);
    this.root.bringToTop(f.c);
  }

  protected showFocus(): void { super.showFocus(); this.showGlow(); }
  /** Esc: later, when the pick may wait. */
  protected escape(): void { this.later(); }

  private later(): void {
    if (!this.onLater || this.picked || this.closed) return;
    this.picked = true;
    this.host.sfx('pick', 0.4);
    this.close();
    this.onLater();
  }

  key(code: string): boolean {
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.take(Number(code.slice(5)) - 1); return true; }
    if (code === 'KeyR') { this.reroll.emit('pointerup', { wasTouch: false }); return true; }
    return super.key(code);
  }

  take(i: number): void {
    const f = this.faces[i];
    if (!f || this.picked) return;
    this.picked = true;
    const rar = CARD[f.id].rarity;
    this.host.sfx(rar === 'legendary' || rar === 'epic' ? 'fanfare' : 'power', 0.5);
    const s = this.scene;
    this.faces.forEach((o, k) => { if (k !== i) s.tweens.add({ targets: o.c, y: o.c.y + 60, alpha: 0, duration: 240 }); });
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    s.tweens.add({ targets: [f.c, this.glow], x: 640, y: this.y + 20, scale: 1.1, duration: 300, ease: 'Back.easeOut' });
    s.time.delayedCall(310, () => { if (!this.closed) this.sparkle(640, this.y, [RARITY_COLOR[rar].frame, 0xffffff, 0xff3fa8], 44); });
    s.time.delayedCall(820, () => { this.close(); this.onPick(f.id); });
  }
}

// ------------------------------------------------------------------ the level results

export interface LevelResult {
  level: number; time: number; par: number; kills: number; gears: number; chips: number; combo: number;
  score: number; stars: [boolean, boolean, boolean]; newStars: number; record: boolean; ability: AbilityId | null; boss: boolean; last: boolean;
  /** Implant picks banked (earned at the first checkpoint, or waiting from earlier). */
  picks: number;
}

export class ResultScreen extends Panel {
  private pickBtn: KitButton | null = null;
  private pickSpot = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, host: ScreenHost, r: LevelResult, private onNext: () => void, private onRetry: () => void, private onMap: () => void, private onPick?: () => void) {
    super(scene, host, { dim: 0.45 });
    const s = scene, cx = 640, cy = 384, top = cy - RES_H / 2;
    const card = themeCard(s, cx, cy, RES_W, RES_H);
    this.root.add(card);
    this.root.add(fitWidth(labelAt(s, cx, top + 50, t(r.boss ? 'resBoss' : 'resTitle'), S_TITLE_C), RES_W - 80));
    this.root.add(fitWidth(labelAt(s, cx, top + 96, levelName(r.level), P_HEAD), RES_W - 120));
    // the stars stamp in one by one
    r.stars.forEach((on, i) => {
      const st = iconImg(s, cx + (i - 1) * 104, top + 156, on ? 'star' : 'starOff', 84);
      this.root.add(st);
      if (on) {
        const sc = st.scale;
        st.setScale(sc * 2.6).setAlpha(0);
        s.tweens.add({ targets: st, scale: sc, alpha: 1, delay: 300 + i * 260, duration: 260, ease: 'Back.easeOut', onStart: () => this.host.sfx('star', 0.5), onComplete: () => this.sparkle(st.x, st.y, [0xffe040, 0xffffff], 18) });
      }
    });
    // the numbers
    const rows: Array<[string, string]> = [
      ['resTime', `${clock(r.time)} / ${clock(r.par)}`],
      ['resKills', String(r.kills)],
      ['resGears', '+' + r.gears],
      [r.boss ? 'resCombo' : 'resChips', r.boss ? '×' + r.combo : `${r.chips}/3`],
    ];
    if (!r.boss) rows.push(['resCombo', '×' + r.combo]);
    const two = !!r.ability || r.picks > 0;
    const left = two ? cx - 330 : cx - 220, right = two ? cx + 20 : cx + 220;
    rows.forEach(([k, v], i) => {
      const y = top + 228 + i * 40;
      this.root.add(labelAt(s, left, y, t(k), S_STAT_L, 0));
      this.root.add(new GlyphText(s, right, y + 1, v, S_STAT, 1));
    });
    // the score counts up
    const sy = top + 450;
    this.root.add(labelAt(s, left, sy, t('resScore'), S_STAT_L, 0));
    const score = new GlyphText(s, right, sy, '0', S_SCORE, 1);
    this.root.add(score);
    const n = { v: 0 };
    s.tweens.add({ targets: n, v: r.score, duration: 900, delay: 400, ease: 'Cubic.easeOut', onUpdate: () => score.setText(String(Math.round(n.v))), onComplete: () => { score.setText(String(r.score)); if (r.record) { const tag = this.tag(left + 130, sy, 'newRecord', 0xffe040); this.root.add(tag); } } });
    // a new ability
    const ax = cx + 205;
    if (r.ability) {
      const ay = top + (r.picks > 0 ? 284 : 300);
      const g = s.add.graphics();
      g.fillStyle(0x1a0a30, 0.9).fillRoundedRect(ax - 140, ay - 104, 280, 228, 10).lineStyle(2, MAGENTA, 1).strokeRoundedRect(ax - 140, ay - 104, 280, 228, 10);
      this.root.add(g);
      this.root.add(labelAt(s, ax, ay - 80, t('newAbility'), P_HEAD));
      const ic = iconImg(s, ax, ay - 26, r.ability, 64);
      this.root.add(ic);
      s.tweens.add({ targets: ic, scale: ic.scale * 1.15, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.root.add(fitWidth(labelAt(s, ax, ay + 24, t('ab_' + r.ability), S_NAME), 250));
      this.root.add(new Para(s, ax, ay + 44, t('abd_' + r.ability), S_DESC, 250, 0.5, 19));
    }
    // the implant earned in the level: picked here, never mid-level
    if (r.picks > 0 && this.onPick) {
      let by0 = top + 470;
      if (!r.ability) {
        const g = s.add.graphics();
        g.fillStyle(0x1a0a30, 0.9).fillRoundedRect(ax - 140, top + 196, 280, 228, 10).lineStyle(2, VIOLET, 1).strokeRoundedRect(ax - 140, top + 196, 280, 228, 10);
        this.root.add(g);
        const ic = iconImg(s, ax, top + 280, 'chip', 84);
        this.root.add(ic);
        s.tweens.add({ targets: ic, scale: ic.scale * 1.12, duration: 560, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.root.add(fitWidth(labelAt(s, ax, top + 222, t('implantNote'), S_NAME), 250));
        by0 = top + 378;
      } else this.root.add(fitWidth(labelAt(s, ax, top + 428, t('implantNote'), P_NAME), 250));
      this.pickSpot = { x: ax, y: by0 };
      const pick = new KitButton(s, ax, by0, { w: 260, h: 54, color: MAGENTA, label: t('pickImplant'), style: S_LATER, sfx: null }, () => { if (this.closed || !this.pickBtn) return; this.host.sfx('pick', 0.4); this.onPick?.(); });
      this.pickBtn = pick;
      this.root.add(pick);
      this.addFocus(pick, ax, by0);
      s.tweens.add({ targets: pick, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const by = top + RES_H - 52;
    const retry = new KitButton(s, cx - 260, by, { w: 200, h: 64, color: CYAN, label: t('retry'), style: S_BTN_S, sfx: null }, () => { this.host.sfx('pick', 0.4); this.close(); this.onRetry(); });
    const map = new KitButton(s, cx - 40, by, { w: 200, h: 64, color: CYAN, label: t('toMap'), style: S_BTN_S, sfx: null }, () => { this.host.sfx('pick', 0.4); this.close(); this.onMap(); });
    const next = new KitButton(s, cx + 220, by, { w: 260, h: 72, color: MAGENTA, label: t('next'), style: S_BTN, sfx: null }, () => { this.host.sfx('start', 0.5); this.close(); this.onNext(); });
    this.root.add([retry, map, next]);
    this.addFocus(retry, cx - 260, by);
    this.addFocus(map, cx - 40, by);
    this.addFocus(next, cx + 220, by);
    this.fi = this.focus.findIndex((f) => f.btn === next);
    this.showFocus();
    card.setScale(0.9);
    s.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  /** The implant was picked (or the offer emptied): the button gives way to the card's name. */
  picked(id: CardId | null, left: number): void {
    const b = this.pickBtn;
    if (!b) return;
    if (left > 0) return;
    this.pickBtn = null;
    this.focus = this.focus.filter((f) => f.btn !== b);
    this.fi = this.focus.length - 1;
    b.destroy();
    if (!id) return;
    const s = this.scene, { x, y } = this.pickSpot, def = CARD[id];
    const c = s.add.container(x, y);
    const g = s.add.graphics();
    g.fillStyle(RARITY_COLOR[def.rarity].glow, 0.5).fillCircle(-104, 0, 20).lineStyle(2, RARITY_COLOR[def.rarity].frame, 1).strokeCircle(-104, 0, 20);
    c.add([g, iconImg(s, -104, 0, def.icon, 30), fitWidth(labelAt(s, -76, 0, t('k_' + id), S_CARD, 0), 200)]);
    this.root.add(c);
    c.setScale(0.4);
    s.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.sparkle(x, y, [RARITY_COLOR[def.rarity].frame, 0xffffff], 26);
    this.showFocus();
  }

  key(code: string): boolean {
    if (code === 'KeyI' && this.pickBtn) { this.pickBtn.emit('pointerup', { wasTouch: false }); return true; }
    return super.key(code);
  }

  private tag(x: number, y: number, key: string, color: number): Phaser.GameObjects.Container {
    const s = this.scene;
    const c = s.add.container(x, y);
    const lbl = labelAt(s, 0, 0, t(key), S_TAG);
    const w = lbl.width + 24;
    const g = s.add.graphics();
    g.fillStyle(color, 1).fillRect(-w / 2, -14, w, 28);
    c.add([g, lbl]);
    c.setScale(0.3).setAngle(-6);
    s.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.sparkle(x, y, [color, 0xffffff], 24);
    this.host.sfx('fanfare', 0.4);
    return c;
  }

  protected escape(): void { this.close(); this.onMap(); }
}

// ------------------------------------------------------------------ district and campaign cards

export class EndCard extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, campaign: boolean, score: number, private onGo: () => void) {
    super(scene, host, { dim: 0.45 });
    const s = scene, cx = 640, cy = 360, top = cy - END_H / 2;
    const card = themeCard(s, cx, cy, END_W, END_H);
    this.root.add(card);
    this.root.add(iconImg(s, cx, top + 70, campaign ? 'star' : 'boss', 80));
    this.root.add(fitWidth(labelAt(s, cx, top + 140, t(campaign ? 'campaignTitle' : 'districtTitle'), S_TITLE), END_W - 60));
    this.root.add(new Para(s, cx, top + 180, t(campaign ? 'campaignSub' : 'districtSub'), S_SUB, END_W - 100, 0.5, 24));
    const sc = new GlyphText(s, cx, top + 280, String(score), S_SCORE, 0.5);
    this.root.add(sc);
    const go = new KitButton(s, cx, top + END_H - 56, { w: 260, h: 72, color: MAGENTA, label: t('next'), style: S_BTN, sfx: null }, () => { if (this.closed) return; this.host.sfx('start', 0.5); this.close(); this.onGo(); });
    this.root.add(go);
    this.addFocus(go, cx, top + END_H - 56);
    this.fi = 0;
    this.showFocus();
    this.sparkle(cx, top + 70, [0xffe040, 0xff3fa8, 0x3ff0ff], 50);
  }
  protected escape(): void { if (this.closed) return; this.close(); this.onGo(); }
}

// ------------------------------------------------------------------ the moves

/**
 * Every blade move in two columns: its icon, name, input (the keys, or the touch buttons on a touch
 * screen), what it does and, while locked, how it opens. Painted ahead: opening it only places images.
 */
export class MovesScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, abilities: AbilityId[], ranks: Ranks, private onDone: () => void) {
    super(scene, host, { board: [MOVES_W, MOVES_H, 640, 366], title: t('moves'), titleY: 64, titleW: 520, dim: 0.72 });
    const s = scene;
    const sub = new Para(s, 640, 98, t('movesSub'), S_SUB, 900, 0.5, 23);
    this.root.add(sub);
    const g = s.add.graphics();
    this.root.add(g);
    const per = Math.ceil(MOVES.length / 2);
    MOVES.forEach((m, i) => {
      const col = i < per ? 0 : 1, row = col ? i - per : i;
      const x = 340 + col * 600, y = 172 + row * (MROW_H + 8);
      this.row(g, m, x, y, moveOpen(m.id, abilities, ranks));
    });
    const back = new KitButton(s, 1110, 64, { w: 200, h: 60, color: CYAN, label: t('back'), style: S_BTN_S, sfx: null }, () => this.done());
    this.root.add(back);
    this.addFocus(back, 1110, 64);
    this.fi = host.touch ? -1 : 0;
    this.showFocus();
    if (!host.touch) this.root.add(labelAt(s, 1222, 666, t('movesKeys'), S_KEYS, 1));
  }

  private row(g: Phaser.GameObjects.Graphics, m: MoveDef, x: number, y: number, open: boolean): void {
    const s = this.scene, L = x - MROW_W / 2;
    g.fillStyle(open ? 0x140a2a : 0x0c0818, 0.92).fillRect(L, y - MROW_H / 2, MROW_W, MROW_H);
    g.lineStyle(1.5, open ? CYAN : STEEL, open ? 0.7 : 0.35).strokeRect(L, y - MROW_H / 2, MROW_W, MROW_H);
    g.fillStyle(open ? MAGENTA : STEEL, open ? 1 : 0.5).fillRect(L, y - MROW_H / 2, 4, MROW_H);
    const ic = iconImg(s, L + 42, y, m.icon, 50);
    if (!open) ic.setAlpha(0.35);
    this.root.add(ic);
    const name = fitWidth(labelAt(s, L + 80, y - 22, t(m.name), M_NAME, 0), 270);
    this.root.add(name);
    const input = fitWidth(labelAt(s, L + 80, y + 4, t(`mv_${m.id}_${this.host.touch ? 't' : 'k'}`), M_IN, 0), MROW_W - 96);
    this.root.add(input);
    this.root.add(fitWidth(labelAt(s, L + 80, y + 26, t('md_' + m.id), M_DESC, 0), MROW_W - 96));
    if (open) {
      if (m.unlock.kind === 'start') this.root.add(fitWidth(labelAt(s, L + MROW_W - 12, y - 22, t('mvOpen'), M_OPEN, 1), 200));
    } else {
      name.setAlpha(0.55); input.setAlpha(0.6);
      this.root.add(iconImg(s, L + MROW_W - 22, y - 22, 'lock', 24));
      this.root.add(fitWidth(labelAt(s, L + MROW_W - 40, y - 22, t('lock_' + m.id), M_LOCK, 1), 220));
    }
  }

  key(code: string): boolean {
    if (code === 'Enter' || code === 'Space' || code === 'KeyM' || code === 'NumpadEnter' || code === 'Backspace') { this.done(); return true; }
    return super.key(code);
  }
  protected escape(): void { this.done(); }
  private done(): void {
    if (this.closed) return;
    this.host.sfx('pick', 0.4);
    this.close();
    this.onDone();
  }
}

// ------------------------------------------------------------------ beside the pause

/** A key handler that goes with the scene. */
function keyOn(scene: Phaser.Scene, ev: string, fn: () => void): void {
  const kb = scene.input.keyboard;
  if (!kb) return;
  kb.on(ev, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off(ev, fn));
}

export interface PauseInfo {
  cards: CardId[]; abilities: AbilityId[]; ranks: Ranks; chips: number; time: number; picks: number;
  /** Opens the Moves screen; picks the banked implant (both over the pause). */
  moves: () => void; pick: () => void;
}

/**
 * Added to the Pause scene as it opens: the run's implants on the left (PICK IMPLANT while one is
 * banked); the moves and the level's goals on the right (MOVES opens the full list). Keys: M moves,
 * I pick.
 */
export function pauseSides(scene: Phaser.Scene, o: PauseInfo): Phaser.GameObjects.Container {
  // desktop: the core's key strip runs along the bottom of the pause (two lines, from y 590), so
  // the cards are shorter and their rows closer
  const keys = keyHelpShown(scene);
  const H = keys ? PSIDE_H_KEYS : PSIDE_H, y = keys ? 104 + H / 2 : 400, moveStep = keys ? 26 : 30;
  const root = scene.add.container(0, 0).setDepth(5);
  const lx = 180, rx = 1100, top = y - H / 2;
  root.add(themeCard(scene, lx, y, PSIDE_W, H));
  root.add(labelAt(scene, lx, top + 34, t('yourChips'), P_HEAD));
  const cards = o.cards;
  if (!cards.length) root.add(new Para(scene, lx, top + 64, t('noChips'), P_NAME, PSIDE_W - 50, 0.5, 21));
  const room = keys ? (o.picks > 0 ? 7 : 9) : o.picks > 0 ? 9 : 11;
  const rowH = keys || cards.length > 9 ? 40 : 46;
  cards.slice(0, room).forEach((id, i) => {
    const x = lx - PSIDE_W / 2 + 44, yy = top + 82 + i * rowH;
    const def = CARD[id];
    const g = scene.add.graphics();
    g.fillStyle(RARITY_COLOR[def.rarity].glow, 0.5).fillCircle(x, yy, 18).lineStyle(2, RARITY_COLOR[def.rarity].frame, 1).strokeCircle(x, yy, 18);
    root.add(g);
    root.add(iconImg(scene, x, yy, def.icon, 28));
    root.add(fitWidth(labelAt(scene, x + 28, yy, t('k_' + id), P_NAME, 0), PSIDE_W - 96));
  });
  if (o.picks > 0) {
    const by = top + H - 46;
    const pick = new KitButton(scene, lx, by, { w: 260, h: 54, color: MAGENTA, label: t('pickImplant'), style: S_LATER, sfx: null }, () => o.pick());
    root.add(pick);
    scene.tweens.add({ targets: pick, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    keyOn(scene, 'keydown-I', o.pick);
  }
  root.add(themeCard(scene, rx, y, PSIDE_W, H));
  root.add(labelAt(scene, rx, top + 34, t('moves'), P_HEAD));
  let yy = top + 70;
  for (const m of MOVES) {
    const on = moveOpen(m.id, o.abilities, o.ranks);
    root.add(iconImg(scene, rx - PSIDE_W / 2 + 36, yy, on ? m.icon : 'lock', 26).setAlpha(on ? 1 : 0.55));
    root.add(fitWidth(labelAt(scene, rx - PSIDE_W / 2 + 60, yy, t(m.name), P_NAME, 0), PSIDE_W - 84).setAlpha(on ? 1 : 0.45));
    yy += moveStep;
  }
  const mb = new KitButton(scene, rx, yy + 26, { w: 240, h: 52, color: CYAN, label: t('moves'), style: S_LATER, sfx: null }, () => o.moves());
  root.add(mb);
  keyOn(scene, 'keydown-M', o.moves);
  yy += 74;
  root.add(iconImg(scene, rx - 120, yy, 'chip', 28));
  root.add(new FmtLine(scene, rx - 102, yy, P_NAME, 0).set('objChips', { n: o.chips }));
  root.add(iconImg(scene, rx + 18, yy, 'clock', 28));
  root.add(new FmtLine(scene, rx + 36, yy, P_NAME, 0).set('objTime', { t: clock(o.time) }));
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
  return root;
}

export { STEEL, YELLOW };
