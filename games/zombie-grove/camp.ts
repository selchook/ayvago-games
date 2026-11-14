// Zombie Grove: the camp, a scene of its own opened from the menu (the menu waits under it, so its
// keys do not start a run). Coins buy lasting upgrades (a few levels each), unlock weapons for the
// drafts and recruit heroes; a hero is picked here too. Mouse, touch and keyboard.
import Phaser from 'phaser';
import { txt, t, playSfx } from '@core';
import { HEROES, HERO_IDS, type HeroId, type WeaponId } from './defs';
import { UPGRADE_IDS, UPGRADES, WEAPON_COST, upgradeCost, buyUpgrade, buyWeapon, chooseHero, lvl, type Meta, type UpgradeId } from './meta';
import { loadMeta, saveMeta } from './save';
import { upgradeArt, weaponArt, heroArt, COIN, makeArt } from './art';
import { glass, Pill } from './ui';

type Item = { kind: 'up'; id: UpgradeId } | { kind: 'weapon'; id: WeaponId } | { kind: 'hero'; id: HeroId };

interface Tile { item: Item; x: number; y: number; w: number; h: number; box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Text; cost: Phaser.GameObjects.Text; coin: Phaser.GameObjects.Image; pips: Phaser.GameObjects.Graphics }

const LOCKABLE: WeaponId[] = ['blaster', 'wards', 'torch', 'robot'];

export class CampScene extends Phaser.Scene {
  private meta!: Meta;
  private tiles: Tile[] = [];
  private focus = 0;
  private coinText!: Phaser.GameObjects.Text;
  private infoName!: Phaser.GameObjects.Text;
  private infoDesc!: Phaser.GameObjects.Text;
  private buyBtn!: Pill;
  private closed = false;
  private from = 'Menu';
  private heroAtOpen: HeroId = 'survivor';

  constructor() { super('Camp'); }

  create(data: { from?: string }): void {
    makeArt(this);
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.heroAtOpen = this.meta.hero;
    this.tiles = [];
    this.closed = false;
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x050a06, 0.8).setOrigin(0).setInteractive();
    const panel = this.add.container(width / 2, 648);
    panel.add(glass(this, 700, 1240, { alpha: 0.96, r: 30 }));
    txt(this, width / 2, 74, t('campTitle'), { title: true, size: 44, color: '#ffd23f', strokeThickness: 7 });
    txt(this, width / 2, 136, t('campSub'), { size: 19, color: '#d8e6d0', strokeThickness: 0, shadow: false, wrap: 640 });
    const chip = this.add.container(width / 2, 202);
    chip.add(this.add.graphics().fillStyle(0x0b120d, 0.85).fillRoundedRect(-110, -26, 220, 52, 26).lineStyle(2, 0xffd23f, 0.8).strokeRoundedRect(-110, -26, 220, 52, 26));
    chip.add(this.add.image(-66, 0, COIN).setDisplaySize(40, 40));
    this.coinText = txt(this, 14, 1, '', { title: true, size: 28, color: '#ffe68a', strokeThickness: 0, shadow: false });
    chip.add(this.coinText);

