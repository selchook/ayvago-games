import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, t, txt, rng } from '@core';
import { LEVELS } from './levels';

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const THEMES = [
  { wall: 'block_05', floor: 'ground_01' },
  { wall: 'block_06', floor: 'ground_06' },
  { wall: 'block_07', floor: 'ground_05' },
  { wall: 'block_08', floor: 'ground_03' },
];
interface Step { pr: number; pc: number; box?: { from: string; to: string } }

export class PlayScene extends ArcadeScene {
  private level = 0;
  private walls = new Set<string>();
  private goals = new Set<string>();
  private boxes = new Map<string, Phaser.GameObjects.Image>();
  private pr = 0;
  private pc = 0;
  private player!: Phaser.GameObjects.Image;
  private moves = 0;
  /** Sound only: alternates the footstep sample; skips the level-start sting after a restart. */
  private stepFoot = 0;
  private quietStart = false;
  private history: Step[] = [];
  private board!: Phaser.GameObjects.Container;
  private tile = 64;
  private ox = 0;
  private oy = 0;
  private rows = 0;
  private cols = 0;
  private moving = false;
  private queue: Dir[] = [];
  private won = false;
  private gen = 0;
  private swipe: { x: number; y: number; done: boolean } | null = null;
  private levelTxt!: Phaser.GameObjects.Text;
  private movesTxt!: Phaser.GameObjects.Text;
  private holdTimer?: Phaser.Time.TimerEvent;

