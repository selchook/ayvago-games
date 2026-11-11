import Phaser from 'phaser';
import { ArcadeScene, t, txt, flash, burst, isEasy, hudChip, HudChip, HUD_MARGIN, HUD_ROW2_Y, popup } from '@core';
import { World3D, THREE, playerCharacter3d, miniKey } from '@core/three';
import {
  LaneSim, SIM_DT, LANE_HALF, HEAD_Z, PIT_Z, BALL_R, PIN_COM, PIN_H, SPOTS, OIL_LEN, isSplit, newEvents, ballPath, POCKET_X, SPIN_MAX,
  type Release, type SimTune, type StepEvents,
} from './sim';
import { ScoreSheet, FRAMES } from './scoring';
import { buildAlley, drawScreen, canvasTex, type Alley, RETURN_X, HOOD_Z, RACK_END_Z, RACK_Y, PITCH, APPROACH } from './alley';
import { Person } from './bowler';
import { Particles } from './fx3d';
import { scorecardChip, callout, Summary, RackView, type CardView } from './panels';
import { aimBoards } from './bot';
import { TUNING, type Tuning } from './tuning';
import {
  ARROWS, LAY_Z, STAND_MAX, STAND_MIN, arrowZ, arrowTipZ, boardX, breakpoint, clampAim, releaseFor, targetFor, tipFor, xBoard, type Tip,
} from './aim';
import { approachPose, poseBowler, PHASE0, WALK_D, RELEASE_T, RISE_T } from './approach';
import { AimChip, SpinControl, SpeedChip, LaneViewButton, OilChip, TipChip, fmtBoard } from './controls';

export { TUNING } from './tuning';
export type { Tuning } from './tuning';

export const SPEED_MIN = 5.4;
export const SPEED_MAX = 9.6;
const X_MAX = LANE_HALF - 0.08;
const ANGLE_MAX = 0.07;
/** Sweep bar and setting table rest heights. */
const SWEEP_UP = 0.95;
const SWEEP_Z = HEAD_Z + 0.36;
const TABLE_UP = 1.25;
const TABLE_DOWN = PIN_H + 0.045;
/** Finger travel (px) per board when dragging the stand or the target (twice as much when dragging slowly). */
const PX_PER_BOARD = 15;
/** Spin steps of the ◀ ▶ buttons. */
const SPIN_STEP = 0.25;
/** Where the bowler picks the ball up from the return (facing it), and the walking speed. */
const PICK = new THREE.Vector3(RETURN_X + 0.66, 0, RACK_END_Z - 0.02);
const WALK_V = 2.5;
const DEG = Math.PI / 180;

type Phase = 'intro' | 'return' | 'aim' | 'approach' | 'roll' | 'result' | 'replay' | 'react' | 'summary' | 'over';
type Call = 'strike' | 'spare' | 'split' | 'splitConverted' | 'gutter' | 'miss' | 'count';
type BallMode = 'hidden' | 'hand' | 'flight' | 'free';

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  mode: 'none' | 'stand' | 'target' | 'throw';
  /** What a sideways drag moves (picked from where the finger landed). */
  drag: 'stand' | 'target';
  value: number;
  fine: boolean;
  path: { x: number; y: number; t: number }[];
  throwFrom: number;
}

interface PinVis {
  x: number; y: number; z: number;
  q: THREE.Quaternion;
  shown: boolean;
  up: boolean;
}

/** One step of the walk back to the ball return and the stance. */
type ReturnStep = 'turn' | 'walk' | 'face' | 'pick' | 'stance' | 'done';

const SPECTATORS = ['character-male-a', 'character-male-c', 'character-male-e'];
/** Points in the ball's track ribbon (one every 0.25 m). */
const TRACK_MAX = 90;

