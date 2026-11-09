import Phaser from 'phaser';
import { ArcadeScene, burst, flash, shake, t, txt, rng, net, playerCharacter, CHARACTER_FRAME, isEasy } from '@core';
import {
  WORLD_W, PAD, makeRound, fly, crater, tankPose, groundAt, aiAim, type Shot, type TreeSpec,
} from './world';
import { makeArt, TEAM, BODY } from './art';

const W = 1280, H = 720;
const WIN = 3;                      // rounds to win the match
const CHARGE_MS = 1700;             // empty to full power
const TURN_TIME = 25;               // seconds per online turn before an automatic shot
const DRIVE = 80;                   // px per second
const AIM_RATE = 55;                // degrees per second with the keys
const UI = 1000;                    // UI objects sit at this depth or above, fixed to the screen
const CREW_S = 0.34;                // commander scale in the hatch
// kept clear of the screen's edges, which a rounded or cropped frame may hide
const FIRE_X = 1162, FIRE_Y = 600, FIRE_R = 70;
const MAP = { x: 460, y: 64, w: 360, h: 46 };
/**
 * Normal and Easy (practice). The CPU's skill is base + round * perRound + shots * perShot, capped;
 * skill 0 misses by up to ±8° and ±13 power, skill 1 by ±1° and ±1. Easy: it starts wild (0), learns
 * about half as fast from round to round and shot to shot and never sharpens past 0.55 (instead of 0.9);
 * the wind blows at half strength and your aim guide is 11 dots long instead of 7.
 */
const TUNING = {
  normal: { base: 0.1, perRound: 0.1, perShot: 0.13, cap: 0.9, wind: 1, guide: 7 },
  easy: { base: 0, perRound: 0.05, perShot: 0.07, cap: 0.55, wind: 0.5, guide: 11 },
};

export const CREW_POSES = ['stand', 'front', 'action1', 'action2', 'hit', 'cheer1', 'cheer2'] as const;

/** The sky of each round: morning, afternoon, sunset, dusk, night (then again). */
const SKIES = [
  { top: 0x6fb7ff, bottom: 0xffe2b8, far: 0x9cbde0, near: 0x77a0c2, sun: [980, 140], sunGlow: 0xfff1b0, sunCore: 0xffffff, cloud: 0xffffff, cloudA: 1, stars: false, shade: [0x000000, 0] },
  { top: 0x3f8fe0, bottom: 0xbfe3ff, far: 0x86acd6, near: 0x5f8db8, sun: [700, 90], sunGlow: 0xfff6d0, sunCore: 0xffffff, cloud: 0xffffff, cloudA: 1, stars: false, shade: [0x000000, 0] },
  { top: 0x3b4a8f, bottom: 0xff9a62, far: 0x8a6f9e, near: 0x5f4f7f, sun: [300, 300], sunGlow: 0xffb070, sunCore: 0xfff0c0, cloud: 0xffc9b0, cloudA: 0.9, stars: false, shade: [0x7a2a10, 0.14] },
  { top: 0x1f2a5a, bottom: 0xd9707a, far: 0x5a4f7a, near: 0x3d3a62, sun: [1040, 330], sunGlow: 0xff8a7a, sunCore: 0xffd0b0, cloud: 0xd8a0b0, cloudA: 0.7, stars: true, shade: [0x2a1440, 0.26] },
  { top: 0x070d24, bottom: 0x2b3a6e, far: 0x26305a, near: 0x1b2347, sun: [900, 110], sunGlow: 0x9fb4ff, sunCore: 0xf2f4ff, cloud: 0x8090c0, cloudA: 0.45, stars: true, shade: [0x050a2a, 0.42] },
] as const;

type Phase = 'intro' | 'aim' | 'ai' | 'wait' | 'flight' | 'boom' | 'roundEnd' | 'done';

interface Tank {
  seat: 0 | 1;
  x: number; x0: number; y: number; rot: number;
  deg: number; shownDeg: number; power: number; lastPower: number;
  alive: boolean;
  c: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  barrel: Phaser.GameObjects.Image;
  crew: Phaser.GameObjects.Image;
  prefix: string;
  local: boolean;      // controlled on this screen by a person
  ai: boolean;
  shots: number;       // shots this round
  lastPath: Float32Array | null;   // this tank's previous shot, shown faintly while it aims
}

interface Tree { img: Phaser.GameObjects.Image; spec: TreeSpec }
interface FireMsg { n: number; d: number; p: number; x: number; ix: number; iy: number; k: number; o: 0 | 1 | 2 }

export class PlayScene extends ArcadeScene {
  private online = false;
  private mySeat: 0 | 1 = 0;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private routed = new WeakSet<Phaser.GameObjects.GameObject>();

