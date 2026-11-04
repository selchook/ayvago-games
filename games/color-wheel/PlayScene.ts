import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';
import { PALETTE, makeSymbols, softFlash, banner } from './symbols';

const CX = 360;
const CY = 720;
const RING_R = 124;          // middle of the ring band
const RING_T = 50;           // band thickness
const DOT_R = 26;
const HIT_R = RING_R + RING_T / 2 + DOT_R * 0.55;
const RAINBOW = -1;
const MIN_GAP = 0.16;        // s between two arrivals that need the same ring rotation
const TURN_TIME = 0.15;      // extra s per ring step the player has to tap between two arrivals

interface Dot {
  c: Phaser.GameObjects.Container;
  ang: number;               // degrees, Phaser convention (clockwise, 0 = right)
  dist: number;
  speed: number;
  col: number;               // palette index or RAINBOW
  arrive: number;            // wave time it reaches the ring
}

interface Planned { arrive: number; ang: number; col: number }

export class PlayScene extends ArcadeScene {
  private ring!: Phaser.GameObjects.Container;
  private ringG!: Phaser.GameObjects.Graphics;
  private ringSyms: Phaser.GameObjects.Image[] = [];
  private core!: Phaser.GameObjects.Arc;
  private multText!: Phaser.GameObjects.Text;
  private guides!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private cols: number[] = [];
  private segs = 4;
  private rot = 0;            // logical rotation (degrees)
  private shown = 0;          // drawn rotation, eases toward rot
  private dots: Dot[] = [];
  private plan: Planned[] = [];
  private wave = 0;
  private waveTime = 0;
  private travel = 2;
  private state: 'intro' | 'play' | 'clear' | 'dead' = 'intro';
  private streak = 0;
  private mult = 1;
  private best = 0;
  private hits = 0;
  private drag = { on: false, moved: false, id: -1, lastAng: 0, startX: 0, startY: 0, stepped: 0 };
  private clock = 0;

