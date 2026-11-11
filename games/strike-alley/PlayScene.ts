import Phaser from 'phaser';
import { ArcadeScene, t, txt, flash, burst, isEasy, hudChip, HudChip, HUD_MARGIN, HUD_ROW2_Y, popup } from '@core';
import { World3D, THREE, playerCharacter3d, miniKey } from '@core/three';
import {
  LaneSim, SIM_DT, LANE_HALF, HEAD_Z, PIT_Z, BALL_R, PIN_COM, PIN_H, SPOTS, OIL_LEN, isSplit, newEvents, ballPath,
  type Release, type SimTune, type StepEvents,
} from './sim';
import { ScoreSheet, FRAMES } from './scoring';
import { buildAlley, drawScreen, type Alley, RETURN_X, HOOD_Z, RACK_END_Z, RACK_Y, APPROACH, PITCH } from './alley';
import { Person, ballInHand } from './bowler';
import { Particles } from './fx3d';
import { scorecardChip, callout, Summary, RackView, type CardView } from './panels';
import { aimFor } from './bot';
import { TUNING, type Tuning } from './tuning';

export { TUNING } from './tuning';
export type { Tuning } from './tuning';

export const SPEED_MIN = 5.4;
export const SPEED_MAX = 9.6;
const X_MAX = LANE_HALF - 0.08;
const ANGLE_MAX = 0.07;
/** Where the bowler stands to aim, and where the slide ends. */
const STANCE_Z = 3.75;
const SLIDE_Z = 0.62;
const APPROACH_T = 1.45;
/** Sweep bar and setting table rest heights. */
const SWEEP_UP = 0.95;
const SWEEP_Z = HEAD_Z + 0.36;
const TABLE_UP = 1.25;
const TABLE_DOWN = PIN_H + 0.045;
/** Pixels of finger travel per metre of sideways movement. */
const SLIDE_PX = 420;

type Phase = 'intro' | 'return' | 'aim' | 'approach' | 'roll' | 'result' | 'replay' | 'react' | 'summary' | 'over';
type Call = 'strike' | 'spare' | 'split' | 'splitConverted' | 'gutter' | 'miss' | 'count';

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  mode: 'none' | 'slide' | 'throw';
  startX: number;
  path: { x: number; y: number; t: number }[];
  throwFrom: number;
}

interface PinVis {
  x: number; y: number; z: number;
  q: THREE.Quaternion;
  shown: boolean;
  up: boolean;
}

const SPECTATORS = ['character-male-a', 'character-male-c', 'character-male-e'];
/** Points in the ball's track ribbon (one every 0.25 m). */
const TRACK_MAX = 90;

