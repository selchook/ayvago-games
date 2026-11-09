import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, t, rng, COLORS, isEasy } from '@core';
import { ftxt as txt, fpopup as popup, freshTextCanvases } from './fasttext';
import { makeField, makeFx, makeGate, makeSidebar, makeTopBar } from './art';

const CELL = 80, COLS = 13, ROWS = 8, TOP = 80, FIELD_W = COLS * CELL; // 1040 x 640 field
const SIDE = FIELD_W + 120;                                               // sidebar centre x
const GOLD_Y = 124;                                                       // gold counter row
const ADD = Phaser.BlendModes.ADD;
const PATH: [number, number][] = [[-1, 1], [3, 1], [3, 6], [6, 6], [6, 1], [9, 1], [9, 6], [12, 6], [12, 8.7]];
const WAVES = 15;
/**
 * Normal and Easy (practice). Easy: 260 starting gold instead of 170, 30 lives instead of 20,
 * enemies with 20% less health that move 15% slower, and enemy health that ramps at 85% speed
 * (wave w is as tough as wave 1 + (w - 1) * ramp). The waves bring the same enemies.
 */
const TUNING = {
  normal: { gold: 170, lives: 20, hp: 1, speed: 1, ramp: 1 },
  easy: { gold: 260, lives: 30, hp: 0.8, speed: 0.85, ramp: 0.85 },
};

type Kind = 'soldier' | 'runner' | 'heavy' | 'tank' | 'tank2' | 'plane' | 'boss';
const ENEMY: Record<Kind, { tex: string; top?: string; hp: number; speed: number; gold: number; lives: number; air?: boolean; scale?: number }> = {
  soldier: { tex: 'td-e0', hp: 30, speed: 62, gold: 5, lives: 1 },
  runner: { tex: 'td-e1', hp: 20, speed: 108, gold: 5, lives: 1 },
  heavy: { tex: 'td-e2', hp: 70, speed: 48, gold: 8, lives: 1 },
  tank: { tex: 'td-tank', top: 'td-tank-t', hp: 200, speed: 40, gold: 16, lives: 2 },
  tank2: { tex: 'td-tank2', top: 'td-tank2-t', hp: 360, speed: 34, gold: 24, lives: 3 },
  plane: { tex: 'td-plane', hp: 75, speed: 92, gold: 12, lives: 1, air: true },
  boss: { tex: 'td-tank2', top: 'td-tank2-t', hp: 520, speed: 24, gold: 150, lives: 10, scale: 1.6 },
};

interface TDef { name: string; base: string; head: string; cost: number; dmg: number; rate: number; range: number; air: boolean; splash: number; shot: string; speed: number; homing: boolean; sfx: string }
const TOWERS: TDef[] = [
  { name: 'tGun', base: 'td-b0', head: 'td-h0', cost: 50, dmg: 9, rate: 0.3, range: 170, air: true, splash: 0, shot: 'td-bullet', speed: 950, homing: true, sfx: 'gun' },
  { name: 'tCannon', base: 'td-b1', head: 'td-h1', cost: 80, dmg: 32, rate: 1.15, range: 165, air: false, splash: 80, shot: 'td-shell', speed: 640, homing: false, sfx: 'cannon' },
  { name: 'tMissile', base: 'td-b2', head: 'td-h2', cost: 125, dmg: 60, rate: 1.6, range: 280, air: true, splash: 45, shot: 'td-rocket', speed: 480, homing: true, sfx: 'missile' },
];

interface Enemy { kind: Kind; spr: Phaser.GameObjects.Image; top?: Phaser.GameObjects.Image; shadow?: Phaser.GameObjects.Image; shade?: Phaser.GameObjects.Image; hp: number; max: number; speed: number; wp: number; dist: number; air: boolean; alive: boolean; vy: number }
interface Tower { def: TDef; lv: number; c: number; r: number; x: number; y: number; base: Phaser.GameObjects.Image; head: Phaser.GameObjects.Image; shade: Phaser.GameObjects.Image; cd: number; spent: number }
interface Shot { spr: Phaser.GameObjects.Image; tw: Tower; target: Enemy; tx: number; ty: number; dmg: number; trail: number }
interface SideBtn { box: Phaser.GameObjects.Container; face: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; icons: Phaser.GameObjects.Image[] }
interface Slot { box: Phaser.GameObjects.Container; a: Phaser.GameObjects.Image; b: Phaser.GameObjects.Image; n: Phaser.GameObjects.Text }

/** Enemy groups shown in the sidebar's wave preview. */
const GROUPS: { kinds: Kind[]; a: string; b?: string; scale: number; tint?: number }[] = [
  { kinds: ['soldier', 'runner', 'heavy'], a: 'td-e0', scale: 1 },
  { kinds: ['tank', 'tank2'], a: 'td-tank', b: 'td-tank-t', scale: 0.62 },
  { kinds: ['plane'], a: 'td-plane', scale: 0.6 },
  { kinds: ['boss'], a: 'td-tank2', b: 'td-tank2-t', scale: 0.7, tint: 0xff7070 },
];

export class PlayScene extends ArcadeScene {
  private grid: number[][] = [];          // 0 grass, 1 path, 2 decor, 3 tower
  private pts: Phaser.Math.Vector2[] = [];
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private shots: Shot[] = [];
  private gold = 0;
  private lives = 0;
  private wave = 0;
  private phase: 'build' | 'wave' = 'build';
  private countdown = 0;
  private queue: { kind: Kind; gap: number }[] = [];
  private spawnT = 0;
  private selType = 0;
  private selTower: Tower | null = null;
  private cur = { c: 0, r: 0 };
  private cursorOn = false;
  private fx!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private goldText!: Phaser.GameObjects.Text;
  private cards: SideBtn[] = [];
  private info!: Phaser.GameObjects.Text;
  private upBtn!: SideBtn;
  private sellBtn!: SideBtn;
  private waveBtn!: SideBtn;
  private lastSfx: Record<string, number> = {};
  private nextQueue: { kind: Kind; gap: number }[] = [];
  private waveTotal = 1;
  private countdownMax = 20;
  private slots: Slot[] = [];
  private goldIcon!: Phaser.GameObjects.Image;
  private prog!: Phaser.GameObjects.Graphics;
  private ghostBase!: Phaser.GameObjects.Image;
  private ghostHead!: Phaser.GameObjects.Image;
  private vig!: Phaser.GameObjects.Image;
  private gate!: Phaser.GameObjects.Image;
  private clouds: Phaser.GameObjects.Image[] = [];
  private hurt = 0;
  private coinsFlying = 0;
  tune = TUNING.normal;

