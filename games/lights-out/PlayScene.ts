import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, rng, COLORS } from '@core';

const AREA = 600;          // board square size
const BOARD_Y = 640;       // board centre y
const TEX = 120;

/** Procedural bulb textures (on / off), created once per game. */
export function makeLightTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('lo-on')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // lit: glowing amber tile
  g.fillStyle(0x7a4a00, 1).fillRoundedRect(4, 8, TEX - 8, TEX - 8, 22);
  g.fillStyle(0xffb000, 1).fillRoundedRect(4, 4, TEX - 8, TEX - 12, 22);
  g.fillStyle(0xffd23f, 1).fillRoundedRect(12, 10, TEX - 24, TEX - 28, 18);
  g.fillStyle(0xfff3b0, 1).fillCircle(TEX / 2, TEX / 2 - 4, 26);
  g.fillStyle(0xffffff, 0.9).fillCircle(TEX / 2 - 8, TEX / 2 - 12, 9);
  g.generateTexture('lo-on', TEX, TEX);
  g.clear();
  // unlit: dark glass tile
  g.fillStyle(0x05060f, 1).fillRoundedRect(4, 8, TEX - 8, TEX - 8, 22);
  g.fillStyle(0x23264a, 1).fillRoundedRect(4, 4, TEX - 8, TEX - 12, 22);
  g.fillStyle(0x161833, 1).fillRoundedRect(12, 10, TEX - 24, TEX - 28, 18);
  g.fillStyle(0x2c2f5a, 1).fillCircle(TEX / 2, TEX / 2 - 4, 26);
  g.fillStyle(0x4a4f8a, 0.6).fillCircle(TEX / 2 - 8, TEX / 2 - 12, 7);
  g.generateTexture('lo-off', TEX, TEX);
  g.clear();
  // soft glow
  for (let i = 10; i > 0; i--) g.fillStyle(0xffd23f, 0.035).fillCircle(80, 80, 8 * i);
  g.generateTexture('lo-glow', 160, 160);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private n = 3;
  private on: boolean[] = [];
  private need: boolean[] = [];   // cells that still have to be pressed (solution parity)
  private cells: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private level = 1;
  private lives = 3;
  private moves = 0;
  private maxMoves = 0;
  private par = 0;
  private cursor = 0;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private hintRing!: Phaser.GameObjects.Arc;
  private parText!: Phaser.GameObjects.Text;
  private movesText!: Phaser.GameObjects.Text;
  private locked = false;
  private size = 100;
  private x0 = 0;
  private y0 = 0;
  private hintsUsed = 0;
  private showCursor = false;

  createGame(): void {
    makeLightTextures(this);
    this.level = 1; this.lives = 3; this.locked = false; this.cells = []; this.glows = []; this.cursor = 0; this.showCursor = false;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(360 - AREA / 2 - 24, BOARD_Y - AREA / 2 - 24, AREA + 48, AREA + 48, 26);
    g.lineStyle(6, 0x3ee6ff, 0.8).strokeRoundedRect(360 - AREA / 2 - 24, BOARD_Y - AREA / 2 - 24, AREA + 48, AREA + 48, 26);
    this.cursorBox = this.add.rectangle(0, 0, 10, 10).setStrokeStyle(6, 0xff4fa3).setDepth(6).setVisible(false);
    this.hintRing = this.add.circle(0, 0, 10).setStrokeStyle(8, 0x5dff7a).setDepth(7).setVisible(false);
    this.tweens.add({ targets: this.hintRing, scale: 1.15, duration: 380, yoyo: true, repeat: -1 });
    this.parText = txt(this, 360, 1000, '', { title: true, size: 20, color: '#3ee6ff' });
    this.movesText = txt(this, 360, 262, '', { title: true, size: 30, color: '#ffd23f' });

    new Button(this, 360, 1110, t('hint'), () => this.hint(), { width: 300, height: 90, size: 28, color: COLORS.purple });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const c = Math.floor((p.x - this.x0) / this.size), r = Math.floor((p.y - this.y0) / this.size);
      if (c < 0 || r < 0 || c >= this.n || r >= this.n) return;
      this.showCursor = false;
      this.cursorBox.setVisible(false);
      this.press(r * this.n + c);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.buildLevel();
  }

  updateGame(): void { /* event driven */ }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver || this.locked) return;
    const n = this.n;
    let r = Math.floor(this.cursor / n), c = this.cursor % n;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') c = (c + n - 1) % n;
    else if (k === 'ArrowRight' || k === 'KeyD') c = (c + 1) % n;
    else if (k === 'ArrowUp' || k === 'KeyW') r = (r + n - 1) % n;
    else if (k === 'ArrowDown' || k === 'KeyS') r = (r + 1) % n;
    else if (k === 'Space' || k === 'KeyZ' || k === 'Enter') { this.showCursor = true; this.moveCursor(); this.press(this.cursor); return; }
    else if (k === 'KeyX' || k === 'KeyH') { this.hint(); return; }
    else return;
    this.cursor = r * n + c;
    this.showCursor = true;
    this.moveCursor();
    this.sfx('move', { volume: 0.3 });
  }

  private moveCursor(): void {
    const r = Math.floor(this.cursor / this.n), c = this.cursor % this.n;
    this.cursorBox.setSize(this.size - 4, this.size - 4).setOrigin(0.5).setPosition(this.x0 + c * this.size + this.size / 2, this.y0 + r * this.size + this.size / 2);
    this.cursorBox.setVisible(this.showCursor);
  }

  private buildLevel(): void {
    this.cells.forEach((c) => c.destroy());
    this.glows.forEach((c) => c.destroy());
    this.cells = []; this.glows = [];
    this.locked = false;
    this.hintsUsed = 0;
    this.hintRing.setVisible(false);
    const L = this.level;
    this.n = L <= 2 ? 3 : L <= 4 ? 4 : L <= 8 ? 5 : 6;
    const n = this.n;
    this.size = Math.floor(AREA / n);
    this.x0 = 360 - (this.size * n) / 2;
    this.y0 = BOARD_Y - (this.size * n) / 2;
    this.on = new Array(n * n).fill(false);
    this.need = new Array(n * n).fill(false);
    // scramble from the solved state: guaranteed solvable, `need` holds the solution
    const k = Math.min(n * n - 2, 2 + Math.ceil(L * 0.9));
    const picks = rng.shuffle([...Array(n * n).keys()]).slice(0, k);
    for (const i of picks) { this.need[i] = true; this.toggleCross(i, this.on); }
    if (this.on.every((v) => !v)) { this.toggleCross(picks[0], this.on); this.need[picks[0]] = !this.need[picks[0]]; }
    this.par = this.need.filter(Boolean).length;
    this.maxMoves = this.par * 2 + 2;
    this.moves = 0;
    this.cursor = Math.floor((n * n) / 2);
    for (let i = 0; i < n * n; i++) {
      const x = this.x0 + (i % n) * this.size + this.size / 2, y = this.y0 + Math.floor(i / n) * this.size + this.size / 2;
      const glow = this.add.image(x, y, 'lo-glow').setDisplaySize(this.size * 1.5, this.size * 1.5).setAlpha(this.on[i] ? 0.9 : 0).setDepth(1);
      const img = this.add.image(x, y, this.on[i] ? 'lo-on' : 'lo-off').setDepth(2);
      const s = (this.size - 8) / TEX;
      img.setScale(0);
      this.tweens.add({ targets: img, scale: s, duration: 300, delay: (i % n + Math.floor(i / n)) * 40, ease: 'Back.easeOut' });
      this.cells.push(img);
      this.glows.push(glow);
    }
    this.hintRing.setRadius(this.size * 0.42);
    this.moveCursor();
    this.parText.setText(`${t('par')}: ${this.par}`);
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setCenter(`${t('level')} ${this.level}`);
    const left = this.maxMoves - this.moves;
    this.movesText.setText(`${t('moves')}: ${left}`).setColor(left <= 2 ? '#ec3013' : '#ffd23f');
    this.parText.setText(`${t('par')}: ${this.par}   ${t('lives')}: ${Math.max(0, this.lives)}`);
  }

  private toggleCross(i: number, arr: boolean[]): number[] {
    const n = this.n, r = Math.floor(i / n), c = i % n;
    const list = [i];
    if (r > 0) list.push(i - n);
    if (r < n - 1) list.push(i + n);
    if (c > 0) list.push(i - 1);
    if (c < n - 1) list.push(i + 1);
    for (const j of list) arr[j] = !arr[j];
    return list;
  }

  private press(i: number): void {
    if (this.isOver || this.locked) return;
    this.moves++;
    this.need[i] = !this.need[i];
    this.hintRing.setVisible(false);
    const list = this.toggleCross(i, this.on);
    const s = (this.size - 8) / TEX;
    list.forEach((j, k) => {
      const img = this.cells[j];
      this.time.delayedCall(k === 0 ? 0 : 50, () => {
        img.setTexture(this.on[j] ? 'lo-on' : 'lo-off');
        this.tweens.killTweensOf(img);
        img.setScale(s * (k === 0 ? 0.8 : 0.9));
        this.tweens.add({ targets: img, scale: s, duration: 220, ease: 'Back.easeOut' });
        this.tweens.add({ targets: this.glows[j], alpha: this.on[j] ? 0.9 : 0, duration: 160 });
        if (!this.on[j]) burst(this, img.x, img.y, [0xffd23f, 0xfff3b0], 5, 120);
      });
    });
    this.sfx('toggle', { volume: 0.45, detune: rng.int(-100, 100) });
    this.updateHud();

    if (this.on.every((v) => !v)) this.solved();
    else if (this.moves >= this.maxMoves) this.outOfMoves();
  }

  private hint(): void {
    if (this.isOver || this.locked) return;
    const opts = this.need.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!opts.length) return;
    const i = this.need[this.cursor] ? this.cursor : rng.pick(opts);
    const img = this.cells[i];
    this.hintRing.setPosition(img.x, img.y).setVisible(true);
    this.hintsUsed++;
    this.addScore(-25, img.x, img.y - 40);
    this.sfx('hint', { volume: 0.5 });
  }

  private solved(): void {
    this.locked = true;
    const perfect = this.moves <= this.par;
    const pts = 100 * this.level + Math.max(0, this.maxMoves - this.moves) * 20 + (perfect ? 250 : 0);
    this.time.delayedCall(250, () => {
      this.sfx('solved', { volume: 0.6 });
      flash(this, 0x3ee6ff, 150);
      this.addScore(pts, 360, BOARD_Y);
      if (perfect && this.hintsUsed === 0) popup(this, 360, BOARD_Y - 90, t('perfect'), '#5dff7a', 30);
      const msg = txt(this, 360, BOARD_Y - AREA / 2 - 160, t('solved'), { title: true, size: 34, color: '#ffd23f' }).setDepth(30).setScale(0);
      this.tweens.add({ targets: msg, scale: 1, duration: 350, ease: 'Back.easeOut' });
      this.cells.forEach((c, k) => this.tweens.add({ targets: c, angle: 360, duration: 500, delay: k * 15 }));
      this.time.delayedCall(1500, () => {
        msg.destroy();
        if (this.isOver) return;
        this.level++;
        this.buildLevel();
      });
    });
  }

  private outOfMoves(): void {
    this.locked = true;
    this.lives--;
    this.sfx('fail', { volume: 0.6 });
    shake(this, 0.015, 280);
    flash(this, 0xec3013, 150);
    this.updateHud();
    const msg = txt(this, 360, BOARD_Y - AREA / 2 - 160, t('outOfMoves'), { title: true, size: 30, color: '#ec3013' }).setDepth(30);
    if (this.lives <= 0) { this.endGame({ delay: 1200 }); return; }
    this.time.delayedCall(1400, () => {
      msg.destroy();
      if (!this.isOver) this.buildLevel();
    });
  }
}