  createGame(): void {
    makeSymbols(this);
    this.dots = []; this.plan = []; this.ringSyms = [];
    this.segs = 4; this.rot = 0; this.shown = 0; this.wave = 0; this.waveTime = 0;
    this.state = 'intro'; this.streak = 0; this.mult = 1; this.best = 0; this.hits = 0; this.clock = 0;
    this.drag = { on: false, moved: false, id: -1, lastAng: 0, startX: 0, startY: 0, stepped: 0 };

    this.bg = this.add.graphics().setDepth(-10);
    this.guides = this.add.graphics().setDepth(4);
    this.ring = this.add.container(CX, CY).setDepth(10);
    this.ringG = this.add.graphics();
    this.ring.add(this.ringG);
    this.core = this.add.circle(CX, CY, RING_R - RING_T / 2 - 8, 0x1c1830).setStrokeStyle(4, 0xffffff, 0.25).setDepth(9);
    this.multText = txt(this, CX, CY, 'x1', { title: true, size: 34, color: '#ffd23f' }).setDepth(11);
    this.hint = txt(this, CX, 1080, t('hint'), { size: 30, color: '#f3f2f2', wrap: 640 }).setDepth(20);
    this.tweens.add({ targets: this.hint, alpha: 0.4, duration: 700, yoyo: true, repeat: -1 });

    // side tap markers (touch): curved arrows showing which way each half turns the ring
    for (const s of [-1, 1]) {
      const g = this.add.graphics({ x: CX + s * 270, y: 1185 }).setDepth(20).setAlpha(0.45);
      const a0 = Phaser.Math.DegToRad(200), a1 = Phaser.Math.DegToRad(340);
      g.lineStyle(10, 0xffffff, 1).beginPath().arc(0, 14, 34, a0, a1).strokePath();
      const tip = s > 0 ? a1 : a0;
      const tx = Math.cos(tip) * 34, ty = 14 + Math.sin(tip) * 34;
      g.fillStyle(0xffffff, 1).fillTriangle(tx + s * 16, ty + 6, tx - s * 8, ty - 14, tx - s * 6, ty + 18);
      this.tweens.add({ targets: g, scale: 1.12, duration: 800, yoyo: true, repeat: -1 });
    }

    this.buildRing(true);
    this.updateMult(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    const kb = this.input.keyboard;
    for (const k of ['LEFT', 'A']) kb?.on(`keydown-${k}`, () => this.step(-1));
    for (const k of ['RIGHT', 'D']) kb?.on(`keydown-${k}`, () => this.step(1));

    this.time.delayedCall(400, () => this.nextWave());
  }

  // ---------- ring ----------
  private get stepDeg(): number { return 360 / this.segs; }

  private buildRing(first = false): void {
    this.cols = rng.shuffle([...Array(this.segs).keys()]);
    this.ringSyms.forEach((s) => s.destroy());
    this.ringSyms = [];
    this.drawRing();
    this.cols.forEach((c, i) => {
      const a = Phaser.Math.DegToRad((i + 0.5) * this.stepDeg);
      const img = this.add.image(Math.cos(a) * RING_R, Math.sin(a) * RING_R, `sym-${c}`).setScale(0.56);
      this.ring.add(img);
      this.ringSyms.push(img);
    });
    this.rot = 0; this.shown = 0; this.ring.angle = 0;
    if (!first) {
      this.ring.setScale(0.3);
      this.tweens.add({ targets: this.ring, scale: 1, duration: 450, ease: 'Back.easeOut' });
      burst(this, CX, CY, PALETTE.slice(0, this.segs), 40, 420);
    }
  }

  private drawRing(flashSeg = -1): void {
    const g = this.ringG;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillCircle(0, 6, RING_R + RING_T / 2 + 6);
    for (let i = 0; i < this.segs; i++) {
      const a0 = Phaser.Math.DegToRad(i * this.stepDeg + 1.2), a1 = Phaser.Math.DegToRad((i + 1) * this.stepDeg - 1.2);
      g.lineStyle(RING_T, i === flashSeg ? 0xffffff : PALETTE[this.cols[i]], 1).beginPath().arc(0, 0, RING_R, a0, a1).strokePath();
      g.lineStyle(6, 0xffffff, 0.28).beginPath().arc(0, 0, RING_R + RING_T / 2 - 6, a0, a1).strokePath();
    }
    g.lineStyle(4, 0x000000, 0.6).strokeCircle(0, 0, RING_R + RING_T / 2).strokeCircle(0, 0, RING_R - RING_T / 2);
  }

  /** Palette index of the segment at world angle `ang` (degrees). */
  private segAt(ang: number): number {
    const local = (((ang - this.rot) % 360) + 360) % 360;
    return Math.floor(local / this.stepDeg) % this.segs;
  }

  private step(dir: number): void {
    if (this.state === 'dead' || this.isOver) return;
    this.rot += dir * this.stepDeg;
    this.sfx('turn', { volume: 0.35 });
    this.fadeHint();
  }

  private fadeHint(): void {
    if (!this.hint.visible) return;
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, duration: 300, onComplete: () => this.hint.setVisible(false) });
  }

  // ---------- input ----------
  private onDown(p: Phaser.Input.Pointer): void {
    if (p.x > 600 && p.y < 130) return;          // pause button
    if (this.state === 'dead' || this.isOver) return;
    const dir = p.x < CX ? -1 : 1;
    this.step(dir);                               // instant response; cancelled if this becomes a drag
    this.drag = { on: true, moved: false, id: p.id, lastAng: Math.atan2(p.y - CY, p.x - CX), startX: p.x, startY: p.y, stepped: dir };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d.on || p.id !== d.id || !p.isDown) return;
    if (!d.moved && Math.hypot(p.x - d.startX, p.y - d.startY) > 26) {
      d.moved = true;
      this.rot -= d.stepped * this.stepDeg;       // undo the tap step: this is a drag
    }
    if (!d.moved) return;
    const a = Math.atan2(p.y - CY, p.x - CX);
    let da = a - d.lastAng;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    d.lastAng = a;
    // close to the centre the angle jumps around: weight it down there
    const k = Phaser.Math.Clamp(Math.hypot(p.x - CX, p.y - CY) / 160, 0.3, 1);
    this.rot += Phaser.Math.RadToDeg(da) * k;
    this.shown = this.rot;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d.on || p.id !== d.id) return;
    d.on = false;
    if (d.moved) {
      const snapped = Math.round(this.rot / this.stepDeg) * this.stepDeg;
      this.rot = snapped;
      this.sfx('turn', { volume: 0.3 });
    }
  }

  // ---------- waves ----------
  private nextWave(): void {
    if (this.isOver) return;
    this.wave++;
    const w = this.wave;
    const want = w >= 7 ? 6 : w >= 4 ? 5 : 4;
    const grow = want !== this.segs;
    if (grow) {
      this.segs = want;
      this.buildRing();
      this.sfx('newcol', { volume: 0.6 });
      this.time.delayedCall(700, () => banner(this, 420, t('newColour'), '#5dff7a', 30));
    }
    this.hud.setRight(`${t('wave')} ${w}`);
    banner(this, 330, `${t('wave')} ${w}`);
    this.sfx('wave', { volume: 0.5, exact: true });

    // plan the wave: arrival times on the wave clock
    this.travel = Math.max(1.05, 2.35 - 0.13 * (w - 1));
    const n = 8 + w * 3;
    const gapBase = Math.max(0.32, 0.85 - 0.06 * (w - 1));
    const doubleP = w >= 5 ? Math.min(0.3, 0.06 * (w - 4)) : 0;
    const rainbowP = w >= 3 ? 0.07 : 0;
    this.plan = [];
    let at = this.travel + (grow ? 1.6 : 1.0);
    let lastAng = -999;
    // Every dot needs the ring at one rotation (in steps). Two dots in a row that need rotations
    // far apart get enough time between them for the taps, so a wave can always be matched.
    const segs = this.segs;
    const turns = (a: number, b: number) => { const d = Math.abs(a - b) % segs; return Math.min(d, segs - d); };
    let prevAt = -1, prevR = -1;
    const fit = (r: number) => {
      if (prevR >= 0) at = Math.max(at, prevAt + MIN_GAP + TURN_TIME * turns(prevR, r));
      prevAt = at; prevR = r;
    };
    for (let i = 0; i < n; i++) {
      const stepDeg = this.stepDeg;
      if (rng.chance(doubleP) && i > 1) {
        // two dots at once: their colours fit one rotation of the ring, so it is always solvable
        const r = rng.int(0, segs - 1);
        const k1 = rng.int(0, segs - 1);
        let k2 = (k1 + rng.int(1, segs - 1)) % segs;
        if (k2 === k1) k2 = (k1 + 1) % segs;
        fit(r);
        for (const k of [k1, k2]) {
          const ang = (k + 0.5) * stepDeg;
          const seg = (((k - r) % segs) + segs) % segs;
          this.plan.push({ arrive: at, ang, col: this.cols[seg] });
        }
        at += gapBase * 1.9;
        continue;
      }
      let k = rng.int(0, segs - 1);
      if ((k + 0.5) * stepDeg === lastAng && rng.chance(0.5)) k = (k + 1) % segs;
      const ang = (k + 0.5) * stepDeg + Phaser.Math.FloatBetween(-stepDeg * 0.18, stepDeg * 0.18);
      lastAng = (k + 0.5) * stepDeg;
      const col = rng.chance(rainbowP) ? RAINBOW : this.cols[rng.int(0, segs - 1)];
      if (col !== RAINBOW) fit((((k - this.cols.indexOf(col)) % segs) + segs) % segs);
      this.plan.push({ arrive: at, ang, col });
      at += gapBase * Phaser.Math.FloatBetween(0.85, 1.45);
    }
    this.waveTime = 0;
    this.state = 'play';
  }

  private spawn(pl: Planned): void {
    const a = Phaser.Math.DegToRad(pl.ang);
    const dx = Math.cos(a), dy = Math.sin(a);
    // start at the edge of the play area along this direction
    const lim = [dx > 0 ? (690 - CX) / dx : dx < 0 ? (30 - CX) / dx : 1e9, dy > 0 ? (1240 - CY) / dy : dy < 0 ? (170 - CY) / dy : 1e9];
    const dist = Math.min(...lim);
    const c = this.add.container(CX + dx * dist, CY + dy * dist).setDepth(8);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillCircle(0, 4, DOT_R + 4);
    if (pl.col === RAINBOW) {
      PALETTE.forEach((col, i) => {
        g.fillStyle(col, 1).slice(0, 0, DOT_R, Phaser.Math.DegToRad(i * 60), Phaser.Math.DegToRad((i + 1) * 60)).fillPath();
      });
      g.lineStyle(4, 0xffffff, 1).strokeCircle(0, 0, DOT_R);
      c.add(g);
    } else {
      g.fillStyle(PALETTE[pl.col], 1).fillCircle(0, 0, DOT_R);
      g.lineStyle(4, 0xffffff, 0.9).strokeCircle(0, 0, DOT_R);
      g.fillStyle(0xffffff, 0.35).fillCircle(-8, -9, 7);
      c.add([g, this.add.image(0, 0, `sym-${pl.col}`).setScale(0.48)]);
    }
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    const speed = (dist - HIT_R) / this.travel;
    this.dots.push({ c, ang: pl.ang, dist, speed, col: pl.col, arrive: pl.arrive });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.clock += dt;
    this.drawBg();

    // ring eases to its logical angle
    if (!this.drag.moved || !this.drag.on) this.shown += (this.rot - this.shown) * Math.min(1, dt * 22);
    this.ring.angle = this.shown;
    for (const s of this.ringSyms) s.angle = -this.shown;

    if (this.state === 'dead') return;
    if (this.state === 'play') {
      this.waveTime += dt;
      while (this.plan.length && this.waveTime >= this.plan[0].arrive - this.travel) this.spawn(this.plan.shift()!);
    }

    const gd = this.guides;
    gd.clear();
    for (const d of [...this.dots]) {
      d.dist -= d.speed * dt;
      const a = Phaser.Math.DegToRad(d.ang);
      d.c.setPosition(CX + Math.cos(a) * d.dist, CY + Math.sin(a) * d.dist);
      // faint guide line + target mark on the ring edge for the next dots
      const col = d.col === RAINBOW ? 0xffffff : PALETTE[d.col];
      const near = Phaser.Math.Clamp(1 - (d.dist - HIT_R) / 500, 0.15, 1);
      gd.lineStyle(3, col, 0.18 * near).lineBetween(CX + Math.cos(a) * (HIT_R + 4), CY + Math.sin(a) * (HIT_R + 4), d.c.x, d.c.y);
      const half = Phaser.Math.DegToRad(Math.min(12, this.stepDeg * 0.2));
      gd.lineStyle(8, col, 0.35 + 0.5 * near).beginPath().arc(CX, CY, RING_R + RING_T / 2 + 12, a - half, a + half).strokePath();
      if (d.dist <= HIT_R) this.resolve(d);
      if ((this.state as string) === 'dead') return;
    }

    if (this.state === 'play' && !this.plan.length && !this.dots.length) this.waveClear();
  }

  private drawBg(): void {
    const g = this.bg;
    g.clear();
    g.fillStyle(0x15112a, 1).fillRect(0, 0, 720, 1280);
    // slowly turning rays in the ring colours
    for (let i = 0; i < 12; i++) {
      const a = Phaser.Math.DegToRad(i * 30 + this.clock * 6);
      g.fillStyle(PALETTE[this.cols[i % this.segs] ?? 0], 0.05);
      g.slice(CX, CY, 1100, a, a + Phaser.Math.DegToRad(12)).fillPath();
    }
    g.fillStyle(0xffffff, 0.04).fillCircle(CX, CY, HIT_R + 70 + Math.sin(this.clock * 3) * 6);
  }

  private resolve(d: Dot): void {
    this.dots.splice(this.dots.indexOf(d), 1);
    const seg = this.segAt(d.ang);
    const segCol = this.cols[seg];
    const a = Phaser.Math.DegToRad(d.ang);
    const hx = CX + Math.cos(a) * (RING_R + RING_T / 2), hy = CY + Math.sin(a) * (RING_R + RING_T / 2);
    if (d.col !== RAINBOW && d.col !== segCol) {
      this.lose(d, hx, hy);
      return;
    }
    this.streak++;
    this.hits++;
    this.best = Math.max(this.best, this.streak);
    const prevMult = this.mult;
    this.updateMult(true);
    const pts = (d.col === RAINBOW ? 30 : 10) * this.mult;
    this.addScore(pts, hx + Math.cos(a) * 60, hy + Math.sin(a) * 60);
    burst(this, hx, hy, d.col === RAINBOW ? PALETTE : [PALETTE[segCol], 0xffffff], 18, 300);
    this.sfxAt(d.col === RAINBOW ? 'rainbow' : 'hit', hx, { volume: 0.5, exact: true, rate: 1 + Math.min(12, this.streak % 13) * 0.045 });
    this.tweens.add({ targets: d.c, scale: 1.8, alpha: 0, duration: 160, onComplete: () => d.c.destroy() });
    // ring kick
    this.tweens.killTweensOf(this.ring);
    this.ring.setScale(1);
    this.tweens.add({ targets: this.ring, scale: 1.06, duration: 60, yoyo: true });
    this.drawRing(seg);
    this.time.delayedCall(70, () => { if (this.state !== 'dead') this.drawRing(); });
    if (this.mult > prevMult) {
      this.sfx('combo', { volume: 0.5 });
      popup(this, CX, CY - 200, `${t('combo')} x${this.mult}`, '#5dff7a', 30);
      burst(this, CX, CY, [0xffd23f, 0xffffff], 24, 260);
    }
  }

  private updateMult(pop: boolean): void {
    this.mult = Math.min(8, 1 + Math.floor(this.streak / 5));
    this.multText.setText(`x${this.mult}`);
    this.multText.setColor(this.mult >= 5 ? '#ff4fa3' : this.mult >= 3 ? '#5dff7a' : '#ffd23f');
    if (pop) {
      this.tweens.killTweensOf(this.multText);
      this.multText.setScale(1);
      this.tweens.add({ targets: this.multText, scale: 1.25, duration: 70, yoyo: true });
    }
  }

  private waveClear(): void {
    this.state = 'clear';
    const bonus = 50 * this.wave;
    this.addScore(bonus);
    popup(this, CX, CY - 220, `${t('waveClear')} +${bonus}`, '#5dff7a', 26);
    this.sfx('clear', { volume: 0.55, exact: true });
    softFlash(this, 0xffffff, 90, 0.2);
    burst(this, CX, CY, PALETTE.slice(0, this.segs), 36, 480);
    this.time.delayedCall(1300, () => this.nextWave());
  }

  private lose(d: Dot, hx: number, hy: number): void {
    this.state = 'dead';
    d.c.destroy();
    burst(this, hx, hy, [PALETTE[d.col], 0xffffff], 40, 520);
    burst(this, CX, CY, PALETTE.slice(0, this.segs), 50, 600);
    this.sfxAt('wrong', hx, { volume: 0.6 });
    this.sfx('shatter', { volume: 0.55 });
    shake(this, 0.025, 360);
    softFlash(this, 0xec3013, 180);
    this.tweens.add({ targets: this.ring, angle: this.ring.angle + 40, scale: 0.85, alpha: 0.4, duration: 600, ease: 'Cubic.easeOut' });
    for (const o of this.dots) this.tweens.add({ targets: o.c, alpha: 0, scale: 0.3, duration: 400 });
    popup(this, hx, hy - 40, t('wrong'), '#ec3013', 24);
    this.endGame({ title: t('wrong'), delay: 1100 });
  }
}
