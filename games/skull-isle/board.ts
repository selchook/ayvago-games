// Skull Isle: the treasure map, a scene of its own opened from the menu (the menu waits under it,
// so its keys do not start a run). Doubloons buy ten lasting nodes in two trails (a node needs the
// one above it) and free Captain Barbarossa. Mouse, touch and keyboard. It is drawn as an old
// pirate chart (chart.ts): burnt parchment, a compass rose and rhumb lines, every node an inked
// island, the trails dashed routes in red ink, a sea serpent and a ship, an X where the treasure lies.
import Phaser from 'phaser';
import { txt, t, playSfx } from '@core';
import { NODES, NODE, BARBAROSSA_COST, type NodeId } from './upgrades';
import { loadMeta, saveMeta, nodeState, buyNode, buyBarbarossa, type Meta } from './meta';
import { nodeArt, DOUBLOON, LOCK, makeArt } from './art';
import { Pill } from './ui';
import { chartTexture, compassRose, rhumbLines, inkIsland, serpent, shipDoodle, waves, xMark, scrollBanner, dashedPath, RED_INK } from './chart';

type Item = { kind: 'node'; id: NodeId } | { kind: 'hero' };
interface Spot { item: Item; x: number; y: number; box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; coin: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image; state: Phaser.GameObjects.Text }

const INK = '#3a2210';
const COLX = [182, 538];
const ROW0 = 326, ROWH = 134;

