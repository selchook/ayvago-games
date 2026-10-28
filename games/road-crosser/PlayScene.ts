import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

const W = 720, COLS = 11, COL = W / COLS, ROW = 72, TOP = 104;
const HOME_ROW = 0, MEDIAN = 6, START = 12;
const BAYS = [1, 3, 5, 7, 9];
const rowY = (r: number) => TOP + r * ROW + ROW / 2;
const colX = (c: number) => (c + 0.5) * COL;

type Kind = 'log' | 'hippo' | 'car' | 'car2' | 'truck' | 'moto';
interface Lane { row: number; kind: Kind; speed: number; size: number; gapMin: number; gapMax: number; objs: Obj[]; nextGap: number }
interface Obj { x: number; w: number; view: Phaser.GameObjects.Container; dive: number; under: boolean }
type Dir = { x: number; y: number };

const COLORS_CAR = ['black', 'blue', 'green', 'red', 'yellow'];

export class PlayScene extends ArcadeScene {
  private lanes: Lane[] = [];
  private frog!: Phaser.GameObjects.Image;
  private fx = 0;
  private fr = START;
  private hopping = false;
  private alive = true;
  private lives = 3;
  private level = 1;
  private homes: boolean[] = [];
  private homeImgs: Phaser.GameObjects.Image[] = [];
  private chick: Phaser.GameObjects.Image | null = null;
  private chickBay = -1;
  private chickT = 0;
  private furthest = START;
  private timeLeft = 0;
  private timeMax = 40;
  private timerBar!: Phaser.GameObjects.Rectangle;
  private water!: Phaser.GameObjects.TileSprite;
  private swipe: { x: number; y: number; t: number } | null = null;
  private queued: Dir | null = null;
  private lastTick = 0;

  createGame(): void {
    this.lanes = []; this.homes = [false, false, false, false, false]; this.homeImgs = [];
    this.lives = 3; this.level = 1; this.alive = true; this.hopping = false; this.chick = null; this.chickBay = -1; this.chickT = 6;
    this.swipe = null; this.queued = null; this.lastTick = 0;
    this.makeTextures();
    this.drawBoard();
    this.frog = this.add.image(0, 0, 'frog').setScale(0.42).setDepth(20);
    this.buildButtons();
    this.bindInput();
    this.setupLanes(true);
    this.respawn();
    this.updateHud();
  }

  // ---------- art ----------

