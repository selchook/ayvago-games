// Rooftop Courier: the courier shop, opened from the menu (the menu waits under it). Two tabs:
// UPGRADES (ten upgrades in a grid of cards: each with its level pips, what it does now and at the
// next level, and its price) and COSMETICS (satchels and caps worn on the courier). A purchase
// pops the card, fills its pip and throws a little confetti. Touch or mouse on the tabs, cards and
// swatches; keys: arrows pick, Enter buys or wears, Tab (or Q / E) switches the tab, Esc goes back.
import Phaser from 'phaser';
import { txt, t, playSfx, burst, getLang } from '@core';
import { BAGS, CAPS, UPGRADES, UPGRADE_IDS, loadMeta, saveMeta, type Meta, type UpgradeId } from './meta';
import { UP, MAGNET_R, RUSH_T } from './sim';
import { TUNING } from './defs';
import { STAMP_ICON, UPGRADE_ICON, makeIcons } from './art';

/** A frosted panel (the core's modern glass look). */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number; sheen?: boolean } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x161230, o.alpha ?? 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  if (o.sheen !== false) g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(h * 0.4, 60), { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.7), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      if (this.enabled) this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  setLabels(main: string, sub = ''): this {
    this.main.setText(main);
    this.sub.setText(sub).setVisible(!!sub);
    this.main.y = sub ? -13 : 0;
    this.sub.y = 20;
    return this;
  }

  private draw(): void {
    const { w, h } = this, r = h / 2;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
    g.fillStyle(this.enabled ? this.color : 0x444a5e, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.38, Math.min(r - 4, h * 0.19));
    this.main.setAlpha(this.enabled ? 1 : 0.6);
  }
}

type Item = { kind: 'bag' | 'cap'; id: string } | { kind: 'up'; id: UpgradeId };
type Tab = 'up' | 'look';

/** A number for the player's language (TR: a decimal comma). */
const num = (v: number, d = 1): string => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  const str = Number.isInteger(r) ? String(r) : r.toFixed(d);
  return getLang() === 'tr' ? str.replace('.', ',') : str;
};

/** What an upgrade gives at a level, as the card shows it. */
export function upgradeEffect(id: UpgradeId, lv: number): string {
  switch (id) {
    case 'time': return t('ef_time', { n: num(UP.time * lv) });
    case 'flow': return t('ef_flow', { n: num(UP.flow * lv, 2) });
    case 'bonus': return t('ef_bonus', { n: Math.round((UP.bankShare[0] + UP.bankShare[1] * lv) * 100) });
    case 'dur': return t('ef_dur', { n: Math.round(UP.dur * lv * 100) });
    case 'magnet': return t('ef_magnet', { n: num(MAGNET_R + UP.magnet * lv, 2) });
    case 'shield': return t(lv ? 'ef_shieldOn' : 'ef_shieldOff');
    case 'jump': return t('ef_jump', { n: num(UP.jump * lv * 100) });
    case 'rush': return t('ef_rush', { n: num(RUSH_T + UP.rush * lv) });
    case 'stamp': return t('ef_stamp', { n: Math.round(UP.stamp * lv * 100) });
    case 'heart': return t('ef_heart', { n: TUNING.easy.hearts + UP.heart * lv });
  }
}

const COLS = 2;
const CARD_W = 322, CARD_H = 162;
const cardX = (i: number) => 360 + ((i % COLS) - 0.5) * (CARD_W + 16);
const cardY = (i: number) => 352 + Math.floor(i / COLS) * (CARD_H + 14);

export class ShopScene extends Phaser.Scene {
  private meta!: Meta;
  private root!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private stampsText!: Phaser.GameObjects.Text;
  private stampChip!: Phaser.GameObjects.Container;
  private tabs: { id: Tab; c: Phaser.GameObjects.Container }[] = [];
  private tab: Tab = 'up';
  private items: Item[] = [];
  private sel = 0;
  private closed = false;
  private from = 'Menu';
  private changed = false;
  /** The card or swatch of each item as drawn (the purchase pop). */
  private cellOf = new Map<string, Phaser.GameObjects.Container>();

