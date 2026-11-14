// Rooftop Courier: the courier shop, opened from the menu (the menu waits under it). Stamps buy
// satchels and caps (worn on the courier) and two small upgrades: more time per parcel and a
// longer flow window. Touch or mouse on the swatches and buttons; keys: arrows pick, Enter buys or
// wears, Esc goes back.
import Phaser from 'phaser';
import { txt, t, playSfx } from '@core';
import { BAGS, CAPS, UPGRADES, loadMeta, saveMeta, type Meta, type UpgradeId } from './meta';
import { STAMP_ICON, makeIcons } from './art';

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

type Item = { kind: 'bag' | 'cap'; id: string; up?: never } | { kind: 'up'; id: UpgradeId };

export class ShopScene extends Phaser.Scene {
  private meta!: Meta;
  private root!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private stampsText!: Phaser.GameObjects.Text;
  private items: Item[] = [];
  private sel = 0;
  private closed = false;
  private from = 'Menu';
  private changed = false;
  private cells: { item: Item; x: number; y: number; w: number; h: number }[] = [];

  constructor() { super('Shop'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.changed = false;
    makeIcons(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.rectangle(0, 0, width, height, 0x0b0918, 1).setOrigin(0).setInteractive());
    this.root.add(this.add.container(width / 2, 650, [glass(this, 690, 1240, { alpha: 1, r: 30, sheen: false })]));
    this.root.add(txt(this, width / 2, 84, t('shopTitle'), { title: true, size: 42, color: '#ffd23f', strokeThickness: 7 }));
    const chip = this.add.container(width / 2, 150);
    chip.add(glass(this, 240, 58, { r: 29, color: 0x241c44 }));
    chip.add(this.add.image(-80, 0, STAMP_ICON).setDisplaySize(34, 34));
    this.stampsText = txt(this, 14, 0, '', { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false });
    chip.add(this.stampsText);
    this.root.add(chip);
    this.root.add(txt(this, width / 2, 200, t('shopHint'), { size: 20, color: '#b8b4d8', strokeThickness: 0, shadow: false }));
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    this.items = [
      ...BAGS.map((b) => ({ kind: 'bag' as const, id: b.id })),
      ...CAPS.map((c) => ({ kind: 'cap' as const, id: c.id })),
      { kind: 'up' as const, id: 'time' as UpgradeId }, { kind: 'up' as const, id: 'flow' as UpgradeId },
    ];
    this.sel = BAGS.findIndex((b) => b.id === this.meta.bag);
    const back = new Pill(this, width / 2, 1196, 300, 84, 0x3b4466, () => this.close(), 28);
    back.setLabels(t('back'));
    this.root.add(back);
    this.draw();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      const n = this.items.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.sel + 1) % n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.sel - 1 + n) % n);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select(this.jumpRow(1));
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select(this.jumpRow(-1));
      else if (e.code === 'Enter' || e.code === 'Space') this.act(this.items[this.sel]);
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private jumpRow(d: number): number {
    const it = this.items[this.sel];
    const rows = ['bag', 'cap', 'up'];
    const r = clampI(rows.indexOf(it.kind) + d, 0, 2);
    const first = this.items.findIndex((q) => q.kind === rows[r]);
    return first;
  }

  private select(i: number): void {
    this.sel = i;
    playSfx(this, 'ui-click');
    this.draw();
  }

  private price(it: Item): number {
    if (it.kind === 'bag') return BAGS.find((b) => b.id === it.id)!.price;
    if (it.kind === 'cap') return CAPS.find((c) => c.id === it.id)!.price;
    const id = it.id as UpgradeId;
    const lv = this.meta.upgrades[id];
    return lv >= UPGRADES[id].length ? Infinity : UPGRADES[id][lv];
  }

  private owned(it: Item): boolean {
    if (it.kind === 'bag') return this.meta.bags.includes(it.id);
    if (it.kind === 'cap') return this.meta.caps.includes(it.id);
    return false;
  }

  private act(it: Item): void {
    const m = this.meta;
    if (it.kind !== 'up' && this.owned(it)) {
      if (it.kind === 'bag') m.bag = it.id; else m.cap = it.id;
      playSfx(this, 'ui-select');
    } else {
      const p = this.price(it);
      if (!isFinite(p) || m.stamps < p) { playSfx(this, 'shopNo'); this.cameras.main.shake(120, 0.004); return; }
      m.stamps -= p;
      if (it.kind === 'bag') { m.bags.push(it.id); m.bag = it.id; }
      else if (it.kind === 'cap') { m.caps.push(it.id); m.cap = it.id; }
      else m.upgrades[it.id as UpgradeId]++;
      playSfx(this, 'shopBuy');
    }
    this.changed = true;
    saveMeta(m);
    this.draw();
  }

  private draw(): void {
    const { width } = this.scale;
    const m = this.meta, b = this.body;
    b.removeAll(true);
    this.cells = [];
    this.stampsText.setText(String(m.stamps));
    const section = (y: number, label: string) => b.add(txt(this, 60, y, label, { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
    section(262, t('shopBags'));
    section(522, t('shopCaps'));
    section(782, t('shopUpgrades'));
    const swatchRow = (kind: 'bag' | 'cap', y: number) => {
      const list = kind === 'bag' ? BAGS : CAPS;
      list.forEach((q, i) => {
        const it: Item = { kind, id: q.id };
        const x = 104 + i * 128;
        const sel = this.items.findIndex((v) => v.kind === kind && v.id === q.id) === this.sel;
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
        c.setSize(112, 170).setInteractive({ useHandCursor: true }).on('pointerup', () => { this.sel = this.items.findIndex((v) => v.kind === kind && v.id === q.id); this.act(it); });
        b.add(c);
      });
    };
    swatchRow('bag', 390);
    swatchRow('cap', 650);
    (['time', 'flow'] as UpgradeId[]).forEach((id, i) => {
      const y = 880 + i * 150;
      const it: Item = { kind: 'up', id };
      const sel = this.items.findIndex((v) => v.kind === 'up' && v.id === id) === this.sel;
      const c = this.add.container(width / 2, y);
      c.add(glass(this, 620, 130, { r: 20, color: sel ? 0x2c2460 : 0x1c1838, rim: sel ? 0xffd23f : undefined }));
      c.add(txt(this, -280, -26, t('up_' + id), { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      c.add(txt(this, -280, 12, t('up_' + id + 'Sub'), { size: 20, color: '#b8b4d8', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      const lv = m.upgrades[id], max = UPGRADES[id].length;
      const pips = this.add.graphics();
      for (let k = 0; k < max; k++) pips.fillStyle(k < lv ? 0x7dffa0 : 0xffffff, k < lv ? 1 : 0.2).fillRoundedRect(-280 + k * 40, 38, 32, 12, 6);
      c.add(pips);
      const p = this.price(it);
      const btn = new Pill(this, 196, 0, 170, 84, lv >= max ? 0x3b4466 : m.stamps >= p ? 0x2fae5a : 0x6a4a4a, () => { this.sel = this.items.findIndex((v) => v.kind === 'up' && v.id === id); this.act(it); }, 24);
      btn.setLabels(lv >= max ? t('maxed') : t('buy'), lv >= max ? '' : t('shopStamps', { n: p }));
      btn.setEnabled(lv < max);
      c.add(btn);
      b.add(c);
    });
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
