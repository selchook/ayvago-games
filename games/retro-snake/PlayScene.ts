import Phaser from 'phaser';
import { ArcadeScene, Button, COLORS, burst, shake, flash, popup, t, txt, rng } from '@core';

/** onebit frames: apple, pear, carrot, meat, cheese */
export const FOODS = [897, 898, 994, 801, 802];
const BONUS_FRAME = 140;  // golden crown

const CELL = 40, COLS = 17, ROWS = 26, OX = 20, OY = 150;
type Dir = { x: number; y: number };
const UP: Dir = { x: 0, y: -1 }, DOWN: Dir = { x: 0, y: 1 }, LEFT: Dir = { x: -1, y: 0 }, RIGHT: Dir = { x: 1, y: 0 };
type Mode = 'classic' | 'walls';
let lastMode: Mode = 'classic';

export class PlayScene extends ArcadeScene {
  private gfx!: Phaser.GameObjects.Graphics;
  private snake: { x: number; y: number }[] = [];
  private dir: Dir = RIGHT;
  private queue: Dir[] = [];
  private grow = 0;
  private stepT = 0;
  private interval = 0.16;
  private level = 1;
  private eaten = 0;
  private mode: Mode = 'classic';
  private started = false;
  private dead = false;
  private food!: Phaser.GameObjects.Image;
  private foodCell = { x: 0, y: 0 };
  private bonus: Phaser.GameObjects.Image | null = null;
  private bonusCell = { x: -1, y: -1 };
  private bonusT = 0;
  private bonusBar!: Phaser.GameObjects.Graphics;
  private rocks: { x: number; y: number }[] = [];
  private rockGfx!: Phaser.GameObjects.Graphics;
  private chooser: Phaser.GameObjects.GameObject[] = [];
  private down: { x: number; y: number } | null = null;
  private modeText?: Phaser.GameObjects.Text;

  createGame(): void {
    this.textures.get('onebit').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.snake = []; this.queue = []; this.rocks = []; this.chooser = [];
    this.dir = RIGHT; this.grow = 0; this.stepT = 0; this.interval = 0.16; this.level = 1; this.eaten = 0;
    this.started = false; this.dead = false; this.modeText = undefined; this.bonus = null; this.bonusT = 0; this.down = null;
    this.mode = lastMode;

    // checkerboard field
    const bg = this.add.graphics();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      bg.fillStyle((x + y) % 2 ? 0x16261a : 0x1b2e1f).fillRect(OX + x * CELL, OY + y * CELL, CELL, CELL);
    }
    this.add.graphics().setName('border');
    this.rockGfx = this.add.graphics().setDepth(2);
    this.gfx = this.add.graphics().setDepth(3);
    this.bonusBar = this.add.graphics().setDepth(4);
    this.food = this.add.image(0, 0, 'onebit', FOODS[0]).setScale(CELL / 16 * 0.9).setDepth(2).setVisible(false);

    for (let i = 0; i < 4; i++) this.snake.push({ x: 6 - i, y: 13 });
    this.drawBorder();
    this.drawSnake();
    this.updateHud();
    this.showChooser();

