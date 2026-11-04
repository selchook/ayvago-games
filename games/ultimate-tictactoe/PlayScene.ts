import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import { State, newState, play, legal, isLegal, winLine, Mcts, LEVELS, tactical } from './rules';

// Board layout (720 x 1280 world)
const BX = 15, BY = 280;          // top-left of the big board
const SB = 222, GAP = 12;         // small board size and the gap between small boards
const CELL = SB / 3;              // 74 px cells
const MARK = 54;
const X_COL = 0xff4fa3, O_COL = 0x3ee6ff;

type Turn = 'player' | 'ai' | 'busy';
interface MoveMsg { i: number; n: number }

export function makeMarkTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('ut-x')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // X: two thick strokes with a dark outline
  g.lineStyle(26, 0x000000, 0.5).lineBetween(22, 22, 106, 106).lineBetween(106, 22, 22, 106);
  g.lineStyle(18, X_COL, 1).lineBetween(22, 22, 106, 106).lineBetween(106, 22, 22, 106);
  g.lineStyle(6, 0xffffff, 0.45).lineBetween(26, 24, 60, 58).lineBetween(100, 26, 82, 44);
  g.generateTexture('ut-x', 128, 128);
  g.clear();
  g.lineStyle(26, 0x000000, 0.5).strokeCircle(64, 64, 42);
  g.lineStyle(18, O_COL, 1).strokeCircle(64, 64, 42);
  g.lineStyle(6, 0xffffff, 0.45).beginPath().arc(64, 64, 44, Math.PI * 1.05, Math.PI * 1.45).strokePath();
  g.generateTexture('ut-o', 128, 128);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private st: State = newState();
  private marks: Array<Phaser.GameObjects.Image | null> = [];
  private bigMarks: Phaser.GameObjects.GameObject[] = [];
  private highlights: Phaser.GameObjects.Rectangle[] = [];
  private turn: Turn = 'busy';
  private cur = 40;
  private cursor!: Phaser.GameObjects.Rectangle;
  private ghost!: Phaser.GameObjects.Image;
  private lastMark!: Phaser.GameObjects.Rectangle;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private nameX!: Phaser.GameObjects.Text;
  private nameO!: Phaser.GameObjects.Text;
  private countX!: Phaser.GameObjects.Text;
  private countO!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private myMoves = 0;
  private mine: 1 | 2 = 1;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];
  private mcts: Mcts | null = null;
  private aiAt = 0;
  private dots = 0;

  createGame(): void {
    const { width } = this.scale;
    this.st = newState();
    this.marks = new Array(81).fill(null);
    this.bigMarks = []; this.highlights = [];
    this.turn = 'busy'; this.cur = 40;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.myMoves = 0;
    this.online = net.active; this.mine = 1; this.moveNo = 0; this.inbox = [];
    this.mcts = null; this.aiAt = 0; this.dots = 0;
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#12102a');
    makeMarkTextures(this);

    // big board
    const g = this.add.graphics();
    const W = SB * 3 + GAP * 2;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BX - 8, BY - 4, W + 16, W + 16, 18);
    g.fillStyle(0x221d44).fillRoundedRect(BX - 10, BY - 10, W + 20, W + 20, 18);
    g.lineStyle(4, 0x8b5cff, 0.9).strokeRoundedRect(BX - 10, BY - 10, W + 20, W + 20, 18);
    for (let b = 0; b < 9; b++) {
      const x0 = this.boardX(b), y0 = this.boardY(b);
      const hl = this.add.rectangle(x0 + SB / 2, y0 + SB / 2, SB + 10, SB + 10, 0xffd23f, 0.16)
        .setStrokeStyle(5, 0xffd23f, 0.95).setVisible(false).setDepth(1);
      this.highlights.push(hl);
      g.fillStyle(0x2e2860).fillRoundedRect(x0, y0, SB, SB, 10);
      g.lineStyle(3, 0x6c64b8, 0.85);
      for (let k = 1; k < 3; k++) {
        g.lineBetween(x0 + k * CELL, y0 + 10, x0 + k * CELL, y0 + SB - 10);
        g.lineBetween(x0 + 10, y0 + k * CELL, x0 + SB - 10, y0 + k * CELL);
      }
    }
    g.setDepth(0);
    this.tweens.add({ targets: this.highlights, alpha: 0.45, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.cursor = this.add.rectangle(0, 0, CELL - 8, CELL - 8).setStrokeStyle(4, 0xffd23f).setDepth(15).setVisible(false);
    this.ghost = this.add.image(0, 0, 'ut-x').setDisplaySize(MARK, MARK).setAlpha(0.35).setDepth(14).setVisible(false);
    this.lastMark = this.add.rectangle(0, 0, CELL - 14, CELL - 14).setStrokeStyle(3, 0xffffff, 0.7).setDepth(12).setVisible(false);

    this.status = txt(this, width / 2, 140, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 200, '', { size: 28, color: '#c9c3ff' }).setDepth(30);
    this.banner = txt(this, width / 2, 140, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // legend: who plays which mark, and small boards won
    const ly = BY + W + 85;
    this.add.rectangle(width / 2, ly, W, 100, 0x000000, 0.35).setStrokeStyle(3, 0x8b5cff);
    this.add.image(BX + 50, ly, 'ut-x').setDisplaySize(56, 56);
    this.nameX = txt(this, BX + 90, ly - 16, '', { title: true, size: 18 }).setOrigin(0, 0.5);
    this.countX = txt(this, BX + 90, ly + 20, '', { size: 24, color: '#ff9fd0' }).setOrigin(0, 0.5);
    this.add.image(BX + W - 50, ly, 'ut-o').setDisplaySize(56, 56);
    this.nameO = txt(this, BX + W - 90, ly - 16, '', { title: true, size: 18 }).setOrigin(1, 0.5);
    this.countO = txt(this, BX + W - 90, ly + 20, '', { size: 24, color: '#9ff3ff' }).setOrigin(1, 0.5);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, ly + 100, touch ? t('touchHint') : t('keysHint'), { size: 24, color: '#a9a3d8', wrap: 660 });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const m = this.cellAt(p.x, p.y);
      if (m >= 0 && m !== this.cur) { this.cur = m; this.placeCursor(); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const m = this.cellAt(p.x, p.y);
      if (m < 0) return;
      this.cur = m; this.placeCursor();
      this.playerMove();
    });
    const kb = this.input.keyboard;
    const mv = (dx: number, dy: number) => this.moveCursor(dx, dy);
    kb?.on('keydown-LEFT', () => mv(-1, 0)); kb?.on('keydown-A', () => mv(-1, 0));
    kb?.on('keydown-RIGHT', () => mv(1, 0)); kb?.on('keydown-D', () => mv(1, 0));
    kb?.on('keydown-UP', () => mv(0, -1)); kb?.on('keydown-W', () => mv(0, -1));
    kb?.on('keydown-DOWN', () => mv(0, 1)); kb?.on('keydown-S', () => mv(0, 1));
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.playerMove());

    if (this.online) {
      net.onScene(this, 'mv', (d: MoveMsg) => {
        if (!d || typeof d.i !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }
    this.startRound();
  }

  // ---------------------------------------------------------------- geometry
  private boardX(b: number): number { return BX + (b % 3) * (SB + GAP); }
  private boardY(b: number): number { return BY + Math.floor(b / 3) * (SB + GAP); }
  private cx(m: number): number { const b = (m / 9) | 0, c = m % 9; return this.boardX(b) + (c % 3) * CELL + CELL / 2; }
  private cy(m: number): number { const b = (m / 9) | 0, c = m % 9; return this.boardY(b) + Math.floor(c / 3) * CELL + CELL / 2; }
  /** Global 9x9 grid position of a cell. */
  private gxy(m: number): [number, number] { const b = (m / 9) | 0, c = m % 9; return [(b % 3) * 3 + (c % 3), Math.floor(b / 3) * 3 + Math.floor(c / 3)]; }
  private fromG(gx: number, gy: number): number { return (Math.floor(gy / 3) * 3 + Math.floor(gx / 3)) * 9 + (gy % 3) * 3 + (gx % 3); }

  private cellAt(px: number, py: number): number {
    const span = SB + GAP;
    const bxI = Math.floor((px - BX + GAP / 2) / span), byI = Math.floor((py - BY + GAP / 2) / span);
    if (bxI < 0 || byI < 0 || bxI > 2 || byI > 2) return -1;
    const b = byI * 3 + bxI;
    const lx = Phaser.Math.Clamp(Math.floor((px - this.boardX(b)) / CELL), 0, 2);
    const ly = Phaser.Math.Clamp(Math.floor((py - this.boardY(b)) / CELL), 0, 2);
    return b * 9 + ly * 3 + lx;
  }

  private moveCursor(dx: number, dy: number): void {
    let [gx, gy] = this.gxy(this.cur);
    if (this.st.next >= 0) {
      // confined to the small board that must be played
      const b = this.st.next, ox = (b % 3) * 3, oy = Math.floor(b / 3) * 3;
      if (gx < ox || gx > ox + 2 || gy < oy || gy > oy + 2) { gx = ox + 1; gy = oy + 1; }
      else { gx = ox + Phaser.Math.Wrap(gx - ox + dx, 0, 3); gy = oy + Phaser.Math.Wrap(gy - oy + dy, 0, 3); }
    } else {
      gx = Phaser.Math.Wrap(gx + dx, 0, 9); gy = Phaser.Math.Wrap(gy + dy, 0, 9);
    }
    this.cur = this.fromG(gx, gy);
    this.placeCursor();
    if (this.turn === 'player') this.sfx('move', { volume: 0.3 });
  }

  private placeCursor(): void {
    const x = this.cx(this.cur), y = this.cy(this.cur);
    const mine = this.turn === 'player';
    this.cursor.setPosition(x, y).setVisible(mine);
    this.cursor.setStrokeStyle(4, isLegal(this.st, this.cur) ? 0xffd23f : 0x6a6490);
    this.ghost.setPosition(x, y).setVisible(mine && isLegal(this.st, this.cur));
  }

  /** At the start of my turn, put the cursor inside the board I must play (keyboard players). */
  private snapCursor(): void {
    if (isLegal(this.st, this.cur)) return;
    const moves = legal(this.st);
    if (!moves.length) return;
    if (this.st.next >= 0) {
      const centre = this.st.next * 9 + 4;
      this.cur = moves.includes(centre) ? centre : moves[0];
    } else {
      this.cur = moves.reduce((a, m) => (Math.hypot(this.cx(m) - this.cx(this.cur), this.cy(m) - this.cy(this.cur)) < Math.hypot(this.cx(a) - this.cx(this.cur), this.cy(a) - this.cy(this.cur)) ? m : a), moves[0]);
    }
  }

  // ---------------------------------------------------------------- flow
  private updateHud(): void {
    const peer = clip(net.peerName || t('opponent'), 10);
    const other = this.online ? peer : t('cpu');
    this.nameX.setText(this.mine === 1 ? t('you') : other);
    this.nameO.setText(this.mine === 2 ? t('you') : other);
    let x = 0, o = 0;
    for (let b = 0; b < 9; b++) { if (this.st.macro[b] === 1) x++; if (this.st.macro[b] === 2) o++; }
    this.countX.setText(t('boards', { n: x }));
    this.countO.setText(t('boards', { n: o }));
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })} · ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.myMoves = 0;
    this.st = newState();
    this.mine = this.online ? (net.myTurnFirst ? 1 : 2) : (this.round % 2 === 1 ? 1 : 2);
    this.ghost.setTexture(this.mine === 1 ? 'ut-x' : 'ut-o');
    this.cur = 40;
    this.lastMark.setVisible(false);
    this.updateHud();
    this.showAllowed();
    this.time.delayedCall(300, () => this.setTurn(this.mine === 1 ? 'player' : 'ai'));
  }

  private showAllowed(): void {
    const going = !this.st.winner;
    const col = this.turn === 'player' ? 0xffd23f : this.turn === 'ai' ? (this.mine === 1 ? O_COL : X_COL) : 0xffd23f;
    for (let b = 0; b < 9; b++) {
      const allowed = going && !this.st.macro[b] && (this.st.next < 0 || this.st.next === b);
      this.highlights[b].setVisible(allowed && this.turn !== 'busy').setFillStyle(col, 0.16).setStrokeStyle(5, col, 0.95);
    }
  }

  private setTurn(s: Turn): void {
    if (this.isOver) return;
    this.turn = s;
    if (s === 'player') this.snapCursor();
    this.placeCursor();
    this.showAllowed();
    const anywhere = this.st.next < 0 && this.moveNo > 0;
    if (s === 'player') {
      this.status.setText(anywhere ? t('anywhere') : t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.moveNo > 0) this.sfx('turn', { volume: 0.4 });
      return;
    }
    if (s === 'ai') {
      this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#a9a3d8');
      if (this.online) this.takeRemote();
      else { this.mcts = new Mcts(this.cloneState()); this.aiAt = this.time.now; }
    }
  }

  private cloneState(): State {
    const s = this.st;
    return { cells: s.cells.slice(), macro: s.macro.slice(), next: s.next, turn: s.turn, winner: s.winner };
  }

  private takeRemote(): void {
    while (this.turn === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo || !isLegal(this.st, d.i)) continue;
      this.place(d.i);
    }
  }

  private playerMove(): void {
    if (this.turn !== 'player' || this.isOver) return;
    if (!isLegal(this.st, this.cur)) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.cursor, x: this.cursor.x + 6, duration: 45, yoyo: true, repeat: 2 });
      const b = (this.cur / 9) | 0;
      if (this.st.next >= 0 && b !== this.st.next) {
        const hl = this.highlights[this.st.next];
        this.tweens.add({ targets: hl, scale: 1.06, duration: 90, yoyo: true, repeat: 1 });
      }
      return;
    }
    this.myMoves++;
    if (this.online) net.send('mv', { i: this.cur, n: this.moveNo } satisfies MoveMsg);
    this.place(this.cur);
  }

  private aiChoose(): void {
    if (!this.mcts || this.isOver || this.turn !== 'ai') return;
    const lvl = LEVELS[Math.min(this.level, LEVELS.length - 1)];
    let m = tactical(this.st);
    if (m < 0) m = this.mcts.best();
    if (lvl.slip && rng.chance(lvl.slip)) m = rng.pick(legal(this.st));
    this.mcts = null;
    if (m < 0) return;
    this.place(m);
  }

  private place(m: number): void {
    const who = this.st.turn;
    this.turn = 'busy';
    this.showAllowed();
    this.cursor.setVisible(false); this.ghost.setVisible(false);
    const closed = play(this.st, m);
    this.moveNo++;
    const x = this.cx(m), y = this.cy(m);
    const img = this.add.image(x, y, who === 1 ? 'ut-x' : 'ut-o').setDisplaySize(MARK * 1.8, MARK * 1.8).setAlpha(0).setDepth(10);
    this.marks[m] = img;
    this.tweens.add({
      targets: img, displayWidth: MARK, displayHeight: MARK, alpha: 1, duration: 170, ease: 'Back.easeOut',
      onComplete: () => {
        this.sfxAt(who === 1 ? 'markX' : 'markO', x, { volume: 0.6 });
        burst(this, x, y, who === 1 ? [X_COL, 0xffffff] : [O_COL, 0xffffff], 6, 120);
        this.lastMark.setPosition(x, y).setVisible(true);
        if (closed) this.closeBoard((m / 9) | 0, closed);
        this.updateHud();
        if (this.st.winner) { this.time.delayedCall(closed ? 450 : 100, () => this.finish()); return; }
        this.time.delayedCall(closed ? 380 : 60, () => this.setTurn(who === this.mine ? 'ai' : 'player'));
      },
    });
  }

  /** A small board was won (1/2) or filled (3). */
  private closeBoard(b: number, how: number): void {
    const x = this.boardX(b) + SB / 2, y = this.boardY(b) + SB / 2;
    const dim = this.add.rectangle(x, y, SB, SB, 0x0b0a1a, 0.55).setDepth(16).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 250 });
    this.bigMarks.push(dim);
    for (let c = 0; c < 9; c++) this.marks[b * 9 + c]?.setAlpha(0.45);
    if (how === 3) { this.sfx('fill', { volume: 0.5 }); return; }
    const big = this.add.image(x, y, how === 1 ? 'ut-x' : 'ut-o').setDisplaySize(30, 30).setDepth(17).setAlpha(0);
    this.tweens.add({ targets: big, displayWidth: SB * 0.86, displayHeight: SB * 0.86, alpha: 1, angle: { from: -25, to: 0 }, duration: 380, ease: 'Back.easeOut' });
    this.bigMarks.push(big);
    burst(this, x, y, how === 1 ? [X_COL, 0xffd23f, 0xffffff] : [O_COL, 0xffd23f, 0xffffff], 26, 300);
    shake(this, 0.008, 180);
    const mineWon = how === this.mine;
    this.sfx(mineWon ? 'boardWin' : 'boardLose', { volume: 0.6 });
    if (!this.online && mineWon) this.addScore(10 * (this.level + 1), x, y - 40);
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private finish(): void {
    this.turn = 'busy';
    this.showAllowed();
    this.status.setText('');
    const winner = this.st.winner === 3 ? 0 : this.st.winner;
    const line = winLine(this.st);
    if (line) {
      const g = this.add.graphics().setDepth(20);
      const p = (b: number) => [this.boardX(b) + SB / 2, this.boardY(b) + SB / 2];
      const [x0, y0] = p(line[0]), [x1, y1] = p(line[2]);
      g.lineStyle(22, winner === this.mine ? 0x5dff7a : 0xec3013, 0.7).lineBetween(x0, y0, x1, y1);
      this.bigMarks.push(g);
      line.forEach((b, k) => this.time.delayedCall(k * 120, () => {
        const [x, y] = p(b);
        burst(this, x, y, [0xffd23f, 0xffffff], 18, 260);
        this.sfx('chime', { volume: 0.35, rate: 1 + k * 0.1 });
      }));
      shake(this, 0.012, 300);
    }
    const cx = this.scale.width / 2;
    if (this.online) {
      const win = winner === this.mine;
      if (!winner) { this.showBanner(t('roundDraw'), '#3ee6ff'); this.setScore(25); this.sfx('draw'); }
      else if (win) {
        this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
        this.setScore(100 + Math.max(0, 40 - this.myMoves) * 5);
        this.time.delayedCall(500, () => this.sfx('win'));
      } else { this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); this.time.delayedCall(500, () => this.sfx('lose')); }
      this.endGame({ win, title: !winner ? t('draw') : win ? t('youWin') : t('youLose'), draw: !winner, delay: 2200 });
      return;
    }
    if (winner === this.mine) {
      this.streak++;
      const pts = 100 * (this.level + 1) + Math.max(0, 40 - this.myMoves) * 5 + this.streak * 25;
      this.time.delayedCall(500, () => { this.addScore(pts, cx, BY - 40); this.sfx('win'); });
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      if (this.streak >= 2) popup(this, cx, BY + 120, t('streak', { n: this.streak }), '#ffd23f', 34);
    } else if (winner) {
      this.lives--; this.streak = 0;
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
      this.time.delayedCall(500, () => this.sfx('lose'));
    } else {
      this.addScore(30, cx, BY - 40);
      this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw');
    }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2200 }); return; }
    this.time.delayedCall(2400, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.5 });
    this.lastMark.setVisible(false);
    for (const o of this.bigMarks) {
      this.tweens.add({ targets: o, alpha: 0, duration: 250, onComplete: () => o.destroy() });
    }
    this.bigMarks = [];
    this.marks.forEach((s) => {
      if (!s) return;
      this.tweens.add({ targets: s, scale: 0, angle: 120, alpha: 0, duration: 260, delay: rng.int(0, 300), onComplete: () => s.destroy() });
    });
    this.marks.fill(null);
    this.time.delayedCall(700, () => { if (!this.isOver) this.startRound(); });
  }

  updateGame(time: number): void {
    if (this.mcts && this.turn === 'ai' && !this.online) {
      const lvl = LEVELS[Math.min(this.level, LEVELS.length - 1)];
      if (this.mcts.spent < lvl.ms) this.mcts.run(Math.min(10, lvl.ms - this.mcts.spent));
      else if (time - this.aiAt > 450) this.aiChoose();
      const d = Math.floor((time - this.aiAt) / 300) % 4;
      if (d !== this.dots) { this.dots = d; this.status.setText(t('aiTurn') + '.'.repeat(d)); }
    }
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
