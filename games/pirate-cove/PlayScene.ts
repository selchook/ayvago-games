import Phaser from 'phaser';
import {
  ArcadeScene, CarSteering, t, txt, shake, flash, popup, playMusic, touchScreen,
  hudChip, HudChip, HUD_MARGIN, HUD_GAP, HUD_ROW2_Y, HUD_CHIP_H, hudRightEdge,
} from '@core';
import { World3D, THREE, model } from '@core/three';
import { Sea, Clouds, Gulls, Rain, PALETTES, mixPalette, freeOwnGeometry, type Palette } from './sea';
import { Fx } from './fx3d';
import { Ship, fwd, starboard } from './ship';
import { Archipelago, MAP_R, BERTH, type Fort, type Island } from './islands';
import { Ambience } from './sounds';
import { WAVES, FOES, tuning, waveBonus, TUNING, type FoeKind, type FoeStats, type WaveDef } from './waves';

// ---------------------------------------------------------------- constants

/** Speed for sail levels 1 (reefed), 2 (half) and 3 (full). */
const SAIL_SPEED = [0, 4.5, 8.5, 13];
const SAIL_FURL = [0, 0.35, 0.68, 1];
/** Turn rate at full rudder, radians per second. */
const TURN = 0.95;
const G = 30;
const PLAYER_VH = 26;
const FOE_VH = 14;
/** How quickly the ship gathers way and slows down (per second). */
const ACCEL = 1.2;
const DECEL = 1.6;
const MAX_RANGE = 34;
const DEFAULT_RANGE = 16;
const PLAYER_GUNS = 3;
const COMBO_TIME = 5;
const BALL_SCALE = 1.5;
const ESCORT_HP = { normal: 10, easy: 14 };

type Phase = 'card' | 'play' | 'clear' | 'over';
type LootKind = 'chest' | 'barrel' | 'bottle';

interface Ball {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  T: number;
  t: number;
  vy: number;
  mine: boolean;
  from: Ship | null;
  x: number; y: number; z: number;
}

interface Foe {
  ship: Ship;
  kind: FoeKind;
  stats: FoeStats;
  reload: [number, number];
  think: number;
  /** Which side of its target it tries to lie on. */
  side: number;
  hunt: 'player' | 'ally';
  speedK: number;
  reloadK: number;
  enraged: boolean;
  summoned: boolean;
  smokeT: number;
  /** Seconds spent far from the fight (a stranded ship is brought back). */
  farT: number;
}

interface Loot {
  kind: LootKind;
  obj: THREE.Object3D;
  x: number;
  z: number;
  age: number;
  life: number;
  mission: boolean;
}

interface Pending { kind: FoeKind; at: number }

