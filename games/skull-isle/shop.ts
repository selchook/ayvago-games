// Skull Isle: the overlays between islands, drawn over the frozen beach inside the Play scene.
//   - The dock shop: the island's loot buys levels of seven crew upgrades and a patch-up (CREW
//     tab), and of six ship upgrades and the shipwright's repair (SHIP tab); SET SAIL goes on.
//   - The boon draft (after a boss): a free pick of one of three lasting boons.
//   - The sea chart: two routes to the next island (calm waters or a stormy passage).
// Touch: tap a tile or a tab. Keyboard: arrows to pick, Enter to buy or sail, Tab to switch tabs
// (1/2/3 in the draft, 1/2 on the chart).
import Phaser from 'phaser';
import { txt, t, getLang } from '@core';
import type { Sim } from './sim';
import { SHOP_IDS, SHOP_COST, PATCH, SHIP_IDS, SHIP_COST, shipStats, REPAIR, type ShopId, type ShipId, type BoonId } from './upgrades';
import { shopArt, boonArt, shipArt, routeArt, GOLD, SHIP } from './art';
import { BOON_SYM } from './art';
import { glass, Pill } from './ui';
import { chartTexture, compassRose, rhumbLines, inkIsland, serpent, shipDoodle, stormDoodle, waves, xMark, scrollBanner, dashedPath, INK, INK_N, RED_INK, BLUE_INK } from './chart';
import { ISLAND_IDS, ROUTES, type Route } from './defs';

export const OVERLAY_DEPTH = 9600;

/** One decimal, with the locale's separator (6,2 in Turkish). */
const dec = (v: number): string => (getLang() === 'tr' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));

type Item = ShopId | 'patch' | ShipId | 'repair' | 'sail' | 'tabCrew' | 'tabShip';
type Tab = 'crew' | 'ship';
const isShip = (id: Item): id is ShipId => (SHIP_IDS as string[]).includes(id);

