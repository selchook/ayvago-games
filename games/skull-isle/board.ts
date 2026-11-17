// Skull Isle: the treasure map, a scene of its own opened from the menu (the menu waits under it,
// so its keys do not start a run). Doubloons buy ten lasting nodes in two trails (a node needs the
// one above it) and free Captain Barbarossa. Mouse, touch and keyboard. It is drawn as an old
// pirate chart (chart.ts): burnt parchment, a compass rose and rhumb lines, every node an inked
// island, the trails dashed routes in red ink, a sea serpent and a ship, an X where the treasure lies.
// Its words are in the menu theme's Pirata One, its purse, info board and buttons the theme's
// planks (menu.ts); the chart and every word are painted under the Ayvago intro (`prebakeBoard`,
// from main.ts), so opening the map only places images.
// 1.3 (landscape): the two trails run left to right across the chart, Barbarossa's spot under them;
// a side panel on the right holds the purse, the picked node's plank with BUY, and BACK.
import Phaser from 'phaser';
import {
  t, playSfx, labelTexture, skinTexture, menuTheme, SKIN_PAD, bakeButton, bakePara, glyphAtlas, labelAt,
  fitWidth, GlyphText, Para, KitButton, type LabelStyle,
} from '@core';
import { NODES, NODE, BARBAROSSA_COST, type NodeId } from './upgrades';
import { loadMeta, saveMeta, nodeState, buyNode, buyBarbarossa, type Meta } from './meta';
import { nodeArt, DOUBLOON, LOCK, makeArt } from './art';
import { stepFocus } from './shop';
import { chartTexture, compassRose, rhumbLines, inkIsland, serpent, shipDoodle, waves, xMark, scrollBanner, dashedPath, RED_INK } from './chart';

type Item = { kind: 'node'; id: NodeId } | { kind: 'hero' };
interface Spot { item: Item; x: number; y: number; box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; cost: GlyphText; costPoor: GlyphText; coin: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image; state: Phaser.GameObjects.Image }

const INK = '#3a2210';
/** The trails' rows (a node's col), the nodes along them (its row), the chart's middle. */
const ROWY = [270, 450];
const X0 = 110, DX = 160;
const MAP_MID = 430;
/** Barbarossa's spot under the trails. */
const HERO_Y = 612, HERO_W = 560, HERO_H = 92;
/** The side panel: its centre, the info plank's size. */
const PANEL_X = 1050, INFO_W = 360, INFO_H = 300, INFO_Y = 330, INFO_TEXT = 316;
const nodeAt = (n: { col: number; row: number }): [number, number] => [X0 + n.row * DX, ROWY[n.col]];
const GREEN = 0x3f7a3a, WOOD = 0x8a5a2e;

// the styles (shared with the prebake, so the painted keys match)
const TITLE: LabelStyle = { size: 50, color: '#7a1e12', stroke: null, shadow: false };
const SUB: LabelStyle = { size: 19, color: INK, stroke: null, shadow: false, body: true };
const PURSE: LabelStyle = { size: 32, color: '#ffe68a', stroke: '#2a1206', strokeWidth: 5 };
const NODE_NAME: LabelStyle = { size: 23, color: INK, stroke: null, shadow: false };
const HERO_NAME: LabelStyle = { size: 32, color: INK, stroke: null, shadow: false };
const COST: LabelStyle = { size: 24, color: '#7a3a12', stroke: null, shadow: false };
const COST_POOR: LabelStyle = { size: 24, color: '#9a7a5a', stroke: null, shadow: false };
const STATE: LabelStyle = { size: 22, color: '#2a7a3a', stroke: null, shadow: false };
const INFO_NAME: LabelStyle = { size: 30, color: '#ffe68a', stroke: '#2a1206', strokeWidth: 5 };
const INFO_DESC: LabelStyle = { size: 21, color: '#f4e8d0', stroke: '#2a1206', strokeWidth: 3, body: true };
const BUY: LabelStyle = { size: 32, color: '#fff6d8', stroke: '#2a1206', strokeWidth: 5 };
const BACK: LabelStyle = { size: 30 };
const KEYS: LabelStyle = { size: 15, color: INK, stroke: null, shadow: false, body: true };

const heroDesc = (owned: boolean): string => t('hd_barbarossa') + (owned ? '' : '. ' + t('heroLocked') + '.');
/** The keys' lines under BACK. */
const mapKeys = (): string[] => t('mapKeys').split('  ·  ');
const nodeDesc = (id: NodeId, locked: boolean): string => t('nd_' + id) + (locked ? '. ' + t('needAbove') + '.' : '');

