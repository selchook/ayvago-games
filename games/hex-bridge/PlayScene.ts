import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, txt, t, rng, net, isEasy } from '@core';
import { N, CELLS, RED, BLUE, LEVELS, EASY_LEVELS, chooseMove, winPath, openingMove, wantsSwap, swapCell, type Level } from './hex';
import { think, nextToken } from './ai-client';

// The rhombus stands upright: r runs to the right, c runs down (flat-top hexes).
const S = 32;                        // hex radius
const SQ3 = Math.sqrt(3);
const X0 = 120, Y0 = 250;            // centre of cell (0, 0)
const STONE = 46;
const RED_COL = 0xff4f5e, BLUE_COL = 0x3e9bff;

type Turn = 'player' | 'ai' | 'busy';
/** Online move: cell index, or -1 for the swap; n = move number. */
interface MoveMsg { i: number; n: number }

export function makeHexTextures(scene: Phaser.Scene): void {
  const stone = (key: string, light: string, mid: string, dark: string) => {
    if (scene.textures.exists(key)) return;
    const s = 64, tex = scene.textures.createCanvas(key, s, s)!, ctx = tex.getContext();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(34, 36, 27, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(23, 21, 3, 32, 32, 30);
    gr.addColorStop(0, light); gr.addColorStop(0.4, mid); gr.addColorStop(1, dark);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
    tex.refresh();
  };
  stone('hx-red', '#ffc2c7', '#ff4f5e', '#8f1020');
  stone('hx-blue', '#c4e2ff', '#3e9bff', '#0b3c78');
}

export class PlayScene extends ArcadeScene {
  private board = new Int8Array(CELLS);
  private stones: Array<Phaser.GameObjects.Image | null> = [];
  private turn: Turn = 'busy';
  private cur = 60;
  private cursor!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private lastMark!: Phaser.GameObjects.Arc;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private nameR!: Phaser.GameObjects.Text;
  private nameB!: Phaser.GameObjects.Text;
  private swapBtn!: Button;
  private level = 0;
  private levels = LEVELS;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private myStones = 0;
  private mine = RED;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];
  private swapped = false;
  private extras: Phaser.GameObjects.GameObject[] = [];
  /** Id of the AI request this turn waits for (answers to older ones are dropped). */
  private aiToken = 0;

  createGame(): void {
    const { width } = this.scale;
    this.board = new Int8Array(CELLS);
    this.stones = new Array(CELLS).fill(null);
    this.turn = 'busy'; this.cur = 60;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.myStones = 0;
    this.levels = isEasy() ? EASY_LEVELS : LEVELS;
    this.online = net.active; this.mine = RED; this.moveNo = 0; this.inbox = []; this.swapped = false; this.extras = []; this.aiToken = 0;
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#0f1424');
    makeHexTextures(this);
    this.drawBoard();

    this.cursor = this.add.graphics().setDepth(15).setVisible(false);
    this.cursor.lineStyle(5, 0xffd23f, 1);
    this.cursor.strokePoints(this.hexPoints(0, 0, S - 3), true, true);
    this.tweens.add({ targets: this.cursor, alpha: 0.45, duration: 420, yoyo: true, repeat: -1 });
    this.ghost = this.add.image(0, 0, 'hx-red').setDisplaySize(STONE, STONE).setAlpha(0.45).setDepth(14).setVisible(false);
    this.lastMark = this.add.circle(0, 0, 6, 0xffffff).setDepth(12).setVisible(false);

    this.status = txt(this, width / 2, 130, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 180, '', { size: 28, color: '#b8c8ff' }).setDepth(30);
    this.banner = txt(this, width / 2, 130, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(40).setVisible(false);

    this.swapBtn = new Button(this, 548, 330, t('swap'), () => this.playerSwap(), { width: 250, height: 84, size: 24, color: 0x8b5cff });
    this.swapBtn.setDepth(35).setVisible(false);

    // legend
    const ly = 1168;
    this.add.rectangle(width / 2, ly, 680, 92, 0x000000, 0.4).setStrokeStyle(3, 0x4a5a8a);
    this.add.image(60, ly, 'hx-red').setDisplaySize(50, 50);
    this.nameR = txt(this, 96, ly - 16, '', { title: true, size: 17 }).setOrigin(0, 0.5);
    txt(this, 96, ly + 20, t('redGoal'), { size: 22, color: '#ff9aa3' }).setOrigin(0, 0.5);
    this.add.image(width - 60, ly, 'hx-blue').setDisplaySize(50, 50);
    this.nameB = txt(this, width - 96, ly - 16, '', { title: true, size: 17 }).setOrigin(1, 0.5);
    txt(this, width - 96, ly + 20, t('blueGoal'), { size: 22, color: '#9cc8ff' }).setOrigin(1, 0.5);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, 1242, touch ? t('touchHint') : t('keysHint'), { size: 22, color: '#8a98c8', wrap: 680 });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const i = this.cellAt(p.x, p.y);
      if (i >= 0 && i !== this.cur) { this.cur = i; this.placeCursor(); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const i = this.cellAt(p.x, p.y);
      if (i < 0) return;
      // a touch first aims (the cells are small on a phone), a second tap on the same cell places
      if (p.wasTouch && (i !== this.cur || !this.ghost.visible)) {
        this.cur = i; this.placeCursor();
        if (this.turn === 'player') this.sfx('move', { volume: 0.35 });
        return;
      }
      this.cur = i; this.placeCursor();
      this.playerMove();
    });
    const kb = this.input.keyboard;
    const mv = (dr: number, dc: number) => {
      const r = Phaser.Math.Clamp(Math.floor(this.cur / N) + dr, 0, N - 1), c = Phaser.Math.Clamp((this.cur % N) + dc, 0, N - 1);
      this.cur = r * N + c; this.placeCursor();
      if (this.turn === 'player') this.sfx('move', { volume: 0.3 });
    };
    kb?.on('keydown-LEFT', () => mv(-1, 0)); kb?.on('keydown-A', () => mv(-1, 0));
    kb?.on('keydown-RIGHT', () => mv(1, 0)); kb?.on('keydown-D', () => mv(1, 0));
    kb?.on('keydown-UP', () => mv(0, -1)); kb?.on('keydown-W', () => mv(0, -1));
    kb?.on('keydown-DOWN', () => mv(0, 1)); kb?.on('keydown-S', () => mv(0, 1));
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.playerMove());
    kb?.on('keydown-X', () => this.playerSwap());

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
  private px(i: number): number { return X0 + Math.floor(i / N) * 1.5 * S; }
  private py(i: number): number { return Y0 + ((i % N) + Math.floor(i / N) / 2) * SQ3 * S; }

  private hexPoints(x: number, y: number, r: number): Phaser.Math.Vector2[] {
    const pts: Phaser.Math.Vector2[] = [];
    for (let k = 0; k < 6; k++) pts.push(new Phaser.Math.Vector2(x + r * Math.cos((k * Math.PI) / 3), y + r * Math.sin((k * Math.PI) / 3)));
    return pts;
  }

  private cellAt(x: number, y: number): number {
    // axial rounding: r from x, c from y
    const rf = (x - X0) / (1.5 * S);
    const cf = (y - Y0) / (SQ3 * S) - rf / 2;
    let best = -1, bd = S * 1.05;
    for (let r = Math.floor(rf) - 1; r <= Math.ceil(rf) + 1; r++) {
      for (let c = Math.floor(cf) - 1; c <= Math.ceil(cf) + 1; c++) {
        if (r < 0 || c < 0 || r >= N || c >= N) continue;
        const i = r * N + c, d = Math.hypot(this.px(i) - x, this.py(i) - y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  /** The board is static: drawn once into a texture (Graphics would be re-tessellated every frame). */
  private drawBoard(): void {
    if (this.textures.exists('hx-board')) { this.add.image(0, 0, 'hx-board').setOrigin(0).setDepth(0); return; }
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // drop shadow + cells
    for (let i = 0; i < CELLS; i++) {
      g.fillStyle(0x000000, 0.35).fillPoints(this.hexPoints(this.px(i) + 4, this.py(i) + 6, S), true);
    }
    for (let i = 0; i < CELLS; i++) {
      const x = this.px(i), y = this.py(i);
      const shade = ((Math.floor(i / N) + (i % N)) % 2) ? 0x283456 : 0x2c3a60;
      g.fillStyle(shade, 1).fillPoints(this.hexPoints(x, y, S - 1.5), true);
      g.lineStyle(2, 0x5a6a9a, 0.9).strokePoints(this.hexPoints(x, y, S - 1.5), true, true);
    }
    // coloured borders: red on the c edges (top, bottom), blue on the r edges (left, right)
    const edgeLine = (i: number, dir: number, col: number) => {
      const x = this.px(i), y = this.py(i);
      const vA = [4, 5, 0, 1, 2, 3][dir];   // first vertex of the hex side facing DIRS[dir]
      const a0 = (vA * Math.PI) / 3, a1 = ((vA + 1) * Math.PI) / 3, R = S + 3;
      g.lineStyle(9, col, 1).lineBetween(x + R * Math.cos(a0), y + R * Math.sin(a0), x + R * Math.cos(a1), y + R * Math.sin(a1));
    };
    for (let k = 0; k < N; k++) {
      edgeLine(k * N + 0, 0, RED_COL); if (k < N - 1) edgeLine(k * N + 0, 1, RED_COL);
      edgeLine(k * N + N - 1, 3, RED_COL); if (k > 0) edgeLine(k * N + N - 1, 4, RED_COL);
      edgeLine(0 * N + k, 5, BLUE_COL); if (k < N - 1) edgeLine(0 * N + k, 4, BLUE_COL);
      edgeLine((N - 1) * N + k, 2, BLUE_COL); if (k > 0) edgeLine((N - 1) * N + k, 1, BLUE_COL);
    }
    g.generateTexture('hx-board', 720, 1130);
    g.destroy();
    this.add.image(0, 0, 'hx-board').setOrigin(0).setDepth(0);
  }

  private placeCursor(): void {
    const x = this.px(this.cur), y = this.py(this.cur);
    const mine = this.turn === 'player';
    this.cursor.setPosition(x, y).setVisible(mine);
    this.ghost.setPosition(x, y).setVisible(mine && !this.board[this.cur]);
  }

  // ---------------------------------------------------------------- flow
  private updateHud(): void {
    const peer = clip(net.peerName || t('opponent'), 10);
    const other = this.online ? peer : t('cpu');
    this.nameR.setText(this.mine === RED ? t('you') : other);
    this.nameB.setText(this.mine === BLUE ? t('you') : other);
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setLives(this.lives);
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })} · ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.myStones = 0; this.moveNo = 0; this.swapped = false;
    this.board.fill(0);
    // the round's starter plays red, and red moves first
    this.mine = this.online ? (net.myTurnFirst ? RED : BLUE) : (this.round % 2 === 1 ? RED : BLUE);
    this.ghost.setTexture(this.mine === RED ? 'hx-red' : 'hx-blue');
    this.cur = 60;
    this.lastMark.setVisible(false);
    this.updateHud();
    this.time.delayedCall(300, () => this.setTurn(this.mine === RED ? 'player' : 'ai'));
  }

  private mover(): number { return this.moveNo % 2 === 0 ? RED : BLUE; }

  private setTurn(s: Turn): void {
    if (this.isOver) return;
    this.turn = s;
    this.placeCursor();
    const canSwap = s === 'player' && this.moveNo === 1 && this.mine === BLUE;
    this.swapBtn.setVisible(canSwap);
    if (canSwap) {
      this.swapBtn.setScale(0.4);
      this.tweens.add({ targets: this.swapBtn, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }
    if (s === 'player') {
      this.status.setText(canSwap ? t('swapOr') : t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.moveNo > 0) this.sfx('turn', { volume: 0.4 });
      return;
    }
    this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#8a98c8');
    if (this.online) this.takeRemote();
    else this.aiMove();
  }

  private takeRemote(): void {
    while (this.turn === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo) continue;
      if (d.i === -1) { if (this.moveNo === 1) this.doSwap(); continue; }
      if (d.i < 0 || d.i >= CELLS || this.board[d.i]) continue;
      this.place(d.i);
    }
  }

  private playerMove(): void {
    if (this.turn !== 'player' || this.isOver) return;
    if (this.board[this.cur]) {
      this.sfx('error', { volume: 0.5 });
      this.tweens.add({ targets: this.cursor, x: this.cursor.x + 6, duration: 45, yoyo: true, repeat: 2 });
      return;
    }
    this.myStones++;
    if (this.online) net.send('mv', { i: this.cur, n: this.moveNo } satisfies MoveMsg);
    this.place(this.cur);
  }

  private playerSwap(): void {
    if (this.turn !== 'player' || this.isOver || this.moveNo !== 1 || this.mine !== BLUE) return;
    if (this.online) net.send('mv', { i: -1, n: this.moveNo } satisfies MoveMsg);
    this.myStones++;
    this.doSwap();
  }

  /** The AI at the current level: search depth, width, noise and the pool it picks lesser moves from. */
  ai(): Level {
    return this.levels[Math.min(this.level, this.levels.length - 1)];
  }

  /** Solo: the AI's turn. The search runs in a worker while a short "thinking" pause plays. */
  private aiMove(): void {
    if (this.isOver || this.turn !== 'ai') return;
    const token = (this.aiToken = nextToken());
    const delay = rng.int(350, 550), t0 = this.time.now;
    const act = (fn: () => void) => this.time.delayedCall(Math.max(0, delay - (this.time.now - t0)), () => {
      if (token === this.aiToken && !this.isOver && this.turn === 'ai') fn();
    });
    const p = this.mover();
    if (this.moveNo === 0) { const i = openingMove(this.level); act(() => this.place(i)); return; }
    if (this.moveNo === 1) {
      const first = this.board.findIndex((v) => v === RED);
      if (first >= 0 && wantsSwap(first, this.level)) { act(() => this.doSwap()); return; }
    }
    const lvl = this.ai(), budget = 600;
    const board = this.board.slice();
    think<number>({ board: Array.from(board), p, lvl, budget }, () => chooseMove(board, p, lvl, budget), budget + 1500)
      .then((i) => {
        if (token !== this.aiToken || (!this.sys.isActive() && !this.sys.isPaused())) return;
        act(() => { if (i >= 0 && !this.board[i]) this.place(i); });
      });
  }

  /** The first red stone becomes a blue one, mirrored across the long diagonal. */
  private doSwap(): void {
    const from = this.board.findIndex((v) => v === RED);
    if (from < 0) return;
    this.turn = 'busy';
    this.swapBtn.setVisible(false);
    this.cursor.setVisible(false); this.ghost.setVisible(false);
    const to = swapCell(from);
    this.board[from] = 0; this.board[to] = BLUE;
    this.moveNo++;
    this.swapped = true;
    const st = this.stones[from]!;
    this.stones[from] = null; this.stones[to] = st;
    this.sfx('swap', { volume: 0.6 });
    this.lastMark.setVisible(false);
    this.tweens.add({
      targets: st, x: this.px(to), y: this.py(to), scale: st.scale * 1.4, duration: 300, ease: 'Sine.easeInOut', yoyo: false,
      onComplete: () => {
        st.setTexture('hx-blue').setDisplaySize(STONE, STONE);
        burst(this, st.x, st.y, [BLUE_COL, 0xffffff, RED_COL], 18, 220);
        this.lastMark.setPosition(st.x, st.y).setVisible(true);
        popup(this, st.x, st.y - 50, t('swapped'), '#c9a7ff', 30);
        this.time.delayedCall(250, () => this.setTurn(this.mine === RED ? 'player' : 'ai'));
      },
    });
  }

  private place(i: number): void {
    const who = this.mover();
    this.turn = 'busy';
    this.swapBtn.setVisible(false);
    this.board[i] = who;
    this.moveNo++;
    this.cursor.setVisible(false); this.ghost.setVisible(false);
    const x = this.px(i), y = this.py(i);
    const st = this.add.image(x, y - 30, who === RED ? 'hx-red' : 'hx-blue').setDisplaySize(STONE * 1.4, STONE * 1.4).setAlpha(0).setDepth(10);
    this.stones[i] = st;
    this.tweens.add({
      targets: st, y, displayWidth: STONE, displayHeight: STONE, alpha: 1, duration: 160, ease: 'Quad.easeIn',
      onComplete: () => {
        this.sfxAt(rng.chance(0.5) ? 'place' : 'place2', x, { volume: 0.7 });
        burst(this, x, y, who === RED ? [RED_COL, 0xffffff] : [BLUE_COL, 0xffffff], 6, 110);
        this.lastMark.setPosition(x, y).setVisible(true);
        if (this.isOver) return;
        const path = winPath(this.board, who);
        if (path) return this.finish(who, path);
        this.setTurn(who === this.mine ? 'ai' : 'player');
      },
    });
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private finish(winner: number, path: number[]): void {
    this.turn = 'busy';
    this.status.setText('');
    this.swapBtn.setVisible(false);
    const g = this.add.graphics().setDepth(11);
    g.lineStyle(14, winner === this.mine ? 0x5dff7a : 0xffd23f, 0.6);
    for (let k = 1; k < path.length; k++) g.lineBetween(this.px(path[k - 1]), this.py(path[k - 1]), this.px(path[k]), this.py(path[k]));
    this.extras.push(g);
    path.forEach((k, n) => this.time.delayedCall(n * 60, () => {
      const s = this.stones[k];
      if (!s) return;
      s.setDepth(13);
      this.tweens.add({ targets: s, scale: s.scale * 1.25, duration: 140, yoyo: true });
      burst(this, s.x, s.y, [0xffd23f, 0xffffff], 8, 180);
      if (n % 2 === 0) this.sfx('chime', { volume: 0.3, rate: 1 + Math.min(n, 16) * 0.05 });
    }));
    shake(this, 0.012, 300);
    const win = winner === this.mine;
    const cx = this.scale.width / 2;
    if (this.online) {
      if (win) {
        this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
        this.setScore(100 + Math.max(0, 60 - this.myStones) * 4);
        this.time.delayedCall(500, () => this.sfx('win'));
      } else { this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); this.time.delayedCall(500, () => this.sfx('lose')); }
      this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 2400 });
      return;
    }
    if (win) {
      this.streak++;
      const pts = 100 * (this.level + 1) + Math.max(0, 60 - this.myStones) * 4 + this.streak * 25 + (this.swapped && this.mine === BLUE ? 25 : 0);
      this.time.delayedCall(500, () => { this.addScore(pts, cx, 260); this.sfx('win'); });
      this.level = Math.min(this.level + 1, this.levels.length - 1);
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      if (this.streak >= 2) popup(this, cx, 330, t('streak', { n: this.streak }), '#ffd23f', 34);
    } else {
      this.lives--; this.streak = 0;
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
      this.time.delayedCall(500, () => this.sfx('lose'));
    }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2400 }); return; }
    this.time.delayedCall(2600, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.6 });
    this.lastMark.setVisible(false);
    for (const o of this.extras) o.destroy();
    this.extras = [];
    this.stones.forEach((s) => {
      if (!s) return;
      this.tweens.add({ targets: s, scale: 0, alpha: 0, duration: 260, delay: rng.int(0, 300), onComplete: () => s.destroy() });
    });
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
