// Astro Crew: the inner screens, in the menu theme (menu.ts): starry glass boards with a cyan rim,
// glossy capsule buttons, cards of the same glass.
//   - The crew choice (before a run; the live 3D crew member waves at the base on the left).
//   - The star map (the 3D planets behind; a board at the bottom with the chosen planet's mission).
//   - The mission brief (objective, aliens, the three stars' conditions).
//   - The power-card draft (three cards, one reroll) at every level-up.
//   - The mission summary (stars, kills, time, bonuses, the score counting up, crystals).
//   - The base (seven module tracks, three ranks each; the 3D base grows on the left).
//   - Beside the pause: the run's cards, and the mission with its stars.
// Touch: tap a tile or a button. Keyboard: arrows move the focus, Enter presses, number keys pick,
// Esc goes on. Everything is painted under the Ayvago intro (`prebakeScreens`, from the menu
// theme's prebake): opening a screen only places images (and glyph numbers).
import Phaser from 'phaser';
import {
  t, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, type LabelStyle,
} from '@core';
import { HERO, HERO_IDS, MISSIONS, FOE, type HeroId, type MissionDef } from './defs';
import { CARDS, CARD, UPGRADE, UPGRADE_IDS, MAX_RANK, RARITY_COLOR, RARITIES, stacks, type CardId, type UpgradeId, type Rarity } from './powers';
import { makeArt, iconImg, SPARK, STAR_ON, STAR_OFF } from './art';
import { nextPrice, buy, crewOpen, type Meta } from './meta';

export const OVERLAY_DEPTH = 9400;
const INK = '#170c3a';
const ORANGE = 0xff8a2a, VIOLET = 0x6a4ad8, GREEN = 0x2ec27a;

// ------------------------------------------------------------------ sizes

/** The crew board (right), its tiles. */
const CREW_W = 640, CREW_H = 570, CREW_X = 930, CREW_Y = 412, TILE_W = 140, TILE_H = 150;
/** The star map's board at the bottom. */
const MAPB_W = 900, MAPB_H = 168;
/** The brief and the summary cards. */
export const BRIEF_W = 700, BRIEF_H = 560;
/** The draft's cards and board. */
export const CARD_W = 250, CARD_H = 330;
const DRAFT_W = 960, DRAFT_H = 610;
/** The base board (right) and its tiles. */
const BASE_W = 640, BASE_H = 590, BASE_X = 930, BASE_Y = 410, UP_W = 296, UP_H = 128, BUY_W = 84, BUY_H = 40;
/** The pause's side cards. */
export const PSIDE_W = 300, PSIDE_H = 560;

/** Every card size the screens use (declared in the theme, painted ahead). */
export const SCREEN_CARDS = [{ w: BRIEF_W, h: BRIEF_H }, { w: PSIDE_W, h: PSIDE_H }, { w: TILE_W, h: TILE_H }, { w: UP_W, h: UP_H }];

// ------------------------------------------------------------------ styles (shared with the prebake)