/** Hints already shown this visit (a restart does not repeat them). */
const seenHints = new Set<string>();

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private sea!: Sea;
  private clouds!: Clouds;
  private gulls!: Gulls;
  private rain!: Rain;
  private fx!: Fx;
  private map!: Archipelago;
  private steering!: CarSteering;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hemi!: THREE.HemisphereLight;
  private berthRing!: THREE.Mesh;
  private ballMesh!: THREE.InstancedMesh;
  private lootModels: Record<LootKind, THREE.Object3D> = {} as Record<LootKind, THREE.Object3D>;
  private seaSound: Ambience | null = null;
  private windSound: Ambience | null = null;

  // the player
  private player!: Ship;
  private hull = 5;
  private sail = 2;
  private reloadL = 0;
  private reloadR = 0;
  private rapidT = 0;
  private invuln = 0;
  private gold = 0;
  private shownGold = 0;
  private combo = 0;
  private comboT = 0;
  private repairT = 0;
  private bumpT = 0;
  private edgeT = 0;
  private dead = false;

  // the world
  private foes: Foe[] = [];
  private balls: Ball[] = [];
  private loot: Loot[] = [];
  /** Things that happen a moment later, on the game clock (loot surfacing after a sinking). */
  private timers: { at: number; fn: () => void }[] = [];
  private ally: Ship | null = null;
  private allyHp = 0;
  private allyMax = 0;
  private boss: Foe | null = null;

  // waves
  private wave = 0;
  private def!: WaveDef;
  private phase: Phase = 'card';
  private phaseT = 0;
  private waveT = 0;
  private pending: Pending[] = [];
  private sunk = 0;
  private sinkGoal = 0;
  private chestsGot = 0;
  private chestGoal = 0;
  private stormT = 0;
  private stormTotal = 0;
  private stormK = 0;
  private fortsDown = 0;
  private fortGoal = 0;
  private failed = false;
  private escortDone = false;
  private lightTarget: Palette = PALETTES.day;
  private light: Palette = PALETTES.day;
  private lightningT = 0;

  // camera
  private camYaw = 0;
  private camZoom = 1;
  private camShake = 0;
  private camPos = new THREE.Vector3();

  // UI
  private goldChip!: HudChip;
  private goalChip!: HudChip;
  private gunChip!: HudChip;
  private comboChip!: HudChip;
  private gaugeL!: Phaser.GameObjects.Graphics;
  private gaugeR!: Phaser.GameObjects.Graphics;
  private sailBars!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private rings!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private hintQueue: string[] = [];
  private hintT = 0;
  private card: Phaser.GameObjects.Container | null = null;
  private padIcons: Phaser.GameObjects.Graphics | null = null;
  private goalKey = '';

  // tests
  private auto = false;
  /** Exposed for tests: the active Normal/Easy tuning. */
  tune = TUNING.normal;
  /** Rendered draw calls of the last frame (tests read it). */
  drawCalls = 0;
  /** Counters for balance tests: enemy volleys fired at the player, hits taken, player volleys and hits. */
  stats = { foeVolleys: 0, hitsTaken: 0, volleys: 0, hits: 0, stormHits: 0, repairs: 0 };

  // ---------------------------------------------------------------- setup

  createGame(): void {
    this.tune = tuning();
    this.foes = [];
    this.balls = [];
    this.loot = [];
    this.timers = [];
    this.stats = { foeVolleys: 0, hitsTaken: 0, volleys: 0, hits: 0, stormHits: 0, repairs: 0 };
    this.ally = null;
    this.boss = null;
    this.hull = this.tune.hull;
    this.sail = 2;
    this.reloadL = this.reloadR = 0;
    this.rapidT = this.invuln = 0;
    this.gold = this.shownGold = 0;
    this.combo = this.comboT = 0;
    this.repairT = this.bumpT = this.edgeT = 0;
    this.dead = false;
    this.wave = 0;
    this.phase = 'card';
    this.phaseT = this.waveT = 0;
    this.pending = [];
    this.hintQueue = [];
    this.hintT = 0;
    this.card = null;
    this.auto = false;
    this.stormK = 0;
    this.lightningT = 0;
    this.camShake = 0;
    this.goalKey = '';

    // the world (its own geometries are freed when the scene shuts down)
    freeOwnGeometry(this, () => this.world?.scene);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.fx?.dispose());
    this.world = new World3D(this, { fov: 54, near: 1, far: 320, background: PALETTES.day.sky, fog: { color: PALETTES.day.fog, near: 95, far: 230 } });
    this.world.addLights({ ambient: 1.55, intensity: 2.3, extent: 36, dir: [-0.45, 1, -0.35] });
    const sun = this.world.sun!;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { far: 160 });
    sun.shadow.camera.updateProjectionMatrix();
    this.hemi = this.world.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    this.sea = new Sea(this.world.scene);
    this.fx = new Fx(this.world.scene, (x, z) => this.sea.height(x, z));
    this.map = new Archipelago(this.world.scene, (Math.random() * 1e9) | 0);
    this.sea.shoals = this.map.shoals();
    this.clouds = new Clouds(this.world.scene);
    this.gulls = new Gulls(this.world.scene);
    this.rain = new Rain(this.world.scene);
    this.berthRing = new THREE.Mesh(new THREE.RingGeometry(BERTH.r - 0.8, BERTH.r, 40), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.6, depthWrite: false }));
    this.berthRing.rotation.x = -Math.PI / 2;
    this.berthRing.userData.ownMaterial = true;
    this.berthRing.userData.ownGeometry = true;
    this.world.scene.add(this.berthRing);

    // cannonballs: one instanced mesh from the kit's ball
    const ball = model('pk:cannon-ball');
    let bm: THREE.Mesh | null = null;
    ball.traverse((o) => { if (!bm && (o as THREE.Mesh).isMesh) bm = o as THREE.Mesh; });
    const src = bm as unknown as THREE.Mesh;
    this.ballMesh = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, 80);
    this.ballMesh.count = 0;
    this.ballMesh.castShadow = true;
    this.ballMesh.frustumCulled = false;
    this.world.scene.add(this.ballMesh);
    this.lootModels = { chest: model('pk:chest'), barrel: model('pk:barrel'), bottle: model('pk:bottle-large') };

    // the player's ship, at the berth facing open sea
    this.player = new Ship(this.world.scene, 'pk:ship-pirate-medium', 1);
    this.player.x = BERTH.x;
    this.player.z = BERTH.z + 6;
    this.player.heading = 0;
    this.player.hp = this.hull;
    this.camYaw = 0;
    this.placeCamera(1, true);

    // input: arrows steer and set the sails, A/Z fire port, D/X fire starboard, Space either side
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,A,Z,D,X,SPACE,ENTER,W,S') as Record<string, Phaser.Input.Keyboard.Key>;
    const { width, height } = this.scale;
    this.steering = new CarSteering(this, {
      touch: touchScreen(this),
      buttons: [
        { id: 'port', shape: 'round', x: 482, y: height - 136, r: 62, color: 0xd9452b, label: t('port'), labelY: 0, labelSize: 21, hit: 14 },
        { id: 'star', shape: 'round', x: width - 80, y: height - 136, r: 62, color: 0xd9452b, label: t('starboard'), labelY: 0, labelSize: 17, hit: 14 },
        { id: 'sailDown', shape: 'round', x: 482, y: height - 300, r: 44, color: 0x2a6f9e, hit: 16 },
        { id: 'sailUp', shape: 'round', x: width - 80, y: height - 300, r: 44, color: 0x2a6f9e, hit: 16 },
      ],
      ramp: 0.25,
      keyRamp: 0.2,
      tiltLock: 30,
    });
    this.steering.begin();
    this.steering.centre();
    this.padIcons = null;
    if (this.steering.pad) this.drawPadIcons();

    // HUD
    this.hud.setLives(this.hull, this.tune.hull);
    this.hud.setLevel(1);
    this.makeHud();
    this.marks = this.add.graphics().setDepth(8500).setScrollFactor(0);
    this.rings = this.add.graphics().setDepth(9450).setScrollFactor(0);
    this.hint = txt(this, width / 2, 238, '', { size: 25, color: '#ffffff', strokeThickness: 6, wrap: 620 }).setDepth(9000).setScrollFactor(0).setAlpha(0);

    // sound
    this.seaSound = new Ambience(this, 'sea');
    this.windSound = new Ambience(this, 'wind');

    this.startWave(0);
  }

  private makeHud(): void {
    const { width } = this.scale;
    const row = HUD_ROW2_Y;
    this.goldChip = hudChip(this, HUD_MARGIN, row, { icon: 'pc-coin', iconSize: 28, text: '0', color: '#ffd23f', minWidth: 96 });
    this.gaugeL = this.add.graphics().setData('chipWidth', 30);
    this.gaugeR = this.add.graphics().setData('chipWidth', 30);
    this.sailBars = this.add.graphics().setData('chipWidth', 34);
    this.gunChip = hudChip(this, hudRightEdge(this), row, { align: 'right', items: [this.gaugeL, this.gaugeR, this.sailBars] });
    this.bossBar = this.add.graphics().setData('chipWidth', 150).setVisible(false);
    this.goalChip = hudChip(this, (this.goldChip.right + this.gunChip.left) / 2, row, { align: 'center', size: 22, items: [this.bossBar] });
    this.comboChip = hudChip(this, HUD_MARGIN, row + HUD_CHIP_H + HUD_GAP, { text: '', color: '#ff9a3c', size: 22 }).setVisible(false);
    void width;
  }

  /** Sail icons on the touch sail buttons (a sail with an arrow), drawn over the pad. */
  private drawPadIcons(): void {
    const { width, height } = this.scale;
    const g = this.add.graphics().setDepth(9401).setScrollFactor(0);
    const sail = (x: number, y: number, up: boolean) => {
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(x - 2, y - 24, 4, 44);
      g.fillTriangle(x + 4, y - 20, x + 4, y + 10, x + 22, y + 10);
      g.fillTriangle(x - 4, y - 16, x - 4, y + 10, x - 20, y + 10);
      const ay = up ? y - 30 : y + 30;
      g.fillStyle(0xffd23f, 1);
      if (up) g.fillTriangle(x - 12, ay + 6, x + 12, ay + 6, x, ay - 8);
      else g.fillTriangle(x - 12, ay - 6, x + 12, ay - 6, x, ay + 8);
    };
    sail(482, height - 300 + 2, false);
    sail(width - 80, height - 300 + 2, true);
    this.padIcons = g;
  }

  // ---------------------------------------------------------------- waves

  private startWave(i: number): void {
    this.wave = i;
    this.def = WAVES[i];
    this.phase = 'card';
    this.phaseT = 0;
    this.waveT = 0;
    this.failed = false;
    this.escortDone = false;
    this.sunk = 0;
    this.chestsGot = 0;
    this.fortsDown = 0;
    this.stormK = 0;
    this.pending = this.def.foes.map((f) => ({ ...f }));
    this.sinkGoal = this.def.mission === 'sink' ? this.def.foes.length : 0;
    this.chestGoal = this.def.chests ?? 0;
    this.fortGoal = this.def.forts ?? 0;
    this.stormTotal = (this.def.time ?? 0) + this.tune.stormExtra;
    this.stormT = this.stormTotal;
    this.hud.setLevel(i + 1);
    // the light of the wave
    const l = this.def.light;
    this.lightTarget = l === 'dusk' ? PALETTES.dusk : mixPalette(PALETTES.day, PALETTES.sunset, l);
    playMusic(this, this.def.mission === 'boss' ? 'boss' : 'stage2');
    this.bossBar.setVisible(false);
    this.boss = null;
    if (this.def.mission === 'fort') {
      for (let k = 0; k < this.fortGoal; k++) this.map.addFort(this.player.x, this.player.z, Math.round(8 * this.tune.foeHp * this.rampK()));
    }
    if (this.def.mission === 'treasure') this.scatterChests(this.chestGoal);
    if (this.def.mission === 'escort') this.launchAlly();
    this.showCard();
    this.sfx('bell', { volume: 0.7, exact: true });
    this.updateGoal();
  }

  private rampK(): number {
    return 1 + this.wave * this.tune.ramp;
  }

  private showCard(): void {
    this.card?.destroy();
    const { width } = this.scale;
    const goal = t(this.def.goal, { n: this.def.mission === 'sink' ? this.sinkGoal : this.chestGoal });
    const g = this.add.graphics();
    g.fillStyle(0x0b1430, 0.62).fillRoundedRect(-300, -96, 600, 192, 28);
    g.lineStyle(2, 0xffffff, 0.35).strokeRoundedRect(-300, -96, 600, 192, 28);
    const n = txt(this, 0, -58, t('waveN', { n: this.wave + 1 }), { size: 24, color: '#ffd23f' });
    const title = txt(this, 0, -10, t(this.def.title), { title: true, size: 44, color: '#ffffff' });
    const sub = txt(this, 0, 50, goal, { size: 24, color: '#d7f3ff', wrap: 560 });
    this.card = this.add.container(width / 2, 430, [g, n, title, sub]).setDepth(9100).setScrollFactor(0).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.card, scale: 1, alpha: 1, duration: 360, ease: 'Back.easeOut' });
  }

  private hideCard(): void {
    const c = this.card;
    if (!c) return;
    this.card = null;
    this.tweens.add({ targets: c, alpha: 0, y: c.y - 60, duration: 300, onComplete: () => c.destroy() });
  }

  private beginPlay(): void {
    this.phase = 'play';
    this.phaseT = 0;
    this.hideCard();
    if (this.wave === 0) this.showHint(this.steering.pad ? 'h_steer_touch' : 'h_steer_keys');
    if (this.def.hint) this.showHint(this.def.hint);
  }

  private waveComplete(): void {
    if (this.phase !== 'play') return;
    this.phase = 'clear';
    this.phaseT = 0;
    const { width } = this.scale;
    const bonus = this.failed ? 0 : waveBonus(this.wave + 1);
    if (bonus) this.addScore(bonus);
    // a little repair between waves
    const before = this.hull;
    this.hull = Math.min(this.tune.hull, this.hull + this.tune.waveRepair);
    if (this.hull > before) this.hud.setLives(this.hull, this.tune.hull);
    const title = this.failed ? '' : t('waveClear');
    if (title) {
      const big = txt(this, width / 2, 420, title, { title: true, size: 56, color: '#ffd23f' }).setDepth(9100).setScrollFactor(0).setScale(0.4);
      this.tweens.add({ targets: big, scale: 1, duration: 420, ease: 'Back.easeOut' });
      this.tweens.add({ targets: big, alpha: 0, delay: 1900, duration: 400, onComplete: () => big.destroy() });
      popup(this, width / 2, 500, t('bonus', { n: bonus }), '#9fe7b8', 30);
      this.sfx('fanfare', { exact: true, volume: 0.75 });
      this.fx.sparkle(this.player.point(0, 0, 6), 0xffd23f, 30);
    }
    // the storm, convoy and fort leftovers go
    for (const l of this.loot.filter((o) => o.mission)) this.removeLoot(l);
    for (const f of [...this.map.forts]) this.map.removeFort(f);
    if (this.ally && this.allyHp > 0 && !this.escortDone) this.ally.startSinking();
    this.updateGoal();
  }

  private nextWave(): void {
    if (this.wave + 1 >= WAVES.length) {
      // the voyage is won: the hull left is worth gold
      this.addScore(this.hull * 250);
      this.phase = 'over';
      this.steering.end();
      this.sfx('fanfare', { exact: true });
      this.endGame({ win: true, title: t('victory'), delay: 1200 });
      return;
    }
    // remaining foes sail off (sink quietly far away)
    for (const f of this.foes) f.ship.dispose(this.world.scene);
    this.foes = [];
    if (this.ally) { this.ally.dispose(this.world.scene); this.ally = null; }
    this.startWave(this.wave + 1);
  }

  private updateGoal(): void {
    const d = this.def;
    let s = '';
    if (this.phase === 'clear') s = this.failed ? '—' : '✓';
    else if (d.mission === 'sink') s = t('sinkN', { n: this.sunk, m: this.sinkGoal });
    else if (d.mission === 'treasure') s = `${t('chestN', { n: this.chestsGot, m: this.chestGoal })} · ${clock(this.stormT)}`;
    else if (d.mission === 'fort') s = t('fortN', { n: this.fortsDown, m: this.fortGoal });
    else if (d.mission === 'escort') s = t('escortHp', { n: Math.max(0, this.allyHp), m: this.allyMax });
    else if (d.mission === 'boss') s = t('boss');
    if (s !== this.goalKey) {
      this.goalKey = s;
      this.goalChip.setText(s);
      const late = d.mission === 'treasure' && this.stormT < 15 && this.phase === 'play';
      this.goalChip.setTextColor(late ? '#ff8a6a' : '#ffffff');
    }
    if (this.boss) {
      const g = this.bossBar;
      const k = Math.max(0, this.boss.ship.hp / this.boss.ship.maxHp);
      g.clear();
      g.fillStyle(0x000000, 0.45).fillRoundedRect(-75, -8, 150, 16, 8);
      g.fillStyle(this.boss.enraged ? 0xff5a3c : 0x3dffb0, 1).fillRoundedRect(-73, -6, Math.max(8, 146 * k), 12, 6);
    }
  }

  // ---------------------------------------------------------------- spawning

  /** A spot on open water roughly `d` away from (x, z), ahead of the heading where possible. */
  private seaSpot(x: number, z: number, d: number, h: number, spread = 1.3): { x: number; z: number } {
    for (let i = 0; i < 40; i++) {
      const a = h + (Math.random() - 0.5) * 2 * spread * (1 + i / 20);
      const r = d * (0.85 + Math.random() * 0.3);
      const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      if (Math.hypot(px, pz) > MAP_R - 12) continue;
      if (this.map.hitIsland(px, pz, 9)) continue;
      return { x: px, z: pz };
    }
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * 60, z: Math.sin(a) * 60 + 40 };
  }

  private spawnFoe(kind: FoeKind): Foe {
    const stats = FOES[kind];
    const ship = new Ship(this.world.scene, 'pk:' + stats.model, stats.scale, { glow: kind === 'ghost' ? 0.35 : 0 });
    const near = this.def.mission === 'escort' && this.ally ? this.ally : this.player;
    const spot = this.seaSpot(near.x, near.z, kind === 'ghost' ? 60 : 64, near.heading);
    ship.x = spot.x;
    ship.z = spot.z;
    ship.heading = Math.atan2(near.x - ship.x, near.z - ship.z);
    const hp = kind === 'ghost' ? Math.round(this.tune.bossHp * (this.wave >= 9 ? 1.35 : 0.85)) : Math.max(2, Math.round(stats.hp * this.tune.foeHp));
    ship.hp = ship.maxHp = hp;
    ship.speed = stats.speed * 0.6;
    const k = this.rampK();
    const foe: Foe = {
      ship, kind, stats, reload: [2 + Math.random() * 2, 2.5 + Math.random() * 2], think: 0, side: Math.random() < 0.5 ? 1 : -1,
      hunt: this.ally && Math.random() < 0.65 ? 'ally' : 'player',
      speedK: this.tune.foeSpeed * (1 + (k - 1) * 0.5), reloadK: this.tune.foeReload / (1 + (k - 1) * 0.5), enraged: false, summoned: false, smokeT: 0, farT: 0,
    };
    this.foes.push(foe);
    if (kind === 'ghost') {
      this.boss = foe;
      this.bossBar.setVisible(true);
      this.goalChip.layout();
      this.sfx('bossHorn', { exact: true, volume: 0.8 });
      shake(this, 0.006, 500);
    }
    return foe;
  }

  private scatterChests(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      for (let k = 0; k < 30; k++) {
        const d = 35 + Math.random() * 80;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (this.map.hitIsland(x, z, 7) || Math.hypot(x, z) > MAP_R - 15) continue;
        this.dropLoot('chest', x, z, true);
        break;
      }
    }
  }

  private launchAlly(): void {
    const spot = this.seaSpot(0, 0, 105, Math.random() * Math.PI * 2, 3);
    const ally = new Ship(this.world.scene, 'pk:ship-pirate-small', 0.95);
    ally.x = spot.x;
    ally.z = spot.z;
    ally.heading = Math.atan2(BERTH.x - ally.x, BERTH.z - ally.z);
    this.ally = ally;
    this.allyMax = this.allyHp = ESCORT_HP[this.tune === TUNING.easy ? 'easy' : 'normal'];
    ally.hp = this.allyHp;
  }

  // ---------------------------------------------------------------- loot

  private dropLoot(kind: LootKind, x: number, z: number, mission = false): void {
    const obj = this.lootModels[kind].clone();
    const wrap = new THREE.Group();
    // the kit's pieces sit on y = 0 at their centre
    obj.position.y = kind === 'chest' ? -0.35 : kind === 'barrel' ? -0.45 : -0.25;
    wrap.add(obj);
    wrap.scale.setScalar(kind === 'bottle' ? 2.6 : 1.9);
    wrap.position.set(x, this.sea.height(x, z), z);
    wrap.rotation.y = Math.random() * 6;
    this.world.scene.add(wrap);
    this.loot.push({ kind, obj: wrap, x, z, age: 0, life: mission ? Infinity : 35, mission });
  }

  private removeLoot(l: Loot): void {
    this.world.scene.remove(l.obj);
    this.loot = this.loot.filter((o) => o !== l);
  }

  private collect(l: Loot): void {
    const at = new THREE.Vector3(l.x, this.sea.height(l.x, l.z) + 1, l.z);
    const p = this.world.toScreen(at);
    this.removeLoot(l);
    this.fx.sparkle(at, l.kind === 'barrel' ? 0x7dff9a : l.kind === 'bottle' ? 0x7fd8ff : 0xffd23f, 18);
    this.fx.splash(l.x, l.z, 0.5);
    if (l.kind === 'chest') {
      const value = l.mission ? 40 : 30;
      this.giveGold(value, p.x, p.y);
      this.sfx('chest', { volume: 0.8 });
      if (l.mission) {
        this.chestsGot++;
        popup(this, p.x, p.y - 30, `${this.chestsGot}/${this.chestGoal}`, '#ffd23f', 30);
        if (this.chestsGot >= this.chestGoal) this.waveComplete();
      }
    } else if (l.kind === 'barrel') {
      if (this.hull < this.tune.hull) {
        this.hull++;
        this.hud.setLives(this.hull, this.tune.hull);
        popup(this, p.x, p.y - 20, t('repaired'), '#7dff9a', 28);
      } else this.giveGold(10, p.x, p.y);
      this.sfx('repair', { volume: 0.7 });
    } else {
      this.rapidT = 10;
      this.reloadL = this.reloadR = 0;
      popup(this, p.x, p.y - 20, t('rapid'), '#7fd8ff', 30);
      this.sfx('rapid', { volume: 0.7 });
    }
    this.updateGoal();
  }

  /** Gold: counted at once, shown as coins flying to the gold chip. */
  private giveGold(value: number, sx: number, sy: number): void {
    this.gold += value;
    this.addScore(value);
    const coins = Math.min(8, Math.max(3, Math.round(value / 6)));
    const per = value / coins;
    const tx = this.goldChip.x + 28, ty = this.goldChip.y;
    for (let i = 0; i < coins; i++) {
      const c = this.add.image(sx + (Math.random() - 0.5) * 50, sy + (Math.random() - 0.5) * 30, 'pc-coin').setDepth(9050).setScrollFactor(0).setScale(0.32);
      this.tweens.add({
        targets: c, x: tx, y: ty, scale: 0.22, delay: i * 55, duration: 520 + Math.random() * 120, ease: 'Cubic.easeIn',
        onComplete: () => {
          c.destroy();
          this.shownGold = Math.min(this.gold, this.shownGold + per);
          this.goldChip.setText(Math.round(this.shownGold));
          this.sfx('coin', { volume: 0.35 });
          this.tweens.add({ targets: this.goldChip, scale: { from: 1.12, to: 1 }, duration: 140 });
        },
      });
    }
  }

  // ---------------------------------------------------------------- update

  private later(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.elapsed + seconds, fn });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.steering.update(dt);
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= this.elapsed);
      this.timers = this.timers.filter((x) => x.at > this.elapsed);
      for (const x of due) x.fn();
    }
    this.phaseT += dt;
    this.sea.amp = 1 + this.stormK * 1.6;
    this.updateLight(dt);

    if (this.phase === 'card') {
      if (this.phaseT > 2.6 || Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || this.steering.take('port') || this.steering.take('star')) this.beginPlay();
    } else if (this.phase === 'play') {
      this.waveT += dt;
      this.updateMission(dt);
    } else if (this.phase === 'clear') {
      if (this.phaseT > 2.6) this.nextWave();
    }

    if (!this.dead) this.updatePlayer(dt);
    this.updateFoes(dt);
    this.updateAlly(dt);
    this.updateForts(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    this.collideShips();

    const time = this.sea.time;
    this.player.update(dt, (x, z) => this.sea.height(x, z), time);
    for (const f of this.foes) f.ship.update(dt, (x, z) => this.sea.height(x, z), time);
    this.ally?.update(dt, (x, z) => this.sea.height(x, z), time);
    this.foes = this.foes.filter((f) => {
      if (!f.ship.gone) return true;
      f.ship.dispose(this.world.scene);
      return false;
    });
    if (this.ally?.gone) { this.ally.dispose(this.world.scene); this.ally = null; }

    // the view
    const cf = fwd(this.camYaw);
    const cx = this.player.x + cf.x * 45, cz = this.player.z + cf.z * 45;
    this.sea.update(dt, cx, cz);
    this.clouds.update(dt, cx, cz, 2.2 + this.stormK * 6);
    this.gulls.update(dt, this.player.x, this.player.z, time);
    this.rain.intensity = Math.max(0, this.stormK * 1.4 - 0.25);
    this.rain.update(dt, this.player.x + cf.x * 20, this.player.z + cf.z * 20);
    this.map.update(time);
    this.fx.update(dt);
    const br = this.berthRing;
    br.position.set(BERTH.x, this.sea.height(BERTH.x, BERTH.z) + 0.4, BERTH.z);
    const pulse = 1 + Math.sin(time * 3) * 0.04;
    br.scale.set(pulse, pulse, 1);
    (br.material as THREE.MeshBasicMaterial).opacity = this.hull < this.tune.hull ? 0.55 + Math.sin(time * 4) * 0.25 : 0.25;
    this.placeCamera(dt, false);
    this.world.followSun(new THREE.Vector3(this.player.x + cf.x * 14, 0, this.player.z + cf.z * 14));

    // sound bed
    const v = this.player.speed / SAIL_SPEED[3];
    this.seaSound?.set(0.32 + v * 0.3 + this.stormK * 0.25, 0.85 + v * 0.25);
    this.windSound?.set(this.stormK * 0.55 + (this.def.light === 'dusk' ? 0.12 : 0), 1);

    this.drawUi(dt);
    this.drawCalls = this.world.renderer.info.render.calls;
  }

  private updateLight(dt: number): void {
    let target = this.lightTarget;
    if (this.stormK > 0) target = mixPalette(target, PALETTES.storm, Math.min(1, this.stormK));
    const k = Math.min(1, dt * 1.2);
    this.light = mixPalette(this.light, target, k);
    const p = this.light;
    const scene = this.world.scene;
    (scene.background as THREE.Color).setHex(p.sky);
    (scene.fog as THREE.Fog).color.setHex(p.fog);
    const sun = this.world.sun!;
    sun.color.setHex(p.sun);
    let flashK = 0;
    if (this.lightningT > 0) {
      this.lightningT -= dt;
      flashK = Math.max(0, this.lightningT / 0.25);
    }
    sun.intensity = p.sunI + flashK * 1.6;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.ambient + flashK * 1.2;
    this.sea.setColors(p);
    this.clouds.setTint(this.stormK > 0.3 ? 0x9aa4b0 : this.def?.light === 'dusk' ? 0x9fb6b8 : 0xffffff);
    const fog = scene.fog as THREE.Fog;
    const dusk = this.def?.light === 'dusk';
    // the fog keeps its distance from the camera when it pulls back for a wide fight
    const z = this.camZoom;
    fog.near += ((dusk ? 70 : 95 - this.stormK * 25) * z - fog.near) * k;
    fog.far += ((dusk ? 170 : 230 - this.stormK * 50) * z - fog.far) * k;
  }

  private updateMission(dt: number): void {
    const d = this.def;
    // spawns: the next ship comes on time, or at once when the sea is empty
    const alive = this.foes.filter((f) => f.ship.sinking < 0).length;
    while (this.pending.length && (this.pending[0].at <= this.waveT || (alive === 0 && this.waveT > 3))) {
      if (this.foes.filter((f) => f.ship.sinking < 0).length >= (d.mission === 'boss' ? 4 : 3)) break;
      const p = this.pending.shift()!;
      this.spawnFoe(p.kind);
    }
    if (d.mission === 'treasure') {
      this.stormT -= dt;
      this.stormK = Phaser.Math.Clamp(1 - this.stormT / Math.max(30, this.stormTotal * 0.45), 0, 1) * 0.85;
      if (this.stormT < 20 && this.stormT + dt >= 20) {
        popup(this, this.scale.width / 2, 300, t('stormSoon'), '#ffb36b', 30);
        this.sfx('thunder', { volume: 0.6 });
      }
      if (Math.random() < dt * this.stormK * 0.25) this.lightning(false);
      if (this.stormT <= 0) {
        // the storm breaks: a lightning strike, and the chests are lost
        this.stormT = 0;
        this.failed = true;
        this.stormK = 1;
        this.lightning(true);
        popup(this, this.scale.width / 2, 340, t('stormHit'), '#ff8a6a', 34);
        this.damagePlayer(true);
        this.waveComplete();
      }
      this.updateGoal();
    } else if (this.stormK > 0) this.stormK = Math.max(0, this.stormK - dt * 0.2);
    if (d.mission === 'sink' && this.sunk >= this.sinkGoal) this.waveComplete();
    if (d.mission === 'fort' && this.fortsDown >= this.fortGoal) this.waveComplete();
    if (d.mission === 'boss' && !this.pending.length && this.boss && this.boss.ship.sinking >= 0 && !this.foes.some((f) => f.ship.sinking < 0)) this.waveComplete();
    if (d.mission === 'escort' && (this.escortDone || this.failed)) this.waveComplete();
  }

  private lightning(strike: boolean): void {
    this.lightningT = 0.25;
    flash(this, 0xffffff, 140, strike ? 0.6 : 0.3);
    this.sfx('thunder', { volume: strike ? 0.9 : 0.5 });
    if (strike) shake(this, 0.012, 400);
  }

  // ---------------------------------------------------------------- the player

  private updatePlayer(dt: number): void {
    const p = this.player;
    const k = this.keys;
    let keyAxis = 0;
    if (k.LEFT.isDown) keyAxis -= 1;
    if (k.RIGHT.isDown) keyAxis += 1;
    let steer = this.steering.steer(dt, keyAxis);
    let firePort = Phaser.Input.Keyboard.JustDown(k.A) || Phaser.Input.Keyboard.JustDown(k.Z) || this.steering.take('port');
    let fireStar = Phaser.Input.Keyboard.JustDown(k.D) || Phaser.Input.Keyboard.JustDown(k.X) || this.steering.take('star');
    if (Phaser.Input.Keyboard.JustDown(k.SPACE)) {
      // Space fires whichever side has something to shoot at (else both)
      const l = this.aimFor(-1), r = this.aimFor(1);
      if (l.target && (!r.target || l.score < r.score)) firePort = true;
      else if (r.target) fireStar = true;
      else firePort = fireStar = true;
    }
    let sailDelta = 0;
    if (Phaser.Input.Keyboard.JustDown(k.UP) || Phaser.Input.Keyboard.JustDown(k.W) || this.steering.take('sailUp')) sailDelta++;
    if (Phaser.Input.Keyboard.JustDown(k.DOWN) || Phaser.Input.Keyboard.JustDown(k.S) || this.steering.take('sailDown')) sailDelta--;
    if (this.auto) {
      const b = this.botInput();
      steer = b.steer;
      firePort = b.port;
      fireStar = b.star;
      sailDelta = Math.sign(b.sail - this.sail);
    }
    if (this.phase === 'card' || this.phase === 'over') firePort = fireStar = false;
    if (sailDelta) {
      const s = Phaser.Math.Clamp(this.sail + sailDelta, 1, 3);
      if (s !== this.sail) {
        this.sail = s;
        this.sfx('sail', { volume: 0.5 });
      }
    }
    // sailing: the speed eases to the sail's, the rudder turns harder with way on
    const want = SAIL_SPEED[this.sail];
    p.speed += (want - p.speed) * Math.min(1, dt * (want > p.speed ? ACCEL : DECEL));
    p.rudder += (steer - p.rudder) * Math.min(1, dt * 5);
    const turn = TURN * (0.55 + 0.45 * Math.min(1, p.speed / 9));
    p.heading -= p.rudder * turn * dt;
    // the edge of the map: the sea turns the ship back
    const d0 = Math.hypot(p.x, p.z);
    if (d0 > MAP_R) {
      const home = Math.atan2(-p.x, -p.z);
      p.heading += angleDiff(home, p.heading) * Math.min(1, dt * 1.2 * (d0 - MAP_R) / 10);
      this.edgeT -= dt;
      if (this.edgeT <= 0) {
        this.edgeT = 4;
        popup(this, this.scale.width / 2, 300, t('turnBack'), '#ffb36b', 26);
      }
    }
    const f = fwd(p.heading);
    p.x += f.x * p.speed * dt;
    p.z += f.z * p.speed * dt;
    p.setFurl(SAIL_FURL[this.sail]);
    this.collideIslands(p, true);

    // guns
    const rate = this.rapidT > 0 ? 0.45 : 1;
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.reloadL = Math.max(0, this.reloadL - dt / rate);
    this.reloadR = Math.max(0, this.reloadR - dt / rate);
    if (firePort) this.playerFire(-1);
    if (fireStar) this.playerFire(1);

    // bow spray at speed
    if (p.speed > 6 && Math.random() < dt * p.speed * 1.4) this.fx.spray(p.point(p.halfL * 0.9, 0, 0.6), starboard(p.heading), p.speed / 13);
    // damage smoke
    if (this.hull <= 2 && Math.random() < dt * (this.hull === 1 ? 8 : 4)) this.fx.burn(p.point((Math.random() - 0.5) * p.halfL, (Math.random() - 0.5) * 2, 2.6), this.hull === 1);

    this.invuln = Math.max(0, this.invuln - dt);
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo) {
      this.combo = 0;
      this.updateCombo();
    }

    // the berth repairs
    if (Math.hypot(p.x - BERTH.x, p.z - BERTH.z) < BERTH.r + 2 && this.hull < this.tune.hull) {
      this.repairT += dt;
      if (Math.random() < dt * 6) this.fx.heal(p.point(0, 0, 1));
      if (Math.random() < dt * 3) this.sfx('hammer', { volume: 0.4 });
      if (this.repairT >= this.tune.repairEvery) {
        this.repairT = 0;
        this.hull++;
        this.stats.repairs++;
        this.hud.setLives(this.hull, this.tune.hull);
        const s = this.world.toScreen(p.point(0, 0, 6));
        popup(this, s.x, s.y, this.hull >= this.tune.hull ? t('repairFull') : t('repaired'), '#7dff9a', 28);
        this.sfx('repair', { volume: 0.6 });
      }
    } else this.repairT = 0;
    if (this.hull <= 2 && this.phase === 'play') this.showHint('h_repair');
  }

  private collideIslands(s: Ship, isPlayer: boolean): void {
    // bow, middle and stern each keep clear of the shore
    for (const i of this.map.islands) {
      if (Math.hypot(s.x - i.x, s.z - i.z) > i.r + s.halfL + s.halfW + 2) continue;
      for (const a of [0.85, 0, -0.85]) {
        const px = s.x + Math.sin(s.heading) * s.halfL * a, pz = s.z + Math.cos(s.heading) * s.halfL * a;
        const dx = px - i.x, dz = pz - i.z, d = Math.hypot(dx, dz);
        const min = i.r + s.halfW * 0.9;
        if (d >= min || d < 0.01) continue;
        s.x += (dx / d) * (min - d);
        s.z += (dz / d) * (min - d);
        if (isPlayer && this.bumpT <= 0 && s.speed > 3) {
          this.bumpT = 1;
          this.sfx('bump', { volume: 0.7 });
          this.camShake = 0.5;
          this.fx.splash(px - (dx / d) * 1.5, pz - (dz / d) * 1.5, 0.6);
        }
        s.speed *= a > 0 ? 0.9 : 0.97;
      }
    }
    if (isPlayer) this.bumpT -= 1 / 60;
  }

  private collideShips(): void {
    const ships = [this.player, ...this.foes.filter((f) => f.ship.sinking < 0).map((f) => f.ship)];
    if (this.ally && this.ally.sinking < 0) ships.push(this.ally);
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j];
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > a.halfL + b.halfL + 2 || d < 0.01) continue;
        // each hull's reach along the line between them (long bow to stern, narrow abeam)
        const ux = dx / d, uz = dz / d;
        const reach = (s: Ship) => Math.abs(ux * Math.sin(s.heading) + uz * Math.cos(s.heading)) * s.halfL
          + Math.abs(-ux * Math.cos(s.heading) + uz * Math.sin(s.heading)) * s.halfW;
        const min = reach(a) + reach(b) + 0.6;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
    }
  }

  /** The best target abeam on a side (-1 port, 1 starboard) and where to land the volley. */
  private aimFor(side: number): { target: Ship | Fort | null; x: number; z: number; score: number } {
    const p = this.player;
    const f = fwd(p.heading), s = starboard(p.heading).multiplyScalar(side);
    const cone = (this.tune.aimCone * Math.PI) / 180;
    let best: { target: Ship | Fort | null; x: number; z: number; score: number } = { target: null, x: p.x + s.x * DEFAULT_RANGE, z: p.z + s.z * DEFAULT_RANGE, score: Infinity };
    const consider = (target: Ship | Fort, x: number, z: number, vx: number, vz: number) => {
      const dx = x - p.x, dz = z - p.z;
      const lat = dx * s.x + dz * s.z, along = dx * f.x + dz * f.z;
      const d = Math.hypot(dx, dz);
      if (lat < 5 || d > MAX_RANGE) return;
      const ang = Math.atan2(Math.abs(along), lat);
      if (ang > cone) return;
      // lead the target over the flight time
      const T = d / PLAYER_VH;
      const score = ang * 30 + d;
      if (score < best.score) best = { target, x: x + vx * T, z: z + vz * T, score };
    };
    for (const foe of this.foes) {
      const sh = foe.ship;
      if (sh.sinking >= 0) continue;
      const v = fwd(sh.heading).multiplyScalar(sh.speed);
      consider(sh, sh.x, sh.z, v.x, v.z);
    }
    for (const fort of this.map.forts) if (fort.falling < 0) consider(fort, fort.x, fort.z, 0, 0);
    return best;
  }

  private playerFire(side: number): void {
    if (this.dead) return;
    const reload = side < 0 ? this.reloadL : this.reloadR;
    if (reload > 0) {
      this.sfx('click', { volume: 0.4 });
      return;
    }
    if (side < 0) this.reloadL = this.tune.reload; else this.reloadR = this.tune.reload;
    const aim = this.aimFor(side);
    this.stats.volleys++;
    const atFort = !!aim.target && !(aim.target instanceof Ship);
    this.volley(this.player, side, aim.x, aim.z, PLAYER_GUNS, true, 0, atFort ? 1.1 : 0);
    this.camShake = Math.max(this.camShake, 0.35);
    // first shots: say how it works
    if (!aim.target && this.foes.length) this.showHint(this.steering.pad ? 'h_fire_touch' : 'h_fire_keys');
  }

  /** Fires `n` balls from one side of a ship towards (ax, az), spread along the hull. */
  private volley(ship: Ship, side: number, ax: number, az: number, n: number, mine: boolean, spread: number, minT = 0): void {
    const f = fwd(ship.heading);
    const s = starboard(ship.heading).multiplyScalar(side);
    for (let i = 0; i < n; i++) {
      // the player's guns spread along the hull to rake a target; enemy shots bunch closer, so a
      // quick change of course gets out from under them
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * ship.halfL * (mine ? 1.1 : 0.6);
      const start = ship.point(off, side * ship.halfW * 0.95, 1.6 * ship.scale);
      const rake = minT ? 0.3 : 1;
      let x1 = ax + f.x * off * rake, z1 = az + f.z * off * rake;
      if (spread) {
        x1 += (Math.random() - 0.5) * 2 * spread;
        z1 += (Math.random() - 0.5) * 2 * spread;
      }
      const d = Math.hypot(x1 - start.x, z1 - start.z);
      const T = Phaser.Math.Clamp(Math.max(minT, d / (mine ? PLAYER_VH : FOE_VH)), 0.45, 2.2);
      this.launchBall(start, x1, z1, T, -i * 0.08, mine, ship);
      // the muzzle flash and smoke happen when that gun fires
      const delay = i * 80;
      this.time.delayedCall(delay, () => {
        if (ship.sinking >= 0) return;
        this.fx.muzzle(ship.point(off, side * ship.halfW * 1.05, 1.6 * ship.scale), s);
        const sx = this.world.toScreen(start).x;
        this.sfxAt(mine ? 'cannon' : 'cannonFar', sx, { volume: mine ? 0.75 : 0.5 });
      });
    }
  }

  private launchBall(start: THREE.Vector3, x1: number, z1: number, T: number, t0: number, mine: boolean, from: Ship | null): void {
    const y1 = 0;
    const vy = (G * T * T / 2 + y1 - start.y) / T;
    this.balls.push({ x0: start.x, y0: start.y, z0: start.z, x1, y1, z1, T, t: t0, vy, mine, from, x: start.x, y: start.y, z: start.z });
    if (!mine) {
      // the red ring: where it will come down, closing in until it does
      this.fx.ring(x1, z1, 0xff3b30, 4.2, 1.6, T - t0, 0.9, true);
      this.showHintLater('h_dodge');
    }
  }

  private updateBalls(dt: number): void {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(BALL_SCALE, BALL_SCALE, BALL_SCALE), v = new THREE.Vector3();
    let n = 0;
    this.balls = this.balls.filter((b) => {
      b.t += dt;
      if (b.t < 0) return true;
      const k = Math.min(1, b.t / b.T);
      b.x = b.x0 + (b.x1 - b.x0) * k;
      b.z = b.z0 + (b.z1 - b.z0) * k;
      b.y = b.y0 + b.vy * b.t - (G * b.t * b.t) / 2;
      // hits
      if (b.mine) {
        for (const foe of this.foes) {
          if (foe.ship.sinking >= 0) continue;
          if (foe.ship.contains(b.x, b.y, b.z, 0.4)) {
            this.hitFoe(foe, b);
            return false;
          }
        }
        for (const fort of this.map.forts) {
          if (fort.falling >= 0) continue;
          if (Math.hypot(b.x - fort.x, b.z - fort.z) < 4.6 && b.y < 13) {
            this.hitFort(fort, b);
            return false;
          }
        }
      } else {
        const p = this.player;
        // once the wave is won, shots still in the air only splash
        if (!this.dead && this.phase === 'play' && p.contains(b.x, b.y, b.z, 0.3)) {
          this.fx.hit(v.set(b.x, Math.max(b.y, p.waterY + 1.5), b.z));
          this.damagePlayer(false);
          return false;
        }
        const a = this.ally;
        if (a && a.sinking < 0 && a.contains(b.x, b.y, b.z, 0.3)) {
          this.fx.hit(v.set(b.x, Math.max(b.y, a.waterY + 1.5), b.z));
          this.hitAlly();
          return false;
        }
      }
      if (b.y < 2.5 && b.t > 0.1) {
        const isl = this.map.hitIsland(b.x, b.z, -1);
        // shots at a fort fly over its beach and walls
        if (isl && !(b.mine && isl.fort && isl.fort.falling < 0)) {
          this.fx.hit(v.set(b.x, Math.max(0.5, b.y), b.z), 0.5);
          return false;
        }
      }
      if (k >= 1) {
        this.fx.splash(b.x1, b.z1);
        if (b.mine) this.sfxAt('splash', this.world.toScreen(v.set(b.x1, 0, b.z1)).x, { volume: 0.35 });
        else {
          // a near miss sends spray over the deck
          const d = Math.hypot(b.x1 - this.player.x, b.z1 - this.player.z);
          this.sfx('splash', { volume: d < 12 ? 0.75 : 0.35 });
          if (d < 10) this.camShake = Math.max(this.camShake, 0.3);
        }
        return false;
      }
      m.compose(v.set(b.x, b.y, b.z), q, sc);
      this.ballMesh.setMatrixAt(n++, m);
      return true;
    });
    this.ballMesh.count = n;
    this.ballMesh.instanceMatrix.needsUpdate = true;
  }

  private comboMult(): number {
    return Math.min(5, 1 + Math.floor(this.combo / 3));
  }

  private bumpCombo(): void {
    this.combo++;
    this.comboT = COMBO_TIME;
    this.updateCombo();
  }

  private updateCombo(): void {
    const m = this.comboMult();
    const show = m >= 2;
    if (show && !this.comboChip.visible) {
      this.comboChip.setVisible(true).setScale(0.6);
      this.tweens.add({ targets: this.comboChip, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    if (!show) this.comboChip.setVisible(false);
    const s = t('combo', { n: m });
    if (show && this.comboChip.text.text !== s) {
      this.comboChip.setText(s);
      this.tweens.add({ targets: this.comboChip, scale: { from: 1.25, to: 1 }, duration: 200 });
    }
  }

  private hitFoe(foe: Foe, b: Ball): void {
    const sh = foe.ship;
    sh.hp--;
    this.stats.hits++;
    sh.flash();
    this.fx.hit(new THREE.Vector3(b.x, Math.max(b.y, sh.waterY + 1.5), b.z));
    const sp = this.world.toScreen(new THREE.Vector3(b.x, b.y + 2, b.z));
    this.sfxAt('hit', sp.x, { volume: 0.8 });
    this.bumpCombo();
    const pts = 10 * this.comboMult();
    this.addScore(pts);
    popup(this, sp.x, sp.y, `+${pts}`, '#ffffff', 22);
    if (foe === this.boss) {
      this.updateGoal();
      if (!foe.summoned && sh.hp <= sh.maxHp / 2 && sh.hp > 0) {
        foe.summoned = true;
        popup(this, this.scale.width / 2, 320, t('bossSummons'), '#3dffb0', 28);
        this.pending.unshift({ kind: 'sloop', at: 0 }, { kind: 'sloop', at: 0 });
      }
      if (!foe.enraged && sh.hp <= sh.maxHp / 4 && sh.hp > 0) {
        foe.enraged = true;
        foe.reloadK *= 0.8;
        foe.speedK *= 1.15;
        popup(this, this.scale.width / 2, 360, t('bossRage'), '#ff5a3c', 30);
        this.sfx('bossHorn', { volume: 0.6, exact: true });
      }
    }
    if (sh.hp <= 0) this.sinkFoe(foe);
  }

  private sinkFoe(foe: Foe): void {
    const sh = foe.ship;
    sh.startSinking();
    const at = new THREE.Vector3(sh.x, sh.waterY, sh.z);
    this.fx.wreck(at, sh.halfL);
    const boss = foe === this.boss;
    this.sfx(boss ? 'bigBoom' : 'sink', { volume: 0.9 });
    this.camShake = boss ? 1.6 : 0.8;
    shake(this, boss ? 0.012 : 0.006, boss ? 600 : 260);
    // the galleon's bounty takes at most a ×3 combo, so one kill does not decide the board
    const mult = boss ? Math.min(3, this.comboMult()) : this.comboMult();
    const pts = foe.stats.points * mult;
    this.addScore(pts);
    const sp = this.world.toScreen(at.clone().setY(at.y + 6));
    popup(this, sp.x, sp.y - 20, `${t('sunk')} +${pts}`, '#ffd23f', boss ? 40 : 32);
    if (mult >= 2) popup(this, sp.x, sp.y + 26, t('combo', { n: mult }), '#ff9a3c', 26);
    if (this.def.mission === 'sink' || this.def.mission === 'escort' || this.def.mission === 'fort' || this.def.mission === 'treasure') this.sunk++;
    // loot floats up where it sank
    const drop = (kind: LootKind) => {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
      this.dropLoot(kind, sh.x + Math.cos(a) * r, sh.z + Math.sin(a) * r);
    };
    this.later(0.6, () => {
      drop('chest');
      if (boss) { drop('chest'); drop('chest'); drop('barrel'); }
      const hurt = this.hull < this.tune.hull;
      if (Math.random() < this.tune.barrelChance + (hurt ? 0.2 : 0)) drop('barrel');
      if (Math.random() < 0.22) drop('bottle');
      this.showHintLater('h_loot');
    });
    if (boss) {
      this.sfx('fanfare', { exact: true, volume: 0.8 });
      flash(this, 0xffffff, 200, 0.4);
    }
    this.updateGoal();
  }

  private damagePlayer(force: boolean): void {
    if (this.dead || (!force && this.invuln > 0) || this.phase === 'over') return;
    this.hull--;
    if (force) this.stats.stormHits++; else this.stats.hitsTaken++;
    this.invuln = this.tune.invuln;
    this.player.flash();
    this.hud.setLives(this.hull, this.tune.hull);
    this.sfx('hurt', { volume: 0.85 });
    this.camShake = 1;
    shake(this, 0.009, 260);
    flash(this, 0xff4d3a, 160, 0.3);
    this.combo = 0;
    this.updateCombo();
    if (this.hull === 1) popup(this, this.scale.width / 2, 300, t('lowHull'), '#ff5a3c', 32);
    if (this.hull <= 0) {
      this.dead = true;
      this.phase = 'over';
      this.player.startSinking();
      this.fx.wreck(new THREE.Vector3(this.player.x, this.player.waterY, this.player.z), this.player.halfL);
      this.sfx('sink', { volume: 1 });
      this.sfx('lose', { volume: 0.7, exact: true });
      this.steering.end();
      // the scene keeps running while the ship goes under, then the result screen comes up
      this.later(2.6, () => this.endGame({ title: t('shipwrecked'), delay: 200 }));
    }
  }

  // ---------------------------------------------------------------- foes

  private updateFoes(dt: number): void {
    for (const foe of this.foes) {
      const sh = foe.ship;
      if (sh.sinking >= 0) {
        if (Math.random() < dt * 6) this.fx.bubbles(sh.x, sh.z, sh.halfL * 0.6);
        if (Math.random() < dt * 5 && sh.sinking < 2) this.fx.burn(sh.point((Math.random() - 0.5) * sh.halfL, 0, 2), true);
        sh.speed *= 1 - dt;
        const f = fwd(sh.heading);
        sh.x += f.x * sh.speed * dt;
        sh.z += f.z * sh.speed * dt;
        continue;
      }
      const target: Ship = foe.hunt === 'ally' && this.ally && this.ally.sinking < 0 ? this.ally : this.player;
      const dx = target.x - sh.x, dz = target.z - sh.z, d = Math.hypot(dx, dz);
      // a ship stuck far away (behind an island, at the edge) comes back into the fight
      foe.farT = d > 80 ? foe.farT + dt : 0;
      if (foe.farT > 20) {
        foe.farT = 0;
        const spot = this.seaSpot(target.x, target.z, 62, target.heading + Math.PI, 1.2);
        sh.x = spot.x;
        sh.z = spot.z;
        sh.heading = Math.atan2(target.x - sh.x, target.z - sh.z);
      }
      const toT = Math.atan2(dx, dz);
      let desired: number;
      let speed = foe.stats.speed * foe.speedK;
      if (d > 30) {
        // close in, aiming for a spot alongside the target
        const s = starboard(target.heading).multiplyScalar(foe.side * 13);
        desired = Math.atan2(target.x + s.x - sh.x, target.z + s.z - sh.z);
      } else if (d < 9) {
        desired = toT + Math.PI;
      } else {
        // broadside: lie across the line to the target, the nearer of the two ways
        const a = toT + Math.PI / 2, b = toT - Math.PI / 2;
        desired = Math.abs(angleDiff(a, sh.heading)) < Math.abs(angleDiff(b, sh.heading)) ? a : b;
        // and hold a fighting distance
        if (d > 20) desired += angleDiff(toT, desired) * 0.35;
        if (d < 12) desired -= angleDiff(toT, desired) * 0.35;
        speed *= 0.75;
      }
      if (this.dead) { desired = toT + Math.PI; speed *= 0.6; }
      // islands ahead: steer around them
      const f = fwd(sh.heading);
      const probe = this.map.hitIsland(sh.x + f.x * 16, sh.z + f.z * 16, sh.halfW + 2);
      if (probe) {
        const away = Math.atan2(sh.x - probe.x, sh.z - probe.z);
        desired = sh.heading + Math.sign(angleDiff(away, sh.heading) || 1) * 1.2;
      }
      if (Math.hypot(sh.x, sh.z) > MAP_R - 8) desired = Math.atan2(-sh.x, -sh.z);
      const diff = angleDiff(desired, sh.heading);
      const turn = foe.stats.turn * dt;
      sh.heading += Phaser.Math.Clamp(diff, -turn, turn);
      sh.rudder = Phaser.Math.Clamp(-diff * 2, -1, 1);
      sh.speed += (speed - sh.speed) * Math.min(1, dt * 0.8);
      sh.x += f.x * sh.speed * dt;
      sh.z += f.z * sh.speed * dt;
      sh.setFurl(sh.speed / (foe.stats.speed * foe.speedK) > 0.9 ? 1 : 0.7);
      this.collideIslands(sh, false);

      // fire when the target lies abeam
      foe.reload[0] -= dt;
      foe.reload[1] -= dt;
      if (this.phase === 'play' && !this.dead && d < foe.stats.range) {
        for (const side of [-1, 1]) {
          const ri = side < 0 ? 0 : 1;
          if (foe.reload[ri] > 0) continue;
          const sv = starboard(sh.heading).multiplyScalar(side);
          const cos = (dx * sv.x + dz * sv.z) / d;
          if (cos < Math.cos((30 * Math.PI) / 180)) continue;
          const T = d / FOE_VH;
          // gunners lead the target, not perfectly: a change of speed or course beats them
          const tv = fwd(target.heading).multiplyScalar(target.speed * T * this.tune.foeLead);
          const spread = this.tune.foeSpread / Math.sqrt(this.rampK());
          this.volley(sh, side, target.x + tv.x, target.z + tv.z, foe.stats.guns, false, spread);
          if (target === this.player) this.stats.foeVolleys++;
          foe.reload[ri] = foe.stats.reload * foe.reloadK * (0.85 + Math.random() * 0.3);
          // a ship firing both sides keeps the other gun deck loaded
          if (!foe.stats.both) foe.reload[1 - ri] = Math.max(foe.reload[1 - ri], 1.2);
        }
      }
      // battle damage shows
      foe.smokeT -= dt;
      if (sh.hp <= sh.maxHp / 2 && foe.smokeT <= 0) {
        foe.smokeT = 0.18;
        this.fx.burn(sh.point((Math.random() - 0.5) * sh.halfL, (Math.random() - 0.5) * 2, 2.2 * sh.scale), sh.hp <= sh.maxHp / 4);
      }
    }
  }

  private updateAlly(dt: number): void {
    const a = this.ally;
    if (!a) return;
    if (a.sinking >= 0) {
      a.speed *= 1 - dt;
      if (Math.random() < dt * 6) this.fx.bubbles(a.x, a.z, a.halfL * 0.6);
      return;
    }
    const dx = BERTH.x - a.x, dz = BERTH.z - a.z, d = Math.hypot(dx, dz);
    let desired = Math.atan2(dx, dz);
    const f = fwd(a.heading);
    const probe = this.map.hitIsland(a.x + f.x * 18, a.z + f.z * 18, a.halfW + 3);
    if (probe && probe !== this.map.home) {
      const away = Math.atan2(a.x - probe.x, a.z - probe.z);
      desired = a.heading + Math.sign(angleDiff(away, a.heading) || 1) * 1.1;
    }
    const diff = angleDiff(desired, a.heading);
    a.heading += Phaser.Math.Clamp(diff, -0.6 * dt, 0.6 * dt);
    a.rudder = Phaser.Math.Clamp(-diff * 2, -1, 1);
    // it heaves to while the escort has not caught up
    const escortNear = Math.hypot(this.player.x - a.x, this.player.z - a.z) < 45;
    const want = this.phase === 'play' ? (escortNear ? 4.2 : 1.6) : 0;
    a.speed += (want - a.speed) * Math.min(1, dt);
    a.x += f.x * a.speed * dt;
    a.z += f.z * a.speed * dt;
    a.setFurl(escortNear ? 0.8 : 0.3);
    this.collideIslands(a, false);
    if (this.phase === 'play' && d < BERTH.r + 3 && !this.escortDone) {
      this.escortDone = true;
      popup(this, this.scale.width / 2, 340, t('convoyHome'), '#7dff9a', 34);
      this.addScore(400 + this.allyHp * 50);
      this.giveGold(60, this.scale.width / 2, 400);
      this.fx.sparkle(a.point(0, 0, 4), 0xffd23f, 40);
    }
  }

  private hitAlly(): void {
    const a = this.ally;
    if (!a) return;
    this.allyHp--;
    a.flash();
    this.sfx('hit', { volume: 0.5 });
    this.updateGoal();
    if (this.allyHp <= 0 && this.phase === 'play') {
      a.startSinking();
      this.fx.wreck(new THREE.Vector3(a.x, a.waterY, a.z), a.halfL);
      this.sfx('sink', { volume: 0.8 });
      popup(this, this.scale.width / 2, 340, t('convoyLost'), '#ff8a6a', 32);
      this.failed = true;
    }
  }

  private updateForts(dt: number): void {
    const p = this.player;
    for (const fort of [...this.map.forts]) {
      if (fort.falling >= 0) {
        fort.falling += dt;
        fort.root.position.y = 0.3 - Math.min(1, fort.falling / 2.4) ** 2 * 12;
        fort.root.rotation.z = Math.min(1, fort.falling / 2.4) * 0.25;
        if (Math.random() < dt * 10) this.fx.burn(new THREE.Vector3(fort.x + (Math.random() - 0.5) * 6, 2, fort.z + (Math.random() - 0.5) * 6), true);
        if (fort.falling > 2.6) this.map.removeFort(fort);
        continue;
      }
      // the gun on top turns to the player
      const dx = p.x - fort.x, dz = p.z - fort.z, d = Math.hypot(dx, dz);
      fort.cannon.rotation.y = Math.atan2(dx, dz);
      fort.reload -= dt;
      if (this.phase === 'play' && !this.dead && d < 44 && fort.reload <= 0) {
        fort.reload = 5 * this.tune.foeReload / this.rampK();
        const T = 1.9;
        const top = new THREE.Vector3(fort.x, 11, fort.z);
        const tv = fwd(p.heading).multiplyScalar(p.speed * (T + 0.1) * this.tune.foeLead * 0.8);
        const spread = this.tune.foeSpread * 1.3;
        for (let i = 0; i < 2; i++) {
          this.launchBall(top, p.x + tv.x + (Math.random() - 0.5) * 2 * spread, p.z + tv.z + (Math.random() - 0.5) * 2 * spread, T, -i * 0.25, false, null);
        }
        this.fx.muzzle(top, new THREE.Vector3(dx / d, 0.3, dz / d));
        this.sfxAt('cannonFar', this.world.toScreen(top).x, { volume: 0.6 });
      }
      if (fort.hp < fort.maxHp / 2 && Math.random() < dt * 4) this.fx.burn(new THREE.Vector3(fort.x, 9, fort.z), fort.hp < fort.maxHp / 4);
    }
  }

  private hitFort(fort: Fort, b: Ball): void {
    fort.hp--;
    this.fx.hit(new THREE.Vector3(b.x, Math.max(2, b.y), b.z));
    const sp = this.world.toScreen(new THREE.Vector3(b.x, b.y + 2, b.z));
    this.sfxAt('stone', sp.x, { volume: 0.8 });
    this.bumpCombo();
    const pts = 10 * this.comboMult();
    this.addScore(pts);
    popup(this, sp.x, sp.y, `+${pts}`, '#ffffff', 22);
    // the tower shudders
    this.tweens.add({ targets: fort.tower.scale, x: 1.62, z: 1.62, duration: 60, yoyo: true });
    if (fort.hp <= 0) {
      fort.falling = 0;
      this.fortsDown++;
      const pts2 = 300 * this.comboMult();
      this.addScore(pts2);
      popup(this, sp.x, sp.y - 30, `${t('fortDown')} +${pts2}`, '#ffd23f', 32);
      this.sfx('bigBoom', { volume: 0.9 });
      this.camShake = 1.2;
      shake(this, 0.008, 400);
      this.fx.wreck(new THREE.Vector3(fort.x, 3, fort.z), 6);
      const a = Math.atan2(this.player.x - fort.x, this.player.z - fort.z);
      const r = fort.island.r + 4;
      this.dropLoot('chest', fort.x + Math.sin(a) * r, fort.z + Math.cos(a) * r);
      this.updateGoal();
    }
  }

  // ---------------------------------------------------------------- loot update

  private updateLoot(dt: number): void {
    const p = this.player;
    for (const l of [...this.loot]) {
      l.age += dt;
      const y = this.sea.height(l.x, l.z);
      l.obj.position.set(l.x, y + Math.min(0, (l.age - 0.6) * 3), l.z);
      l.obj.rotation.y += dt * 0.6;
      l.obj.rotation.z = Math.sin(l.age * 1.8) * 0.12;
      if (l.age > l.life - 5) l.obj.visible = Math.floor(l.age * 8) % 2 === 0;
      if (l.age > l.life) {
        this.removeLoot(l);
        continue;
      }
      if (!this.dead && this.phase !== 'card' && Math.hypot(l.x - p.x, l.z - p.z) < p.halfL * 0.8 + 2.5) this.collect(l);
    }
  }

  // ---------------------------------------------------------------- camera and UI

  private placeCamera(dt: number, snap: boolean): void {
    const p = this.player;
    this.camYaw += angleDiff(p.heading, this.camYaw) * (snap ? 1 : Math.min(1, dt * 1.6));
    const f = fwd(this.camYaw);
    // pull back to keep the nearest fight in frame (a ship or fort lying far abeam)
    const s = starboard(this.camYaw);
    let frame = 0;
    const take = (x: number, z: number, reach: number) => {
      const dx = x - p.x, dz = z - p.z;
      if (Math.hypot(dx, dz) < reach) frame = Math.max(frame, Math.abs(dx * s.x + dz * s.z) + 7);
    };
    for (const foe of this.foes) if (foe.ship.sinking < 0) take(foe.ship.x, foe.ship.z, 40);
    for (const fo of this.map.forts) if (fo.falling < 0) take(fo.x, fo.z, 46);
    const zoom = Phaser.Math.Clamp(frame / 21, 1, 1.5);
    this.camZoom += (zoom - this.camZoom) * (snap ? 1 : Math.min(1, dt * 0.8));
    const back = 44 * this.camZoom, up = 56 * this.camZoom;
    const want = new THREE.Vector3(p.x - f.x * back, up, p.z - f.z * back);
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, Math.min(1, dt * 4));
    const cam = this.world.camera;
    cam.position.copy(this.camPos);
    this.camShake = Math.max(0, this.camShake - dt * 2.5);
    if (this.camShake > 0) {
      const s = this.camShake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(p.x + f.x * 15, 0, p.z + f.z * 15);
  }

  private drawUi(dt: number): void {
    // reload gauges and sail bars in the HUD chip
    const drawGauge = (g: Phaser.GameObjects.Graphics, left: boolean, reload: number) => {
      g.clear();
      const k = 1 - reload / this.tune.reload;
      const ready = reload <= 0;
      g.fillStyle(0x000000, 0.35).fillCircle(0, 0, 13);
      if (ready) g.fillStyle(this.rapidT > 0 ? 0x7fd8ff : 0xffb43c, 1).fillCircle(0, 0, 13);
      else {
        g.lineStyle(4, 0xffb43c, 1);
        g.beginPath();
        g.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        g.strokePath();
      }
      g.fillStyle(ready ? 0x2a1608 : 0xffffff, ready ? 1 : 0.7);
      if (left) g.fillTriangle(-6, 0, 4, -6, 4, 6);
      else g.fillTriangle(6, 0, -4, -6, -4, 6);
    };
    drawGauge(this.gaugeL, true, this.reloadL);
    drawGauge(this.gaugeR, false, this.reloadR);
    const sb = this.sailBars;
    sb.clear();
    for (let i = 0; i < 3; i++) {
      const on = i < this.sail;
      sb.fillStyle(on ? 0xffffff : 0xffffff, on ? 0.95 : 0.25).fillRoundedRect(-15 + i * 11, 8 - (i + 1) * 6, 8, (i + 1) * 6 + 2, 2);
    }

    // reload rings around the touch fire buttons (and the sail icons) show with the pad
    this.padIcons?.setVisible(!!this.steering.pad?.visible);
    const r = this.rings;
    r.clear();
    if (this.steering.pad?.visible) {
      const { width, height } = this.scale;
      const ring = (x: number, y: number, reload: number) => {
        const k = 1 - reload / this.tune.reload;
        r.lineStyle(9, 0x000000, 0.3).strokeCircle(x, y, 72);
        if (reload <= 0) {
          const pulse = 0.65 + Math.sin(this.elapsed * 6) * 0.25;
          r.lineStyle(7, this.rapidT > 0 ? 0x7fd8ff : 0xffd23f, pulse).strokeCircle(x, y, 72);
        } else {
          r.lineStyle(7, 0xffffff, 0.9);
          r.beginPath();
          r.arc(x, y, 72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          r.strokePath();
        }
      };
      ring(482, height - 136, this.reloadL);
      ring(width - 80, height - 136, this.reloadR);
    }

    // markers: health pips over ships, arrows at the edge for what is off screen
    const g = this.marks;
    g.clear();
    const { width, height } = this.scale;
    const top = 150, bottom = this.steering.pad ? height - 360 : height - 70;
    const edge = (wx: number, wy: number, wz: number, color: number, size = 1) => {
      const s = this.world.toScreen(new THREE.Vector3(wx, wy, wz));
      const inside = s.visible && s.x > 20 && s.x < width - 20 && s.y > top && s.y < height - 20;
      if (inside) return s;
      // point from the screen centre of the ship towards it
      const ps = this.world.toScreen(new THREE.Vector3(this.player.x, 0, this.player.z));
      let dx = s.x - ps.x, dy = s.y - ps.y;
      if (!s.visible) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx);
      const cx = width / 2, cy = (top + bottom) / 2;
      const hw = width / 2 - 34, hh = (bottom - top) / 2 - 10;
      const k = Math.min(hw / Math.max(0.001, Math.abs(Math.cos(a))), hh / Math.max(0.001, Math.abs(Math.sin(a))));
      const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
      const z = 20 * size;
      g.fillStyle(0x000000, 0.35).fillCircle(x, y, z * 0.95);
      g.fillStyle(color, 0.95);
      g.fillTriangle(x + Math.cos(a) * z, y + Math.sin(a) * z, x + Math.cos(a + 2.4) * z * 0.75, y + Math.sin(a + 2.4) * z * 0.75, x + Math.cos(a - 2.4) * z * 0.75, y + Math.sin(a - 2.4) * z * 0.75);
      return null;
    };
    for (const foe of this.foes) {
      const sh = foe.ship;
      if (sh.sinking >= 0) continue;
      const s = edge(sh.x, sh.waterY + 9 * sh.scale, sh.z, foe === this.boss ? 0x3dffb0 : 0xff4a3c, foe === this.boss ? 1.3 : 1);
      if (s && foe !== this.boss) {
        const w = 12 * sh.maxHp > 90 ? 90 : 12 * sh.maxHp;
        g.fillStyle(0x000000, 0.5).fillRoundedRect(s.x - w / 2 - 3, s.y - 5, w + 6, 10, 5);
        g.fillStyle(0xff5a3c, 1).fillRoundedRect(s.x - w / 2, s.y - 3, Math.max(4, w * (sh.hp / sh.maxHp)), 6, 3);
      }
    }
    for (const f of this.map.forts) {
      if (f.falling >= 0) continue;
      const s = edge(f.x, 14, f.z, 0xff9a3c, 1.1);
      if (s) {
        const w = 70;
        g.fillStyle(0x000000, 0.5).fillRoundedRect(s.x - w / 2 - 3, s.y - 5, w + 6, 10, 5);
        g.fillStyle(0xff9a3c, 1).fillRoundedRect(s.x - w / 2, s.y - 3, Math.max(4, w * (f.hp / f.maxHp)), 6, 3);
      }
    }
    for (const l of this.loot) if (l.mission) edge(l.x, 1, l.z, 0xffd23f, 0.9);
    if (this.ally && this.ally.sinking < 0) {
      const s = edge(this.ally.x, 10, this.ally.z, 0x4aa8ff, 1.1);
      if (s) {
        g.fillStyle(0x4aa8ff, 1).fillTriangle(s.x - 12, s.y - 22, s.x + 12, s.y - 22, s.x, s.y - 6);
        const w = 80;
        g.fillStyle(0x000000, 0.5).fillRoundedRect(s.x - w / 2 - 3, s.y - 5, w + 6, 10, 5);
        g.fillStyle(0x4aa8ff, 1).fillRoundedRect(s.x - w / 2, s.y - 3, Math.max(4, w * (this.allyHp / this.allyMax)), 6, 3);
      }
    }
    if (this.hull < this.tune.hull) {
      const s = edge(BERTH.x, 2, BERTH.z, 0x7dff9a, 1.1);
      if (s) g.fillStyle(0x7dff9a, 0.9).fillTriangle(s.x - 14, s.y - 34, s.x + 14, s.y - 34, s.x, s.y - 12);
    }

    // hints fade out after a while; queued ones follow
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.tweens.add({ targets: this.hint, alpha: 0, duration: 350 });
    } else if (this.hintQueue.length && this.hint.alpha < 0.05) {
      this.displayHint(this.hintQueue.shift()!);
    }
    // a hint that waits for its moment
    if (this.phase === 'play' && this.wave === 0 && this.foes.some((f) => Math.hypot(f.ship.x - this.player.x, f.ship.z - this.player.z) < 45)) {
      this.showHint(this.steering.pad ? 'h_fire_touch' : 'h_fire_keys');
    }
  }

  private showHint(key: string): void {
    if (seenHints.has(key) || this.hintQueue.includes(key)) return;
    seenHints.add(key);
    if (this.hintT > 0) this.hintQueue.push(key);
    else this.displayHint(key);
  }

  /** Same, but never interrupts: it waits behind the current hint. */
  private showHintLater(key: string): void {
    if (seenHints.has(key) || this.hintQueue.includes(key)) return;
    seenHints.add(key);
    this.hintQueue.push(key);
  }

  private displayHint(key: string): void {
    this.hint.setText(t(key)).setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.hint, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.hintT = 4.8;
  }

  // ---------------------------------------------------------------- autopilot (tests)

  private botInput(): { steer: number; sail: number; port: boolean; star: boolean } {
    const p = this.player;
    let tx = 0, tz = 0, mode: 'fight' | 'go' = 'go', sail = 3;
    const alive = this.foes.filter((f) => f.ship.sinking < 0);
    const nearestFoe = alive.sort((a, b) => Math.hypot(a.ship.x - p.x, a.ship.z - p.z) - Math.hypot(b.ship.x - p.x, b.ship.z - p.z))[0];
    const chest = this.loot.filter((l) => l.mission || l.kind !== 'bottle').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const fort = this.map.forts.find((f) => f.falling < 0);
    if (this.hull <= 2 && !this.boss) {
      tx = BERTH.x; tz = BERTH.z;
      if (Math.hypot(p.x - tx, p.z - tz) < 14) sail = 1;
    } else if (this.def.mission === 'treasure' && chest && (!nearestFoe || Math.hypot(nearestFoe.ship.x - p.x, nearestFoe.ship.z - p.z) > 22)) {
      tx = chest.x; tz = chest.z;
    } else if (nearestFoe) {
      tx = nearestFoe.ship.x; tz = nearestFoe.ship.z; mode = 'fight';
    } else if (fort) {
      tx = fort.x; tz = fort.z; mode = 'fight';
    } else if (chest) {
      tx = chest.x; tz = chest.z;
    } else if (this.ally) {
      tx = this.ally.x; tz = this.ally.z;
    }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    const toT = Math.atan2(dx, dz);
    let desired = toT;
    if (mode === 'fight' && d < 26) {
      const a = toT + Math.PI / 2, b = toT - Math.PI / 2;
      desired = Math.abs(angleDiff(a, p.heading)) < Math.abs(angleDiff(b, p.heading)) ? a : b;
      if (d < 12) desired -= angleDiff(toT, desired) * 0.5;
      sail = 2;
    }
    const f = fwd(p.heading);
    const probe = this.map.hitIsland(p.x + f.x * 18, p.z + f.z * 18, p.halfW + 3);
    if (probe && probe !== this.map.home) {
      const away = Math.atan2(p.x - probe.x, p.z - probe.z);
      desired = p.heading + Math.sign(angleDiff(away, p.heading) || 1) * 1.2;
    }
    // dodge: try every rudder and sail setting a couple of seconds ahead against the balls in
    // the air, and take the safest one that still heads for the goal
    let best = { cost: Infinity, steer: 0, sail };
    const incoming = this.balls.filter((b) => !b.mine);
    for (const st of [-1, 0, 1]) {
      for (const sl of [1, 2, 3]) {
        let x = p.x, z = p.z, h = p.heading, v = p.speed, rud = p.rudder, tt = 0, hits = 0;
        const land = incoming.map((b) => b.T - b.t).sort((a, b2) => a - b2);
        let li = 0;
        while (tt < 2.2) {
          const dt = 0.1;
          const want = SAIL_SPEED[sl];
          v += (want - v) * Math.min(1, dt * (want > v ? ACCEL : DECEL));
          rud += (st - rud) * Math.min(1, dt * 5);
          h -= rud * TURN * (0.55 + 0.45 * Math.min(1, v / 9)) * dt;
          x += Math.sin(h) * v * dt;
          z += Math.cos(h) * v * dt;
          tt += dt;
          while (li < land.length && land[li] <= tt) li++;
          for (const b of incoming) {
            const tl = b.T - b.t;
            if (Math.abs(tl - tt) > 0.05) continue;
            const dx = b.x1 - x, dz = b.z1 - z;
            const f2 = Math.sin(h) * dx + Math.cos(h) * dz, s2 = -Math.cos(h) * dx + Math.sin(h) * dz;
            if (Math.abs(f2) < p.halfL + 1.2 && Math.abs(s2) < p.halfW + 1.2) hits++;
          }
          if (this.map.hitIsland(x, z, p.halfW)) hits += 0.5;
        }
        const ang = Math.abs(angleDiff(desired, h));
        const cost = hits * 100 + ang * 3 + (sl !== sail ? 0.6 : 0) + (st !== Math.sign(-angleDiff(desired, p.heading)) ? 0.2 : 0);
        if (cost < best.cost) best = { cost, steer: st, sail: sl };
      }
    }
    const diff = angleDiff(desired, p.heading);
    const steer = best.cost >= 100 || incoming.length ? best.steer : Phaser.Math.Clamp(-diff * 2.5, -1, 1);
    sail = best.sail;
    const l = this.aimFor(-1), r = this.aimFor(1);
    return { steer, sail, port: !!l.target && this.reloadL <= 0, star: !!r.target && this.reloadR <= 0 };
  }

  // ---------------------------------------------------------------- test hooks

  /** Test hook: the autopilot sails and fights. */
  testAuto(on = true): void {
    this.auto = on;
  }

  /** Test hook: runs the game for `seconds` of game time at once (no rendering in between). */
  testStep(seconds: number, step = 1 / 30): void {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n && !this.isOver; i++) this.update(this.time.now, step * 1000);
  }

  /** Test hook: jump to a wave (0-based). */
  testWave(i: number): void {
    for (const f of this.foes) f.ship.dispose(this.world.scene);
    this.foes = [];
    for (const l of [...this.loot]) this.removeLoot(l);
    for (const fo of [...this.map.forts]) this.map.removeFort(fo);
    if (this.ally) { this.ally.dispose(this.world.scene); this.ally = null; }
    this.balls = [];
    this.startWave(Math.max(0, Math.min(WAVES.length - 1, i)));
  }

  /** Test hook: start the wave at once (skip the card). */
  testGo(): void {
    if (this.phase === 'card') this.beginPlay();
  }

  /** Test hook: place the player and point it. */
  testPlace(x: number, z: number, heading: number, sail = this.sail): void {
    this.player.x = x;
    this.player.z = z;
    this.player.heading = heading;
    this.sail = sail;
    this.placeCamera(1, true);
  }

  /** Test hook: spawn a foe at a spot relative to the player (along, side). */
  testFoe(kind: FoeKind, along: number, side: number, heading?: number): void {
    const foe = this.spawnFoe(kind);
    const p = this.player;
    const f = fwd(p.heading), s = starboard(p.heading);
    foe.ship.x = p.x + f.x * along + s.x * side;
    foe.ship.z = p.z + f.z * along + s.z * side;
    foe.ship.heading = heading ?? p.heading;
  }

  /** Test hook: fire a side now (-1 port, 1 starboard). */
  testFire(side: number): void {
    if (side < 0) this.reloadL = 0; else this.reloadR = 0;
    this.playerFire(side);
  }

  /** Test hook: drop loot next to the player (or at a spot). */
  testLoot(kind: LootKind, along = 12, side = 0): void {
    const p = this.player.point(along, side, 0);
    this.dropLoot(kind, p.x, p.z);
  }

  /** Test hook: the state. */
  testState(): Record<string, unknown> {
    return {
      wave: this.wave + 1, phase: this.phase, hull: this.hull, gold: this.gold, score: this.score, sail: this.sail,
      foes: this.foes.filter((f) => f.ship.sinking < 0).map((f) => ({ kind: f.kind, hp: f.ship.hp, d: Math.round(Math.hypot(f.ship.x - this.player.x, f.ship.z - this.player.z)) })),
      forts: this.map.forts.length, loot: this.loot.length, balls: this.balls.length, combo: this.combo, sunk: this.sunk, chests: this.chestsGot,
      ally: this.ally ? this.allyHp : null, stats: this.stats, dead: this.dead, over: this.isOver, drawCalls: this.drawCalls, pos: [Math.round(this.player.x), Math.round(this.player.z)],
    };
  }

  /** Test hook: islands near a point, for placing test shots. */
  testIslands(): Island[] {
    return this.map.islands;
  }
}

/** Shortest signed angle from b to a. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clock(s: number): string {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}
