import Phaser from 'phaser';
import {
  ArcadeScene, burst, shake, flash, popup, t, txt, rng, net, CHARACTER_FRAME, characterRig, loadCharacter,
  playerCharacter, peerCharacter, otherCharacters, type CharacterId,
} from '@core';

// Goal frame (front view)
const GL = 110, GR = 610, GT = 330, GB = 560;
const SPOT_X = 360, SPOT_Y = 1060;
const STAND_Y = 485;                 // keeper body centre when standing
const MATCHES = 3;
const BALL_R = 30;                   // ball radius on the spot
const KEEPER_S = 1.22;               // keeper scale (characters are 150 px tall at scale 1)
const KEEPER_OY = 100 / 176;         // keeper origin: the body centre on the 144x176 frame
const KICKER_S = 2.1;                // the kicker is close to the camera
const PAUSE_ZONE = (x: number, y: number) => !net.active && x > 590 && y < 140;

export const POSES = ['stand', 'walk1', 'walk2', 'kick', 'cheer1', 'cheer2', 'jump', 'hang', 'duck', 'fall', 'hit'] as const;

type Phase = 'aim' | 'strike' | 'flight' | 'runup' | 'defend' | 'wait' | 'pick' | 'netRun';
interface Shot { tx: number; ty: number; T: number; curve: number; t: number; byYou: boolean; x0: number; y0: number }

// ---------- online match (net.active) ----------
// Every kick both players choose at once: the shooter aims, the keeper picks one of six dive
// zones. Each side sends its pick; the kick plays out only when both picks are in, and both
// screens compute the same outcome from the same two picks.
const PICK_TIME = 10;                         // seconds to choose before an automatic pick
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

/** Where a touch anywhere on the screen sends the keeper: the goal itself maps 1:1, elsewhere the
 *  screen's width maps onto the goal's width at mid height. */