export const S_TITLE: LabelStyle = { size: 46, fill: ['#fffbe8', '#ffe27a', '#ffa83a'], stroke: INK, strokeWidth: 8 };
export const S_SUB: LabelStyle = { size: 18, color: '#d8d0ff', stroke: INK, strokeWidth: 3, body: true };
const S_BTN: LabelStyle = { size: 28 };
const S_BTN_S: LabelStyle = { size: 22 };
const S_HEAD: LabelStyle = { size: 36, fill: ['#e8fcff', '#7aeaff'], stroke: INK, strokeWidth: 6 };
const S_NAME: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_NAME_S: LabelStyle = { size: 18, color: '#ffffff', stroke: INK, strokeWidth: 3 };
const S_DESC: LabelStyle = { size: 16, color: '#ddd6ff', stroke: null, shadow: false, body: true };
const S_DESC_L: LabelStyle = { size: 18, color: '#ece8ff', stroke: null, shadow: false, body: true };
const S_TAG: LabelStyle = { size: 17, color: '#ffd84a', stroke: INK, strokeWidth: 3 };
const S_LOCK: LabelStyle = { size: 15, color: '#cfc8f4', stroke: null, shadow: false, body: true };
const S_STAT: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_GOLD: LabelStyle = { size: 44, fill: ['#fff6c8', '#ffd84a', '#ff8a2a'], stroke: INK, strokeWidth: 6 };
const S_PURSE: LabelStyle = { size: 34, color: '#9ae8ff', stroke: INK, strokeWidth: 5 };
const S_PRICE: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_TOAST: LabelStyle = { size: 26, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
const S_KEYS: LabelStyle = { size: 15, color: '#b8b0e8', stroke: INK, strokeWidth: 3, body: true };
const S_KIND: LabelStyle = { size: 20, color: '#ffb06a', stroke: INK, strokeWidth: 3 };
const V_CARD: LabelStyle = { size: 23, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const V_CARD_D: LabelStyle = { size: 17, color: '#ece8ff', stroke: null, shadow: false, body: true };
const V_RAR = (r: Rarity): LabelStyle => ({ size: 15, color: RARITY_COLOR[r].ink, stroke: INK, strokeWidth: 3, body: true });
const P_HEAD: LabelStyle = { size: 24, fill: ['#e8fcff', '#7aeaff'], stroke: INK, strokeWidth: 4 };
const P_NAME: LabelStyle = { size: 17, color: '#ffffff', stroke: null, shadow: false, body: true };
const S_NEW: LabelStyle = { size: 16, color: '#fff8ec', stroke: '#8a2a10', strokeWidth: 4 };
const CARD_KEY = (r: Rarity): string => 'ac-card-' + r;
const CARD_GLOW = 'ac-card-glow';

/** A mission's star-condition lines (the defend's second star counts the dome too). */
export const starLines = (m: MissionDef): string[] => [t('star1'), t(m.kind === 'defend' ? 'star2d' : 'star2'), t('star3', { n: m.par })];

// ------------------------------------------------------------------ the prebake

/** Paints, in the current language, everything the inner screens show (Boot, under the intro). */
export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const [w, h] of [[CREW_W, CREW_H], [MAPB_W, MAPB_H], [DRAFT_W, DRAFT_H], [BASE_W, BASE_H]]) skinTexture(scene, 'board', w, h);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['crewTitle', 'mapTitle', 'draftTitle', 'baseTitle']) labelTexture(scene, t(k), S_TITLE);
  for (const k of ['crewSub', 'draftSub']) bakePara(scene, t(k), S_SUB, 600);
  bakePara(scene, t('baseSub'), S_SUB, 520);
  for (const [w, h, col, off] of [[300, 72, ORANGE, false], [240, 66, VIOLET, true], [200, 62, ORANGE, true], [190, 62, VIOLET, false], [BUY_W, BUY_H, GREEN, true]] as [number, number, number, boolean][]) bakeButton(scene, 'button', w, h, col, off);
  bakeButton(scene, 'plate', TILE_W, TILE_H, VIOLET, true, true);
  bakeButton(scene, 'plate', CARD_W, CARD_H, VIOLET);
  for (const k of ['launch', 'go', 'toBase', 'land', 'reroll', 'toBaseBtn', 'toMap', 'buy', 'maxed']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['poor', 'bought', 'maxed', 'mapLocked']) labelTexture(scene, t(k), S_TOAST);
  labelTexture(scene, t('maxed'), S_TAG);
  for (const o of [S_PURSE, S_PRICE, S_STAT, S_GOLD, S_NAME]) glyphAtlas(scene, o);
  for (const k of ['draftKeys', 'crewKeys', 'mapKeys']) labelTexture(scene, t(k), S_KEYS);
  // the crew
  for (const h of HERO_IDS) {
    labelTexture(scene, t('h_' + h), S_NAME); labelTexture(scene, t('h_' + h), S_NAME_S); labelTexture(scene, t('h_' + h), P_NAME);
    labelTexture(scene, t('w_' + h), S_TAG); labelTexture(scene, t('s_' + h), S_TAG);
    bakePara(scene, t('wd_' + h), S_DESC, 520); bakePara(scene, t('sd_' + h), S_DESC, 520);
    if (HERO[h].unlock) { bakePara(scene, t('unlockAt', { n: HERO[h].unlock }), S_LOCK, TILE_W - 16); labelTexture(scene, t('unlockAt', { n: HERO[h].unlock }), S_TOAST); }
  }
  for (const k of ['statHp', 'statSpeed', 'statPower']) labelTexture(scene, t(k), S_DESC_L);
  for (const k of ['weapon', 'skill']) labelTexture(scene, t(k) + ':', S_DESC_L);
  for (const h of HERO_IDS) labelTexture(scene, shortName(h), S_NAME_S);
  for (let n = 1; n <= MISSIONS.length; n++) labelTexture(scene, String(n), S_PRICE);
  labelTexture(scene, t('locked'), S_LOCK);
  // the map, the brief, the summary
  for (const m of MISSIONS) {
    labelTexture(scene, t('m_' + m.n), S_NAME); labelTexture(scene, t('m_' + m.n), S_HEAD); labelTexture(scene, t('m_' + m.n), P_NAME);
    bakePara(scene, t('o_' + m.n), S_DESC_L, BRIEF_W - 90);
    bakePara(scene, t('o_' + m.n), S_DESC, MAPB_W - 420);
    bakePara(scene, t('o_' + m.n), P_NAME, PSIDE_W - 40);
    for (const s of starLines(m)) { labelTexture(scene, s, S_DESC_L); labelTexture(scene, s, P_NAME); }
  }
  for (const k of ['clear', 'rescue', 'defend', 'keys', 'boss']) labelTexture(scene, t('k_' + k), S_KIND);
  bakeFmt(scene, 'missionN', ['n'], S_KIND);
  labelTexture(scene, t('newPlanet'), S_NEW);
  for (const k of ['aliens', 'stars']) labelTexture(scene, t(k), P_HEAD);
  labelTexture(scene, t('sumTitle'), S_HEAD);
  for (const k of ['sumKills', 'sumTime', 'sumBonus', 'sumFast', 'sumStars', 'sumCrystals']) bakeFmt(scene, k, ['n'], S_DESC_L);
  labelTexture(scene, t('sumScore'), P_HEAD);
  for (const k of ['join_flamingo', 'join_panda']) labelTexture(scene, t(k), S_TAG);
  // cards
  prebakeCards(scene);
  // the base
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_NAME_S);
    for (let r = 1; r <= MAX_RANK; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, UP_W - 120);
  }
  // the pause's side cards
  for (const k of ['yourCards', 'missionCard']) labelTexture(scene, t(k), P_HEAD);
  bakePara(scene, t('noCards'), P_NAME, PSIDE_W - 50);
}

