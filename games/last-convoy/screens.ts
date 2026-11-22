// Last Convoy: the inner screens, in the menu theme (menu.ts): dark riveted steel boards with hazard
// tape, bolted sign-plate buttons, clipboard cards.
//   - The squad (after PLAY): the survivor (locked ones say which mission frees them), the dog, and
//     the mode: CAMPAIGN or LAST STAND. The live 3D squad stands by the convoy on the left.
//   - The town map: the twelve missions over Northdale's four districts, the chosen one's card, and
//     the way to the garage, the power cards and the combos list.
//   - The briefing (objectives, side goal, stars, zombies, the vehicle), Last Stand's too.
//   - The power-card draft (three cards, one reroll), the cards list, the combos list.
//   - The summary after the escape drive (stars, kills, run-overs, armour, scrap, supplies, score).
//   - The garage: ten upgrade tracks, three ranks each, paid with scrap and supplies.
//   - Beside the pause: the run's cards and the mission with its stars.
// Touch: tap. Keyboard: arrows move the focus, Enter presses, number keys pick a card, Esc goes back.
// Everything is painted under the Ayvago intro (`prebakeScreens`): opening a screen only places
// images (and glyph numbers).
import Phaser from 'phaser';
import {
  t, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara, glyphAtlas, themeCard,
  labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, pushModal, upper, type LabelStyle,
} from '@core';
import { HERO, HERO_IDS, MISSIONS, GUN, MELEE, DISTRICTS, RESCUE_MISSIONS, type HeroId, type MissionDef, type Stage } from './defs';
import { CARDS, CARD, UPGRADE, UPGRADE_IDS, MAX_RANK, RARITY_COLOR, RARITIES, stacks, type CardId, type UpgradeId, type Rarity } from './powers';
import { makeArt, iconImg } from './art';
import { modelIcon } from './icons';
import { nextPrice, buy, canBuy, standOpen, type Meta } from './meta';
import { YELLOW, STEEL, GREEN, RED, SIGN, INK, hazard, grime, css } from './paint';
import type { DogKind } from './sim';

export const OVERLAY_DEPTH = 9400;
const ORANGE = YELLOW, GREY = STEEL;

// ------------------------------------------------------------------ sizes

const SQ_W = 640, SQ_H = 620, SQ_X = 920, SQ_Y = 372, TILE_W = 130, TILE_H = 150;
const MAP_W = 560, MAP_H = 560, MAP_X = 310, MAP_Y = 340;
const INFO_W = 620, INFO_H = 560, INFO_X = 945, INFO_Y = 340;
export const BRIEF_W = 820, BRIEF_H = 580;
export const CARD_W = 250, CARD_H = 330;
const DRAFT_W = 960, DRAFT_H = 620;
const GAR_W = 1200, GAR_H = 640, UP_W = 570, UP_H = 96;
const CL_W = 1200, CL_H = 640, CT_W = 370, CT_H = 50;
const CB_W = 1000, CB_H = 600;
export const SUM_W = 620, SUM_H = 540;
export const PSIDE_W = 300, PSIDE_H = 560;

export const SCREEN_CARDS = [{ w: BRIEF_W, h: BRIEF_H }, { w: PSIDE_W, h: PSIDE_H }, { w: SUM_W, h: SUM_H }, { w: CB_W, h: CB_H }];

// ------------------------------------------------------------------ styles (shared with the prebake)

