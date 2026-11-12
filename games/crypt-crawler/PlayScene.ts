// Crypt Crawler: a 3D action dungeon crawler (portrait). The Play scene runs the camp shop, then
// floor after floor of locked rooms (rules in sim.ts) drawn by three.js (view.ts) under a Phaser
// HUD: fights, shrines with 1-of-3 blessings, chests and keys, traps, a guardian every third
// floor, the floor-clear card, until the hero's hearts run out.
import Phaser from 'phaser';
import {
  ArcadeScene, Controls, Button, txt, t, upper, isEasy, hudChip, HudChip, HUD_MARGIN, HUD_ROW2_Y, shake, flash, popup,
  storage, playMusic, getLang,
} from '@core';
import { World3D, THREE, playerCharacter3d } from '@core/three';
import {
  Sim, ENEMIES, META, META_MAX, META_COST, UPGRADES, type SimEvent, type UpgradeId, type MetaLevels, type MetaId, type Chest, type Enemy,
} from './sim';
import { DungeonView, paletteOf, SKY } from './view';
import { HeroFigure } from './hero';
import { Fx } from './fx3d';
import { Minimap, BossBar, glass, drawIcon, UI_DEPTH, UP_COLOR } from './ui';
import { upKey, metaKey, bossKey } from './strings';
import { Bot, SKILL } from './bot';

type Phase = 'camp' | 'play' | 'shrine' | 'clear' | 'dead';

const HINTS_KEY = 'crypt-crawler:hints';
const META_KEY = 'crypt-crawler:meta';
export interface MetaSave { bank: number; levels: MetaLevels; runs: number }
export const loadMeta = (): MetaSave => ({ bank: 0, levels: {}, runs: 0, ...storage.get<Partial<MetaSave>>(META_KEY, {}) });
export const saveMeta = (m: MetaSave): void => storage.set(META_KEY, m);

/** The tilted top-down camera. */
export const CAM = { fov: 46, dist: 14, pitch: 47 * Math.PI / 180 };
const CAM_OFF = new THREE.Vector3(0, Math.sin(CAM.pitch) * CAM.dist, Math.cos(CAM.pitch) * CAM.dist);

/** Colours of the enemies' remains. */
const GORE: Partial<Record<string, number>> = { slime: 0x5fd36a, slimelet: 0x8ae07a, skeleton: 0xf2ead8, spearman: 0xd8e4f2, ghost: 0xe8f4ff, zombie: 0x7ab06a, orc: 0x6a9a4a, vampire: 0x9a3a6a };