function touchToGoal(x: number, y: number): [number, number] {
  if (x > GL - 60 && x < GR + 60 && y > GT - 90 && y < GB + 60) {
    return [Phaser.Math.Clamp(x, GL + 10, GR - 10), Phaser.Math.Clamp(y, GT + 10, GB - 10)];
  }
  return [GL + 20 + (Phaser.Math.Clamp(x, 0, 720) / 720) * (GR - GL - 40), (GT + GB) / 2 + 20];
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** A vector football (the 18 px pixel ball would not match the characters). */
export function makeBall(scene: Phaser.Scene): void {
  if (scene.textures.exists('pk-ball')) return;
  const g = scene.make.graphics({}, false);
  const r = 34, c = 36;
  g.fillStyle(0x1c1c22).fillCircle(c, c, r + 2);
  g.fillStyle(0xf7f7f2).fillCircle(c, c, r);
  const pent = (x: number, y: number, s: number, rot: number) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 5; i++) { const a = rot + (i / 5) * Math.PI * 2; pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * s, y + Math.sin(a) * s)); }
    g.fillStyle(0x1c1c22).fillPoints(pts, true);
  };
  pent(c, c, 11, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2 + Math.PI / 5;
    g.lineStyle(2, 0x1c1c22, 1).lineBetween(c + Math.cos(a) * 10, c + Math.sin(a) * 10, c + Math.cos(a) * 24, c + Math.sin(a) * 24);
    pent(c + Math.cos(a) * 31, c + Math.sin(a) * 31, 8, a + Math.PI);
  }
  g.fillStyle(0xffffff, 0.35).fillCircle(c - 11, c - 12, 9);
  g.generateTexture('pk-ball', c * 2, c * 2);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private ball!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keeper!: Phaser.GameObjects.Image;
  private keeperShadow!: Phaser.GameObjects.Ellipse;
  private kicker!: Phaser.GameObjects.Image;
  private kickerShadow!: Phaser.GameObjects.Ellipse;
  private reticle!: Phaser.GameObjects.Graphics;
  private trail!: Phaser.GameObjects.Graphics;
  private netG!: Phaser.GameObjects.Graphics;
  private board!: Phaser.GameObjects.Graphics;
  private boardText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private curlText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private phase: Phase = 'wait';
  private shot: Shot | null = null;
  private kx = SPOT_X; private ky = STAND_Y;       // keeper body centre
  private gx = SPOT_X; private gy = STAND_Y;       // keeper goal point
  private kAngle = 0;
  private keeperSpeed = 0;
  private keeperMood: 'ready' | 'dive' | 'happy' | 'beaten' = 'ready';
  private kickerMood: 'idle' | 'happy' | 'sad' = 'idle';
  private diveSfx = false;
  private aiDelay = 0;
  private rx = SPOT_X; private ry = 450;           // aim reticle
  private kbCurve = 0;
  private swipe: { x: number; y: number; t: number; pts: Phaser.Math.Vector2[]; moved: number } | null = null;
  private keepTouch: { x: number; y: number; bx: number; by: number; inGoal: boolean } | null = null;
  private you: boolean[] = [];
  private them: boolean[] = [];
  private match = 1;
  private netShake = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchUi = false;
  // characters: texture prefixes and ids of whoever kicks and keeps right now
  private rivalPrefix = 'op';
  private rivalId: CharacterId = 'adventurer';
  private kickerPrefix = 'me';
  private keeperPrefix = 'op';
  private kickerId: CharacterId = 'adventurer';
  private epoch = 0;
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
    this.epoch++;
    this.phase = 'wait'; this.shot = null; this.kx = SPOT_X; this.ky = STAND_Y; this.gx = SPOT_X; this.gy = STAND_Y; this.kAngle = 0;
    this.keeperSpeed = 0; this.keeperMood = 'ready'; this.kickerMood = 'idle'; this.diveSfx = false;
    this.aiDelay = 0; this.rx = SPOT_X; this.ry = 450; this.kbCurve = 0; this.swipe = null; this.keepTouch = null;
    this.you = []; this.them = []; this.match = 1; this.netShake = 0;
    this.online = net.active;
    this.kick = 0; this.myPick = null; this.peerPicks = new Map(); this.zone = 1; this.pickLeft = 0; this.outcome = 'goal';
    this.rivalPrefix = 'op'; this.rivalId = peerCharacter(); this.kickerPrefix = 'me'; this.keeperPrefix = 'op'; this.kickerId = playerCharacter();
    this.useHud = !this.online;
    this.touchUi = this.sys.game.device.input.touch;
    makeBall(this);

    this.drawPitch();
    this.netG = this.add.graphics().setDepth(1);
    this.keeperShadow = this.add.ellipse(SPOT_X, GB + 18, 110, 22, 0x000000, 0.3).setDepth(2);
    this.keeper = this.add.image(SPOT_X, STAND_Y, 'op-cheer2').setOrigin(0.5, KEEPER_OY).setScale(KEEPER_S).setDepth(3);
    this.kickerShadow = this.add.ellipse(0, 0, 170, 34, 0x000000, 0.3).setDepth(4).setVisible(false);
    this.kicker = this.add.image(0, 0, 'me-stand').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(KICKER_S).setDepth(6).setVisible(false);
    this.shadow = this.add.ellipse(SPOT_X, SPOT_Y + BALL_R - 2, BALL_R * 2.2, 16, 0x000000, 0.35).setDepth(4);
    this.ball = this.add.image(SPOT_X, SPOT_Y, 'pk-ball').setDepth(7);
    this.ballScale(1);
    this.trail = this.add.graphics().setDepth(5);
    this.reticle = this.add.graphics().setDepth(8);
    this.board = this.add.graphics().setDepth(8);
    this.boardText = txt(this, 360, 140, '', { title: true, size: 22 }).setDepth(9);
    this.banner = txt(this, 360, 760, '', { title: true, size: 36, color: '#ffd23f', wrap: 660 }).setDepth(20);
    this.curlText = txt(this, 560, 1150, '', { size: 30, color: '#3ee6ff' }).setDepth(9);
    this.hintText = txt(this, 360, 1248, '', { size: 24, color: '#ffffff', wrap: 680 }).setDepth(9);
    this.zonesG = this.add.graphics().setDepth(7);
    this.clockText = txt(this, 620, 1080, '', { title: true, size: 40, color: '#ffd23f' }).setDepth(9);

    this.setupInput();
    this.hud.setRight(`${this.match}/${MATCHES}`);
    if (this.online) this.startOnline();
    else this.startMatch();
  }

  // ---------- input ----------
  private setupInput(): void {
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

    // Touch and mouse work on the whole screen. Shooter: swipe from anywhere towards the goal
    // (direction = side, length = height, a bent path = curl) or tap the goal. Keeper: tap or
    // swipe anywhere; the goal maps 1:1, elsewhere the screen's width maps onto the goal.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (PAUSE_ZONE(p.x, p.y)) return;
      if (this.phase === 'aim') {
        this.swipe = { x: p.x, y: p.y, t: this.time.now, pts: [new Phaser.Math.Vector2(p.x, p.y)], moved: 0 };
      } else if (this.phase === 'defend' || this.phase === 'runup' || this.phase === 'pick') {
        const [bx, by] = touchToGoal(p.x, p.y);
        const inGoal = p.x > GL - 60 && p.x < GR + 60 && p.y > GT - 90 && p.y < GB + 60;
        this.keepTouch = { x: p.x, y: p.y, bx, by, inGoal };
        this.keeperAim(bx, by);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (this.swipe && this.phase === 'aim') {
        this.swipe.pts.push(new Phaser.Math.Vector2(p.x, p.y));
        this.swipe.moved = Math.max(this.swipe.moved, Math.hypot(p.x - this.swipe.x, p.y - this.swipe.y));
        const a = this.swipeAim(this.swipe, p.x, p.y);
        if (a) { this.rx = a.tx; this.ry = a.ty; }
      } else if (this.keepTouch) {
        const k = this.keepTouch;
        if (k.inGoal) this.keeperAim(...touchToGoal(p.x, p.y));
        else if (Math.hypot(p.x - k.x, p.y - k.y) > 20) {
          // a swipe: sideways moves the dive, upwards raises it
          this.keeperAim(Phaser.Math.Clamp(k.bx + (p.x - k.x) * 1.3, GL + 10, GR - 10), Phaser.Math.Clamp(k.by + (p.y - k.y) * 0.9, GT + 10, GB - 10));
        }
      }
    });
    const up = (p: Phaser.Input.Pointer) => {
      const k = this.keepTouch;
      this.keepTouch = null;
      if (k && this.phase === 'pick') { this.commitZone(this.zone); return; }
      const sw = this.swipe;
      this.swipe = null;
      if (!sw || this.phase !== 'aim') return;
      // Bug fix: the aim is read from the swipe itself (the old code cleared the swipe and then
      // asked for an aim that needed it, so a swipe never shot on any device).
      const a = this.swipeAim(sw, p.x, p.y);
      if (a && sw.moved >= 30) {
        const dur = Math.max(60, this.time.now - sw.t);
        const len = Math.hypot(p.x - sw.x, p.y - sw.y);
        const speed = Phaser.Math.Clamp((len / dur - 0.3) / 2.2, 0.15, 1);
        // curl = signed max deviation of the swipe path from its chord
        const cx = p.x - sw.x, cy = p.y - sw.y;
        let dev = 0;
        for (const q of sw.pts) {
          const d = ((q.x - sw.x) * cy - (q.y - sw.y) * cx) / len;
          if (Math.abs(d) > Math.abs(dev)) dev = d;
        }
        this.shoot(a.tx, a.ty, speed, Phaser.Math.Clamp(dev / 50, -1, 1), 12 + speed * 30);
      } else if (sw.moved < 30 && p.y < GB + 60 && p.y > GT - 140 && p.x > GL - 120 && p.x < GR + 120) {
        // a tap on (or near) the goal shoots right there
        this.rx = p.x; this.ry = p.y;
        this.shoot(p.x, p.y, 0.55, 0, 20);
      } else if (sw.moved < 30) {
        this.hintText.setScale(1.15);
        this.tweens.add({ targets: this.hintText, scale: 1, duration: 250 });
      }
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  /** Swipe vector -> target in the goal plane: direction picks the side, length the height. */
  private swipeAim(sw: { x: number; y: number }, x: number, y: number): { tx: number; ty: number } | null {
    const dx = x - sw.x, dy = y - sw.y;
    if (dy > -25) return null;
    const h = (-dy - 25) / 330;
    const side = dx / Math.max(80, -dy);
    return { tx: SPOT_X + side * 360, ty: GB - 18 - h * (GB - GT - 18) };
  }

  private keeperAim(x: number, y: number): void {
    if (this.phase === 'pick') {
      const z = this.zoneAt(x, y);
      if (z !== this.zone) { this.zone = z; this.sfx('curl', { volume: 0.25 }); }
    } else this.setDive(x, y);
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
    g.fillStyle(0xffffff, 0.9).fillEllipse(SPOT_X, SPOT_Y + BALL_R, 34, 10);
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

  // ---------- characters ----------
  /** Kicker feet position so that the tip of its kick foot meets the ball on the spot. */
  private strikePos(): [number, number] {
    const [fx, fy] = characterRig(this.kickerId).kickFoot;
    const footX = SPOT_X - BALL_R * 0.78, footY = SPOT_Y + BALL_R * 0.4;
    return [footX - (fx - CHARACTER_FRAME.width / 2) * KICKER_S, footY - (fy - CHARACTER_FRAME.originY * CHARACTER_FRAME.height) * KICKER_S];
  }

  /** Who kicks and who keeps: you and the rival in solo, the shooter's character online. */
  private cast(youShoot: boolean): void {
    const me = playerCharacter();
    const other = this.online ? peerCharacter() : this.rivalId;
    const otherPrefix = this.online ? 'op' : this.rivalPrefix;
    this.kickerPrefix = youShoot ? 'me' : otherPrefix;
    this.keeperPrefix = youShoot ? otherPrefix : 'me';
    this.kickerId = youShoot ? me : other;
  }

  /** Solo: a new rival character for every match of the cup (loaded on demand). */
  private ensureRival(then: () => void): void {
    const pool = otherCharacters(playerCharacter());
    const id = this.match === 1 ? peerCharacter() : pool[(this.match - 1) % pool.length];
    if (this.match === 1 || id === peerCharacter()) { this.rivalId = id; this.rivalPrefix = 'op'; then(); return; }
    const prefix = `r-${id}`;
    const epoch = this.epoch;
    const use = () => {
      if (epoch !== this.epoch || this.isOver) return;
      const ok = this.textures.exists(`${prefix}-kick`);
      this.rivalId = ok ? id : peerCharacter();
      this.rivalPrefix = ok ? prefix : 'op';
      then();
    };
    if (this.textures.exists(`${prefix}-kick`)) { use(); return; }
    loadCharacter(this.load, { id, prefix, poses: POSES });
    this.load.once(Phaser.Loader.Events.COMPLETE, use);
    this.load.start();
  }

  /** The kicker waits a few steps behind the ball. */
  private kickerReady(): void {
    const [sx, sy] = this.strikePos();
    this.tweens.killTweensOf(this.kicker);
    this.kickerMood = 'idle';
    this.kicker.setTexture(`${this.kickerPrefix}-stand`).setVisible(true).setAlpha(1).setFlipX(false).setScale(KICKER_S * 1.04)
      .setPosition(sx - 70, sy + 22);
  }

  /** Run-up with the character's walk poses, then the kick pose with the foot on the ball. */
  private runUp(fromX: number, fromY: number, ms: number, then: () => void): void {
    const [sx, sy] = this.strikePos();
    this.tweens.killTweensOf(this.kicker);
    this.kickerMood = 'idle';
    this.kicker.setTexture(`${this.kickerPrefix}-walk1`).setVisible(true).setAlpha(1).setFlipX(false).setPosition(fromX, fromY).setScale(KICKER_S * (1 + (fromY - sy) / 900));
    const step = Math.max(90, Math.min(150, ms / 6));
    let last = -1;
    this.tweens.add({
      targets: this.kicker, x: sx, y: sy, scale: KICKER_S, duration: ms, ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const n = Math.floor((tw.elapsed ?? 0) / step);
        if (n !== last) {
          last = n;
          this.kicker.setTexture(`${this.kickerPrefix}-${n % 2 ? 'walk2' : 'walk1'}`);
          this.sfx('step', { volume: 0.25 });
        }
      },
      onComplete: () => {
        if (this.isOver) return;
        this.kicker.setTexture(`${this.kickerPrefix}-kick`);
        then();
        this.time.delayedCall(320, () => { if (this.kickerMood === 'idle') this.kicker.setTexture(`${this.kickerPrefix}-stand`); });
      },
    });
  }

  private ballScale(k: number): void {
    this.ball.setScale((BALL_R * 2 / 72) * k);
  }

  // ---------- flow ----------
  private startMatch(): void {
    this.you = []; this.them = [];
    this.hud.setRight(`${this.match}/${MATCHES}`);
    this.drawBoard();
    this.showBanner(t('m' + this.match), '#ffd23f');
    this.sfx('whistle', { volume: 0.5 });
    const epoch = this.epoch;
    this.ensureRival(() => this.time.delayedCall(1100, () => { if (epoch === this.epoch) this.startShooting(); }));
  }

  private keeperDifficulty() {
    const m = this.match - 1;
    return { react: Math.max(0.1, 0.32 - m * 0.08), noise: Math.max(35, 120 - m * 35), speed: 1000 + m * 260, wrong: Math.max(0.08, 0.28 - m * 0.08) };
  }

  private resetBall(): void {
    this.tweens.killTweensOf(this.ball);
    this.ball.setPosition(SPOT_X, SPOT_Y).setAngle(0).setAlpha(1).setDepth(7);
    this.ballScale(1);
    this.shadow.setPosition(SPOT_X, SPOT_Y + BALL_R - 2).setScale(1).setVisible(true);
    this.kx = this.gx = SPOT_X; this.ky = this.gy = STAND_Y; this.kAngle = 0;
    this.keeperMood = 'ready'; this.diveSfx = false;
    this.tweens.killTweensOf(this.keeper);
    this.keeper.setAlpha(1);
    this.trail.clear();
  }

  private startShooting(): void {
    if (this.isOver) return;
    this.cast(true);
    this.resetBall();
    this.kickerReady();
    this.phase = 'aim';
    this.rx = SPOT_X; this.ry = 450;
    this.showBanner(t('shoot'), '#f3f2f2');
    this.setHint();
  }

  private startDefending(): void {
    if (this.isOver) return;
    this.cast(false);
    this.resetBall();
    this.phase = 'runup';
    this.showBanner(t('keep'), '#3ee6ff');
    this.setHint();
    const [sx, sy] = this.strikePos();
    this.runUp(sx - 330, sy + 150, 900 + rng.int(0, 500), () => this.aiShoot());
  }

  private setHint(): void {
    const shooting = this.phase === 'aim';
    const keeping = this.phase === 'runup' || this.phase === 'pick';
    if (!shooting && !keeping) { this.hintText.setText(''); return; }
    const key = shooting ? (this.touchUi ? 'hintShoot' : 'hintShootKeys') : (this.touchUi ? 'hintKeep' : 'hintKeepKeys');
    this.hintText.setText(t(key));
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
    this.launch(tx, ty, T, rng.int(-10, 10) / 10 * (0.3 + m * 0.25), false);
    this.phase = 'defend';
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
    const fx = tx + Math.cos(a) * r, fy = ty + Math.sin(a) * r;
    this.phase = 'strike';
    this.hintText.setText('');
    this.curlText.setText('');
    this.banner.setText('');
    const [sx] = this.strikePos();
    this.runUp(this.kicker.x, this.kicker.y, 260 + Math.abs(sx - this.kicker.x) * 0.4, () => {
      this.launch(fx, fy, T, curve, true);
      this.phase = 'flight';
      // keeper AI
      const d = this.keeperDifficulty();
      this.aiDelay = d.react + (1 - speed) * 0.05;
      this.keeperSpeed = d.speed;
      let guessX = fx + Phaser.Math.FloatBetween(-1, 1) * (d.noise + Math.abs(curve) * 60);
      const guessY = fy + Phaser.Math.FloatBetween(-1, 1) * d.noise * 0.6;
      if (rng.chance(d.wrong)) guessX = SPOT_X * 2 - guessX;
      this.setDive(guessX, guessY, true);
    });
  }

  /** The ball leaves the kicker's foot (it rests against the foot tip on the spot). */
  private launch(tx: number, ty: number, T: number, curve: number, byYou: boolean): void {
    this.shot = { tx, ty, T, curve, t: 0, byYou, x0: this.ball.x, y0: this.ball.y };
    this.sfx('kick', { volume: 0.8 });
    const [fx, fy] = characterRig(this.kickerId).kickFoot;
    const footX = this.kicker.x + (fx - CHARACTER_FRAME.width / 2) * KICKER_S;
    const footY = this.kicker.y + (fy - CHARACTER_FRAME.originY * CHARACTER_FRAME.height) * KICKER_S;
    burst(this, footX, footY, [0x37a243, 0xffffff], 12, 180);
    shake(this, 0.004, 80);
    this.banner.setText('');
    this.curlText.setText('');
    this.hintText.setText('');
  }

  /** Point the keeper's hands at (x, y). */
  private setDive(x: number, y: number, ai = false): void {
    if (!ai) this.keeperSpeed = 1300;
    const [dx, dy] = diveTarget(x, y);
    this.gx = dx; this.gy = dy;
  }

  private keeperSegment(): [number, number, number, number] {
    const th = Phaser.Math.DegToRad(this.kAngle);
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

  /** Ball out of play after the kick: the outcome animation (the same for solo and online). */
  private playOutcome(o: Outcome, s: Shot): void {
    if (o === 'post') {
      this.sfx('post', { volume: 0.7, x: s.tx }); shake(this, 0.01, 150);
      this.showBanner(t('post'), '#f3f2f2');
      burst(this, s.tx, s.ty, [0xffffff, 0xdddddd], 14, 220);
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < SPOT_X ? -200 : 200), y: s.ty + 300, scale: this.ball.scale * 1.6, angle: this.ball.angle - 300, duration: 600 });
    } else if (o === 'wide' || o === 'over') {
      this.showBanner(t(o), '#f3f2f2');
      this.sfx('wide', { volume: 0.5, x: s.tx });
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx - SPOT_X) * 0.3, y: s.ty - 80, scale: this.ball.scale * 0.6, alpha: 0, duration: 500 });
    } else if (o === 'save') {
      this.sfx('save', { volume: 0.8, x: s.tx }); shake(this, 0.008, 120);
      burst(this, s.tx, s.ty, [0xffffff, 0xffe14d], 18, 260);
      this.tweens.add({ targets: this.ball, x: s.tx + (s.tx < this.kx ? -160 : 160), y: s.ty + rng.int(150, 300), scale: this.ball.scale * 1.8, angle: 400, duration: 600, ease: 'Quad.easeOut' });
    } else {
      this.netShake = 6;
      this.sfx('net', { volume: 0.7, x: s.tx });
      this.tweens.add({ targets: this.ball, y: s.ty + 14, scale: this.ball.scale * 0.9, duration: 160, ease: 'Quad.easeOut' });
      this.ball.setDepth(2);
    }
    // the characters react with their own poses
    const goal = o === 'goal';
    this.keeperMood = goal ? 'beaten' : o === 'save' ? 'happy' : 'ready';
    if (goal) this.tweens.add({ targets: this, ky: Math.min(STAND_Y + 30, this.ky + 40), duration: 300, ease: 'Quad.easeIn' });
    this.kickerMood = goal ? 'happy' : 'sad';
    if (!goal) this.kicker.setTexture(`${this.kickerPrefix}-hit`);
  }

  private resolve(): void {
    const s = this.shot!;
    this.shot = null;
    this.phase = 'wait';
    const onPost = (Math.abs(s.tx - GL + 6) < 16 || Math.abs(s.tx - GR - 6) < 16) && s.ty > GT - 12 && s.ty < GB || (Math.abs(s.ty - GT + 6) < 14 && s.tx > GL && s.tx < GR);
    const inside = s.tx > GL && s.tx < GR && s.ty > GT && s.ty < GB;
    const o: Outcome = onPost ? 'post' : !inside ? (s.ty < GT ? 'over' : 'wide') : this.saves(s.tx, s.ty) ? 'save' : 'goal';
    this.playOutcome(o, s);
    const goal = o === 'goal';
    if (s.byYou) {
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
      if (goal) { this.showBanner(t('goal'), '#ec3013'); this.sfx('boo', { volume: 0.4 }); }
      else if (o === 'save') {
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
      this.time.delayedCall(1800, () => { if (!this.isOver) { this.match++; this.startMatch(); } });
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
    } else if (this.phase === 'pick' || this.phase === 'netRun' || (this.phase === 'wait' && this.shot === null && this.keeperMood === 'ready' && this.online)) {
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
    else if (this.keeperMood !== 'beaten') {
      const dx = this.gx - this.kx, dy = this.gy - this.ky, d = Math.hypot(dx, dy), step = this.keeperSpeed * dt;
      if (d > 0.5) { const f = Math.min(1, step / d); this.kx += dx * f; this.ky += dy * f; }
    }
    this.kAngle = Phaser.Math.Clamp((this.kx - SPOT_X) / 200, -1, 1) * 80;
    this.renderKeeper();
    this.renderKicker();

    // ball flight: from the foot to the goal, curling, shrinking with distance
    this.trail.clear();
    if (this.shot && (this.phase === 'flight' || this.phase === 'defend')) {
      const s = this.shot;
      s.t += dt;
      const p = Math.min(1, s.t / s.T);
      const bx = Phaser.Math.Linear(s.x0, s.tx, p) + s.curve * Math.sin(Math.PI * p) * 120;
      const by = Phaser.Math.Linear(s.y0, s.ty, p) - Math.sin(Math.PI * p) * 50;
      for (let i = 1; i <= 3; i++) this.trail.fillStyle(0xffffff, 0.12 * (4 - i)).fillCircle(this.ball.x + (this.ball.x - bx) * i * 0.5, this.ball.y + (this.ball.y - by) * i * 0.5, BALL_R * Phaser.Math.Linear(0.9, 0.35, p) * (1 - i * 0.15));
      this.ball.setPosition(bx, by).setAngle(this.ball.angle + 900 * dt * (s.curve >= 0 ? 1 : -1));
      this.ballScale(Phaser.Math.Linear(1, 0.42, p));
      const groundY = Phaser.Math.Linear(SPOT_Y + BALL_R - 2, GB + 6, p);
      this.shadow.setPosition(Phaser.Math.Linear(s.x0, s.tx, p), groundY).setScale(Phaser.Math.Linear(1, 0.4, p)).setAlpha(Phaser.Math.Linear(1, 0.5, p));
      if (p >= 1) { this.shadow.setVisible(false); if (this.online) this.resolveOnline(); else this.resolve(); }
    }

    this.netShake = Math.max(0, this.netShake - dt * 8);
    this.drawNet();
    this.drawReticle();
    if (this.online) this.updateOnline(dt);
  }

  /** The keeper is the character in its own poses: ready stance, dives (mirrored to the left), reactions. */
  private renderKeeper(): void {
    const lean = this.kAngle / 80;
    const moving = Math.hypot(this.gx - this.kx, this.gy - this.ky) > 4 || Math.abs(lean) > 0.22 || this.ky < STAND_Y - 25;
    let pose: string, angle = this.kAngle, flip = false;
    if (this.keeperMood === 'beaten') {
      pose = 'fall'; flip = lean < 0; angle = this.kAngle * 0.9;
    } else if (this.keeperMood === 'happy' && Math.abs(lean) < 0.3) {
      pose = Math.floor(this.time.now / 200) % 2 ? 'cheer1' : 'cheer2'; angle = 0;
    } else if (Math.abs(lean) >= 0.22) {
      // a dive: high dives reach with the raised arm (hang), low ones with jump
      pose = this.ky < STAND_Y - 40 || this.gy < STAND_Y - 40 ? 'hang' : 'jump';
      flip = lean < 0;
    } else if (moving && this.gy < STAND_Y - 30) {
      pose = 'cheer1'; angle = 0;                  // straight up, both arms
    } else if (moving && this.phase === 'flight' || this.phase === 'defend' && this.gy >= STAND_Y - 10 && Math.abs(this.gx - SPOT_X) < 40 && this.keeperSpeed > 1000) {
      pose = 'duck'; angle = 0;
    } else {
      pose = 'cheer2'; angle = 0;                  // ready stance: knees bent, gloves up
    }
    const bob = pose === 'cheer2' ? Math.sin(this.elapsed * 7) * 3 : 0;
    this.keeper.setTexture(`${this.keeperPrefix}-${pose}`).setFlipX(flip).setAngle(angle).setPosition(this.kx, this.ky + bob);
    const lift = Math.max(0, STAND_Y - this.ky);
    this.keeperShadow.setPosition(this.kx, GB + 18).setScale(Math.max(0.45, 1 - lift / 160) * (1 + Math.abs(lean) * 0.6), 1).setAlpha(0.3 * Math.max(0.4, 1 - lift / 120));
    if (!this.diveSfx && Math.abs(lean) > 0.35 && this.keeperMood === 'ready') { this.diveSfx = true; this.sfx('dive', { volume: 0.4 }); }
  }

  private renderKicker(): void {
    const k = this.kicker;
    this.kickerShadow.setVisible(k.visible).setPosition(k.x + 4, k.y - 4).setScale(k.scale / KICKER_S).setAlpha(0.3 * k.alpha);
    if (!k.visible) return;
    if (this.kickerMood === 'happy') k.setTexture(`${this.kickerPrefix}-${Math.floor(this.time.now / 220) % 2 ? 'cheer1' : 'cheer2'}`);
  }

  // ---------- online match ----------
  /** Seat that shoots kick k: the round's starter takes the even kicks, sudden death included. */
  private shooterSeat(k = this.kick): 0 | 1 {
    return k % 2 === 0 ? net.starter : net.starter === 0 ? 1 : 0;
  }

  private iShoot(): boolean {
    return this.shooterSeat() === net.seat;
  }

  private startOnline(): void {
    this.cast(this.iShoot());                    // the right keeper is in goal from the first frame
    this.drawBoard();
    this.showBanner(t('vs', { name: net.peerName || t('opponent') }), '#ffd23f');
    this.sfx('whistle', { volume: 0.5 });
    this.time.delayedCall(1300, () => this.startKick());
  }

  private startKick(): void {
    if (this.isOver) return;
    this.cast(this.iShoot());
    this.resetBall();
    this.myPick = null;
    this.pickLeft = PICK_TIME;
    this.drawBoard();
    this.kickerReady();
    if (this.iShoot()) {
      this.phase = 'aim';
      this.rx = SPOT_X; this.ry = 450;
      this.showBanner(t('shoot'), '#f3f2f2');
    } else {
      this.phase = 'pick';
      this.zone = 1;
      this.showBanner(t('pickDive'), '#3ee6ff');
    }
    this.setHint();
    if (this.kick === 10) popup(this, 360, 880, t('sudden'), '#ff4fa3', 34);
  }

  private zoneAt(x: number, y: number): number {
    const [gx, gy] = touchToGoal(x, y);
    const col = Phaser.Math.Clamp(Math.floor((gx - GL) / ((GR - GL) / 3)), 0, 2);
    return col + (gy < (GT + GB) / 2 ? 0 : 3);
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
    this.keepTouch = null;
    this.clockText.setText('');
    this.curlText.setText('');
    this.hintText.setText('');
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
    this.runUp(this.kicker.x, this.kicker.y, 520, () => {
      if (this.isOver) return;
      this.launch(tx, ty, T, c, this.iShoot());
      this.phase = 'flight';
      this.gx = kx; this.gy = ky;            // the keeper dives into the chosen zone
      this.keeperSpeed = 1300; this.aiDelay = 0.08;
    });
  }

  /** Ball arrived: show the outcome computed in tryResolve (the same on both screens). */
  private resolveOnline(): void {
    const s = this.shot!;
    this.shot = null;
    this.phase = 'wait';
    this.kx = this.gx; this.ky = this.gy;      // keeper is exactly at the dive target on both screens
    this.kAngle = Phaser.Math.Clamp((this.kx - SPOT_X) / 200, -1, 1) * 80;
    const mine = this.iShoot();
    const o = this.outcome;
    const goal = o === 'goal';
    this.playOutcome(o, s);
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
      } else {
        this.sfx('lose', { volume: 0.6 });
        shake(this, 0.015, 300);
      }
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
      if (now !== before) this.clockText.setText(`${Math.max(0, now)}`).setColor(now <= 3 ? '#ec3013' : '#ffd23f');
      if (now !== before && now <= 3 && now > 0) this.sfx('clock', { volume: 0.4 });
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
    const live = !!this.swipe && this.swipe.moved > 20;
    g.lineStyle(4, live ? 0x5dff7a : 0xffd23f, 0.9).strokeCircle(this.rx, this.ry, 22 * pulse);
    g.lineBetween(this.rx - 34, this.ry, this.rx - 12, this.ry).lineBetween(this.rx + 12, this.ry, this.rx + 34, this.ry);
    g.lineBetween(this.rx, this.ry - 34, this.rx, this.ry - 12).lineBetween(this.rx, this.ry + 12, this.rx, this.ry + 34);
    // dotted guide from the ball (with the curl of the swipe so far)
    let c = this.kbCurve && !this.swipe ? this.kbCurve : 0;
    if (this.swipe && this.swipe.pts.length > 2) {
      const sw = this.swipe, last = sw.pts[sw.pts.length - 1];
      const cx = last.x - sw.x, cy = last.y - sw.y, len = Math.hypot(cx, cy) || 1;
      let dev = 0;
      for (const q of sw.pts) { const d = ((q.x - sw.x) * cy - (q.y - sw.y) * cx) / len; if (Math.abs(d) > Math.abs(dev)) dev = d; }
      c = Phaser.Math.Clamp(dev / 50, -1, 1);
    }
    for (let i = 1; i < 10; i++) {
      const p = i / 10;
      g.fillStyle(0xffffff, 0.35).fillCircle(Phaser.Math.Linear(SPOT_X, this.rx, p) + c * Math.sin(Math.PI * p) * 120, Phaser.Math.Linear(SPOT_Y - 40, this.ry, p) - Math.sin(Math.PI * p) * 50, 5);
    }
  }
}
