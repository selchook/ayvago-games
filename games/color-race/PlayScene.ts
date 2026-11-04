import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, net, ensurePixel } from '@core';

/** Cyan, magenta, yellow, purple: the four ring colours. */
export const PALETTE = [0x3ee6ff, 0xff4fa3, 0xffd23f, 0x8b5cff];

const GRAVITY = 1750;
const HOP_V = -650;
const BALL_R = 20;
const RING_T = 28;
const CX = 360;
const START_Y = 1000;
const RACE_S = 90;
const COUNT_S = 2.2;
const CP_EVERY = 4;           // a checkpoint after every 4th gate
const GHOST_DX = 58;          // the rival is drawn beside the lane
const SEND_MS = 100;          // ~10 reports a second
const BAR_X = 34, BAR_TOP = 250, BAR_BOT = 1150;

interface Ring { g: Phaser.GameObjects.Graphics; r: number; cols: number[]; a0: number; speed: number; wobble: number; mirrorOf?: Ring }
interface Gate {
  y: number; top: number; bottom: number; rings: Ring[];
  sw?: { y: number; col: number; g: Phaser.GameObjects.Graphics };
  cp?: { y: number; g: Phaser.GameObjects.Graphics };
}
/** A racer's progress through the course (the player and the solo ghost). */
interface Runner {
  y: number; vy: number; col: number; started: boolean; dead: boolean; fin: boolean;
  passed: number; cpY: number; cpCol: number; swDone: number; cpDone: number; invuln: number;
}
type Status = 0 | 1 | 2 | 3;   // 0 waiting, 1 climbing, 2 shattered, 3 finished
interface Report { p: number; s: Status; c: number }

/** Screen flash that never fully covers the view. */
function softFlash(scene: Phaser.Scene, color: number, ms = 120): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, 0.4).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms * 2, onComplete: () => r.destroy() });
}

export class PlayScene extends ArcadeScene {
  private gates: Gate[] = [];
  private finishY = 0;
  private me!: Runner;
  private gh!: Runner;          // solo: the AI ghost
  private ball!: Phaser.GameObjects.Arc;
  private ghost!: Phaser.GameObjects.Arc;
  private ghostTag!: Phaser.GameObjects.Text;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bg!: Phaser.GameObjects.TileSprite;
  private hint!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private barG!: Phaser.GameObjects.Graphics;
  private clock = 0;            // ring clock (s)
  private raceT = 0;            // s since GO
  private going = false;
  private ended = false;
  private round = 0;
  private lives = 3;
  private skill = 0.3;
  // solo ghost brain
  private ghStage = 0;
  private ghWait = 0;
  private ghCareless = false;
  private ghRespawn = 0;
  // online
  private online = false;
  private host = true;
  private sendT = 0;
  private rival: Report = { p: 0, s: 0, c: 0 };
  private rivalShown = 0;       // smoothed progress drawn on screen
  private rivalFin = false;
  private finWait = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.online = net.active; this.host = net.isHost;
    this.gates = []; this.clock = 0; this.raceT = 0; this.going = false; this.ended = false;
    this.round = 0; this.lives = 3; this.skill = 0.3;
    this.sendT = 0; this.rival = { p: 0, s: 0, c: 0 }; this.rivalShown = 0; this.rivalFin = false; this.finWait = 0;
    this.useHud = !this.online;

