import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';
import { PALETTE, makeSymbols, softFlash, banner } from './symbols';

const GAP = 235;            // vertical distance between bars
const BAR_H = 34;
const BALL_R = 26;
const SEG_W = 112;          // segment width of a moving strip
const START_Y = 1060;
const LAND_GRACE = BALL_R * 0.7;   // px either side of the ball centre that still count on landing

type Kind = 'pad' | 'solid' | 'split' | 'strip' | 'fade';

interface Bar {
  idx: number;
  kind: Kind;
  x: number;                // centre
  y: number;                // top surface
  w: number;
  cols: number[];
  lx: number;               // where the ball lands on it (world x)
  phase: number;            // strip offset
  speed: number;            // strip px/s
  split: number;            // split boundary offset from the centre
  amp: number;              // split boundary swing
  cap: number;              // fade: cap width now
  capRate: number;          // fade: px per second while the ball flies to this bar
  g: Phaser.GameObjects.Graphics;
  syms: Phaser.GameObjects.Image[];
  done: boolean;
}

export class PlayScene extends ArcadeScene {
  private bars: Bar[] = [];
  private ball!: Phaser.GameObjects.Container;
  private ballG!: Phaser.GameObjects.Graphics;
  private ballSym!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bg!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.TileSprite;
  private hint!: Phaser.GameObjects.Text;
  private strip: Phaser.GameObjects.Container[] = [];
  private colour = 0;
  private k = 3;               // colours in play
  private cur = 0;             // index of the bar the ball is leaving / standing on
  private flying = false;
  private started = false;
  private dead = false;
  private u = 0;
  private flight = 0.95;
  private from = { x: 0, y: 0 };
  private clock = 0;
  private height = 0;

  createGame(): void {
    makeSymbols(this);
    ensurePixel(this);
    this.bars = []; this.strip = [];
    this.k = 3; this.cur = 0; this.flying = false; this.started = false; this.dead = false;
    this.u = 0; this.flight = 0.95; this.clock = 0; this.height = 0;
    this.cameras.main.setScroll(0, 0);

    if (!this.textures.exists('cb-stars')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < 70; i++) {
        g.fillStyle(0xffffff, rng.int(10, 40) / 100);
        const s = rng.chance(0.2) ? 4 : 2;
        g.fillRect(rng.int(0, 254), rng.int(0, 254), s, s);
      }
      g.generateTexture('cb-stars', 256, 256);
      g.destroy();
    }
    this.bg = this.add.graphics().setScrollFactor(0).setDepth(-20);
    this.stars = this.add.tileSprite(0, 0, 720, 1280, 'cb-stars').setOrigin(0).setScrollFactor(0).setDepth(-19);

    // first bars
    this.addBar('pad');
    while (this.bars.length < 8) this.addBar();
    this.colour = this.bars[1].cols[0];