/** The treasure chart's texture: aged parchment with the islands, the serpent, the ship and the X. */
function boardChart(scene: Phaser.Scene): string {
  const { width, height } = scene.scale;
  const ox = 14, oy = 10;
  return chartTexture(scene, 'si-chart-board', width - ox * 2, height - oy * 2, 4711, (g, r) => {
    const at = (x: number, y: number): [number, number] => [x - ox, y - oy];
    rhumbLines(g, ...at(770, 150), 1500, 0.14);
    for (const n of NODES) { const [x, y] = nodeAt(n); inkIsland(g, ...at(x, y - 12), 60, r, { palms: n.row % 2 ? 0 : 1 }); }
    waves(g, ...at(190, 366), 3, r); waves(g, ...at(510, 362), 3, r);
    serpent(g, ...at(350, 376), 0.6, 1);
    shipDoodle(g, ...at(680, 384), 0.62, -1);
    waves(g, ...at(80, 540), 3, r); waves(g, ...at(780, 540), 3, r);
    xMark(g, ...at(770, 616), 16);
    compassRose(g, ...at(770, 150), 44);
    shipDoodle(g, ...at(86, 140), 0.62, 1);
    scrollBanner(g, ...at(MAP_MID, 82), 470, 64);
    // the side panel's lighter parchment
    g.save();
    g.fillStyle = 'rgba(255,248,225,0.3)'; g.strokeStyle = 'rgba(58,34,16,0.45)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(...at(PANEL_X - 200, 40), 400, height - 80, 22); g.fill(); g.stroke();
    g.restore();
  });
}

/** Paints the treasure map's chart, planks and words in the current language (Boot, under the Ayvago intro). */
export function prebakeBoard(scene: Phaser.Scene): void {
  const P = menuTheme()!.palette;
  boardChart(scene);
  labelTexture(scene, t('mapTitle'), TITLE);
  bakePara(scene, t('mapSub'), SUB, 600);
  bakeButton(scene, 'plate', 240, 56, P.board);
  for (const o of [PURSE, COST, COST_POOR, BUY]) glyphAtlas(scene, o);
  for (const n of NODES) {
    labelTexture(scene, t('n_' + n.id), NODE_NAME);
    labelTexture(scene, t('n_' + n.id), INFO_NAME);
    for (const locked of [false, true]) bakePara(scene, nodeDesc(n.id, locked), INFO_DESC, INFO_TEXT);
  }
  labelTexture(scene, t('h_barbarossa'), HERO_NAME);
  labelTexture(scene, t('h_barbarossa'), INFO_NAME);
  for (const owned of [false, true]) bakePara(scene, heroDesc(owned), INFO_DESC, INFO_TEXT);
  labelTexture(scene, t('owned'), STATE);
  labelTexture(scene, t('heroOwned'), STATE);
  skinTexture(scene, 'board', INFO_W, INFO_H);
  bakeButton(scene, 'button', 170, 80, GREEN, true);
  labelTexture(scene, t('mapBack'), BACK);
  bakeButton(scene, 'button', 240, 64, WOOD);
  for (const line of mapKeys()) labelTexture(scene, line, KEYS);
}

export class BoardScene extends Phaser.Scene {
  private meta!: Meta;
  private spots: Spot[] = [];
  private focus = 0;
  private purse!: GlyphText;
  private info!: Phaser.GameObjects.Container;
  private infoName: Phaser.GameObjects.Image | null = null;
  private infoDesc!: Para;
  private buyBtn!: KitButton;
  private buyCost!: GlyphText;
  private buyCoin!: Phaser.GameObjects.Image;
  private trails!: Phaser.GameObjects.Graphics;
  private closed = false;
  private from = 'Menu';

  constructor() { super('Board'); }

  create(data: { from?: string }): void {
    makeArt(this);
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.spots = [];
    this.closed = false;
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x04080c, 0.85).setOrigin(0).setInteractive();
    // the chart: aged parchment with its ink drawings (painted in Boot, chart.ts)
    this.add.image(width / 2, height / 2, boardChart(this));
    fitWidth(labelAt(this, MAP_MID, 82, t('mapTitle'), TITLE), 440);
    const sub = new Para(this, MAP_MID, 0, t('mapSub'), SUB, 600, 0.5, 23);
    sub.y = 140 - sub.textHeight / 2;
    const P = menuTheme()!.palette;
    // the side panel: the purse, the picked item on a plank, BACK
    const chip = this.add.container(PANEL_X, 96);
    chip.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', 240, 56, 'up', P.board)));
    chip.add(this.add.image(-76, 0, DOUBLOON).setDisplaySize(42, 42));
    this.purse = new GlyphText(this, 14, 0, '', PURSE);
    chip.add(this.purse);

    this.trails = this.add.graphics();
    for (const n of NODES) this.spot({ kind: 'node', id: n.id }, ...nodeAt(n));
    this.spot({ kind: 'hero' }, MAP_MID, HERO_Y);