    if (!this.textures.exists('cr-dots')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < 60; i++) {
        g.fillStyle(rng.pick(PALETTE), rng.int(15, 45) / 100);
        const s = rng.chance(0.25) ? 4 : 2;
        g.fillRect(rng.int(0, 254), rng.int(0, 254), s, s);
      }
      g.generateTexture('cr-dots', 256, 256);
      g.destroy();
    }
    this.bg = this.add.tileSprite(0, 0, width, height, 'cr-dots').setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.ghost = this.add.circle(CX + GHOST_DX, START_Y, BALL_R, 0xffffff, 0.45).setStrokeStyle(4, 0xffffff, 0.6).setDepth(18);
    this.ghostTag = txt(this, CX + GHOST_DX, START_Y - 44, '', { size: 22, color: '#ffffff' }).setAlpha(0.8).setDepth(18);
    this.ball = this.add.circle(CX, START_Y, BALL_R, PALETTE[0]).setStrokeStyle(4, 0xffffff, 0.9).setDepth(20);
    this.trail = this.add.particles(0, 0, ensurePixel(this), {
      follow: this.ball, lifespan: 320, frequency: 22, speed: { min: 0, max: 20 },
      scale: { start: 3.5, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: PALETTE[0],
    }).setDepth(19);

    // the course scrolls under the timer and the round line: a dark strip keeps them readable
    const strip = this.add.graphics().setScrollFactor(0).setDepth(8800);
    const stripH = this.online ? 124 : 172;
    strip.fillStyle(0x0b0a18, 0.8).fillRect(0, 0, width, stripH - 40);
    for (let k = 0; k < 8; k++) strip.fillStyle(0x0b0a18, 0.8 * (1 - (k + 1) / 9)).fillRect(0, stripH - 40 + k * 5, width, 5);
    this.touch = this.sys.game.device.input.touch;
    this.hint = txt(this, width / 2, height * 0.9, this.hopText(), { size: 34, color: '#f3f2f2' }).setScrollFactor(0).setDepth(50);
    this.timerText = txt(this, width / 2, this.online ? 40 : 92, '', { title: true, size: this.online ? 34 : 28, color: '#ffffff' }).setScrollFactor(0).setDepth(9000);
    this.info = txt(this, width / 2, this.online ? 92 : 140, '', { size: 26, color: '#d8d0ff' }).setScrollFactor(0).setDepth(9000);
    this.banner = txt(this, width / 2, height * 0.38, '', { title: true, size: 64, strokeThickness: 10 }).setScrollFactor(0).setDepth(60).setVisible(false);
    this.barG = this.add.graphics().setScrollFactor(0).setDepth(8900);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.online && p.x > width - 130 && p.y < 130) return;     // pause button
      this.hop();
    });
    for (const k of ['SPACE', 'UP', 'W', 'ENTER', 'Z']) {
      this.input.keyboard?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.hop(); });
    }

    if (this.online) {
      net.onScene(this, 'h', (d: Report) => {
        if (!d || typeof d.p !== 'number') return;
        const was = this.rival.s;
        this.rival = { p: Math.max(0, d.p), s: d.s, c: d.c | 0 };
        if (d.s === 2 && was !== 2) this.ghostShatter();
        if (d.s === 3) this.rivalFin = true;
      });
      net.onScene(this, 'fin', () => {
        this.rivalFin = true;
        if (this.host && !this.ended) this.decide(this.me.fin ? 0 : 1);
      });
      net.onScene(this, 'res', (d: { w: number }) => {
        if (!this.host && d) this.showResult(d.w === -1 ? 'draw' : d.w === net.seat ? 'win' : 'lose');
      });
    }
    this.startRound();
  }

  // ---------------------------------------------------------------- course
  private buildCourse(seed: number, gatesN: number, hard: number): void {
    // the switchers and the finish flag spin / pulse forever: stop their tweens with them
    const drop = (o: Phaser.GameObjects.GameObject) => { this.tweens.killTweensOf(o); o.destroy(); };
    for (const g of this.gates) { g.rings.forEach((r) => drop(r.g)); if (g.sw) drop(g.sw.g); if (g.cp) drop(g.cp.g); }
    this.children.list.filter((o) => o.getData?.('course')).forEach(drop);
    this.gates = [];
    const R = rng.seeded(seed);
    const ri = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
    const shuffle = <T>(arr: T[]): T[] => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    let lastY = START_Y - 60;
    let col = ri(0, 3);
    const startCol = col;
    for (let k = 0; k < gatesN; k++) {
      const lvl = 1 + Math.floor(k / 4) + hard;
      const kinds = ['ring'];
      if (lvl >= 2) kinds.push('small');
      if (lvl >= 3) kinds.push('double', 'ring');
      if (lvl >= 5) kinds.push('double', 'small');
      const kind = k === 0 ? 'ring' : kinds[ri(0, kinds.length - 1)];
      const dir = R() < 0.5 ? 1 : -1;
      const rot = Math.min(220, 62 + lvl * 13) * dir;
      const wobble = lvl >= 5 && R() < 0.4 ? 0.7 : 0;
      const ext = kind === 'small' ? 140 : kind === 'double' ? 230 : 190;
      const gap = k === 0 ? 250 : Math.max(260, 340 - lvl * 9);
      const y = lastY - gap - ext;
      const gate: Gate = { y, top: y - ext, bottom: y + ext, rings: [] };
      if (kind === 'double') {
        const outer = this.makeRing(y, 215, rot, wobble, shuffle([...PALETTE]), ri(0, 3) * 90 + 45);
        gate.rings.push(outer, this.makeRing(y, 158, 0, 0, outer.cols, 0, outer));
      } else {
        gate.rings.push(this.makeRing(y, kind === 'small' ? 125 : 175, kind === 'small' ? rot * 1.35 : rot, wobble, shuffle([...PALETTE]), ri(0, 3) * 90 + 45));
      }
      // colour switcher halfway between the previous gate and this one
      if (k > 0) {
        let n = ri(0, 3);
        if (n === col) n = (n + ri(1, 3)) % 4;
        col = n;
        const sy = lastY - gap / 2;
        const g = this.add.graphics({ x: CX, y: sy }).setDepth(10);
        PALETTE.forEach((c, i) => g.fillStyle(c, 1).slice(0, 0, 26, Phaser.Math.DegToRad(i * 90), Phaser.Math.DegToRad((i + 1) * 90)).fillPath());
        g.lineStyle(3, 0xffffff, 0.8).strokeCircle(0, 0, 26);
        this.tweens.add({ targets: g, angle: 360, duration: 1800, repeat: -1 });
        gate.sw = { y: sy, col: n, g };
      }
      this.gates.push(gate);
      lastY = gate.top;
    }
    // checkpoints just above every 4th gate (below the next switcher)
    this.gates.forEach((g, k) => {
      if ((k + 1) % CP_EVERY !== 0 || k === this.gates.length - 1) return;
      const cy = g.top - 70;
      const line = this.add.graphics({ x: 0, y: cy }).setDepth(3);
      for (let x = 0; x < 720; x += 40) line.fillStyle(0xffffff, 0.18).fillRect(x, -3, 22, 6);
      for (const s of [-1, 1]) {
        const fx = CX + s * 300;
        line.fillStyle(0xffffff, 0.8).fillRect(fx - 2, -46, 4, 46);
        line.fillStyle(0x5dff7a, 0.9).fillTriangle(fx + 2, -46, fx + 2 + s * 0, -26, fx + 2 + 30, -36);
      }
      g.cp = { y: cy, g: line };
    });
    this.finishY = lastY - 150;
    const fin = this.add.graphics({ x: 0, y: this.finishY }).setDepth(3).setData('course', true);
    for (let x = 0; x < 720; x += 30) for (let r = 0; r < 2; r++) fin.fillStyle((x / 30 + r) % 2 ? 0xffffff : 0x111111, 0.9).fillRect(x, -30 + r * 15, 30, 15);
    const flag = txt(this, CX, this.finishY - 60, t('finish'), { title: true, size: 30, color: '#ffd23f' }).setDepth(3).setData('course', true);
    this.tweens.add({ targets: flag, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });
    this.startCol = startCol;
    // spawn tween: rings fade in
    for (const g of this.gates) for (const r of g.rings) { r.g.setAlpha(0); this.tweens.add({ targets: r.g, alpha: 1, duration: 500 }); }
  }

  private startCol = 0;
  private touch = false;

  private hopText(): string {
    return this.touch ? t('tapHop') : t('keyHop');
  }

  private makeRing(y: number, r: number, speed: number, wobble: number, cols: number[], a0: number, mirrorOf?: Ring): Ring {
    const g = this.add.graphics({ x: CX, y }).setDepth(5);
    cols.forEach((c, i) => {
      const s0 = mirrorOf ? 180 - (i + 1) * 90 : i * 90;
      g.lineStyle(RING_T, c, 1).beginPath();
      g.arc(0, 0, r, Phaser.Math.DegToRad(s0 + 1.5), Phaser.Math.DegToRad(s0 + 90 - 1.5));
      g.strokePath();
    });
    g.angle = mirrorOf ? -mirrorOf.g.angle : a0;
    return { g, r, cols, a0, speed, wobble, mirrorOf };
  }

  private ringColour(r: Ring, ang: number): number {
    const src = r.mirrorOf ?? r;
    const a = r.mirrorOf ? 180 - ang : ang;
    const local = (((a - src.g.angle) % 360) + 360) % 360;
    return src.cols[Math.floor(local / 90) % 4];
  }

  /** True when a ball at height y with colour col touches a ring of another colour. */
  private wrongAt(y: number, col: number): boolean {
    for (const gate of this.gates) {
      if (y - gate.bottom > 60 || gate.top - y > 60) continue;
      for (const r of gate.rings) {
        const dy = y - gate.y;
        if (Math.abs(Math.abs(dy) - r.r) < RING_T / 2 + BALL_R - 5 && this.ringColour(r, dy > 0 ? 90 : 270) !== col) return true;
      }
    }
    return false;
  }

  private newRunner(): Runner {
    const c = PALETTE[this.startCol];
    return { y: START_Y, vy: 0, col: c, started: false, dead: false, fin: false, passed: 0, cpY: START_Y, cpCol: c, swDone: 0, cpDone: 0, invuln: 0 };
  }

  // ---------------------------------------------------------------- flow
  private startRound(): void {
    this.round++;
    const { height } = this.scale;
    const gatesN = this.online ? 16 : Math.min(24, 10 + this.round * 2);
    const seed = this.online ? net.seed : (Math.random() * 2 ** 31) >>> 0;
    this.buildCourse(seed, gatesN, this.online ? 0 : Math.min(3, Math.floor((this.round - 1) / 2)));
    this.me = this.newRunner();
    this.gh = this.newRunner();
    this.skill = Math.min(0.95, 0.3 + (this.round - 1) * 0.12);
    this.enterStage(0); this.ghWait = 0.6; this.ghRespawn = 0;
    this.raceT = 0; this.going = false; this.ended = false; this.clock = 0;
    this.ball.setPosition(CX, START_Y).setFillStyle(this.me.col).setVisible(true).setAlpha(1);
    this.trail.particleTint = this.me.col;
    this.trail.start();
    this.ghost.setPosition(CX + GHOST_DX, START_Y).setVisible(true).setFillStyle(this.gh.col, 0.45);
    this.cameras.main.setScroll(0, START_Y - height * 0.75);
    this.hint.setAlpha(1).setText(this.hopText());
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.updateInfo();
    // countdown
    [3, 2, 1].forEach((n, i) => this.time.delayedCall(i * 600 + 200, () => {
      if (this.isOver) return;
      this.showBanner(String(n), '#ffd23f');
      this.sfx('tick', { volume: 0.5 });
    }));
    this.time.delayedCall(COUNT_S * 1000, () => {
      if (this.isOver) return;
      this.going = true;
      this.showBanner(t('go'), '#5dff7a');
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 500, duration: 300 });
      this.sfx('go', { volume: 0.6 });
    });
  }

  private updateInfo(): void {
    this.ghostTag.setText(this.online ? clip(net.peerName || t('opponent'), 12) : t('ghost'));
    if (this.online) this.info.setText(t('vs', { name: net.peerName || t('opponent') }));
    else {
      this.info.setText(`${t('roundN', { n: this.round })} · ${t('rival', { name: t('d' + Math.min(5, this.round - 1)) })}`);
      this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    }
  }

  private fadeBanner(delay: number): void {
    this.tweens.add({ targets: this.banner, alpha: 0, delay, duration: 250 });
  }

  private showBanner(s: string, color: string, size = 64): void {
    this.banner.setText(s).setColor(color).setFontSize(size).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private hop(): void {
    const m = this.me;
    if (!m || m.dead || m.fin || this.isOver || this.ended || !this.going) return;
    if (!m.started) {
      m.started = true;
      this.tweens.killTweensOf(this.hint);
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 250 });
      if (m.passed > 0 || m.cpDone > 0) m.invuln = 0.6;
    }
    m.vy = HOP_V;
    this.sfx(rng.pick(['hop1', 'hop2', 'hop3']), { volume: 0.3 });
    this.tweens.add({ targets: this.ball, scaleX: 0.8, scaleY: 1.2, duration: 70, yoyo: true });
  }

  // ---------------------------------------------------------------- runners
  /** Moves a runner one frame: gravity, switchers, checkpoints, gates. Returns 'wrong' / 'fell' / 'fin' / ''. */
  private stepRunner(m: Runner, dt: number, bottom: number): string {
    if (m.dead || m.fin) return '';
    m.invuln = Math.max(0, m.invuln - dt);
    if (m.started) {
      m.vy = Math.min(m.vy + GRAVITY * dt, 1100);
      m.y += m.vy * dt;
    } else m.y = m.cpY + Math.sin(this.clock * 4) * 6;
    if (m.started && m.y > bottom) return 'fell';
    if (m.invuln <= 0 && this.wrongAt(m.y, m.col)) return 'wrong';
    for (let k = 0; k < this.gates.length; k++) {
      const g = this.gates[k];
      if (g.sw && k + 1 > m.swDone && m.y < g.sw.y) { m.swDone = k + 1; m.col = PALETTE[g.sw.col]; if (m === this.me) this.switchFx(g); }
      if (k + 1 > m.passed && m.y < g.top - BALL_R) { m.passed = k + 1; if (m === this.me) this.passFx(g, k); }
      if (g.cp && k + 1 > m.cpDone && m.y < g.cp.y) {
        m.cpDone = k + 1; m.cpY = g.cp.y; m.cpCol = m.col;
        if (m === this.me) this.checkpointFx(g);
      }
    }
    if (m.y < this.finishY) { m.fin = true; return 'fin'; }
    return '';
  }

  private respawn(m: Runner): void {
    m.dead = false; m.started = false; m.vy = 0; m.y = m.cpY; m.col = m.cpCol;
    // gates and switchers above the checkpoint count again
    m.passed = Math.min(m.passed, this.gateIndexBelow(m.cpY));
    m.swDone = Math.min(m.swDone, this.gateIndexBelow(m.cpY));
  }

  /** Number of gates entirely below height y. */
  private gateIndexBelow(y: number): number {
    let n = 0;
    for (const g of this.gates) if (g.top - BALL_R > y) n++;
    return n;
  }

  private progress(m: Runner): number {
    return Math.max(0, Math.min(START_Y - this.finishY, START_Y - m.y));
  }

  // ---------------------------------------------------------------- solo ghost
  // The ghost climbs in three stages per gate: hover below it, slip in through the bottom arc
  // when its colour will be there, hover inside, then out through the top arc. Reaction time,
  // look-ahead and careless slips depend on the round's skill.
  private ghostBrain(dt: number): void {
    const m = this.gh;
    if (m.fin) return;
    if (m.dead) {
      this.ghRespawn -= dt;
      if (this.ghRespawn <= 0) { this.respawn(m); m.started = true; this.enterStage(0); }
      return;
    }
    m.started = true;
    const next = this.gates[m.passed];
    let target: number, full = false;
    if (!next) { target = this.finishY - 120; full = true; }
    else if (this.ghStage === 0) {
      target = next.bottom + 150;
      this.ghWait -= dt;
      if (this.ghWait <= 0 && m.y > next.bottom + 20 && this.arcOk(next, 90, m.col, (m.y - next.bottom) / 330)) this.enterStage(1);
    } else if (this.ghStage === 1) {
      target = next.y;
      this.ghWait -= dt;
      const inner = Math.min(...next.rings.map((r) => r.r));
      if (m.y < next.y + 70 && this.ghWait <= 0 && this.arcOk(next, 270, m.col, (inner - 20) / 330)) this.enterStage(2);
    } else { target = next.top - 100; full = true; }
    // hop to hold the target height (small hops while hovering)
    if (m.y > target && m.vy > -60) {
      m.vy = full ? HOP_V : -Math.min(-HOP_V, Math.sqrt(2 * GRAVITY * Math.max(10, m.y - target + 50)));
    }
    const before = m.passed;
    const res = this.stepRunner(m, dt, this.cameras.main.scrollY + this.scale.height + 900);
    if (m.passed > before) this.enterStage(0);
    if (res === 'wrong' || res === 'fell') {
      m.dead = true;
      this.ghRespawn = 0.9;
      this.ghostShatter();
    }
  }

  private enterStage(n: number): void {
    this.ghStage = n;
    this.ghWait = 0.08 + (1 - this.skill) * (0.2 + Math.random() * 0.8);
    // a careless rival sometimes goes without looking
    this.ghCareless = Math.random() < 0.16 * (1 - this.skill);
  }

  /** Will every ring of g show colour col at world angle ang around `inS` seconds from now? */
  private arcOk(g: Gate, ang: number, col: number, inS: number): boolean {
    if (this.ghCareless) return true;
    for (const r of g.rings) {
      const src = r.mirrorOf ?? r;
      const save = src.g.angle;
      const times = [Math.max(0, inS - 0.15), inS, inS + 0.15];
      let ok = true;
      for (const dt of times) {
        src.g.angle = save + src.speed * dt;
        if (r.mirrorOf) r.g.angle = -src.g.angle;
        if (this.ringColour(r, ang) !== col) ok = false;
      }
      src.g.angle = save;
      if (r.mirrorOf) r.g.angle = -save;
      if (!ok) return false;
    }
    return true;
  }

  private ghostShatter(): void {
    burst(this, this.ghost.x, this.ghost.y, PALETTE, 20, 300);
    this.sfxAt('shatter', this.ghost.x, { volume: 0.3 });
  }

  // ---------------------------------------------------------------- update
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { height } = this.scale;
    const cam = this.cameras.main;
    this.clock += dt;
    for (const gate of this.gates) {
      const vis = gate.top < cam.scrollY + height + 60 && gate.bottom > cam.scrollY - 60;
      for (const r of gate.rings) {
        r.g.setVisible(vis);
        if (r.mirrorOf) { r.g.angle = -r.mirrorOf.g.angle; continue; }
        const k = r.wobble ? 1 + r.wobble * Math.sin(this.clock * 2.4) : 1;
        r.g.angle += r.speed * k * dt;
      }
      gate.sw?.g.setVisible(gate.sw.y > cam.scrollY - 60 && gate.sw.y < cam.scrollY + height + 60);
    }
    if (this.going && !this.ended) {
      this.raceT += dt;
      const left = Math.max(0, RACE_S - this.raceT);
      this.timerText.setText(fmt(left)).setColor(left < 10 ? '#ec3013' : '#ffffff');
      if (!this.online) this.hud.setCenter('');
      if (left <= 0) this.timeUp();
    } else if (!this.going) this.timerText.setText(fmt(RACE_S));

    // me
    const m = this.me;
    if (this.going && !this.ended) {
      const res = this.stepRunner(m, dt, cam.scrollY + height + BALL_R);
      if (res === 'wrong' || res === 'fell') this.shatter(res === 'wrong' ? t('wrong') : t('fell'));
      else if (res === 'fin') this.finished();
    }
    this.ball.y = m.y;
    this.ball.setAlpha(m.invuln > 0 ? (Math.floor(m.invuln * 12) % 2 ? 0.35 : 1) : 1);
    if (!m.dead) this.ball.setFillStyle(m.col);
    // camera only climbs (respawn tweens it back down)
    const target = m.y - height * 0.56;
    if (target < cam.scrollY && !m.dead) cam.scrollY += (target - cam.scrollY) * Math.min(1, dt * 10);
    this.bg.tilePositionY = cam.scrollY * 0.35;

    // the rival
    if (this.online) {
      const want = this.rival.p;
      this.rivalShown += (want - this.rivalShown) * Math.min(1, dt * 8);
      if (Math.abs(want - this.rivalShown) > 400) this.rivalShown = want;
      this.ghost.y = START_Y - this.rivalShown;
      this.ghost.setVisible(this.rival.s !== 2);
      this.ghost.setFillStyle(PALETTE[this.rival.c] ?? 0xffffff, 0.45);
      this.netSend();
      if (!this.host && this.ended && this.finWait > 0) {
        this.finWait -= dt;
        // the host's verdict never came: fall back to our own view
        if (this.finWait <= 0) this.showResult(this.me.fin && !this.rivalFin ? 'win' : this.progress(this.me) >= this.rival.p ? 'win' : 'lose');
      }
    } else if (this.going && !this.ended) {
      this.ghostBrain(dt);
      this.ghost.y = this.gh.y;
      this.ghost.setVisible(!this.gh.dead);
      this.ghost.setFillStyle(this.gh.col, 0.45);
      if (this.gh.fin) this.decideSolo(false);
    }
    this.ghostTag.setPosition(this.ghost.x, this.ghost.y - 44).setVisible(this.ghost.visible);
    this.drawBar();
  }

  private drawBar(): void {
    const g = this.barG, L = START_Y - this.finishY;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(BAR_X - 10, BAR_TOP - 10, 20, BAR_BOT - BAR_TOP + 20, 10);
    const yOf = (p: number) => BAR_BOT - (Phaser.Math.Clamp(p, 0, L) / L) * (BAR_BOT - BAR_TOP);
    for (const gate of this.gates) if (gate.cp) g.fillStyle(0x5dff7a, 0.9).fillRect(BAR_X - 10, yOf(START_Y - gate.cp.y) - 2, 20, 4);
    g.fillStyle(0xffffff, 1).fillRect(BAR_X - 12, BAR_TOP - 4, 24, 6);
    const rp = this.online ? this.rivalShown : this.progress(this.gh);
    const rc = this.online ? PALETTE[this.rival.c] ?? 0xffffff : this.gh.col;
    g.fillStyle(rc, 0.5).fillCircle(BAR_X, yOf(rp), 12);
    g.lineStyle(3, 0xffffff, 0.6).strokeCircle(BAR_X, yOf(rp), 12);
    g.fillStyle(this.me.col, 1).fillCircle(BAR_X, yOf(this.progress(this.me)), 14);
    g.lineStyle(4, 0xffffff, 1).strokeCircle(BAR_X, yOf(this.progress(this.me)), 14);
  }

  private switchFx(g: Gate): void {
    const sw = g.sw!;
    const c = this.me.col;
    this.trail.particleTint = c;
    this.sfx('switch', { volume: 0.5 });
    burst(this, CX, sw.y, PALETTE, 24, 280);
    this.tweens.add({ targets: this.ball, scale: 1.5, duration: 90, yoyo: true });
    this.tweens.killTweensOf(sw.g);
    this.tweens.add({ targets: sw.g, scale: 2, alpha: 0, duration: 250 });
  }

  private passFx(g: Gate, k: number): void {
    this.sfx('pass', { volume: 0.25, exact: true, rate: 1 + (k % CP_EVERY) * 0.05 });
    for (const r of g.rings) this.tweens.add({ targets: r.g, alpha: 0.35, duration: 400 });
    if (!this.online) this.addScore(10, CX + 80, g.top);
  }

  private checkpointFx(g: Gate): void {
    this.sfx('checkpoint', { volume: 0.6, exact: true });
    softFlash(this, 0x5dff7a, 90);
    popup(this, CX, g.cp!.y - 60, t('checkpoint'), '#5dff7a', 30);
    burst(this, CX - 300, g.cp!.y - 30, [0x5dff7a, 0xffffff], 14, 220);
    burst(this, CX + 300, g.cp!.y - 30, [0x5dff7a, 0xffffff], 14, 220);
    if (!this.online) this.addScore(25);
  }

  private shatter(reason: string): void {
    const m = this.me;
    m.dead = true;
    const x = this.ball.x, y = this.ball.y;
    this.ball.setVisible(false);
    this.trail.stop();
    burst(this, x, y, PALETTE, 50, 520);
    burst(this, x, y, m.col, 30, 300);
    this.sfxAt('shatter', x, { volume: 0.6 });
    this.sfx('die', { volume: 0.5 });
    shake(this, 0.025, 320);
    softFlash(this, 0xec3013, 160);
    popup(this, x, y - 40, reason, '#ec3013', 26);
    this.time.delayedCall(900, () => {
      if (this.isOver || this.ended) return;
      this.respawn(m);
      const { height } = this.scale;
      this.ball.setPosition(CX, m.y).setVisible(true).setScale(0.2).setFillStyle(m.col);
      this.tweens.add({ targets: this.ball, scale: 1, duration: 300, ease: 'Back.easeOut' });
      this.trail.particleTint = m.col;
      this.trail.start();
      const cam = this.cameras.main;
      this.tweens.add({ targets: cam, scrollY: m.y - height * 0.75, duration: 300, ease: 'Sine.easeOut' });
      this.hint.setAlpha(1).setText(this.touch ? t('backTo') : t('backToKey'));
      this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
      this.sfx('respawn', { volume: 0.35 });
    });
  }

  private finished(): void {
    this.trail.stop();
    burst(this, CX, this.finishY, [...PALETTE, 0xffffff], 60, 520);
    this.sfx('level', { volume: 0.65, exact: true });
    shake(this, 0.01, 200);
    if (!this.online) { this.decideSolo(true); return; }
    net.send('fin', { t: Math.round(this.raceT * 1000) });
    if (this.host) { if (!this.ended) this.decide(this.rivalFin ? 1 : 0); }
    else this.waitVerdict();
  }

  private timeUp(): void {
    this.sfx('buzzer', { volume: 0.6 });
    if (!this.online) {
      this.decideSolo(this.progress(this.me) >= this.progress(this.gh));
      return;
    }
    if (this.host) {
      const mine = this.progress(this.me), theirs = this.rival.p;
      this.decide(Math.abs(mine - theirs) < 4 ? -1 : mine > theirs ? 0 : 1);
    } else this.waitVerdict();
  }

  private waitVerdict(): void {
    this.ended = true;
    this.finWait = 5;
    this.showBanner(this.me.fin ? t('finish') : t('timeUp'), '#ffd23f', 48);
  }

  /** Host: the race is decided (w = winning seat, -1 = draw); tell the guest. */
  private decide(w: number): void {
    if (this.ended) return;
    this.ended = true;
    net.send('res', { w });
    this.showResult(w === -1 ? 'draw' : w === net.seat ? 'win' : 'lose');
  }

  private showResult(r: 'win' | 'lose' | 'draw'): void {
    if (this.isOver) return;
    this.ended = true; this.finWait = 0;
    const win = r === 'win';
    this.setScore(Math.round(this.progress(this.me) / 10) + (win ? 300 : 0) + (win ? Math.round(Math.max(0, RACE_S - this.raceT)) * 5 : 0));
    this.showBanner(win ? t('youWin') : r === 'draw' ? t('draw') : t('youLose'), win ? '#5dff7a' : r === 'draw' ? '#3ee6ff' : '#ec3013', 52);
    this.time.delayedCall(300, () => this.sfx(win ? 'win' : 'lose', { volume: 0.6 }));
    this.fadeBanner(1250);
    this.endGame({ win, title: win ? t('youWin') : r === 'draw' ? t('draw') : t('youLose'), draw: r === 'draw', delay: 1800 });
  }

  /** Solo: a race ended (player first / higher, or the ghost first). */
  private decideSolo(win: boolean): void {
    if (this.ended) return;
    this.ended = true;
    if (win) {
      const bonus = 150 * this.round + Math.round(Math.max(0, RACE_S - this.raceT)) * 5;
      this.addScore(bonus, CX, this.ball.y - 80);
      this.showBanner(t('raceWin'), '#5dff7a', 52);
      this.time.delayedCall(300, () => this.sfx('win', { volume: 0.6 }));
    } else {
      this.lives--;
      this.showBanner(t('raceLose'), '#ec3013', 44);
      this.time.delayedCall(300, () => this.sfx('lose', { volume: 0.6 }));
      shake(this, 0.015, 300);
    }
    this.updateInfo();
    if (this.lives <= 0) { this.fadeBanner(1250); this.endGame({ title: t('raceLose'), delay: 1800 }); return; }
    this.time.delayedCall(2200, () => {
      if (this.isOver) return;
      this.banner.setVisible(false);
      this.startRound();
    });
  }

  private netSend(): void {
    const now = this.time.now;
    if (now - this.sendT < SEND_MS) return;
    this.sendT = now;
    const m = this.me;
    const s: Status = m.fin ? 3 : m.dead ? 2 : m.started ? 1 : 0;
    net.send('h', { p: Math.round(this.progress(m)), s, c: PALETTE.indexOf(m.col) } satisfies Report);
  }
}

function fmt(s: number): string {
  const n = Math.ceil(s);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}


