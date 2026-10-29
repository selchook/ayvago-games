import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net, upper } from '@core';
import { Arena, COLS, ROWS, DX, DY, aiDir, makeObstacles } from './arena';

const CELL = 20;
const X0 = (720 - COLS * CELL) / 2;
const Y0 = 126;
const FW = COLS * CELL, FH = ROWS * CELL;
const ME = 0x3ee6ff;
const OPP = 0xff8a2a;
const RIVAL_COLORS = [0xff8a2a, 0xffd23f, 0xff4fa3, 0xec3013, 0xb48cff];
const RIVALS = 5;
const TO_WIN = 3;                    // best of 5

type Phase = 'count' | 'run' | 'gap' | 'over';
interface Rider { from: [number, number]; to: [number, number]; d: number; alive: boolean; color: number }
interface StMsg { k: number; h: number[]; d: number[] }
interface RdMsg { r: number; sp: number; sw: number }
interface EndMsg { w: number; s: number[]; c: number[] }

export class PlayScene extends ArcadeScene {
  private arena = new Arena();
  private phase: Phase = 'count';
  private riders: Rider[] = [];            // local view: 0 = me, 1 = them
  private trails: Phaser.GameObjects.RenderTexture[] = [];
  private heads: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private live: Phaser.GameObjects.Rectangle[] = [];
  private walls!: Phaser.GameObjects.Graphics;
  private pips: Phaser.GameObjects.Arc[][] = [[], []];
  private oppName!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private interval = 100;
  private acc = 0;
  private lastTick = 0;
  private tickNo = 0;
  private round = 0;
  private rival = 0;
  private pts = [0, 0];
  private survived = 0;
  private swipe: { x: number; y: number } | null = null;
  // online
  private online = false;
  private host = true;
  private aimDir = 0;
  private aimAt = 0;

  createGame(): void {
    this.online = net.active;
    this.host = !this.online || net.isHost;
    this.useHud = !this.online;
    this.phase = 'count';
    this.riders = []; this.trails = []; this.heads = []; this.glows = []; this.live = []; this.pips = [[], []];
    this.acc = 0; this.lastTick = 0; this.tickNo = 0; this.round = 0; this.rival = 0; this.pts = [0, 0]; this.survived = 0;
    this.swipe = null; this.aimDir = 0; this.aimAt = 0;
    this.cameras.main.setBackgroundColor('#05040f');
    this.makeTextures();

    // neon floor
    const g = this.add.graphics();
    g.fillStyle(0x090720).fillRect(X0, Y0, FW, FH);
    g.lineStyle(1, 0x1d1850, 1);
    for (let x = 0; x <= COLS; x++) g.lineBetween(X0 + x * CELL, Y0, X0 + x * CELL, Y0 + FH);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(X0, Y0 + y * CELL, X0 + FW, Y0 + y * CELL);
    g.lineStyle(1, 0x2f2780, 1);
    for (let x = 0; x <= COLS; x += 5) g.lineBetween(X0 + x * CELL, Y0, X0 + x * CELL, Y0 + FH);
    for (let y = 0; y <= ROWS; y += 5) g.lineBetween(X0, Y0 + y * CELL, X0 + FW, Y0 + y * CELL);
    g.lineStyle(12, 0x8b5cff, 0.18).strokeRect(X0 - 4, Y0 - 4, FW + 8, FH + 8);
    g.lineStyle(4, 0xb48cff, 0.9).strokeRect(X0 - 2, Y0 - 2, FW + 4, FH + 4);
    this.walls = this.add.graphics().setDepth(2);

    for (let k = 0; k < 2; k++) {
      this.trails.push(this.add.renderTexture(X0, Y0, FW, FH).setOrigin(0).setDepth(3));
      this.live.push(this.add.rectangle(0, 0, 1, 1, 0xffffff).setOrigin(0).setDepth(4));
      this.glows.push(this.add.image(0, 0, 'glow').setDisplaySize(70, 70).setBlendMode('ADD').setDepth(5).setAlpha(0.6));
      this.heads.push(this.add.image(0, 0, 'bike').setDepth(6));
    }

    // match score: pips for each side
    const name = this.online ? upper((net.peerName || t('opponent')).slice(0, 14)) : '';
    txt(this, X0, 102, t('you'), { title: true, size: 16, color: '#3ee6ff' }).setOrigin(0, 0.5);
    this.oppName = txt(this, X0 + FW, 102, name, { title: true, size: 16, color: '#ff8a2a' }).setOrigin(1, 0.5);
    for (let k = 0; k < TO_WIN; k++) {
      this.pips[0].push(this.add.circle(X0 + 96 + k * 30, 102, 9).setStrokeStyle(3, ME));
      this.pips[1].push(this.add.circle(0, 102, 9).setStrokeStyle(3, OPP));
    }
    this.banner = txt(this, 360, Y0 + FH / 2, '', { title: true, size: 54, strokeThickness: 10 }).setDepth(40).setVisible(false);

    this.setupInput();
    if (this.online) this.setupNet();
    this.updateHud();
    if (this.host) this.time.delayedCall(400, () => this.startRound());
  }

