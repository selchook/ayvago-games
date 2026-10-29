import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, net, upper } from '@core';

type R4 = [number, number, number, number];           // x, y, w, h
interface Mover { r: R4; ax: number; ay: number; speed: number; phase: number }
interface Hole {
  par: number; tee: [number, number]; cup: [number, number];
  walls?: R4[]; water?: R4[]; sand?: R4[]; bumpers?: [number, number, number][]; movers?: Mover[];
}

const B: R4 = [50, 150, 620, 1050];   // playable bounds
const BR = 12;                        // ball radius
const CUP_R = 19;
const MAX_STROKES = 8;

const HOLES: Hole[] = [
  { par: 2, tee: [360, 1110], cup: [360, 300], walls: [[290, 700, 140, 30]] },
  { par: 3, tee: [200, 1110], cup: [520, 300], walls: [[370, 620, 300, 580]], bumpers: [[200, 330, 34]] },
  { par: 3, tee: [360, 1110], cup: [300, 300], water: [[50, 620, 440, 100]], bumpers: [[590, 470, 30]], sand: [[400, 230, 140, 120]] },
  { par: 3, tee: [360, 1110], cup: [360, 280], bumpers: [[220, 640, 40], [500, 640, 40], [360, 820, 40], [360, 470, 34]], sand: [[60, 230, 180, 140], [480, 230, 180, 140]] },
  { par: 4, tee: [170, 1120], cup: [170, 270], walls: [[50, 920, 450, 30], [220, 680, 450, 30], [50, 440, 450, 30]], bumpers: [[620, 800, 28], [100, 560, 28]] },
  { par: 3, tee: [360, 1110], cup: [360, 420], water: [[170, 280, 380, 50], [170, 280, 50, 280], [500, 280, 50, 280], [50, 760, 260, 70], [410, 760, 260, 70]] },
  { par: 3, tee: [360, 1110], cup: [360, 300], walls: [[50, 640, 240, 40], [430, 640, 240, 40]], movers: [{ r: [300, 640, 120, 40], ax: 70, ay: 0, speed: 1.6, phase: 0 }], sand: [[260, 200, 200, 60]] },
  { par: 3, tee: [360, 1120], cup: [360, 290], movers: [{ r: [260, 900, 200, 36], ax: 220, ay: 0, speed: 1.3, phase: 0 }, { r: [260, 580, 200, 36], ax: 220, ay: 0, speed: 1.9, phase: 2 }], bumpers: [[170, 400, 34], [550, 400, 34]], water: [[50, 740, 120, 80], [550, 740, 120, 80]] },
  { par: 5, tee: [120, 1120], cup: [580, 290], walls: [[170, 1000, 500, 30], [50, 780, 500, 30], [170, 560, 500, 30]], water: [[50, 230, 230, 150]], bumpers: [[430, 400, 40]], movers: [{ r: [300, 660, 36, 100], ax: 0, ay: 0, speed: 0, phase: 0 }, { r: [380, 860, 120, 36], ax: 200, ay: 0, speed: 1.4, phase: 1 }] },
];

// online: both players play every hole; shots alternate (the round's starter, net.starter, tees
// off first on every hole) until both balls are done
const SEND_MS = 50;              // ~20 ball snapshots per second during a shot
const TEE_OFF = 16;              // the two balls share the tee mat, side by side
const OPP_TINT = 0xff8a5a;       // the other player's ball
/** Shot snapshot: shot number, ball x/y, hole clock (ms), events since the last one (1 wall, 2 bumper, 4 sand, 8 water). */
interface ShotSnap { n: number; x: number; y: number; h: number; e: number }
/** Shot result: shot number, rest x/y, strokes on this hole, sunk. */
interface ShotDone { n: number; x: number; y: number; k: number; s: number }
interface PState { x: number; y: number; strokes: number; total: number; done: boolean; img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }

const inRect = (x: number, y: number, r: R4) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

export class PlayScene extends ArcadeScene {
  private courseG!: Phaser.GameObjects.Graphics;
  private moverG!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private flag!: Phaser.GameObjects.Image;
  private footer!: Phaser.GameObjects.Text;
  private holeIdx = 0;
  private hole!: Hole;
  private bx = 0; private by = 0; private vx = 0; private vy = 0;
  private lastX = 0; private lastY = 0;
  private moving = false;
  private sinking = false;
  private between = false;
  private strokes = 0;
  private totalStrokes = 0;
  private aimAngle = -Math.PI / 2;
  private power = 0.5;
  private dragging: Phaser.Math.Vector2 | null = null;
  private dragPower = 0;
  private moverRects: R4[] = [];
  private moverVel: [number, number][] = [];
  private bumperFlash: number[] = [];
  private holeT = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  // online
  private online = false;
  private seat: 0 | 1 = 0;
  private ps: PState[] = [];
  private cur: 0 | 1 = 0;           // whose ball is loaded into bx/by/strokes (the shooter)
  private shotNo = 0;               // completed shots in the match
  private turnLive = false;         // the shooter may putt now
  private inShot = false;           // the shooter's ball is out on a shot
  private watching = false;         // the other player's shot is being streamed to us
  private sendT = 0;
  private ev = 0;
  private wx = 0; private wy = 0;   // last streamed ball position (watcher)
  private started = false;
  private topLine!: Phaser.GameObjects.Text;
  private meLine!: Phaser.GameObjects.Text;
  private oppLine!: Phaser.GameObjects.Text;

