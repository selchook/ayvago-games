import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net, upper } from '@core';
import { LEVELS, initial, legal, play, store, pitsOf, other, choose, isStore, type Board, type Side, type Result } from './rules';
import { makeStoneTextures, drawBoard } from './art';

// Layout (720 x 1280). View cells: 0..5 my pits (bottom, left to right), 6 my store (right),
// 7..12 rival pits (top, right to left), 13 rival store (left). Online, the guest's board is
// turned around so each player sees their own pits at the bottom.
const BX = 14, BY = 400, BW = 692, BH = 460;
const PIT_W = 78, PIT_H = 184, STORE_W = 86, STORE_H = 410;
const MID = BY + BH / 2, ROW_TOP = MID - 102, ROW_BOT = MID + 102;
const STONE_SCALE = 1.2;
export const BOARD = { x: BX, y: BY, w: BW, h: BH, mid: MID };

export function cellRect(v: number): { x: number; y: number; w: number; h: number } {
  if (v === 6) return { x: 658, y: MID, w: STORE_W, h: STORE_H };
  if (v === 13) return { x: 62, y: MID, w: STORE_W, h: STORE_H };
  if (v < 6) return { x: 150 + 84 * v, y: ROW_BOT, w: PIT_W, h: PIT_H };
  return { x: 150 + 84 * (12 - v), y: ROW_TOP, w: PIT_W, h: PIT_H };
}

/** Stone positions inside a cell, filled from the middle out. */
function makeSlots(w: number, h: number): Array<[number, number]> {
  const step = 22, pts: Array<[number, number]> = [];
  for (let r = -12; r <= 12; r++) for (let c = -4; c <= 4; c++) {
    const x = c * step + (r & 1 ? step / 2 : 0), y = r * step * 0.86;
    if (Math.abs(x) <= w / 2 - 16 && Math.abs(y) <= h / 2 - 18) pts.push([x, y]);
  }
  return pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] * 0.35 - (b[0] * b[0] + b[1] * b[1] * 0.35));
}
const PIT_SLOTS = makeSlots(PIT_W, PIT_H);
const STORE_SLOTS = makeSlots(STORE_W, STORE_H);

type State = 'player' | 'ai' | 'busy';
/** Online move: absolute pit and move number (guards against stale messages). */
interface MoveMsg { p: number; n: number }

