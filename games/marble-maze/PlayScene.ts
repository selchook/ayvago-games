import Phaser from 'phaser';
import { ArcadeScene, Controls, Button, txt, t, loc, burst, shake, flash, popup, storage, isEasy, COLORS, hudChip, HudChip, HUD_MARGIN, HUD_GAP, HUD_ROW2_Y } from '@core';
import { World3D, THREE } from '@core/three';
import { LEVELS, WORLDS, LEVELS_PER_WORLD } from './levels';
import { THEMES, type Theme } from './look';
import { Board3D, envMap, CHANNEL_COLORS } from './board';
import { Sim, parseLevel, TUNE, T, type Tuning } from './sim';
import { Bot } from './bot';
import { boardTilt, controlMode } from './tilt-board';
import { RollLoop } from './rollsound';

/** Normal and Easy side by side (§7c). Easy: slower, softer marble, smaller holes, more marbles, longer star times. */
interface RunTuning { sim: Tuning; marbles: number; parScale: number }
export const TUNING: Record<'normal' | 'easy', RunTuning> = {
  normal: { sim: TUNE.normal, marbles: 5, parScale: 1 },
  easy: { sim: TUNE.easy, marbles: 8, parScale: 1.35 },
};
const MAX_MARBLES = 9;
/** Board tilt shown on screen at full input (radians). */
const VIS_TILT = 0.12;
const FOV = 34;
const PITCH = (72 * Math.PI) / 180;
const KEY_PROGRESS = 'marble-maze:progress';
const HUD_TOP = 150;   // world px kept clear for the HUD rows

type Phase = 'select' | 'intro' | 'play' | 'fall' | 'goal' | 'clear';

interface Progress { stars: number[]; times: number[] }

