// Skull Isle: the overlays between islands, drawn over the frozen beach inside the Play scene.
//   - The dock shop: the island's loot buys levels of seven crew upgrades and a patch-up (CREW
//     tab), and of six ship upgrades and the shipwright's repair (SHIP tab); SET SAIL goes on.
//   - The boon draft (after a boss): a free pick of one of three lasting boons.
//   - The sea chart: two routes to the next island (calm waters or a stormy passage).
// Touch: tap a tile or a tab. Keyboard: arrows to pick, Enter to buy or sail, Tab to switch tabs
// (1/2/3 in the draft, 1/2 on the chart).
// They wear the menu theme (menu.ts): the shop a weathered plank notice board with its wares on
// burnt parchment notes, plank buttons (SET SAIL in the red of the flag), the boons on parchment,
// the chart's words in Pirata One. Everything they show, the sea charts too, is painted under the
// Ayvago intro (`prebakeIsleScreens`, from main.ts): opening one between islands only places images.
import Phaser from 'phaser';
import {
  t, getLang, labelTexture, skinTexture, SKIN_PAD, menuTheme, bake, bakeButton, bakeFmt, bakePara, glyphAtlas,
  labelAt, fitWidth, wrapLines, GlyphText, FmtLine, Para, KitButton, type LabelStyle,
} from '@core';
import type { Sim } from './sim';
import { SHOP_IDS, SHOP_COST, PATCH, SHIP_IDS, SHIP_COST, shipStats, REPAIR, BOON_IDS, type ShopId, type ShipId, type BoonId } from './upgrades';
import { shopArt, boonArt, shipArt, routeArt, GOLD, SHIP } from './art';
import { BOON_SYM } from './art';
import { chartTexture, compassRose, rhumbLines, inkIsland, serpent, shipDoodle, stormDoodle, waves, xMark, scrollBanner, dashedPath, INK, INK_N, RED_INK, BLUE_INK } from './chart';
import { ISLAND_IDS, ROUTES, type Route } from './defs';

export const OVERLAY_DEPTH = 9600;

/** One decimal, with the locale's separator (6,2 in Turkish). */
const dec = (v: number): string => (getLang() === 'tr' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));

type Item = ShopId | 'patch' | ShipId | 'repair' | 'sail' | 'tabCrew' | 'tabShip';
type Tab = 'crew' | 'ship';
const isShip = (id: Item): id is ShipId => (SHIP_IDS as string[]).includes(id);

// ------------------------------------------------------------------ painted pieces

const WOOD = 0x8a5a2e, FLAG_RED = 0x8e1c22, SEA_BLUE = 0x2f6a8e;
// 1.3: landscape (1280 × 720). The shop's board fills the screen but a margin: a left column with the
// title, the purse, the two tabs stacked like bookmarks and SET SAIL, the wares on notes in two
// columns on the right. The draft's three boons stand side by side; the sea chart's map is on the
// left, its two routes' cards on the right.
const PANEL_W = 1236, PANEL_H = 690, TILE_W = 380, TILE_H = 150;
/** The shop's left column (centre, width) and the wares' column (centre). */
const SIDE_X = 228, SIDE_W = 340, WARES_X = 846;
const TAB_W = 300, TAB_H = 64, SAIL_W = 320, SAIL_H = 92, PLATE_W = 240;
const DRAFT_W = 360, DRAFT_H = 400;
/** The draft's description width and the sea chart's cards (right column). */
const DRAFT_TEXT = 300;
const ROUTE_X = 950, ROUTE_W = 540, ROUTE_H = 220, ROUTE_TEXT = 350;

// the styles (shared with the prebake, so the painted keys match)
const GOLD_HEAD: LabelStyle = { size: 60, fill: ['#fff7c8', '#ffd23f', '#c07a10'], stroke: '#2a1206', strokeWidth: 9 };
const CREAM: LabelStyle = { size: 21, color: '#f3e3c0', stroke: '#2a1206', strokeWidth: 4, body: true };
const PURSE: LabelStyle = { size: 32, color: '#ffe68a', stroke: '#2a1206', strokeWidth: 5 };
const TAB: LabelStyle = { size: 34 };
const T_NAME: LabelStyle = { size: 26, color: INK, stroke: null, shadow: false };
const T_DESC: LabelStyle = { size: 18, color: '#5a3a1c', stroke: null, shadow: false, body: true };
const T_DESC_S: LabelStyle = { size: 16, color: '#5a3a1c', stroke: null, shadow: false, body: true };
/**
 * A tile's lines of what it does (`key`: shd_ or sd_ + id): up to two lines; a longer one a size
 * smaller on tighter lines, so the values and the pips under it keep their room.
 */
