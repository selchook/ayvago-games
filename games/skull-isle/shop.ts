// Skull Isle: the overlays between islands, drawn over the frozen beach inside the Play scene.
//   - The dock shop: the island's loot buys levels of seven upgrades and one patch-up; SET SAIL
//     goes on.
//   - The boon draft (after a boss): a free pick of one of three lasting boons.
// Touch: tap a tile. Keyboard: arrows to pick, Enter to buy or sail (1/2/3 in the draft).
import Phaser from 'phaser';
import { txt, t } from '@core';
import type { Sim } from './sim';
import { SHOP_IDS, SHOP_COST, PATCH, type ShopId, type BoonId } from './upgrades';
import { shopArt, boonArt, GOLD } from './art';
import { BOON_SYM } from './art';
import { glass, Pill } from './ui';
import { ISLAND_IDS } from './defs';

export const OVERLAY_DEPTH = 9600;

type Item = ShopId | 'patch' | 'sail';

interface Parts { bg: Phaser.GameObjects.Graphics; cost: Phaser.GameObjects.Text; coin: Phaser.GameObjects.Image; pips: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Text }
interface Tile { id: Item; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Container; parts: Parts | null }

export interface OverlayHost {
  sfx(key: string, volume?: number): void;
  touch: boolean;
}