/** Time as m:ss (or s.s under a minute in the result lines). */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class PlayScene extends ArcadeScene {
  private world!: World3D;
  private controls!: Controls;
  private board: Board3D | null = null;
  private sim: Sim | null = null;
  private bot: Bot | null = null;
  private theme: Theme = THEMES[0];
  private phase: Phase = 'select';
  private li = 0;
  private focus = 0;
  private marbles = 5;
  private runBest = new Map<number, number>();
  private levelTime = 0;
  private phaseTime = 0;
  private tune: Tuning = TUNE.normal;
  private parScale = 1;
  private camT = new THREE.Vector3();
  private camDist = 30;
  private camFrom: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  private fallInfo: { kind: 'hole' | 'void'; x: number; y: number; vx: number; vy: number; h: number; vh: number } | null = null;
  private roll!: RollLoop;
  private selectUi: Phaser.GameObjects.GameObject[] = [];
  private playUi: Phaser.GameObjects.GameObject[] = [];
  private panelUi: Phaser.GameObjects.GameObject[] = [];
  private focusRing: Phaser.GameObjects.Graphics | null = null;
  private infoGems!: HudChip;
  private infoKeys!: HudChip;
  private infoPar!: HudChip;
  private infoTime!: HudChip;
  private previewTimer: Phaser.Time.TimerEvent | null = null;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trailClock = 0;
  private tiltBtn: Phaser.GameObjects.Container | null = null;
  private panelKeys: { next?: () => void; retry?: () => void; levels?: () => void } = {};
  /** Test hooks: the level bot drives the marble; game time runs this many times faster. */
  autopilot = false;
  testSpeed = 1;
  readonly tiltReader = boardTilt;
  /** The last input the marble got (tests). */
  lastInput: [number, number] = [0, 0];
  /** Tuning in use (exposed for the Easy/Normal test). */
  tuneInfo: RunTuning = TUNING.normal;

  createGame(): void {
    const easy = isEasy();
    this.tuneInfo = easy ? TUNING.easy : TUNING.normal;
    this.tune = this.tuneInfo.sim;
    this.parScale = this.tuneInfo.parScale;
    this.marbles = this.tuneInfo.marbles;
    this.runBest = new Map();
    this.board = null;
    this.sim = null;
    this.bot = null;
    this.phase = 'select';
    this.selectUi = [];
    this.playUi = [];
    this.panelUi = [];
    this.focusRing = null;
    this.fallInfo = null;
    this.camFrom = null;
    this.tiltBtn = null;
    this.previewTimer = null;
    this.panelKeys = {};
    this.autopilot = false;
    this.trailClock = 0;
    const prog = this.progress();
    this.focus = Math.min(LEVELS.length - 1, Math.max(0, prog.stars.findIndex((s) => !s)));
    if (this.focus < 0 || !this.unlocked(this.focus)) this.focus = 0;
    this.li = this.focus;

    this.world = new World3D(this, { fov: FOV, background: THEMES[0].bg });
    this.world.addLights({ ambient: 1.6, intensity: 2.3, extent: 10, dir: [-0.5, 1, 0.45] });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.board?.dispose();
      this.board = null;
    });
    this.controls = new Controls(this, { joystick: true });
    this.roll = new RollLoop(this);
    this.makeTextures();
    this.trail = this.add.particles(0, 0, 'mm-dot', {
      lifespan: 420, speed: { min: 6, max: 30 }, scale: { start: 0.55, end: 0 }, alpha: { start: 0.8, end: 0 }, emitting: false,
    }).setDepth(-60);

    // second HUD row: gems and keys on the left, the time and the time for the star on the right
    const row = HUD_ROW2_Y, width = this.scale.width;
    this.infoGems = hudChip(this, HUD_MARGIN, row, { icon: 'mm-gem', iconSize: 26, text: '0/0', minWidth: 112 });
    this.infoKeys = hudChip(this, this.infoGems.right + HUD_GAP, row, { icon: 'mm-key', iconSize: 26, text: '0/0', color: '#ffd23f', minWidth: 112 });
    this.infoPar = hudChip(this, width - HUD_MARGIN, row, { align: 'right', icon: 'icon-star', iconSize: 26, text: '0:00', color: '#ffe9a8' });
    this.infoPar.icon?.setTint(0xffd23f);
    this.infoTime = hudChip(this, this.infoPar.left - HUD_GAP, row, { align: 'right', text: '0:00', minWidth: 96 });
    this.hud.setLives(this.marbles, this.marbles);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    (window as unknown as { __mm?: PlayScene }).__mm = this;

    // tilt: the same reading as the menu chose; Android starts without a tap, iOS may need one
    if (controlMode() === 'tilt' && this.controls.touchUi && !boardTilt.active) {
      void boardTilt.enable().then((r) => {
        if (r !== 'on' && this.scene.isActive()) this.showTiltAsk();
      });
    }
    this.showSelect();
  }

  // ------------------------------------------------------------------ progress

  private progress(): Progress {
    const p = storage.get<Progress>(KEY_PROGRESS, { stars: [], times: [] });
    return { stars: Array.isArray(p.stars) ? p.stars : [], times: Array.isArray(p.times) ? p.times : [] };
  }

  private unlocked(i: number): boolean {
    return i === 0 || (this.progress().stars[i - 1] ?? 0) > 0;
  }

  private par(i: number): number {
    return Math.round(LEVELS[i].par * this.parScale);
  }

  // ------------------------------------------------------------------ textures

  private makeTextures(): void {
    if (this.textures.exists('mm-dot')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8);
    g.generateTexture('mm-dot', 16, 16);
    g.clear();
    // a cut gem
    g.fillStyle(0x7cf0ff, 1).fillPoints([{ x: 14, y: 2 }, { x: 26, y: 11 }, { x: 14, y: 28 }, { x: 2, y: 11 }], true);
    g.fillStyle(0xffffff, 0.75).fillPoints([{ x: 14, y: 2 }, { x: 20, y: 11 }, { x: 8, y: 11 }], true);
    g.lineStyle(2, 0x1a5f8a, 1).strokePoints([{ x: 14, y: 2 }, { x: 26, y: 11 }, { x: 14, y: 28 }, { x: 2, y: 11 }], true);
    g.generateTexture('mm-gem', 28, 30);
    g.clear();
    // a key
    g.fillStyle(0xffd23f, 1).fillCircle(9, 14, 8).fillRect(14, 11, 16, 6).fillRect(24, 17, 4, 6).fillRect(18, 17, 4, 4);
    g.fillStyle(0x6b4a00, 1).fillCircle(9, 14, 3);
    g.generateTexture('mm-key', 32, 28);
    g.clear();
    // a padlock
    g.lineStyle(6, 0xb9b6cc, 1).strokeRoundedRect(8, 2, 20, 26, 10);
    g.fillStyle(0xb9b6cc, 1).fillRoundedRect(2, 16, 32, 24, 6);
    g.fillStyle(0x2a2540, 1).fillCircle(18, 26, 4).fillRect(16, 26, 4, 8);
    g.generateTexture('mm-lock', 36, 42);
    g.destroy();
  }

  // ------------------------------------------------------------------ level select

  private clearUi(list: Phaser.GameObjects.GameObject[]): void {
    for (const o of list) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    list.length = 0;
  }

  private showSelect(): void {
    this.phase = 'select';
    this.clearUi(this.panelUi);
    this.clearUi(this.playUi);
    this.clearUi(this.selectUi);
    this.panelKeys = {};
    this.focusRing = null;
    this.hud.setCenter(' ');
    this.setInfoVisible(false);
    this.roll.set(0, 'air');
    this.preview(this.focus);
    const add = <O extends Phaser.GameObjects.GameObject>(o: O): O => { this.selectUi.push(o); return o; };
    const { width } = this.scale;
    add(this.add.rectangle(0, 0, width, this.scale.height, 0x080610, 0.5).setOrigin(0).setDepth(-40));
    add(txt(this, width / 2, 140, t('chooseLevel'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 8 }).setDepth(10));
    const prog = this.progress();
    const total = prog.stars.reduce((a, b) => a + (b || 0), 0);
    add(this.add.image(width / 2 - 52, 196, 'icon-star').setScale(0.5).setTint(0xffd23f).setDepth(10));
    add(txt(this, width / 2 - 24, 196, `${total} / ${LEVELS.length * 3}`, { size: 30 }).setOrigin(0, 0.5).setDepth(10));
    WORLDS.forEach((w, wi) => {
      const th = THEMES[wi];
      const y0 = 268 + wi * 214;
      add(txt(this, 49, y0, `${t('worldN', { n: wi + 1 })} · ${loc(w.name)}`, { title: true, size: 22, color: th.accent }).setOrigin(0, 0.5).setDepth(10));
      for (let k = 0; k < LEVELS_PER_WORLD; k++) {
        const i = wi * LEVELS_PER_WORLD + k;
        const { x, y } = this.tilePos(i);
        const open = this.unlocked(i);
        const st = prog.stars[i] ?? 0;
        const box = add(this.add.container(x, y).setDepth(10));
        const g = this.add.graphics();
        const col = Phaser.Display.Color.HexStringToColor(th.accent).color;
        g.fillStyle(0x000000, 0.35).fillRoundedRect(-46, -40, 92, 92, 18);
        g.fillStyle(open ? 0x1c1830 : 0x15131f, 0.92).fillRoundedRect(-46, -46, 92, 92, 18);
        g.lineStyle(3, open ? col : 0x3a3552, open ? 0.95 : 0.6).strokeRoundedRect(-46, -46, 92, 92, 18);
        box.add(g);
        if (open) {
          box.add(txt(this, 0, -12, String(i + 1), { title: true, size: 34, color: '#ffffff', strokeThickness: 5 }));
          for (let s = 0; s < 3; s++) {
            box.add(this.add.image((s - 1) * 26, 26, 'icon-star').setScale(0.36).setTint(st > s ? 0xffd23f : 0x3f3a58));
          }
          box.setSize(92, 92).setInteractive({ useHandCursor: true });
          box.on('pointerup', () => {
            if (this.phase !== 'select') return;
            this.focus = i;
            this.startLevel(i);
          });
          box.on('pointerover', () => { if (this.phase === 'select' && this.focus !== i) { this.focus = i; this.placeFocus(); } });
        } else {
          box.add(this.add.image(0, 0, 'mm-lock').setScale(0.9).setAlpha(0.7));
          box.setSize(92, 92).setInteractive();
          box.on('pointerup', () => {
            if (this.phase !== 'select') return;
            this.sfx('locked', { volume: 0.4 });
            this.tweens.add({ targets: box, x: x + 8, duration: 50, yoyo: true, repeat: 2 });
          });
        }
        box.setScale(0);
        this.tweens.add({ targets: box, scale: 1, duration: 260, delay: 40 + i * 14, ease: 'Back.easeOut' });
      }
    });
    this.focusRing = add(this.add.graphics().setDepth(11));
    this.focusRing.lineStyle(5, 0xffffff, 1).strokeRoundedRect(-53, -53, 106, 106, 22);
    this.placeFocus();
    if (this.score > 0) {
      add(new Button(this, width / 2, 1150, t('finishRun', { score: this.score }), () => this.finishRun(), { width: 420, height: 92, size: 30, color: COLORS.green }).setDepth(10));
    } else {
      add(txt(this, width / 2, 1150, t('selectHint'), { size: 26, color: '#cfcadf', wrap: 600 }).setDepth(10));
    }
  }

  private tilePos(i: number): { x: number; y: number } {
    const wi = Math.floor(i / LEVELS_PER_WORLD), k = i % LEVELS_PER_WORLD;
    return { x: 95 + k * 106, y: 268 + wi * 214 + 88 };
  }

  private placeFocus(): void {
    if (!this.focusRing) return;
    const { x, y } = this.tilePos(this.focus);
    this.tweens.killTweensOf(this.focusRing);
    this.focusRing.setPosition(x, y).setAlpha(1);
    this.tweens.add({ targets: this.focusRing, alpha: 0.35, duration: 520, yoyo: true, repeat: -1 });
    // rebuilding the 3D preview is not free: wait until the cursor rests on a level
    this.previewTimer?.remove();
    this.previewTimer = this.time.delayedCall(180, () => {
      if (this.phase === 'select') this.preview(this.focus);
    });
  }

  /** The level under the cursor, built in 3D behind the grid. */
  private preview(i: number): void {
    if (this.board && this.li === i && this.phase === 'select' && this.sim) return;
    this.buildLevel(i);
  }

  private buildLevel(i: number): void {
    this.li = i;
    this.board?.dispose();
    const wi = Math.floor(i / LEVELS_PER_WORLD);
    this.theme = THEMES[wi];
    const th = this.theme;
    const lv = LEVELS[i];
    const L = parseLevel(lv.map, lv.movers ?? [], isEasy());
    this.sim = new Sim(L, this.tune);
    this.world.scene.background = new THREE.Color(th.bg);
    this.world.scene.fog = th.fog ? new THREE.Fog(th.fog.color, th.fog.near, th.fog.far) : null;
    this.relight(th);
    this.board = new Board3D(this.world.scene, L, th, envMap(this.world.renderer), i * 7 + 3);
    this.board.setGoalLocked(L.keys.length > 0);
    // fit the board's width (and a little margin) into the portrait view
    const tanH = Math.tan((FOV * Math.PI) / 360) * (this.scale.width / this.scale.height);
    this.camDist = (L.w + 0.6) / 0.95 / (2 * tanH);
    this.camT.set(L.w / 2, 0, L.h / 2);
    this.camT.z = this.camTargetZ(L.start.y);
    this.placeCamera(0, true);
  }

  private relight(th: Theme): void {
    this.world.scene.traverse((o) => {
      const l = o as THREE.Light;
      if ((l as THREE.HemisphereLight).isHemisphereLight) {
        const h = l as THREE.HemisphereLight;
        h.color.setHex(th.sky);
        h.groundColor.setHex(th.ground);
        h.intensity = th.ambient;
      } else if ((l as THREE.DirectionalLight).isDirectionalLight) {
        l.color.setHex(th.sun);
        l.intensity = th.sunPower;
      }
    });
  }

  /**
   * The camera's focus row: the whole board when it fits between the HUD and the bottom edge,
   * otherwise following the marble without showing much past either end.
   */
  private camTargetZ(marbleY: number): number {
    const L = this.sim!.L;
    const D = this.camDist, half = (FOV * Math.PI) / 360;
    const tanTop = Math.tan(half) * (1 - (2 * HUD_TOP) / this.scale.height);
    const aTop = Math.atan(tanTop);
    // distances along the board from the focus to where the top (below the HUD) and bottom edges look
    const top = (D * Math.sin(PITCH)) / Math.tan(PITCH - aTop) - D * Math.cos(PITCH);
    const bottom = D * Math.cos(PITCH) - (D * Math.sin(PITCH)) / Math.tan(PITCH + half);
    if (L.h <= top + bottom) return (L.h + top - bottom) / 2;
    return Phaser.Math.Clamp(marbleY, top - 0.3, L.h - bottom + 0.3);
  }

  private placeCamera(dt: number, snap = false): void {
    if (!this.sim || !this.board) return;
    const sim = this.sim;
    const want = this.phase === 'select' ? this.camTargetZ(sim.L.h / 2) : this.camTargetZ(sim.y + sim.vy * 0.25);
    this.camT.x = sim.L.w / 2;
    if (snap) this.camT.z = want;
    else this.camT.z += (want - this.camT.z) * Math.min(1, dt * 2.6);
    const cam = this.world.camera;
    const pos = new THREE.Vector3(this.camT.x, Math.sin(PITCH) * this.camDist, this.camT.z + Math.cos(PITCH) * this.camDist);
    if (this.phase === 'select') {
      // a slow sway over the previewed board
      const a = this.phaseTime * 0.25;
      pos.x += Math.sin(a) * 3;
      pos.z += 2;
    }
    if (this.camFrom) {
      const k = Phaser.Math.Easing.Cubic.InOut(Math.min(1, this.phaseTime / 1.4));
      cam.position.copy(this.camFrom.pos).lerp(pos, k);
      const look = this.camFrom.look.clone().lerp(this.camT, k);
      cam.lookAt(look);
      if (k >= 1) this.camFrom = null;
    } else {
      cam.position.copy(pos);
      cam.lookAt(this.camT);
    }
    // the board tilts about the focus
    const b = this.board;
    b.pivot.position.copy(this.camT);
    b.board.position.set(-this.camT.x, 0, -this.camT.z);
    b.pivot.rotation.set(sim.tiltY * VIS_TILT, 0, -sim.tiltX * VIS_TILT);
    this.world.followSun(this.camT);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    if (this.phase === 'select') {
      const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -LEVELS_PER_WORLD, ArrowDown: LEVELS_PER_WORLD, a: -1, d: 1, w: -LEVELS_PER_WORLD, s: LEVELS_PER_WORLD };
      const d = step[e.key];
      if (d) {
        const n = this.focus + d;
        if (n >= 0 && n < LEVELS.length && this.unlocked(n)) {
          this.focus = n;
          this.sfx('move', { volume: 0.4 });
          this.placeFocus();
        }
      } else if (e.key === 'Enter' || e.key === ' ') this.startLevel(this.focus);
      return;
    }
    if (this.phase === 'clear') {
      if ((e.key === 'Enter' || e.key === ' ') && this.panelKeys.next) this.panelKeys.next();
      else if ((e.key === 'r' || e.key === 'R') && this.panelKeys.retry) this.panelKeys.retry();
      else if ((e.key === 'l' || e.key === 'L' || e.key === 'Backspace') && this.panelKeys.levels) this.panelKeys.levels();
      return;
    }
    if ((e.key === 'c' || e.key === 'C') && boardTilt.active) this.centreTilt();
  }

  // ------------------------------------------------------------------ a level

  private setInfoVisible(v: boolean): void {
    const keys = v && !!this.sim?.L.keys.length;
    for (const o of [this.infoGems, this.infoPar, this.infoTime]) o.setVisible(v);
    this.infoKeys.setVisible(keys);
  }

  private startLevel(i: number): void {
    if (this.isOver || !this.unlocked(i)) return;
    this.clearUi(this.selectUi);
    this.clearUi(this.panelUi);
    this.clearUi(this.playUi);
    this.panelKeys = {};
    this.focusRing = null;
    this.sfx('pick', { volume: 0.5 });
    // where the camera is now (the preview) is where the swoop starts
    const cam = this.world.camera;
    const look = new THREE.Vector3();
    cam.getWorldDirection(look);
    const from = { pos: cam.position.clone(), look: cam.position.clone().add(look.multiplyScalar(this.camDist)) };
    this.buildLevel(i);
    if (this.phase === 'select' || this.phase === 'clear') {
      // a high overview of the whole board first
      from.pos.set(this.sim!.L.w / 2, this.camDist * 1.25, this.sim!.L.h / 2 + 6);
      from.look.set(this.sim!.L.w / 2, 0, this.sim!.L.h / 2);
    }
    this.camFrom = from;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.levelTime = 0;
    this.fallInfo = null;
    this.bot = null;
    const lv = LEVELS[i];
    const wi = Math.floor(i / LEVELS_PER_WORLD);
    this.hud.setCenter('');
    this.hud.setLevel(`${wi + 1}-${(i % LEVELS_PER_WORLD) + 1}`);
    this.setInfoVisible(true);
    this.updateInfo();
    // the level's name, and a hint when it brings a new idea
    const { width, height } = this.scale;
    const add = <O extends Phaser.GameObjects.GameObject>(o: O): O => { this.playUi.push(o); return o; };
    const name = add(txt(this, width / 2, height * 0.36, loc(lv.name), { title: true, size: 48, color: '#ffffff', strokeThickness: 10, wrap: 640 }).setDepth(50));
    name.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: name, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut' });
    this.tweens.add({ targets: name, alpha: 0, delay: 1500, duration: 400 });
    if (lv.tip) {
      const tip = add(txt(this, width / 2, height * 0.36 + 76, loc(lv.tip), { size: 30, color: '#ffe9a8', wrap: 600, strokeThickness: 6 }).setDepth(50));
      tip.setAlpha(0);
      this.tweens.add({ targets: tip, alpha: 1, delay: 250, duration: 300 });
      this.tweens.add({ targets: tip, alpha: 0, delay: 3600, duration: 500 });
    }
    // touch helpers: centre the tilt (tilt mode) and the hint for a stick anywhere
    if (this.controls.touchUi && controlMode() === 'tilt') this.addCentreButton();
    if (this.controls.touchUi && controlMode() === 'tilt' && !boardTilt.active) this.showTiltAsk();
  }

  private addCentreButton(): void {
    const { width, height } = this.scale;
    const c = this.add.container(width - 92, height - 92).setDepth(9400);
    const g = this.add.graphics();
    g.fillStyle(0x0b1020, 0.55).fillCircle(0, 0, 62).lineStyle(3, 0xffffff, 0.45).strokeCircle(0, 0, 62);
    g.lineStyle(4, 0xffd23f, 1).strokeCircle(0, -10, 18).lineBetween(-26, -10, 26, -10).lineBetween(0, -36, 0, 16);
    c.add([g, txt(this, 0, 34, t('centre'), { title: true, size: 16, strokeThickness: 4 })]);
    c.setSize(124, 124).setInteractive({ useHandCursor: true });
    c.on('pointerup', () => this.centreTilt());
    this.playUi.push(c);
  }

  private centreTilt(): void {
    boardTilt.calibrate();
    this.sfx('beep', { volume: 0.4 });
    popup(this, this.scale.width / 2, 260, t('centred'), '#5dff7a', 24);
  }

  /** iOS wants a tap before the motion sensors start: a pulsing TURN TILT ON button. */
  private showTiltAsk(): void {
    if (this.tiltBtn || boardTilt.active) return;
    const { width, height } = this.scale;
    const btn = new Button(this, width / 2, height - 220, t('tiltAsk'), () => {
      void boardTilt.enable().then((r) => {
        if (!this.scene.isActive()) return;
        if (r === 'on') {
          this.tiltBtn?.destroy();
          this.tiltBtn = null;
          boardTilt.calibrate();
          popup(this, width / 2, 260, t('centred'), '#5dff7a', 24);
        } else popup(this, width / 2, height - 320, t(r === 'denied' ? 'tiltDenied' : 'tiltNone'), '#ff9a7a', 22);
      });
    }, { width: 360, height: 90, size: 28, color: COLORS.purple }).setDepth(9450);
    this.tweens.add({ targets: btn, scale: 1.06, duration: 500, yoyo: true, repeat: -1 });
    this.tiltBtn = btn;
  }

  private updateInfo(): void {
    if (!this.sim) return;
    const L = this.sim.L;
    this.infoGems.setText(`${this.sim.gems}/${L.gems.length}`);
    this.infoKeys.setText(`${this.sim.keys}/${L.keys.length}`);
    const par = this.par(this.li);
    this.infoPar.setText(clock(par)).setTextColor(this.levelTime <= par ? '#ffe9a8' : '#8a849c');
    this.infoTime.setText(clock(this.levelTime)).setAnchor(this.infoPar.left - HUD_GAP, HUD_ROW2_Y);
  }

  /** Input from the keys, the stick or the phone's tilt (or the bot in tests). */
  private readInput(dt: number): [number, number] {
    boardTilt.update(dt);
    if (this.autopilot && this.sim) {
      this.bot ??= new Bot(this.sim);
      return this.bot.input();
    }
    const c = this.controls;
    if (c.stickActive || c.axisX || c.axisY) return [c.axisX, c.axisY];
    if (boardTilt.active && controlMode() === 'tilt') return [boardTilt.x, boardTilt.y];
    return [0, 0];
  }

  updateGame(_time: number, delta: number): void {
    const dt = (delta / 1000) * this.testSpeed;
    this.phaseTime += dt;
    const sim = this.sim, board = this.board;
    if (!sim || !board) return;
    const time = this.time.now / 1000;
    if (this.phase === 'select' || this.phase === 'clear') {
      // the board rocks gently behind the grid and the result card
      sim.tiltX = Math.sin(time * 0.6) * 0.35;
      sim.tiltY = Math.cos(time * 0.45) * 0.3;
      board.sync(sim, dt, time, this.phase === 'select');
      this.placeCamera(dt);
      this.roll.set(0, 'air');
      return;
    }
    if (this.phase === 'intro') {
      this.roll.set(0, 'air');
      if (this.phaseTime >= 1.5) this.go();
      board.sync(sim, dt, time);
      this.placeCamera(dt);
      return;
    }
    const [ix, iy] = this.phase === 'play' ? this.readInput(dt) : [0, 0];
    this.lastInput = [ix, iy];
    if (this.phase === 'play') {
      this.levelTime += dt;
      sim.step(dt, ix, iy);
      for (const e of sim.events) this.onEvent(e);
      this.updateInfo();
      this.rollFx(dt);
    } else {
      // movers keep swinging while the marble falls or sinks into the goal
      sim.step(dt, 0, 0);
      this.roll.set(0, 'air');
    }
    if (this.phase === 'fall') this.animateFall(dt);
    if (this.phase === 'goal') this.animateGoal(dt);
    board.sync(sim, dt, time, this.phase === 'play');
    this.placeCamera(dt);
  }

  private go(): void {
    this.phase = 'play';
    this.phaseTime = 0;
    if (boardTilt.active) boardTilt.calibrate();
    this.sfx('beep', { volume: 0.5, exact: true, rate: 1.4 });
    const g = txt(this, this.scale.width / 2, this.scale.height * 0.42, t('go'), { title: true, size: 64, color: '#5dff7a', strokeThickness: 10 }).setDepth(50);
    this.playUi.push(g);
    g.setScale(0.4);
    this.tweens.add({ targets: g, scale: 1.25, alpha: 0, duration: 650, ease: 'Quad.easeOut' });
  }

  /** Screen position of a board point (for 2D effects). */
  private screen(x: number, y: number, h = 0.3): { x: number; y: number } {
    const v = new THREE.Vector3(x, h, y);
    this.board!.board.localToWorld(v);
    return this.world.toScreen(v);
  }

  private rollFx(dt: number): void {
    const sim = this.sim!;
    const sp = Math.hypot(sim.vx, sim.vy);
    const air = sim.h > 0;
    const surf = sim.surface;
    const kind = air ? 'air' : surf === T.ICE ? 'ice' : surf === T.SAND ? 'sand' : this.theme.key === 'wood' || surf === T.BRIDGE ? 'wood' : 'floor';
    this.roll.set(sp, kind);
    // sparkles on ice, dust on sand and snow
    this.trailClock -= dt;
    if (!air && sp > 1.6 && (surf === T.ICE || surf === T.SAND) && this.trailClock <= 0) {
      this.trailClock = 0.04;
      const p = this.screen(sim.x, sim.y, 0.05);
      const ice = surf === T.ICE;
      this.trail.setParticleTint(ice ? 0xdff8ff : this.theme.key === 'ice' ? 0xffffff : 0xd9b46a);
      this.trail.emitParticleAt(p.x, p.y, ice ? 2 : 3);
    }
  }

  private onEvent(e: Sim['events'][number]): void {
    const sim = this.sim!, board = this.board!;
    switch (e.type) {
      case 'wall': {
        const p = this.screen(e.x, e.y);
        const v = Math.min(1, e.speed / 6);
        this.sfxAt(Math.random() < 0.5 ? 'click' : 'click2', p.x, { volume: 0.25 + v * 0.6 });
        if (e.speed > 4.2) {
          this.sfxAt('knock', p.x, { volume: 0.35 * v });
          shake(this, 0.004 + v * 0.006, 120);
          burst(this, p.x, p.y, [0xffffff, 0xffe9a8], 6, 120);
        }
        break;
      }
      case 'bumper': {
        board.bumpers[e.i].hit = 1;
        const p = this.screen(e.x, e.y, 0.4);
        this.sfxAt('bumper', p.x, { volume: 0.7 });
        burst(this, p.x, p.y, [0xffd23f, 0xff6b4a, 0xffffff], 12, 260);
        shake(this, 0.006, 110);
        break;
      }
      case 'jump': {
        board.pads[e.i].hit = 1;
        this.sfx('pad', { volume: 0.7 });
        const p = this.screen(sim.x, sim.y, 0.1);
        burst(this, p.x, p.y, [0xffd23f, 0xffffff], 10, 200);
        break;
      }
      case 'land':
        this.sfx('land', { volume: 0.6 });
        if (e.speed > 3) shake(this, 0.005, 100);
        break;
      case 'gem': {
        const gem = board.gems[e.i];
        const p = this.screen(gem.x, gem.y, 0.4);
        this.sfxAt('gem', p.x, { volume: 0.7 });
        burst(this, p.x, p.y, [0x7cf0ff, 0xc77dff, 0xffffff], 16, 260);
        popup(this, p.x, p.y - 30, `${sim.gems}/${sim.L.gems.length}`, '#7cf0ff', 26);
        this.tweens.add({ targets: gem.obj.scale, x: 2.6, y: 2.6, z: 2.6, duration: 160, yoyo: true, onComplete: () => { gem.obj.visible = false; } });
        this.tweens.add({ targets: gem.obj.position, y: 1.2, duration: 320 });
        this.pulse(this.infoGems);
        break;
      }
      case 'key': {
        const key = board.keys[e.i];
        const p = this.screen(key.x, key.y, 0.4);
        this.sfxAt('key', p.x, { volume: 0.7 });
        burst(this, p.x, p.y, [0xffd23f, 0xfff3b0], 18, 280);
        this.tweens.add({ targets: key.obj.position, y: 1.6, duration: 380, ease: 'Quad.easeIn', onComplete: () => { key.obj.visible = false; } });
        this.pulse(this.infoKeys);
        if (sim.allKeys) {
          board.setGoalLocked(false);
          this.time.delayedCall(350, () => {
            this.sfx('unlock', { volume: 0.7, exact: true });
            const g = this.screen(sim.L.goal.x, sim.L.goal.y, 0.4);
            popup(this, g.x, g.y - 40, t('goalOpen'), '#5dff7a', 26);
            burst(this, g.x, g.y, [0x5dff7a, 0xffffff], 18, 240);
          });
        }
        break;
      }
      case 'switch': {
        const s = sim.L.switches[e.i];
        const p = this.screen(s.x, s.y, 0.2);
        const col = CHANNEL_COLORS[(e.ch - 1) % 3];
        this.sfxAt('button', p.x, { volume: 0.7 });
        this.time.delayedCall(120, () => this.sfx('gate', { volume: 0.6 }));
        burst(this, p.x, p.y, [col, 0xffffff], 14, 220);
        popup(this, this.scale.width / 2, 300, t('gateOpen'), Phaser.Display.Color.IntegerToColor(col).rgba, 26);
        break;
      }
      case 'checkpoint': {
        board.checkpointOn(e.i);
        const c = sim.L.checkpoints[e.i];
        const p = this.screen(c.x, c.y, 0.3);
        this.sfxAt('checkpoint', p.x, { volume: 0.6 });
        burst(this, p.x, p.y, [0x5dff7a, 0xffffff], 14, 220);
        popup(this, p.x, p.y - 40, t('checkpoint'), '#5dff7a', 24);
        break;
      }
      case 'locked': {
        const g = this.screen(sim.L.goal.x, sim.L.goal.y, 0.4);
        this.sfx('locked', { volume: 0.5 });
        popup(this, g.x, g.y - 40, t('keysFirst', { n: sim.keys, max: sim.L.keys.length }), '#ff9a7a', 24);
        break;
      }
      case 'fall':
        this.startFall(e.kind, e.x, e.y);
        break;
      case 'goal':
        this.startGoal();
        break;
    }
  }

  private pulse(o: HudChip): void {
    this.tweens.killTweensOf(o);
    o.setScale(1);
    this.tweens.add({ targets: o, scale: 1.18, duration: 120, yoyo: true });
  }

  // ------------------------------------------------------------------ falling

  private startFall(kind: 'hole' | 'void', x: number, y: number): void {
    const sim = this.sim!;
    this.phase = 'fall';
    this.phaseTime = 0;
    this.fallInfo = { kind, x: kind === 'hole' ? x : sim.x, y: kind === 'hole' ? y : sim.y, vx: sim.vx, vy: sim.vy, h: 0, vh: 0 };
    this.sfx('fall', { volume: 0.55 });
    this.marbles--;
    this.hud.setLives(this.marbles, Math.max(this.marbles, this.tuneInfo.marbles));
    if (this.bot) this.bot = null;
  }

  private animateFall(dt: number): void {
    const f = this.fallInfo!, m = this.board!.marble, sim = this.sim!;
    const tt = this.phaseTime;
    if (f.kind === 'hole') {
      // slides to the hole's centre and drops down the shaft
      const k = Math.min(1, tt / 0.18);
      m.position.x += (f.x - m.position.x) * Math.min(1, k * 0.6 + dt * 10);
      m.position.z += (f.y - m.position.z) * Math.min(1, k * 0.6 + dt * 10);
      f.vh -= 18 * dt;
      f.h += f.vh * dt;
      m.position.y = 0.3 + Math.max(-1.6, f.h);
      if (f.h < -0.6 && !m.userData.plopped) {
        m.userData.plopped = true;
        this.sfx('plop', { volume: 0.6 });
        const p = this.screen(f.x, f.y, 0);
        burst(this, p.x, p.y, [0x2a2540, 0x4a4560], 8, 90);
      }
    } else {
      f.vh -= 22 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.h += f.vh * dt;
      m.position.set(f.x, 0.3 + f.h, f.y);
      const water = this.theme.voidKind === 'water' && f.h < this.theme.belowY;
      if (water && !m.userData.plopped) {
        m.userData.plopped = true;
        this.sfx('plop', { volume: 0.7 });
        const p = this.screen(f.x, f.y, this.theme.belowY);
        burst(this, p.x, p.y, [0x9fe2ff, 0xffffff, 0x3f9fd8], 22, 260);
        m.visible = false;
      }
      m.scale.setScalar(Math.max(0.2, 1 + f.h * 0.08));
    }
    if (tt > 1.05) {
      m.userData.plopped = false;
      m.scale.setScalar(1);
      if (this.marbles <= 0) {
        m.visible = false;
        this.phase = 'clear';
        this.sfx('lose', { volume: 0.6 });
        this.endGame({ win: false, title: t('noMarbles'), delay: 300 });
        return;
      }
      sim.respawn();
      this.board!.sync(sim, 0, 0);
      m.visible = true;
      m.scale.setScalar(0.1);
      this.tweens.add({ targets: m.scale, x: 1, y: 1, z: 1, duration: 300, ease: 'Back.easeOut' });
      this.sfx('respawn', { volume: 0.45 });
      const p = this.screen(sim.x, sim.y, 0.3);
      burst(this, p.x, p.y, [0xffffff, this.theme.marble[0]], 14, 200);
      this.phase = 'play';
      this.phaseTime = 0;
    }
  }

  // ------------------------------------------------------------------ the goal

  private startGoal(): void {
    this.phase = 'goal';
    this.phaseTime = 0;
    this.roll.set(0, 'air');
    const sim = this.sim!;
    this.sfx('goal', { volume: 0.7, exact: true });
    const g = this.screen(sim.L.goal.x, sim.L.goal.y, 0.3);
    flash(this, 0xffffff, 140, 0.3);
    shake(this, 0.006, 160);
    burst(this, g.x, g.y, [0xffd23f, 0x5dff7a, 0x3ee6ff, 0xff4fa3, 0xffffff], 40, 420);
    this.confetti();
  }

  private confetti(): void {
    const { width } = this.scale;
    const em = this.add.particles(0, -20, 'mm-dot', {
      x: { min: 0, max: width }, lifespan: 2600, speedY: { min: 260, max: 520 }, speedX: { min: -80, max: 80 },
      scaleX: { min: 0.5, max: 0.9 }, scaleY: { min: 0.25, max: 0.45 }, rotate: { min: 0, max: 360 },
      tint: [0xff6b4a, 0x22c3b5, 0xffc233, 0x9d6bff, 0x3b8cff, 0xffffff, 0xff4fa3], gravityY: 120, frequency: 12, quantity: 3,
    }).setDepth(70);
    this.time.delayedCall(1300, () => em.stop());
    this.time.delayedCall(4200, () => em.destroy());
  }

  private animateGoal(dt: number): void {
    const sim = this.sim!, m = this.board!.marble;
    const gx = sim.L.goal.x, gy = sim.L.goal.y;
    const tt = this.phaseTime;
    // a short spiral into the cup, then down
    const a = tt * 14, r = Math.max(0, 0.3 - tt * 0.45);
    m.position.x += (gx + Math.cos(a) * r - m.position.x) * Math.min(1, dt * 12);
    m.position.z += (gy + Math.sin(a) * r - m.position.z) * Math.min(1, dt * 12);
    m.rotateY(dt * 12);
    if (tt > 0.45) m.position.y = Math.max(-0.35, m.position.y - dt * 1.2);
    if (tt > 1.1 && this.phase === 'goal') this.levelClear();
  }

  private levelClear(): void {
    this.phase = 'clear';
    this.phaseTime = 0;
    const sim = this.sim!, i = this.li;
    const par = this.par(i);
    const allGems = sim.gems >= sim.L.gems.length;
    const fast = this.levelTime <= par;
    const stars = 1 + (allGems ? 1 : 0) + (fast ? 1 : 0);
    const timeBonus = Math.max(0, Math.ceil(par * 1.5 - this.levelTime)) * 5;
    const pts = stars * 100 + sim.gems * 25 + timeBonus + (i + 1) * 10;
    // the run keeps each level's best
    const before = this.runBest.get(i) ?? 0;
    if (pts > before) {
      this.runBest.set(i, pts);
      this.setScore([...this.runBest.values()].reduce((a, b) => a + b, 0));
    }
    const prog = this.progress();
    const oldStars = prog.stars[i] ?? 0;
    prog.stars[i] = Math.max(oldStars, stars);
    const record = !prog.times[i] || this.levelTime < prog.times[i];
    if (record) prog.times[i] = Math.round(this.levelTime * 10) / 10;
    storage.set(KEY_PROGRESS, prog);
    const bonusMarble = stars === 3 && this.marbles < MAX_MARBLES;
    if (bonusMarble) {
      this.marbles++;
      this.hud.setLives(this.marbles, Math.max(this.marbles, this.tuneInfo.marbles));
    }
    this.showClearPanel(stars, allGems, fast, pts, par, bonusMarble, record && oldStars > 0);
  }

  private showClearPanel(stars: number, allGems: boolean, fast: boolean, pts: number, par: number, bonusMarble: boolean, record: boolean): void {
    const { width, height } = this.scale;
    const sim = this.sim!;
    const add = <O extends Phaser.GameObjects.GameObject>(o: O): O => { this.panelUi.push(o); return o; };
    add(this.add.rectangle(0, 0, width, height, 0x05040a, 0.45).setOrigin(0).setDepth(55));
    const cy = height * 0.45;
    const top = cy - 340, h = 750;
    const card = add(this.add.graphics().setDepth(56));
    card.fillStyle(0x000000, 0.3).fillRoundedRect(width / 2 - 300, top + 8, 600, h, 34);
    card.fillStyle(0x15122a, 0.95).fillRoundedRect(width / 2 - 300, top, 600, h, 34);
    card.lineStyle(3, Phaser.Display.Color.HexStringToColor(this.theme.accent).color, 0.9).strokeRoundedRect(width / 2 - 300, top, 600, h, 34);
    add(txt(this, width / 2, cy - 280, t('levelDone'), { title: true, size: 44, color: '#5dff7a', strokeThickness: 8 }).setDepth(57));
    add(txt(this, width / 2, cy - 224, loc(LEVELS[this.li].name), { size: 28, color: '#cfcadf' }).setDepth(57));
    for (let s = 0; s < 3; s++) {
      const on = s < stars;
      const st = add(this.add.image(width / 2 + (s - 1) * 130, cy - 120 - (s === 1 ? 18 : 0), 'icon-star').setDepth(57).setScale(0).setTint(on ? 0xffd23f : 0x3f3a58));
      this.tweens.add({ targets: st, scale: s === 1 ? 2 : 1.7, duration: 320, delay: 300 + s * 260, ease: 'Back.easeOut' });
      if (on) this.time.delayedCall(300 + s * 260, () => {
        if (this.phase !== 'clear') return;
        this.sfx('star', { volume: 0.6, exact: true, rate: 1 + s * 0.15 });
        burst(this, st.x, st.y, [0xffd23f, 0xffffff], 12, 220);
      });
    }
    const line = (k: number, ok: boolean, s: string) => {
      const y = cy - 14 + k * 42;
      add(this.add.image(width / 2 - 200, y, 'icon-star').setScale(0.4).setTint(ok ? 0xffd23f : 0x3f3a58).setDepth(57));
      add(txt(this, width / 2 - 172, y, s, { size: 27, color: ok ? '#ffffff' : '#8a849c' }).setOrigin(0, 0.5).setDepth(57));
    };
    line(0, true, t('finishedLine'));
    line(1, allGems, t('gemsLine', { n: sim.gems, max: sim.L.gems.length }));
    line(2, fast, t('timeLine', { t: clock(this.levelTime), par: clock(par) }));
    const extra = [t('levelScore', { n: pts })];
    if (record) extra.push(t('newRecord'));
    add(txt(this, width / 2, cy + 124, extra.join('  ·  '), { size: 26, color: '#ffe9a8', wrap: 560 }).setDepth(57));
    if (bonusMarble) {
      const b = add(txt(this, width / 2, cy + 166, t('extraMarble'), { title: true, size: 24, color: '#ff4fa3' }).setDepth(57));
      this.tweens.add({ targets: b, scale: 1.15, duration: 400, yoyo: true, repeat: -1 });
      this.time.delayedCall(1100, () => this.sfx('life', { volume: 0.5 }));
    }
    const last = this.li >= LEVELS.length - 1;
    const next = () => {
      if (this.phase !== 'clear' || this.isOver) return;
      if (last) this.finishRun(true);
      else {
        this.focus = this.li + 1;
        this.startLevel(this.li + 1);
      }
    };
    const retry = () => {
      if (this.phase !== 'clear' || this.isOver) return;
      this.startLevel(this.li);
    };
    const levels = () => {
      if (this.phase !== 'clear' || this.isOver) return;
      this.focus = Math.min(LEVELS.length - 1, last ? this.li : this.li + 1);
      this.showSelect();
    };
    this.panelKeys = { next, retry, levels };
    const by = cy + 250;
    add(new Button(this, width / 2 + 95, by, last ? t('allClear') : t('next'), next, { width: 330, height: 96, size: 32, color: COLORS.green }).setDepth(58));
    add(new Button(this, width / 2 - 175, by, t('again'), retry, { width: 190, height: 96, size: 26, color: COLORS.purple }).setDepth(58));
    add(new Button(this, width / 2, by + 108, t('levels'), levels, { width: 300, height: 76, size: 24, color: 0x333344 }).setDepth(58));
  }

  /** Ends the run: the summed best of each level played goes to the leaderboard. */
  private finishRun(allDone = false): void {
    if (this.isOver) return;
    this.endGame({ win: true, title: allDone ? t('allClear') : t('runDone'), delay: 200 });
  }
}