/** When the finger really moved (the DOM event's time; the game may handle it a frame later). */
const stamp = (p: Phaser.Input.Pointer): number => (p.event as Event | undefined)?.timeStamp || performance.now();

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private alley!: Alley;
  private fx!: Particles;
  private sim!: LaneSim;
  private predictor: LaneSim | null = null;
  private predicted: { standing: boolean[]; done: boolean } | null = null;
  private sheet = new ScoreSheet();
  tune: Tuning = TUNING.normal;
  private simTune!: SimTune;

  private bowler!: Person;
  private crowd: Person[] = [];
  private phase: Phase = 'intro';
  private phaseT = 0;

  // the throw
  private ballX = 0.2;
  private angle = 0;
  private hook = 0.35;
  private power = 0;
  private charging = false;
  private chargeT = 0;
  private kbStage: 'move' | 'aim' = 'move';
  private gesture: Gesture | null = null;
  private release: Release | null = null;
  private released = false;
  private standingBefore: boolean[] = new Array(10).fill(true);
  private leftSplit = false;
  private rackSeed = 1;
  private acc = 0;
  private timeScale = 1;
  private gutterBall = false;
  private firstHit = false;
  private ballQ = new THREE.Quaternion();
  private lastCall: Call = 'count';

  // replay
  private recording: Float32Array[] = [];
  private replayT = 0;

  // pins on screen (the sim, or the sweep animation)
  private pinVis: PinVis[] = [];
  private sweepT = -1;
  private sweepFresh = true;
  private sweepDone = true;
  private sweepFast = 1;

  // camera
  private camPos = new THREE.Vector3(0, 1.5, 6);
  private camLook = new THREE.Vector3(0, 0.3, -8);
  private goalPos = new THREE.Vector3(0, 1.5, 6);
  private goalLook = new THREE.Vector3(0, 0.3, -8);
  private camRate = 4;
  private shakeAmp = 0;
  private camLock: [THREE.Vector3, THREE.Vector3] | null = null;

  // 3D guides
  private aimDots!: THREE.InstancedMesh;
  private guideKey = '';
  /** The ball's track on the boards (a glowing ribbon that shows the hook). */
  private track!: THREE.Mesh;
  private trackPts: THREE.Vector2[] = [];
  /** Easy: the ball's predicted path. */
  private pathRibbon!: THREE.Mesh;

  // UI
  private card!: CardView;
  private cardChip!: HudChip;
  private hint!: Phaser.GameObjects.Text;
  private rack!: RackView;
  private rackChip!: HudChip;
  private spinChip!: HudChip;
  private spinIcon!: Phaser.GameObjects.Graphics;
  private powerChip!: HudChip;
  private powerBar!: Phaser.GameObjects.Graphics;
  private trail!: Phaser.GameObjects.Graphics;
  private replayTag: Phaser.GameObjects.Container | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private rollSound: Phaser.Sound.WebAudioSound | null = null;
  private lastKnock = 0;
  private neonPulse = 0;
  private neonCycle = 0;
  private laneLightT = -1;
  private hintShown = false;

  createGame(): void {
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.simTune = { hook: this.tune.hook, pocketAssist: this.tune.pocketAssist, oil: OIL_LEN };
    this.sheet = new ScoreSheet();
    this.phase = 'intro';
    this.phaseT = 0;
    this.ballX = 0.2;
    this.angle = 0;
    this.hook = 0.35;
    this.power = 0;
    this.charging = false;
    this.chargeT = 0;
    this.kbStage = 'move';
    this.gesture = null;
    this.release = null;
    this.released = false;
    this.standingBefore = new Array(10).fill(true);
    this.leftSplit = false;
    this.rackSeed = 1 + Math.floor(Math.random() * 100000);
    this.acc = 0;
    this.timeScale = 1;
    this.gutterBall = false;
    this.firstHit = false;
    this.ballQ.identity();
    this.recording = [];
    this.replayT = 0;
    this.sweepT = -1;
    this.sweepDone = true;
    this.sweepFast = 1;
    this.shakeAmp = 0;
    this.guideKey = '';
    this.replayTag = null;
    this.crowd = [];
    this.lastKnock = 0;
    this.neonPulse = 0;
    this.neonCycle = 0;
    this.laneLightT = -1;
    this.hintShown = false;
    this.predictor = null;
    this.predicted = null;
    this.lastCall = 'count';
    this.summary = null;
    this.camLock = null;
    this.bodyOff = 0.39;
    this.camRate = 4;

    this.world = new World3D(this, { fov: 50, near: 0.05, far: 80, background: 0x0d0820, fog: { color: 0x0d0820, near: 26, far: 60 } });
    const sun = this.world.addLights({ sky: 0xe6dcff, ground: 0x3a2a48, ambient: 1.35, intensity: 1.7, dir: [0.15, 1, 0.5], extent: 3.2 });
    sun.shadow.mapSize.set(1024, 1024);
    this.alley = buildAlley(this.world);
    this.fx = new Particles(this.world.scene);
    this.sim = new LaneSim(this.simTune);
    this.sim.rack(null, this.rackSeed);
    this.pinVis = this.sim.pins.map(() => ({ x: 0, y: 0, z: 0, q: new THREE.Quaternion(), shown: true, up: true }));
    this.copyPinsFromSim();

    // the bowler (the player's platform character) and the people around
    this.bowler = new Person(playerCharacter3d());
    this.world.scene.add(this.bowler.root);
    this.bowler.face(0).play('idle', { fade: 0 });
    this.placeBowler(STANCE_Z);
    const spots: [number, number, number][] = [[1.05, APPROACH + 1.2, -0.25], [1.85, APPROACH + 0.9, -0.45], [PITCH * 2 + 0.2, 1.4, 0]];
    SPECTATORS.forEach((name, i) => {
      const p = new Person(miniKey(name));
      const [x, z, yaw] = spots[i];
      p.root.position.set(x, 0, z);
      p.face(yaw);
      p.play('idle', { fade: 0 });
      this.world.scene.add(p.root);
      this.crowd.push(p);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bowler.dispose();
      this.crowd.forEach((c) => c.dispose());
      this.fx.clear();
      this.rollSound?.stop();
      this.rollSound?.destroy();
      this.rollSound = null;
    });

    // guides: the aim chevrons (Normal) and the predicted path (Easy)
    const chev = new THREE.Shape();
    chev.moveTo(0, 0.1); chev.lineTo(0.085, -0.03); chev.lineTo(0.05, -0.055); chev.lineTo(0, 0.02); chev.lineTo(-0.05, -0.055); chev.lineTo(-0.085, -0.03);
    chev.closePath();
    const guideMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    this.aimDots = new THREE.InstancedMesh(new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2), guideMat(0xffd23f), 24);
    for (const d of [this.aimDots]) {
      d.count = 0;
      d.frustumCulled = false;
      d.renderOrder = 4;
      d.userData.ownMaterial = true;
      this.world.scene.add(d);
    }

    this.track = this.makeRibbon(0x34e7ff, 0.5);
    this.pathRibbon = this.makeRibbon(0x7dff9a, 0.55);
    this.trackPts = [];

    // UI
    const { width, height } = this.scale;
    const sc = scorecardChip(this, HUD_ROW2_Y + 24);
    this.card = sc.card;
    this.cardChip = sc.chip;
    this.card.update(this.sheet, 0);
    this.hud.setCenter(t('frameShort', { n: 1 }));
    this.rack = new RackView(this);
    this.rackChip = hudChip(this, width - HUD_MARGIN, HUD_ROW2_Y + 24 + this.card.h / 2 + 72, { align: 'right', items: [this.rack.g], height: 96 });
    this.rack.update(this.sim.standing());
    this.hint = txt(this, width / 2, height - 190, '', { size: 26, color: '#ffffff', strokeThickness: 6, stroke: '#140a2a', wrap: 660 }).setDepth(9000).setScrollFactor(0);
    this.spinIcon = this.add.graphics();
    this.spinIcon.setData('chipWidth', 34);
    this.spinChip = hudChip(this, HUD_MARGIN, height - 86, { label: t('spin'), text: '', items: [this.spinIcon], minWidth: 210 });
    this.powerBar = this.add.graphics();
    this.powerBar.setData('chipWidth', 200);
    this.powerChip = hudChip(this, this.scale.width - HUD_MARGIN, height - 86, { align: 'right', label: t('power'), items: [this.powerBar] });
    this.powerChip.setVisible(false);
    this.trail = this.add.graphics().setDepth(8900).setScrollFactor(0);
    this.updateSpinChip();
    drawScreen(this.alley, { title: t('lane'), big: '0', sub: t('frameN', { n: 1 }), color: '#ffd23f' });

    // input
    this.input.addPointer(1);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.keys = this.input.keyboard!.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,ENTER,Z,X,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;

    if (this.cache.audio.exists('roll')) {
      this.rollSound = this.sound.add('roll', { loop: true, volume: 0 }) as Phaser.Sound.WebAudioSound;
      try { this.rollSound.play(); } catch { /* locked until a tap */ }
    }
    const hush = () => this.rollSound?.setVolume(0);
    this.events.on(Phaser.Scenes.Events.PAUSE, hush);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.PAUSE, hush));

    // a fly-in from the pins to the bowler
    this.camPos.set(0, 0.9, HEAD_Z + 3);
    this.camLook.set(0, 0.2, HEAD_Z - 0.5);
    this.phase = 'intro';
    this.phaseT = 0;
    this.alley.ball.visible = false;
    this.alley.mirrorBall.visible = false;
    this.sfx('whir', { volume: 0.3 });
  }

  // ------------------------------------------------------------------ helpers

  private stanceCam(): void {
    const bx = this.ballX;
    // over the right shoulder: the bowler at the left edge, the ball low, the lane down the middle
    this.goalPos.set(bx * 0.7 + 0.3, 1.32, STANCE_Z + 2.25);
    this.goalLook.set(bx * 0.2 + 0.08, 0.0, -10);
  }

  private deckCam(wide = false): void {
    if (wide) {
      this.goalPos.set(0.15, 1.0, HEAD_Z + 3.2);
      this.goalLook.set(0, 0.25, HEAD_Z - 0.45);
    } else {
      this.goalPos.set(0.42, 0.72, HEAD_Z + 2.55);
      this.goalLook.set(0, 0.17, HEAD_Z - 0.35);
    }
  }

  /**
   * Puts the bowler so the ball in the right hand sits over ballX. The hand's side offset is
   * measured while he stands holding the ball and then kept, so a swinging arm does not drag
   * the body sideways during the approach.
   */
  private placeBowler(z: number, measure = true): void {
    if (measure && this.bowler.clip === 'holding-right') {
      const off = this.handWorld().x - this.bowler.root.position.x;
      if (Number.isFinite(off) && Math.abs(off) < 0.7) this.bodyOff += (off - this.bodyOff) * 0.5;
    }
    this.bowler.root.position.set(this.ballX - this.bodyOff, 0, z);
  }
  private bodyOff = 0.39;

  private handWorld(): THREE.Vector3 {
    return ballInHand(this.bowler);
  }

  private copyPinsFromSim(): void {
    this.sim.pins.forEach((p, i) => {
      const v = this.pinVis[i];
      v.x = p.px; v.y = p.py; v.z = p.pz;
      v.q.set(p.qx, p.qy, p.qz, p.qw);
      v.shown = p.live;
    });
  }

  private drawPins(): void {
    const a = this.alley;
    this.pinVis.forEach((v, i) => {
      const m = a.pins[i], mm = a.mirrorPins[i];
      m.visible = mm.visible = v.shown;
      if (!v.shown) return;
      m.position.set(v.x, v.y, v.z);
      m.quaternion.copy(v.q);
      mm.position.copy(m.position);
      mm.quaternion.copy(v.q);
      // the reflection only shows on the boards
      mm.visible = v.z > PIT_Z && Math.abs(v.x) < LANE_HALF && v.y > 0;
      // in the pit, under the deck: out of sight (the boards are slightly see-through)
      if (v.z < PIT_Z + 0.05 && v.y < -0.04) m.visible = false;
    });
  }

  private setBall(x: number, y: number, z: number, onLane: boolean): void {
    const a = this.alley;
    a.ball.visible = true;
    a.ball.position.set(x, y, z);
    a.ball.quaternion.copy(this.ballQ);
    a.mirrorBall.visible = onLane && z < 0 && z > PIT_Z && Math.abs(x) < LANE_HALF;
    a.mirrorBall.position.set(x, y, z);
    a.mirrorBall.quaternion.copy(this.ballQ);
  }

  private updateSpinChip(): void {
    const h = this.hook;
    const g = this.spinIcon;
    g.clear();
    const dir = h > 0.02 ? -1 : h < -0.02 ? 1 : 0;
    const col = Math.abs(h) > 0.66 ? 0xff3fa4 : Math.abs(h) > 0.33 ? 0xffd23f : 0x7dff9a;
    g.lineStyle(4, col, 1);
    if (dir === 0) {
      g.lineBetween(0, 12, 0, -12);
      g.fillStyle(col, 1).fillTriangle(-7, -8, 7, -8, 0, -16);
    } else {
      // a curve that bends towards the hook side
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 10; k++) {
        const s = k / 10;
        pts.push(new Phaser.Math.Vector2(-dir * 8 + dir * 16 * s * s * (0.4 + Math.abs(h) * 0.6), 12 - s * 26));
      }
      g.strokePoints(pts);
      const e = pts[10], p = pts[8];
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      g.fillStyle(col, 1).fillTriangle(
        e.x + Math.cos(ang) * 8, e.y + Math.sin(ang) * 8,
        e.x + Math.cos(ang + 2.3) * 8, e.y + Math.sin(ang + 2.3) * 8,
        e.x + Math.cos(ang - 2.3) * 8, e.y + Math.sin(ang - 2.3) * 8,
      );
    }
    this.spinChip.setText(Math.abs(h) < 0.02 ? t('straight') : `${Math.round(Math.abs(h) * 100)}%`);
  }

  private drawPower(): void {
    const g = this.powerBar;
    g.clear();
    const w = 200, h = 16;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    const col = Phaser.Display.Color.HSLToColor(0.33 - this.power * 0.33, 0.95, 0.55).color;
    g.fillStyle(col, 1).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * this.power), h, 8);
    // the sweet spot
    g.lineStyle(2, 0xffffff, 0.8).lineBetween(-w / 2 + w * 0.62, -h / 2 - 3, -w / 2 + w * 0.62, h / 2 + 3);
  }

  // ------------------------------------------------------------------ input

  private canAim(): boolean {
    return this.phase === 'aim' && this.sweepDone;
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length || this.isOver) return;
    if (this.phase === 'intro' || this.phase === 'result' || this.phase === 'replay' || this.phase === 'react') {
      this.skip();
      return;
    }
    if (!this.canAim() && this.phase !== 'return') return;
    if (this.gesture) return;
    this.gesture = { id: p.id, x0: p.x, y0: p.y, mode: 'none', startX: this.ballX, path: [{ x: p.x, y: p.y, t: stamp(p) }], throwFrom: 0 };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    g.path.push({ x: p.x, y: p.y, t: stamp(p) });
    if (g.path.length > 240) g.path.splice(0, g.path.length - 240);
    if (g.mode === 'throw') {
      this.readFlick(false);
      return;
    }
    const dx = p.x - g.x0, dy = p.y - g.y0;
    // recent upward motion turns a slide into a throw
    const back = g.path[Math.max(0, g.path.length - 6)];
    const up = back.y - p.y, side = Math.abs(p.x - back.x);
    if ((g.mode === 'none' && -dy > 26 && -dy > Math.abs(dx) * 0.9) || (g.mode === 'slide' && up > 34 && up > side * 1.2)) {
      if (!this.canAim()) return;
      g.mode = 'throw';
      // the flick starts where the finger began to move up
      let k = g.path.length - 1;
      while (k > 0 && g.path[k - 1].y > g.path[k].y + 0.5) k--;
      g.throwFrom = k;
      this.kbStage = 'aim';
      this.hint.setText('');
      return;
    }
    if (g.mode === 'none' && Math.abs(dx) > 14) g.mode = 'slide';
    if (g.mode === 'slide') {
      this.ballX = Phaser.Math.Clamp(g.startX + dx / SLIDE_PX, -X_MAX, X_MAX);
      if (this.phase === 'aim' || this.phase === 'return') this.angle = 0;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    if (!g || p.id !== g.id) return;
    this.trail.clear();
    if (g.mode !== 'throw') { this.gesture = null; return; }
    const f = this.readFlick(true);
    this.gesture = null;
    if (!f || !this.canAim()) {
      if (this.canAim()) popup(this, this.scale.width / 2, this.scale.height - 260, t('flickMore'), '#ffd23f', 30);
      this.guideKey = '';
      return;
    }
    this.throwBall({ x: this.ballX, angle: this.angle, speed: f.speed, hook: this.hook });
  }

  /** Reads the flick so far: direction from its chord, speed from its last 0.11 s, hook from its bend. */
  private readFlick(final: boolean): { speed: number } | null {
    const g = this.gesture ?? null;
    if (!g) return null;
    const pts = g.path.slice(g.throwFrom);
    if (pts.length < 2) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const cx = b.x - a.x, cy = b.y - a.y;
    const len = Math.hypot(cx, cy);
    // direction
    const sa = Math.atan2(cx, -cy);
    this.angle = Phaser.Math.Clamp(sa * 0.075 * this.tune.aimSens, -ANGLE_MAX, ANGLE_MAX);
    // bend: the furthest point right (+) or left (-) of the chord
    let dev = 0;
    if (len > 20) {
      for (const q of pts) {
        const d = ((q.x - a.x) * -cy + (q.y - a.y) * cx) / len;   // right of the chord is +
        if (Math.abs(d) > Math.abs(dev)) dev = d;
      }
    }
    const r = len > 0 ? dev / len : 0;
    const mag = Phaser.Math.Clamp((Math.abs(r) - 0.03) / 0.17, 0, 1);
    // a flick that bows out to the right ends heading left: a left hook (positive)
    this.hook = Math.sign(r) * mag;
    this.updateSpinChip();
    // speed: the finger's speed over the last 0.11 s (px/s in game pixels)
    const now = b.t;
    let k = pts.length - 1;
    while (k > 0 && now - pts[k - 1].t < 120) k--;
    const p0 = pts[Math.min(k, pts.length - 2)];
    const vEnd = Math.hypot(b.x - p0.x, b.y - p0.y) / (Math.max(40, now - p0.t) / 1000);
    // the whole flick's average too: slow frames merge touch moves, and a quick flick stays quick
    const vAvg = len / (Math.max(60, now - a.t) / 1000);
    const v = Math.max(vEnd, vAvg);
    this.power = Phaser.Math.Clamp((v - 300) / 2600, 0, 1);
    // trail
    const tr = this.trail;
    tr.clear();
    tr.lineStyle(14, 0x000000, 0.25);
    tr.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y + 3)));
    const col = Phaser.Display.Color.HSLToColor(0.33 - this.power * 0.33, 0.95, 0.6).color;
    tr.lineStyle(9, col, 0.9);
    tr.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y)));
    tr.fillStyle(0xffffff, 1).fillCircle(b.x, b.y, 10);
    this.powerChip.setVisible(true);
    this.drawPower();
    if (!final) return null;
    if (-cy < 90 || len < 90) return null;
    return { speed: SPEED_MIN + this.power * (SPEED_MAX - SPEED_MIN) };
  }

  private skip(): void {
    if (this.phase === 'intro') this.endIntro();
    else if (this.phase === 'result') this.afterResult(true);
    else if (this.phase === 'replay') this.endReplay();
    else if (this.phase === 'react') this.afterReact();
    this.sweepFast = 3;
  }

  // ------------------------------------------------------------------ flow

  /** The ball comes back up the return; the bowler picks it up. */
  private beginReturn(): void {
    this.phase = 'return';
    this.phaseT = 0;
    this.kbStage = 'move';
    this.charging = false;
    this.power = 0;
    this.powerChip.setVisible(false);
    this.spinChip.setVisible(false);
    this.bowler.face(0).play('idle', { fade: 0 });
    this.bowler.lift = 0;
    this.placeBowler(STANCE_Z);
    this.returnCam();
    this.camPos.copy(this.goalPos).add(new THREE.Vector3(0.3, 0.25, -0.6));
    this.camLook.copy(this.goalLook);
    this.camRate = 3;
    this.ballQ.identity();
    this.alley.ball.visible = false;
    this.alley.mirrorBall.visible = false;
    this.hud.setRight('');
    this.updateHudFrame();
    // the oil wears a little with every frame
    const f = Math.min(this.sheet.frame, FRAMES - 1);
    this.simTune.oil = OIL_LEN - f * this.tune.oilWear;
    if (this.sheet.ball === 0 && (f === 3 || f === 6)) this.tip(t('oilWear'));
    this.keys.SPACE.reset();
    this.keys.ENTER.reset();
  }

  /** In front of the bowler and to the right: the hood, the rack and the bowler. */
  private returnCam(): void {
    const p = this.bowler.root.position;
    this.goalPos.set(-1.75, 2.15, STANCE_Z + 3.4);
    this.goalLook.set((p.x + RETURN_X) / 2 + 0.1, 0.45, STANCE_Z - 0.3);
  }

  /** A line of advice that fades in under the HUD and away again. */
  private tip(s: string): void {
    const tx = txt(this, this.scale.width / 2, 330, s, { size: 28, color: '#9ff3ff', strokeThickness: 6, stroke: '#140a2a', wrap: 640 }).setDepth(9000).setScrollFactor(0).setAlpha(0);
    this.tweens.add({ targets: tx, alpha: 1, delay: 700, duration: 300, hold: 2600, yoyo: true, onComplete: () => tx.destroy() });
  }

  private updateReturn(): void {
    const tt = this.phaseT;
    const tm = this.track.material as THREE.MeshBasicMaterial;
    tm.opacity = Math.max(0, 0.5 - tt * 0.6);
    const a = this.alley;
    const hood = new THREE.Vector3(RETURN_X, RACK_Y + BALL_R * 0.7, HOOD_Z + 0.15);
    const end = new THREE.Vector3(RETURN_X, RACK_Y + BALL_R * 0.55, RACK_END_Z - 0.04);
    if (tt < 0.3) {
      a.ball.visible = false;
    } else if (tt < 1.05) {
      if (!a.ball.visible) this.sfx('pop', { volume: 0.6 });
      // out of the hood and down the rack
      const k = Phaser.Math.Easing.Quadratic.Out((tt - 0.3) / 0.75);
      const p = hood.clone().lerp(end, k);
      const prev = a.ball.position.clone();
      this.setBall(p.x, p.y + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.03, p.z, false);
      const moved = p.distanceTo(prev);
      if (moved > 0 && moved < 0.3) this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), moved / BALL_R));
      if (tt + this.lastDt >= 1.05) this.sfx('clack', { volume: 0.5 });
    } else if (tt < 1.7) {
      // the bowler turns to the rack and picks it up
      if (this.bowler.clip !== 'pick-up') {
        const p = this.bowler.root.position;
        this.bowler.face(Math.PI - Math.atan2(RETURN_X - p.x, RACK_END_Z - p.z)).play('pick-up', { fade: 0.12, speed: 1.2 });
      }
      const k = Phaser.Math.Clamp((tt - 1.3) / 0.3, 0, 1);
      const hand = this.handWorld();
      const p = end.clone().lerp(hand, k * k);
      this.setBall(p.x, p.y, p.z, false);
    } else {
      this.bowler.face(0).play('holding-right', { fade: 0.2 });
      this.beginAim();
      return;
    }
    this.placeBowlerKeepX();
    this.returnCam();
  }

  /** Keeps the bowler where he stands while turning (the hand moves, not the feet). */
  private placeBowlerKeepX(): void {
    if (this.bowler.clip === 'pick-up') return;
    this.placeBowler(STANCE_Z);
  }

  private beginAim(): void {
    this.phase = 'aim';
    this.phaseT = 0;
    this.camRate = 2.6;
    this.kbStage = 'move';
    this.guideKey = '';
    this.updateSpinChip();
    this.spinChip.setVisible(true);
    if (!this.hintShown) {
      this.hintShown = true;
      const touch = this.sys.game.device.input.touch;
      this.hint.setText(touch ? t('hintTouch') : `${t('hintTouch')}\n${t('hintKeys')}`);
    }
  }

  private throwBall(r: Release): void {
    if (!this.canAim()) return;
    r.x = Phaser.Math.Clamp(r.x, -X_MAX, X_MAX);
    r.angle = Phaser.Math.Clamp(r.angle, -ANGLE_MAX, ANGLE_MAX);
    r.speed = Phaser.Math.Clamp(r.speed, SPEED_MIN, SPEED_MAX);
    r.hook = Phaser.Math.Clamp(r.hook, -1, 1);
    this.release = r;
    this.released = false;
    this.steps = 0;
    this.phase = 'approach';
    this.phaseT = 0;
    this.charging = false;
    this.hint.setText('');
    this.trail.clear();
    this.aimDots.count = 0;
    this.pathRibbon.geometry.setDrawRange(0, 0);
    this.powerChip.setVisible(false);
    this.spinChip.setVisible(false);
    this.standingBefore = this.sim.standing();
    this.trackPts = [];
    this.track.geometry.setDrawRange(0, 0);
    (this.track.material as THREE.MeshBasicMaterial).opacity = 0.5;
    this.gutterBall = false;
    this.firstHit = false;
    this.recording = [];
    this.timeScale = 1;
    // predict the outcome a few hundred steps per frame (slow motion and the crash's size)
    this.predictor = new LaneSim(this.simTune);
    this.predictor.restore(this.sim.snapshot());
    this.predictor.release(r);
    this.predicted = null;
    this.bowler.walk(2.4);
  }

  private stepPredictor(): void {
    const p = this.predictor;
    if (!p) return;
    for (let i = 0; i < 60; i++) {
      p.step();
      if (p.done()) {
        this.predicted = { standing: p.standing(), done: true };
        this.predictor = null;
        return;
      }
    }
  }

  private updateApproach(dt: number): void {
    const tt = this.phaseT;
    const r = this.release!;
    const k = Math.min(1, tt / APPROACH_T);
    // four steps that speed up, then the slide
    const e = k * k * (2.2 - 1.2 * k);
    const z = STANCE_Z + (SLIDE_Z - STANCE_Z) * e;
    const v = (STANCE_Z - SLIDE_Z) * (2 * 2.2 * k - 3 * 1.2 * k * k) / APPROACH_T;
    if (k < 0.82) this.bowler.walk(Math.max(1.2, v));
    // footsteps on the approach (four steps, then the slide)
    const stepN = Math.floor(e * 4.2);
    if (stepN > this.steps && k < 0.85) { this.steps = stepN; this.sfx('step', { volume: 0.35 + stepN * 0.08 }); }
    else if (this.bowler.clip !== 'interact-right') this.bowler.play('interact-right', { fade: 0.1, speed: 1.3 });
    this.placeBowler(z, false);
    if (!this.released) {
      const hand = this.handWorld();
      if (tt >= APPROACH_T + 0.05) {
        // the ball meets the boards just past the foul line
        this.released = true;
        this.sim.release(r);
        this.ballQ.identity();
        this.phase = 'roll';
        this.phaseT = 0;
        this.acc = 0;
        this.sfx('thud', { volume: 0.8 });
        this.shakeAmp = Math.max(this.shakeAmp, 0.01);
        this.hud.setRight(t('kmh', { n: Math.round(r.speed * 3.6) }));
      } else if (k > 0.82) {
        const f = Phaser.Math.Clamp((tt - APPROACH_T * 0.82) / (APPROACH_T * 0.18 + 0.05), 0, 1);
        const p = hand.clone().lerp(new THREE.Vector3(r.x, BALL_R, -0.05), f * f);
        this.setBall(p.x, p.y, p.z, false);
      } else this.setBall(hand.x, hand.y, hand.z, false);
    }
    // the camera follows the bowler down the approach
    // the camera lags: the bowler walks away from it to the line
    const cz = STANCE_Z + 2.25 + (SLIDE_Z + 2.8 - STANCE_Z - 2.25) * e;
    this.goalPos.set(r.x * 0.7 + 0.3 - k * 0.2, 1.32 - k * 0.2, cz);
    this.goalLook.set(r.x * 0.2 + 0.08, 0.0, -10);
    this.stepPredictor();
    void dt;
  }

  private lastDt = 0;
  private steps = 0;

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.lastDt = dt;
    this.phaseT += dt;
    // Space / Enter skip the fly-in, the call-out, the replay and the reaction
    if ((this.phase === 'intro' || this.phase === 'result' || this.phase === 'replay' || this.phase === 'react')
      && (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER))) this.skip();
    switch (this.phase) {
      case 'intro': this.updateIntro(); break;
      case 'return': this.updateReturn(); break;
      case 'aim': this.updateAim(dt); break;
      case 'approach': this.updateApproach(dt); break;
      case 'roll': this.updateRoll(dt); break;
      case 'result': this.updateResult(); break;
      case 'replay': this.updateReplay(dt); break;
      case 'react': this.updateReact(); break;
      case 'summary': this.updateSummary(); break;
      default: break;
    }
    if (this.sweepT >= 0) this.updateSweep(dt * this.sweepFast);
    if (this.phase !== 'replay') this.drawPins();
    this.bowler.update(dt);
    for (const c of this.crowd) c.update(dt);
    this.fx.update(dt * (this.phase === 'roll' ? this.timeScale : 1));
    this.updateNeon(dt);
    this.updateCamera(dt);
    this.updateRollSound();
  }

  private updateIntro(): void {
    const k = Phaser.Math.Clamp((this.phaseT - 0.4) / 2.0, 0, 1);
    const e = k * k * (3 - 2 * k);
    this.stanceCam();
    const from = new THREE.Vector3(0.25, 0.75, HEAD_Z + 2.6);
    this.camPos.copy(from.lerp(this.goalPos, e));
    this.camPos.y += Math.sin(e * Math.PI) * 0.6;
    const look = new THREE.Vector3(0, 0.2, HEAD_Z - 0.4);
    this.camLook.copy(look.lerp(this.goalLook, Math.pow(e, 3)));
    this.goalPos.copy(this.camPos);
    this.goalLook.copy(this.camLook);
    this.world.followSun(new THREE.Vector3(0, 0, e < 0.5 ? HEAD_Z : STANCE_Z));
    this.holdFirstBall();
    if (this.phaseT > 2.5) this.endIntro();
  }

  /** The first ball starts in the bowler's hand (later ones come up the ball return). */
  private holdFirstBall(): void {
    if (this.bowler.clip !== 'holding-right') this.bowler.face(0).play('holding-right', { fade: 0 });
    this.placeBowler(STANCE_Z);
    const hand = this.handWorld();
    this.setBall(hand.x, hand.y, hand.z, false);
  }

  private endIntro(): void {
    if (this.phase !== 'intro') return;
    this.holdFirstBall();
    this.stanceCam();
    this.camRate = 3;
    this.updateHudFrame();
    this.beginAim();
  }

  private updateAim(dt: number): void {
    const k = this.keys;
    const fine = k.SHIFT.isDown ? 0.3 : 1;
    const left = k.LEFT.isDown || k.A.isDown, right = k.RIGHT.isDown || k.D.isDown;
    if (this.canAim() && !this.gesture) {
      if (this.kbStage === 'move') {
        if (left) this.ballX = Math.max(-X_MAX, this.ballX - dt * 0.45 * fine);
        if (right) this.ballX = Math.min(X_MAX, this.ballX + dt * 0.45 * fine);
        if (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.ENTER) || Phaser.Input.Keyboard.JustDown(k.UP) || Phaser.Input.Keyboard.JustDown(k.W)) {
          this.kbStage = 'aim';
          this.hint.setText(t('hintAim'));
          this.sfx('tick', { volume: 0.4 });
          this.keys.SPACE.reset();
        }
      } else {
        if (left) this.angle = Math.max(-ANGLE_MAX, this.angle - dt * 0.035 * fine);
        if (right) this.angle = Math.min(ANGLE_MAX, this.angle + dt * 0.035 * fine);
        if (Phaser.Input.Keyboard.JustDown(k.DOWN) || Phaser.Input.Keyboard.JustDown(k.S)) {
          this.kbStage = 'move';
          this.charging = false;
          this.powerChip.setVisible(false);
          this.hint.setText(t('hintKeys'));
        }
        const hold = k.SPACE.isDown || k.ENTER.isDown;
        if (hold && !this.charging && (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.ENTER))) {
          this.charging = true;
          this.chargeT = 0;
          this.powerChip.setVisible(true);
        }
        if (this.charging) {
          this.chargeT += dt;
          // up in 0.95 s, then back down
          const c = (this.chargeT / 0.95) % 2;
          this.power = c < 1 ? c : 2 - c;
          this.drawPower();
          if (!hold) {
            this.charging = false;
            this.throwBall({ x: this.ballX, angle: this.angle, speed: SPEED_MIN + this.power * (SPEED_MAX - SPEED_MIN), hook: this.hook });
            return;
          }
        }
      }
      // spin: Z hooks left, X hooks right
      if (k.Z.isDown) { this.hook = Math.min(1, this.hook + dt * 0.9); this.updateSpinChip(); }
      if (k.X.isDown) { this.hook = Math.max(-1, this.hook - dt * 0.9); this.updateSpinChip(); }
    }
    if (this.gesture?.mode !== 'throw' && !this.gesture) this.trail.clear();
    this.placeBowler(STANCE_Z);
    const hand = this.handWorld();
    this.setBall(hand.x, hand.y, hand.z, false);
    this.stanceCam();
    if (this.phaseT > 1.2) this.camRate = 4;
    this.drawGuides();
  }

  /** The aim chevrons along the release line, and in Easy the ball's whole path. */
  private drawGuides(): void {
    const showing = this.kbStage === 'aim' || this.gesture?.mode === 'throw' || this.tune.preview;
    const speed = SPEED_MIN + Math.max(0.55, this.power) * (SPEED_MAX - SPEED_MIN);
    const key = `${this.ballX.toFixed(3)}:${this.angle.toFixed(4)}:${this.hook.toFixed(2)}:${showing}:${this.tune.preview ? speed.toFixed(1) : ''}`;
    if (key === this.guideKey) return;
    this.guideKey = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    // chevrons from the foul line to past the arrows
    const n = showing ? 14 : 0;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.angle);
    for (let i = 0; i < n; i++) {
      const d = 0.6 + i * 0.42;
      const k = 1 - i / n;
      s.setScalar(0.8 + k * 0.6);
      m.compose(new THREE.Vector3(this.ballX + Math.sin(this.angle) * d, 0.004, -Math.cos(this.angle) * d), q, s);
      this.aimDots.setMatrixAt(i, m);
    }
    this.aimDots.count = n;
    this.aimDots.instanceMatrix.needsUpdate = true;
    // Easy: the path the ball will take (no pins), as a glowing ribbon to the pins
    if (this.tune.preview && showing) {
      const pts = ballPath(this.simTune, { x: this.ballX, angle: this.angle, speed, hook: this.hook }, 0.25)
        .filter((p) => p.z < -0.2 && p.z > HEAD_Z + 0.15);
      const gutter = pts.findIndex((p) => p.gutter);
      const lane = (gutter >= 0 ? pts.slice(0, gutter + 1) : pts).map((p) => new THREE.Vector2(p.x, p.z));
      this.layRibbon(this.pathRibbon, lane, 0.018, 0, 0.004);
      const end = pts[pts.length - 1];
      const good = gutter < 0 && end && Math.abs(Math.abs(end.x) - 0.064) < 0.05;
      (this.pathRibbon.material as THREE.MeshBasicMaterial).color.setHex(gutter >= 0 ? 0xff5a5a : good ? 0x7dff9a : 0xffd23f);
    } else this.pathRibbon.geometry.setDrawRange(0, 0);
  }

  // ------------------------------------------------------------------ the roll

  private updateRoll(dt: number): void {
    this.stepPredictor();
    const b = this.sim.ball;
    // slow motion through the impact when the strike is coming
    const strikeComing = !!this.predicted && this.predicted.standing.every((s) => !s) && this.standingBefore.every((s) => s);
    const slow = strikeComing && b.z < HEAD_Z + 0.7 && this.sim.deckT < 0.9;
    this.timeScale += ((slow ? 0.3 : 1) - this.timeScale) * Math.min(1, dt * 10);
    this.acc += dt * this.timeScale;
    const ev = newEvents();
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 12) {
      this.acc -= SIM_DT;
      steps++;
      this.sim.step(ev);
      // the ball's own spin turns the mesh
      const w = new THREE.Vector3(b.wx, b.wy, b.wz);
      const wl = w.length();
      if (wl > 1e-4 && b.mode !== 'gone') this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(w.normalize(), wl * SIM_DT));
      if (b.z < HEAD_Z + 2.4 && this.recording.length < 900) this.record();
      if (this.sim.done()) break;
    }
    if (steps >= 12) this.acc = 0;
    this.setBall(b.x, b.y, b.z, b.mode === 'lane');
    this.extendTrack(b.x, b.z, b.mode === 'lane');
    if (b.mode === 'gone' || b.mode === 'pit') this.alley.ball.visible = b.y > -0.02;
    this.copyPinsFromSim();
    this.onEvents(ev);
    // camera: chase the ball from above and behind (the track shows the hook), then stop at the
    // deck for the close-up as the ball rolls in
    const f = Phaser.Math.Clamp((HEAD_Z + 7.5 - b.z) / 5, 0, 1);
    const ff = f * f * (3 - 2 * f);
    this.deckCam(false);
    if (slow) this.goalPos.set(0.3, 0.5, HEAD_Z + 1.85);
    const deckPos = this.goalPos.clone(), deckLook = this.goalLook.clone();
    const chaseZ = Math.max(b.z + 3.2 - ff * 0.6, deckPos.z);
    this.goalPos.set(b.x * 0.4 * (1 - ff) + deckPos.x * ff, 1.15 + (deckPos.y - 1.15) * ff, slow ? deckPos.z : chaseZ);
    this.goalLook.set(b.x * 0.3 * (1 - ff) + deckLook.x * ff, 0.0 + deckLook.y * ff, (b.z - 5) * (1 - ff) + deckLook.z * ff);
    this.camRate = this.phaseT < 0.4 ? 3 : 6;
    this.world.followSun(new THREE.Vector3(b.x, 0, Math.max(b.z, HEAD_Z - 0.4)));
    if (this.bowler.clip === 'interact-right' && this.phaseT > 0.9) this.bowler.play('idle', { fade: 0.4 });
    if (this.sim.done() || this.phaseT > 16) this.onSettled();
  }

  /** A flat ribbon along points on the boards (the ball's track, Easy's predicted path). */
  private makeRibbon(color: number, opacity: number): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACK_MAX * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRACK_MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false;
    m.renderOrder = 5;
    m.userData.ownMaterial = true;
    this.world.scene.add(m);
    return m;
  }

  /** Lays a ribbon of half-width w through the points (from index `from` on). */
  private layRibbon(m: THREE.Mesh, pts: THREE.Vector2[], w: number, from = 0, y = 0.003): void {
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(TRACK_MAX, pts.length);
    for (let i = Math.max(0, from); i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dx = q.x - o.x, dz = q.y - o.y, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l * w, nz = dx / l * w;
      pos.setXYZ(i * 2, p.x + nx, y, p.y + nz);
      pos.setXYZ(i * 2 + 1, p.x - nx, y, p.y - nz);
    }
    pos.needsUpdate = true;
    m.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  /** Adds the ball's spot to the ribbon on the boards (the hook shows as a curve). */
  private extendTrack(x: number, z: number, onLane: boolean): void {
    const pts = this.trackPts;
    const last = pts[pts.length - 1];
    if (!onLane || z > -0.2 || z < HEAD_Z + 0.4) return;
    if (last && last.y - z < 0.25) return;
    if (pts.length >= TRACK_MAX) return;
    pts.push(new THREE.Vector2(x, z));
    this.layRibbon(this.track, pts, 0.025, pts.length - 2);
  }

  private record(): void {
    const b = this.sim.ball, q = this.ballQ;
    const f = new Float32Array(7 + 70);
    f.set([b.x, b.y, b.z, q.x, q.y, q.z, q.w]);
    this.sim.pins.forEach((p, i) => f.set([p.px, p.py, p.pz, p.qx, p.qy, p.qz, p.qw], 7 + i * 7));
    this.recording.push(f);
  }

  private onEvents(ev: StepEvents): void {
    const now = this.time.now;
    const sx = this.world.toScreen(new THREE.Vector3(ev.x, 0.2, HEAD_Z)).x;
    if (ev.gutter && !this.gutterBall) {
      this.gutterBall = true;
      this.sfx('gutter', { volume: 0.7 });
      this.shakeAmp = Math.max(this.shakeAmp, 0.008);
    }
    if (ev.ballPin > 1.2 && !this.firstHit) {
      this.firstHit = true;
      const down = this.predicted ? this.predicted.standing.filter((s, i) => !s && this.standingBefore[i]).length : 5;
      this.sfxAt('crash', sx, { volume: Math.min(1, 0.3 + down * 0.07), exact: true });
      this.sfxAt('hit', sx, { volume: 0.9 });
      const b = this.sim.ball;
      this.fx.chips(new THREE.Vector3(b.x, 0.12, b.z - BALL_R), 8 + down * 2, 1.2 + down * 0.15);
      this.shakeAmp = Math.max(this.shakeAmp, 0.012 + down * 0.004);
    }
    if (ev.pinPin > 1.4 && now - this.lastKnock > 45) {
      this.lastKnock = now;
      this.sfxAt(Phaser.Utils.Array.GetRandom(['knock1', 'knock2', 'knock3', 'wood']), sx, { volume: Math.min(0.85, 0.2 + ev.pinPin * 0.05) });
    }
    if (ev.pinWall > 3 && now - this.lastKnock > 60) {
      this.lastKnock = now;
      this.sfxAt('wood', sx, { volume: Math.min(0.6, 0.15 + ev.pinWall * 0.03) });
    }
    if (ev.pit) this.sfx('thud', { volume: 0.35, rate: 0.7 });
  }

  private onSettled(): void {
    const standing = this.sim.standing();
    const before = this.standingBefore;
    const down = before.filter((s, i) => s && !standing[i]).length;
    const wasFresh = before.every((s) => s);
    const frame = this.sheet.frame;
    const kind = this.sheet.add(down);
    this.setScore(this.sheet.total());
    // which call
    let call: Call = 'count';
    if (kind === 'strike') call = 'strike';
    else if (kind === 'spare') call = this.leftSplit ? 'splitConverted' : 'spare';
    else if (this.gutterBall && down === 0) call = 'gutter';
    else if (wasFresh && isSplit(standing)) call = 'split';
    else if (down === 0) call = 'miss';
    this.lastCall = call;
    this.leftSplit = call === 'split';
    this.showCall(call, down, standing.filter(Boolean).length);
    this.rack.update(standing, call === 'split');
    this.tweens.add({ targets: this.rackChip, scale: { from: 1.15, to: 1 }, duration: 300, ease: 'Back.easeOut' });
    this.card.update(this.sheet, Math.min(this.sheet.frame, FRAMES - 1));
    for (let f = Math.max(0, frame - 2); f <= frame; f++) this.card.pulse(f);
    this.updateHudFrame();
    this.phase = 'result';
    this.phaseT = 0;
    this.timeScale = 1;
    this.deckCam(false);
    this.camRate = 3;
    // the sweep: a fresh rack next, or the standing pins lifted and set back
    this.sweepFresh = this.sheet.over || this.sheet.freshRack();
    this.sweepT = -1;
    this.sweepDone = false;
    this.sweepFast = 1;
    this.pinVis.forEach((v, i) => (v.up = standing[i]));
  }

  private updateHudFrame(): void {
    const f = Math.min(this.sheet.frame, FRAMES - 1);
    const bonus = f === FRAMES - 1 && this.sheet.ball === 2;
    this.hud.setCenter(bonus ? t('bonusBall') : t('frameShort', { n: f + 1 }));
    drawScreen(this.alley, {
      title: t('lane'),
      big: String(this.sheet.total()),
      sub: this.sheet.over ? t('gameDone') : t('frameN', { n: f + 1 }),
      color: this.lastCall === 'strike' ? '#ffd23f' : this.lastCall === 'spare' || this.lastCall === 'splitConverted' ? '#34e7ff' : '#ffffff',
      standing: this.sim.standing(),
    });
  }

  private showCall(call: Call, down: number, left: number): void {
    const deck = new THREE.Vector3(0, 0.6, HEAD_Z - 0.3);
    if (call === 'strike') {
      const streak = this.sheet.streak();
      const perfect = this.sheet.over && this.sheet.total() === 300;
      const text = perfect ? t('perfect') : streak >= 4 ? t('streakN', { n: streak }) : streak === 3 ? t('turkey') : streak === 2 ? t('double') : t('strike');
      const sub = streak === 3 ? t('turkeySub') : streak === 2 ? t('doubleSub') : t('strikeSub');
      callout(this, text, sub, '#ffd23f', streak >= 4 ? 60 : 82);
      this.fx.confetti(deck, 90 + Math.min(4, streak) * 30);
      flash(this, 0xfff2b0, 220, 0.4);
      this.shakeAmp = Math.max(this.shakeAmp, 0.03);
      this.sfx('fanfare', { exact: true, volume: 0.75 });
      this.sfx('cheer', { exact: true, volume: 0.85 });
      if (streak >= 3) this.time.delayedCall(350, () => this.sfx('bonus', { exact: true, volume: 0.6 }));
      this.neonCycle = 2.6;
      this.laneLightT = 0;
      burst(this, this.scale.width / 2, 420, [0xffd23f, 0xff3fa4, 0x34e7ff], 40, 520);
    } else if (call === 'spare' || call === 'splitConverted') {
      callout(this, t(call), t('spareSub'), '#34e7ff', 82);
      this.fx.confetti(deck, 50);
      this.sfx('spare', { exact: true, volume: 0.7 });
      this.sfx('cheer', { exact: true, volume: 0.55 });
      this.neonPulse = 1;
      burst(this, this.scale.width / 2, 420, [0x34e7ff, 0xffffff], 26, 420);
    } else if (call === 'gutter') {
      callout(this, t('gutter'), t('gutterSub'), '#ff6b6b', 76);
      this.sfx('aww', { volume: 0.8 });
      this.sfx('bad', { volume: 0.5 });
    } else if (call === 'split') {
      callout(this, t('split'), t('leftN', { n: left }), '#ff9f43', 78);
      this.sfx('aww', { volume: 0.5 });
      this.sfx('split', { volume: 0.6 });
    } else if (call === 'miss') {
      callout(this, t('miss'), t('leftN', { n: left }), '#c9cfee', 70);
      this.sfx('bad', { volume: 0.5 });
    } else {
      callout(this, t('pinsN', { n: down }), left > 0 && this.sheet.ball > 0 && !this.sheet.freshRack() ? t('leftN', { n: left }) : '', '#ffffff', 70);
      this.sfx(down >= 7 ? 'good' : 'count', { volume: 0.55 });
    }
  }

  private updateResult(): void {
    // the deck camera holds; the sweep starts while the call-out shows
    const strike = this.lastCall === 'strike';
    if (this.sweepT < 0 && this.phaseT > (strike ? 99 : 0.9)) this.startSweep();
    this.world.followSun(new THREE.Vector3(0, 0, HEAD_Z - 0.3));
    const long = this.sweepFresh ? 1.5 : 2.2;
    if (this.phaseT > (strike ? 1.4 : long)) this.afterResult(false);
  }

  private afterResult(skipped: boolean): void {
    if (this.phase !== 'result') return;
    if (this.lastCall === 'strike' && this.recording.length > 30 && !skipped) {
      this.beginReplay();
      return;
    }
    if (skipped && this.sweepT < 0) this.startSweep();
    if (this.lastCall === 'strike' || this.lastCall === 'spare' || this.lastCall === 'splitConverted' || this.lastCall === 'gutter' || this.lastCall === 'split') this.beginReact();
    else this.next();
  }

  private beginReplay(): void {
    this.phase = 'replay';
    this.phaseT = 0;
    this.replayT = 0;
    const { width } = this.scale;
    const c = this.add.container(width / 2, 300).setDepth(9000).setScrollFactor(0);
    const g = this.add.graphics();
    g.fillStyle(0xe0182d, 0.92).fillRoundedRect(-120, -28, 240, 56, 28);
    g.fillStyle(0xffffff, 1).fillCircle(-88, 0, 9);
    c.add(g);
    c.add(txt(this, 12, 1, t('replay'), { title: true, size: 30, color: '#ffffff', strokeThickness: 0 }));
    c.add(txt(this, 0, 58, t('tapSkip'), { size: 22, color: '#ffffff', strokeThickness: 5, stroke: '#140a2a' }));
    this.tweens.add({ targets: g, alpha: 0.6, duration: 450, yoyo: true, repeat: -1 });
    this.replayTag = c;
    this.camRate = 99;
  }

  private updateReplay(dt: number): void {
    this.replayT += dt * 0.45;
    const i = Math.min(this.recording.length - 1, Math.floor(this.replayT / SIM_DT));
    const f = this.recording[i];
    const a = this.alley;
    this.ballQ.set(f[3], f[4], f[5], f[6]);
    this.setBall(f[0], f[1], f[2], true);
    a.ball.visible = f[1] > -0.02;
    this.pinVis.forEach((v, k) => {
      const o = 7 + k * 7;
      v.x = f[o]; v.y = f[o + 1]; v.z = f[o + 2];
      v.q.set(f[o + 3], f[o + 4], f[o + 5], f[o + 6]);
    });
    this.drawPins();
    // a low side camera that drifts along the deck
    const k = Math.min(1, this.replayT / 1.35);
    this.goalPos.set(0.62 - k * 0.12, 0.3 + k * 0.08, HEAD_Z + 1.5 - k * 0.45);
    this.goalLook.set(-0.06, 0.17, HEAD_Z - 0.4);
    if (this.camRate === 99) { this.camPos.copy(this.goalPos); this.camLook.copy(this.goalLook); this.camRate = 8; }
    this.world.followSun(new THREE.Vector3(0, 0, HEAD_Z - 0.3));
    if (i >= this.recording.length - 1 || this.replayT > 1.35) this.endReplay();
  }

  private endReplay(): void {
    if (this.phase !== 'replay') return;
    this.replayTag?.destroy();
    this.replayTag = null;
    this.copyPinsFromSim();
    this.alley.ball.visible = false;
    this.alley.mirrorBall.visible = false;
    this.phase = 'result';
    this.lastCall = 'strike';
    this.beginReact();
  }

  /** The bowler turns to the camera and reacts; the people around join in. */
  private beginReact(): void {
    if (this.sweepT < 0) this.startSweep();
    this.phase = 'react';
    this.phaseT = 0;
    const good = this.lastCall === 'strike' || this.lastCall === 'spare' || this.lastCall === 'splitConverted';
    const bw = this.bowler;
    bw.face(0).play(this.lastCall === 'strike' ? 'jump' : good ? 'emote-yes' : 'emote-no', { fade: 0.15, restart: true });
    this.crowd.forEach((c, i) => {
      c.face(i === 2 ? 0.5 : i === 0 ? 0.2 : -0.25);
      c.play(good ? 'emote-yes' : 'emote-no', { fade: 0.2 + i * 0.1, restart: true });
    });
    const p = bw.root.position;
    this.camPos.set(p.x + 0.5, 1.25, p.z - 3.9);
    this.camLook.set(p.x + 0.2, 0.85, p.z + 1.2);
    this.goalPos.set(p.x + 0.35, 1.15, p.z - 3.4);
    this.goalLook.copy(this.camLook);
    this.camRate = 1.5;
    this.world.followSun(p.clone());
    this.alley.ball.visible = false;
    this.alley.mirrorBall.visible = false;
  }

  private updateReact(): void {
    const bw = this.bowler;
    if (this.lastCall === 'strike') {
      // hops between cheers
      const cyc = this.phaseT % 1.1;
      if (cyc < 0.42) { bw.lift = Math.sin((cyc / 0.42) * Math.PI) * 0.3; bw.play('jump', { fade: 0.08 }); }
      else { bw.lift = 0; bw.play('emote-yes', { fade: 0.12 }); }
    }
    if (this.phaseT > 1.5) this.afterReact();
  }

  private afterReact(): void {
    if (this.phase !== 'react') return;
    this.bowler.lift = 0;
    this.crowd.forEach((c) => c.play('idle', { fade: 0.3 }));
    this.next();
  }

  /** On to the next ball (or the summary). */
  private next(): void {
    if (this.sweepT < 0) this.startSweep();
    if (this.sheet.over) {
      this.phase = 'summary';
      this.phaseT = 0;
      this.deckCam(true);
      this.camRate = 2;
      this.alley.ball.visible = false;
      this.alley.mirrorBall.visible = false;
      return;
    }
    this.beginReturn();
  }

  private summary: Summary | null = null;

  private updateSummary(): void {
    if (this.summary || this.phaseT < 0.6) return;
    this.summary = new Summary(this, this.sheet, () => {
      this.phase = 'over';
      this.endGame({ win: true, title: t('gameDone'), delay: 300 });
    });
    if (this.sheet.total() >= 200) this.sfx('fanfare', { exact: true, volume: 0.7 });
    else this.sfx('good', { volume: 0.6 });
  }

  // ------------------------------------------------------------------ pinsetter

  private startSweep(): void {
    if (this.sweepT >= 0) return;
    this.sweepT = 0;
    this.sweepDone = false;
    this.sfx('whir', { volume: 0.45 });
  }

  private updateSweep(dt: number): void {
    const prev = this.sweepT;
    this.sweepT += dt;
    const s = this.sweepT;
    const a = this.alley;
    const fresh = this.sweepFresh;
    // timeline (seconds)
    const T = fresh
      ? { down: 0.35, tLow: -1, tUp: -1, back: 0.35, fwd: 0.95, set: 1.35, setUp: 1.85, rise: 2.25, end: 2.55 }
      : { down: 0.35, tLow: 0.35, tUp: 0.85, back: 1.25, fwd: 1.85, set: 2.25, setUp: 2.65, rise: 3.0, end: 3.3 };
    const lerp = (x: number, x0: number, x1: number) => Phaser.Math.Clamp((x - x0) / (x1 - x0), 0, 1);
    const ease = (k: number) => k * k * (3 - 2 * k);
    // sweep bar height and depth
    const down = ease(lerp(s, 0, T.down)) * (1 - ease(lerp(s, T.rise, T.end)));
    a.sweep.position.y = SWEEP_UP + (0.0 - SWEEP_UP) * down;
    const backK = ease(lerp(s, T.back, T.back + 0.6)) * (1 - ease(lerp(s, T.fwd, T.fwd + 0.4)));
    const sweepZ = SWEEP_Z + (PIT_Z - 0.05 - SWEEP_Z) * backK;
    a.sweep.position.z = sweepZ;
    if (prev < T.down && s >= T.down) this.sfx('clunk', { volume: 0.55 });
    // deadwood pushed into the pit
    if (s > T.back && s < T.fwd) {
      this.pinVis.forEach((v) => {
        if (!v.shown || v.up && !fresh && v.y > 0.2) return;
        if (v.z > sweepZ - 0.08 && v.y > -0.3) v.z = sweepZ - 0.08;
        if (v.z < PIT_Z) v.y = Math.max(-0.3, v.y - dt * 3);
      });
    }
    // the table: lift the standing pins, set them back; or set a new rack
    let tableY = TABLE_UP;
    if (!fresh) {
      tableY = TABLE_UP + (TABLE_DOWN - TABLE_UP) * (ease(lerp(s, T.tLow, T.tLow + 0.45)) * (1 - ease(lerp(s, T.tUp, T.tUp + 0.4))) + ease(lerp(s, T.set, T.set + 0.4)) * (1 - ease(lerp(s, T.setUp, T.setUp + 0.35))));
      const carried = s > T.tUp && s < T.setUp;
      this.pinVis.forEach((v) => {
        if (!v.up || !v.shown) return;
        if (carried || (s >= T.tLow + 0.45 && s <= T.tUp + 0.4)) {
          v.y = PIN_COM + (tableY - TABLE_DOWN);
          v.q.identity();
        }
      });
    } else {
      tableY = TABLE_UP + (TABLE_DOWN - TABLE_UP) * ease(lerp(s, T.set, T.set + 0.4)) * (1 - ease(lerp(s, T.setUp, T.setUp + 0.35)));
      if (s >= T.set && prev < T.set) {
        // the new rack rides down under the table
        this.sim.rack(null, ++this.rackSeed);
        this.copyPinsFromSim();
        this.pinVis.forEach((v) => (v.up = true));
      }
      if (s >= T.set && s < T.setUp + 0.05) this.pinVis.forEach((v) => (v.y = PIN_COM + Math.max(0, tableY - TABLE_DOWN)));
    }
    a.table.position.y = tableY;
    if (prev < (fresh ? T.set + 0.4 : T.set + 0.4) && s >= T.set + 0.4) this.sfx('clack', { volume: 0.4, rate: 0.8 });
    if (s >= T.end) {
      this.sweepT = -1;
      this.sweepDone = true;
      a.sweep.position.set(0, SWEEP_UP, SWEEP_Z);
      a.table.position.y = TABLE_UP;
      if (!fresh) this.sim.rack(this.pinVis.map((v) => v.up), ++this.rackSeed);
      this.copyPinsFromSim();
      this.pinVis.forEach((v, i) => (v.up = this.sim.pins[i].live));
      this.rack.update(this.sim.standing(), this.leftSplit && !fresh);
    }
  }

  // ------------------------------------------------------------------ look and sound

  private updateNeon(dt: number): void {
    const a = this.alley;
    this.neonPulse = Math.max(0, this.neonPulse - dt * 1.4);
    this.neonCycle = Math.max(0, this.neonCycle - dt);
    const c = new THREE.Color();
    a.neon.forEach((n, i) => {
      if (this.neonCycle > 0) {
        c.setHSL((this.elapsed * 1.4 + i * 0.25) % 1, 1, 0.6);
        n.mat.color.copy(c);
      } else {
        n.mat.color.copy(n.base).lerp(new THREE.Color(0xffffff), this.neonPulse * 0.6);
      }
    });
    for (const g of a.glows) (g.material as THREE.MeshBasicMaterial).opacity = 0.45 + this.neonPulse * 0.4 + (this.neonCycle > 0 ? 0.25 + Math.sin(this.elapsed * 14) * 0.15 : 0);
    // lane lights run towards the pins after a strike
    if (this.laneLightT >= 0) {
      this.laneLightT += dt;
      a.laneLights.opacity = Math.max(0, Math.sin(this.laneLightT * 12)) * Math.max(0, 1 - this.laneLightT / 2.5);
      a.laneLights.color.setHSL((this.laneLightT * 0.6) % 1, 1, 0.6);
      if (this.laneLightT > 2.5) { this.laneLightT = -1; a.laneLights.opacity = 0; }
    }
  }

  private updateCamera(dt: number): void {
    if (this.camLock) { this.goalPos.copy(this.camLock[0]); this.goalLook.copy(this.camLock[1]); this.camPos.copy(this.camLock[0]); this.camLook.copy(this.camLock[1]); }
    const k = this.camRate >= 99 ? 1 : 1 - Math.exp(-dt * this.camRate);
    this.camPos.lerp(this.goalPos, k);
    this.camLook.lerp(this.goalLook, k);
    if (this.camRate >= 99) this.camRate = 4;
    const cam = this.world.camera;
    cam.position.copy(this.camPos);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 0.08);
    if (this.shakeAmp > 0.0005) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmp * 2;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmp * 2;
    }
    cam.lookAt(this.camLook);
    if (this.phase === 'aim' || this.phase === 'return' || this.phase === 'approach') this.world.followSun(new THREE.Vector3(this.ballX, 0, STANCE_Z - 1.2));
  }

  private updateRollSound(): void {
    const s = this.rollSound;
    if (!s) return;
    const b = this.sim.ball;
    const rolling = this.phase === 'roll' && (b.mode === 'lane' || b.mode === 'gutter');
    const v = rolling ? Math.hypot(b.vx, b.vz) : 0;
    // louder as the camera chases it, a duller tone in the gutter
    s.setVolume(rolling ? Math.min(0.75, v / 9 * 0.8) * (0.5 + this.timeScale * 0.5) : 0);
    s.setRate((b.mode === 'gutter' ? 0.55 : 0.7) + Math.min(1, v / 10) * 0.6);
  }

  // ------------------------------------------------------------------ test hooks

  /** Test hook: bowl at once (from the aim). */
  testThrow(x: number, angle: number, speed: number, hook: number): boolean {
    if (this.phase === 'intro') this.endIntro();
    if (this.phase === 'return') { this.bowler.play('holding-right', { fade: 0 }); this.beginAim(); }
    if (!this.canAim()) return false;
    this.ballX = x;
    this.angle = angle;
    this.hook = hook;
    this.throwBall({ x, angle, speed, hook });
    return true;
  }

  /** Test hook: the bot's line to the pocket from x (offset moves the target). */
  testBot(x = 0.25, speed = 8, hook = 0.6, offset = 0): boolean {
    const a = aimFor(this.simTune, x, speed, hook, 0.064 * Math.sign(hook || 1) + offset);
    return this.testThrow(x, a, speed, hook);
  }

  /** Test hook: run the game for `sec` seconds of game time without rendering each step. */
  testStep(sec: number): void {
    const n = Math.ceil(sec / 0.05);
    for (let i = 0; i < n && !this.isOver; i++) this.updateGame(0, 50);
  }

  /** Test hook: the state. */
  testState(): { phase: Phase; frame: number; ball: number; total: number; standing: boolean[]; marks: string[][]; ballZ: number; sweep: boolean; call: Call } {
    return {
      phase: this.phase, frame: this.sheet.frame, ball: this.sheet.ball, total: this.sheet.total(), standing: this.sim.standing(),
      marks: Array.from({ length: FRAMES }, (_, f) => this.sheet.marks(f)), ballZ: this.sim.ball.z, sweep: this.sweepT >= 0, call: this.lastCall,
    };
  }

  /** Test hook: fill the card with balls (pins per ball) and skip to the next ball. */
  testScore(balls: number[]): void {
    for (const b of balls) if (!this.sheet.over) this.sheet.add(b);
    this.setScore(this.sheet.total());
    this.card.update(this.sheet, Math.min(this.sheet.frame, FRAMES - 1));
    this.updateHudFrame();
    if (this.sheet.over) this.next();
    else if (!this.sheet.freshRack()) {
      // leave the pins the last ball left (the first ones of the rack)
      const up = this.sheet.pinsUp();
      const keep = SPOTS.map((_, i) => i >= 10 - up);
      this.sim.rack(keep, ++this.rackSeed);
      this.copyPinsFromSim();
    }
  }

  /** Test hook: hold the camera at a spot (null releases it). */
  testCam(p: number[] | null, l?: number[]): void {
    this.camLock = p && l ? [new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(l[0], l[1], l[2])] : null;
  }

  /** Test hook: point the camera at a phase's view at once. */
  testSnap(): void {
    this.camPos.copy(this.goalPos);
    this.camLook.copy(this.goalLook);
  }
}