export class BoardScene extends Phaser.Scene {
  private meta!: Meta;
  private spots: Spot[] = [];
  private focus = 0;
  private purse!: Phaser.GameObjects.Text;
  private infoName!: Phaser.GameObjects.Text;
  private infoDesc!: Phaser.GameObjects.Text;
  private buyBtn!: Pill;
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
    // the chart: aged parchment with its ink drawings (painted once, chart.ts)
    const ox = 14, oy = 10;
    const key = chartTexture(this, 'si-chart-board', width - ox * 2, height - oy * 2, 4711, (g, r) => {
      const at = (x: number, y: number): [number, number] => [x - ox, y - oy];
      rhumbLines(g, ...at(634, 200), 1300, 0.14);
      for (const n of NODES) inkIsland(g, ...at(COLX[n.col], ROW0 + n.row * ROWH - 12), 64, r, { palms: n.row % 2 ? 0 : 1 });
      waves(g, ...at(360, 470), 5, r);
      serpent(g, ...at(362, 560), 0.62, 1);
      waves(g, ...at(360, 700), 4, r);
      shipDoodle(g, ...at(358, 832), 0.75, -1);
      waves(g, ...at(88, 980), 3, r); waves(g, ...at(640, 980), 3, r);
      xMark(g, ...at(360, 930), 16);
      compassRose(g, ...at(634, 200), 44);
      shipDoodle(g, ...at(86, 150), 0.62, 1);
      scrollBanner(g, ...at(width / 2, 92), 470, 64);
    });
    this.add.image(width / 2, height / 2, key);
    txt(this, width / 2, 92, t('mapTitle'), { title: true, size: 42, color: '#7a1e12', strokeThickness: 0, shadow: false });
    txt(this, width / 2, 146, t('mapSub'), { size: 19, color: INK, strokeThickness: 0, shadow: false, wrap: 500 });
    const chip = this.add.container(width / 2, 200);
    chip.add(this.add.graphics().fillStyle(0x3a2410, 0.9).fillRoundedRect(-120, -27, 240, 54, 27).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-120, -27, 240, 54, 27));
    chip.add(this.add.image(-74, 0, DOUBLOON).setDisplaySize(42, 42));
    this.purse = txt(this, 14, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.purse);

    this.trails = this.add.graphics();
    for (const n of NODES) this.spot({ kind: 'node', id: n.id }, COLX[n.col], ROW0 + n.row * ROWH);
    this.spot({ kind: 'hero' }, width / 2, 1008);

    // the focused item: its name, what it does, and the buy button
    const info = this.add.container(width / 2, 1116);
    info.add(this.add.graphics().fillStyle(0x2a1608, 0.9).fillRoundedRect(-320, -56, 640, 112, 18).lineStyle(2, 0xc9a468, 0.8).strokeRoundedRect(-316, -52, 632, 104, 15));
    this.infoName = txt(this, -300, -30, '', { title: true, size: 24, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.infoDesc = txt(this, -300, -6, '', { size: 19, color: '#f4e8d0', strokeThickness: 0, shadow: false, wrap: 390, align: 'left' }).setOrigin(0, 0);
    this.buyBtn = new Pill(this, 222, 0, 170, 80, 0x2f9a5a, () => this.buy(), 26);
    info.add([this.infoName, this.infoDesc, this.buyBtn]);
    const back = new Pill(this, width / 2, 1218, 240, 60, 0x6a3a1a, () => this.close(), 24);
    back.setLabels(t('mapBack'));
    if (!this.sys.game.device.input.touch) txt(this, 150, 1218, t('mapKeys').split('  ·  ')[0], { size: 15, color: INK, strokeThickness: 0, shadow: false });

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
    const name = txt(this, 0, hero ? -16 : 33, hero ? t('h_barbarossa') : t('n_' + item.id), { title: true, size: hero ? 26 : 18, color: INK, strokeThickness: 0, shadow: false });
    if (name.width > 250) name.setScale(250 / name.width);
    const coin = this.add.image(0, hero ? 22 : 56, DOUBLOON).setDisplaySize(24, 24);
    const cost = txt(this, 0, hero ? 23 : 57, '', { title: true, size: 19, color: '#7a3a12', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const lock = this.add.image(hero ? -230 : 28, hero ? 0 : -40, LOCK).setDisplaySize(hero ? 54 : 34, hero ? 54 : 34);
    const state = txt(this, 0, hero ? 23 : 57, '', { title: true, size: 17, color: '#2a7a3a', strokeThickness: 0, shadow: false });
    const w = hero ? 600 : 220, h = hero ? 92 : 130;
    const hit = this.add.zone(0, hero ? 0 : 4, w, h).setInteractive({ useHandCursor: true });
    box.add([ring, ...(art ? [art] : []), name, coin, cost, lock, state, hit]);
    if (hero) box.add(this.add.image(230, 0, 'si-pw-parrot').setDisplaySize(80, 80));
    const i = this.spots.length;
    hit.on('pointerup', () => {
      if (this.focus === i) this.buy();
      else { this.focus = i; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
    });
    this.spots.push({ item, x, y, box, ring, cost, coin, lock, state });
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
      const a = NODE[n.req];
      const owned = this.meta.nodes.includes(n.id);
      // round the outside of the islands, clear of the names
      const x = COLX[n.col], ya = ROW0 + a.row * ROWH - 12, yb = ROW0 + n.row * ROWH - 12;
      const out = n.col ? 1 : -1;
      dashedPath(tg, [new Phaser.Math.Vector2(x + 40 * out, ya + 26), new Phaser.Math.Vector2(x + 86 * out, (ya + yb) / 2), new Phaser.Math.Vector2(x + 40 * out, yb - 26)], owned ? RED_INK : 0x6a4a2a, owned ? 0.95 : 0.6, owned ? 4.5 : 3, 10, 8);
    }
    this.spots.forEach((s, i) => {
      const st = this.state(s.item);
      const on = i === this.focus;
      const hero = s.item.kind === 'hero';
      const g = s.ring.clear();
      const col = st === 'owned' ? 0x2e6b3a : st === 'open' ? 0xc07a10 : st === 'poor' ? 0x8a6a4a : 0x7a6a5a;
      if (hero) {
        g.fillStyle(0x3a2210, 0.18).fillRoundedRect(-298, -40, 600, 92, 22);
        g.fillStyle(st === 'owned' ? 0xdfe8c0 : 0xf3e3b8, 0.96).fillRoundedRect(-300, -46, 600, 92, 22);
        g.lineStyle(on ? 6 : 3, on ? RED_INK : col, 1).strokeRoundedRect(-300, -46, 600, 92, 22);
        g.lineStyle(1, 0x3a2210, 0.5).strokeRoundedRect(-292, -38, 584, 76, 16);
      } else {
        // an inked medallion on its island
        g.fillStyle(0x3a2210, 0.2).fillCircle(3, -10, 37);
        g.fillStyle(st === 'owned' ? 0xdfe8c0 : st === 'locked' ? 0xdccaa0 : 0xf6e8c4, 1).fillCircle(0, -14, 36);
        g.lineStyle(on ? 7 : 4, on ? RED_INK : col, 1).strokeCircle(0, -14, 36);
        g.lineStyle(1.5, 0x3a2210, 0.55).strokeCircle(0, -14, 31);
        if (on) g.lineStyle(2, RED_INK, 0.55).strokeCircle(0, -14, 43);
      }
      const label = st === 'owned' ? (hero ? t('heroOwned') : t('owned')) : '';
      s.state.setText(label).setVisible(!!label);
      const cost = hero ? BARBAROSSA_COST : NODE[(s.item as { id: NodeId }).id].cost;
      s.cost.setText(String(cost)).setVisible(!label).setColor(st === 'open' ? '#7a3a12' : '#9a7a5a');
      s.coin.setVisible(!label).setX(-(s.cost.width + 30) / 2 + 13);
      s.cost.setX(s.coin.x + 17);
      s.lock.setVisible(st === 'locked' || (hero && st !== 'owned'));
      s.box.setAlpha(st === 'locked' ? 0.6 : 1).setScale(on ? 1.05 : 1);
    });
    const s = this.spots[this.focus];
    const st = this.state(s.item);
    if (s.item.kind === 'hero') {
      this.infoName.setText(t('h_barbarossa'));
      this.infoDesc.setText(t('hd_barbarossa') + (st === 'owned' ? '' : '. ' + t('heroLocked') + '.'));
    } else {
      this.infoName.setText(t('n_' + s.item.id));
      this.infoDesc.setText(t('nd_' + s.item.id) + (st === 'locked' ? '. ' + t('needAbove') + '.' : ''));
    }
    this.buyBtn.setVisible(st !== 'owned');
    const cost = s.item.kind === 'hero' ? BARBAROSSA_COST : NODE[s.item.id].cost;
    this.buyBtn.setLabels(String(cost));
    this.buyBtn.setIcon(DOUBLOON, 32);
    this.buyBtn.setEnabled(st === 'open');
  }

  private move(dx: number, dy: number): void {
    const cur = this.spots[this.focus];
    let best = -1, bd = Infinity;
    this.spots.forEach((s, i) => {
      if (i === this.focus) return;
      const ddx = s.x - cur.x, ddy = s.y - cur.y;
      if (dx && (Math.sign(ddx) !== dx || Math.abs(ddy) > 20)) return;
      if (dy && (Math.sign(ddy) !== dy || Math.abs(ddy) < 20)) return;
      const d = Math.abs(ddx) * (dy ? 0.4 : 1) + Math.abs(ddy) * (dy ? 1 : 3);
      if (d < bd) { bd = d; best = i; }
    });
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