/** When the finger really moved (the DOM event's time; the game may handle it a frame later). */
const stamp = (p: Phaser.Input.Pointer): number => (p.event as Event | undefined)?.timeStamp || performance.now();
const smooth = (a: number, b: number, x: number) => { const k = Phaser.Math.Clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const angleTo = (from: number, to: number) => Phaser.Math.Angle.Wrap(to - from);

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
  private crowdLife: { t: number; shift: number; yaw: number; cheer: number; base: number }[] = [];
  private phase: Phase = 'intro';
  private phaseT = 0;

  // the line: the board the ball is laid down on and the target board at the arrows
  stand = 12;
  target = 9;
  /** The spin the player set (−1 backup … 1 big hook to the left). */
  private hook = 0.35;
  /** The hook of the throw being made (the setting plus a curved flick). */
  private liveHook = 0.35;
  /** Ball speed (m/s): the last throw's, or the one being chosen. */
  private speed = 7.6;
  private power = 0.5;
  private charging = false;
  private chargeT = 0;
  private stage: 'stand' | 'target' = 'stand';
  private keyRepeat = 0;
  private laneView = false;
  private gesture: Gesture | null = null;
  private release: Release | null = null;
  private released = false;
  private ballMode: BallMode = 'hidden';
  private flight: { from: THREE.Vector3; t: number; dur: number } | null = null;
  private standingBefore: boolean[] = new Array(10).fill(true);
  private leftSplit = false;
  private rackSeed = 1;
  private acc = 0;
  private timeScale = 1;
  private gutterBall = false;
  private firstHit = false;
  private ballQ = new THREE.Quaternion();
  private lastCall: Call = 'count';
  /** Seconds since the throw began (the bowler's approach and follow-through timeline). */
  private throwT = -1;
  private gaitDone = 0;
  private steps = 0;
  /** The ball's x on its way to the arrows, the bowler's place relative to it at the release. */
  private relOff = new THREE.Vector3(0.33, 0.14, -0.3);
  private stanceZ = 3.75;
  /** The ball's x relative to the bowler's feet last frame; where the hand let go, relative to the laying point. */
  private handOffX = NaN;
  private releaseGap: number[] = [];
  private bowlerX = 0;
  // the walk back
  private retStep: ReturnStep = 'done';
  private retT = 0;
  // coaching
  private strikeLine: { stand: number; target: number } | null = null;
  private strikeTip: Tip | null = null;
  private lastThrow: { stand: number; target: number; speed: number; hook: number; fresh: boolean } | null = null;
  private pendingTip: { stand: number; target: number } | null = null;

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
  private guideKey = '';
  /** The ball's track on the boards (a glowing ribbon that shows the hook). */
  private track!: THREE.Mesh;
  private trackPts: THREE.Vector2[] = [];
  /** The aim line (stand → target arrow) and the predicted path beyond it. */
  private aimLine!: THREE.Mesh;
  private pathRibbon!: THREE.Mesh;
  private standMark!: THREE.Mesh;
  private targetMark!: THREE.Mesh;
  private targetDot!: THREE.Mesh;
  private breakMark!: THREE.Mesh;
  private oilSheen!: THREE.Mesh;
  private spinRing!: THREE.Mesh;
  private guidePulse = 0;

  // UI
  private card!: CardView;
  private cardChip!: HudChip;
  private hint!: Phaser.GameObjects.Text;
  private rack!: RackView;
  private rackChip!: HudChip;
  private aimChip!: AimChip;
  private spinCtl!: SpinControl;
  private speedChip!: SpeedChip;
  private laneBtn!: LaneViewButton;
  private oilChip!: OilChip;
  private tipChip!: TipChip;
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
    this.stand = 12;
    this.target = 9;
    this.hook = this.liveHook = 0.35;
    this.speed = 7.6;
    this.power = 0.5;
    this.charging = false;
    this.chargeT = 0;
    this.stage = 'stand';
    this.keyRepeat = 0;
    this.laneView = false;
    this.gesture = null;
    this.release = null;
    this.released = false;
    this.ballMode = 'hidden';
    this.flight = null;
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
    this.crowdLife = [];
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
    this.camRate = 4;
    this.throwT = -1;
    this.retStep = 'done';
    this.strikeLine = null;
    this.strikeTip = null;
    this.lastThrow = null;
    this.pendingTip = null;

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
    this.measureRelease();
    this.bowler.face(0).play('idle', { fade: 0 });
    this.bowlerX = this.standX();
    this.placeBowler();
    const spots: [number, number, number][] = [[1.05, APPROACH + 1.2, -0.25], [1.85, APPROACH + 0.9, -0.45], [PITCH * 2 + 0.2, 1.4, 0]];
    SPECTATORS.forEach((name, i) => {
      const p = new Person(miniKey(name));
      const [x, z, yaw] = spots[i];
      p.root.position.set(x, 0, z);
      p.face(yaw);
      p.play('idle', { fade: 0, at: Math.random(), speed: 0.8 + Math.random() * 0.4 });
      this.world.scene.add(p.root);
      this.crowd.push(p);
      this.crowdLife.push({ t: Math.random() * 3, shift: 0, yaw, cheer: 0, base: yaw });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bowler.dispose();
      this.crowd.forEach((c) => c.dispose());
      this.fx.clear();
      this.rollSound?.stop();
      this.rollSound?.destroy();
      this.rollSound = null;
    });

    this.buildGuides();

    // UI
    const { width, height } = this.scale;
    const sc = scorecardChip(this, HUD_ROW2_Y + 24);
    this.card = sc.card;
    this.cardChip = sc.chip;
    this.card.update(this.sheet, 0);
    this.hud.setCenter(t('frameShort', { n: 1 }));
    this.rack = new RackView(this);
    const row3 = HUD_ROW2_Y + 24 + this.card.h / 2 + 72;
    this.rackChip = hudChip(this, width - HUD_MARGIN, row3, { align: 'right', items: [this.rack.g], height: 96 });
    this.rack.update(this.sim.standing());
    this.oilChip = new OilChip(this, HUD_MARGIN, row3 - 22);
    this.laneBtn = new LaneViewButton(this, HUD_MARGIN, row3 + 44, () => this.toggleLaneView());
    this.tipChip = new TipChip(this, width / 2, row3 + 104);
    this.hint = txt(this, width / 2, height - 300, '', { size: 25, color: '#ffffff', strokeThickness: 6, stroke: '#140a2a', wrap: 660 }).setDepth(9000).setScrollFactor(0);
    this.aimChip = new AimChip(this, width / 2, height - 190);
    this.spinCtl = new SpinControl(this, HUD_MARGIN, height - 90, (d) => this.stepSpin(d));
    this.speedChip = new SpeedChip(this, width - HUD_MARGIN, height - 90);
    this.trail = this.add.graphics().setDepth(8900).setScrollFactor(0);
    this.showAimUi(false);
    this.oilChip.set(this.simTune.oil ?? OIL_LEN);
    this.layOil();
    this.updateAimUi();
    drawScreen(this.alley, { title: t('lane'), big: '0', sub: t('frameN', { n: 1 }), color: '#ffd23f' });

    // input
    this.input.addPointer(1);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.keys = this.input.keyboard!.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,ENTER,Z,X,SHIFT,V,H') as Record<string, Phaser.Input.Keyboard.Key>;

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

  // ------------------------------------------------------------------ the bowler

  /**
   * Puts the bowler in the release pose once and measures where the ball sits relative to his
   * feet, so the stance can be placed for the ball to leave the hand exactly over the chosen
   * board, a hand's length behind the point where the simulation lays it on the boards.
   */
  private measureRelease(): void {
    const b = this.bowler;
    b.root.position.set(0, 0, 0);
    b.face(0);
    b.gaitPhase(PHASE0);
    b.walk(WALK_D, { fade: 0 });
    poseBowler(b, RELEASE_T);
    b.update(0);
    const at = b.ballAt(new THREE.Vector3());
    this.relOff.copy(at);
    const d = approachPose(RELEASE_T).d;
    // the hand lets go ~12 cm behind the laying point; the slide foot stays behind the foul line
    this.stanceZ = LAY_Z + 0.12 - at.z + d;
    b.gaitPhase(0);
    b.relax();
  }

  /** The bowler's x for the chosen stand (the ball leaves the hand over that board). */
  private standX(): number {
    return boardX(this.stand) - this.relOff.x;
  }

  private placeBowler(z = this.stanceZ): void {
    this.bowler.root.position.set(this.bowlerX, 0, z);
  }

  /** The ball follows the hand (after the bowler's pose for this frame). */
  private ballFollow(dt: number): void {
    if (this.ballMode === 'hand') {
      const p = this.bowler.ballAt(new THREE.Vector3());
      this.handOffX = p.x - this.bowler.root.position.x;
      this.ballQ.copy(this.bowler.ballQuat());
      this.setBall(p.x, p.y, p.z, false);
    } else if (this.ballMode === 'flight' && this.flight && this.release) {
      // from the hand to the boards: a few centimetres at the ball's speed, then the sim takes over
      const f = this.flight;
      f.t += dt;
      const r = this.release;
      const k = Math.min(1, f.t / f.dur);
      const x = f.from.x + (r.x - f.from.x) * k;
      const z = f.from.z + (LAY_Z - f.from.z) * k;
      const y = f.from.y + (BALL_R - f.from.y) * k * k;
      // the spin it left the hand with
      const w = new THREE.Vector3(-Math.cos(r.angle) * r.speed / BALL_R * 0.22, r.hook * 8, r.hook * SPIN_MAX * this.simTune.hook);
      const wl = w.length();
      if (wl > 1e-4) this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(w.normalize(), wl * dt));
      this.setBall(x, y, z, false);
      if (k >= 1) this.landBall(f.t - f.dur);
    }
  }

  // ------------------------------------------------------------------ helpers

  private stanceCam(): void {
    const bx = this.bowlerX, bz = this.stanceZ;
    if (this.laneView) {
      // low over the foul line: the arrows and the pins
      const x = (boardX(this.stand) + boardX(this.target)) * 0.25;
      this.goalPos.set(x, 1.3, 0.55);
      this.goalLook.set(x * 0.3, 0.0, -8.5);
    } else {
      // behind and above the bowler's right shoulder: the bowler low left, the lane and arrows up the middle
      this.goalPos.set(bx + 0.85, 1.55, bz + 1.85);
      this.goalLook.set(bx * 0.2 + 0.05, 0.0, -6);
    }
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

  private hideBall(): void {
    this.ballMode = 'hidden';
    this.alley.ball.visible = false;
    this.alley.mirrorBall.visible = false;
    this.spinRing.visible = false;
  }

  /** The release the current line, spin and speed make. */
  private currentRelease(speed = this.speed, hook = this.liveHook): Release {
    return releaseFor(this.stand, this.target, speed, hook);
  }

  private kmh(speed: number): number {
    return speed * 3.6;
  }

  private updateAimUi(): void {
    const touch = this.sys.game.device.input.touch && !this.keysUsed;
    this.aimChip.set(this.stand, this.target, touch ? null : this.stage);
    this.spinCtl.set(this.liveHook);
    const k = (this.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
    this.speedChip.set(this.kmh(this.speed), Phaser.Math.Clamp(k, 0, 1), this.charging || this.gesture?.mode === 'throw');
  }
  private keysUsed = false;

  private showAimUi(on: boolean): void {
    this.aimChip.chip.setVisible(on);
    this.spinCtl.chip.setVisible(on);
    this.speedChip.chip.setVisible(on);
    this.laneBtn.chip.setVisible(on);
    if (!on) this.tipChip.hide();
  }

  private stepSpin(dir: number): void {
    if (!this.canAim()) return;
    this.hook = Phaser.Math.Clamp(Math.round((this.hook + dir * SPIN_STEP) / SPIN_STEP) * SPIN_STEP, -1, 1);
    this.liveHook = this.hook;
    this.sfx('tick', { volume: 0.4 });
    this.updateAimUi();
  }

  private toggleLaneView(): void {
    this.laneView = !this.laneView;
    this.laneBtn.set(this.laneView);
    this.sfx('tick', { volume: 0.4 });
    this.camRate = 4;
  }

  /** Sets the stand or the target to a board (snapped to whole or half boards); the other stays put. */
  private moveAim(which: 'stand' | 'target', value: number, step: number): void {
    const v = Math.round(value / step) * step;
    const [ns, nt] = which === 'stand' ? clampAim(v, this.target) : clampAim(this.stand, v);
    if (ns === this.stand && nt === this.target) return;
    this.stand = ns;
    this.target = nt;
    this.sfx('tick', { volume: 0.25, rate: which === 'stand' ? 1 : 1.3 });
    if (this.tipChip.shown && this.pendingTip && (this.pendingTip.stand !== ns || this.pendingTip.target !== nt)) this.tipChip.hide();
    this.updateAimUi();
  }

  // ------------------------------------------------------------------ 3D guides

  private buildGuides(): void {
    const scene = this.world.scene;
    const glow = (c: number, o = 0.85) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    const flat = (m: THREE.Mesh, order = 4) => { m.frustumCulled = false; m.renderOrder = order; m.userData.ownMaterial = true; m.visible = false; scene.add(m); return m; };
    // the stand: a chevron on the approach just behind the foul line, pointing down the lane
    const chev = new THREE.Shape();
    chev.moveTo(0, 0.13); chev.lineTo(0.075, -0.02); chev.lineTo(0.045, -0.05); chev.lineTo(0, 0.04); chev.lineTo(-0.045, -0.05); chev.lineTo(-0.075, -0.02);
    chev.closePath();
    this.standMark = flat(new THREE.Mesh(new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2), glow(0xffd23f, 0.95)));
    // the target: the lane arrow lit up (a copy of its shape, a little larger)
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 0.2); arrow.lineTo(-0.036, -0.075); arrow.lineTo(0.036, -0.075); arrow.closePath();
    this.targetMark = flat(new THREE.Mesh(new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2), glow(0xffd23f, 0.95)));
    this.targetMark.material = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    this.targetMark.scale.set(1.5, 1, 1.25);
    this.targetDot = flat(new THREE.Mesh(new THREE.CircleGeometry(0.03, 4).rotateX(-Math.PI / 2), glow(0xffd23f, 0.95)));
    this.targetDot.scale.set(1.3, 1, 2);
    // the breakpoint: a ring on the boards
    this.breakMark = flat(new THREE.Mesh(new THREE.RingGeometry(0.075, 0.11, 32).rotateX(-Math.PI / 2), glow(0xff3fa4, 0.95)), 6);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16).rotateX(-Math.PI / 2), glow(0xff3fa4, 0.95));
    dot.userData.ownMaterial = true;
    this.breakMark.add(dot);
    this.breakMark.scale.set(1, 1, 2.2);
    this.aimLine = this.makeRibbon(0xffd23f, 0.6);
    this.pathRibbon = this.makeRibbon(0x7dff9a, 0.55);
    this.track = this.makeRibbon(0x34e7ff, 0.5);
    this.trackPts = [];
    // the oil: a faint sheen over the oiled boards, fading where the pattern ends
    const oilTex = canvasTex('oil', 64, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)');
      gr.addColorStop(0.03, 'rgba(255,255,255,0.75)');
      gr.addColorStop(0.82, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      // heavier in the middle boards, lighter outside (a house shot)
      const side = g.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, 'rgba(0,0,0,0.75)');
      side.addColorStop(0.3, 'rgba(0,0,0,0.15)');
      side.addColorStop(0.7, 'rgba(0,0,0,0.15)');
      side.addColorStop(1, 'rgba(0,0,0,0.75)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = side;
      g.fillRect(0, 0, w, h);
    });
    const oilMat = new THREE.MeshBasicMaterial({ map: oilTex, color: 0xbfe8ff, transparent: true, opacity: 0.13, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    this.oilSheen = new THREE.Mesh(new THREE.PlaneGeometry(LANE_HALF * 2 - 0.01, 1).rotateX(-Math.PI / 2).translate(0, 0.0012, -0.5), oilMat);
    this.oilSheen.renderOrder = 2;
    this.oilSheen.userData.ownMaterial = true;
    scene.add(this.oilSheen);
    // the spin ring: a thin glowing band round the ball, square to its spin axis
    this.spinRing = new THREE.Mesh(new THREE.TorusGeometry(BALL_R * 1.01, 0.0045, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    this.spinRing.userData.ownMaterial = true;
    this.spinRing.renderOrder = 7;
    this.spinRing.visible = false;
    scene.add(this.spinRing);
  }

  /** The oil sheen reaches as far as the oil does (plus its fade). */
  private layOil(): void {
    const oil = this.simTune.oil ?? OIL_LEN;
    this.oilSheen.scale.z = oil + 1.6;
    // a worn pattern is shorter and thinner
    (this.oilSheen.material as THREE.MeshBasicMaterial).opacity = 0.14 * (0.55 + 0.45 * Math.max(0, (oil - 9) / (OIL_LEN - 9)));
  }

  private hideGuides(): void {
    this.standMark.visible = this.targetMark.visible = this.targetDot.visible = this.breakMark.visible = false;
    this.aimLine.geometry.setDrawRange(0, 0);
    this.pathRibbon.geometry.setDrawRange(0, 0);
    this.guideKey = '';
  }

  /**
   * The aim: the stand chevron, the lit target arrow and the line through them, and the hook:
   * Normal shows the path up to the breakpoint and marks it; Easy the whole path, coloured.
   */
  private drawGuides(): void {
    const speed = this.speed;
    const hook = this.liveHook;
    const key = `${this.stand}:${this.target}:${hook.toFixed(2)}:${speed.toFixed(1)}:${this.simTune.oil}`;
    // the marks pulse a little
    this.guidePulse += this.lastDt;
    const pulse = 0.75 + Math.sin(this.guidePulse * 6) * 0.2;
    (this.targetMark.material as THREE.MeshBasicMaterial).opacity = pulse;
    (this.breakMark.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(this.guidePulse * 5) * 0.3;
    if (key === this.guideKey) return;
    this.guideKey = key;
    const xs = boardX(this.stand), xt = boardX(this.target);
    this.standMark.position.set(xs, 0.004, 0.32);
    this.standMark.visible = true;
    const onArrow = ARROWS.includes(this.target);
    this.targetMark.visible = onArrow;
    this.targetDot.visible = !onArrow;
    if (onArrow) this.targetMark.position.set(xt, 0.003, arrowZ(this.target));
    else this.targetDot.position.set(xt, 0.003, arrowTipZ(this.target) + 0.05);
    // the straight line from the stand through the target, to the arrows
    const r = this.currentRelease(speed, hook);
    const zEnd = arrowTipZ(this.target) - 0.3;
    const line: THREE.Vector2[] = [];
    for (let z = 0.3; z >= zEnd; z -= 0.25) line.push(new THREE.Vector2(xs + Math.tan(r.angle) * (LAY_Z - z), z));
    this.layRibbon(this.aimLine, line, 0.012, 0, 0.0035);
    // the path the ball will take (no pins)
    const pts = ballPath(this.simTune, r, 0.25).filter((p) => p.z < -0.2 && p.z > HEAD_Z + 0.15);
    const gutter = pts.findIndex((p) => p.gutter);
    const bp = breakpoint(pts, hook);
    if (bp >= 0 && (gutter < 0 || bp < gutter)) {
      this.breakMark.position.set(pts[bp].x, 0.004, pts[bp].z);
      this.breakMark.visible = true;
    } else this.breakMark.visible = false;
    const upto = this.tune.preview ? (gutter >= 0 ? gutter + 1 : pts.length) : Math.max(0, bp >= 0 ? bp + 1 : Math.min(pts.length, 34));
    const from = pts.findIndex((p) => p.z < zEnd + 0.25);
    const lane = pts.slice(Math.max(0, from), upto).map((p) => new THREE.Vector2(p.x, p.z));
    this.layRibbon(this.pathRibbon, lane, this.tune.preview ? 0.018 : 0.01, 0, 0.004);
    const mat = this.pathRibbon.material as THREE.MeshBasicMaterial;
    if (this.tune.preview) {
      const end = pts[pts.length - 1];
      const good = gutter < 0 && end && Math.abs(Math.abs(end.x) - POCKET_X) < 0.05;
      mat.color.setHex(gutter >= 0 ? 0xff5a5a : good ? 0x7dff9a : 0xffd23f);
      mat.opacity = 0.55;
    } else {
      mat.color.setHex(gutter >= 0 && (bp < 0 || gutter < bp) ? 0xff5a5a : 0xff7ac8);
      mat.opacity = 0.6;
    }
  }

  // ------------------------------------------------------------------ input

  private canAim(): boolean {
    return this.phase === 'aim' && this.sweepDone;
  }

  /** Screen y of the target row (the arrows) and of the stand row (the foul line). */
  private aimRows(): { target: number; stand: number } {
    const a = this.world.toScreen(new THREE.Vector3(boardX(this.target), 0, arrowZ(this.target)));
    const s = this.world.toScreen(new THREE.Vector3(boardX(this.stand), 0, 0.3));
    return { target: a.y, stand: s.visible ? s.y : this.scale.height };
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length || this.isOver) return;
    if (this.phase === 'intro' || this.phase === 'result' || this.phase === 'replay' || this.phase === 'react') {
      this.skip();
      return;
    }
    if (this.phase === 'return') this.skip();
    if (!this.canAim()) return;
    if (this.gesture) return;
    // a sideways drag moves what is nearest the finger: the target near the arrows, else the stand
    const rows = this.aimRows();
    const split = rows.target + (rows.stand - rows.target) * 0.45;
    const drag = p.y < split ? 'target' : 'stand';
    this.keysUsed = false;
    this.gesture = { id: p.id, x0: p.x, y0: p.y, mode: 'none', drag, value: drag === 'stand' ? this.stand : this.target, fine: false, path: [{ x: p.x, y: p.y, t: stamp(p) }], throwFrom: 0 };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    if (!g || p.id !== g.id || !p.isDown) return;
    const prev = g.path[g.path.length - 1];
    g.path.push({ x: p.x, y: p.y, t: stamp(p) });
    if (g.path.length > 240) g.path.splice(0, g.path.length - 240);
    if (g.mode === 'throw') {
      this.readFlick(false);
      return;
    }
    const dx = p.x - g.x0, dy = p.y - g.y0;
    // recent upward motion turns a drag into a throw
    const back = g.path[Math.max(0, g.path.length - 6)];
    const up = back.y - p.y, side = Math.abs(p.x - back.x);
    if ((g.mode === 'none' && -dy > 26 && -dy > Math.abs(dx) * 0.9) || (g.mode !== 'none' && up > 34 && up > side * 1.2)) {
      g.mode = 'throw';
      // the flick starts where the finger began to move up
      let k = g.path.length - 1;
      while (k > 0 && g.path[k - 1].y > g.path[k].y + 0.5) k--;
      g.throwFrom = k;
      this.hint.setText('');
      this.readFlick(false);
      return;
    }
    if (g.mode === 'none' && Math.abs(dx) > 12) g.mode = g.drag;
    if (g.mode === 'stand' || g.mode === 'target') {
      // a slow drag moves half as far per pixel and snaps to half boards
      const ddx = p.x - prev.x;
      const dtm = Math.max(1, g.path[g.path.length - 1].t - prev.t);
      const slow = Math.abs(ddx) / dtm * 1000 < 160;
      g.fine = slow;
      // boards count from the right: a drag to the right lowers the board
      g.value -= ddx / PX_PER_BOARD * (slow ? 0.5 : 1);
      this.moveAim(g.mode, g.value, slow ? 0.5 : 1);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const g = this.gesture;
    if (!g || p.id !== g.id) return;
    this.trail.clear();
    if (g.mode !== 'throw') { this.gesture = null; this.updateAimUi(); return; }
    const f = this.readFlick(true);
    this.gesture = null;
    if (!f || !this.canAim()) {
      if (this.canAim()) popup(this, this.scale.width / 2, this.scale.height - 360, t('flickMore'), '#ffd23f', 30);
      this.liveHook = this.hook;
      this.guideKey = '';
      this.updateAimUi();
      return;
    }
    this.throwBall(this.currentRelease(f.speed, this.liveHook));
  }

  /**
   * Reads the flick so far: speed from its last 0.11 s (and its average), extra hook from its
   * bend (a forgiving dead zone, added to the spin set on the control). Its direction does not
   * steer: the line is the stand and the target.
   */
  private readFlick(final: boolean): { speed: number } | null {
    const g = this.gesture ?? null;
    if (!g) return null;
    const pts = g.path.slice(g.throwFrom);
    if (pts.length < 2) return null;
    const a = pts[0], b = pts[pts.length - 1];
    const cx = b.x - a.x, cy = b.y - a.y;
    const len = Math.hypot(cx, cy);
    // bend: the furthest point right (+) or left (-) of the chord
    let dev = 0;
    if (len > 30) {
      for (const q of pts) {
        const d = ((q.x - a.x) * -cy + (q.y - a.y) * cx) / len;   // right of the chord is +
        if (Math.abs(d) > Math.abs(dev)) dev = d;
      }
    }
    const r = len > 0 ? dev / len : 0;
    const mag = Phaser.Math.Clamp((Math.abs(r) - 0.05) / 0.2, 0, 1);
    // a flick that bows out to the right ends heading left: more left hook (positive)
    this.liveHook = Phaser.Math.Clamp(this.hook + Math.sign(r) * mag * 0.8, -1, 1);
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
    this.speed = SPEED_MIN + this.power * (SPEED_MAX - SPEED_MIN);
    // the finger's trail
    const tr = this.trail;
    tr.clear();
    tr.lineStyle(14, 0x000000, 0.25);
    tr.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y + 3)));
    const col = Phaser.Display.Color.HSLToColor(0.33 - this.power * 0.33, 0.95, 0.6).color;
    tr.lineStyle(9, col, 0.9);
    tr.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y)));
    tr.fillStyle(0xffffff, 1).fillCircle(b.x, b.y, 10);
    this.updateAimUi();
    if (!final) return null;
    if (-cy < 90 || len < 90) return null;
    return { speed: this.speed };
  }

  private skip(): void {
    if (this.phase === 'intro') {
      // a skipped fly-in cuts straight to the bowler
      this.endIntro();
      this.camPos.copy(this.goalPos);
      this.camLook.copy(this.goalLook);
    }
    else if (this.phase === 'result') this.afterResult(true);
    else if (this.phase === 'replay') this.endReplay();
    else if (this.phase === 'react') this.afterReact();
    else if (this.phase === 'return') this.finishReturn();
    this.sweepFast = 3;
  }

  // ------------------------------------------------------------------ flow

  /** The ball comes back up the return; the bowler walks back, picks it up and takes the stance. */
  private beginReturn(): void {
    this.phase = 'return';
    this.phaseT = 0;
    this.charging = false;
    this.throwT = -1;
    this.showAimUi(false);
    this.hideGuides();
    this.bowler.lift = 0;
    this.bowler.relax();
    this.bowler.setCarry(false, 0);
    this.bowler.play('idle', { fade: 0.25 });
    this.retStep = 'turn';
    this.retT = 0;
    // a cut to the camera behind the approach
    this.returnCam();
    this.camPos.copy(this.goalPos);
    this.camLook.copy(this.goalLook);
    this.camRate = 3;
    this.ballQ.identity();
    this.hideBall();
    this.hud.setRight('');
    this.updateHudFrame();
    // the oil wears a little with every frame
    const f = Math.min(this.sheet.frame, FRAMES - 1);
    this.simTune.oil = OIL_LEN - f * this.tune.oilWear;
    this.oilChip.set(this.simTune.oil);
    this.layOil();
    if (this.sheet.ball === 0 && (f === 3 || f === 6)) this.tip(t('oilWear'));
    // a fresh rack: back to the strike line
    if (this.sheet.freshRack() && this.strikeLine) {
      this.stand = this.strikeLine.stand;
      this.target = this.strikeLine.target;
    }
    this.keys.SPACE.reset();
    this.keys.ENTER.reset();
  }

  /** From the next approach on the left, keeping pace with the bowler: the walk back, the rack, the pick-up. */
  private returnCam(): void {
    const p = this.bowler.root.position;
    this.goalPos.set(-3.9, 2.35, Phaser.Math.Clamp(p.z - 2.4, -2, 2.4));
    this.goalLook.set(p.x - 0.35, 0.55, p.z + 0.25);
  }

  /** A line of advice that fades in under the HUD and away again. */
  private tip(s: string): void {
    const tx = txt(this, this.scale.width / 2, 440, s, { size: 28, color: '#9ff3ff', strokeThickness: 6, stroke: '#140a2a', wrap: 640 }).setDepth(9000).setScrollFactor(0).setAlpha(0);
    this.tweens.add({ targets: tx, alpha: 1, delay: 700, duration: 300, hold: 2600, yoyo: true, onComplete: () => tx.destroy() });
  }

  /** Walks the bowler towards a point: turns first if needed, steps with the walk clip. Returns true when there. */
  private walkTo(dt: number, x: number, z: number, v = WALK_V): boolean {
    const b = this.bowler;
    const p = b.root.position;
    const dx = x - p.x, dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) { p.x = x; p.z = z; return true; }
    // heading: yaw 0 looks down the lane (-z)
    const want = Math.atan2(dx, -dz);
    const turn = angleTo(b.yaw, want);
    b.face(b.yaw + Phaser.Math.Clamp(turn, -dt * 9, dt * 9));
    const go = Math.abs(turn) > 1.2 ? v * 0.3 : v;
    const step = Math.min(dist, go * dt * smooth(0, 0.25, this.retT + 0.05));
    p.x += dx / dist * step;
    p.z += dz / dist * step;
    b.walk(step + Math.abs(turn) * dt * 0.6, { stride: 0.9 });
    return false;
  }

  /** Turns on the spot to a yaw with little steps. Returns true when facing it. */
  private turnTo(dt: number, yaw: number, rate = 7): boolean {
    const b = this.bowler;
    const turn = angleTo(b.yaw, yaw);
    if (Math.abs(turn) < 0.02) { b.face(yaw); b.stepLegs(0, 0); return true; }
    const d = Phaser.Math.Clamp(turn, -dt * rate, dt * rate);
    b.face(b.yaw + d);
    if (b.clip === 'walk') b.walk(Math.abs(d) * 0.35, { stride: 0.5 });
    else b.stepLegs(Math.abs(d) * 0.35, 1, 0.5);
    return false;
  }

  private updateReturn(dt: number): void {
    const tt = this.phaseT;
    const tm = this.track.material as THREE.MeshBasicMaterial;
    tm.opacity = Math.max(0, 0.5 - tt * 0.6);
    const a = this.alley;
    const b = this.bowler;
    // the ball: out of the hood and down the rack, waiting at its end
    const hood = new THREE.Vector3(RETURN_X, RACK_Y + BALL_R * 0.7, HOOD_Z + 0.15);
    const end = new THREE.Vector3(RETURN_X, RACK_Y + BALL_R * 0.55, RACK_END_Z - 0.04);
    if (this.ballMode !== 'hand') {
      if (tt < 0.3) a.ball.visible = false;
      else {
        if (!a.ball.visible) this.sfx('pop', { volume: 0.6 });
        const k = Phaser.Math.Easing.Quadratic.Out(Math.min(1, (tt - 0.3) / 0.75));
        const p = hood.clone().lerp(end, k);
        const prev = a.ball.visible ? a.ball.position.clone() : p.clone();
        this.setBall(p.x, p.y + Math.sin(Math.min(1, k * 4) * Math.PI) * 0.03, p.z, false);
        const moved = p.distanceTo(prev);
        if (moved > 0 && moved < 0.3) this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), moved / BALL_R));
        if (tt - 0.3 < 0.75 && tt - 0.3 + this.lastDt >= 0.75) this.sfx('clack', { volume: 0.5 });
        this.ballMode = 'free';
      }
    }
    this.retT += dt;
    switch (this.retStep) {
      case 'turn':
        // turn round towards the ball return (to the left)
        if (this.turnTo(dt, -Math.PI * 0.85, 8) || this.retT > 0.6) { this.retStep = 'walk'; this.retT = 0; }
        break;
      case 'walk':
        // back up the approach to the end of the rack
        if (this.walkTo(dt, PICK.x, PICK.z)) { this.retStep = 'face'; this.retT = 0; }
        break;
      case 'face':
        b.play('idle', { fade: 0.15 });
        if ((this.turnTo(dt, -Math.PI / 2, 9) && tt > 1.1) || this.retT > 0.8) { this.retStep = 'pick'; this.retT = 0; b.stepLegs(0, 0); }
        break;
      case 'pick': {
        // a bend from the hips, the right hand under the ball, and up with it
        const k = this.retT;
        const reach = smooth(0, 0.22, k) * (1 - smooth(0.42, 0.7, k));
        b.torso.w = 1; b.torso.keep = 1; b.torso.yaw = 0;
        b.torso.pitch = reach * 0.5;
        b.armR.w = 1;
        b.armR.twist = -Math.PI / 2;
        b.armR.abd = -0.05 + reach * 0.05;
        b.armR.swing = (35 + reach * 33) * DEG;
        b.armL.w = 1;
        b.armL.swing = (25 + reach * 30) * DEG;
        b.armL.abd = -0.2;
        b.armL.twist = -0.9;
        b.headPitch = reach * 0.35;
        b.legs.w = reach * 0.6; b.legs.front = 20 * DEG; b.legs.back = 18 * DEG; b.legs.cross = 0; b.legs.spread = 0;
        if (k > 0.3 && this.ballMode !== 'hand') {
          this.ballMode = 'hand';
          this.sfx('clack', { volume: 0.4, rate: 1.2 });
        }
        if (k > 0.75) { this.retStep = 'stance'; this.retT = 0; }
        break;
      }
      case 'stance': {
        // carry it back to the stance (legs from walk, the right arm from holding-right, a masked
        // layer), then turn to the lane and take the ball in front for the stance
        if (!b.carrying) b.setCarry(true, 0.25);
        const x = this.standX();
        const p = b.root.position;
        const near = 1 - smooth(0.12, 0.45, Math.hypot(x - p.x, this.stanceZ - p.z));
        const k = Math.min(1, this.retT / 0.3);
        this.blendStance(k);
        b.armR.w = Math.max(near, 1 - smooth(0, 0.25, this.retT));
        b.armL.w *= near;
        if (this.walkTo(dt, x, this.stanceZ, WALK_V * 0.8) && this.turnTo(dt, 0, 8)) this.finishReturn();
        break;
      }
      default: break;
    }
    this.returnCam();
  }

  /** Blends the bowler's arms and torso into the stance (k 0 … 1). */
  private blendStance(k: number): void {
    const b = this.bowler;
    const pose = approachPose(0);
    const from = { swing: b.armR.swing, abd: b.armR.abd };
    poseBowler(b, 0, pose);
    b.armR.swing = from.swing + (pose.swing - from.swing) * k;
    b.armR.abd = from.abd + (pose.abd - from.abd) * k;
    b.armL.w = k;
    b.legs.w = 0;
    b.torso.keep = 0.3;
  }

  /** The bowler at the stance with the ball, ready (also when the walk back is skipped). */
  private finishReturn(): void {
    if (this.phase !== 'return') return;
    const b = this.bowler;
    this.bowlerX = this.standX();
    this.placeBowler();
    b.setCarry(false, 0.2);
    b.face(0).play('idle', { fade: 0.2 });
    b.stepLegs(0, 0);
    poseBowler(b, 0);
    b.legs.w = 0;
    this.ballMode = 'hand';
    this.retStep = 'done';
    this.beginAim();
  }

  private beginAim(): void {
    this.phase = 'aim';
    this.phaseT = 0;
    this.camRate = 2.6;
    this.stage = 'stand';
    this.guideKey = '';
    this.liveHook = this.hook;
    this.charging = false;
    this.showAimUi(true);
    this.updateAimUi();
    if (!this.hintShown) {
      this.hintShown = true;
      const touch = this.sys.game.device.input.touch;
      this.hint.setText(touch ? t('hintTouch') : t('hintKeys'));
    }
    this.showTip();
  }

  /** Coaching: after a strike ball that missed the pocket, and before every spare. */
  private showTip(): void {
    this.pendingTip = null;
    const fresh = this.sheet.freshRack();
    let tip: Tip | null = null;
    let lead = '';
    if (fresh) {
      tip = this.strikeTip;
      this.strikeTip = null;
      if (!tip || Number.isNaN(tip.miss) || Math.abs(tip.miss) < 0.75) { if (tip && !Number.isNaN(tip.miss)) this.tipChip.show(t('tipGood'), null); return; }
      const m = Math.round(Math.abs(tip.miss) * 2) / 2;
      lead = t((tip.miss > 0 ? 'tipMissL' : 'tipMissR') + (m <= 1 ? '1' : ''), { n: fmtBoard(m) });
    } else {
      // the spare: aim at the front pin still standing
      const standing = this.sim.standing();
      const ids = standing.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
      if (!ids.length) return;
      const front = Math.max(...ids.map((i) => SPOTS[i].z));
      const row = ids.filter((i) => Math.abs(SPOTS[i].z - front) < 0.01);
      const x = row.reduce((s, i) => s + SPOTS[i].x, 0) / row.length;
      // a single pin is hit full in the face; a group is hit on its pocket side
      const aimX = row.length > 1 ? x + Math.sign(this.liveHook || 1) * 0.06 : x;
      tip = tipFor(this.simTune, this.stand, this.target, this.speed, this.liveHook, aimX, front + 0.02);
      if (!tip) return;
      lead = t('tipPin', { p: row.map((i) => i + 1).join('-') });
    }
    const move = tip.move !== 0 ? tip.move : tip.moveTarget;
    const n = fmtBoard(Math.abs(move));
    const one = Math.abs(move) <= 1;
    const what = move === 0 ? t('tipKeep')
      : tip.move !== 0 ? t(move > 0 ? (one ? 'tipMoveL1' : 'tipMoveL') : (one ? 'tipMoveR1' : 'tipMoveR'), { n })
      : t(move > 0 ? (one ? 'tipTargetL1' : 'tipTargetL') : (one ? 'tipTargetR1' : 'tipTargetR'), { n });
    const apply = move === 0 ? null : () => this.applyTip(tip!);
    this.pendingTip = { stand: this.stand, target: this.target };
    this.tipChip.show(`${lead}: ${what}`, apply);
  }

  private applyTip(tip: Tip): void {
    if (!this.canAim()) return;
    const [s, tg] = clampAim(this.stand + tip.move, this.target + tip.moveTarget);
    this.stand = s;
    this.target = tg;
    this.tipChip.hide();
    this.sfx('good', { volume: 0.4 });
    this.updateAimUi();
  }

  private throwBall(r: Release): void {
    if (!this.canAim()) return;
    r.x = Phaser.Math.Clamp(r.x, -X_MAX, X_MAX);
    r.angle = Phaser.Math.Clamp(r.angle, -ANGLE_MAX, ANGLE_MAX);
    r.speed = Phaser.Math.Clamp(r.speed, SPEED_MIN, SPEED_MAX);
    r.hook = Phaser.Math.Clamp(r.hook, -1, 1);
    this.release = r;
    this.released = false;
    this.speed = r.speed;
    this.liveHook = r.hook;
    this.steps = 0;
    this.phase = 'approach';
    this.phaseT = 0;
    this.throwT = 0;
    this.gaitDone = 0;
    this.charging = false;
    this.hint.setText('');
    this.trail.clear();
    this.hideGuides();
    this.showAimUi(false);
    this.standingBefore = this.sim.standing();
    const fresh = this.standingBefore.every((s) => s);
    this.lastThrow = { stand: this.stand, target: this.target, speed: r.speed, hook: r.hook, fresh };
    if (fresh) this.strikeLine = { stand: this.stand, target: this.target };
    this.trackPts = [];
    this.track.geometry.setDrawRange(0, 0);
    (this.track.material as THREE.MeshBasicMaterial).opacity = 0.5;
    this.gutterBall = false;
    this.firstHit = false;
    this.recording = [];
    this.timeScale = 1;
    // the bowler stands so the ball leaves the hand over the release's x
    this.bowlerX = r.x - this.relOff.x;
    this.placeBowler();
    this.bowler.face(0);
    this.bowler.gaitPhase(PHASE0);
    this.bowler.play('walk', { fade: 0.12, speed: 0 });
    // predict the outcome a few hundred steps per frame (slow motion and the crash's size)
    this.predictor = new LaneSim(this.simTune);
    this.predictor.restore(this.sim.snapshot());
    this.predictor.release(r);
    this.predicted = null;
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

  /** The bowler's throw timeline: the approach, the slide, the follow-through, standing up. */
  private poseThrow(dt: number): void {
    if (this.throwT < 0) return;
    this.throwT += dt;
    const b = this.bowler;
    const tt = this.throwT;
    const pose = approachPose(tt);
    // the legs: the walk clip's phase from the ground the feet cover
    const dg = pose.gait - this.gaitDone;
    if (dg > 0) { b.walk(dg, { fade: 0.12 }); this.gaitDone = pose.gait; }
    poseBowler(b, tt, pose);
    // on the slide, the body drifts the last centimetres so the hand meets the release's board
    if (this.release && !this.released && tt > RELEASE_T - 0.16 && Number.isFinite(this.handOffX)) {
      const want = this.release.x - this.handOffX;
      this.bowlerX += (want - this.bowlerX) * Math.min(1, this.lastDt * 14);
    }
    this.placeBowler(this.stanceZ - pose.d);
    // footsteps: the four plants of the walk clip's cycle
    const phase = PHASE0 + pose.gait / Person.WALK_LOOP;
    const stepN = Math.floor((phase - 0.2) / 0.5);
    if (stepN > this.steps && tt < RELEASE_T) { this.steps = stepN; this.sfx('step', { volume: 0.3 + Math.min(4, stepN) * 0.08, rate: stepN >= 4 ? 0.8 : 1 }); }
    // after the follow-through, the bowler stands up and watches the ball (a little body english)
    if (tt > RISE_T && b.clip === 'walk') b.play('idle', { fade: 0.4 });
    if (tt > RISE_T + 0.7) { this.throwT = -1; b.relax(); }
  }

  private updateApproach(): void {
    const r = this.release!;
    const k = Math.min(1, this.throwT / RELEASE_T);
    const p = this.bowler.root.position;
    // a three-quarter view from the right, behind: the legs, the swing, the ball and the lane ahead
    this.goalPos.set(p.x + 2.75 - k * 0.3, 1.7 - k * 0.2, Math.min(5.0, p.z + 3.3 - k * 0.3));
    this.goalLook.set(p.x - 0.2, 0.5 - k * 0.08, p.z - 1.2);
    this.camRate = this.phaseT < 0.2 ? 5 : 7;
    this.stepPredictor();
    void r;
  }

  /** The ball leaves the hand (this frame's hand position) and flies to the boards. */
  private letGo(): void {
    if (this.released || !this.release) return;
    this.released = true;
    const from = this.bowler.ballAt(new THREE.Vector3());
    const dz = Math.max(0.005, from.z - LAY_Z);
    this.flight = { from, t: 0, dur: dz / this.release.speed };
    this.releaseGap = [from.x - this.release.x, from.y - BALL_R, from.z - LAY_Z, this.flight.dur, this.throwT];
    this.ballMode = 'flight';
    this.sfx('wood', { volume: 0.25, rate: 1.4 });
  }

  /** The ball meets the boards: the simulation starts here. */
  private landBall(over: number): void {
    const r = this.release!;
    this.sim.release(r);
    this.ballMode = 'free';
    this.flight = null;
    this.phase = 'roll';
    this.phaseT = 0;
    this.acc = Math.max(0, over);
    this.sfx('thud', { volume: 0.8 });
    this.shakeAmp = Math.max(this.shakeAmp, 0.01);
    this.hud.setRight(t('kmh', { n: Math.round(this.kmh(r.speed)) }));
  }

  private lastDt = 0;

  updateGame(_time: number, delta: number): void {
    // tests freeze the game between their own steps (headless WebGL is slow)
    if (this.frozen && !this.stepping) return;
    const dt = delta / 1000;
    this.lastDt = dt;
    this.phaseT += dt;
    // Space / Enter skip the fly-in, the call-out, the replay, the reaction and the walk back
    if ((this.phase === 'intro' || this.phase === 'result' || this.phase === 'replay' || this.phase === 'react' || this.phase === 'return')
      && (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER))) this.skip();
    this.poseThrow(dt);
    switch (this.phase) {
      case 'intro': this.updateIntro(); break;
      case 'return': this.updateReturn(dt); break;
      case 'aim': this.updateAim(dt); break;
      case 'approach': this.updateApproach(); break;
      case 'roll': this.updateRoll(dt); break;
      case 'result': this.updateResult(); break;
      case 'replay': this.updateReplay(dt); break;
      case 'react': this.updateReact(dt); break;
      case 'summary': this.updateSummary(); break;
      default: break;
    }
    if (this.sweepT >= 0) this.updateSweep(dt * this.sweepFast);
    if (this.phase !== 'replay') this.drawPins();
    this.bowler.update(dt);
    // the release: at the bottom of the forward swing, from where the hand is now
    if (this.phase === 'approach' && !this.released && this.throwT >= RELEASE_T) this.letGo();
    this.ballFollow(dt);
    this.updateCrowd(dt);
    this.updateSpinRing();
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
    this.world.followSun(new THREE.Vector3(0, 0, e < 0.5 ? HEAD_Z : this.stanceZ));
    this.holdFirstBall();
    if (this.phaseT > 2.5) this.endIntro();
  }

  /** The first ball starts in the bowler's hand (later ones come up the ball return). */
  private holdFirstBall(): void {
    this.bowlerX = this.standX();
    this.placeBowler();
    this.bowler.face(0);
    poseBowler(this.bowler, 0);
    this.bowler.legs.w = 0;
    this.ballMode = 'hand';
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
    const anyKey = k.LEFT.isDown || k.RIGHT.isDown || k.UP.isDown || k.DOWN.isDown || k.A.isDown || k.D.isDown || k.SPACE.isDown || k.Z.isDown || k.X.isDown;
    if (anyKey && !this.keysUsed) { this.keysUsed = true; this.updateAimUi(); }
    if (this.canAim() && !this.gesture) {
      const fine = k.SHIFT.isDown;
      const step = fine ? 0.5 : 1;
      const left = k.LEFT.isDown || k.A.isDown, right = k.RIGHT.isDown || k.D.isDown;
      const press = Phaser.Input.Keyboard.JustDown(k.LEFT) || Phaser.Input.Keyboard.JustDown(k.A) || Phaser.Input.Keyboard.JustDown(k.RIGHT) || Phaser.Input.Keyboard.JustDown(k.D);
      // a press moves one board (half with Shift); held, it repeats
      if (left || right) {
        this.keyRepeat = press ? -0.3 : this.keyRepeat + dt;
        if (press || this.keyRepeat > 0.075) {
          if (!press) this.keyRepeat = 0;
          const d = (left ? 1 : -1) * step;
          if (this.stage === 'stand') this.moveAim('stand', this.stand + d, step);
          else this.moveAim('target', this.target + d, step);
        }
      }
      if (Phaser.Input.Keyboard.JustDown(k.UP) || Phaser.Input.Keyboard.JustDown(k.W)) { this.stage = 'target'; this.sfx('tick', { volume: 0.4 }); this.updateAimUi(); }
      if (Phaser.Input.Keyboard.JustDown(k.DOWN) || Phaser.Input.Keyboard.JustDown(k.S)) { this.stage = 'stand'; this.sfx('tick', { volume: 0.4 }); this.updateAimUi(); }
      if (Phaser.Input.Keyboard.JustDown(k.V)) this.toggleLaneView();
      if (Phaser.Input.Keyboard.JustDown(k.H) && this.pendingTip) this.tipChip.chip.emit('pointerdown');
      // Space: hold for the speed meter, let go to bowl
      const hold = k.SPACE.isDown || k.ENTER.isDown;
      if (hold && !this.charging && (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.ENTER))) {
        this.charging = true;
        this.chargeT = 0;
        this.hint.setText('');
      }
      if (this.charging) {
        this.chargeT += dt;
        // up in 0.95 s, then back down
        const c = (this.chargeT / 0.95) % 2;
        this.power = c < 1 ? c : 2 - c;
        this.speed = SPEED_MIN + this.power * (SPEED_MAX - SPEED_MIN);
        this.updateAimUi();
        if (!hold) {
          this.charging = false;
          this.throwBall(this.currentRelease(this.speed, this.hook));
          return;
        }
      }
      // spin: Z hooks left, X hooks right (or backs up)
      if (k.Z.isDown || k.X.isDown) {
        this.hook = Phaser.Math.Clamp(this.hook + (k.Z.isDown ? 1 : -1) * dt * 0.9, -1, 1);
        if (Math.abs(this.hook) < 0.03 && Math.abs(this.liveHook) >= 0.03) this.hook = 0;
        this.liveHook = this.hook;
        this.updateAimUi();
      }
    }
    if (!this.gesture) this.trail.clear();
    // the bowler shuffles sideways to the new stand
    const b = this.bowler;
    const want = this.standX();
    const dx = want - this.bowlerX;
    const mv = Phaser.Math.Clamp(dx, -dt * 1.6, dt * 1.6);
    this.bowlerX += mv;
    b.stepLegs(Math.abs(mv) * 1.4, Math.abs(dx) > 0.004 ? 1 : 0, 0.35);
    this.placeBowler();
    poseBowler(b, 0);
    b.legs.w = 0;
    this.stanceCam();
    if (this.phaseT > 1.2) this.camRate = 4;
    this.drawGuides();
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
    // camera: from behind the bowler's slide, up and after the ball (the track shows the hook),
    // then the deck close-up as the ball rolls in
    const f = Phaser.Math.Clamp((HEAD_Z + 7.5 - b.z) / 5, 0, 1);
    const ff = f * f * (3 - 2 * f);
    this.deckCam(false);
    if (slow) this.goalPos.set(0.3, 0.5, HEAD_Z + 1.85);
    const deckPos = this.goalPos.clone(), deckLook = this.goalLook.clone();
    const chaseZ = Math.max(b.z + 3.2 - ff * 0.6, deckPos.z);
    // while the ball is still near the line the camera keeps clear of the bowler, out to the right and up
    const clear = smooth(-7, -2, b.z);
    this.goalPos.set(b.x * 0.4 * (1 - ff) + deckPos.x * ff + clear * 1.1, 1.15 + (deckPos.y - 1.15) * ff + clear * 0.35, slow ? deckPos.z : chaseZ);
    this.goalLook.set(b.x * 0.3 * (1 - ff) + deckLook.x * ff, 0.0 + deckLook.y * ff, (b.z - 5) * (1 - ff) + deckLook.z * ff);
    this.camRate = this.phaseT < 0.5 ? 2.2 + this.phaseT * 6 : 6;
    this.world.followSun(new THREE.Vector3(b.x, 0, Math.max(b.z, HEAD_Z - 0.4)));
    if (this.sim.done() || this.phaseT > 16) this.onSettled();
  }

  /** The spin ring: square to the ball's spin axis while it rolls on the lane (skid → hook → roll). */
  private updateSpinRing(): void {
    const b = this.sim.ball;
    const ring = this.spinRing;
    const on = this.phase === 'roll' && b.mode === 'lane' && this.alley.ball.visible;
    ring.visible = on;
    if (!on) return;
    const w = new THREE.Vector3(b.wx, b.wy, b.wz);
    if (w.lengthSq() < 1e-6) { ring.visible = false; return; }
    ring.position.copy(this.alley.ball.position);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), w.normalize());
    // brighter while the ball still skids (side rotation), fading as it rolls
    const side = Math.min(1, Math.abs(b.wz) / 12);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + side * 0.55;
  }

  /** A flat ribbon along points on the boards (the ball's track, the aim line, the predicted path). */
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
    // coaching for the next strike ball: how far this one missed the pocket and the move to fix it
    const lt = this.lastThrow;
    if (wasFresh && lt) this.strikeTip = call === 'strike' ? null : tipFor({ ...this.simTune }, lt.stand, lt.target, lt.speed, lt.hook);
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
    this.hideBall();
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
    this.throwT = -1;
    bw.relax();
    bw.face(0).play(this.lastCall === 'strike' ? 'jump' : good ? 'emote-yes' : 'emote-no', { fade: 0.15, restart: true });
    this.crowd.forEach((c, i) => {
      const life = this.crowdLife[i];
      life.cheer = 2.2 + i * 0.15;
      life.yaw = i === 2 ? 0.5 : i === 0 ? 0.2 : -0.25;
      c.face(life.yaw);
      c.play(good ? 'emote-yes' : 'emote-no', { fade: 0.2 + i * 0.1, restart: true });
    });
    const p = bw.root.position;
    this.camPos.set(p.x + 0.5, 1.25, p.z - 3.9);
    this.camLook.set(p.x + 0.2, 0.85, p.z + 1.2);
    this.goalPos.set(p.x + 0.35, 1.15, p.z - 3.4);
    this.goalLook.copy(this.camLook);
    this.camRate = 1.5;
    this.world.followSun(p.clone());
    this.hideBall();
  }

  private updateReact(dt: number): void {
    const bw = this.bowler;
    const tt = this.phaseT;
    if (this.lastCall === 'strike') {
      // hops between cheers, landing on bent legs; stepping on the spot between
      const cyc = tt % 1.1;
      if (cyc < 0.42) {
        bw.ground = true;
        bw.lift = Math.sin((cyc / 0.42) * Math.PI) * 0.3;
        bw.play('jump', { fade: 0.08 });
        bw.stepLegs(0, 0);
      } else {
        bw.lift = 0;
        bw.play('emote-yes', { fade: 0.12 });
        bw.stepLegs(dt * 1.5, 1, 0.45);
      }
    } else if (this.lastCall === 'spare' || this.lastCall === 'splitConverted') {
      // a little dance on the spot
      bw.stepLegs(dt * 1.3, 1, 0.4);
    } else {
      // a step back and a stamp of the foot, shaking the head
      bw.stepLegs(dt * (tt < 0.7 ? 0.9 : 0.25), 1, 0.4);
      bw.headPitch = Math.sin(tt * 3) * 0.08 + 0.12;
    }
    if (tt > 1.5) this.afterReact();
  }

  private afterReact(): void {
    if (this.phase !== 'react') return;
    this.bowler.lift = 0;
    this.bowler.stepLegs(0, 0);
    this.bowler.relax();
    this.crowd.forEach((c) => c.play('idle', { fade: 0.3 }));
    this.next();
  }

  /** The people around: idling with life (weight shifts, a look at the ball), cheering with their feet. */
  private updateCrowd(dt: number): void {
    const ball = this.alley.ball;
    this.crowd.forEach((c, i) => {
      const life = this.crowdLife[i];
      life.t += dt;
      if (life.cheer > 0) {
        life.cheer -= dt;
        // bounce on the spot while cheering (or shuffle when groaning)
        c.stepLegs(dt * (c.clip === 'emote-yes' ? 1.4 : 0.6), 1, 0.4);
        c.headYaw = 0;
        if (life.cheer <= 0) { c.stepLegs(0, 0); c.face(life.base); c.play('idle', { fade: 0.4, at: Math.random() }); }
        return;
      }
      // a weight shift every few seconds: two small steps, turning a little
      if (life.t > 3.2 + i * 1.3) {
        life.t = 0;
        life.shift = 0.7;
        life.yaw = life.base + (Math.random() - 0.5) * 0.5;
      }
      if (life.shift > 0) {
        life.shift -= dt;
        const turn = angleTo(c.yaw, life.yaw);
        c.face(c.yaw + Phaser.Math.Clamp(turn, -dt * 1.5, dt * 1.5));
        c.stepLegs(dt * 0.55, life.shift > 0.05 ? 1 : 0, 0.35);
      }
      // follow the ball with the head while it rolls
      let look = 0;
      if (this.phase === 'roll' && ball.visible) {
        const p = c.root.position;
        const want = Math.atan2(ball.position.x - p.x, -(ball.position.z - p.z));
        look = Phaser.Math.Clamp(angleTo(c.yaw, want), -0.9, 0.9);
      }
      c.headYaw += (-look - c.headYaw) * Math.min(1, dt * 4);
    });
  }

  /** On to the next ball (or the summary). */
  private next(): void {
    if (this.sweepT < 0) this.startSweep();
    if (this.sheet.over) {
      this.phase = 'summary';
      this.phaseT = 0;
      this.deckCam(true);
      this.camRate = 2;
      this.hideBall();
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
      // the spare tip needs the pins the sweep left
      if (this.phase === 'aim') this.showTip();
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
    if (this.phase === 'aim' || this.phase === 'return' || this.phase === 'approach') {
      const p = this.bowler.root.position;
      this.world.followSun(new THREE.Vector3(p.x * 0.6, 0, Math.min(p.z, this.stanceZ) - 1.2));
    }
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

  /** Test hook: get to the aim at once (skips the fly-in and the walk back). */
  testAim(): boolean {
    if (this.phase === 'intro') this.endIntro();
    if (this.phase === 'return') this.finishReturn();
    if (this.phase === 'aim' && !this.sweepDone) { this.updateSweep(9); }
    return this.canAim();
  }

  /** Test hook: bowl at once with an exact release (x, angle). */
  testThrow(x: number, angle: number, speed: number, hook: number): boolean {
    if (!this.testAim()) return false;
    this.stand = Phaser.Math.Clamp(xBoard(x), STAND_MIN, STAND_MAX);
    this.target = targetFor(this.stand, angle);
    this.hook = this.liveHook = hook;
    this.bowlerX = this.standX();
    this.throwBall({ x, angle, speed, hook });
    return true;
  }

  /** Test hook: set the line (stand board → target board), spin and speed; bowl when `go`. */
  testLine(stand: number, target: number, hook: number, speed: number, go = false): boolean {
    if (!this.testAim()) return false;
    [this.stand, this.target] = clampAim(stand, target);
    this.hook = this.liveHook = hook;
    this.speed = speed;
    this.bowlerX = this.standX();
    this.guideKey = '';
    this.updateAimUi();
    if (go) this.throwBall(this.currentRelease(speed, hook));
    return true;
  }

  /** Test hook: the bot's line to the pocket from a stand board (offset in m moves the target at the pins). */
  testBot(stand = 10, speed = 8, hook = 0.6, offset = 0): boolean {
    const tg = aimBoards(this.simTune, stand, speed, hook, POCKET_X * Math.sign(hook || 1) + offset);
    return this.testLine(stand, tg, hook, speed, true);
  }

  /** Test hook: run the game for `sec` seconds of game time without rendering each step. */
  testStep(sec: number, step = 0.05): void {
    const n = Math.ceil(sec / step - 1e-6);
    this.stepping = true;
    try {
      for (let i = 0; i < n && !this.isOver; i++) this.updateGame(0, step * 1000);
    } finally {
      this.stepping = false;
    }
  }

  /** Test hook: freeze the game between test steps (true) or let it run (false). */
  testFreeze(on: boolean): void {
    this.frozen = on;
  }
  private frozen = false;
  private stepping = false;

  /** Test hook: world positions of the bowler's joints, the ball and the measured release offset. */
  testBones(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [n, b] of this.bowler.bones) if (['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'].includes(n)) out[n] = b.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
    out.fist = this.bowler.fistAt(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
    out.ball = this.bowler.ballAt(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
    out.rootPos = this.bowler.root.position.toArray().map((v) => +v.toFixed(3));
    out.relOff = this.relOff.toArray().map((v) => +v.toFixed(3));
    out.stanceZ = [this.stanceZ];
    return out;
  }

  /** Test hook: the state. */
  testState(): { phase: Phase; frame: number; ball: number; total: number; standing: boolean[]; marks: string[][]; ballZ: number; sweep: boolean; call: Call; stand: number; target: number; hook: number; throwT: number } {
    return {
      phase: this.phase, frame: this.sheet.frame, ball: this.sheet.ball, total: this.sheet.total(), standing: this.sim.standing(),
      marks: Array.from({ length: FRAMES }, (_, f) => this.sheet.marks(f)), ballZ: this.sim.ball.z, sweep: this.sweepT >= 0, call: this.lastCall,
      stand: this.stand, target: this.target, hook: this.liveHook, throwT: this.throwT,
    };
  }

  /** Test hook: the hand and the ball now (world), for the grip and release checks. */
  testGrip(): { fist: number[]; ball: number[]; gap: number; mode: BallMode; sim: number[]; throwT: number; release: number[] } {
    const f = this.bowler.fistAt(new THREE.Vector3());
    const b = this.alley.ball.position;
    const g = this.bowler.ballAt(new THREE.Vector3());
    const s = this.sim.ball;
    return { fist: f.toArray(), ball: b.toArray(), gap: g.distanceTo(f), mode: this.ballMode, sim: [s.x, s.y, s.z], throwT: this.throwT, release: this.releaseGap };
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