  private heights: Float32Array = new Float32Array(WORLD_W + 1);
  private grass = new Uint8Array(WORLD_W + 1);
  private groundTex!: Phaser.Textures.CanvasTexture;
  private dirt!: HTMLImageElement;
  private trees: Tree[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private backdrop: Phaser.GameObjects.GameObject[] = [];
  private tanks: Tank[] = [];
  private shell!: Phaser.GameObjects.Image;
  private shellGlow!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Graphics;
  private guide!: Phaser.GameObjects.Graphics;
  private padG!: Phaser.GameObjects.Graphics;
  private meterG!: Phaser.GameObjects.Graphics;
  private wrecks: Phaser.Time.TimerEvent[] = [];

  // match state
  private phase: Phase = 'intro';
  private round = 0;
  private turn: 0 | 1 = 0;
  private shotNo = 0;
  private scores: [number, number] = [0, 0];
  private wind = 0;
  private roundSeed = 0;
  private shot: Shot | null = null;
  private shotBy: 0 | 1 = 0;
  private flightIdx = 0;
  private whistled = false;
  private pendingFire: FireMsg | null = null;
  private turnLeft = 0;
  private lastAimSent = 0;
  private aimDirty = false;

  // input
  private charging = false;
  private chargeT = 0;
  private firePointer = -1;
  private drag: 'none' | 'aim' | 'move' = 'none';
  private dragPointer = -1;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchUi = false;
  private hintShown = true;

  // camera
  private camX = 0; private camZ = 1;
  private peekX: number | null = null;
  private peekUntil = 0;
  private hold: { x: number; z: number; until: number } | null = null;

  // UI
  private uiG!: Phaser.GameObjects.Graphics;
  private mapG!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private nameL!: Phaser.GameObjects.Text;
  private nameR!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private windText!: Phaser.GameObjects.Text;
  private aimText!: Phaser.GameObjects.Text;
  private fireText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private edgeText!: Phaser.GameObjects.Text;
  private engine: Phaser.Sound.BaseSound | null = null;
  tune = TUNING.normal;

  createGame(): void {
    this.online = net.active;
    this.tune = isEasy() ? TUNING.easy : TUNING.normal;
    this.useHud = !this.online;
    this.mySeat = this.online ? net.seat : 0;
    this.routed = new WeakSet();
    this.trees = []; this.clouds = []; this.tanks = []; this.wrecks = []; this.backdrop = [];
    this.phase = 'intro'; this.round = 0; this.shotNo = 0; this.scores = [0, 0]; this.wind = 0;
    this.shot = null; this.flightIdx = 0; this.whistled = false; this.pendingFire = null; this.turnLeft = 0;
    this.charging = false; this.chargeT = 0; this.firePointer = -1; this.drag = 'none'; this.dragPointer = -1;
    this.peekX = null; this.peekUntil = 0; this.hold = null; this.aimDirty = false; this.lastAimSent = 0;
    this.touchUi = this.sys.game.device.input.touch;
    this.hintShown = true;
    this.engine = null;
    makeArt(this);
    this.dirt = this.textures.get('tt-dirt').getSourceImage() as HTMLImageElement;

    // the world camera zooms and follows the shell; a second camera draws the UI on top, unzoomed
    this.cameras.main.setBackgroundColor('#0d1b33');
    this.uiCam = this.cameras.add(0, 0, W, H).setName('ui');
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.route, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.route, this);
      this.engine?.stop();
    });

    if (!this.textures.exists('tt-ground')) this.textures.createCanvas('tt-ground', WORLD_W, H);
    this.groundTex = this.textures.get('tt-ground') as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'tt-ground').setOrigin(0).setDepth(10);
    this.padG = this.add.graphics().setDepth(11);
    this.guide = this.add.graphics().setDepth(28);
    this.meterG = this.add.graphics().setDepth(46);
    this.trail = this.add.graphics().setDepth(29);
    this.shellGlow = this.add.image(0, 0, 'tt-glow').setDepth(30).setTint(0xffb347).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setVisible(false);
    this.shell = this.add.image(0, 0, 'tt-shell').setDepth(31).setVisible(false);

    // the two tanks: seat 0 on the left, seat 1 on the right
    const prefixes = this.online ? (this.mySeat === 0 ? ['pc', 'op'] : ['op', 'pc']) : ['pc', 'op'];
    for (const seat of [0, 1] as const) {
      const local = this.online ? seat === this.mySeat : seat === 0;
      this.tanks.push(this.makeTank(seat, prefixes[seat], local, !this.online && seat === 1));
    }

    this.buildUi();
    this.setupInput();
    this.startRound(this.online ? net.starter : 0);
    this.route();
  }

  // ------------------------------------------------------------------ cameras
  /** Screen-fixed objects (scroll factor 0) belong to the UI camera, everything else to the world. */
  private route(): void {
    const main = this.cameras.main;
    for (const o of this.children.list) {
      if (this.routed.has(o)) continue;
      this.routed.add(o);
      const sf = (o as unknown as { scrollFactorX?: number }).scrollFactorX ?? 1;
      if (sf === 0 && !o.getData?.('world')) main.ignore(o);
      else this.uiCam.ignore(o);
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    const me = this.tanks[this.turn];
    let tx = me.x + (me.seat === 0 ? 220 : -220), tz = 1;
    const now = this.time.now;
    if (this.phase === 'flight' && this.shot) {
      const i = Math.min(this.shot.steps - 1, Math.floor(this.flightIdx));
      const sx = this.shot.path[i * 2], sy = this.shot.path[i * 2 + 1];
      tx = sx;
      // zoom out to keep a high shell in view
      tz = Phaser.Math.Clamp(H / (H - Math.min(sy, 60) + 80), 0.5, 1);
    }
    if (this.hold && now < this.hold.until) { tx = this.hold.x; tz = this.hold.z; }
    if (this.peekX !== null && now < this.peekUntil && (this.phase === 'aim' || this.phase === 'wait' || this.phase === 'ai')) tx = this.peekX;
    const k = 1 - Math.pow(0.0025, dt);
    this.camZ += (tz - this.camZ) * Math.min(1, k * 0.9);
    this.camX += (tx - this.camX) * k;
    const half = W / (2 * this.camZ);
    this.camX = Phaser.Math.Clamp(this.camX, half, WORLD_W - half);
    cam.setZoom(this.camZ);
    cam.centerOn(this.camX, H - H / (2 * this.camZ));
  }

  // ------------------------------------------------------------------ world drawing
  /** Sky, sun or moon, mountains and clouds for the round's time of day (morning to night). */
  private drawBackdrop(): void {
    for (const o of this.backdrop) o.destroy();
    this.backdrop = [];
    this.clouds = [];
    const th = SKIES[this.round % SKIES.length];
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.backdrop.push(o); return o; };
    // sky (screen-fixed but drawn by the world camera, behind everything)
    const sky = keep(this.add.graphics().setScrollFactor(0).setDepth(0).setData('world', true));
    sky.fillGradientStyle(th.top, th.top, th.bottom, th.bottom, 1).fillRect(-800, -700, W + 1600, H + 1400);
    this.cameras.main.setBackgroundColor(th.top);
    if (th.stars) {
      if (!this.textures.exists('tt-stars')) {
        const tex = this.textures.createCanvas('tt-stars', 1340, 450);
        if (tex) {
          const c = tex.getContext(), r = rng.seeded(5);
          for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; c.beginPath(); c.arc(r() * 1340, r() * 450, 0.4 + r() * 0.8, 0, Math.PI * 2); c.fill(); }
          tex.refresh();
        }
      }
      keep(this.add.image(-600, -500, 'tt-stars').setOrigin(0).setScale(2).setScrollFactor(0.05, 0).setDepth(0.2).setData('world', true));
    }
    keep(this.add.image(th.sun[0], th.sun[1], 'tt-glow').setScrollFactor(0).setDepth(0.5).setScale(3.2).setTint(th.sunGlow).setAlpha(0.75).setData('world', true));
    keep(this.add.image(th.sun[0], th.sun[1], 'tt-glow').setScrollFactor(0).setDepth(0.6).setScale(0.9).setTint(th.sunCore).setData('world', true));
    // two mountain ranges in parallax
    const ranges: Array<[number, number, number, number]> = [[0.2, th.far, 330, 120], [0.45, th.near, 400, 90]];
    ranges.forEach(([f, col, base, amp], i) => {
      // painted at half resolution into a canvas (a Graphics polygon would be re-triangulated every frame)
      const key = `tt-mtn${i}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      const x0 = -1300, x1 = WORLD_W * f + W * 2.2, top = base - amp - 20, bottom = 900;
      const tex = this.textures.createCanvas(key, Math.ceil((x1 - x0) / 2), Math.ceil((bottom - top) / 2));
      if (!tex) return;
      const c = tex.getContext();
      const r = rng.seeded(11 + i);
      c.fillStyle = '#' + col.toString(16).padStart(6, '0');
      c.beginPath(); c.moveTo(0, (bottom - top) / 2);
      let x = x0, y = base;
      while (x < x1) { c.lineTo((x - x0) / 2, (y - top) / 2); x += 60 + r() * 90; y = base - r() * amp; }
      c.lineTo((x1 - x0) / 2, (bottom - top) / 2); c.closePath(); c.fill();
      tex.refresh();
      keep(this.add.image(x0, top, key).setOrigin(0).setScale(2).setScrollFactor(f, 1).setDepth(1 + i));
    });
    for (let i = 0; i < 9; i++) {
      const c = keep(this.add.image(rng.int(-200, WORLD_W), rng.int(-60, 170), 'tt-cloud').setScrollFactor(0.6, 1).setDepth(3)
        .setScale(rng.int(50, 110) / 100).setAlpha((rng.int(55, 90) / 100) * th.cloudA).setTint(th.cloud));
      this.clouds.push(c);
    }
    // evening and night light over the land and the tanks (the blasts stay bright above it)
    if (th.shade[1] > 0) keep(this.add.rectangle(-800, -700, W + 1600, H + 1400, th.shade[0], th.shade[1]).setOrigin(0).setScrollFactor(0).setDepth(35).setData('world', true));
  }

  /** Repaints the ground canvas from the heights: patterned soil, grass on the untouched surface, scorch in craters. */
  private paintGround(): void {
    const c = this.groundTex.getContext();
    const h = this.heights;
    c.clearRect(0, 0, WORLD_W, H);
    c.save();
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= WORLD_W; x += 2) c.lineTo(x, h[x]);
    c.lineTo(WORLD_W, H); c.closePath();
    c.clip();
    const pat = c.createPattern(this.dirt, 'repeat');
    if (pat) { c.fillStyle = pat; c.fillRect(0, 0, WORLD_W, H); }
    const shade = c.createLinearGradient(0, 230, 0, H);
    shade.addColorStop(0, 'rgba(120,70,30,0.15)'); shade.addColorStop(1, 'rgba(30,15,5,0.55)');
    c.fillStyle = shade; c.fillRect(0, 0, WORLD_W, H);
    c.restore();
    // grass band and scorched crater edges along the surface
    const run = (on: number, style: string, width: number, dy: number) => {
      c.strokeStyle = style; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
      let open = false;
      c.beginPath();
      for (let x = 0; x <= WORLD_W; x += 2) {
        if (this.grass[x] === on) { if (!open) { c.moveTo(x, h[x] + dy); open = true; } else c.lineTo(x, h[x] + dy); } else open = false;
      }
      c.stroke();
    };
    run(1, '#3f9a3c', 12, 4);
    run(1, '#69c45a', 5, 0);
    run(0, 'rgba(70,42,22,0.55)', 9, 3);
    run(0, 'rgba(35,20,10,0.6)', 3, 0);
    this.groundTex.refresh();
    this.paintMap();
  }

  private makeTank(seat: 0 | 1, prefix: string, local: boolean, ai: boolean): Tank {
    const c = this.add.container(0, 0).setDepth(20);
    const barrel = this.add.image(0, -(BODY.groundY - BODY.pivotY), 'tt-barrel').setOrigin(0.06, 0.5);
    const crew = this.add.image(0, 0, `${prefix}-stand`).setOrigin(0.5, 0).setScale(CREW_S).setFlipX(seat === 1);
    crew.setCrop(0, 0, CHARACTER_FRAME.width, 100);
    crew.setY(-(BODY.groundY - 14) - 100 * CREW_S);
    const body = this.add.image(0, 0, `tt-tank${seat}`).setOrigin(0.5, BODY.groundY / BODY.h);
    c.add([barrel, crew, body]);
    return {
      seat, x: 0, x0: 0, y: 0, rot: 0, deg: seat === 0 ? 45 : 135, shownDeg: seat === 0 ? 45 : 135,
      power: 60, lastPower: 0, alive: true, c, body, barrel, crew, prefix, local, ai, shots: 0, lastPath: null,
    };
  }

  private crewPose(tk: Tank, pose: (typeof CREW_POSES)[number]): void {
    tk.crew.setTexture(`${tk.prefix}-${pose}`).setFlipX(tk.seat === 1 && pose !== 'front');
    tk.crew.setCrop(0, 0, CHARACTER_FRAME.width, 100);
  }

  private placeTank(tk: Tank): void {
    const p = tankPose(this.heights, tk.x);
    tk.y = p.y; tk.rot = p.rot;
    tk.c.setPosition(tk.x, tk.y).setRotation(tk.rot);
    tk.barrel.setRotation(-(tk.shownDeg * Math.PI) / 180 - tk.rot);
  }

  // ------------------------------------------------------------------ rounds
  private startRound(starter: 0 | 1): void {
    this.roundSeed = this.online ? (net.seed ^ Math.imul(this.round + 1, 0x9e3779b1)) >>> 0 : rng.int(1, 2 ** 30);
    const r = rng.seeded(this.roundSeed);
    const round = makeRound(r, this.round);
    this.drawBackdrop();
    this.heights = round.heights;
    this.grass.fill(1);
    this.paintGround();
    for (const tr of this.trees) tr.img.destroy();
    this.trees = round.trees.map((spec) => ({
      spec,
      img: this.add.image(spec.x, groundAt(this.heights, spec.x) + 4, `tt-tree${spec.kind}`).setOrigin(0.5, 1).setDepth(9).setScale(spec.size * 0.75),
    }));
    for (const w of this.wrecks) w.remove();
    this.wrecks = [];
    this.tanks.forEach((tk, i) => {
      tk.x = tk.x0 = round.x[i];
      tk.deg = tk.shownDeg = i === 0 ? 45 : 135;
      tk.alive = true; tk.shots = 0; tk.lastPower = 0; tk.lastPath = null;
      tk.body.clearTint(); tk.barrel.setVisible(true).clearTint(); tk.crew.setVisible(true);
      this.crewPose(tk, 'stand');
      this.placeTank(tk);
      tk.c.setAlpha(1).setScale(1);
    });
    this.drawPads();
    this.turn = starter;
    this.wind = this.nextWind();
    this.updateBoard();
    // camera: show your tank, then fly over to the other one, then to whoever starts
    const mine = this.tanks[this.mySeat], other = this.tanks[1 - this.mySeat];
    this.camX = mine.x; this.camZ = 1;
    this.phase = 'intro';
    this.hold = { x: mine.x + (mine.seat === 0 ? 200 : -200), z: 1, until: this.time.now + 650 };
    this.time.delayedCall(650, () => { this.hold = { x: other.x, z: 1, until: this.time.now + 950 }; });
    this.cameras.main.fadeIn(400, 13, 27, 51);
    this.showBanner(t('round', { n: this.round + 1 }), '#ffd23f');
    this.sfx('round', { volume: 0.5, exact: true });
    this.time.delayedCall(1700, () => { if (!this.isOver) this.beginTurn(); });
  }

  private drawPads(): void {
    const g = this.padG;
    g.clear();
    for (const tk of this.tanks) {
      g.lineStyle(3, TEAM[tk.seat].hex, 0.5);
      for (const x of [tk.x0 - PAD - 30, tk.x0 + PAD + 30]) g.lineBetween(x, groundAt(this.heights, x) + 4, x, groundAt(this.heights, x) - 10);
    }
  }

  private nextWind(): number {
    const v = this.online ? rng.seeded((this.roundSeed ^ Math.imul(this.shotNo + 1, 2654435761)) >>> 0)() : Math.random();
    const strength = (0.025 + Math.min(this.round, 4) * 0.006) * this.tune.wind;
    return Math.round((v - 0.5) * 2 * strength * 1000) / 1000;
  }

  private beginTurn(): void {
    if (this.isOver) return;
    const tk = this.tanks[this.turn];
    this.hold = null;
    this.charging = false; this.chargeT = 0;
    this.drag = 'none';
    this.turnLeft = TURN_TIME;
    for (const o of this.tanks) if (o.alive) this.crewPose(o, o === tk ? 'stand' : 'front');
    if (tk.ai) {
      this.phase = 'ai';
      this.turnText.setText(t('cpuTurn')).setColor(TEAM[tk.seat].main);
      this.aiTurn(tk);
    } else if (tk.local) {
      this.phase = 'aim';
      this.turnText.setText(t('yourTurn')).setColor('#ffffff');
      this.sfx('turn', { volume: 0.4 });
      if (this.hintShown) this.hint.setText(t(this.touchUi ? 'hintTouch' : 'hintKeys')).setAlpha(1);
    } else {
      this.phase = 'wait';
      this.turnText.setText(t('theirTurn')).setColor(TEAM[tk.seat].main);
      if (this.pendingFire && this.pendingFire.n === this.shotNo) {
        const m = this.pendingFire;
        this.pendingFire = null;
        this.time.delayedCall(200, () => this.applyRemoteFire(m));
      }
    }
    this.tweens.add({ targets: this.turnText, scale: { from: 1.25, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  // ------------------------------------------------------------------ AI
  /** The CPU's aim skill (0 = wild, 1 = sharp) for a tank that has fired `shots` times this round. */
  ai(shots = 0): { skill: number } {
    const k = this.tune;
    return { skill: Math.min(k.cap, k.base + this.round * k.perRound + shots * k.perShot) };
  }

  private aiTurn(tk: Tank): void {
    const delay = 650 + rng.int(0, 350);
    this.time.delayedCall(delay, () => {
      if (this.isOver || this.phase !== 'ai') return;
      const { skill } = this.ai(tk.shots);
      const aim = aiAim(this.heights, this.tanks.map((o) => o.x), tk.seat, this.wind, skill, Math.random);
      // turn the barrel, then charge with the meter visible, then fire
      const turnMs = Math.min(900, 250 + Math.abs(aim.deg - tk.deg) * 12);
      this.tweens.add({ targets: tk, deg: aim.deg, duration: turnMs, ease: 'Sine.easeInOut' });
      this.time.delayedCall(turnMs + 150, () => {
        if (this.isOver || this.phase !== 'ai') return;
        this.charging = true; this.chargeT = 0;
        this.crewPose(tk, 'action1');
        const ms = ((aim.power - 10) / 90) * CHARGE_MS;
        this.time.delayedCall(ms, () => {
          if (this.isOver || this.phase !== 'ai') return;
          this.charging = false;
          this.fire(tk, aim.power);
        });
      });
    });
  }

  // ------------------------------------------------------------------ input
  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT), up: kb.addKey(K.UP), down: kb.addKey(K.DOWN),
      a: kb.addKey(K.A), d: kb.addKey(K.D), w: kb.addKey(K.W), s: kb.addKey(K.S),
    };
    const press = () => { if (this.canControl() && !this.charging) { this.firePointer = -2; this.startCharge(); } };
    const letGo = () => { if (this.charging && this.firePointer === -2) this.release(); };
    kb.on('keydown-SPACE', press);
    kb.on('keyup-SPACE', letGo);
    kb.on('keydown-ENTER', press);
    kb.on('keyup-ENTER', letGo);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.online && p.x > W - 130 && p.y < 130) return;          // the pause button
      if (Math.hypot(p.x - FIRE_X, p.y - FIRE_Y) < FIRE_R + 22) {
        if (this.canControl() && !this.charging) { this.firePointer = p.id; this.startCharge(); }
        return;
      }
      if (p.x > MAP.x - 10 && p.x < MAP.x + MAP.w + 10 && p.y > MAP.y - 10 && p.y < MAP.y + MAP.h + 10) {
        this.peekX = ((p.x - MAP.x) / MAP.w) * WORLD_W;
        this.peekUntil = this.time.now + 1800;
        this.sfx('tick', { volume: 0.3 });
        return;
      }
      if (!this.canControl()) return;
      const tk = this.tanks[this.turn];
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.dragPointer = p.id;
      if (Math.abs(wp.x - tk.x) < 70 && Math.abs(wp.y - (tk.y - 30)) < 60) this.drag = 'move';
      else { this.drag = 'aim'; this.aimAt(tk, wp.x, wp.y); }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || p.id !== this.dragPointer || !this.canControl()) return;
      const tk = this.tanks[this.turn];
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.drag === 'aim') this.aimAt(tk, wp.x, wp.y);
      else if (this.drag === 'move') this.driveTo(tk, wp.x);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (p.id === this.firePointer && this.charging) this.release();
      if (p.id === this.firePointer) this.firePointer = -1;
      if (p.id === this.dragPointer) { this.drag = 'none'; this.dragPointer = -1; this.stopEngine(); }
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  private canControl(): boolean {
    return this.phase === 'aim' && this.tanks[this.turn].local && !this.isOver;
  }

  private aimAt(tk: Tank, wx: number, wy: number): void {
    const px = tk.x + 38 * Math.sin(tk.rot), py = tk.y - 38 * Math.cos(tk.rot);
    let deg = (Math.atan2(py - wy, wx - px) * 180) / Math.PI;
    if (deg < -90) deg = 175;
    else if (deg < 0) deg = 5;
    this.setDeg(tk, deg);
  }

  private setDeg(tk: Tank, deg: number): void {
    const d = Phaser.Math.Clamp(deg, 5, 175);
    if (Math.round(d) !== Math.round(tk.deg)) {
      if (Math.floor(d / 5) !== Math.floor(tk.deg / 5)) this.sfx('tick', { volume: 0.15 });
      this.aimDirty = true;
    }
    tk.deg = d;
  }

  private driveTo(tk: Tank, x: number): void {
    const nx = Phaser.Math.Clamp(x, tk.x0 - PAD, tk.x0 + PAD);
    if (Math.abs(nx - tk.x) < 0.5) return;
    const step = Phaser.Math.Clamp(nx - tk.x, -6, 6);
    tk.x += step;
    this.aimDirty = true;
    this.startEngine();
    if (this.time.now - this.lastDust > 90) {
      this.lastDust = this.time.now;
      this.puff(tk.x - Math.sign(step) * 44, tk.y - 4, 'smokewhite', 0.16, 500);
    }
  }

  private startEngine(): void {
    if (this.engine?.isPlaying) return;
    if (!this.engine) this.engine = this.sound.add('engine', { loop: true, volume: 0.25 });
    this.engine.play();
  }

  private stopEngine(): void {
    if (this.engine?.isPlaying) this.engine.stop();
  }

  private startCharge(): void {
    this.charging = true;
    this.chargeT = 0;
    this.crewPose(this.tanks[this.turn], 'action1');
    this.sfx('charge', { volume: 0.35 });
    this.hintShown = false;
    this.tweens.add({ targets: this.hint, alpha: 0, duration: 300 });
  }

  private chargePower(): number {
    return Math.round(10 + 90 * Math.min(1, this.chargeT / CHARGE_MS));
  }

  private release(): void {
    if (!this.charging || !this.canControl()) { this.charging = false; return; }
    this.charging = false;
    this.firePointer = -1;
    this.fire(this.tanks[this.turn], this.chargePower());
  }

  // ------------------------------------------------------------------ shooting
  private fire(tk: Tank, power: number): void {
    power = Math.round(power);
    this.stopEngine();
    tk.power = power;
    tk.shownDeg = tk.deg;
    this.placeTank(tk);
    const s = fly(this.heights, this.tanks.map((o) => o.x), tk.x, tk.deg, power, this.wind);
    if (this.online && tk.local) {
      const msg: FireMsg = {
        n: this.shotNo, d: Math.round(tk.deg * 100) / 100, p: power, x: Math.round(tk.x * 100) / 100,
        ix: Math.round(s.x * 100) / 100, iy: Math.round(s.y * 100) / 100, k: s.kill ?? -1, o: s.kind === 'out' ? 0 : s.kind === 'tank' ? 2 : 1,
      };
      net.send('fire', msg);
    }
    this.launch(tk, s);
  }

  /** The opponent's shot, replayed here with their aim; their landing spot is the one that counts. */
  private applyRemoteFire(m: FireMsg): void {
    const tk = this.tanks[this.turn];
    tk.x = m.x; tk.deg = tk.shownDeg = m.d;
    this.placeTank(tk);
    const s = fly(this.heights, this.tanks.map((o) => o.x), tk.x, m.d, m.p, this.wind);
    // trust the shooter's result: bend the end of our path onto their landing spot
    const kind = m.o === 0 ? 'out' : m.o === 2 ? 'tank' : 'ground';
    const dx = m.ix - s.x, dy = m.iy - s.y;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      const n = s.steps;
      for (let i = 0; i < n; i++) {
        const k = Math.max(0, (i - n * 0.6) / (n * 0.4));
        s.path[i * 2] += dx * k; s.path[i * 2 + 1] += dy * k;
      }
    }
    s.x = m.ix; s.y = m.iy; s.kind = kind as Shot['kind']; s.kill = m.k < 0 ? null : m.k;
    this.launch(tk, s);
  }

  private launch(tk: Tank, s: Shot): void {
    this.shot = s; this.shotBy = tk.seat;
    this.flightIdx = 0; this.whistled = false;
    this.phase = 'flight';
    tk.shots++;
    tk.lastPower = tk.power;
    tk.lastPath = s.path;
    this.guide.clear();
    this.crewPose(tk, 'action2');
    this.time.delayedCall(450, () => { if (tk.alive) this.crewPose(tk, 'stand'); });
    // muzzle flash, smoke, recoil
    const mx = s.path[0], my = s.path[1];
    const a = (tk.deg * Math.PI) / 180;
    this.sfxAt('cannon', this.screenX(mx), { volume: 0.85 });
    const fl = this.add.image(mx, my, 'tt-glow').setDepth(40).setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9);
    this.tweens.add({ targets: fl, scale: 0.2, alpha: 0, duration: 160, onComplete: () => fl.destroy() });
    for (let i = 0; i < 4; i++) this.puff(mx + Math.cos(a) * i * 8, my - Math.sin(a) * i * 8, 'smokewhite', 0.25 + i * 0.05, 700 + i * 120);
    const bx = tk.barrel.x;
    this.tweens.add({ targets: tk.barrel, x: bx - 7, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: tk.c, angle: tk.c.angle + (tk.seat === 0 ? -2.5 : 2.5), duration: 70, yoyo: true });
    shake(this, 0.004, 120);
    this.shell.setVisible(true).setPosition(mx, my);
    this.shellGlow.setVisible(true).setPosition(mx, my);
    this.trail.clear();
  }

  private updateFlight(dt: number): void {
    const s = this.shot!;
    const speed = s.steps > 260 ? 1.45 : 1.15;
    const prev = Math.floor(this.flightIdx);
    this.flightIdx = Math.min(s.steps - 1, this.flightIdx + dt * 60 * speed);
    const i = Math.floor(this.flightIdx);
    const x = s.path[i * 2], y = s.path[i * 2 + 1];
    const px = s.path[Math.max(0, i - 1) * 2], py = s.path[Math.max(0, i - 1) * 2 + 1];
    this.shell.setPosition(x, y).setRotation(Math.atan2(y - py, x - px));
    this.shellGlow.setPosition(x, y);
    // a fading smoke trail
    const g = this.trail;
    g.clear();
    const from = Math.max(0, i - 70);
    for (let k = from; k < i; k += 2) {
      const f = (k - from) / Math.max(1, i - from);
      g.fillStyle(0xffffff, 0.08 + f * 0.35).fillCircle(s.path[k * 2], s.path[k * 2 + 1], 2 + f * 3);
    }
    // whistle as a long shot comes down
    if (!this.whistled && i > prev && s.steps > 110 && i > 30 && y > py && s.steps - i < 75) {
      this.whistled = true;
      this.sfxAt('whistle', this.screenX(x), { volume: 0.4 });
    }
    if (i >= s.steps - 1) this.impact(s);
  }

  private impact(s: Shot): void {
    this.phase = 'boom';
    this.shell.setVisible(false); this.shellGlow.setVisible(false);
    this.tweens.add({ targets: this.trail, alpha: 0, duration: 500, onComplete: () => { this.trail.clear().setAlpha(1); } });
    const shooter = this.tanks[this.shotBy];
    const mineShot = shooter.local && !this.online || (this.online && this.shotBy === this.mySeat);
    if (s.kind === 'out') {
      const ex = Phaser.Math.Clamp(s.x, 60, WORLD_W - 60);
      this.say(ex, 160, rng.pick(t('misses').split('|')), '#ffd23f');
      this.sfx('wide', { volume: 0.45 });
      this.hold = { x: ex, z: 1, until: this.time.now + 700 };
      this.time.delayedCall(800, () => this.nextTurn());
      return;
    }
    this.explode(s.x, s.y, s.kill !== null ? 1.35 : 1);
    const [c0, c1] = crater(this.heights, s.x, s.y);
    for (let x = c0; x <= c1; x++) this.grass[x] = 0;
    this.paintGround();
    this.knockTrees(s.x, s.y);
    this.hold = { x: s.x, z: 1.12, until: this.time.now + 650 };
    // tanks settle into the new ground
    for (const tk of this.tanks) {
      const before = tk.y;
      const p = tankPose(this.heights, tk.x);
      if (Math.abs(p.y - before) > 1 || Math.abs(p.rot - tk.rot) > 0.01) {
        tk.y = p.y; tk.rot = p.rot;
        this.tweens.add({ targets: tk.c, y: p.y, rotation: p.rot, duration: 260, ease: 'Bounce.easeOut' });
      }
    }
    if (s.kill !== null) {
      const dead = this.tanks[s.kill];
      this.time.delayedCall(120, () => this.destroyTank(dead, dead.seat === this.shotBy));
      if (!this.online && mineShot && dead.seat !== this.shotBy) {
        const one = shooter.shots === 1;
        this.addScore(400 + this.round * 150 + (one ? 300 : 0));
        this.say(dead.x, dead.y - 140, one ? t('oneShot') : t('direct'), '#ffd23f');
        this.say(dead.x, dead.y - 96, `+${400 + this.round * 150 + (one ? 300 : 0)}`, '#ffffff', 26);
      }
      return;
    }
    // a near miss
    const target = this.tanks[1 - this.shotBy];
    const d = Math.abs(s.x - target.x);
    if (d < 130) {
      this.say(s.x, s.y - 90, t('close'), '#ffb347');
      if (!this.online && mineShot) { this.addScore(40); this.say(s.x, s.y - 56, '+40', '#ffffff', 22); }
    } else this.say(s.x, s.y - 90, rng.pick(t('misses').split('|')), '#ffffff', 26);
    this.time.delayedCall(900, () => this.nextTurn());
  }

  private nextTurn(): void {
    if (this.isOver || this.phase === 'roundEnd' || this.phase === 'done') return;
    this.turn = this.turn === 0 ? 1 : 0;
    this.shotNo++;
    this.wind = this.nextWind();
    this.updateBoard();
    this.beginTurn();
  }

  // ------------------------------------------------------------------ effects
  private screenX(wx: number): number {
    const cam = this.cameras.main;
    return (wx - cam.worldView.x) * cam.zoom;
  }

  private puff(x: number, y: number, kind: string, scale: number, ms: number): void {
    const img = this.add.image(x, y, `${kind}${rng.int(0, 5)}`).setDepth(41).setScale(scale * 0.6).setAlpha(0.9).setAngle(rng.int(0, 360));
    this.tweens.add({
      targets: img, scale: scale * 1.6, alpha: 0, y: y - 30 - rng.int(0, 30), x: x + this.wind * 900, angle: img.angle + rng.int(-40, 40),
      duration: ms, ease: 'Sine.easeOut', onComplete: () => img.destroy(),
    });
  }

  private explode(x: number, y: number, k: number): void {
    this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), this.screenX(x), { volume: 0.8 });
    shake(this, 0.012 * k, 260);
    const fl = this.add.image(x, y, 'tt-glow').setDepth(42).setTint(0xffe08a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.4);
    this.tweens.add({ targets: fl, scale: 2.4 * k, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => fl.destroy() });
    const ring = this.add.graphics().setDepth(42).setPosition(x, y);
    ring.lineStyle(6, 0xffffff, 0.8).strokeCircle(0, 0, 20);
    this.tweens.add({ targets: ring, scale: 3.4 * k, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    for (let i = 0; i < 5; i++) this.puff(x + rng.int(-20, 20), y - rng.int(0, 25), 'smokeorange', 0.45 * k, 500 + i * 60);
    for (let i = 0; i < 6; i++) this.time.delayedCall(80 + i * 50, () => this.puff(x + rng.int(-30, 30), y - rng.int(10, 40), 'smokegrey', 0.5 * k, 1300));
    // clods of earth flying out
    for (let i = 0; i < 16 * k; i++) {
      const a = -Math.PI * (0.1 + Math.random() * 0.8), v = 180 + Math.random() * 320;
      const p = this.add.rectangle(x, y - 4, rng.int(4, 9), rng.int(4, 8), rng.pick([0x6b4a2b, 0x8a5f37, 0x3f9a3c, 0x4b3220])).setDepth(43);
      const tx = x + Math.cos(a) * v * 0.7, ty = y + Math.sin(a) * v * 0.5;
      this.tweens.add({ targets: p, x: tx, duration: 650, ease: 'Linear' });
      this.tweens.add({ targets: p, y: { from: y - 4, to: ty }, duration: 280, ease: 'Quad.easeOut', yoyo: false,
        onComplete: () => this.tweens.add({ targets: p, y: groundAt(this.heights, p.x) + 2, angle: rng.int(-180, 180), duration: 380, ease: 'Quad.easeIn', onComplete: () => this.tweens.add({ targets: p, alpha: 0, duration: 600, onComplete: () => p.destroy() }) }) });
    }
    burst(this, x, y - 10, [0xffd27a, 0xff8c42, 0xffffff], Math.round(14 * k), 300);
  }

  private knockTrees(x: number, y: number): void {
    this.trees = this.trees.filter((tr) => {
      const d = Math.hypot(tr.spec.x - x, groundAt(this.heights, tr.spec.x) - y);
      if (d < 75) {
        const dir = tr.spec.x >= x ? 1 : -1;
        this.tweens.add({ targets: tr.img, angle: 95 * dir, alpha: 0, y: tr.img.y + 10, duration: 650, ease: 'Quad.easeIn', onComplete: () => tr.img.destroy() });
        this.sfxAt('crack', this.screenX(tr.spec.x), { volume: 0.35 });
        return false;
      }
      if (d < 140) tr.img.setY(groundAt(this.heights, tr.spec.x) + 4);
      return true;
    });
  }

  private destroyTank(tk: Tank, self: boolean): void {
    tk.alive = false;
    this.phase = 'roundEnd';
    this.sfxAt('bigboom', this.screenX(tk.x), { volume: 0.9 });
    flash(this, 0xffffff, 140, 0.45);
    shake(this, 0.025, 500);
    this.explode(tk.x, tk.y - 20, 1.6);
    this.time.delayedCall(260, () => this.explode(tk.x + rng.int(-30, 30), tk.y - 30, 1.1));
    tk.body.setTint(0x3b3b3b);
    tk.crew.setVisible(false);
    // the turret's barrel flies off, spinning
    const a = (tk.shownDeg * Math.PI) / 180;
    const bx = tk.x + 38 * Math.sin(tk.rot), by = tk.y - 38 * Math.cos(tk.rot);
    tk.barrel.setVisible(false);
    const flying = this.add.image(bx, by, 'tt-barrel').setOrigin(0.5).setRotation(-a).setDepth(44).setTint(0x555555);
    const dir = tk.seat === 0 ? -1 : 1;
    this.tweens.add({ targets: flying, x: bx + dir * rng.int(120, 220), duration: 1100, ease: 'Linear' });
    this.tweens.add({ targets: flying, y: by - 180, duration: 480, ease: 'Quad.easeOut',
      onComplete: () => this.tweens.add({ targets: flying, y: groundAt(this.heights, flying.x) - 4, duration: 560, ease: 'Quad.easeIn', onComplete: () => { this.sfxAt('clank', this.screenX(flying.x), { volume: 0.4 }); this.puff(flying.x, flying.y, 'smokegrey', 0.3, 700); } }) });
    this.tweens.add({ targets: flying, angle: 720 * dir, duration: 1040 });
    this.tweens.add({ targets: flying, alpha: 0, delay: 2600, duration: 500, onComplete: () => flying.destroy() });
    // the wreck keeps smoking until the next round
    this.wrecks.push(this.time.addEvent({ delay: 260, loop: true, callback: () => this.puff(tk.x + rng.int(-14, 14), tk.y - 34, 'smokegrey', 0.32, 1500) }));
    this.hold = { x: tk.x, z: 1.18, until: this.time.now + 1600 };
    this.say(tk.x, tk.y - 150, self ? t('selfHit') : t('destroyed'), '#ff5a5a', 40);
    const winner = tk.seat === 0 ? 1 : 0;
    this.time.delayedCall(1700, () => this.roundOver(winner));
  }

  private roundOver(winner: 0 | 1): void {
    if (this.isOver) return;
    this.scores[winner]++;
    this.updateBoard();
    const champ = this.tanks[winner];
    let k = 0;
    this.wrecks.push(this.time.addEvent({ delay: 240, loop: true, callback: () => champ.alive && this.crewPose(champ, k++ % 2 ? 'cheer1' : 'cheer2') }));
    const youWon = winner === this.mySeat;
    if (this.scores[winner] >= WIN) { this.matchOver(winner); return; }
    this.showBanner(youWon ? t('roundWon') : t('roundLost'), youWon ? '#5dff7a' : '#ff6b6b');
    this.sfx(youWon ? 'roundwin' : 'roundlose', { volume: 0.55, exact: true });
    if (youWon) this.confetti(40);
    this.time.delayedCall(2300, () => {
      if (this.isOver) return;
      this.cameras.main.fadeOut(350, 13, 27, 51);
      this.time.delayedCall(380, () => {
        if (this.isOver) return;
        this.round++;
        this.shotNo++;
        this.startRound(winner === 0 ? 1 : 0);              // the loser of the round starts the next
      });
    });
  }

  private matchOver(winner: 0 | 1): void {
    this.phase = 'done';
    const youWon = winner === this.mySeat;
    this.showBanner(youWon ? t('champion') : t('defeat'), youWon ? '#ffd23f' : '#ff6b6b');
    this.sfx(youWon ? 'victory' : 'roundlose', { volume: 0.6, exact: true });
    if (youWon) { this.confetti(110); this.time.delayedCall(500, () => this.confetti(80)); }
    if (this.online) {
      this.endGame({ win: youWon, title: youWon ? t('youWin') : t('youLose'), delay: 2400 });
    } else {
      if (youWon) this.addScore(1000);
      this.endGame({ win: youWon, title: youWon ? t('champion') : t('defeat'), delay: 2400 });
    }
  }

  private confetti(n: number): void {
    const cols = [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3, 0xffffff, TEAM[0].hex, TEAM[1].hex];
    for (let i = 0; i < n; i++) {
      const p = this.add.rectangle(rng.int(0, W), rng.int(-160, -10), rng.int(8, 14), rng.int(5, 8), rng.pick(cols)).setScrollFactor(0).setDepth(UI + 50).setAngle(rng.int(0, 360));
      this.tweens.add({
        targets: p, y: rng.int(420, H + 20), x: p.x + rng.int(-140, 140), angle: p.angle + rng.int(-540, 540),
        duration: rng.int(1500, 2300), ease: 'Sine.easeIn', onComplete: () => p.destroy(),
      });
      this.tweens.add({ targets: p, alpha: 0, delay: 1400, duration: 600 });
    }
  }

  /** A floating word in the world (hit, miss, bonus). */
  private say(x: number, y: number, s: string, color: string, size = 34): void {
    const o = txt(this, x, y, s, { title: true, size, color }).setDepth(60).setScale(0.4);
    this.tweens.add({ targets: o, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: o, y: y - 50, alpha: 0, delay: 900, duration: 600, onComplete: () => o.destroy() });
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setAlpha(1).setScale(0.3);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1700, duration: 400 });
  }

  // ------------------------------------------------------------------ UI
  private buildUi(): void {
    const ui = (o: Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth, d = 0) => { o.setScrollFactor(0); o.setDepth(UI + d); return o; };
    this.uiG = ui(this.add.graphics()) as Phaser.GameObjects.Graphics;
    const mapBg = ui(this.add.graphics(), 0) as Phaser.GameObjects.Graphics;
    mapBg.fillStyle(0x0b1020, 0.55).fillRoundedRect(MAP.x - 6, MAP.y - 4, MAP.w + 12, MAP.h + 8, 10);
    if (!this.textures.exists('tt-map')) this.textures.createCanvas('tt-map', MAP.w, MAP.h);
    ui(this.add.image(MAP.x, MAP.y, 'tt-map').setOrigin(0), 0.5);
    this.mapG = ui(this.add.graphics(), 1) as Phaser.GameObjects.Graphics;
    const peer = this.online ? (net.peerName || t('opponent')).slice(0, 10) : t('cpu');
    const names = this.mySeat === 0 ? [t('you'), peer] : [peer, t('you')];
    this.nameL = ui(txt(this, 448, 34, names[0], { title: true, size: 26, color: TEAM[0].main }).setOrigin(1, 0.5), 2) as Phaser.GameObjects.Text;
    this.nameR = ui(txt(this, 832, 34, names[1], { title: true, size: 26, color: TEAM[1].main }).setOrigin(0, 0.5), 2) as Phaser.GameObjects.Text;
    this.roundText = ui(txt(this, 640, 34, '', { title: true, size: 22, color: '#ffffff' }), 2) as Phaser.GameObjects.Text;
    this.windText = ui(txt(this, 584, 140, '', { title: true, size: 20, color: '#ffffff' }), 2) as Phaser.GameObjects.Text;
    this.aimText = ui(txt(this, 172, 646, '', { title: true, size: 28, color: '#ffffff' }), 2) as Phaser.GameObjects.Text;
    this.fireText = ui(txt(this, FIRE_X, FIRE_Y, t('fire'), { title: true, size: 30, color: '#ffffff' }), 3) as Phaser.GameObjects.Text;
    this.turnText = ui(txt(this, 640, 192, '', { title: true, size: 30, color: '#ffffff' }), 2) as Phaser.GameObjects.Text;
    this.banner = ui(txt(this, 640, 300, '', { title: true, size: 60, color: '#ffd23f', wrap: 1100 }), 40) as Phaser.GameObjects.Text;
    this.hint = ui(txt(this, 640, 256, '', { size: 24, color: '#ffffff', wrap: 900 }), 2) as Phaser.GameObjects.Text;
    this.edgeText = ui(txt(this, 0, 0, '', { title: true, size: 20, color: '#ffffff' }), 3) as Phaser.GameObjects.Text;
  }

  private updateBoard(): void {
    this.roundText.setText(t('round', { n: this.round + 1 }));
    const w = Math.round(Math.abs(this.wind) * 400);
    this.windText.setText(w === 0 ? `${t('wind')} 0` : `${t('wind')} ${w}`);
  }

  private drawUi(): void {
    const g = this.uiG;
    g.clear();
    // scoreboard pill
    g.fillStyle(0x0b1020, 0.62).fillRoundedRect(290, 8, 700, 52, 26);
    for (let i = 0; i < WIN; i++) {
      g.fillStyle(i < this.scores[0] ? TEAM[0].hex : 0xffffff, i < this.scores[0] ? 1 : 0.18).fillCircle(474 + i * 26, 34, 9);
      g.fillStyle(i < this.scores[1] ? TEAM[1].hex : 0xffffff, i < this.scores[1] ? 1 : 0.18).fillCircle(806 - i * 26, 34, 9);
    }
    // wind: an arrow under the minimap, longer for stronger wind
    g.fillStyle(0x0b1020, 0.55).fillRoundedRect(512, 120, 256, 40, 20);
    const wl = Phaser.Math.Clamp(this.wind * 1300, -56, 56);
    if (Math.abs(wl) > 2) {
      const y = 140, x0 = 700 - wl / 2, x1 = 700 + wl / 2, s = Math.sign(wl);
      g.lineStyle(5, 0x9fe3ff, 1).lineBetween(x0, y, x1, y);
      g.fillStyle(0x9fe3ff, 1).fillTriangle(x1 + s * 10, y, x1 - s * 2, y - 8, x1 - s * 2, y + 8);
    }
    // angle and power readout
    const tk = this.tanks[this.turn];
    const shownPower = this.charging ? this.chargePower() : tk.lastPower || 0;
    this.drawMeter(tk);
    g.fillStyle(0x0b1020, 0.6).fillRoundedRect(28, 616, 288, 60, 30);
    const deg = tk.seat === 0 ? tk.deg : 180 - tk.deg;
    this.aimText.setText(`∠ ${Math.round(deg)}°   ⚡ ${shownPower}`);
    // fire button with a power ring and the last shot's power tick
    const localCharge = this.charging && tk.local;
    const live = this.canControl() || localCharge;
    g.fillStyle(0x000000, 0.3).fillCircle(FIRE_X + 3, FIRE_Y + 5, FIRE_R);
    g.fillStyle(live ? 0xec3013 : 0x4a4f63, 1).fillCircle(FIRE_X, FIRE_Y, FIRE_R);
    g.fillStyle(0xffffff, live ? 0.18 : 0.06).fillCircle(FIRE_X - 14, FIRE_Y - 18, FIRE_R * 0.55);
    g.lineStyle(10, 0xffffff, 0.15).strokeCircle(FIRE_X, FIRE_Y, FIRE_R + 12);
    const frac = localCharge ? (this.chargePower() - 10) / 90 : 0;
    if (frac > 0) {
      const col = frac < 0.5 ? 0x5dff7a : frac < 0.85 ? 0xffd23f : 0xff5a5a;
      g.lineStyle(10, col, 1).beginPath().arc(FIRE_X, FIRE_Y, FIRE_R + 12, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).strokePath();
    }
    if (tk.lastPower && tk.local) {
      const a = -Math.PI / 2 + ((tk.lastPower - 10) / 90) * Math.PI * 2;
      g.lineStyle(4, 0xffffff, 0.9).lineBetween(FIRE_X + Math.cos(a) * (FIRE_R + 4), FIRE_Y + Math.sin(a) * (FIRE_R + 4), FIRE_X + Math.cos(a) * (FIRE_R + 20), FIRE_Y + Math.sin(a) * (FIRE_R + 20));
    }
    this.fireText.setAlpha(live ? 1 : 0.45).setScale(localCharge ? 1.08 + Math.sin(this.time.now / 60) * 0.03 : 1);
    // online turn clock
    if (this.online && (this.phase === 'aim' || this.phase === 'wait')) {
      const left = Math.max(0, Math.ceil(this.turnLeft));
      g.fillStyle(left <= 5 ? 0xff5a5a : 0xffffff, 0.9).fillRoundedRect(600, 218, 80 * (this.turnLeft / TURN_TIME), 6, 3);
    }
    this.drawMap();
    this.drawEdge();
  }

  /** The minimap's land, repainted only when the ground changes. */
  private paintMap(): void {
    if (!this.textures.exists('tt-map')) this.textures.createCanvas('tt-map', MAP.w, MAP.h);
    const tex = this.textures.get('tt-map') as Phaser.Textures.CanvasTexture;
    const c = tex.getContext(), sx = MAP.w / WORLD_W, sy = MAP.h / 520;
    c.clearRect(0, 0, MAP.w, MAP.h);
    c.fillStyle = 'rgba(111,191,95,0.95)';
    c.beginPath(); c.moveTo(0, MAP.h);
    for (let x = 0; x <= WORLD_W; x += 10) c.lineTo(x * sx, Math.max(0, (this.heights[x] - 200) * sy));
    c.lineTo(MAP.w, MAP.h); c.closePath(); c.fill();
    tex.refresh();
  }

  private drawMap(): void {
    const g = this.mapG, m = MAP;
    g.clear();
    const sx = m.w / WORLD_W, sy = m.h / 520;
    for (const tk of this.tanks) {
      g.fillStyle(tk.alive ? TEAM[tk.seat].hex : 0x444444, 1).fillCircle(m.x + tk.x * sx, m.y + Math.max(0, (tk.y - 212) * sy), 5);
    }
    if (this.phase === 'flight' && this.shot) {
      const i = Math.floor(this.flightIdx);
      const x = this.shot.path[i * 2], y = this.shot.path[i * 2 + 1];
      g.fillStyle(0xffffff, 1).fillCircle(m.x + Phaser.Math.Clamp(x, 0, WORLD_W) * sx, m.y + Phaser.Math.Clamp((y - 200) * sy, -4, m.h), 3);
    }
    const v = this.cameras.main.worldView;
    g.lineStyle(2, 0xffffff, 0.7).strokeRect(m.x + v.x * sx, m.y - 2, v.width * sx, m.h + 4);
  }

  /** An arrow at the screen edge pointing at the other tank when it is out of view, with its distance. */
  private drawEdge(): void {
    const cam = this.cameras.main;
    const me = this.tanks[this.mySeat], other = this.tanks[1 - this.mySeat];
    const sx = (other.x - cam.worldView.x) * cam.zoom;
    if (sx > 20 && sx < W - 20 || this.phase === 'flight' || this.phase === 'intro') { this.edgeText.setText(''); return; }
    const left = sx <= 20;
    const y = Phaser.Math.Clamp((other.y - 40 - cam.worldView.y) * cam.zoom, 240, 560);
    const x = left ? 34 : W - 34;
    const g = this.uiG;
    g.fillStyle(TEAM[other.seat].hex, 0.95).fillTriangle(left ? x - 18 : x + 18, y, left ? x + 6 : x - 6, y - 16, left ? x + 6 : x - 6, y + 16);
    this.edgeText.setText(`${Math.round(Math.abs(other.x - me.x))}m`).setPosition(left ? 72 : W - 72, y);
  }

  /** A power bar over the tank that is charging (yours or the computer's). */
  private drawMeter(tk: Tank): void {
    const g = this.meterG;
    g.clear();
    if (!this.charging) return;
    const f = (this.chargePower() - 10) / 90;
    const x = tk.x - 40, y = tk.y - 112;
    g.fillStyle(0x0b1020, 0.7).fillRoundedRect(x - 3, y - 3, 86, 16, 8);
    g.fillStyle(f < 0.5 ? 0x5dff7a : f < 0.85 ? 0xffd23f : 0xff5a5a, 1).fillRoundedRect(x, y, Math.max(8, 80 * f), 10, 5);
    if (tk.lastPower) { const lx = x + ((tk.lastPower - 10) / 90) * 80; g.lineStyle(3, 0xffffff, 0.9).lineBetween(lx, y - 4, lx, y + 14); }
  }

  private drawGuide(): void {
    const g = this.guide;
    g.clear();
    if (!this.canControl()) return;
    const tk = this.tanks[this.turn];
    // a short dotted guide from the muzzle along the aim, without wind or gravity's full fall
    const a = (tk.deg * Math.PI) / 180;
    const px = tk.x + 38 * Math.sin(tk.rot), py = tk.y - 38 * Math.cos(tk.rot);
    for (let i = 1; i <= this.tune.guide; i++) {
      const d = 46 + i * 16;
      g.fillStyle(0xffffff, Math.max(0.1, 0.55 - i * 0.06)).fillCircle(px + Math.cos(a) * d, py - Math.sin(a) * d, 3.2);
    }
    // where your last shot went, to adjust from
    const lp = tk.lastPath;
    if (lp) {
      const n = lp.length / 2;
      for (let i = 0; i < n; i += 8) g.fillStyle(TEAM[tk.seat].hex, 0.35).fillCircle(lp[i * 2], lp[i * 2 + 1], 2.4);
      g.lineStyle(3, TEAM[tk.seat].hex, 0.6).strokeCircle(lp[(n - 1) * 2], lp[(n - 1) * 2 + 1], 10);
    }
  }

  // ------------------------------------------------------------------ loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    if (this.canControl()) {
      const tk = this.tanks[this.turn];
      const ay = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
      if (ay) {
        // up raises the barrel towards vertical whichever way the tank faces
        const raise = tk.deg <= 90 ? 1 : -1;
        this.setDeg(tk, tk.deg + ay * raise * AIM_RATE * dt);
      }
      const ax = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      if (ax) this.driveTo(tk, tk.x + ax * DRIVE * dt * 2);
      else if (this.drag !== 'move') this.stopEngine();
    }
    if (this.charging) {
      this.chargeT += delta;
      const p = this.chargePower();
      if (p % 10 === 0 && p !== this.lastTickP) { this.lastTickP = p; this.sfx('tick', { volume: 0.2, rate: 0.7 + p / 120 }); }
    }
    // online: the turn clock and the aim the other side sees
    if (this.online) {
      if (this.phase === 'aim' || this.phase === 'wait') this.turnLeft -= dt;
      if (this.phase === 'aim' && this.turnLeft <= 0) {
        const tk = this.tanks[this.turn];
        const power = this.charging ? this.chargePower() : tk.lastPower || 55;
        this.charging = false; this.firePointer = -1;
        this.fire(tk, power);
      }
      if (this.phase === 'aim' && this.aimDirty && this.time.now - this.lastAimSent > 90) {
        const tk = this.tanks[this.turn];
        net.send('aim', { d: Math.round(tk.deg * 10) / 10, x: Math.round(tk.x * 10) / 10 });
        this.aimDirty = false; this.lastAimSent = this.time.now;
      }
    }
    // barrels turn smoothly towards their aim; tanks follow the ground as they drive
    for (const tk of this.tanks) {
      if (!tk.alive) continue;
      tk.shownDeg += (tk.deg - tk.shownDeg) * Math.min(1, dt * 18);
      const p = tankPose(this.heights, tk.x);
      if (!this.tweens.isTweening(tk.c)) { tk.y = p.y; tk.rot = p.rot; tk.c.setPosition(tk.x, tk.y).setRotation(tk.rot); }
      tk.barrel.setRotation(-(tk.shownDeg * Math.PI) / 180 - tk.c.rotation);
      // idle engine rumble
      tk.body.setY(Math.sin(this.time.now / 70 + tk.seat) * 0.6);
    }
    for (const c of this.clouds) {
      c.x += (this.wind * 2600 + 6) * dt;
      if (c.x > WORLD_W + 300) c.x = -300;
      if (c.x < -300) c.x = WORLD_W + 300;
    }
    if (this.phase === 'flight' && this.shot) this.updateFlight(dt);
    this.turnText.setAlpha(this.phase === 'flight' || this.phase === 'boom' ? 0.35 : 1);
    this.updateCamera(dt);
    this.drawGuide();
    this.drawUi();
  }

  private lastTickP = 0;
  private lastDust = 0;

  // ------------------------------------------------------------------ online
  create(): void {
    super.create();
    if (!net.active) return;
    net.onScene(this, 'aim', (d: { d: number; x: number }) => {
      if (this.phase !== 'wait') return;
      const tk = this.tanks[this.turn];
      if (tk.local) return;
      tk.deg = Phaser.Math.Clamp(Number(d.d) || tk.deg, 5, 175);
      tk.x = Phaser.Math.Clamp(Number(d.x) || tk.x, tk.x0 - PAD, tk.x0 + PAD);
    });
    net.onScene(this, 'fire', (m: FireMsg) => {
      if (this.isOver) return;
      if (this.phase === 'wait' && m.n === this.shotNo && !this.tanks[this.turn].local) this.applyRemoteFire(m);
      else if (m.n >= this.shotNo) this.pendingFire = m;     // we are still showing the last shot
    });
  }
}