/** A power card's face: dark glass, a rarity frame and a glowing disc for the picture. */
function paintCard(c: CanvasRenderingContext2D, w: number, h: number, r: Rarity): void {
  const col = RARITY_COLOR[r];
  const hex = (v: number, a = 1) => `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  c.save();
  c.translate(12, 12);
  if (r !== 'common') { c.save(); c.shadowColor = hex(col.frame, r === 'legendary' ? 1 : 0.8); c.shadowBlur = r === 'legendary' ? 18 : 10; c.fillStyle = hex(col.frame); c.beginPath(); c.roundRect(0, 0, w, h, 16); c.fill(); c.restore(); }
  c.shadowColor = 'rgba(4,2,16,0.55)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
  c.fillStyle = '#120c34'; c.beginPath(); c.roundRect(0, 0, w, h, 16); c.fill();
  c.shadowColor = 'transparent';
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2c2270'); g.addColorStop(1, '#120c34');
  c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, 16); c.fill();
  const rr = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
  const rnd = rr(w * 7 + h + r.length);
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.4})`; c.fillRect(rnd() * w, rnd() * h, 1.4, 1.4); }
  c.lineWidth = 5; c.strokeStyle = hex(col.frame, 0.95);
  c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 11); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = hex(col.frame, 0.45);
  c.beginPath(); c.roundRect(15, 15, w - 30, h - 30, 8); c.stroke();
  const d = c.createRadialGradient(w / 2, 108, 8, w / 2, 108, 56);
  d.addColorStop(0, hex(col.glow, 0.8)); d.addColorStop(1, hex(col.glow, 0.12));
  c.fillStyle = d; c.beginPath(); c.arc(w / 2, 108, 54, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = hex(col.frame); c.stroke();
  if (r === 'legendary') {
    c.fillStyle = '#ffd84a';
    for (const [x, y] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]]) { c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}

function prebakeCards(scene: Phaser.Scene): void {
  for (const r of RARITIES) bake(scene, CARD_KEY(r), CARD_W + 24, CARD_H + 24, (c) => paintCard(c, CARD_W, CARD_H, r));
  bake(scene, CARD_GLOW, CARD_W + 44, CARD_H + 44, (c) => { c.shadowColor = 'rgba(120,230,255,1)'; c.shadowBlur = 18; c.strokeStyle = 'rgba(190,246,255,1)'; c.lineWidth = 6; c.beginPath(); c.roundRect(22, 22, CARD_W, CARD_H, 16); c.stroke(); });
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), V_RAR(r));
  for (const card of CARDS) {
    labelTexture(scene, t('c_' + card.id), V_CARD);
    labelTexture(scene, t('c_' + card.id), P_NAME);
    bakePara(scene, t('cd_' + card.id), V_CARD_D, CARD_W - 44);
  }
  for (let n = 2; n <= 3; n++) labelTexture(scene, t('stackN', { n }), S_TAG);
  for (let n = 1; n <= 60; n++) labelTexture(scene, t('levelN', { n }), S_TAG);
}

// ------------------------------------------------------------------ the panel frame

export interface ScreenHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

interface Focusable { btn: KitButton; x: number; y: number }

