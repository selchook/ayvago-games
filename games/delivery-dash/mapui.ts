// Delivery Dash: the town map, opened from the menu (the menu waits paused under it). Two tabs:
//   SHIFTS: the three districts with their six shifts each (stars earned, padlocks with what
//           opens them) and the Endless Rush card;
//   GARAGE: vehicles (van, flatbed, truck), upgrades (engine, handling, capacity, padding) and
//           paints, bought with the wallet.
// Touch, mouse and keyboard (arrows move, Enter picks, Tab switches tabs, Esc goes back).
import Phaser from 'phaser';
import { txt, t, playSfx, getBest, burst } from '@core';
import { SHIFTS, DISTRICTS } from './shifts';
import { loadMeta, saveMeta, shiftOpen, districtOpen, totalStars, type Meta } from './meta';
import { VEHICLES, UPGRADES, PAINTS, handling, vehicle } from './defs';
import { glass, Pill, makeArt } from './ui';
import { money } from './money';

interface Cell { x: number; y: number; w: number; h: number; act: () => void; box: Phaser.GameObjects.Container }

const DIST_COLORS = [0x2f5f9a, 0x1f7a6e, 0x6a4f9a];

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
  private cashTxt!: Phaser.GameObjects.Text;
  private tabs: Pill[] = [];

  constructor() { super('Map'); }

  create(data: { from?: string; tab?: 'shifts' | 'garage' }): void {
    this.from = data?.from ?? 'Menu';
    this.tab = data?.tab ?? 'shifts';
    this.meta = loadMeta();
    this.closed = false;
    makeArt(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.rectangle(0, 0, width, height, 0x101a30, 1).setOrigin(0).setInteractive());
    this.root.add(txt(this, width / 2, 52, t('mapTitle'), { title: true, size: 42, color: '#ffd23f', strokeThickness: 9 }));
    // wallet and stars
    const row = this.add.container(width / 2, 104);
    this.cashTxt = txt(this, 0, 0, '', { title: true, size: 26, color: '#ffe27a', strokeThickness: 5 }).setOrigin(0, 0.5);
    const starTxt = txt(this, 0, 0, `${totalStars(this.meta)}/54`, { title: true, size: 26, color: '#ffffff', strokeThickness: 5 }).setOrigin(0, 0.5);
    const coin = this.add.image(0, 0, 'dd-coin').setDisplaySize(34, 34);
    const star = this.add.image(0, 0, 'icon-star').setDisplaySize(32, 32).setTint(0xffd23f);
    row.add([coin, this.cashTxt, star, starTxt]);
    this.root.add(row);
    const layoutRow = () => {
      this.cashTxt.setText(money(this.meta.cash));
      const wAll = 34 + 8 + this.cashTxt.width + 40 + 32 + 8 + starTxt.width;
      let x = -wAll / 2;
      coin.x = x + 17; x += 42;
      this.cashTxt.x = x; x += this.cashTxt.width + 40;
      star.x = x + 16; x += 40;
      starTxt.x = x;
    };
    layoutRow();
    this.events.on('cash', layoutRow);
    // tabs
    this.tabs = [
      new Pill(this, width / 2 - 160, 172, 300, 68, 0x2f7fd8, () => this.setTab('shifts'), 24),
      new Pill(this, width / 2 + 160, 172, 300, 68, 0x2f7fd8, () => this.setTab('garage'), 24),
    ];
    this.tabs[0].setLabels(t('tabShifts'));
    this.tabs[1].setLabels(t('tabGarage'));
    this.root.add(this.tabs);
    const back = new Pill(this, width / 2, 1222, 300, 72, 0x3b4466, () => this.close(), 26);
    back.setLabels(t('back'));
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
    this.tabs[0].setColor(this.tab === 'shifts' ? 0xff8a1a : 0x3b4466);
    this.tabs[1].setColor(this.tab === 'garage' ? 0xff8a1a : 0x3b4466);
    if (this.tab === 'shifts') this.buildShifts(); else this.buildGarage();
    this.cursor = Math.min(this.cursor, this.cells.length - 1);
    if (this.tab === 'shifts') this.cursor = Math.max(0, this.cells.findIndex((c) => c.box.getData('cur')));
    this.drawCursor();
  }

  // ------------------------------------------------------------------ shifts

  private buildShifts(): void {
    const { width } = this.scale;
    const CW = 670, CH = 252;
    DISTRICTS.forEach((d, di) => {
      const y = 360 + di * 262;
      const open = districtOpen(this.meta, d.id);
      const card = this.add.container(width / 2, y);
      card.add(glass(this, CW, CH, { color: DIST_COLORS[di], alpha: 0.95 }));
      card.add(txt(this, -CW / 2 + 24, -CH / 2 + 30, t('d' + d.id), { title: true, size: 28, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      const list = SHIFTS.filter((s) => s.district === d.id);
      const got = list.reduce((s, q) => s + (this.meta.stars[q.id] ?? 0), 0);
      if (open) {
        card.add(this.add.image(CW / 2 - 104, -CH / 2 + 30, 'icon-star').setDisplaySize(26, 26).setTint(0xffd23f));
        card.add(txt(this, CW / 2 - 86, -CH / 2 + 31, `${got}/18`, { title: true, size: 22, color: '#ffe9a0', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      } else {
        const need = txt(this, CW / 2 - 24, -CH / 2 + 31, t('needStars', { n: d.need }), { title: true, size: 20, color: '#ffe9a0', strokeThickness: 0, shadow: false }).setOrigin(1, 0.5);
        card.add(need);
        card.add(this.add.image(need.x - need.width - 20, -CH / 2 + 30, 'icon-locked').setDisplaySize(26, 26));
      }
      this.page.add(card);
      list.forEach((s, k) => {
        const col = k % 3, rowI = Math.floor(k / 3);
        const x = width / 2 - 210 + col * 210, yy = y - 40 + rowI * 104;
        const sOpen = open && shiftOpen(this.meta, s.id);
        const cur = this.meta.mode === 'shift' && this.meta.shift === s.id;
        const box = this.add.container(x, yy);
        const g = this.add.graphics();
        const c = sOpen ? (cur ? 0x2f9f5a : 0x2f7fd8) : 0x46507a;
        g.fillStyle(0x000000, 0.3).fillRoundedRect(-92, -32, 184, 66, 20);
        g.fillStyle(c, 1).fillRoundedRect(-92, -36, 184, 66, 20);
        g.fillStyle(0xffffff, 0.16).fillRoundedRect(-87, -32, 174, 24, 12);
        if (cur) g.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(-92, -36, 184, 66, 20);
        box.add(g);
        if (sOpen) box.add(txt(this, 0, -4, t('shiftN', { n: s.id }), { title: true, size: 24, color: '#ffffff', strokeThickness: 0, shadow: false }));
        else box.add(this.add.image(0, -4, 'icon-locked').setDisplaySize(30, 30).setAlpha(0.8));
        const st = this.meta.stars[s.id] ?? 0;
        for (let q = 0; q < 3; q++) box.add(this.add.image(-24 + q * 24, 42, 'icon-star').setDisplaySize(22, 22).setTint(q < st ? 0xffd23f : 0x2a3150));
        box.setData('cur', cur);
        box.setSize(190, 100).setInteractive({ useHandCursor: true });
        const act = () => this.pickShift(s.id, sOpen, box);
        box.on('pointerup', act);
        this.page.add(box);
        this.cells.push({ x, y: yy, w: 196, h: 80, act, box });
      });
    });
    // the Endless Rush
    const ry = 1098;
    const rush = this.add.container(width / 2, ry);
    rush.add(glass(this, CW, 150, { color: 0x7a2a3a, alpha: 0.95, rim: this.meta.mode === 'rush' ? 0xffd23f : undefined }));
    rush.add(txt(this, -CW / 2 + 24, -46, t('rush'), { title: true, size: 28, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
    rush.add(txt(this, -CW / 2 + 24, -20, t('rushDesc'), { size: 19, color: '#ffe4ee', strokeThickness: 0, shadow: false, wrap: 420 }).setOrigin(0, 0).setAlign('left'));
    rush.add(txt(this, CW / 2 - 110, -44, t('rushBest', { n: money(getBest('delivery-dash')) }), { size: 20, color: '#ffffff', strokeThickness: 0, shadow: false }));
    const goAct = () => this.pickRush();
    const go = new Pill(this, CW / 2 - 110, 18, 180, 66, 0xe8453c, goAct, 26);
    go.setLabels(t('start'));
    rush.add(go);
    rush.setData('cur', this.meta.mode === 'rush');
    this.page.add(rush);
    this.cells.push({ x: width / 2 + CW / 2 - 110, y: ry + 18, w: 196, h: 80, act: goAct, box: rush });
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
    const section = (y: number, key: string) => this.page.add(txt(this, 40, y, t(key), { title: true, size: 24, color: '#9fd8ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
    // vehicles
    section(244, 'vehicles');
    VEHICLES.forEach((v, i) => {
      const x = width / 2 - 220 + i * 220, y = 368;
      const owned = m.vehicles.includes(v.id), using = m.vehicle === v.id;
      const box = this.add.container(x, y);
      box.add(glass(this, 204, 210, { color: using ? 0x2f6f4a : 0x1f2f5a, alpha: 0.95, rim: using ? 0xffd23f : undefined, r: 20 }));
      const key = `dd-vanicon-${v.id}-${m.paint}`;
      vanIcon(this, key, PAINTS[m.paint].color, v.id);
      box.add(this.add.image(0, -44, key).setDisplaySize(150, 90));
      box.add(txt(this, 0, 14, t('v_' + v.id), { title: true, size: 22, color: '#ffffff', strokeThickness: 0, shadow: false }));
      box.add(txt(this, 0, 42, t('capN', { n: v.capacity }), { size: 18, color: '#cfe0ff', strokeThickness: 0, shadow: false }));
      const label = using ? t('inUse') : owned ? t('use') : money(v.price);
      const btn = this.add.graphics().fillStyle(using ? 0x3b4466 : owned ? 0x2fae5a : 0xff8a1a, 1).fillRoundedRect(-80, 60, 160, 38, 19);
      box.add([btn, txt(this, 0, 79, label, { title: true, size: 20, color: '#ffffff', strokeThickness: 0, shadow: false })]);
      box.setSize(204, 210).setInteractive({ useHandCursor: true });
      const act = () => this.vehicleAct(v.id, box);
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x, y, w: 212, h: 218, act, box });
    });
    // upgrades
    section(510, 'upgrades');
    const base = handling(vehicle(m.vehicle), m.up);
    void base;
    UPGRADES.forEach((u, i) => {
      const y = 572 + i * 92;
      const lvl = m.up[u.id];
      const box = this.add.container(width / 2, y);
      box.add(glass(this, 660, 80, { color: 0x1f2f5a, alpha: 0.95, r: 20 }));
      box.add(txt(this, -306, -14, t('up_' + u.id), { title: true, size: 24, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      box.add(txt(this, -306, 16, t('upd_' + u.id), { size: 18, color: '#cfe0ff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      for (let q = 0; q < u.max; q++) box.add(this.add.rectangle(70 + q * 30, 0, 22, 22, q < lvl ? 0xffd23f : 0x2a3150).setStrokeStyle(2, 0xffffff, 0.4));
      const max = lvl >= u.max;
      const btn = this.add.graphics().fillStyle(max ? 0x3b4466 : 0xff8a1a, 1).fillRoundedRect(180, -24, 136, 48, 24);
      box.add([btn, txt(this, 248, 0, max ? t('maxed') : money(u.cost[lvl]), { title: true, size: 22, color: '#ffffff', strokeThickness: 0, shadow: false })]);
      box.setSize(660, 80).setInteractive({ useHandCursor: true });
      const act = () => this.upgradeAct(u.id, box);
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x: width / 2 + 248, y, w: 146, h: 58, act, box });
    });
    // paints
    section(958, 'paints');
    PAINTS.forEach((p, i) => {
      const x = width / 2 - 270 + i * 90, y = 1028;
      const owned = m.paints.includes(i), using = m.paint === i;
      const box = this.add.container(x, y);
      box.add(this.add.circle(0, 4, 34, 0x000000, 0.3));
      box.add(this.add.circle(0, 0, 34, p.color).setStrokeStyle(using ? 5 : 2, using ? 0xffd23f : 0xffffff, using ? 1 : 0.5));
      if (!owned) box.add(txt(this, 0, 52, money(p.price), { title: true, size: 17, color: '#ffe27a', strokeThickness: 4 }));
      else box.add(txt(this, 0, 52, t('p_' + p.id), { size: 16, color: '#cfe0ff', strokeThickness: 0, shadow: false }));
      box.setSize(84, 110).setInteractive({ useHandCursor: true });
      const act = () => this.paintAct(i, box);
      box.on('pointerup', act);
      this.page.add(box);
      this.cells.push({ x, y, w: 80, h: 80, act, box });
    });
  }

  private pay(price: number, box: Phaser.GameObjects.Container): boolean {
    if (this.meta.cash < price) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: box, x: box.x + 8, duration: 50, yoyo: true, repeat: 2 });
      const tip = txt(this, this.scale.width / 2, box.y - 70, t('notEnough'), { title: true, size: 26, color: '#ff9a7a', strokeThickness: 7 });
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
