import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, txt, t, storage, COLORS, ensurePixel } from '@core';
import { PALETTE, makeSymbols, softFlash, banner } from './symbols';
import { generate, slide, DIRS, type Level } from './logic';

const LEVELS = 60;
const BOARD_W = 660;
const BOARD_TOP = 215;
const BOARD_H = 880;
const BTN_Y = 1185;
const PER_PAGE = 20;
const KEY_MAX = 'paint-roll:max';
const KEY_STARS = 'paint-roll:stars';
/** A run is a set of this many cleared levels; then the score goes to the leaderboard. */
const SET_LEN = 5;
/** Points per second left on the level's bonus clock (the clock never ends the run). */
const BONUS_PER_SEC = 2;
const BAR_X = 60;
const BAR_W = 380;
const PIP_Y = 1117;

type Phase = 'select' | 'play' | 'clear';

interface Snapshot { pos: number; painted: number[]; moves: number }

export class PlayScene extends ArcadeScene {
  private phase: Phase = 'select';
  private level = 1;
  private lv!: Level;
  private cell = 60;
  private ox = 0;
  private oy = 0;
  private pos = 0;
  private painted = new Set<number>();
  private moves = 0;
  private undoStack: Snapshot[] = [];
  private sliding = false;
  private queued = -1;
  private timeLeft = 0;
  private timeMax = 1;
  private cleared = 0;          // levels cleared in this run (set)
  private gen = 0;              // bumps whenever the board is torn down: stale slide callbacks bail out
  private colour = 0;
  private board!: Phaser.GameObjects.Container;
  private paintRects = new Map<number, Phaser.GameObjects.Container>();
  private ball!: Phaser.GameObjects.Container;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private info!: Phaser.GameObjects.Text;
  private timerBar!: Phaser.GameObjects.Graphics;
  private bonusText!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private ui: Phaser.GameObjects.GameObject[] = [];
  private selectUi: Phaser.GameObjects.GameObject[] = [];
  private page = 0;
  private focus = 1;
  private focusRing?: Phaser.GameObjects.Rectangle;
  private down = { x: 0, y: 0, on: false };

