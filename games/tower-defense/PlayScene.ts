import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, t, rng, COLORS } from '@core';
import { ftxt as txt, fpopup as popup, freshTextCanvases } from './fasttext';

const CELL = 80, COLS = 13, ROWS = 8, TOP = 80, FIELD_W = COLS * CELL; // 1040 x 640 field
const SIDE = FIELD_W + 120;                                               // sidebar centre x
const PATH: [number, number][] = [[-1, 1], [3, 1], [3, 6], [6, 6], [6, 1], [9, 1], [9, 6], [12, 6], [12, 8.7]];
const WAVES = 15;
const START_GOLD = 170, START_LIVES = 20;

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

interface Enemy { kind: Kind; spr: Phaser.GameObjects.Image; top?: Phaser.GameObjects.Image; shadow?: Phaser.GameObjects.Image; hp: number; max: number; speed: number; wp: number; dist: number; air: boolean; alive: boolean; vy: number }
interface Tower { def: TDef; lv: number; c: number; r: number; x: number; y: number; base: Phaser.GameObjects.Image; head: Phaser.GameObjects.Image; cd: number; spent: number }
interface Shot { spr: Phaser.GameObjects.Image; tw: Tower; target: Enemy; tx: number; ty: number; dmg: number }
interface SideBtn { box: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }

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

  createGame(): void {
    freshTextCanvases(this);
    this.enemies = []; this.towers = []; this.shots = []; this.queue = []; this.cards = []; this.lastSfx = {};
    this.gold = START_GOLD; this.lives = START_LIVES; this.wave = 0; this.phase = 'build'; this.countdown = 20;
    this.spawnT = 0; this.selType = 0; this.selTower = null; this.cur = { c: 1, r: 3 }; this.cursorOn = false;

    this.buildMap();
    this.fx = this.add.graphics().setDepth(40);
    this.bars = this.add.graphics().setDepth(60);
    this.buildSidebar();
    this.add.rectangle(0, 0, FIELD_W, TOP, 0x0e0d12, 0.85).setOrigin(0).setDepth(80);

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
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = c * CELL + CELL / 2, y = TOP + r * CELL + CELL / 2;
      this.add.image(x, y, this.grid[r][c] === 1 ? 'td-dirt' : 'td-grass').setDisplaySize(CELL + 1, CELL + 1);
    }
    // a few decorations block building and add life to the map
    const spots = [[0, 0], [12, 0], [0, 7], [5, 3], [7, 7], [11, 2], [1, 4]];
    for (const [c, r] of spots) {
      if (this.grid[r][c] !== 0) continue;
      this.grid[r][c] = 2;
      this.add.image(c * CELL + CELL / 2, TOP + r * CELL + CELL / 2, rng.pick(['td-bush', 'td-bush2', 'td-rock', 'td-rock2'])).setScale(1.1);
    }
    // entry / exit markers
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(COLORS.green, 0.5).fillTriangle(8, TOP + 1.5 * CELL - 18, 8, TOP + 1.5 * CELL + 18, 34, TOP + 1.5 * CELL);
    g.fillStyle(COLORS.red, 0.6).fillRect(12 * CELL + 6, TOP + ROWS * CELL - 10, CELL - 12, 10);
  }

  private cellAt(x: number, y: number): { c: number; r: number } {
    return { c: Phaser.Math.Clamp(Math.floor(x / CELL), 0, COLS - 1), r: Phaser.Math.Clamp(Math.floor((y - TOP) / CELL), 0, ROWS - 1) };
  }

  // ---------- sidebar ----------
  private sideBtn(y: number, h: number, color: number, label: string, size: number, onClick: () => void): SideBtn {
    const box = this.add.container(SIDE, y).setDepth(90);
    const shadow = this.add.rectangle(0, 6, 224, h, 0x000000, 0.5);
    const bg = this.add.rectangle(0, 0, 224, h, color).setStrokeStyle(4, 0x000000);
    const lbl = txt(this, 0, 0, label, { title: true, size, strokeThickness: 0, shadow: false });
    box.add([shadow, bg, lbl]).setSize(224, h).setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => { bg.y = 3; lbl.y = 3; });
    box.on('pointerout', () => { bg.y = 0; lbl.y = 0; });
    box.on('pointerup', () => { bg.y = 0; lbl.y = 0; onClick(); });
    return { box, bg, label: lbl };
  }

  private buildSidebar(): void {
    this.add.rectangle(FIELD_W, 0, 240, 720, 0x16141c).setOrigin(0).setDepth(85);
    this.add.rectangle(FIELD_W, 0, 4, 720, 0x000000).setOrigin(0).setDepth(86);
    this.add.image(FIELD_W + 40, 140, 'td-coin').setScale(1.3).setDepth(90);
    this.goldText = txt(this, FIELD_W + 70, 142, '0', { title: true, size: 26, color: '#ffd23f' }).setOrigin(0, 0.5).setDepth(90);
    TOWERS.forEach((d, i) => {
      const b = this.sideBtn(215 + i * 100, 90, 0x2a2638, '', 1, () => this.pickType(i));
      b.label.destroy();
      const base = this.add.image(-70, 0, d.base).setScale(0.95);
      const head = this.add.image(-70, 0, d.head).setScale(0.95);
      const name = txt(this, -26, -16, t(d.name), { size: 26 }).setOrigin(0, 0.5);
      const cost = txt(this, -26, 18, '$' + d.cost, { title: true, size: 16, color: '#ffd23f' }).setOrigin(0, 0.5);
      b.box.add([base, head, name, cost]);
      b.label = cost;
      this.cards.push(b);
    });
    this.info = txt(this, SIDE, 505, '', { size: 22, color: '#bdb8d0', wrap: 220 }).setDepth(90);
    this.upBtn = this.sideBtn(575, 80, COLORS.purple, '', 16, () => this.upgrade());
    this.sellBtn = this.sideBtn(670, 70, 0x6b3a2a, '', 16, () => this.sell());
    this.waveBtn = this.sideBtn(625, 110, COLORS.red, '', 16, () => this.startWave(true));
  }

  private refreshUi(): void {
    this.goldText.setText(String(this.gold));
    this.cards.forEach((b, i) => {
      const on = i === this.selType && !this.selTower;
      b.bg.setStrokeStyle(on ? 6 : 4, on ? COLORS.yellow : 0x000000).setFillStyle(on ? 0x3d3756 : 0x2a2638);
      b.label.setColor(this.gold >= TOWERS[i].cost ? '#ffd23f' : '#ec3013');
    });
    const tw = this.selTower;
    this.upBtn.box.setVisible(!!tw); this.sellBtn.box.setVisible(!!tw); this.waveBtn.box.setVisible(!tw);
    if (tw) {
      const cost = this.upCost(tw);
      this.info.setText(`${t(tw.def.name)} ${t('lvl')}${tw.lv}\n${tw.def.air ? t('airGround') : t('groundOnly')}`);
      this.upBtn.label.setText(cost ? `${t('upgrade')}\n$${cost}` : t('max'));
      this.upBtn.bg.setFillStyle(cost && this.gold >= cost ? COLORS.purple : 0x444455);
      this.sellBtn.label.setText(`${t('sell')} $${this.sellValue(tw)}`);
    } else {
      const d = TOWERS[this.selType];
      this.info.setText(`${t(d.name)} · ${d.air ? t('airGround') : t('groundOnly')}`);
      if (this.phase === 'build') {
        this.waveBtn.label.setText(`${t('nextWave')} ${this.wave + 1}\n${t('nextIn', { n: Math.ceil(this.countdown) })}`);
        this.waveBtn.bg.setFillStyle(COLORS.red);
      } else {
        this.waveBtn.label.setText(t('waveOf', { n: this.wave, m: WAVES }));
        this.waveBtn.bg.setFillStyle(0x444455);
      }
    }
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
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
    this.sfx('select', { volume: 0.4 });
    this.refreshUi();
  }

  private actAt(c: number, r: number, keyboard: boolean): void {
    const tw = this.towers.find((o) => o.c === c && o.r === r);
    if (tw) {
      if (keyboard && this.selTower === tw) this.upgrade();
      else { this.selTower = tw; this.sfx('select', { volume: 0.4 }); }
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
    const base = this.add.image(cx, cy, d.base).setDepth(20).setScale(0.2);
    const head = this.add.image(cx, cy, d.head).setDepth(30).setScale(0.2).setAngle(-90);
    this.tweens.add({ targets: [base, head], scale: 1, duration: 280, ease: 'Back.easeOut' });
    this.towers.push({ def: d, lv: 1, c, r, x: cx, y: cy, base, head, cd: 0.2, spent: d.cost });
    burst(this, cx, cy, [0xbfc7cc, 0x8a6a3a], 14, 160);
    this.sfx('build', { volume: 0.5 });
    this.refreshUi();
  }

  private warn(msg: string, x: number, y: number): void {
    popup(this, Phaser.Math.Clamp(x, 200, FIELD_W - 200), y, msg, '#ec3013', 18);
    this.sfx('error', { volume: 0.4 });
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
    this.sfx('upgrade', { volume: 0.5 });
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
    tw.base.destroy(); tw.head.destroy();
    this.towers = this.towers.filter((o) => o !== tw);
    this.shots = this.shots.filter((s) => { if (s.tw === tw) s.spr.destroy(); return s.tw !== tw; });
    this.selTower = null;
    this.sfx('sell', { volume: 0.6 });
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
    this.queue = this.buildWave(this.wave);
    this.spawnT = 0.3;
    this.sfx('wave', { volume: 0.5 });
    const title = this.wave === WAVES ? t('finalWave') : `${t('wave')} ${this.wave}`;
    const b = txt(this, FIELD_W / 2, 360, title, { title: true, size: 48, color: this.wave === WAVES ? '#ec3013' : '#ffd23f' }).setDepth(200).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => b.destroy() });
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
    const hpMul = 1 + (this.wave - 1) * 0.4 + Math.max(0, this.wave - 5) ** 2 * 0.1;
    const air = !!d.air;
    const p0 = this.pts[0];
    const x = air ? -60 : p0.x, y = air ? rng.int(TOP + 60, TOP + ROWS * CELL - 60) : p0.y;
    const scale = d.scale ?? 1;
    const spr = this.add.image(x, y, d.tex).setDepth(air ? 55 : 35).setScale(scale * (air ? 1.1 : kind.startsWith('tank') || kind === 'boss' ? 1 : 1.25));
    const e: Enemy = { kind, spr, hp: d.hp * hpMul, max: d.hp * hpMul, speed: d.speed * (1 + this.wave * 0.01), wp: 1, dist: 0, air, alive: true, vy: air ? rng.int(-30, 30) : 0 };
    if (d.top) e.top = this.add.image(x, y, d.top).setDepth(36).setScale(scale);
    if (kind === 'boss') {
      spr.setTint(0xff7070); e.top!.setTint(0xff7070);
      const warn = txt(this, FIELD_W / 2, 300, t('bossIn'), { title: true, size: 36, color: '#ec3013' }).setDepth(200);
      this.tweens.add({ targets: warn, alpha: 0.2, duration: 250, yoyo: true, repeat: 3, onComplete: () => warn.destroy() });
      shake(this, 0.01, 400);
    }
    if (air) e.shadow = this.add.image(x + 18, y + 26, 'td-shadow').setDepth(34).setAlpha(0.3).setScale(0.9);
    this.enemies.push(e);
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.phase === 'build') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave(false);
      else if (Math.ceil(this.countdown) !== Math.ceil(this.countdown + dt)) this.refreshUi();
    } else if (this.queue.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { const q = this.queue.shift()!; this.spawn(q.kind); this.spawnT = this.queue[0]?.gap ?? 0; }
    }

    this.moveEnemies(dt);
    this.fireTowers(dt);
    this.moveShots(dt);
    this.drawOverlay();

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
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  private leak(e: Enemy): void {
    if (!e.alive) return;
    this.removeEnemy(e);
    this.lives -= ENEMY[e.kind].lives;
    this.sfx('leak', { volume: 0.5 });
    shake(this, 0.012, 200);
    flash(this, 0xec3013, 120);
    this.updateHud();
    if (this.lives <= 0) {
      this.lives = 0; this.updateHud();
      this.endGame({ delay: 900 });
    }
  }

  private removeEnemy(e: Enemy): void {
    e.alive = false;
    e.spr.destroy(); e.top?.destroy(); e.shadow?.destroy();
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
      if (!best) continue;
      const ang = Phaser.Math.Angle.Between(tw.x, tw.y, best.spr.x, best.spr.y) + Math.PI / 2;
      tw.head.rotation = Phaser.Math.Angle.RotateTo(tw.head.rotation, ang, 10 * dt);
      if (tw.cd > 0) continue;
      tw.cd = tw.def.rate * (1 - 0.12 * (tw.lv - 1));
      const dmg = tw.def.dmg * (1 + 0.6 * (tw.lv - 1));
      const mx = tw.x + Math.sin(tw.head.rotation) * 30, my = tw.y - Math.cos(tw.head.rotation) * 30;
      const spr = this.add.image(mx, my, tw.def.shot).setDepth(50).setScale(tw.def.name === 'tMissile' ? 0.8 : 1);
      this.shots.push({ spr, tw, target: best, tx: best.spr.x, ty: best.spr.y, dmg });
      this.tweens.add({ targets: tw.head, scale: { from: 0.88, to: tw.head.scale }, duration: 90 });
      this.throttledSfx(tw.def.sfx, tw.def.name === 'tGun' ? 0.12 : 0.3);
    }
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      if (s.tw.def.homing && s.target.alive) { s.tx = s.target.spr.x; s.ty = s.target.spr.y; }
      const dx = s.tx - s.spr.x, dy = s.ty - s.spr.y, len = Math.hypot(dx, dy), step = s.tw.def.speed * dt;
      s.spr.rotation = Math.atan2(dy, dx) + Math.PI / 2;
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
      const blast = this.add.image(s.tx, s.ty, 'td-blast').setDepth(45).setScale(0.4).setTint(0xffa040);
      this.tweens.add({ targets: blast, scale: r / 40, alpha: 0, duration: 320, onComplete: () => blast.destroy() });
      const scorch = this.add.image(s.tx, s.ty, 'td-scorch').setDepth(8).setAlpha(0.45).setScale(0.6);
      this.tweens.add({ targets: scorch, alpha: 0, delay: 1200, duration: 800, onComplete: () => scorch.destroy() });
      burst(this, s.tx, s.ty, [0xffd23f, 0xff8a3d, 0x555555], 12, 200);
      this.throttledSfx('boom', 0.35);
      if (d.name === 'tMissile') shake(this, 0.004, 90);
    } else if (s.target.alive) {
      this.damage(s.target, s.dmg);
      burst(this, s.tx, s.ty, 0xffd23f, 3, 90);
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
    burst(this, e.spr.x, e.spr.y, e.air ? [0xbbbbbb, 0xffd23f, 0xec3013] : [0x5dff7a, 0xec3013, 0xffd23f], e.kind === 'boss' ? 70 : e.kind.startsWith('tank') ? 30 : 14, e.kind === 'boss' ? 420 : 240);
    if (e.kind === 'boss' || e.kind.startsWith('tank')) {
      shake(this, e.kind === 'boss' ? 0.025 : 0.008, e.kind === 'boss' ? 500 : 160);
      const s = this.add.image(e.spr.x, e.spr.y, 'td-scorch').setDepth(8).setAlpha(0.6);
      this.tweens.add({ targets: s, alpha: 0, delay: 2000, duration: 1000, onComplete: () => s.destroy() });
    }
    this.throttledSfx('kill', 0.3);
    this.removeEnemy(e);
    this.refreshUi();
  }

  private waveCleared(): void {
    const bonus = 20 + this.wave * 5;
    this.gold += bonus;
    this.addScore(this.wave * 100);
    this.sfx('clear', { volume: 0.5 });
    const b = txt(this, FIELD_W / 2, 330, `${t('clearBonus')}\n+$${bonus}`, { title: true, size: 32, color: '#5dff7a' }).setDepth(200);
    this.tweens.add({ targets: b, y: 290, alpha: 0, delay: 900, duration: 600, onComplete: () => b.destroy() });
    if (this.wave >= WAVES) {
      this.addScore(this.lives * 250);
      burst(this, FIELD_W / 2, 360, [COLORS.yellow, COLORS.green, COLORS.cyan], 80, 500);
      flash(this, 0x5dff7a, 200);
      this.endGame({ win: true, title: t('victory'), delay: 1400 });
      return;
    }
    this.phase = 'build';
    this.countdown = 12;
    this.refreshUi();
  }

  private throttledSfx(key: string, volume: number): void {
    const now = this.time.now;
    if (now - (this.lastSfx[key] ?? 0) < 70) return;
    this.lastSfx[key] = now;
    this.sfx(key, { volume });
  }

  private drawOverlay(): void {
    const g = this.fx;
    g.clear();
    const show = (x: number, y: number, range: number, ok: boolean) => {
      g.fillStyle(ok ? 0xffffff : 0xec3013, 0.1).fillCircle(x, y, range);
      g.lineStyle(3, ok ? 0xffffff : 0xec3013, 0.5).strokeCircle(x, y, range);
    };
    if (this.selTower) {
      const tw = this.selTower;
      show(tw.x, tw.y, tw.def.range * (1 + 0.12 * (tw.lv - 1)), true);
      g.lineStyle(4, COLORS.yellow, 1).strokeRect(tw.c * CELL + 2, TOP + tw.r * CELL + 2, CELL - 4, CELL - 4);
    } else if (this.cursorOn) {
      const { c, r } = this.cur;
      const ok = this.grid[r][c] === 0 && this.gold >= TOWERS[this.selType].cost;
      if (this.grid[r][c] === 0) show(c * CELL + CELL / 2, TOP + r * CELL + CELL / 2, TOWERS[this.selType].range, ok);
    }
    if (this.cursorOn) g.lineStyle(3, COLORS.cyan, 0.9).strokeRect(this.cur.c * CELL + 4, TOP + this.cur.r * CELL + 4, CELL - 8, CELL - 8);
    // level pips
    for (const tw of this.towers) for (let i = 1; i < tw.lv; i++) g.fillStyle(COLORS.yellow, 1).fillRect(tw.x - 14 + (i - 1) * 16, tw.y + 28, 12, 8);

    const b = this.bars;
    b.clear();
    for (const e of this.enemies) {
      if (e.hp >= e.max) continue;
      const w = e.kind === 'boss' ? 90 : 46, x = e.spr.x - w / 2, y = e.spr.y - (e.kind === 'boss' ? 64 : 38);
      b.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, w + 4, 10);
      b.fillStyle(e.hp / e.max > 0.4 ? 0x5dff7a : 0xec3013, 1).fillRect(x, y, w * Math.max(0, e.hp / e.max), 6);
    }
  }
}