    // input: keyboard arrows/WASD, swipes, and taps beside the head
    const kb = this.input.keyboard;
    const keyDir: Record<string, Dir> = { UP, DOWN, LEFT, RIGHT, W: UP, S: DOWN, A: LEFT, D: RIGHT };
    for (const [k, d] of Object.entries(keyDir)) kb?.on(`keydown-${k}`, () => this.turn(d));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.down = this.started ? { x: p.x, y: p.y } : null; });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.down || !this.started) { this.down = null; return; }
      const dx = p.x - this.down.x, dy = p.y - this.down.y;
      const from = this.down;
      this.down = null;
      if (from.y < 120 && from.x > 600) return; // pause button corner
      if (Math.hypot(dx, dy) > 30) { this.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : (dy > 0 ? DOWN : UP)); return; }
      // tap: turn towards the tapped side of the head
      const last = this.queue[this.queue.length - 1] ?? this.dir;
      const h = this.cellPos(this.snake[0]);
      if (last.x !== 0) this.turn(p.y < h.y ? UP : DOWN);
      else this.turn(p.x < h.x ? LEFT : RIGHT);
    });
  }

  private showChooser(): void {
    const title = txt(this, 360, 380, t('choose'), { title: true, size: 34, color: '#ffd23f' }).setDepth(50);
    const shade = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.55).setDepth(49);
    const mk = (mode: Mode, y: number, color: number) => {
      const b = new Button(this, 360, y, t(mode), () => this.start(mode), { width: 420, height: 110, color, size: 32 }).setDepth(51);
      const info = txt(this, 360, y + 85, t(mode + 'Info'), { size: 26, color: '#f3f2f2' }).setDepth(51);
      return [b, info];
    };
    const sel = this.add.rectangle(360, 0, 450, 140).setStrokeStyle(6, 0xffd23f).setDepth(50);
    const [b1, i1] = mk('classic', 560, 0x2f9e44);
    const [b2, i2] = mk('walls', 800, COLORS.red);
    const place = () => sel.setY(this.mode === 'classic' ? 560 : 800);
    place();
    this.tweens.add({ targets: sel, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    this.chooser = [title, shade, b1, i1, b2, i2, sel];
    const kb = this.input.keyboard;
    const toggle = () => { if (!this.started) { this.mode = this.mode === 'classic' ? 'walls' : 'classic'; place(); this.sfx('turn'); } };
    kb?.on('keydown-UP', toggle); kb?.on('keydown-DOWN', toggle);
    kb?.on('keydown-W', toggle); kb?.on('keydown-S', toggle);
    const go = () => { if (!this.started) this.start(this.mode); };
    kb?.on('keydown-SPACE', go); kb?.on('keydown-ENTER', go);
  }

  private start(mode: Mode): void {
    if (this.started) return;
    this.mode = lastMode = mode;
    this.started = true;
    this.queue = [];
    this.dir = RIGHT;
    for (const o of this.chooser) o.destroy();
    this.chooser = [];
    this.drawBorder();
    this.sfx('spawn');
    this.placeFood();
  }

  private cellPos(c: { x: number; y: number }): { x: number; y: number } {
    return { x: OX + c.x * CELL + CELL / 2, y: OY + c.y * CELL + CELL / 2 };
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
  }

  private drawBorder(): void {
    const g = this.children.getByName('border') as Phaser.GameObjects.Graphics;
    g.clear();
    const walls = this.mode === 'walls' && this.started;
    g.lineStyle(walls ? 10 : 4, walls ? 0xec3013 : 0x3fbf3f, walls ? 1 : 0.5);
    g.strokeRect(OX - 5, OY - 5, COLS * CELL + 10, ROWS * CELL + 10);
    this.modeText?.destroy();
    if (this.started) this.modeText = txt(this, 360, 1236, `${t(this.mode)} · ${t(this.mode + 'Info')}`, { size: 26, color: walls ? '#ff7a5c' : '#9dff6a' });
  }

  private turn(d: Dir): void {
    if (!this.started || this.dead) return;
    const last = this.queue[this.queue.length - 1] ?? this.dir;
    if ((d.x === -last.x && d.y === -last.y) || (d.x === last.x && d.y === last.y)) return;
    if (this.queue.length < 3) { this.queue.push(d); this.sfx('turn', { volume: 0.25 }); }
  }

  private occupied(x: number, y: number): boolean {
    return this.snake.some((s) => s.x === x && s.y === y) || this.rocks.some((r) => r.x === x && r.y === y)
      || (this.foodCell.x === x && this.foodCell.y === y && this.food.visible) || (this.bonus !== null && this.bonusCell.x === x && this.bonusCell.y === y);
  }

  private freeCell(margin = 0): { x: number; y: number } {
    const h = this.snake[0];
    for (let i = 0; i < 500; i++) {
      const x = rng.int(margin, COLS - 1 - margin), y = rng.int(margin, ROWS - 1 - margin);
      if (!this.occupied(x, y) && Math.abs(x - h.x) + Math.abs(y - h.y) > 3) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  private placeFood(): void {
    this.food.setVisible(false);
    this.foodCell = this.freeCell();
    const p = this.cellPos(this.foodCell);
    this.food.setFrame(rng.pick(FOODS)).setPosition(p.x, p.y).setVisible(true).setScale(0);
    this.tweens.add({ targets: this.food, scale: (CELL / 16) * 1.15, duration: 300, ease: 'Back.easeOut' });
  }

  private placeBonus(): void {
    this.bonusCell = this.freeCell(1);
    const p = this.cellPos(this.bonusCell);
    this.bonus = this.add.image(p.x, p.y, 'onebit', BONUS_FRAME).setDepth(2).setScale(0);
    this.tweens.add({ targets: this.bonus, scale: (CELL / 16) * 1.05, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.bonus, angle: { from: -12, to: 12 }, duration: 300, yoyo: true, repeat: -1 });
    this.bonusT = 7;
    this.sfx('spawn');
  }

  private clearBonus(): void {
    if (!this.bonus) return;
    const b = this.bonus;
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, scale: 0, duration: 200, onComplete: () => b.destroy() });
    this.bonus = null;
    this.bonusBar.clear();
  }

  private addRocks(n: number): void {
    for (let i = 0; i < n; i++) {
      let c = this.freeCell(1);
      // never drop a rock right in front of the head
      const h = this.snake[0];
      for (let k = 0; k < 20 && this.inFront(h, c); k++) c = this.freeCell(1);
      this.rocks.push(c);
      const p = this.cellPos(c);
      burst(this, p.x, p.y, [0x8a8a8a, 0xc9b28a], 10, 160);
    }
    this.drawRocks();
  }

  private inFront(h: { x: number; y: number }, c: { x: number; y: number }): boolean {
    for (let i = 1; i <= 6; i++) if (h.x + this.dir.x * i === c.x && h.y + this.dir.y * i === c.y) return true;
    return false;
  }

  private drawRocks(): void {
    const g = this.rockGfx.clear();
    for (const r of this.rocks) {
      const x = OX + r.x * CELL, y = OY + r.y * CELL;
      g.fillStyle(0x5a4636).fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
      g.fillStyle(0x8c6e52).fillRect(x + 2, y + 2, CELL - 4, 8).fillRect(x + 2, y + 18, 16, 6).fillRect(x + 22, y + 18, 16, 6);
      g.lineStyle(2, 0x2a1f17).strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    }
  }

  private drawSnake(): void {
    const g = this.gfx.clear();
    const n = this.snake.length;
    this.snake.forEach((s, i) => {
      const x = OX + s.x * CELL, y = OY + s.y * CELL;
      const k = i / Math.max(1, n - 1);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x9dff6a), Phaser.Display.Color.ValueToColor(0x1f7a2e), 100, Math.round(k * 100));
      const inset = i === 0 ? 1 : 3 + Math.round(k * 4);
      g.fillStyle(0x000000, 0.35).fillRoundedRect(x + inset + 3, y + inset + 4, CELL - inset * 2, CELL - inset * 2, 10);
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b)).fillRoundedRect(x + inset, y + inset, CELL - inset * 2, CELL - inset * 2, i === 0 ? 12 : 9);
    });
    // eyes
    const h = this.snake[0], d = this.queue[0] ?? this.dir;
    const cx = OX + h.x * CELL + CELL / 2, cy = OY + h.y * CELL + CELL / 2;
    const px = -d.y, py = d.x;
    for (const s of [-1, 1]) {
      const ex = cx + d.x * 7 + px * 9 * s, ey = cy + d.y * 7 + py * 9 * s;
      g.fillStyle(0xffffff).fillCircle(ex, ey, 6);
      g.fillStyle(0x000000).fillCircle(ex + d.x * 2, ey + d.y * 2, 3);
    }
  }

  private step(): void {
    if (this.queue.length) this.dir = this.queue.shift()!;
    const h = this.snake[0];
    let nx = h.x + this.dir.x, ny = h.y + this.dir.y;
    if (this.mode === 'classic') { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { this.die(); return; }
    // the tail moves away this step unless we are growing
    const body = this.grow > 0 ? this.snake : this.snake.slice(0, -1);
    if (body.some((s) => s.x === nx && s.y === ny) || this.rocks.some((r) => r.x === nx && r.y === ny)) { this.die(); return; }
    this.snake.unshift({ x: nx, y: ny });
    if (this.grow > 0) this.grow--; else this.snake.pop();

    const mult = this.mode === 'walls' ? 2 : 1;
    if (nx === this.foodCell.x && ny === this.foodCell.y) {
      const p = this.cellPos(this.foodCell);
      this.grow += 2;
      this.eaten++;
      this.addScore(10 * this.level * mult, p.x, p.y - 20);
      this.sfx('eat', { volume: 0.45, detune: (this.eaten % 6) * 100 });
      burst(this, p.x, p.y, [0xec3013, 0xffd23f, 0x9dff6a], 14, 220);
      this.placeFood();
      if (this.eaten % 5 === 0 && !this.bonus) this.placeBonus();
      if (this.eaten % 6 === 0) this.levelUp();
    } else if (this.bonus && nx === this.bonusCell.x && ny === this.bonusCell.y) {
      const p = this.cellPos(this.bonusCell);
      const pts = Math.round((40 + this.bonusT * 15) * this.level * mult);
      this.addScore(pts, p.x, p.y - 20);
      popup(this, p.x, p.y - 70, t('bonus'), '#ff4fa3', 22);
      this.grow += 3;
      this.sfx('bonus', { volume: 0.5 });
      flash(this, 0xffd23f, 100);
      burst(this, p.x, p.y, [0xffd23f, 0xffffff], 30, 320);
      this.clearBonus();
    }
    this.drawSnake();
  }

  private levelUp(): void {
    this.level++;
    this.interval = Math.max(0.06, 0.16 - (this.level - 1) * 0.012);
    this.updateHud();
    this.sfx('level', { volume: 0.45 });
    popup(this, 360, 640, t('faster'), '#3ee6ff', 30);
    if (this.level >= 3) this.addRocks(this.level >= 6 ? 3 : 2);
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.sfx('die', { volume: 0.55 });
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    this.clearBonus();
    const segs = [...this.snake];
    segs.forEach((s, i) => this.time.delayedCall(i * 30, () => {
      const p = this.cellPos(s);
      burst(this, p.x, p.y, [0x9dff6a, 0x1f7a2e], 6, 200);
      this.snake = this.snake.filter((q) => q !== s);
      this.drawSnakeSafe();
    }));
    this.endGame({ delay: Math.min(1800, 500 + segs.length * 30) });
  }

  private drawSnakeSafe(): void {
    if (this.snake.length) this.drawSnake(); else this.gfx.clear();
  }

  updateGame(_time: number, delta: number): void {
    if (!this.started || this.dead) return;
    const dt = delta / 1000;
    this.stepT += dt;
    while (this.stepT >= this.interval && !this.dead) { this.stepT -= this.interval; this.step(); }
    if (this.bonus) {
      this.bonusT -= dt;
      const g = this.bonusBar.clear();
      const w = 36 * Math.max(0, this.bonusT / 7);
      g.fillStyle(0x000000, 0.6).fillRect(this.bonus.x - 19, this.bonus.y - 30, 38, 7);
      g.fillStyle(this.bonusT < 2 ? 0xec3013 : 0xffd23f).fillRect(this.bonus.x - 18, this.bonus.y - 29, w, 5);
      this.bonus.setAlpha(this.bonusT < 2 ? (Math.floor(this.bonusT * 8) % 2 ? 0.4 : 1) : 1);
      if (this.bonusT <= 0) this.clearBonus();
    }
  }
}
