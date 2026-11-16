// Delivery Dash: the town map, opened from the menu (the menu waits paused under it). Two tabs:
//   SHIFTS: the three districts with their six shifts each (stars earned, padlocks with what
//           opens them) and the Endless Rush card;
//   GARAGE: vehicles (van, flatbed, truck), upgrades (engine, handling, capacity, padding) and
//           paints, bought with the wallet.
// Touch, mouse and keyboard (arrows move, Enter picks, Tab switches tabs, Esc goes back).
// It wears the menu theme (theme.ts): the road round the screen, districts and vehicles on
// shipping labels, cardboard buttons with packing tape, every heading in Bungee. Everything it
// shows is painted under the Ayvago intro (`prebakeMap`, from main.ts), so opening it or switching
// a tab only places images.
import Phaser from 'phaser';
import { t, upper, playSfx, getBest, burst, labelTexture, skinTexture, SKIN_PAD, type LabelStyle } from '@core';
import { frameBorder } from '@core/menu-theme';
import { SHIFTS, DISTRICTS } from './shifts';
import { loadMeta, saveMeta, shiftOpen, districtOpen, totalStars, type Meta } from './meta';
import { VEHICLES, UPGRADES, PAINTS, vehicle } from './defs';
import { makeArt } from './ui';
import { money } from './money';
import { ORANGE, KRAFT, INK } from './theme';
import { bakeTex, bakeButton, bakeFmt, bakePara, glyphAtlas, labelAt, fit, GlyphText, FmtLine, Para, KitButton } from './panels';

interface Cell { x: number; y: number; w: number; h: number; act: () => void; box: Phaser.GameObjects.Container }

const DIST_COLORS = [0x2f5f9a, 0x1f7a6e, 0x6a4f9a];
const RUSH_RED = 0xc8402a, USING = 0x2f9f5a, OWNED = 0x3a9a5a;
const CW = 670, CH = 252, RUSH_H = 150, VW = 204, VH = 210, UW = 660, UH = 80;
const TILE_W = 184, TILE_H = 62;

