import Phaser from 'phaser';
import { ArcadeScene, t, loc, upper, txt, shake, flash, popup, playSfx } from '@core';
import { World3D, THREE, model, grounded } from '@core/three';
import { HOLES } from './holes';
import { parseHole, buildField, type HoleDef, type ParsedHole } from './kit';
import { Sim, NORMAL_TUNE, BALL_R, simulateShot, type Ball, type Cup, type Mover, type StepEvents, type Field } from './physics';
import { makeMovers } from './movers';
import { aimDir, shotBall, shotSpeed, MAX_SPEED } from './bot';
import { THEMES, buildHole3D, disposeHole3D, dressWorld, addClouds, kitTris, type Hole3D, type Theme } from './course3d';
import { Particles } from './fx3d';
import { CoursePicker, Scorecard, holeCard, callout, callText, callColor, type CardRow } from './panels';
import { callOf, pointsOf, strokeLimit, tuning, TUNING } from './scoring';

const SIM_DT = 1 / 120;
const CUP_R = 0.067;
/** Screen pixels of drag for a full-power putt. */
const DRAG_FULL = 330;
/** A press this close to the ball (screen px) starts a putt; elsewhere it turns the camera. */
const GRAB_R = 150;
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 9;

type Phase = 'pick' | 'intro' | 'aim' | 'roll' | 'sink' | 'out' | 'card' | 'over';

interface Cam {
  yaw: number;
  pitch: number;
  dist: number;
  t: THREE.Vector3;
}

