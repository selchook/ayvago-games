import Phaser from 'phaser';
import {
  ArcadeScene, burst, shake, flash, popup, t, txt, rng, net, CHARACTER_FRAME, loadCharacter,
  playerCharacter, peerCharacter, otherCharacters, type CharacterId,
} from '@core';

// Goal frame (front view)
const GL = 110, GR = 610, GT = 330, GB = 560;
// Back of the goal (further from the camera: higher and narrower)
const BL = GL + 30, BR = GR - 30, BT = GT + 22, BB = GB - 36;
const SPOT_X = 360, SPOT_Y = 1060;
const STAND_Y = 485;                 // keeper body centre when standing
const MATCHES = 3;
const BALL_R = 30;                   // ball radius on the spot
const KEEPER_S = 1.22;               // keeper scale (characters are 150 px tall at scale 1)
const KEEPER_OY = 100 / 176;         // keeper origin: the body centre on the 144x176 frame
const KICKER_S = 1.9;                // the kicker is close to the camera, seen from behind
// Where the kicker's feet stand when the kicking foot meets the ball (behind and left of it)
const STRIKE_X = SPOT_X - 78, STRIKE_Y = SPOT_Y + 46;
const PAUSE_ZONE = (x: number, y: number) => !net.active && x > 590 && y < 140;

export const POSES = ['back', 'walkup1', 'walkup2', 'backkick1', 'backkick2', 'backkick3', 'cheer1', 'cheer2', 'jump', 'hang', 'duck', 'fall'] as const;

// The camera stands behind the penalty taker: the kicker is drawn in the character's poses seen
// from behind (`back`, the `walkup` steps and the `backkick` wind-up, strike and follow-through).
const KICK_POSES = { bk0: 'back', bkW1: 'walkup1', bkW2: 'walkup2', bkWind: 'backkick1', bkStrike: 'backkick2', bkFollow: 'backkick3' } as const;

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