    const p = this.bars[0];
    this.ball = this.add.container(p.lx, p.y - BALL_R).setDepth(20);
    this.ballG = this.add.graphics();
    this.ballSym = this.add.image(0, 0, `sym-${this.colour}`).setScale(0.5);
    this.ball.add([this.ballG, this.ballSym]);
    this.drawBall();
    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      follow: this.ball, lifespan: 300, frequency: 20, speed: { min: 0, max: 20 },
      scale: { start: 4, end: 0 }, alpha: { start: 0.55, end: 0 }, tint: PALETTE[this.colour],
    }).setDepth(19);

    // colour order strip (bottom): shows the cycle and the current colour
    this.buildStrip();

    this.hint = txt(this, 360, 1145, t('hint'), { size: 26, wrap: 640 }).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0.4, duration: 650, yoyo: true, repeat: -1 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 600 && p.y < 130) return;
      this.press(p.x < 360 ? -1 : 1);
    });
    const kb = this.input.keyboard;
    for (const key of ['LEFT', 'A', 'DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.press(-1));
    for (const key of ['RIGHT', 'D', 'UP', 'W', 'SPACE', 'Z']) kb?.on(`keydown-${key}`, () => this.press(1));
    this.hud.setRight(`${t('height')} 0`);
  }

  // ---------- bars ----------
  private addBar(force?: Kind): void {
    const idx = this.bars.length;
    const prev = this.bars[idx - 1];
    const y = START_Y - idx * GAP;
    const w = force === 'pad' ? 220 : Math.max(210, 330 - idx * 2.2);
    let x = 360;
    if (prev) {
      for (let tries = 0; tries < 20; tries++) {
        x = rng.int(Math.ceil(w / 2) + 20, Math.floor(720 - w / 2 - 20));
        if (Math.abs(x - prev.x) > 110) break;
      }
    }
    const k = idx >= 45 ? 5 : idx >= 18 ? 4 : 3;
    const pool = rng.shuffle([...Array(k).keys()]);
    let kind: Kind = force ?? 'solid';
    if (!force && idx > 2) {
      const kinds: Kind[] = ['solid'];
      if (idx >= 7) kinds.push('split', 'split');
      if (idx >= 13) kinds.push('strip', 'strip');
      if (idx >= 22) kinds.push('fade', 'fade');
      if (idx >= 32) kinds.push('strip', 'split');
      kind = idx >= 7 && prev.kind === 'solid' && rng.chance(0.5) ? rng.pick(kinds.filter((q) => q !== 'solid')) : rng.pick(kinds);
    }
    const g = this.add.graphics().setDepth(10);
    const bar: Bar = {
      idx, kind, x, y, w, cols: [], lx: x, phase: rng.int(0, 999), speed: 0, split: 0, amp: 0, cap: 0, capRate: 0,
      g, syms: [], done: false,
    };
    switch (kind) {
      case 'pad': bar.cols = [-1]; break;
      case 'solid': bar.cols = [pool[0]]; bar.lx = x + rng.int(-50, 50); break;
      case 'split': {
        bar.cols = [pool[0], pool[1]];
        bar.split = rng.int(-30, 30);
        bar.amp = idx >= 30 && rng.chance(0.6) ? rng.int(40, 70) : 0;
        bar.lx = x + bar.split + (rng.chance(0.5) ? -1 : 1) * rng.int(28, 60);
        break;
      }
      case 'strip': {
        bar.cols = pool.slice(0, Math.min(k, 4));
        bar.speed = (rng.chance(0.5) ? 1 : -1) * Math.min(260, 110 + idx * 3);
        bar.lx = x + rng.int(-40, 40);
        break;
      }
      case 'fade': {
        bar.cols = [pool[0], pool[1]];
        bar.cap = w;
        bar.lx = x;
        break;
      }
    }
    const nSyms = kind === 'strip' ? Math.ceil(w / SEG_W) + 2 : kind === 'pad' ? 0 : 3;
    for (let i = 0; i < nSyms; i++) bar.syms.push(this.add.image(x, y + BAR_H / 2, 'sym-0').setScale(0.42).setDepth(11));
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 300 });
    this.bars.push(bar);
    this.drawBar(bar);
  }

  /** Colour index at world x on this bar right now (-1 = pad, -2 = nothing). */
  private colourAt(b: Bar, x: number): number {
    const dx = x - b.x;
    if (Math.abs(dx) > b.w / 2 + BALL_R * 0.6) return -2;
    switch (b.kind) {
      case 'pad': return -1;
      case 'solid': return b.cols[0];
      case 'split': return dx < this.splitAt(b) ? b.cols[0] : b.cols[1];
      case 'strip': {
        const n = b.cols.length;
        const i = Math.floor((dx + b.w / 2 + b.phase) / SEG_W);
        return b.cols[((i % n) + n) % n];
      }
      case 'fade': return Math.abs(dx) < b.cap / 2 ? b.cols[0] : b.cols[1];
    }
    return -2;
  }

  private splitAt(b: Bar): number {
    return b.split + b.amp * Math.sin(this.clock * 2.2 + b.idx);
  }

  private drawBar(b: Bar): void {
    const g = b.g;
    if (!g.active) return;      // recycled below the view (its landing tween may still be running)
    g.clear();
    const x0 = b.x - b.w / 2, y = b.y, w = b.w;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(x0 + 4, y + 8, w, BAR_H, 10);
    const syms = b.syms;
    const place = (i: number, sx: number, col: number, on = true) => {
      const s = syms[i];
      if (!s) return;
      s.setVisible(on && col >= 0);
      if (col >= 0) s.setTexture(`sym-${col}`).setPosition(sx, y + BAR_H / 2).setAlpha(b.done ? 0.5 : 1);
    };
    switch (b.kind) {
      case 'pad':
        g.fillStyle(0xd8d4f0, 1).fillRoundedRect(x0, y, w, BAR_H, 10);
        break;
      case 'solid':
        g.fillStyle(PALETTE[b.cols[0]], 1).fillRoundedRect(x0, y, w, BAR_H, 10);
        [-0.32, 0, 0.32].forEach((f, i) => place(i, b.x + f * w, b.cols[0]));
        break;
      case 'split': {
        const s = b.x + this.splitAt(b);
        g.fillStyle(PALETTE[b.cols[0]], 1).fillRoundedRect(x0, y, s - x0, BAR_H, { tl: 10, bl: 10, tr: 0, br: 0 });
        g.fillStyle(PALETTE[b.cols[1]], 1).fillRoundedRect(s, y, x0 + w - s, BAR_H, { tl: 0, bl: 0, tr: 10, br: 10 });
        g.fillStyle(0x000000, 0.7).fillRect(s - 2, y, 4, BAR_H);
        place(0, (x0 + s) / 2, b.cols[0], s - x0 > 44);
        place(1, (s + x0 + w) / 2, b.cols[1], x0 + w - s > 44);
        place(2, 0, -1, false);
        break;
      }
      case 'strip': {
        const n = b.cols.length;
        const off = ((b.phase % SEG_W) + SEG_W) % SEG_W;
        const first = Math.floor(b.phase / SEG_W);
        let si = 0;
        for (let sx = x0 - off, i = first; sx < x0 + w; sx += SEG_W, i++) {
          const a = Math.max(x0, sx), e = Math.min(x0 + w, sx + SEG_W);
          const col = b.cols[((i % n) + n) % n];
          g.fillStyle(PALETTE[col], 1).fillRect(a, y, e - a, BAR_H);
          g.fillStyle(0x000000, 0.6).fillRect(e - 2, y, 2, BAR_H);
          const cx = sx + SEG_W / 2;
          place(si++, cx, col, cx > x0 + 16 && cx < x0 + w - 16);
        }
        for (; si < syms.length; si++) syms[si].setVisible(false);
        g.lineStyle(3, 0xffffff, 0.6).strokeRoundedRect(x0, y, w, BAR_H, 6);
        break;
      }
      case 'fade': {
        g.fillStyle(PALETTE[b.cols[1]], 1).fillRoundedRect(x0, y, w, BAR_H, 10);
        if (b.cap > 2) {
          g.fillStyle(0x000000, 0.6).fillRect(b.x - b.cap / 2 - 3, y - 4, b.cap + 6, BAR_H + 8);
          g.fillStyle(PALETTE[b.cols[0]], 1).fillRect(b.x - b.cap / 2, y - 4, b.cap, BAR_H + 8);
        }
        place(0, b.x, b.cap > 50 ? b.cols[0] : b.cols[1]);
        place(1, x0 + 26, b.cols[1], b.cap < w - 70);
        place(2, x0 + w - 26, b.cols[1], b.cap < w - 70);
        break;
      }
    }
    g.fillStyle(0xffffff, 0.25).fillRect(x0 + 10, y + 4, w - 20, 4);
    // landing marker for the bar the ball is heading to
    if (!b.done && b.idx === this.cur + 1 && b.kind !== 'pad') {
      const bob = Math.sin(this.clock * 8) * 4;
      g.fillStyle(0xffffff, 0.95).fillTriangle(b.lx - 12, y - 30 + bob, b.lx + 12, y - 30 + bob, b.lx, y - 12 + bob);
      g.lineStyle(3, 0x000000, 0.8).strokeTriangle(b.lx - 12, y - 30 + bob, b.lx + 12, y - 30 + bob, b.lx, y - 12 + bob);
    }
  }

  // ---------- ball ----------
  private drawBall(): void {
    const g = this.ballG;
    g.clear();
    g.fillStyle(PALETTE[this.colour], 1).fillCircle(0, 0, BALL_R);
    g.lineStyle(5, 0xffffff, 0.95).strokeCircle(0, 0, BALL_R);
    g.fillStyle(0xffffff, 0.35).fillCircle(-9, -10, 8);
    this.ballSym.setTexture(`sym-${this.colour}`);
  }

  private buildStrip(): void {
    this.strip.forEach((c) => c.destroy());
    this.strip = [];
    const n = this.k, gap = 96;
    for (let i = 0; i < n; i++) {
      const c = this.add.container(360 + (i - (n - 1) / 2) * gap, 1205).setScrollFactor(0).setDepth(60);
      const g = this.add.graphics();
      g.fillStyle(PALETTE[i], 1).fillCircle(0, 0, 26).lineStyle(4, 0x000000, 0.8).strokeCircle(0, 0, 26);
      c.add([g, this.add.image(0, 0, `sym-${i}`).setScale(0.4)]);
      this.strip.push(c);
    }
    // arrows on both sides: left half = previous, right half = next
    for (const s of [-1, 1]) {
      const g = this.add.graphics({ x: 360 + s * ((n - 1) / 2 * gap + 80), y: 1205 }).setScrollFactor(0).setDepth(60);
      g.fillStyle(0xffffff, 0.6).fillTriangle(s * 18, 0, -s * 10, -18, -s * 10, 18);
      this.strip.push(g as unknown as Phaser.GameObjects.Container);
    }
    this.markStrip();
  }

  private markStrip(): void {
    for (let i = 0; i < this.k; i++) {
      const c = this.strip[i];
      const on = i === this.colour;
      c.setScale(on ? 1.25 : 0.85).setAlpha(on ? 1 : 0.55);
    }
  }

  private press(dir: number): void {
    if (this.dead || this.isOver) return;
    if (!this.started) {
      this.started = true;
      this.tweens.killTweensOf(this.hint);
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 250 });
      this.launch();
      return;
    }
    this.colour = (this.colour + dir + this.k) % this.k;
    this.drawBall();
    this.trail.particleTint = PALETTE[this.colour];
    this.markStrip();
    this.sfx('switch', { volume: 0.4, exact: true, rate: 0.9 + this.colour * 0.08 });
    this.tweens.killTweensOf(this.ball);
    this.ball.setScale(1);
    this.tweens.add({ targets: this.ball, scale: 1.25, duration: 60, yoyo: true });
  }

  private launch(): void {
    const b = this.bars[this.cur];
    this.from = { x: b.lx, y: b.y - BALL_R };
    this.u = 0;
    this.flying = true;
    this.flight = Math.max(0.58, 0.95 - this.cur * 0.0085);
    const next = this.bars[this.cur + 1];
    if (next.kind === 'fade') {
      // the cap either vanishes mid-flight or lasts past the landing: watch it shrink
      const vanish = this.flight * (rng.chance(0.5) ? Phaser.Math.FloatBetween(0.45, 0.7) : Phaser.Math.FloatBetween(1.45, 1.9));
      next.capRate = next.w / vanish;
    }
    this.sfx(rng.pick(['jump1', 'jump2']), { volume: 0.3 });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.clock += dt;
    const cam = this.cameras.main;

    for (const b of this.bars) {
      if (b.kind === 'strip' && !b.done) b.phase += b.speed * dt;
      if (b.kind === 'fade' && this.flying && b.idx === this.cur + 1) b.cap = Math.max(0, b.cap - b.capRate * dt);
      if (b.y > cam.scrollY - 60 && b.y < cam.scrollY + 1340) this.drawBar(b);
    }

    if (this.dead) return;
    if (!this.started) {
      this.ball.y = this.bars[0].y - BALL_R - Math.abs(Math.sin(this.clock * 4)) * 26;
    } else if (this.flying) {
      this.u = Math.min(1, this.u + dt / this.flight);
      const to = this.bars[this.cur + 1];
      const tx = to.lx, ty = to.y - BALL_R;
      const u = this.u;
      this.ball.x = this.from.x + (tx - this.from.x) * u;
      this.ball.y = this.from.y + (ty - this.from.y) * u - 165 * Math.sin(Math.PI * u);
      if (this.u >= 1) this.land(to);
    }

    const target = this.ball.y - 820;
    if (target < cam.scrollY) cam.scrollY += (target - cam.scrollY) * Math.min(1, dt * 6);
    this.stars.tilePositionY = cam.scrollY * 0.3;
    this.drawBg(cam.scrollY);

    // recycle bars below the screen, build above
    while (this.bars.length - this.cur < 8) this.addBar();
    for (const b of this.bars) {
      if (!b.g.active || b.y < cam.scrollY + 1400) continue;
      b.g.destroy();
      b.syms.forEach((s) => s.destroy());
    }
  }

  private drawBg(scroll: number): void {
    // the sky darkens and shifts hue as the tower grows
    const hue = (0.72 + -scroll / 40000) % 1;
    const top = Phaser.Display.Color.HSVToRGB(hue, 0.55, 0.16).color;
    const bot = Phaser.Display.Color.HSVToRGB((hue + 0.08) % 1, 0.5, 0.3).color;
    this.bg.clear();
    this.bg.fillGradientStyle(top, top, bot, bot, 1).fillRect(0, 0, 720, 1280);
  }

  private land(b: Bar): void {
    this.flying = false;
    this.ball.angle = 0;
    // Forgiving landing: the ball counts as matched when its own colour is anywhere under its
    // footprint, so a strip edge sliding past the marker at the very moment of landing is not a
    // coin flip.
    const x = this.ball.x;
    const col = [x, x - LAND_GRACE, x + LAND_GRACE].map((px) => this.colourAt(b, px)).includes(this.colour) ? this.colour : this.colourAt(b, x);
    if (col !== this.colour) {
      this.die(b);
      return;
    }
    b.done = true;
    this.cur = b.idx;
    this.height = b.idx;
    this.addScore(10);
    this.hud.setRight(`${t('height')} ${this.height}`);
    burst(this, this.ball.x, b.y, [PALETTE[col], 0xffffff], 16, 240);
    this.sfxAt('bounce', this.ball.x, { volume: 0.45, exact: true, rate: 1 + (this.height % 10) * 0.04 });
    this.tweens.add({ targets: this.ball, scaleX: 1.35, scaleY: 0.7, duration: 70, yoyo: true });
    const yb = b.y;
    this.tweens.add({ targets: b, y: yb + 10, duration: 70, yoyo: true, onUpdate: () => this.drawBar(b) });

    // colours join in as the tower grows
    const want = this.bars[b.idx + 1]?.cols.reduce((m, c) => Math.max(m, c + 1), this.k) ?? this.k;
    const nk = b.idx + 1 >= 45 ? 5 : b.idx + 1 >= 18 ? 4 : 3;
    if (Math.max(want, nk) > this.k) {
      this.k = Math.max(want, nk);
      this.buildStrip();
      banner(this, 360, t('newColour'), '#5dff7a', 30);
      this.sfx('newcol', { volume: 0.6 });
    }
    if (this.height > 0 && this.height % 10 === 0) {
      this.addScore(50);
      popup(this, this.ball.x, this.ball.y - 70, `+50`, '#5dff7a');
      banner(this, 300, `${this.height * 10} ${t('metres')}`);
      this.sfx('milestone', { volume: 0.55, exact: true });
      softFlash(this, 0xffffff, 80, 0.2);
    }
    this.launch();
  }

  private die(b: Bar): void {
    this.dead = true;
    const { x, y } = this.ball;
    this.ball.setVisible(false);
    this.trail.stop();
    burst(this, x, y, PALETTE.slice(0, this.k), 50, 520);
    burst(this, x, y, PALETTE[this.colour], 30, 300);
    this.sfxAt('shatter', x, { volume: 0.6 });
    this.sfx('wrong', { volume: 0.5 });
    shake(this, 0.025, 340);
    softFlash(this, 0xec3013, 160);
    this.tweens.add({ targets: [b.g, ...b.syms], alpha: 0.2, duration: 300, yoyo: true, repeat: 2 });
    popup(this, x, y - 50, t('wrong'), '#ec3013', 24);
    this.endGame({ title: t('wrong'), delay: 1100 });
  }
}