  createGame(): void {
    freshTextCanvases(this);
    this.enemies = []; this.towers = []; this.shots = []; this.queue = []; this.cards = []; this.lastSfx = {};
    this.slots = []; this.clouds = []; this.hurt = 0; this.coinsFlying = 0;
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.gold = this.tune.gold; this.lives = this.tune.lives; this.wave = 0; this.phase = 'build'; this.countdown = 20; this.countdownMax = 20;
    this.spawnT = 0; this.selType = 0; this.selTower = null; this.cur = { c: 1, r: 3 }; this.cursorOn = false;
    this.nextQueue = this.buildWave(1);

    makeFx(this); makeGate(this);
    makeSidebar(this, this.scale.width - FIELD_W, this.scale.height - TOP);
    makeTopBar(this, this.scale.width, TOP);
    this.buildMap();
    this.fx = this.add.graphics().setDepth(40);
    this.bars = this.add.graphics().setDepth(60);
    this.ghostBase = this.add.image(0, 0, 'td-b0').setDepth(19).setAlpha(0.5).setVisible(false);
    this.ghostHead = this.add.image(0, 0, 'td-h0').setDepth(19).setAlpha(0.5).setVisible(false);
    for (let i = 0; i < 2; i++) {
      this.clouds.push(this.add.image(rng.int(0, FIELD_W), rng.int(TOP + 120, TOP + ROWS * CELL - 120), 'td-cloud')
        .setDepth(70).setScale(2.6 + i * 0.6).setAlpha(0.13));
    }
    this.vig = this.add.image(FIELD_W / 2, TOP + (ROWS * CELL) / 2, 'td-vig').setDisplaySize(FIELD_W, ROWS * CELL).setDepth(75).setAlpha(0);
    this.buildSidebar();
    this.add.image(0, 0, 'td-top').setOrigin(0).setDepth(80);
    this.prog = this.add.graphics().setDepth(81);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.x < FIELD_W && p.y >= TOP) { this.cur = this.cellAt(p.x, p.y); this.cursorOn = true; }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x >= FIELD_W || p.y < TOP) return;
      this.cur = this.cellAt(p.x, p.y); this.cursorOn = true;
      this.actAt(this.cur.c, this.cur.r, false);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.refreshUi();
    this.updateHud();
  }

  // ---------- map ----------
  private buildMap(): void {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.pts = PATH.map(([c, r]) => new Phaser.Math.Vector2(c * CELL + CELL / 2, TOP + r * CELL + CELL / 2));
    for (let i = 0; i < PATH.length - 1; i++) {
      let [c, r] = PATH[i];
      const [c2, r2] = PATH[i + 1];
      while (c !== c2 || Math.floor(r) !== Math.floor(r2)) {
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) this.grid[Math.floor(r)][c] = 1;
        if (c !== c2) c += Math.sign(c2 - c); else r += Math.sign(r2 - r);
        if (r >= ROWS) break;
      }
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) this.grid[Math.floor(r)][c] = 1;
    }
    makeField(this, 'td-field', COLS, ROWS, CELL, this.pts.map((p) => ({ x: p.x, y: p.y - TOP })), (c, r) => this.grid[r][c] === 1);
    this.add.image(0, TOP, 'td-field').setOrigin(0);
    // a few decorations block building and add life to the map
    const spots: [number, number, string][] = [[0, 0, 'td-bush'], [12, 0, 'td-rock2'], [0, 7, 'td-bush'], [5, 3, 'td-rock'], [7, 7, 'td-bush2'], [11, 2, 'td-bush'], [1, 4, 'td-rock2']];
    for (const [c, r, key] of spots) {
      if (this.grid[r][c] !== 0) continue;
      this.grid[r][c] = 2;
      const x = c * CELL + CELL / 2, y = TOP + r * CELL + CELL / 2;
      this.add.image(x + 4, y + 18, 'td-shade').setDepth(5).setScale(1.2, 1);
      this.add.image(x, y, key).setScale(1.1).setDepth(6).setTint(key.startsWith('td-bush') ? 0xb8dcb8 : 0xffffff).setAngle(rng.int(-20, 20)).setFlipX(rng.chance(0.5));
    }
    // the barrier guarding the base where the road leaves the map
    this.gate = this.add.image(12 * CELL + CELL / 2, TOP + ROWS * CELL - 18, 'td-gate').setDepth(7);
  }

  private cellAt(x: number, y: number): { c: number; r: number } {
    return { c: Phaser.Math.Clamp(Math.floor(x / CELL), 0, COLS - 1), r: Phaser.Math.Clamp(Math.floor((y - TOP) / CELL), 0, ROWS - 1) };
  }

  // ---------- sidebar ----------
  private sideBtn(y: number, h: number, color: number, label: string, size: number, onClick: () => void): SideBtn {
    const box = this.add.container(SIDE, y).setDepth(90);
    const face = this.add.container(0, 0);
    const shadow = this.add.rectangle(0, 5, 220, h, 0x000000, 0.55);
    const bg = this.add.rectangle(0, 0, 220, h, color).setStrokeStyle(3, 0x000000);
    const hi = this.add.rectangle(0, -h / 2 + 5, 206, 4, 0xffffff, 0.18);
    const lo = this.add.rectangle(0, h / 2 - 5, 206, 4, 0x000000, 0.25);
    const lbl = txt(this, 0, 0, label, { title: true, size, strokeThickness: 0, shadow: false });
    face.add([bg, hi, lo, lbl]);
    box.add([shadow, face]).setSize(220, h + 5).setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => { face.y = 3; });
    box.on('pointerout', () => { face.y = 0; });
    box.on('pointerup', () => { face.y = 0; onClick(); });
    return { box, face, bg, label: lbl, icons: [] };
  }

  private buildSidebar(): void {
    this.add.image(FIELD_W, TOP, 'td-side').setOrigin(0).setDepth(85);
    // gold counter
    this.add.rectangle(SIDE, GOLD_Y, 220, 58, 0x0a0910).setStrokeStyle(3, 0x000000).setDepth(86);
    this.add.rectangle(SIDE, GOLD_Y + 24, 210, 3, 0xffffff, 0.08).setDepth(86);
    this.goldIcon = this.add.image(SIDE - 78, GOLD_Y, 'td-coin').setScale(1.15).setDepth(90);
    this.tweens.add({ targets: this.goldIcon, scaleX: 0.25, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.goldText = txt(this, SIDE - 46, GOLD_Y + 2, '0', { title: true, size: 26, color: '#ffd23f' }).setOrigin(0, 0.5).setDepth(90);
    // tower cards
    TOWERS.forEach((d, i) => {
      const b = this.sideBtn(205 + i * 90, 80, 0x2a2638, '', 1, () => this.pickType(i));
      b.label.destroy();
      const plate = this.add.circle(-70, 0, 31, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.12);
      const base = this.add.image(-70, 0, d.base).setScale(0.82);
      const head = this.add.image(-70, 0, d.head).setScale(0.82);
      const name = txt(this, -30, -14, t(d.name), { size: 24 }).setOrigin(0, 0.5);
      const coin = this.add.image(-20, 17, 'td-coin').setScale(0.42);
      const cost = txt(this, -6, 18, String(d.cost), { title: true, size: 16, color: '#ffd23f' }).setOrigin(0, 0.5);
      const keyBg = this.add.rectangle(-99, -29, 20, 20, 0x000000, 0.6).setStrokeStyle(2, 0xffffff, 0.25);
      const key = txt(this, -98, -28, String(i + 1), { title: true, size: 12, strokeThickness: 0, shadow: false, color: '#bdb8d0' });
      b.face.add([plate, base, head, name, coin, cost, keyBg, key]);
      if (d.air) b.face.add(this.add.image(86, -20, 'td-plane').setScale(0.34).setAngle(-45).setAlpha(0.9));
      b.label = cost;
      b.icons = [base, head];
      this.cards.push(b);
    });
    // info line / wave preview
    this.info = txt(this, SIDE, 458, '', { size: 20, color: '#bdb8d0', wrap: 220 }).setDepth(90);
    for (let i = 0; i < GROUPS.length; i++) {
      const box = this.add.container(SIDE - 81 + i * 54, 500).setDepth(90);
      const plate = this.add.rectangle(0, 0, 48, 48, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.1);
      const a = this.add.image(0, -2, 'td-e0');
      const b = this.add.image(0, -2, 'td-tank-t');
      const n = txt(this, 14, 18, '', { title: true, size: 12, strokeThickness: 4, shadow: false });
      box.add([plate, a, b, n]);
      this.slots.push({ box, a, b, n });
    }
    this.upBtn = this.sideBtn(575, 80, COLORS.purple, '', 16, () => this.upgrade());
    this.sellBtn = this.sideBtn(670, 64, 0x6b3a2a, '', 16, () => this.sell());
    this.waveBtn = this.sideBtn(630, 104, COLORS.red, '', 16, () => this.startWave(true));
  }

  private refreshUi(): void {
    this.goldText.setText(String(this.gold));
    this.cards.forEach((b, i) => {
      const on = i === this.selType && !this.selTower;
      const can = this.gold >= TOWERS[i].cost;
      b.bg.setStrokeStyle(on ? 5 : 3, on ? COLORS.yellow : 0x000000).setFillStyle(on ? 0x433b62 : 0x2a2638);
      b.label.setColor(can ? '#ffd23f' : '#ec3013');
      b.icons.forEach((o) => o.setAlpha(can ? 1 : 0.45));
    });
    const tw = this.selTower;
    this.upBtn.box.setVisible(!!tw); this.sellBtn.box.setVisible(!!tw); this.waveBtn.box.setVisible(!tw);
    if (tw) {
      const cost = this.upCost(tw);
      this.info.setText(`${t(tw.def.name)} ${t('lvl')}${tw.lv}\n${tw.def.air ? t('airGround') : t('groundOnly')}`).setY(470);
      this.upBtn.label.setText(cost ? `${t('upgrade')}\n$${cost}` : t('max'));
      this.upBtn.bg.setFillStyle(cost && this.gold >= cost ? COLORS.purple : 0x444455);
      this.sellBtn.label.setText(`${t('sell')} $${this.sellValue(tw)}`);
    } else if (this.phase === 'build') {
      this.waveBtn.label.setText(`${t('nextWave')} ${this.wave + 1}\n${t('nextIn', { n: Math.ceil(this.countdown) })}`);
      this.waveBtn.bg.setFillStyle(COLORS.red);
    } else {
      this.waveBtn.label.setText(t('waveOf', { n: this.wave, m: WAVES }));
      this.waveBtn.bg.setFillStyle(0x444455);
    }
    this.updatePreview();
  }

  /** Sidebar preview: what the next wave brings (between waves) or what is still coming (during one). */
  private updatePreview(): void {
    const show = !this.selTower;
    const kinds: Kind[] = this.phase === 'build' ? this.nextQueue.map((q) => q.kind) : [...this.queue.map((q) => q.kind), ...this.enemies.map((e) => e.kind)];
    if (show) this.info.setText(kinds.length ? t(this.phase === 'build' ? 'nextLbl' : 'incoming') : '').setY(458);
    let i = 0;
    GROUPS.forEach((g) => {
      const n = kinds.filter((k) => g.kinds.includes(k)).length;
      if (!n || !show) return;
      const s = this.slots[i++];
      s.a.setTexture(g.a).setScale(g.scale).setAngle(-90);
      if (g.tint) s.a.setTint(g.tint); else s.a.clearTint();
      s.b.setVisible(!!g.b);
      if (g.b) { s.b.setTexture(g.b).setScale(g.scale).setAngle(-90); if (g.tint) s.b.setTint(g.tint); else s.b.clearTint(); }
      s.n.setText('×' + n);
      s.box.setVisible(true);
    });
    for (; i < this.slots.length; i++) this.slots[i].box.setVisible(false);
  }

  private updateHud(): void {
    this.hud.setLives(this.lives);
    this.hud.setCenter(t('waveOf', { n: Math.max(1, this.wave), m: WAVES }));
  }

  // ---------- input ----------
  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const k = e.code;
    const mv = (dc: number, dr: number) => {
      this.cur = { c: Phaser.Math.Clamp(this.cur.c + dc, 0, COLS - 1), r: Phaser.Math.Clamp(this.cur.r + dr, 0, ROWS - 1) };
      this.cursorOn = true;
    };
    if (k === 'ArrowLeft' || k === 'KeyA') mv(-1, 0);
    else if (k === 'ArrowRight' || k === 'KeyD') mv(1, 0);
    else if (k === 'ArrowUp' || k === 'KeyW') mv(0, -1);
    else if (k === 'ArrowDown' || k === 'KeyS') mv(0, 1);
    else if (k === 'Space' || k === 'Enter' || k === 'KeyZ') { this.cursorOn = true; this.actAt(this.cur.c, this.cur.r, true); }
    else if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') this.pickType(Number(k.slice(-1)) - 1);
    else if (k === 'KeyX' || k === 'ShiftLeft' || k === 'ShiftRight') this.pickType((this.selType + 1) % TOWERS.length);
    else if (k === 'KeyN') this.startWave(true);
    else if (k === 'KeyU') this.upgrade();
    else if (k === 'Backspace' || k === 'Delete') this.sell();
  }

  private pickType(i: number): void {
    this.selType = i; this.selTower = null;
    this.sfx('select', { volume: 0.35 });
    this.refreshUi();
  }

  private actAt(c: number, r: number, keyboard: boolean): void {
    const tw = this.towers.find((o) => o.c === c && o.r === r);
    if (tw) {
      if (keyboard && this.selTower === tw) this.upgrade();
      else { this.selTower = tw; this.sfxAt('select', tw.x, { volume: 0.35 }); }
      this.refreshUi();
      return;
    }
    if (this.selTower) { this.selTower = null; this.refreshUi(); if (!keyboard) return; }
    const cx = c * CELL + CELL / 2, cy = TOP + r * CELL + CELL / 2;
    if (this.grid[r][c] !== 0) { this.warn(t('cantBuild'), cx, cy); return; }
    const d = TOWERS[this.selType];
    if (this.gold < d.cost) { this.warn(t('noGold'), cx, cy); return; }
    this.gold -= d.cost;
    this.grid[r][c] = 3;
    const shade = this.add.image(cx + 3, cy + 16, 'td-shade').setDepth(19).setScale(1.25, 1.1);
    const base = this.add.image(cx, cy - 60, d.base).setDepth(20).setScale(0.6);
    const head = this.add.image(cx, cy - 60, d.head).setDepth(30).setScale(0.6).setAngle(-90);
    this.tweens.add({ targets: [base, head], y: cy, scale: 1, duration: 260, ease: 'Bounce.easeOut' });
    this.towers.push({ def: d, lv: 1, c, r, x: cx, y: cy, base, head, shade, cd: 0.2, spent: d.cost });
    this.time.delayedCall(120, () => this.ring(cx, cy + 10, 0xd9c7a0, 0.9, 260));
    burst(this, cx, cy + 10, [0xbfc7cc, 0x8a6a3a, 0x6b4a2a], 16, 170);
    this.sfxAt('build', cx, { volume: 0.55 });
    this.refreshUi();
  }

  private warn(msg: string, x: number, y: number): void {
    popup(this, Phaser.Math.Clamp(x, 200, FIELD_W - 200), y, msg, '#ec3013', 18);
    this.sfxAt('error', x, { volume: 0.4 });
  }

  private upCost(tw: Tower): number {
    return tw.lv >= 3 ? 0 : Math.round(tw.def.cost * (tw.lv === 1 ? 0.8 : 1.3));
  }

  private sellValue(tw: Tower): number {
    return Math.floor(tw.spent * 0.7);
  }

  private upgrade(): void {
    const tw = this.selTower;
    if (!tw) return;
    const cost = this.upCost(tw);
    if (!cost) { this.warn(t('max'), tw.x, tw.y - 40); return; }
    if (this.gold < cost) { this.warn(t('noGold'), tw.x, tw.y - 40); return; }
    this.gold -= cost; tw.spent += cost; tw.lv++;
    if (tw.def.name === 'tMissile' && tw.lv === 3) tw.head.setTexture('td-h2b');
    const tint = tw.lv === 2 ? 0xc8f0ff : 0xffe39a;
    tw.base.setTint(tint);
    this.tweens.add({ targets: [tw.base, tw.head], scale: { from: 1.35, to: 1 + (tw.lv - 1) * 0.06 }, duration: 300, ease: 'Back.easeOut' });
    burst(this, tw.x, tw.y, [COLORS.yellow, COLORS.cyan, 0xffffff], 24, 240);
    this.glow(tw.x, tw.y, tw.lv === 2 ? 0x7fd8ff : 0xffd23f, 1.6, 380);
    this.ring(tw.x, tw.y, tw.lv === 2 ? 0x7fd8ff : 0xffd23f, 1.3, 420);
    this.sfxAt('upgrade', tw.x, { volume: 0.55 });
    this.refreshUi();
  }

  private sell(): void {
    const tw = this.selTower;
    if (!tw) return;
    const v = this.sellValue(tw);
    this.gold += v;
    this.grid[tw.r][tw.c] = 0;
    popup(this, tw.x, tw.y - 20, '+$' + v, '#ffd23f', 20);
    burst(this, tw.x, tw.y, [0xbfc7cc, COLORS.yellow], 18, 220);
    tw.base.destroy(); tw.head.destroy(); tw.shade.destroy();
    this.ring(tw.x, tw.y, COLORS.yellow, 0.9, 260);
    this.towers = this.towers.filter((o) => o !== tw);
    this.shots = this.shots.filter((s) => { if (s.tw === tw) s.spr.destroy(); return s.tw !== tw; });
    this.selTower = null;
    this.sfxAt('sell', tw.x, { volume: 0.55 });
    this.refreshUi();
  }

  // ---------- waves ----------
  private startWave(early: boolean): void {
    if (this.phase !== 'build' || this.wave >= WAVES || this.isOver) return;
    if (early && this.countdown > 1) {
      const bonus = Math.floor(this.countdown);
      this.gold += bonus;
      popup(this, SIDE, 560, '+$' + bonus, '#ffd23f', 20);
    }
    this.wave++;
    this.phase = 'wave';
    this.queue = this.nextQueue;
    this.waveTotal = Math.max(1, this.queue.length);
    this.nextQueue = this.wave < WAVES ? this.buildWave(this.wave + 1) : [];
    this.spawnT = 0.3;
    if (this.wave === WAVES) this.sfx('final', { volume: 0.5 });
    else this.sfx('wave', { volume: 0.4 });
    const final = this.wave === WAVES;
    this.banner(final ? t('finalWave') : `${t('wave')} ${this.wave}`, final ? '#ec3013' : '#ffd23f', final ? 0xec3013 : 0xffd23f);
    this.updateHud();
    this.refreshUi();
  }

  private buildWave(w: number): { kind: Kind; gap: number }[] {
    const list: { kind: Kind; gap: number }[] = [];
    const gap = Math.max(0.42, 0.85 - w * 0.03);
    const n = 6 + w * 2;
    for (let i = 0; i < n; i++) {
      const kind: Kind = w >= 6 && i % 5 === 4 ? 'heavy' : w >= 3 && i % 3 === 2 ? 'runner' : 'soldier';
      list.push({ kind, gap });
    }
    if (w >= 3) for (let i = 0; i < Math.min(8, Math.floor((w - 1) / 2)); i++) {
      list.splice(rng.int(Math.floor(list.length / 3), list.length), 0, { kind: w >= 9 && i % 2 ? 'tank2' : 'tank', gap: gap * 1.6 });
    }
    if (w >= 5) for (let i = 0; i < Math.floor(w / 2.5); i++) list.splice(rng.int(0, list.length), 0, { kind: 'plane', gap: 0.2 });
    if (w === 10) list.push({ kind: 'tank2', gap: 2 }, { kind: 'tank2', gap: 1.4 });
    if (w === WAVES) list.push({ kind: 'boss', gap: 2.5 });
    return list;
  }

  private spawn(kind: Kind): void {
    const d = ENEMY[kind];
    const w = 1 + (this.wave - 1) * this.tune.ramp;   // equals the wave number in Normal
    const hpMul = (1 + (w - 1) * 0.4 + Math.max(0, w - 5) ** 2 * 0.1) * this.tune.hp;
    const air = !!d.air;
    const p0 = this.pts[0];
    const x = air ? -60 : p0.x, y = air ? rng.int(TOP + 60, TOP + ROWS * CELL - 60) : p0.y;
    const scale = d.scale ?? 1;
    const spr = this.add.image(x, y, d.tex).setDepth(air ? 55 : 35).setScale(scale * (air ? 1.1 : kind.startsWith('tank') || kind === 'boss' ? 1 : 1.25));
    const e: Enemy = { kind, spr, hp: d.hp * hpMul, max: d.hp * hpMul, speed: d.speed * (1 + w * 0.01) * this.tune.speed, wp: 1, dist: 0, air, alive: true, vy: air ? rng.int(-30, 30) : 0 };
    if (d.top) e.top = this.add.image(x, y, d.top).setDepth(36).setScale(scale);
    if (kind === 'boss') {
      spr.setTint(0xff7070); e.top!.setTint(0xff7070);
      const warn = txt(this, FIELD_W / 2, 300, t('bossIn'), { title: true, size: 36, color: '#ec3013' }).setDepth(200);
      this.tweens.add({ targets: warn, alpha: 0.2, duration: 250, yoyo: true, repeat: 3, onComplete: () => warn.destroy() });
      shake(this, 0.01, 400);
    }
    if (air) e.shadow = this.add.image(x + 18, y + 26, 'td-shadow').setDepth(34).setAlpha(0.3).setScale(0.9);
    else e.shade = this.add.image(x, y + 6, 'td-shade').setDepth(33).setScale(kind === 'boss' ? 1.7 : kind.startsWith('tank') ? 1.05 : 0.55).setAlpha(0.8);
    this.enemies.push(e);
    this.updatePreview();
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.phase === 'build') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave(false);
      else if (Math.ceil(this.countdown) !== Math.ceil(this.countdown + dt)) {
        this.refreshUi();
        if (this.countdown <= 3 && this.wave > 0) this.sfx('tick', { volume: 0.3, exact: true });
      }
    } else if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { const q = this.queue.shift()!; this.spawn(q.kind); this.spawnT = this.queue[0]?.gap ?? 0; }
    }

    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.moveShots(dt);
    this.drawOverlay();

    for (const c of this.clouds) {
      c.x += (10 + c.scale * 2) * dt;
      if (c.x - c.displayWidth / 2 > FIELD_W) { c.x = -c.displayWidth / 2; c.y = rng.int(TOP + 120, TOP + ROWS * CELL - 120); }
    }
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    const low = this.lives > 0 && this.lives <= 5 ? 0.22 + 0.12 * Math.sin(this.time.now / 160) : 0;
    this.vig.setAlpha(Math.max(this.hurt, low));

    if (this.phase === 'wave' && !this.queue.length && this.enemies.length === 0 && !this.isOver) this.waveCleared();
  }

  private moveEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.air) {
        e.spr.x += e.speed * dt; e.spr.y = Phaser.Math.Clamp(e.spr.y + e.vy * dt, TOP + 40, TOP + ROWS * CELL - 40);
        e.dist = e.spr.x * 0.8;
        e.spr.rotation = Math.atan2(e.vy, e.speed);
        e.shadow!.setPosition(e.spr.x + 18, e.spr.y + 26).setRotation(e.spr.rotation);
        if (e.spr.x > FIELD_W - 20) this.leak(e);
        continue;
      }
      let step = e.speed * dt;
      while (step > 0 && e.alive) {
        const tgt = this.pts[e.wp];
        if (!tgt) { this.leak(e); break; }
        const dx = tgt.x - e.spr.x, dy = tgt.y - e.spr.y, len = Math.hypot(dx, dy);
        if (len <= step) { e.spr.setPosition(tgt.x, tgt.y); step -= len; e.dist += len; e.wp++; }
        else {
          e.spr.x += (dx / len) * step; e.spr.y += (dy / len) * step; e.dist += step; step = 0;
          const want = Math.atan2(dy, dx);
          e.spr.rotation = Phaser.Math.Angle.RotateTo(e.spr.rotation, want, 8 * dt);
        }
      }
      e.top?.setPosition(e.spr.x, e.spr.y).setRotation(e.spr.rotation);
      e.shade?.setPosition(e.spr.x + 2, e.spr.y + 8);
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private leak(e: Enemy): void {
    if (!e.alive) return;
    this.removeEnemy(e);
    this.lives -= ENEMY[e.kind].lives;
    this.sfxAt('leak', e.spr.x, { volume: 0.6 });
    const before = this.lives + ENEMY[e.kind].lives;
    if (before > 5 && this.lives <= 5 && this.lives > 0) this.time.delayedCall(250, () => this.sfx('lowhp', { volume: 0.55 }));
    shake(this, 0.012, 200);
    this.hurt = 0.75;
    this.gate.setTintFill(0xffffff);
    this.tweens.add({ targets: this.gate, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut', onComplete: () => this.gate.clearTint() });
    this.updateHud();
    if (this.lives <= 0) {
      this.lives = 0; this.updateHud();
      this.endGame({ delay: 900 });
    }
  }

  private removeEnemy(e: Enemy): void {
    e.alive = false;
    e.spr.destroy(); e.top?.destroy(); e.shadow?.destroy(); e.shade?.destroy();
  }

  private fireTowers(dt: number): void {
    for (const tw of this.towers) {
      tw.cd -= dt;
      const range = tw.def.range * (1 + 0.12 * (tw.lv - 1));
      let best: Enemy | null = null;
      for (const e of this.enemies) {
        if (e.air && !tw.def.air) continue;
        if (Phaser.Math.Distance.Between(tw.x, tw.y, e.spr.x, e.spr.y) > range) continue;
        if (!best || e.dist > best.dist) best = e;
      }
      if (!best) { tw.head.rotation += Math.sin(this.time.now / 900 + tw.c * 1.7 + tw.r) * 0.5 * dt; continue; }
      const ang = Phaser.Math.Angle.Between(tw.x, tw.y, best.spr.x, best.spr.y) + Math.PI / 2;
      tw.head.rotation = Phaser.Math.Angle.RotateTo(tw.head.rotation, ang, 10 * dt);
      if (tw.cd > 0) continue;
      tw.cd = tw.def.rate * (1 - 0.12 * (tw.lv - 1));
      const dmg = tw.def.dmg * (1 + 0.6 * (tw.lv - 1));
      const mx = tw.x + Math.sin(tw.head.rotation) * 30, my = tw.y - Math.cos(tw.head.rotation) * 30;
      const spr = this.add.image(mx, my, tw.def.shot).setDepth(50).setScale(tw.def.name === 'tMissile' ? 0.8 : 1);
      this.shots.push({ spr, tw, target: best, tx: best.spr.x, ty: best.spr.y, dmg, trail: 0 });
      const gun = tw.def.name === 'tGun';
      const fl = this.add.image(mx, my, 'td-flash').setDepth(51).setBlendMode(ADD).setRotation(tw.head.rotation).setScale(gun ? 0.5 : 0.85);
      this.tweens.add({ targets: fl, alpha: 0, scale: fl.scale * 1.5, duration: gun ? 70 : 120, onComplete: () => fl.destroy() });
      if (!gun) this.puff(mx, my, 0.5, 0.35);
      // recoil: the head kicks back and settles
      const kick = gun ? 3 : 7;
      tw.head.setPosition(tw.x - Math.sin(tw.head.rotation) * kick, tw.y + Math.cos(tw.head.rotation) * kick);
      this.tweens.add({ targets: tw.head, x: tw.x, y: tw.y, duration: gun ? 90 : 180, ease: 'Quad.easeOut' });
      this.throttledSfx(tw.def.sfx, tw.def.name === 'tGun' ? 0.16 : 0.3, tw.x);
    }
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      if (s.tw.def.homing && s.target.alive) { s.tx = s.target.spr.x; s.ty = s.target.spr.y; }
      const dx = s.tx - s.spr.x, dy = s.ty - s.spr.y, len = Math.hypot(dx, dy), step = s.tw.def.speed * dt;
      s.spr.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      if (s.tw.def.name === 'tMissile') {
        s.trail -= dt;
        if (s.trail <= 0) { s.trail = 0.03; this.puff(s.spr.x, s.spr.y, 0.28, 0.5, 380); }
      }
      if (len > step + 6) { s.spr.x += (dx / len) * step; s.spr.y += (dy / len) * step; continue; }
      this.impact(s);
      s.spr.destroy();
      s.spr.setData('done', true);
    }
    this.shots = this.shots.filter((s) => !s.spr.getData('done'));
  }

  private impact(s: Shot): void {
    const d = s.tw.def;
    if (d.splash > 0) {
      const r = d.splash * (1 + 0.1 * (s.tw.lv - 1));
      for (const e of this.enemies) {
        if (e.air && !d.air) continue;
        const dist = Phaser.Math.Distance.Between(s.tx, s.ty, e.spr.x, e.spr.y);
        if (dist <= r) this.damage(e, dist < 20 || e === s.target ? s.dmg : s.dmg * 0.6);
      }
      const blast = this.add.image(s.tx, s.ty, 'td-blast').setDepth(45).setScale(0.4).setTint(0x605040);
      this.tweens.add({ targets: blast, scale: r / 34, alpha: 0, duration: 520, onComplete: () => blast.destroy() });
      this.glow(s.tx, s.ty, 0xff9a30, r / 40, 260);
      this.ring(s.tx, s.ty, 0xffe0a0, r / 56, 300);
      for (let i = 0; i < 2; i++) this.puff(s.tx + rng.int(-14, 14), s.ty + rng.int(-14, 14), 0.6, 0.45, 700);
      const scorch = this.add.image(s.tx, s.ty, 'td-scorch').setDepth(8).setAlpha(0.45).setScale(0.6);
      this.tweens.add({ targets: scorch, alpha: 0, delay: 1200, duration: 800, onComplete: () => scorch.destroy() });
      burst(this, s.tx, s.ty, [0xffd23f, 0xff8a3d, 0x555555], 12, 200);
      this.throttledSfx(rng.pick(['boom1', 'boom2', 'boom3']), 0.35, s.tx);
      if (d.name === 'tMissile') shake(this, 0.004, 90);
    } else if (s.target.alive) {
      this.damage(s.target, s.dmg);
      burst(this, s.tx, s.ty, 0xffd23f, 3, 90);
      this.glow(s.tx, s.ty, 0xffd23f, 0.28, 90);
    }
  }

  private damage(e: Enemy, dmg: number): void {
    if (!e.alive) return;
    e.hp -= dmg;
    e.spr.setTintFill(0xffffff);
    this.time.delayedCall(50, () => { if (e.alive) { if (e.kind === 'boss') e.spr.setTint(0xff7070); else e.spr.clearTint(); } });
    if (e.hp > 0) return;
    const d = ENEMY[e.kind];
    this.gold += d.gold;
    this.addScore(d.gold * 10);
    popup(this, e.spr.x, e.spr.y - 20, '+' + d.gold * 10, '#ffd23f', 18);
    this.flyCoin(e.spr.x, e.spr.y);
    burst(this, e.spr.x, e.spr.y, e.air ? [0xbbbbbb, 0xffd23f, 0xec3013] : [0x5dff7a, 0xec3013, 0xffd23f], e.kind === 'boss' ? 70 : e.kind.startsWith('tank') ? 30 : 14, e.kind === 'boss' ? 420 : 240);
    if (e.kind === 'boss' || e.kind.startsWith('tank')) {
      shake(this, e.kind === 'boss' ? 0.025 : 0.008, e.kind === 'boss' ? 500 : 160);
      const s = this.add.image(e.spr.x, e.spr.y, 'td-scorch').setDepth(8).setAlpha(0.6);
      this.tweens.add({ targets: s, alpha: 0, delay: 2000, duration: 1000, onComplete: () => s.destroy() });
      this.wreck(e.spr.x, e.spr.y, e.kind === 'boss' ? 1.6 : 1);
    }
    if (e.air) this.glow(e.spr.x, e.spr.y, 0xff8a3d, 0.9, 260);
    if (e.kind === 'boss') this.sfxAt('killboss', e.spr.x, { volume: 0.8 });
    else if (e.kind.startsWith('tank')) this.throttledSfx('killtank', 0.45, e.spr.x);
    else if (e.air) this.throttledSfx('killplane', 0.4, e.spr.x);
    else this.throttledSfx(rng.pick(['kill1', 'kill2']), 0.35, e.spr.x);
    this.removeEnemy(e);
    this.refreshUi();
  }

  private waveCleared(): void {
    const bonus = 20 + this.wave * 5;
    this.gold += bonus;
    this.addScore(this.wave * 100);
    this.sfx('clear', { volume: 0.6, exact: true });
    this.banner(`${t('clearBonus')}  +$${bonus}`, '#5dff7a', 0x5dff7a);
    if (this.wave >= WAVES) {
      this.addScore(this.lives * 250);
      burst(this, FIELD_W / 2, 360, [COLORS.yellow, COLORS.green, COLORS.cyan], 80, 500);
      flash(this, 0x5dff7a, 200);
      this.endGame({ win: true, title: t('victory'), delay: 1400 });
      return;
    }
    this.phase = 'build';
    this.countdown = 12; this.countdownMax = 12;
    this.refreshUi();
  }

  private throttledSfx(key: string, volume: number, x?: number): void {
    const now = this.time.now;
    if (now - (this.lastSfx[key] ?? 0) < 70) return;
    this.lastSfx[key] = now;
    this.sfx(key, { volume, x });
  }

  // ---------- effects ----------
  private glow(x: number, y: number, tint: number, scale: number, ms: number): void {
    const g = this.add.image(x, y, 'td-glow').setDepth(46).setBlendMode(ADD).setTint(tint).setScale(scale * 0.4);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private ring(x: number, y: number, tint: number, scale: number, ms: number): void {
    const r = this.add.image(x, y, 'td-ring').setDepth(46).setTint(tint).setScale(0.1).setAlpha(0.85);
    this.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  private puff(x: number, y: number, scale: number, alpha: number, ms = 500): void {
    const p = this.add.image(x, y, 'td-puff').setDepth(44).setScale(scale * 0.5).setAlpha(alpha);
    this.tweens.add({ targets: p, scale: scale * 1.4, alpha: 0, y: y - 10, duration: ms, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }

  /** A burning wreck where a tank died: flames that flicker and a column of smoke. */
  private wreck(x: number, y: number, k: number): void {
    const f = this.add.image(x, y - 4, 'td-fire').setDepth(37).setScale(0.8 * k).setOrigin(0.5, 0.8);
    this.tweens.add({ targets: f, scaleY: 1.05 * k, scaleX: 0.65 * k, duration: 110, yoyo: true, repeat: 6 });
    this.tweens.add({ targets: f, alpha: 0, delay: 1100, duration: 500, onComplete: () => f.destroy() });
    this.time.addEvent({ delay: 140, repeat: 8, callback: () => this.puff(x + rng.int(-6, 6), y - 10, 0.5 * k, 0.4, 900) });
    this.glow(x, y, 0xff7a20, 1.6 * k, 380);
  }

  /** A coin flies from a kill to the gold counter. */
  private flyCoin(x: number, y: number): void {
    if (this.coinsFlying >= 10) return;
    this.coinsFlying++;
    const c = this.add.image(x, y, 'td-coin').setDepth(7000).setScale(0.55);
    this.tweens.add({ targets: c, x: this.goldIcon.x, duration: 560, ease: 'Sine.easeIn' });
    this.tweens.add({
      targets: c, y: { from: y, to: GOLD_Y }, scale: 0.9, duration: 560, ease: 'Back.easeIn',
      onComplete: () => {
        c.destroy(); this.coinsFlying--;
        this.tweens.add({ targets: this.goldText, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Quad.easeOut' });
      },
    });
  }

  /** A ribbon across the battlefield with a title that slides in, holds and slides out. */
  private banner(title: string, color: string, tint: number): void {
    const y = TOP + (ROWS * CELL) / 2 - 40;
    const band = this.add.image(FIELD_W / 2, y, 'td-banner').setDisplaySize(FIELD_W, 96).setTint(tint).setDepth(199);
    const sy = band.scaleY;
    band.scaleY = 0;
    const lbl = txt(this, FIELD_W + 320, y + 2, title, { title: true, size: 40, color }).setDepth(200);
    this.tweens.add({ targets: band, scaleY: sy, duration: 160, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: lbl, x: FIELD_W / 2, duration: 340, ease: 'Back.easeOut' });
    this.time.delayedCall(1250, () => {
      this.tweens.add({ targets: lbl, x: -320, duration: 260, ease: 'Cubic.easeIn', onComplete: () => lbl.destroy() });
      this.tweens.add({ targets: band, scaleY: 0, delay: 140, duration: 180, onComplete: () => band.destroy() });
    });
  }

  private drawOverlay(): void {
    const g = this.fx;
    g.clear();
    const now = this.time.now;
    const show = (x: number, y: number, range: number, ok: boolean) => {
      const col = ok ? 0xffffff : 0xec3013;
      g.fillStyle(col, 0.08).fillCircle(x, y, range);
      g.lineStyle(3, col, 0.55);
      const n = 32, off = now / 2400;
      for (let i = 0; i < n; i += 2) {
        g.beginPath();
        g.arc(x, y, range, off + (i / n) * Math.PI * 2, off + ((i + 1) / n) * Math.PI * 2);
        g.strokePath();
      }
    };
    let ghost = false;
    if (this.selTower) {
      const tw = this.selTower;
      show(tw.x, tw.y, tw.def.range * (1 + 0.12 * (tw.lv - 1)), true);
      const p = 2 + Math.sin(now / 150) * 2;
      g.lineStyle(4, COLORS.yellow, 1).strokeRect(tw.c * CELL + p, TOP + tw.r * CELL + p, CELL - p * 2, CELL - p * 2);
    } else if (this.cursorOn) {
      const { c, r } = this.cur;
      const d = TOWERS[this.selType];
      const ok = this.grid[r][c] === 0 && this.gold >= d.cost;
      if (this.grid[r][c] === 0) {
        const x = c * CELL + CELL / 2, y = TOP + r * CELL + CELL / 2;
        show(x, y, d.range, ok);
        ghost = true;
        this.ghostBase.setTexture(d.base).setPosition(x, y);
        this.ghostHead.setTexture(d.head).setPosition(x, y);
        for (const o of [this.ghostBase, this.ghostHead]) if (ok) o.clearTint(); else o.setTint(0xff6050);
      }
    }
    this.ghostBase.setVisible(ghost); this.ghostHead.setVisible(ghost);
    if (this.cursorOn) {
      const x = this.cur.c * CELL, y = TOP + this.cur.r * CELL, L = 18;
      g.lineStyle(4, COLORS.cyan, 0.95);
      for (const [cx, cy, sx, sy] of [[x + 4, y + 4, 1, 1], [x + CELL - 4, y + 4, -1, 1], [x + 4, y + CELL - 4, 1, -1], [x + CELL - 4, y + CELL - 4, -1, -1]]) {
        g.beginPath(); g.moveTo(cx, cy + sy * L); g.lineTo(cx, cy); g.lineTo(cx + sx * L, cy); g.strokePath();
      }
    }
    // rank chevrons under upgraded towers
    for (const tw of this.towers) for (let i = 1; i < tw.lv; i++) {
      const y = tw.y + 24 + (i - 1) * 7;
      for (const [w, col] of [[7, 0x000000], [3, 0xffd23f]] as const) {
        g.lineStyle(w, col, 1);
        g.beginPath(); g.moveTo(tw.x - 9, y); g.lineTo(tw.x, y + 5); g.lineTo(tw.x + 9, y); g.strokePath();
      }
    }

    const b = this.bars;
    b.clear();
    for (const e of this.enemies) {
      if (e.hp >= e.max && e.kind !== 'boss') continue;
      const w = e.kind === 'boss' ? 90 : 46, x = e.spr.x - w / 2, y = e.spr.y - (e.kind === 'boss' ? 64 : 38);
      const f = Math.max(0, e.hp / e.max);
      b.fillStyle(0x000000, 0.8).fillRect(x - 2, y - 2, w + 4, 10);
      b.fillStyle(f > 0.6 ? 0x5dff7a : f > 0.3 ? 0xffd23f : 0xec3013, 1).fillRect(x, y, w * f, 6);
      b.fillStyle(0xffffff, 0.35).fillRect(x, y, w * f, 2);
    }

    // wave progress under the wave counter: countdown between waves, enemies dealt with during one
    const pg = this.prog;
    pg.clear();
    const pw = 240, px = this.scale.width / 2 - pw / 2, py = 56;
    const frac = this.phase === 'build'
      ? Phaser.Math.Clamp(this.countdown / this.countdownMax, 0, 1)
      : Phaser.Math.Clamp(1 - (this.queue.length + this.enemies.length) / this.waveTotal, 0, 1);
    pg.fillStyle(0x000000, 0.9).fillRect(px - 3, py - 3, pw + 6, 12);
    pg.fillStyle(this.phase === 'build' ? 0xffd23f : 0xec3013, 1).fillRect(px, py, pw * frac, 6);
    pg.fillStyle(0xffffff, 0.3).fillRect(px, py, pw * frac, 2);
  }
}