// the styles (shared with the prebake, so the painted keys match); Bungee is set in capitals
const TITLE: LabelStyle = { size: 56, fill: ['#fff6d0', '#ffd23f', '#ff8a1a'], stroke: INK, strokeWidth: 9 };
const WALLET: LabelStyle = { size: 32, color: '#ffffff', stroke: INK };
const TAB: LabelStyle = { size: 30 };
const BAND: LabelStyle = { size: 32, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const BAND_NUM: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const NEED: LabelStyle = { size: 19, color: '#fff4c8', stroke: INK, strokeWidth: 4, body: true };
const TILE: LabelStyle = { size: 28 };
const BODY: LabelStyle = { size: 19, color: '#2b1d10', stroke: null, shadow: false, body: true };
const BEST: LabelStyle = { size: 21, color: '#ffffff', stroke: INK, strokeWidth: 4, body: true };
const BTN: LabelStyle = { size: 32 };
const SECTION: LabelStyle = { size: 30, color: '#ffd23f', stroke: INK, strokeWidth: 6 };
const V_NAME: LabelStyle = { size: 24, color: '#2b1d10', stroke: null, shadow: false };
const V_CAP: LabelStyle = { size: 18, color: '#5a4630', stroke: null, shadow: false, body: true };
const V_BTN: LabelStyle = { size: 22 };
const U_NAME: LabelStyle = { size: 26, color: '#ffffff', stroke: INK, strokeWidth: 5 };
const U_DESC: LabelStyle = { size: 18, color: '#3a2410', stroke: null, shadow: false, body: true };
const U_BTN: LabelStyle = { size: 24 };
const P_PRICE: LabelStyle = { size: 20, color: '#ffe27a', stroke: INK, strokeWidth: 5 };
const P_NAME: LabelStyle = { size: 16, color: '#e8dcc8', stroke: INK, strokeWidth: 3, body: true };
const TIP: LabelStyle = { size: 30, color: '#ff9a7a', stroke: INK, strokeWidth: 7 };

const needKey = (d: number) => t('needStars', { n: DISTRICTS[d].need });

/** Paints the map's and the garage's every texture in the current language (Boot, under the Ayvago intro). */
export function prebakeMap(scene: Phaser.Scene): void {
  bgTexture(scene);
  labelTexture(scene, upper(t('mapTitle')), TITLE);
  for (const o of [WALLET, BAND_NUM]) glyphAtlas(scene, o);
  for (const k of ['tabShifts', 'tabGarage']) labelTexture(scene, upper(t(k)), TAB);
  bakeButton(scene, 'button', 300, 68, KRAFT);
  bakeButton(scene, 'button', 300, 68, ORANGE, false, true);
  bakeButton(scene, 'plate', 460, 60, KRAFT);
  // shifts
  DISTRICTS.forEach((d, di) => {
    cardTexture(scene, CW, CH, DIST_COLORS[di]);
    labelTexture(scene, upper(t('d' + d.id)), BAND);
    if (d.need) labelTexture(scene, needKey(di), NEED);
  });
  for (const s of SHIFTS) labelTexture(scene, upper(t('shiftN', { n: s.id })), TILE);
  bakeButton(scene, 'button', TILE_W, TILE_H, KRAFT, true);
  bakeButton(scene, 'button', TILE_W, TILE_H, ORANGE, false, true);
  cardTexture(scene, CW, RUSH_H, RUSH_RED, 50);
  labelTexture(scene, upper(t('rush')), BAND);
  bakePara(scene, t('rushDesc'), BODY, 420);
  bakeFmt(scene, 'rushBest', ['n'], BEST);
  labelTexture(scene, upper(t('start')), BTN);
  bakeButton(scene, 'button', 180, 62, ORANGE);
  // garage
  for (const k of ['vehicles', 'upgrades', 'paints']) labelTexture(scene, upper(t(k)), SECTION);
  for (const c of [USING, KRAFT]) cardTexture(scene, VW, VH, c, 30);
  for (const v of VEHICLES) {
    for (const p of PAINTS) vanIcon(scene, `dd-vanicon-${v.id}-${PAINTS.indexOf(p)}`, p.color, v.id);
    labelTexture(scene, upper(t('v_' + v.id)), V_NAME);
    labelTexture(scene, t('capN', { n: v.capacity }), V_CAP);
    labelTexture(scene, money(v.price), V_BTN);
  }
  for (const k of ['inUse', 'use']) labelTexture(scene, upper(t(k)), V_BTN);
  for (const c of [OWNED, ORANGE, KRAFT]) bakeButton(scene, 'button', 160, 42, c, true);
  bakeButton(scene, 'plate', UW, UH, KRAFT);
  for (const u of UPGRADES) {
    labelTexture(scene, upper(t('up_' + u.id)), U_NAME);
    labelTexture(scene, t('upd_' + u.id), U_DESC);
    for (const c of u.cost) labelTexture(scene, money(c), U_BTN);
  }
  labelTexture(scene, upper(t('maxed')), U_BTN);
  bakeButton(scene, 'button', 140, 50, ORANGE, true);
  for (const p of PAINTS) { labelTexture(scene, money(p.price), P_PRICE); labelTexture(scene, t('p_' + p.id), P_NAME); }
  labelTexture(scene, upper(t('notEnough')), TIP);
  labelTexture(scene, upper(t('back')), BTN);
  bakeButton(scene, 'button', 300, 72, KRAFT);
}

/** The screen behind the map: dusk asphalt blue (a small gradient, scaled up). */
function bgTexture(scene: Phaser.Scene): string {
  return bakeTex(scene, 'dd-map-bg', 8, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#0e1628'); g.addColorStop(0.6, '#16223c'); g.addColorStop(1, '#22304a');
    c.fillStyle = g; c.fillRect(0, 0, 8, 128);
  });
}

const PAD = 14;

/**
 * A shipping label as a card: cream paper with fibres, a coloured band across the top (the
 * district's, the heading sits on it) torn off along a dashed line, a barcode down the right edge
 * and an ink rim. Painted once per size and colour (cached).
 */
