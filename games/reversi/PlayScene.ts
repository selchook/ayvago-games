import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, txt, t, rng, net } from '@core';
import { Brain, N, flips, legalMoves, count } from './ai';

const CELL = 82;
const BX = (720 - N * CELL) / 2;
const BY = 290;
const DISC = 70;
// [search depth, random-move chance] per level
const LEVELS: Array<[number, number]> = [[1, 0.4], [2, 0.15], [3, 0], [4, 0], [5, 0], [7, 0]];

type State = 'player' | 'ai' | 'busy';
/** Online move message: square + move number (guards against stale messages after a rematch). */
interface MoveMsg { i: number; n: number }

export class PlayScene extends ArcadeScene {
  private board: number[] = [];
  private discs: Array<Phaser.GameObjects.Image | null> = [];
  private hints: Phaser.GameObjects.Arc[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private cur = 19;
  private state: State = 'busy';
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private countB!: Phaser.GameObjects.Text;
  private countW!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 2;
  private streak = 0;
  private round = 0;
  // online two-player state (net.active): the round's starter (net.starter) plays black (1),
  // which always moves first; the other player is white (2)
  private online = false;
  private mine = 1;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];

  createGame(): void {
    const { width } = this.scale;
    this.board = new Array(64).fill(0);
    this.discs = new Array(64).fill(null);
    this.hints = [];
    this.state = 'busy'; this.cur = 19;
    this.level = 0; this.lives = 2; this.streak = 0; this.round = 0;
    this.online = net.active;
    this.mine = this.online && !net.myTurnFirst ? 2 : 1;
    this.moveNo = 0; this.inbox = [];
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#0d2418');

    // wooden frame + felt + grid
    const g = this.add.graphics();
    const S = N * CELL;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(BX - 22, BY - 14, S + 44, S + 44, 18);
    g.fillStyle(0x7a4a22).fillRoundedRect(BX - 22, BY - 22, S + 44, S + 44, 18);
    g.lineStyle(4, 0x4a2a10).strokeRoundedRect(BX - 22, BY - 22, S + 44, S + 44, 18);
    g.fillStyle(0x1f8a4c).fillRect(BX, BY, S, S);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) g.fillStyle(0x1c8046).fillRect(BX + i * CELL, BY + j * CELL, CELL, CELL);
    g.lineStyle(3, 0x0f5a2e);
    for (let i = 0; i <= N; i++) {
      g.lineBetween(BX + i * CELL, BY, BX + i * CELL, BY + S);
      g.lineBetween(BX, BY + i * CELL, BX + S, BY + i * CELL);
    }
    g.fillStyle(0x0f5a2e);
    for (const [cx, cy] of [[2, 2], [6, 2], [2, 6], [6, 6]]) g.fillCircle(BX + cx * CELL, BY + cy * CELL, 6);

    this.cursor = this.add.rectangle(0, 0, CELL - 6, CELL - 6).setStrokeStyle(5, 0xffd23f).setDepth(15);
    this.tweens.add({ targets: this.cursor, alpha: 0.4, duration: 450, yoyo: true, repeat: -1 });