const tileDesc = (key: string): { style: LabelStyle; lineH: number; n: number } => {
  const n = wrapLines(t(key), T_DESC, TILE_W - 116).length;
  return n <= 2 ? { style: T_DESC, lineH: 20, n } : { style: T_DESC_S, lineH: 17, n: wrapLines(t(key), T_DESC_S, TILE_W - 116).length };
};
const T_NEXT: LabelStyle = { size: 17, color: '#1f5a8a', stroke: null, shadow: false, body: true };
const T_COST: LabelStyle = { size: 26, color: '#7a3a12', stroke: null, shadow: false };
const T_POOR: LabelStyle = { size: 26, color: '#9a7a5a', stroke: null, shadow: false };
const T_STATE: LabelStyle = { size: 22, color: '#2e6b3a', stroke: null, shadow: false };
const SAIL: LabelStyle = { size: 44 };
const KEYS: LabelStyle = { size: 18, color: '#d8c8a8', stroke: '#2a1206', strokeWidth: 3, body: true };
const D_DESC: LabelStyle = { size: 22, color: INK, stroke: null, shadow: false, body: true };
const D_NUM: LabelStyle = { size: 28, color: '#7a5a3a', stroke: null, shadow: false };
const CH_TITLE: LabelStyle = { size: 52, color: '#7a1e12', stroke: null, shadow: false };
const CH_SUB: LabelStyle = { size: 23, color: INK, stroke: null, shadow: false, body: true };
const CH_HULL: LabelStyle = { size: 28, color: INK, stroke: null, shadow: false };
const CH_LOW: LabelStyle = { size: 28, color: '#a3202a', stroke: null, shadow: false };
const CH_NAME_CALM: LabelStyle = { size: 38, color: '#1f5a8a', stroke: null, shadow: false };
const CH_NAME_STORM: LabelStyle = { size: 38, color: '#3a3a48', stroke: null, shadow: false };
const CH_DESC: LabelStyle = { size: 22, color: INK, stroke: null, shadow: false, body: true };
const CH_GHOST: LabelStyle = { size: 26, color: '#a3202a', stroke: null, shadow: false };
const CH_NUM_CALM: LabelStyle = { size: 24, color: '#1f5a8a', stroke: null, shadow: false };
const CH_NUM: LabelStyle = { size: 24, color: INK, stroke: null, shadow: false };
const INK_KEYS: LabelStyle = { size: 19, color: INK, stroke: null, shadow: false, body: true };
const boonName = (id: BoonId): LabelStyle => ({ size: 36, color: '#' + BOON_SYM[id][1].toString(16).padStart(6, '0'), stroke: '#2a1206', strokeWidth: 6 });

const PAD = 14;

/**
 * A parchment note pinned to the board: a warm aged sheet with a slightly ragged edge, stains and
 * a darker rim (the chart's paper, lighter for a small card), an ink rule inside and a brass nail
 * in each top corner. Painted once per size with a soft shadow (cached).
 */