/** Which holes each choice plays (indices into HOLES). */
const ROUNDS: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [9, 10, 11, 12, 13, 14, 15, 16, 17],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
].map((r) => r.filter((i) => i < HOLES.length));

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private fx!: Particles;
  private phase: Phase = 'pick';
  private round: number[] = [];
  private hi = 0;
  private rows: CardRow[] = [];
  private total = 0;

  // the hole
  private def!: HoleDef;
  private parsed!: ParsedHole;
  private field!: Field;
  private sim!: Sim;
  private movers: Mover[] = [];
  private h3d: Hole3D | null = null;
  private theme!: Theme;
  private themeName = '';
  private cup!: Cup;
  private ball!: Ball;
  private lastSpot = { x: 0, y: 0, z: 0 };
  private strokes = 0;
  private limit = 0;
  private holeT = 0;
  private acc = 0;
  private rollT = 0;
  private timeScale = 1;
  private predicted: { result: string; t: number } | null = null;
  private phaseT = 0;

  // objects
  private ballObj!: THREE.Object3D;
  private marker!: THREE.Mesh;
  private club!: THREE.Object3D;
  private dots!: THREE.InstancedMesh;
  private clouds: THREE.Object3D[] = [];

  // aim
  private aim = 0;
  private power = 0.45;
  private drag: { id: number; x: number; y: number } | null = null;
  private orbit: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  private pinch: { d: number; dist: number } | null = null;
  private keyAim = false;
  private camTouched = false;
  private previewKey = '';

  // camera
  private cam: Cam = { yaw: 0, pitch: 0.9, dist: 2.4, t: new THREE.Vector3() };
  private goal: Cam = { yaw: 0, pitch: 0.9, dist: 2.4, t: new THREE.Vector3() };
  private overview = false;

  // ui
  private info!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private band!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private camButtons: Phaser.GameObjects.Container[] = [];
  private card: Phaser.GameObjects.Container | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private picker: CoursePicker | null = null;
  private rollSound: Phaser.Sound.BaseSound | null = null;
  private flagLift = 0;
  private lastWallSfx = 0;
  /** Exposed for tests: the active Normal/Easy tuning. */
  tune = TUNING.normal;

  createGame(): void {
    this.phase = 'pick';
    this.round = [];
    this.hi = 0;
    this.rows = [];
    this.total = 0;
    this.movers = [];
    this.h3d = null;
    this.themeName = '';
    this.strokes = 0;
    this.holeT = this.acc = this.rollT = 0;
    this.timeScale = 1;
    this.predicted = null;
    this.drag = this.orbit = this.pinch = null;
    this.keyAim = this.camTouched = false;
    this.overview = false;
    this.card = null;
    this.camButtons = [];
    this.clouds = [];
    this.flagLift = 0;
    this.previewKey = '';
    this.tune = tuning();

    this.world = new World3D(this, { fov: 50, near: 0.03, far: 120, background: 0x9fd8ff });
    const sun = this.world.addLights({ ambient: 1.5, intensity: 2.4, extent: 8 });
    sun.shadow.mapSize.set(2048, 2048);
    this.fx = new Particles(this.world.scene);

    // the ball, its marker ring, the putter and the aim dots
    this.ballObj = model('mg:ball_red');
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x333333 });
    this.ballObj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = ballMat; m.userData.ownMaterial = true; }
    });
    this.world.scene.add(this.ballObj);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.userData.ownMaterial = true;
    this.world.scene.add(this.marker);
    this.club = new THREE.Group();
    const putter = grounded(model('mg:club_red'));
    putter.scale.setScalar(0.55);
    putter.rotation.z = 0.42;   // the shaft leans back towards the player
    this.club.add(putter);
    this.world.scene.add(this.club);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.011, 10), dotMat, 70);
    this.dots.userData.ownMaterial = true;
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.world.scene.add(this.dots);

    // UI
    const { width, height } = this.scale;
    this.info = txt(this, width / 2, 92, '', { size: 24, color: '#ffffff', strokeThickness: 5 }).setDepth(9000).setScrollFactor(0);
    this.hint = txt(this, width / 2, 170, '', { size: 26, color: '#ffffff', strokeThickness: 6, wrap: 640 }).setDepth(9000).setScrollFactor(0);
    this.band = this.add.graphics().setDepth(8800);
    this.meter = this.add.graphics().setDepth(8800);
    this.makeCamButtons();
    this.hud.setCenter('');

    // input
    this.input.addPointer(1);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomBy(dy > 0 ? 1.12 : 1 / 1.12);
    });
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,ENTER,Q,E,Z,X,V,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;

    // the rolling rumble (looped, silent until the ball rolls)
    if (this.cache.audio.exists('roll')) {
      this.rollSound = this.sound.add('roll', { loop: true, volume: 0 });
      try { this.rollSound.play(); } catch { /* locked */ }
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.h3d) disposeHole3D(this.h3d);
      this.h3d = null;
      this.rollSound?.stop();
      this.rollSound?.destroy();
      this.rollSound = null;
    });
    this.events.on(Phaser.Scenes.Events.PAUSE, () => (this.rollSound as Phaser.Sound.WebAudioSound | null)?.setVolume(0));

    // the menu's backdrop hole sits under the picker
    this.loadHole(HOLES[5] ?? HOLES[0], 'meadow', 6);
    this.overview = true;
    this.cam.yaw = this.goal.yaw = 0.35;
    this.setOverviewGoal();
    Object.assign(this.cam, { pitch: this.goal.pitch, dist: this.goal.dist });
    this.cam.t.copy(this.goal.t);
    this.ballObj.visible = false;
    this.showCamButtons(false);
    const pars = ROUNDS.map((r) => r.reduce((s, i) => s + HOLES[i].par, 0)) as [number, number, number];
    this.picker = new CoursePicker(this, pars, (i) => this.startRound(i));
  }

  // ---------------------------------------------------------------- round flow

  private startRound(choice: number): void {
    this.round = ROUNDS[choice];
    this.rows = this.round.map((i, k) => ({ n: choice === 1 ? i + 1 : k + 1, par: HOLES[i].par, strokes: null, holed: false, points: 0 }));
    // the card numbers holes as on the course: 1–9 meadow, 10–18 castle
    this.rows.forEach((r, k) => (r.n = this.round[k] + 1));
    this.hi = 0;
    this.total = 0;
    this.setScore(0);
    this.startHole();
  }

  private holeNumber(): number {
    return this.round[this.hi] + 1;
  }

  private startHole(): void {
    // the key that closed the card must not skip the fly-over
    this.keys.ENTER.reset();
    this.keys.SPACE.reset();
    const idx = this.round[this.hi];
    this.loadHole(HOLES[idx], idx < 9 ? 'meadow' : 'castle', idx + 1);
    this.strokes = 0;
    this.limit = strokeLimit(this.def.par);
    this.hud.setLevel(this.holeNumber());
    this.hud.setRight(`${upper(t('par'))} ${this.def.par}`);
    this.updateInfo();
    this.ball = { x: this.parsed.tee.x, y: this.parsed.tee.y, z: this.parsed.tee.z, vx: 0, vy: 0, vz: 0, air: false };
    this.ballObj.visible = true;
    this.ballObj.scale.setScalar(1);
    this.placeBall();
    // fly-over: from above the cup down to the tee
    this.overview = true;
    const toCup = Math.atan2(this.cup.x - this.ball.x, -(this.cup.z - this.ball.z));
    this.cam.yaw = toCup;
    this.setOverviewGoal();
    this.cam.t.set(this.cup.x, this.cup.y, this.cup.z);
    this.cam.dist = this.goal.dist * 0.7;
    this.cam.pitch = 1.25;
    this.phase = 'intro';
    this.phaseT = 0;
    this.card?.destroy();
    this.card = holeCard(this, { n: this.holeNumber(), name: loc(this.def.name), par: this.def.par, tip: this.def.tip ? loc(this.def.tip) : undefined, limit: this.limit });
    this.showCamButtons(false);
    this.hint.setText('');
    this.sfx('whoosh', { volume: 0.5 });
  }

  /** Builds field, physics and 3D for a hole (also the backdrop under the picker). */
  private loadHole(def: HoleDef, themeName: 'meadow' | 'castle', seed: number): void {
    this.def = def;
    this.parsed = parseHole(def);
    this.field = buildField(this.parsed, kitTris);
    this.movers = makeMovers(this.parsed, def.movers, def.windmill);
    this.cup = { x: this.parsed.cup.x, z: this.parsed.cup.z, r: CUP_R, y: this.parsed.cup.y };
    const tn = tuning();
    this.sim = new Sim(this.field, this.cup, this.movers, { ...NORMAL_TUNE, cupScale: tn.cupScale, magnet: tn.magnet });
    this.holeT = 0;
    this.acc = 0;
    if (this.h3d) disposeHole3D(this.h3d);
    this.fx.clear();
    this.theme = THEMES[themeName];
    if (this.themeName !== themeName) {
      this.themeName = themeName;
      dressWorld(this.world.scene, this.theme);
      this.clouds.forEach((c) => this.world.scene.remove(c));
      this.clouds = [];
    }
    this.h3d = buildHole3D(this.world.scene, def, this.parsed, this.theme, this.movers, seed);
    if (!this.clouds.length) this.clouds = addClouds(this.world.scene, this.h3d.center, themeName === 'castle' ? 0xffd9c9 : 0xffffff);
    const sun = this.world.sun!;
    sun.color.setHex(this.theme.sun);
    sun.intensity = this.theme.sunI;
    const [x, y, z] = this.theme.sunDir;
    sun.position.set(x, y, z).normalize().multiplyScalar(40);
    sun.target.position.set(0, 0, 0);
    const hemi = this.world.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight | undefined;
    if (hemi) {
      hemi.color.setHex(this.theme.hemiSky);
      hemi.groundColor.setHex(this.theme.hemiGround);
      hemi.intensity = this.theme.ambient;
    }
    const e = this.h3d.radius + 1.5;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
    sun.shadow.camera.updateProjectionMatrix();
    this.world.followSun(this.h3d.center);
    for (const c of this.clouds) c.position.y = Math.max(c.position.y, 5);
    this.flagLift = 0;
    this.updateMoversVisual();
  }

  private updateInfo(): void {
    const left = this.limit - this.strokes;
    this.info.setText(`${t('strokeN', { n: this.strokes })}   ·   ${t('limit', { n: this.limit })}`);
    this.info.setColor(left <= 1 ? '#ffb36b' : '#ffffff');
  }

  private finishHole(holed: boolean): void {
    const strokes = holed ? this.strokes : this.limit;
    const call = callOf(this.def.par, strokes, holed);
    const pts = pointsOf(call);
    const row = this.rows[this.hi];
    row.strokes = strokes;
    row.holed = holed;
    row.points = pts;
    this.total += pts;
    this.setScore(this.total);
    const over = strokes - this.def.par;
    callout(this, callText(call, over), callColor(call), call === 'holeInOne' ? 58 : 66);
    const p = this.world.toScreen(new THREE.Vector3(this.cup.x, this.cup.y + 0.1, this.cup.z));
    if (pts > 0) popup(this, Phaser.Math.Clamp(p.x, 120, 600), Phaser.Math.Clamp(p.y, 200, 1000) - 40, `+${pts}`, '#9fe7b8', 40);
    if (call === 'holeInOne' || call === 'eagle' || call === 'albatross') {
      this.sfx('fanfare', { exact: true, volume: 0.8 });
      this.sfx('applause', { exact: true, volume: 0.7 });
      this.fx.confetti(new THREE.Vector3(this.cup.x, this.cup.y + 0.05, this.cup.z), call === 'holeInOne' ? 140 : 80);
      flash(this, 0xffffff, 200, 0.4);
      shake(this, 0.006, 300);
    } else if (call === 'birdie') {
      this.sfx('birdie', { exact: true, volume: 0.7 });
      this.fx.confetti(new THREE.Vector3(this.cup.x, this.cup.y + 0.05, this.cup.z), 40);
    } else if (call === 'par') {
      this.sfx('par', { exact: true, volume: 0.6 });
    } else {
      this.sfx('bogey', { volume: 0.6 });
    }
    this.phase = 'card';
    this.showCamButtons(false);
    this.hint.setText('');
    this.time.delayedCall(call === 'holeInOne' ? 2600 : 1700, () => {
      if (this.isOver) return;
      const last = this.hi >= this.round.length - 1;
      new Scorecard(this, { rows: this.rows, current: this.round[this.hi], last, total: this.total }, () => {
        if (last) {
          this.phase = 'over';
          this.endGame({ win: true, title: t('roundOver'), delay: 300 });
        } else {
          this.hi++;
          this.startHole();
        }
      });
    });
  }

  // ---------------------------------------------------------------- input

  private ballScreen(): { x: number; y: number } {
    return this.world.toScreen(new THREE.Vector3(this.ball.x, this.ball.y + BALL_R, this.ball.z));
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (over.length || this.isOver) return;
    if (this.phase === 'intro') {
      this.skipIntro();
      return;
    }
    const touching = this.input.manager.pointers.filter((q) => q.isDown);
    if (touching.length >= 2) {
      // two fingers: pinch to zoom (cancel a putt in progress)
      const [a, b] = touching;
      this.drag = null;
      this.orbit = null;
      this.pinch = { d: Math.max(20, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)), dist: this.goal.dist };
      return;
    }
    if (this.phase === 'aim' && !this.overview) {
      const b = this.ballScreen();
      if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < GRAB_R) {
        this.drag = { id: p.id, x: p.x, y: p.y };
        this.keyAim = false;
        return;
      }
    }
    if (this.phase === 'aim' || this.phase === 'roll' || this.phase === 'out' || this.phase === 'sink') {
      this.orbit = { id: p.id, x: p.x, y: p.y, yaw: this.goal.yaw, pitch: this.goal.pitch };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      const touching = this.input.manager.pointers.filter((q) => q.isDown);
      if (touching.length >= 2) {
        const d = Math.max(20, Phaser.Math.Distance.Between(touching[0].x, touching[0].y, touching[1].x, touching[1].y));
        this.goal.dist = Phaser.Math.Clamp(this.pinch.dist * (this.pinch.d / d), ZOOM_MIN, ZOOM_MAX);
        this.camTouched = true;
      }
      return;
    }
    if (this.drag && p.id === this.drag.id && this.phase === 'aim') {
      this.updateDragAim(p.x, p.y);
      return;
    }
    if (this.orbit && p.id === this.orbit.id && p.isDown) {
      const dx = p.x - this.orbit.x, dy = p.y - this.orbit.y;
      this.goal.yaw = this.orbit.yaw - dx * 0.006;
      this.goal.pitch = Phaser.Math.Clamp(this.orbit.pitch + dy * 0.003, 0.35, 1.45);
      this.cam.yaw = this.goal.yaw;
      this.camTouched = true;
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pinch) {
      if (!this.input.manager.pointers.some((q) => q.isDown && q.id !== p.id)) this.pinch = null;
      return;
    }
    if (this.drag && p.id === this.drag.id) {
      const go = this.phase === 'aim' && this.power >= 0.04 && Phaser.Math.Distance.Between(p.x, p.y, this.drag.x, this.drag.y) > 24;
      this.drag = null;
      this.band.clear();
      if (go) this.putt();
      return;
    }
    if (this.orbit && p.id === this.orbit.id) this.orbit = null;
  }

  /** The finger, projected onto the ball's level, pulls the putt the other way. */
  private updateDragAim(px: number, py: number): void {
    const b = this.ballScreen();
    const len = Phaser.Math.Distance.Between(px, py, b.x, b.y);
    this.power = Phaser.Math.Clamp((len - 20) / DRAG_FULL, 0, 1);
    const hit = this.groundPoint(px, py);
    if (hit && Math.hypot(hit.x - this.ball.x, hit.z - this.ball.z) > 0.01) {
      this.aim = Math.atan2(-(hit.x - this.ball.x), hit.z - this.ball.z);
    } else {
      // above the horizon: use the screen direction
      const sdx = px - b.x, sdy = py - b.y;
      this.aim = this.cam.yaw + Math.atan2(-sdx, sdy);
    }
  }

  private groundPoint(px: number, py: number): THREE.Vector3 | null {
    const { width, height } = this.scale;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((px / width) * 2 - 1, -(py / height) * 2 + 1), this.world.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.ball.y + BALL_R));
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  private zoomBy(k: number): void {
    this.goal.dist = Phaser.Math.Clamp(this.goal.dist * k, ZOOM_MIN, ZOOM_MAX);
    this.camTouched = true;
  }

  private makeCamButtons(): void {
    const { width, height } = this.scale;
    const make = (x: number, draw: (g: Phaser.GameObjects.Graphics) => void, onTap: () => void) => {
      const c = this.add.container(x, height - 84).setDepth(9000).setScrollFactor(0);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.25).fillCircle(0, 4, 42);
      g.fillStyle(0x12203a, 0.72).fillCircle(0, 0, 42);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, 42);
      const icon = this.add.graphics();
      draw(icon);
      c.add([g, icon]);
      c.setSize(96, 96);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        this.tweens.add({ targets: c, scale: 0.9, duration: 60, yoyo: true });
        playSfx(this, 'tick', { volume: 0.5 });
        onTap();
      });
      this.camButtons.push(c);
    };
    const arrow = (g: Phaser.GameObjects.Graphics, dir: 1 | -1) => {
      g.lineStyle(6, 0xffffff, 1);
      g.beginPath();
      g.arc(0, 2, 18, dir > 0 ? Math.PI * 1.05 : -Math.PI * 0.05, dir > 0 ? Math.PI * 1.95 : -Math.PI * 0.95, dir < 0);
      g.strokePath();
      const ex = dir > 0 ? 17 : -17;
      g.fillStyle(0xffffff, 1).fillTriangle(ex - 9, -6, ex + 9, -6, ex, 8);
    };
    make(66, (g) => arrow(g, -1), () => this.rotateCam(-0.5));
    make(170, (g) => arrow(g, 1), () => this.rotateCam(0.5));
    make(width - 66, (g) => {
      // an eye over the course: the overview
      g.lineStyle(5, 0xffffff, 1);
      g.strokeEllipse(0, 0, 44, 26);
      g.fillStyle(0xffffff, 1).fillCircle(0, 0, 7);
    }, () => this.toggleOverview());
  }

  private showCamButtons(on: boolean): void {
    for (const c of this.camButtons) c.setVisible(on);
  }

  private rotateCam(d: number): void {
    this.goal.yaw += d;
    this.camTouched = true;
  }

  private toggleOverview(): void {
    if (this.phase !== 'aim' && this.phase !== 'roll') return;
    this.overview = !this.overview;
    if (this.overview) this.setOverviewGoal();
    else this.setAimGoal(false);
  }

  private skipIntro(): void {
    if (this.phase !== 'intro') return;
    this.card?.destroy();
    this.card = null;
    this.beginAim(true);
  }

  // ---------------------------------------------------------------- aiming and putting

  private beginAim(recentre: boolean): void {
    this.phase = 'aim';
    this.overview = false;
    this.drag = null;
    this.timeScale = 1;
    if (recentre || !this.camTouched) {
      // face the cup (or the hole's general direction)
      this.goal.yaw = Math.atan2(this.cup.x - this.ball.x, -(this.cup.z - this.ball.z));
      this.goal.dist = 3;
      this.goal.pitch = 0.95;
    }
    this.camTouched = false;
    this.aim = this.goal.yaw;
    this.power = Phaser.Math.Clamp(this.power, 0.15, 0.8);
    this.setAimGoal(true);
    this.showCamButtons(true);
    this.hint.setText(this.hi === 0 && this.strokes === 0 ? (this.sys.game.device.input.touch ? t('dragHint') : `${t('dragHint')}\n${t('keyHint')}`) : '');
    if (this.strokes === this.limit - 1) popup(this, this.scale.width / 2, 170, t('lastStroke'), '#ffb36b', 32);
  }

  private putt(): void {
    if (this.phase !== 'aim') return;
    this.strokes++;
    this.updateInfo();
    this.lastSpot = { x: this.ball.x, y: this.ball.y, z: this.ball.z };
    const shot = shotBall(this.ball, this.aim, this.power);
    // the live loop steps exactly like simulateShot, so the outcome is known now (slow motion
    // for a hole in one)
    const pre = simulateShot(this.sim, shot, this.holeT, 25, SIM_DT);
    this.predicted = { result: pre.result, t: pre.t };
    this.sim.reset();
    for (const m of this.movers) m.update(this.holeT);
    Object.assign(this.ball, shot);
    this.phase = 'roll';
    this.rollT = 0;
    this.acc = 0;
    this.hint.setText('');
    this.dots.count = 0;
    this.band.clear();
    this.meter.clear();
    this.sfx('putt', { volume: 0.4 + this.power * 0.6, rate: 1.1 - this.power * 0.2 });
    this.swingClub();
    this.marker.visible = false;
  }

  private swingClub(): void {
    const start = this.club.userData.back ?? 0.1;
    this.tweens.addCounter({
      from: start, to: -0.05, duration: 90, ease: 'Quad.easeIn',
      onUpdate: (tw) => this.poseClub(tw.getValue() ?? 0),
      onComplete: () => this.tweens.add({ targets: this.club.scale, x: 0.01, y: 0.01, z: 0.01, delay: 250, duration: 250, onComplete: () => { this.club.visible = false; } }),
    });
  }

  private poseClub(back: number): void {
    const [dx, dz] = aimDir(this.aim);
    const bx = this.lastSpotOrBall();
    this.club.position.set(bx.x - dx * (BALL_R + 0.02 + back), bx.y, bx.z - dz * (BALL_R + 0.02 + back));
    this.club.rotation.set(0, -this.aim + Math.PI / 2, 0);
    this.club.userData.back = back;
  }

  private lastSpotOrBall(): { x: number; y: number; z: number } {
    return this.phase === 'aim' ? this.ball : this.lastSpot;
  }

  // ---------------------------------------------------------------- update

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.phaseT += dt;
    this.fx.update(dt * this.timeScale);
    if (this.phase !== 'roll') {
      this.holeT += dt;
      for (const m of this.movers) m.update(this.holeT);
    }
    switch (this.phase) {
      case 'pick':
        this.goal.yaw += dt * 0.12;
        break;
      case 'intro':
        if (this.phaseT > 2.6 || Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) this.skipIntro();
        break;
      case 'aim':
        this.updateAim(dt);
        break;
      case 'roll':
        this.updateRoll(dt);
        break;
      case 'out':
      case 'sink':
      case 'card':
      case 'over':
        break;
    }
    this.cameraKeys(dt);
    this.updateMoversVisual();
    this.updateFlag(dt);
    this.updateCamera(dt);
    this.updateRollSound();
    // the marker ring breathes under a resting ball
    if (this.marker.visible) {
      const s = 1 + Math.sin(this.elapsed * 5) * 0.12;
      this.marker.scale.setScalar(s);
    }
  }

  private cameraKeys(dt: number): void {
    const k = this.keys;
    if (this.phase === 'pick' || this.phase === 'card' || this.phase === 'over') return;
    if (k.Q.isDown) { this.goal.yaw -= dt * 1.6; this.camTouched = true; }
    if (k.E.isDown) { this.goal.yaw += dt * 1.6; this.camTouched = true; }
    if (k.Z.isDown) this.zoomBy(1 - dt * 1.2);
    if (k.X.isDown) this.zoomBy(1 + dt * 1.2);
    if (Phaser.Input.Keyboard.JustDown(k.V)) this.toggleOverview();
  }

  private updateAim(dt: number): void {
    const k = this.keys;
    const fine = k.SHIFT.isDown ? 0.3 : 1;
    let turned = false;
    if (k.LEFT.isDown || k.A.isDown) { this.aim -= dt * 1.1 * fine; turned = true; }
    if (k.RIGHT.isDown || k.D.isDown) { this.aim += dt * 1.1 * fine; turned = true; }
    if (k.UP.isDown || k.W.isDown) { this.power = Math.min(1, this.power + dt * 0.55 * fine); this.keyAim = true; }
    if (k.DOWN.isDown || k.S.isDown) { this.power = Math.max(0.02, this.power - dt * 0.55 * fine); this.keyAim = true; }
    if (turned) {
      this.keyAim = true;
      this.overview = false;
      this.goal.yaw = this.aim;   // keys: the camera stays behind the putt
      this.setAimGoal(false);
    }
    if (Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.ENTER)) {
      this.putt();
      return;
    }
    if (!this.overview) this.setAimGoal(false);
    this.drawAim();
  }

  private setAimGoal(snap: boolean): void {
    const [dx, dz] = aimDir(this.goal.yaw);
    const ahead = this.goal.dist * 0.14;
    this.goal.t.set(this.ball.x + dx * ahead, this.ball.y + BALL_R, this.ball.z + dz * ahead);
    if (snap) {
      this.goal.dist = Phaser.Math.Clamp(this.goal.dist, ZOOM_MIN, ZOOM_MAX);
    }
  }

  private setOverviewGoal(): void {
    const h = this.h3d!;
    this.goal.t.set(h.center.x, 0.1, h.center.z);
    this.goal.dist = Math.max(3.2, h.radius * 2.1 + 0.8);
    this.goal.pitch = 1.12;
  }

  /** Aim dots (a straight arrow; on Easy the real path to the first bounce), the putter, the band. */
  private drawAim(): void {
    const [dx, dz] = aimDir(this.aim);
    const showing = this.keyAim || !!this.drag;
    const key = `${this.aim.toFixed(3)}:${this.power.toFixed(3)}:${showing}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      const pts: THREE.Vector3[] = [];
      if (showing && this.power > 0.02) {
        if (this.tune.preview) {
          // Easy: the real path up to the first bounce, and a little after it
          const ball = shotBall(this.ball, this.aim, this.power);
          this.sim.reset();
          let tt = this.holeT, travelled = 0, bounced = -1, lx = ball.x, lz = ball.z, next = 0.06;
          for (let i = 0; i < 900 && pts.length < 64; i++) {
            const ev: StepEvents = { wall: 0, land: 0, mover: 0, lip: false };
            const r = this.sim.step(ball, tt, SIM_DT, ev);
            tt += SIM_DT;
            travelled += Math.hypot(ball.x - lx, ball.z - lz);
            lx = ball.x; lz = ball.z;
            if (travelled > next) {
              next += 0.06;
              pts.push(new THREE.Vector3(ball.x, ball.y + 0.006, ball.z));
            }
            if (bounced < 0 && (ev.wall > 0.05 || ev.mover > 0.05)) bounced = travelled;
            if (r !== 'roll' || (bounced >= 0 && travelled > bounced + 0.45)) break;
          }
          this.sim.reset();
          for (const m of this.movers) m.update(this.holeT);
        } else {
          const len = 0.18 + this.power * 0.9;
          for (let s = 0.07; s < len; s += 0.06) {
            const x = this.ball.x + dx * s, z = this.ball.z + dz * s;
            const y = this.field.floorAt(x, z);
            pts.push(new THREE.Vector3(x, (y > -1e8 ? y : this.ball.y) + 0.006, z));
          }
        }
      }
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      pts.forEach((p, i) => {
        const s = 1 - (i / Math.max(1, pts.length)) * 0.5;
        m.compose(p, q, new THREE.Vector3(s, s, s));
        this.dots.setMatrixAt(i, m);
      });
      this.dots.count = pts.length;
      this.dots.instanceMatrix.needsUpdate = true;
      const c = new THREE.Color().setHSL(0.33 - this.power * 0.33, 0.9, 0.6);
      (this.dots.material as THREE.MeshBasicMaterial).color.copy(c);
    }
    // the putter waits behind the ball, pulled back by the power
    this.club.visible = true;
    this.club.scale.setScalar(1);
    this.poseClub(0.02 + this.power * 0.16);
    // 2D: the rubber band from the ball to the finger, and the power meter
    this.band.clear();
    const b = this.ballScreen();
    const col = Phaser.Display.Color.HSLToColor(0.33 - this.power * 0.33, 0.9, 0.55).color;
    if (this.drag) {
      const p = this.input.manager.pointers.find((q) => q.id === this.drag!.id);
      if (p) {
        this.band.lineStyle(10, 0x000000, 0.25).lineBetween(b.x, b.y + 3, p.x, p.y + 3);
        this.band.lineStyle(6, col, 0.95).lineBetween(b.x, b.y, p.x, p.y);
        this.band.fillStyle(col, 1).fillCircle(p.x, p.y, 14);
        this.band.lineStyle(3, 0xffffff, 0.9).strokeCircle(p.x, p.y, 14);
      }
    }
    this.meter.clear();
    if (this.drag || this.keyAim) {
      const { width, height } = this.scale;
      const w = 300, x0 = width / 2 - w / 2, y0 = height - 160;
      this.meter.fillStyle(0x000000, 0.4).fillRoundedRect(x0 - 6, y0 - 6, w + 12, 30, 15);
      this.meter.fillStyle(col, 1).fillRoundedRect(x0, y0, Math.max(18, w * this.power), 18, 9);
      this.meter.lineStyle(2, 0xffffff, 0.6).strokeRoundedRect(x0 - 6, y0 - 6, w + 12, 30, 15);
    }
  }

  private updateRoll(dt: number): void {
    // slow motion for the last moments of a hole in one
    const pr = this.predicted;
    const slow = pr && pr.result === 'sunk' && this.strokes === 1 && pr.t - this.holeT < 0.9;
    this.timeScale = slow ? 0.3 : 1;
    if (slow) {
      this.goal.t.lerp(new THREE.Vector3(this.cup.x, this.cup.y, this.cup.z), Math.min(1, dt * 3));
      this.goal.dist += (1.2 - this.goal.dist) * Math.min(1, dt * 2);
    }
    this.acc += dt * this.timeScale;
    const ev: StepEvents = { wall: 0, land: 0, mover: 0, lip: false };
    let result = 'roll';
    const px = this.ball.x, pz = this.ball.z;
    while (this.acc >= SIM_DT && result === 'roll') {
      this.acc -= SIM_DT;
      result = this.sim.step(this.ball, this.holeT, SIM_DT, ev);
      this.holeT += SIM_DT;
    }
    this.rollT += dt;
    if (result === 'roll' && this.rollT > 30) result = 'stop';
    // roll the ball mesh
    const moved = Math.hypot(this.ball.x - px, this.ball.z - pz);
    if (moved > 1e-5) {
      const axis = new THREE.Vector3(this.ball.z - pz, 0, -(this.ball.x - px)).normalize();
      this.ballObj.rotateOnWorldAxis(axis, moved / BALL_R);
    }
    this.placeBall();
    if (!slow && !this.overview && !this.camTouched) {
      this.goal.t.lerp(new THREE.Vector3(this.ball.x, this.ball.y, this.ball.z), Math.min(1, dt * 4));
      this.goal.dist += (Math.max(2.6, this.goal.dist) - this.goal.dist) * dt;
    } else if (!slow && !this.overview) {
      this.goal.t.lerp(new THREE.Vector3(this.ball.x, this.ball.y, this.ball.z), Math.min(1, dt * 3));
    }
    // sounds
    const sx = this.ballScreen().x;
    if (ev.wall > 0.15 && this.time.now - this.lastWallSfx > 60) {
      this.lastWallSfx = this.time.now;
      this.sfxAt('clack', sx, { volume: Math.min(1, 0.25 + ev.wall * 0.3) });
      if (ev.wall > 2.5) shake(this, 0.003, 80);
    }
    if (ev.mover > 0.1) this.sfxAt('bonk', sx, { volume: Math.min(1, 0.4 + ev.mover * 0.25) });
    if (ev.land > 0.8) {
      this.sfxAt('thud', sx, { volume: Math.min(1, 0.3 + ev.land * 0.2) });
      this.fx.puff(new THREE.Vector3(this.ball.x, this.ball.y, this.ball.z), this.theme.felt);
    }
    if (ev.lip) {
      this.sfx('lip', { volume: 0.7 });
      const p = this.ballScreen();
      popup(this, Phaser.Math.Clamp(p.x, 160, 560), Phaser.Math.Clamp(p.y - 50, 200, 1000), t('lipOut'), '#ffd23f', 28);
    }
    if (result === 'sunk') this.onSunk();
    else if (result === 'out') this.onOut();
    else if (result === 'stop') this.onStop();
  }

  private onStop(): void {
    this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.timeScale = 1;
    if (this.strokes >= this.limit) {
      this.finishHole(false);
      return;
    }
    this.marker.visible = true;
    this.beginAim(false);
  }

  private onSunk(): void {
    this.phase = 'sink';
    this.timeScale = 1;
    // pull back a little to show the green and the celebration
    this.overview = false;
    this.goal.t.set(this.cup.x, this.cup.y, this.cup.z);
    this.goal.dist = Math.max(this.goal.dist, 2.1);
    this.goal.pitch = Math.max(this.goal.pitch, 0.95);
    const b = this.ballObj;
    this.sfx('plop', { volume: 0.9 });
    this.tweens.add({
      targets: b.position, x: this.cup.x, z: this.cup.z, y: this.cup.y - 0.02, duration: 180, ease: 'Quad.easeIn',
      onComplete: () => {
        this.sfx('cup', { volume: 0.7 });
        this.fx.ring(new THREE.Vector3(this.cup.x, this.cup.y, this.cup.z), 0xffffff, 0.18);
        this.tweens.add({ targets: b.position, y: this.cup.y - 0.09, duration: 160, onComplete: () => (b.visible = false) });
      },
    });
    this.time.delayedCall(260, () => this.finishHole(true));
  }

  private onOut(): void {
    this.phase = 'out';
    this.timeScale = 1;
    const inWater = (this.def.water ?? []).some(([x0, z0, x1, z1]) => this.ball.x > x0 && this.ball.x < x1 && this.ball.z > z0 && this.ball.z < z1)
      || Math.hypot(this.ball.x - this.h3d!.center.x, (this.ball.z - this.h3d!.center.z) / 1.15) > this.h3d!.radius + 4.4;
    const at = new THREE.Vector3(this.ball.x, 0.004, this.ball.z);
    const p = this.ballScreen();
    if (inWater) {
      this.fx.splash(at);
      this.sfx('splash', { volume: 0.8 });
      this.tweens.add({ targets: this.ballObj.position, y: -0.1, duration: 400 });
      popup(this, Phaser.Math.Clamp(p.x, 190, 530), Phaser.Math.Clamp(p.y - 40, 200, 1000), t('water'), '#7ee6ff', 34);
    } else {
      this.ball.y = 0;
      this.placeBall();
      this.sfx('thud', { volume: 0.6 });
      this.fx.puff(at, this.theme.ground);
      popup(this, Phaser.Math.Clamp(p.x, 210, 510), Phaser.Math.Clamp(p.y - 40, 200, 1000), t('out'), '#ffb36b', 34);
    }
    this.sfx('penalty', { volume: 0.6 });
    this.strokes++;
    this.updateInfo();
    this.time.delayedCall(1100, () => {
      if (this.isOver || this.phase !== 'out') return;
      if (this.strokes >= this.limit) {
        this.finishHole(false);
        return;
      }
      this.ball = { ...this.lastSpot, vx: 0, vy: 0, vz: 0, air: false };
      this.placeBall();
      this.ballObj.scale.setScalar(0.01);
      this.tweens.add({ targets: this.ballObj.scale, x: 1, y: 1, z: 1, duration: 300, ease: 'Back.easeOut' });
      this.sfx('respawn', { volume: 0.5 });
      this.marker.visible = true;
      this.beginAim(false);
    });
  }

  private placeBall(): void {
    this.ballObj.position.set(this.ball.x, this.ball.y + BALL_R, this.ball.z);
    this.marker.position.set(this.ball.x, this.ball.y + 0.004, this.ball.z);
    if (this.phase !== 'aim') this.club.visible = this.club.scale.x > 0.01 && this.phase === 'roll';
  }

  private updateMoversVisual(): void {
    const h = this.h3d;
    if (!h) return;
    for (const s of h.sails) s.pivot.rotation.z = s.mover.angle;
    for (const s of h.sliders) s.mesh.position.set(s.mover.x, s.mover.y0, s.mover.z);
    for (const s of h.sweepers) s.mesh.rotation.y = -s.mover.angle;
  }

  private updateFlag(dt: number): void {
    const h = this.h3d;
    if (!h || !this.ball) return;
    const d = Math.hypot(this.ball.x - this.cup.x, this.ball.z - this.cup.z);
    const want = (this.phase === 'roll' && d < 0.9) || this.phase === 'sink' || this.phase === 'card' ? 0.32 : 0;
    this.flagLift += (want - this.flagLift) * Math.min(1, dt * 6);
    h.flag.position.set(h.flagBase.x, h.flagBase.y + this.flagLift, h.flagBase.z);
  }

  private updateCamera(dt: number): void {
    const c = this.cam, g = this.goal;
    const k = 1 - Math.exp(-dt * (this.phase === 'intro' ? 2 : 5));
    // shortest way round for the yaw
    let dy = g.yaw - c.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.yaw += dy * k;
    c.pitch += (g.pitch - c.pitch) * k;
    c.dist += (g.dist - c.dist) * k;
    c.t.lerp(g.t, k);
    if (this.phase === 'intro') {
      // glide from the cup towards the tee
      const tee = new THREE.Vector3(this.ball.x, this.ball.y, this.ball.z);
      const f = Phaser.Math.Clamp(this.phaseT / 2.6, 0, 1);
      const e = f * f * (3 - 2 * f);
      g.t.copy(new THREE.Vector3(this.cup.x, this.cup.y, this.cup.z).lerp(tee, e));
      g.dist = Math.max(3, this.h3d!.radius * 1.6) * (1 - e) + 3 * e;
      g.pitch = 1.2 - e * 0.28;
    }
    const cam = this.world.camera;
    const [dx, dz] = aimDir(c.yaw);
    const ch = Math.cos(c.pitch) * c.dist, cv = Math.sin(c.pitch) * c.dist;
    cam.position.set(c.t.x - dx * ch, c.t.y + cv, c.t.z - dz * ch);
    cam.lookAt(c.t);
    // trees between the camera and the course step aside
    if (this.h3d) {
      for (const o of this.h3d.decor) {
        const near = Math.hypot(o.position.x - cam.position.x, o.position.z - cam.position.z) < 1.6 + o.scale.x * 0.5;
        const between = Math.hypot(o.position.x - (cam.position.x + c.t.x) / 2, o.position.z - (cam.position.z + c.t.z) / 2) < ch * 0.45 && o.scale.x > 1.4 && cv < 4.5;
        o.visible = !near && !between;
      }
    }
  }

  private updateRollSound(): void {
    const s = this.rollSound as Phaser.Sound.WebAudioSound | null;
    if (!s) return;
    const rolling = this.phase === 'roll' && !this.ball.air;
    const v = rolling ? Math.hypot(this.ball.vx, this.ball.vz) : 0;
    const vol = rolling ? Math.min(0.55, (v / MAX_SPEED) * 0.9) * this.timeScale : 0;
    s.setVolume(vol);
    s.setRate(0.6 + Math.min(1, v / 4) * 0.9);
  }

  /** Test hook: putt at once (angle in radians, 0 = north; power 0..1). */
  testPutt(angle: number, power: number): void {
    if (this.phase === 'intro') this.skipIntro();
    if (this.phase !== 'aim') return;
    this.aim = angle;
    this.power = power;
    this.putt();
  }

  /** Test hook: the phase and the ball. */
  testState(): { phase: Phase; ball: Ball; strokes: number; hole: number; speed: number } {
    return { phase: this.phase, ball: { ...this.ball }, strokes: this.strokes, hole: this.round[this.hi] ?? -1, speed: shotSpeed(this.power) };
  }

  /** Test hook: hole out at once with this many strokes. */
  testSink(strokes = 1): void {
    if (this.phase === 'intro') this.skipIntro();
    if (this.phase !== 'aim' && this.phase !== 'roll') return;
    this.strokes = strokes;
    this.ball.x = this.cup.x;
    this.ball.z = this.cup.z;
    this.placeBall();
    this.onSunk();
  }

  /** Test hook: the camera jumps to where it is heading. */
  testSnap(): void {
    for (let i = 0; i < 60; i++) this.updateCamera(0.05);
  }

  /** Test hook: start a round from the picker. */
  testPick(i: number): void {
    if (this.phase === 'pick') {
      this.picker?.close();
      this.startRound(i);
    }
  }

  /** Test hook: jump to a hole of the round. */
  testHole(k: number): void {
    if (!this.round.length) return;
    this.hi = Math.max(0, Math.min(this.round.length - 1, k));
    this.startHole();
  }
}

