import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, popup, txt, t, rng } from '@core';

type Kind = 'elbow' | 'straight' | 'tee' | 'cross';
const N = 1, E = 2, S = 4, W = 8;
const DIRS = [N, E, S, W];
const DR: Record<number, [number, number]> = { [N]: [-1, 0], [E]: [0, 1], [S]: [1, 0], [W]: [0, -1] };
const OPP: Record<number, number> = { [N]: S, [S]: N, [E]: W, [W]: E };
/** Openings of each sprite at rotation 0 (sprite art: elbow = E+S, straight = N+S, tee = W+E+S). */
const BASE: Record<Kind, number> = { elbow: E | S, straight: N | S, tee: W | E | S, cross: 15 };
/** Sprite offset inside a 220-unit cell so every opening sits on the cell edge centre. */
const OFF: Record<Kind, [number, number]> = { elbow: [30, 30], straight: [0, 0], tee: [0, 30], cross: [0, 0] };
const UNIT = 220;
const SIZES: Array<[number, number]> = [[5, 5], [5, 6], [6, 7], [6, 8], [7, 8], [7, 9]];

const rot = (m: number, r: number): number => {
  for (let i = 0; i < r; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};

interface Cell {
  kind: Kind;
  r: number;
  c: Phaser.GameObjects.Container;
  grey: Phaser.GameObjects.Image;
  green: Phaser.GameObjects.Image;
  water: Phaser.GameObjects.Image;
  filled: boolean;
}

type Phase = 'build' | 'flow' | 'between' | 'over';

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'build';
  private level = 1;
  private lives = 3;
  private cols = 5;
  private rows = 5;
  private cell = 100;
  private x0 = 0;
  private y0 = 0;
  private cs = 0;
  private cd = 0;
  private cells: Cell[] = [];
  private layer!: Phaser.GameObjects.Container;
  private countdown = 0;
  private countMax = 1;
  private flowStep = 0.5;
  private flowAcc = 0;
  private stall = 0;
  private leaks = new Set<number>();
  private linked = false;
  private cursor = 0;
  private showCursor = false;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Rectangle;
  private flowBtn!: Button;
  private srcStub!: Phaser.GameObjects.Image;
  private drnStub!: Phaser.GameObjects.Image;
  private lastTick = 0;
  private earlySecs = 0;
  private srcFilled = false;
  /** Rotations of the generated solution (kept for QA scripts). */
  solution: number[] = [];

  createGame(): void {
    this.phase = 'build'; this.level = 1; this.lives = 3; this.cells = []; this.leaks = new Set(); this.linked = false;
    this.cursor = 0; this.showCursor = false; this.lastTick = 0; this.earlySecs = 0; this.srcFilled = false;
    this.input.mouse?.disableContextMenu();

    this.layer = this.add.container(0, 0);
    this.add.rectangle(60, 112, 440, 24, 0x000000, 0.6).setOrigin(0, 0.5).setStrokeStyle(4, 0xffffff, 0.8);
    this.bar = this.add.rectangle(64, 112, 432, 16, 0x3ee6ff).setOrigin(0, 0.5);
    this.livesText = txt(this, 516, 112, '', { title: true, size: 18, color: '#ff4fa3' }).setOrigin(0, 0.5).setDepth(9);
    this.timerText = txt(this, 280, 150, '', { title: true, size: 18, color: '#3ee6ff' }).setDepth(9);
    this.cursorBox = this.add.rectangle(0, 0, 10, 10).setStrokeStyle(6, 0xffd23f).setDepth(20).setVisible(false);
    this.tweens.add({ targets: this.cursorBox, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });
    this.flowBtn = new Button(this, 360, 1212, t('openNow'), () => this.startFlow(true), { width: 380, height: 80, size: 26, color: 0x1f6fd1 });
    this.flowBtn.setDepth(9);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const i = this.cellAt(p.x, p.y);
      if (i < 0) return;
      this.showCursor = false; this.cursorBox.setVisible(false); this.cursor = i;
      this.rotate(i, p.rightButtonDown() ? -1 : 1);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.buildLevel();
  }

  // ---------- level generation ----------

  private buildLevel(): void {
    this.layer.removeAll(true);
    this.cells = [];
    this.leaks.clear();
    this.linked = false;
    this.srcFilled = false;
    this.stall = 0; this.flowAcc = 0; this.lastTick = 0; this.earlySecs = 0;
    const [cols, rows] = SIZES[Math.min(this.level - 1, SIZES.length - 1)];
    this.cols = cols; this.rows = rows;
    this.cell = Math.floor(Math.min(640 / cols, 1000 / (rows + 1.7), 110));
    this.x0 = 360 - (cols * this.cell) / 2;
    this.y0 = Math.round(650 - (rows * this.cell) / 2);

    const path = this.makePath();
    const n = cols * rows;
    const kinds: Kind[] = new Array(n);
    const rots: number[] = new Array(n).fill(0);
    const onPath = new Set(path);
    for (let k = 0; k < path.length; k++) {
      const i = path[k];
      const inDir = k === 0 ? N : this.dirBetween(i, path[k - 1]);
      const outDir = k === path.length - 1 ? S : this.dirBetween(i, path[k + 1]);
      const need = inDir | outDir;
      kinds[i] = OPP[inDir] === outDir ? 'straight' : 'elbow';
      rots[i] = [0, 1, 2, 3].find((r) => rot(BASE[kinds[i]], r) === need)!;
    }
    const decoyPool: Kind[] = ['elbow', 'elbow', 'elbow', 'straight', 'straight', 'tee', 'tee', 'cross'];
    for (let i = 0; i < n; i++) if (!onPath.has(i)) { kinds[i] = rng.pick(decoyPool); rots[i] = rng.int(0, 3); }
    this.solution = [...rots];
    // scramble every rotation; make sure the level does not start solved
    for (const i of path) rots[i] = (rots[i] + rng.int(1, 3)) % 4;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(this.x0 - 12, this.y0 - 12, cols * this.cell + 24, rows * this.cell + 24, 14);
    g.lineStyle(5, 0x3a5a78, 1).strokeRoundedRect(this.x0 - 12, this.y0 - 12, cols * this.cell + 24, rows * this.cell + 24, 14);
    for (let i = 0; i < n; i++) {
      const x = this.x0 + (i % cols) * this.cell, y = this.y0 + Math.floor(i / cols) * this.cell;
      g.fillStyle((i + Math.floor(i / cols)) % 2 ? 0x22303f : 0x1c2834, 1).fillRect(x + 2, y + 2, this.cell - 4, this.cell - 4);
    }
    this.layer.add(g);
    this.drawEnds();

    for (let i = 0; i < n; i++) {
      const { x, y } = this.cellXY(i);
      const kind = kinds[i];
      const [ox, oy] = OFF[kind];
      const c = this.add.container(x, y).setScale(0).setAngle(rots[i] * 90);
      const grey = this.add.image(ox, oy, `pf-grey-${kind}`);
      const green = this.add.image(ox, oy, `pf-green-${kind}`).setVisible(false);
      const water = this.add.image(ox, oy, `pf-water-${kind}`).setAlpha(0);
      c.add([grey, green, water]);
      this.layer.add(c);
      this.tweens.add({ targets: c, scale: (this.cell - 2) / UNIT, duration: 260, delay: (i % cols + Math.floor(i / cols)) * 25, ease: 'Back.easeOut' });
      this.cells.push({ kind, r: rots[i], c, grey, green, water, filled: false });
    }

    this.flowStep = Math.max(0.22, 0.62 - 0.05 * (this.level - 1));
    this.countMax = Math.max(14, Math.round(10 + path.length * 1.9 - (this.level - 1) * 1.2));
    this.countdown = this.countMax;
    this.cursor = this.cs;
    this.phase = 'build';
    this.flowBtn.setVisible(true);
    this.refreshLinks(false);
    this.updateHud();
  }

  private dirBetween(a: number, b: number): number {
    const dr = Math.floor(b / this.cols) - Math.floor(a / this.cols), dc = (b % this.cols) - (a % this.cols);
    return dr < 0 ? N : dr > 0 ? S : dc > 0 ? E : W;
  }

  /** Random self-avoiding path from the top (column cs) to the bottom (column cd). */
  private makePath(): number[] {
    const { cols, rows } = this;
    const n = cols * rows;
    const minLen = rows + Math.min(6, 1 + this.level), maxLen = Math.floor(n * 0.6);
    for (let attempt = 0; attempt < 300; attempt++) {
      this.cs = rng.int(0, cols - 1);
      this.cd = rng.int(0, cols - 1);
      const start = this.cs, end = (rows - 1) * cols + this.cd;
      const path = [start];
      const seen = new Set([start]);
      let budget = 3000;
      const dfs = (cur: number): boolean => {
        if (cur === end) return path.length >= minLen;
        if (--budget < 0 || path.length >= maxLen) return false;
        const r = Math.floor(cur / cols), c = cur % cols;
        const nb = rng.shuffle(DIRS.map((d) => [r + DR[d][0], c + DR[d][1]]).filter(([rr, cc]) => rr >= 0 && cc >= 0 && rr < rows && cc < cols).map(([rr, cc]) => rr * cols + cc));
        for (const q of nb) {
          if (seen.has(q)) continue;
          seen.add(q); path.push(q);
          if (dfs(q)) return true;
          seen.delete(q); path.pop();
        }
        return false;
      };
      if (dfs(start)) return path;
    }
    // fallback: straight down then across
    this.cs = 0; this.cd = 0;
    return [...Array(rows).keys()].map((r) => r * cols);
  }

  private drawEnds(): void {
    const cl = this.cell;
    const sx = this.x0 + this.cs * cl + cl / 2, dx = this.x0 + this.cd * cl + cl / 2;
    const yb = this.y0 + this.rows * cl;
    const pw = (cl * 102) / UNIT;
    this.srcStub = this.add.image(sx, this.y0 - cl * 0.18, 'pf-green-straight').setDisplaySize(pw, cl * 0.42);
    this.drnStub = this.add.image(dx, yb + cl * 0.18, 'pf-grey-straight').setDisplaySize(pw, cl * 0.42);
    const g = this.add.graphics();
    // source tank
    g.fillStyle(0x000000, 0.6).fillRoundedRect(sx - cl * 0.5, this.y0 - cl * 0.86, cl, cl * 0.56, 10);
    g.fillStyle(0x1f6fd1).fillRoundedRect(sx - cl * 0.46, this.y0 - cl * 0.84, cl * 0.92, cl * 0.5, 8);
    g.fillStyle(0x3ee6ff).fillRoundedRect(sx - cl * 0.4, this.y0 - cl * 0.8, cl * 0.8, cl * 0.14, 6);
    // drain grate
    g.fillStyle(0x000000, 0.6).fillRoundedRect(dx - cl * 0.5, yb + cl * 0.3, cl, cl * 0.56, 10);
    g.fillStyle(0x5d6b78).fillRoundedRect(dx - cl * 0.46, yb + cl * 0.32, cl * 0.92, cl * 0.5, 8);
    g.fillStyle(0x1a222b);
    for (let k = 0; k < 4; k++) g.fillRect(dx - cl * 0.36 + k * cl * 0.2, yb + cl * 0.38, cl * 0.1, cl * 0.38);
    this.layer.add([this.srcStub, this.drnStub, g]);
    const drop = this.add.circle(sx, this.y0 - cl * 0.58, cl * 0.1, 0xffffff, 0.8);
    this.layer.add(drop);
    this.tweens.add({ targets: drop, y: drop.y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private cellXY(i: number): { x: number; y: number } {
    return { x: this.x0 + (i % this.cols) * this.cell + this.cell / 2, y: this.y0 + Math.floor(i / this.cols) * this.cell + this.cell / 2 };
  }

  private cellAt(px: number, py: number): number {
    const c = Math.floor((px - this.x0) / this.cell), r = Math.floor((py - this.y0) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private mask(i: number): number {
    const cl = this.cells[i];
    return rot(BASE[cl.kind], cl.r);
  }

  private neighbor(i: number, d: number): number {
    const r = Math.floor(i / this.cols) + DR[d][0], c = (i % this.cols) + DR[d][1];
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return -1;
    return r * this.cols + c;
  }

  private isDrainExit(i: number, d: number): boolean {
    return d === S && i === (this.rows - 1) * this.cols + this.cd;
  }

  // ---------- input ----------

  private rotate(i: number, dir: 1 | -1): void {
    if (this.phase !== 'build' && this.phase !== 'flow') return;
    const cl = this.cells[i];
    if (cl.filled) {
      this.sfxAt('locked', cl.c.x, { volume: 0.35 });
      this.tweens.add({ targets: cl.c, x: cl.c.x + 5, duration: 40, yoyo: true, repeat: 1 });
      return;
    }
    cl.r = (cl.r + (dir > 0 ? 1 : 3)) % 4;
    this.tweens.killTweensOf(cl.c);
    const s = (this.cell - 2) / UNIT;
    cl.c.setScale(s);
    const target = cl.c.angle + dir * 90;
    this.tweens.add({ targets: cl.c, angle: target, duration: 120, ease: 'Back.easeOut', onComplete: () => cl.c.setAngle(cl.r * 90) });
    this.tweens.add({ targets: cl.c, scale: s * 0.9, duration: 60, yoyo: true });
    this.sfxAt(rng.pick(['rotate', 'rotate2', 'rotate3']), cl.c.x, { volume: 0.45 });
    this.refreshLinks(true);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase !== 'build' && this.phase !== 'flow') return;
    let r = Math.floor(this.cursor / this.cols), c = this.cursor % this.cols;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': c = (c + this.cols - 1) % this.cols; break;
      case 'ArrowRight': case 'KeyD': c = (c + 1) % this.cols; break;
      case 'ArrowUp': case 'KeyW': r = (r + this.rows - 1) % this.rows; break;
      case 'ArrowDown': case 'KeyS': r = (r + 1) % this.rows; break;
      case 'Space': case 'KeyZ': this.showCursor = true; this.moveCursor(); this.rotate(this.cursor, 1); return;
      case 'KeyX': this.showCursor = true; this.moveCursor(); this.rotate(this.cursor, -1); return;
      case 'KeyF': case 'Enter': this.startFlow(true); return;
      default: return;
    }
    this.cursor = r * this.cols + c;
    this.showCursor = true;
    this.moveCursor();
    this.sfx('move', { volume: 0.3 });
  }

  private moveCursor(): void {
    const { x, y } = this.cellXY(this.cursor);
    this.cursorBox.setSize(this.cell - 4, this.cell - 4).setOrigin(0.5).setPosition(x, y).setVisible(this.showCursor);
  }

  /** Pipes reachable from the source turn green; announces a complete link. */
  private refreshLinks(announce: boolean): void {
    const start = this.cs;
    const seen = new Set<number>();
    let done = false;
    if (this.mask(start) & N) {
      const q = [start];
      seen.add(start);
      while (q.length) {
        const i = q.shift()!;
        const m = this.mask(i);
        for (const d of DIRS) {
          if (!(m & d)) continue;
          if (this.isDrainExit(i, d)) { done = true; continue; }
          const j = this.neighbor(i, d);
          if (j < 0 || seen.has(j) || !(this.mask(j) & OPP[d])) continue;
          seen.add(j); q.push(j);
        }
      }
    }
    this.cells.forEach((cl, i) => {
      const on = seen.has(i);
      cl.green.setVisible(on);
      cl.grey.setVisible(!on);
    });
    if (done && !this.linked && announce && this.phase === 'build') {
      this.sfx('link', { volume: 0.6 });
      popup(this, 360, this.y0 - 20, t('connected'), '#5dff7a', 26);
      this.drnStub.setTexture('pf-green-straight');
    } else if (!done) this.drnStub.setTexture('pf-grey-straight');
    else this.drnStub.setTexture('pf-green-straight');
    this.linked = done;
  }

  // ---------- flow ----------

  private startFlow(early: boolean): void {
    if (this.phase !== 'build') return;
    this.phase = 'flow';
    this.flowBtn.setVisible(false);
    this.earlySecs = early ? Math.floor(this.countdown) : 0;
    if (this.earlySecs > 0) popup(this, 360, 200, `${t('earlyBonus')} +${this.earlySecs * 10 * this.level}`, '#3ee6ff', 22);
    this.countdown = 0;
    this.flowAcc = this.flowStep * 0.6;
    this.srcStub.setTexture('pf-water-straight');
    this.sfx('flow', { volume: 0.45 });
    shake(this, 0.006, 200);
    this.updateHud();
  }

  private fill(i: number): void {
    const cl = this.cells[i];
    cl.filled = true;
    cl.green.setVisible(true); cl.grey.setVisible(false);
    this.tweens.add({ targets: cl.water, alpha: 1, duration: this.flowStep * 900 });
    const s = (this.cell - 2) / UNIT;
    this.tweens.add({ targets: cl.c, scale: s * 1.1, duration: 120, yoyo: true });
    const { x, y } = this.cellXY(i);
    burst(this, x, y, [0x3ee6ff, 0x1f6fd1, 0xffffff], 6, 120);
    this.sfxAt('fill', x, { volume: 0.4, detune: Math.min(800, this.cells.filter((c) => c.filled).length * 30) });
    this.addScore(10 * this.level);
  }

  private flowTick(): void {
    if (!this.srcFilled) {
      if (this.mask(this.cs) & N && !this.cells[this.cs].filled) {
        this.srcFilled = true; this.stall = 0; this.fill(this.cs);
      } else this.stallOrFail(this.cs, N);
      return;
    }
    const add = new Set<number>();
    let drained = false;
    this.cells.forEach((cl, i) => {
      if (!cl.filled) return;
      const m = this.mask(i);
      for (const d of DIRS) {
        if (!(m & d)) continue;
        if (this.isDrainExit(i, d)) { drained = true; continue; }
        const j = this.neighbor(i, d);
        if (j >= 0 && this.mask(j) & OPP[d]) { if (!this.cells[j].filled) add.add(j); continue; }
        // open end with nothing to flow into
        const key = i * 16 + d;
        if (!this.leaks.has(key) && this.stall >= 1) { this.leaks.add(key); this.leakFx(i, d); }
      }
    });
    if (drained) { this.success(); return; }
    if (add.size) { this.stall = 0; add.forEach((j) => this.fill(j)); return; }
    this.stall++;
    if (this.stall >= 3) this.failLevel();
  }

  private stallOrFail(i: number, d: number): void {
    this.stall++;
    if (this.stall === 2) this.leakFx(i, d);
    if (this.stall >= 3) this.failLevel();
  }

  private leakFx(i: number, d: number): void {
    const { x, y } = this.cellXY(i);
    const ex = x + DR[d][1] * this.cell * 0.5, ey = y + DR[d][0] * this.cell * 0.5;
    burst(this, ex, ey, [0x3ee6ff, 0x1f6fd1, 0xffffff], 22, 260);
    this.sfxAt('leak', ex, { volume: 0.55 });
    popup(this, ex, ey - 20, t('leak'), '#3ee6ff', 18);
    const puddle = this.add.circle(ex, ey, this.cell * 0.18, 0x3ee6ff, 0.7).setScale(0);
    this.layer.add(puddle);
    this.tweens.add({ targets: puddle, scale: 1.4, alpha: 0.35, duration: 500 });
  }

  private success(): void {
    this.phase = 'between';
    this.drnStub.setTexture('pf-water-straight');
    const filled = this.cells.filter((c) => c.filled).length;
    const bonus = 250 * this.level + this.earlySecs * 10 * this.level;
    this.sfx('win', { volume: 0.8, exact: true });
    softFlash(this, 0x3ee6ff);
    const dx = this.x0 + this.cd * this.cell + this.cell / 2, yb = this.y0 + this.rows * this.cell;
    for (let k = 0; k < 5; k++) this.time.delayedCall(k * 120, () => burst(this, dx, yb + this.cell * 0.5, [0x3ee6ff, 0xffffff, 0x5dff7a], 20, 360));
    this.addScore(bonus, 360, 640);
    const band = this.add.rectangle(360, 620, 720, 150, 0x000000, 0.75).setDepth(29);
    const msg = txt(this, 360, 600, t('levelClear'), { title: true, size: 38, color: '#5dff7a' }).setDepth(30).setScale(0);
    const sub = txt(this, 360, 656, `${t('pipes')}: ${filled}`, { size: 28, color: '#ffd23f' }).setDepth(30);
    this.tweens.add({ targets: msg, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.time.delayedCall(2300, () => {
      band.destroy(); msg.destroy(); sub.destroy();
      if (this.isOver) return;
      this.level++;
      this.buildLevel();
    });
  }

  private failLevel(): void {
    this.phase = 'between';
    this.lives--;
    this.sfx('fail', { volume: 0.7 });
    shake(this, 0.02, 350);
    softFlash(this, 0xec3013);
    this.updateHud();
    this.tweens.add({ targets: this.livesText, scale: { from: 1.6, to: 1 }, duration: 400, ease: 'Back.easeOut' });
    const band = this.add.rectangle(360, 620, 720, 130, 0x000000, 0.75).setDepth(29);
    const msg = txt(this, 360, 620, t('blocked'), { title: true, size: 34, color: '#ec3013' }).setDepth(30).setScale(0);
    this.tweens.add({ targets: msg, scale: 1, duration: 360, ease: 'Back.easeOut' });
    if (this.lives <= 0) { this.phase = 'over'; this.endGame({ delay: 1600 }); return; }
    this.time.delayedCall(2000, () => {
      band.destroy(); msg.destroy();
      if (!this.isOver) this.buildLevel();
    });
  }

  // ---------- loop ----------

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.phase === 'build') {
      this.countdown -= dt;
      if (this.countdown <= 5 && Math.ceil(this.countdown) !== this.lastTick && this.countdown > 0) {
        this.lastTick = Math.ceil(this.countdown);
        this.sfx('tick', { volume: this.lastTick <= 2 ? 0.6 : 0.45, rate: this.lastTick <= 2 ? 1.15 : 1 });
        this.tweens.add({ targets: this.timerText, scale: { from: 1.3, to: 1 }, duration: 250 });
      }
      if (this.countdown <= 0) this.startFlow(false);
      this.updateHud();
    } else if (this.phase === 'flow') {
      this.flowAcc += dt;
      if (this.flowAcc >= this.flowStep) { this.flowAcc -= this.flowStep; this.flowTick(); }
    }
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.livesText.setText(`${t('lives')} ${Math.max(0, this.lives)}`);
    const f = Phaser.Math.Clamp(this.countdown / this.countMax, 0, 1);
    this.bar.width = 432 * f;
    this.bar.fillColor = f > 0.3 ? 0x3ee6ff : 0xec3013;
    if (this.phase === 'build') this.timerText.setText(t('flowIn', { s: Math.ceil(this.countdown) })).setColor(this.countdown <= 5 ? '#ec3013' : '#3ee6ff');
    else this.timerText.setText(t('flowing')).setColor('#3ee6ff');
  }
}


/** Semi-transparent screen flash (the camera flash starts fully opaque). */
function softFlash(scene: Phaser.Scene, color: number, alpha = 0.35, ms = 220): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, alpha).setOrigin(0).setDepth(7000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, onComplete: () => r.destroy() });
}