const SHIRTS = ['#ec3013', '#f3f2f2', '#2d6cdf', '#ffd23f', '#1f9d55', '#ff4fa3', '#3a3f5a', '#f39c12', '#e8e8e8'];
const SKINS = ['#f5d0a9', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

/** The stadium in perspective: night sky, floodlights, crowd tiers, ad boards, striped grass, lines. */
function paintStadium(c: CanvasRenderingContext2D): void {
  const R = rng.seeded(7);
  const pick = <T,>(a: T[]): T => a[Math.floor(R() * a.length)];
  // sky
  let g = c.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, '#060a16'); g.addColorStop(1, '#17233f');
  c.fillStyle = g; c.fillRect(0, 0, 720, 340);
  // stands: rows of spectators, darker towards the back
  for (let row = 0, y = 116; y < 292; y += 12, row++) {
    c.fillStyle = row % 4 === 3 ? '#0c1122' : '#141a30';
    c.fillRect(0, y - 6, 720, 12);
    for (let x = (row % 2) * 7 + 3; x < 724; x += 14) {
      if (R() < 0.06) continue;                       // an empty seat
      c.fillStyle = pick(SHIRTS);
      c.beginPath(); c.roundRect(x - 5, y, 10, 7, 3); c.fill();
      c.fillStyle = pick(SKINS);
      c.beginPath(); c.arc(x, y - 2, 4, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = `rgba(6,10,22,${0.62 * (1 - (y - 116) / 176)})`;
    c.fillRect(0, y - 7, 720, 14);
  }
  // floodlights and their glow
  for (const lx of [36, 684]) {
    const r = c.createRadialGradient(lx, 110, 0, lx, 110, 260);
    r.addColorStop(0, 'rgba(255,250,215,0.5)'); r.addColorStop(0.18, 'rgba(255,250,215,0.16)'); r.addColorStop(1, 'rgba(255,250,215,0)');
    c.fillStyle = r; c.fillRect(0, 0, 720, 420);
    c.fillStyle = '#273150';
    c.beginPath(); c.roundRect(lx - 26, 92, 52, 38, 6); c.fill();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = '#fffbe2'; c.beginPath(); c.arc(lx - 16 + i * 16, 103 + j * 16, 5.5, 0, Math.PI * 2); c.fill();
    }
  }
  // ad boards
  c.fillStyle = '#0b0e1a'; c.fillRect(0, 294, 720, 40);
  const boards = ['#ec3013', '#2d6cdf', '#1f9d55', '#ec3013', '#2d6cdf', '#1f9d55'];
  boards.forEach((col, i) => {
    const x = i * 120 + 4;
    const b = c.createLinearGradient(0, 300, 0, 327);
    b.addColorStop(0, col); b.addColorStop(1, '#000000');
    c.globalAlpha = 0.9; c.fillStyle = b; c.beginPath(); c.roundRect(x, 299, 112, 28, 5); c.fill(); c.globalAlpha = 1;
  });
  // grass: perspective stripes, darker far away
  g = c.createLinearGradient(0, 334, 0, 1280);
  g.addColorStop(0, '#24803a'); g.addColorStop(1, '#3fb24f');
  c.fillStyle = g; c.fillRect(0, 334, 720, 946);
  let y = 334, h = 18, i = 0;
  while (y < 1280) { if (i++ % 2) { c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(0, y, 720, h); } y += h; h *= 1.16; }
  // goal shadow on the grass
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(SPOT_X, GB + 8, 290, 16, 0, 0, Math.PI * 2); c.fill();
  // lines: goal line, goal area, penalty spot, edge of the box behind the kicker
  c.strokeStyle = 'rgba(255,255,255,0.88)'; c.lineCap = 'round';
  c.lineWidth = 4; c.beginPath(); c.moveTo(0, GB); c.lineTo(720, GB); c.stroke();
  c.lineWidth = 5; c.beginPath(); c.moveTo(66, GB); c.lineTo(36, 650); c.lineTo(684, 650); c.lineTo(654, GB); c.stroke();
  c.lineWidth = 8; c.beginPath(); c.moveTo(0, 1236); c.lineTo(720, 1236); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath(); c.ellipse(SPOT_X, SPOT_Y + BALL_R, 20, 7, 0, 0, Math.PI * 2); c.fill();
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
    this.rivalPrefix = 'op'; this.rivalId = peerCharacter(); this.kickerPrefix = 'me'; this.keeperPrefix = 'op';
    this.useHud = !this.online;
    this.touchUi = this.sys.game.device.input.touch;
    makeBall(this);

    this.drawPitch();
    this.netG = this.add.graphics().setDepth(1);
    this.keeperShadow = this.add.ellipse(SPOT_X, GB + 18, 110, 22, 0x000000, 0.3).setDepth(2);
    this.keeper = this.add.image(SPOT_X, STAND_Y, 'op-cheer2').setOrigin(0.5, KEEPER_OY).setScale(KEEPER_S).setDepth(3);
    this.kickerShadow = this.add.ellipse(0, 0, 170, 34, 0x000000, 0.3).setDepth(4).setVisible(false);
    this.kicker = this.add.image(0, 0, 'me-back').setOrigin(0.5, CHARACTER_FRAME.originY).setScale(KICKER_S).setDepth(7.5).setVisible(false);
    this.shadow = this.add.ellipse(SPOT_X, SPOT_Y + BALL_R - 2, BALL_R * 2.2, 16, 0x000000, 0.35).setDepth(4);
    this.ball = this.add.image(SPOT_X, SPOT_Y, 'pk-ball').setDepth(7);
    this.ballScale(1);
    this.trail = this.add.graphics().setDepth(5);
    this.reticle = this.add.graphics().setDepth(8);
    this.board = this.add.graphics().setDepth(8);
    this.boardText = txt(this, 360, 140, '', { title: true, size: 22 }).setDepth(9);
    this.banner = txt(this, 360, 760, '', { title: true, size: 36, color: '#ffd23f', wrap: 660 }).setDepth(20);
    this.curlText = txt(this, 560, 1150, '', { size: 30, color: '#3ee6ff' }).setDepth(9);
    this.hintText = txt(this, 360, 1226, '', { size: 22, color: '#ffffff', wrap: 660 }).setDepth(9);
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
  /** Stadium, crowd, ad boards and the pitch, painted once into a canvas texture. */
  private drawPitch(): void {
    const KEY = 'pk-stadium';
    if (!this.textures.exists(KEY)) {
      const tex = this.textures.createCanvas(KEY, 720, 1280);
      if (tex) { paintStadium(tex.getContext()); tex.refresh(); }
    }
    this.add.image(0, 0, KEY).setOrigin(0).setDepth(0);
    // ad boards: the text sits on the painted boards
    for (let i = 0; i < 6; i++) {
      txt(this, 60 + i * 120, 313, 'AYVAGO', { title: true, size: 17, color: '#ffffff' })
        .setDepth(0.2).setAlpha(0.92);
    }
    this.crowdG = this.add.graphics().setDepth(0.3);
    if (!this.textures.exists('pk-vignette')) {
      const v = this.textures.createCanvas('pk-vignette', 360, 640);
      if (v) {
        const c = v.getContext();
        const g = c.createRadialGradient(180, 360, 120, 180, 360, 470);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.42)');
        c.fillStyle = g; c.fillRect(0, 0, 360, 640);
        v.refresh();
      }
    }
    this.add.image(0, 0, 'pk-vignette').setOrigin(0).setScale(2).setDepth(7.9);
  }

  /** Camera flashes twinkling in the crowd; a goal sets off a storm of them. */
  private flashes: { x: number; y: number; life: number }[] = [];
  private crowdG!: Phaser.GameObjects.Graphics;
  private crowdFlash(n: number): void {
    for (let i = 0; i < n; i++) this.flashes.push({ x: rng.int(8, 712), y: rng.int(112, 288), life: 1 });
  }

  private updateCrowd(dt: number): void {
    if (Math.random() < dt * 3) this.crowdFlash(1);
    const g = this.crowdG;
    g.clear();
    for (const f of this.flashes) {
      f.life -= dt * 4;
      if (f.life <= 0) continue;
      g.fillStyle(0xffffff, 0.25 * f.life).fillCircle(f.x, f.y, 9 * f.life);
      g.fillStyle(0xffffff, f.life).fillCircle(f.x, f.y, 3);
    }
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }

  /** Net bulge where the ball hit the back of the goal. */
  private netHit: { x: number; y: number; s: number } | null = null;

  private drawNet(): void {
    const g = this.netG;
    g.clear();
    const s = this.netShake;
    const hit = this.netHit;
    // a net point moves towards the hit point (pushed away from the camera) and wobbles
    const P = (x: number, y: number): [number, number] => {
      let px = x + Math.sin(y * 0.11 + this.elapsed * 30) * s * 0.6, py = y + Math.sin(x * 0.13 + this.elapsed * 30) * s * 0.6;
      if (hit) {
        const k = hit.s * Math.exp(-((x - hit.x) ** 2 + (y - hit.y) ** 2) / (2 * 60 * 60));
        px += (hit.x - x) * k * 0.3; py += (hit.y - y) * k * 0.3;
      }
      return [px, py];
    };
    const line = (pts: [number, number][], w: number, color: number, a: number) => {
      g.lineStyle(w, color, a).beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokePath();
    };
    const lerp = Phaser.Math.Linear;
    // inside of the goal: grass floor, shaded back and side nets
    g.fillStyle(0x0a2a12, 0.35).fillPoints([{ x: GL, y: GB }, { x: GR, y: GB }, { x: BR, y: BB }, { x: BL, y: BB }] as Phaser.Types.Math.Vector2Like[], true);
    g.fillStyle(0x0b1324, 0.32).fillRect(BL, BT, BR - BL, BB - BT);
    g.fillStyle(0x0b1324, 0.22)
      .fillPoints([{ x: GL, y: GT }, { x: BL, y: BT }, { x: BL, y: BB }, { x: GL, y: GB }] as Phaser.Types.Math.Vector2Like[], true)
      .fillPoints([{ x: GR, y: GT }, { x: BR, y: BT }, { x: BR, y: BB }, { x: GR, y: GB }] as Phaser.Types.Math.Vector2Like[], true)
      .fillPoints([{ x: GL, y: GT }, { x: GR, y: GT }, { x: BR, y: BT }, { x: BL, y: BT }] as Phaser.Types.Math.Vector2Like[], true);
    // back net mesh
    const N = 20;
    for (let x = BL; x <= BR + 0.1; x += (BR - BL) / 22) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) pts.push(P(x, lerp(BT, BB, i / N)));
      line(pts, 1.5, 0xffffff, 0.3);
    }
    for (let y = BT; y <= BB + 0.1; y += (BB - BT) / 9) {
      const pts: [number, number][] = [];
      for (let i = 0; i <= N; i++) pts.push(P(lerp(BL, BR, i / N), y));
      line(pts, 1.5, 0xffffff, 0.3);
    }
    // side and roof nets
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      g.lineStyle(1.5, 0xffffff, 0.22)
        .lineBetween(GL, lerp(GT, GB, k), BL, lerp(BT, BB, k)).lineBetween(GR, lerp(GT, GB, k), BR, lerp(BT, BB, k));
    }
    for (let i = 1; i < 3; i++) {
      const k = i / 3;
      g.lineStyle(1.5, 0xffffff, 0.22)
        .lineBetween(lerp(GL, BL, k), lerp(GT, BT, k), lerp(GL, BL, k), lerp(GB, BB, k))
        .lineBetween(lerp(GR, BR, k), lerp(GT, BT, k), lerp(GR, BR, k), lerp(GB, BB, k));
    }
    for (let i = 0; i <= 22; i++) g.lineStyle(1.5, 0xffffff, 0.18).lineBetween(lerp(GL, GR, i / 22), GT, lerp(BL, BR, i / 22), BT);
    // back frame (thin stanchions)
    g.lineStyle(4, 0xc9ced8, 0.9).strokeRect(BL, BT, BR - BL, BB - BT);
    g.lineBetween(GL, GT, BL, BT).lineBetween(GR, GT, BR, BT).lineBetween(GL, GB, BL, BB).lineBetween(GR, GB, BR, BB);
    // posts and crossbar: rounded white bars with a soft shade
    const post = (x: number, y: number, w: number, h: number) => {
      g.fillStyle(0x000000, 0.18).fillRoundedRect(x + 3, y + 3, w, h, 6);
      g.fillStyle(0xd9dde6).fillRoundedRect(x, y, w, h, 6);
      g.fillStyle(0xffffff).fillRoundedRect(x + 1, y + 1, w > h ? w - 2 : w * 0.55, w > h ? h * 0.55 : h - 2, 5);
    };
    post(GL - 14, GT - 14, 14, GB - GT + 16);
    post(GR, GT - 14, 14, GB - GT + 16);
    post(GL - 14, GT - 14, GR - GL + 28, 14);
  }

  private drawBoard(): void {
    const g = this.board;
    g.clear();
    g.fillStyle(0x000000, 0.25).fillRoundedRect(112, 100, 500, 160, 24);
    g.fillStyle(0x0b1020, 0.78).fillRoundedRect(110, 96, 500, 160, 24);
    g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(110, 96, 500, 160, 24);
    g.lineStyle(2, 0xffffff, 0.08).lineBetween(130, 203, 590, 203);
    // whose kick is next: that row's next slot gets a gold ring
    const youNext = this.online ? this.iShoot() : this.you.length <= this.them.length;
    const row = (arr: boolean[], y: number, next: boolean) => {
      const start = Math.max(0, arr.length - (arr.length >= 5 ? 4 : 5));
      for (let i = 0; i < 5; i++) {
        const v = arr[start + i];
        const x = 392 + i * 46;
        if (v === undefined) {
          g.fillStyle(0xffffff, 0.06).fillCircle(x, y, 15);
          const now = next && start + i === arr.length;
          g.lineStyle(now ? 4 : 2, now ? 0xffd23f : 0xffffff, now ? 1 : 0.25).strokeCircle(x, y, 15);
        } else if (v) {
          g.fillStyle(0x23c466).fillCircle(x, y, 16);
          g.lineStyle(4, 0xffffff, 1).beginPath().moveTo(x - 7, y).lineTo(x - 2, y + 6).lineTo(x + 8, y - 6).strokePath();
        } else {
          g.fillStyle(0xe2412f).fillCircle(x, y, 16);
          g.lineStyle(4, 0xffffff, 1).lineBetween(x - 6, y - 6, x + 6, y + 6).lineBetween(x + 6, y - 6, x - 6, y + 6);
        }
      }
    };
    row(this.you, 178, youNext); row(this.them, 228, !youNext);
    const yg = this.you.filter(Boolean).length, tg = this.them.filter(Boolean).length;
    const head = !this.online ? t('m' + this.match)
      : this.kick >= 10 ? t('sudden') : `${t('kickN')} ${Math.floor(this.kick / 2) + 1}/5`;
    this.boardText.setText(head).setPosition(360, 128).setColor('#ffd23f').setFontSize(22);
    this.boardLabels(yg, tg);
  }

  private labels: Phaser.GameObjects.Text[] = [];
  private boardLabels(yg: number, tg: number): void {
    for (const l of this.labels) l.destroy();
    this.labels = [
      txt(this, 140, 178, t('you'), { title: true, size: 20, color: '#3ee6ff' }).setOrigin(0, 0.5).setDepth(9),
      txt(this, 140, 228, this.online ? clip(net.peerName || t('them'), 9) : t('them'), { title: true, size: 20, color: '#ff6b5a' }).setOrigin(0, 0.5).setDepth(9),
      txt(this, 338, 178, `${yg}`, { title: true, size: 30, color: '#ffffff' }).setOrigin(0.5).setDepth(9),
      txt(this, 338, 228, `${tg}`, { title: true, size: 30, color: '#ffffff' }).setOrigin(0.5).setDepth(9),
    ];
  }

  // ---------- characters ----------
  /** Kicker feet position at the strike: behind and to the left of the ball, seen from behind. */
  private strikePos(): [number, number] {
    return [STRIKE_X, STRIKE_Y];
  }

  /** Who kicks and who keeps: you and the rival in solo, the shooter's character online. */
  private cast(youShoot: boolean): void {
    const otherPrefix = this.online ? 'op' : this.rivalPrefix;
    this.kickerPrefix = youShoot ? 'me' : otherPrefix;
    this.keeperPrefix = youShoot ? otherPrefix : 'me';
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
      const ok = this.textures.exists(`${prefix}-backkick3`);
      this.rivalId = ok ? id : peerCharacter();
      this.rivalPrefix = ok ? prefix : 'op';
      then();
    };
    if (this.textures.exists(`${prefix}-back`)) { use(); return; }
    loadCharacter(this.load, { id, prefix, poses: POSES });
    this.load.once(Phaser.Loader.Events.COMPLETE, use);
    this.load.start();
  }

  private kickerTex(pose: keyof typeof KICK_POSES | 'cheer1' | 'cheer2'): string {
    return `${this.kickerPrefix}-${pose === 'cheer1' || pose === 'cheer2' ? pose : KICK_POSES[pose]}`;
  }

  /** The kicker waits a few steps behind the ball, its back to the camera, breathing. */
  private kickerReady(): void {
    const [sx, sy] = this.strikePos();
    this.tweens.killTweensOf(this.kicker);
    this.kickerMood = 'idle';
    const s = KICKER_S * 1.1;
    this.kicker.setTexture(this.kickerTex('bk0')).setVisible(true).setAlpha(1).setFlipX(false).setAngle(0)
      .setScale(s).setPosition(sx - 95, sy + 70);
    this.tweens.add({ targets: this.kicker, scaleY: s * 1.025, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Run-up from behind (the character's own legs step), then the strike with the foot on the ball. */
  private runUp(fromX: number, fromY: number, ms: number, then: () => void): void {
    const [sx, sy] = this.strikePos();
    this.tweens.killTweensOf(this.kicker);
    this.kickerMood = 'idle';
    const s0 = KICKER_S * (1 + (fromY - sy) / 700);
    this.kicker.setTexture(this.kickerTex('bkW1')).setVisible(true).setAlpha(1).setFlipX(false).setAngle(0).setPosition(fromX, fromY).setScale(s0);
    const step = Math.max(110, Math.min(160, ms / 5));
    let last = -1;
    this.tweens.add({
      targets: this.kicker, x: sx, y: sy, scale: KICKER_S, duration: ms, ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const el = tw.elapsed ?? 0;
        const n = Math.floor(el / step);
        // a slight sway from foot to foot
        this.kicker.setAngle(Math.sin((el / step) * Math.PI) * 3);
        if (n !== last) {
          last = n;
          this.kicker.setTexture(this.kickerTex(n % 2 ? 'bkW2' : 'bkW1'));
          this.sfx('step', { volume: 0.25 });
        }
      },
      onComplete: () => {
        if (this.isOver) return;
        // wind up, strike, follow through
        this.kicker.setTexture(this.kickerTex('bkWind')).setAngle(4);
        this.time.delayedCall(90, () => {
          if (this.isOver) return;
          this.kicker.setTexture(this.kickerTex('bkStrike')).setAngle(-7);
          then();
        });
        this.tweens.add({ targets: this.kicker, angle: -3, y: sy - 6, duration: 140, delay: 90, ease: 'Quad.easeOut' });
        this.time.delayedCall(220, () => { if (this.kickerMood === 'idle') this.kicker.setTexture(this.kickerTex('bkFollow')); });
        this.time.delayedCall(610, () => {
          if (this.kickerMood !== 'idle') return;
          this.kicker.setTexture(this.kickerTex('bk0'));
          this.tweens.add({ targets: this.kicker, angle: 0, y: sy, duration: 200 });
        });
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
    if (this.netHit) this.tweens.killTweensOf(this.netHit);
    this.netHit = null;
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
    this.runUp(sx - 190, sy + 170, 900 + rng.int(0, 500), () => this.aiShoot());
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
    burst(this, SPOT_X - BALL_R * 0.6, SPOT_Y + BALL_R * 0.6, [0x37a243, 0x6fd16f, 0xffffff], 14, 200);
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
      // into the back of the net, which bulges, then the ball drops to the floor of the goal
      const bx = BL + (s.tx - GL) / (GR - GL) * (BR - BL), by = BT + (s.ty - GT) / (GB - GT) * (BB - BT);
      this.netShake = 4;
      this.netHit = { x: bx, y: by, s: 1 };
      this.tweens.add({ targets: this.netHit, s: 0, duration: 700, delay: 120, ease: 'Elastic.easeOut' });
      this.sfx('net', { volume: 0.7, x: s.tx });
      this.ball.setDepth(2);
      const sc = this.ball.scale;
      this.tweens.chain({
        targets: this.ball,
        tweens: [
          { x: bx, y: by, scale: sc * 0.85, duration: 150, ease: 'Quad.easeOut' },
          { y: BB - BALL_R * 0.35, x: bx + (bx - SPOT_X) * 0.05, duration: 380, ease: 'Bounce.easeOut' },
        ],
      });
      this.crowdFlash(40);
      this.cameras.main.zoomTo(1.035, 110, 'Quad.easeOut', true);
      this.time.delayedCall(140, () => this.cameras.main.zoomTo(1, 420, 'Sine.easeInOut', true));
    }
    // the characters react with their own poses
    const goal = o === 'goal';
    this.keeperMood = goal ? 'beaten' : o === 'save' ? 'happy' : 'ready';
    if (goal) this.tweens.add({ targets: this, ky: Math.min(STAND_Y + 30, this.ky + 40), duration: 300, ease: 'Quad.easeIn' });
    this.kickerMood = goal ? 'happy' : 'sad';
    this.tweens.killTweensOf(this.kicker);
    const k = this.kicker, ky0 = STRIKE_Y;
    if (goal) {
      // turns round to the camera and jumps for joy
      k.setAngle(0).setY(ky0);
      this.tweens.add({ targets: k, y: ky0 - 40, duration: 220, yoyo: true, repeat: 2, ease: 'Quad.easeOut' });
    } else {
      // back to the camera, shoulders down
      k.setTexture(this.kickerTex('bk0')).setAngle(0).setY(ky0);
      this.tweens.add({ targets: k, scaleY: KICKER_S * 0.93, y: ky0 + 6, angle: rng.pick([-4, 4]), duration: 380, ease: 'Sine.easeOut' });
    }
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
        this.confetti(corner ? 70 : 46);
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
      this.confetti(90);
      if (this.match >= MATCHES) { this.endGame({ win: true, title: t('champion'), delay: 1600 }); return; }
      this.time.delayedCall(1800, () => { if (!this.isOver) { this.match++; this.startMatch(); } });
      return;
    }
    if (this.you.length === 5 && this.them.length === 5) this.showBanner(t('sudden'), '#ff4fa3');
    if (this.you.length > this.them.length) this.startDefending();
    else this.time.delayedCall(this.you.length >= 5 && this.you.length === this.them.length ? 900 : 0, () => this.startShooting());
  }

  /** Paper confetti falling over the pitch. */
  private confetti(n = 46): void {
    const cols = [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3, 0xffffff, 0xec3013];
    for (let i = 0; i < n; i++) {
      const p = this.add.rectangle(rng.int(0, 720), rng.int(-200, -10), rng.int(8, 14), rng.int(5, 8), rng.pick(cols)).setDepth(19).setAngle(rng.int(0, 360));
      this.tweens.add({
        targets: p, y: rng.int(700, 1250), x: p.x + rng.int(-120, 120), angle: p.angle + rng.int(-540, 540),
        scaleX: { from: 1, to: 0.2, yoyo: true, repeat: 4, duration: 260 },
        duration: rng.int(1400, 2200), ease: 'Sine.easeIn', onComplete: () => p.destroy(),
      });
      this.tweens.add({ targets: p, alpha: 0, delay: 1300, duration: 600 });
    }
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
    if (this.netHit && this.netHit.s <= 0.001) this.netHit = null;
    this.updateCrowd(dt);
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
    const air = Math.max(0, STRIKE_Y - k.y - 8);
    this.kickerShadow.setVisible(k.visible).setPosition(k.x + 4, Math.max(k.y, STRIKE_Y) - 4).setScale(k.scaleX / KICKER_S * Math.max(0.6, 1 - air / 120)).setAlpha(0.3 * k.alpha);
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
        this.confetti(corner ? 70 : 46);
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