export const S_TITLE: LabelStyle = { size: 44, fill: ['#fff4c8', '#f2c84a', '#e8902a'], stroke: INK, strokeWidth: 7 };
export const S_SUB: LabelStyle = { size: 17, color: '#e0d4c0', stroke: INK, strokeWidth: 3, body: true };
const S_BTN: LabelStyle = { size: 26 };
const S_BTN_S: LabelStyle = { size: 19 };
const S_HEAD: LabelStyle = { size: 32, fill: ['#fff4d8', '#f2c84a'], stroke: INK, strokeWidth: 5 };
const S_NAME: LabelStyle = { size: 24, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_NAME_S: LabelStyle = { size: 18, color: '#ffffff', stroke: INK, strokeWidth: 3 };
const S_DESC: LabelStyle = { size: 16, color: '#e8e0d0', stroke: null, shadow: false, body: true };
const S_DESC_L: LabelStyle = { size: 18, color: '#f0e8d8', stroke: null, shadow: false, body: true };
const S_TAG: LabelStyle = { size: 17, color: '#f2c84a', stroke: INK, strokeWidth: 3 };
const S_LOCK: LabelStyle = { size: 14, color: '#c8bca8', stroke: null, shadow: false, body: true };
const S_STAT: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_GOLD: LabelStyle = { size: 46, fill: ['#fff4c8', '#f2c84a', '#e8902a'], stroke: INK, strokeWidth: 6 };
const S_PURSE: LabelStyle = { size: 28, color: '#f2c84a', stroke: INK, strokeWidth: 5 };
const S_PRICE: LabelStyle = { size: 20, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_TOAST: LabelStyle = { size: 24, color: '#fff2cc', stroke: INK, strokeWidth: 5 };
const S_KEYS: LabelStyle = { size: 14, color: '#b8ac98', stroke: INK, strokeWidth: 3, body: true };
const S_KIND: LabelStyle = { size: 19, color: '#ffb86a', stroke: INK, strokeWidth: 3 };
const S_PIN: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const S_DISTRICT: LabelStyle = { size: 17, color: '#f2e8d0', stroke: INK, strokeWidth: 4 };
const V_CARD: LabelStyle = { size: 22, color: '#ffffff', stroke: INK, strokeWidth: 4 };
const V_CARD_D: LabelStyle = { size: 17, color: '#ece4d4', stroke: null, shadow: false, body: true };
const V_RAR = (r: Rarity): LabelStyle => ({ size: 15, color: RARITY_COLOR[r].ink, stroke: INK, strokeWidth: 3, body: true });
const P_HEAD: LabelStyle = { size: 22, fill: ['#fff4d8', '#f2c84a'], stroke: INK, strokeWidth: 4 };
const P_NAME: LabelStyle = { size: 16, color: '#ffffff', stroke: null, shadow: false, body: true };
const CARD_KEY = (r: Rarity): string => 'lc-card-' + r;
const STAR_KEY = (on: boolean): string => 'lc-i-' + (on ? 'star' : 'star-off');

/** A mission's objective lines (translated). */
export function stageLine(st: Stage): string {
  switch (st.kind) {
    case 'collect': return t('st_collect', { n: st.n ?? 1, item: t('it_' + st.item) });
    case 'rescue': return t('st_rescue', { n: st.n ?? 1 });
    case 'clear': return t('st_clear');
    case 'hold': return t('st_hold_' + st.hold);
    case 'boss': return t('st_boss', { boss: t('b_' + st.boss) });
    case 'return': return t('st_return');
  }
}
export const sideLine = (m: MissionDef): string => t('side_' + m.side, { n: m.sideN });
export const starLines = (m: MissionDef): string[] => [t('star1'), sideLine(m), t('star3')];
const stageIcon = (st: Stage): string => (st.kind === 'collect' ? st.item! : st.kind === 'rescue' ? 'survivor' : st.kind === 'clear' ? 'a-barricade' : st.kind === 'hold' ? 'clock' : st.kind === 'boss' ? 'skull' : 'truck');
const ZKINDS = ['basic', 'runner', 'crawler', 'arm', 'chubby'] as const;
const heroWeapon = (h: HeroId, gun: boolean) => (gun ? HERO[h].gun : HERO[h].melee);
/** The mission (1-based) that frees a survivor in the story, given who the player started as. */
export function freedIn(start: HeroId, h: HeroId): number {
  const order = (['matt', 'sam', 'shaun', 'lis'] as HeroId[]).filter((x) => x !== start);
  return RESCUE_MISSIONS[order.indexOf(h)] ?? 12;
}
const PIN: Record<string, [number, number][]> = {
  // pins in the map's own pixels (540 px square: four districts, a quadrant each)
  main: [[160, 400], [70, 470], [210, 480]],
  docks: [[110, 120], [215, 95], [190, 200]],
  gas: [[360, 420], [470, 480], [455, 352]],
  hill: [[330, 130], [462, 112], [430, 212]],
};

// ------------------------------------------------------------------ the prebake

/** Paints, in the current language, everything the inner screens show (Boot, under the intro). */
export function prebakeScreens(scene: Phaser.Scene): void {
  makeArt(scene);
  for (const [w, h] of [[SQ_W, SQ_H], [MAP_W + 20, MAP_H], [INFO_W, INFO_H], [DRAFT_W, DRAFT_H], [GAR_W, GAR_H], [CL_W, CL_H]]) skinTexture(scene, 'board', w, h);
  for (const c of SCREEN_CARDS) themeCard(scene, 0, 0, c.w, c.h).destroy();
  for (const k of ['squadTitle', 'mapTitle', 'draftTitle', 'garage', 'cardsTitle', 'combosTitle', 'standTitle']) labelTexture(scene, t(k), S_TITLE);
  bakePara(scene, t('squadSub'), S_SUB, 560);
  bakePara(scene, t('draftSub'), S_SUB, 700);
  bakePara(scene, t('garageSub'), S_SUB, 760);
  bakePara(scene, t('cardsSub'), S_SUB, 760);
  bakePara(scene, t('combosSub'), S_SUB, 860);
  bakePara(scene, t('mapSub'), S_SUB, 560);
  for (const [w, h, col, off] of [[300, 64, ORANGE, true], [240, 64, GREY, true], [190, 56, GREY, false], [150, 44, GREY, true], [110, 44, GREEN, true], [230, 56, ORANGE, false], [200, 56, ORANGE, true]] as [number, number, number, boolean][]) bakeButton(scene, 'button', w, h, col, off, true);
  bakeButton(scene, 'plate', TILE_W, TILE_H, GREY, true, true);
  bakeButton(scene, 'plate', CARD_W, CARD_H, GREY);
  bakeButton(scene, 'plate', CT_W, CT_H, GREY, false, true);
  bakeButton(scene, 'round', 56, 56, SIGN, true, true);
  bakeButton(scene, 'round', 56, 56, RED, true, true);
  for (const k of ['campaign', 'lastStand', 'start', 'back', 'combos', 'cards', 'go', 'reroll', 'take', 'buy', 'maxed', 'cont', 'garage', 'dog_shepherd', 'dog_pug']) { labelTexture(scene, t(k), S_BTN); labelTexture(scene, t(k), S_BTN_S); }
  for (const k of ['poor', 'bought', 'standLocked', 'pugLocked', 'locked']) labelTexture(scene, t(k), S_TOAST);
  for (const o of [S_PURSE, S_PRICE, S_STAT, S_GOLD, S_NAME, S_PIN]) glyphAtlas(scene, o);
  // the squad
  for (const h of HERO_IDS) {
    labelTexture(scene, t('h_' + h), S_NAME); labelTexture(scene, t('h_' + h), S_NAME_S); labelTexture(scene, t('h_' + h), P_NAME);
    labelTexture(scene, upper(t('r_' + h)), S_TAG);
    bakePara(scene, t('hd_' + h), S_DESC, 560);
    labelTexture(scene, t('a_' + HERO[h].ability), S_NAME_S);
    bakePara(scene, t('ad_' + HERO[h].ability), S_DESC, 520);
    for (const s of HERO_IDS) if (s !== h) { bakePara(scene, t('lockedHero', { n: freedIn(s, h) }), S_LOCK, TILE_W - 14); labelTexture(scene, t('lockedHero', { n: freedIn(s, h) }), S_TOAST); }
  }
  for (const w of [...Object.keys(GUN), ...Object.keys(MELEE)]) labelTexture(scene, t('w_' + w), S_NAME_S);
  for (const k of ['gun', 'melee', 'ability', 'dog', 'statHp', 'statSpeed', 'statGuns', 'statMelee']) labelTexture(scene, t(k), S_DESC_L);
  // the map, the briefs, the summary
  bake(scene, 'lc-map', MAP_W - 20, MAP_H - 20, paintMap);
  for (const d of DISTRICTS) labelTexture(scene, upper(t('d_' + d)), S_DISTRICT);
  for (let n = 1; n <= MISSIONS.length; n++) labelTexture(scene, String(n), S_PIN);
  for (const m of MISSIONS) {
    labelTexture(scene, t('m_' + m.n), S_HEAD); labelTexture(scene, t('m_' + m.n), P_NAME);
    bakePara(scene, t('o_' + m.n), S_DESC_L, INFO_W - 80);
    bakePara(scene, t('o_' + m.n), S_DESC_L, BRIEF_W - 90);
    bakePara(scene, t('o_' + m.n), P_NAME, PSIDE_W - 40);
    for (const st of m.stages) labelTexture(scene, stageLine(st), S_DESC_L);
    for (const s of starLines(m)) { labelTexture(scene, s, S_DESC_L); labelTexture(scene, s, P_NAME); }
    labelTexture(scene, upper(t('missionN', { n: m.n })) + ' · ' + upper(t('d_' + m.district)), S_KIND);
  }
  for (const k of ['briefStages', 'briefSide', 'briefStars', 'briefZombies']) labelTexture(scene, t(k), P_HEAD);
  for (const z of ZKINDS) { labelTexture(scene, t('z_' + z), P_NAME); }
  for (const v of ['pickup', 'truck', 'sports']) labelTexture(scene, t('v_' + v), P_NAME);
  bakePara(scene, t('standBrief'), S_DESC_L, BRIEF_W - 90);
  labelTexture(scene, t('sumTitle'), S_HEAD);
  for (const k of ['sumKills', 'sumTime', 'sumRun', 'sumArmor', 'sumScrap', 'sumSupplies']) bakeFmt(scene, k, ['n'], S_DESC_L);
  labelTexture(scene, t('sumScore'), P_HEAD);
  for (const h of HERO_IDS) labelTexture(scene, t('sumJoin', { name: t('h_' + h) }), S_TAG);
  labelTexture(scene, t('sumPug'), S_TAG);
  // cards
  prebakeCards(scene);
  // the garage
  for (const u of UPGRADE_IDS) {
    labelTexture(scene, t('u_' + u), S_NAME_S);
    for (let r = 1; r <= MAX_RANK; r++) bakePara(scene, t(`u_${u}_${r}`), S_DESC, UP_W - 290);
    const h = UPGRADE[u].hero;
    if (h) labelTexture(scene, t('heroOnly', { name: t('h_' + h) }), S_LOCK);
  }
  // combos
  for (const k of ['whirl', 'cleave', 'lunge', 'doubleTap', 'burst', 'slug', 'headshot', 'piercer', 'spray', 'buckshot', 'rail', 'rollShot', 'pointBlank']) {
    labelTexture(scene, t('cmb_' + k), S_NAME_S);
    bakePara(scene, t('cmbd_' + k), S_DESC, 300);
  }
  for (const k of ['in_a', 'in_b', 'in_c', 'in_a_key', 'in_b_key', 'in_c_key']) labelTexture(scene, t(k), S_TAG);
  // the pause's side cards
  for (const k of ['yourCards', 'missionCard']) labelTexture(scene, t(k), P_HEAD);
  bakePara(scene, t('noCards'), P_NAME, PSIDE_W - 50);
  labelTexture(scene, t('standTitle'), P_NAME);
}

/** The town map: four districts round the crossing streets, the harbour's water, the hill's green. */
function paintMap(c: CanvasRenderingContext2D): void {
  const W = MAP_W - 20, H = MAP_H - 20;
  c.fillStyle = '#26241f'; c.fillRect(0, 0, W, H);
  const q = [
    { x: 0, y: H / 2, col: '#4a4640' }, // main (south west)
    { x: 0, y: 0, col: '#3a4652' }, // docks (north west)
    { x: W / 2, y: H / 2, col: '#4e4a36' }, // gas (south east)
    { x: W / 2, y: 0, col: '#364a32' }, // hill (north east)
  ];
  for (const d of q) {
    c.fillStyle = d.col; c.fillRect(d.x + 10, d.y + 10, W / 2 - 20, H / 2 - 20);
    // blocks
    const r = rng2(d.x * 3 + d.y + 7);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      c.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.2})`;
      c.fillRect(d.x + 26 + i * 76, d.y + 26 + j * 76, 56, 56);
    }
  }
  // the harbour's water along the top left
  c.fillStyle = '#2a4a6a'; c.fillRect(10, 0, W / 2 - 20, 18);
  // roads
  c.strokeStyle = '#8a8478'; c.lineWidth = 8;
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  c.setLineDash([10, 10]); c.strokeStyle = '#f2c84a'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  c.setLineDash([]);
  // the highway out, to the north
  c.strokeStyle = '#6a6458'; c.lineWidth = 14; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(W / 2 + 40, 0); c.stroke();
  grime(c, W, H, 99, 0.7);
  hazard(c, 0, H - 10, W, 10, 10, 0.8);
  c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
}
function rng2(seed: number): () => number { let s = (seed >>> 0) % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

/** A power card's face: dark steel, a rarity frame, a glowing disc for the picture. */
function paintCard(c: CanvasRenderingContext2D, w: number, h: number, r: Rarity): void {
  const col = RARITY_COLOR[r];
  c.save();
  c.translate(12, 12);
  if (r !== 'common') { c.save(); c.shadowColor = css(col.frame, r === 'legendary' ? 1 : 0.8); c.shadowBlur = r === 'legendary' ? 18 : 10; c.fillStyle = css(col.frame); c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill(); c.restore(); }
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
  c.fillStyle = '#1c1a18'; c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill();
  c.shadowColor = 'transparent';
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a3834'); g.addColorStop(1, '#1c1a18');
  c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill();
  c.save(); c.beginPath(); c.roundRect(0, 0, w, h, 12); c.clip(); grime(c, w, h, w + h * 3 + r.length, 0.9); c.restore();
  c.lineWidth = 5; c.strokeStyle = css(col.frame, 0.95);
  c.beginPath(); c.roundRect(8, 8, w - 16, h - 16, 9); c.stroke();
  const d = c.createRadialGradient(w / 2, 104, 8, w / 2, 104, 56);
  d.addColorStop(0, css(col.glow, 0.85)); d.addColorStop(1, css(col.glow, 0.12));
  c.fillStyle = d; c.beginPath(); c.arc(w / 2, 104, 54, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = css(col.frame); c.stroke();
  if (r === 'legendary') hazard(c, 20, h - 24, w - 40, 8, 8, 0.9);
  c.restore();
}

function prebakeCards(scene: Phaser.Scene): void {
  for (const r of RARITIES) bake(scene, CARD_KEY(r), CARD_W + 24, CARD_H + 24, (c) => paintCard(c, CARD_W, CARD_H, r));
  bake(scene, 'lc-card-glow', CARD_W + 44, CARD_H + 44, (c) => { c.shadowColor = 'rgba(242,200,74,1)'; c.shadowBlur = 18; c.strokeStyle = 'rgba(255,230,150,1)'; c.lineWidth = 6; c.beginPath(); c.roundRect(22, 22, CARD_W, CARD_H, 12); c.stroke(); });
  for (const r of RARITIES) labelTexture(scene, t('r_' + r), V_RAR(r));
  for (const card of CARDS) {
    labelTexture(scene, t('c_' + card.id), V_CARD);
    labelTexture(scene, t('c_' + card.id), P_NAME);
    labelTexture(scene, t('c_' + card.id), S_NAME_S);
    bakePara(scene, t('cd_' + card.id), V_CARD_D, CARD_W - 44);
    bakePara(scene, t('cd_' + card.id), S_DESC_L, CL_W - 200);
  }
  for (let n = 2; n <= 3; n++) labelTexture(scene, t('stackN', { n }), S_TAG);
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

  constructor(protected scene: Phaser.Scene, protected host: ScreenHost, o: { board?: [number, number, number?, number?]; title?: string; titleX?: number; titleY?: number; titleW?: number; sub?: string; subW?: number; dim?: number } = {}) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x060504, o.dim ?? 0.5).setOrigin(0).setInteractive();
    dim.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    this.root.add(dim);
    if (o.board) this.root.add(scene.add.image(o.board[2] ?? width / 2, (o.board[3] ?? height / 2) + SKIN_PAD / 2, skinTexture(scene, 'board', o.board[0], o.board[1])));
    const tx = o.titleX ?? width / 2, ty = o.titleY ?? 64;
    if (o.title) this.root.add(fitWidth(labelAt(scene, tx, ty, o.title, S_TITLE), o.titleW ?? 560));
    if (o.sub) this.root.add(new Para(scene, tx, ty + 30, o.sub, S_SUB, o.subW ?? 560, 0.5, 21));
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
      case 'Escape': this.escape(); return true;
    }
    return false;
  }

  protected escape(): void { /* most screens have a BACK of their own */ }

  say(text: string, y = this.scene.scale.height - 40, x = this.scene.scale.width / 2): void {
    this.toastImg?.destroy();
    this.toastImg = labelAt(this.scene, x, y, text, S_TOAST);
    this.root.add(this.toastImg);
    const img = this.toastImg;
    img.setScale(0.6);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, delay: 1300, duration: 300, onComplete: () => { if (this.toastImg === img) this.toastImg = null; img.destroy(); } });
  }

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
  }

  protected sparkle(x: number, y: number, tint: number[], n = 30): void {
    const em = this.scene.add.particles(x, y, 'lc-spark', {
      speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD, lifespan: { min: 300, max: 800 }, tint, emitting: false,
    });
    this.root.add(em);
    em.explode(n);
    this.scene.time.delayedCall(900, () => em.destroy());
  }

  /** A button with its focus registered. */
  protected button(x: number, y: number, w: number, h: number, color: number, label: string, onTap: () => void, o: { size?: 'L' | 'S'; sfx?: string | null; on?: boolean; tapWhenOff?: boolean } = {}): KitButton {
    const b = new KitButton(this.scene, x, y, { w, h, color, label, style: o.size === 'S' ? S_BTN_S : S_BTN, sfx: o.sfx === undefined ? 'ui-click' : o.sfx, on: o.on, tapWhenOff: o.tapWhenOff }, onTap);
    this.content.add(b);
    this.addFocus(b, x, y);
    return b;
  }
}

/** Three stars (lit or not) in a row centred on x. */
function starRow(s: Phaser.Scene, x: number, y: number, n: number, size: number, gap: number): Phaser.GameObjects.Image[] {
  return [0, 1, 2].map((i) => s.add.image(x + (i - 1) * gap, y, STAR_KEY(i < n)).setDisplaySize(size, size));
}

/** A bar of 1 to 5 pips (the survivors' stats). */
function pips(s: Phaser.Scene, x: number, y: number, n: number, col: number): Phaser.GameObjects.Graphics {
  const g = s.add.graphics();
  for (let i = 0; i < 5; i++) {
    g.fillStyle(i < n ? col : 0x3a3630, 1).fillRect(x + i * 24, y - 6, 20, 12);
    g.lineStyle(2, 0x14100c, 1).strokeRect(x + i * 24, y - 6, 20, 12);
  }
  return g;
}

// ------------------------------------------------------------------ the squad

export class SquadScreen extends Panel {
  private sel: HeroId;
  private tiles = new Map<HeroId, KitButton>();
  private detail: Phaser.GameObjects.Container;
  private dogBtns: KitButton[] = [];

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onHero: (h: HeroId) => void, private onDog: (d: DogKind) => void, private onCampaign: () => void, private onStand: () => void) {
    super(scene, host, { board: [SQ_W, SQ_H, SQ_X, SQ_Y], title: t('squadTitle'), titleX: SQ_X, titleY: 100, titleW: SQ_W - 80, sub: t('squadSub'), subW: 560, dim: 0.05 });
    this.sel = meta.hero;
    const start = meta.heroes[0];
    HERO_IDS.forEach((h, i) => {
      const x = SQ_X - 225 + i * 150, y = 228;
      const open = meta.heroes.includes(h);
      const b = new KitButton(scene, x, y, { w: TILE_W, h: TILE_H, kind: 'plate', color: GREY, sfx: null, on: h === this.sel, tapWhenOff: true }, () => {
        if (!open) { this.denyText(b, t('lockedHero', { n: freedIn(start, h) })); return; }
        this.pick(h);
      });
      const icon = modelIcon(scene, 0, -18, 'hero-' + h, 104);
      if (!open) icon.setTint(0x403a34);
      b.addContent(icon);
      if (open) b.addContent(fitWidth(labelAt(scene, 0, 50, t('h_' + h), S_NAME_S), TILE_W - 14));
      else { b.addContent(iconImg(scene, 0, -24, 'lock', 46)); b.addContent(new Para(scene, 0, 36, t('lockedHero', { n: freedIn(start, h) }), S_LOCK, TILE_W - 14, 0.5, 15)); }
      b.setEnabled(open);
      this.content.add(b);
      this.addFocus(b, x, y);
      this.tiles.set(h, b);
    });
    this.detail = scene.add.container(0, 0);
    this.content.add(this.detail);
    // the dog
    const dy = 574;
    this.content.add(labelAt(scene, SQ_X - 290, dy, t('dog'), S_DESC_L, 0));
    (['shepherd', 'pug'] as DogKind[]).forEach((d, i) => {
      const x = SQ_X - 120 + i * 170;
      const open = d === 'shepherd' || meta.pug;
      const b = new KitButton(scene, x, dy, { w: 150, h: 44, color: GREY, label: t('dog_' + d), style: S_BTN_S, on: meta.dog === d, tapWhenOff: true }, () => {
        if (!open) { this.denyText(b, t('pugLocked')); return; }
        this.meta.dog = d;
        for (const [k, q] of this.dogBtns.entries()) q.setSelected(k === i);
        this.onDog(d);
        this.host.sfx('pick', 0.4);
      });
      b.setEnabled(open);
      this.content.add(b);
      this.addFocus(b, x, dy);
      this.dogBtns.push(b);
    });
    // the modes
    const by = 638;
    this.button(SQ_X - 140, by, 300, 64, ORANGE, t('campaign'), () => { this.close(); this.onCampaign(); }, { sfx: 'start' });
    const stand = this.button(SQ_X + 160, by, 240, 64, GREY, t('lastStand'), () => {
      if (!standOpen(this.meta)) { this.denyText(stand, t('standLocked')); return; }
      this.close(); this.onStand();
    }, { tapWhenOff: true, sfx: 'start' });
    stand.setEnabled(standOpen(meta));
    this.fi = this.focus.length - 2;
    this.showFocus();
    this.drawDetail();
  }

  private pick(h: HeroId): void {
    this.sel = h;
    for (const [k, b] of this.tiles) b.setSelected(k === h);
    this.drawDetail();
    this.onHero(h);
    this.host.sfx('pick', 0.45);
  }

  private drawDetail(): void {
    const s = this.scene, h = this.sel, H = HERO[h], d = this.detail;
    d.removeAll(true);
    const x0 = SQ_X - 290, y0 = 330;
    d.add(labelAt(s, x0, y0, t('h_' + h), S_NAME, 0));
    d.add(labelAt(s, x0 + 110, y0 + 2, upper(t('r_' + h)), S_TAG, 0));
    d.add(new Para(s, x0, y0 + 22, t('hd_' + h), S_DESC, 560, 0, 20));
    // gun, melee, ability with the weapon models' icons
    const ry = y0 + 82;
    d.add(modelIcon(s, x0 + 24, ry, 'w-' + H.gun, 52));
    d.add(labelAt(s, x0 + 54, ry, t('w_' + H.gun), S_NAME_S, 0));
    d.add(modelIcon(s, x0 + 24, ry + 48, 'w-' + H.melee, 52));
    d.add(labelAt(s, x0 + 54, ry + 48, t('w_' + H.melee), S_NAME_S, 0));
    d.add(iconImg(s, x0 + 24, ry + 98, 'a-' + H.ability, 40));
    d.add(labelAt(s, x0 + 54, ry + 92, t('a_' + H.ability), S_NAME_S, 0));
    d.add(new Para(s, x0 + 54, ry + 102, t('ad_' + H.ability), S_DESC, 520, 0, 18));
    // stat pips on the right
    const sx = SQ_X + 120;
    ['statHp', 'statSpeed', 'statGuns', 'statMelee'].forEach((k, i) => {
      d.add(labelAt(s, sx, ry - 4 + i * 30, t(k), S_DESC_L, 0));
      d.add(pips(s, sx + 84, ry - 4 + i * 30, H.pips[i], H.color));
    });
  }
}

// ------------------------------------------------------------------ the town map

export class MapScreen extends Panel {
  private sel: number;
  private info: Phaser.GameObjects.Container;
  private pins: KitButton[] = [];

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, sel: number, private onSel: (i: number) => void, private onStart: (i: number) => void, private nav: { garage: () => void; cards: () => void; combos: () => void; back: () => void }) {
    super(scene, host, { dim: 0.3 });
    this.sel = sel;
    const s = scene;
    this.root.addAt(s.add.image(MAP_X, MAP_Y + SKIN_PAD / 2, skinTexture(s, 'board', MAP_W + 20, MAP_H)), 1);
    this.root.addAt(s.add.image(INFO_X, INFO_Y + SKIN_PAD / 2, skinTexture(s, 'board', INFO_W, INFO_H)), 2);
    const mx = MAP_X - (MAP_W - 20) / 2, my = MAP_Y - (MAP_H - 20) / 2 + 8;
    this.content.add(s.add.image(MAP_X, MAP_Y + 8, 'lc-map'));
    const dpos: Record<string, [number, number]> = { main: [135, 300], docks: [135, 40], gas: [405, 300], hill: [405, 40] };
    for (const d of DISTRICTS) this.content.add(labelAt(s, mx + dpos[d][0], my + dpos[d][1], upper(t('d_' + d)), S_DISTRICT));
    for (const m of MISSIONS) {
      const k = MISSIONS.filter((q) => q.district === m.district).indexOf(m);
      const [px, py] = PIN[m.district][k];
      const x = mx + px, y = my + py;
      const open = m.n <= meta.unlocked;
      const boss = m.stages.some((st) => st.kind === 'boss');
      const b = new KitButton(s, x, y, { w: 56, h: 56, kind: 'round', color: boss ? RED : SIGN, sfx: null, on: m.n - 1 === sel, tapWhenOff: true }, () => {
        if (!open) { this.denyText(b, t('locked'), undefined, MAP_X); return; }
        this.pick(m.n - 1);
      });
      b.addContent(labelAt(s, 0, 0, String(m.n), S_PIN));
      if (!open) b.addContent(iconImg(s, 16, 16, 'lock', 24));
      const st = meta.stars[m.n - 1];
      if (st) for (let i = 0; i < 3; i++) b.addContent(s.add.image((i - 1) * 15, 32, STAR_KEY(i < st)).setDisplaySize(16, 16));
      b.setEnabled(open);
      this.content.add(b);
      this.addFocus(b, x, y);
      this.pins.push(b);
    }
    this.info = s.add.container(0, 0);
    this.content.add(this.info);
    // the navigation row
    const ny = 670;
    this.button(150, ny, 190, 56, GREY, t('back'), () => { this.close(); this.nav.back(); }, { size: 'S' });
    this.button(360, ny, 190, 56, GREY, t('garage'), () => { this.close(); this.nav.garage(); }, { size: 'S' });
    this.button(570, ny, 190, 56, GREY, t('cards'), () => { this.close(); this.nav.cards(); }, { size: 'S' });
    this.button(780, ny, 190, 56, GREY, t('combos'), () => { this.close(); this.nav.combos(); }, { size: 'S' });
    this.fi = sel;
    this.showFocus();
    this.drawInfo();
  }

  private pick(i: number): void {
    this.sel = i;
    this.pins.forEach((p, k) => p.setSelected(k === i));
    this.onSel(i);
    this.drawInfo();
    this.host.sfx('pick', 0.4);
  }

  private drawInfo(): void {
    const s = this.scene, m = MISSIONS[this.sel], g = this.info;
    g.removeAll(true);
    const x0 = INFO_X - INFO_W / 2 + 40, top = INFO_Y - INFO_H / 2;
    g.add(labelAt(s, x0, top + 46, upper(t('missionN', { n: m.n })) + ' · ' + upper(t('d_' + m.district)), S_KIND, 0));
    g.add(fitWidth(labelAt(s, x0, top + 88, t('m_' + m.n), S_HEAD, 0), INFO_W - 80));
    g.add(new Para(s, x0, top + 118, t('o_' + m.n), S_DESC_L, INFO_W - 80, 0, 23));
    let y = top + 250;
    for (const st of m.stages) {
      g.add(iconImg(s, x0 + 14, y, stageIcon(st), 30));
      g.add(fitWidth(labelAt(s, x0 + 38, y, stageLine(st), S_DESC_L, 0), INFO_W - 120));
      y += 34;
    }
    y += 10;
    starLines(m).forEach((line, i) => {
      g.add(s.add.image(x0 + 14, y + i * 32, STAR_KEY(i < this.meta.stars[m.n - 1])).setDisplaySize(26, 26));
      g.add(fitWidth(labelAt(s, x0 + 38, y + i * 32, line, S_DESC_L, 0), INFO_W - 120));
    });
    g.add(modelIcon(s, INFO_X + INFO_W / 2 - 90, top + 300, 'v-' + m.vehicle, 110));
    const b = new KitButton(s, INFO_X + INFO_W / 2 - 150, INFO_Y + INFO_H / 2 - 50, { w: 230, h: 56, color: ORANGE, label: t('start'), style: S_BTN, sfx: 'start' }, () => { this.close(); this.onStart(this.sel); });
    g.add(b);
    this.focus = this.focus.filter((f) => f.btn.active && f.btn.scene);
    this.focus.push({ btn: b, x: b.x, y: b.y });
  }

  protected escape(): void { this.close(); this.nav.back(); }
}

// ------------------------------------------------------------------ the briefing

export class BriefScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, def: MissionDef | null, stars: number, onStart: () => void, onBack: () => void) {
    super(scene, host, { dim: 0.35 });
    const s = scene, W = s.scale.width, H = s.scale.height;
    const cx = W / 2, cy = H / 2 - 4;
    this.content.add(themeCard(s, cx, cy, BRIEF_W, BRIEF_H));
    const x0 = cx - BRIEF_W / 2 + 46, top = cy - BRIEF_H / 2;
    if (!def) {
      this.content.add(labelAt(s, cx, top + 60, t('standTitle'), S_HEAD));
      this.content.add(new Para(s, x0, top + 110, t('standBrief'), S_DESC_L, BRIEF_W - 90, 0, 25));
      this.content.add(modelIcon(s, cx, top + 300, 'v-truck', 160));
      ZKINDS.forEach((z, i) => this.content.add(modelIcon(s, cx - 220 + i * 110, top + 420, 'z-' + z, 80)));
    } else {
      this.content.add(labelAt(s, x0, top + 40, upper(t('missionN', { n: def.n })) + ' · ' + upper(t('d_' + def.district)), S_KIND, 0));
      this.content.add(fitWidth(labelAt(s, x0, top + 80, t('m_' + def.n), S_HEAD, 0), BRIEF_W - 100));
      this.content.add(new Para(s, x0, top + 108, t('o_' + def.n), S_DESC_L, BRIEF_W - 90, 0, 23));
      let y = top + 200;
      this.content.add(labelAt(s, x0, y, t('briefStages'), P_HEAD, 0));
      y += 34;
      for (const st of def.stages) {
        this.content.add(iconImg(s, x0 + 14, y, stageIcon(st), 30));
        this.content.add(fitWidth(labelAt(s, x0 + 38, y, stageLine(st), S_DESC_L, 0), 420));
        y += 32;
      }
      y += 8;
      this.content.add(labelAt(s, x0, y, t('briefStars'), P_HEAD, 0));
      y += 32;
      starLines(def).forEach((line, i) => {
        this.content.add(s.add.image(x0 + 14, y + i * 30, STAR_KEY(i < stars)).setDisplaySize(24, 24));
        this.content.add(fitWidth(labelAt(s, x0 + 38, y + i * 30, line, S_DESC_L, 0), 420));
      });
      // the zombies of this mission and the vehicle
      const rx = cx + 170;
      this.content.add(labelAt(s, rx, top + 200, t('briefZombies'), P_HEAD));
      const kinds = ZKINDS.filter((_, i) => def.mix[i] > 0);
      kinds.forEach((z, i) => {
        const zx = rx - 90 + (i % 3) * 90, zy = top + 262 + Math.floor(i / 3) * 96;
        this.content.add(modelIcon(s, zx, zy, 'z-' + z, 70));
        this.content.add(fitWidth(labelAt(s, zx, zy + 40, t('z_' + z), P_NAME), 86));
      });
      this.content.add(modelIcon(s, rx, top + 470, 'v-' + def.vehicle, 96));
      this.content.add(labelAt(s, rx, top + 512, t('v_' + def.vehicle), P_NAME));
    }
    const by = cy + BRIEF_H / 2 + 6;
    this.button(cx - 130, by, 190, 56, GREY, t('back'), () => { this.close(); onBack(); }, { size: 'S' });
    this.button(cx + 110, by, 230, 56, ORANGE, t('go'), () => { this.close(); onStart(); }, { sfx: 'start' });
    this.fi = 1;
    this.showFocus();
    this.escape = () => { this.close(); onBack(); };
  }
}

// ------------------------------------------------------------------ the draft

export class DraftScreen extends Panel {
  private cards: Phaser.GameObjects.Container[] = [];
  private rerolled = false;
  private offer: CardId[];

  constructor(scene: Phaser.Scene, host: ScreenHost, private have: CardId[], offer: CardId[], private deal: () => CardId[], private onPick: (id: CardId) => void) {
    super(scene, host, { board: [DRAFT_W, DRAFT_H], title: t('draftTitle'), titleY: 74, sub: t('draftSub'), subW: 700, dim: 0.6 });
    this.offer = offer;
    this.layout();
    const rr = this.button(scene.scale.width / 2, 640, 200, 56, ORANGE, t('reroll'), () => {
      if (this.rerolled) return;
      this.rerolled = true;
      rr.setEnabled(false);
      this.offer = this.deal();
      this.layout();
      this.host.sfx('deal', 0.5);
    }, { sfx: null });
  }

  private layout(): void {
    const s = this.scene, W = s.scale.width;
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.focus = this.focus.filter((f) => !(f.btn.getData('card') as boolean));
    this.offer.forEach((id, i) => {
      const def = CARD[id];
      const x = W / 2 + (i - (this.offer.length - 1) / 2) * 290, y = 355;
      const b = new KitButton(s, x, y, { w: CARD_W, h: CARD_H, kind: 'plate', color: GREY, sfx: null }, () => this.take(id, b));
      b.setData('card', true);
      b.addContent(s.add.image(0, SKIN_PAD / 2 - SKIN_PAD / 2, CARD_KEY(def.rarity)));
      b.addContent(iconImg(s, 0, -CARD_H / 2 + 104, def.icon, 80));
      b.addContent(fitWidth(labelAt(s, 0, -CARD_H / 2 + 34, t('r_' + def.rarity), V_RAR(def.rarity)), CARD_W - 40));
      b.addContent(fitWidth(labelAt(s, 0, 20, t('c_' + id), V_CARD), CARD_W - 30));
      b.addContent(new Para(s, 0, 44, t('cd_' + id), V_CARD_D, CARD_W - 44, 0.5, 20));
      const n = stacks(this.have, id);
      if (n > 0) b.addContent(labelAt(s, CARD_W / 2 - 30, -CARD_H / 2 + 34, t('stackN', { n: n + 1 }), S_TAG));
      b.setScale(0.6).setAlpha(0);
      s.tweens.add({ targets: b, scale: 1, alpha: 1, duration: 260, delay: i * 90, ease: 'Back.easeOut', onStart: () => this.host.sfx('card', 0.4) });
      this.content.add(b);
      this.addFocus(b, x, y);
      this.cards.push(b);
    });
    this.fi = 0;
    this.showFocus();
  }

  private take(id: CardId, b: KitButton): void {
    if (this.closed) return;
    this.host.sfx('pick', 0.6);
    this.sparkle(b.x, b.y, [0xf2c84a, 0xffffff, RARITY_COLOR[CARD[id].rarity].frame], 40);
    this.scene.tweens.add({ targets: b, scale: 1.12, duration: 160, yoyo: true });
    this.scene.time.delayedCall(320, () => { this.close(); this.onPick(id); });
  }

  key(code: string): boolean {
    const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
    if (n >= 0 && this.offer[n]) { this.take(this.offer[n], this.cards[n] as KitButton); return true; }
    if (code === 'Escape') return true;
    return super.key(code);
  }
}

// ------------------------------------------------------------------ the summary

export interface Summary { n: number; stars: boolean[]; kills: number; time: number; runover: number; armor: number; scrap: number; supplies: number; score: number; join?: HeroId; pug?: boolean }

export class SummaryScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, o: Summary, onDone: () => void) {
    super(scene, host, { dim: 0.5 });
    const s = scene, W = s.scale.width, H = s.scale.height;
    const cx = W / 2, cy = H / 2 - 10;
    this.content.add(themeCard(s, cx, cy, SUM_W, SUM_H));
    const top = cy - SUM_H / 2;
    this.content.add(labelAt(s, cx, top + 50, t('sumTitle'), S_HEAD));
    this.content.add(fitWidth(labelAt(s, cx, top + 88, t('m_' + o.n), P_NAME), SUM_W - 80));
    const stars = starRow(s, cx, top + 150, 0, 70, 84);
    stars.forEach((img, i) => {
      img.setTexture(STAR_KEY(o.stars[i])).setScale(0);
      this.content.add(img);
      s.tweens.add({ targets: img, scale: 70 / 64, duration: 300, delay: 250 + i * 260, ease: 'Back.easeOut', onStart: () => { if (o.stars[i]) { this.host.sfx('star', 0.5); this.sparkle(img.x, img.y, [0xf2c84a, 0xffffff], 18); } } });
    });
    const lines: [string, number][] = [['sumKills', o.kills], ['sumTime', Math.round(o.time)], ['sumRun', o.runover], ['sumArmor', Math.round(o.armor * 100)], ['sumScrap', o.scrap], ['sumSupplies', o.supplies]];
    lines.forEach(([k, n], i) => {
      const x = cx + (i % 2 ? 40 : -230), y = top + 222 + Math.floor(i / 2) * 36;
      this.content.add(new FmtLine(s, x, y, S_DESC_L, 0).set(k, { n }));
    });
    this.content.add(labelAt(s, cx, top + 350, t('sumScore'), P_HEAD));
    const score = new GlyphText(s, cx, top + 396, '0', S_GOLD, 0.5);
    this.content.add(score);
    const c = { v: 0 };
    s.tweens.add({ targets: c, v: o.score, duration: 900, delay: 900, ease: 'Cubic.easeOut', onUpdate: () => score.setText(String(Math.round(c.v))) });
    if (o.join) this.content.add(labelAt(s, cx, top + 446, t('sumJoin', { name: t('h_' + o.join) }), S_TAG));
    else if (o.pug) this.content.add(labelAt(s, cx, top + 446, t('sumPug'), S_TAG));
    this.button(cx, cy + SUM_H / 2 + 4, 230, 56, ORANGE, t('cont'), () => { this.close(); onDone(); }, { sfx: 'ui-click' });
    this.fi = 0;
    this.showFocus();
    void H;
  }
}

// ------------------------------------------------------------------ the garage

export class GarageScreen extends Panel {
  private purse!: { scrap: GlyphText; sup: GlyphText };
  private tiles = new Map<UpgradeId, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, host: ScreenHost, private meta: Meta, private onBuy: (u: UpgradeId) => void, onBack: () => void) {
    super(scene, host, { board: [GAR_W, GAR_H], title: t('garage'), titleY: 62, sub: t('garageSub'), subW: 760, dim: 0.55 });
    const s = scene, W = s.scale.width;
    // the purse
    const px = W / 2 + GAR_W / 2 - 250, py = 62;
    this.content.add(iconImg(s, px, py, 'scrap', 40));
    this.content.add(iconImg(s, px + 130, py, 'supplies', 40));
    this.purse = { scrap: new GlyphText(s, px + 26, py, String(meta.scrap), S_PURSE, 0), sup: new GlyphText(s, px + 156, py, String(meta.supplies), S_PURSE, 0) };
    this.content.add([this.purse.scrap, this.purse.sup]);
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    this.button(W / 2, 668, 190, 56, GREY, t('back'), () => { this.close(); onBack(); }, { size: 'S' });
    this.escape = () => { this.close(); onBack(); };
    this.fi = 0;
    this.showFocus();
  }

  private tile(u: UpgradeId, i: number): void {
    const s = this.scene, W = s.scale.width;
    const x = W / 2 + (i % 2 ? 300 : -300), y = 150 + Math.floor(i / 2) * 102;
    this.tiles.get(u)?.destroy();
    const c = s.add.container(x, y);
    const r = this.meta.ranks[u], def = UPGRADE[u];
    const g = s.add.graphics();
    g.fillStyle(0x14120f, 0.6).fillRoundedRect(-UP_W / 2, -UP_H / 2, UP_W, UP_H, 8).lineStyle(2, YELLOW, 0.3).strokeRoundedRect(-UP_W / 2, -UP_H / 2, UP_W, UP_H, 8);
    c.add(g);
    c.add(iconImg(s, -UP_W / 2 + 40, 0, def.icon, 56));
    c.add(labelAt(s, -UP_W / 2 + 78, -26, t('u_' + u), S_NAME_S, 0));
    if (def.hero) c.add(labelAt(s, -UP_W / 2 + 78, -8, t('heroOnly', { name: t('h_' + def.hero) }), S_LOCK, 0));
    const pg = s.add.graphics();
    for (let k = 0; k < MAX_RANK; k++) { pg.fillStyle(k < r ? YELLOW : 0x3a3630, 1).fillRect(-UP_W / 2 + 80 + k * 26, 14, 20, 12); pg.lineStyle(2, 0x14100c, 1).strokeRect(-UP_W / 2 + 80 + k * 26, 14, 20, 12); }
    c.add(pg);
    const showRank = Math.min(MAX_RANK, r + 1);
    c.add(new Para(s, -UP_W / 2 + 180, -32, t(`u_${u}_${showRank}`), S_DESC, UP_W - 290, 0, 18).setAlpha(r >= MAX_RANK ? 0.6 : 1));
    const price = nextPrice(this.meta, u);
    const bx = UP_W / 2 - 62;
    if (!price) c.add(labelAt(s, bx, 0, t('maxed'), S_TAG));
    else {
      c.add(iconImg(s, bx - 44, -30, 'scrap', 20));
      c.add(new GlyphText(s, bx - 32, -30, String(price[0]), S_PRICE, 0));
      if (price[1]) { c.add(iconImg(s, bx + 20, -30, 'supplies', 20)); c.add(new GlyphText(s, bx + 32, -30, String(price[1]), S_PRICE, 0)); }
      const b = new KitButton(s, bx, 14, { w: 110, h: 44, color: GREEN, label: t('buy'), style: S_BTN_S, sfx: null, tapWhenOff: true }, () => {
        if (!buy(this.meta, u)) { this.denyText(b, t('poor')); return; }
        this.host.sfx('buy', 0.6);
        this.sparkle(x + bx, y, [0xf2c84a, 0xffffff], 26);
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
    this.purse.scrap.setText(String(this.meta.scrap));
    this.purse.sup.setText(String(this.meta.supplies));
    const keep = this.focus.filter((f) => !UPGRADE_IDS.some((u) => this.tiles.get(u)?.list.includes(f.btn)));
    this.focus = keep;
    UPGRADE_IDS.forEach((u, i) => this.tile(u, i));
    this.showFocus();
  }
}

// ------------------------------------------------------------------ the cards list

export class CardsScreen extends Panel {
  private desc: Para | null = null;

  constructor(scene: Phaser.Scene, host: ScreenHost, have: CardId[], onBack: () => void) {
    super(scene, host, { board: [CL_W, CL_H], title: t('cardsTitle'), titleY: 62, sub: t('cardsSub'), subW: 760, dim: 0.55 });
    const s = scene, W = s.scale.width;
    CARDS.forEach((card, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = W / 2 + (col - 1) * 385, y = 140 + row * 52;
      const n = stacks(have, card.id);
      const b = new KitButton(s, x, y, { w: CT_W, h: CT_H, kind: 'plate', color: GREY, sfx: null, on: n > 0 }, () => {
        this.desc?.destroy();
        this.desc = new Para(s, W / 2 - (CL_W - 200) / 2, 610, t('cd_' + card.id), S_DESC_L, CL_W - 200, 0, 22);
        this.content.add(this.desc);
        this.host.sfx('move', 0.3);
      });
      const g = s.add.graphics();
      g.fillStyle(RARITY_COLOR[card.rarity].frame, 1).fillRect(-CT_W / 2 + 6, -CT_H / 2 + 6, 6, CT_H - 12);
      b.addContent(g);
      b.addContent(iconImg(s, -CT_W / 2 + 34, 0, card.icon, 34));
      b.addContent(fitWidth(labelAt(s, -CT_W / 2 + 58, 0, t('c_' + card.id), S_NAME_S, 0), CT_W - 120));
      if (n > 0) b.addContent(labelAt(s, CT_W / 2 - 30, 0, t('stackN', { n }), S_TAG));
      else b.setAlpha(0.72);
      this.content.add(b);
      this.addFocus(b, x, y);
    });
    this.button(W / 2 + CL_W / 2 - 130, 668, 190, 56, GREY, t('back'), () => { this.close(); onBack(); }, { size: 'S' });
    this.escape = () => { this.close(); onBack(); };
    this.fi = 0;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ the combos list

export class CombosScreen extends Panel {
  constructor(scene: Phaser.Scene, host: ScreenHost, hero: HeroId, onBack: () => void) {
    super(scene, host, { dim: 0.55 });
    const s = scene, W = s.scale.width, H = s.scale.height;
    const cx = W / 2, cy = H / 2 - 10;
    this.content.add(themeCard(s, cx, cy, CB_W, CB_H));
    const top = cy - CB_H / 2;
    this.content.add(labelAt(s, cx, top + 46, t('combosTitle'), S_HEAD));
    this.content.add(new Para(s, cx, top + 72, t('combosSub'), S_SUB, 860, 0.5, 21));
    const fin = { pistol: ['doubleTap', 'piercer', 'rollShot'], smg: ['burst', 'spray', 'rollShot'], shotgun: ['slug', 'buckshot', 'pointBlank'], rifle: ['headshot', 'rail', 'rollShot'] } as Record<string, string[]>;
    [true, false].forEach((gun, col) => {
      const x0 = cx - CB_W / 2 + 50 + col * (CB_W / 2);
      const w = heroWeapon(hero, gun);
      this.content.add(modelIcon(s, x0 + 36, top + 140, 'w-' + w, 64));
      this.content.add(labelAt(s, x0 + 76, top + 140, t('w_' + w), S_NAME, 0));
      const names = gun ? fin[w] : ['whirl', 'cleave', 'lunge'];
      ['a', 'b', 'c'].forEach((k, i) => {
        const y = top + 210 + i * 112;
        this.content.add(labelAt(s, x0, y, t('cmb_' + names[i]), S_NAME_S, 0));
        this.content.add(labelAt(s, x0, y + 26, t(host.touch ? 'in_' + k : 'in_' + k + '_key'), S_TAG, 0));
        this.content.add(new Para(s, x0, y + 40, t('cmbd_' + names[i]), S_DESC, 300, 0, 18));
      });
    });
    this.button(cx, cy + CB_H / 2 + 4, 190, 56, GREY, t('back'), () => { this.close(); onBack(); }, { size: 'S' });
    this.escape = () => { this.close(); onBack(); };
    this.fi = 0;
    this.showFocus();
  }
}

// ------------------------------------------------------------------ beside the pause

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
    g.fillStyle(RARITY_COLOR[def.rarity].glow, 0.7).fillCircle(x, yy, 16).lineStyle(2, RARITY_COLOR[def.rarity].frame, 1).strokeCircle(x, yy, 16);
    root.add(g);
    root.add(iconImg(scene, x, yy, def.icon, 26));
    root.add(fitWidth(labelAt(scene, x + 26, yy, t('c_' + id), P_NAME, 0), PSIDE_W - 110));
    const n = stacks(cards, id);
    if (n > 1) root.add(labelAt(scene, lx + PSIDE_W / 2 - 22, yy, t('stackN', { n }), S_TAG, 1).setScale(0.8));
  });
  root.add(themeCard(scene, rx, y, PSIDE_W, PSIDE_H));
  root.add(labelAt(scene, rx, top + 34, t('missionCard'), P_HEAD));
  if (m) {
    root.add(modelIcon(scene, rx, top + 110, 'v-' + m.vehicle, 110));
    root.add(fitWidth(labelAt(scene, rx, top + 176, t('m_' + m.n), P_NAME), PSIDE_W - 40));
    root.add(new Para(scene, rx, top + 200, t('o_' + m.n), P_NAME, PSIDE_W - 40, 0.5, 20));
    starLines(m).forEach((line, i) => {
      const yy = top + 410 + i * 40;
      root.add(scene.add.image(rx - PSIDE_W / 2 + 34, yy, STAR_KEY(i < stars)).setDisplaySize(26, 26));
      root.add(fitWidth(labelAt(scene, rx - PSIDE_W / 2 + 54, yy, line, P_NAME, 0), PSIDE_W - 76));
    });
  } else {
    root.add(modelIcon(scene, rx, top + 130, 'v-truck', 130));
    root.add(labelAt(scene, rx, top + 210, t('standTitle'), P_NAME));
  }
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 160 });
}

export { MISSIONS };
