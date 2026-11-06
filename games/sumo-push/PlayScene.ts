import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, popup, txt, t, net, upper } from '@core';

// Dohyo (720 x 1280 world)
const CX = 360, CY = 700;
const R0 = 300, RMIN = 150;
const SHRINK_AT = 5, SHRINK_RATE = 6;      // the ring starts shrinking after 5 s, 6 px/s
const WR = 44;                              // wrestler radius
const ACC = 2100, MAXV = 330, DAMP = 4.2;
const DASH_V = 980, DASH_T = 0.22, DASH_CD = 1.5;
const WINS = 3;                             // best of 5
const COUNT_MS = 1700, OVER_MS = 2100;
const SEND_MS = 50;                         // ~20 messages a second each way
const INTERP_MS = 100;                      // guest renders the rival this far in the past
const RED = 0xec3013, BLUE = 0x3e9bff;

type Phase = 'count' | 'live' | 'over' | 'done';
interface W {
  x: number; y: number; vx: number; vy: number; face: number;
  dashT: number; cd: number; out: boolean; spin: number;
  img: Phaser.GameObjects.Image; base: Phaser.GameObjects.Ellipse;
}
interface In { x: number; y: number; dash: boolean }
/** Host → guest snapshot (host coordinates). */
interface Snap {
  a: number[]; b: number[];      // x, y, vx, vy, face*100, dashing, cd*100, out
  r: number; k: [number, number]; ph: number; pt: number; n: number; adv: number; w: number;
}
const PHASES: Phase[] = ['count', 'live', 'over', 'done'];