/** An overlay screen: a dim layer, an optional board, keyboard focus over its buttons, toasts. */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected content: Phaser.GameObjects.Container;
  protected focus: Focusable[] = [];
  protected fi = -1;
  private toastImg: Phaser.GameObjects.Image | null = null;
  closed = false;
  private release: () => void;
  onClose: (() => void) | null = null;

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number?, number?]; title?: string; titleX?: number; titleY?: number; titleW?: number; sub?: string; subW?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x05040e, o.dim ?? 0.55).setOrigin(0).setInteractive();
    // a tap on the screen never reaches the movement stick under it
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2] ?? width / 2, (o.board[3] ?? height / 2) + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    const tx = o.titleX ?? width / 2, ty = o.titleY ?? 64;
    if (o.title) this.root.add(fitWidth(labelAt(scene, tx, ty, o.title, S_TITLE), o.titleW ?? 560));
    if (o.sub) this.root.add(new Para(scene, tx, ty + 32, o.sub, S_SUB, o.subW ?? 600, 0.5, 23));
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
      case 'Enter': case 'Space': case 'NumpadEnter': {
        const f = this.focus[this.fi];
        if (f) f.btn.emit('pointerup', { wasTouch: false });
        return true;
      }
      case 'Escape': this.escape(); return true;
    }
    return false;
  }

  protected escape(): void { this.close(); }

  toast(key: string, y = this.scene.scale.height - 44, x = this.scene.scale.width / 2): void { this.say(t(key), y, x); }

  /** A short painted line (prebaked with S_TOAST). */
  say(text: string, y = this.scene.scale.height - 44, x = this.scene.scale.width / 2): void {
    this.toastImg?.destroy();
    this.toastImg = labelAt(this.scene, x, y, text, S_TOAST);
    this.root.add(this.toastImg);
    const img = this.toastImg;
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1200, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

  protected deny(b: Phaser.GameObjects.Container, why: string, y?: number, x?: number): void { this.denyText(b, t(why), y, x); }

  /** Shakes a button, plays the deny sound and says why (already translated). */
  protected denyText(b: Phaser.GameObjects.Container, text: string, y?: number, x?: number): void {
    const x0 = (b.getData('x0') as number | undefined) ?? b.x;
    b.setData('x0', x0);
    this.scene.tweens.killTweensOf(b);
    b.x = x0;
    this.scene.tweens.add({ targets: b, x: x0 + 6, duration: 40, yoyo: true, repeat: 2, onComplete: () => { b.x = x0; } });
    this.host.sfx('deny', 0.4);
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
    this.onClose?.();
  }

  /** A burst of sparks at (x, y) in the screen. */
  protected sparkle(x: number, y: number, tint: number[], n = 30): void {
    const em = this.scene.add.particles(x, y, SPARK, {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }
}

/** Three stars (lit or not) in a row centred on x. */
function starRow(s: Phaser.Scene, x: number, y: number, n: number, size: number, gap: number): Phaser.GameObjects.Image[] {
  return [0, 1, 2].map((i) => s.add.image(x + (i - 1) * gap, y, i < n ? STAR_ON : STAR_OFF).setDisplaySize(size, size));
}

/** A small bar of 1 to 5 pips (the crew's stats). */
function pips(s: Phaser.Scene, x: number, y: number, n: number, col: number): Phaser.GameObjects.Graphics {
  const g = s.add.graphics();
  for (let i = 0; i < 5; i++) {
    g.fillStyle(i < n ? col : 0x2a2460, 1).fillRoundedRect(x + i * 29, y - 7, 25, 14, 5);
    g.lineStyle(2, 0x170c3a, 1).strokeRoundedRect(x + i * 29, y - 7, 25, 14, 5);
  }
  return g;
}

/** A crew member's first name (the last word of the full name). */
const shortName = (h: HeroId): string => t('h_' + h).split(' ').pop()!;

const STATS: Record<HeroId, [number, number, number]> = { frog: [5, 3, 3], bee: [2, 5, 3], flamingo: [3, 4, 5], panda: [4, 3, 4] };

// ------------------------------------------------------------------ the crew choice

/** The crew for this run: four tiles, the chosen one's weapon, skill and stats; LAUNCH. */
export class CrewScreen extends Panel {
  private tiles: KitButton[] = [];
  private detail: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private crew: HeroId, private onPick: (h: HeroId) => void, private onDone: (h: HeroId) => void) {
    super(scene, host, { board: [CREW_W, CREW_H, CREW_X, CREW_Y], title: t('crewTitle'), titleX: CREW_X, titleY: 158, titleW: CREW_W - 60, sub: t('crewSub'), subW: CREW_W - 70, dim: 0.08 });
    const s = scene;
    HERO_IDS.forEach((h, i) => {
      const x = CREW_X + (i - 1.5) * (TILE_W + 10), y = 318;
      const open = crewOpen(meta, h);
      // a locked member is a disabled tile: a tap (or its number key) shakes it and says when it opens
      const b = new KitButton(s, x, y, { w: TILE_W, h: TILE_H, kind: 'plate', color: VIOLET, on: h === crew, sfx: null, tapWhenOff: true }, () => {
        if (!b.enabled) { this.locked(h); return; }
        this.select(h);
      });
      b.setEnabled(open);
      const pic = iconImg(s, 0, open ? -16 : -22, 'hero-' + h, open ? 104 : 92);
      b.addContent(pic);
      if (open) b.addContent(fitWidth(labelAt(s, 0, 50, shortName(h), S_NAME_S), TILE_W - 16));
      else {
        pic.setTint(0x2a2450).setAlpha(0.7);
        b.addContent(iconImg(s, 0, -24, 'p-lock', 50));
        const why = new Para(s, 0, 0, t('unlockAt', { n: HERO[h].unlock }), S_LOCK, TILE_W - 16, 0.5, 16);
        why.y = 52 - why.textHeight / 2;
        b.addContent(why);
      }
      this.root.add(b);
      this.tiles.push(b);
      this.addFocus(b, x, y);
    });
    this.detail = s.add.container(0, 0);
    this.root.add(this.detail);
    this.showDetail();
    // LAUNCH; with a keyboard the keys' hint sits beside it, inside the board
    const gx = host.touch ? CREW_X : CREW_X - 110;
    const go = new KitButton(s, gx, 640, { w: 300, h: 72, color: ORANGE, label: t('launch'), style: S_BTN, sfx: null }, () => this.finish());
    this.root.add(go);
    this.addFocus(go, gx, 640);
    if (!host.touch) this.root.add(fitWidth(labelAt(s, CREW_X + 165, 640, t('crewKeys'), S_KEYS), 230));
    this.fi = this.host.touch ? -1 : HERO_IDS.length;
    this.showFocus();
  }

  private showDetail(): void {
    const s = this.scene, h = this.crew, x0 = CREW_X - CREW_W / 2 + 46;
    this.detail.removeAll(true);
    this.detail.add(labelAt(s, x0, 418, t('h_' + h), S_NAME, 0));
    this.detail.add(labelAt(s, x0, 450, t('weapon') + ':', S_DESC_L, 0));
    this.detail.add(fitWidth(labelAt(s, x0 + 96, 450, t('w_' + h), S_TAG, 0), 420));
    this.detail.add(new Para(s, x0, 472, t('wd_' + h), S_DESC, 520, 0, 19));
    this.detail.add(labelAt(s, x0, 508, t('skill') + ':', S_DESC_L, 0));
    this.detail.add(fitWidth(labelAt(s, x0 + 96, 508, t('s_' + h), S_TAG, 0), 420));
    this.detail.add(new Para(s, x0, 530, t('sd_' + h), S_DESC, 520, 0, 19));
    const st = STATS[h];
    ['statHp', 'statSpeed', 'statPower'].forEach((k, i) => {
      const x = x0 + i * 186;
      this.detail.add(labelAt(s, x, 566, t(k), S_DESC_L, 0));
      this.detail.add(pips(s, x, 592, st[i], [0xff6a8a, 0x5ae8ff, 0xffb04a][i]));
    });
  }

  /** A locked tile: it shakes and says which mission unlocks it. */
  private locked(h: HeroId): void {
    if (this.closed) return;
    // the reason takes the detail's place for a moment (the detail fades under it)
    this.denyText(this.tiles[HERO_IDS.indexOf(h)], t('unlockAt', { n: HERO[h].unlock }), 432, CREW_X);
    this.scene.tweens.killTweensOf(this.detail);
    this.scene.tweens.add({ targets: this.detail, alpha: 0.12, duration: 120 });
    this.scene.tweens.add({ targets: this.detail, alpha: 1, delay: 1350, duration: 250 });
  }

  private select(h: HeroId): void {
    if (this.closed || h === this.crew) return;
    this.crew = h;
    this.scene.tweens.killTweensOf(this.detail);
    this.detail.setAlpha(1);
    this.tiles.forEach((b, i) => b.setSelected(HERO_IDS[i] === h));
    this.host.sfx('pick', 0.5);
    this.showDetail();
    this.onPick(h);
  }

  key(code: string): boolean {
    const n = Number(code.replace('Digit', ''));
    if (code.startsWith('Digit') && n >= 1 && n <= HERO_IDS.length) { if (crewOpen(this.meta, HERO_IDS[n - 1])) this.select(HERO_IDS[n - 1]); else this.locked(HERO_IDS[n - 1]); return true; }
    if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') {
      const open = HERO_IDS.filter((h) => crewOpen(this.meta, h));
      const i = open.indexOf(this.crew), d = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      this.select(open[(i + d + open.length) % open.length]);
      return true;
    }
    return super.key(code);
  }

  protected escape(): void { this.finish(); }

  private finish(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.onDone(this.crew);
  }
}

