import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import { N, LEVELS, choose, winLine } from './ai';

const GAP = 44;                          // distance between intersections
const BX = (720 - (N - 1) * GAP) / 2;     // first intersection x
const BY = 320;                          // first intersection y
const STONE = 40;
const STAR = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]];

type State = 'player' | 'ai' | 'busy';
/** Online move message: intersection + move number (guards against stale messages after a rematch). */
interface MoveMsg { i: number; n: number }

export class PlayScene extends ArcadeScene {
  private board: number[] = [];
  private stones: Array<Phaser.GameObjects.Image | null> = [];
  private state: State = 'busy';
  private cur = 112;
  private cursor!: Phaser.GameObjects.Image;
  private cursorRing!: Phaser.GameObjects.Arc;
  private lastMark!: Phaser.GameObjects.Arc;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private nameB!: Phaser.GameObjects.Text;
  private nameW!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private moves = 0;
  private playerMoves = 0;
  /** The colour this player plays this round: 1 black (moves first), 2 white. */
  private mine = 1;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];

  createGame(): void {
    const { width } = this.scale;
    this.board = new Array(N * N).fill(0);
    this.stones = new Array(N * N).fill(null);
    this.state = 'busy'; this.cur = 112;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.moves = 0; this.playerMoves = 0;
    this.online = net.active;
    this.mine = 1;
    this.moveNo = 0; this.inbox = [];
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#1c140c');
    this.makeTextures();

    // wooden board with grid lines and star points
    const g = this.add.graphics();
    const S = (N - 1) * GAP, pad = 30;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BX - pad + 8, BY - pad + 10, S + pad * 2, S + pad * 2, 16);
    g.fillStyle(0xd9a55a).fillRoundedRect(BX - pad, BY - pad, S + pad * 2, S + pad * 2, 16);
    for (let k = 0; k < 14; k++) {
      g.fillStyle(k % 2 ? 0xd09b50 : 0xdcab62, 0.55).fillRect(BX - pad + 6, BY - pad + 10 + k * ((S + pad * 2 - 20) / 14), S + pad * 2 - 12, 18);
    }
    g.lineStyle(4, 0x8a5a26).strokeRoundedRect(BX - pad, BY - pad, S + pad * 2, S + pad * 2, 16);
    g.lineStyle(2, 0x5a3a16, 0.9);
    for (let k = 0; k < N; k++) {
      g.lineBetween(BX + k * GAP, BY, BX + k * GAP, BY + S);
      g.lineBetween(BX, BY + k * GAP, BX + S, BY + k * GAP);
    }
    g.lineStyle(3, 0x5a3a16).strokeRect(BX, BY, S, S);
    g.fillStyle(0x5a3a16);
    for (const [x, y] of STAR) g.fillCircle(BX + x * GAP, BY + y * GAP, 6);

    this.cursorRing = this.add.circle(0, 0, STONE / 2 + 6).setStrokeStyle(4, 0xff4fa3).setDepth(15);
    this.cursor = this.add.image(0, 0, 'gm-b').setDisplaySize(STONE, STONE).setAlpha(0.45).setDepth(14);
    this.tweens.add({ targets: this.cursorRing, scale: 1.15, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.lastMark = this.add.circle(0, 0, 6, 0xec3013).setDepth(12).setVisible(false);

    this.status = txt(this, width / 2, 140, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 196, '', { size: 30, color: '#ffcf8a' }).setDepth(30);
    // in the status slot (cleared when a round ends), so it never hides the winning five
    this.banner = txt(this, width / 2, 140, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // legend: who plays which colour
    const ly = BY + S + 95;
    this.add.rectangle(width / 2, ly, S + 40, 96, 0x000000, 0.35).setStrokeStyle(3, 0x8a5a26);
    this.add.image(BX + 40, ly, 'gm-b').setDisplaySize(52, 52);
    this.nameB = txt(this, BX + 80, ly, '', { title: true, size: 18 }).setOrigin(0, 0.5);
    this.add.image(BX + S - 40, ly, 'gm-w').setDisplaySize(52, 52);
    this.nameW = txt(this, BX + S - 80, ly, '', { title: true, size: 18 }).setOrigin(1, 0.5);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, ly + 92, touch ? t('touchHint') : t('keysHint'), { size: 24, color: '#d8b483', wrap: 640 });

    // input: mouse places at once; a touch first aims (ghost stone), a second tap places
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const i = this.cellAt(p.x, p.y);
      if (i >= 0 && i !== this.cur) { this.cur = i; this.placeCursor(); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const i = this.cellAt(p.x, p.y);
      if (i < 0) return;
      if (p.wasTouch && (i !== this.cur || !this.cursor.visible)) {
        this.cur = i; this.placeCursor();
        if (this.state === 'player') this.sfx('move', { volume: 0.35 });
        return;
      }
      this.cur = i; this.placeCursor();
      this.playerMove();
    });
    const kb = this.input.keyboard;
    const mv = (dx: number, dy: number) => {
      const x = Phaser.Math.Wrap((this.cur % N) + dx, 0, N), y = Phaser.Math.Wrap(Math.floor(this.cur / N) + dy, 0, N);
      this.cur = y * N + x; this.placeCursor();
      if (this.state === 'player') this.sfx('move', { volume: 0.3 });
    };
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

  private makeTextures(): void {
    const stone = (key: string, black: boolean) => {
      if (this.textures.exists(key)) return;
      const s = 64, tex = this.textures.createCanvas(key, s, s)!, ctx = tex.getContext();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(34, 36, 27, 0, Math.PI * 2); ctx.fill();
      const gr = ctx.createRadialGradient(23, 21, 3, 32, 32, 30);
      if (black) { gr.addColorStop(0, '#77777f'); gr.addColorStop(0.35, '#2b2b31'); gr.addColorStop(1, '#060608'); }
      else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#ebe8e0'); gr.addColorStop(1, '#a8a498'); }
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
      tex.refresh();
    };
    stone('gm-b', true);
    stone('gm-w', false);
  }

  private cellAt(px: number, py: number): number {
    const x = Math.round((px - BX) / GAP), y = Math.round((py - BY) / GAP);
    if (x < 0 || y < 0 || x >= N || y >= N) return -1;
    if (Math.abs(px - (BX + x * GAP)) > GAP * 0.75 || Math.abs(py - (BY + y * GAP)) > GAP * 0.75) return -1;
    return y * N + x;
  }

  private px(i: number): number { return BX + (i % N) * GAP; }
  private py(i: number): number { return BY + Math.floor(i / N) * GAP; }

  private placeCursor(): void {
    this.cursor.setPosition(this.px(this.cur), this.py(this.cur));
    this.cursorRing.setPosition(this.cursor.x, this.cursor.y);
    this.cursor.setVisible(this.state === 'player' && !this.board[this.cur]);
  }

  /** Online: applies the opponent's queued move once it is their turn here too. */
  private takeRemote(): void {
    while (this.state === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo || d.i < 0 || d.i >= N * N || this.board[d.i]) continue;
      this.place(d.i, 3 - this.mine);
    }
  }

  private updateHud(): void {
    const peer = clip(net.peerName || t('opponent'), 10);
    const other = this.online ? peer : t('cpu');
    this.nameB.setText(this.mine === 1 ? t('you') : other);
    this.nameW.setText(this.mine === 2 ? t('you') : other);
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    // the level sits in the info line: the HUD centre slot collides with LIVES in English
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })} · ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.moves = 0; this.playerMoves = 0;
    // the round's starter plays black, and black moves first
    this.mine = this.online ? (net.myTurnFirst ? 1 : 2) : (this.round % 2 === 1 ? 1 : 2);
    this.cursor.setTexture(this.mine === 1 ? 'gm-b' : 'gm-w');
    this.cur = 112;
    this.lastMark.setVisible(false);
    this.updateHud();
    this.time.delayedCall(250, () => this.setTurn(this.mine === 1 ? 'player' : 'ai'));
  }

  private setTurn(s: State): void {
    if (this.isOver) return;
    this.state = s;
    const mine = s === 'player';
    this.cursorRing.setVisible(mine);
    this.placeCursor();
    if (mine) {
      this.status.setText(t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.online && this.moveNo > 0) this.sfx('turn', { volume: 0.45 });
      return;
    }
    this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#c9a77a');
    if (this.online) this.takeRemote();
    else this.time.delayedCall(rng.int(380, 650), () => this.aiMove());
  }

  private playerMove(): void {
    if (this.state !== 'player' || this.isOver) return;
    if (this.board[this.cur]) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.cursorRing, x: this.cursorRing.x + 6, duration: 45, yoyo: true, repeat: 2 });
      return;
    }
    this.playerMoves++;
    if (this.online) net.send('mv', { i: this.cur, n: this.moveNo } satisfies MoveMsg);
    this.place(this.cur, this.mine);
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    const i = choose(this.board, 3 - this.mine, LEVELS[Math.min(this.level, LEVELS.length - 1)]);
    if (i < 0 || this.board[i]) return this.finish(0, null);
    this.place(i, 3 - this.mine);
  }

  private place(i: number, who: number): void {
    this.state = 'busy';
    this.board[i] = who;
    this.moveNo++; this.moves++;
    this.cursor.setVisible(false); this.cursorRing.setVisible(false);
    const st = this.add.image(this.px(i), this.py(i) - 30, who === 1 ? 'gm-b' : 'gm-w').setDisplaySize(STONE * 1.4, STONE * 1.4).setAlpha(0).setDepth(10);
    this.stones[i] = st;
    this.tweens.add({
      targets: st, y: this.py(i), displayWidth: STONE, displayHeight: STONE, alpha: 1, duration: 160, ease: 'Quad.easeIn',
      onComplete: () => {
        this.sfxAt(rng.chance(0.5) ? 'place' : 'place2', st.x, { volume: 0.75 });
        burst(this, st.x, st.y, who === 1 ? [0x333333, 0x777777] : [0xffffff, 0xddd6c4], 6, 110);
        this.lastMark.setPosition(st.x, st.y).setVisible(true).setFillStyle(who === 1 ? 0xff5a4a : 0xec3013);
        if (this.isOver) return;
        const line = winLine(this.board, i);
        if (line) return this.finish(who, line);
        if (this.board.every((v) => v !== 0)) return this.finish(0, null);
        this.setTurn(who === this.mine ? 'ai' : 'player');
      },
    });
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private celebrateLine(line: number[], winner: number): void {
    // sort along the line so the glow sweeps from one end to the other
    line.sort((a, b) => a - b);
    const g = this.add.graphics().setDepth(11);
    g.lineStyle(14, winner === this.mine ? 0x5dff7a : 0xec3013, 0.55)
      .lineBetween(this.px(line[0]), this.py(line[0]), this.px(line[line.length - 1]), this.py(line[line.length - 1]));
    line.forEach((k, n) => {
      const s = this.stones[k]!;
      s.setDepth(13);
      this.time.delayedCall(n * 90, () => {
        this.tweens.add({ targets: s, scale: s.scale * 1.25, duration: 160, yoyo: true, repeat: 2 });
        burst(this, s.x, s.y, [0xffd23f, 0xffffff], 12, 220);
        this.sfx('chime', { volume: 0.35, rate: 1 + n * 0.08 });
      });
    });
    shake(this, 0.01, 280);
  }

  private finish(winner: number, line: number[] | null): void {
    this.state = 'busy';
    this.status.setText('');
    this.cursor.setVisible(false); this.cursorRing.setVisible(false);
    if (line) this.celebrateLine(line, winner);
    const cx = this.scale.width / 2;
    if (this.online) {
      const win = winner === this.mine;
      if (winner === 0) { this.showBanner(t('roundDraw'), '#3ee6ff'); this.setScore(25); this.sfx('draw'); }
      else if (win) {
        this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
        this.setScore(100 + Math.max(0, 60 - this.playerMoves) * 5);
        this.time.delayedCall(500, () => this.sfx('win'));
      } else { this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); this.time.delayedCall(500, () => this.sfx('lose')); }
      this.endGame({ win, title: winner === 0 ? t('draw') : win ? t('youWin') : t('youLose'), draw: winner === 0, delay: 2200 });
      return;
    }
    if (winner === this.mine) {
      this.streak++;
      const pts = 100 * (this.level + 1) + Math.max(0, 40 - this.playerMoves) * 5 + this.streak * 25;
      this.time.delayedCall(500, () => { this.addScore(pts, cx, BY - 40); this.sfx('win'); });
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      if (this.streak >= 2) popup(this, cx, BY + 120, t('streak', { n: this.streak }), '#ffd23f', 34);
    } else if (winner) {
      this.lives--; this.streak = 0;
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
      this.time.delayedCall(500, () => this.sfx('lose'));
    } else {
      this.addScore(25, cx, BY - 40);
      this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw');
    }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2200 }); return; }
    this.time.delayedCall(2400, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.6 });
    this.lastMark.setVisible(false);
    this.children.list.filter((o) => o instanceof Phaser.GameObjects.Graphics && o.depth === 11).forEach((o) => o.destroy());
    this.stones.forEach((s) => {
      if (!s) return;
      this.tweens.add({ targets: s, scale: 0, angle: 120, alpha: 0, duration: 280, delay: rng.int(0, 300), onComplete: () => s.destroy() });
    });
    this.board.fill(0);
    this.stones.fill(null);
    this.time.delayedCall(700, () => { if (!this.isOver) this.startRound(); });
  }

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