function cardTexture(scene: Phaser.Scene, w: number, h: number, band: number, bandH = 56): string {
  const css = (c: number, k = 0) => {
    const f = (v: number) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k));
    return `rgb(${f((c >> 16) & 255)},${f((c >> 8) & 255)},${f(c & 255)})`;
  };
  return bakeTex(scene, `dd-card-${w}x${h}-${band.toString(16)}-${bandH}`, w + PAD * 2, h + PAD * 3, (c) => {
    c.translate(PAD, PAD);
    let seed = w * 7 + h * 13 + band;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const shape = new Path2D(); shape.roundRect(0, 0, w, h, 12);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 12; c.shadowOffsetY = 6;
    c.fillStyle = '#f7f1e3'; c.fill(shape);
    c.restore();
    c.save();
    c.clip(shape);
    for (let i = 0; i < (w * h) / 70; i++) { c.fillStyle = `rgba(90,70,40,${r() * 0.06})`; c.fillRect(r() * w, r() * h, 1.5, 1.5); }
    const g = c.createLinearGradient(0, 0, 0, bandH);
    g.addColorStop(0, css(band, 0.18)); g.addColorStop(1, css(band, -0.12));
    c.fillStyle = g; c.fillRect(0, 0, w, bandH);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, 3);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, bandH - 3, w, 3);
    // the perforation under the band
    c.fillStyle = 'rgba(58,36,16,0.45)';
    for (let x = 8; x < w - 8; x += 12) c.fillRect(x, bandH + 5, 6, 2);
    // a barcode down the right edge (big cards)
    if (h > 120 && w > 300) {
      c.fillStyle = INK;
      let y = bandH + 16;
      while (y < h - 14) { const tt = 1 + Math.floor(r() * 4); c.fillRect(w - 18, y, 9, tt); y += tt + 1 + Math.floor(r() * 4); }
    }
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(58,36,16,0.85)'; c.stroke(shape);
  });
}

/** A shipping-label card as an image centred on (x, y). */
function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, band: number, bandH = 56): Phaser.GameObjects.Image {
  return scene.add.image(x, y + PAD / 2, cardTexture(scene, w, h, band, bandH));
}