  createGame(): void {
    makeSymbols(this);
    this.phase = 'select'; this.level = 1; this.pos = 0; this.painted = new Set(); this.moves = 0;
    this.undoStack = []; this.sliding = false; this.queued = -1; this.timeLeft = 0; this.timeMax = 1; this.cleared = 0; this.gen++;
    this.paintRects = new Map(); this.ui = []; this.selectUi = []; this.page = 0; this.focusRing = undefined;
    this.down = { x: 0, y: 0, on: false };

    this.add.rectangle(0, 0, 720, 1280, 0x17122b).setOrigin(0).setDepth(-20);
    this.board = this.add.container(0, 0).setDepth(5);
    this.info = txt(this, 360, 122, '', { size: 30, color: '#f3f2f2' }).setDepth(50);
    this.timerBar = this.add.graphics().setDepth(50);
    this.bonusText = txt(this, 660, 169, '', { size: 24, color: '#5dff7a' }).setOrigin(1, 0.5).setDepth(50);
    this.pips = this.add.graphics().setDepth(50);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'play' || p.y > BTN_Y - 70 || (p.x > 600 && p.y < 130)) return;
      this.down = { x: p.x, y: p.y, on: true };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.down.on) return;
      this.down.on = false;
      if (this.phase !== 'play') return;
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 36) {
        this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 1) : (dy > 0 ? 2 : 3));
      } else {
        // a tap sends the ball toward the tapped side of it
        const bx = this.ball.x, by = this.ball.y;
        const tx = p.x - bx, ty = p.y - by;
        if (Math.max(Math.abs(tx), Math.abs(ty)) > this.cell * 0.5) this.move(Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 0 : 1) : (ty > 0 ? 2 : 3));
      }
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.showSelect();
  }

  // ---------- level select ----------
  private maxLevel(): number { return Phaser.Math.Clamp(storage.get<number>(KEY_MAX, 1), 1, LEVELS); }
  private starsOf(): number[] { return storage.get<number[]>(KEY_STARS, []); }

  private showSelect(): void {
    this.phase = 'select';
    this.clearBoard();
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
    this.info.setText('');
    this.timerBar.clear();
    this.bonusText.setText('');
    this.pips.clear();
    this.hud.setRight('');
    const max = this.maxLevel();
    this.focus = Math.min(max, this.focus > 1 ? this.focus : max);
    this.page = Math.floor((this.focus - 1) / PER_PAGE);
    this.drawSelect();
  }

  private drawSelect(): void {
    if (this.focusRing) this.tweens.killTweensOf(this.focusRing);
    this.selectUi.forEach((o) => o.destroy());
    this.selectUi = [];
    const max = this.maxLevel();
    const stars = this.starsOf();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.selectUi.push(o); return o; };
    add(txt(this, 360, 150, t('chooseLevel'), { title: true, size: 32, color: '#ffd23f' }));
    const total = stars.reduce((a, b) => a + (b || 0), 0);
    add(this.add.image(300, 205, 'icon-star').setScale(0.45).setTint(0xffd23f));
    add(txt(this, 330, 205, `${total} / ${LEVELS * 3}`, { size: 28 }).setOrigin(0, 0.5));
    add(txt(this, 360, 1130, `${t('set')} ${this.cleared} / ${SET_LEN}`, { title: true, size: 18, color: '#ffd23f' }));
    for (let i = 0; i < PER_PAGE; i++) {
      const n = this.page * PER_PAGE + i + 1;
      if (n > LEVELS) break;
      const c = i % 4, r = Math.floor(i / 4);
      const x = 360 + (c - 1.5) * 160, y = 310 + r * 160;
      const open = n <= max;
      const col = PALETTE[(n - 1) % PALETTE.length];
      const box = add(this.add.container(x, y));
      const bg = this.add.rectangle(0, 0, 138, 138, open ? col : 0x2c2545).setStrokeStyle(5, 0x000000, 0.8);
      const shine = this.add.rectangle(0, -58, 118, 6, 0xffffff, open ? 0.35 : 0.08);
      const label = txt(this, 0, -14, String(n), { title: true, size: 30, color: open ? '#ffffff' : '#6b6488' });
      box.add([this.add.rectangle(4, 8, 138, 138, 0x000000, 0.5), bg, shine, label]);
      if (open) {
        for (let s = 0; s < 3; s++) {
          box.add(this.add.image((s - 1) * 38, 38, 'icon-star').setScale(0.62).setTint((stars[n - 1] ?? 0) > s ? 0xffd23f : 0x3a3352));
        }
        box.setSize(138, 138).setInteractive({ useHandCursor: true });
        box.on('pointerup', () => this.startLevel(n));
      } else {
        box.add(this.add.image(0, 40, 'icon-star').setScale(0.42).setTint(0x3a3352).setAlpha(0.5));
      }
      box.setScale(0);
      this.tweens.add({ targets: box, scale: 1, duration: 260, delay: i * 18, ease: 'Back.easeOut' });
    }
    this.focusRing = add(this.add.rectangle(0, 0, 156, 156).setStrokeStyle(6, 0xffffff).setDepth(10));
    this.placeFocus();
    const pages = Math.ceil(LEVELS / PER_PAGE);
    if (this.page > 0) add(new Button(this, 110, BTN_Y, '<', () => this.flip(-1), { width: 140, height: 90, color: 0x333344 }));
    if (this.page < pages - 1) add(new Button(this, 610, BTN_Y, '>', () => this.flip(1), { width: 140, height: 90, color: 0x333344 }));
    add(txt(this, 360, BTN_Y, `${this.page + 1} / ${pages}`, { title: true, size: 22, color: '#aab0d0' }));
    add(txt(this, 360, 1080, t('selectHint'), { size: 24, color: '#aab0d0', wrap: 640 }));
  }

  private placeFocus(): void {
    const i = this.focus - 1 - this.page * PER_PAGE;
    if (!this.focusRing) return;
    const c = i % 4, r = Math.floor(i / 4);
    this.focusRing.setPosition(360 + (c - 1.5) * 160, 310 + r * 160).setVisible(i >= 0 && i < PER_PAGE);
    this.tweens.killTweensOf(this.focusRing);
    this.focusRing.setAlpha(1);
    this.tweens.add({ targets: this.focusRing, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });
  }

  private flip(dir: number): void {
    const pages = Math.ceil(LEVELS / PER_PAGE);
    this.page = Phaser.Math.Clamp(this.page + dir, 0, pages - 1);
    this.focus = Phaser.Math.Clamp(this.page * PER_PAGE + 1, 1, this.maxLevel());
    if (Math.floor((this.focus - 1) / PER_PAGE) !== this.page) this.focus = this.page * PER_PAGE + 1;
    this.drawSelect();
    this.sfx('turn', { volume: 0.4 });
  }

  // ---------- level ----------
  private startLevel(n: number): void {
    if (this.isOver) return;
    if (this.focusRing) this.tweens.killTweensOf(this.focusRing);
    this.selectUi.forEach((o) => o.destroy());
    this.selectUi = [];
    this.focusRing = undefined;
    this.level = n;
    this.focus = n;
    this.sfx('start', { volume: 0.5 });
    this.buildLevel();
  }

  private clearBoard(): void {
    this.gen++;
    if (this.ball) this.tweens.killTweensOf(this.ball);
    this.sliding = false;
    this.queued = -1;
    this.board.removeAll(true);
    this.paintRects.clear();
    this.ball?.destroy();
    this.trail?.destroy();
  }

  private buildLevel(): void {
    this.clearBoard();
    this.lv = generate(this.level);
    const lv = this.lv;
    this.colour = (this.level - 1) % PALETTE.length;
    this.cell = Math.floor(Math.min(92, BOARD_W / lv.w, BOARD_H / lv.h));
    this.ox = 360 - (lv.w * this.cell) / 2;
    this.oy = BOARD_TOP + (BOARD_H - lv.h * this.cell) / 2;
    const cs = this.cell;
    const g = this.add.graphics();
    this.board.add(g);
    // floor + walls
    g.fillStyle(0x000000, 0.4).fillRoundedRect(this.ox - 6, this.oy + 4, lv.w * cs + 12, lv.h * cs + 12, 14);
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const i = y * lv.w + x, px = this.ox + x * cs, py = this.oy + y * cs;
        if (lv.floor[i]) {
          g.fillStyle(0x2a2346, 1).fillRect(px, py, cs, cs);
          g.fillStyle(0x3a3260, 1).fillCircle(px + cs / 2, py + cs / 2, Math.max(3, cs * 0.07));
        } else {
          g.fillStyle(0x6c5fa8, 1).fillRect(px, py, cs, cs);
          g.fillStyle(0x8f82cf, 1).fillRect(px, py, cs, cs * 0.18);
          g.fillStyle(0x4a3f80, 1).fillRect(px, py + cs * 0.82, cs, cs * 0.18);
          g.lineStyle(2, 0x2e2752, 1).strokeRect(px, py, cs, cs);
        }
      }
    }
    // paint overlays (hidden until painted)
    lv.floor.forEach((f, i) => {
      if (!f) return;
      const { x, y } = this.cellXY(i);
      const c = this.add.container(x, y).setVisible(false);
      c.add([
        this.add.rectangle(0, 0, cs - 4, cs - 4, PALETTE[this.colour]).setStrokeStyle(2, 0x000000, 0.25),
        this.add.rectangle(0, -cs * 0.34, cs - 12, 4, 0xffffff, 0.3),
        this.add.image(0, 0, `sym-${this.colour}`).setScale((cs / 64) * 0.42).setAlpha(0.55),
      ]);
      this.board.add(c);
      this.paintRects.set(i, c);
    });
    this.board.setAlpha(0).setY(40);
    this.tweens.add({ targets: this.board, alpha: 1, y: 0, duration: 320, ease: 'Cubic.easeOut' });

    // ball
    const { x, y } = this.cellXY(lv.start);
    this.ball = this.add.container(x, y).setDepth(20);
    const bg = this.add.graphics();
    const r = cs * 0.36;
    bg.fillStyle(0x000000, 0.4).fillCircle(3, 5, r);
    bg.fillStyle(0xffffff, 1).fillCircle(0, 0, r);
    bg.lineStyle(Math.max(4, cs * 0.08), PALETTE[this.colour], 1).strokeCircle(0, 0, r);
    bg.lineStyle(2, 0x000000, 0.6).strokeCircle(0, 0, r + Math.max(2, cs * 0.04));
    this.ball.add([bg, this.add.image(0, 0, `sym-${this.colour}`).setScale((cs / 64) * 0.5).setTint(PALETTE[this.colour])]);
    this.ball.setScale(0);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 300, delay: 200, ease: 'Back.easeOut' });
    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      follow: this.ball, lifespan: 260, frequency: 18, speed: { min: 0, max: 30 },
      scale: { start: cs / 16, end: 0 }, alpha: { start: 0.5, end: 0 }, tint: PALETTE[this.colour], emitting: false,
    }).setDepth(19);

    this.pos = lv.start;
    this.painted = new Set([lv.start]);
    this.paintRects.get(lv.start)?.setVisible(true);
    this.moves = 0;
    this.undoStack = [];
    this.sliding = false;
    this.queued = -1;
    this.timeMax = Math.round(20 + lv.floorCount * 0.6 + lv.par * 2.5);
    this.timeLeft = this.timeMax;
    this.phase = 'play';
    this.buildButtons();
    this.updateInfo();
    this.drawPips();
    banner(this, 640, `${t('level')} ${this.level}`, '#ffd23f', 40);
  }

  private buildButtons(): void {
    this.ui.forEach((o) => o.destroy());
    this.ui = [
      new Button(this, 130, BTN_Y, t('undo'), () => this.undo(), { width: 220, height: 92, size: 22, color: 0x2f6fd0 }),
      new Button(this, 360, BTN_Y, t('restart'), () => this.restartLevel(), { width: 210, height: 92, size: 22, color: 0xd98a1a }),
      new Button(this, 590, BTN_Y, t('levels'), () => this.toSelect(), { width: 220, height: 92, size: 22, color: 0x333344 }),
    ];
  }

  /** Back to the level select from a level (the run and its score carry on). */
  private toSelect(): void {
    if (this.phase !== 'play' || this.isOver) return;
    this.showSelect();
  }

  /** Progress through the set: one paint tile per level cleared in this run. */
  private drawPips(): void {
    const g = this.pips;
    g.clear();
    const s = 26, gap = 12, x0 = 360 - (SET_LEN * s + (SET_LEN - 1) * gap) / 2;
    for (let i = 0; i < SET_LEN; i++) {
      const x = x0 + i * (s + gap);
      g.fillStyle(i < this.cleared ? PALETTE[i % PALETTE.length] : 0x2c2545, 1).fillRect(x, PIP_Y - s / 2, s, s);
      g.lineStyle(3, i < this.cleared ? 0xffffff : 0x4a4370, i < this.cleared ? 0.9 : 1).strokeRect(x, PIP_Y - s / 2, s, s);
    }
  }

  private cellXY(i: number): { x: number; y: number } {
    const w = this.lv.w;
    return { x: this.ox + (i % w) * this.cell + this.cell / 2, y: this.oy + Math.floor(i / w) * this.cell + this.cell / 2 };
  }

  private updateInfo(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.info.setText(`${t('moves')} ${this.moves}  ·  ${t('par')} ${this.lv.par}`);
    this.info.setColor(this.moves > this.lv.par ? '#ff8a1f' : '#f3f2f2');
  }

  // ---------- moves ----------
  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const dir = ({ ArrowRight: 0, KeyD: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowUp: 3, KeyW: 3 } as Record<string, number>)[e.code];
    if (this.phase === 'select') {
      const max = this.maxLevel();
      if (dir !== undefined) {
        const step = [1, -1, 4, -4][dir];
        const nf = Phaser.Math.Clamp(this.focus + step, 1, max);
        if (nf === this.focus) return;
        this.focus = nf;
        const pg = Math.floor((nf - 1) / PER_PAGE);
        if (pg !== this.page) { this.page = pg; this.drawSelect(); } else this.placeFocus();
        this.sfx('turn', { volume: 0.3 });
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        this.startLevel(this.focus);
      }
      return;
    }
    if (this.phase !== 'play') return;
    if (dir !== undefined) this.move(dir);
    else if (e.code === 'KeyZ' || e.code === 'Backspace') this.undo();
    else if (e.code === 'KeyR' || e.code === 'KeyX') this.restartLevel();
    else if (e.code === 'KeyL') this.toSelect();
  }

  private move(d: number): void {
    if (this.phase !== 'play') return;
    if (this.sliding) { this.queued = d; return; }
    const s = slide(this.lv, this.pos, d);
    if (!s.path.length) {
      // bump against the wall
      const [dx, dy] = DIRS[d];
      this.tweens.add({ targets: this.ball, x: this.ball.x + dx * 8, y: this.ball.y + dy * 8, duration: 50, yoyo: true });
      this.sfx('bump', { volume: 0.35 });
      return;
    }
    this.undoStack.push({ pos: this.pos, painted: [...this.painted], moves: this.moves });
    this.moves++;
    this.updateInfo();
    this.sliding = true;
    this.trail.start();
    const to = this.cellXY(s.end);
    const [dx, dy] = DIRS[d];
    this.ball.setScale(dx ? 1.15 : 0.88, dy ? 1.15 : 0.88);
    this.sfx('roll', { volume: 0.35 });
    let k = 0;
    const gen = this.gen;
    this.tweens.add({
      targets: this.ball, x: to.x, y: to.y, duration: 50 + s.path.length * 42, ease: 'Sine.easeIn',
      onUpdate: () => {
        while (k < s.path.length) {
          const c = this.cellXY(s.path[k]);
          const passed = dx > 0 ? this.ball.x >= c.x - 2 : dx < 0 ? this.ball.x <= c.x + 2 : dy > 0 ? this.ball.y >= c.y - 2 : this.ball.y <= c.y + 2;
          if (!passed) break;
          this.paint(s.path[k]);
          k++;
        }
      },
      onComplete: () => {
        if (gen !== this.gen) return;
        s.path.forEach((c) => this.paint(c));
        this.pos = s.end;
        this.sliding = false;
        this.trail.stop();
        this.ball.setScale(dx ? 0.8 : 1.2, dy ? 0.8 : 1.2);
        this.tweens.add({ targets: this.ball, scaleX: 1, scaleY: 1, duration: 120, ease: 'Back.easeOut' });
        this.cameras.main.shake(70, 0.003);
        this.sfx('stop', { volume: 0.45 });
        burst(this, to.x + dx * this.cell * 0.45, to.y + dy * this.cell * 0.45, [PALETTE[this.colour], 0xffffff], 8, 160);
        if (this.painted.size === this.lv.floorCount) { this.levelClear(); return; }
        if (this.queued >= 0) { const q = this.queued; this.queued = -1; this.move(q); }
      },
    });
  }

  private paint(i: number): void {
    if (this.painted.has(i)) return;
    this.painted.add(i);
    const r = this.paintRects.get(i);
    if (!r) return;
    r.setVisible(true).setScale(0.3);
    this.tweens.add({ targets: r, scale: 1, duration: 160, ease: 'Back.easeOut' });
    const frac = this.painted.size / this.lv.floorCount;
    this.sfx('paint', { volume: 0.3, exact: true, rate: 0.85 + frac * 0.7 });
  }

  private undo(): void {
    if (this.phase !== 'play' || this.sliding) return;
    const s = this.undoStack.pop();
    if (!s) { this.sfx('bump', { volume: 0.3 }); return; }
    this.pos = s.pos;
    this.moves = s.moves;
    this.painted = new Set(s.painted);
    this.paintRects.forEach((r, i) => r.setVisible(this.painted.has(i)).setScale(1));
    const { x, y } = this.cellXY(this.pos);
    this.tweens.add({ targets: this.ball, x, y, duration: 120, ease: 'Cubic.easeOut' });
    this.sfx('undo', { volume: 0.5 });
    this.updateInfo();
  }

  private restartLevel(): void {
    if (this.phase !== 'play' || this.sliding || !this.undoStack.length) return;
    const first = this.undoStack[0];
    this.undoStack = [];
    this.pos = first.pos;
    this.moves = 0;
    this.painted = new Set(first.painted);
    this.paintRects.forEach((r, i) => r.setVisible(this.painted.has(i)).setScale(1));
    const { x, y } = this.cellXY(this.pos);
    this.ball.setPosition(x, y).setScale(0.3);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.sfx('restart', { volume: 0.5 });
    this.updateInfo();
  }

  private levelClear(): void {
    this.phase = 'clear';
    const par = this.lv.par;
    const stars = this.moves <= par ? 3 : this.moves <= par + Math.max(1, Math.ceil(par * 0.25)) ? 2 : 1;
    const bonus = Math.ceil(this.timeLeft) * BONUS_PER_SEC;
    const pts = stars * 100 + this.level * 20 + bonus;
    this.cleared++;
    this.drawPips();
    this.bonusText.setText(`${t('timeBonus')} +${bonus}`);
    // save progress
    const all = this.starsOf();
    all[this.level - 1] = Math.max(all[this.level - 1] ?? 0, stars);
    storage.set(KEY_STARS, all);
    storage.set(KEY_MAX, Math.max(this.maxLevel(), Math.min(LEVELS, this.level + 1)));
    this.addScore(pts);

    this.sfx('clear', { volume: 0.6, exact: true });
    softFlash(this, 0xffffff, 100, 0.25);
    shake(this, 0.008, 200);
    this.paintRects.forEach((r, i) => {
      const { x, y } = this.cellXY(i);
      const d = Phaser.Math.Distance.Between(x, y, this.ball.x, this.ball.y);
      this.tweens.add({ targets: r, scale: 1.18, duration: 120, delay: d * 0.6, yoyo: true });
    });
    burst(this, this.ball.x, this.ball.y, [PALETTE[this.colour], 0xffffff, 0xffd23f], 50, 520);

    const panel = this.add.container(360, 640).setDepth(60);
    panel.add(this.add.rectangle(0, 0, 600, 380, 0x0e0d12, 0.88).setStrokeStyle(6, PALETTE[this.colour]));
    panel.add(txt(this, 0, -110, t('levelClear'), { title: true, size: 32, color: '#5dff7a' }));
    for (let s = 0; s < 3; s++) {
      const st = this.add.image((s - 1) * 110, -10, 'icon-star').setScale(0).setTint(s < stars ? 0xffd23f : 0x3a3352);
      panel.add(st);
      this.tweens.add({ targets: st, scale: 1.7, duration: 280, delay: 250 + s * 200, ease: 'Back.easeOut' });
      if (s < stars) this.time.delayedCall(250 + s * 200, () => this.sfx('star', { volume: 0.5, exact: true, rate: 1 + s * 0.12 }));
    }
    panel.add(txt(this, 0, 86, `${t('moves')} ${this.moves} · ${t('par')} ${par}   +${pts}`, { size: 28, color: '#ffd23f' }));
    panel.add(txt(this, 0, 134, `${t('timeBonus')} +${bonus}  ·  ${t('set')} ${this.cleared} / ${SET_LEN}`, { size: 24, color: '#aab0d0' }));
    panel.setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });

    const setDone = this.cleared >= SET_LEN;
    this.time.delayedCall(2100, () => {
      panel.destroy();
      if (this.isOver) return;
      // the run ends after a set of levels (or the last level): the score goes to the leaderboard
      if (this.level >= LEVELS) { this.endGame({ win: true, title: t('allClear'), delay: 200 }); return; }
      if (setDone) { this.endGame({ win: true, title: t('setDone'), delay: 200 }); return; }
      this.level++;
      this.focus = this.level;
      this.buildLevel();
    });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    if (this.phase !== 'play') return;
    // the bonus clock only shrinks the time bonus; a calm puzzle never fails on time
    this.timeLeft = Math.max(0, this.timeLeft - delta / 1000);
    const f = this.timeLeft / this.timeMax;
    const g = this.timerBar;
    g.clear();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(BAR_X, 158, BAR_W, 22, 11);
    if (f > 0) g.fillStyle(f < 0.35 ? COLORS.yellow : COLORS.green, 1).fillRoundedRect(BAR_X + 2, 160, Math.max(18, (BAR_W - 4) * f), 18, 9);
    this.bonusText.setText(`${t('timeBonus')} +${Math.ceil(this.timeLeft) * BONUS_PER_SEC}`).setColor(f > 0 ? '#5dff7a' : '#6b6488');
  }
}
