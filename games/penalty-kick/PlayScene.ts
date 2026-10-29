import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng, net } from '@core';

// Goal frame (front view)
const GL = 110, GR = 610, GT = 330, GB = 560;
const SPOT_X = 360, SPOT_Y = 1060;
const STAND_Y = 485;
const MATCHES = 3;

type Phase = 'aim' | 'flight' | 'runup' | 'defend' | 'wait' | 'pick' | 'netRun';
interface Shot { tx: number; ty: number; T: number; curve: number; t: number; byYou: boolean }

// ---------- online match (net.active) ----------
// Every kick both players choose at once: the shooter aims, the keeper picks one of six dive
// zones. Each side sends its pick; the kick plays out only when both picks are in, and both
// screens compute the same outcome from the same two picks.
const PICK_TIME = 10;                         // seconds to choose before an automatic pick
const SEAT_COLORS = [0xec3013, 0x2d6cdf];     // host red, guest blue
/** A pick for kick k: the shooter sends tx/ty/T/c, the keeper sends z (zone 0..5). */
interface Pick { k: number; r?: number; tx?: number; ty?: number; T?: number; c?: number; z?: number }
/** Round tag from the shared seed: a pick from an earlier round never leaks into a rematch. */
const roundTag = (): number => net.seed & 0xfff;
type Outcome = 'goal' | 'save' | 'post' | 'wide' | 'over';

/** Dive zones: 3 columns × 2 rows across the goal mouth. */
function zoneCenter(z: number): [number, number] {
  const col = z % 3, row = Math.floor(z / 3);
  return [Math.round(GL + (col + 0.5) * (GR - GL) / 3), Math.round(GT + (row + 0.5) * (GB - GT) / 2)];
}

/** Keeper body centre after diving with the hands towards (x, y) (same rule as setDive). */
function diveTarget(x: number, y: number): [number, number] {
  const off = Phaser.Math.Clamp(x - SPOT_X, -260, 260);
  return [
    Phaser.Math.Clamp(x - Math.sign(off) * Math.min(70, Math.abs(off)), GL + 30, GR - 30),
    Phaser.Math.Clamp(y + 40, 400, STAND_Y),
  ];
}

