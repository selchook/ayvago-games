// Crystal Keep: a 3D tower defense on the Kenney Tower Defense Kit. The Play scene runs a map
// select, then one map at a time (rules in sim.ts), drawn by three.js under a Phaser HUD.
import Phaser from 'phaser';
import {
  ArcadeScene, txt, t, popup, storage, isEasy, playMusic, hudChip, HudChip,
  HUD_MARGIN, HUD_ROW2_Y, Button, pushModal, upper,
} from '@core';
import { World3D, THREE } from '@core/three';
import { Sim, MAPS, TOWERS, ENEMIES, TOWER_KINDS, METEOR, type Tower, type TowerKind, type SimEvent, type EnemyKind, type Enemy } from './sim';
import { Board, Markers, buildTower, animateTower, weaponY, GRASS_Y, PATH_Y, PALETTE_LOOK, type TowerView } from './board';
import { EnemyView, FLY_Y } from './enemies';
import { Fx } from './fx3d';
import { kitMat } from './kit';
import { Thumbs, mapThumb, enemyThumb } from './thumbs';
import { BuildDock, TowerCard, WaveButton, glass, drawStar, UI_DEPTH, type ArmKind } from './ui';
import { Bot } from './bot';

type Phase = 'select' | 'play' | 'clear';

const PROGRESS_KEY = 'crystal-keep:progress';
interface Progress { stars: number[] }

/** Hints shown once per session. */
const seenHints = new Set<string>();

const FOV = 34;
const TILT = THREE.MathUtils.degToRad(52);
const BAR_Y = 1214;
const PANEL_Y = 1030;
const DOCK_Y = 1082;
/** A press that moves less than this (game pixels) is a tap; more is a drag that pans the map. */
const TAP_SLOP_TOUCH = 18;
const TAP_SLOP_MOUSE = 8;

interface TowerVis extends TowerView { id: number; buildT: number; tier: number; kind: TowerKind }

export class PlayScene extends ArcadeScene {
  world!: World3D;
  sim: Sim | null = null;
  phase: Phase = 'select';
  mapIx = 0;
  tune = isEasy() ? 'easy' : 'normal';
  speed = 1;
  /** Score of the maps already cleared in this run. */
  runBase = 0;
  mapsCleared = 0;

  private board: Board | null = null;
  private enemiesV!: EnemyView;
  private fx!: Fx;
  private markers!: Markers;
  private towersV = new Map<number, TowerVis>();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private time3 = 0;
  private frameN = 0;

  // camera
  private cam = { x: 0, z: 0, zoom: 1, tx: 0, tz: 0, tzoom: 1, D0: 20, yaw: 0 };
  private shakeT = 0;
  private shakeAmp = 0;
  private drag: { x: number; y: number; moved: boolean; ui: boolean; right: boolean } | null = null;
  private pinch: { d: number; zoom: number } | null = null;

  // selection and building
  /** The selected build tile (tile first, or a touch preview waiting for its confirming tap). */
  private sel: { c: number; r: number } | null = null;
  private selTower: Tower | null = null;
  /** The dock card that is picked: a tower to place or the meteor to aim. */
  private armed: ArmKind | null = null;
  /** Picked with nothing selected: stays armed after a build, for placing several in a row. */
  private stayArmed = false;
  /** Touch / keyboard aim of the meteor (the mouse aims by hovering). */
  private aim: { x: number; z: number } | null = null;
  private sellArmed = false;
  private cursor = { c: 0, r: 0 };
  private cursorOn = false;
  /** The last pointer was a mouse (it can hover); taps on touch screens never hover. */
  private mouse = false;
  /** Mouse hover: the tile and the ground point under the cursor (null over the UI). */
  private hover: { c: number; r: number } | null = null;
  private hoverPt: { x: number; z: number } | null = null;
  private overUi = false;
  /** Held while something is selected, so Esc closes it instead of pausing. */
  private modalRelease: (() => void) | null = null;

  // UI
  private goldChip!: HudChip;
  private speedChip!: HudChip;
  private bossChip!: HudChip;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private dock!: BuildDock;
  private vignette!: Phaser.GameObjects.Graphics;
  private bossCam: { t: number; back: { tx: number; tz: number; tzoom: number } } | null = null;
  private towerCard!: TowerCard;
  private waveBtn!: WaveButton;
  private hint!: Phaser.GameObjects.Text;
  private hintQueue: string[] = [];
  private hintT = 0;
  private selectUi: Phaser.GameObjects.GameObject[] = [];
  private clearUi: Phaser.GameObjects.GameObject[] = [];
  private focus = 0;
  private lastGold = -1;
  private meteorWasReady = false;
  private bossOn = false;
  private lowWarned = false;
  private seenKinds = new Set<EnemyKind>();

  // test hooks
  private bot: Bot | null = null;
  /** UI icons rendered from the 3D models, made a few frames after the scene starts. */
  private thumbs!: Thumbs;

  createGame(): void {
    this.tune = isEasy() ? 'easy' : 'normal';
    this.sim = null;
    this.board = null;
    this.phase = 'select';
    this.speed = 1;
    this.runBase = 0;
    this.mapsCleared = 0;
    this.towersV = new Map();
    this.sel = null;
    this.selTower = null;
    this.armed = null;
    this.stayArmed = false;
    this.aim = null;
    this.sellArmed = false;
    this.cursorOn = false;
    this.mouse = !this.sys.game.device.input.touch;
    this.hover = null;
    this.hoverPt = null;
    this.overUi = false;
    this.modalRelease = null;
    this.bossCam = null;
    this.drag = null;
    this.pinch = null;
    this.hintQueue = [];
    this.hintT = 0;
    this.selectUi = [];
    this.clearUi = [];
    this.lastGold = -1;
    this.meteorWasReady = false;
    this.bossOn = false;
    this.lowWarned = false;
    this.seenKinds = new Set();
    this.bot = null;
    this.shakeT = 0;
    this.time3 = 0;
    this.frameN = 0;
    this.bannerBox = null;

    // the 3D world
    this.world = new World3D(this, { fov: FOV, near: 0.5, far: 140, background: PALETTE_LOOK.green.sky });
    this.sun = this.world.addLights({ extent: 13, dir: [-0.45, 1, 0.5], intensity: 2.3, ambient: 1.5 });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.hemi = this.world.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    this.thumbs = new Thumbs(this, this.world.renderer);
    this.enemiesV = new EnemyView(this, this.world.scene);
    this.enemiesV.onCrash = (x, z, big) => {
      this.fx.boom(x, z, big ? 1.6 : 0.6, big);
      this.sfxAt(big ? 'bigBoom' : 'crash', this.screen(x, 0, z).x, { volume: big ? 0.9 : 0.5 });
      if (big) this.shake3(0.3, 0.5);
    };
    this.fx = new Fx(this, this.world.scene);
    this.markers = new Markers(this, this.world.scene, kitMat(this));

    // HUD: score / wave / lives come from the core HUD; gold, speed and the boss bar are chips
    const { width } = this.scale;
    this.goldChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { icon: 'ck-coin', iconSize: 30, text: '0', color: '#ffd23f', minWidth: 110 });
    this.bossBar = this.add.graphics();
    this.bossBar.setData('chipWidth', 150);
    this.bossChip = hudChip(this, width / 2 + 40, HUD_ROW2_Y, { align: 'center', text: '', size: 20, color: '#ff9a7a', items: [this.bossBar] }).setVisible(false);
    // the speed readout: a drawn fast-forward icon (no emoji-prone glyphs) and 1× / 2×
    const ff = this.add.graphics();
    ff.fillStyle(0xffffff, 0.9).fillTriangle(-16, -11, -16, 11, 0, 0).fillTriangle(0, -11, 0, 11, 16, 0);
    ff.setData('chipWidth', 32);
    this.speedChip = hudChip(this, width - HUD_MARGIN, BAR_Y, { align: 'right', text: '1×', size: 34, height: 92, minWidth: 136, items: [ff] }).setDepth(UI_DEPTH);
    const speedHit = this.add.zone(width - HUD_MARGIN - 70, BAR_Y, 150, 100).setScrollFactor(0).setDepth(UI_DEPTH + 1).setInteractive({ useHandCursor: true });
    speedHit.on('pointerup', () => this.toggleSpeed());
    this.bars = this.add.graphics().setDepth(40).setScrollFactor(0);
    this.hint = txt(this, width / 2, 232, '', { size: 25, color: '#ffffff', strokeThickness: 6, wrap: 640 }).setDepth(9400).setScrollFactor(0).setAlpha(0);

    this.waveBtn = new WaveButton(this, (HUD_MARGIN + (width - HUD_MARGIN - 136 - 14)) / 2, BAR_Y, width - 2 * HUD_MARGIN - 136 - 14, 92, () => this.callWave());
    this.dock = new BuildDock(this, width / 2, DOCK_Y, (k) => { this.pickKind(k); this.syncModal(); });
    this.towerCard = new TowerCard(this, width / 2, PANEL_Y, () => this.upgradeSelected(), () => this.sellSelected(), () => { this.deselect(); this.syncModal(); }, () => this.cycleMode());
    this.vignette = this.redEdges();