export class ShopOverlay {
  readonly root: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private focus = 0;
  private goldText: Phaser.GameObjects.Text;
  private sail: Pill;
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
    const chip = scene.add.container(width / 2, 282);
    chip.add(scene.add.graphics().fillStyle(0x06121a, 0.85).fillRoundedRect(-110, -27, 220, 54, 27).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-110, -27, 220, 54, 27));
    chip.add(scene.add.image(-64, 0, GOLD).setDisplaySize(40, 40));
    this.goldText = txt(scene, 14, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.goldText);
    this.root.add(chip);

    const items: (ShopId | 'patch')[] = [...SHOP_IDS, 'patch'];
    const w = 312, h = 160, gx = 16, gy = 16;
    items.forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.tile(id, width / 2 + (col ? 1 : -1) * (w + gx) / 2, 400 + row * (h + gy), w, h);
    });
    this.sail = new Pill(scene, width / 2, 1112, 360, 94, 0x2f8ad0, () => this.leave(), 32);
    this.sail.setLabels(t('setSail'));
    this.root.add(this.sail);
    this.tiles.push({ id: 'sail', x: width / 2, y: 1112, w: 360, h: 94, box: this.sail, parts: null });
    if (!host.touch) this.root.add(txt(scene, width / 2, 1184, t('shopKeys'), { size: 18, color: '#9fb0c0', strokeThickness: 0, shadow: false }));
    this.focus = Math.max(0, this.tiles.findIndex((tl) => this.state(tl.id) === 'ok'));
    if (this.state(this.tiles[this.focus].id) !== 'ok') this.focus = this.tiles.length - 1;
    this.refresh();
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    panel.setScale(0.9);
    scene.tweens.add({ targets: panel, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private tile(id: ShopId | 'patch', x: number, y: number, w: number, h: number): void {
    const s = this.scene;
    const box = s.add.container(x, y);
    const bg = s.add.graphics();
    const icon = s.add.image(-w / 2 + 52, -12, shopArt(id)).setDisplaySize(78, 78);
    const name = txt(s, -w / 2 + 100, -h / 2 + 30, t('s_' + id), { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    if (name.width > w - 112) name.setScale((w - 112) / name.width);
    const desc = txt(s, -w / 2 + 100, -h / 2 + 52, t('sd_' + id), { size: 18, color: '#d8e6f0', strokeThickness: 0, shadow: false, wrap: w - 112, align: 'left' }).setOrigin(0, 0);
    const pips = s.add.graphics();
    const coin = s.add.image(0, h / 2 - 26, GOLD).setDisplaySize(26, 26);
    const cost = txt(s, 0, h / 2 - 25, '', { title: true, size: 22, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const state = txt(s, w / 2 - 70, h / 2 - 25, '', { title: true, size: 18, color: '#7affc0', strokeThickness: 0, shadow: false });
    const hit = s.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, icon, name, desc, pips, coin, cost, state, hit]);
    this.root.add(box);
    const i = this.tiles.length;
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev?.stopPropagation?.());
    hit.on('pointerup', () => { this.focus = i; this.buy(); });
    this.tiles.push({ id, x, y, w, h, box, parts: { bg, cost, coin, pips, state } });
  }

  private price(id: Item): number | null {
    if (id === 'sail') return null;
    if (id === 'patch') return this.sim.patchPrice;
    const lv = this.sim.shop[id] ?? 0;
    return lv >= SHOP_COST[id].length ? null : SHOP_COST[id][lv];
  }

  private state(id: Item): 'ok' | 'poor' | 'max' | 'full' | 'done' {
    const sim = this.sim;
    if (id === 'sail') return 'ok';
    if (id === 'patch') {
      if (sim.patched) return 'done';
      if (sim.p.hp >= sim.st.maxHp) return 'full';
      return sim.gold >= sim.patchPrice ? 'ok' : 'poor';
    }
    const c = this.price(id);
    if (c === null) return 'max';
    return sim.gold >= c ? 'ok' : 'poor';
  }

  refresh(): void {
    this.goldText.setText(String(this.sim.gold));
    this.tiles.forEach((tl, i) => {
      const on = i === this.focus;
      if (tl.id === 'sail' || !tl.parts) { this.sail.setScale(on && !this.host.touch ? 1.06 : 1); this.sail.setColor(on && !this.host.touch ? 0x3aa0f0 : 0x2f8ad0); return; }
      const { bg, cost, coin, pips, state } = tl.parts;
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
      // level pips
      pips.clear();
      if (tl.id !== 'patch') {
        const max = SHOP_COST[tl.id].length, n = this.sim.shop[tl.id] ?? 0;
        const pw = 16, gap = 5;
        for (let k = 0; k < max; k++) pips.fillStyle(k < n ? 0xfff07a : 0x2a3a48, 1).fillRoundedRect(-w / 2 + 100 + k * (pw + gap), h / 2 - 29, pw, 8, 4);
      } else {
        pips.fillStyle(0x7affa0, 0.25).fillRoundedRect(-w / 2 + 100, h / 2 - 29, 100 * PATCH * 2.5, 8, 4);
      }
      tl.box.setScale(on && !this.host.touch ? 1.03 : 1);
    });
  }

  key(code: string): boolean {
    if (this.done) return false;
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
    const ok = tl.id === 'patch' ? this.sim.buyPatch() : this.sim.buy(tl.id);
    if (!ok) {
      this.host.sfx('error', 0.4);
      this.scene.tweens.add({ targets: tl.box, x: { from: tl.x - 10, to: tl.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    this.host.sfx(tl.id === 'patch' ? 'heal' : 'buy', 0.6);
    this.scene.tweens.add({ targets: tl.box, scale: 1.1, duration: 110, yoyo: true });
    const sp = this.scene.add.particles(tl.x, tl.y, GOLD, { speed: { min: 140, max: 300 }, scale: { start: 0.28, end: 0 }, lifespan: 520, quantity: 14, emitting: false }).setDepth(OVERLAY_DEPTH + 1).setScrollFactor(0);
    sp.explode(14);
    this.scene.time.delayedCall(700, () => sp.destroy());
    if (this.state(tl.id) !== 'ok') {
      const next = this.tiles.findIndex((x) => this.state(x.id) === 'ok' && x.id !== 'sail');
      if (next < 0) this.focus = this.tiles.length - 1;
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

  /** Test hook: buys an item as a tap would. */
  testBuy(id: ShopId | 'patch'): void { this.focus = this.tiles.findIndex((x) => x.id === id); this.buy(); }

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