/** Pure outcome of a shot at (tx, ty) against a keeper standing at (kx, ky). */
function kickOutcome(tx: number, ty: number, kx: number, ky: number): Outcome {
  const onPost = (Math.abs(tx - GL + 6) < 16 || Math.abs(tx - GR - 6) < 16) && ty > GT - 12 && ty < GB || (Math.abs(ty - GT + 6) < 14 && tx > GL && tx < GR);
  if (onPost) return 'post';
  if (!(tx > GL && tx < GR && ty > GT && ty < GB)) return ty < GT ? 'over' : 'wide';
  const th = Phaser.Math.DegToRad(Phaser.Math.Clamp((kx - SPOT_X) / 200, -1, 1) * 80);
  const dx = Math.sin(th), dy = -Math.cos(th);
  const x1 = kx - dx * 70, y1 = ky - dy * 70, x2 = kx + dx * 100, y2 = ky + dy * 100;
  const p = Phaser.Geom.Line.GetNearestPoint(new Phaser.Geom.Line(x1, y1, x2, y2), new Phaser.Geom.Point(tx, ty));
  const cx = Phaser.Math.Clamp(p.x, Math.min(x1, x2), Math.max(x1, x2)), cy = Phaser.Math.Clamp(p.y, Math.min(y1, y2), Math.max(y1, y2));
  return Math.hypot(tx - cx, ty - cy) < 58 ? 'save' : 'goal';
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export class PlayScene extends ArcadeScene {
  private ball!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keeper!: Phaser.GameObjects.Container;
  private kicker!: Phaser.GameObjects.Container;
  private reticle!: Phaser.GameObjects.Graphics;
  private trail!: Phaser.GameObjects.Graphics;
  private netG!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Graphics;
  private boardText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private curlText!: Phaser.GameObjects.Text;
  private phase: Phase = 'wait';
  private shot: Shot | null = null;
  private kx = SPOT_X; private ky = STAND_Y;       // keeper body centre
  private gx = SPOT_X; private gy = STAND_Y;       // keeper goal point
  private keeperSpeed = 0;
  private aiDelay = 0;
  private rx = SPOT_X; private ry = 450;           // aim reticle
  private kbCurve = 0;
  private swipe: { x: number; y: number; t: number; pts: Phaser.Math.Vector2[] } | null = null;
  private you: boolean[] = [];
  private them: boolean[] = [];
  private match = 1;
  private netShake = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  // online state
  private online = false;
  private kick = 0;                             // kick index; the round's starter (net.starter) shoots the even ones
  private myPick: Pick | null = null;
  private peerPicks = new Map<number, Pick>();
  private zone = 1;                             // keeper's selected dive zone
  private pickLeft = 0;
  private outcome: Outcome = 'goal';
  private zonesG!: Phaser.GameObjects.Graphics;
  private clockText!: Phaser.GameObjects.Text;

  createGame(): void {
    this.phase = 'wait'; this.shot = null; this.kx = SPOT_X; this.ky = STAND_Y; this.gx = SPOT_X; this.gy = STAND_Y;
    this.keeperSpeed = 0; this.aiDelay = 0; this.rx = SPOT_X; this.ry = 450; this.kbCurve = 0; this.swipe = null;
    this.you = []; this.them = []; this.match = 1; this.netShake = 0;
    this.online = net.active;
    this.kick = 0; this.myPick = null; this.peerPicks = new Map(); this.zone = 1; this.pickLeft = 0; this.outcome = 'goal';
    this.useHud = !this.online;
    this.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textures.get('glove').setFilter(Phaser.Textures.FilterMode.NEAREST);

    this.drawPitch();
    this.netG = this.add.graphics().setDepth(1);
    this.keeper = this.makePlayer(0x2d6cdf, true).setDepth(3);
    this.kicker = this.makePlayer(0xec3013, false).setDepth(6).setVisible(false);
    this.shadow = this.add.ellipse(SPOT_X, SPOT_Y + 40, 80, 20, 0x000000, 0.35).setDepth(4);
    this.ball = this.add.image(SPOT_X, SPOT_Y, 'ball').setScale(5).setDepth(5);
    this.trail = this.add.graphics().setDepth(4);
    this.reticle = this.add.graphics().setDepth(7);
    this.board = this.add.graphics().setDepth(8);
    this.boardText = txt(this, 360, 140, '', { title: true, size: 22 }).setDepth(9);
    this.banner = txt(this, 360, 760, '', { title: true, size: 36, color: '#ffd23f', wrap: 660 }).setDepth(20);
    this.curlText = txt(this, 360, 1170, '', { size: 30, color: '#3ee6ff' }).setDepth(9);
    this.zonesG = this.add.graphics().setDepth(7);
    this.clockText = txt(this, 360, 1232, '', { title: true, size: 24, color: '#ffd23f' }).setDepth(9);

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = { left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W), s: kb.addKey(K.S) };
    const kbShoot = () => {
      if (this.phase === 'aim') this.shoot(this.rx, this.ry, 0.68, this.kbCurve, 18);
      else if (this.phase === 'pick') this.commitZone(this.zone);
    };
    kb.on('keydown-SPACE', kbShoot);
    kb.on('keydown-Z', kbShoot);
    kb.on('keydown-ENTER', () => { if (this.phase === 'pick') this.commitZone(this.zone); });
    const zoneKey = (dc: number, dr: number) => {
      if (this.phase !== 'pick') return;
      const col = Phaser.Math.Clamp((this.zone % 3) + dc, 0, 2), row = Phaser.Math.Clamp(Math.floor(this.zone / 3) + dr, 0, 1);
      if (col + row * 3 !== this.zone) { this.zone = col + row * 3; this.sfx('curl', { volume: 0.3 }); }
    };
    for (const [k, dc, dr] of [['LEFT', -1, 0], ['A', -1, 0], ['RIGHT', 1, 0], ['D', 1, 0], ['UP', 0, -1], ['W', 0, -1], ['DOWN', 0, 1], ['S', 0, 1]] as const) {
      kb.on(`keydown-${k}`, () => zoneKey(dc, dr));
    }
    kb.on('keydown-X', () => {
      if (this.phase !== 'aim') return;
      this.kbCurve = this.kbCurve === 0 ? 1 : this.kbCurve === 1 ? -1 : 0;
      this.sfx('curl', { volume: 0.4 });
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 580 && p.y < 140) return;
      if (this.phase === 'aim') this.swipe = { x: p.x, y: p.y, t: this.time.now, pts: [new Phaser.Math.Vector2(p.x, p.y)] };
      else if (this.phase === 'defend' || this.phase === 'runup') this.setDive(p.x, p.y);
      else if (this.phase === 'pick') { const z = this.zoneAt(p.x, p.y); if (z >= 0) this.commitZone(z); }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (this.swipe && this.phase === 'aim') {
        this.swipe.pts.push(new Phaser.Math.Vector2(p.x, p.y));
        const a = this.swipeAim(p.x, p.y);
        if (a) { this.rx = a.tx; this.ry = a.ty; }
      } else if (this.phase === 'defend' || this.phase === 'runup') this.setDive(p.x, p.y);
    });
    if (this.online) {
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (this.phase !== 'pick') return;
        const z = this.zoneAt(p.x, p.y);
        if (z >= 0) this.zone = z;
      });
      net.onScene(this, 'pick', (d: Pick) => {
        if (!d || typeof d.k !== 'number' || d.k < this.kick || d.r !== roundTag()) return;
        this.peerPicks.set(d.k, d);
        this.tryResolve();
      });
    }
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const sw = this.swipe;
      this.swipe = null;
      if (!sw || this.phase !== 'aim') return;
      const a = this.swipeAim(p.x, p.y);
      if (!a) return;
      const dur = Math.max(60, this.time.now - sw.t);
      const len = Math.hypot(p.x - sw.x, p.y - sw.y);
      const speed = Phaser.Math.Clamp((len / dur - 0.3) / 2.2, 0, 1);
      // curl = signed max deviation of the swipe path from its chord
      const cx = p.x - sw.x, cy = p.y - sw.y;
      let dev = 0;
      for (const q of sw.pts) {
        const d = ((q.x - sw.x) * cy - (q.y - sw.y) * cx) / len;
        if (Math.abs(d) > Math.abs(dev)) dev = d;
      }
      this.shoot(a.tx, a.ty, speed, Phaser.Math.Clamp(dev / 50, -1, 1), 12 + speed * 30);
    });

    this.hud.setRight(`${this.match}/${MATCHES}`);
    if (this.online) this.startOnline();
    else this.startMatch();
  }

  // ---------- drawing ----------
  private drawPitch(): void {
    if (this.textures.exists('pk-pitch')) { this.add.image(0, 0, 'pk-pitch').setOrigin(0).setDepth(0); return; }
    const g = this.make.graphics({}, false);
    g.fillGradientStyle(0x0b1324, 0x0b1324, 0x1d2b4a, 0x1d2b4a).fillRect(0, 0, 720, 300);
    // crowd
    for (let y = 200; y < 300; y += 14) for (let x = 6; x < 720; x += 14) {
      g.fillStyle(rng.pick([0xec3013, 0xf3f2f2, 0x2d6cdf, 0x3a3f5a, 0xffd23f, 0x3a3f5a]), 0.75).fillCircle(x + (y % 28 ? 7 : 0), y, 5);
    }
    // stadium lights
    for (const lx of [40, 680]) { g.fillStyle(0xfff6c0, 0.06).fillCircle(lx, 150, 110); g.fillStyle(0xfff6c0, 0.12).fillCircle(lx, 150, 50); }
    // ad boards
    g.fillStyle(0x16141c).fillRect(0, 296, 720, 34);
    for (let x = 0; x < 720; x += 120) g.fillStyle(rng.pick([0xec3013, 0x3ee6ff, 0xffd23f])).fillRect(x + 10, 302, 100, 22);
    // grass stripes (perspective)
    let y = 330, h = 18, i = 0;
    while (y < 1280) { g.fillStyle(i++ % 2 ? 0x2f8f3a : 0x37a243).fillRect(0, y, 720, h); y += h; h *= 1.16; }
    // pitch lines
    g.lineStyle(5, 0xffffff, 0.85);
    g.lineBetween(0, GB, 720, GB);
    g.lineBetween(40, 640, 680, 640); g.lineBetween(40, 640, 0, 760); g.lineBetween(680, 640, 720, 760); // 6-yard box
    g.lineBetween(0, 880, 720, 880);
    g.fillStyle(0xffffff, 0.9).fillEllipse(SPOT_X, SPOT_Y + 42, 30, 10);
    g.lineStyle(5, 0xffffff, 0.6).beginPath().arc(SPOT_X, 1500, 520, Math.PI * 1.32, Math.PI * 1.68).strokePath();
    g.generateTexture('pk-pitch', 720, 1280);
    g.destroy();
    this.add.image(0, 0, 'pk-pitch').setOrigin(0).setDepth(0);
  }

  private drawNet(): void {
    const g = this.netG;
    g.clear();
    const s = this.netShake;
    g.fillStyle(0x000000, 0.25).fillRect(GL, GT, GR - GL, GB - GT);
    g.lineStyle(2, 0xffffff, 0.35);
    for (let x = GL + 20; x < GR; x += 22) g.lineBetween(x + Math.sin(x + this.elapsed * 30) * s, GT, x, GB);
    for (let y = GT + 20; y < GB; y += 22) g.lineBetween(GL, y + Math.sin(y + this.elapsed * 30) * s, GR, y);
    // frame
    g.fillStyle(0xdddddd).fillRect(GL - 12, GT - 12, 12, GB - GT + 12).fillRect(GR, GT - 12, 12, GB - GT + 12).fillRect(GL - 12, GT - 12, GR - GL + 24, 12);
    g.fillStyle(0xffffff).fillRect(GL - 12, GT - 12, 5, GB - GT + 12).fillRect(GR, GT - 12, 5, GB - GT + 12).fillRect(GL - 12, GT - 12, GR - GL + 24, 4);
  }

  /** A blocky front-view footballer. Keeper has gloves raised. Origin = body centre. */
  private makePlayer(color: number, keeper: boolean): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const parts: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(-14, 52, 18, 50, 0xf0c090), this.add.rectangle(14, 52, 18, 50, 0xf0c090),
      this.add.rectangle(-14, 78, 22, 12, 0x111111), this.add.rectangle(14, 78, 22, 12, 0x111111),
      this.add.rectangle(0, 30, 50, 22, 0x111111),
      this.add.rectangle(0, -6, 56, 56, color).setStrokeStyle(3, 0x000000, 0.4),
      this.add.circle(0, -50, 20, keeper ? 0xf0c090 : 0x3a2414), this.add.rectangle(0, -64, 40, 12, 0x3a2414),
      this.add.text(0, -8, keeper ? '1' : '10', { fontFamily: '"Press Start 2P"', fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setVisible(!keeper),
    ];
    if (keeper) {
      parts.push(this.add.rectangle(-38, -40, 14, 50, color).setAngle(-25), this.add.rectangle(38, -40, 14, 50, color).setAngle(25));
      parts.push(this.add.image(-50, -70, 'glove').setScale(2.6).setTint(0xffe14d), this.add.image(50, -70, 'glove').setScale(2.6).setFlipX(true).setTint(0xffe14d));
    } else {
      parts.push(this.add.rectangle(-36, -2, 14, 50, color), this.add.rectangle(36, -2, 14, 50, color));
    }
    c.add(parts);
    return c;
  }

  private drawBoard(): void {
    const g = this.board;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(110, 96, 500, 160, 16);
    const row = (arr: boolean[], y: number) => {
      const start = Math.max(0, arr.length - 5);
      for (let i = 0; i < 5; i++) {
        const v = arr[start + i];
        const x = 380 + i * 44;
        g.fillStyle(v === undefined ? 0x444455 : v ? 0x5dff7a : 0xec3013).fillCircle(x, y, 14);
      }
    };
    row(this.you, 180); row(this.them, 226);
    const yg = this.you.filter(Boolean).length, tg = this.them.filter(Boolean).length;
    const head = !this.online ? t('m' + this.match)
      : this.kick >= 10 ? t('sudden') : `${t('kickN')} ${Math.floor(this.kick / 2) + 1}/5`;
    this.boardText.setText(head).setPosition(360, 126).setColor('#ffd23f').setFontSize(20);
    this.boardLabels(yg, tg);
  }

  private labels: Phaser.GameObjects.Text[] = [];
  private boardLabels(yg: number, tg: number): void {
    for (const l of this.labels) l.destroy();
    this.labels = [
      txt(this, 140, 180, `${t('you')} ${yg}`, { title: true, size: 20, color: '#3ee6ff' }).setOrigin(0, 0.5).setDepth(9),
      txt(this, 140, 226, `${this.online ? clip(net.peerName || t('them'), 9) : t('them')} ${tg}`, { title: true, size: 20, color: '#ff6b5a' }).setOrigin(0, 0.5).setDepth(9),
    ];
  }

  // ---------- flow ----------
  private startMatch(): void {
    this.you = []; this.them = [];
    this.hud.setRight(`${this.match}/${MATCHES}`);
    this.drawBoard();
    this.showBanner(t('m' + this.match), '#ffd23f');
    this.sfx('whistle', { volume: 0.5 });
    this.time.delayedCall(1200, () => this.startShooting());
  }

  private keeperDifficulty() {
    const m = this.match - 1;
    return { react: Math.max(0.1, 0.32 - m * 0.08), noise: Math.max(35, 120 - m * 35), speed: 1000 + m * 260, wrong: Math.max(0.08, 0.28 - m * 0.08) };
  }

  private resetBall(): void {
    this.tweens.killTweensOf(this.ball);
    this.ball.setPosition(SPOT_X, SPOT_Y).setScale(5).setAngle(0).setAlpha(1).setDepth(5);
    this.shadow.setPosition(SPOT_X, SPOT_Y + 40).setScale(1).setVisible(true);
    this.kx = this.gx = SPOT_X; this.ky = this.gy = STAND_Y;
    this.keeper.setAngle(0);
    this.trail.clear();
  }

  private startShooting(): void {
    if (this.isOver) return;
    this.resetBall();
    this.keeper.list.forEach((o) => { if (o instanceof Phaser.GameObjects.Rectangle && o.width === 56) o.setFillStyle(0x24b04a); });
    this.kicker.setVisible(false);
    this.phase = 'aim';
    this.rx = SPOT_X; this.ry = 450;
    this.showBanner(t('shoot'), '#f3f2f2');
  }

  private startDefending(): void {
    if (this.isOver) return;
    this.resetBall();
    this.keeper.list.forEach((o) => { if (o instanceof Phaser.GameObjects.Rectangle && o.width === 56) o.setFillStyle(0x2d6cdf); });
    this.phase = 'runup';
    this.showBanner(t('keep'), '#3ee6ff');
    this.kicker.setVisible(true).setPosition(250, 1300).setScale(1.5).setAlpha(1);
    this.tweens.add({
      targets: this.kicker, x: 300, y: SPOT_Y + 30, duration: 900 + rng.int(0, 500), ease: 'Sine.easeIn',
      onUpdate: () => { if (rng.chance(0.08)) this.sfx('step', { volume: 0.3 }); },
      onComplete: () => this.aiShoot(),
    });
  }

  private aiShoot(): void {
    if (this.isOver || this.phase !== 'runup') return;
    const m = this.match - 1;
    const missChance = Math.max(0.04, 0.14 - m * 0.04);
    const corner = rng.chance(0.35 + m * 0.15);
    let tx = corner ? rng.pick([rng.int(GL + 15, GL + 80), rng.int(GR - 80, GR - 15)]) : rng.int(GL + 60, GR - 60);
    let ty = corner ? rng.int(GT + 15, GT + 90) : rng.int(GT + 40, GB - 20);
    if (rng.chance(missChance)) { tx = rng.pick([GL - 50, GR + 50]); ty = rng.int(GT, GB); }
    const T = Math.max(0.5, 0.85 - m * 0.12) + rng.int(0, 10) / 100;
    this.launch({ tx, ty, T, curve: rng.int(-10, 10) / 10 * (0.3 + m * 0.25), t: 0, byYou: false });
    this.phase = 'defend';
    this.tweens.add({ targets: this.kicker, alpha: 0, duration: 600 });
  }

  private swipeAim(x: number, y: number): { tx: number; ty: number } | null {
    if (!this.swipe) return null;
    const dx = x - this.swipe.x, dy = y - this.swipe.y;
    if (dy > -40) return null;
    return { tx: SPOT_X + dx * 1.5, ty: GB - (-dy - 90) * 0.85 };
  }

  private shoot(tx: number, ty: number, speed: number, curve: number, scatter: number): void {
    if (this.phase !== 'aim') return;
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2), r = Phaser.Math.FloatBetween(0, scatter);
    const T = 0.95 - speed * 0.45;
    if (this.online) {
      this.commit({
        k: this.kick, tx: Math.round(tx + Math.cos(a) * r), ty: Math.round(ty + Math.sin(a) * r),
        T: Math.round(T * 100) / 100, c: Math.round(Phaser.Math.Clamp(curve, -1, 1) * 100) / 100,
      });
      return;
    }
    this.launch({ tx: tx + Math.cos(a) * r, ty: ty + Math.sin(a) * r, T, curve, t: 0, byYou: true });
    this.phase = 'flight';
    // keeper AI
    const d = this.keeperDifficulty();
    this.aiDelay = d.react + (1 - speed) * 0.05;
    this.keeperSpeed = d.speed;
    let guessX = this.shot!.tx + Phaser.Math.FloatBetween(-1, 1) * (d.noise + Math.abs(curve) * 60);
    const guessY = this.shot!.ty + Phaser.Math.FloatBetween(-1, 1) * d.noise * 0.6;
    if (rng.chance(d.wrong)) guessX = SPOT_X * 2 - guessX;
    this.setDive(guessX, guessY, true);
  }

  private launch(s: Shot): void {
    this.shot = s;
    this.sfx('kick', { volume: 0.8 });
    burst(this, SPOT_X, SPOT_Y + 40, [0x37a243, 0xffffff], 10, 160);
    shake(this, 0.004, 80);
    this.banner.setText('');
    this.curlText.setText('');
  }

  /** Point the keeper's hands at (x, y). */
  private setDive(x: number, y: number, ai = false): void {
    if (!ai) this.keeperSpeed = 1300;
    const off = Phaser.Math.Clamp(x - SPOT_X, -260, 260);
    this.gx = Phaser.Math.Clamp(x - Math.sign(off) * Math.min(70, Math.abs(off)), GL + 30, GR - 30);
    this.gy = Phaser.Math.Clamp(y + 40, 400, STAND_Y);
  }

  private keeperSegment(): [number, number, number, number] {
    const th = Phaser.Math.DegToRad(this.keeper.angle);
    const dx = Math.sin(th), dy = -Math.cos(th);
    return [this.kx - dx * 70, this.ky - dy * 70, this.kx + dx * 100, this.ky + dy * 100];
  }

  private saves(tx: number, ty: number): boolean {
    const [x1, y1, x2, y2] = this.keeperSegment();
    const line = new Phaser.Geom.Line(x1, y1, x2, y2);
    const p = Phaser.Geom.Line.GetNearestPoint(line, new Phaser.Geom.Point(tx, ty));
    const cx = Phaser.Math.Clamp(p.x, Math.min(x1, x2), Math.max(x1, x2)), cy = Phaser.Math.Clamp(p.y, Math.min(y1, y2), Math.max(y1, y2));
    return Math.hypot(tx - cx, ty - cy) < 58;
  }

  private resolve(): void {
    const s = this.shot!;
    this.shot = null;
    this.phase = 'wait';
    const onPost = (Math.abs(s.tx - GL + 6) < 16 || Math.abs(s.tx - GR - 6) < 16) && s.ty > GT - 12 && s.ty < GB || (Math.abs(s.ty - GT + 6) < 14 && s.tx > GL && s.tx < GR);
    const inside = s.tx > GL && s.tx < GR && s.ty > GT && s.ty < GB;
    let goal = false;
    if (onPost) {
      this.sfx('post', { volume: 0.7 }); shake(this, 0.01, 150);
      this.showBanner(t('post'), '#f3f2f2');
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < SPOT_X ? -200 : 200), y: s.ty + 300, scale: 2.4, duration: 600 });
    } else if (!inside) {
      this.showBanner(s.ty < GT ? t('over') : t('wide'), '#f3f2f2');
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx - SPOT_X) * 0.3, y: s.ty - 80, scale: 1.2, alpha: 0, duration: 500 });
    } else if (this.saves(s.tx, s.ty)) {
      this.sfx('save', { volume: 0.8 }); shake(this, 0.008, 120);
      burst(this, s.tx, s.ty, [0xffffff, 0xffe14d], 18, 260);
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < this.kx ? -160 : 160), y: s.ty + rng.int(150, 300), scale: 3.2, angle: 400, duration: 600, ease: 'Quad.easeOut' });
    } else {
      goal = true;
      this.netShake = 6;
      this.sfx('net', { volume: 0.7 });
      this.tweens.add({ targets: this.ball, y: s.ty + 14, scale: 1.8, duration: 160, ease: 'Quad.easeOut' });
      this.ball.setDepth(2);
    }

    if (s.byYou) {
      this.you.push(goal);
      if (goal) {
        const corner = s.ty < GT + 80 && (s.tx < GL + 90 || s.tx > GR - 90);
        this.sfx('goal', { volume: 0.6 });
        flash(this, 0x5dff7a, 150);
        burst(this, s.tx, s.ty, [0x5dff7a, 0xffd23f, 0xffffff], 36, 380);
        this.addScore(corner ? 200 : 100, s.tx, s.ty - 40);
        this.showBanner(corner ? t('corner') : t('goal'), '#5dff7a');
      } else if (inside && !onPost) { this.showBanner(t('saved'), '#ec3013'); this.sfx('boo', { volume: 0.4 }); }
    } else {
      this.them.push(goal);
      if (goal) { this.showBanner(t('goal'), '#ec3013'); this.sfx('boo', { volume: 0.4 }); }
      else if (inside && !onPost) {
        this.addScore(150, s.tx, s.ty - 40);
        this.showBanner(t('bigSave'), '#5dff7a');
        flash(this, 0x3ee6ff, 120);
        this.sfx('goal', { volume: 0.6 });
      } else this.addScore(50, s.tx, s.ty);
    }
    this.drawBoard();
    this.time.delayedCall(1500, () => this.next());
  }

  private decided(): 'win' | 'lose' | null {
    const yg = this.you.filter(Boolean).length, tg = this.them.filter(Boolean).length;
    const yn = this.you.length, tn = this.them.length;
    if (yn <= 5 && tn <= 5 && !(yn === 5 && tn === 5)) {
      if (yg + (5 - yn) < tg) return 'lose';
      if (tg + (5 - tn) < yg) return 'win';
      return null;
    }
    if (yn === tn && yg !== tg) return yg > tg ? 'win' : 'lose';
    return null;
  }

  private next(): void {
    if (this.isOver) return;
    const d = this.decided();
    if (d === 'lose') { this.endGame({ title: t('out'), delay: 400 }); return; }
    if (d === 'win') {
      this.addScore(300 * this.match, 360, 640);
      this.showBanner(t('matchWin'), '#5dff7a');
      this.sfx('jingle-win', { volume: 0.6 });
      burst(this, 360, 640, [0xffd23f, 0x5dff7a, 0x3ee6ff], 60, 500);
      if (this.match >= MATCHES) { this.endGame({ win: true, title: t('champion'), delay: 1600 }); return; }
      this.time.delayedCall(1800, () => { this.match++; this.startMatch(); });
      return;
    }
    if (this.you.length === 5 && this.them.length === 5) this.showBanner(t('sudden'), '#ff4fa3');
    if (this.you.length > this.them.length) this.startDefending();
    else this.time.delayedCall(this.you.length >= 5 && this.you.length === this.them.length ? 900 : 0, () => this.startShooting());
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setScale(0.3).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: 'Back.easeOut' });
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ay = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);

    if (this.phase === 'aim') {
      this.rx = Phaser.Math.Clamp(this.rx + ax * 380 * dt, GL - 80, GR + 80);
      this.ry = Phaser.Math.Clamp(this.ry + ay * 300 * dt, GT - 80, GB - 10);
      // idle keeper sway
      this.gx = SPOT_X + Math.sin(this.elapsed * 2.2) * 40;
      this.gy = STAND_Y;
      this.keeperSpeed = 200;
      this.curlText.setText(this.kbCurve ? `${t('curl')} ${this.kbCurve < 0 ? '◄' : '►'}` : '');
    } else if (this.phase === 'pick' || this.phase === 'wait' || this.phase === 'netRun') {
      // online: idle keeper sway until the kick
      this.gx = SPOT_X + Math.sin(this.elapsed * 2.2) * 30;
      this.gy = STAND_Y;
      this.keeperSpeed = 200;
    } else if ((this.phase === 'defend' || this.phase === 'runup') && (ax || ay)) {
      this.keeperSpeed = 1300;
      this.gx = Phaser.Math.Clamp(this.gx + ax * 900 * dt, GL + 30, GR - 30);
      this.gy = Phaser.Math.Clamp(this.gy + ay * 600 * dt, 400, STAND_Y);
    }

    // keeper motion
    if (this.phase === 'flight' && this.aiDelay > 0) this.aiDelay -= dt;
    else {
      const dx = this.gx - this.kx, dy = this.gy - this.ky, d = Math.hypot(dx, dy), step = this.keeperSpeed * dt;
      if (d > 0.5) { const f = Math.min(1, step / d); this.kx += dx * f; this.ky += dy * f; }
    }
    const lean = Phaser.Math.Clamp((this.kx - SPOT_X) / 200, -1, 1);
    this.keeper.setPosition(this.kx, this.ky).setAngle(lean * 80);

    // ball flight
    this.trail.clear();
    if (this.shot && (this.phase === 'flight' || this.phase === 'defend')) {
      const s = this.shot;
      s.t += dt;
      const p = Math.min(1, s.t / s.T);
      const bx = Phaser.Math.Linear(SPOT_X, s.tx, p) + s.curve * Math.sin(Math.PI * p) * 120;
      const by = Phaser.Math.Linear(SPOT_Y, s.ty, p) - Math.sin(Math.PI * p) * 50;
      this.ball.setPosition(bx, by).setScale(Phaser.Math.Linear(5, 2, p)).setAngle(this.ball.angle + 900 * dt);
      this.shadow.setPosition(bx, Phaser.Math.Linear(SPOT_Y + 40, GB + 6, p)).setScale(Phaser.Math.Linear(1, 0.4, p));
      this.trail.fillStyle(0xffffff, 0.25).fillCircle(bx, by, Phaser.Math.Linear(30, 10, p));
      if (p >= 1) { this.shadow.setVisible(false); if (this.online) this.resolveOnline(); else this.resolve(); }
    }

    this.netShake = Math.max(0, this.netShake - dt * 8);
    this.drawNet();
    this.drawReticle();
    if (this.online) this.updateOnline(dt);
  }

  // ---------- online match ----------
  /** Seat that shoots kick k: the round's starter takes the even kicks, sudden death included. */
  private shooterSeat(k = this.kick): 0 | 1 {
    return k % 2 === 0 ? net.starter : net.starter === 0 ? 1 : 0;
  }

  private iShoot(): boolean {
    return this.shooterSeat() === net.seat;
  }

  private paint(c: Phaser.GameObjects.Container, color: number): void {
    c.list.forEach((o) => {
      if (o instanceof Phaser.GameObjects.Rectangle && (o.width === 56 || o.width === 14)) o.setFillStyle(color);
    });
  }

  private startOnline(): void {
    this.drawBoard();
    this.showBanner(t('vs', { name: net.peerName || t('opponent') }), '#ffd23f');
    this.sfx('whistle', { volume: 0.5 });
    this.time.delayedCall(1300, () => this.startKick());
  }

  private startKick(): void {
    if (this.isOver) return;
    this.resetBall();
    this.myPick = null;
    this.pickLeft = PICK_TIME;
    this.drawBoard();
    const shooter = this.shooterSeat();
    this.paint(this.keeper, SEAT_COLORS[1 - shooter]);
    this.paint(this.kicker, SEAT_COLORS[shooter]);
    this.kicker.setVisible(false).setAlpha(1).setScale(1.5);
    if (this.iShoot()) {
      this.phase = 'aim';
      this.rx = SPOT_X; this.ry = 450;
      this.showBanner(t('shoot'), '#f3f2f2');
    } else {
      this.phase = 'pick';
      this.zone = 1;
      this.showBanner(t('pickDive'), '#3ee6ff');
      this.kicker.setVisible(true).setPosition(250, 1190);
    }
    if (this.kick === 10) popup(this, 360, 880, t('sudden'), '#ff4fa3', 34);
  }

  private zoneAt(x: number, y: number): number {
    if (x < GL - 60 || x > GR + 60 || y < GT - 90 || y > GB + 70) return -1;
    const col = Phaser.Math.Clamp(Math.floor((x - GL) / ((GR - GL) / 3)), 0, 2);
    return col + (y < (GT + GB) / 2 ? 0 : 3);
  }

  private commitZone(z: number): void {
    if (this.phase !== 'pick') return;
    this.zone = z;
    this.sfx('save', { volume: 0.35 });
    const [x, y] = zoneCenter(z);
    burst(this, x, y, [0x3ee6ff, 0xffffff], 10, 160);
    this.commit({ k: this.kick, z });
  }

  private commit(pick: Pick): void {
    pick.r = roundTag();
    this.myPick = pick;
    net.send('pick', pick);
    this.phase = 'wait';
    this.swipe = null;
    this.clockText.setText('');
    this.curlText.setText('');
    this.showBanner(t('waitPeer'), '#f3f2f2');
    this.tweens.add({ targets: this.banner, alpha: 0.4, duration: 600, yoyo: true, repeat: -1, delay: 300 });
    this.tryResolve();
  }

  /** Plays the kick once both picks for it are known (identical on both screens). */
  private tryResolve(): void {
    if (this.isOver || this.phase !== 'wait' || !this.myPick || this.myPick.k !== this.kick) return;
    const peer = this.peerPicks.get(this.kick);
    if (!peer) return;
    this.peerPicks.delete(this.kick);
    const shot = this.iShoot() ? this.myPick : peer;
    const keep = this.iShoot() ? peer : this.myPick;
    this.myPick = null;
    const tx = Number(shot.tx ?? SPOT_X), ty = Number(shot.ty ?? 450);
    const T = Phaser.Math.Clamp(Number(shot.T ?? 0.7), 0.4, 1), c = Phaser.Math.Clamp(Number(shot.c ?? 0), -1, 1);
    const [zx, zy] = zoneCenter(Phaser.Math.Clamp(Math.round(Number(keep.z ?? 1)), 0, 5));
    const [kx, ky] = diveTarget(zx, zy);
    this.outcome = kickOutcome(tx, ty, kx, ky);

    this.phase = 'netRun';
    this.tweens.killTweensOf(this.banner);
    this.banner.setText('').setAlpha(1);
    this.zonesG.clear();
    this.kicker.setVisible(true).setAlpha(1).setPosition(250, 1300);
    this.tweens.add({
      targets: this.kicker, x: 300, y: SPOT_Y + 30, duration: 700, ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.isOver) return;
        this.launch({ tx, ty, T, curve: c, t: 0, byYou: this.iShoot() });
        this.phase = 'flight';
        this.gx = kx; this.gy = ky;            // the keeper dives into the chosen zone
        this.keeperSpeed = 1300; this.aiDelay = 0.08;
        this.tweens.add({ targets: this.kicker, alpha: 0, duration: 600 });
      },
    });
    this.sfx('step', { volume: 0.3 });
    this.time.delayedCall(350, () => this.sfx('step', { volume: 0.3 }));
  }

  /** Ball arrived: show the outcome computed in tryResolve (the same on both screens). */
  private resolveOnline(): void {
    const s = this.shot!;
    this.shot = null;
    this.phase = 'wait';
    this.kx = this.gx; this.ky = this.gy;      // keeper is exactly at the dive target on both screens
    const mine = this.iShoot();
    const o = this.outcome;
    const goal = o === 'goal';
    if (o === 'post') {
      this.sfx('post', { volume: 0.7 }); shake(this, 0.01, 150);
      this.showBanner(t('post'), '#f3f2f2');
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < SPOT_X ? -200 : 200), y: s.ty + 300, scale: 2.4, duration: 600 });
    } else if (o === 'wide' || o === 'over') {
      this.showBanner(t(o), '#f3f2f2');
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx - SPOT_X) * 0.3, y: s.ty - 80, scale: 1.2, alpha: 0, duration: 500 });
    } else if (o === 'save') {
      this.sfx('save', { volume: 0.8 }); shake(this, 0.008, 120);
      burst(this, s.tx, s.ty, [0xffffff, 0xffe14d], 18, 260);
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < this.kx ? -160 : 160), y: s.ty + 220, scale: 3.2, angle: 400, duration: 600, ease: 'Quad.easeOut' });
    } else {
      this.netShake = 6;
      this.sfx('net', { volume: 0.7 });
      this.tweens.add({ targets: this.ball, y: s.ty + 14, scale: 1.8, duration: 160, ease: 'Quad.easeOut' });
      this.ball.setDepth(2);
    }
    if (mine) {
      this.you.push(goal);
      if (goal) {
        const corner = s.ty < GT + 80 && (s.tx < GL + 90 || s.tx > GR - 90);
        this.sfx('goal', { volume: 0.6 });
        flash(this, 0x5dff7a, 150);
        burst(this, s.tx, s.ty, [0x5dff7a, 0xffd23f, 0xffffff], 36, 380);
        this.addScore(corner ? 200 : 100, s.tx, s.ty - 40);
        this.showBanner(corner ? t('corner') : t('goal'), '#5dff7a');
      } else if (o === 'save') { this.showBanner(t('saved'), '#ec3013'); this.sfx('boo', { volume: 0.4 }); }
    } else {
      this.them.push(goal);
      if (goal) { this.showBanner(t('goal'), '#ec3013'); this.sfx('boo', { volume: 0.4 }); shake(this, 0.006, 150); }
      else if (o === 'save') {
        this.addScore(150, s.tx, s.ty - 40);
        this.showBanner(t('bigSave'), '#5dff7a');
        flash(this, 0x3ee6ff, 120);
        this.sfx('goal', { volume: 0.6 });
      }
    }
    this.drawBoard();
    this.time.delayedCall(1500, () => this.nextOnline());
  }

  private nextOnline(): void {
    if (this.isOver) return;
    const d = this.decided();
    if (d) {
      const win = d === 'win';
      this.showBanner(win ? t('youWin') : t('youLose'), win ? '#5dff7a' : '#ec3013');
      if (win) {
        this.sfx('jingle-win', { volume: 0.6 });
        burst(this, 360, 640, [0xffd23f, 0x5dff7a, 0x3ee6ff], 60, 500);
      } else shake(this, 0.015, 300);
      this.endGame({ win, title: win ? t('youWin') : t('youLose'), delay: 1600 });
      return;
    }
    this.kick++;
    this.startKick();
  }

  private updateOnline(dt: number): void {
    // dive zones on the keeper's screen
    const g = this.zonesG;
    g.clear();
    const keeping = !this.iShoot() && (this.phase === 'pick' || (this.phase === 'wait' && !!this.myPick));
    if (keeping) {
      const w = (GR - GL) / 3, h = (GB - GT) / 2;
      for (let z = 0; z < 6; z++) {
        const x = GL + (z % 3) * w, y = GT + Math.floor(z / 3) * h;
        const sel = z === this.zone;
        if (this.phase === 'wait' && !sel) continue;
        g.fillStyle(sel ? 0x3ee6ff : 0xffffff, sel ? 0.28 + Math.sin(this.elapsed * 8) * 0.08 : 0.07).fillRect(x + 4, y + 4, w - 8, h - 8);
        g.lineStyle(3, sel ? 0x3ee6ff : 0xffffff, sel ? 0.9 : 0.3).strokeRect(x + 4, y + 4, w - 8, h - 8);
      }
    }
    // choice clock: an automatic pick when it runs out
    if (this.phase === 'aim' || this.phase === 'pick') {
      const before = Math.ceil(this.pickLeft);
      this.pickLeft -= dt;
      const now = Math.ceil(this.pickLeft);
      this.clockText.setText(`${Math.max(0, now)}`).setColor(now <= 3 ? '#ec3013' : '#ffd23f');
      if (now !== before && now <= 3 && now > 0) this.sfx('curl', { volume: 0.25 });
      if (this.pickLeft <= 0) {
        if (this.phase === 'aim') this.shoot(this.rx, this.ry, 0.5, this.kbCurve, 18);
        else this.commitZone(this.zone);
      }
    }
  }

  private drawReticle(): void {
    const g = this.reticle;
    g.clear();
    if (this.phase !== 'aim') return;
    const pulse = 1 + Math.sin(this.elapsed * 8) * 0.12;
    g.lineStyle(4, 0xffd23f, 0.9).strokeCircle(this.rx, this.ry, 22 * pulse);
    g.lineBetween(this.rx - 34, this.ry, this.rx - 12, this.ry).lineBetween(this.rx + 12, this.ry, this.rx + 34, this.ry);
    g.lineBetween(this.rx, this.ry - 34, this.rx, this.ry - 12).lineBetween(this.rx, this.ry + 12, this.rx, this.ry + 34);
    // dotted guide from the ball
    for (let i = 1; i < 10; i++) {
      const p = i / 10;
      const c = this.kbCurve && !this.swipe ? this.kbCurve : 0;
      g.fillStyle(0xffffff, 0.35).fillCircle(Phaser.Math.Linear(SPOT_X, this.rx, p) + c * Math.sin(Math.PI * p) * 120, Phaser.Math.Linear(SPOT_Y - 40, this.ry, p) - Math.sin(Math.PI * p) * 50, 5);
    }
  }
}