export function makeSumoTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('sm-red')) return;
  const make = (key: string, belt: number, beltDark: number) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const c = 64;
    // drawn facing +x (right)
    g.fillStyle(0x000000, 0.25).fillEllipse(c + 4, c + 6, 84, 104);
    // sagari (belt tassels) at the back
    g.fillStyle(beltDark, 1);
    for (const dy of [-22, -8, 6, 20]) g.fillRect(c - 50, c + dy - 3, 14, 6);
    // body
    g.fillStyle(0xc98a5e, 1).fillEllipse(c, c, 82, 102);
    g.fillStyle(0xf0bf94, 1).fillEllipse(c + 2, c - 2, 72, 92);
    g.fillStyle(0xffd9b8, 0.7).fillEllipse(c + 8, c - 12, 34, 40);
    // mawashi band round the waist
    g.lineStyle(9, belt, 1).strokeEllipse(c, c, 80, 100);
    g.lineStyle(3, beltDark, 1).strokeEllipse(c, c, 88, 108);
    // arms reaching forward
    for (const s of [-1, 1]) {
      g.fillStyle(0xc98a5e, 1).fillEllipse(c + 26, c + s * 34, 40, 24);
      g.fillStyle(0xf0bf94, 1).fillEllipse(c + 28, c + s * 33, 34, 18);
      g.fillStyle(0xc98a5e, 1).fillCircle(c + 46, c + s * 30, 11);
      g.fillStyle(0xf4c8a0, 1).fillCircle(c + 46, c + s * 30, 8);
    }
    // head with hair and topknot
    g.fillStyle(0xc98a5e, 1).fillCircle(c + 7, c, 22);
    g.fillStyle(0xf0bf94, 1).fillCircle(c + 8, c, 19);
    g.fillStyle(0x1a1210, 1).fillCircle(c - 1, c, 21);
    g.fillStyle(0x3a2a24, 1).fillCircle(c - 5, c - 6, 7);
    // chonmage topknot folded forward over the crown
    g.fillStyle(0x0a0606, 1).fillEllipse(c + 4, c, 22, 10);
    g.fillStyle(0xffffff, 0.8).fillRect(c - 6, c - 5, 3, 10);
    g.fillStyle(0x5a4a44, 1).fillEllipse(c + 8, c - 2, 9, 3);
    g.generateTexture(key, 128, 128);
    g.destroy();
  };
  make('sm-red', RED, 0x7a1006);
  make('sm-blue', BLUE, 0x0b3c78);
  // the platform (static): clay square with straw bales round the edge
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const S = 720;
  g.fillStyle(0x000000, 0.5).fillRect(12, 18, S - 16, S - 16);
  g.fillStyle(0x9a6a3c, 1).fillRect(4, 4, S - 8, S - 8);
  g.fillStyle(0xb07a46, 1).fillRect(18, 18, S - 36, S - 36);
  for (let k = 0; k < 40; k++) {
    g.fillStyle(k % 2 ? 0xa87242 : 0xb8824c, 0.5).fillRect(18, 18 + k * ((S - 36) / 40), S - 36, 8);
  }
  g.lineStyle(10, 0x6a4422, 1).strokeRect(8, 8, S - 16, S - 16);
  g.generateTexture('sm-plat', S, S);
  // dust puff
  g.clear();
  g.fillStyle(0xe0c090, 1).fillCircle(8, 8, 8);
  g.generateTexture('sm-dust', 16, 16);
  // the crowd round the hall
  g.clear();
  for (let k = 0; k < 170; k++) {
    const a = Math.random() * Math.PI * 2, r = 400 + Math.random() * 260;
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * 1.1;
    if (y < 230 || y > 1270) continue;
    g.fillStyle([0x3a2a40, 0x4a3450, 0x2e2238][k % 3], 1).fillCircle(x, y, 10 + Math.random() * 6);
    g.fillStyle(0x6a5070, 0.6).fillCircle(x - 2, y - 3, 4);
  }
  g.generateTexture('sm-hall', 720, 1280);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ringG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private me!: W;          // the local player (seat 0 in solo; on the host also seat 0)
  private op!: W;          // the rival (AI or remote)
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private banner!: Phaser.GameObjects.Text;
  private boutText!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private nameMe!: Phaser.GameObjects.Text;
  private nameOp!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private dashLabel?: Phaser.GameObjects.Text;
  private phase: Phase = 'count';
  private phaseT = 0;          // ms in the current phase
  private boutT = 0;           // s since GO
  private ring = R0;
  private kMe = 0;
  private kOp = 0;
  private bout = 1;
  private adv = 0;             // 0 = me, 1 = rival has the dash ready at GO
  private level = 0;
  private skill = 0.25;
  private aiThink = 0;
  private aiIn: In = { x: 0, y: 0, dash: false };
  private bumpT = 0;
  private lastCount = -1;
  private shrinkWarned = false;
  // online
  private online = false;
  private host = true;
  private sendT = 0;
  private pingT = 0;
  private lat = 0.05;
  private remoteIn: In = { x: 0, y: 0, dash: false };
  private remoteSeq = 0;
  private dashSeq = 0;
  private snaps: Array<{ at: number; x: number; y: number; vx: number; vy: number; face: number }> = [];
  private corrX = 0;
  private corrY = 0;
  private lastPh = -1;
  private lastN = 0;

  createGame(): void {
    makeSumoTextures(this);
    this.online = net.active; this.host = net.isHost;
    this.phase = 'count'; this.phaseT = 0; this.boutT = 0; this.ring = R0;
    this.kMe = 0; this.kOp = 0; this.bout = 1; this.level = 0; this.skill = 0.25; this.aiThink = 0;
    this.aiIn = { x: 0, y: 0, dash: false }; this.bumpT = 0; this.lastCount = -1; this.shrinkWarned = false;
    this.sendT = 0; this.pingT = 0; this.lat = 0.05; this.remoteIn = { x: 0, y: 0, dash: false }; this.remoteSeq = 0; this.dashSeq = 0;
    this.snaps = []; this.corrX = this.corrY = 0; this.lastPh = -1; this.lastN = 0;
    // the first bout's dash advantage goes to the round's starter
    this.adv = this.online ? (net.myTurnFirst ? 0 : 1) : 0;
    this.useHud = !this.online;
    this.cameras.main.setBackgroundColor('#1b1420');
    const { width } = this.scale;

    this.add.image(0, 0, 'sm-hall').setOrigin(0).setDepth(-2);
    this.add.image(CX, CY, 'sm-plat').setDisplaySize(R0 * 2 + 90, R0 * 2 + 90).setDepth(-1);
    this.ringG = this.add.graphics().setDepth(0);
    this.fxG = this.add.graphics().setDepth(6);
    this.dust = this.add.particles(0, 0, 'sm-dust', {
      lifespan: 420, speed: { min: 20, max: 90 }, scale: { start: 0.9, end: 0 }, alpha: { start: 0.55, end: 0 }, emitting: false,
    }).setDepth(1);

    this.me = this.makeW(CX, CY + 95, -Math.PI / 2, 'sm-red', RED);
    this.op = this.makeW(CX, CY - 95, Math.PI / 2, 'sm-blue', BLUE);

    // scoreboard
    this.nameMe = txt(this, 40, 140, t('you'), { title: true, size: 20, color: '#ff8a7a' }).setOrigin(0, 0.5);
    const opName = this.online ? upper((net.peerName || t('opponent')).slice(0, 10)) : t('cpu');
    this.nameOp = txt(this, width - 40, 140, opName, { title: true, size: 20, color: '#8ac4ff' }).setOrigin(1, 0.5);
    this.pips = this.add.graphics().setDepth(30);
    this.boutText = txt(this, width / 2, 140, '', { title: true, size: 20, color: '#ffd23f' });
    this.info = txt(this, width / 2, 196, '', { size: 28, color: '#d8c0e8' });
    this.banner = txt(this, CX, CY, '', { title: true, size: 56, strokeThickness: 10 }).setDepth(40).setVisible(false);

    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
    if (this.controls.touchUi) {
      this.dashLabel = txt(this, width - 110, this.scale.height - 130 + 92, t('dash'), { title: true, size: 16, color: '#ffffff' }).setDepth(9501);
    } else {
      txt(this, width / 2, 1236, t('keysHint'), { size: 24, color: '#b8a0c8' });
    }
    if (this.online) this.setupOnline();
    this.updateBoard();
    this.startBout();
  }

  private makeW(x: number, y: number, face: number, key: string, col: number): W {
    const base = this.add.ellipse(x, y + 6, WR * 2 + 16, WR * 2 + 10, col, 0.35).setStrokeStyle(4, col, 0.9).setDepth(2);
    const img = this.add.image(x, y, key).setDisplaySize(WR * 2.6, WR * 2.6).setRotation(face).setDepth(4);
    return { x, y, vx: 0, vy: 0, face, dashT: 0, cd: 0, out: false, spin: 0, img, base };
  }

  // ---------------------------------------------------------------- bout flow
  private resetW(w: W, x: number, y: number, face: number): void {
    w.x = x; w.y = y; w.vx = w.vy = 0; w.face = face; w.dashT = 0; w.cd = 0; w.out = false; w.spin = 0;
    w.img.setAlpha(1).setScale(1).setDisplaySize(WR * 2.6, WR * 2.6);
    w.base.setAlpha(1).setScale(1);
  }

  /** Host / solo: puts the wrestlers on their marks and runs the countdown. */
  private startBout(): void {
    this.phase = 'count'; this.phaseT = 0; this.boutT = 0; this.ring = R0; this.lastCount = -1; this.shrinkWarned = false;
    this.resetW(this.me, CX, CY + 95, -Math.PI / 2);
    this.resetW(this.op, CX, CY - 95, Math.PI / 2);
    this.snaps = []; this.corrX = this.corrY = 0;
    this.updateBoard();
    this.drawRing();
    this.syncImages();
  }

  private updateBoard(): void {
    const g = this.pips;
    g.clear();
    const { width } = this.scale;
    for (let k = 0; k < WINS; k++) {
      const x1 = 52 + k * 34, x2 = width - 52 - k * 34;
      g.fillStyle(k < this.kMe ? RED : 0x000000, k < this.kMe ? 1 : 0.4).fillCircle(x1, 178, 12);
      g.lineStyle(3, RED, 1).strokeCircle(x1, 178, 12);
      g.fillStyle(k < this.kOp ? BLUE : 0x000000, k < this.kOp ? 1 : 0.4).fillCircle(x2, 178, 12);
      g.lineStyle(3, BLUE, 1).strokeCircle(x2, 178, 12);
    }
    this.boutText.setText(t('bout', { n: Math.min(this.bout, WINS * 2 - 1) }));
    if (this.online) this.info.setText(t('vs', { name: net.peerName || t('opponent') }));
    else {
      this.info.setText(t('rival', { name: t('d' + Math.min(this.level, 5)) }));
      this.hud.setLevel(this.level + 1);
    }
  }

  private showBanner(s: string, color: string, size = 56): void {
    this.banner.setText(s).setColor(color).setFontSize(size).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
  }

  private hideBanner(delay = 0): void {
    this.tweens.add({ targets: this.banner, alpha: 0, delay, duration: 250, onComplete: () => this.banner.setVisible(false) });
  }

  /** Countdown display shared by host, guest and solo (phaseT in ms). */
  private countdownFx(): void {
    const n = Math.ceil((COUNT_MS - this.phaseT) / 550);
    if (n === this.lastCount) return;
    this.lastCount = n;
    if (n >= 1 && n <= 3) {
      this.showBanner(String(n), '#ffd23f', 72);
      this.sfx('tick', { volume: 0.5 });
    }
  }

  private goFx(): void {
    this.showBanner(t('go'), '#5dff7a', 60);
    this.hideBanner(500);
    this.sfx('go', { volume: 0.6 });
    shake(this, 0.004, 120);
  }

  /** Host / solo: a wrestler left the ring. */
  private boutOver(meLost: boolean): void {
    this.phase = 'over'; this.phaseT = 0;
    if (meLost) this.kOp++; else this.kMe++;
    this.adv = meLost ? 0 : 1;           // the loser gets the next dash advantage
    this.boutFx(!meLost);
    if (!this.online) {
      if (!meLost) this.addScore(100 * (this.level + 1) + Math.max(0, Math.round(20 - this.boutT)) * 5, CX, CY - 160);
    } else this.setScore(this.kMe * 100);
  }

  private boutFx(won: boolean): void {
    const loser = won ? this.op : this.me;
    this.tweens.add({ targets: [loser.img], scale: loser.img.scale * 0.75, alpha: 0.6, duration: 500, ease: 'Quad.easeIn' });
    this.tweens.add({ targets: loser.base, alpha: 0, duration: 400 });
    burst(this, loser.x, loser.y, [0xe0c090, 0xb08050, 0xffffff], 30, 320);
    shake(this, 0.02, 380);
    this.sfx('thud', { volume: 0.8 });
    this.sfx('fall', { volume: 0.4 });
    this.updateBoard();
    this.showBanner(won ? t('boutWin') : t('boutLose'), won ? '#5dff7a' : '#ec3013', 48);
    this.time.delayedCall(450, () => this.sfx(won ? 'cheer' : 'boo', { volume: 0.6 }));
  }

  private matchOver(): void {
    this.phase = 'done';
    const win = this.kMe >= WINS;
    if (this.online) {
      // the round stops updating at once: the host sends the final state now
      if (this.host) this.sendSnap();
      this.setScore(this.kMe * 100 + (win ? 300 : 0));
      this.time.delayedCall(400, () => this.sfx(win ? 'win' : 'lose', { volume: 0.7 }));
      this.hideBanner(1100);
      this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 1600 });
      return;
    }
    if (!win) {
      this.time.delayedCall(400, () => this.sfx('lose', { volume: 0.7 }));
      this.hideBanner(1100);
      this.endGame({ title: t('matchLost'), delay: 1600 });
      return;
    }
    // solo: next, smarter rival
    this.addScore(300 * (this.level + 1), CX, CY - 220);
    this.sfx('win', { volume: 0.7 });
    this.level++;
    this.skill = Math.min(1, 0.25 + this.level * 0.15);
    this.time.delayedCall(900, () => {
      if (this.isOver) return;
      this.showBanner(t('nextRival'), '#ffd23f', 34);
      popup(this, CX, CY + 80, t('d' + Math.min(this.level, 5)), '#ffffff', 34);
    });
    this.time.delayedCall(2600, () => {
      if (this.isOver) return;
      this.kMe = 0; this.kOp = 0; this.bout = 1; this.adv = 0;
      this.hideBanner();
      this.startBout();
    });
  }

  // ---------------------------------------------------------------- physics
  private drive(w: W, inp: In, h: number): void {
    if (w.out) return;
    const len = Math.hypot(inp.x, inp.y);
    if (inp.dash && w.cd <= 0) {
      const dx = len > 0.2 ? inp.x / len : Math.cos(w.face), dy = len > 0.2 ? inp.y / len : Math.sin(w.face);
      w.vx = dx * DASH_V; w.vy = dy * DASH_V; w.dashT = DASH_T; w.cd = DASH_CD; w.face = Math.atan2(dy, dx);
      this.sfxAt('dash', w.x, { volume: 0.5 });
      burst(this, w.x - dx * WR, w.y - dy * WR, [0xe0c090, 0xffffff], 10, 160);
    }
    if (w.dashT <= 0 && len > 0.05) {
      const k = Math.min(1, len);
      w.vx += (inp.x / len) * k * ACC * h; w.vy += (inp.y / len) * k * ACC * h;
      const sp = Math.hypot(w.vx, w.vy), max = MAXV * (0.75 + 0.25 * k);
      if (sp > max) { const f = Math.max(max / sp, Math.exp(-8 * h)); w.vx *= f; w.vy *= f; }
    }
    const damp = Math.exp(-(w.dashT > 0 ? 1 : DAMP) * h);
    w.vx *= damp; w.vy *= damp;
    w.x += w.vx * h; w.y += w.vy * h;
    if (len > 0.2) w.face = turn(w.face, Math.atan2(inp.y, inp.x), 9 * h);
    w.dashT = Math.max(0, w.dashT - h);
    w.cd = Math.max(0, w.cd - h);
  }

  /** Circle contact between the two wrestlers; a dashing wrestler is heavier and shoves harder. */
  private collide(a: W, b: W, real: boolean): void {
    if (a.out || b.out) return;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = WR * 2;
    if (d >= min) return;
    const nx = dx / d, ny = dy / d;
    const ma = a.dashT > 0 ? 2.6 : 1, mb = b.dashT > 0 ? 2.6 : 1;
    const over = min - d;
    a.x -= nx * over * (mb / (ma + mb)); a.y -= ny * over * (mb / (ma + mb));
    b.x += nx * over * (ma / (ma + mb)); b.y += ny * over * (ma / (ma + mb));
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn <= 0) return;
    const j = (1.35 * vn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
    b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
    if (a.dashT > 0) { b.vx += nx * 240; b.vy += ny * 240; a.dashT = 0; }
    if (b.dashT > 0) { a.vx -= nx * 240; a.vy -= ny * 240; b.dashT = 0; }
    if (real || vn > 150) this.bumpFx(a.x + nx * WR, a.y + ny * WR, vn);
  }

  private bumpFx(x: number, y: number, vn: number): void {
    if (this.time.now - this.bumpT < 120 || vn < 60) return;
    this.bumpT = this.time.now;
    const hard = vn > 500;
    this.sfxAt(hard ? 'bumpHard' : 'bump', x, { volume: Math.min(0.9, 0.3 + vn / 1200) });
    burst(this, x, y, [0xffd23f, 0xffffff, 0xe0c090], hard ? 18 : 8, hard ? 300 : 180);
    if (hard) shake(this, 0.012, 160);
    else shake(this, 0.004, 80);
  }

  private isOut(w: W): boolean {
    return Math.hypot(w.x - CX, w.y - CY) > this.ring + WR * 0.2;
  }

  /** One simulation frame for solo and the host. */
  private simulate(dt: number, inMe: In, inOp: In): void {
    const SUB = 4, h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      this.drive(this.me, s === 0 ? inMe : { ...inMe, dash: false }, h);
      this.drive(this.op, s === 0 ? inOp : { ...inOp, dash: false }, h);
      this.collide(this.me, this.op, true);
    }
  }

  // ---------------------------------------------------------------- AI
  private think(): In {
    const s = this.skill, ai = this.op, pl = this.me;
    const dcx = ai.x - CX, dcy = ai.y - CY, dc = Math.hypot(dcx, dcy);
    const px = pl.x - CX, py = pl.y - CY, pc = Math.hypot(px, py) || 1;
    // push the player outwards: stand on the centre side of them
    const ox = px / pc, oy = py / pc;
    let tx = pl.x - ox * (WR * 2 + 6), ty = pl.y - oy * (WR * 2 + 6);
    const behind = (ai.x - pl.x) * ox + (ai.y - pl.y) * oy < -WR;   // on the centre side
    if (behind || s < 0.35) { tx = pl.x; ty = pl.y; }
    // stay away from the rope (smarter rivals care more)
    const danger = this.ring - dc;
    if (s >= 0.35 && danger < 60 + s * 40) { tx = Phaser.Math.Linear(tx, CX, 0.7); ty = Phaser.Math.Linear(ty, CY, 0.7); }
    let ix = tx - ai.x, iy = ty - ai.y;
    const l = Math.hypot(ix, iy) || 1;
    ix /= l; iy /= l;
    const sp = 0.7 + 0.3 * s;
    ix *= sp; iy *= sp;
    // wobble for weaker rivals
    const wob = (1 - s) * 0.5;
    ix += (Math.random() - 0.5) * wob; iy += (Math.random() - 0.5) * wob;
    // dash when lined up with the push direction and close
    const dpx = pl.x - ai.x, dpy = pl.y - ai.y, dp = Math.hypot(dpx, dpy) || 1;
    const aligned = (dpx * ox + dpy * oy) / dp;
    let dash = false;
    if (ai.cd <= 0 && dp < 150 + s * 90) {
      if (s < 0.35) dash = Math.random() < 0.25;
      else dash = aligned > 0.75 - s * 0.25 && Math.random() < 0.35 + s * 0.6;
      // a dash that would carry us out is a bad idea
      if (dash && s >= 0.5 && danger < 90 && (dpx * dcx + dpy * dcy) > 0) dash = false;
      if (dash) { ix = dpx / dp; iy = dpy / dp; }
    }
    // escape dash when cornered at the rope
    if (!dash && ai.cd <= 0 && s >= 0.6 && danger < 45 && dp < 140 && Math.random() < s * 0.5) {
      dash = true;
      const side = (dpx * -dcy + dpy * dcx) > 0 ? -1 : 1;
      ix = (-dcy * side) / dc - dcx / dc * 0.6; iy = (dcx * side) / dc - dcy / dc * 0.6;
    }
    return { x: ix, y: iy, dash };
  }

  // ---------------------------------------------------------------- loop
  private localInput(): In {
    const c = this.controls;
    return { x: c.axisX, y: c.axisY, dash: c.justA() };
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online && !this.host) { this.updateGuest(dt); return; }
    this.phaseT += delta;
    const inMe = this.localInput();
    let inOp: In = { x: 0, y: 0, dash: false };
    if (this.phase === 'count') {
      this.countdownFx();
      this.remoteIn.dash = false;
      if (this.phaseT >= COUNT_MS) {
        this.phase = 'live'; this.phaseT = 0;
        // dash advantage: the other side's dash charges for a second
        if (this.adv === 0) this.op.cd = 1; else this.me.cd = 1;
        this.goFx();
      }
    } else if (this.phase === 'live') {
      this.boutT += dt;
      if (this.boutT > SHRINK_AT) {
        this.ring = Math.max(RMIN, R0 - (this.boutT - SHRINK_AT) * SHRINK_RATE);
        if (!this.shrinkWarned) { this.shrinkWarned = true; this.sfx('shrink', { volume: 0.5 }); popup(this, CX, CY - R0 - 30, t('shrink'), '#ffd23f', 28); }
      }
      if (this.online) {
        inOp = { ...this.remoteIn };
        this.remoteIn.dash = false;
      } else {
        this.aiThink -= dt;
        if (this.aiThink <= 0) { this.aiThink = 0.22 - this.skill * 0.15; this.aiIn = this.think(); }
        inOp = this.aiIn;
        this.aiIn = { ...this.aiIn, dash: false };
      }
      this.simulate(dt, inMe, inOp);
      const outMe = this.isOut(this.me), outOp = this.isOut(this.op);
      if (outMe || outOp) {
        // both out: the one further out loses
        let meLost = outMe;
        if (outMe && outOp) meLost = Math.hypot(this.me.x - CX, this.me.y - CY) > Math.hypot(this.op.x - CX, this.op.y - CY);
        (meLost ? this.me : this.op).out = true;
        this.boutOver(meLost);
      }
    } else if (this.phase === 'over') {
      // a guest dash that arrives after the bout is over must not fire at the next GO
      this.remoteIn.dash = false;
      // the loser keeps sliding out
      for (const w of [this.me, this.op]) { w.x += w.vx * dt; w.y += w.vy * dt; w.vx *= Math.exp(-3 * dt); w.vy *= Math.exp(-3 * dt); }
      if (this.phaseT >= OVER_MS) {
        if (this.kMe >= WINS || this.kOp >= WINS) this.matchOver();
        else { this.bout++; this.hideBanner(); this.startBout(); }
      }
    }
    this.syncImages();
    this.drawRing();
    this.drawFx(dt);
    if (this.online) this.hostNet();
  }

  private syncImages(): void {
    for (const w of [this.me, this.op]) {
      if (w.out) w.spin += 0.06;
      w.img.setPosition(w.x, w.y).setRotation(w.face + w.spin);
      w.base.setPosition(w.x, w.y + 6);
      const sp = Math.hypot(w.vx, w.vy);
      if (sp > 240 && Math.random() < 0.5) this.dust.emitParticleAt(w.x - (w.vx / sp) * WR, w.y - (w.vy / sp) * WR, 1);
    }
  }

  private drawRing(): void {
    const g = this.ringG, r = this.ring;
    g.clear();
    // the old ring area outside the rope turns dark
    if (r < R0) g.fillStyle(0x5a3a22, 0.75).fillCircle(CX, CY, R0 + 14);
    g.fillStyle(0xe6cf9a, 1).fillCircle(CX, CY, r);
    g.fillStyle(0xd8bd84, 1).fillCircle(CX, CY, r * 0.82);
    g.fillStyle(0xe2c991, 1).fillCircle(CX, CY, r * 0.62);
    // straw rope
    const warn = r < R0 && Math.floor(this.time.now / 250) % 2 === 0 && r > RMIN;
    g.lineStyle(20, 0x6a4a1c, 1).strokeCircle(CX, CY, r + 8);
    g.lineStyle(13, warn ? 0xffe27a : 0xcdb060, 1).strokeCircle(CX, CY, r + 8);
    // shikiri-sen start lines
    g.fillStyle(0xffffff, 0.9).fillRect(CX - 36, CY - 52, 72, 8).fillRect(CX - 36, CY + 44, 72, 8);
  }

  /** Cooldown arcs round the bases and on the touch button. */
  private drawFx(_dt: number): void {
    const g = this.fxG;
    g.clear();
    for (const w of [this.me, this.op]) {
      if (w.out) continue;
      const k = 1 - w.cd / DASH_CD;
      if (k < 1) g.lineStyle(5, 0xffffff, 0.7).beginPath().arc(w.x, w.y + 6, WR + 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      if (w.dashT > 0) g.lineStyle(6, 0xffd23f, 0.8).strokeCircle(w.x, w.y, WR + 6);
    }
    if (this.dashLabel) {
      const bx = this.scale.width - 110, by = this.scale.height - 130, k = 1 - this.me.cd / DASH_CD;
      g.lineStyle(8, k >= 1 ? 0x5dff7a : 0xffffff, k >= 1 ? 0.9 : 0.6).beginPath().arc(bx, by, 80, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      g.setDepth(9502);
    }
  }

  // ================================================================ online
  // Host: simulates both wrestlers (its own = this.me, the guest's = this.op) and sends snapshots.
  // Guest: sends its input; draws the host's wrestler from interpolated snapshots and predicts its
  // own wrestler, blending towards the host's word. The guest's view is the host's dohyo turned
  // by 180° (x' = 2CX - x, y' = 2CY - y), so both players see themselves in red at the bottom.

  private setupOnline(): void {
    if (this.host) {
      net.onScene(this, 'in', (d: { x: number; y: number; s: number }) => {
        if (!d) return;
        // guest view → host coordinates: both axes flip
        this.remoteIn.x = -Phaser.Math.Clamp(d.x, -1, 1);
        this.remoteIn.y = -Phaser.Math.Clamp(d.y, -1, 1);
        if (d.s > this.remoteSeq) { this.remoteSeq = d.s; this.remoteIn.dash = true; }
      });
      net.onScene(this, 'pi', (d: unknown) => net.send('po', d));
    } else {
      net.onScene(this, 'st', (d: Snap) => this.applySnap(d));
      net.onScene(this, 'po', (d: { t: number }) => {
        const rtt = (this.time.now - d.t) / 1000;
        if (rtt >= 0 && rtt < 1) this.lat = Phaser.Math.Linear(this.lat, rtt / 2, 0.5);
      });
    }
  }

  private packW(w: W): number[] {
    const r = Math.round;
    return [r(w.x), r(w.y), r(w.vx), r(w.vy), r(w.face * 100), w.dashT > 0 ? 1 : 0, r(w.cd * 100), w.out ? 1 : 0];
  }

  private sendSnap(): void {
    net.send('st', {
      a: this.packW(this.me), b: this.packW(this.op), r: Math.round(this.ring), k: [this.kMe, this.kOp],
      ph: PHASES.indexOf(this.phase), pt: Math.round(this.phaseT), n: this.bout, adv: this.adv,
      w: this.me.out ? 1 : this.op.out ? 0 : -1,
    } satisfies Snap);
  }

  private hostNet(): void {
    const now = this.time.now;
    if (now - this.sendT >= SEND_MS) {
      this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
      this.sendSnap();
    }
  }

  /** Guest: a host snapshot arrived. Everything is turned into the guest's view. */
  private applySnap(d: Snap): void {
    if (this.isOver || !d?.a) return;
    const now = this.time.now;
    const v = (p: number[]) => ({ x: 2 * CX - p[0], y: 2 * CY - p[1], vx: -p[2], vy: -p[3], face: p[4] / 100 + Math.PI });
    const host = v(d.a), mine = v(d.b);
    this.snaps.push({ at: now, ...host });
    if (this.snaps.length > 30) this.snaps.shift();
    this.op.dashT = d.a[5] ? 0.05 : 0; this.op.cd = d.a[6] / 100; this.op.out = !!d.a[7];
    this.ring = d.r;
    const ph = d.ph;
    const newBout = d.n !== this.lastN;
    this.phaseT = d.pt;
    // phase changes drive the banners and sounds
    if (ph !== this.lastPh || newBout) {
      const prev = this.lastPh;
      this.lastPh = ph; this.lastN = d.n;
      const phase = PHASES[ph] ?? 'count';
      this.phase = phase;
      if (phase === 'count') {
        this.bout = d.n; this.lastCount = -1; this.shrinkWarned = false;
        this.hideBanner();
        this.resetW(this.me, mine.x, mine.y, mine.face);
        this.resetW(this.op, host.x, host.y, host.face);
        this.snaps = [{ at: now, ...host }];
        this.corrX = this.corrY = 0;
        this.updateBoard();
      } else if (phase === 'live') {
        if (prev === 0) this.goFx();
        this.me.cd = d.b[6] / 100;
      } else if (phase === 'over' || phase === 'done') {
        if (prev === 1 || prev === -1) {
          this.kMe = d.k[1]; this.kOp = d.k[0];
          const won = d.w === 1;
          (won ? this.op : this.me).out = true;
          this.boutFx(won);
          this.setScore(this.kMe * 100);
        }
        if (phase === 'done' && !this.isOver) { this.kMe = d.k[1]; this.kOp = d.k[0]; this.matchOver(); return; }
      }
    }
    this.kMe = d.k[1]; this.kOp = d.k[0];
    if (this.phase !== 'live') {
      // outside live play the host's positions are the truth
      this.me.x = mine.x; this.me.y = mine.y; this.me.vx = mine.vx; this.me.vy = mine.vy;
      if (this.phase === 'count') this.me.face = mine.face;
      this.corrX = this.corrY = 0;
      return;
    }
    // where the host's copy of my wrestler is now, then blend towards it
    const ex = mine.x + mine.vx * this.lat - this.me.x, ey = mine.y + mine.vy * this.lat - this.me.y;
    if (Math.hypot(ex, ey) > 140) { this.me.x += ex; this.me.y += ey; this.corrX = this.corrY = 0; }
    else { this.corrX = ex; this.corrY = ey; }
    // velocity: the host's word after contact, mine otherwise
    if (d.b[5] || Math.hypot(mine.vx - this.me.vx, mine.vy - this.me.vy) > 220) { this.me.vx = mine.vx; this.me.vy = mine.vy; }
    this.me.cd = Math.max(this.me.cd, d.b[6] / 100 - 0.15);
  }

  private updateGuest(dt: number): void {
    const now = this.time.now;
    const inp = this.localInput();
    if (inp.dash && this.phase === 'live') this.dashSeq++;
    if (this.phase === 'count') {
      this.phaseT += dt * 1000;
      this.countdownFx();
    }
    // the rival: interpolated snapshots, INTERP_MS in the past
    const rt = now - INTERP_MS;
    const s = this.snaps;
    if (s.length) {
      let i = s.length - 1;
      while (i > 0 && s[i - 1].at > rt) i--;
      const a = s[Math.max(0, i - 1)], b = s[i];
      if (b.at <= rt || a === b) {
        const ex = Math.min(0.1, (rt - b.at) / 1000);
        this.op.x = b.x + b.vx * Math.max(0, ex); this.op.y = b.y + b.vy * Math.max(0, ex); this.op.face = b.face;
      } else {
        const k = Phaser.Math.Clamp((rt - a.at) / (b.at - a.at), 0, 1);
        this.op.x = Phaser.Math.Linear(a.x, b.x, k); this.op.y = Phaser.Math.Linear(a.y, b.y, k);
        this.op.face = turn(a.face, b.face, Math.PI * k);
      }
      const last = s[s.length - 1];
      this.op.vx = last.vx; this.op.vy = last.vy;
    }
    if (this.phase === 'live') {
      // predict my own wrestler
      const SUB = 4, h = dt / SUB;
      for (let k = 0; k < SUB; k++) {
        this.drive(this.me, k === 0 ? inp : { ...inp, dash: false }, h);
        // keep out of the rival's body (the host settles real contact)
        const dx = this.me.x - this.op.x, dy = this.me.y - this.op.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < WR * 2) {
          const push = WR * 2 - dd;
          this.me.x += (dx / dd) * push; this.me.y += (dy / dd) * push;
          const vn = this.me.vx * (-dx / dd) + this.me.vy * (-dy / dd);
          if (vn > 0) { this.me.vx += (dx / dd) * vn; this.me.vy += (dy / dd) * vn; this.bumpFx(this.me.x - (dx / dd) * WR, this.me.y - (dy / dd) * WR, vn); }
        }
      }
      const k = Math.min(1, dt * 10);
      this.me.x += this.corrX * k; this.me.y += this.corrY * k;
      this.corrX -= this.corrX * k; this.corrY -= this.corrY * k;
      if (this.ring < R0 && !this.shrinkWarned) { this.shrinkWarned = true; this.sfx('shrink', { volume: 0.5 }); popup(this, CX, CY - R0 - 30, t('shrink'), '#ffd23f', 28); }
    } else if (this.phase === 'over') {
      this.me.x += this.me.vx * dt; this.me.y += this.me.vy * dt;
    }
    this.syncImages();
    this.drawRing();
    this.drawFx(dt);
    if (now - this.sendT >= SEND_MS) {
      this.sendT = now - Math.min(SEND_MS, now - this.sendT - SEND_MS);
      const r2 = (x: number) => Math.round(x * 100) / 100;
      net.send('in', { x: r2(this.controls.axisX), y: r2(this.controls.axisY), s: this.dashSeq });
    }
    if (now >= this.pingT) { this.pingT = now + 1000; net.send('pi', { t: Math.round(now) }); }
  }
}

/** Turns angle a towards b by at most `step` radians. */
function turn(a: number, b: number, step: number): number {
  const d = Phaser.Math.Angle.Wrap(b - a);
  return a + Phaser.Math.Clamp(d, -step, step);
}