  constructor() { super('Shop'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.changed = false;
    this.tab = 'up';
    makeIcons(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.rectangle(0, 0, width, height, 0x0b0918, 1).setOrigin(0).setInteractive());
    this.root.add(this.add.container(width / 2, 650, [glass(this, 690, 1240, { alpha: 1, r: 30, sheen: false })]));
    this.root.add(txt(this, width / 2, 76, t('shopTitle'), { title: true, size: 42, color: '#ffd23f', strokeThickness: 7 }));
    const chip = this.add.container(width / 2, 140);
    chip.add(glass(this, 240, 58, { r: 29, color: 0x241c44 }));
    chip.add(this.add.image(-80, 0, STAMP_ICON).setDisplaySize(34, 34));
    this.stampsText = txt(this, 14, 0, '', { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false });
    chip.add(this.stampsText);
    this.stampChip = chip;
    this.root.add(chip);
    // the tabs
    this.tabs = (['up', 'look'] as Tab[]).map((id, i) => {
      const c = this.add.container(width / 2 + (i - 0.5) * 318, 224);
      c.setSize(306, 74).setInteractive({ useHandCursor: true }).on('pointerup', () => this.setTab(id));
      this.root.add(c);
      return { id, c };
    });
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    const back = new Pill(this, width / 2, 1204, 300, 84, 0x3b4466, () => this.close(), 28);
    back.setLabels(t('back'));
    this.root.add(back);
    if (!this.sys.game.device.input.touch) this.root.add(txt(this, width / 2, 1138, t('shopKeys'), { size: 18, color: '#8c88b0', strokeThickness: 0, shadow: false }));
    this.setTab('up', true);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      const n = this.items.length;
      if (e.code === 'Tab' || e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); this.setTab(this.tab === 'up' ? 'look' : 'up'); return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.sel + 1) % n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.sel - 1 + n) % n);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select(this.vertical(1));
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select(this.vertical(-1));
      else if (e.code === 'Enter' || e.code === 'Space') this.act(this.items[this.sel]);
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private setTab(id: Tab, first = false): void {
    if (id === this.tab && !first) return;
    this.tab = id;
    this.items = id === 'up'
      ? UPGRADE_IDS.map((u) => ({ kind: 'up' as const, id: u }))
      : [...BAGS.map((b) => ({ kind: 'bag' as const, id: b.id })), ...CAPS.map((c) => ({ kind: 'cap' as const, id: c.id }))];
    this.sel = id === 'up' ? 0 : Math.max(0, BAGS.findIndex((b) => b.id === this.meta.bag));
    if (!first) playSfx(this, 'ui-click');
    this.drawTabs();
    this.draw();
    this.body.setAlpha(0);
    this.tweens.add({ targets: this.body, alpha: 1, duration: 140 });
  }

  private drawTabs(): void {
    for (const { id, c } of this.tabs) {
      c.removeAll(true);
      const on = id === this.tab;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.25).fillRoundedRect(-153, -37 + 5, 306, 74, 37);
      g.fillStyle(on ? 0xd0702a : 0x241c44, 1).fillRoundedRect(-153, -37, 306, 74, 37);
      if (on) g.fillStyle(0xffffff, 0.16).fillRoundedRect(-147, -33, 294, 28, 14);
      g.lineStyle(2, 0xffffff, on ? 0.5 : 0.15).strokeRoundedRect(-153, -37, 306, 74, 37);
      c.add(g);
      c.add(txt(this, 0, 1, t(id === 'up' ? 'shopUpgrades' : 'shopCosmetics'), { title: true, size: 26, color: on ? '#ffffff' : '#b8b4d8', strokeThickness: 0, shadow: false }));
    }
  }

  /** Up or down a row in the grid (upgrades) or between the satchels and the caps. */
  private vertical(d: number): number {
    const it = this.items[this.sel];
    if (this.tab === 'up') {
      const j = this.sel + d * COLS;
      return j >= 0 && j < this.items.length ? j : this.sel;
    }
    const rows = ['bag', 'cap'];
    const r = clampI(rows.indexOf(it.kind) + d, 0, 1);
    const col = this.items.filter((q) => q.kind === it.kind).findIndex((q) => q.id === it.id);
    const row = this.items.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === rows[r]);
    return row[Math.min(col, row.length - 1)]?.i ?? this.sel;
  }

  private select(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    playSfx(this, 'ui-click');
    this.draw();
  }

  private price(it: Item): number {
    if (it.kind === 'bag') return BAGS.find((b) => b.id === it.id)!.price;
    if (it.kind === 'cap') return CAPS.find((c) => c.id === it.id)!.price;
    const id = it.id as UpgradeId, lv = this.meta.upgrades[id];
    return lv >= UPGRADES[id].length ? Infinity : UPGRADES[id][lv];
  }

  private owned(it: Item): boolean {
    if (it.kind === 'bag') return this.meta.bags.includes(it.id);
    if (it.kind === 'cap') return this.meta.caps.includes(it.id);
    return false;
  }

  private act(it: Item): void {
    const m = this.meta;
    const key = it.kind + ':' + it.id;
    if (it.kind !== 'up' && this.owned(it)) {
      if (it.kind === 'bag') m.bag = it.id; else m.cap = it.id;
      playSfx(this, 'ui-select');
    } else {
      const p = this.price(it);
      if (!isFinite(p) || m.stamps < p) {
        playSfx(this, 'shopNo');
        this.cameras.main.shake(120, 0.004);
        const cell = this.cellOf.get(key);
        if (cell) this.tweens.add({ targets: cell, x: cell.x + 10, duration: 50, yoyo: true, repeat: 2 });
        if (isFinite(p)) this.floatText(cell, t('shopNeed', { n: p - m.stamps }), '#ff8a7a');
        return;
      }
      m.stamps -= p;
      if (it.kind === 'bag') { m.bags.push(it.id); m.bag = it.id; }
      else if (it.kind === 'cap') { m.caps.push(it.id); m.cap = it.id; }
      else m.upgrades[it.id as UpgradeId]++;
      playSfx(this, 'shopBuy');
      if (it.kind === 'up') playSfx(this, 'levelUp', { volume: 0.5 });
      this.changed = true;
      saveMeta(m);
      this.draw();
      this.purchasePop(key, it.kind === 'up' ? t('shopLevelUp', { n: m.upgrades[it.id as UpgradeId] }) : '');
      return;
    }
    this.changed = true;
    saveMeta(m);
    this.draw();
  }

  /** The bought card pops, its pips fill, confetti flies and the stamps chip ticks down. */
  private purchasePop(key: string, word: string): void {
    const cell = this.cellOf.get(key);
    if (!cell) return;
    cell.setScale(1.12);
    this.tweens.add({ targets: cell, scale: 1, duration: 380, ease: 'Back.easeOut' });
    const wx = cell.x, wy = cell.y;
    burst(this, wx, wy, [0xffd23f, 0x7dffa0, 0xffffff, 0xff9a4a], 34, 420);
    const flashR = this.add.graphics().setPosition(wx, wy);
    flashR.fillStyle(0xffffff, 0.35).fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 20);
    this.tweens.add({ targets: flashR, alpha: 0, duration: 320, onComplete: () => flashR.destroy() });
    if (word) this.floatText(cell, word, '#7dffa0', 30);
    this.tweens.add({ targets: this.stampChip, scale: 1.15, duration: 110, yoyo: true });
  }

  private floatText(cell: Phaser.GameObjects.Container | undefined, s: string, color: string, size = 24): void {
    const x = cell?.x ?? this.scale.width / 2, y = (cell?.y ?? 600) - 40;
    const w = txt(this, x, y, s, { title: true, size, color, strokeThickness: 7 }).setDepth(50);
    w.setScale(0.5);
    this.tweens.add({ targets: w, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: w, y: y - 60, alpha: 0, delay: 600, duration: 400, onComplete: () => w.destroy() });
  }

  private draw(): void {
    const m = this.meta, b = this.body;
    b.removeAll(true);
    this.cellOf.clear();
    this.stampsText.setText(String(m.stamps));
    if (this.tab === 'up') this.drawUpgrades(); else this.drawLooks();
    void m;
  }

  private drawUpgrades(): void {
    const m = this.meta, b = this.body;
    this.items.forEach((it, i) => {
      if (it.kind !== 'up') return;
      const id = it.id;
      const lv = m.upgrades[id], max = UPGRADES[id].length, done = lv >= max;
      const sel = i === this.sel;
      const p = this.price(it), afford = !done && m.stamps >= p;
      const c = this.add.container(cardX(i), cardY(i));
      c.add(glass(this, CARD_W, CARD_H, { r: 20, color: sel ? 0x2c2460 : 0x1c1838, rim: sel ? 0xffd23f : done ? 0x7dffa0 : undefined }));
      const L = -CARD_W / 2 + 16;
      c.add(this.add.circle(L + 30, -CARD_H / 2 + 42, 30, 0xffffff, 0.08));
      c.add(this.add.image(L + 30, -CARD_H / 2 + 42, UPGRADE_ICON(id)).setDisplaySize(46, 46));
      c.add(txt(this, L + 70, -CARD_H / 2 + 24, t('up_' + id), { title: true, size: 21, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      // what it does (up to two lines under the name)
      const sub = txt(this, L + 70, -CARD_H / 2 + 40, t('up_' + id + 'Sub'), { size: 15, color: '#b8b4d8', strokeThickness: 0, shadow: false, wrap: CARD_W - 96, align: 'left' }).setOrigin(0, 0);
      sub.setLineSpacing(-3);
      c.add(sub);
      // now → next
      const now = upgradeEffect(id, lv);
      const line = done ? t('shopNow', { v: now }) : `${now}  →  ${upgradeEffect(id, lv + 1)}`;
      c.add(txt(this, L, 20, line, { title: true, size: 19, color: done ? '#7dffa0' : '#9fe8ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      // level pips
      const pips = this.add.graphics();
      for (let k = 0; k < max; k++) {
        pips.fillStyle(k < lv ? 0x7dffa0 : 0xffffff, k < lv ? 1 : 0.18).fillRoundedRect(L + k * 30, CARD_H / 2 - 34, 24, 12, 6);
      }
      c.add(pips);
      // the price
      const btn = new Pill(this, CARD_W / 2 - 74, CARD_H / 2 - 30, 128, 46, done ? 0x3b4466 : afford ? 0x2fae5a : 0x6a4a4a, () => { this.sel = i; this.act(it); }, 20);
      btn.setLabels(done ? t('maxed') : String(p));
      if (!done) {
        btn.main.setX(12);
        btn.add(this.add.image(-btn.main.width / 2 - 8, 0, STAMP_ICON).setDisplaySize(22, 22));
      }
      btn.setEnabled(!done);
      c.add(btn);
      c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true }).on('pointerup', () => { if (this.sel !== i) this.select(i); });
      b.add(c);
      this.cellOf.set('up:' + id, c);
    });
  }

  private drawLooks(): void {
    const m = this.meta, b = this.body;
    const section = (y: number, label: string) => b.add(txt(this, 60, y, label, { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
    section(310, t('shopBags'));
    section(600, t('shopCaps'));
    const swatchRow = (kind: 'bag' | 'cap', y: number) => {
      const list = kind === 'bag' ? BAGS : CAPS;
      list.forEach((q, i) => {
        const it: Item = { kind, id: q.id };
        const x = 104 + i * 128;
        const idx = this.items.findIndex((v) => v.kind === kind && v.id === q.id);
        const sel = idx === this.sel;
        const worn = kind === 'bag' ? m.bag === q.id : m.cap === q.id;
        const own = this.owned(it);
        const c = this.add.container(x, y);
        c.add(glass(this, 112, 170, { r: 18, color: sel ? 0x2c2460 : 0x1c1838, rim: worn ? 0x7dffa0 : sel ? 0xffd23f : undefined }));
        const g = this.add.graphics();
        const col = kind === 'bag' ? (q as typeof BAGS[number]).color : (q as typeof CAPS[number]).color;
        if (kind === 'bag') {
          const bq = q as typeof BAGS[number];
          g.fillStyle(0x000000, 0.25).fillRoundedRect(-30, -36, 60, 50, 8);
          g.lineStyle(5, bq.flap, 1).strokeCircle(0, -42, 18);
          g.fillStyle(bq.color, 1).fillRoundedRect(-32, -40, 64, 50, 8);
          g.fillStyle(bq.flap, 1).fillRoundedRect(-34, -40, 68, 22, { tl: 8, tr: 8, bl: 4, br: 4 });
          g.fillStyle(0xffd23f, 1).fillRect(-6, -22, 12, 8);
        } else if (col !== null) {
          g.fillStyle(col!, 1).fillEllipse(0, -22, 64, 44);
          g.fillRect(-32, -22, 64, 14);
          g.fillStyle(col!, 1).fillEllipse(24, -10, 46, 14);
          g.fillStyle(0xffffff, 0.25).fillEllipse(-8, -34, 26, 10);
        } else {
          g.lineStyle(4, 0xffffff, 0.5).strokeCircle(0, -20, 26).lineBetween(-18, -2, 18, -38);
        }
        c.add(g);
        c.add(txt(this, 0, 32, t((kind === 'bag' ? 'bag_' : 'cap_') + q.id), { size: 19, color: '#ffffff', strokeThickness: 0, shadow: false }));
        const tag = worn ? t('worn') : own ? t('wear') : `${q.price}`;
        const tagCol = worn ? '#7dffa0' : own ? '#9fe8ff' : m.stamps >= q.price ? '#ffd23f' : '#ff8a7a';
        const tagT = txt(this, own || worn ? 0 : 10, 62, tag, { title: true, size: 19, color: tagCol, strokeThickness: 0, shadow: false });
        c.add(tagT);
        if (!own) c.add(this.add.image(-tagT.width / 2 - 6, 62, STAMP_ICON).setDisplaySize(22, 22));
        c.setSize(112, 170).setInteractive({ useHandCursor: true }).on('pointerup', () => { this.sel = idx; this.act(it); });
        b.add(c);
        this.cellOf.set(kind + ':' + q.id, c);
      });
    };
    swatchRow('bag', 440);
    swatchRow('cap', 730);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        const menu = this.scene.get(this.from);
        // the menu's courier wears what was bought: build it again
        if (this.changed) menu.scene.restart();
        else { this.scene.resume(this.from); menu.events.emit('shop-closed'); }
      },
    });
  }
}

const clampI = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