  createGame(): void {
    this.holeIdx = 0; this.strokes = 0; this.totalStrokes = 0; this.moving = false; this.sinking = false; this.between = false;
    this.aimAngle = -Math.PI / 2; this.power = 0.5; this.dragging = null; this.dragPower = 0;
    this.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('flag').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.courseG = this.add.graphics().setDepth(0);
    this.moverG = this.add.graphics().setDepth(2);
    this.aimG = this.add.graphics().setDepth(5);
    this.ballShadow = this.add.ellipse(0, 0, 26, 14, 0x000000, 0.3).setDepth(3);
    this.ball = this.add.image(0, 0, 'ball').setScale((BR * 2) / 8).setDepth(4);
    this.flag = this.add.image(0, 0, 'flag').setOrigin(0.12, 0.92).setScale(3).setDepth(6);
    this.footer = txt(this, 360, 1240, '', { title: true, size: 22, color: '#f3f2f2' }).setDepth(10);
    this.online = net.active; this.seat = net.seat; this.ps = []; this.cur = 0; this.shotNo = 0;
    this.turnLive = false; this.inShot = false; this.watching = false; this.sendT = 0; this.ev = 0; this.started = false;
    this.useHud = !this.online;

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W), s: kb.addKey(K.S) };
    kb.on('keydown-SPACE', () => this.putt(this.aimAngle, this.power));
    kb.on('keydown-Z', () => this.putt(this.aimAngle, this.power));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 580 && p.y < 140) return;
      if (this.canPutt()) { this.dragging = new Phaser.Math.Vector2(p.x, p.y); this.dragPower = 0; }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || !p.isDown) return;
      const dx = this.dragging.x - p.x, dy = this.dragging.y - p.y, len = Math.hypot(dx, dy);
      this.dragPower = Phaser.Math.Clamp((len - 15) / 260, 0, 1);
      if (len > 15) this.aimAngle = Math.atan2(dy, dx);
    });
    this.input.on('pointerup', () => {
      if (!this.dragging) return;
      this.dragging = null;
      if (this.dragPower > 0.03) { this.power = this.dragPower; this.putt(this.aimAngle, this.dragPower); }
    });

    if (this.online) { this.setupOnline(); return; }
    this.loadHole(0);
  }

  private canPutt(): boolean {
    if (this.online && !(this.turnLive && this.cur === this.seat && !this.inShot)) return false;
    return !this.moving && !this.sinking && !this.between && !this.isOver;
  }

  // ---------- hole setup ----------
  private loadHole(i: number): void {
    this.holeIdx = i;
    this.hole = HOLES[i];
    this.strokes = 0;
    this.holeT = 0;
    this.moverRects = (this.hole.movers ?? []).map((m) => [...m.r] as R4);
    this.moverVel = this.moverRects.map(() => [0, 0]);
    this.bumperFlash = (this.hole.bumpers ?? []).map(() => 0);
    [this.bx, this.by] = this.hole.tee;
    this.lastX = this.bx; this.lastY = this.by;
    this.vx = this.vy = 0;
    this.moving = false; this.sinking = false; this.between = false;
    this.aimAngle = Math.atan2(this.hole.cup[1] - this.by, this.hole.cup[0] - this.bx);
    this.ball.setAlpha(1).setScale((BR * 2) / 8);
    this.flag.setPosition(this.hole.cup[0], this.hole.cup[1]).setAlpha(1);
    this.drawCourse();
    this.hud.setRight(`${t('hole')} ${i + 1}/9`);
    this.updateFooter();
    // slide-in
    this.cameras.main.setScroll(-720, 0);
    this.tweens.add({ targets: this.cameras.main, scrollX: 0, duration: 450, ease: 'Cubic.easeOut' });
  }

  private updateFooter(): void {
    if (this.online) { this.updateOnlineText(); return; }
    this.footer.setText(`${t('par')} ${this.hole.par}    ${t('strokes')} ${this.strokes}`);
  }

  private drawCourse(): void {
    const g = this.courseG;
    const h = this.hole;
    g.clear();
    // frame + grass stripes
    g.fillStyle(0x6b4423).fillRoundedRect(B[0] - 18, B[1] - 18, B[2] + 36, B[3] + 36, 18);
    g.fillStyle(0x8a5a30).fillRoundedRect(B[0] - 12, B[1] - 12, B[2] + 24, B[3] + 24, 14);
    for (let y = B[1], k = 0; y < B[1] + B[3]; y += 70, k++) g.fillStyle(k % 2 ? 0x4caf50 : 0x55bb59).fillRect(B[0], y, B[2], Math.min(70, B[1] + B[3] - y));
    for (const s of h.sand ?? []) {
      g.fillStyle(0xe6cf8b).fillRoundedRect(s[0], s[1], s[2], s[3], 22);
      g.fillStyle(0xc9b06a);
      for (let k = 0; k < (s[2] * s[3]) / 500; k++) g.fillRect(s[0] + 10 + ((k * 37) % (s[2] - 20)), s[1] + 10 + ((k * 53) % (s[3] - 20)), 3, 3);
    }
    for (const w of h.water ?? []) {
      g.fillStyle(0x1f6fb5).fillRect(w[0], w[1], w[2], w[3]);
      g.lineStyle(3, 0x6fc3ff, 0.6);
      for (let y = w[1] + 16; y < w[1] + w[3] - 6; y += 22) for (let x = w[0] + 10; x < w[0] + w[2] - 24; x += 46) g.lineBetween(x, y, x + 18, y);
    }
    for (const w of h.walls ?? []) {
      g.fillStyle(0x000000, 0.3).fillRect(w[0] + 5, w[1] + 6, w[2], w[3]);
      g.fillStyle(0x8a5a30).fillRect(w[0], w[1], w[2], w[3]);
      g.fillStyle(0xb07a45).fillRect(w[0], w[1], w[2], 6);
    }
    // tee mat + cup
    g.fillStyle(0x2e7d32).fillRoundedRect(h.tee[0] - 34, h.tee[1] - 24, 68, 48, 8);
    g.fillStyle(0x000000, 0.25).fillCircle(h.cup[0], h.cup[1], CUP_R + 7);
    g.fillStyle(0x111111).fillCircle(h.cup[0], h.cup[1], CUP_R);
  }

  private drawDynamic(): void {
    const g = this.moverG;
    g.clear();
    (this.hole.bumpers ?? []).forEach((b, i) => {
      const f = this.bumperFlash[i];
      g.fillStyle(0x000000, 0.3).fillCircle(b[0] + 4, b[1] + 6, b[2]);
      g.fillStyle(f > 0 ? 0xffffff : 0xec3013).fillCircle(b[0], b[1], b[2] + f * 6);
      g.fillStyle(f > 0 ? 0xffd23f : 0xff6b5a).fillCircle(b[0], b[1], b[2] * 0.62);
      g.lineStyle(4, 0xffffff, 0.9).strokeCircle(b[0], b[1], b[2] + f * 6);
    });
    for (const r of this.moverRects) {
      g.fillStyle(0x000000, 0.3).fillRect(r[0] + 5, r[1] + 6, r[2], r[3]);
      g.fillStyle(0x8b5cff).fillRect(r[0], r[1], r[2], r[3]);
      g.fillStyle(0xb79bff).fillRect(r[0], r[1], r[2], 6);
      g.lineStyle(3, 0x3a2a7a).strokeRect(r[0], r[1], r[2], r[3]);
    }
  }

  // ---------- shooting ----------
  private putt(angle: number, power: number): void {
    if (!this.canPutt()) return;
    const sp = 120 + power * 1180;
    this.vx = Math.cos(angle) * sp; this.vy = Math.sin(angle) * sp;
    this.lastX = this.bx; this.lastY = this.by;
    this.moving = true;
    if (this.online) { this.inShot = true; this.ev = 0; this.sendT = -1e9; }
    this.strokes++; this.totalStrokes++;
    this.updateFooter();
    this.sfx('putt', { volume: 0.4 + power * 0.5 });
    burst(this, this.bx, this.by, [0xffffff, 0x8ee28f], 6, 120);
  }

  // ---------- physics ----------
  private bounceRect(r: R4, e: number, mv?: [number, number]): boolean {
    const cx = Phaser.Math.Clamp(this.bx, r[0], r[0] + r[2]), cy = Phaser.Math.Clamp(this.by, r[1], r[1] + r[3]);
    let dx = this.bx - cx, dy = this.by - cy, d = Math.hypot(dx, dy);
    if (d >= BR) return false;
    if (d === 0) { // centre inside: push out along the shortest axis
      const l = this.bx - r[0], rr = r[0] + r[2] - this.bx, tp = this.by - r[1], bt = r[1] + r[3] - this.by, m = Math.min(l, rr, tp, bt);
      dx = m === l ? -1 : m === rr ? 1 : 0; dy = m === tp ? -1 : m === bt ? 1 : 0; d = 1;
      this.bx += dx * (m + BR); this.by += dy * (m + BR);
    } else { this.bx = cx + (dx / d) * BR; this.by = cy + (dy / d) * BR; }
    const nx = dx / d, ny = dy / d;
    const rvx = this.vx - (mv?.[0] ?? 0), rvy = this.vy - (mv?.[1] ?? 0);
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny;
      if (-vn > 60) { this.sfx('wall', { volume: Math.min(0.7, -vn / 900), x: this.bx }); this.ev |= 1; }
      if (!this.moving) this.moving = true;
    }
    return true;
  }

  private stepMovers(dt: number): void {
    this.holeT += dt;
    (this.hole.movers ?? []).forEach((m, i) => {
      const r = this.moverRects[i];
      const nx = m.r[0] + Math.sin(this.holeT * m.speed + m.phase) * m.ax, ny = m.r[1] + Math.sin(this.holeT * m.speed + m.phase) * m.ay;
      this.moverVel[i] = [(nx - r[0]) / dt, (ny - r[1]) / dt];
      r[0] = nx; r[1] = ny;
    });
    this.bumperFlash = this.bumperFlash.map((f) => Math.max(0, f - dt * 5));
  }

  private step(dt: number): void {
    const h = this.hole;
    // movers
    this.stepMovers(dt);

    const speed = Math.hypot(this.vx, this.vy);
    const n = Math.max(1, Math.ceil((speed * dt) / 5));
    const sdt = dt / n;
    for (let s = 0; s < n && !this.sinking; s++) {
      this.bx += this.vx * sdt; this.by += this.vy * sdt;
      // outer bounds
      if (this.bx < B[0] + BR) { this.bx = B[0] + BR; this.vx = Math.abs(this.vx) * 0.75; this.sfx('wall', { volume: 0.3, x: this.bx }); this.ev |= 1; }
      if (this.bx > B[0] + B[2] - BR) { this.bx = B[0] + B[2] - BR; this.vx = -Math.abs(this.vx) * 0.75; this.sfx('wall', { volume: 0.3, x: this.bx }); this.ev |= 1; }
      if (this.by < B[1] + BR) { this.by = B[1] + BR; this.vy = Math.abs(this.vy) * 0.75; this.sfx('wall', { volume: 0.3, x: this.bx }); this.ev |= 1; }
      if (this.by > B[1] + B[3] - BR) { this.by = B[1] + B[3] - BR; this.vy = -Math.abs(this.vy) * 0.75; this.sfx('wall', { volume: 0.3, x: this.bx }); this.ev |= 1; }
      for (const w of h.walls ?? []) this.bounceRect(w, 0.75);
      this.moverRects.forEach((r, i) => { if (this.bounceRect(r, 0.8, this.moverVel[i])) shake(this, 0.003, 60); });
      (h.bumpers ?? []).forEach((b, i) => {
        const dx = this.bx - b[0], dy = this.by - b[1], d = Math.hypot(dx, dy), min = BR + b[2];
        if (d >= min || d === 0) return;
        const nx = dx / d, ny = dy / d;
        this.bx = b[0] + nx * min; this.by = b[1] + ny * min;
        const vn = this.vx * nx + this.vy * ny;
        if (vn < 0) {
          this.vx -= 2 * vn * nx; this.vy -= 2 * vn * ny;
          const sp = Math.min(1100, Math.hypot(this.vx, this.vy) * 1.15 + 140);
          const k = sp / Math.hypot(this.vx, this.vy);
          this.vx *= k; this.vy *= k;
          this.bumperFlash[i] = 1;
          this.ev |= 2;
          this.sfx('bumper', { volume: 0.5, x: this.bx });
          burst(this, b[0] + nx * b[2], b[1] + ny * b[2], [0xffd23f, 0xffffff], 8, 180);
        }
      });
      // cup: gentle pull, sink when slow enough
      const cdx = h.cup[0] - this.bx, cdy = h.cup[1] - this.by, cd = Math.hypot(cdx, cdy);
      if (cd < CUP_R) {
        const sp = Math.hypot(this.vx, this.vy);
        if (sp < 560) { this.sink(); return; }
        this.vx += (cdx / (cd || 1)) * 2600 * sdt; this.vy += (cdy / (cd || 1)) * 2600 * sdt;
      }
    }
    if (this.sinking) return;

    // friction (sand is heavy)
    const inSand = (h.sand ?? []).some((s) => inRect(this.bx, this.by, s));
    const k = inSand ? 3.2 : 0.9, c = inSand ? 220 : 55;
    let sp = Math.hypot(this.vx, this.vy);
    if (inSand && sp > 200 && Math.random() < dt * 8) { this.sfx('sand', { volume: 0.3 }); this.ev |= 4; }
    const nsp = Math.max(0, sp * Math.exp(-k * dt) - c * dt);
    if (sp > 0) { this.vx *= nsp / sp; this.vy *= nsp / sp; }
    sp = nsp;

    // water
    // (only once per drop; the ball sits in the water until it is put back)
    if (!this.between && (h.water ?? []).some((w) => inRect(this.bx, this.by, w))) { this.splash(); return; }
    if (sp < 6 && this.moving) {
      this.vx = this.vy = 0;
      this.moving = false;
      if (this.online) this.shotEnded(false);
      else if (this.strokes >= MAX_STROKES) this.finishHole(false);
    }
  }

  private splash(): void {
    this.moving = false; this.vx = this.vy = 0;
    if (this.online) { this.ev |= 8; this.streamShot(true); }
    this.sfx('splash', { volume: 0.7 });
    burst(this, this.bx, this.by, [0x6fc3ff, 0xffffff, 0x1f6fb5], 24, 220);
    popup(this, this.bx, this.by - 30, t('water'), '#6fc3ff', 22);
    this.strokes++; this.totalStrokes++;
    this.updateFooter();
    this.between = true;
    this.ball.setAlpha(0);
    this.time.delayedCall(700, () => {
      this.bx = this.lastX; this.by = this.lastY;
      this.ball.setAlpha(1).setScale(0.1);
      this.tweens.add({ targets: this.ball, scale: (BR * 2) / 8, duration: 250, ease: 'Back.easeOut' });
      this.between = false;
      if (this.online) this.shotEnded(false);
      else if (this.strokes >= MAX_STROKES) this.finishHole(false);
    });
  }

  private sink(): void {
    this.sinking = true; this.moving = false; this.vx = this.vy = 0;
    const [cx, cy] = this.hole.cup;
    if (this.online) {
      this.sinkFx(this.ball);
      this.bx = cx; this.by = cy;
      this.time.delayedCall(260, () => this.shotEnded(true));
      return;
    }
    this.sfx('cup', { volume: 0.8 });
    this.tweens.add({ targets: this.ball, x: cx, y: cy, scale: 1, alpha: 0.4, duration: 220, ease: 'Quad.easeIn' });
    this.bx = cx; this.by = cy;
    this.tweens.add({ targets: this.flag, alpha: 0, y: cy - 40, duration: 300 });
    this.time.delayedCall(260, () => this.finishHole(true));
  }

  private finishHole(sunk: boolean): void {
    if (this.between && sunk === false && this.isOver) return;
    this.between = true;
    const diff = this.strokes - this.hole.par;
    let label: string, pts: number, color = '#f3f2f2';
    if (!sunk) { label = t('over'); pts = 0; color = '#ec3013'; }
    else if (this.strokes === 1) { label = t('ace'); pts = 600; color = '#ffd23f'; }
    else if (diff <= -3) { label = t('albatross'); pts = 450; color = '#ffd23f'; }
    else if (diff === -2) { label = t('eagle'); pts = 350; color = '#5dff7a'; }
    else if (diff === -1) { label = t('birdie'); pts = 250; color = '#5dff7a'; }
    else if (diff === 0) { label = t('parName'); pts = 150; color = '#3ee6ff'; }
    else if (diff === 1) { label = t('bogey'); pts = 80; }
    else if (diff === 2) { label = t('dbogey'); pts = 40; }
    else { label = `+${diff}`; pts = 15; color = '#ec3013'; }
    if (pts) this.addScore(pts, this.hole.cup[0], this.hole.cup[1] - 60);
    if (sunk && diff < 0) { this.sfx('great', { volume: 0.6 }); flash(this, 0xffd23f, 150); shake(this, 0.008, 160); }
    else if (sunk && diff === 0) this.sfx('par', { volume: 0.5 });
    else if (!sunk || diff > 1) this.sfx('bad', { volume: 0.4 });
    burst(this, this.hole.cup[0], this.hole.cup[1], diff < 0 ? [0xffd23f, 0x5dff7a, 0xffffff] : [0xffffff], diff < 0 ? 40 : 14, 320);
    const lt = txt(this, 360, 640, label, { title: true, size: 44, color, wrap: 640 }).setDepth(20).setScale(0.2);
    this.tweens.add({ targets: lt, scale: 1, duration: 320, ease: 'Back.easeOut', hold: 900, yoyo: true, onComplete: () => lt.destroy() });
    this.time.delayedCall(1700, () => {
      if (this.isOver) return;
      if (this.holeIdx >= HOLES.length - 1) {
        const tl = txt(this, 360, 740, t('total', { n: this.totalStrokes }), { title: true, size: 22, color: '#ffd23f' }).setDepth(20);
        tl.setAlpha(0); this.tweens.add({ targets: tl, alpha: 1, duration: 300 });
        this.endGame({ win: true, title: t('finish'), delay: 1200 });
      } else { this.sfx('next', { volume: 0.5 }); this.loadHole(this.holeIdx + 1); }
    });
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online) { this.updateOnline(dt); return; }
    if (!this.sinking) this.step(dt);
    if (this.canPutt()) {
      const k = this.keys;
      const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ay = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
      this.aimAngle += ax * 2.2 * dt;
      this.power = Phaser.Math.Clamp(this.power + ay * 0.7 * dt, 0.05, 1);
    }
    if (!this.sinking) this.ball.setPosition(this.bx, this.by);
    this.ballShadow.setPosition(this.bx + 3, this.by + 5).setVisible(!this.sinking && this.ball.alpha > 0.5);
    this.flag.setAngle(Math.sin(this.elapsed * 3) * 4);
    this.drawDynamic();
    this.drawAim();
  }

  private drawAim(): void {
    const g = this.aimG;
    g.clear();
    if (!this.canPutt()) return;
    const p = this.dragging ? this.dragPower : this.power;
    const len = 50 + p * 230;
    const cx = Math.cos(this.aimAngle), cy = Math.sin(this.aimAngle);
    const col = Phaser.Display.Color.GetColor(255, Math.round(230 - p * 180), Math.round(80 - p * 60));
    for (let d = 26; d < len; d += 18) g.fillStyle(col, 0.9 - (d / len) * 0.5).fillCircle(this.bx + cx * d, this.by + cy * d, 5);
    const tx = this.bx + cx * len, ty = this.by + cy * len;
    g.fillStyle(col).fillTriangle(tx + cx * 16, ty + cy * 16, tx - cy * 11, ty + cx * 11, tx + cy * 11, ty - cx * 11);
    g.lineStyle(2, 0xffffff, 0.5 + Math.sin(this.elapsed * 6) * 0.3).strokeCircle(this.bx, this.by, BR + 8);
  }

  // ================================================================ online two-player
  // Both players play the same nine holes with their own ball; on each hole the shots alternate
  // (the round's starter first) until both balls are down or out of strokes. The shooter simulates its shot and
  // streams the ball ('gs', ~20/s), then reports where it came to rest ('gd'). Lowest total wins.

  private oppName(): string {
    return upper(net.peerName || t('opponent')).slice(0, 10);
  }

  private setupOnline(): void {
    this.ps = ([0, 1] as const).map((seat) => {
      const img = seat === 0 ? this.ball : this.add.image(0, 0, 'ball').setScale((BR * 2) / 8).setDepth(4);
      const shadow = seat === 0 ? this.ballShadow : this.add.ellipse(0, 0, 26, 14, 0x000000, 0.3).setDepth(3);
      if (seat !== this.seat) img.setTint(OPP_TINT);
      return { x: 0, y: 0, strokes: 0, total: 0, done: false, img, shadow };
    });
    this.topLine = txt(this, 360, 42, '', { title: true, size: 22, color: '#ffd23f' }).setDepth(10).setScrollFactor(0);
    this.meLine = txt(this, 190, 98, '', { title: true, size: 20, color: '#ffffff' }).setDepth(10).setScrollFactor(0);
    this.oppLine = txt(this, 530, 98, '', { title: true, size: 20, color: '#ffb38a' }).setDepth(10).setScrollFactor(0);
    net.onScene(this, 'gs', (d: ShotSnap) => this.onShotSnap(d));
    net.onScene(this, 'gd', (d: ShotDone) => this.onShotDone(d));
    this.loadHoleOnline(0);
    if (net.myTurnFirst) {
      // first shot once the other side's course is up (or after 2.5 s at the latest)
      const go = () => {
        if (this.started || this.isOver) return;
        this.started = true;
        this.beginShotTurn(net.starter);
      };
      net.onScene(this, 'hi', go);
      this.time.delayedCall(2500, go);
    } else {
      net.send('hi', 1);
      this.started = true;
      this.beginShotTurn(net.starter);
    }
  }

  private loadHoleOnline(i: number): void {
    this.loadHole(i);
    const [tx, ty] = this.hole.tee;
    this.ps.forEach((p, seat) => {
      p.x = tx + (seat ? TEE_OFF : -TEE_OFF); p.y = ty; p.strokes = 0; p.done = false;
      this.tweens.killTweensOf(p.img);
      p.img.setAlpha(1).setScale((BR * 2) / 8).setPosition(p.x, p.y);
    });
    this.loadPlayer(net.starter);   // the starter tees off first on every hole
    this.turnLive = false; this.inShot = false; this.watching = false;
    this.updateOnlineText();
  }

  /** Loads a player's ball into the single-ball physics state. */
  private loadPlayer(seat: 0 | 1): void {
    const p = this.ps[seat];
    this.cur = seat;
    this.ball = p.img; this.ballShadow = p.shadow;
    this.bx = p.x; this.by = p.y; this.lastX = p.x; this.lastY = p.y;
    this.vx = this.vy = 0;
    this.strokes = p.strokes;
    this.moving = false; this.sinking = false; this.between = false;
    this.dragging = null;
    this.aimAngle = Math.atan2(this.hole.cup[1] - this.by, this.hole.cup[0] - this.bx);
    p.img.setDepth(4.5);
    this.ps[1 - seat].img.setDepth(4);
  }

  private beginShotTurn(seat: 0 | 1): void {
    if (this.isOver || this.watching) return;
    const was = this.cur;
    this.loadPlayer(seat);
    this.turnLive = true;
    this.updateOnlineText();
    if (seat === this.seat && (was !== seat || this.strokes === 0)) {
      popup(this, this.bx, this.by - 50, t('yourTurn'), '#5dff7a', 22);
      this.sfx('turn', { volume: 0.45 });
    }
  }

  private updateOnlineText(): void {
    if (!this.ps.length || !this.topLine) return;
    const me = this.ps[this.seat], op = this.ps[1 - this.seat];
    this.topLine.setText(`${t('hole')} ${this.holeIdx + 1}/9 · ${t('par')} ${this.hole.par}`);
    this.meLine.setText(`${t('you')} ${me.total}`);
    this.oppLine.setText(`${this.oppName()} ${op.total}`);
    const mine = this.cur === this.seat;
    this.footer.setText(`${mine ? t('yourTurn') : t('theirTurn')} · ${t('strokes')} ${this.strokes}`).setColor(mine ? '#5dff7a' : '#ffb38a');
  }

  private updateOnline(dt: number): void {
    const shooting = this.inShot && this.cur === this.seat;
    if (shooting) {
      if (!this.sinking) this.step(dt);
      if (this.inShot) this.streamShot(false);
    } else {
      this.stepMovers(dt);
      if (this.watching && !this.sinking) {
        const k = Math.min(1, dt * 15);
        this.bx += (this.wx - this.bx) * k; this.by += (this.wy - this.by) * k;
      }
    }
    if (this.canPutt()) {
      const k = this.keys;
      const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ay = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
      this.aimAngle += ax * 2.2 * dt;
      this.power = Phaser.Math.Clamp(this.power + ay * 0.7 * dt, 0.05, 1);
    }
    if (!this.sinking) this.ball.setPosition(this.bx, this.by);
    for (const p of this.ps) p.shadow.setPosition(p.img.x + 3, p.img.y + 5).setVisible(p.img.alpha > 0.5 && p.img.scale > 2);
    this.flag.setAngle(Math.sin(this.elapsed * 3) * 4);
    this.drawDynamic();
    this.drawAim();
  }

  /** Shooter: ball snapshot to the other player. */
  private streamShot(force: boolean): void {
    const now = this.time.now;
    if (!force && now - this.sendT < SEND_MS) return;
    this.sendT = now;
    net.send('gs', { n: this.shotNo, x: Math.round(this.bx), y: Math.round(this.by), h: Math.round(this.holeT * 1000), e: this.ev });
    this.ev = 0;
  }

  /** Shooter: the ball is at rest (or in the cup): report it, then both sides move on. */
  private shotEnded(sunk: boolean): void {
    if (!this.inShot || this.cur !== this.seat || this.isOver) return;
    this.bx = Math.round(this.bx); this.by = Math.round(this.by);
    this.streamShot(true);
    net.send('gd', { n: this.shotNo, x: this.bx, y: this.by, k: this.strokes, s: sunk ? 1 : 0 });
    this.resolveShot(sunk);
  }

  /** Watcher: the shooter's ball in flight. */
  private onShotSnap(d: ShotSnap): void {
    if (this.isOver || this.cur === this.seat || d.n !== this.shotNo) return;
    if (!this.watching) {
      this.watching = true;
      this.turnLive = false;
      this.strokes++;
      this.updateOnlineText();
      this.sfx('putt', { volume: 0.6 });
      burst(this, this.bx, this.by, [0xffffff, 0x8ee28f], 6, 120);
    }
    this.wx = d.x; this.wy = d.y;
    const h = d.h / 1000;
    if (Math.abs(h - this.holeT) > 0.08) this.holeT = h;
    if (d.e & 1) this.sfx('wall', { volume: 0.4, x: this.wx });
    if (d.e & 2) {
      this.sfx('bumper', { volume: 0.5, x: this.wx });
      (this.hole.bumpers ?? []).forEach((b, i) => {
        if (Math.hypot(d.x - b[0], d.y - b[1]) < b[2] + BR + 40) { this.bumperFlash[i] = 1; burst(this, d.x, d.y, [0xffd23f, 0xffffff], 8, 180); }
      });
    }
    if (d.e & 4) this.sfx('sand', { volume: 0.3 });
    if (d.e & 8) {
      this.bx = d.x; this.by = d.y;
      this.sfx('splash', { volume: 0.7 });
      burst(this, d.x, d.y, [0x6fc3ff, 0xffffff, 0x1f6fb5], 24, 220);
      popup(this, d.x, d.y - 30, t('water'), '#6fc3ff', 22);
      this.strokes++;
      this.updateOnlineText();
      this.ball.setAlpha(0);
    }
  }

  /** Watcher: where the shooter's ball came to rest. */
  private onShotDone(d: ShotDone): void {
    if (this.isOver || this.cur === this.seat || d.n !== this.shotNo) return;
    this.watching = false;
    this.strokes = d.k;
    if (d.s) {
      this.sinking = true;
      this.sinkFx(this.ball);
      [this.bx, this.by] = this.hole.cup;
    } else {
      this.bx = d.x; this.by = d.y;
      if (this.ball.alpha < 0.5) {
        this.ball.setAlpha(1).setScale(0.1);
        this.tweens.add({ targets: this.ball, scale: (BR * 2) / 8, duration: 250, ease: 'Back.easeOut' });
      }
    }
    this.resolveShot(d.s === 1);
  }

  private sinkFx(img: Phaser.GameObjects.Image): void {
    const [cx, cy] = this.hole.cup;
    this.sfx('cup', { volume: 0.8 });
    this.tweens.add({ targets: img, x: cx, y: cy, scale: 1, alpha: 0.4, duration: 220, ease: 'Quad.easeIn' });
  }

  /** Both sides: a shot is over; score it and pick the next shooter (or the next hole). */
  private resolveShot(sunk: boolean): void {
    this.shotNo++;
    this.inShot = false; this.watching = false; this.turnLive = false;
    const p = this.ps[this.cur];
    p.total += this.strokes - p.strokes;
    p.strokes = this.strokes;
    p.x = this.bx; p.y = this.by;
    if (sunk || p.strokes >= MAX_STROKES) { p.done = true; this.holeResult(this.cur, sunk); }
    this.updateOnlineText();
    if (this.ps[0].done && this.ps[1].done) { this.time.delayedCall(1800, () => this.nextHoleOnline()); return; }
    const other = (1 - this.cur) as 0 | 1;
    const next = this.ps[other].done ? this.cur : other;
    this.time.delayedCall(sunk ? 900 : 500, () => this.beginShotTurn(next));
  }

  private holeResult(seat: number, sunk: boolean): void {
    const p = this.ps[seat];
    const diff = p.strokes - this.hole.par;
    let label: string, color = '#f3f2f2';
    if (!sunk) { label = t('maxed'); color = '#ec3013'; }
    else if (p.strokes === 1) { label = t('ace'); color = '#ffd23f'; }
    else if (diff <= -3) { label = t('albatross'); color = '#ffd23f'; }
    else if (diff === -2) { label = t('eagle'); color = '#5dff7a'; }
    else if (diff === -1) { label = t('birdie'); color = '#5dff7a'; }
    else if (diff === 0) { label = t('parName'); color = '#3ee6ff'; }
    else if (diff === 1) label = t('bogey');
    else if (diff === 2) label = t('dbogey');
    else { label = `+${diff}`; color = '#ec3013'; }
    if (!sunk) this.tweens.add({ targets: p.img, alpha: 0, duration: 400 });
    const [cx, cy] = this.hole.cup;
    if (seat === this.seat) {
      if (sunk && diff < 0) { this.sfx('great', { volume: 0.6 }); flash(this, 0xffd23f, 150); shake(this, 0.008, 160); }
      else if (sunk && diff === 0) this.sfx('par', { volume: 0.5 });
      else if (!sunk || diff > 1) this.sfx('bad', { volume: 0.4 });
      burst(this, cx, cy, sunk && diff < 0 ? [0xffd23f, 0x5dff7a, 0xffffff] : [0xffffff], sunk && diff < 0 ? 40 : 14, 320);
      const lt = txt(this, 360, 640, label, { title: true, size: 44, color, wrap: 640 }).setDepth(20).setScale(0.2);
      this.tweens.add({ targets: lt, scale: 1, duration: 320, ease: 'Back.easeOut', hold: 900, yoyo: true, onComplete: () => lt.destroy() });
    } else {
      burst(this, cx, cy, [0xffb38a, 0xffffff], 14, 260);
      popup(this, 360, 600, `${this.oppName()}: ${label}`, '#ffb38a', 26);
    }
  }

  private nextHoleOnline(): void {
    if (this.isOver) return;
    if (this.holeIdx >= HOLES.length - 1) { this.finishOnline(); return; }
    this.sfx('next', { volume: 0.5 });
    this.loadHoleOnline(this.holeIdx + 1);
    this.time.delayedCall(500, () => this.beginShotTurn(net.starter));
  }

  private finishOnline(): void {
    const me = this.ps[this.seat].total, opp = this.ps[1 - this.seat].total;
    this.setScore(me);
    const tl = txt(this, 360, 740, t('total', { n: me }), { title: true, size: 22, color: '#ffd23f' }).setDepth(20);
    tl.setAlpha(0);
    this.tweens.add({ targets: tl, alpha: 1, duration: 300 });
    const win = me < opp;
    this.endGame({ win, title: me === opp ? t('draw') : win ? t('youWin') : t('youLose'), draw: me === opp, delay: 1200 });
  }
}