/** A van seen from the side, in a paint colour (canvas). */
function vanIcon(scene: Phaser.Scene, key: string, color: number, kind: string): void {
  if (scene.textures.exists(key)) return;
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 96;
  const g = cv.getContext('2d')!;
  const c = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(80, 86, 64, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = c;
  if (kind === 'van') { g.beginPath(); g.roundRect(14, 18, 132, 56, 12); g.fill(); }
  else if (kind === 'flatbed') { g.beginPath(); g.roundRect(96, 22, 50, 52, 10); g.fill(); g.fillStyle = '#8a6a4a'; g.fillRect(14, 54, 86, 16); g.fillStyle = '#c89a5a'; g.fillRect(22, 34, 26, 20); g.fillRect(54, 38, 22, 16); }
  else { g.beginPath(); g.roundRect(100, 14, 46, 60, 10); g.fill(); g.fillStyle = '#e8e2d4'; g.beginPath(); g.roundRect(8, 26, 90, 44, 6); g.fill(); g.fillStyle = c; g.fillRect(8, 62, 90, 10); }
  g.fillStyle = '#bfe6ff';
  g.beginPath(); g.roundRect(kind === 'van' ? 106 : 114, kind === 'truck' ? 22 : 28, 30, 18, 4); g.fill();
  g.fillStyle = '#1e2230';
  for (const x of kind === 'truck' ? [34, 74, 124] : [40, 120]) { g.beginPath(); g.arc(x, 76, 13, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#9aa0b0';
  for (const x of kind === 'truck' ? [34, 74, 124] : [40, 120]) { g.beginPath(); g.arc(x, 76, 5, 0, Math.PI * 2); g.fill(); }
  scene.textures.addCanvas(key, cv);
}

export class MapScene extends Phaser.Scene {
  private meta!: Meta;
  private cells: Cell[] = [];
  private cursor = 0;
  private sel!: Phaser.GameObjects.Graphics;
  private closed = false;
  private from = 'Menu';
  private root!: Phaser.GameObjects.Container;
  private page!: Phaser.GameObjects.Container;
  private tab: 'shifts' | 'garage' = 'shifts';
  private tabs: KitButton[] = [];

  constructor() { super('Map'); }

  create(data: { from?: string; tab?: 'shifts' | 'garage' }): void {
    this.from = data?.from ?? 'Menu';
    this.tab = data?.tab ?? 'shifts';
    this.meta = loadMeta();
    this.closed = false;
    makeArt(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.image(0, 0, bgTexture(this)).setOrigin(0).setDisplaySize(width, height).setInteractive());
    this.root.add(frameBorder(this));
    this.root.add(fit(labelAt(this, width / 2, 54, upper(t('mapTitle')), TITLE), width - 120));
    // wallet and stars on a cardboard plate
    const row = this.add.container(width / 2, 112);
    row.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', 460, 60, 'up', KRAFT)));
    const cash = new GlyphText(this, 0, 0, '', WALLET, 0);
    const starTxt = new GlyphText(this, 0, 0, `${totalStars(this.meta)}/54`, WALLET, 0);
    const coin = this.add.image(0, 0, 'dd-coin').setDisplaySize(36, 36);
    const star = this.add.image(0, 0, 'icon-star').setDisplaySize(34, 34).setTint(0xffd23f);
    row.add([coin, cash, star, starTxt]);
    this.root.add(row);
    const layoutRow = () => {
      cash.setText(money(this.meta.cash));
      const wAll = 36 + 8 + cash.textWidth + 40 + 34 + 8 + starTxt.textWidth;
      let x = -wAll / 2;
      coin.x = x + 18; x += 44;
      cash.x = x; x += cash.textWidth + 40;
      star.x = x + 17; x += 42;
      starTxt.x = x;
    };
    layoutRow();
    this.events.on('cash', layoutRow);
    // tabs: the open one orange with a yellow ring, the other plain cardboard
    this.tabs = [
      new KitButton(this, width / 2 - 160, 186, { w: 300, h: 68, color: KRAFT, label: upper(t('tabShifts')), style: TAB, sfx: null }, () => this.setTab('shifts')),
      new KitButton(this, width / 2 + 160, 186, { w: 300, h: 68, color: KRAFT, label: upper(t('tabGarage')), style: TAB, sfx: null }, () => this.setTab('garage')),
    ];
    this.root.add(this.tabs);
    const back = new KitButton(this, width / 2, 1218, { w: 300, h: 72, color: KRAFT, label: upper(t('back')), style: BTN }, () => this.close());
    this.root.add(back);
    this.page = this.add.container(0, 0);
    this.root.add(this.page);
    this.sel = this.add.graphics();
    this.root.add(this.sel);
    this.build();

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move(1, 0);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.move(-1, 0);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.move(0, 1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.move(0, -1);
      else if (e.code === 'Enter' || e.code === 'Space') this.cells[this.cursor]?.act();
      else if (e.code === 'Tab' || e.code === 'KeyG') { e.preventDefault(); this.setTab(this.tab === 'shifts' ? 'garage' : 'shifts'); }
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private setTab(tab: 'shifts' | 'garage'): void {
    if (this.tab === tab) return;
    this.tab = tab;
    playSfx(this, 'tick', { volume: 0.3 });
    this.build();
  }

  private build(): void {
    this.page.removeAll(true);
    this.cells = [];
    this.tabs[0].setLook(this.tab === 'shifts' ? ORANGE : KRAFT, this.tab === 'shifts');
    this.tabs[1].setLook(this.tab === 'garage' ? ORANGE : KRAFT, this.tab === 'garage');
    if (this.tab === 'shifts') this.buildShifts(); else this.buildGarage();
    this.cursor = Math.min(this.cursor, this.cells.length - 1);
    if (this.tab === 'shifts') this.cursor = Math.max(0, this.cells.findIndex((c) => c.box.getData('cur')));
    this.drawCursor();
  }

  // ------------------------------------------------------------------ shifts

  private buildShifts(): void {
    const { width } = this.scale;
    DISTRICTS.forEach((d, di) => {
      const y = 360 + di * 262;
      const open = districtOpen(this.meta, d.id);
      const box = this.add.container(width / 2, y);
      const face = card(this, 0, 0, CW, CH, DIST_COLORS[di]);
      if (!open) face.setTint(0xc8c0b4);
      box.add(face);
      const hy = -CH / 2 + 28;
      box.add(fit(labelAt(this, -CW / 2 + 24, hy, upper(t('d' + d.id)), BAND, 0), 330));
      const list = SHIFTS.filter((s) => s.district === d.id);
      const got = list.reduce((s, q) => s + (this.meta.stars[q.id] ?? 0), 0);
      if (open) {
        box.add(this.add.image(CW / 2 - 108, hy, 'icon-star').setDisplaySize(28, 28).setTint(0xffd23f));
        box.add(new GlyphText(this, CW / 2 - 88, hy, `${got}/18`, BAND_NUM, 0));
      } else {
        const need = fit(labelAt(this, CW / 2 - 24, hy, needKey(di), NEED, 1), 260);
        box.add(need);
        box.add(this.add.image(need.x - need.displayWidth - 22, hy, 'icon-locked').setDisplaySize(26, 26));
      }
      this.page.add(box);
      list.forEach((s, k) => {
        const col = k % 3, rowI = Math.floor(k / 3);
        const x = width / 2 - 210 + col * 210, yy = y - 30 + rowI * 98;
        const sOpen = open && shiftOpen(this.meta, s.id);
        const cur = this.meta.mode === 'shift' && this.meta.shift === s.id;
        const act = () => this.pickShift(s.id, sOpen, tile);
        const tile = new KitButton(this, x, yy, { w: TILE_W, h: TILE_H, color: cur ? ORANGE : KRAFT, on: cur, tapWhenOff: true, sfx: null, style: TILE }, act);
        if (!sOpen) tile.setEnabled(false);
        if (sOpen) tile.setLabel(upper(t('shiftN', { n: s.id })), -2);
        else tile.addContent(this.add.image(0, -2, 'icon-locked').setDisplaySize(30, 30).setAlpha(0.85));
        const st = this.meta.stars[s.id] ?? 0;
        for (let q = 0; q < 3; q++) tile.add(this.add.image(-24 + q * 24, 43, 'icon-star').setDisplaySize(22, 22).setTint(q < st ? 0xf2b81c : 0xcdbf9f));
        tile.setData('cur', cur);
        tile.setHit(196, 96, 0, 12);
        this.page.add(tile);
        this.cells.push({ x, y: yy, w: 200, h: 76, act, box: tile });
      });
    });
    // the Endless Rush
    const ry = 1098;
    const rush = this.add.container(width / 2, ry);
    rush.add(card(this, 0, 0, CW, RUSH_H, RUSH_RED, 50));
    if (this.meta.mode === 'rush') rush.add(this.add.graphics().lineStyle(5, 0xffd23f, 1).strokeRoundedRect(-CW / 2 - 4, -RUSH_H / 2 - 4, CW + 8, RUSH_H + 8, 16));
    rush.add(fit(labelAt(this, -CW / 2 + 24, -RUSH_H / 2 + 25, upper(t('rush')), BAND, 0), 380));
    rush.add(new FmtLine(this, CW / 2 - 24, -RUSH_H / 2 + 26, BEST, 1).set('rushBest', { n: money(getBest('delivery-dash')) }));
    rush.add(new Para(this, -CW / 2 + 24, -12, t('rushDesc'), BODY, 420, 0, 23));
    const goAct = () => this.pickRush();
    const go = new KitButton(this, CW / 2 - 110, 30, { w: 180, h: 62, color: ORANGE, label: upper(t('start')), style: BTN, sfx: null }, goAct);
    rush.add(go);
    rush.setData('cur', this.meta.mode === 'rush');
    this.page.add(rush);
    this.cells.push({ x: width / 2 + CW / 2 - 110, y: ry + 30, w: 196, h: 76, act: goAct, box: rush });
  }

  private pickShift(id: number, open: boolean, box: Phaser.GameObjects.Container): void {
    if (this.closed) return;
    this.cursor = this.cells.findIndex((c) => c.box === box);
    this.drawCursor();
    if (!open) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: box, x: box.x + 8, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    this.meta.mode = 'shift';
    this.meta.shift = id;
    saveMeta(this.meta);
    this.startPlay();
  }

  private pickRush(): void {
    if (this.closed) return;
    this.meta.mode = 'rush';
    saveMeta(this.meta);
    this.startPlay();
  }

  private startPlay(): void {
    playSfx(this, 'ui-select');
    this.closed = true;
    this.scene.stop(this.from);
    this.scene.start('Play');
  }

  // ------------------------------------------------------------------ garage

  private buildGarage(): void {
    const { width } = this.scale;
    const m = this.meta;
    const section = (y: number, key: string) => this.page.add(labelAt(this, 40, y, upper(t(key)), SECTION, 0));
    // vehicles
    section(250, 'vehicles');
    VEHICLES.forEach((v, i) => {
      const x = width / 2 - 220 + i * 220, y = 380;
      const owned = m.vehicles.includes(v.id), using = m.vehicle === v.id;
      const act = () => this.vehicleAct(v.id, box);
      const box = this.add.container(x, y);
      box.add(card(this, 0, 0, VW, VH, using ? USING : KRAFT, 30));
      if (using) box.add(this.add.graphics().lineStyle(4, 0xffd23f, 1).strokeRoundedRect(-VW / 2 - 3, -VH / 2 - 3, VW + 6, VH + 6, 14));
      box.add(this.add.image(0, -40, `dd-vanicon-${v.id}-${m.paint}`).setDisplaySize(150, 90));
      box.add(fit(labelAt(this, 0, 18, upper(t('v_' + v.id)), V_NAME), VW - 20));
      box.add(labelAt(this, 0, 44, t('capN', { n: v.capacity }), V_CAP));
      const btn = new KitButton(this, 0, 78, { w: 160, h: 42, color: using ? KRAFT : owned ? OWNED : ORANGE, label: using ? upper(t('inUse')) : owned ? upper(t('use')) : money(v.price), style: V_BTN, sfx: null }, act);
      if (using) btn.setEnabled(false);
      box.add(btn);
      box.setSize(VW, VH).setInteractive({ useHandCursor: true });
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x, y, w: 212, h: 218, act, box });
    });
    // upgrades
    section(522, 'upgrades');
    UPGRADES.forEach((u, i) => {
      const y = 584 + i * 92;
      const lvl = m.up[u.id];
      const act = () => this.upgradeAct(u.id, box);
      const box = this.add.container(width / 2, y);
      box.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', UW, UH, 'up', KRAFT)));
      box.add(fit(labelAt(this, -306, -14, upper(t('up_' + u.id)), U_NAME, 0), 330));
      box.add(fit(labelAt(this, -306, 18, t('upd_' + u.id), U_DESC, 0), 330));
      const pips = this.add.graphics();
      for (let q = 0; q < u.max; q++) {
        pips.fillStyle(0x3a2410, 0.55).fillRoundedRect(58 + q * 30, -11 + 3, 22, 22, 5);
        pips.fillStyle(q < lvl ? 0xffd23f : 0x8a6440, 1).fillRoundedRect(58 + q * 30, -11, 22, 22, 5);
        pips.lineStyle(2, 0x3a2410, 0.9).strokeRoundedRect(58 + q * 30, -11, 22, 22, 5);
      }
      box.add(pips);
      const max = lvl >= u.max;
      const btn = new KitButton(this, 248, 0, { w: 140, h: 50, color: ORANGE, label: max ? upper(t('maxed')) : money(u.cost[lvl]), style: U_BTN, sfx: null, tapWhenOff: true }, act);
      if (max) btn.setEnabled(false);
      box.add(btn);
      box.setSize(UW, UH).setInteractive({ useHandCursor: true });
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x: width / 2 + 248, y, w: 150, h: 62, act, box });
    });
    // paints
    section(970, 'paints');
    PAINTS.forEach((p, i) => {
      const x = width / 2 - 270 + i * 90, y = 1040;
      const owned = m.paints.includes(i), using = m.paint === i;
      const act = () => this.paintAct(i, box);
      const box = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.35).fillCircle(0, 5, 34);
      g.fillStyle(p.color, 1).fillCircle(0, 0, 34);
      g.fillStyle(0xffffff, 0.22).fillEllipse(-8, -14, 30, 14);
      g.lineStyle(using ? 5 : 3, using ? 0xffd23f : 0xe0c9a6, 1).strokeCircle(0, 0, 34);
      box.add(g);
      box.add(fit(labelAt(this, 0, 54, owned ? t('p_' + p.id) : money(p.price), owned ? P_NAME : P_PRICE), 88));
      box.setSize(84, 110).setInteractive({ useHandCursor: true });
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x, y, w: 80, h: 80, act, box });
    });
  }

  private pay(price: number, box: Phaser.GameObjects.Container): boolean {
    if (this.meta.cash < price) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: box, x: box.x + 8, duration: 50, yoyo: true, repeat: 2 });
      const tip = labelAt(this, this.scale.width / 2, box.y - 70, upper(t('notEnough')), TIP);
      this.page.add(tip);
      this.tweens.add({ targets: tip, y: tip.y - 30, alpha: 0, delay: 800, duration: 400, onComplete: () => tip.destroy() });
      return false;
    }
    this.meta.cash -= price;
    saveMeta(this.meta);
    playSfx(this, 'dd-till', { volume: 0.5, exact: true });
    burst(this, box.x, box.y, [0xffd23f, 0xffffff], 24, 260);
    this.events.emit('cash');
    return true;
  }

  private vehicleAct(id: (typeof VEHICLES)[number]['id'], box: Phaser.GameObjects.Container): void {
    const m = this.meta;
    if (!m.vehicles.includes(id)) {
      if (!this.pay(vehicle(id).price, box)) return;
      m.vehicles.push(id);
    }
    m.vehicle = id;
    saveMeta(m);
    playSfx(this, 'tick', { volume: 0.4 });
    this.rebuild(box);
  }

  private upgradeAct(id: (typeof UPGRADES)[number]['id'], box: Phaser.GameObjects.Container): void {
    const u = UPGRADES.find((q) => q.id === id)!;
    const lvl = this.meta.up[id];
    if (lvl >= u.max) { playSfx(this, 'error', { volume: 0.3 }); return; }
    if (!this.pay(u.cost[lvl], box)) return;
    this.meta.up[id] = lvl + 1;
    saveMeta(this.meta);
    this.rebuild(box);
  }

  private paintAct(i: number, box: Phaser.GameObjects.Container): void {
    const m = this.meta;
    if (!m.paints.includes(i)) {
      if (!this.pay(PAINTS[i].price, box)) return;
      m.paints.push(i);
    }
    m.paint = i;
    saveMeta(m);
    playSfx(this, 'tick', { volume: 0.4 });
    this.rebuild(box);
  }

  /** Redraws the page, keeping the cursor on the same cell. */
  private rebuild(box: Phaser.GameObjects.Container): void {
    const i = this.cells.findIndex((c) => c.box === box);
    this.build();
    if (i >= 0) { this.cursor = i; this.drawCursor(); }
  }

  // ------------------------------------------------------------------ cursor

  private move(dx: number, dy: number): void {
    const c = this.cells[this.cursor];
    if (!c) return;
    // the nearest cell in that direction
    let best = -1, bd = Infinity;
    this.cells.forEach((q, i) => {
      if (i === this.cursor) return;
      const vx = q.x - c.x, vy = q.y - c.y;
      if (dx && Math.sign(vx) !== dx) return;
      if (dy && Math.sign(vy) !== dy) return;
      if (dx && Math.abs(vy) > 60) return;
      const d = Math.abs(vx) * (dy ? 0.6 : 1) + Math.abs(vy) * (dx ? 3 : 1);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return;
    this.cursor = best;
    playSfx(this, 'tick', { volume: 0.3 });
    this.drawCursor();
  }

  private drawCursor(): void {
    const c = this.cells[this.cursor];
    const g = this.sel.clear();
    if (!c) return;
    g.lineStyle(5, 0xffd23f, 1).strokeRoundedRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, 24);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        this.scene.resume(this.from);
        this.scene.get(this.from).events.emit('map-closed');
      },
    });
  }

  /** Test hooks: plays a shift (or 'rush'); opens a tab. */
  testChoose(id: number | 'rush'): void { if (id === 'rush') this.pickRush(); else this.pickShift(id, true, this.cells[0].box); }
  testTab(tab: 'shifts' | 'garage'): void { this.setTab(tab); }
}