    this.status = txt(this, width / 2, 140, '', { title: true, size: 26, color: '#ffd23f' });
    this.info = txt(this, width / 2, 196, '', { size: 30, color: '#3ee6ff' });
    this.banner = txt(this, width / 2, BY + S / 2, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // disc counters
    const py = BY + S + 100;
    this.add.rectangle(width / 2, py, S, 110, 0x000000, 0.35).setStrokeStyle(3, 0x2f6a46);
    this.add.image(BX + 60, py, 'disc-b').setDisplaySize(64, 64);
    const peer = clip(net.peerName || t('opponent'), 10);
    const blackName = !this.online || this.mine === 1 ? t('you') : peer;
    const whiteName = !this.online ? t('cpu') : this.mine === 2 ? t('you') : peer;
    txt(this, BX + 110, py - 20, blackName, { title: true, size: 16, color: '#aaaaaa' }).setOrigin(0, 0.5);
    this.countB = txt(this, BX + 110, py + 18, '2', { title: true, size: 30 }).setOrigin(0, 0.5);
    this.add.image(BX + S - 60, py, 'disc-w').setDisplaySize(64, 64);
    txt(this, BX + S - 110, py - 20, whiteName, { title: true, size: 16, color: '#aaaaaa' }).setOrigin(1, 0.5);
    this.countW = txt(this, BX + S - 110, py + 18, '2', { title: true, size: 30 }).setOrigin(1, 0.5);
    txt(this, width / 2, py + 105, t('keysHint'), { size: 24, color: '#7fae90' });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const c = Math.floor((p.x - BX) / CELL), r = Math.floor((p.y - BY) / CELL);
      if (c < 0 || c >= N || r < 0 || r >= N) return;
      this.cur = r * N + c; this.placeCursor();
      this.playerMove(this.cur);
    });
    const kb = this.input.keyboard;
    const mv = (dx: number, dy: number) => {
      const c = Phaser.Math.Wrap((this.cur % N) + dx, 0, N), r = Phaser.Math.Wrap(Math.floor(this.cur / N) + dy, 0, N);
      this.cur = r * N + c; this.placeCursor();
      this.sfx('move', { volume: 0.35 });
    };
    kb?.on('keydown-LEFT', () => mv(-1, 0)); kb?.on('keydown-A', () => mv(-1, 0));
    kb?.on('keydown-RIGHT', () => mv(1, 0)); kb?.on('keydown-D', () => mv(1, 0));
    kb?.on('keydown-UP', () => mv(0, -1)); kb?.on('keydown-W', () => mv(0, -1));
    kb?.on('keydown-DOWN', () => mv(0, 1)); kb?.on('keydown-S', () => mv(0, 1));
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.playerMove(this.cur));

    if (this.online) {
      net.onScene(this, 'move', (d: MoveMsg) => {
        if (!d || typeof d.i !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }

    this.updateHud();
    this.startRound();
  }

  /** Online: applies the opponent's queued move once it is their turn here too. */
  private takeRemote(): void {
    const opp = 3 - this.mine;
    while (this.state === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo || d.i < 0 || d.i >= N * N) continue;
      const f = flips(this.board, d.i, opp);
      if (!f.length) continue;
      this.play(d.i, opp, f);
    }
  }

  private cx(i: number): number { return BX + (i % N) * CELL + CELL / 2; }
  private cy(i: number): number { return BY + Math.floor(i / N) * CELL + CELL / 2; }

  private placeCursor(): void {
    this.cursor.setPosition(this.cx(this.cur), this.cy(this.cur));
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('level')} ${this.level + 1}`);
    if (this.online) this.info.setText(t('vs', { name: net.peerName || t('opponent') }));
    else this.info.setText(`${t('rival', { name: t('d' + this.level) })}   ${t('streak', { n: this.streak })}`);
    this.countB.setText(String(count(this.board, 1)));
    this.countW.setText(String(count(this.board, 2)));
  }

  private putDisc(i: number, p: number, animate: boolean): void {
    this.board[i] = p;
    const d = this.add.image(this.cx(i), this.cy(i), p === 1 ? 'disc-b' : 'disc-w').setDisplaySize(DISC, DISC).setDepth(10);
    this.discs[i] = d;
    if (animate) {
      const s = d.scale;
      d.setScale(s * 1.6).setAlpha(0);
      this.tweens.add({ targets: d, scale: s, alpha: 1, duration: 200, ease: 'Quad.easeIn' });
    }
  }

  private startRound(): void {
    this.round++;
    this.discs.forEach((d) => d?.destroy());
    this.board.fill(0); this.discs.fill(null);
    this.putDisc(27, 2, true); this.putDisc(28, 1, true); this.putDisc(35, 1, true); this.putDisc(36, 2, true);
    this.updateHud();
    // online: black (the round's starter) always moves first; solo: the player starts odd rounds
    this.time.delayedCall(300, () => this.nextTurn(this.online ? 1 : this.round % 2 === 1 ? 1 : 2, false));
  }

  private showHints(on: boolean): void {
    this.hints.forEach((h) => h.destroy());
    this.hints = [];
    if (!on) return;
    for (const m of legalMoves(this.board, this.mine)) {
      const h = this.add.circle(this.cx(m), this.cy(m), 11, 0x000000, 0.35).setDepth(5);
      this.tweens.add({ targets: h, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
      this.hints.push(h);
    }
  }

  /** Sets up a turn for p, handling passes and the end of the round. */
  private nextTurn(p: number, prevPassed: boolean): void {
    if (this.isOver) return;
    const moves = legalMoves(this.board, p);
    if (!moves.length) {
      if (prevPassed || !legalMoves(this.board, 3 - p).length) return this.finishRound();
      this.state = 'busy';
      this.showBanner(t('pass'), '#ffd23f');
      this.sfx('pass');
      this.time.delayedCall(1100, () => { this.hideBanner(); this.nextTurn(3 - p, true); });
      return;
    }
    if (p === this.mine) {
      this.state = 'player';
      this.status.setText(this.online ? t('netMine') : t('yourTurn')).setColor('#f3f2f2');
      if (this.online) {
        this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
        if (this.moveNo > 0) this.sfx('turn', { volume: 0.45 });
      }
      this.showHints(true);
      this.cursor.setVisible(true);
      if (!moves.includes(this.cur)) { this.cur = moves[0]; }
      this.placeCursor();
    } else {
      this.state = 'ai';
      this.status.setText(this.online ? t('netTheirs') : t('aiTurn')).setColor(this.online ? '#8fb8a0' : '#ffd23f');
      this.showHints(false);
      this.cursor.setVisible(false);
      if (this.online) this.takeRemote();
      else this.time.delayedCall(rng.int(400, 700), () => this.aiMove());
    }
  }

  private playerMove(i: number): void {
    if (this.state !== 'player' || this.isOver) return;
    const f = flips(this.board, i, this.mine);
    if (!f.length && this.online) {
      // online assist: jump to the nearest legal square; a second tap / Space plays it
      const moves = legalMoves(this.board, this.mine);
      const dist = (m: number) => Math.hypot((m % N) - (i % N), Math.floor(m / N) - Math.floor(i / N));
      this.cur = moves.reduce((best, m) => (dist(m) < dist(best) ? m : best), moves[0]);
      this.placeCursor();
      this.sfx('move', { volume: 0.4 });
      this.tweens.add({ targets: this.cursor, scale: { from: 1.3, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      return;
    }
    if (!f.length) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.cursor, angle: 8, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    if (this.online) net.send('move', { i, n: this.moveNo } satisfies MoveMsg);
    this.play(i, this.mine, f);
    this.addScore(f.length * 2, this.cx(i), this.cy(i) - 40);
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    const [depth, rnd] = LEVELS[this.level];
    const m = new Brain().choose(this.board, 2, depth, rnd, 80);
    if (m < 0) return this.nextTurn(1, true);
    this.play(m, 2, flips(this.board, m, 2));
  }

  private play(i: number, p: number, f: number[]): void {
    this.state = 'busy';
    this.moveNo++;
    if (this.online && p === this.mine) this.status.setText(t('netTheirs')).setColor('#8fb8a0');
    this.showHints(false);
    this.cursor.setVisible(false);
    this.putDisc(i, p, true);
    this.sfx(rng.chance(0.5) ? 'place' : 'place2', { volume: 0.7 });
    let maxDelay = 0;
    for (const j of f) {
      this.board[j] = p;
      const d = this.discs[j]!;
      const dist = Math.max(Math.abs((j % N) - (i % N)), Math.abs(Math.floor(j / N) - Math.floor(i / N)));
      const delay = 120 + dist * 90, sx = d.scaleX;
      maxDelay = Math.max(maxDelay, delay);
      this.tweens.add({
        targets: d, scaleX: 0, duration: 110, delay, ease: 'Quad.easeIn',
        onComplete: () => {
          d.setTexture(p === 1 ? 'disc-b' : 'disc-w');
          this.tweens.add({ targets: d, scaleX: sx, duration: 110, ease: 'Quad.easeOut' });
          // flips climb in pitch as the wave spreads out from the new disc
          this.sfx('flip', { volume: 0.25, rate: 1 + Math.min(dist, 7) * 0.05, x: d.x });
          burst(this, d.x, d.y, p === 1 ? [0x333333, 0xffffff] : [0xffffff, 0xcccccc], 5, 120);
        },
      });
    }
    if (f.length >= 5) {
      shake(this, 0.006, 160);
      this.time.delayedCall(maxDelay + 160, () => this.sfx('big', { volume: 0.5 }));
    }
    this.time.delayedCall(maxDelay + 280, () => {
      this.updateHud();
      this.nextTurn(3 - p, false);
    });
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
  }

  private hideBanner(): void {
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 220, onComplete: () => this.banner.setVisible(false) });
  }

  private finishRound(): void {
    this.state = 'busy';
    this.showHints(false);
    this.cursor.setVisible(false);
    this.status.setText('');
    if (this.online) return this.finishOnline();
    const b = count(this.board, 1), w = count(this.board, 2);
    const cx = this.scale.width / 2;
    if (b > w) {
      this.streak++;
      this.addScore(150 * (this.level + 1) + (b - w) * 10 + this.streak * 50, cx, BY - 10);
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
      this.showBanner(t('roundWin'), '#5dff7a');
      this.sfx('win'); flash(this, 0x5dff7a, 150);
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(BX, BX + N * CELL), rng.int(BY, BY + N * CELL), [0xffd23f, 0xffffff, 0x5dff7a], 20, 300));
    } else if (w > b) {
      this.lives--; this.streak = 0;
      this.showBanner(t('roundLose'), '#ec3013');
      this.sfx('lose'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
    } else {
      this.addScore(50, cx, BY - 10);
      this.showBanner(t('roundDraw'), '#3ee6ff');
      this.sfx('pass');
    }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 1800 }); return; }
    this.time.delayedCall(2000, () => {
      if (this.isOver) return;
      this.hideBanner();
      this.sfx('clear', { volume: 0.6 });
      this.discs.forEach((d) => {
        if (!d) return;
        this.tweens.add({ targets: d, scale: 0, angle: 180, duration: 300, delay: rng.int(0, 250) });
      });
      this.time.delayedCall(650, () => { if (!this.isOver) this.startRound(); });
    });
  }

  /** Online result: both screens run the same rules on the same moves, so both agree here. */
  private finishOnline(): void {
    const me = count(this.board, this.mine), them = count(this.board, 3 - this.mine);
    const win = me > them;
    this.setScore(me);
    this.updateHud();
    if (win) {
      this.showBanner(t('roundWin'), '#5dff7a');
      this.sfx('win'); flash(this, 0x5dff7a, 150);
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(BX, BX + N * CELL), rng.int(BY, BY + N * CELL), [0xffd23f, 0xffffff, 0x5dff7a], 20, 300));
    } else if (them > me) {
      this.showBanner(t('roundLose'), '#ec3013');
      this.sfx('lose'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
    } else {
      this.showBanner(t('roundDraw'), '#3ee6ff');
      this.sfx('pass');
    }
    this.endGame({ win, title: win ? t('youWin') : them > me ? t('youLose') : t('draw'), draw: me === them, delay: 2000 });
  }

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