// ------------------------------------------------------------------ the star map

/** The chosen planet's board at the bottom; taps on the planets choose; GO flies there. */
export class MapScreen extends Panel {
  private info: Phaser.GameObjects.Container;
  private goBtn: KitButton;
  private zones: Phaser.GameObjects.Zone[] = [];
  private marks: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private sel: number, private pos: (i: number) => { x: number; y: number }, private onSelect: (i: number) => void, private onGo: (i: number) => void, private onBase: () => void) {
    super(scene, host, { dim: 0, title: t('mapTitle'), titleY: 54 });
    const s = scene, y = 720 - MAPB_H / 2 - 12;
    this.root.add(s.add.image(640, y + SKIN_PAD / 2, skinTexture(s, 'board', MAPB_W, MAPB_H)));
    this.marks = s.add.container(0, 0);
    this.root.addAt(this.marks, 1);
    this.info = s.add.container(0, 0);
    this.root.add(this.info);
    this.goBtn = new KitButton(s, 640 + MAPB_W / 2 - 128, y - 30, { w: 200, h: 62, color: ORANGE, label: t('go'), style: S_BTN, sfx: null, tapWhenOff: true }, () => this.go());
    const base = new KitButton(s, 640 + MAPB_W / 2 - 128, y + 40, { w: 190, h: 62, color: VIOLET, label: t('toBase'), style: S_BTN_S, sfx: null }, () => { if (!this.closed) { this.host.sfx('click', 0.5); this.close(); this.onBase(); } });
    this.root.add([this.goBtn, base]);
    this.addFocus(this.goBtn, this.goBtn.x, this.goBtn.y);
    this.addFocus(base, base.x, base.y);
    if (!host.touch) this.root.add(labelAt(s, 640, 96, t('mapKeys'), S_KEYS));
    // tap the planets; their stars under them
    MISSIONS.forEach((m, i) => {
      const p = pos(i);
      const z = s.add.zone(p.x, p.y, 110, 110).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.choose(i));
      this.zones.push(z);
      this.root.add(z);
      if (i + 1 <= meta.unlocked && i < MISSIONS.length) {
        const st = starRow(s, p.x, p.y + 58, meta.stars[i], 22, 22);
        this.marks.add(st);
        if (i + 1 === meta.unlocked) this.marks.add(labelAt(s, p.x, p.y - 62, t('newPlanet'), S_NEW));
      } else this.marks.add(iconImg(s, p.x, p.y, 'p-lock', 40).setAlpha(0.85));
      this.marks.add(labelAt(s, p.x - 46, p.y - 40, String(m.n), S_PRICE).setScale(0.8));
    });
    this.showInfo();
    this.fi = host.touch ? -1 : 0;
    this.showFocus();
  }

  private showInfo(): void {
    const s = this.scene, m = MISSIONS[this.sel], y = 720 - MAPB_H / 2 - 12;
    const x0 = 640 - MAPB_W / 2 + 40;
    this.info.removeAll(true);
    this.info.add(iconImg(s, x0 + 48, y, m.planet, 104));
    this.info.add(new FmtLine(s, x0 + 112, y - 52, S_KIND, 0).set('missionN', { n: m.n }));
    this.info.add(fitWidth(labelAt(s, x0 + 112, y - 22, t('m_' + m.n), S_NAME, 0), 360));
    this.info.add(labelAt(s, x0 + 112 + 380, y - 52, t('k_' + m.kind), S_KIND, 1));
    const open = m.n <= this.meta.unlocked;
    if (open) {
      this.info.add(new Para(s, x0 + 112, y + 6, t('o_' + m.n), S_DESC, MAPB_W - 420, 0, 19));
      this.info.add(starRow(s, x0 + 48, y + 64, this.meta.stars[this.sel], 26, 28));
    } else this.info.add(new Para(s, x0 + 112, y + 10, t('mapLocked'), S_DESC, MAPB_W - 420, 0, 19));
    this.goBtn.setEnabled(open);
  }

  private choose(i: number): void {
    if (this.closed) return;
    if (i === this.sel) { this.go(); return; }
    this.sel = i;
    this.host.sfx('move', 0.4);
    this.showInfo();
    this.onSelect(i);
  }

  key(code: string): boolean {
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      const d = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      const max = Math.min(MISSIONS.length, this.meta.unlocked) - 1;
      const n = Math.max(0, Math.min(max, this.sel + d));
      if (n !== this.sel) this.choose(n);
      return true;
    }
    if (code === 'KeyB') { this.focus[1].btn.emit('pointerup', { wasTouch: false }); return true; }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { if (this.fi === 1) return super.key(code); this.go(); return true; }
    return super.key(code);
  }

  protected escape(): void { this.go(); }

  private go(): void {
    if (this.closed) return;
    if (MISSIONS[this.sel].n > this.meta.unlocked) { this.deny(this.goBtn, 'mapLocked', 470); return; }
    this.host.sfx('start', 0.5);
    this.close();
    this.onGo(this.sel);
  }
}

// ------------------------------------------------------------------ the brief