export class PlayScene extends ArcadeScene {
  private board: Board = initial();
  private sprites: Phaser.GameObjects.Image[][] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private state: State = 'busy';
  private mine: Side = 0;
  private turn: Side = 0;
  private cur = 0;
  private cursor!: Phaser.GameObjects.Rectangle;
  private marks!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private plateMe!: Phaser.GameObjects.Container;
  private plateThem!: Phaser.GameObjects.Container;
  private level = 0;
  private lives = 2;
  private streak = 0;
  private round = 0;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];
  private captured = 0;

  createGame(): void {
    const { width } = this.scale;
    makeStoneTextures(this);
    this.board = initial();
    this.sprites = Array.from({ length: 14 }, () => []);
    this.labels = [];
    this.state = 'busy'; this.mine = 0; this.turn = 0; this.cur = 0;
    this.level = 0; this.lives = 2; this.streak = 0; this.round = 0; this.captured = 0;
    this.online = net.active;
    this.moveNo = 0; this.inbox = [];
    this.mine = this.online ? (net.seat as Side) : 0;
    this.cameras.main.setBackgroundColor('#1d120b');

    // backdrop pattern
    const bg = this.add.graphics();
    for (let k = 0; k < 18; k++) bg.fillStyle(k % 2 ? 0x24160d : 0x1d120b, 1).fillRect(0, k * 72, width, 72);

    drawBoard(this.add.graphics(), BX, BY, BW, BH, cellRect);
    // sowing direction: along the bottom to the right, along the top to the left
    const ar = this.add.graphics().setAlpha(0.5);
    ar.fillStyle(0xffcf8a, 1);
    for (const x of [230, 360, 490]) {
      ar.fillTriangle(x + 12, BY + BH + 64, x - 6, BY + BH + 54, x - 6, BY + BH + 74);
      ar.fillTriangle(x - 12, BY - 64, x + 6, BY - 54, x + 6, BY - 74);
    }

    for (let v = 0; v < 14; v++) {
      const c = cellRect(v);
      const top = v >= 7 || v === 13;
      const y = top ? BY - 26 : BY + BH + 26;
      this.labels[v] = txt(this, c.x, y, '0', { title: true, size: isStore(v) ? 26 : 20, color: isStore(v) ? '#ffd23f' : '#f0c890' }).setDepth(5);
    }

    this.marks = this.add.graphics().setDepth(4);
    this.cursor = this.add.rectangle(0, 0, PIT_W + 14, PIT_H + 14).setStrokeStyle(5, 0xffd23f).setDepth(40).setVisible(false);
    this.tweens.add({ targets: this.cursor, alpha: 0.4, duration: 420, yoyo: true, repeat: -1 });

    this.status = txt(this, width / 2, 290, '', { title: true, size: 28, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 130, '', { size: 28, color: '#f0c890', wrap: 560 }).setDepth(30);
    this.banner = txt(this, width / 2, MID, '', { title: true, size: 48, strokeThickness: 10 }).setDepth(60).setVisible(false);

    const rival = this.online ? clip(net.peerName || t('opponent'), 14) : t('cpu');
    this.plateThem = this.plate(width / 2, 210, upper(rival), 0x3ee6ff);
    this.plateMe = this.plate(width / 2, 1000, t('you'), 0xff7a4a);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, 1110, touch ? t('touchHint') : t('keysHint'), { size: 26, color: '#c49a6a', wrap: 640 });
    txt(this, width / 2, 1180, t('rules'), { size: 22, color: '#8a6a4a', wrap: 660 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 120 && p.y < 120) return;
      for (let v = 0; v < 13; v++) {
        if (isStore(v)) continue;
        const c = cellRect(v);
        if (Math.abs(p.x - c.x) <= c.w / 2 + 4 && Math.abs(p.y - c.y) <= c.h / 2 + 10) { this.tapView(v); return; }
      }
    });
    const kb = this.input.keyboard;
    const mv = (d: number) => {
      if (this.state !== 'player') return;
      const opts = legal(this.board, this.mine).sort((a, b) => this.view(a) - this.view(b));
      if (!opts.length) return;
      const k = opts.indexOf(this.cur);
      this.cur = opts[Phaser.Math.Wrap((k < 0 ? 0 : k) + d, 0, opts.length)];
      this.placeCursor();
      this.sfx('move', { volume: 0.3 });
    };
    kb?.on('keydown-LEFT', () => mv(-1)); kb?.on('keydown-A', () => mv(-1));
    kb?.on('keydown-RIGHT', () => mv(1)); kb?.on('keydown-D', () => mv(1));
    for (const k of ['SPACE', 'ENTER', 'Z', 'UP', 'W']) kb?.on(`keydown-${k}`, () => this.pick(this.cur));

    if (this.online) {
      net.onScene(this, 'mv', (d: MoveMsg) => {
        if (!d || typeof d.p !== 'number' || typeof d.n !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }
    this.startRound();
  }

  private plate(x: number, y: number, name: string, color: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(20);
    const bg = this.add.rectangle(0, 0, 420, 76, 0x000000, 0.4).setStrokeStyle(4, color, 0.9);
    const label = txt(this, 0, 0, name, { title: true, size: 22, color: '#ffffff' });
    c.add([bg, label]);
    c.setData('bg', bg);
    c.setAlpha(0.55);
    return c;
  }

  // ---------------------------------------------------------------- view helpers
  private get off(): number { return this.mine === 0 ? 0 : 7; }
  private view(i: number): number { return (i + this.off) % 14; }
  private abs(v: number): number { return (v + 14 - this.off) % 14; }

  private slotPos(i: number, k: number): { x: number; y: number } {
    const c = cellRect(this.view(i));
    const slots = isStore(i) ? STORE_SLOTS : PIT_SLOTS;
    const s = slots[k % slots.length], layer = Math.floor(k / slots.length);
    const jx = ((k * 37) % 7) - 3, jy = ((k * 53) % 7) - 3;
    return { x: c.x + s[0] + jx + layer * 5, y: c.y + s[1] + jy - layer * 6 };
  }

  private updateLabels(): void {
    for (let i = 0; i < 14; i++) this.labels[this.view(i)].setText(String(this.sprites[i].length));
  }

  private bumpLabel(i: number): void {
    const l = this.labels[this.view(i)];
    l.setText(String(this.sprites[i].length));
    this.tweens.killTweensOf(l);
    l.setScale(1.35);
    this.tweens.add({ targets: l, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private placeCursor(): void {
    if (this.state !== 'player') { this.cursor.setVisible(false); return; }
    const c = cellRect(this.view(this.cur));
    this.cursor.setPosition(c.x, c.y).setVisible(true);
  }

  private showMarks(): void {
    const g = this.marks;
    g.clear();
    if (this.state !== 'player') return;
    for (const i of legal(this.board, this.mine)) {
      const c = cellRect(this.view(i));
      g.lineStyle(4, 0x5dff7a, 0.75).strokeRoundedRect(c.x - c.w / 2 - 3, c.y - c.h / 2 - 3, c.w + 6, c.h + 6, c.w / 2);
    }
  }

  private setActive(side: Side): void {
    const me = side === this.mine;
    for (const [p, on] of [[this.plateMe, me], [this.plateThem, !me]] as const) {
      this.tweens.killTweensOf(p);
      this.tweens.add({ targets: p, alpha: on ? 1 : 0.5, scale: on ? 1.06 : 1, duration: 200 });
    }
  }

  // ---------------------------------------------------------------- round flow
  private resetStones(): void {
    this.sprites.forEach((list) => list.forEach((s) => s.destroy()));
    this.sprites = Array.from({ length: 14 }, () => []);
    for (let i = 0; i < 14; i++) for (let k = 0; k < this.board[i]; k++) {
      const p = this.slotPos(i, k);
      const s = this.add.image(p.x, p.y, `mg-stone${rng.int(0, 5)}`).setDepth(10 + k * 0.01).setAngle(rng.int(0, 359)).setScale(0);
      this.tweens.add({ targets: s, scale: STONE_SCALE, duration: 260, delay: this.view(i) * 40 + k * 30, ease: 'Back.easeOut' });
      this.sprites[i].push(s);
    }
    this.updateLabels();
  }

  private updateInfo(): void {
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })}\n${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.board = initial();
    this.moveNo = 0;
    this.resetStones();
    this.updateInfo();
    this.banner.setVisible(false);
    // online: the round's starter (net.starter) moves first; solo: the player opens odd rounds
    const first: Side = this.online ? (net.starter as Side) : this.round % 2 === 1 ? this.mine : other(this.mine);
    this.cur = pitsOf(this.mine)[0];
    this.time.delayedCall(500, () => this.nextTurn(first));
  }

  private nextTurn(side: Side): void {
    if (this.isOver) return;
    this.turn = side;
    this.setActive(side);
    if (!legal(this.board, side).length) return this.finish();
    if (side === this.mine) {
      this.state = 'player';
      this.status.setText(t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.moveNo > 0) this.sfx('turn', { volume: 0.45 });
      const opts = legal(this.board, this.mine);
      if (!opts.includes(this.cur)) this.cur = opts[0];
      this.placeCursor();
      this.showMarks();
    } else {
      this.state = 'ai';
      this.cursor.setVisible(false);
      this.marks.clear();
      this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#7fd8ff');
      if (this.online) this.takeRemote();
      else this.time.delayedCall(rng.int(450, 800), () => this.aiMove());
    }
  }

  private aiMove(): void {
    if (this.isOver || this.state !== 'ai') return;
    this.move(other(this.mine), choose(this.board, other(this.mine), this.level));
  }

  private takeRemote(): void {
    while (this.state === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo) continue;
      if (!legal(this.board, other(this.mine)).includes(d.p)) continue;
      this.move(other(this.mine), d.p);
    }
  }

  private tapView(v: number): void {
    if (this.isOver) return;
    const i = this.abs(v);
    if (v >= 7) {
      if (this.state === 'player') {
        this.sfx('error', { volume: 0.4 });
        const c = cellRect(v);
        popup(this, c.x, c.y - 40, t('notYours'), '#ff7a4a', 22);
      }
      return;
    }
    this.cur = i;
    this.pick(i);
  }

  private pick(i: number): void {
    if (this.state !== 'player' || this.isOver) return;
    if (!pitsOf(this.mine).includes(i)) return;
    if (this.board[i] === 0) {
      this.sfx('error', { volume: 0.4 });
      const c = cellRect(this.view(i));
      this.tweens.add({ targets: this.labels[this.view(i)], x: c.x + 6, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    if (this.online) net.send('mv', { p: i, n: this.moveNo } satisfies MoveMsg);
    this.move(this.mine, i);
  }

  private move(side: Side, pit: number): void {
    this.state = 'busy';
    this.moveNo++;
    this.cursor.setVisible(false);
    this.marks.clear();
    if (side === this.mine) this.status.setText('');
    const r = play(this.board, side, pit);
    this.animate(side, pit, r, () => {
      this.board = r.board;
      this.syncSprites();
      if (r.over) { this.finish(); return; }
      if (r.again) {
        const c = cellRect(this.view(store(side)));
        popup(this, c.x, c.y - 180, t('again'), side === this.mine ? '#5dff7a' : '#7fd8ff', 26);
        this.sfx('again', { volume: 0.5 });
      }
      this.time.delayedCall(r.again ? 350 : 150, () => this.nextTurn(r.again ? side : other(side)));
    });
  }

  /** Stones of `i` that land in the local player's store score 5 each. */
  private gain(cell: number, n: number, x: number, y: number): void {
    if (cell !== store(this.mine) || n <= 0) return;
    this.captured += n;
    this.addScore(5 * n);
    if (n > 1) popup(this, x, y - 40, `+${5 * n}`, '#ffd23f', 26);
  }

  private animate(side: Side, pit: number, r: Result, done: () => void): void {
    const taken = this.sprites[pit].splice(0);
    this.bumpLabel(pit);
    const total = r.path.length;
    const step = Phaser.Math.Clamp(200 - total * 8, 95, 180);
    const lift = 150;
    const hover = (cell: number, j: number) => {
      // the hand floats just over the cell, the stones bunched up in it
      const c = cellRect(this.view(cell));
      return { x: c.x + ((j * 13) % 25) - 12, y: c.y - 34 + ((j * 7) % 15) - 7 };
    };
    this.sfxAt('pick', cellRect(this.view(pit)).x, { volume: 0.6 });
    taken.forEach((s, j) => {
      s.setDepth(50 + j * 0.01);
      const h = hover(pit, j);
      this.tweens.add({ targets: s, x: h.x, y: h.y, scale: STONE_SCALE * 1.15, duration: lift, ease: 'Quad.easeOut' });
    });
    const c0 = cellRect(this.view(pit));
    this.tweens.add({ targets: this.labels[this.view(pit)], alpha: 0.4, duration: 100, yoyo: true });
    burst(this, c0.x, c0.y, [0xffcf8a, 0xffffff], 6, 120);

    r.path.forEach((cell, k) => {
      this.time.delayedCall(lift + k * step, () => {
        const s = taken[k];
        const p = this.slotPos(cell, this.sprites[cell].length);
        this.sprites[cell].push(s);
        this.tweens.killTweensOf(s);
        this.tweens.add({
          targets: s, x: p.x, y: p.y, scale: STONE_SCALE, duration: step * 0.85, ease: 'Quad.easeIn',
          onComplete: () => {
            s.setDepth(10 + this.sprites[cell].indexOf(s) * 0.01);
            this.bumpLabel(cell);
            const cx = cellRect(this.view(cell)).x;
            this.sfxAt(isStore(cell) ? 'store' : 'drop', cx, { volume: 0.55, rate: Math.min(1.6, 0.92 + k * 0.035) });
            if (isStore(cell)) {
              burst(this, s.x, s.y, [0xffd23f, 0xffffff], 5, 120);
              this.gain(cell, 1, s.x, s.y);
            }
          },
        });
        // the rest of the hand travels on with it
        for (let j = k + 1; j < taken.length; j++) {
          const h = hover(cell, j);
          this.tweens.add({ targets: taken[j], x: h.x, y: h.y, duration: step * 0.8, ease: 'Sine.easeInOut' });
        }
      });
    });

    const afterSow = lift + total * step + 160;
    this.time.delayedCall(afterSow, () => {
      if (this.isOver) return;
      let wait = 0;
      if (r.capture) {
        wait = this.collect(r.capture.from, store(side), side, r.capture.kind === 'even' ? t('even') : t('emptyPit'));
      }
      this.time.delayedCall(wait, () => {
        if (this.isOver) return;
        if (r.sweep) {
          const w = this.collect(r.sweep.from, store(r.sweep.to), r.sweep.to, t('sweep'));
          this.time.delayedCall(w + 200, done);
        } else done();
      });
    });
  }

  /** Moves the stones of `from` cells into store `to`; returns the time it takes. */
  private collect(from: Array<{ i: number; n: number }>, to: number, side: Side, label: string): number {
    const mine = side === this.mine;
    const stones: Phaser.GameObjects.Image[] = [];
    for (const f of from) {
      const c = cellRect(this.view(f.i));
      const g = this.add.graphics().setDepth(45);
      g.fillStyle(mine ? 0x5dff7a : 0xff4f5e, 0.35).fillRoundedRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, c.w / 2);
      this.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 200, onComplete: () => g.destroy() });
      stones.push(...this.sprites[f.i].splice(0));
      this.bumpLabel(f.i);
    }
    const sc = cellRect(this.view(to));
    const total = stones.length;
    this.sfxAt(mine ? 'capture' : 'steal', sc.x, { volume: 0.6 });
    popup(this, sc.x < 360 ? sc.x + 90 : sc.x - 90, sc.y - 120, `${label} +${total}`, mine ? '#5dff7a' : '#ff7a4a', 26);
    if (total >= 6) shake(this, 0.004 + Math.min(0.012, total * 0.0008), 200);
    stones.forEach((s, k) => {
      const p = this.slotPos(to, this.sprites[to].length);
      this.sprites[to].push(s);
      s.setDepth(50);
      this.tweens.add({
        targets: s, x: p.x, y: p.y, duration: 380, delay: 120 + k * 35, ease: 'Cubic.easeInOut',
        onComplete: () => {
          s.setDepth(10 + this.sprites[to].indexOf(s) * 0.01);
          this.bumpLabel(to);
          if (k % 3 === 0) this.sfxAt('store', sc.x, { volume: 0.35, rate: 1 + Math.min(0.5, k * 0.02) });
          if (k === total - 1) burst(this, sc.x, sc.y, mine ? [0x5dff7a, 0xffd23f, 0xffffff] : [0xff4f5e, 0xffffff], 18, 240);
        },
      });
    });
    if (to === store(this.mine)) this.gain(to, total, sc.x, sc.y - 120);
    return 120 + total * 35 + 420;
  }

  /** Safety net: the sprites always match the board after a move. */
  private syncSprites(): void {
    let same = true;
    for (let i = 0; i < 14; i++) if (this.sprites[i].length !== this.board[i]) same = false;
    if (same) return;
    const pool = this.sprites.flat();
    this.sprites = Array.from({ length: 14 }, () => []);
    for (let i = 0; i < 14; i++) for (let k = 0; k < this.board[i]; k++) {
      const s = pool.pop() ?? this.add.image(0, 0, `mg-stone${rng.int(0, 5)}`);
      const p = this.slotPos(i, k);
      s.setPosition(p.x, p.y).setScale(STONE_SCALE).setDepth(10 + k * 0.01);
      this.sprites[i].push(s);
    }
    pool.forEach((s) => s.destroy());
    this.updateLabels();
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private finish(): void {
    if (this.isOver) return;
    this.state = 'busy';
    this.cursor.setVisible(false);
    this.marks.clear();
    const me = this.board[store(this.mine)], them = this.board[store(other(this.mine))];
    this.status.setText(`${t('you')} ${me} – ${them} ${this.online ? clip(upper(net.peerName || t('opponent')), 10) : t('cpu')}`).setColor('#ffffff');
    const cx = this.scale.width / 2;
    const win = me > them, draw = me === them;
    if (draw) { this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw'); }
    else if (win) {
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      this.time.delayedCall(250, () => this.sfx('win'));
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(BX + 60, BX + BW - 60), rng.int(BY + 40, BY + BH - 40), [0xffd23f, 0xffffff, 0x5dff7a], 20, 300));
    } else {
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); shake(this, 0.015, 300);
      this.time.delayedCall(250, () => this.sfx('lose'));
    }
    if (this.online) {
      if (win) this.addScore(200 + (me - them) * 10);
      this.endGame({ win, draw, title: draw ? t('draw') : win ? t('youWin') : t('youLose'), delay: 2400 });
      return;
    }
    if (win) {
      this.streak++;
      this.addScore(100 * (this.level + 1) + (me - them) * 10 + this.streak * 25, cx, BY - 80);
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
    } else if (!draw) { this.lives--; this.streak = 0; }
    else this.addScore(50, cx, BY - 80);
    this.updateInfo();
    if (this.lives <= 0) { this.endGame({ delay: 2400 }); return; }
    this.time.delayedCall(2600, () => {
      if (this.isOver) return;
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
      this.sfx('clear', { volume: 0.6 });
      this.sprites.forEach((list) => list.forEach((s) => this.tweens.add({ targets: s, scale: 0, angle: 180, duration: 300, delay: rng.int(0, 250) })));
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