    const section = (y: number, key: string) => txt(this, 40, y, t(key), { title: true, size: 22, color: '#9fc89a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    section(250, 'secUpgrades');
    UPGRADE_IDS.forEach((id, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const w = 152, gap = 10;
      const x = width / 2 - (4 * w + 3 * gap) / 2 + w / 2 + col * (w + gap) + (row === 1 ? (w + gap) / 2 : 0);
      this.tile({ kind: 'up', id }, x, 344 + row * 170, w, 160);
    });
    section(600, 'secWeapons');
    LOCKABLE.forEach((id, i) => {
      const w = 152, gap = 10;
      this.tile({ kind: 'weapon', id }, width / 2 - (4 * w + 3 * gap) / 2 + w / 2 + i * (w + gap), 690, w, 160);
    });
    section(796, 'secHeroes');
    HERO_IDS.forEach((id, i) => {
      const w = 200, gap = 14;
      this.tile({ kind: 'hero', id }, width / 2 - (3 * w + 2 * gap) / 2 + w / 2 + i * (w + gap), 886, w, 160);
    });

    // the focused item: its name, what it does, and the buy / pick button
    const info = this.add.container(width / 2, 1060);
    info.add(this.add.graphics().fillStyle(0x0b120d, 0.7).fillRoundedRect(-320, -66, 640, 132, 20));
    this.infoName = txt(this, -300, -38, '', { title: true, size: 26, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.infoDesc = txt(this, -300, -10, '', { size: 20, color: '#e6efdf', strokeThickness: 0, shadow: false, wrap: 400, align: 'left' }).setOrigin(0, 0);
    this.buyBtn = new Pill(this, 220, 0, 180, 84, 0x2f9a5a, () => this.buy(), 26);
    info.add([this.infoName, this.infoDesc, this.buyBtn]);
    const back = new Pill(this, width / 2, 1190, 260, 80, 0x5a3048, () => this.close(), 28);
    back.setLabels(t('campBack'));
    if (!this.sys.game.device.input.touch) txt(this, width / 2, 1250, t('campKeys'), { size: 18, color: '#9fb09a', strokeThickness: 0, shadow: false });

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'Escape' || e.code === 'KeyC') { this.close(); return; }
      if (e.code === 'Enter' || e.code === 'Space') { this.buy(); return; }
      const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] } as Record<string, number[]>)[e.code];
      if (dir) this.move(dir[0], dir[1]);
    });
    this.focus = Math.max(0, this.tiles.findIndex((tl) => this.state(tl.item) === 'ok'));
    this.refresh();
  }

  private tile(item: Item, x: number, y: number, w: number, h: number): void {
    const box = this.add.container(x, y);
    const bg = this.add.graphics();
    const art = item.kind === 'up' ? upgradeArt(item.id) : item.kind === 'weapon' ? weaponArt(item.id) : heroArt(item.id);
    const name = txt(this, 0, 18, this.name(item), { title: true, size: 18, strokeThickness: 0, shadow: false });
    if (name.width > w - 12) name.setScale((w - 12) / name.width);
    const coin = this.add.image(-16, 52, COIN).setDisplaySize(24, 24);
    const cost = txt(this, 2, 53, '', { title: true, size: 18, color: '#ffe68a', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const state = txt(this, 0, 53, '', { title: true, size: 16, color: '#7affc0', strokeThickness: 0, shadow: false });
    const pips = this.add.graphics();
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    box.add([bg, this.add.image(0, -32, art).setDisplaySize(item.kind === 'hero' ? 78 : 70, item.kind === 'hero' ? 78 : 70), name, pips, coin, cost, state, hit]);
    const tl: Tile = { item, x, y, w, h, box, bg, state, cost, coin, pips };
    const i = this.tiles.length;
    hit.on('pointerup', () => {
      if (this.focus === i) this.buy();
      else { this.focus = i; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
    });
    this.tiles.push(tl);
  }

  private name(it: Item): string {
    return it.kind === 'up' ? t('u_' + it.id) : it.kind === 'weapon' ? t('w_' + it.id) : t('h_' + it.id);
  }

  /** ok: can buy, poor: too dear, max/owned/selected: nothing to buy, pick: a hero to switch to. */
  private state(it: Item): 'ok' | 'poor' | 'max' | 'owned' | 'selected' | 'pick' {
    const m = this.meta;
    if (it.kind === 'up') { const c = upgradeCost(m, it.id); return c === null ? 'max' : m.coins >= c ? 'ok' : 'poor'; }
    if (it.kind === 'weapon') return m.weapons.includes(it.id) ? 'owned' : m.coins >= (WEAPON_COST[it.id] ?? 0) ? 'ok' : 'poor';
    if (m.hero === it.id) return 'selected';
    if (m.heroes.includes(it.id)) return 'pick';
    return m.coins >= HEROES[it.id].cost ? 'ok' : 'poor';
  }

  private cost(it: Item): number | null {
    if (it.kind === 'up') return upgradeCost(this.meta, it.id);
    if (it.kind === 'weapon') return this.meta.weapons.includes(it.id) ? null : WEAPON_COST[it.id] ?? null;
    return this.meta.heroes.includes(it.id) ? null : HEROES[it.id].cost;
  }

  private refresh(): void {
    this.coinText.setText(String(this.meta.coins));
    this.tiles.forEach((tl, i) => {
      const st = this.state(tl.item);
      const on = i === this.focus;
      const { w, h } = tl;
      const frame = st === 'ok' ? 0x5ad08a : st === 'poor' ? 0x5a6a5a : st === 'selected' ? 0xffd23f : 0x7ab8ff;
      tl.bg.clear()
        .fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18)
        .fillStyle(st === 'poor' ? 0x161c18 : 0x1c2a20, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 18)
        .lineStyle(on ? 5 : 3, on ? 0xfff3a0 : frame, on ? 1 : 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
      const c = this.cost(tl.item);
      const label = st === 'max' ? t('max') : st === 'owned' ? t('owned') : st === 'selected' ? t('selected') : st === 'pick' ? t('pick') : '';
      tl.state.setText(label).setVisible(!!label).setColor(st === 'selected' ? '#ffd23f' : '#7affc0');
      tl.cost.setText(c !== null ? String(c) : '').setVisible(!label).setColor(st === 'poor' ? '#a0806a' : '#ffe68a');
      tl.coin.setVisible(!label).setX(-(tl.cost.width + 26) / 2 + 12);
      tl.cost.setX(tl.coin.x + 16);
      // level pips for the upgrades
      tl.pips.clear();
      if (tl.item.kind === 'up') {
        const max = UPGRADES[tl.item.id].max, n = lvl(this.meta, tl.item.id);
        const pw = 14, gap = 4, w0 = max * pw + (max - 1) * gap;
        for (let k = 0; k < max; k++) tl.pips.fillStyle(k < n ? 0xfff07a : 0x2a3340, 1).fillRoundedRect(-w0 / 2 + k * (pw + gap), 33, pw, 6, 3);
      }
      tl.box.setScale(on ? 1.04 : 1);
    });
    const tl = this.tiles[this.focus];
    const it = tl.item;
    this.infoName.setText(this.name(it));
    this.infoDesc.setText(it.kind === 'up' ? t('ud_' + it.id) : it.kind === 'weapon' ? t('wd_' + it.id) + ' ' + t('unlockWeapon') : t('hd_' + it.id));
    const st = this.state(it);
    const c = this.cost(it);
    this.buyBtn.setVisible(st !== 'max' && st !== 'owned' && st !== 'selected');
    this.buyBtn.setLabels(st === 'pick' ? t('pick') : String(c ?? ''), st === 'pick' ? '' : '');
    this.buyBtn.setIcon(st === 'pick' ? null : COIN, 30);
    if (st !== 'pick') { this.buyBtn.main.setX(14); const ic = this.buyBtn.list.find((o) => o instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined; ic?.setVisible(true).setPosition(-this.buyBtn.main.width / 2 - 8, 0); }
    else this.buyBtn.main.setX(0);
    this.buyBtn.setEnabled(st === 'ok' || st === 'pick');
  }

  private move(dx: number, dy: number): void {
    const cur = this.tiles[this.focus];
    let best = -1, bd = Infinity;
    this.tiles.forEach((tl, i) => {
      if (i === this.focus) return;
      const ddx = tl.x - cur.x, ddy = tl.y - cur.y;
      if (dx && (Math.sign(ddx) !== dx || Math.abs(ddy) > 20)) return;
      if (dy && (Math.sign(ddy) !== dy || Math.abs(ddy) < 20)) return;
      const d = Math.abs(ddx) + Math.abs(ddy) * (dy ? 0.6 : 3);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { this.focus = best; playSfx(this, 'move', { volume: 0.3 }); this.refresh(); }
  }

  private buy(): void {
    const tl = this.tiles[this.focus];
    const it = tl.item;
    const m = this.meta;
    let ok = false;
    if (it.kind === 'up') ok = buyUpgrade(m, it.id);
    else if (it.kind === 'weapon') ok = buyWeapon(m, it.id);
    else { const r = chooseHero(m, it.id); ok = r !== 'poor'; if (r === 'picked') { saveMeta(m); playSfx(this, 'cardPick', { volume: 0.5 }); this.refresh(); return; } }
    if (!ok) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: tl.box, x: { from: tl.x - 8, to: tl.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    saveMeta(m);
    playSfx(this, 'buy', { volume: 0.6 });
    this.tweens.add({ targets: tl.box, scale: 1.14, duration: 110, yoyo: true });
    const sp = this.add.particles(tl.x, tl.y, 'zg-coin', { speed: { min: 120, max: 260 }, scale: { start: 0.35, end: 0 }, lifespan: 500, quantity: 12, emitting: false });
    sp.explode(12);
    this.time.delayedCall(700, () => sp.destroy());
    this.refresh();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    playSfx(this, 'move', { volume: 0.35 });
    const from = this.scene.get(this.from);
    this.scene.stop();
    this.scene.resume(this.from);
    // a new hero stands at the camp: the menu shows them
    if (this.meta.hero !== this.heroAtOpen) from.scene.restart();
    else from.events.emit('camp-closed');
  }
}