/** Mission N: the name, the kind, the objective, the aliens, the stars' conditions; LAND. */
export class BriefScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, m: MissionDef, stars: number, private onGo: () => void) {
    super(scene, host, { dim: 0.35 });
    const s = scene, cx = 640, cy = 372, top = cy - BRIEF_H / 2;
    const card = themeCard(s, cx, cy, BRIEF_W, BRIEF_H);
    this.root.add(card);
    this.root.add(iconImg(s, cx - BRIEF_W / 2 + 70, top + 70, m.planet, 104));
    this.root.add(new FmtLine(s, cx - BRIEF_W / 2 + 132, top + 44, S_KIND, 0).set('missionN', { n: m.n }));
    this.root.add(fitWidth(labelAt(s, cx - BRIEF_W / 2 + 132, top + 84, t('m_' + m.n), S_HEAD, 0), BRIEF_W - 330));
    this.root.add(labelAt(s, cx + BRIEF_W / 2 - 40, top + 44, t('k_' + m.kind), S_KIND, 1));
    this.root.add(new Para(s, cx, top + 136, t('o_' + m.n), S_DESC_L, BRIEF_W - 90, 0.5, 24));
    // the aliens
    this.root.add(labelAt(s, cx, top + 222, t('aliens'), P_HEAD));
    const foes: string[] = m.foes.map((f) => (f === 'fly' ? 'flyer' : f === 'xs' ? 'e-xs' : f === 's' ? 'e-s' : 'brute'));
    if (m.boss) foes.push('p-skull');
    foes.forEach((f, i) => this.root.add(iconImg(s, cx + (i - (foes.length - 1) / 2) * 92, top + 282, f, 84)));
    // the stars
    this.root.add(labelAt(s, cx, top + 348, t('stars'), P_HEAD));
    starLines(m).forEach((line, i) => {
      const y = top + 384 + i * 34;
      this.root.add(s.add.image(cx - 250, y, i < stars ? STAR_ON : STAR_OFF).setDisplaySize(28, 28));
      this.root.add(fitWidth(labelAt(s, cx - 226, y, line, S_DESC_L, 0), 480));
    });
    const go = new KitButton(s, cx, top + BRIEF_H - 50, { w: 300, h: 72, color: ORANGE, label: t('land'), style: S_BTN, sfx: null }, () => this.go());
    this.root.add(go);
    this.addFocus(go, cx, top + BRIEF_H - 50);
    this.fi = 0;
    this.showFocus();
    card.setScale(0.9);
    s.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  protected escape(): void { this.go(); }

  private go(): void {
    if (this.closed) return;
    this.host.sfx('start', 0.5);
    this.close();
    this.onGo();
  }
}

// ------------------------------------------------------------------ power cards

/** A card face for the draft: its rarity's frame, the picture, the name and what it does. */
export function cardFace(s: Phaser.Scene, x: number, y: number, id: CardId, held: number): Phaser.GameObjects.Container {
  const def = CARD[id];
  const c = s.add.container(x, y);
  c.add(s.add.image(0, 0, CARD_KEY(def.rarity)));
  c.add(labelAt(s, 0, -CARD_H / 2 + 34, t('r_' + def.rarity), V_RAR(def.rarity)));
  c.add(iconImg(s, 0, -CARD_H / 2 + 108, def.icon, 86));
  c.add(fitWidth(labelAt(s, 0, 18, t('c_' + id), V_CARD), CARD_W - 40));
  c.add(new Para(s, 0, 42, t('cd_' + id), V_CARD_D, CARD_W - 44, 0.5, 21));
  if (held > 0) c.add(labelAt(s, CARD_W / 2 - 34, -CARD_H / 2 + 34, t('stackN', { n: held + 1 }), S_TAG));
  return c;
}

/** Three cards side by side, one reroll; a tap (Enter on the focused card, or 1–3) takes one. */
export class DraftScreen extends Panel {
  private faces: { c: Phaser.GameObjects.Container; id: CardId; hit: KitButton }[] = [];
  private glow: Phaser.GameObjects.Image;
  private rerolled = false;
  private picked = false;
  private reroll!: KitButton;
  private y = 384;

  constructor(scene: Phaser.Scene, host: ScreenHost, level: number, private held: CardId[], private offer: CardId[], private dealAgain: () => CardId[], private onPick: (id: CardId) => void) {
    super(scene, host, { board: [DRAFT_W, DRAFT_H, 640, 384], title: t('draftTitle'), titleY: 146, sub: t('draftSub'), dim: 0.5 });
    // the level reached, inside the board above the title
    this.root.add(labelAt(scene, 640, 108, t('levelN', { n: level }), S_TAG).setScale(1.3));
    this.glow = scene.add.image(0, 0, CARD_GLOW).setVisible(false);
    this.root.add(this.glow);
    this.deal(false);
  }

  private deal(again: boolean): void {
    const s = this.scene, x0 = 640, y = this.y + 18;
    for (const f of this.faces) f.c.destroy();
    this.faces = [];
    this.focus = [];
    this.offer.forEach((id, i) => {
      const x = x0 + (i - 1) * (CARD_W + 34);
      const c = cardFace(s, x, y, id, stacks(this.held, id));
      const hit = new KitButton(s, 0, 0, { w: CARD_W, h: CARD_H, kind: 'plate', color: VIOLET, sfx: null }, () => this.take(i));
      hit.face.setAlpha(0.001);
      hit.on('pointerover', () => { this.fi = i; this.showGlow(); });
      c.add(hit);
      this.root.add(c);
      this.faces.push({ c, id, hit });
      this.addFocus(hit, x, y);
      c.setScale(0.2, 1).setAlpha(0);
      s.tweens.add({ targets: c, scaleX: 1, alpha: 1, duration: 200, delay: 60 + i * 90, ease: 'Back.easeOut' });
      if (CARD[id].rarity === 'legendary') s.time.delayedCall(260 + i * 90, () => { if (!this.closed) this.host.sfx('fanfare', 0.35); });
    });
    if (!this.reroll) {
      this.reroll = new KitButton(s, x0, y + CARD_H / 2 + 46, { w: 240, h: 66, color: VIOLET, label: t('reroll'), style: S_BTN_S, tapWhenOff: true, sfx: null }, () => {
        if (this.rerolled || this.picked) { this.deny(this.reroll, 'maxed', 700); return; }
        this.rerolled = true;
        this.offer = this.dealAgain();
        this.host.sfx('card', 0.5);
        this.reroll.setEnabled(false);
        this.deal(true);
      });
      this.root.add(this.reroll);
      if (!this.host.touch) this.root.add(labelAt(s, x0 + 330, y + CARD_H / 2 + 46, t('draftKeys'), S_KEYS));
    }
    this.addFocus(this.reroll, x0, y + CARD_H / 2 + 46);
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

  protected escape(): void { /* a card must be picked */ }

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
    this.faces.forEach((o, k) => { if (k !== i) s.tweens.add({ targets: o.c, y: o.c.y + 60, alpha: 0, duration: 220 }); });
    this.glow.setVisible(true).setPosition(f.c.x, f.c.y);
    s.tweens.add({ targets: [f.c, this.glow], x: 640, y: this.y + 18, scale: 1.1, duration: 280, ease: 'Back.easeOut' });
    s.time.delayedCall(290, () => { if (!this.closed) this.sparkle(640, this.y, [RARITY_COLOR[rar].glow, 0xffffff, 0x7aeaff], 40); });
    s.time.delayedCall(700, () => { this.close(); this.onPick(f.id); });
  }
}