export class PlayScene extends ArcadeScene {
  world!: World3D;
  sim!: Sim;
  view!: DungeonView;
  hero!: HeroFigure;
  fx!: Fx;
  phase: Phase = 'play';
  /** 'easy' | 'normal', exposed for tests. */
  tune: 'easy' | 'normal' = 'normal';
  /** Test hook: an autopilot plays (screenshots, balance in the browser). */
  autopilot: Bot | null = null;
  private controls!: Controls;
  private meta!: MetaSave;
  private banked = 0;
  private torches: THREE.PointLight[] = [];
  private camTarget = new THREE.Vector3();
  private camShake = 0;
  private hitStop = 0;
  private slowmo = 1;
  private time3 = 0;
  private palette = 0;
  private minimap!: Minimap;
  private bossBar!: BossBar;
  private goldChip!: HudChip;
  private keyChip!: HudChip;
  private bars!: Phaser.GameObjects.Graphics;
  private tip!: Phaser.GameObjects.Text;
  private hintBox!: Phaser.GameObjects.Container;
  private hintText!: Phaser.GameObjects.Text;
  private hintQueue: string[] = [];
  private hintT = 0;
  private seen = new Set<string>();
  private card: Phaser.GameObjects.GameObject[] = [];
  private cardKeys: ((k: string) => void) | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private mouse = { x: 0, z: 0, active: false, down: false, dash: false, t: -9, sx: 0, sy: 0 };
  private hovered: Chest | null = null;
  private swings = 0;
  private lastGold = -1;
  private lastScore = -1;
  private floorStart = 0;
  private killsAtFloor = 0;
  private stepT = 0;
  private walkSnd = 0;
  private boss: Enemy | null = null;
  private dashTrail = 0;
  private swingFlag = false;
  /** Fast-forward (test hook): no 2D effects. */
  private fast = false;
  private shownFrames = 0;
  private lastFlash = -9;
  private attackBtn: { x: number; y: number } | null = null;
  private chargeRing!: Phaser.GameObjects.Graphics;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  createGame(): void {
    this.tune = isEasy() ? 'easy' : 'normal';
    this.phase = 'play';
    this.autopilot = null;
    this.torches = [];
    this.camShake = 0;
    this.hitStop = 0;
    this.slowmo = 1;
    this.time3 = 0;
    this.hintQueue = [];
    this.hintT = 0;
    this.card = [];
    this.cardKeys = null;
    this.keys = {};
    this.mouse = { x: 0, z: 0, active: false, down: false, dash: false, t: -9, sx: 0, sy: 0 };
    this.hovered = null;
    this.swings = 0;
    this.lastGold = -1;
    this.lastScore = -1;
    this.floorStart = 0;
    this.killsAtFloor = 0;
    this.stepT = 0;
    this.walkSnd = 0;
    this.boss = null;
    this.dashTrail = 0;
    this.attackBtn = null;
    this.seen = new Set(storage.get<string[]>(HINTS_KEY, []));
    this.meta = loadMeta();
    this.banked = 0;

    // the run's seed comes from Math.random (the memory check seeds it: restarts build the same world)
    this.sim = new Sim(this.tune, Math.floor(Math.random() * 1e9), this.meta.levels);
    this.palette = paletteOf(1);
    this.world = new World3D(this, { fov: CAM.fov, near: 1, far: 60, background: SKY[this.palette], fog: { color: SKY[this.palette], near: 20, far: 34 } });
    const sun = this.world.addLights({ extent: 9, dir: [-0.35, 1, 0.45], intensity: 1.9, ambient: 1.55, sky: 0xd8d0ff, ground: 0x4a3a40, sun: 0xfff0dd });
    sun.shadow.mapSize.set(1024, 1024);
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff9a40, 6, 7, 1.6);
      l.castShadow = false;
      this.world.scene.add(l);
      this.torches.push(l);
    }
    this.view = new DungeonView(this, this.world.scene, this.palette);
    this.view.build(this.sim.floor, this.palette);
    this.hero = new HeroFigure(this, playerCharacter3d());
    this.world.scene.add(this.hero.root);
    this.fx = new Fx(this.world.scene, this.world.camera);
    this.camTarget.set(this.sim.hero.x, 0, this.sim.hero.z - 2);
    this.placeCamera(0);

    // HUD: score, hearts and the floor badge from the core; gold, key and the minimap in chips
    const { width } = this.scale;
    this.hud.setLives(this.sim.hero.hp, this.sim.hero.maxHp);
    this.hud.setLevel(1);
    this.goldChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'cc-coin', iconSize: 28, text: '0', color: '#ffd23f', minWidth: 96 });
    this.keyChip = hudChip(this, HUD_MARGIN + 150, HUD_ROW2_Y, { icon: 'cc-key', iconSize: 30, text: '×1', minWidth: 80 }).setVisible(false);
    this.minimap = new Minimap(this, width - HUD_MARGIN, HUD_ROW2_Y - 14);
    this.bossBar = new BossBar(this, 40, 236, 440);
    this.bars = this.add.graphics().setDepth(UI_DEPTH - 20);
    this.tip = txt(this, 0, 0, '', { size: 22, color: '#ffffff', strokeThickness: 5 }).setDepth(UI_DEPTH + 5).setVisible(false);
    this.hintText = txt(this, 0, 0, '', { size: 25, color: '#ffffff', strokeThickness: 0, wrap: 600 });
    const hg = this.add.graphics();
    this.hintBox = this.add.container(width / 2, 960, [hg, this.hintText]).setDepth(UI_DEPTH + 20).setAlpha(0);
    this.hintBox.setData('g', hg);

    this.setupInput();
    // the first frame draws an empty world: the heavy first draw (shader programs, buffers)
    // comes one frame later, so the scene is up and answering at once
    this.world.scene.visible = false;
    this.shownFrames = 0;
    if (this.meta.bank > 0 || Object.keys(this.meta.levels).length) this.openCamp();
    else this.beginFloor();
  }

  // ------------------------------------------------------------------ input

  private setupInput(): void {
    const { width, height } = this.scale;
    this.controls = new Controls(this, {
      joystick: true, buttons: ['A', 'B'],
      buttonPos: { A: [width - 118, height - 150], B: [width - 268, height - 92] },
      buttonScale: 1.08,
    });
    // the core buttons say A and B: label them with this game's icons and words instead
    if (this.controls.touchUi) {
      const btns = this.children.list.filter((o) => o instanceof Phaser.GameObjects.Text && (o.text === 'A' || o.text === 'B')) as Phaser.GameObjects.Text[];
      for (const b of btns) {
        const isA = b.text === 'A';
        b.setText('');
        const g = this.add.graphics().setDepth(9502).setScrollFactor(0);
        drawIcon(g, isA ? 'damage' : 'dash', b.x, b.y - 6, isA ? 30 : 26);
        txt(this, b.x, b.y + (isA ? 52 : 46), t(isA ? 'attack' : 'dash'), { size: 20, color: '#ffffff', strokeThickness: 5 }).setDepth(9502).setScrollFactor(0).setAlpha(0.9);
        if (isA) this.attackBtn = { x: b.x, y: b.y };
      }
    }
    this.chargeRing = this.add.graphics().setDepth(9503).setScrollFactor(0);
    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      for (const [n, c] of Object.entries({ k: K.K, j: K.J, one: K.ONE, two: K.TWO, three: K.THREE, four: K.FOUR, five: K.FIVE, enter: K.ENTER, space: K.SPACE, up: K.UP, down: K.DOWN, w: K.W, s: K.S, left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D, e: K.E })) {
        this.keys[n] = kb.addKey(c, false, false);
      }
      kb.on('keydown', (ev: KeyboardEvent) => this.cardKeys?.(ev.code));
    }
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.mouse.active = true;
      this.mouse.t = this.time3;
      this.mouse.sx = p.x; this.mouse.sy = p.y;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (p.wasTouch || this.phase !== 'play' || over.length) return;
      this.mouse.active = true;
      this.mouse.t = this.time3;
      this.mouse.sx = p.x; this.mouse.sy = p.y;
      if (p.rightButtonDown()) { this.mouse.dash = true; return; }
      if (this.hovered && this.sim.tryOpen(this.hovered)) { this.handleEvents(this.sim.events); this.sim.events.length = 0; return; }
      this.mouse.down = true;
    });
    const up = (p: Phaser.Input.Pointer) => { if (!p.wasTouch && !p.leftButtonDown()) this.mouse.down = false; };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  /** The floor point under the mouse. */
  private floorPoint(sx: number, sy: number): THREE.Vector3 | null {
    const { width, height } = this.scale;
    this.raycaster.setFromCamera(new THREE.Vector2(sx / width * 2 - 1, -(sy / height) * 2 + 1), this.world.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, out);
  }

  private just(k: string): boolean {
    const key = this.keys[k];
    return !!key && Phaser.Input.Keyboard.JustDown(key);
  }

  private readInput(): void {
    const inp = this.sim.input, h = this.sim.hero;
    if (this.autopilot) { this.autopilot.update(this.stepDt()); return; }
    inp.mx = this.controls.axisX;
    inp.mz = this.controls.axisY;
    inp.attack = this.controls.a || this.mouse.down || !!this.keys.j?.isDown;
    inp.dash = this.controls.justB() || this.just('k') || this.mouse.dash;
    this.mouse.dash = false;
    inp.aim = false;
    if (this.mouse.active && !this.controls.touchUi && this.time3 - this.mouse.t < 4) {
      const p = this.floorPoint(this.mouse.sx, this.mouse.sy);
      if (p) {
        this.mouse.x = p.x; this.mouse.z = p.z;
        const dx = p.x - h.x, dz = p.z - h.z, d = Math.hypot(dx, dz);
        if (d > 0.2) { inp.ax = dx / d; inp.az = dz / d; inp.aim = true; }
      }
    }
  }

  private stepDt(): number { return this.lastDt; }
  private lastDt = 0;

  // ------------------------------------------------------------------ floors

  /** Starts the current floor: banner, hints, music. */
  private beginFloor(): void {
    this.phase = 'play';
    this.sim.frozen = false;
    this.floorStart = this.sim.time;
    this.killsAtFloor = this.sim.hero.kills;
    const n = this.sim.floorNo;
    this.hud.setLevel(n);
    const boss = this.sim.isBossFloor;
    this.banner(t('floorN', { n }), boss ? t('bossFloor') : t('floorSub'), boss ? '#ff8a6a' : '#ffe9b0');
    this.sfx('portal', { volume: 0.5 });
    this.hint(this.controls.touchUi ? 'move_touch' : 'move_key');
  }

  /** The stairs were taken: the next floor is built. */
  private nextFloor(): void {
    this.closeCard();
    this.sim.nextFloor();
    const pal = paletteOf(this.sim.floorNo);
    if (pal !== this.palette) {
      this.palette = pal;
      this.world.scene.background = new THREE.Color(SKY[pal]);
      (this.world.scene.fog as THREE.Fog).color.setHex(SKY[pal]);
    }
    this.view.build(this.sim.floor, this.palette);
    this.fx.clear();
    this.boss = null;
    this.camTarget.set(this.sim.hero.x, 0, this.sim.hero.z - 2);
    this.hud.setLives(this.sim.hero.hp, this.sim.hero.maxHp);
    this.beginFloor();
  }

  // ------------------------------------------------------------------ the loop

  updateGame(_time: number, delta: number): void {
    let dt = delta / 1000;
    if (++this.shownFrames === 2) this.world.scene.visible = true;
    this.time3 += dt;
    this.lastDt = dt;
    // hit-stop freezes the world for a few frames; slow motion after a guardian falls
    this.slowmo += (1 - this.slowmo) * Math.min(1, dt * 1.5);
    let simDt = dt * this.slowmo;
    if (this.hitStop > 0) { this.hitStop -= dt; simDt = 0; }
    if (this.phase === 'play' || this.phase === 'dead') {
      if (this.phase === 'play') this.readInput();
      if (simDt > 0) {
        // fixed small steps keep the rules the same at any frame rate
        this.stepT += simDt;
        let guard = 0;
        while (this.stepT >= 1 / 120 && guard++ < 8) {
          this.stepT -= 1 / 120;
          this.sim.step(1 / 120);
          if (this.sim.events.length) this.handleEvents(this.sim.events);
          // one press per step burst
          this.sim.input.dash = false;
          if (this.phase !== 'play' && this.phase !== 'dead') break;
        }
        if (guard >= 8) this.stepT = 0;
      }
    } else if (this.autopilot && this.phase === 'shrine') {
      // the autopilot picks too
      const offer = (this.card[0] as Phaser.GameObjects.GameObject).getData?.('offer') as UpgradeId[] | undefined;
      if (offer) this.pickUpgrade(this.autopilot.choose(offer));
    } else if (this.autopilot && this.phase === 'clear') this.nextFloor();
    else if (this.autopilot && this.phase === 'camp') { this.closeCard(); this.beginFloor(); }
    this.render3d(dt, simDt);
    this.updateHud(dt);
  }

  private render3d(dt: number, simDt: number): void {
    const s = this.sim, h = s.hero;
    // hover (mouse): chests, doors, pots, the altar and the stairs
    this.updateHover();
    // the hero
    this.hero.drive(simDt, {
      x: h.x, z: h.z, face: h.face, speed: h.speed, swing: h.swingT > 0, swingStart: this.swingFlag,
      spin: h.spinT, charge: h.charged ? 1 : Math.min(0.99, h.chargeT / s.stats.chargeTime), dash: h.dashT > 0, alive: h.alive,
      hurt: h.hitT, inv: h.inv,
    });
    this.swingFlag = false;
    // dash trail and sword trail
    if (h.dashT > 0 && simDt > 0) {
      for (let k = 0; k < 3; k++) this.fx.mote(h.x - h.dx * k * 0.15 + (Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.6, h.z - h.dz * k * 0.15, -h.dx * 2, 0.2, -h.dz * 2, 0x8ad8ff, 0.5, 0.3, 1.6);
      if (Math.random() < 0.5) this.fx.burst(h.x, 0.05, h.z, 0x8a8aa0, 1, 1, { up: 0.6, size: 0.06, life: 0.4 });
    }
    if ((h.swingT > 0 || h.spinT > 0) && simDt > 0) {
      const p = this.hero.tip.getWorldPosition(new THREE.Vector3());
      this.fx.mote(p.x, p.y, p.z, 0, 0, 0, h.spinT > 0 ? 0x8affe8 : 0xfff2c8, 0.32, 0.18);
    }
    if (h.charged && Math.random() < 0.4) this.fx.glow(h.x, 0.4, h.z, 0x8affe8, 1, 1.2, 0.3, 0.4, 1.4);
    // orbiting blades
    if (s.stats.orbit > 0) {
      for (let k = 0; k < s.stats.orbit; k++) {
        const a = h.orbitAng + k * Math.PI * 2 / s.stats.orbit;
        this.fx.mote(h.x + Math.sin(a) * 1.25, 0.45, h.z + Math.cos(a) * 1.25, 0, 0, 0, 0xb0c4ff, 0.42, 0.12);
        if (Math.random() < 0.5) this.fx.mote(h.x + Math.sin(a) * 1.25, 0.45, h.z + Math.cos(a) * 1.25, 0, 0, 0, 0xffffff, 0.2, 0.08);
      }
    }
    // telegraphs
    const teles: { tele: NonNullable<Enemy['tele']>; p: number; color?: number }[] = [];
    for (const e of s.enemies) {
      if (!e.alive || !e.tele) continue;
      const total = e.state === 'act' ? 1 : this.windupOf(e);
      teles.push({ tele: e.tele, p: e.state === 'act' ? 1 : 1 - Math.max(0, e.t) / total, color: ENEMIES[e.kind].boss ? 0xff4422 : 0xff3a2a });
    }
    this.view.update(simDt, s, this.time3, this.world.camera);
    this.fx.update(dt, teles);
    // torch lights: the two braziers nearest the hero
    const near = [...this.view.flamesAt].sort((a, b) => (a.x - h.x) ** 2 + (a.z - h.z) ** 2 - ((b.x - h.x) ** 2 + (b.z - h.z) ** 2)).slice(0, 2);
    this.torches.forEach((l, i) => {
      const p = near[i];
      if (!p) { l.visible = false; return; }
      l.visible = true;
      l.position.lerp(new THREE.Vector3(p.x, p.y + 0.3, p.z + 0.4), l.position.lengthSq() === 0 ? 1 : 0.2);
      l.intensity = 7 + Math.sin(this.time3 * 13 + i * 2) * 1.2 + Math.sin(this.time3 * 29 + i) * 0.7;
    });
    this.placeCamera(dt);
    this.world.followSun(this.camTarget);
  }

  private windupOf(e: Enemy): number {
    const W = this.sim.tune.windup;
    const base: Record<string, number> = { skeleton: 0.5, zombie: 0.7, spearman: 0.6, ghost: 0.55, orc: e.move === 'swipe' ? 0.55 : 0.75, vampire: 0.65 };
    if (ENEMIES[e.kind].boss) {
      const b: Record<string, number> = { slam: 1.0, sweep: 0.7, bones: 0.75, quake: 1.0, charge: e.count < 2 ? 0.55 : 0.8, nova: 0.85, volley: 0.55 };
      return (b[e.move] ?? 0.8) * W * (e.rage ? 0.8 : 1);
    }
    return (base[e.kind] ?? 0.6) * W;
  }

  private placeCamera(dt: number): void {
    const s = this.sim, h = s.hero;
    const r = s.room >= 0 ? s.floor.rooms[s.room] : null;
    // the whole room width stays in view; the camera follows the hero up and down the room
    let tx = r ? Phaser.Math.Clamp(h.x, r.x0 + 3, r.x1 - 3) : h.x;
    let tz = h.z - 0.6;
    if (r) tz = Phaser.Math.Clamp(tz, r.z0 + 3.0, r.z1 - 3.3);
    if (this.boss && this.boss.alive && this.boss.state === 'spawn') { tx = this.boss.x; tz = this.boss.z + 0.5; }
    const k = dt === 0 ? 1 : 1 - Math.exp(-dt * 5);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    this.camShake = Math.max(0, this.camShake - dt * 1.8);
    const sh = this.camShake * this.camShake;
    const cam = this.world.camera;
    cam.position.copy(this.camTarget).add(CAM_OFF);
    cam.position.x += (Math.random() - 0.5) * sh * 0.8;
    cam.position.y += (Math.random() - 0.5) * sh * 0.5;
    cam.lookAt(this.camTarget.x + (cam.position.x - this.camTarget.x - CAM_OFF.x) * 0.3, 0, this.camTarget.z);
  }

  private kick(amount: number): void {
    this.camShake = Math.min(1, Math.max(this.camShake, amount));
  }

  private screenOf(x: number, y: number, z: number): { x: number; y: number } {
    return this.world.toScreen(new THREE.Vector3(x, y, z));
  }

  // ------------------------------------------------------------------ events

  private handleEvents(evs: SimEvent[]): void {
    const s = this.sim, h = s.hero;
    for (const ev of evs) {
      switch (ev.type) {
        case 'swing':
          this.sfx('swing', { volume: 0.55 });
          this.fx.slash(h.x, h.z, ev.ang, s.stats.range * 1.05, false);
          this.swings++;
          this.swingFlag = true;
          if (this.swings === 8) this.hint('charge');
          break;
        case 'spin':
          this.sfx('spin', { volume: 0.7 });
          this.fx.slash(h.x, h.z, 0, s.stats.range * 1.3, true, 0x8affe8);
          this.kick(0.25);
          break;
        case 'charged':
          this.sfx('charged', { volume: 0.45 });
          this.fx.glow(h.x, 0.5, h.z, 0x8affe8, 10, 2.2, 0.4, 0.4, 1);
          break;
        case 'hit': {
          const e = ev.e;
          const p = this.screenOf(ev.x, this.view.headY(e.kind), ev.z);
          if (!this.fast) popup(this, p.x + (Math.random() - 0.5) * 30, p.y, String(ev.dmg), ev.big ? '#8affe8' : '#ffffff', ev.big ? 30 : 24);
          this.fx.burst(ev.x, 0.5, ev.z, 0xfff2c8, ev.big ? 8 : 5, 3.5, { up: 2, size: 0.07, life: 0.35, glow: true });
          this.sfxAt(ev.big ? 'hitBig' : 'hit', p.x, { volume: ev.kill ? 0.7 : 0.55 });
          this.hitStop = Math.max(this.hitStop, ENEMIES[e.kind].boss ? 0.05 : ev.kill ? 0.075 : ev.big ? 0.06 : 0.04);
          if (ENEMIES[e.kind].boss) this.kick(0.12);
          break;
        }
        case 'kill':
        case 'split': {
          const e = ev.e;
          const col = GORE[e.kind] ?? 0xe0d8c8;
          this.fx.burst(e.x, 0.45, e.z, col, 14, 3.2, { up: 3, size: 0.1, life: 0.8 });
          this.fx.glow(e.x, 0.4, e.z, 0xffffff, 4, 1.4, 0.6, 0.35);
          const p = this.screenOf(e.x, 0.4, e.z);
          this.sfxAt(e.kind.startsWith('slime') ? 'splat' : 'poof', p.x, { volume: 0.6 });
          this.kick(0.12);
          break;
        }
        case 'heroHit':
          this.sfx('hurt', { volume: 0.8 });
          this.kick(0.55);
          this.redFlash(0xff2a2a, 160, 0.3);
          this.hitStop = Math.max(this.hitStop, 0.08);
          this.fx.burst(h.x, 0.6, h.z, 0xff4a4a, 10, 3, { up: 2.5, size: 0.08, life: 0.5 });
          this.hud.setLives(h.hp, h.maxHp);
          if (h.hp > 0) this.hint(this.controls.touchUi ? 'dash_touch' : 'dash_key');
          break;
        case 'block':
          this.sfx('block', { volume: 0.7 });
          this.fx.glow(h.x, 0.6, h.z, 0xc8ced8, 10, 2.5, 0.5, 0.4);
          this.floatText(h.x, 1.4, h.z, t('blocked'), '#c8e0ff');
          break;
        case 'die':
          this.onDeath();
          break;
        case 'dash':
          this.sfx('dash', { volume: 0.5 });
          this.fx.burst(ev.x, 0.05, ev.z, 0x9a9ab0, 6, 1.8, { up: 1, size: 0.07, life: 0.4 });
          break;
        case 'pick': {
          const p = ev.p;
          const sp = this.screenOf(p.x, 0.5, p.z);
          if (p.kind === 'coin') {
            this.sfxAt('coin', sp.x, { volume: 0.4 });
            this.fx.glow(p.x, 0.4, p.z, 0xffd23f, 3, 1.2, 0.3, 0.3);
          } else if (p.kind === 'gem') {
            this.sfx('gem', { volume: 0.7 });
            this.fx.glow(p.x, 0.4, p.z, 0x9ff3ff, 12, 2.5, 0.45, 0.5);
            if (!this.fast) popup(this, sp.x, sp.y - 20, '+' + p.value, '#9ff3ff', 30);
          } else if (p.kind === 'heart') {
            this.sfx('heal', { volume: 0.7 });
            this.fx.glow(h.x, 0.6, h.z, 0xff4a6a, 12, 2, 0.45, 0.6);
            this.floatText(h.x, 1.4, h.z, t('heal'), '#ff8aa0');
            this.hud.setLives(h.hp, h.maxHp);
          } else {
            this.sfx('key', { volume: 0.8 });
            this.fx.glow(h.x, 0.6, h.z, 0xffd23f, 16, 2.5, 0.5, 0.6);
            this.floatText(h.x, 1.4, h.z, t('gotKey'), '#ffd23f');
            this.hint('key');
          }
          break;
        }
        case 'pot': {
          const pot = ev.pot;
          const col = pot.kind === 'barrel' ? 0xb0683a : pot.kind === 'urn' ? 0x9a9ac8 : 0xa8a4c0;
          this.fx.burst(pot.x, 0.3, pot.z, col, 12, 2.6, { up: 2.6, size: 0.09, life: 0.7 });
          const sp = this.screenOf(pot.x, 0.3, pot.z);
          this.sfxAt(pot.kind === 'barrel' ? 'barrel' : 'pot', sp.x, { volume: 0.6 });
          break;
        }
        case 'chest':
          this.sfx('chest', { volume: 0.8 });
          this.sfx('coins', { volume: 0.6 });
          this.fx.glow(ev.c.x, 0.6, ev.c.z, 0xffd23f, 18, 2.6, 0.5, 0.7, 1.5);
          this.kick(0.15);
          break;
        case 'chestAppear':
          this.sfx('appear', { volume: 0.6 });
          this.fx.burst(ev.c.x, 0.1, ev.c.z, 0xc8c0e0, 14, 2.2, { up: 1.6, size: 0.08 });
          this.fx.glow(ev.c.x, 0.4, ev.c.z, 0xffe9a0, 8, 1.5, 0.5, 0.6);
          this.hint('chest');
          break;
        case 'lock':
          this.sfx('slam', { volume: 0.8 });
          this.kick(0.35);
          for (const di of ev.room.doors) {
            const d = s.floor.doors[di];
            this.fx.burst(d.x, 0.1, d.z, 0xb8b0d0, 10, 2.2, { up: 1.4, size: 0.09, life: 0.6 });
          }
          this.hint('lock');
          break;
        case 'clear': {
          this.sfx('open', { volume: 0.7 });
          this.sfx('clearJingle', { volume: 0.55, exact: true });
          const p = this.screenOf(ev.room.cx, 1, ev.room.cz);
          this.floatText(ev.room.cx, 1.5, ev.room.cz, t('cleared'), '#bfffb0', 34);
          void p;
          for (const di of ev.room.doors) {
            const d = s.floor.doors[di];
            if (d.open) this.fx.burst(d.x, 0.1, d.z, 0xb8b0d0, 8, 1.6, { up: 1.2, size: 0.07 });
          }
          if (s.floor.pots.some((pt) => pt.room === ev.room.id && !pt.broken)) this.hint('pot');
          if (ev.room.type === 'exit' || ev.room.type === 'boss') this.hint('stairs');
          break;
        }
        case 'enter':
          if (ev.room.type === 'shrine') this.hint('shrine');
          else if (ev.room.type === 'trap') this.hint('trap');
          else if (ev.room.type === 'vault') this.sfx('appear', { volume: 0.5 });
          break;
        case 'spawn': {
          const e = ev.e;
          if (!ENEMIES[e.kind].boss) {
            this.fx.burst(e.x, 0.05, e.z, 0x6a5a7a, 10, 1.8, { up: 2, size: 0.09, life: 0.6 });
            this.fx.glow(e.x, 0.2, e.z, 0x9a6aff, 4, 1, 0.6, 0.6, 0.8);
          }
          this.sfx('spawn', { volume: 0.25 });
          this.hint(this.controls.touchUi ? 'attack_touch' : 'attack_key');
          break;
        }
        case 'windup':
          if (ENEMIES[ev.e.kind].boss) this.sfx('growl', { volume: 0.5 });
          else if (this.sim.hero.kills > 2) this.hint('tele');
          break;
        case 'attack':
          this.sfxAt('enemySwing', this.screenOf(ev.e.x, 0.5, ev.e.z).x, { volume: 0.35 });
          break;
        case 'shoot':
          this.sfxAt(ev.p.kind === 'orb' ? 'orb' : ev.p.kind === 'wave' ? 'quake' : 'throw', this.screenOf(ev.p.x, 0.5, ev.p.z).x, { volume: 0.35 });
          break;
        case 'parry':
          this.fx.burst(ev.x, 0.5, ev.z, 0xffe9a0, 6, 2.5, { up: 1.5, size: 0.06, life: 0.3, glow: true });
          if (Math.hypot(ev.x - h.x, ev.z - h.z) < 2.5) this.sfx('parry', { volume: 0.5 });
          break;
        case 'wallHit':
          this.sfx('thud', { volume: 0.8 });
          this.kick(0.4);
          this.fx.burst(ev.e.x, 0.4, ev.e.z, 0xb8b0d0, 12, 2.5, { up: 2, size: 0.1 });
          this.floatText(ev.e.x, 1.6, ev.e.z, '✶ ✶', '#ffe08a');
          break;
        case 'slam':
          this.sfx('boom', { volume: 0.8 });
          this.kick(0.6);
          for (let k = 0; k < 18; k++) {
            const a = k / 18 * Math.PI * 2;
            this.fx.burst(ev.x + Math.sin(a) * ev.r * 0.8, 0.05, ev.z + Math.cos(a) * ev.r * 0.8, 0x9a90b0, 1, 1.5, { up: 2.5, size: 0.12, life: 0.7 });
          }
          break;
        case 'blink':
          this.fx.glow(ev.x, 0.6, ev.z, 0xa04aff, 12, 2, 0.5, 0.5);
          this.sfx('blink', { volume: 0.4 });
          break;
        case 'bossIntro':
          this.boss = ev.e;
          this.hint('boss');
          this.sfx('bossHorn', { volume: 0.6 });
          playMusic(this, 'boss');
          this.banner(upper(t(bossKey(ev.e.kind))), t('floorN', { n: s.floorNo }), '#ff8a6a');
          this.kick(0.3);
          this.time.delayedCall(1700, () => { this.kick(0.8); this.sfx('boom', { volume: 0.9 }); });
          break;
        case 'bossDie':
          this.sfx('bigBoom', { volume: 0.9 });
          this.sfx('fanfare', { volume: 0.7, exact: true });
          this.kick(1);
          this.slowmo = 0.2;
          this.redFlash(0xffffff, 300, 0.5);
          this.fx.burst(ev.e.x, 0.8, ev.e.z, 0xffe9a0, 40, 5, { up: 4, size: 0.14, life: 1.2 });
          this.fx.glow(ev.e.x, 0.8, ev.e.z, 0xffd23f, 24, 3, 0.8, 0.9);
          this.banner(t('bossDown'), '', '#ffd23f');
          s.bossesBeaten++;
          playMusic(this, 'stage1');
          break;
        case 'rage':
          this.sfx('growl', { volume: 0.8 });
          this.floatText(ev.e.x, 2.6, ev.e.z, t('rage'), '#ff6a4a', 34);
          this.redFlash(0xff3a1a, 200, 0.25);
          this.kick(0.4);
          break;
        case 'stairs':
          this.onStairs();
          break;
        case 'shrine':
          this.openShrine();
          break;
        case 'unlock':
          this.sfx('unlock', { volume: 0.8 });
          this.fx.glow(ev.door.x, 0.6, ev.door.z, 0xffd23f, 18, 2.5, 0.5, 0.7);
          this.floatText(ev.door.x, 1.4, ev.door.z, t('unlocked'), '#ffd23f');
          this.keyChip.setVisible(h.keys > 0);
          break;
        case 'needKey':
          this.sfx('error', { volume: 0.5 });
          this.floatText(ev.door.x, 1.4, ev.door.z, t('needKey'), '#ffd23f');
          this.hint('vault');
          break;
        case 'spikes':
          if (Math.hypot(ev.s.x - h.x, ev.s.z - h.z) < 3) this.sfx('spikes', { volume: 0.25 });
          break;
        case 'heal':
          this.sfx('heal', { volume: 0.6 });
          this.fx.glow(h.x, 0.6, h.z, 0xd04aff, 10, 2, 0.4, 0.5);
          this.floatText(h.x, 1.4, h.z, t('heal'), '#ff8aa0');
          this.hud.setLives(h.hp, h.maxHp);
          break;
        case 'trapHit':
          this.fx.burst(ev.x, 0.3, ev.z, 0xffe0a0, 8, 3, { up: 2, size: 0.06, glow: true, life: 0.3 });
          break;
      }
    }
  }

  sfx(key: string, config?: Parameters<ArcadeScene['sfx']>[1]): void {
    if (!this.fast) super.sfx(key, config);
  }

  sfxAt(key: string, x: number, config?: Parameters<ArcadeScene['sfxAt']>[2]): void {
    if (!this.fast) super.sfxAt(key, x, config);
  }

  /** A screen flash (at most one at a time). */
  private redFlash(color: number, ms: number, alpha: number): void {
    if (this.fast || this.time3 - this.lastFlash < 0.25) return;
    this.lastFlash = this.time3;
    flash(this, color, ms, alpha);
  }

  /** Text floating up from a point in the world. */
  private floatText(x: number, y: number, z: number, s: string, color: string, size = 28): void {
    if (this.fast) return;
    const p = this.screenOf(x, y, z);
    const tx = txt(this, p.x, p.y, s, { size, color, strokeThickness: 6 }).setDepth(UI_DEPTH - 5);
    tx.setScale(0.4);
    this.tweens.add({ targets: tx, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tx, y: p.y - 60, alpha: 0, delay: 650, duration: 500, onComplete: () => tx.destroy() });
  }

  /** A big title across the middle (floor numbers, guardians). */
  private banner(title: string, sub: string, color: string): void {
    if (this.fast) return;
    const { width } = this.scale;
    const y = 420;
    const a = txt(this, width / 2, y, title, { title: true, size: 64, color, strokeThickness: 10 }).setDepth(UI_DEPTH + 30).setScale(0.3).setAlpha(0);
    const b = sub ? txt(this, width / 2, y + 62, sub, { size: 30, color: '#ffffff', strokeThickness: 6 }).setDepth(UI_DEPTH + 30).setAlpha(0) : null;
    this.tweens.add({ targets: a, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut' });
    if (b) this.tweens.add({ targets: b, alpha: 1, delay: 200, duration: 300 });
    this.tweens.add({ targets: b ? [a, b] : [a], alpha: 0, y: '-=30', delay: 1900, duration: 450, onComplete: () => { a.destroy(); b?.destroy(); } });
  }

  // ------------------------------------------------------------------ hints

  private hint(id: string): void {
    if (this.seen.has(id) || this.hintQueue.includes(id) || this.autopilot) return;
    this.seen.add(id);
    storage.set(HINTS_KEY, [...this.seen]);
    this.hintQueue.push(id);
  }

  private updateHints(dt: number): void {
    this.hintT -= dt;
    if (this.hintT > 0) return;
    if (this.hintBox.alpha > 0 && this.hintT > -0.4) return;
    const id = this.hintQueue.shift();
    if (!id) { if (this.hintBox.alpha > 0 && !this.tweens.isTweening(this.hintBox)) this.tweens.add({ targets: this.hintBox, alpha: 0, duration: 300 }); return; }
    this.hintText.setText(t('hint_' + id));
    const g = this.hintBox.getData('g') as Phaser.GameObjects.Graphics;
    const w = Math.min(660, this.hintText.width + 48), hh = this.hintText.height + 30;
    g.clear();
    glass(g, -w / 2, -hh / 2, w, hh, 22, 0x1a1428, 0.88);
    g.lineStyle(3, 0xffd23f, 0.7).strokeRoundedRect(-w / 2, -hh / 2, w, hh, 22);
    this.hintBox.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.hintBox, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.sfx('hintPing', { volume: 0.35 });
    this.hintT = 4.6;
  }

  // ------------------------------------------------------------------ HUD

  private updateHud(dt: number): void {
    const s = this.sim, h = s.hero;
    if (s.score !== this.lastScore) { this.lastScore = s.score; this.setScore(s.score); }
    if (h.gold !== this.lastGold) {
      if (this.lastGold >= 0 && h.gold > this.lastGold) {
        this.goldChip.setScale(1.12);
        this.tweens.add({ targets: this.goldChip, scale: 1, duration: 160 });
      }
      this.lastGold = h.gold;
      this.goldChip.setText(String(h.gold));
      this.keyChip.setAnchor(this.goldChip.right + 10, HUD_ROW2_Y, 'left');
    }
    if (this.keyChip.visible !== h.keys > 0) this.keyChip.setVisible(h.keys > 0);
    this.minimap.update(s, this.time3);
    // health bars over hurt enemies, the guardian's bar under the HUD
    const g = this.bars;
    g.clear();
    for (const e of s.enemies) {
      if (!e.alive || ENEMIES[e.kind].boss || e.hp >= e.maxHp || e.state === 'spawn') continue;
      const p = this.screenOf(e.x, this.view.headY(e.kind) + 0.25, e.z);
      const w = e.elite ? 64 : 46;
      g.fillStyle(0x000000, 0.6).fillRoundedRect(p.x - w / 2 - 2, p.y - 2, w + 4, 10, 4);
      g.fillStyle(e.elite ? 0xffc23f : 0xff4a4a, 1).fillRoundedRect(p.x - w / 2, p.y, Math.max(3, w * e.hp / e.maxHp), 6, 3);
    }
    const b = this.boss;
    this.bossBar.set(b && (b.alive || b.hitT < 1) ? upper(t(bossKey(b.kind))) : null, b?.hp ?? 0, b?.maxHp ?? 1, !!b?.rage);
    // the charge ring round the touch ATTACK button
    this.chargeRing.clear();
    if (this.attackBtn && (h.chargeT > 0 || h.charged)) {
      const k = h.charged ? 1 : Math.min(1, h.chargeT / s.stats.chargeTime);
      this.chargeRing.lineStyle(8, h.charged ? 0x8affe8 : 0xffffff, 0.9);
      this.chargeRing.beginPath();
      this.chargeRing.arc(this.attackBtn.x, this.attackBtn.y, 86, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      this.chargeRing.strokePath();
    }
    this.updateHints(dt);
  }

  private updateHover(): void {
    const s = this.sim;
    this.hovered = null;
    this.view.hoverAt = null;
    this.tip.setVisible(false);
    if (this.controls.touchUi || !this.mouse.active || this.phase !== 'play') { this.input.setDefaultCursor('default'); return; }
    const p = this.floorPoint(this.mouse.sx, this.mouse.sy);
    if (!p) return;
    let label = '', best = 0.8, at: { x: number; z: number; r: number; color: number } | null = null, click = false;
    for (const c of s.floor.chests) {
      if (c.opened || c.room !== s.room || c.t < 0.5) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < best) { best = d; label = t('chest') + (Math.hypot(c.x - s.hero.x, c.z - s.hero.z) < 1.9 ? ' · ' + t('clickOpen') : ''); at = { x: c.x, z: c.z, r: c.big ? 0.9 : 0.65, color: 0xffd23f }; this.hovered = c; click = true; }
    }
    for (const d of s.floor.doors) {
      if (d.open && !d.keyLocked) continue;
      const dd = Math.hypot(d.x - p.x, d.z - p.z);
      if (dd < best) { best = dd; label = d.keyLocked ? t('lockedDoor') : t('sealedDoor'); at = { x: d.x, z: d.z, r: 0.7, color: d.keyLocked ? 0xffd23f : 0xff6a4a }; this.hovered = null; click = false; }
    }
    for (const pt of s.floor.pots) {
      if (pt.broken || pt.room !== s.room) continue;
      const d = Math.hypot(pt.x - p.x, pt.z - p.z);
      if (d < Math.min(best, 0.5)) { best = d; label = t('pot'); at = { x: pt.x, z: pt.z, r: 0.45, color: 0xffffff }; this.hovered = null; click = false; }
    }
    const r = s.room >= 0 ? s.floor.rooms[s.room] : null;
    if (r && r.type === 'shrine' && !r.used && Math.hypot(r.cx - p.x, r.z0 + 3.6 - p.z) < 1.2) { label = t('altar'); at = { x: r.cx, z: r.z0 + 4.4, r: 0.95, color: 0xffd27a }; }
    if (s.floor.stairs.active && Math.hypot(s.floor.stairs.x - p.x, s.floor.stairs.z - p.z) < 0.8) { label = t('stairs'); at = { x: s.floor.stairs.x, z: s.floor.stairs.z, r: 0.95, color: 0x4ae0ff }; }
    this.view.hoverAt = at;
    this.input.setDefaultCursor(click ? 'pointer' : 'crosshair');
    if (label) this.tip.setText(label).setPosition(this.mouse.sx, this.mouse.sy - 34).setVisible(true);
  }

  // ------------------------------------------------------------------ cards

  private closeCard(): void {
    for (const o of this.card) o.destroy();
    this.card = [];
    this.cardKeys = null;
  }

  /** The shrine: three blessings to choose from. */
  private openShrine(): void {
    const s = this.sim;
    const offer = s.offer();
    if (!offer.length) return;
    this.phase = 'shrine';
    s.frozen = true;
    this.sfx('shrine', { volume: 0.7 });
    this.fx.glow(s.hero.x, 0.8, s.hero.z, 0xffd27a, 10, 2.5, 0.35, 0.8);
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x07050c, 0.55).setOrigin(0).setDepth(UI_DEPTH + 40).setInteractive();
    dim.setData('offer', offer);
    this.card.push(dim);
    const title = txt(this, width / 2, 300, t('shrine'), { title: true, size: 46, color: '#ffd27a', strokeThickness: 8 }).setDepth(UI_DEPTH + 41);
    const sub = txt(this, width / 2, 356, t('choose'), { size: 28, color: '#ffffff' }).setDepth(UI_DEPTH + 41);
    this.card.push(title, sub);
    let sel = 0;
    const frames: Phaser.GameObjects.Graphics[] = [];
    const H = 176, W = 620;
    offer.forEach((u, i) => {
      const y = 420 + i * (H + 22);
      const box = this.add.container(width / 2, y + H / 2).setDepth(UI_DEPTH + 42);
      const g = this.add.graphics();
      glass(g, -W / 2, -H / 2, W, H, 26, 0x1c1630, 0.94);
      const fr = this.add.graphics();
      frames.push(fr);
      const ic = this.add.graphics();
      drawIcon(ic, u, -W / 2 + 84, 0, 48);
      const lvl = s.upgrades[u];
      const name = txt(this, -W / 2 + 160, -34, t(upKey(u)), { size: 34, color: '#ffffff', title: true, strokeThickness: 0 }).setOrigin(0, 0.5);
      const badge = txt(this, W / 2 - 24, -34, lvl ? t('levelN', { n: lvl + 1 }) : 'NEW', { size: 22, color: lvl ? '#ffd27a' : '#8aff9a', strokeThickness: 0 }).setOrigin(1, 0.5);
      if (!lvl) badge.setText(getLang() === 'tr' ? 'YENİ' : 'NEW');
      const desc = txt(this, -W / 2 + 160, 22, t(upKey(u) + '_d'), { size: 25, color: '#d8d0f0', strokeThickness: 0, wrap: W - 190, align: 'left' }).setOrigin(0, 0.5);
      const num = txt(this, -W / 2 + 30, -H / 2 + 26, String(i + 1), { size: 22, color: '#ffffff', strokeThickness: 0 }).setAlpha(0.6);
      box.add([g, fr, ic, name, badge, desc, num]);
      box.setSize(W, H).setInteractive({ useHandCursor: true });
      box.on('pointerover', () => { sel = i; paint(); });
      box.on('pointerup', () => this.pickUpgrade(u));
      box.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: box, scale: 1, alpha: 1, delay: 80 + i * 90, duration: 300, ease: 'Back.easeOut' });
      this.card.push(box);
    });
    const paint = () => frames.forEach((f, i) => {
      f.clear();
      if (i === sel) f.lineStyle(5, UP_COLOR[offer[i]], 1).strokeRoundedRect(-W / 2 - 3, -H / 2 - 3, W + 6, H + 6, 28);
    });
    paint();
    this.cardKeys = (code) => {
      if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') { const i = Number(code.slice(-1)) - 1; if (offer[i]) this.pickUpgrade(offer[i]); return; }
      if (code === 'ArrowUp' || code === 'KeyW') { sel = (sel + offer.length - 1) % offer.length; paint(); this.sfx('move', { volume: 0.4 }); }
      if (code === 'ArrowDown' || code === 'KeyS') { sel = (sel + 1) % offer.length; paint(); this.sfx('move', { volume: 0.4 }); }
      if (code === 'Enter' || code === 'Space') this.pickUpgrade(offer[sel]);
    };
  }

  private pickUpgrade(u: UpgradeId): void {
    if (this.phase !== 'shrine') return;
    this.sim.applyUpgrade(u);
    this.closeCard();
    this.phase = 'play';
    this.sim.frozen = false;
    this.sim.input.attack = false;
    this.sfx('upgrade', { volume: 0.8, exact: true });
    const h = this.sim.hero;
    this.fx.glow(h.x, 0.6, h.z, UP_COLOR[u], 12, 3, 0.4, 0.8, 2);
    this.floatText(h.x, 1.6, h.z, t(upKey(u)), '#ffd27a', 32);
    this.hud.setLives(h.hp, h.maxHp);
    this.hero.cheer();
  }

  /** Floor clear: stats and GO DEEPER. */
  private onStairs(): void {
    const s = this.sim;
    this.phase = 'clear';
    s.frozen = true;
    this.sfx('stairs', { volume: 0.7 });
    this.sfx('fanfare', { volume: 0.6, exact: true });
    this.hero.cheer();
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x07050c, 0.5).setOrigin(0).setDepth(UI_DEPTH + 40).setInteractive();
    const g = this.add.graphics().setDepth(UI_DEPTH + 41);
    glass(g, 70, 330, width - 140, 560, 34, 0x1c1630, 0.95);
    const title = txt(this, width / 2, 400, t('floorClear', { n: s.floorNo }), { title: true, size: 44, color: '#ffe9b0', strokeThickness: 8 }).setDepth(UI_DEPTH + 42);
    const secs = Math.round(s.time - this.floorStart);
    const rows: [string, string][] = [
      [t('statGold'), String(s.hero.gold)],
      [t('statKills'), String(s.hero.kills - this.killsAtFloor)],
      [t('statTime'), `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
      [t('statUpgrades'), String(UPGRADES.reduce((a, u) => a + s.upgrades[u], 0))],
    ];
    const objs: Phaser.GameObjects.GameObject[] = [dim, g, title];
    rows.forEach(([k, v], i) => {
      const y = 480 + i * 58;
      objs.push(txt(this, 130, y, k, { size: 30, color: '#d8d0f0', strokeThickness: 0 }).setOrigin(0, 0.5).setDepth(UI_DEPTH + 42));
      const val = txt(this, width - 130, y, v, { size: 32, color: '#ffffff', strokeThickness: 0, title: true }).setOrigin(1, 0.5).setDepth(UI_DEPTH + 42);
      val.setScale(0);
      this.tweens.add({ targets: val, scale: 1, delay: 250 + i * 140, duration: 260, ease: 'Back.easeOut', onStart: () => this.sfx('tick', { volume: 0.35 }) });
      objs.push(val);
    });
    const btn = new Button(this, width / 2, 800, t('next'), () => this.nextFloor(), { width: 400, height: 96, color: 0x3a8a5a }).setDepth(UI_DEPTH + 43);
    objs.push(btn);
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 250 });
    this.card = objs;
    let armed = false;
    this.time.delayedCall(600, () => { armed = true; });
    this.cardKeys = (code) => { if (armed && (code === 'Enter' || code === 'Space')) this.nextFloor(); };
  }

  /** The camp: lasting upgrades bought with the bank's gold. */
  private openCamp(): void {
    this.phase = 'camp';
    this.sim.frozen = true;
    const { width, height } = this.scale;
    const dim = this.add.rectangle(0, 0, width, height, 0x07050c, 0.6).setOrigin(0).setDepth(UI_DEPTH + 40).setInteractive();
    const g = this.add.graphics().setDepth(UI_DEPTH + 41);
    glass(g, 40, 230, width - 80, 845, 34, 0x1c1630, 0.95);
    const title = txt(this, width / 2, 296, t('camp'), { title: true, size: 52, color: '#ffd27a', strokeThickness: 8 }).setDepth(UI_DEPTH + 42);
    const sub = txt(this, width / 2, 350, t('campSub'), { size: 24, color: '#d8d0f0', strokeThickness: 0, wrap: width - 140 }).setDepth(UI_DEPTH + 42);
    const bank = hudChip(this, width / 2, 410, { align: 'center', icon: 'cc-coin', iconSize: 28, text: String(this.meta.bank), color: '#ffd23f', label: t('bank') }).setDepth(UI_DEPTH + 42);
    const objs: Phaser.GameObjects.GameObject[] = [dim, g, title, sub, bank];
    let sel: number = META.length;   // the start button
    const rowFrames: Phaser.GameObjects.Graphics[] = [];
    const rowY = (i: number) => 480 + i * 104;
    const refresh: (() => void)[] = [];
    const buy = (m: MetaId) => {
      const lv = this.meta.levels[m] ?? 0;
      const cost = META_COST[m][lv];
      if (lv >= META_MAX[m] || cost === undefined || this.meta.bank < cost) { this.sfx('error', { volume: 0.5 }); return; }
      this.meta.bank -= cost;
      this.meta.levels[m] = lv + 1;
      saveMeta(this.meta);
      this.sfx('buy', { volume: 0.8 });
      bank.setText(String(this.meta.bank));
      refresh.forEach((f) => f());
    };
    META.forEach((m, i) => {
      const y = rowY(i);
      const row = this.add.container(width / 2, y).setDepth(UI_DEPTH + 42);
      const bg = this.add.graphics();
      bg.fillStyle(0xffffff, 0.06).fillRoundedRect(-300, -46, 600, 92, 18);
      const fr = this.add.graphics();
      rowFrames.push(fr);
      const ic = this.add.graphics();
      drawIcon(ic, m, -246, 0, 32);
      const name = txt(this, -196, -20, t(metaKey(m)), { size: 28, color: '#ffffff', title: true, strokeThickness: 0 }).setOrigin(0, 0.5);
      const desc = txt(this, -196, 18, t(metaKey(m) + '_d'), { size: 21, color: '#c8c0e0', strokeThickness: 0 }).setOrigin(0, 0.5);
      const pips = this.add.graphics();
      const price = txt(this, 236, 0, '', { size: 26, color: '#ffd23f', strokeThickness: 0, title: true }).setOrigin(0.5);
      row.add([bg, fr, ic, name, desc, pips, price]);
      row.setSize(600, 92).setInteractive({ useHandCursor: true });
      row.on('pointerover', () => { sel = i; paint(); });
      row.on('pointerup', () => buy(m));
      const upd = () => {
        const lv = this.meta.levels[m] ?? 0;
        pips.clear();
        for (let k = 0; k < META_MAX[m]; k++) pips.fillStyle(k < lv ? 0xffd23f : 0x4a4560, 1).fillCircle(130 + k * 20, -20, 7);
        const cost = META_COST[m][lv];
        price.setText(lv >= META_MAX[m] ? t('maxed') : `${cost}`);
        price.setColor(lv >= META_MAX[m] ? '#8aff9a' : this.meta.bank >= (cost ?? 1e9) ? '#ffd23f' : '#8a7a6a');
      };
      upd();
      refresh.push(upd);
      objs.push(row);
    });
    const start = () => {
      this.closeCard();
      this.sfx('select', { volume: 0.6 });
      this.sim.applyMeta(this.meta.levels);
      this.hud.setLives(this.sim.hero.hp, this.sim.hero.maxHp);
      this.beginFloor();
    };
    const btn = new Button(this, width / 2, 1000, t('enter'), start, { width: 460, height: 96, color: 0xb0482a }).setDepth(UI_DEPTH + 43);
    objs.push(btn);
    const paint = () => {
      rowFrames.forEach((f, i) => { f.clear(); if (i === sel) f.lineStyle(4, 0xffd23f, 1).strokeRoundedRect(-302, -48, 604, 96, 20); });
      btn.setScale(sel === META.length ? 1.05 : 1);
    };
    paint();
    this.card = objs;
    this.cardKeys = (code) => {
      if (code === 'ArrowUp' || code === 'KeyW') { sel = (sel + META.length) % (META.length + 1); paint(); this.sfx('move', { volume: 0.4 }); }
      else if (code === 'ArrowDown' || code === 'KeyS') { sel = (sel + 1) % (META.length + 1); paint(); this.sfx('move', { volume: 0.4 }); }
      else if (code === 'Enter' || code === 'Space') { if (sel === META.length) start(); else buy(META[sel]); }
    };
  }

  // ------------------------------------------------------------------ death and continue

  private onDeath(): void {
    this.phase = 'dead';
    this.sfx('lose', { volume: 0.8 });
    this.kick(0.8);
    this.slowmo = 0.3;
    this.hud.setLives(0, this.sim.hero.maxHp);
    // the gold of this run goes to the bank (only the part not banked before a continue)
    const add = this.sim.goldRun - this.banked;
    if (add > 0) {
      this.meta.bank += add;
      this.meta.runs++;
      this.banked = this.sim.goldRun;
      saveMeta(this.meta);
    }
    this.endGame({ delay: 1700, title: t('deathTitle') });
  }

  /** Rewarded continue: half the hearts back, enemies pushed away, a moment of safety. */
  revive(): void {
    this.closeCard();
    this.sim.revive();
    this.phase = 'play';
    this.slowmo = 1;
    this.hitStop = 0;
    const h = this.sim.hero;
    this.hud.setLives(h.hp, h.maxHp);
    this.fx.glow(h.x, 0.6, h.z, 0x8aff9a, 24, 3, 0.6, 0.8, 2);
    this.hero.cheer();
  }

  // ------------------------------------------------------------------ test hooks

  /** Draw calls of the last frame (shadow pass included). */
  drawCalls(): number {
    return this.world.renderer.info.render.calls;
  }

  /** Test hook: the autopilot plays (screenshots, soak tests). */
  auto(on = true): void {
    this.autopilot = on ? new Bot(this.sim, SKILL.good) : null;
  }

  /**
   * Test hook: runs the rules for `sec` seconds of game time without drawing (the autopilot
   * plays, or the hero stands still), handling every event as in play. Stops early when
   * `until` returns true.
   */
  ff(sec: number, until?: (p: PlayScene) => boolean): number {
    let t = 0;
    this.fast = true;
    while (t < sec) {
      if (this.phase === 'shrine' && this.autopilot) {
        const offer = (this.card[0] as Phaser.GameObjects.GameObject).getData?.('offer') as UpgradeId[] | undefined;
        if (offer) this.pickUpgrade(this.autopilot.choose(offer));
      } else if (this.phase === 'clear' && this.autopilot) this.nextFloor();
      else if (this.phase === 'camp') { this.closeCard(); this.beginFloor(); }
      if (this.phase !== 'play') break;
      this.lastDt = 1 / 120;
      this.readInput();
      this.sim.step(1 / 120);
      if (this.sim.events.length) this.handleEvents(this.sim.events);
      this.sim.input.dash = false;
      t += 1 / 120;
      if (until?.(this)) break;
    }
    this.fast = false;
    this.hitStop = 0;
    this.slowmo = 1;
    this.camTarget.set(this.sim.hero.x, 0, this.sim.hero.z);
    this.placeCamera(0);
    return t;
  }

  /** Jumps to floor n (screenshots and tests). */
  jumpFloor(n: number): void {
    this.sim.floorNo = n - 1;
    this.sim.cleared = Math.max(0, n - 2);
    this.nextFloor();
  }
}