    // the focused item on a plank: its name, what it does, and the buy button
    const info = this.add.container(PANEL_X, INFO_Y);
    info.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'board', INFO_W, INFO_H)));
    this.info = info;
    this.infoDesc = new Para(this, -INFO_TEXT / 2, -78, '', INFO_DESC, INFO_TEXT, 0, 25);
    this.buyBtn = new KitButton(this, 0, INFO_H / 2 - 66, { w: 170, h: 80, color: GREEN, sfx: null, tapWhenOff: true }, () => this.buy());
    this.buyCost = new GlyphText(this, 18, 0, '', BUY);
    this.buyCoin = this.add.image(0, 0, DOUBLOON).setDisplaySize(34, 34);
    this.buyBtn.addContent(this.buyCost, this.buyCoin);
    info.add([this.infoDesc, this.buyBtn]);
    new KitButton(this, PANEL_X, 566, { w: 240, h: 64, color: WOOD, label: t('mapBack'), style: BACK }, () => this.close());
    if (!this.sys.game.device.input.touch) mapKeys().forEach((line, i) => labelAt(this, PANEL_X, 620 + i * 20, line, KEYS));

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'Escape' || e.code === 'KeyM' || e.code === 'Backspace') { this.close(); return; }
      if (e.code === 'Enter' || e.code === 'Space') { this.buy(); return; }
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] } as Record<string, number[]>)[e.code];
      if (dir) this.move(dir[0], dir[1]);
    });
    this.focus = Math.max(0, this.spots.findIndex((s) => this.state(s.item) === 'open'));
    this.refresh();
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 200 });
  }

  private spot(item: Item, x: number, y: number): void {
    const box = this.add.container(x, y);
    const ring = this.add.graphics();
    const hero = item.kind === 'hero';
    const art = hero ? null : this.add.image(0, -14, nodeArt(item.id)).setDisplaySize(62, 62);
    const name = fitWidth(labelAt(this, 0, hero ? -16 : 34, hero ? t('h_barbarossa') : t('n_' + item.id), hero ? HERO_NAME : NODE_NAME), hero ? 300 : DX - 8);
    const cy = hero ? 22 : 57;
    const coin = this.add.image(0, cy, DOUBLOON).setDisplaySize(24, 24);
    const cost = new GlyphText(this, 0, cy, '', COST, 0);
    const costPoor = new GlyphText(this, 0, cy, '', COST_POOR, 0);
    const lock = this.add.image(hero ? -HERO_W / 2 + 70 : 28, hero ? 0 : -40, LOCK).setDisplaySize(hero ? 54 : 34, hero ? 54 : 34);
    const state = labelAt(this, 0, cy, hero ? t('heroOwned') : t('owned'), STATE);
    const w = hero ? HERO_W : DX - 4, h = hero ? HERO_H : 130;
    const hit = this.add.zone(0, hero ? 0 : 4, w, h).setInteractive({ useHandCursor: true });
    box.add([ring, ...(art ? [art] : []), name, coin, cost, costPoor, lock, state, hit]);
    if (hero) box.add(this.add.image(HERO_W / 2 - 70, 0, 'si-pw-parrot').setDisplaySize(80, 80));
    const i = this.spots.length;
    hit.on('pointerup', () => {
      if (this.focus === i) this.buy();
      else { this.focus = i; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
    });
    this.spots.push({ item, x, y, box, ring, cost, costPoor, coin, lock, state });
  }

  private state(it: Item): 'owned' | 'open' | 'poor' | 'locked' {
    if (it.kind === 'hero') return this.meta.heroes.includes('barbarossa') ? 'owned' : this.meta.doubloons >= BARBAROSSA_COST ? 'open' : 'poor';
    return nodeState(this.meta, it.id);
  }

  private refresh(): void {
    this.purse.setText(String(this.meta.doubloons));
    // the trails: dashed routes in ink between the islands, red where they are owned
    const tg = this.trails.clear();
    for (const n of NODES) {
      if (!n.req) continue;
      const owned = this.meta.nodes.includes(n.id);
      // an arc over the sea from one island to the next, clear of the names under them
      const [xa, y] = nodeAt(NODE[n.req]), [xb] = nodeAt(n);
      dashedPath(tg, [new Phaser.Math.Vector2(xa + 40, y - 26), new Phaser.Math.Vector2((xa + xb) / 2, y - 50), new Phaser.Math.Vector2(xb - 40, y - 26)], owned ? RED_INK : 0x6a4a2a, owned ? 0.95 : 0.6, owned ? 4.5 : 3, 10, 8);
    }
    this.spots.forEach((s, i) => {
      const st = this.state(s.item);
      const on = i === this.focus;
      const hero = s.item.kind === 'hero';
      const g = s.ring.clear();
      const col = st === 'owned' ? 0x2e6b3a : st === 'open' ? 0xc07a10 : st === 'poor' ? 0x8a6a4a : 0x7a6a5a;
      if (hero) {
        const W = HERO_W, H = HERO_H;
        g.fillStyle(0x3a2210, 0.18).fillRoundedRect(-W / 2 + 2, -H / 2 + 6, W, H, 22);
        g.fillStyle(st === 'owned' ? 0xdfe8c0 : 0xf3e3b8, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
        g.lineStyle(on ? 6 : 3, on ? RED_INK : col, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
        g.lineStyle(1, 0x3a2210, 0.5).strokeRoundedRect(-W / 2 + 8, -H / 2 + 8, W - 16, H - 16, 16);
      } else {
        // an inked medallion on its island
        g.fillStyle(0x3a2210, 0.2).fillCircle(3, -10, 37);
        g.fillStyle(st === 'owned' ? 0xdfe8c0 : st === 'locked' ? 0xdccaa0 : 0xf6e8c4, 1).fillCircle(0, -14, 36);
        g.lineStyle(on ? 7 : 4, on ? RED_INK : col, 1).strokeCircle(0, -14, 36);
        g.lineStyle(1.5, 0x3a2210, 0.55).strokeCircle(0, -14, 31);
        if (on) g.lineStyle(2, RED_INK, 0.55).strokeCircle(0, -14, 43);
      }
      const owned = st === 'owned';
      s.state.setVisible(owned);
      const cost = hero ? BARBAROSSA_COST : NODE[(s.item as { id: NodeId }).id].cost;
      const shown = st === 'open' ? s.cost : s.costPoor;
      s.cost.setVisible(!owned && st === 'open');
      s.costPoor.setVisible(!owned && st !== 'open');
      shown.setText(String(cost));
      s.coin.setVisible(!owned).setX(-(shown.textWidth + 30) / 2 + 13);
      shown.setX(s.coin.x + 17);
      s.lock.setVisible(st === 'locked' || (hero && st !== 'owned'));
      s.box.setAlpha(st === 'locked' ? 0.6 : 1).setScale(on ? 1.05 : 1);
    });
    const s = this.spots[this.focus];
    const st = this.state(s.item);
    const nameText = s.item.kind === 'hero' ? t('h_barbarossa') : t('n_' + s.item.id);
    this.infoName?.destroy();
    this.infoName = fitWidth(labelAt(this, -INFO_TEXT / 2, -INFO_H / 2 + 44, nameText, INFO_NAME, 0), INFO_TEXT);
    this.info.add(this.infoName);
    this.infoDesc.setText(s.item.kind === 'hero' ? heroDesc(st === 'owned') : nodeDesc(s.item.id, st === 'locked'));
    this.buyBtn.setVisible(st !== 'owned');
    const cost = s.item.kind === 'hero' ? BARBAROSSA_COST : NODE[s.item.id].cost;
    this.buyCost.setText(String(cost));
    const bw = 34 + 8 + this.buyCost.textWidth;
    this.buyCoin.setX(-bw / 2 + 17);
    this.buyCost.setX(-bw / 2 + 42 + this.buyCost.textWidth / 2);
    this.buyCost.setData('y0', 0); this.buyCoin.setData('y0', 0);
    this.buyBtn.setEnabled(st === 'open');
  }

  private move(dx: number, dy: number): void {
    const best = stepFocus(this.spots, this.focus, dx, dy);
    if (best >= 0) { this.focus = best; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
  }

  private buy(): void {
    const s = this.spots[this.focus];
    const ok = s.item.kind === 'hero' ? buyBarbarossa(this.meta) : buyNode(this.meta, s.item.id);
    if (!ok) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: s.box, x: { from: s.x - 8, to: s.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    saveMeta(this.meta);
    playSfx(this, 'buy', { volume: 0.6 });
    this.tweens.add({ targets: s.box, scale: 1.18, duration: 120, yoyo: true });
    const sp = this.add.particles(s.x, s.y, DOUBLOON, { speed: { min: 120, max: 260 }, scale: { start: 0.3, end: 0 }, lifespan: 520, quantity: 12, emitting: false });
    sp.explode(12);
    this.time.delayedCall(700, () => sp.destroy());
    this.refresh();
  }

  /** Test hook: gives doubloons and refreshes. */
  testGive(n: number): void { this.meta.doubloons += n; saveMeta(this.meta); this.refresh(); }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    playSfx(this, 'move', { volume: 0.35 });
    const from = this.scene.get(this.from);
    this.scene.stop();
    this.scene.resume(this.from);
    from.events.emit('map-closed');
  }
}