// ------------------------------------------------------------------ the summary

export interface MissionSummary { n: number; stars: [boolean, boolean, boolean]; kills: number; time: number; bonus: number; fast: number; starBonus: number; score: number; crystals: number; join?: HeroId }

/** Mission complete: the stars drop in, the numbers, the run's score counting up; TO BASE. */
export class SummaryScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, sum: MissionSummary, private onGo: () => void) {
    super(scene, host, { dim: 0.45 });
    const s = scene, cx = 640, cy = 372, top = cy - BRIEF_H / 2;
    const card = themeCard(s, cx, cy, BRIEF_W, BRIEF_H);
    this.root.add(card);
    this.root.add(labelAt(s, cx, top + 54, t('sumTitle'), S_HEAD));
    this.root.add(labelAt(s, cx, top + 96, t('m_' + sum.n), S_NAME));
    // the stars, one by one
    sum.stars.forEach((on, i) => {
      const img = s.add.image(cx + (i - 1) * 86, top + 162, on ? STAR_ON : STAR_OFF).setDisplaySize(76, 76);
      this.root.add(img);
      if (!on) return;
      const sc = img.scale;
      img.setScale(0.01);
      s.tweens.add({ targets: img, scale: sc, duration: 300, delay: 250 + i * 260, ease: 'Back.easeOut', onStart: () => { this.host.sfx('star', 0.5); }, onComplete: () => this.sparkle(img.x, img.y, [0xffd84a, 0xffffff], 18) });
    });
    let y = top + 232;
    for (const [k, v] of [['sumKills', sum.kills], ['sumTime', Math.round(sum.time)], ['sumBonus', sum.bonus], ['sumFast', sum.fast], ['sumStars', sum.starBonus]] as [string, number][]) {
      this.root.add(new FmtLine(s, cx - 220, y, S_DESC_L, 0).set(k, { n: v }));
      y += 32;
    }
    this.root.add(iconImg(s, cx + 120, top + 252, 'p-crystal', 48));
    this.root.add(new FmtLine(s, cx + 150, top + 252, S_DESC_L, 0).set('sumCrystals', { n: sum.crystals }));
    this.root.add(labelAt(s, cx + 170, top + 310, t('sumScore'), P_HEAD));
    const score = new GlyphText(s, cx + 170, top + 358, '0', S_GOLD, 0.5);
    this.root.add(score);
    const n = { v: 0 };
    s.tweens.add({ targets: n, v: sum.score, duration: 1000, delay: 300, ease: 'Cubic.easeOut', onUpdate: () => score.setText(String(Math.round(n.v))), onComplete: () => score.setText(String(sum.score)) });
    if (sum.join) {
      const j = labelAt(s, cx, top + BRIEF_H - 118, t('join_' + sum.join), S_TAG).setScale(1.15);
      this.root.add(j);
      this.root.add(iconImg(s, j.x - j.displayWidth / 2 - 34, j.y, 'hero-' + sum.join, 56));
    }
    const go = new KitButton(s, cx, top + BRIEF_H - 52, { w: 300, h: 72, color: ORANGE, label: t('toBaseBtn'), style: S_BTN, sfx: null }, () => this.go());
    this.root.add(go);
    this.addFocus(go, cx, top + BRIEF_H - 52);
    this.fi = 0;
    this.showFocus();
    card.setScale(0.9);
    s.tweens.add({ targets: card, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  protected escape(): void { this.go(); }

  private go(): void {
    if (this.closed) return;
    this.host.sfx('click', 0.5);
    this.close();
    this.onGo();
  }
}

// ------------------------------------------------------------------ the base

/** Seven module tiles on the right board; the purse and STAR MAP on the left over the 3D base. */
export class BaseScreen extends Panel {
  private purse!: GlyphText;

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onBuy: (u: UpgradeId) => void, private onDone: () => void) {
    super(scene, host, { board: [BASE_W, BASE_H, BASE_X, BASE_Y], title: t('baseTitle'), titleX: 300, titleY: 62, titleW: 420, sub: t('baseSub'), subW: 520, dim: 0.05 });
    const s = scene;
    this.root.add(iconImg(s, 300 - 60, 178, 'p-crystal', 50));
    this.purse = new GlyphText(s, 300 - 28, 180, String(meta.crystals), S_PURSE, 0);
    this.root.add(this.purse);
    this.build();
    const go = new KitButton(s, 300, 662, { w: 300, h: 72, color: ORANGE, label: t('toMap'), style: S_BTN, sfx: null }, () => this.finish());
    this.root.add(go);
    this.addFocus(go, 300, 662);
    this.fi = this.host.touch ? -1 : this.focus.length - 1;
    this.showFocus();
  }

  private build(): void {
    const s = this.scene, m = this.meta;
    const keepFi = this.fi;
    const go = this.focus.find((f) => f.btn.o.label === t('toMap'));
    this.content.removeAll(true);
    this.focus = [];
    UPGRADE_IDS.forEach((u, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = BASE_X + (col - 0.5) * (UP_W + 8), y = BASE_Y - BASE_H / 2 + 26 + UP_H / 2 + row * (UP_H + 8) + (i === 6 ? 0 : 0);
      const xx = i === 6 ? BASE_X - (UP_W + 8) / 2 : x;
      const c = s.add.container(xx, y);
      c.add(themeCard(s, 0, 0, UP_W, UP_H));
      const L = -UP_W / 2 + 12, T = -UP_H / 2;
      c.add(iconImg(s, L + 44, T + 40, UPGRADE[u].icon, 62));
      c.add(fitWidth(labelAt(s, L + 98, T + 22, t('u_' + u), S_NAME_S, 0), UP_W - 120));
      const r = m.ranks[u];
      const g = s.add.graphics();
      for (let k = 0; k < MAX_RANK; k++) {
        const px = L + 106 + k * 20, py = T + 46;
        g.fillStyle(k < r ? 0x5ae8ff : 0x2a2460, 1).fillCircle(px, py, 7).lineStyle(2, 0x170c3a, 1).strokeCircle(px, py, 7);
      }
      c.add(g);
      const price = nextPrice(m, u);
      c.add(new Para(s, L + 98, T + 64, t(`u_${u}_${price === null ? MAX_RANK : r + 1}`), S_DESC, UP_W - 120, 0, 18));
      if (price === null) {
        c.add(labelAt(s, L + 44, T + UP_H - 26, t('maxed'), S_TAG));
      } else {
        const afford = price <= m.crystals;
        const bx = L + 44, by = T + UP_H - 27;
        const b = new KitButton(s, bx, by, { w: BUY_W, h: BUY_H, color: GREEN, tapWhenOff: true, sfx: null }, () => {
          if (!b.enabled) { this.deny(b, 'poor', 700, BASE_X); return; }
          if (buy(m, u)) {
            this.host.sfx('buy', 0.6);
            this.onBuy(u);
            this.sparkle(xx, y, [0x5ae8ff, 0xffd84a, 0xff8a2a], 30);
            this.toast('bought', 590, 300);
            this.purse.setText(String(m.crystals));
            this.fi = this.focus.findIndex((f) => f.btn === b);
            this.build();
          }
        });
        const coin = iconImg(s, -26, 0, 'p-crystal', 22), num = new GlyphText(s, -12, 1, String(price), S_PRICE, 0);
        b.addContent(coin, num);
        b.setEnabled(afford);
        if (!afford) { coin.setAlpha(0.55); num.setAlpha(0.55); }
        c.add(b);
        this.addFocus(b, xx + bx, y + by);
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
    this.host.sfx('start', 0.5);
    this.close();
    this.onDone();
  }
}

// ------------------------------------------------------------------ beside the pause

/** Added to the Pause scene as it opens: the run's cards on the left, the mission on the right. */
export function pauseSides(scene: Phaser.Scene, cards: CardId[], m: MissionDef | null, stars: number): void {
  const y = 384;
  const root = scene.add.container(0, 0).setDepth(5);
  const lx = 186, rx = 1094, top = y - PSIDE_H / 2;
  root.add(themeCard(scene, lx, y, PSIDE_W, PSIDE_H));
  root.add(labelAt(scene, lx, top + 34, t('yourCards'), P_HEAD));
  if (!cards.length) root.add(new Para(scene, lx, top + 66, t('noCards'), P_NAME, PSIDE_W - 50, 0.5, 21));
  const uniq = [...new Set(cards)];
  const rowH = uniq.length > 11 ? 34 : 42;
  uniq.slice(0, 13).forEach((id, i) => {
    const x = lx - PSIDE_W / 2 + 40, yy = top + 76 + i * rowH;
    const def = CARD[id];
    const g = scene.add.graphics();
    g.fillStyle(RARITY_COLOR[def.rarity].glow, 0.6).fillCircle(x, yy, 16).lineStyle(2, RARITY_COLOR[def.rarity].frame, 1).strokeCircle(x, yy, 16);
    root.add(g);
    root.add(iconImg(scene, x, yy, def.icon, 28));
    root.add(fitWidth(labelAt(scene, x + 26, yy, t('c_' + id), P_NAME, 0), PSIDE_W - 110));
    const n = stacks(cards, id);
    if (n > 1) root.add(labelAt(scene, lx + PSIDE_W / 2 - 22, yy, t('stackN', { n }), S_TAG, 1).setScale(0.8));
  });
  root.add(themeCard(scene, rx, y, PSIDE_W, PSIDE_H));
  root.add(labelAt(scene, rx, top + 34, t('missionCard'), P_HEAD));
  if (m) {
    root.add(iconImg(scene, rx, top + 110, m.planet, 96));
    root.add(fitWidth(labelAt(scene, rx, top + 176, t('m_' + m.n), P_NAME), PSIDE_W - 40));
    root.add(new Para(scene, rx, top + 200, t('o_' + m.n), P_NAME, PSIDE_W - 40, 0.5, 21));
    starLines(m).forEach((line, i) => {
      const yy = top + 380 + i * 40;
      root.add(scene.add.image(rx - PSIDE_W / 2 + 34, yy, i < stars ? STAR_ON : STAR_OFF).setDisplaySize(26, 26));
      root.add(fitWidth(labelAt(scene, rx - PSIDE_W / 2 + 54, yy, line, P_NAME, 0), PSIDE_W - 76));
    });
  }
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
}

export { FOE };
