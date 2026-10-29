import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import { W, BL, LEVELS, initial, legalMoves, apply, choose, count, sameMove, type Move } from './rules';

const CELL = 82;
const BX = (720 - 8 * CELL) / 2;
const BY = 290;
const PIECE = 70;

type State = 'player' | 'ai' | 'busy';
/** Online move message: from square, landing squares and move number. */
interface MoveMsg { f: number; p: number[]; n: number }

export class PlayScene extends ArcadeScene {
  private board: Int8Array<ArrayBuffer> = new Int8Array(64);
  private sprites: Array<Phaser.GameObjects.Container | null> = [];
  private state: State = 'busy';
  private mine = W;
  private flip = false;
  private legal: Move[] = [];
  private sel = -1;
  private prefix: number[] = [];
  private cur = 52;
  private cursor!: Phaser.GameObjects.Rectangle;
  private marks: Phaser.GameObjects.GameObject[] = [];
  private lastFx: Phaser.GameObjects.Rectangle[] = [];
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private countMe!: Phaser.GameObjects.Text;
  private countThem!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 2;
  private streak = 0;
  private round = 0;
  private quiet = 0;
  private captured = 0;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];

  createGame(): void {
    const { width } = this.scale;
    this.board = initial();
    this.sprites = new Array(64).fill(null);
    this.state = 'busy'; this.legal = []; this.sel = -1; this.prefix = []; this.cur = 52;
    this.marks = []; this.lastFx = [];
    this.level = 0; this.lives = 2; this.streak = 0; this.round = 0; this.quiet = 0; this.captured = 0;
    this.online = net.active;
    this.mine = W; this.flip = false;
    this.moveNo = 0; this.inbox = [];
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#22140b');
    this.makeCrown();

    // wooden board
    const S = 8 * CELL;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BX - 22, BY - 14, S + 44, S + 44, 18);
    g.fillStyle(0x6b3d1c).fillRoundedRect(BX - 22, BY - 22, S + 44, S + 44, 18);
    g.lineStyle(4, 0x3e220c).strokeRoundedRect(BX - 22, BY - 22, S + 44, S + 44, 18);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      g.fillStyle((r + c) % 2 ? 0xc98e4f : 0xe7c08a).fillRect(BX + c * CELL, BY + r * CELL, CELL, CELL);
    }
    g.lineStyle(3, 0x3e220c).strokeRect(BX, BY, S, S);

    this.cursor = this.add.rectangle(0, 0, CELL - 6, CELL - 6).setStrokeStyle(5, 0xffd23f).setDepth(15).setVisible(false);
    this.tweens.add({ targets: this.cursor, alpha: 0.45, duration: 420, yoyo: true, repeat: -1 });

    this.status = txt(this, width / 2, 140, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 196, '', { size: 30, color: '#f0c890' }).setDepth(30);
    this.banner = txt(this, width / 2, BY + S / 2, '', { title: true, size: 50, strokeThickness: 10 }).setDepth(40).setVisible(false);

    // piece counters
    const py = BY + S + 100;
    this.add.rectangle(width / 2, py, S, 110, 0x000000, 0.35).setStrokeStyle(3, 0x6b3d1c);
    this.add.image(BX + 60, py, 'pc-w').setDisplaySize(60, 60).setName('legend-me');
    this.add.image(BX + S - 60, py, 'pc-b').setDisplaySize(60, 60).setName('legend-them');
    txt(this, BX + 110, py - 20, t('you'), { title: true, size: 16, color: '#cccccc' }).setOrigin(0, 0.5);
    this.countMe = txt(this, BX + 110, py + 18, '16', { title: true, size: 30 }).setOrigin(0, 0.5);
    const peer = clip(net.peerName || t('opponent'), 10);
    txt(this, BX + S - 110, py - 20, this.online ? peer : t('cpu'), { title: true, size: 16, color: '#cccccc' }).setOrigin(1, 0.5);
    this.countThem = txt(this, BX + S - 110, py + 18, '16', { title: true, size: 30 }).setOrigin(1, 0.5);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, py + 100, touch ? t('touchHint') : t('keysHint'), { size: 24, color: '#c49a6a', wrap: 660 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const c = Math.floor((p.x - BX) / CELL), r = Math.floor((p.y - BY) / CELL);
      if (c < 0 || c > 7 || r < 0 || r > 7) return;
      this.cur = this.abs(r * 8 + c);
      this.tap(this.cur);
    });
    const kb = this.input.keyboard;
    const mv = (dx: number, dy: number) => {
      // with a piece selected the arrows cycle through its destinations
      if (this.state === 'player' && this.sel >= 0) {
        const opts = [...new Set(this.candidates().map((m) => m.path[this.prefix.length]))]
          .sort((a, b) => this.view(a) - this.view(b));
        if (opts.length) {
          const k = opts.indexOf(this.cur);
          this.cur = opts[Phaser.Math.Wrap(k + (dx + dy > 0 ? 1 : -1), 0, opts.length)];
          this.placeCursor();
          this.sfx('move', { volume: 0.3 });
          return;
        }
      }
      const v = this.view(this.cur);
      const c = Phaser.Math.Wrap((v % 8) + dx, 0, 8), r = Phaser.Math.Wrap(Math.floor(v / 8) + dy, 0, 8);
      this.cur = this.abs(r * 8 + c);
      this.placeCursor();
      if (this.state === 'player') this.sfx('move', { volume: 0.3 });
    };
    kb?.on('keydown-LEFT', () => mv(-1, 0)); kb?.on('keydown-A', () => mv(-1, 0));
    kb?.on('keydown-RIGHT', () => mv(1, 0)); kb?.on('keydown-D', () => mv(1, 0));
    kb?.on('keydown-UP', () => mv(0, -1)); kb?.on('keydown-W', () => mv(0, -1));
    kb?.on('keydown-DOWN', () => mv(0, 1)); kb?.on('keydown-S', () => mv(0, 1));
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.tap(this.cur));
    kb?.on('keydown-X', () => this.deselect());
    kb?.on('keydown-BACKSPACE', () => this.deselect());

    if (this.online) {
      net.onScene(this, 'mv', (d: MoveMsg) => {
        if (!d || typeof d.f !== 'number' || !Array.isArray(d.p)) return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }
    this.startRound();
  }

  private makeCrown(): void {
    if (this.textures.exists('crown')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x7a4a00).fillPoints([{ x: 4, y: 40 }, { x: 4, y: 12 }, { x: 16, y: 26 }, { x: 28, y: 6 }, { x: 40, y: 26 }, { x: 52, y: 12 }, { x: 52, y: 40 }], true);
    g.fillStyle(0xffd23f).fillPoints([{ x: 8, y: 36 }, { x: 8, y: 20 }, { x: 17, y: 30 }, { x: 28, y: 13 }, { x: 39, y: 30 }, { x: 48, y: 20 }, { x: 48, y: 36 }], true);
    g.fillStyle(0xec3013).fillCircle(28, 30, 4);
    g.generateTexture('crown', 56, 44);
    g.clear();
    g.lineStyle(9, 0x000000, 0.6).lineBetween(8, 8, 40, 40).lineBetween(40, 8, 8, 40);
    g.lineStyle(5, 0xff4a2a).lineBetween(8, 8, 40, 40).lineBetween(40, 8, 8, 40);
    g.generateTexture('xmark', 48, 48);
    g.destroy();
  }

  /** Board square (absolute) -> on-screen square (each player sees their own pieces at the bottom). */
  private view(i: number): number { return this.flip ? 63 - i : i; }
  private abs(v: number): number { return this.flip ? 63 - v : v; }
  private sx(i: number): number { return BX + (this.view(i) % 8) * CELL + CELL / 2; }
  private sy(i: number): number { return BY + Math.floor(this.view(i) / 8) * CELL + CELL / 2; }

  private placeCursor(): void {
    this.cursor.setPosition(this.sx(this.cur), this.sy(this.cur)).setVisible(this.state === 'player');
  }

  private makePiece(i: number): Phaser.GameObjects.Container {
    const p = this.board[i];
    const key = p > 0 ? 'pc-w' : 'pc-b';
    const c = this.add.container(this.sx(i), this.sy(i)).setDepth(10);
    const base = this.add.image(0, 0, key).setDisplaySize(PIECE, PIECE);
    c.add(base);
    if (Math.abs(p) === 2) this.crownPiece(c, key);
    this.sprites[i] = c;
    return c;
  }

  /** A dama: a second piece stacked on top with a crown. */
  private crownPiece(c: Phaser.GameObjects.Container, key: string): void {
    if (c.getData('king')) return;
    c.setData('king', true);
    const top = this.add.image(0, -7, key).setDisplaySize(PIECE * 0.92, PIECE * 0.92);
    const crown = this.add.image(0, -9, 'crown').setDisplaySize(40, 31);
    c.add([top, crown]);
  }

  private resetPieces(): void {
    this.sprites.forEach((s) => s?.destroy());
    this.sprites.fill(null);
    for (let i = 0; i < 64; i++) if (this.board[i]) {
      const s = this.makePiece(i);
      s.setScale(0);
      this.tweens.add({ targets: s, scale: 1, duration: 260, delay: (this.flip ? 63 - i : i) * 6, ease: 'Back.easeOut' });
    }
  }

  private takeRemote(): void {
    while (this.state === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo) continue;
      const m = legalMoves(this.board, -this.mine).find((x) => sameMove(x, d.f, d.p));
      if (!m) continue;
      this.play(m);
    }
  }

  private updateHud(): void {
    const me = count(this.board, this.mine), them = count(this.board, -this.mine);
    this.countMe.setText(String(me.men + me.kings));
    this.countThem.setText(String(them.men + them.kings));
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('level')} ${this.level + 1}`);
    this.info.setText(`${t('rival', { name: t('d' + this.level) })}   ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.board = initial();
    this.quiet = 0;
    // white moves first; online the round's starter plays white, solo the player is white and
    // the CPU opens every second round
    const first = this.online ? net.myTurnFirst : this.round % 2 === 1;
    this.mine = this.online ? (first ? W : BL) : W;
    this.flip = this.mine === BL;
    (this.children.getByName('legend-me') as Phaser.GameObjects.Image).setTexture(this.mine === W ? 'pc-w' : 'pc-b');
    (this.children.getByName('legend-them') as Phaser.GameObjects.Image).setTexture(this.mine === W ? 'pc-b' : 'pc-w');
    this.lastFx.forEach((o) => o.destroy()); this.lastFx = [];
    this.resetPieces();
    this.cur = this.mine === W ? 52 : 11;
    this.updateHud();
    const toMove = this.online ? W : first ? W : BL;
    this.time.delayedCall(500, () => this.nextTurn(toMove));
  }

  private nextTurn(side: number): void {
    if (this.isOver) return;
    const moves = legalMoves(this.board, side);
    if (!moves.length) return this.finish(-side);
    const a = count(this.board, W), b = count(this.board, BL);
    if (this.quiet >= 50 || (a.men + a.kings === 1 && b.men + b.kings === 1 && a.kings && b.kings)) return this.finish(0);
    if (side === this.mine) {
      this.state = 'player';
      this.legal = moves;
      this.sel = -1; this.prefix = [];
      const forced = moves[0].caps.length > 0;
      this.status.setText(forced ? t('mustTake') : t('yourTurn')).setColor(forced ? '#ff7a4a' : '#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.online && this.moveNo > 0) this.sfx('turn', { volume: 0.45 });
      if (!moves.some((m) => m.from === this.cur)) this.cur = moves[0].from;
      this.placeCursor();
      this.showMarks();
    } else {
      this.state = 'ai';
      this.legal = [];
      this.cursor.setVisible(false);
      this.clearMarks();
      this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#c49a6a');
      if (this.online) this.takeRemote();
      else this.time.delayedCall(rng.int(350, 600), () => this.aiMove());
    }
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    const m = choose(this.board, -this.mine, this.level);
    if (!m) return this.finish(this.mine);
    this.play(m);
  }

  private clearMarks(): void {
    this.marks.forEach((m) => m.destroy());
    this.marks = [];
  }

  /** Movable pieces glow; the selected piece shows its destinations (and the pieces it takes). */
  private showMarks(): void {
    this.clearMarks();
    if (this.state !== 'player') return;
    const froms = [...new Set(this.legal.map((m) => m.from))];
    for (const f of froms) {
      const ring = this.add.circle(this.sx(f), this.sy(f), PIECE / 2 + 4).setStrokeStyle(4, f === this.sel ? 0xffd23f : 0x5dff7a, f === this.sel ? 1 : 0.7).setDepth(9);
      this.marks.push(ring);
      if (f !== this.sel) this.tweens.add({ targets: ring, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }
    if (this.sel < 0) return;
    const cands = this.candidates();
    const k = this.prefix.length;
    for (const m of cands) {
      const next = m.path[k];
      const final = k === m.path.length - 1;
      const dot = this.add.circle(this.sx(next), this.sy(next), final ? 14 : 10, m.caps.length ? 0xff7a4a : 0x5dff7a, 0.85).setDepth(9).setStrokeStyle(3, 0x000000, 0.5);
      this.marks.push(dot);
      this.tweens.add({ targets: dot, scale: 1.3, duration: 400, yoyo: true, repeat: -1 });
      for (const x of m.caps) {
        const xm = this.add.image(this.sx(x), this.sy(x), 'xmark').setDisplaySize(30, 30).setDepth(16).setAlpha(0.7);
        this.marks.push(xm);
      }
    }
  }

  private candidates(): Move[] {
    return this.legal.filter((m) => m.from === this.sel && this.prefix.every((x, k) => m.path[k] === x));
  }

  private deselect(): void {
    if (this.state !== 'player' || this.sel < 0) return;
    this.sel = -1; this.prefix = [];
    this.showMarks();
  }

  private select(f: number): void {
    this.sel = f; this.prefix = [];
    this.sfxAt('pick', this.sx(f), { volume: 0.5 });
    const s = this.sprites[f];
    if (s) this.tweens.add({ targets: s, scale: 1.12, duration: 90, yoyo: true });
    // keyboard flow: the cursor jumps to the first destination, Space plays it
    const c = this.candidates();
    if (c.length) this.cur = c[0].path[0];
    this.placeCursor();
    this.showMarks();
  }

  private nearest(from: number, list: number[]): number {
    const vr = Math.floor(this.view(from) / 8), vc = this.view(from) % 8;
    let best = list[0], bd = 1e9;
    for (const x of list) {
      const d = Math.abs(Math.floor(this.view(x) / 8) - vr) + Math.abs((this.view(x) % 8) - vc);
      if (d < bd) { bd = d; best = x; }
    }
    return best;
  }

  private tap(i: number): void {
    if (this.state !== 'player' || this.isOver) return;
    this.placeCursor();
    const froms = [...new Set(this.legal.map((m) => m.from))];
    if (froms.includes(i) && i !== this.sel) { this.select(i); return; }
    // nothing selected and the square is the destination of exactly one move: play it
    if (this.sel < 0 && !this.board[i]) {
      const direct = this.legal.filter((m) => m.path[m.path.length - 1] === i);
      if (direct.length === 1) { this.commit(direct[0]); return; }
    }
    if (this.sel >= 0) {
      const cands = this.candidates();
      const k = this.prefix.length;
      const ends = cands.filter((m) => m.path[m.path.length - 1] === i);
      if (ends.length && (ends.length === 1 || ends.every((m) => m.caps.join() === ends[0].caps.join()) || !cands.some((m) => m.path[k] === i && m.path.length - 1 > k))) {
        this.commit(ends[0]);
        return;
      }
      const steps = cands.filter((m) => m.path[k] === i);
      if (steps.length) {
        this.prefix.push(i);
        this.sfx('move', { volume: 0.4 });
        const left = this.candidates();
        if (left.length === 1) { this.commit(left[0]); return; }
        this.cur = left[0].path[k + 1];
        this.placeCursor();
        this.showMarks();
        return;
      }
      if (i === this.sel) {
        // the cursor sits on the selected piece: Space plays its first move
        const first = cands[0];
        if (first) { this.cur = first.path[k]; this.placeCursor(); }
        return;
      }
    }
    // not a legal choice: own piece that can't move, or an empty square
    const p = this.board[i];
    if (p && Math.sign(p) === this.mine) {
      this.sfx('error', { volume: 0.5 });
      if (this.legal[0]?.caps.length) popup(this, this.sx(i), this.sy(i) - 40, t('mustTake'), '#ff7a4a', 22);
      this.marks.forEach((m) => { if (m instanceof Phaser.GameObjects.Arc) this.tweens.add({ targets: m, alpha: 0.2, duration: 120, yoyo: true, repeat: 1 }); });
      return;
    }
    // assist: jump to the nearest sensible square (a destination, or a movable piece)
    if (this.sel >= 0) {
      const c = this.candidates().map((m) => m.path[this.prefix.length]);
      if (c.length) { this.cur = this.nearest(i, c); this.placeCursor(); this.sfx('move', { volume: 0.35 }); return; }
    }
    this.select(this.nearest(i, froms));
  }

  private commit(m: Move): void {
    if (this.online) net.send('mv', { f: m.from, p: m.path, n: this.moveNo } satisfies MoveMsg);
    this.play(m);
  }

  private play(m: Move): void {
    this.state = 'busy';
    this.moveNo++;
    this.cursor.setVisible(false);
    this.clearMarks();
    const mover = this.board[m.from] > 0 ? W : BL;
    if (this.online && mover === this.mine) this.status.setText(t('theirTurn')).setColor('#c49a6a');
    const wasMan = Math.abs(this.board[m.from]) === 1;
    const sprite = this.sprites[m.from]!;
    this.sprites[m.from] = null;
    sprite.setDepth(20);
    const promote = apply(this.board, m);
    this.quiet = m.caps.length || wasMan ? 0 : this.quiet + 1;
    const to = m.path[m.path.length - 1];

    // last-move squares
    this.lastFx.forEach((o) => o.destroy());
    this.lastFx = [m.from, to].map((x) => this.add.rectangle(this.sx(x), this.sy(x), CELL, CELL, 0xffd23f, 0.22).setDepth(1));

    // hop along the path; jumped pieces dim as they are passed and leave together at the end
    const hop = m.caps.length ? 230 : 200;
    const tweens: Phaser.Types.Tweens.TweenBuilderConfig[] = m.path.map((sq, k) => ({
      targets: sprite, x: this.sx(sq), y: this.sy(sq), duration: hop, ease: 'Quad.easeInOut',
      onComplete: () => {
        this.sfxAt(m.caps.length ? 'jump' : rng.chance(0.5) ? 'place' : 'place2', sprite.x, { volume: 0.7, rate: m.caps.length ? 1 + k * 0.08 : undefined });
        const victim = m.caps[k];
        if (victim !== undefined) {
          const v = this.sprites[victim];
          if (v) { v.setAlpha(0.45); this.tweens.add({ targets: v, angle: 15, duration: 80, yoyo: true }); }
        }
      },
    }));
    tweens.unshift({ targets: sprite, scale: 1.15, duration: 80 });
    tweens.push({ targets: sprite, scale: 1, duration: 90 });
    this.tweens.chain({
      tweens,
      onComplete: () => {
        this.sprites[to] = sprite;
        sprite.setDepth(10);
        for (const x of m.caps) {
          const v = this.sprites[x];
          this.sprites[x] = null;
          if (!v) continue;
          burst(this, v.x, v.y, mover === W ? [0x333333, 0x777777] : [0xffffff, 0xd8d0c0], 14, 240);
          this.tweens.add({ targets: v, scale: 0, alpha: 0, angle: 180, duration: 260, onComplete: () => v.destroy() });
        }
        if (m.caps.length) {
          this.sfx('capture', { volume: 0.6 });
          shake(this, 0.003 + m.caps.length * 0.003, 160);
          if (mover === this.mine) {
            this.captured += m.caps.length;
            if (!this.online) this.addScore(10 * m.caps.length * m.caps.length, sprite.x, sprite.y - 50);
            if (m.caps.length >= 2) popup(this, sprite.x, sprite.y - 90, `x${m.caps.length}!`, '#ff7a4a', 30);
          }
        }
        if (promote) {
          this.crownPiece(sprite, mover === W ? 'pc-w' : 'pc-b');
          this.sfx('king', { volume: 0.6 });
          burst(this, sprite.x, sprite.y, [0xffd23f, 0xffffff], 22, 280);
          popup(this, sprite.x, sprite.y - 60, t('dama'), '#ffd23f', 30);
          if (mover === this.mine && !this.online) this.addScore(50);
        }
        this.updateHud();
        this.time.delayedCall(120, () => this.nextTurn(-mover));
      },
    });
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  /** winner: W / BL, or 0 for a draw. */
  private finish(winner: number): void {
    this.state = 'busy';
    this.status.setText('');
    this.cursor.setVisible(false);
    this.clearMarks();
    const cx = this.scale.width / 2;
    const win = winner === this.mine;
    const me = count(this.board, this.mine);
    if (winner === 0) { this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw'); }
    else if (win) {
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      this.time.delayedCall(300, () => this.sfx('win'));
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(BX, BX + 8 * CELL), rng.int(BY, BY + 8 * CELL), [0xffd23f, 0xffffff, 0x5dff7a], 20, 300));
    } else {
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.02, 350);
      this.time.delayedCall(300, () => this.sfx('lose'));
    }
    if (this.online) {
      this.setScore(win ? 200 + (me.men + me.kings) * 15 : this.captured * 10);
      this.endGame({ win, title: winner === 0 ? t('draw') : win ? t('youWin') : t('youLose'), draw: winner === 0, delay: 2200 });
      return;
    }
    if (win) {
      this.streak++;
      this.addScore(200 * (this.level + 1) + (me.men + me.kings * 2) * 15 + this.streak * 50, cx, BY - 20);
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
    } else if (winner) { this.lives--; this.streak = 0; }
    else this.addScore(60, cx, BY - 20);
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2200 }); return; }
    this.time.delayedCall(2400, () => {
      if (this.isOver) return;
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
      this.sfx('clear', { volume: 0.6 });
      this.sprites.forEach((s) => { if (s) this.tweens.add({ targets: s, scale: 0, angle: 180, duration: 300, delay: rng.int(0, 250) }); });
      this.time.delayedCall(650, () => { if (!this.isOver) this.startRound(); });
    });
  }

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