  private makeTextures(): void {
    for (const n of [2, 3, 4, 5]) {
      const key = `log${n}`;
      if (this.textures.exists(key)) continue;
      const w = Math.round(n * COL), h = 50;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x5a3416).fillRoundedRect(0, 2, w, h, 22);
      g.fillStyle(0x8b5a2b).fillRoundedRect(2, 0, w - 4, h - 4, 20);
      g.fillStyle(0xa8743d).fillRect(16, 8, w - 32, 6);
      g.fillStyle(0x6d4220);
      for (let x = 30; x < w - 30; x += 46) g.fillRect(x, 20, 24, 4);
      g.fillStyle(0xd9b07a).fillEllipse(w - 14, h / 2 - 2, 18, h - 12);
      g.lineStyle(2, 0x8b5a2b).strokeEllipse(w - 14, h / 2 - 2, 9, (h - 12) / 2);
      g.generateTexture(key, w, h + 4);
      g.destroy();
    }
    if (!this.textures.exists('wave')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x2a7fd4).fillRect(0, 0, 96, 72);
      g.lineStyle(3, 0x5fb2ff, 0.7);
      for (const [x, y] of [[10, 18], [58, 44], [30, 62]]) { g.beginPath(); g.arc(x, y, 9, Math.PI * 1.1, Math.PI * 1.9); g.strokePath(); }
      g.generateTexture('wave', 96, 72);
      g.destroy();
    }
  }

  private drawBoard(): void {
    const g = this.add.graphics().setDepth(0);
    // grass verges
    for (const r of [MEDIAN, START]) {
      g.fillStyle(0x4caf50).fillRect(0, TOP + r * ROW, W, ROW);
      g.fillStyle(0x3d9142);
      for (let x = 6; x < W; x += 36) g.fillRect(x + (r % 2) * 12, TOP + r * ROW + 14 + (x % 3) * 14, 6, 6);
    }
    // road
    g.fillStyle(0x3b3b44).fillRect(0, TOP + 7 * ROW, W, ROW * 5);
    g.fillStyle(0xffffff, 0.5);
    for (let r = 8; r <= 11; r++) for (let x = 10; x < W; x += 72) g.fillRect(x, TOP + r * ROW - 2, 36, 4);
    g.fillStyle(0xffd23f).fillRect(0, TOP + 7 * ROW, W, 4).fillRect(0, TOP + 12 * ROW - 4, W, 4);
    // river
    this.water = this.add.tileSprite(0, TOP + ROW, W, ROW * 5, 'wave').setOrigin(0).setDepth(0);
    // home row: hedge with bays
    g.fillStyle(0x1f6b2a).fillRect(0, TOP, W, ROW);
    for (let c = 0; c < COLS; c++) {
      if (BAYS.includes(c)) continue;
      this.add.image(colX(c), rowY(HOME_ROW) - 4, 'tree').setDisplaySize(COL + 6, COL + 6).setDepth(1);
    }
    BAYS.forEach((c) => {
      g.fillStyle(0x2a7fd4).fillRect(colX(c) - COL / 2, TOP + 6, COL, ROW - 6);
      g.fillStyle(0x3fae4a).fillCircle(colX(c), rowY(HOME_ROW) + 4, 24);
      g.fillStyle(0x2a7fd4).fillTriangle(colX(c), rowY(HOME_ROW) + 4, colX(c) + 26, rowY(HOME_ROW) - 8, colX(c) + 26, rowY(HOME_ROW) + 14);
      this.homeImgs.push(this.add.image(colX(c), rowY(HOME_ROW), 'frog').setScale(0.4).setDepth(5).setVisible(false));
    });
    // timer bar
    this.add.rectangle(20, TOP + 13 * ROW + 16, W - 40, 16, 0x000000, 0.5).setOrigin(0, 0.5).setDepth(30);
    this.timerBar = this.add.rectangle(22, TOP + 13 * ROW + 16, W - 44, 12, 0x5dff7a).setOrigin(0, 0.5).setDepth(31);
  }

  private buildButtons(): void {
    const y = 1192, w = 158, h = 132, gap = 12;
    const dirs: Array<[Dir, number]> = [[{ x: -1, y: 0 }, 180], [{ x: 0, y: -1 }, -90], [{ x: 0, y: 1 }, 90], [{ x: 1, y: 0 }, 0]];
    const x0 = (W - (4 * w + 3 * gap)) / 2 + w / 2;
    dirs.forEach(([d, ang], i) => {
      const x = x0 + i * (w + gap);
      const main = d.y === -1;
      const col = main ? 0x5dff7a : 0x3ee6ff;
      const bg = this.add.rectangle(x, y, w, h, col, 0.18).setStrokeStyle(4, col, 0.85).setInteractive().setDepth(30);
      const ar = this.add.triangle(x, y, 0, -26, 0, 26, 36, 0, 0xffffff, 0.9).setAngle(ang).setDepth(31);
      bg.on('pointerdown', () => { this.tryHop(d); bg.setFillStyle(col, 0.5); this.tweens.add({ targets: ar, scale: 0.8, duration: 60, yoyo: true }); });
      const up = () => bg.setFillStyle(col, 0.18);
      bg.on('pointerup', up); bg.on('pointerout', up);
    });
  }

  private bindInput(): void {
    const kb = this.input.keyboard;
    const map: Record<string, Dir> = {
      UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 },
      W: { x: 0, y: -1 }, S: { x: 0, y: 1 }, A: { x: -1, y: 0 }, D: { x: 1, y: 0 }, SPACE: { x: 0, y: -1 },
    };
    for (const [k, d] of Object.entries(map)) kb?.on(`keydown-${k}`, () => this.tryHop(d));
    const fieldBottom = TOP + 13 * ROW + 30;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipe = p.y < fieldBottom && !(p.x > W - 130 && p.y < 120) ? { x: p.x, y: p.y, t: this.time.now } : null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s) return;
      const dx = p.x - s.x, dy = p.y - s.y;
      if (Math.hypot(dx, dy) < 30) this.tryHop({ x: 0, y: -1 });
      else this.tryHop(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    });
  }

  // ---------- lanes ----------

  private setupLanes(first: boolean): void {
    for (const l of this.lanes) for (const o of l.objs) o.view.destroy();
    const k = Math.min(2.3, 1 + (this.level - 1) * 0.14);
    const lg = Math.max(2, 4 - Math.floor((this.level - 1) / 3));          // logs shrink with levels
    const roadGap = Math.max(0.55, 1 - (this.level - 1) * 0.06);
    this.lanes = [
      { row: 1, kind: 'log', speed: 75 * k, size: Math.min(4, lg + 1), gapMin: 130, gapMax: 230 },
      { row: 2, kind: 'hippo', speed: -95 * k, size: 3, gapMin: 110, gapMax: 190 },
      { row: 3, kind: 'log', speed: 120 * k, size: Math.min(5, lg + 2), gapMin: 160, gapMax: 260 },
      { row: 4, kind: 'hippo', speed: -70 * k, size: 2, gapMin: 120, gapMax: 200 },
      { row: 5, kind: 'log', speed: 90 * k, size: lg, gapMin: 120, gapMax: 220 },
      { row: 7, kind: 'truck', speed: -70 * k, size: 1, gapMin: 220 * roadGap, gapMax: 380 * roadGap },
      { row: 8, kind: 'car', speed: 125 * k, size: 1, gapMin: 190 * roadGap, gapMax: 330 * roadGap },
      { row: 9, kind: 'moto', speed: -190 * k, size: 1, gapMin: 300 * roadGap, gapMax: 520 * roadGap },
      { row: 10, kind: 'car2', speed: 90 * k, size: 1, gapMin: 170 * roadGap, gapMax: 300 * roadGap },
      { row: 11, kind: 'car', speed: -75 * k, size: 1, gapMin: 160 * roadGap, gapMax: 280 * roadGap },
    ].map((l) => ({ ...l, kind: l.kind as Kind, objs: [], nextGap: 0 }));
    // pre-fill each lane across the screen
    for (const l of this.lanes) {
      let x = rng.int(-60, 40);
      while (x < W + 100) {
        const o = this.makeObj(l, 0);
        o.x = x + o.w / 2;
        this.placeObj(l, o);
        l.objs.push(o);
        x += o.w + rng.int(l.gapMin, l.gapMax);
      }
      l.nextGap = rng.int(l.gapMin, l.gapMax);
    }
    if (!first) {
      for (const l of this.lanes) for (const o of l.objs) { o.view.setAlpha(0); this.tweens.add({ targets: o.view, alpha: 1, duration: 400 }); }
    }
  }

  private makeObj(l: Lane, x: number): Obj {
    const view = this.add.container(x, rowY(l.row)).setDepth(l.row <= 5 ? 5 : 15);
    let w = 0;
    const dirAng = l.speed > 0 ? 90 : -90;
    switch (l.kind) {
      case 'log': {
        const im = this.add.image(0, 0, `log${l.size}`);
        if (l.speed < 0) im.setFlipX(true);
        view.add(im); w = im.width - 6;
        break;
      }
      case 'hippo': {
        for (let i = 0; i < l.size; i++) {
          const hx = (i - (l.size - 1) / 2) * COL;
          view.add(this.add.ellipse(hx, 6, COL - 2, 40, 0xbfe4ff, 0.55));
          view.add(this.add.image(hx, 0, 'hippo').setScale(0.44));
        }
        w = l.size * COL - 6;
        break;
      }
      case 'truck': view.add(this.add.image(0, 0, `truck-${rng.pick(COLORS_CAR)}`).setAngle(dirAng).setScale(0.9)); w = 104; break;
      case 'car': view.add(this.add.image(0, 0, `car-${rng.pick(COLORS_CAR)}`).setAngle(dirAng).setScale(1.05)); w = 68; break;
      case 'car2': view.add(this.add.image(0, 0, `car2-${rng.pick(COLORS_CAR)}`).setAngle(dirAng).setScale(1.05)); w = 68; break;
      case 'moto': view.add(this.add.image(0, 0, `moto-${rng.pick(['blue', 'yellow', 'red'])}`).setAngle(dirAng).setScale(0.72)); w = 66; break;
    }
    // hippos dive from level 2 onwards; staggered so groups don't all vanish together
    const dive = l.kind === 'hippo' && this.level >= 2 && rng.chance(0.5) ? rng.int(0, 400) / 100 : -1;
    return { x, w, view, dive, under: false };
  }

  private placeObj(l: Lane, o: Obj): void {
    o.view.setPosition(o.x, rowY(l.row) + (l.kind === 'log' ? 2 : 0));
  }

  private updateLanes(dt: number): void {
    for (const l of this.lanes) {
      for (const o of l.objs) {
        o.x += l.speed * dt;
        this.placeObj(l, o);
        if (o.dive >= 0) {
          o.dive = (o.dive + dt) % 6;
          // 0-3.6 up, 3.6-4.3 sinking, 4.3-5.3 under, 5.3-6 rising
          const d = o.dive;
          const a = d < 3.6 ? 1 : d < 4.3 ? 1 - (d - 3.6) / 0.7 * 0.8 : d < 5.3 ? 0.2 : 0.2 + (d - 5.3) / 0.7 * 0.8;
          o.view.setAlpha(a).setScale(0.85 + a * 0.15);
          o.under = a < 0.45;
        }
      }
      // recycle
      l.objs = l.objs.filter((o) => {
        const gone = l.speed > 0 ? o.x - o.w / 2 > W + 40 : o.x + o.w / 2 < -40;
        if (gone) o.view.destroy();
        return !gone;
      });
      // spawn a new one when the trailing gap is open
      const edge = l.speed > 0
        ? Math.min(...l.objs.map((o) => o.x - o.w / 2), W)
        : Math.max(...l.objs.map((o) => o.x + o.w / 2), 0);
      const open = l.speed > 0 ? edge > l.nextGap - 40 : W - edge > l.nextGap - 40;
      if (open) {
        const o = this.makeObj(l, 0);
        o.x = l.speed > 0 ? edge - l.nextGap - o.w / 2 : edge + l.nextGap + o.w / 2;
        this.placeObj(l, o);
        l.objs.push(o);
        l.nextGap = rng.int(l.gapMin, l.gapMax);
      }
    }
  }

  // ---------- frog ----------

  private respawn(): void {
    this.fx = colX(5); this.fr = START; this.furthest = START;
    this.alive = true; this.hopping = false; this.queued = null;
    this.timeMax = Math.max(24, 40 - (this.level - 1) * 2);
    this.timeLeft = this.timeMax;
    this.frog.setPosition(this.fx, rowY(this.fr)).setAngle(0).setAlpha(1).setVisible(true).setScale(0);
    this.tweens.add({ targets: this.frog, scale: 0.42, duration: 250, ease: 'Back.easeOut' });
  }

  private tryHop(d: Dir): void {
    if (this.isOver || !this.alive) return;
    if (this.hopping) { this.queued = d; return; }
    const nr = this.fr + d.y;
    if (nr > START || nr < HOME_ROW) return;
    const nx = Phaser.Math.Clamp(this.fx + d.x * COL, COL / 2, W - COL / 2);
    if (d.x && Math.abs(nx - this.fx) < 2) return;
    this.hopping = true;
    this.sfx('hop', { volume: 0.35, rate: 0.95 + Math.random() * 0.15 });
    const fromX = this.fx, fromY = rowY(this.fr);
    this.fr = nr;
    this.tweens.addCounter({
      from: 0, to: 1, duration: 120,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        this.fx = fromX + (nx - fromX) * k;
        this.frog.setPosition(this.fx, fromY + (rowY(nr) - fromY) * k).setScale(0.42 + Math.sin(k * Math.PI) * 0.12);
      },
      onComplete: () => {
        this.fx = nx;
        this.frog.setScale(0.42);
        this.hopping = false;
        this.land();
        if (this.queued && this.alive) { const q = this.queued; this.queued = null; this.tryHop(q); }
      },
    });
    if (d.x) this.frog.setFlipX(d.x < 0);
  }

  private land(): void {
    if (this.fr < this.furthest) {
      this.furthest = this.fr;
      this.addScore(10);
    }
    if (this.fr === HOME_ROW) {
      const bay = BAYS.findIndex((c) => Math.abs(colX(c) - this.fx) < COL * 0.55);
      if (bay < 0 || this.homes[bay]) { this.die('hedge'); return; }
      this.reachHome(bay);
      return;
    }
    this.checkHazards();
  }

  private platformUnder(): Obj | null {
    const lane = this.lanes.find((l) => l.row === this.fr);
    if (!lane) return null;
    return lane.objs.find((o) => !o.under && Math.abs(o.x - this.fx) < o.w / 2 + 4) ?? null;
  }

  private checkHazards(): void {
    if (!this.alive || this.hopping) return;
    const r = this.fr;
    if (r >= 1 && r <= 5) {
      if (!this.platformUnder()) this.die('water');
    } else if (r >= 7 && r <= 11) {
      const lane = this.lanes.find((l) => l.row === r);
      if (lane?.objs.some((o) => Math.abs(o.x - this.fx) < o.w / 2 + 18)) this.die('car');
    }
  }

  private reachHome(bay: number): void {
    this.homes[bay] = true;
    const img = this.homeImgs[bay];
    img.setVisible(true).setScale(0);
    this.tweens.add({ targets: img, scale: 0.4, duration: 300, ease: 'Back.easeOut' });
    this.frog.setVisible(false);
    const pts = 50 + Math.ceil(this.timeLeft) * 10;
    this.addScore(pts, colX(BAYS[bay]), rowY(HOME_ROW) + 50);
    this.sfx('home', { volume: 0.5 });
    burst(this, colX(BAYS[bay]), rowY(HOME_ROW), [0x5dff7a, 0xffffff, 0xffd23f], 20, 240);
    if (this.chickBay === bay && this.chick) {
      this.addScore(200, colX(BAYS[bay]), rowY(HOME_ROW) + 100);
      popup(this, W / 2, 420, t('rescue'), '#ffd23f', 26);
      this.sfx('bonus', { volume: 0.5 });
      this.chick.destroy(); this.chick = null; this.chickBay = -1;
    }
    if (this.homes.every(Boolean)) { this.levelClear(); return; }
    popup(this, W / 2, 470, t('home'), '#5dff7a', 30);
    this.alive = false;
    this.time.delayedCall(350, () => this.respawn());
  }

  private levelClear(): void {
    this.alive = false;
    this.addScore(500 + this.level * 250, W / 2, 560);
    this.sfx('level', { volume: 0.5 });
    flash(this, 0x5dff7a, 200);
    const msg = txt(this, W / 2, 520, t('levelClear'), { title: true, size: 40, color: '#5dff7a' }).setDepth(50).setScale(0.2);
    const sub = txt(this, W / 2, 590, t('fastTraffic'), { title: true, size: 20, color: '#ffd23f' }).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, delay: 300, duration: 300 });
    this.time.delayedCall(1800, () => {
      msg.destroy(); sub.destroy();
      this.level++;
      this.homes = this.homes.map(() => false);
      this.homeImgs.forEach((h) => h.setVisible(false));
      if (this.chick) { this.chick.destroy(); this.chick = null; this.chickBay = -1; }
      this.setupLanes(false);
      this.respawn();
      this.updateHud();
    });
  }

  private die(why: 'car' | 'water' | 'hedge' | 'time'): void {
    if (!this.alive) return;
    this.alive = false;
    this.lives--;
    this.updateHud();
    const x = this.frog.x, y = this.frog.y;
    if (why === 'water') {
      this.sfx('splash', { volume: 0.6 });
      burst(this, x, y, [0x5fb2ff, 0xffffff, 0x2a7fd4], 26, 260);
      this.tweens.add({ targets: this.frog, scale: 0, alpha: 0, angle: 180, duration: 400 });
    } else {
      this.sfx(why === 'car' ? 'splat' : 'splash', { volume: 0.6 });
      if (why === 'car') this.sfx('honk', { volume: 0.3 });
      burst(this, x, y, [0x5dff7a, 0xec3013, 0xffffff], 26, 300);
      this.frog.setScale(0.5, 0.18);
      this.tweens.add({ targets: this.frog, alpha: 0, delay: 300, duration: 400 });
    }
    if (why === 'time') popup(this, W / 2, 520, t('timeUp'), '#ec3013', 30);
    shake(this, 0.016, 260);
    flash(this, 0xec3013, 140);
    this.time.delayedCall(900, () => {
      if (this.lives <= 0) this.endGame({ delay: 0 });
      else this.respawn();
    });
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.water.tilePositionX -= dt * 20;
    this.water.tilePositionY = Math.sin(this.elapsed * 1.5) * 4;
    this.updateLanes(dt);

    // bonus chick visits an empty home now and then
    this.chickT -= dt;
    if (this.chickT <= 0) {
      if (this.chick) { const c = this.chick; this.chick = null; this.chickBay = -1; this.tweens.add({ targets: c, scale: 0, duration: 200, onComplete: () => c.destroy() }); this.chickT = rng.int(5, 9); }
      else {
        const free = this.homes.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
        if (free.length > 1) {
          this.chickBay = rng.pick(free);
          this.chick = this.add.image(colX(BAYS[this.chickBay]), rowY(HOME_ROW), 'chick').setScale(0).setDepth(6);
          this.tweens.add({ targets: this.chick, scale: 0.34, duration: 250, ease: 'Back.easeOut' });
        }
        this.chickT = rng.int(4, 6);
      }
    }

    if (!this.alive) return;
    // timer
    this.timeLeft -= dt;
    const k = Math.max(0, this.timeLeft / this.timeMax);
    this.timerBar.width = (W - 44) * k;
    this.timerBar.setFillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffd23f : 0xec3013);
    if (k < 0.25 && Math.floor(this.timeLeft) !== this.lastTick) { this.lastTick = Math.floor(this.timeLeft); this.sfx('tick', { volume: 0.3 }); }
    if (this.timeLeft <= 0) { this.die('time'); return; }

    // riding logs / hippos
    if (!this.hopping && this.fr >= 1 && this.fr <= 5) {
      const lane = this.lanes.find((l) => l.row === this.fr)!;
      const p = this.platformUnder();
      if (!p) { this.die('water'); return; }
      this.fx += lane.speed * dt;
      this.frog.setPosition(this.fx, rowY(this.fr));
      if (this.fx < 10 || this.fx > W - 10) { this.die('water'); return; }
    }
    this.checkHazards();
  }
}