    this.setupInput();
    this.showSelect();
  }

  // ------------------------------------------------------------------ map select

  private progress(): Progress {
    const p = storage.get<Progress>(PROGRESS_KEY, { stars: [] });
    return { stars: MAPS.map((_, i) => p.stars?.[i] ?? 0) };
  }

  private unlocked(i: number): boolean {
    return i === 0 || this.progress().stars[i - 1] > 0;
  }

  private showSelect(): void {
    this.phase = 'select';
    playMusic(this, 'select');
    this.setPlayUi(false);
    for (const o of this.selectUi) o.destroy();
    this.selectUi = [];
    const add = <O extends Phaser.GameObjects.GameObject>(o: O): O => { this.selectUi.push(o); return o; };
    const { width } = this.scale;
    const prog = this.progress();
    this.focus = Math.max(0, Math.min(this.focus, MAPS.length - 1));
    if (!this.unlocked(this.focus)) this.focus = 0;
    add(txt(this, width / 2, 196, t('chooseMap'), { title: true, size: 46, color: '#ffffff', strokeThickness: 8 }).setScrollFactor(0).setDepth(UI_DEPTH));
    const cw = 214, ch = 316, y = 900;
    MAPS.forEach((def, i) => {
      const x = width / 2 + (i - 1) * (cw + 12);
      const box = this.add.container(x, y).setScrollFactor(0).setDepth(UI_DEPTH);
      const open = this.unlocked(i);
      const bg = this.add.graphics();
      const img = this.add.image(0, -66, this.textures.exists(mapThumb(i)) ? mapThumb(i) : '__WHITE').setDisplaySize(186, 186).setAlpha(open ? 1 : 0.35);
      if (!this.textures.exists(mapThumb(i))) img.setTint(0x22304f);
      img.setData('thumb', mapThumb(i));
      box.setData('img', img);
      const name = txt(this, 0, 50, t('m_' + def.id), { title: true, size: 24, strokeThickness: 0, wrap: cw - 16 });
      const waves = txt(this, 0, 84, t('wavesN', { n: def.waves.length }), { size: 20, color: '#cfd8f0', strokeThickness: 0 });
      const stars = this.add.graphics();
      for (let k = 0; k < 3; k++) drawStar(stars, (k - 1) * 40, 124, 15, prog.stars[i] > k);
      box.add([bg, img, name, waves, stars]);
      if (!open) {
        const lock = txt(this, 0, -66, t('locked'), { size: 20, color: '#ffd23f', strokeThickness: 5, wrap: cw - 30 });
        box.add(lock);
      }
      box.setData('bg', bg).setData('open', open);
      box.setSize(cw, ch).setInteractive({ useHandCursor: open });
      box.on('pointerup', () => {
        if (!open) { this.sfx('error', { volume: 0.5 }); return; }
        if (this.focus === i) this.startMap(i);
        else { this.focus = i; this.sfx('move', { volume: 0.5 }); this.drawSelect(); this.previewMap(i); }
      });
      add(box);
    });
    add(new Button(this, width / 2, 1166, t('playMap'), () => this.startMap(this.focus), { width: 340, height: 96, color: 0x2f9e56 }).setScrollFactor(0).setDepth(UI_DEPTH));
    const touch = this.sys.game.device.input.touch;
    add(txt(this, width / 2, 1252, touch ? t('selectTouch') : t('selectKeys'), { size: 22, color: '#e6ecff', strokeThickness: 4 }).setScrollFactor(0).setDepth(UI_DEPTH));
    this.drawSelect();
    this.previewMap(this.focus);
  }

  private drawSelect(): void {
    const cw = 214, ch = 316;
    for (const o of this.selectUi) {
      const bg = o.getData?.('bg') as Phaser.GameObjects.Graphics | undefined;
      if (!bg) continue;
      const i = this.selectUi.filter((q) => q.getData?.('bg')).indexOf(o);
      const on = i === this.focus;
      const open = o.getData('open') as boolean;
      bg.clear();
      bg.fillStyle(0x000000, 0.3).fillRoundedRect(-cw / 2, -ch / 2 + 8, cw, ch, 24);
      bg.fillStyle(on ? 0x1f5a3a : 0x14203a, open ? 0.94 : 0.8).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 24);
      bg.lineStyle(on ? 5 : 2, on ? 0x9dffb8 : 0xffffff, on ? 1 : 0.16).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 24);
      (o as Phaser.GameObjects.Container).setScale(on ? 1.04 : 1);
    }
  }

  /** Shows a map in 3D behind the select cards. */
  private previewMap(i: number): void {
    this.loadBoard(i);
    const m = this.board!.map;
    this.cam.D0 = this.fitDistance(m.W + 1.2);
    this.cam.zoom = this.cam.tzoom = 0.82;
    this.cam.x = this.cam.tx = 0;
    this.cam.z = this.cam.tz = 1.5;
  }

  private loadBoard(i: number): void {
    if (this.board && this.board.map.def === MAPS[i] && this.phase === 'select') return;
    this.clearTowers();
    this.board?.dispose();
    this.sim = new Sim(i, this.tune as 'easy' | 'normal');
    this.board = new Board(this, this.world.scene, this.sim.map);
    const look = PALETTE_LOOK[this.board.palette];
    (this.world.scene.background as THREE.Color).setHex(look.sky);
    this.world.scene.fog = new THREE.Fog(look.fog, 34, 80);
    this.hemi.color.setHex(look.hemi);
    this.sun.color.setHex(look.sun);
  }

  private startMap(i: number): void {
    if (!this.unlocked(i)) return;
    this.thumbs.flush();
    this.dock.syncIcons();
    for (const o of this.selectUi) o.destroy();
    this.selectUi = [];
    for (const o of this.clearUi) o.destroy();
    this.clearUi = [];
    this.mapIx = i;
    this.phase = 'select'; // loadBoard reuses the previewed board
    this.loadBoard(i);
    this.sim = new Sim(i, this.tune as 'easy' | 'normal');
    this.phase = 'play';
    this.speed = 1;
    this.speedChip.setText('1×');
    this.bossOn = false;
    this.lowWarned = false;
    this.deselect();
    const m = this.sim.map;
    this.cam.D0 = this.fitDistance(m.W + 0.7);
    this.cam.yaw = 0;
    // the camera sweeps from the spawn down to the field
    const s = m.spawns[0];
    this.cam.x = this.cam.tx = 0;
    this.cam.z = this.board!.Z(s.r) + 2;
    this.cam.zoom = 1.25;
    this.cam.tzoom = 1;
    // the field settles with the keep clear of the build dock
    this.cam.tz = Math.max(0.9, this.board!.Z(m.keep.r) - 4.3);
    this.cursor = { c: Math.floor(m.W / 2), r: Math.floor(m.H / 2) };
    this.setPlayUi(true);
    playMusic(this, 'stage1');
    this.sfx('portal', { volume: 0.6 });
    const title = txt(this, this.scale.width / 2, 420, t('m_' + m.def.id), { title: true, size: 54, color: '#ffffff', strokeThickness: 10 }).setScrollFactor(0).setDepth(9500).setScale(0.3);
    this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: title, alpha: 0, y: 380, delay: 1600, duration: 500, onComplete: () => title.destroy() });
    const touch = this.sys.game.device.input.touch;
    this.time.delayedCall(900, () => {
      this.showHint(touch ? 'h_build_touch' : 'h_build_mouse');
      this.queueHint(touch ? 'h_pan' : 'h_build_keys');
      this.queueHint('h_start');
    });
  }

  private setPlayUi(on: boolean): void {
    if (on) this.dock.open();
    else this.dock.close();
    this.waveBtn.setVisible(on);
    this.speedChip.setVisible(on);
    this.goldChip.setVisible(on);
    this.hud.setVisible(true);
    this.hud.setCenter(on && this.sim ? t('waveOf', { n: 0, m: this.sim.totalWaves }) : '');
    if (!on) {
      this.towerCard.close();
      this.bossChip.setVisible(false);
      this.hideMarkers();
    }
    this.bars.clear();
  }

  // ------------------------------------------------------------------ camera

  private fitDistance(width: number): number {
    const v = THREE.MathUtils.degToRad(FOV / 2);
    const h = Math.atan(Math.tan(v) * (this.scale.width / this.scale.height));
    return width / 2 / Math.tan(h);
  }

  private clampCam(): void {
    if (!this.board) return;
    const { W, H } = this.board.map;
    const D = this.cam.D0 / this.cam.tzoom;
    const v = THREE.MathUtils.degToRad(FOV / 2);
    const hw = D * Math.tan(v) * (this.scale.width / this.scale.height);
    const hd = (D * Math.tan(v)) / Math.sin(TILT);
    const mx = Math.max(0, W / 2 - hw + 0.4);
    this.cam.tx = Phaser.Math.Clamp(this.cam.tx, -mx, mx);
    const zMin = -H / 2 + hd * 0.62 - 0.6, zMax = H / 2 - hd * 0.62 + 2.2;
    this.cam.tz = zMin > zMax ? (zMin + zMax) / 2 : Phaser.Math.Clamp(this.cam.tz, zMin, zMax);
  }

  private updateCamera(dt: number): void {
    const c = this.cam;
    if (this.bossCam) {
      this.bossCam.t -= dt;
      if (this.bossCam.t <= 0) { Object.assign(c, { tx: this.bossCam.back.tx, tz: this.bossCam.back.tz, tzoom: this.bossCam.back.tzoom }); this.bossCam = null; }
    }
    if (this.phase === 'select') c.yaw += dt * 0.12;
    else c.yaw += (0 - c.yaw) * Math.min(1, dt * 3);
    if (this.phase === 'play' && !this.isOver) this.clampCam();
    const k = Math.min(1, dt * 7);
    c.x += (c.tx - c.x) * k;
    c.z += (c.tz - c.z) * Math.min(1, dt * (this.phase === 'play' && this.sim?.wave === 0 && this.elapsed < 3 ? 2.2 : 7));
    c.zoom += (c.tzoom - c.zoom) * Math.min(1, dt * 4);
    const D = c.D0 / c.zoom;
    const cam = this.world.camera;
    const sx = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    const sy = this.shakeT > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    this.shakeT = Math.max(0, this.shakeT - dt);
    const tilt = this.phase === 'select' ? THREE.MathUtils.degToRad(48) : TILT;
    cam.position.set(c.x + Math.sin(c.yaw) * Math.cos(tilt) * D + sx, Math.sin(tilt) * D + sy, c.z + Math.cos(c.yaw) * Math.cos(tilt) * D);
    cam.lookAt(c.x + sx * 0.5, 0, c.z);
    this.world.followSun(new THREE.Vector3(c.x, 0, c.z));
  }

  private shake3(amp: number, t: number): void {
    this.shakeAmp = Math.max(this.shakeT > 0 ? this.shakeAmp : 0, amp);
    this.shakeT = Math.max(this.shakeT, t);
  }

  /** Game pixels of a world point. */
  private screen(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.world.toScreen(new THREE.Vector3(x, y, z));
    return { x: p.x, y: p.y };
  }

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GRASS_Y);

  /** The point on the field under a screen point (game pixels). */
  private groundAt(px: number, py: number): { x: number; z: number } | null {
    if (!this.board) return null;
    const ndc = new THREE.Vector2((px / this.scale.width) * 2 - 1, -(py / this.scale.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.world.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  private cellAt(px: number, py: number): { c: number; r: number } | null {
    const hit = this.groundAt(px, py);
    if (!hit || !this.board) return null;
    const { W, H } = this.board.map;
    const c = Math.round(hit.x + (W - 1) / 2), r = Math.round(hit.z + (H - 1) / 2);
    if (c < 0 || r < 0 || c >= W || r >= H) return null;
    return { c, r };
  }

  // ------------------------------------------------------------------ input

  /**
   * One pointer flow for mouse and touch. A press that stays within the tap slop is a tap on the
   * map when it is released; one that moves further pans the map and never builds. The mouse also
   * hovers: an armed card's ghost follows it and a click builds at once. Touch has no hover, so a
   * tap shows the ghost and a second tap on the same tile (or on the card) confirms.
   */
  private setupInput(): void {
    this.input.addPointer(1);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      this.mouse = !p.wasTouch;
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        this.pinch = { d: Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y), zoom: this.cam.tzoom };
        if (this.drag) this.drag.moved = true;
        return;
      }
      this.drag = { x: p.x, y: p.y, moved: false, ui: over.length > 0, right: p.rightButtonDown() };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.phase !== 'play' || !this.board) return;
      if (!p.wasTouch) {
        this.mouse = true;
        this.overUi = over.length > 0;
        this.updateHover(p.x, p.y);
      }
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (this.pinch && p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.cam.tzoom = Phaser.Math.Clamp(this.pinch.zoom * (d / Math.max(20, this.pinch.d)), 0.9, 2.4);
        return;
      }
      const dr = this.drag;
      if (!dr || dr.ui || !p.isDown) return;
      const slop = p.wasTouch ? TAP_SLOP_TOUCH : TAP_SLOP_MOUSE;
      if (!dr.moved && Phaser.Math.Distance.Between(dr.x, dr.y, p.x, p.y) < slop) return;
      if (!dr.moved) this.seenHint('h_pan');
      dr.moved = true;
      const D = this.cam.D0 / this.cam.zoom;
      const upp = (2 * D * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.scale.height;
      this.cam.tx -= (p.x - p.prevPosition.x) * upp;
      this.cam.tz -= ((p.y - p.prevPosition.y) * upp) / Math.sin(TILT);
      this.cam.x = this.cam.tx;
      this.cam.z = this.cam.tz;
      this.bossCam = null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const dr = this.drag;
      if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null;
      this.drag = null;
      if (!dr || dr.moved || dr.ui || over.length || this.phase !== 'play' || this.isOver) return;
      // the right button (or a right click without a drag) cancels whatever is picked
      if (dr.right || p.button === 2) this.deselect();
      else {
        this.mouse = !p.wasTouch;
        this.tapMap(p.x, p.y);
      }
      this.syncModal();
    });
    this.input.on('gameout', () => { this.hover = null; this.hoverPt = null; });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.phase !== 'play') return;
      this.cam.tzoom = Phaser.Math.Clamp(this.cam.tzoom * (dy > 0 ? 0.9 : 1.1), 0.9, 2.4);
    });
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => { this.onKey(ev); this.syncModal(); });
  }

  private updateHover(px: number, py: number): void {
    if (this.overUi || this.isOver) { this.hover = null; this.hoverPt = null; return; }
    this.hover = this.cellAt(px, py);
    this.hoverPt = this.groundAt(px, py);
  }

  /** A tap or click on the map (not a drag, not on the UI). */
  private tapMap(px: number, py: number): void {
    if (this.armed === 'meteor') {
      const pt = this.groundAt(px, py);
      if (!pt) return;
      if (this.mouse) { this.castMeteor(pt.x, pt.z); return; }
      // touch: the first tap aims, a second tap near the same spot drops it
      if (this.aim) {
        const s = this.screen(this.aim.x, GRASS_Y, this.aim.z);
        if (Phaser.Math.Distance.Between(s.x, s.y, px, py) < 70) { this.castMeteor(this.aim.x, this.aim.z); return; }
      }
      this.aim = pt;
      this.sfx('move', { volume: 0.4 });
      return;
    }
    const cell = this.cellAt(px, py);
    this.cursorOn = false;
    if (!cell) { this.deselect(); return; }
    this.tapCell(cell.c, cell.r, this.mouse);
  }

  /** A tile was tapped, clicked (`direct`: a mouse click builds at once) or chosen with Enter. */
  private tapCell(c: number, r: number, direct = false): void {
    const sim = this.sim!;
    const tw = sim.towerAt(c, r);
    if (tw) { this.selectTower(tw); return; }
    if (this.armed && this.armed !== 'meteor') {
      if (!sim.canBuild(c, r)) { this.denied(c, r); return; }
      if (direct || (this.sel && this.sel.c === c && this.sel.r === r)) { this.tryBuild(c, r); return; }
      // touch: this tap shows the ghost here, the next one on the same tile builds
      this.sel = { c, r };
      this.cursor = { c, r };
      this.sfx('move', { volume: 0.45 });
      this.showHint('h_build_touch2');
      return;
    }
    if (sim.canBuild(c, r)) {
      if (this.sel && this.sel.c === c && this.sel.r === r && !this.selTower) { this.deselect(); return; }
      this.selectBuild(c, r);
      return;
    }
    this.deselect();
    this.denied(c, r);
  }

  private onKey(ev: KeyboardEvent): void {
    if (this.isOver) return;
    const code = ev.code;
    if (this.phase === 'select') {
      const step = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : 0;
      if (step) {
        let f = this.focus;
        for (let k = 0; k < MAPS.length; k++) { f = (f + step + MAPS.length) % MAPS.length; if (this.unlocked(f)) break; }
        if (f !== this.focus) { this.focus = f; this.sfx('move', { volume: 0.5 }); this.drawSelect(); this.previewMap(f); }
      } else if (code === 'Enter' || code === 'Space') this.startMap(this.focus);
      return;
    }
    if (this.phase === 'clear') {
      if (code === 'Enter' || code === 'Space') (this.clearUi.find((o) => o.getData?.('primary')) as Button | undefined)?.press();
      return;
    }
    if (!this.sim) return;
    const m = this.sim.map;
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[code]) {
      if (this.cursorOn) {
        this.cursor.c = Phaser.Math.Clamp(this.cursor.c + move[code][0], 0, m.W - 1);
        this.cursor.r = Phaser.Math.Clamp(this.cursor.r + move[code][1], 0, m.H - 1);
      }
      this.cursorOn = true;
      this.mouse = false;
      if (this.selTower) { this.selTower = null; this.sellArmed = false; this.towerCard.close(); this.dock.open(); }
      // an armed card's ghost (or the meteor's aim) rides on the cursor
      this.sel = this.armed && this.armed !== 'meteor' ? { ...this.cursor } : null;
      if (this.armed === 'meteor' && this.board) this.aim = { x: this.board.X(this.cursor.c), z: this.board.Z(this.cursor.r) };
      this.focusCell(this.cursor.c, this.cursor.r);
      ev.preventDefault?.();
      return;
    }
    const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(code);
    if (num >= 0) {
      const kind = TOWER_KINDS[num % 4];
      // with the keyboard cursor out, the tower goes on the cursor's tile
      if (this.cursorOn && !this.sel && !this.selTower && this.sim.canBuild(this.cursor.c, this.cursor.r)) this.sel = { ...this.cursor };
      this.pickKind(kind);
      return;
    }
    switch (code) {
      case 'Escape': case 'Backspace': case 'KeyX':
        this.deselect();
        this.cursorOn = false;
        break;
      case 'KeyP':
        // P still pauses while something is picked (Esc only closes it)
        if (this.modalRelease) { this.deselect(); this.cursorOn = false; this.syncModal(); this.time.delayedCall(10, () => this.pauseGame()); }
        break;
      case 'KeyQ': case 'Digit5': case 'Numpad5':
        this.pickKind('meteor');
        if (this.armed === 'meteor' && this.cursorOn && this.board) this.aim = { x: this.board.X(this.cursor.c), z: this.board.Z(this.cursor.r) };
        break;
      case 'Enter':
        if (this.armed === 'meteor') { if (this.aim) this.castMeteor(this.aim.x, this.aim.z); }
        else if (this.armed && this.sel) this.tryBuild(this.sel.c, this.sel.r);
        else if (this.cursorOn) this.tapCell(this.cursor.c, this.cursor.r);
        break;
      case 'Space': this.callWave(); break;
      case 'KeyF': this.toggleSpeed(); break;
      case 'KeyT': {
        if (!this.selTower && this.cursorOn) { const tw = this.sim.towerAt(this.cursor.c, this.cursor.r); if (tw) this.selectTower(tw); }
        this.cycleMode();
        break;
      }
      case 'KeyU': {
        if (!this.selTower && this.cursorOn) { const tw = this.sim.towerAt(this.cursor.c, this.cursor.r); if (tw) this.selectTower(tw); }
        this.upgradeSelected();
        break;
      }
      case 'KeyS': {
        if (!this.selTower && this.cursorOn) { const tw = this.sim.towerAt(this.cursor.c, this.cursor.r); if (tw) this.selectTower(tw); }
        this.sellSelected();
        break;
      }
    }
  }

  /** Esc closes a selection instead of pausing: hold a core modal while anything is picked. */
  private syncModal(): void {
    const want = this.phase === 'play' && !this.isOver && !!(this.armed || this.sel || this.selTower || this.cursorOn);
    if (want && !this.modalRelease) this.modalRelease = pushModal(this);
    else if (!want && this.modalRelease) { this.modalRelease(); this.modalRelease = null; }
  }

  /** Keeps a cell in view (above the bottom panels). */
  private focusCell(c: number, r: number): void {
    if (!this.board) return;
    const x = this.board.X(c), z = this.board.Z(r);
    const s = this.screen(x, GRASS_Y, z);
    if (s.y > 900 || s.y < 230 || s.x < 60 || s.x > 660) {
      this.cam.tx = x;
      this.cam.tz = z + 1.8;
    }
  }

  // ------------------------------------------------------------------ building

  private denied(c: number, r: number): void {
    if (!this.board) return;
    const s = this.screen(this.board.X(c), GRASS_Y, this.board.Z(r));
    popup(this, s.x, s.y - 30, t('cantBuild'), '#ffb0a0', 22);
    this.sfx('error', { volume: 0.35 });
  }

  /** Tile first: the tile is selected and the dock's cards glow until one is picked. */
  private selectBuild(c: number, r: number): void {
    this.sel = { c, r };
    this.selTower = null;
    this.sellArmed = false;
    this.cursor = { c, r };
    this.towerCard.close();
    this.dock.open();
    this.sfx('move', { volume: 0.4 });
    this.focusCell(c, r);
  }

  /** A dock card was picked (tap, click or key). */
  private pickKind(kind: ArmKind): void {
    const sim = this.sim;
    if (!sim || this.phase !== 'play' || this.isOver) return;
    if (this.selTower) { this.selTower = null; this.sellArmed = false; this.sel = null; this.towerCard.close(); this.dock.open(); }
    if (kind === 'meteor') {
      if (this.armed === 'meteor') {
        if (this.aim) this.castMeteor(this.aim.x, this.aim.z);
        else this.disarm();
        return;
      }
      if (!sim.meteorReady()) {
        this.dock.shake('meteor');
        const c = this.dock.card('meteor')!;
        popup(this, this.dock.x + c.box.x, this.dock.y - 96, sim.wave === 0 ? t('meteorFirst') : t('meteorWait', { n: Math.ceil(sim.meteorCd) }), '#ffc27a', 22);
        this.sfx('error', { volume: 0.4 });
        return;
      }
      this.armed = 'meteor';
      this.stayArmed = false;
      this.sel = null;
      this.aim = null;
      this.sfx('arm', { volume: 0.55 });
      return;
    }
    if (this.armed === kind) {
      // the armed card again: builds on the selected tile, or puts the card down
      if (this.sel) this.tryBuild(this.sel.c, this.sel.r);
      else this.disarm();
      return;
    }
    this.armed = kind;
    this.stayArmed = !this.sel;
    this.aim = null;
    this.sfx('arm', { volume: 0.5 });
    if (sim.gold < TOWERS[kind].tiers[0].cost) this.noGold(kind);
  }

  private disarm(): void {
    if (this.armed) this.sfx('move', { volume: 0.3 });
    this.armed = null;
    this.stayArmed = false;
    this.aim = null;
    this.sel = null;
  }

  private tryBuild(c: number, r: number): void {
    const sim = this.sim!;
    const kind = this.armed as TowerKind;
    if (!kind || kind as ArmKind === 'meteor') return;
    if (!sim.canBuild(c, r)) { this.denied(c, r); return; }
    if (sim.gold < TOWERS[kind].tiers[0].cost) { this.noGold(kind); return; }
    const tw = sim.build(kind, c, r);
    if (!tw) return;
    this.addTowerView(tw, true);
    this.seenHint('h_build_touch');
    this.seenHint('h_build_touch2');
    this.seenHint('h_build_mouse');
    this.seenHint('h_build_keys');
    this.queueHint(this.sys.game.device.input.touch ? 'h_upgrade' : 'h_upgrade_mouse');
    this.sel = null;
    this.cursor = { c, r };
    if (!this.stayArmed) this.disarm();
  }

  private noGold(kind?: ArmKind): void {
    const s = this.goldChip;
    popup(this, s.x + 80, s.y + 40, t('notEnough'), '#ff8a7a', 22);
    this.sfx('error', { volume: 0.4 });
    this.tweens.add({ targets: s, scale: 1.15, duration: 90, yoyo: true });
    if (kind) this.dock.shake(kind);
  }

  private selectTower(tw: Tower): void {
    this.armed = null;
    this.stayArmed = false;
    this.aim = null;
    this.sel = { c: tw.c, r: tw.r };
    this.selTower = tw;
    this.sellArmed = false;
    this.cursor = { c: tw.c, r: tw.r };
    this.dock.close();
    this.towerCard.open();
    this.sfx('move', { volume: 0.4 });
    this.focusCell(tw.c, tw.r);
    this.queueHint('h_target');
  }

  /** Clears every selection: the tile, the tower card and an armed card. */
  private deselect(): void {
    this.sel = null;
    this.selTower = null;
    this.armed = null;
    this.stayArmed = false;
    this.aim = null;
    this.sellArmed = false;
    this.towerCard.close();
    if (this.phase === 'play' && !this.isOver) this.dock.open();
    this.hideMarkers();
  }

  private hideMarkers(): void {
    this.markers.hideRing();
    this.markers.hideRing2();
    this.markers.hideTile();
    this.markers.cursor.visible = false;
    this.markers.showGhost(null, 0, 0, 0);
  }

  /** Draws the ghost, rings and highlights for the current selection and the mouse hover. */
  private updateMarkers(sim: Sim): void {
    const b = this.board!;
    const mk = this.markers;
    const hovering = this.mouse && !this.overUi && !this.drag?.moved;
    let ghost = false, ring = false, tile = false, ring2 = false;
    const cur = this.sel ?? (this.cursorOn ? this.cursor : null);
    mk.cursor.visible = !!cur && !this.isOver;
    if (cur) mk.cursor.position.set(b.X(cur.c), sim.map.buildable(cur.c, cur.r) ? GRASS_Y : PATH_Y, b.Z(cur.r));
    if (this.armed === 'meteor') {
      const pt = hovering && this.hoverPt ? this.hoverPt : this.aim;
      if (pt) { mk.showRing(pt.x, pt.z, METEOR.radius, sim.meteorReady() ? 0xff7a2a : 0x9a9a9a); ring = true; }
    } else if (this.armed) {
      const cell = hovering && this.hover ? this.hover : this.sel;
      if (cell) {
        const x = b.X(cell.c), z = b.Z(cell.r);
        if (sim.map.buildable(cell.c, cell.r) && !sim.towerAt(cell.c, cell.r)) {
          const ok = sim.gold >= TOWERS[this.armed].tiers[0].cost;
          mk.showGhost(this.armed, 0, x, z);
          mk.tintGhost(ok);
          mk.showRing(x, z, TOWERS[this.armed].tiers[0].range, ok ? 0x7dffa0 : 0xff6a5a);
          mk.showTile(x, z, GRASS_Y, ok ? 0x7dffa0 : 0xff6a5a);
          ghost = ring = tile = true;
        } else {
          // a tower answers a click with its card (blue); anything else is blocked (red)
          const tw = sim.towerAt(cell.c, cell.r);
          mk.showTile(x, z, sim.map.buildable(cell.c, cell.r) ? GRASS_Y : PATH_Y, tw ? 0x9fd8ff : 0xff5a4a);
          tile = true;
        }
      }
    } else if (this.selTower) {
      mk.showRing(this.selTower.x, this.selTower.z, TOWERS[this.selTower.kind].tiers[this.selTower.tier].range, 0x9fd8ff);
      ring = true;
    } else if (this.sel) {
      // tile first: a soft preview of the cheapest tower's reach
      mk.showRing(b.X(this.sel.c), b.Z(this.sel.r), TOWERS.ballista.tiers[0].range, 0xffffff);
      ring = true;
    }
    // the mouse alone: the tile under it lights up, a tower shows its reach
    if (hovering && this.hover && !this.armed) {
      const h = this.hover;
      const tw = sim.towerAt(h.c, h.r);
      if (tw) {
        mk.showTile(tw.x, tw.z, GRASS_Y, 0x9fd8ff);
        tile = true;
        if (tw !== this.selTower) { mk.showRing2(tw.x, tw.z, TOWERS[tw.kind].tiers[tw.tier].range, 0x9fd8ff); ring2 = true; }
      } else if (sim.map.buildable(h.c, h.r)) {
        mk.showTile(b.X(h.c), b.Z(h.r), GRASS_Y, 0xffffff);
        tile = true;
      }
    }
    if (!ghost) mk.showGhost(null, 0, 0, 0);
    if (!ring) mk.hideRing();
    if (!tile) mk.hideTile();
    if (!ring2) mk.hideRing2();
    // the pointer: a hand over things that answer a click
    const canvas = this.game.canvas;
    const want = hovering && this.hover && (this.armed || sim.towerAt(this.hover.c, this.hover.r) || sim.map.buildable(this.hover.c, this.hover.r)) ? 'pointer' : '';
    if (canvas.style.cursor !== want && !this.overUi) canvas.style.cursor = want;
  }

  private cycleMode(): void {
    const tw = this.selTower, sim = this.sim;
    if (!tw || !sim) return;
    const mode = sim.cycleMode(tw);
    this.seenHint('h_target');
    this.sfx('arm', { volume: 0.45 });
    const s = this.screen(tw.x, weaponY(tw.kind, tw.tier) + 0.6, tw.z);
    popup(this, s.x, s.y, t('tmd_' + mode), '#9fd8ff', 22);
    this.tweens.add({ targets: this.towerCard.mode, scale: 1.08, duration: 80, yoyo: true });
  }

  private castMeteor(x: number, z: number): void {
    const sim = this.sim!;
    if (!sim.castMeteor(x, z)) { this.dock.shake('meteor'); this.sfx('error', { volume: 0.4 }); return; }
    this.armed = null;
    this.aim = null;
    this.seenHint('h_meteor');
    this.seenHint('h_meteor_touch');
  }

  private upgradeSelected(): void {
    const tw = this.selTower, sim = this.sim;
    if (!tw || !sim) return;
    const cost = sim.upgradeCost(tw);
    if (cost === null) return;
    if (sim.gold < cost) { this.noGold(); return; }
    sim.upgrade(tw);
    this.seenHint('h_upgrade');
    this.seenHint('h_upgrade_mouse');
    this.addTowerView(tw, true);
    this.markers.showRing(tw.x, tw.z, TOWERS[tw.kind].tiers[tw.tier].range, 0x9fd8ff);
    this.sfx('upgrade', { volume: 0.7 });
    const s = this.screen(tw.x, weaponY(tw.kind, tw.tier) + 0.6, tw.z);
    popup(this, s.x, s.y, t('upgraded', { n: tw.tier + 1 }), '#9dffb8', 26);
    this.fx.spark(tw.x, weaponY(tw.kind, tw.tier), tw.z, 0xfff3a0, 18, 3);
    this.fx.ring(tw.x, GRASS_Y + 0.05, tw.z, 1.1, 0x9dffb8, 0.5);
  }

  private sellSelected(): void {
    const tw = this.selTower, sim = this.sim;
    if (!tw || !sim) return;
    if (!this.sellArmed) { this.sellArmed = true; this.sfx('move', { volume: 0.5 }); return; }
    const g = sim.sell(tw);
    const v = this.towersV.get(tw.id);
    if (v) {
      this.towersV.delete(tw.id);
      this.tweens.add({ targets: v.root.scale, x: 0.01, y: 0.01, z: 0.01, duration: 260, ease: 'Back.easeIn', onComplete: () => this.world.scene.remove(v.root) });
    }
    this.fx.dustRing(tw.x, GRASS_Y, tw.z, 14);
    const s = this.screen(tw.x, 0.6, tw.z);
    popup(this, s.x, s.y, t('sold', { n: g }), '#ffd23f', 26);
    this.flyCoins(s.x, s.y, 4);
    this.sfx('sell', { volume: 0.7 });
    this.deselect();
  }

  private addTowerView(tw: Tower, animate: boolean): void {
    const old = this.towersV.get(tw.id);
    if (old) this.world.scene.remove(old.root);
    const v = buildTower(tw.kind, tw.tier, kitMat(this, this.board?.palette === 'autumn' ? 'autumn' : 'green'), !animate) as TowerVis;
    v.id = tw.id;
    v.kind = tw.kind;
    v.tier = tw.tier;
    v.buildT = animate ? 0 : 1;
    v.yaw = old?.yaw ?? tw.aim;
    v.root.position.set(tw.x, GRASS_Y, tw.z);
    this.world.scene.add(v.root);
    this.towersV.set(tw.id, v);
    if (animate) {
      // the parts drop in one after another, each landing with dust (driven by tick())
      v.parts.forEach((p) => { p.userData.y = p.position.y; p.userData.landed = false; p.visible = false; });
      this.sfx('build', { volume: 0.6 });
    }
  }

  /** Tower build animation: parts fall in turn and bounce into place. */
  private animateBuild(v: TowerVis, dt: number): void {
    if (v.buildT >= 1) return;
    const step = 0.11, fall = 0.28;
    const total = (v.parts.length - 1) * step + fall;
    v.buildT = Math.min(1, v.buildT + dt / total);
    const el = v.buildT * total;
    v.parts.forEach((p, i) => {
      const u = Phaser.Math.Clamp((el - i * step) / fall, 0, 1);
      p.visible = u > 0;
      p.position.y = p.userData.y + 2.5 * (1 - Phaser.Math.Easing.Bounce.Out(u));
      if (u >= 1 && !p.userData.landed) {
        p.userData.landed = true;
        const x = v.root.position.x, z = v.root.position.z;
        this.fx.dustRing(x, GRASS_Y + p.userData.y, z, i === 0 ? 18 : 8);
        this.sfx('hammer', { volume: 0.45 });
        // the base lands with a thunk: dust, a ring and a small nudge of the camera
        if (i === 0) {
          this.sfx('thud', { volume: 0.55 });
          this.shake3(0.07, 0.12);
          this.fx.ring(x, GRASS_Y + 0.04, z, 0.8, 0xf3ead9, 0.35);
          this.fx.puff(x, GRASS_Y + 0.1, z, 0xc9b79a, 6, { speed: 1.4, size: 0.1, up: 0.5, life: 0.5 });
        }
      }
    });
    if (v.buildT >= 1) {
      if (v.tier === 0) {
        const s = this.screen(v.root.position.x, weaponY(v.kind, 0) + 0.7, v.root.position.z);
        popup(this, s.x, s.y, t('built'), '#9dffb8', 24);
      }
      // standing: the masonry becomes one mesh
      const tw = this.sim?.towers.find((q) => q.id === v.id);
      if (tw) this.addTowerView(tw, false);
    }
  }

  private clearTowers(): void {
    for (const v of this.towersV.values()) this.world.scene.remove(v.root);
    this.towersV.clear();
  }

  // ------------------------------------------------------------------ waves

  private callWave(): void {
    const sim = this.sim;
    if (!sim || this.phase !== 'play' || this.isOver || !sim.canCallWave()) return;
    const early = sim.callWave();
    this.seenHint('h_start');
    if (early > 0) {
      this.seenHint('h_early');
      const b = this.waveBtn;
      popup(this, b.x, b.y - 70, t('earlyGold', { n: early }), '#ffd23f', 28);
      this.flyCoins(b.x, b.y - 40, 3);
      this.sfx('coins', { volume: 0.6 });
    }
  }

  private toggleSpeed(): void {
    if (this.phase !== 'play') return;
    this.speed = this.speed === 1 ? 2 : 1;
    this.seenHint('h_speed');
    this.speedChip.setText(this.speed + '×');
    this.speedChip.setTextColor(this.speed > 1 ? '#7dffa0' : '#ffffff');
    this.tweens.add({ targets: this.speedChip, scale: 1.12, duration: 90, yoyo: true });
    this.sfx('move', { volume: 0.5 });
  }

  private bannerBox: Phaser.GameObjects.Container | null = null;

  private banner(main: string, sub: string, color: string, kinds: { kind: EnemyKind; count: number }[] = [], y = 360, subColor = '#ffffff'): void {
    const { width } = this.scale;
    const main1 = y === 360;
    if (main1) this.bannerBox?.destroy();
    const box = this.add.container(width / 2, y).setScrollFactor(0).setDepth(9500);
    if (main1) this.bannerBox = box;
    const n = Math.min(5, kinds.length);
    const h = n ? 196 : sub ? 128 : 96;
    box.add(glass(this, 560, h, { alpha: 0.78 }));
    box.add(txt(this, 0, -h / 2 + 40, main, { title: true, size: 42, color, strokeThickness: 7 }));
    if (sub) box.add(txt(this, 0, -h / 2 + 86, sub, { size: 24, color: subColor, strokeThickness: 4 }));
    kinds.slice(0, n).forEach((k, i) => {
      const x = (i - (n - 1) / 2) * 96;
      if (ENEMIES[k.kind].boss) box.add(this.add.circle(x, h / 2 - 46, 34, 0xc8343c, 0.85));
      box.add(this.add.image(x, h / 2 - 48, enemyThumb(k.kind)).setDisplaySize(70, 70));
      box.add(txt(this, x + 28, h / 2 - 20, '×' + k.count, { size: 20, strokeThickness: 4 }));
    });
    box.setScale(0.4).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: box, alpha: 0, y: y - 40, delay: 1600, duration: 400, onComplete: () => { box.destroy(); if (this.bannerBox === box) this.bannerBox = null; } });
  }

  // ------------------------------------------------------------------ events

  private onEvent(ev: SimEvent): void {
    const sim = this.sim!;
    switch (ev.type) {
      case 'waveStart': {
        const kinds = sim.waveKinds(ev.wave);
        const fresh = kinds.filter((k) => !this.seenKinds.has(k.kind));
        for (const k of kinds) this.seenKinds.add(k.kind);
        const last = ev.wave === sim.totalWaves;
        const boss = kinds.find((k) => ENEMIES[k.kind].boss);
        const sub = boss ? `${t('bossIncoming')} ${t('e_' + boss.kind)}`
          : fresh.length && ev.wave > 1 ? t('newFoe', { name: fresh.map((k) => t('e_' + k.kind)).join(', ') }) : last ? t('finalWave') : '';
        this.banner(last ? t('finalWave') : t('waveBanner', { n: ev.wave }), sub, last || boss ? '#ff9a7a' : '#ffffff', kinds, 360, boss ? '#ffb0a0' : '#ffffff');
        this.sfx('waveStart', { volume: 0.6 });
        this.hud.setCenter(t('waveOf', { n: ev.wave, m: sim.totalWaves }));
        this.tweens.add({ targets: this.hud.centerChip, scale: 1.2, duration: 120, yoyo: true });
        for (const k of fresh) {
          const def = ENEMIES[k.kind];
          if (def.boss) { this.queueHint(k.kind === 'mothership' ? 'h_mothership' : 'h_boss'); }
          else if (def.flying) this.queueHint('h_air');
          else if (k.kind === 'brute') this.queueHint('h_armor');
          else if (k.kind === 'runner') this.queueHint('h_runner');
        }
        if (boss) this.sfx('bossHorn', { volume: 0.6 });
        if (ev.wave === 1) this.queueHint(this.sys.game.device.input.touch ? 'h_meteor_touch' : 'h_meteor');
        if (ev.wave === 2) this.queueHint('h_speed');
        break;
      }
      case 'meteorCast': {
        const s = this.screen(ev.m.x, 0, ev.m.z);
        this.sfxAt('meteorFall', s.x, { volume: 0.7 });
        this.fx.ring(ev.m.x, 0.16, ev.m.z, METEOR.radius, 0xffd23f, 0.3);
        break;
      }
      case 'meteorHit': {
        const { x, z } = ev.m;
        this.fx.boom(x, z, METEOR.radius, true);
        this.fx.ring(x, 0.18, z, METEOR.radius * 1.5, 0xff7a2a, 0.6);
        this.fx.dustRing(x, 0.15, z, 22, 0xd9c6a8);
        this.fx.puff(x, 0.4, z, 0x9a8f86, 12, { speed: 1.8, size: 0.12, up: 1.6, life: 1, grow: 2.2 });
        this.fx.spark(x, 0.4, z, 0xffb347, 26, 5);
        const s = this.screen(x, 0.3, z);
        this.sfxAt('bigBoom', s.x, { volume: 0.9 });
        this.shake3(0.38, 0.45);
        this.glow(0xffa040, 0.32, 260);
        if (ev.hits >= 3) popup(this, s.x, s.y - 50, t('meteorHits', { n: ev.hits }), '#ffc27a', 30);
        break;
      }
      case 'waveSpawned':
        if (ev.wave === 1) this.queueHint('h_early');
        break;
      case 'waveClear': {
        const k = this.screen(this.board!.keep.position.x, 1.6, this.board!.keep.position.z);
        if (sim.over !== 'win') {
          const box = txt(this, this.scale.width / 2, 610, t('waveClear'), { title: true, size: 44, color: '#9dffb8', strokeThickness: 8 }).setScrollFactor(0).setDepth(9500).setScale(0.3);
          const sub = txt(this, this.scale.width / 2, 664, t('bonusGold', { n: ev.gold }), { size: 28, color: '#ffd23f', strokeThickness: 5 }).setScrollFactor(0).setDepth(9500).setAlpha(0);
          this.tweens.add({ targets: box, scale: 1, duration: 300, ease: 'Back.easeOut' });
          this.tweens.add({ targets: sub, alpha: 1, duration: 300, delay: 150 });
          this.tweens.add({ targets: [box, sub], alpha: 0, delay: 1500, duration: 400, onComplete: () => { box.destroy(); sub.destroy(); } });
          this.sfx('waveClear', { volume: 0.6 });
        }
        this.flyCoins(k.x, k.y, 5);
        break;
      }
      case 'spawn': {
        const e = ev.e;
        if (ENEMIES[e.kind].boss) { this.shake3(0.25, 0.4); this.fx.ring(e.x, 0.2, e.z, 1.5, 0xc04cff, 0.6); this.time.delayedCall(1700, () => { if (e.alive && this.phase === 'play' && !this.isOver) this.bossIntro(e); }); }
        if (Math.random() < 0.5) this.fx.puff(e.x, 0.3, e.z, 0xc78cff, 3, { speed: 0.6, size: 0.1, life: 0.5 });
        break;
      }
      case 'fire': {
        const v = this.towersV.get(ev.tower.id);
        if (v) v.kick = 1;
        const tw = ev.tower;
        const y = weaponY(tw.kind, tw.tier) + 0.25;
        const s = this.screen(tw.x, y, tw.z);
        if (tw.kind === 'cannon') { this.fx.puff(tw.x + Math.sin(tw.aim) * 0.4, y, tw.z + Math.cos(tw.aim) * 0.4, 0xdddddd, 5, { speed: 0.8, size: 0.1, up: 0.6, life: 0.5 }); this.sfxAt('cannon', s.x, { volume: 0.45 }); }
        else if (tw.kind === 'catapult') this.sfxAt('catapult', s.x, { volume: 0.55 });
        else if (tw.kind === 'ballista') this.sfxAt('bolt', s.x, { volume: 0.4 });
        else { this.fx.spark(tw.x + Math.sin(tw.aim) * 0.35, y, tw.z + Math.cos(tw.aim) * 0.35, 0xffe08a, 2, 1.5); this.sfxAt('gun', s.x, { volume: 0.22 }); }
        // 'shot' rides along until it lands
        void ev.shot;
        break;
      }
      case 'hit': {
        this.enemiesV.hit(ev.e);
        const fly = ENEMIES[ev.e.kind].flying;
        const y = fly ? FLY_Y + 0.2 : PATH_Y + 0.45;
        if (ev.shot.ammo === 'arrow' || ev.shot.ammo === 'bullet') {
          this.fx.spark(ev.e.x, y, ev.e.z, fly ? 0xbfe8ff : 0xb6ff8a, ev.shot.ammo === 'arrow' ? 5 : 2, 2);
          if (ev.shot.ammo === 'arrow') this.sfxAt(fly ? 'clank' : 'thud', this.screen(ev.e.x, y, ev.e.z).x, { volume: 0.3 });
        }
        if (ENEMIES[ev.e.kind].boss && Math.random() < 0.25) this.shake3(0.06, 0.12);
        break;
      }
      case 'impact': {
        if (ev.r > 0) {
          this.fx.boom(ev.x, ev.z, ev.r, ev.shot.ammo === 'boulder');
          const s = this.screen(ev.x, 0.2, ev.z);
          this.sfxAt(ev.shot.ammo === 'boulder' ? 'rock' : 'boom', s.x, { volume: ev.shot.ammo === 'boulder' ? 0.55 : 0.4 });
          if (ev.shot.ammo === 'boulder') this.shake3(0.05, 0.12);
        } else this.fx.puff(ev.x, 0.2, ev.z, 0xbbaa88, 2, { speed: 0.5, size: 0.06, life: 0.3 });
        break;
      }
      case 'kill': {
        const e = ev.e;
        const def = ENEMIES[e.kind];
        this.enemiesV.kill(e);
        const y = def.flying ? FLY_Y : PATH_Y + 0.4;
        const s = this.screen(e.x, y, e.z);
        if (!def.flying) {
          this.fx.puff(e.x, 0.35, e.z, e.kind === 'brute' ? 0x9aa6b8 : 0x9fd27a, def.boss ? 14 : 8, { speed: def.boss ? 2.2 : 1, size: def.boss ? 0.15 : 0.12, up: 1, life: 0.6 });
          if (def.boss) { this.fx.dustRing(e.x, 0.15, e.z, 20); this.fx.puff(e.x, 0.4, e.z, 0xbfb6a6, 12, { speed: 1.4, size: 0.16, up: 1.4, life: 0.9, grow: 2 }); }
          this.sfxAt(def.boss ? 'bigBoom' : 'splat', s.x, { volume: def.boss ? 0.9 : 0.35 });
        } else this.fx.spark(e.x, FLY_Y, e.z, 0xffd27a, 10, 3);
        if (def.boss) {
          this.shake3(0.45, 0.6);
          this.banner(t('bossDown'), '', '#ffd23f', [], 800);
          this.fx.ring(e.x, 0.2, e.z, 2.4, 0xffd23f, 0.7);
        }
        popup(this, s.x, s.y - 20, '+' + ev.gold, '#ffd23f', def.boss ? 34 : 22);
        this.flyCoins(s.x, s.y, def.boss ? 8 : 1);
        break;
      }
      case 'leak': {
        this.enemiesV.drop(ev.e);
        const k = this.board!.keepTop();
        const s = this.screen(k.x, k.y, k.z);
        popup(this, s.x, s.y - 30, '-' + ev.lives, '#ff5a5a', ev.lives > 1 ? 40 : 30);
        this.board!.hurtT = 0.6;
        this.fx.spark(k.x, k.y, k.z, 0xff5ab0, 14, 3);
        this.fx.ring(k.x, PATH_Y + 0.1, k.z, 1.4, 0xff4a6a, 0.5);
        this.shake3(ev.lives >= 5 ? 0.5 : 0.18, ev.lives >= 5 ? 0.6 : 0.25);
        this.glow(0xff2840, ev.lives >= 5 ? 0.3 : 0.18, 220);
        // red at the screen's edges and the hearts shudder
        this.tweens.killTweensOf(this.vignette);
        this.vignette.setAlpha(ev.lives >= 5 ? 1 : 0.75);
        this.tweens.add({ targets: this.vignette, alpha: 0, duration: ev.lives >= 5 ? 1100 : 650, ease: 'Quad.easeIn' });
        const lc = this.hud.livesChip;
        this.tweens.add({ targets: lc, x: { from: lc.x - 8, to: lc.x }, duration: 300, ease: 'Elastic.easeOut', easeParams: [1.5, 0.3] });
        this.sfx('hurt', { volume: 0.7 });
        if (!this.lowWarned && sim.lives > 0 && sim.lives / sim.maxLives < 0.35) { this.lowWarned = true; this.showHint('h_lowlives'); }
        break;
      }
      case 'drop': {
        this.fx.ring(ev.e.x, FLY_Y, ev.e.z, 0.8, 0xc04cff, 0.4);
        this.fx.spark(ev.e.x, FLY_Y, ev.e.z, 0xe0a0ff, 8, 2);
        this.sfx('drop', { volume: 0.4 });
        break;
      }
      case 'win': this.mapWon(); break;
      case 'lose': this.mapLost(); break;
    }
  }

  private flyCoins(x: number, y: number, n: number): void {
    const target = this.goldChip;
    for (let i = 0; i < n; i++) {
      const c = this.add.image(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 20, 'ck-coin').setDisplaySize(30, 30).setScrollFactor(0).setDepth(9050);
      this.tweens.add({
        targets: c, x: target.x + 24, y: target.y, duration: 520 + i * 60, delay: i * 50, ease: 'Cubic.easeIn',
        onComplete: () => {
          c.destroy();
          if (i === 0) {
            this.sfx('coin', { volume: 0.35 });
            this.tweens.add({ targets: target, scale: 1.1, duration: 70, yoyo: true });
          }
        },
      });
    }
  }

  // ------------------------------------------------------------------ the end of a map

  private mapWon(): void {
    const sim = this.sim!;
    this.phase = 'clear';
    this.hintQueue = [];
    this.hintT = 0;
    this.tweens.killTweensOf(this.hint);
    this.hint.setAlpha(0);
    this.deselect();
    this.setPlayUi(false);
    this.goldChip.setVisible(false);
    const stars = sim.stars();
    const bonus = sim.clearBonus();
    this.runBase += sim.score + bonus;
    this.setScore(this.runBase);
    this.mapsCleared++;
    const prog = this.progress();
    prog.stars[this.mapIx] = Math.max(prog.stars[this.mapIx] ?? 0, stars);
    storage.set(PROGRESS_KEY, prog);
    playMusic(this, false);
    this.sfx('fanfare', { volume: 0.8 });
    // the camera moves to the keep, which shows above the card
    const k = this.board!.keep.position;
    this.cam.tx = k.x;
    this.cam.tz = k.z + 2.6;
    this.cam.tzoom = 1.3;
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 260, () => this.fx.spark(k.x + (Math.random() - 0.5), 2 + Math.random(), k.z + (Math.random() - 0.5), [0xffd23f, 0x9dffb8, 0xc04cff, 0xffffff][i], 24, 4));

    const { width } = this.scale;
    const last = this.mapIx >= MAPS.length - 1;
    const add = <O extends Phaser.GameObjects.GameObject>(o: O): O => { this.clearUi.push(o); return o; };
    const box = add(this.add.container(width / 2, 690).setScrollFactor(0).setDepth(9600));
    box.add(glass(this, 620, 640, { alpha: 0.93 }));
    // one line, shrunk to fit the card (the Turkish "all maps cleared" is long)
    const head = txt(this, 0, -250, last ? t('allClear') : t('mapClear'), { title: true, size: 44, color: '#9dffb8', strokeThickness: 8 });
    if (head.width > 570) head.setScale(570 / head.width);
    box.add(head);
    box.add(txt(this, 0, -192, t('m_' + sim.map.def.id), { size: 28, color: '#cfd8f0', strokeThickness: 0 }));
    const sg = this.add.graphics();
    box.add(sg);
    for (let i = 0; i < 3; i++) {
      drawStar(sg, (i - 1) * 110, -90, 44, false);
      if (i < stars) {
        const st = this.add.graphics();
        drawStar(st, 0, 0, 44, true);
        st.setPosition((i - 1) * 110, -90).setScale(0);
        box.add(st);
        this.tweens.add({ targets: st, scale: 1, duration: 360, delay: 400 + i * 300, ease: 'Back.easeOut', onStart: () => this.sfx('star', { volume: 0.6 }) });
      }
    }
    box.add(txt(this, 0, 10, t('livesLeft', { n: sim.lives }) + '   ' + t('killsN', { n: sim.kills }), { size: 26, color: '#ffffff', strokeThickness: 0 }));
    box.add(txt(this, 0, 58, t('bonusPts', { n: bonus }), { size: 30, color: '#ffd23f', strokeThickness: 0 }));
    const next = new Button(this, 0, last ? 200 : 150, last ? t('finish') : t('nextMap'), () => last ? this.finishRun() : this.startMap(this.mapIx + 1), { width: 380, height: 92, color: 0x2f9e56 });
    next.setData('primary', true);
    box.add(next);
    this.clearUi.push(next);
    if (!last) box.add(new Button(this, 0, 258, t('finish'), () => this.finishRun(), { width: 300, height: 76, color: 0x4a5a86, size: 26 }));
    box.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 360, delay: 500, ease: 'Back.easeOut' });
  }

  private finishRun(): void {
    if (this.isOver) return;
    this.endGame({ win: true, title: t('victory'), delay: 200 });
  }

  private mapLost(): void {
    this.deselect();
    const k = this.board!.keep.position;
    this.fx.boom(k.x, k.z, 1.8, true);
    this.shake3(0.6, 0.8);
    this.sfx('lose', { volume: 0.8 });
    playMusic(this, false);
    this.cam.tx = k.x;
    this.cam.tz = k.z + 2.6;
    this.cam.tzoom = 1.3;
    this.endGame({ win: false, title: t('keepFallen'), delay: 1400 });
  }

  /** Rewarded continue (core ads): half the lives back and the enemies near the keep cleared. */
  revive(): void {
    const sim = this.sim;
    if (!sim || this.phase !== 'play') return;
    const gone = sim.revive(Math.ceil(sim.maxLives / 2));
    for (const e of gone) {
      this.enemiesV.drop(e);
      this.fx.puff(e.x, 0.4, e.z, 0xc78cff, 6, { speed: 1, size: 0.12 });
    }
    sim.compact();
    this.lowWarned = false;
    this.cam.tzoom = 1;
    playMusic(this, 'stage1');
    const k = this.board!.keepTop();
    this.fx.ring(k.x, PATH_Y + 0.1, k.z, 3, 0x9dffb8, 0.8);
    this.hud.setLives(sim.lives, sim.maxLives);
    const s = this.screen(k.x, k.y, k.z);
    popup(this, s.x, s.y - 40, t('revived'), '#9dffb8', 30);
  }

  // ------------------------------------------------------------------ boss intro and the vignette

  /** A boss arrives: a ribbon with its portrait and name, and the camera looks at it for a moment. */
  private bossIntro(e: Enemy): void {
    const { width } = this.scale;
    const y = 560;
    const box = this.add.container(-width, y).setScrollFactor(0).setDepth(9550);
    const band = this.add.graphics();
    band.fillStyle(0x000000, 0.35).fillRect(-width / 2 - 40, -76 + 8, width + 80, 152);
    band.fillStyle(0x8a1f2a, 0.92).fillRect(-width / 2 - 40, -76, width + 80, 152);
    band.fillStyle(0xffffff, 0.08).fillRect(-width / 2 - 40, -76, width + 80, 60);
    band.lineStyle(4, 0xffb0a0, 0.9).lineBetween(-width / 2 - 40, -76, width / 2 + 40, -76).lineBetween(-width / 2 - 40, 76, width / 2 + 40, 76);
    const disc = this.add.circle(-width / 2 + 130, 0, 70, 0x2a0a10, 0.9).setStrokeStyle(4, 0xffb0a0);
    const img = this.add.image(-width / 2 + 130, 0, enemyThumb(e.kind)).setDisplaySize(132, 132);
    const tag = txt(this, -width / 2 + 236, -30, t('bossTag'), { title: true, size: 26, color: '#ffd23f', strokeThickness: 5 }).setOrigin(0, 0.5);
    const name = txt(this, -width / 2 + 236, 22, upper(t('e_' + e.kind)), { title: true, size: 44, color: '#ffffff', strokeThickness: 8 }).setOrigin(0, 0.5);
    box.add([band, disc, img, tag, name]);
    this.tweens.add({ targets: box, x: width / 2, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, scale: { from: img.scale * 1.25, to: img.scale }, duration: 500, delay: 250, ease: 'Bounce.easeOut' });
    this.tweens.add({ targets: box, x: width * 2, delay: 2000, duration: 360, ease: 'Back.easeIn', onComplete: () => box.destroy() });
    // the camera swings to the spawn and back (a drag by the player cancels the return)
    if (!this.bossCam) {
      this.bossCam = { t: 1.8, back: { tx: this.cam.tx, tz: this.cam.tz, tzoom: this.cam.tzoom } };
      this.cam.tx = e.x;
      this.cam.tz = e.z + 2;
      this.cam.tzoom = Math.max(this.cam.tzoom, 1.15);
    }
  }

  /** A soft full-screen glow (the meteor's blast), much gentler than a camera flash. */
  private glow(color: number, alpha: number, ms: number): void {
    const r = this.add.rectangle(0, 0, this.scale.width, this.scale.height, color, alpha).setOrigin(0).setScrollFactor(0).setDepth(8980);
    this.tweens.add({ targets: r, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }

  /** Red edges for the keep's hits: four bands that fade towards the middle (vertex alpha). */
  private redEdges(): Phaser.GameObjects.Graphics {
    const { width: w, height: h } = this.scale;
    const g = this.add.graphics().setScrollFactor(0).setDepth(8990).setAlpha(0);
    const c = 0xff1e32, a = 0.7, d = 150;
    g.fillGradientStyle(c, c, c, c, a, a, 0, 0).fillRect(0, 0, w, d);
    g.fillGradientStyle(c, c, c, c, 0, 0, a, a).fillRect(0, h - d, w, d);
    g.fillGradientStyle(c, c, c, c, a, 0, a, 0).fillRect(0, 0, d, h);
    g.fillGradientStyle(c, c, c, c, 0, a, 0, a).fillRect(w - d, 0, d, h);
    return g;
  }

  // ------------------------------------------------------------------ hints

  private showHint(key: string): void {
    if (seenHints.has(key) || this.hintQueue.includes(key)) return;
    if (this.hintT > 0) { this.hintQueue.unshift(key); return; }
    this.displayHint(key);
  }

  private queueHint(key: string): void {
    if (seenHints.has(key) || this.hintQueue.includes(key)) return;
    if (this.hintT <= 0 && this.hint.alpha < 0.05) this.displayHint(key);
    else this.hintQueue.push(key);
  }

  /** Marks a hint as learnt without showing it (the player already did it). */
  private seenHint(key: string): void {
    seenHints.add(key);
    this.hintQueue = this.hintQueue.filter((k) => k !== key);
  }

  private displayHint(key: string): void {
    seenHints.add(key);
    this.hint.setText(t(key)).setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.hint, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.hintT = 4.6;
  }

  // ------------------------------------------------------------------ frame

  updateGame(_time: number, delta: number): void {
    this.tick(delta / 1000);
  }

  private tick(dt: number): void {
    this.time3 += dt;
    // all at once, a few frames in (the scene's first frames compile the world's shaders)
    this.frameN++;
    if (!this.thumbs.done && this.frameN > 3) {
      this.thumbs.flush();
      this.dock.syncIcons();
      // map cards pick up their pictures as they come
      for (const o of this.selectUi) {
        const img = o.getData?.('img') as Phaser.GameObjects.Image | undefined;
        const key = img?.getData('thumb') as string | undefined;
        if (img && key && img.texture.key !== key && this.textures.exists(key)) img.setTexture(key).clearTint().setDisplaySize(186, 186);
      }
    }
    const sim = this.sim;
    if (this.phase === 'play' && sim && !sim.over) {
      let left = dt * this.speed;
      while (left > 1e-6) {
        const h = Math.min(1 / 30, left);
        this.bot?.update(h);
        sim.step(h);
        for (const ev of sim.events) this.onEvent(ev);
        sim.events.length = 0;
        if (sim.over) break;
        left -= h;
      }
      sim.compact();
      if (this.bot) this.testSync();
    }
    const simDt = this.phase === 'play' ? dt * this.speed : dt;
    // towers
    if (sim) {
      for (const tw of sim.towers) {
        const v = this.towersV.get(tw.id);
        if (v) { this.animateBuild(v, dt); animateTower(v, tw.kind, tw.target ? tw.aim : v.yaw + simDt * 0.3, simDt); }
      }
    }
    this.enemiesV.update(simDt, this.time3, this.phase === 'play' && sim ? sim.enemies : []);
    this.fx.update(simDt, this.phase === 'play' && sim ? sim.shots : [], this.phase === 'play' && sim ? sim.meteors : []);
    this.board?.update(dt, this.time3, sim ? sim.lives / sim.maxLives : 1);
    this.markers.update(this.time3, dt);
    if (this.phase !== 'play' && this.modalRelease) this.syncModal();
    this.updateCamera(dt);
    // hints
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.tweens.add({ targets: this.hint, alpha: 0, duration: 350 });
    } else if (this.hintQueue.length && this.hint.alpha < 0.05) this.displayHint(this.hintQueue.shift()!);
    if (this.phase === 'play' && sim) this.updateHud(sim);
  }

  private updateHud(sim: Sim): void {
    this.setScore(this.runBase + sim.score);
    if (sim.gold !== this.lastGold) { this.goldChip.setText(String(sim.gold)); this.lastGold = sim.gold; }
    this.hud.setLives(sim.lives, sim.maxLives);
    // wave button
    const b = this.waveBtn;
    if (sim.wave === 0) {
      b.pill.setLabels(t('startWave', { n: 1 })).setEnabled(true).setColor(0x2f9e56);
      b.setKinds(sim.waveKinds(1));
      b.setScale(1 + Math.sin(this.time3 * 5) * 0.025);
    } else if (sim.wave < sim.totalWaves) {
      b.setScale(1);
      b.setKinds(sim.waveKinds(sim.wave + 1));
      if (sim.countdown > 0) b.pill.setLabels(`${t('callEarly')} · ${t('inSec', { n: Math.ceil(sim.countdown) })}`, t('earlyGold', { n: sim.earlyBonus() })).setEnabled(true).setColor(0x2f7fbf);
      else b.pill.setLabels(t('nextWave')).setEnabled(false);
    } else {
      b.setScale(1);
      b.setKinds([]);
      b.pill.setLabels(t('wavesDone')).setEnabled(false);
    }
    // panels follow the gold
    if (this.selTower && !sim.towers.includes(this.selTower)) this.deselect();
    if (this.selTower) this.towerCard.refresh(this.selTower, sim, this.sellArmed);
    if (this.dock.visible) {
      this.dock.refresh({
        gold: sim.gold, armed: this.armed, waiting: !!this.sel && !this.armed && !this.selTower,
        meteorCd: sim.meteorCd, meteorMax: METEOR.cooldown, meteorReady: sim.meteorReady(), time: this.time3,
      });
    }
    if (sim.meteorReady() && !this.meteorWasReady) {
      // the meteor charged: the card flashes once
      const c = this.dock.card('meteor');
      if (c && this.dock.visible) {
        this.tweens.add({ targets: c.box, scale: 1.12, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        if (sim.wave > 1) popup(this, this.dock.x + c.box.x, this.dock.y - 96, t('meteorReady'), '#ffc27a', 22);
      }
    }
    this.meteorWasReady = sim.meteorReady();
    this.updateMarkers(sim);
    this.syncModal();
    // health bars (sized with the camera's zoom) and the boss bar
    const g = this.bars.clear();
    const c = this.cam;
    const a = this.screen(c.x - 0.5, 0, c.z), bpt = this.screen(c.x + 0.5, 0, c.z);
    const unit = Math.max(40, Math.abs(bpt.x - a.x));
    let boss: Enemy | null = null;
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const def = ENEMIES[e.kind];
      if (def.boss && (!boss || e.hp / e.maxHp < boss.hp / boss.maxHp)) boss = e;
      if (e.hp >= e.maxHp && !def.boss) continue;
      const s = this.screen(e.x, this.enemiesV.headY(e.kind), e.z);
      const w = Math.round(unit * (def.boss ? 0.95 : 0.5)), h = Math.max(5, Math.round(unit * (def.boss ? 0.11 : 0.072)));
      const k = Math.max(0, e.hp / e.maxHp);
      g.fillStyle(0x000000, 0.6).fillRoundedRect(s.x - w / 2 - 2, s.y - h / 2 - 2, w + 4, h + 4, 3);
      g.fillStyle(k > 0.5 ? 0x5dff7a : k > 0.25 ? 0xffd23f : 0xff5a4a, 1).fillRect(s.x - w / 2, s.y - h / 2, w * k, h);
    }
    if (boss) {
      if (!this.bossOn) {
        this.bossOn = true;
        this.bossChip.setText(t('e_' + boss.kind)).setVisible(true);
        playMusic(this, 'boss');
      }
      const bg = this.bossBar.clear();
      const k = Math.max(0, boss.hp / boss.maxHp);
      bg.fillStyle(0x000000, 0.5).fillRoundedRect(-75, -8, 150, 16, 6);
      bg.fillStyle(0xff5a4a, 1).fillRoundedRect(-75, -8, Math.max(8, 150 * k), 16, 6);
    } else if (this.bossOn) {
      this.bossOn = false;
      this.bossChip.setVisible(false);
      playMusic(this, 'stage1');
    }
  }

  // ------------------------------------------------------------------ test hooks

  /** Runs the game for `seconds` of game time in fixed steps (headless screenshots). */
  testStep(seconds: number, dt = 1 / 30): void {
    for (let s = 0; s < seconds; s += dt) this.tick(dt);
  }

  /** The autopilot (bot.ts) builds, upgrades and calls waves. */
  testAuto(on = true): void {
    this.bot = on && this.sim ? new Bot(this.sim) : null;
    if (this.bot) for (const tw of this.sim!.towers) if (!this.towersV.has(tw.id)) this.addTowerView(tw, false);
  }

  /** Starts a map directly (screenshots). */
  testStart(i: number): void {
    const p = this.progress();
    for (let k = 0; k < i; k++) p.stars[k] = Math.max(1, p.stars[k]);
    storage.set(PROGRESS_KEY, p);
    for (const o of this.selectUi) o.destroy();
    this.selectUi = [];
    this.startMap(i);
  }

  /** Lets the test hook show towers the bot built. */
  testSync(): void {
    if (!this.sim) return;
    for (const tw of this.sim.towers) {
      const v = this.towersV.get(tw.id);
      if (!v || v.tier !== tw.tier) this.addTowerView(tw, false);
    }
  }

  /** Opens the tower card or the build bar on a cell (screenshots). */
  testTap(c: number, r: number, kind?: ArmKind): void {
    this.tapCell(c, r);
    if (kind) this.pickKind(kind);
  }

  /** Puts the camera where it is heading at once (checks click on tiles that must not move). */
  testSettle(): void {
    this.clampCam();
    this.cam.x = this.cam.tx;
    this.cam.z = this.cam.tz;
    this.cam.zoom = this.cam.tzoom;
    this.cam.yaw = 0;
    this.shakeT = 0;
    this.updateCamera(0);
    this.world.camera.updateMatrixWorld();
  }

  /** Game pixels of a tile's centre (the Playwright build checks click there). */
  testCellScreen(c: number, r: number): { x: number; y: number } {
    return this.screen(this.board!.X(c), GRASS_Y, this.board!.Z(r));
  }

  /** Game pixels of a dock card's centre. */
  testCardScreen(kind: ArmKind): { x: number; y: number } {
    const c = this.dock.card(kind)!;
    return { x: this.dock.x + c.box.x, y: this.dock.y + c.box.y };
  }

  /** Buildable tiles that show between the HUD and the dock (for the build checks). */
  testOpenTiles(): { c: number; r: number; x: number; y: number }[] {
    const out: { c: number; r: number; x: number; y: number }[] = [];
    const m = this.sim!.map;
    for (let r = 0; r < m.H; r++) for (let c = 0; c < m.W; c++) {
      if (!this.sim!.canBuild(c, r)) continue;
      const p = this.testCellScreen(c, r);
      if (p.y > 260 && p.y < 900 && p.x > 70 && p.x < 650) out.push({ c, r, x: p.x, y: p.y });
    }
    return out;
  }

  /** What the build flow holds right now. */
  testState(): { armed: string | null; sel: { c: number; r: number } | null; tower: number | null; towers: number; gold: number; hover: { c: number; r: number } | null; ghost: boolean; mouse: boolean } {
    return {
      armed: this.armed, sel: this.sel, tower: this.selTower?.id ?? null, towers: this.sim?.towers.length ?? 0, gold: this.sim?.gold ?? 0,
      hover: this.hover, ghost: !!this.markers.ghost?.root.parent, mouse: this.mouse,
    };
  }

  /** Draw calls of the last rendered frame. */
  testDrawCalls(): { calls: number; triangles: number; geometries: number; textures: number } {
    const i = this.world.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
