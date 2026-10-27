import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, txt, t, rng } from '@core';
import { Brain, COLS, ROWS, winLine } from './ai';

const CELL = 96;
const BX = (720 - COLS * CELL) / 2;   // board left
const BY = 360;                        // board top
const CHIP = 84;
const AI_TINT = 0xffd23f;
// [search depth, random-move chance] per difficulty level
const LEVELS: Array<[number, number]> = [[1, 0.45], [2, 0.25], [3, 0.12], [4, 0.05], [5, 0], [6, 0], [9, 0]];

type State = 'player' | 'ai' | 'busy';

export class PlayScene extends ArcadeScene {
  private cells: number[] = [];
  private chips: Array<Phaser.GameObjects.Image | null> = [];
  private state: State = 'busy';
  private hoverCol = 3;
  private hover!: Phaser.GameObjects.Image;
  private colGlow!: Phaser.GameObjects.Rectangle;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private playerMoves = 0;

  createGame(): void {
    const { width } = this.scale;
    this.cells = new Array(COLS * ROWS).fill(0);
    this.chips = new Array(COLS * ROWS).fill(null);
    this.state = 'busy'; this.hoverCol = 3;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.playerMoves = 0;

    this.cameras.main.setBackgroundColor('#101a3a');
    this.makeBoardTexture();
    // backdrop panel + column highlight sit behind the chips; the holed board sits in front
    this.add.rectangle(width / 2, BY + ROWS * CELL / 2, COLS * CELL + 24, ROWS * CELL + 24, 0x0a1230).setDepth(0);
    this.colGlow = this.add.rectangle(0, BY + ROWS * CELL / 2, CELL - 8, ROWS * CELL, 0xffffff, 0.08).setDepth(1);
    this.add.image(width / 2, BY + ROWS * CELL / 2, 'c4-board').setDepth(20);
    this.add.rectangle(width / 2, BY + ROWS * CELL + 30, COLS * CELL + 36, 26, 0x1d3fa8).setStrokeStyle(4, 0x0b1f66).setDepth(21);

    this.hover = this.add.image(0, BY - 62, 'chip-p').setDisplaySize(CHIP, CHIP).setDepth(25);
    this.tweens.add({ targets: this.hover, y: BY - 72, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.status = txt(this, width / 2, 150, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 205, '', { size: 30, color: '#3ee6ff' }).setDepth(30);
    this.banner = txt(this, width / 2, BY + ROWS * CELL / 2, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // legend
    const ly = BY + ROWS * CELL + 110;
    this.add.image(width / 2 - 200, ly, 'chip-p').setDisplaySize(56, 56);
    txt(this, width / 2 - 130, ly, t('you'), { title: true, size: 20 }).setOrigin(0, 0.5);
    this.add.image(width / 2 + 90, ly, 'chip-ai').setDisplaySize(56, 56).setTint(AI_TINT);
    txt(this, width / 2 + 160, ly, t('cpu'), { title: true, size: 20 }).setOrigin(0, 0.5);
    txt(this, width / 2, ly + 90, t('keysHint'), { size: 24, color: '#8890b8' });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const c = this.colAt(p.x);
      if (c >= 0 && c !== this.hoverCol) { this.hoverCol = c; this.placeHover(); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 110) return;
      const c = this.colAt(p.x);
      if (c < 0) return;
      this.hoverCol = c; this.placeHover();
      this.playerDrop();
    });
    const kb = this.input.keyboard;
    const step = (d: number) => {
      this.hoverCol = Phaser.Math.Wrap(this.hoverCol + d, 0, COLS);
      this.placeHover();
      if (this.state === 'player') this.sfx('move', { volume: 0.4 });
    };
    kb?.on('keydown-LEFT', () => step(-1));
    kb?.on('keydown-A', () => step(-1));
    kb?.on('keydown-RIGHT', () => step(1));
    kb?.on('keydown-D', () => step(1));
    for (const k of ['SPACE', 'ENTER', 'DOWN', 'S', 'Z']) kb?.on(`keydown-${k}`, () => this.playerDrop());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'].forEach((k, i) => kb?.on(`keydown-${k}`, () => {
      this.hoverCol = i; this.placeHover(); this.playerDrop();
    }));

    this.updateHud();
    this.startRound();
  }

  private makeBoardTexture(): void {
    if (this.textures.exists('c4-board')) return;
    const pad = 12, w = COLS * CELL + pad * 2, h = ROWS * CELL + pad * 2;
    const tex = this.textures.createCanvas('c4-board', w, h)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#2456d6';
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 26); ctx.fill();
    ctx.fillStyle = '#3b6cf0';
    ctx.fillRect(10, 8, w - 20, 6);
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
      const x = pad + c * CELL + CELL / 2, y = pad + r * CELL + CELL / 2;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x, y, CHIP / 2 - 1, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#0b2b8a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, CHIP / 2 + 1, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.lineWidth = 6; ctx.strokeStyle = '#0b1f66';
    ctx.beginPath(); ctx.roundRect(3, 3, w - 6, h - 6, 24); ctx.stroke();
    tex.refresh();
  }

  private colAt(x: number): number {
    const c = Math.floor((x - BX) / CELL);
    return c >= 0 && c < COLS ? c : -1;
  }

  private cellX(c: number): number { return BX + c * CELL + CELL / 2; }
  private cellY(r: number): number { return BY + (ROWS - 1 - r) * CELL + CELL / 2; }
  private height(c: number): number {
    let h = 0;
    while (h < ROWS && this.cells[c * ROWS + h]) h++;
    return h;
  }

  private placeHover(): void {
    this.hover.x = this.cellX(this.hoverCol);
    this.colGlow.x = this.hover.x;
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('level')} ${this.level + 1}`);
    this.info.setText(`${t('rival', { name: t('d' + Math.min(this.level, LEVELS.length - 1)) })}   ${t('streak', { n: this.streak })}`);
  }

  private setTurn(s: State): void {
    this.state = s;
    const mine = s === 'player';
    this.hover.setVisible(mine);
    this.colGlow.setVisible(mine);
    this.status.setText(mine ? t('yourTurn') : s === 'ai' ? t('aiTurn') : '');
    this.status.setColor(mine ? '#ff5a4a' : '#ffd23f');
    if (s === 'ai') this.time.delayedCall(rng.int(350, 650), () => this.aiMove());
  }

  private startRound(): void {
    this.round++;
    this.playerMoves = 0;
    this.placeHover();
    this.setTurn(this.round % 2 === 1 ? 'player' : 'ai');
  }

  private playerDrop(): void {
    if (this.state !== 'player' || this.isOver) return;
    if (this.height(this.hoverCol) >= ROWS) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.hover, x: this.hover.x + 10, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    this.playerMoves++;
    this.drop(this.hoverCol, 1);
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    const [depth, rnd] = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    const col = new Brain(this.cells).choose(2, depth, rnd, 90);
    if (col < 0) return this.finishRound(0, null);
    this.hoverCol = col;
    this.drop(col, 2);
  }

  private drop(col: number, who: number): void {
    const r = this.height(col);
    const idx = col * ROWS + r;
    this.cells[idx] = who;
    this.state = 'busy';
    this.hover.setVisible(false); this.colGlow.setVisible(false);
    const chip = this.add.image(this.cellX(col), BY - 62, who === 1 ? 'chip-p' : 'chip-ai').setDisplaySize(CHIP, CHIP).setDepth(10);
    if (who === 2) chip.setTint(AI_TINT);
    this.chips[idx] = chip;
    const ty = this.cellY(r);
    this.tweens.add({
      targets: chip, y: ty, duration: 180 + (ROWS - r) * 55, ease: 'Bounce.easeOut',
      onComplete: () => {
        this.sfx(rng.chance(0.5) ? 'drop1' : 'drop2', { volume: 0.7 });
        burst(this, chip.x, ty + CHIP / 2 - 6, who === 1 ? 0xec3013 : AI_TINT, 6, 120);
        if (this.isOver) return;
        const line = winLine(this.cells, idx);
        if (line) return this.finishRound(who, line);
        if (this.cells.every((v) => v !== 0)) return this.finishRound(0, null);
        this.setTurn(who === 1 ? 'ai' : 'player');
      },
    });
  }

  private finishRound(winner: number, line: number[] | null): void {
    this.state = 'busy';
    this.status.setText('');
    if (line) {
      for (const i of line) {
        const c = this.chips[i]!;
        c.setDepth(30);
        this.tweens.add({ targets: c, scale: c.scale * 1.18, duration: 220, yoyo: true, repeat: 3 });
        burst(this, c.x, c.y, winner === 1 ? [0xec3013, 0xffffff, 0xffd23f] : [AI_TINT, 0xffffff], 14, 260);
      }
      shake(this, 0.012, 300);
    }
    let msg: string, color: string;
    if (winner === 1) {
      this.streak++;
      const bonus = Math.max(0, 22 - this.playerMoves) * 10;
      this.addScore(100 * (this.level + 1) + bonus + this.streak * 25, this.scale.width / 2, BY - 20);
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
      msg = t('roundWin'); color = '#5dff7a';
      this.sfx('win'); flash(this, 0x5dff7a, 150);
    } else if (winner === 2) {
      this.lives--; this.streak = 0;
      msg = t('roundLose'); color = '#ec3013';
      this.sfx('lose'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
    } else {
      this.addScore(25, this.scale.width / 2, BY - 20);
      msg = t('roundDraw'); color = '#3ee6ff';
      this.sfx('draw');
    }
    this.updateHud();
    this.banner.setText(msg).setColor(color).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
    if (this.lives <= 0) {
      this.endGame({ delay: 1600 });
      return;
    }
    this.time.delayedCall(1800, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.6 });
    this.chips.forEach((c, i) => {
      if (!c) return;
      this.tweens.add({
        targets: c, y: 1400 + rng.int(0, 200), angle: rng.int(-90, 90), delay: (i % ROWS) * 30 + rng.int(0, 80),
        duration: 550, ease: 'Quad.easeIn', onComplete: () => c.destroy(),
      });
    });
    this.cells.fill(0);
    this.chips.fill(null);
    this.time.delayedCall(800, () => { if (!this.isOver) this.startRound(); });
  }

  updateGame(): void {
    /* turn-based: everything runs from input events and tweens */
  }
}