interface Parts { bg: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; coin: Phaser.GameObjects.Image; pips: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Text; next: Phaser.GameObjects.Text | null }
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
  private goldText: Phaser.GameObjects.Text;
  private sail: Pill;
  private tabs: Record<Tab, Pill>;
  tab: Tab = 'crew';
  done = false;

  constructor(private scene: Phaser.Scene, private sim: Sim, private host: OverlayHost, private onSail: () => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(OVERLAY_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x040a10, 0.62).setOrigin(0).setInteractive();
    this.root.add(dim);
    const panel = scene.add.container(width / 2, 650);
    panel.add(glass(scene, 690, 1060, { alpha: 0.95, r: 30 }));
    this.root.add(panel);
    this.root.add(txt(scene, width / 2, 172, t('shopTitle'), { title: true, size: 46, color: '#ffd23f', strokeThickness: 8 }));
    const next = ISLAND_IDS[(sim.k + 1) % ISLAND_IDS.length];
    this.root.add(txt(scene, width / 2, 224, t('shopSub') + '  ·  ' + t('sailing', { name: t('i_' + next) }), { size: 21, color: '#d8e6f0', strokeThickness: 0, shadow: false, wrap: 640 }));
    // the purse
    const chip = scene.add.container(width / 2, 280);
    chip.add(scene.add.graphics().fillStyle(0x06121a, 0.85).fillRoundedRect(-110, -27, 220, 54, 27).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-110, -27, 220, 54, 27));
    chip.add(scene.add.image(-64, 0, GOLD).setDisplaySize(40, 40));
    this.goldText = txt(scene, 14, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.goldText);
    this.root.add(chip);
    // the tabs: the crew's upgrades, the ship's
    this.tabs = {
      crew: new Pill(scene, width / 2 - 122, 352, 228, 62, 0x2a3a4a, () => this.setTab('crew'), 26),
      ship: new Pill(scene, width / 2 + 122, 352, 228, 62, 0x2a3a4a, () => this.setTab('ship'), 26),
    };
    this.tabs.crew.setLabels(t('tabCrew'));
    this.tabs.ship.setLabels(t('tabShip')).setIcon(SHIP, 34);
    this.root.add([this.tabs.crew, this.tabs.ship]);
    this.fixed.push({ id: 'tabCrew', x: width / 2 - 122, y: 352, w: 228, h: 62, box: this.tabs.crew, parts: null });
    this.fixed.push({ id: 'tabShip', x: width / 2 + 122, y: 352, w: 228, h: 62, box: this.tabs.ship, parts: null });
    this.grid = scene.add.container(0, 0);
    this.root.add(this.grid);
    this.sail = new Pill(scene, width / 2, 1110, 360, 94, 0x2f8ad0, () => this.leave(), 32);
    this.sail.setLabels(t('setSail'));
    this.root.add(this.sail);
    this.fixed.push({ id: 'sail', x: width / 2, y: 1110, w: 360, h: 94, box: this.sail, parts: null });
    if (!host.touch) this.root.add(txt(scene, width / 2, 1186, t('shopKeys2'), { size: 18, color: '#9fb0c0', strokeThickness: 0, shadow: false }));
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
    const { width } = this.scene.scale;
    const items: Item[] = tab === 'crew' ? [...SHOP_IDS, 'patch'] : [...SHIP_IDS, 'repair'];
    const w = 312, h = 150, gx = 16, gy = 14;
    items.forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.tile(id, width / 2 + (col ? 1 : -1) * (w + gx) / 2, 470 + row * (h + gy), w, h);
    });
  }

  private tile(id: Item, x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const box = s.add.container(x, y);
    const bg = s.add.graphics();
    const ship = isShip(id) || id === 'repair';
    const art = ship ? shipArt(id as ShipId | 'repair') : shopArt(id as ShopId | 'patch');
    const icon = s.add.image(-w / 2 + 52, -10, art).setDisplaySize(74, 74);
    const name = txt(s, -w / 2 + 100, -h / 2 + 26, t((ship ? 'sh_' : 's_') + id), { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    if (name.width > w - 112) name.setScale((w - 112) / name.width);
    const desc = txt(s, -w / 2 + 100, -h / 2 + 46, t((ship ? 'shd_' : 'sd_') + id), ship ? { size: 17, color: '#d8e6f0', strokeThickness: 0, shadow: false, align: 'left' } : { size: 17, color: '#d8e6f0', strokeThickness: 0, shadow: false, wrap: w - 112, align: 'left' }).setOrigin(0, 0);
    let next: Phaser.GameObjects.Text | null = null;
    if (ship) {
      // one line of what it does, then what it is now and what the next level makes it
      if (desc.width > w - 112) desc.setScale((w - 112) / desc.width);
      next = txt(s, -w / 2 + 100, 18, '', { title: true, size: 18, color: '#9fe8ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    }
    const pips = s.add.graphics();
    const coin = s.add.image(0, h / 2 - 24, GOLD).setDisplaySize(26, 26);
    const cost = txt(s, 0, h / 2 - 23, '', { title: true, size: 22, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const state = txt(s, w / 2 - 70, h / 2 - 23, '', { title: true, size: 18, color: '#7affc0', strokeThickness: 0, shadow: false });
    const hit = s.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, icon, name, desc, pips, coin, cost, state, hit]);
    if (next) box.add(next);
    this.grid.add(box);
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    hit.on('pointerup', () => { this.focus = this.tiles.findIndex((tl) => tl.id === id); this.buy(); });
    this.tiles.push({ id, x, y, w, h, box, parts: { bg, cost, coin, pips, state, next } });
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

  /** "now → next" for a ship upgrade (or the repair). */
  private nextText(id: ShipId | 'repair'): string {
    const sim = this.sim;
    if (id === 'repair') {
      const max = sim.shipSt.maxHull;
      return t('shn_repair', { a: `${Math.round(sim.hull)}/${max}`, b: `${Math.min(max, Math.round(sim.hull + max * REPAIR))}/${max}` });
    }
    const lv = sim.shipLv[id] ?? 0;
    const now = sim.shipSt;
    if (lv >= SHIP_COST[id].length) {
      const v = this.statOf(id, now);
      return t('shn_' + id, { a: v, b: v });
    }
    const nx = shipStats({ ...sim.shipLv, [id]: lv + 1 }, sim.tune);
    return t('shn_' + id, { a: this.statOf(id, now), b: this.statOf(id, nx) });
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
      this.tabs[tb].setColor(on ? 0xd8902a : 0x2a3a4a).setScale(foc ? 1.07 : 1);
      this.tabs[tb].main.setColor(on ? '#ffffff' : '#9fb0c0');
    }
    this.tiles.forEach((tl, i) => {
      const on = i === this.focus;
      if (tl.id === 'sail') { this.sail.setScale(on && !this.host.touch ? 1.06 : 1); this.sail.setColor(on && !this.host.touch ? 0x3aa0f0 : 0x2f8ad0); return; }
      if (!tl.parts) return;
      const { bg, cost, coin, pips, state, next } = tl.parts;
      const st = this.state(tl.id);
      const { w, h } = tl;
      const frame = st === 'ok' ? 0x5ad08a : st === 'poor' ? 0x5a6a7a : 0x7ab8ff;
      bg.clear()
        .fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18)
        .fillStyle(st === 'poor' ? 0x0e161e : 0x14242e, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 18)
        .lineStyle(on ? 5 : 3, on ? 0xfff3a0 : frame, on ? 1 : 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      const c = this.price(tl.id);
      const label = st === 'max' ? t('maxed') : st === 'full' ? t('full') : st === 'done' ? t('bought') : '';
      state.setText(label).setVisible(!!label);
      cost.setText(c !== null ? String(c) : '').setVisible(!label).setColor(st === 'poor' ? '#c08a7a' : '#ffe68a');
      coin.setVisible(!label);
      coin.setX(w / 2 - 34 - cost.width - 18);
      cost.setX(coin.x + 16);
      state.setX(w / 2 - 20 - state.width / 2);
      if (next && (isShip(tl.id) || tl.id === 'repair')) {
        next.setText(this.nextText(tl.id as ShipId | 'repair'));
        next.setScale(1);
        if (next.width > w - 112) next.setScale((w - 112) / next.width);
      }
      // level pips
      pips.clear();
      if (tl.id === 'patch' || tl.id === 'repair') {
        pips.fillStyle(0x7affa0, 0.25).fillRoundedRect(-w / 2 + 100, h / 2 - 27, 100 * (tl.id === 'patch' ? PATCH : REPAIR) * 2.5, 8, 4);
      } else {
        const ship = isShip(tl.id);
        const max = ship ? SHIP_COST[tl.id as ShipId].length : SHOP_COST[tl.id as ShopId].length;
        const n = ship ? this.sim.shipLv[tl.id as ShipId] ?? 0 : this.sim.shop[tl.id as ShopId] ?? 0;
        const pw = 16, gap = 5;
        for (let k = 0; k < max; k++) pips.fillStyle(k < n ? (ship ? 0x9fe8ff : 0xfff07a) : 0x2a3a48, 1).fillRoundedRect(-w / 2 + 100 + k * (pw + gap), h / 2 - 27, pw, 8, 4);
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
    const cur = this.tiles[this.focus];
    let best = -1, bd = Infinity;
    this.tiles.forEach((tl, i) => {
      if (i === this.focus) return;
      const ddx = tl.x - cur.x, ddy = tl.y - cur.y;
      if (dx && (Math.sign(ddx) !== dx || Math.abs(ddy) > 20)) return;
      if (dy && (Math.sign(ddy) !== dy || Math.abs(ddy) < 20)) return;
      const d = Math.abs(ddx) * (dy ? 0.3 : 1) + Math.abs(ddy) * (dy ? 1 : 3);
      if (d < bd) { bd = d; best = i; }
    });
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

/** The sea chart: two routes to the next island, side by side on a card each. */
/** The sea chart's routes in screen space: from the island just raided to the next (calm above, storm below). */
const ROUTE_PTS: Record<Route, [number, number][]> = {
  calm: [[176, 452], [250, 340], [372, 282], [500, 262], [548, 280]],
  storm: [[182, 476], [290, 500], [380, 452], [452, 470], [520, 400], [560, 310]],
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
    const ox = 14, oy = 10;
    const key = chartTexture(scene, ghost ? 'si-chart-sea-g' : 'si-chart-sea', width - ox * 2, height - oy * 2, ghost ? 977 : 976, (g, r) => {
      const at = (x: number, y: number): [number, number] => [x - ox, y - oy];
      rhumbLines(g, ...at(118, 262), 1400, 0.13);
      for (let i = 0; i < 9; i++) waves(g, ...at(150 + (i % 3) * 210, 230 + Math.floor(i / 3) * 120), 3, r);
      inkIsland(g, ...at(132, 476), 52, r, { palms: 2 });
      inkIsland(g, ...at(586, 262), 66, r, { palms: 2 });
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
      stormDoodle(g, ...at(420, 520), 0.9);
      serpent(g, ...at(300, 548), 0.5, -1);
      if (ghost) shipDoodle(g, ...at(470, 540), 0.6, -1, true);
      xMark(g, ...at(600, 262), 15);
      compassRose(g, ...at(118, 262), 46);
      scrollBanner(g, ...at(width / 2, 116), 440, 62);
      // the cards' places: two lighter panels of parchment
      for (const y of [722, 980]) {
        g.save();
        g.fillStyle = 'rgba(255,248,225,0.35)';
        g.strokeStyle = 'rgba(58,34,16,0.5)'; g.lineWidth = 1.5;
        g.beginPath(); g.roundRect(...at(40, y - 115), 640, 230, 22); g.fill(); g.stroke();
        g.restore();
      }
    });
    this.root.add(scene.add.image(width / 2, height / 2, key));
    this.routes = scene.add.graphics();
    this.root.add(this.routes);
    this.root.add(scene.add.image(176, 438, SHIP).setDisplaySize(56, 56));
    this.root.add(txt(scene, width / 2, 116, t('chartTitle'), { title: true, size: 40, color: '#7a1e12', strokeThickness: 0, shadow: false }));
    const nextId = ISLAND_IDS[(sim.k + 1) % ISLAND_IDS.length];
    this.root.add(txt(scene, width / 2, 172, t('chartSub', { name: t('i_' + nextId) }), { size: 23, color: INK, strokeThickness: 0, shadow: false, wrap: 600 }));
    const low = sim.hull < sim.shipSt.maxHull * 0.4;
    this.root.add(txt(scene, width / 2, 576, t('hullNow', { n: Math.round(sim.hull), max: sim.shipSt.maxHull }), { title: true, size: 22, color: low ? '#a3202a' : INK, strokeThickness: 0, shadow: false }));
    // the routes' numbers on the chart
    for (const [i, id] of ROUTES.entries()) {
      const [x, y] = ROUTE_PTS[id][2];
      const b = scene.add.graphics().fillStyle(0xf3e3b8, 1).fillCircle(x, y - 26, 16).lineStyle(2.5, id === 'calm' ? BLUE_INK : INK_N, 1).strokeCircle(x, y - 26, 16);
      this.root.add([b, txt(scene, x, y - 25, String(i + 1), { title: true, size: 18, color: id === 'calm' ? '#1f5a8a' : INK, strokeThickness: 0, shadow: false })]);
    }
    ROUTES.forEach((id, i) => {
      const y = 722 + i * 258;
      const box = scene.add.container(width / 2, y);
      const bg = scene.add.graphics();
      const icon = scene.add.image(-222, 0, routeArt(id)).setDisplaySize(140, 140);
      const name = txt(scene, -132, -52, t('r_' + id), { title: true, size: 32, color: id === 'calm' ? '#1f5a8a' : '#3a3a48', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
      const desc = txt(scene, -132, -22, t('rd_' + id), { size: 22, color: INK, strokeThickness: 0, shadow: false, wrap: 410, align: 'left' }).setOrigin(0, 0);
      box.add([bg, icon, name, desc]);
      if (id === 'storm' && ghost) box.add(txt(scene, -132, 70, t('rd_ghost'), { title: true, size: 20, color: '#a3202a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      const num = scene.add.container(272, -82);
      num.add([scene.add.graphics().fillStyle(0xf3e3b8, 1).fillCircle(0, 0, 18).lineStyle(2.5, id === 'calm' ? BLUE_INK : INK_N, 1).strokeCircle(0, 0, 18), txt(scene, 0, 1, String(i + 1), { title: true, size: 19, color: id === 'calm' ? '#1f5a8a' : INK, strokeThickness: 0, shadow: false })]);
      const hit = scene.add.zone(0, 0, 640, 230).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
      hit.on('pointerover', () => { if (!this.done && this.focus !== i) { this.focus = i; this.refresh(); } });
      hit.on('pointerup', () => this.pick(i));
      box.add([num, hit]);
      box.setScale(0.6).setAlpha(0);
      scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, delay: 120 + i * 120, ease: 'Back.easeOut', onStart: () => host.sfx('card', 0.4) });
      this.root.add(box);
      this.cards.push({ box, bg, id });
    });
    if (!host.touch) this.root.add(txt(scene, width / 2, 1180, t('chartKeys'), { size: 19, color: INK, strokeThickness: 0, shadow: false }));
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
    this.cards.forEach((c, i) => {
      const on = i === this.focus;
      const ink = c.id === 'calm' ? BLUE_INK : INK_N;
      c.bg.clear()
        .fillStyle(0x3a2210, 0.18).fillRoundedRect(-316, -108, 640, 230, 22)
        .fillStyle(0xf3e3b8, 0.97).fillRoundedRect(-320, -115, 640, 230, 22)
        .fillStyle(c.id === 'calm' ? 0x9fc8e8 : 0xa8a8b4, 0.22).fillRoundedRect(-316, -111, 632, 84, { tl: 18, tr: 18, bl: 6, br: 6 })
        .lineStyle(on ? 6 : 3, on ? RED_INK : ink, on ? 1 : 0.75).strokeRoundedRect(-320, -115, 640, 230, 22)
        .lineStyle(1, 0x3a2210, 0.45).strokeRoundedRect(-310, -105, 620, 210, 16);
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
    this.root.add(txt(scene, width / 2, 250, t('draftTitle'), { title: true, size: 50, color: '#ffd23f', strokeThickness: 9 }));
    this.root.add(txt(scene, width / 2, 312, t('draftSub'), { size: 24, color: '#e6f0f8', strokeThickness: 4, wrap: 640 }));
    boons.forEach((id, i) => {
      const y = 470 + i * 230;
      const box = scene.add.container(width / 2, y);
      const bg = scene.add.graphics();
      const hue = BOON_SYM[id][1];
      const icon = scene.add.image(-220, 0, boonArt(id)).setDisplaySize(130, 130);
      const name = txt(scene, -130, -34, t('bn_' + id), { title: true, size: 32, color: '#' + hue.toString(16).padStart(6, '0'), strokeThickness: 6 }).setOrigin(0, 0.5);
      const desc = txt(scene, -130, 4, t('bd_' + id), { size: 23, color: '#eef4f8', strokeThickness: 0, shadow: false, wrap: 400, align: 'left' }).setOrigin(0, 0);
      const num = txt(scene, 270, -62, String(i + 1), { title: true, size: 22, color: '#9fb0c0', strokeThickness: 0, shadow: false });
      if (host.touch) num.setVisible(false);
      const hit = scene.add.zone(0, 0, 620, 200).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
      hit.on('pointerup', () => this.pick(i));
      box.add([bg, icon, name, desc, num, hit]);
      box.setScale(0.6).setAlpha(0);
      scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, delay: 120 + i * 110, ease: 'Back.easeOut', onStart: () => host.sfx('card', 0.4) });
      this.root.add(box);
      this.cards.push({ box, bg, y, id });
    });
    if (!host.touch) this.root.add(txt(scene, width / 2, 1180, t('draftKeys'), { size: 19, color: '#9fb0c0', strokeThickness: 0, shadow: false }));
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => {
      const on = i === this.focus && !this.host.touch;
      const hue = BOON_SYM[c.id][1];
      c.bg.clear()
        .fillStyle(0x000000, 0.35).fillRoundedRect(-310, -100 + 8, 620, 200, 26)
        .fillStyle(0x10202c, 0.96).fillRoundedRect(-310, -100, 620, 200, 26)
        .fillStyle(hue, 0.12).fillRoundedRect(-306, -96, 612, 80, { tl: 22, tr: 22, bl: 6, br: 6 })
        .lineStyle(on ? 6 : 3, on ? 0xfff3a0 : hue, on ? 1 : 0.7).strokeRoundedRect(-310, -100, 620, 200, 26);
    });
  }

  key(code: string): boolean {
    if (this.done) return false;
    if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { this.pick(Number(code.slice(5)) - 1); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { this.focus = (this.focus + 2) % 3; this.host.sfx('move', 0.3); this.refresh(); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { this.focus = (this.focus + 1) % 3; this.host.sfx('move', 0.3); this.refresh(); return true; }
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