  private makeTextures(): void {
    if (this.textures.exists('bike')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRoundedRect(2, 6, 18, 30, 6);
    g.fillStyle(0x000000, 0.45).fillRect(8, 12, 6, 14);
    g.fillStyle(0xffffff).fillCircle(11, 6, 5);
    g.generateTexture('bike', 22, 40);
    g.destroy();
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    const kb = this.input.keyboard;
    const abs = (d: number) => () => this.steer(d);
    kb?.on('keydown-UP', abs(0)); kb?.on('keydown-W', abs(0));
    kb?.on('keydown-RIGHT', abs(1)); kb?.on('keydown-D', abs(1));
    kb?.on('keydown-DOWN', abs(2)); kb?.on('keydown-S', abs(2));
    kb?.on('keydown-LEFT', abs(3)); kb?.on('keydown-A', abs(3));
    kb?.on('keydown-Z', () => this.turnRel(-1)); kb?.on('keydown-Q', () => this.turnRel(-1));
    kb?.on('keydown-X', () => this.turnRel(1)); kb?.on('keydown-E', () => this.turnRel(1));

    // swipes anywhere on the field; turn buttons below it on touch screens
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.y < Y0 + FH) this.swipe = { x: p.x, y: p.y }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.swipe || !p.isDown) return;
      const dx = p.x - this.swipe.x, dy = p.y - this.swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      this.steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      this.swipe = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => { this.swipe = null; });

    const by = Y0 + FH + 78;
    if (this.sys.game.device.input.touch) {
      for (const side of [-1, 1]) {
        const x = 360 + side * 172;
        const btn = this.add.rectangle(x, by, 320, 132, 0x1d1850, 0.85).setStrokeStyle(4, 0x8b5cff).setInteractive();
        const g = this.add.graphics();
        g.fillStyle(0xb48cff);
        // curved-arrow look: a bar and a head pointing the turn's way
        g.fillRect(x - 50, by - 8, 100, 16);
        g.fillTriangle(x + side * 70, by, x + side * 40, by - 28, x + side * 40, by + 28);
        txt(this, x - side * 20, by + 44, side < 0 ? t('left') : t('right'), { title: true, size: 16, color: '#b48cff' });
        btn.on('pointerdown', () => {
          this.turnRel(side);
          btn.setFillStyle(0x3a2f90, 0.95);
          this.time.delayedCall(90, () => btn.setFillStyle(0x1d1850, 0.85));
        });
      }
    } else {
      txt(this, 360, by - 20, t('keysHint'), { size: 26, color: '#a9b0e8', wrap: 660 });
      txt(this, 360, by + 22, t('keysHint2'), { size: 22, color: '#7f86c0', wrap: 660 });
    }
  }

  /** Current direction of my cycle in local view coordinates (counting turns already queued). */
  private myDir(): number {
    if (this.host) {
      const c = this.arena.cycles[0];
      if (!c) return 0;
      return c.q.length ? c.q[c.q.length - 1] : c.d;
    }
    return this.time.now - this.aimAt < 400 ? this.aimDir : this.riders[0]?.d ?? 0;
  }

  private turnRel(side: number): void {
    this.steer((this.myDir() + (side > 0 ? 1 : 3)) % 4);
  }

  /** Steer my cycle to a local-view direction. */
  private steer(d: number): void {
    if (this.phase !== 'run' && this.phase !== 'count') return;
    const cur = this.myDir();
    if (d === cur || d === (cur + 2) % 4) return;
    this.sfx('steer', { volume: 0.25 });
    if (this.host) { this.arena.turn(0, d); return; }
    this.aimDir = d; this.aimAt = this.time.now;
    net.send('in', { d: (d + 2) % 4 });   // the guest's view is the host's field turned 180°
  }

  // ------------------------------------------------------------------ net

  private setupNet(): void {
    if (this.host) {
      net.onScene(this, 'in', (m: { d: number }) => {
        if (m && typeof m.d === 'number' && m.d >= 0 && m.d < 4) this.arena.turn(1, m.d);
      });
      return;
    }
    net.onScene(this, 'rd', (m: RdMsg) => { if (m) this.beginRound(m.r, m.sp, !!m.sw); });
    net.onScene(this, 'st', (m: StMsg) => { if (m && Array.isArray(m.h)) this.guestTick(m); });
    net.onScene(this, 'end', (m: EndMsg) => { if (m && Array.isArray(m.s)) this.guestEnd(m); });
  }

  private mirror(x: number, y: number): [number, number] { return [COLS - 1 - x, ROWS - 1 - y]; }

  private guestTick(m: StMsg): void {
    // a snapshot before this round's setup ("rd") has nothing to move
    if (this.isOver || this.riders.length < 2 || this.phase === 'gap' || this.phase === 'over') return;
    if (this.phase === 'count') this.phase = 'run';
    this.tickNo = m.k;
    // host cycle 1 is me, cycle 0 the opponent; both seen turned 180°
    const mine = [1, 0];
    for (let k = 0; k < 2; k++) {
      const hk = mine[k];
      const [x, y] = this.mirror(m.h[hk * 2], m.h[hk * 2 + 1]);
      const r = this.riders[k];
      r.d = (m.d[hk] + 2) % 4;
      if (x !== r.to[0] || y !== r.to[1]) this.advance(k, x, y);
    }
    this.lastTick = this.time.now;
  }

  private guestEnd(m: EndMsg): void {
    if (this.isOver) return;
    // host seats -> local: me = seat 1
    const crashed = [!!m.c[1], !!m.c[0]];
    this.pts = [m.s[1], m.s[0]];
    const winner = m.w < 0 ? -1 : m.w === 1 ? 0 : 1;
    this.roundOver(crashed, winner);
  }

  // ------------------------------------------------------------------ rounds

  private updateHud(): void {
    if (!this.online) this.oppName.setText(upper(t('r' + this.rival))).setColor(Phaser.Display.Color.IntegerToColor(this.oppColor()).rgba);
    for (let k = 0; k < 2; k++) this.pips[k].forEach((p, i) => {
      p.setFillStyle(i < this.pts[k] ? (k ? this.oppColor() : ME) : 0x000000, i < this.pts[k] ? 1 : 0.3);
      if (k) p.setStrokeStyle(3, this.oppColor()).setX(X0 + FW - this.oppName.width - 26 - i * 30);
    });
    if (this.online) return;
    this.hud.setCenter(`${t('round')} ${this.round}`);
    this.hud.setRight(`${this.rival + 1}/${RIVALS}`);
  }

  private oppColor(): number { return this.online ? OPP : RIVAL_COLORS[this.rival]; }

  private speedFor(round: number): number {
    const base = this.online ? 10 : 9 + this.rival * 0.7;
    return Math.min(18, base + (round - 1) * 1.2);
  }

  /** Host / solo: sets up the next round and tells the guest. */
  private startRound(): void {
    if (this.isOver) return;
    this.round++;
    const sp = this.speedFor(this.round);
    // The spawns and obstacles are point-symmetric and the guest sees the field turned 180°,
    // so without a swap both players start at the bottom of their own screen every round
    // (swapping put both of them at the top in alternate rounds and changed nothing else).
    const sw = false;
    if (this.online) net.send('rd', { r: this.round, sp, sw: sw ? 1 : 0 } satisfies RdMsg);
    this.beginRound(this.round, sp, sw);
  }

  private beginRound(r: number, sp: number, swap: boolean): void {
    this.round = r;
    this.interval = 1000 / sp;
    this.acc = 0; this.tickNo = 0; this.survived = 0;
    const obstacles = this.online ? r >= 2 : this.rival >= 1 && r >= 2;
    const rand = rng.seeded((this.online ? net.seed : rng.int(1, 1e9)) + r * 7919);
    const count = obstacles ? 2 + Math.floor(rand() * (this.online ? 3 : Math.min(4, this.rival + 1))) : 0;
    const walls = count ? makeObstacles(rand, count) : [];
    this.arena.reset(swap, walls);
    // walls (host coordinates; the guest sees them turned 180°)
    this.walls.clear();
    for (const w of walls) {
      let x = w % COLS, y = Math.floor(w / COLS);
      if (!this.host) [x, y] = this.mirror(x, y);
      this.walls.fillStyle(0xff4fa3, 0.25).fillRect(X0 + x * CELL - 2, Y0 + y * CELL - 2, CELL + 4, CELL + 4);
      this.walls.fillStyle(0xff4fa3, 0.9).fillRect(X0 + x * CELL + 2, Y0 + y * CELL + 2, CELL - 4, CELL - 4);
    }
    // riders in local view
    const mine = this.host ? [0, 1] : [1, 0];
    this.riders = mine.map((hk, k) => {
      const c = this.arena.cycles[hk];
      const [x, y] = this.host ? [c.x, c.y] : this.mirror(c.x, c.y);
      const d = this.host ? c.d : (c.d + 2) % 4;
      return { from: [x, y], to: [x, y], d, alive: true, color: k === 0 ? ME : this.oppColor() } as Rider;
    });
    this.aimDir = this.riders[0].d; this.aimAt = 0;
    this.trails.forEach((tr) => { tr.clear(); tr.setAlpha(1); });
    this.riders.forEach((rd, k) => {
      this.heads[k].setTint(rd.color).setVisible(true).setAlpha(1);
      this.glows[k].setTint(rd.color).setVisible(true);
      this.live[k].setFillStyle(rd.color).setVisible(true);
    });
    this.drawRiders(0);
    this.updateHud();
    this.phase = 'count';
    this.countdown();
  }

  private countdown(): void {
    const steps = [t('c3'), t('c2'), t('c1'), t('go')];
    steps.forEach((s, k) => this.time.delayedCall(k * 600, () => {
      if (this.isOver) return;
      const last = k === steps.length - 1;
      this.banner.setText(s).setColor(last ? '#5dff7a' : '#ffd23f').setVisible(true).setAlpha(1).setScale(1.6);
      this.tweens.add({ targets: this.banner, scale: 1, alpha: last ? 0 : 0.9, duration: 500, ease: 'Quad.easeOut' });
      this.sfx(last ? 'go' : 'count', { volume: 0.5, exact: true });
      if (k === 0) {
        const lbl = this.online ? t('round') + ' ' + this.round : `${t('round')} ${this.round} · ${t('r' + this.rival)}`;
        popup(this, 360, Y0 + FH / 2 + 90, lbl, '#b48cff', 26);
      }
      if (last && this.host) { this.phase = 'run'; this.lastTick = this.time.now; this.acc = 0; }
    }));
  }

  /** A rider moved to (x, y) in local view: the finished segment goes into its trail. */
  private advance(k: number, x: number, y: number): void {
    const r = this.riders[k];
    this.paintSegment(k, r.from, r.to);
    r.from = [r.to[0], r.to[1]];
    // a skipped tick (should not happen) still leaves a continuous wall
    if (Math.abs(x - r.to[0]) + Math.abs(y - r.to[1]) > 1) { this.paintSegment(k, r.to, [x, r.to[1]]); this.paintSegment(k, [x, r.to[1]], [x, y]); r.from = [x, y]; }
    r.to = [x, y];
  }

  private paintSegment(k: number, a: [number, number], b: [number, number]): void {
    const tr = this.trails[k], color = this.riders[k].color;
    const x1 = Math.min(a[0], b[0]) * CELL + CELL / 2, x2 = Math.max(a[0], b[0]) * CELL + CELL / 2;
    const y1 = Math.min(a[1], b[1]) * CELL + CELL / 2, y2 = Math.max(a[1], b[1]) * CELL + CELL / 2;
    tr.fill(color, 0.18, x1 - 9, y1 - 9, x2 - x1 + 18, y2 - y1 + 18);
    tr.fill(color, 1, x1 - 4, y1 - 4, x2 - x1 + 8, y2 - y1 + 8);
    tr.fill(0xffffff, 0.8, x1 - 1, y1 - 1, x2 - x1 + 2, y2 - y1 + 2);
  }

  /** Heads glide from their last cell to the current one between ticks. */
  private drawRiders(p: number): void {
    this.riders.forEach((r, k) => {
      const fx = X0 + r.from[0] * CELL + CELL / 2, fy = Y0 + r.from[1] * CELL + CELL / 2;
      const tx = X0 + r.to[0] * CELL + CELL / 2, ty = Y0 + r.to[1] * CELL + CELL / 2;
      const hx = fx + (tx - fx) * p, hy = fy + (ty - fy) * p;
      this.heads[k].setPosition(hx, hy).setAngle(r.d * 90);
      this.glows[k].setPosition(hx, hy);
      const lx = Math.min(fx, hx), ly = Math.min(fy, hy);
      this.live[k].setPosition(lx - 4, ly - 4).setScale(Math.abs(hx - fx) + 8, Math.abs(hy - fy) + 8);
    });
  }

  updateGame(_time: number, delta: number): void {
    if (this.phase === 'run' && this.host) {
      this.acc += delta;
      let n = 0;
      while (this.acc >= this.interval && this.phase === 'run' && n++ < 3) {
        this.acc -= this.interval;
        this.hostTick();
      }
    }
    if (!this.riders.length) return;
    const p = this.phase === 'run' ? Phaser.Math.Clamp((this.time.now - this.lastTick) / this.interval, 0, 1) : 1;
    this.drawRiders(p);
  }

  /** Host / solo: one simulation step. */
  private hostTick(): void {
    if (!this.online) this.arena.turn(1, aiDir(this.arena, 1, this.rival));
    const crashed = this.arena.step();
    this.tickNo++;
    this.lastTick = this.time.now;
    this.survived++;
    const cs = this.arena.cycles;
    cs.forEach((c, k) => { this.riders[k].d = c.d; if (!crashed[k]) this.advance(k, c.x, c.y); });
    if (this.online) net.send('st', { k: this.tickNo, h: [cs[0].x, cs[0].y, cs[1].x, cs[1].y], d: [cs[0].d, cs[1].d] } satisfies StMsg);
    if (!this.online && this.survived % 50 === 0) this.addScore(5 * (this.rival + 1));
    if (crashed[0] || crashed[1]) {
      const winner = crashed[0] && crashed[1] ? -1 : crashed[0] ? 1 : 0;
      if (winner >= 0) this.pts[winner]++;
      if (this.online) net.send('end', { w: winner, s: this.pts, c: crashed.map((c) => (c ? 1 : 0)) } satisfies EndMsg);
      this.roundOver(crashed, winner);
    }
  }

  /** Both sides: a round ended. crashed / winner in local view (winner -1 = both crashed). */
  private roundOver(crashed: boolean[], winner: number): void {
    this.phase = 'gap';
    this.drawRiders(1);
    crashed.forEach((c, k) => { if (c) this.crash(k); });
    this.updateHud();
    let msg: string, color: string;
    if (winner < 0) { msg = t('bothCrash'); color = '#ffd23f'; this.sfx('draw', { volume: 0.5 }); }
    else if (winner === 0) {
      msg = t('roundWin'); color = '#5dff7a'; this.sfx('point', { volume: 0.55 });
      if (!this.online) this.addScore(100 * (this.rival + 1) + this.survived, 360, Y0 + FH / 2 - 80);
    } else { msg = t('roundLose'); color = '#ec3013'; }
    this.time.delayedCall(450, () => {
      if (this.isOver) return;
      this.banner.setText(msg).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
      const pip = winner >= 0 ? this.pips[winner][this.pts[winner] - 1] : null;
      if (pip) this.tweens.add({ targets: pip, scale: 1.8, duration: 200, yoyo: true, repeat: 1 });
    });
    const over = this.pts[0] >= TO_WIN || this.pts[1] >= TO_WIN;
    if (over) { this.time.delayedCall(1500, () => this.matchOver(this.pts[0] >= TO_WIN)); return; }
    if (this.host) this.time.delayedCall(2100, () => {
      if (this.isOver) return;
      this.tweens.add({ targets: this.banner, alpha: 0, duration: 200 });
      this.startRound();
    });
  }

  private crash(k: number): void {
    const r = this.riders[k];
    if (!r.alive) return;
    r.alive = false;
    const x = X0 + r.to[0] * CELL + CELL / 2 + DX[r.d] * CELL * 0.5, y = Y0 + r.to[1] * CELL + CELL / 2 + DY[r.d] * CELL * 0.5;
    burst(this, x, y, [r.color, 0xffffff, 0xffd23f], 40, 420);
    for (let i = 0; i < 3; i++) this.time.delayedCall(i * 90, () => burst(this, x + rng.int(-20, 20), y + rng.int(-20, 20), [r.color, 0xffffff], 14, 260));
    shake(this, k === 0 ? 0.022 : 0.012, 380);
    flash(this, k === 0 ? 0xec3013 : r.color, 160, 0.3);
    this.sfxAt('crash', x, { volume: 0.7 });
    this.heads[k].setVisible(false);
    this.glows[k].setVisible(false);
    this.live[k].setVisible(false);
    // de-rez: the crashed trail flickers out
    this.tweens.add({ targets: this.trails[k], alpha: { from: 0.25, to: 1 }, duration: 70, yoyo: true, repeat: 5,
      onComplete: () => this.tweens.add({ targets: this.trails[k], alpha: 0.12, duration: 600 }) });
  }

  private matchOver(won: boolean): void {
    if (this.isOver) return;
    this.phase = 'over';
    if (this.online) {
      this.setScore(this.pts[0] * 100);
      this.sfx(won ? 'win' : 'lose', { volume: 0.6 });
      if (won) for (let k = 0; k < 5; k++) this.time.delayedCall(k * 130, () => burst(this, rng.int(100, 620), rng.int(300, 1000), [ME, 0xffffff, 0xffd23f], 26, 360));
      this.endGame({ win: won, title: won ? t('youWin') : t('youLose'), delay: 1400 });
      return;
    }
    if (!won) { this.sfx('lose', { volume: 0.6 }); this.endGame({ delay: 1400 }); return; }
    this.sfx('win', { volume: 0.6 });
    this.addScore(500 * (this.rival + 1), 360, Y0 + FH / 2);
    for (let k = 0; k < 5; k++) this.time.delayedCall(k * 130, () => burst(this, rng.int(100, 620), rng.int(300, 1000), [ME, 0xffffff, 0xffd23f], 26, 360));
    if (this.rival >= RIVALS - 1) { this.endGame({ win: true, title: t('champion'), delay: 1600 }); return; }
    this.banner.setText(t('matchWon')).setColor('#ffd23f').setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
    this.time.delayedCall(2000, () => {
      if (this.isOver) return;
      this.rival++;
      this.pts = [0, 0];
      this.round = 0;
      this.updateHud();
      this.banner.setText(t('nextRival', { name: upper(t('r' + this.rival)) })).setColor(Phaser.Display.Color.IntegerToColor(this.oppColor()).rgba).setScale(0.3);
      this.banner.setFontSize(34);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
      this.sfx('next', { volume: 0.5 });
      this.time.delayedCall(1600, () => { this.banner.setFontSize(54); this.startRound(); });
    });
  }
}