function noteTexture(scene: Phaser.Scene, w: number, h: number): string {
  return bake(scene, `si-note-${w}x${h}`, w + PAD * 2, h + PAD * 3, (c) => {
    let seed = w * 7 + h * 3;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    c.translate(PAD, PAD);
    // the ragged outline
    const edge = new Path2D();
    const pts: [number, number][] = [];
    const side = (x0: number, y0: number, x1: number, y1: number, n: number, nx: number, ny: number) => {
      for (let i = 0; i < n; i++) { const u = i / n, j = (r() - 0.5) * 3.2; pts.push([x0 + (x1 - x0) * u + nx * j, y0 + (y1 - y0) * u + ny * j]); }
    };
    side(2, 2, w - 2, 2, Math.round(w / 9), 0, 1); side(w - 2, 2, w - 2, h - 2, Math.round(h / 9), 1, 0);
    side(w - 2, h - 2, 2, h - 2, Math.round(w / 9), 0, 1); side(2, h - 2, 2, 2, Math.round(h / 9), 1, 0);
    pts.forEach(([x, y], i) => (i ? edge.lineTo(x, y) : edge.moveTo(x, y)));
    edge.closePath();
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
    c.fillStyle = '#e9d4a2'; c.fill(edge);
    c.restore();
    c.save();
    c.clip(edge);
    const base = c.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, '#f6e7bf'); base.addColorStop(1, '#ead39c');
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    // mottling and a stain or two
    for (let i = 0; i < (w * h) / 900; i++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * 22;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(150,100,40,${0.04 + r() * 0.06})`); g.addColorStop(1, 'rgba(150,100,40,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < (w * h) / 60; i++) { c.fillStyle = `rgba(90,60,20,${r() * 0.07})`; c.fillRect(r() * w, r() * h, 1.4, 1.4); }
    // the darker, singed rim
    const rim = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
    rim.addColorStop(0, 'rgba(120,70,20,0)'); rim.addColorStop(1, 'rgba(110,60,20,0.35)');
    c.fillStyle = rim; c.fillRect(0, 0, w, h);
    c.restore();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(58,34,16,0.75)'; c.stroke(edge);
    c.lineWidth = 1; c.strokeStyle = 'rgba(58,34,16,0.4)';
    c.strokeRect(9.5, 9.5, w - 19, h - 19);
    // brass nails
    for (const x of [16, w - 16]) {
      const g = c.createRadialGradient(x - 1.5, 14.5, 0.5, x, 16, 5);
      g.addColorStop(0, '#fff0a8'); g.addColorStop(0.5, '#e0a93a'); g.addColorStop(1, '#6a4410');
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(x + 1, 17.5, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = g; c.beginPath(); c.arc(x, 16, 4.6, 0, Math.PI * 2); c.fill();
    }
  });
}
const note = (scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.Image => scene.add.image(x, y + PAD / 2, noteTexture(scene, w, h));

/** The keys' line under SET SAIL, in two lines (the left column is narrow). */
const shopKeys = (): string[] => {
  const p = t('shopKeys2').split('  ·  ');
  return [p.slice(0, 2).join('  ·  '), p.slice(2).join('  ·  ')].filter(Boolean);
};
/** The sea chart: the middle of its map (left), the cards' rows (right). */
const CHART_MID = 345;
const ROUTE_Y = [262, 506];

/**
 * The tile in direction (dx, dy) from `from` among `items` (centres): the nearest inside a cone
 * round that direction, the sideways offset counting more. Shared by the shop's arrows.
 */
export function stepFocus<T extends { x: number; y: number }>(items: T[], from: number, dx: number, dy: number): number {
  const cur = items[from];
  let best = -1, bd = Infinity;
  items.forEach((it, i) => {
    if (i === from) return;
    const along = (it.x - cur.x) * dx + (it.y - cur.y) * dy;
    const side = Math.abs(dx ? it.y - cur.y : it.x - cur.x);
    if (along < 12 || side > along * 2.2) return;
    const d = along + side * 2.5;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

const shopSub = (k: number): string => t('shopSub') + '  ·  ' + t('sailing', { name: t('i_' + ISLAND_IDS[(k + 1) % ISLAND_IDS.length]) });

/** The sea chart's texture (with the ghost ship from the third island on). */
function seaChart(scene: Phaser.Scene, ghost: boolean): string {
  const { width, height } = scene.scale;
  const ox = 14, oy = 10;
  return chartTexture(scene, ghost ? 'si-chart-sea-g' : 'si-chart-sea', width - ox * 2, height - oy * 2, ghost ? 977 : 976, (g, r) => {
    const at = (x: number, y: number): [number, number] => [x - ox, y - oy];
    rhumbLines(g, ...at(118, 352), 1500, 0.13);
    for (let i = 0; i < 9; i++) waves(g, ...at(150 + (i % 3) * 210, 320 + Math.floor(i / 3) * 120), 3, r);
    inkIsland(g, ...at(132, 566), 52, r, { palms: 2 });
    inkIsland(g, ...at(586, 352), 66, r, { palms: 2 });
    // both routes, faint (the chosen one is drawn over them)
    for (const id of ROUTES) {
      const pts = ROUTE_PTS[id];
      g.save();
      g.setLineDash([10, 9]);
      g.lineWidth = 3;
      g.strokeStyle = id === 'calm' ? 'rgba(31,90,138,0.45)' : 'rgba(58,40,30,0.45)';
      g.beginPath();
      pts.forEach(([x, y], i) => { const [px, py] = at(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
      g.restore();
    }
    stormDoodle(g, ...at(420, 610), 0.9);
    serpent(g, ...at(300, 638), 0.5, -1);
    if (ghost) shipDoodle(g, ...at(470, 630), 0.6, -1, true);
    xMark(g, ...at(600, 352), 15);
    compassRose(g, ...at(118, 352), 46);
    scrollBanner(g, ...at(CHART_MID, 96), 440, 62);
    // a sea serpent's lair and a few more waves on the right, under the cards
    for (let i = 0; i < 4; i++) waves(g, ...at(720 + (i % 2) * 400, 160 + Math.floor(i / 2) * 470), 3, r);
    // the cards' places: two lighter panels of parchment
    for (const y of ROUTE_Y) {
      g.save();
      g.fillStyle = 'rgba(255,248,225,0.35)';
      g.strokeStyle = 'rgba(58,34,16,0.5)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(...at(ROUTE_X - ROUTE_W / 2, y - ROUTE_H / 2), ROUTE_W, ROUTE_H, 22); g.fill(); g.stroke();
      g.restore();
    }
  });
}

/**
 * Paints, in the current language, every texture the shop, the boon draft and the sea chart use
 * (Boot, under the Ayvago intro): the board, the notes, the buttons, the words, the two charts.
 */
export function prebakeIsleScreens(scene: Phaser.Scene): void {
  const P = menuTheme()!.palette;
  // the shop
  skinTexture(scene, 'board', PANEL_W, PANEL_H);
  noteTexture(scene, TILE_W, TILE_H);
  labelTexture(scene, t('shopTitle'), GOLD_HEAD);
  ISLAND_IDS.forEach((_, k) => bakePara(scene, shopSub(k), CREAM, SIDE_W));
  bakeButton(scene, 'plate', PLATE_W, 56, P.board);
  for (const o of [PURSE, T_COST, T_POOR]) glyphAtlas(scene, o);
  for (const k of ['tabCrew', 'tabShip']) labelTexture(scene, t(k), TAB);
  bakeButton(scene, 'button', TAB_W, TAB_H, WOOD);
  bakeButton(scene, 'button', TAB_W, TAB_H, FLAG_RED, false, true);
  for (const id of [...SHOP_IDS, 'patch']) {
    labelTexture(scene, t('s_' + id), T_NAME);
    const d = tileDesc('sd_' + id);
    bakePara(scene, t('sd_' + id), d.style, TILE_W - 116);
  }
  for (const id of [...SHIP_IDS, 'repair']) {
    labelTexture(scene, t('sh_' + id), T_NAME);
    const d = tileDesc('shd_' + id);
    bakePara(scene, t('shd_' + id), d.style, TILE_W - 116);
    bakeFmt(scene, 'shn_' + id, ['a', 'b'], T_NEXT);
  }
  for (const k of ['maxed', 'full', 'bought']) labelTexture(scene, t(k), T_STATE);
  labelTexture(scene, t('setSail'), SAIL);
  bakeButton(scene, 'button', SAIL_W, SAIL_H, FLAG_RED);
  for (const line of shopKeys()) labelTexture(scene, line, KEYS);
  // the boon draft
  noteTexture(scene, DRAFT_W, DRAFT_H);
  labelTexture(scene, t('draftTitle'), GOLD_HEAD);
  bakePara(scene, t('draftSub'), { ...CREAM, size: 24 }, 900);
  for (const id of BOON_IDS) { labelTexture(scene, t('bn_' + id), boonName(id)); bakePara(scene, t('bd_' + id), D_DESC, DRAFT_TEXT); }
  for (const n of ['1', '2', '3']) labelTexture(scene, n, D_NUM);
  labelTexture(scene, t('draftKeys'), KEYS);
  // the sea chart
  seaChart(scene, false);
  seaChart(scene, true);
  labelTexture(scene, t('chartTitle'), CH_TITLE);
  for (const id of ISLAND_IDS) bakePara(scene, t('chartSub', { name: t('i_' + id) }), CH_SUB, 560);
  bakeFmt(scene, 'hullNow', ['n', 'max'], CH_HULL);
  bakeFmt(scene, 'hullNow', ['n', 'max'], CH_LOW);
  labelTexture(scene, t('r_calm'), CH_NAME_CALM);
  labelTexture(scene, t('r_storm'), CH_NAME_STORM);
  for (const id of ROUTES) bakePara(scene, t('rd_' + id), CH_DESC, ROUTE_TEXT);
  labelTexture(scene, t('rd_ghost'), CH_GHOST);
  for (const n of ['1', '2']) { labelTexture(scene, n, CH_NUM_CALM); labelTexture(scene, n, CH_NUM); }
  labelTexture(scene, t('chartKeys'), INK_KEYS);
}

interface Parts { frame: Phaser.GameObjects.Graphics; face: Phaser.GameObjects.Image; cost: GlyphText; costPoor: GlyphText; coin: Phaser.GameObjects.Image; pips: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Image | null; stateKey: string; next: FmtLine | null }
interface Tile { id: Item; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Container; parts: Parts | null }

export interface OverlayHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

export class ShopOverlay {
  readonly root: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private fixed: Tile[] = [];
  private grid: Phaser.GameObjects.Container;
  private focus = 0;
  private goldText: GlyphText;
  private sail: KitButton;
  private tabs: Record<Tab, KitButton>;
  tab: Tab = 'crew';
  done = false;

  constructor(private scene: Phaser.Scene, private sim: Sim, private host: OverlayHost, private onSail: () => void) {
    const { width, height } = scene.scale;
    const P = menuTheme()!.palette;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x040a10, 0.62).setOrigin(0).setInteractive();
    this.root.add(dim);
    // the notice board on the dock: the whole screen but a margin
    const panel = scene.add.container(width / 2, height / 2);
    panel.add(scene.add.image(0, SKIN_PAD / 2, skinTexture(scene, 'board', PANEL_W, PANEL_H)));
    this.root.add(panel);
    // the left column: the title, where the ship sails next, the purse, the tabs, SET SAIL
    this.root.add(fitWidth(labelAt(scene, SIDE_X, 92, t('shopTitle'), GOLD_HEAD), SIDE_W));
    this.root.add(new Para(scene, SIDE_X, 132, shopSub(sim.k), CREAM, SIDE_W, 0.5, 26));
    // the purse
    const chip = scene.add.container(SIDE_X, 236);
    chip.add(scene.add.image(0, SKIN_PAD / 2, skinTexture(scene, 'plate', PLATE_W, 56, 'up', P.board)));
    chip.add(scene.add.image(-72, 0, GOLD).setDisplaySize(40, 40));
    this.goldText = new GlyphText(scene, 14, 0, '', PURSE);
    chip.add(this.goldText);
    this.root.add(chip);
    // the tabs: the crew's upgrades, the ship's (stacked like bookmarks)
    const TAB_Y = [326, 402];
    const tab = (y: number, key: string, to: Tab) => new KitButton(scene, SIDE_X, y, { w: TAB_W, h: TAB_H, color: WOOD, label: t(key), style: TAB, sfx: null }, () => this.setTab(to));
    this.tabs = { crew: tab(TAB_Y[0], 'tabCrew', 'crew'), ship: tab(TAB_Y[1], 'tabShip', 'ship') };
    // the ship's tab carries a little ship
    const sl = this.tabs.ship.label!;
    const icon = scene.add.image(0, 0, SHIP).setDisplaySize(34, 34);
    const tw = sl.displayWidth + 40;
    icon.x = -tw / 2 + 17; sl.x = icon.x + 23 + sl.displayWidth / 2;
    this.tabs.ship.addContent(icon);
    this.root.add([this.tabs.crew, this.tabs.ship]);
    this.fixed.push({ id: 'tabCrew', x: SIDE_X, y: TAB_Y[0], w: TAB_W, h: TAB_H, box: this.tabs.crew, parts: null });
    this.fixed.push({ id: 'tabShip', x: SIDE_X, y: TAB_Y[1], w: TAB_W, h: TAB_H, box: this.tabs.ship, parts: null });
    this.grid = scene.add.container(0, 0);
    this.root.add(this.grid);
    const sailY = host.touch ? 588 : 556;
    this.sail = new KitButton(scene, SIDE_X, sailY, { w: SAIL_W, h: SAIL_H, color: FLAG_RED, label: t('setSail'), style: SAIL, sfx: null }, () => this.leave());
    this.root.add(this.sail);
    this.fixed.push({ id: 'sail', x: SIDE_X, y: sailY, w: SAIL_W, h: SAIL_H, box: this.sail, parts: null });
    if (!host.touch) shopKeys().forEach((line, i) => this.root.add(fitWidth(labelAt(scene, SIDE_X, 630 + i * 26, line, KEYS), SIDE_W)));
    // a battered hull opens on the ship's tab
    this.buildTab(sim.hull < shipStats(sim.shipLv, sim.tune).maxHull * 0.5 ? 'ship' : 'crew');
    this.focus = Math.max(0, this.tiles.findIndex((tl) => this.state(tl.id) === 'ok' && tl.parts));
    if (this.state(this.tiles[this.focus].id) !== 'ok' || !this.tiles[this.focus].parts) this.focus = this.tiles.findIndex((tl) => tl.id === 'sail');
    this.refresh();
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    panel.setScale(0.9);
    scene.tweens.add({ targets: panel, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private setTab(tab: Tab): void {
    if (this.done || tab === this.tab) return;
    this.host.sfx('move', 0.35);
    const keepTab = this.tiles[this.focus]?.id === 'tabCrew' || this.tiles[this.focus]?.id === 'tabShip';
    this.buildTab(tab);
    this.focus = keepTab ? this.tiles.findIndex((tl) => tl.id === (tab === 'crew' ? 'tabCrew' : 'tabShip')) : Math.max(0, this.tiles.findIndex((tl) => !!tl.parts));
    this.refresh();
    this.grid.setAlpha(0);
    this.scene.tweens.add({ targets: this.grid, alpha: 1, duration: 160 });
  }

  private buildTab(tab: Tab): void {
    this.tab = tab;
    this.grid.removeAll(true);
    this.tiles = [...this.fixed];
    const items: Item[] = tab === 'crew' ? [...SHOP_IDS, 'patch'] : [...SHIP_IDS, 'repair'];
    const w = TILE_W, h = TILE_H, gx = 14, gy = 12;
    // two columns of four rows on the right of the board
    items.forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.tile(id, WARES_X + (col ? 1 : -1) * (w + gx) / 2, 360 + (row - 1.5) * (h + gy), w, h);
    });
  }

  private tile(id: Item, x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const box = s.add.container(x, y);
    const ship = isShip(id) || id === 'repair';
    const face = note(s, 0, 0, w, h);
    const frame = s.add.graphics();
    const art = ship ? shipArt(id as ShipId | 'repair') : shopArt(id as ShopId | 'patch');
    const icon = s.add.image(-w / 2 + 54, -12, art).setDisplaySize(74, 74);
    const L = -w / 2 + 100;
    const name = fitWidth(labelAt(s, L, -h / 2 + 32, t((ship ? 'sh_' : 's_') + id), T_NAME, 0), w - 116);
    const parts: Array<Phaser.GameObjects.GameObject> = [face, frame, icon, name];
    let next: FmtLine | null = null;
    if (ship) {
      // one line of what it does, then what it is now and what the next level makes it
      // a long one takes two or three lines, the values under them
      const d = tileDesc('shd_' + id);
      const para = new Para(s, L, -h / 2 + 48, t('shd_' + id), d.style, w - 116, 0, d.lineH);
      parts.push(para);
      next = new FmtLine(s, L, d.n > 1 ? para.y + para.textHeight + 10 : 10, T_NEXT, 0);
      parts.push(next);
    } else {
      const d = tileDesc('sd_' + id);
      parts.push(new Para(s, L, -h / 2 + 48, t('sd_' + id), d.style, TILE_W - 116, 0, d.lineH));
    }
    const pips = s.add.graphics();
    const coin = s.add.image(0, h / 2 - 30, GOLD).setDisplaySize(28, 28);
    const cost = new GlyphText(s, 0, h / 2 - 30, '', T_COST, 0);
    const costPoor = new GlyphText(s, 0, h / 2 - 30, '', T_POOR, 0);
    const hit = s.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    parts.push(pips, coin, cost, costPoor, hit);
    box.add(parts);
    this.grid.add(box);
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    hit.on('pointerup', () => { this.focus = this.tiles.findIndex((tl) => tl.id === id); this.buy(); });
    this.tiles.push({ id, x, y, w, h, box, parts: { frame, face, cost, costPoor, coin, pips, state: null, stateKey: '', next } });
  }

  private price(id: Item): number | null {
    const sim = this.sim;
    if (id === 'sail' || id === 'tabCrew' || id === 'tabShip') return null;
    if (id === 'patch') return sim.patchPrice;
    if (id === 'repair') return sim.repairPrice;
    if (isShip(id)) {
      const lv = sim.shipLv[id] ?? 0;
      return lv >= SHIP_COST[id].length ? null : SHIP_COST[id][lv];
    }
    const lv = sim.shop[id] ?? 0;
    return lv >= SHOP_COST[id].length ? null : SHOP_COST[id][lv];
  }

  private state(id: Item): 'ok' | 'poor' | 'max' | 'full' | 'done' {
    const sim = this.sim;
    if (id === 'sail' || id === 'tabCrew' || id === 'tabShip') return 'ok';
    if (id === 'patch') {
      if (sim.patched) return 'done';
      if (sim.p.hp >= sim.st.maxHp) return 'full';
      return sim.gold >= sim.patchPrice ? 'ok' : 'poor';
    }
    if (id === 'repair') {
      if (sim.repaired) return 'done';
      if (sim.hull >= sim.shipSt.maxHull) return 'full';
      return sim.gold >= sim.repairPrice ? 'ok' : 'poor';
    }
    const c = this.price(id);
    if (c === null) return 'max';
    return sim.gold >= c ? 'ok' : 'poor';
  }

  /** "now → next" for a ship upgrade (or the repair): the values for its line. */
  private nextVals(id: ShipId | 'repair'): { a: string; b: string } {
    const sim = this.sim;
    if (id === 'repair') {
      const max = sim.shipSt.maxHull;
      return { a: `${Math.round(sim.hull)}/${max}`, b: `${Math.min(max, Math.round(sim.hull + max * REPAIR))}/${max}` };
    }
    const lv = sim.shipLv[id] ?? 0;
    const now = sim.shipSt;
    if (lv >= SHIP_COST[id].length) {
      const v = this.statOf(id, now);
      return { a: v, b: v };
    }
    const nx = shipStats({ ...sim.shipLv, [id]: lv + 1 }, sim.tune);
    return { a: this.statOf(id, now), b: this.statOf(id, nx) };
  }

  private statOf(id: ShipId, st: ReturnType<typeof shipStats>): string {
    switch (id) {
      case 'hull': return String(st.maxHull);
      case 'cannon': return String(Math.round(st.dmg));
      case 'sails': return dec(st.speed);
      case 'net': return dec(st.net);
      case 'figurehead': return String(Math.round(st.luck * 100));
      case 'swim': return String(Math.round((st.swim - 1) * 100));
    }
  }

  refresh(): void {
    this.goldText.setText(String(this.sim.gold));
    for (const tb of ['crew', 'ship'] as Tab[]) {
      const on = this.tab === tb;
      const tl = this.tiles.findIndex((x) => x.id === (tb === 'crew' ? 'tabCrew' : 'tabShip'));
      const foc = tl === this.focus && !this.host.touch;
      this.tabs[tb].setLook(on ? FLAG_RED : WOOD, on).setScale(foc ? 1.07 : 1);
    }
    this.tiles.forEach((tl, i) => {
      const on = i === this.focus;
      if (tl.id === 'sail') { this.sail.setScale(on && !this.host.touch ? 1.06 : 1); return; }
      if (!tl.parts) return;
      const pt = tl.parts;
      const st = this.state(tl.id);
      const { w, h } = tl;
      // the note's ink frame: green when it can be bought, faded when the purse is short, blue when done
      const col = st === 'ok' ? 0x2e6b3a : st === 'poor' ? 0x8a6a4a : BLUE_INK;
      pt.frame.clear()
        .lineStyle(on ? 6 : 3, on ? RED_INK : col, on ? 1 : 0.85).strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 12);
      pt.face.setTint(st === 'poor' ? 0xd8c8b0 : 0xffffff);
      const c = this.price(tl.id);
      const key = st === 'max' ? 'maxed' : st === 'full' ? 'full' : st === 'done' ? 'bought' : '';
      if (key !== pt.stateKey) {
        pt.state?.destroy();
        pt.state = key ? labelAt(this.scene, w / 2 - 22, h / 2 - 30, t(key), T_STATE, 1) : null;
        if (pt.state) tl.box.add(pt.state);
        pt.stateKey = key;
      }
      const shown = st === 'poor' ? pt.costPoor : pt.cost;
      pt.cost.setVisible(!key && st !== 'poor');
      pt.costPoor.setVisible(!key && st === 'poor');
      shown.setText(c !== null ? String(c) : '');
      pt.coin.setVisible(!key);
      shown.setX(w / 2 - 22 - shown.textWidth);
      pt.coin.setX(shown.x - 20);
      if (pt.next && (isShip(tl.id) || tl.id === 'repair')) {
        pt.next.set('shn_' + tl.id, this.nextVals(tl.id as ShipId | 'repair'));
        pt.next.setScale(1);
        if (pt.next.textWidth > w - 116) pt.next.setScale((w - 116) / pt.next.textWidth);
      }
      // level pips
      const pips = pt.pips.clear();
      const py = h / 2 - 34;
      if (tl.id === 'patch' || tl.id === 'repair') {
        pips.fillStyle(0x2e6b3a, 0.35).fillRoundedRect(-w / 2 + 100, py, 100 * (tl.id === 'patch' ? PATCH : REPAIR) * 2.5, 9, 4);
      } else {
        const ship = isShip(tl.id);
        const max = ship ? SHIP_COST[tl.id as ShipId].length : SHOP_COST[tl.id as ShopId].length;
        const n = ship ? this.sim.shipLv[tl.id as ShipId] ?? 0 : this.sim.shop[tl.id as ShopId] ?? 0;
        const pw = 15, gap = 5;
        for (let k = 0; k < max; k++) {
          pips.fillStyle(k < n ? (ship ? 0x1f5a8a : 0xb8741a) : 0x3a2210, k < n ? 1 : 0.18).fillRoundedRect(-w / 2 + 100 + k * (pw + gap), py, pw, 9, 4);
        }
      }
      tl.box.setScale(on && !this.host.touch ? 1.03 : 1);
    });
  }

  key(code: string): boolean {
    if (this.done) return false;
    if (code === 'Tab' || code === 'KeyQ') { this.setTab(this.tab === 'crew' ? 'ship' : 'crew'); return true; }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] } as Record<string, number[]>)[code];
    if (dir) { this.move(dir[0], dir[1]); return true; }
    if (code === 'Enter' || code === 'Space' || code === 'KeyJ') { this.buy(); return true; }
    return false;
  }

  private move(dx: number, dy: number): void {
    const best = stepFocus(this.tiles, this.focus, dx, dy);
    if (best >= 0) { this.focus = best; this.host.sfx('move', 0.3); this.refresh(); }
  }

  private buy(): void {
    const tl = this.tiles[this.focus];
    if (tl.id === 'sail') { this.leave(); return; }
    if (tl.id === 'tabCrew' || tl.id === 'tabShip') { this.setTab(tl.id === 'tabCrew' ? 'crew' : 'ship'); return; }
    const sim = this.sim;
    const ok = tl.id === 'patch' ? sim.buyPatch() : tl.id === 'repair' ? sim.buyRepair() : isShip(tl.id) ? sim.buyShip(tl.id) : sim.buy(tl.id as ShopId);
    if (!ok) {
      this.host.sfx('error', 0.4);
      this.scene.tweens.add({ targets: tl.box, x: { from: tl.x - 10, to: tl.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    this.host.sfx(tl.id === 'patch' ? 'heal' : tl.id === 'repair' ? 'repair' : 'buy', 0.6);
    this.scene.tweens.add({ targets: tl.box, scale: 1.1, duration: 110, yoyo: true });
    const sp = this.scene.add.particles(tl.x, tl.y, GOLD, { speed: { min: 140, max: 300 }, scale: { start: 0.28, end: 0 }, lifespan: 520, quantity: 14, emitting: false }).setDepth(OVERLAY_DEPTH + 1).setScrollFactor(0);
    sp.explode(14);
    this.scene.time.delayedCall(700, () => sp.destroy());
    if (this.state(tl.id) !== 'ok') {
      const next = this.tiles.findIndex((x) => this.state(x.id) === 'ok' && !!x.parts);
      if (next < 0) this.focus = this.tiles.findIndex((x) => x.id === 'sail');
    }
    this.refresh();
  }

  private leave(): void {
    if (this.done) return;
    this.done = true;
    this.host.sfx('sail', 0.6);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 220, onComplete: () => this.root.destroy() });
    this.onSail();
  }

  /** Test hooks: buys an item as a tap would; shows a tab. */
  testBuy(id: Item): void {
    if (isShip(id) || id === 'repair') this.setTab('ship');
    else if (id !== 'sail') this.setTab('crew');
    this.focus = this.tiles.findIndex((x) => x.id === id);
    this.buy();
  }
  testTab(tab: Tab): void { this.setTab(tab); }

  destroy(): void { this.done = true; this.root.destroy(); }
}

/** The sea chart's routes in screen space (its map on the left): from the island just raided to the next (calm above, storm below). */
const ROUTE_PTS: Record<Route, [number, number][]> = {
  calm: [[176, 542], [250, 430], [372, 372], [500, 352], [548, 370]],
  storm: [[182, 566], [290, 590], [380, 542], [452, 560], [520, 490], [560, 400]],
};

/**
 * The sea chart between islands: an old pirate chart (chart.ts) with the island just raided, the
 * next one under a red X, and the two routes inked across the sea; the cards below pick one
 * (tap, 1 · 2, or the arrows and Enter), the chosen route standing out on the chart.
 */
export class RouteOverlay {
  readonly root: Phaser.GameObjects.Container;
  private cards: { box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; id: Route }[] = [];
  private routes: Phaser.GameObjects.Graphics;
  private focus = 0;
  done = false;

  constructor(private scene: Phaser.Scene, sim: Sim, private host: OverlayHost, private onPick: (r: Route) => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.root.add(scene.add.rectangle(0, 0, width, height, 0x040a10, 0.8).setOrigin(0).setInteractive());
    const ghost = sim.k + 1 >= 3;
    // the chart was painted in Boot (prebakeIsleScreens)
    this.root.add(scene.add.image(width / 2, height / 2, seaChart(scene, ghost)));
    this.routes = scene.add.graphics();
    this.root.add(this.routes);
    this.root.add(scene.add.image(176, 528, SHIP).setDisplaySize(56, 56));
    // the map on the left: the title on its scroll, the next island, the hull under the map
    this.root.add(fitWidth(labelAt(scene, CHART_MID, 94, t('chartTitle'), CH_TITLE), 420));
    const nextId = ISLAND_IDS[(sim.k + 1) % ISLAND_IDS.length];
    this.root.add(new Para(scene, CHART_MID, 142, t('chartSub', { name: t('i_' + nextId) }), CH_SUB, 560, 0.5, 28));
    const low = sim.hull < sim.shipSt.maxHull * 0.4;
    this.root.add(new FmtLine(scene, CHART_MID, 214, low ? CH_LOW : CH_HULL, 0.5).set('hullNow', { n: Math.round(sim.hull), max: sim.shipSt.maxHull }));
    // the routes' numbers on the chart
    for (const [i, id] of ROUTES.entries()) {
      const [x, y] = ROUTE_PTS[id][2];
      const b = scene.add.graphics().fillStyle(0xf3e3b8, 1).fillCircle(x, y - 26, 17).lineStyle(2.5, id === 'calm' ? BLUE_INK : INK_N, 1).strokeCircle(x, y - 26, 17);
      this.root.add([b, labelAt(scene, x, y - 26, String(i + 1), id === 'calm' ? CH_NUM_CALM : CH_NUM)]);
    }
    // the two routes' cards on the right
    const L = -ROUTE_W / 2 + 178;
    ROUTES.forEach((id, i) => {
      const y = ROUTE_Y[i];
      const box = scene.add.container(ROUTE_X, y);
      const bg = scene.add.graphics();
      const icon = scene.add.image(-ROUTE_W / 2 + 90, 0, routeArt(id)).setDisplaySize(132, 132);
      const name = fitWidth(labelAt(scene, L, -60, t('r_' + id), id === 'calm' ? CH_NAME_CALM : CH_NAME_STORM, 0), ROUTE_W / 2 - 20 - L - 30);
      const desc = new Para(scene, L, -34, t('rd_' + id), CH_DESC, ROUTE_TEXT, 0, 27);
      box.add([bg, icon, name, desc]);
      if (id === 'storm' && ghost) box.add(fitWidth(labelAt(scene, L, 78, t('rd_ghost'), CH_GHOST, 0), ROUTE_TEXT));
      const num = scene.add.container(ROUTE_W / 2 - 36, -ROUTE_H / 2 + 32);
      num.add([scene.add.graphics().fillStyle(0xf3e3b8, 1).fillCircle(0, 0, 19).lineStyle(2.5, id === 'calm' ? BLUE_INK : INK_N, 1).strokeCircle(0, 0, 19), labelAt(scene, 0, 0, String(i + 1), id === 'calm' ? CH_NUM_CALM : CH_NUM)]);
      const hit = scene.add.zone(0, 0, ROUTE_W, ROUTE_H).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
      hit.on('pointerover', () => { if (!this.done && this.focus !== i) { this.focus = i; this.refresh(); } });
      hit.on('pointerup', () => this.pick(i));
      box.add([num, hit]);
      box.setScale(0.6).setAlpha(0);
      scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, delay: 120 + i * 120, ease: 'Back.easeOut', onStart: () => host.sfx('card', 0.4) });
      this.root.add(box);
      this.cards.push({ box, bg, id });
    });
    if (!host.touch) this.root.add(labelAt(scene, ROUTE_X, 662, t('chartKeys'), INK_KEYS));
    this.refresh();
  }

  private refresh(): void {
    // the route in focus inked over the chart, the other left faint
    const g = this.routes.clear();
    ROUTES.forEach((id, i) => {
      if (i !== this.focus) return;
      const pts = ROUTE_PTS[id].map(([x, y]) => new Phaser.Math.Vector2(x, y));
      dashedPath(g, pts, id === 'calm' ? BLUE_INK : INK_N, 0.95, 5, 14, 9);
    });
    const w = ROUTE_W, h = ROUTE_H;
    this.cards.forEach((c, i) => {
      const on = i === this.focus;
      const ink = c.id === 'calm' ? BLUE_INK : INK_N;
      c.bg.clear()
        .fillStyle(0x3a2210, 0.18).fillRoundedRect(-w / 2 + 4, -h / 2 + 7, w, h, 22)
        .fillStyle(0xf3e3b8, 0.97).fillRoundedRect(-w / 2, -h / 2, w, h, 22)
        .fillStyle(c.id === 'calm' ? 0x9fc8e8 : 0xa8a8b4, 0.22).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, 84, { tl: 18, tr: 18, bl: 6, br: 6 })
        .lineStyle(on ? 6 : 3, on ? RED_INK : ink, on ? 1 : 0.75).strokeRoundedRect(-w / 2, -h / 2, w, h, 22)
        .lineStyle(1, 0x3a2210, 0.45).strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 16);
    });
  }

  key(code: string): boolean {
    if (this.done) return false;
    if (code === 'Digit1' || code === 'Digit2') { this.pick(Number(code.slice(5)) - 1); return true; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(code)) { this.focus = 1 - this.focus; this.host.sfx('move', 0.3); this.refresh(); return true; }
    if (code === 'Enter' || code === 'Space' || code === 'KeyJ') { this.pick(this.focus); return true; }
    return false;
  }

  pick(i: number): void {
    if (this.done || i < 0 || i >= this.cards.length) return;
    this.focus = i;
    this.refresh();
    this.done = true;
    const c = this.cards[i];
    this.host.sfx('boon', 0.6);
    this.scene.tweens.add({ targets: c.box, scale: 1.08, duration: 160, yoyo: true });
    this.cards.forEach((o, k) => { if (k !== i) this.scene.tweens.add({ targets: o.box, alpha: 0.2, duration: 200 }); });
    this.scene.tweens.add({ targets: this.root, alpha: 0, delay: 460, duration: 240, onComplete: () => this.root.destroy() });
    this.scene.time.delayedCall(460, () => this.onPick(c.id));
  }

  destroy(): void { this.done = true; this.root.destroy(); }
}

export class DraftOverlay {
  readonly root: Phaser.GameObjects.Container;
  private cards: { box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; y: number; id: BoonId }[] = [];
  private focus = 0;
  done = false;

  constructor(private scene: Phaser.Scene, private boons: BoonId[], private host: OverlayHost, private onPick: (i: number) => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    this.root.add(scene.add.rectangle(0, 0, width, height, 0x040a10, 0.66).setOrigin(0).setInteractive());
    this.root.add(fitWidth(labelAt(scene, width / 2, 82, t('draftTitle'), GOLD_HEAD), 900));
    this.root.add(new Para(scene, width / 2, 124, t('draftSub'), { ...CREAM, size: 24 }, 900, 0.5, 30));
    // the three boons side by side
    boons.forEach((id, i) => {
      const y = 382;
      const box = scene.add.container(width / 2 + (i - (boons.length - 1) / 2) * (DRAFT_W + 34), y);
      const face = note(scene, 0, 0, DRAFT_W, DRAFT_H);
      const bg = scene.add.graphics();
      const icon = scene.add.image(0, -88, boonArt(id)).setDisplaySize(140, 140);
      const name = fitWidth(labelAt(scene, 0, 20, t('bn_' + id), boonName(id)), DRAFT_W - 40);
      const desc = new Para(scene, 0, 50, t('bd_' + id), D_DESC, DRAFT_TEXT, 0.5, 27);
      const num = labelAt(scene, DRAFT_W / 2 - 34, -DRAFT_H / 2 + 40, String(i + 1), D_NUM);
      if (host.touch) num.setVisible(false);
      const hit = scene.add.zone(0, 0, DRAFT_W, DRAFT_H).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
      hit.on('pointerup', () => this.pick(i));
      box.add([face, bg, icon, name, desc, num, hit]);
      box.setScale(0.6).setAlpha(0);
      scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, delay: 120 + i * 110, ease: 'Back.easeOut', onStart: () => host.sfx('card', 0.4) });
      this.root.add(box);
      this.cards.push({ box, bg, y, id });
    });
    if (!host.touch) this.root.add(labelAt(scene, width / 2, 640, t('draftKeys'), KEYS));
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => {
      const on = i === this.focus && !this.host.touch;
      const hue = BOON_SYM[c.id][1];
      // the boon's colour as an inked rule round the note; the one in focus in red ink
      c.bg.clear()
        .lineStyle(3, hue, 0.9).strokeRoundedRect(-DRAFT_W / 2 + 10, -DRAFT_H / 2 + 10, DRAFT_W - 20, DRAFT_H - 20, 14);
      if (on) c.bg.lineStyle(6, RED_INK, 1).strokeRoundedRect(-DRAFT_W / 2 + 4, -DRAFT_H / 2 + 4, DRAFT_W - 8, DRAFT_H - 8, 18);
    });
  }

  key(code: string): boolean {
    if (this.done) return false;
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.pick(Number(code.slice(5)) - 1); return true; }
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowUp' || code === 'KeyW') { this.focus = (this.focus + 2) % 3; this.host.sfx('move', 0.3); this.refresh(); return true; }
    if (code === 'ArrowRight' || code === 'KeyD' || code === 'ArrowDown' || code === 'KeyS') { this.focus = (this.focus + 1) % 3; this.host.sfx('move', 0.3); this.refresh(); return true; }
    if (code === 'Enter' || code === 'Space' || code === 'KeyJ') { this.pick(this.focus); return true; }
    return false;
  }

  pick(i: number): void {
    if (this.done || i < 0 || i >= this.cards.length) return;
    this.done = true;
    const c = this.cards[i];
    this.host.sfx('boon', 0.7);
    this.scene.tweens.add({ targets: c.box, scale: 1.12, duration: 160, yoyo: true });
    this.cards.forEach((o, k) => { if (k !== i) this.scene.tweens.add({ targets: o.box, alpha: 0.2, duration: 200 }); });
    this.scene.tweens.add({ targets: this.root, alpha: 0, delay: 520, duration: 240, onComplete: () => this.root.destroy() });
    this.scene.time.delayedCall(520, () => this.onPick(i));
  }

  destroy(): void { this.done = true; this.root.destroy(); }
}
