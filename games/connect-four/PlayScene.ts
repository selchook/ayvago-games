import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, txt, t, rng, net } from '@core';
import { Brain, COLS, ROWS, winLine } from './ai';

const CELL = 96;
const BX = (720 - COLS * CELL) / 2;   // board left
const BY = 360;                        // board top
const CHIP = 84;
const AI_TINT = 0xffd23f;
// [search depth, random-move chance] per difficulty level
const LEVELS: Array<[number, number]> = [[1, 0.45], [2, 0.25], [3, 0.12], [4, 0.05], [5, 0], [6, 0], [9, 0]];

type State = 'player' | 'ai' | 'busy';
/** Online move message: column + move number (guards against stale messages after a rematch). */
interface DropMsg { c: number; n: number }

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
  // online two-player state (net.active): host = red (1), guest = yellow (2); net.starter moves first
  private online = false;
  private mine = 1;
  private moveNo = 0;
  private inbox: DropMsg[] = [];

  createGame(): void {
    const { width } = this.scale;
    this.cells = new Array(COLS * ROWS).fill(0);
    this.chips = new Array(COLS * ROWS).fill(null);
    this.state = 'busy'; this.hoverCol = 3;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.playerMoves = 0;
    this.online = net.active;
    this.mine = this.online && net.seat === 1 ? 2 : 1;
    this.moveNo = 0; this.inbox = [];
    this.useHud = !this.online;

    this.cameras.main.setBackgroundColor('#101a3a');
    this.makeBoardTexture();
    // backdrop panel + column highlight sit behind the chips; the holed board sits in front
    this.add.rectangle(width / 2, BY + ROWS * CELL / 2, COLS * CELL + 24, ROWS * CELL + 24, 0x0a1230).setDepth(0);
    this.colGlow = this.add.rectangle(0, BY + ROWS * CELL / 2, CELL - 8, ROWS * CELL, 0xffffff, 0.08).setDepth(1);
    this.add.image(width / 2, BY + ROWS * CELL / 2, 'c4-board').setDepth(20);
    this.add.rectangle(width / 2, BY + ROWS * CELL + 30, COLS * CELL + 36, 26, 0x1d3fa8).setStrokeStyle(4, 0x0b1f66).setDepth(21);

    this.hover = this.add.image(0, BY - 62, this.mine === 1 ? 'chip-p' : 'chip-ai').setDisplaySize(CHIP, CHIP).setDepth(25);
    if (this.mine === 2) this.hover.setTint(AI_TINT);
    this.tweens.add({ targets: this.hover, y: BY - 72, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.status = txt(this, width / 2, 150, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 205, '', { size: 30, color: '#3ee6ff' }).setDepth(30);
    this.banner = txt(this, width / 2, BY + ROWS * CELL / 2, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // legend
    const ly = BY + ROWS * CELL + 110;
    const peer = clip(net.peerName || t('opponent'), 9);
    const redName = !this.online ? t('you') : this.mine === 1 ? t('you') : peer;
    const yellowName = !this.online ? t('cpu') : this.mine === 2 ? t('you') : peer;
    const [x1, x2] = this.online ? [-250, 40] : [-200, 90];   // online names can be longer
    this.add.image(width / 2 + x1, ly, 'chip-p').setDisplaySize(56, 56);
    txt(this, width / 2 + x1 + (this.online ? 44 : 70), ly, redName, { title: true, size: 20 }).setOrigin(0, 0.5);
    this.add.image(width / 2 + x2, ly, 'chip-ai').setDisplaySize(56, 56).setTint(AI_TINT);
    txt(this, width / 2 + x2 + (this.online ? 44 : 70), ly, yellowName, { title: true, size: 20 }).setOrigin(0, 0.5);
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

    if (this.online) {
      net.onScene(this, 'drop', (d: DropMsg) => {
        if (!d || typeof d.c !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }

    this.updateHud();
    this.startRound();
  }

  /** Online: applies the opponent's queued move once it is their turn here too. */
  private takeRemote(): void {
    while (this.state === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo || d.c < 0 || d.c >= COLS || this.height(d.c) >= ROWS) continue;
      this.hoverCol = d.c;
      this.drop(d.c, 3 - this.mine);
    }
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
    if (this.online) {
      this.info.setText(t('vs', { name: net.peerName || t('opponent') }));
      return;
    }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('level')} ${this.level + 1}`);
    this.info.setText(`${t('rival', { name: t('d' + Math.min(this.level, LEVELS.length - 1)) })}   ${t('streak', { n: this.streak })}`);
  }

  private setTurn(s: State): void {
    this.state = s;
    const mine = s === 'player';
    this.hover.setVisible(mine);
    this.colGlow.setVisible(mine);
    if (this.online) {
      this.status.setText(mine ? t('netMine') : s === 'ai' ? t('netTheirs') : '');
      this.status.setColor(mine ? (this.mine === 1 ? '#ff5a4a' : '#ffd23f') : '#8890b8');
      if (mine) this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (s === 'ai') this.takeRemote();
      return;
    }
    this.status.setText(mine ? t('yourTurn') : s === 'ai' ? t('aiTurn') : '');
    this.status.setColor(mine ? '#ff5a4a' : '#ffd23f');
    if (s === 'ai') this.time.delayedCall(rng.int(350, 650), () => this.aiMove());
  }

  private startRound(): void {
    this.round++;
    this.playerMoves = 0;
    this.placeHover();
    if (this.online) this.setTurn(net.myTurnFirst ? 'player' : 'ai');   // the round's starter moves first
    else this.setTurn(this.round % 2 === 1 ? 'player' : 'ai');
  }

  private playerDrop(): void {
    if (this.state !== 'player' || this.isOver) return;
    if (this.height(this.hoverCol) >= ROWS) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.hover, x: this.hover.x + 10, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    this.playerMoves++;
    if (this.online) net.send('drop', { c: this.hoverCol, n: this.moveNo } satisfies DropMsg);
    this.drop(this.hoverCol, this.mine);
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
    this.moveNo++;
    this.state = 'busy';
    if (this.online && who === this.mine) this.status.setText(t('netTheirs')).setColor('#8890b8');
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
        if (this.online) {
          if (line) return this.finishOnline(who, line);
          if (this.cells.every((v) => v !== 0)) return this.finishOnline(0, null);
          return this.setTurn(who === this.mine ? 'ai' : 'player');
        }
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

  /** Online result: both screens run the same rules, so both reach the same verdict here. */
  private finishOnline(winner: number, line: number[] | null): void {
    this.state = 'busy';
    this.status.setText('');
    this.hover.setVisible(false); this.colGlow.setVisible(false);
    if (line) {
      for (const i of line) {
        const c = this.chips[i]!;
        c.setDepth(30);
        this.tweens.add({ targets: c, scale: c.scale * 1.18, duration: 220, yoyo: true, repeat: 3 });
        burst(this, c.x, c.y, winner === 1 ? [0xec3013, 0xffffff, 0xffd23f] : [AI_TINT, 0xffffff], 14, 260);
      }
      shake(this, 0.012, 300);
    }
    let msg: string, color: string, title: string;
    const win = winner === this.mine;
    if (winner === 0) {
      msg = t('roundDraw'); color = '#3ee6ff'; title = t('draw');
      this.setScore(25);
      this.sfx('draw');
    } else if (win) {
      msg = t('roundWin'); color = '#5dff7a'; title = t('youWin');
      this.setScore(100 + Math.max(0, 22 - this.playerMoves) * 10);
      this.sfx('win'); flash(this, 0x5dff7a, 150);
    } else {
      msg = t('roundLose'); color = '#ec3013'; title = t('youLose');
      this.sfx('lose'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
    }
    this.banner.setText(msg).setColor(color).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.endGame({ win, title, draw: winner === 0, delay: 1800 });
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

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
