// Skull Isle: the treasure map, a scene of its own opened from the menu (the menu waits under it,
// so its keys do not start a run). Doubloons buy ten lasting nodes in two trails (a node needs the
// one above it) and free Captain Barbarossa. Mouse, touch and keyboard.
import Phaser from 'phaser';
import { txt, t, playSfx } from '@core';
import { NODES, NODE, BARBAROSSA_COST, type NodeId } from './upgrades';
import { loadMeta, saveMeta, nodeState, buyNode, buyBarbarossa, type Meta } from './meta';
import { nodeArt, DOUBLOON, LOCK, makeArt } from './art';
import { Pill } from './ui';

type Item = { kind: 'node'; id: NodeId } | { kind: 'hero' };
interface Spot { item: Item; x: number; y: number; box: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; coin: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image; state: Phaser.GameObjects.Text }

const INK = '#4a2a10';
const COLX = [205, 515];
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
    this.add.rectangle(0, 0, width, height, 0x04080c, 0.82).setOrigin(0).setInteractive();
    // the parchment
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(22, 30, width - 44, height - 52, 26);
    g.fillStyle(0xe9d5a2, 1).fillRoundedRect(18, 22, width - 36, height - 52, 26);
    g.fillStyle(0xd8be84, 0.6).fillRoundedRect(30, 34, width - 60, height - 76, 20);
    g.fillStyle(0xf2e2b8, 0.9).fillRoundedRect(44, 48, width - 88, height - 104, 16);
    g.lineStyle(4, 0x8a5a2a, 0.8).strokeRoundedRect(18, 22, width - 36, height - 52, 26);
    // a compass rose in a corner
    g.lineStyle(2, 0xb08a50, 0.6).strokeCircle(width - 110, 1000, 50);
    g.fillStyle(0xb08a50, 0.5).fillTriangle(width - 110, 940, width - 100, 1000, width - 120, 1000).fillTriangle(width - 110, 1060, width - 100, 1000, width - 120, 1000);
    txt(this, width / 2, 92, t('mapTitle'), { title: true, size: 44, color: '#7a3a12', strokeThickness: 0, shadow: false });
    txt(this, width / 2, 140, t('mapSub'), { size: 20, color: INK, strokeThickness: 0, shadow: false, wrap: 620 });
    const chip = this.add.container(width / 2, 200);
    chip.add(this.add.graphics().fillStyle(0x3a2410, 0.9).fillRoundedRect(-120, -27, 240, 54, 27).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-120, -27, 240, 54, 27));
    chip.add(this.add.image(-74, 0, DOUBLOON).setDisplaySize(42, 42));
    this.purse = txt(this, 14, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.purse);

    this.trails = this.add.graphics();
    for (const n of NODES) this.spot({ kind: 'node', id: n.id }, COLX[n.col], ROW0 + n.row * ROWH);
    this.spot({ kind: 'hero' }, width / 2, 1004);

    // the focused item: its name, what it does, and the buy button
    const info = this.add.container(width / 2, 1116);
    info.add(this.add.graphics().fillStyle(0x3a2410, 0.88).fillRoundedRect(-320, -56, 640, 112, 18));
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
    const art = hero ? null : this.add.image(0, -12, nodeArt(item.id)).setDisplaySize(76, 76);
    const name = txt(this, 0, hero ? -16 : 42, hero ? t('h_barbarossa') : t('n_' + item.id), { title: true, size: hero ? 26 : 19, color: INK, strokeThickness: 0, shadow: false });
    if (name.width > 250) name.setScale(250 / name.width);
    const coin = this.add.image(0, hero ? 22 : 66, DOUBLOON).setDisplaySize(24, 24);
    const cost = txt(this, 0, hero ? 23 : 67, '', { title: true, size: 19, color: '#7a3a12', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const lock = this.add.image(hero ? -230 : 32, hero ? 0 : -44, LOCK).setDisplaySize(hero ? 54 : 34, hero ? 54 : 34);
    const state = txt(this, 0, hero ? 23 : 67, '', { title: true, size: 17, color: '#2a7a3a', strokeThickness: 0, shadow: false });
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
    // the trails: a dashed path down each column, inked where it is owned
    const tg = this.trails.clear();
    for (const n of NODES) {
      if (!n.req) continue;
      const a = NODE[n.req];
      const owned = this.meta.nodes.includes(n.id);
      const x = COLX[n.col], y0 = ROW0 + a.row * ROWH + 82, y1 = ROW0 + n.row * ROWH - 58;
      for (let y = y0; y < y1; y += 14) tg.fillStyle(owned ? 0xa0402a : 0xb89a6a, owned ? 0.95 : 0.7).fillRect(x - 2, y, 4, 8);
    }
    this.spots.forEach((s, i) => {
      const st = this.state(s.item);
      const on = i === this.focus;
      const hero = s.item.kind === 'hero';
      const g = s.ring.clear();
      const col = st === 'owned' ? 0x2a9a4a : st === 'open' ? 0xd08a1a : st === 'poor' ? 0x9a8a6a : 0x7a6a5a;
      if (hero) {
        g.fillStyle(st === 'owned' ? 0xd8f0c8 : 0xf8ecc8, 1).fillRoundedRect(-300, -46, 600, 92, 22);
        g.lineStyle(on ? 6 : 3, on ? 0xd02a1a : col, 1).strokeRoundedRect(-300, -46, 600, 92, 22);
      } else {
        g.fillStyle(st === 'owned' ? 0xcfe8b8 : st === 'locked' ? 0xd8c8a0 : 0xf8ecc8, 1).fillCircle(0, -12, 44);
        g.lineStyle(on ? 7 : 4, on ? 0xd02a1a : col, 1).strokeCircle(0, -12, 44);
        if (on) g.lineStyle(2, 0xd02a1a, 0.5).strokeCircle(0, -12, 53);
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