  createGame(): void {
    this.gen++;
    this.level = 0; this.queue = []; this.moving = false; this.won = false; this.swipe = null; this.holdTimer = undefined;
    this.hud.setCenter('');
    this.levelTxt = txt(this, 360, 118, '', { title: true, size: 26, color: '#ffd23f' });
    this.movesTxt = txt(this, 360, 164, '', { size: 30, color: '#f3f2f2' });
    this.buildControls();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 1010 && p.y > 190) this.swipe = { x: p.x, y: p.y, done: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      if (!s || s.done || !p.isDown) return;
      const dx = p.x - s.x, dy = p.y - s.y;
      if (Math.hypot(dx, dy) < 40) return;
      s.done = true;
      this.queue = [];
      this.tryStep(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const s = this.swipe;
      this.swipe = null;
      if (s && !s.done && Math.hypot(p.x - s.x, p.y - s.y) < 20) this.tapCell(p.x, p.y);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.loadLevel();
  }

  // ---------- UI ----------
  private buildControls(): void {
    const btn = (x: number, y: number, size: number, icon: string, angle: number, onDown: () => void, hold = false) => {
      const c = this.add.container(x, y).setDepth(50);
      const bg = this.add.rectangle(0, 0, size, size, 0x000000, 0.45).setStrokeStyle(4, 0xffffff, 0.7);
      const im = this.add.image(0, 0, icon).setDisplaySize(size * 0.5, size * 0.5).setAngle(angle);
      c.add([bg, im]).setSize(size, size).setInteractive({ useHandCursor: true });
      const stop = () => { this.holdTimer?.remove(); this.holdTimer = undefined; bg.setFillStyle(0x000000, 0.45); };
      c.on('pointerdown', () => {
        bg.setFillStyle(0xec3013, 0.6);
        onDown();
        if (hold) { this.holdTimer?.remove(); this.holdTimer = this.time.addEvent({ delay: 170, loop: true, startAt: -200, callback: onDown }); }
      });
      c.on('pointerup', stop);
      c.on('pointerout', stop);
    };
    btn(90, 1150, 112, 'icon-return', 0, () => this.undo());
    btn(222, 1150, 112, 'sk-restart', 0, () => this.restartLevel());
    const cx = 560, cy = 1150, s = 94, gap = 98;
    btn(cx, cy - gap * 0.75, s, 'sk-arrow', 0, () => this.tryStep('up'), true);
    btn(cx, cy + gap * 0.75, s, 'sk-arrow', 180, () => this.tryStep('down'), true);
    btn(cx - gap, cy, s, 'sk-arrow', -90, () => this.tryStep('left'), true);
    btn(cx + gap, cy, s, 'sk-arrow', 90, () => this.tryStep('right'), true);
  }

  private updateInfo(): void {
    const lv = LEVELS[this.level];
    this.levelTxt.setText(`${t('level')} ${this.level + 1}/${LEVELS.length}`);
    this.movesTxt.setText(`${t('moves')}: ${this.moves}   ${t('par')}: ${lv.par}`);
    this.movesTxt.setColor(this.moves > lv.par ? '#ffb38a' : '#f3f2f2');
  }

  // ---------- level ----------
  private k(r: number, c: number): string { return `${r},${c}`; }
  private x(c: number): number { return this.ox + c * this.tile + this.tile / 2; }
  private y(r: number): number { return this.oy + r * this.tile + this.tile / 2; }

  private loadLevel(): void {
    this.board?.destroy();
    this.walls.clear(); this.goals.clear(); this.boxes.clear();
    this.history = []; this.moves = 0; this.queue = []; this.moving = false; this.won = false;
    const map = LEVELS[this.level].map;
    const theme = THEMES[Math.floor(this.level / 5) % THEMES.length];
    this.rows = map.length; this.cols = Math.max(...map.map((r) => r.length));
    this.tile = Math.min(92, Math.floor(680 / this.cols), Math.floor(800 / this.rows));
    this.ox = 360 - (this.cols * this.tile) / 2;
    this.oy = 600 - (this.rows * this.tile) / 2;
    this.board = this.add.container(0, 0);
    const boxStarts: Array<[number, number]> = [];
    map.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '#') this.walls.add(this.k(r, c));
      if ('.*+'.includes(ch)) this.goals.add(this.k(r, c));
      if ('$*'.includes(ch)) boxStarts.push([r, c]);
      if ('@+'.includes(ch)) { this.pr = r; this.pc = c; }
    }));
    // interior = flood fill from the player
    const inside = new Set<string>([this.k(this.pr, this.pc)]);
    const stack: Array<[number, number]> = [[this.pr, this.pc]];
    while (stack.length) {
      const [r, c] = stack.pop()!;
      for (const [dr, dc] of Object.values(DIRS)) {
        const nk = this.k(r + dr, c + dc);
        if (!inside.has(nk) && !this.walls.has(nk) && r + dr >= 0 && r + dr < this.rows && c + dc >= 0 && c + dc < this.cols) {
          inside.add(nk); stack.push([r + dr, c + dc]);
        }
      }
    }
    const ts = this.tile;
    for (const key of inside) {
      const [r, c] = key.split(',').map(Number);
      this.board.add(this.add.image(this.x(c), this.y(r), theme.floor).setDisplaySize(ts, ts));
      if (this.goals.has(key)) {
        const g = this.add.image(this.x(c), this.y(r), 'sk-goal').setDisplaySize(ts * 0.9, ts * 0.9);
        this.board.add(g);
      }
    }
    for (const key of this.walls) {
      const [r, c] = key.split(',').map(Number);
      const w = this.add.image(this.x(c), this.y(r), theme.wall).setDisplaySize(ts, ts);
      this.board.add(w);
    }
    for (const [r, c] of boxStarts) {
      const b = this.add.image(this.x(c), this.y(r), 'sk-crate').setDisplaySize(ts * 0.92, ts * 0.92);
      this.board.add(b);
      this.boxes.set(this.k(r, c), b);
      this.paintBox(b, this.k(r, c), false);
    }
    this.player = this.add.image(this.x(this.pc), this.y(this.pr), 'sk-down').setDisplaySize(ts, ts);
    this.board.add(this.player);
    // drop-in reveal
    this.board.setAlpha(0).setY(-30);
    this.tweens.add({ targets: this.board, alpha: 1, y: 0, duration: 350, ease: 'Back.easeOut' });
    this.updateInfo();
    if (!this.quietStart) this.sfx('start', { volume: 0.45 });
    this.quietStart = false;
  }

  private paintBox(b: Phaser.GameObjects.Image, key: string, fx: boolean): void {
    const on = this.goals.has(key);
    const was = b.texture.key === 'sk-crate-on';
    b.setTexture(on ? 'sk-crate-on' : 'sk-crate');
    if (fx && on && !was) {
      burst(this, b.x, b.y, [0x5dff7a, 0xffd23f, 0xffffff], 14, 220);
      this.sfxAt('goal', b.x, { volume: 0.55 });
      this.tweens.add({ targets: b, scale: b.scale * 1.15, duration: 90, yoyo: true });
    }
  }

  private restartLevel(): void {
    if (this.won || this.isOver) return;
    this.sfx('restart', { volume: 0.5 });
    this.quietStart = true;
    this.loadLevel();
  }

  // ---------- movement ----------
  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const map: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    };
    if (map[e.code]) { if (this.queue.length > 1) this.queue = []; this.tryStep(map[e.code]); }
    else if (e.code === 'KeyZ' || e.code === 'KeyU' || e.code === 'Backspace') this.undo();
    else if (e.code === 'KeyR') this.restartLevel();
  }

  private faceTex(d: Dir): string { return `sk-${d}`; }

  private tryStep(d: Dir): boolean {
    if (this.won || this.isOver) return false;
    if (this.moving) { if (this.queue.length < 2) this.queue.push(d); return false; }
    const [dr, dc] = DIRS[d];
    const nr = this.pr + dr, nc = this.pc + dc, nk = this.k(nr, nc);
    this.player.setTexture(this.faceTex(d));
    if (this.walls.has(nk)) { this.bump(dr, dc); return false; }
    const step: Step = { pr: this.pr, pc: this.pc };
    const box = this.boxes.get(nk);
    if (box) {
      const bk = this.k(nr + dr, nc + dc);
      if (this.walls.has(bk) || this.boxes.has(bk)) { this.bump(dr, dc); return false; }
      this.boxes.delete(nk); this.boxes.set(bk, box);
      step.box = { from: nk, to: bk };
      this.tweens.add({ targets: box, x: this.x(nc + dc), y: this.y(nr + dr), duration: 110, onComplete: () => this.paintBox(box, bk, true) });
      this.sfxAt(rng.pick(['push1', 'push2']), box.x, { volume: 0.45 });
    } else this.sfxAt(++this.stepFoot % 2 ? 'step1' : 'step2', this.player.x, { volume: 0.4 });
    this.history.push(step);
    this.pr = nr; this.pc = nc; this.moves++;
    this.moving = true;
    this.tweens.add({
      targets: this.player, x: this.x(nc), y: this.y(nr), duration: 110,
      onComplete: () => {
        this.moving = false;
        if (step.box && this.checkWin()) return;
        const next = this.queue.shift();
        if (next) this.tryStep(next);
      },
    });
    this.updateInfo();
    return true;
  }

  private bump(dr: number, dc: number): void {
    this.queue = [];
    this.sfxAt('bump', this.player.x, { volume: 0.3 });
    const px = this.x(this.pc), py = this.y(this.pr);
    this.tweens.add({ targets: this.player, x: px + dc * 8, y: py + dr * 8, duration: 50, yoyo: true, onComplete: () => this.player.setPosition(px, py) });
  }

  private undo(): void {
    if (this.moving || this.won || this.isOver || !this.history.length) return;
    const s = this.history.pop()!;
    if (s.box) {
      const b = this.boxes.get(s.box.to)!;
      this.boxes.delete(s.box.to); this.boxes.set(s.box.from, b);
      const [r, c] = s.box.from.split(',').map(Number);
      b.setPosition(this.x(c), this.y(r));
      this.paintBox(b, s.box.from, false);
    }
    this.pr = s.pr; this.pc = s.pc;
    this.player.setPosition(this.x(s.pc), this.y(s.pr));
    this.moves = Math.max(0, this.moves - 1);
    this.sfx('undo', { volume: 0.45 });
    this.updateInfo();
  }

  /** Tap: adjacent cell = step/push, farther floor = walk there along the shortest path. */
  private tapCell(px: number, py: number): void {
    if (this.won || this.isOver) return;
    const c = Math.floor((px - this.ox) / this.tile), r = Math.floor((py - this.oy) / this.tile);
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return;
    const dist = Math.abs(r - this.pr) + Math.abs(c - this.pc);
    if (dist === 0) return;
    if (dist === 1) {
      const d = (Object.keys(DIRS) as Dir[]).find((k) => DIRS[k][0] === r - this.pr && DIRS[k][1] === c - this.pc)!;
      this.tryStep(d);
      return;
    }
    const path = this.findPath(r, c);
    if (path && path.length) { this.queue = path.slice(1, 40); this.tryStep(path[0]); }
  }

  private findPath(tr: number, tc: number): Dir[] | null {
    const start = this.k(this.pr, this.pc), goal = this.k(tr, tc);
    if (this.walls.has(goal) || this.boxes.has(goal)) return null;
    const prev = new Map<string, [string, Dir]>();
    const q = [start];
    const seen = new Set([start]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === goal) break;
      const [r, c] = cur.split(',').map(Number);
      for (const d of Object.keys(DIRS) as Dir[]) {
        const nr = r + DIRS[d][0], nc = c + DIRS[d][1], nk = this.k(nr, nc);
        if (seen.has(nk) || this.walls.has(nk) || this.boxes.has(nk) || nr < 0 || nc < 0 || nr >= this.rows || nc >= this.cols) continue;
        seen.add(nk); prev.set(nk, [cur, d]); q.push(nk);
      }
    }
    if (!prev.has(goal)) return null;
    const path: Dir[] = [];
    let cur = goal;
    while (cur !== start) { const [p, d] = prev.get(cur)!; path.unshift(d); cur = p; }
    return path;
  }

  private checkWin(): boolean {
    for (const key of this.boxes.keys()) if (!this.goals.has(key)) return false;
    this.won = true;
    this.queue = [];
    const par = LEVELS[this.level].par;
    const stars = this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.5) ? 2 : 1;
    const pts = 100 + 10 * (this.level + 1) + Math.round(400 * Math.min(1, par / this.moves));
    this.addScore(pts, this.player.x, this.player.y - 40);
    this.sfx('win', { volume: 0.7, exact: true });
    flash(this, 0x5dff7a, 150);
    shake(this, 0.006, 150);
    for (const b of this.boxes.values()) burst(this, b.x, b.y, [0xffd23f, 0x5dff7a, 0xff4fa3], 18, 300);
    const gen = this.gen;
    const msg = txt(this, 360, 560, t('levelClear'), { title: true, size: 40, color: '#5dff7a' }).setDepth(60).setScale(0.3);
    this.tweens.add({ targets: msg, scale: 1, duration: 350, ease: 'Back.easeOut' });
    const starImgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 3; i++) {
      const s = this.add.image(360 + (i - 1) * 90, 650, 'icon-star').setDisplaySize(72, 72).setDepth(60).setScale(0)
        .setTint(i < stars ? 0xffd23f : 0x444455);
      starImgs.push(s);
      this.tweens.add({ targets: s, scale: 72 / s.width, duration: 250, delay: 250 + i * 180, ease: 'Back.easeOut', onStart: () => i < stars && this.sfx('star', { volume: 0.5, rate: 1 + i * 0.12, exact: true }) });
    }
    this.time.delayedCall(1900, () => {
      if (gen !== this.gen) return;
      msg.destroy(); starImgs.forEach((s) => s.destroy());
      if (this.level >= LEVELS.length - 1) { this.endGame({ win: true, delay: 100 }); return; }
      this.level++;
      this.loadLevel();
    });
    return true;
  }

  updateGame(): void {
    // idle bob for the player
    if (!this.moving && this.player?.active) this.player.setScale(this.player.scaleX, this.player.scaleX * (1 + Math.sin(this.elapsed * 6) * 0.02));
  }
}

