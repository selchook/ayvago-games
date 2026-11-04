import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import {
  POS, MILLS, DRAW_PLIES, LEVELS, State, Move, newState, clone, count, apply, result, moves,
  targets, closesMill, removable, flying, millsAt, choose,
} from './rules';
import { think, nextToken } from './ai-client';

const U = 100;                      // grid unit
const BX = 60, BY = 340;            // grid origin (point [0, 0])
const STONE = 66;
const HAND_STONE = 40;
const ME_Y = 1035, OPP_Y = 250;

type Turn = 'player' | 'ai' | 'busy';
/** Player sub-step while it is their turn. */
type Step = 'pick' | 'dest' | 'take';
interface MoveMsg { f: number; t: number; x: number; n: number }

export function makeMorrisTextures(scene: Phaser.Scene): void {
  const stone = (key: string, light: string, mid: string, dark: string, ring: string) => {
    if (scene.textures.exists(key)) return;
    const s = 80, tex = scene.textures.createCanvas(key, s, s)!, ctx = tex.getContext();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(42, 45, 34, 0, Math.PI * 2); ctx.fill();
    const gr = ctx.createRadialGradient(28, 26, 4, 40, 40, 38);
    gr.addColorStop(0, light); gr.addColorStop(0.45, mid); gr.addColorStop(1, dark);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(40, 40, 35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(40, 40, 22, 0, Math.PI * 2); ctx.stroke();
    tex.refresh();
  };
  stone('mm-1', '#fff8e8', '#efe2c4', '#9c8a66', 'rgba(140,110,60,0.6)');
  stone('mm-2', '#8a6a5a', '#3a2620', '#120806', 'rgba(255,200,150,0.35)');
}

export class PlayScene extends ArcadeScene {
  private st: State = newState();
  private stones: Array<Phaser.GameObjects.Image | null> = [];
  private hands: Phaser.GameObjects.Image[][] = [[], [], []];
  private turn: Turn = 'busy';
  private step: Step = 'pick';
  private sel = -1;
  private pending: { f: number; t: number } | null = null;
  private cur = 0;
  private cursor!: Phaser.GameObjects.Arc;
  private selRing!: Phaser.GameObjects.Arc;
  private dots!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private nameMe!: Phaser.GameObjects.Text;
  private nameOpp!: Phaser.GameObjects.Text;
  private level = 0;
  private lives = 3;
  private streak = 0;
  private round = 0;
  private captures = 0;
  private myMoves = 0;
  private mine: 1 | 2 = 1;
  private online = false;
  private moveNo = 0;
  private inbox: MoveMsg[] = [];
  private extras: Phaser.GameObjects.GameObject[] = [];
  /** Id of the AI request this turn waits for (answers to older ones are dropped). */
  private aiToken = 0;

  createGame(): void {
    const { width } = this.scale;
    this.st = newState();
    this.stones = new Array(24).fill(null);
    this.hands = [[], [], []];
    this.turn = 'busy'; this.step = 'pick'; this.sel = -1; this.pending = null; this.cur = 0;
    this.level = 0; this.lives = 3; this.streak = 0; this.round = 0; this.captures = 0; this.myMoves = 0;
    this.online = net.active; this.mine = 1; this.moveNo = 0; this.inbox = []; this.extras = []; this.aiToken = 0;
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#1a1410');
    makeMorrisTextures(this);
    this.drawBoard();

    this.dots = this.add.graphics().setDepth(8);
    this.selRing = this.add.circle(0, 0, STONE / 2 + 8).setStrokeStyle(5, 0x5dff7a).setDepth(12).setVisible(false);
    this.cursor = this.add.circle(0, 0, STONE / 2 + 12).setStrokeStyle(4, 0xffd23f).setDepth(13).setVisible(false);
    this.tweens.add({ targets: this.cursor, scale: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.status = txt(this, width / 2, 130, '', { title: true, size: 26, color: '#ffd23f' }).setDepth(30);
    this.info = txt(this, width / 2, 180, '', { size: 28, color: '#e0c49a' }).setDepth(30);
    this.banner = txt(this, width / 2, 130, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(40).setVisible(false);
    this.prompt = txt(this, width / 2, 1110, '', { size: 30, color: '#ffe9b8', wrap: 660 }).setDepth(30);
    this.nameOpp = txt(this, 40, OPP_Y, '', { title: true, size: 18 }).setOrigin(0, 0.5);
    this.nameMe = txt(this, 40, ME_Y, '', { title: true, size: 18 }).setOrigin(0, 0.5);
    const touch = this.sys.game.device.input.touch;
    txt(this, width / 2, 1200, touch ? t('touchHint') : t('keysHint'), { size: 24, color: '#b89a72', wrap: 660 });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const i = this.pointAt(p.x, p.y);
      if (i >= 0 && i !== this.cur) { this.cur = i; this.placeCursor(); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const i = this.pointAt(p.x, p.y);
      if (i < 0) return;
      this.cur = i; this.placeCursor();
      this.act(i);
    });
    const kb = this.input.keyboard;
    const mv = (dx: number, dy: number) => this.moveCursor(dx, dy);
    kb?.on('keydown-LEFT', () => mv(-1, 0)); kb?.on('keydown-A', () => mv(-1, 0));
    kb?.on('keydown-RIGHT', () => mv(1, 0)); kb?.on('keydown-D', () => mv(1, 0));
    kb?.on('keydown-UP', () => mv(0, -1)); kb?.on('keydown-W', () => mv(0, -1));
    kb?.on('keydown-DOWN', () => mv(0, 1)); kb?.on('keydown-S', () => mv(0, 1));
    for (const k of ['SPACE', 'ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.act(this.cur));
    kb?.on('keydown-X', () => this.deselect());

    if (this.online) {
      net.onScene(this, 'mv', (d: MoveMsg) => {
        if (!d || typeof d.t !== 'number') return;
        this.inbox.push(d);
        this.takeRemote();
      });
    }
    this.startRound();
  }

  // ---------------------------------------------------------------- drawing / geometry
  private px(i: number): number { return BX + POS[i][0] * U; }
  private py(i: number): number { return BY + POS[i][1] * U; }

  private drawBoard(): void {
    const g = this.add.graphics().setDepth(0);
    const W = 6 * U, pad = 50;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BX - pad + 8, BY - pad + 10, W + pad * 2, W + pad * 2, 22);
    g.fillStyle(0xc8924e).fillRoundedRect(BX - pad, BY - pad, W + pad * 2, W + pad * 2, 22);
    for (let k = 0; k < 12; k++) {
      g.fillStyle(k % 2 ? 0xbe8846 : 0xd09a56, 0.6).fillRect(BX - pad + 8, BY - pad + 12 + k * ((W + pad * 2 - 24) / 12), W + pad * 2 - 16, 26);
    }
    g.lineStyle(5, 0x7a4c1e).strokeRoundedRect(BX - pad, BY - pad, W + pad * 2, W + pad * 2, 22);
    g.lineStyle(7, 0x4a2c10, 1);
    for (const m of MILLS) g.lineBetween(this.px(m[0]), this.py(m[0]), this.px(m[2]), this.py(m[2]));
    for (let i = 0; i < 24; i++) {
      g.fillStyle(0x4a2c10).fillCircle(this.px(i), this.py(i), 13);
      g.fillStyle(0xe8c48a).fillCircle(this.px(i), this.py(i), 6);
    }
  }

  private pointAt(x: number, y: number): number {
    let best = -1, bd = 58;
    for (let i = 0; i < 24; i++) {
      const d = Math.hypot(this.px(i) - x, this.py(i) - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Keyboard: jump to the nearest point in the pressed direction. */
  private moveCursor(dx: number, dy: number): void {
    const [x0, y0] = POS[this.cur];
    let best = -1, bs = Infinity;
    for (let i = 0; i < 24; i++) {
      if (i === this.cur) continue;
      const ddx = POS[i][0] - x0, ddy = POS[i][1] - y0;
      const along = ddx * dx + ddy * dy;
      if (along <= 0) continue;
      const side = Math.abs(ddx * dy - ddy * dx);
      const score = along + side * 2.5;
      if (score < bs) { bs = score; best = i; }
    }
    if (best < 0) return;
    this.cur = best; this.placeCursor();
    if (this.turn === 'player') this.sfx('move', { volume: 0.3 });
  }

  private placeCursor(): void {
    this.cursor.setPosition(this.px(this.cur), this.py(this.cur)).setVisible(this.turn === 'player');
  }

  private texOf(p: number): string { return p === 1 ? 'mm-1' : 'mm-2'; }

  private layoutHands(): void {
    for (const p of [1, 2] as const) {
      const row = this.hands[p];
      const y = p === this.mine ? ME_Y : OPP_Y;
      while (row.length > this.st.hand[p]) row.pop()!.destroy();
      while (row.length < this.st.hand[p]) row.push(this.add.image(0, y, this.texOf(p)).setDisplaySize(HAND_STONE, HAND_STONE).setDepth(5));
      row.forEach((s, k) => s.setPosition(680 - k * 44, y));
    }
  }

  // ---------------------------------------------------------------- flow
  private updateHud(): void {
    const peer = clip(net.peerName || t('opponent'), 10);
    const opp = 3 - this.mine;
    const onB = (p: number) => count(this.st, p);
    this.nameMe.setText(`${t('you')} · ${onB(this.mine)}`);
    this.nameOpp.setText(`${this.online ? peer : t('cpu')} · ${onB(opp)}`);
    this.layoutHands();
    if (this.online) { this.info.setText(t('vs', { name: net.peerName || t('opponent') })); return; }
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.info.setText(`${t('lv', { n: this.level + 1 })} · ${t('rival', { name: t('d' + this.level) })} · ${t('streak', { n: this.streak })}`);
  }

  private startRound(): void {
    this.round++;
    this.captures = 0; this.myMoves = 0; this.moveNo = 0;
    this.st = newState();
    // the round's starter plays the light stones, which move first
    this.mine = this.online ? (net.myTurnFirst ? 1 : 2) : (this.round % 2 === 1 ? 1 : 2);
    this.hands.forEach((row) => row.forEach((s) => s.destroy()));
    this.hands = [[], [], []];
    this.cur = 0;
    this.updateHud();
    for (const p of [1, 2]) this.hands[p].forEach((s, k) => {
      const y = s.y;
      s.setY(y + (p === this.mine ? 80 : -80)).setAlpha(0);
      this.tweens.add({ targets: s, y, alpha: 1, duration: 300, delay: k * 40, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(500, () => this.setTurn(this.mine === 1 ? 'player' : 'ai'));
  }

  private setTurn(s: Turn): void {
    if (this.isOver) return;
    this.turn = s;
    this.step = 'pick'; this.sel = -1; this.pending = null;
    this.selRing.setVisible(false);
    if (s === 'player') {
      // keyboard: start on a useful point
      const useful = this.st.hand[this.mine] > 0 ? this.st.board[this.cur] === 0 : this.st.board[this.cur] === this.mine;
      if (!useful) {
        const want = this.st.hand[this.mine] > 0 ? 0 : this.mine;
        const k = this.st.board.findIndex((v) => v === want);
        if (k >= 0) this.cur = k;
      }
      this.status.setText(t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      if (this.moveNo > 0) this.sfx('turn', { volume: 0.4 });
    } else {
      this.status.setText(this.online ? t('theirTurn') : t('aiTurn')).setColor('#b89a72');
      if (this.online) this.takeRemote();
      else this.aiMove();
    }
    this.placeCursor();
    this.refreshPrompt();
  }

  private refreshPrompt(): void {
    this.dots.clear();
    if (this.turn !== 'player') { this.prompt.setText(''); return; }
    const p = this.mine;
    let key = 'pPlace';
    let show: number[] = [];
    if (this.step === 'take') { key = 'pTake'; show = removable(this.boardAfterPending(), 3 - p); }
    else if (this.st.hand[p] > 0) { key = 'pPlace'; }
    else if (this.step === 'dest') { key = flying(this.st, p) ? 'pFly' : 'pDest'; show = targets(this.st, p, this.sel); }
    else { key = flying(this.st, p) ? 'pFlyPick' : 'pPick'; }
    this.prompt.setText(t(key));
    for (const i of show) {
      if (this.step === 'take') this.dots.lineStyle(5, 0xec3013, 0.9).strokeCircle(this.px(i), this.py(i), STONE / 2 + 6);
      else this.dots.fillStyle(0x5dff7a, 0.75).fillCircle(this.px(i), this.py(i), 14);
    }
  }

  private boardAfterPending(): Int8Array {
    const b = this.st.board.slice();
    if (this.pending) { if (this.pending.f >= 0) b[this.pending.f] = 0; b[this.pending.t] = this.mine; }
    return b;
  }

  private deselect(): void {
    if (this.turn !== 'player' || this.step !== 'dest') return;
    this.step = 'pick'; this.sel = -1;
    this.selRing.setVisible(false);
    this.sfx('move', { volume: 0.3 });
    this.refreshPrompt();
  }

  private nope(i: number): void {
    this.sfx('error', { volume: 0.5 });
    this.tweens.add({ targets: this.cursor, x: this.px(i) + 6, duration: 45, yoyo: true, repeat: 2, onComplete: () => this.placeCursor() });
  }

  /** A tap / Space on point i during my turn. */
  private act(i: number): void {
    if (this.turn !== 'player' || this.isOver) return;
    const p = this.mine, b = this.st.board;
    if (this.step === 'take') {
      const rem = removable(this.boardAfterPending(), 3 - p);
      if (!rem.includes(i)) { this.nope(i); return; }
      this.commit({ f: this.pending!.f, t: this.pending!.t, x: i });
      return;
    }
    if (this.st.hand[p] > 0) {
      if (b[i]) { this.nope(i); return; }
      this.chooseStep(-1, i);
      return;
    }
    if (b[i] === p) {
      if (!targets(this.st, p, i).length) { this.nope(i); return; }
      this.sel = i; this.step = 'dest';
      this.selRing.setPosition(this.px(i), this.py(i)).setVisible(true);
      this.tweens.add({ targets: this.stones[i], scale: (this.stones[i]?.scale ?? 1) * 1.12, duration: 90, yoyo: true });
      this.sfx('pick', { volume: 0.5 });
      this.refreshPrompt();
      return;
    }
    if (this.step === 'dest' && targets(this.st, p, this.sel).includes(i)) { this.chooseStep(this.sel, i); return; }
    this.nope(i);
  }

  private chooseStep(f: number, to: number): void {
    if (closesMill(this.st, f, to)) {
      const after = this.st.board.slice();
      if (f >= 0) after[f] = 0;
      after[to] = this.mine;
      if (removable(after, 3 - this.mine).length) {
        // show the stone in place, then ask which rival stone to take
        this.pending = { f, t: to };
        this.step = 'take';
        this.selRing.setVisible(false);
        this.previewStep(f, to);
        this.status.setText(t('mill')).setColor('#5dff7a');
        this.tweens.add({ targets: this.status, scale: { from: 1.4, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        this.sfx('mill', { volume: 0.6 });
        this.refreshPrompt();
        return;
      }
    }
    this.commit({ f, t: to, x: -1 });
  }

  /** Moves the stone on screen before the capture is chosen (the state changes on commit). */
  private previewStep(f: number, to: number): void {
    const x = this.px(to), y = this.py(to);
    if (f < 0) {
      const src = this.hands[this.mine].pop();
      const st = this.add.image(src?.x ?? x, src?.y ?? y, this.texOf(this.mine)).setDisplaySize(STONE, STONE).setDepth(10);
      src?.destroy();
      this.stones[to] = st;
      this.tweens.add({ targets: st, x, y, duration: 220, ease: 'Quad.easeOut' });
    } else {
      const st = this.stones[f]!;
      this.stones[f] = null; this.stones[to] = st;
      this.tweens.add({ targets: st, x, y, duration: 220, ease: 'Quad.easeOut' });
    }
    this.sfxAt('place', x, { volume: 0.7 });
    this.glowMills(to, this.boardAfterPending());
  }

  private commit(m: Move): void {
    this.myMoves++;
    if (this.online) net.send('mv', { ...m, n: this.moveNo } satisfies MoveMsg);
    const previewed = this.step === 'take';
    this.perform(m, previewed);
  }

  private takeRemote(): void {
    while (this.turn === 'ai' && !this.isOver && this.inbox.length) {
      const d = this.inbox.shift()!;
      if (d.n !== this.moveNo) continue;
      const m: Move = { f: d.f, t: d.t, x: d.x };
      if (!moves(this.st).some((k) => k.f === m.f && k.t === m.t && k.x === m.x)) continue;
      this.perform(m, false);
    }
  }

  /** Solo: the AI's turn. The search runs in a worker while a short "thinking" pause plays. */
  private aiMove(): void {
    if (this.isOver || this.turn !== 'ai') return;
    const token = (this.aiToken = nextToken());
    const delay = rng.int(350, 550), t0 = this.time.now;
    const level = Math.min(this.level, LEVELS.length - 1);
    const s = clone(this.st);
    const req = { board: Array.from(s.board), hand: s.hand, turn: s.turn, quiet: s.quiet, level };
    think<Move | null>(req, () => choose(clone(s), LEVELS[level]), LEVELS[level].ms + 1500).then((m) => {
      if (token !== this.aiToken || (!this.sys.isActive() && !this.sys.isPaused())) return;
      this.time.delayedCall(Math.max(0, delay - (this.time.now - t0)), () => {
        if (token !== this.aiToken || this.isOver || this.turn !== 'ai') return;
        // the worker's answer is plain data: check it against the rules before playing it
        const ok = m && moves(this.st).some((k) => k.f === m.f && k.t === m.t && k.x === m.x);
        const mv = ok ? m : choose(clone(this.st), LEVELS[0]);
        if (mv) this.perform({ f: mv.f, t: mv.t, x: mv.x }, false);
      });
    });
  }

  /** Applies a full move with its animation (placing or moving, then the capture). */
  private perform(m: Move, previewed: boolean): void {
    const who = this.st.turn;
    this.turn = 'busy';
    this.cursor.setVisible(false); this.selRing.setVisible(false);
    this.dots.clear(); this.prompt.setText('');
    apply(this.st, m);
    this.moveNo++;
    const x = this.px(m.t), y = this.py(m.t);
    let delay = 0;
    if (!previewed) {
      if (m.f < 0) {
        const src = this.hands[who].pop();
        const st = this.add.image(src?.x ?? x, src?.y ?? y, this.texOf(who)).setDisplaySize(HAND_STONE, HAND_STONE).setDepth(10);
        src?.destroy();
        this.stones[m.t] = st;
        this.tweens.add({ targets: st, x, y, displayWidth: STONE, displayHeight: STONE, duration: 260, ease: 'Quad.easeOut' });
      } else {
        const st = this.stones[m.f]!;
        this.stones[m.f] = null; this.stones[m.t] = st;
        this.tweens.add({ targets: st, x, y, duration: 260, ease: 'Quad.easeOut' });
      }
      this.time.delayedCall(250, () => {
        this.sfxAt(rng.chance(0.5) ? 'place' : 'place2', x, { volume: 0.7 });
        burst(this, x, y, who === 1 ? [0xfff2d8, 0xe0c090] : [0x5a3a2a, 0x2a1810], 6, 110);
      });
      delay = 300;
    }
    this.time.delayedCall(delay, () => {
      if (m.x >= 0) {
        if (!previewed) { this.glowMills(m.t, this.st.board); this.sfx('mill', { volume: 0.6 }); }
        this.time.delayedCall(previewed ? 0 : 380, () => this.capture(m.x, who));
        this.time.delayedCall(previewed ? 450 : 830, () => this.afterMove());
      } else this.afterMove();
    });
  }

  private glowMills(at: number, board: Int8Array): void {
    for (const m of millsAt(board, at)) {
      const g = this.add.graphics().setDepth(9);
      g.lineStyle(16, 0xffd23f, 0.75).lineBetween(this.px(m[0]), this.py(m[0]), this.px(m[2]), this.py(m[2]));
      this.tweens.add({ targets: g, alpha: 0, delay: 600, duration: 500, onComplete: () => g.destroy() });
      for (const k of m) burst(this, this.px(k), this.py(k), [0xffd23f, 0xffffff], 8, 160);
    }
  }

  private capture(i: number, by: number): void {
    const st = this.stones[i];
    this.stones[i] = null;
    const x = this.px(i), y = this.py(i);
    burst(this, x, y, by === this.mine ? [0xec3013, 0xffd23f, 0xffffff] : [0xec3013, 0x777777], 24, 300);
    shake(this, 0.012, 220);
    this.sfxAt('capture', x, { volume: 0.7 });
    if (st) this.tweens.add({ targets: st, scale: st.scale * 1.5, alpha: 0, angle: 90, duration: 300, onComplete: () => st.destroy() });
    if (by === this.mine) {
      this.captures++;
      if (!this.online) this.addScore(10 * (this.level + 1), x, y - 40);
    }
  }

  private afterMove(): void {
    if (this.isOver) return;
    this.updateHud();
    const r = result(this.st);
    if (r) { this.finish(r); return; }
    // three stones left: flying starts
    const next = this.st.turn;
    if (this.st.hand[next] === 0 && count(this.st, next) === 3 && this.st.hand[3 - next] + count(this.st, 3 - next) > 3) {
      popup(this, 360, next === this.mine ? ME_Y - 60 : OPP_Y + 60, t('flyNow'), '#3ee6ff', 30);
    }
    if (this.st.quiet === DRAW_PLIES - 10) popup(this, 360, 1110, t('drawSoon'), '#3ee6ff', 26);
    this.setTurn(next === this.mine ? 'player' : 'ai');
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  private finish(r: number): void {
    this.turn = 'busy';
    this.status.setText(''); this.prompt.setText('');
    const winner = r === 3 ? 0 : r;
    const win = winner === this.mine;
    const loser = 3 - winner;
    if (winner) {
      // the loser's stones tumble
      this.stones.forEach((s, i) => {
        if (s && this.st.board[i] === loser) this.tweens.add({ targets: s, angle: rng.int(-40, 40), y: s.y + 12, alpha: 0.5, duration: 400, delay: rng.int(0, 300) });
      });
      shake(this, 0.015, 300);
    }
    const reason = winner ? (count(this.st, loser) + this.st.hand[loser] < 3 ? t('rTwo') : t('rBlocked')) : t('rQuiet');
    popup(this, 360, 1110, reason, '#ffe9b8', 28);
    const cx = this.scale.width / 2;
    if (this.online) {
      if (!winner) { this.showBanner(t('roundDraw'), '#3ee6ff'); this.setScore(25); this.sfx('draw'); }
      else if (win) {
        this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
        this.setScore(100 + this.captures * 10 + count(this.st, this.mine) * 15);
        this.time.delayedCall(500, () => this.sfx('win'));
      } else { this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200); this.time.delayedCall(500, () => this.sfx('lose')); }
      this.endGame({ win, title: !winner ? t('draw') : win ? t('youWin') : t('youLose'), draw: !winner, delay: 2400 });
      return;
    }
    if (win) {
      this.streak++;
      const pts = 100 * (this.level + 1) + count(this.st, this.mine) * 15 + this.streak * 25;
      this.time.delayedCall(500, () => { this.addScore(pts, cx, BY - 60); this.sfx('win'); });
      this.level = Math.min(this.level + 1, LEVELS.length - 1);
      this.showBanner(t('roundWin'), '#5dff7a'); flash(this, 0x5dff7a, 150);
      if (this.streak >= 2) popup(this, cx, BY + 140, t('streak', { n: this.streak }), '#ffd23f', 34);
    } else if (winner) {
      this.lives--; this.streak = 0;
      this.showBanner(t('roundLose'), '#ec3013'); flash(this, 0xec3013, 200);
      this.time.delayedCall(500, () => this.sfx('lose'));
    } else {
      this.addScore(30, cx, BY - 60);
      this.showBanner(t('roundDraw'), '#3ee6ff'); this.sfx('draw');
    }
    this.updateHud();
    if (this.lives <= 0) { this.endGame({ delay: 2400 }); return; }
    this.time.delayedCall(2600, () => this.clearBoard());
  }

  private clearBoard(): void {
    if (this.isOver) return;
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 250, onComplete: () => this.banner.setVisible(false) });
    this.sfx('clear', { volume: 0.6 });
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
