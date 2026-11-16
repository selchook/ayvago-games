// Kickflip Park: the session setup. Two places show it:
//   - the menu's PARK & BOARD button opens it as a page of its own over the menu (GarageScene in
//     garage.ts): pick there, and the choice is saved; START skates it at once, DONE goes back;
//   - PLAY on the menu shows it first in the Play scene only until a park and board were ever
//     chosen (`Meta.picked`); after that PLAY skates the saved park on the saved board at once, and
//     a "play again" from the result screen always does.
// From the top: the park (‹ › or a swipe; a locked park says what opens it), that park's goals
// ticked off, the board picker (the board turning on a small 3D turntable, its name, rarity, and
// whether you ride it or what unlocks it) and a big START that begins the session. While a locked
// park or a locked board is on show START reads LOCKED, greyed, with a hint under it, and nothing
// starts the session (a tap only shakes it with a bonk). It opens on the park and the board last
// ridden, which are always open.
// BACK (DONE on the menu's page) returns to the menu. Keyboard: ←/→ park, ↑/↓ board, Enter (or
// Space) start, Esc back.
//
// It wears the menu theme (theme.ts): the park on a die-cut sticker in the park's colour, the
// goals on a flyer taped up, the turntable on a slab of grip tape with the board's name on a
// sticker in its rarity colour, sticker arrows and buttons, the tape frame round the screen. Every
// piece and fixed label is painted in Boot under the Ayvago intro (`prebakeSetup`, the theme's
// `prebake`): opening the setup paints nothing.
//
// The setup can live in the Play scene (not only a scene of its own) so the platform's and the
// tests' "start a round" (Enter or PLAY on the menu → the Play scene runs) works unchanged; its
// turntable draws in the scene's World3D, which the session's View takes over on START.
import Phaser from 'phaser';
import {
  txt, t, loc, playSfx, isEasy, SkinButton, skinImage, skinTexture, themeCard, themeLabel, labelTexture, placeLabel, bake, frameBorder,
  type LabelStyle, type SkinState,
} from '@core';
import { THREE, type World3D } from '@core/three';
import { PARKS, UNLOCK_GOALS, park, type ParkId } from './parks';
import { saveMeta, unlocked, boardIsOpen, progress, type Meta } from './meta';
import { BOARDS, RARITY_COLOR, boardProgress, type BoardDef } from './boards';
import { buildBoardModel, boardReady, usableBoard, type BoardModel } from './boardmodel';
import { Mats } from './kit';
import { goalText, goalNeed, fmt } from './goals';

// ------------------------------------------------------------------ the menu → setup hand-over

let fromMenu = false;
/** The menu was opened: the next Play start is a new session from the menu (setup first). */
export function menuOpened(): void { fromMenu = true; }
/** Whether this Play start comes from the menu (read once). */
export function takeFromMenu(): boolean { const v = fromMenu; fromMenu = false; return v; }

// ------------------------------------------------------------------ the turntable

/**
 * The board picker's turntable: a 3D board turning over a soft shadow, in the Play scene's world
 * (transparent: the setup's panels show round it). dispose() takes it out and frees what it made,
 * so the session's View can take the world over.
 */
class Turntable {
  private mats = new Mats();
  private stage = new THREE.Group();
  private holder = new THREE.Group();
  /** Rolls the board round its length (its middle on the pivot). */
  private roll = new THREE.Group();
  private bm: BoardModel | null = null;
  private spin = 0.6;
  private kick = 0;
  private t = 0;
  private own: { dispose(): void }[] = [];

  constructor(private world: World3D, cx: number, cy: number, dist: number, width: number, height: number) {
    const sc = world.scene;
    const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x6a5a70, 2.2);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3, 6, 4);
    // a soft round shadow under the board
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv), geo = new THREE.PlaneGeometry(2.3, 2.3), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const blob = new THREE.Mesh(geo, mat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    this.own.push(tex, geo, mat);
    this.stage.add(hemi, sun, blob, this.holder);
    this.holder.add(this.roll);
    sc.add(this.stage);
    const cam = world.camera;
    cam.fov = 30; cam.near = 0.5; cam.far = 60;
    cam.position.set(0, dist * 0.42, dist);
    cam.lookAt(0, 0.2, 0);
    // the board shows at (cx, cy) on the screen instead of the middle
    cam.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
    cam.updateProjectionMatrix();
    // it turns round, and every few seconds kickflips over to show the graphic underneath
    world.onFrame = (dt) => {
      this.kick = Math.max(0, this.kick - dt * 2.5);
      this.spin += dt * (0.7 + this.kick * 9);
      this.t += dt;
      const ph = this.t % 8, f = (k: number) => k * k * (3 - 2 * k);
      const flip = ph < 3.4 ? 0 : ph < 4 ? f((ph - 3.4) / 0.6) : ph < 7.4 ? 1 : 1 + f((ph - 7.4) / 0.6);
      const hop = ph >= 3.4 && ph < 4 ? Math.sin(Math.PI * (ph - 3.4) / 0.6) : ph >= 7.4 ? Math.sin(Math.PI * (ph - 7.4) / 0.6) : 0;
      this.holder.rotation.set(0, this.spin, 0);
      this.roll.rotation.z = flip * Math.PI;
      this.roll.position.y = (this.bm?.pivotY ?? 0.15) + hop * 0.3;
      this.holder.position.y = 0.06 + Math.sin(this.spin * 2) * 0.03;
    };
  }

  show(def: BoardDef): void {
    if (this.bm) { this.roll.remove(this.bm.group); this.bm.dispose(); }
    this.bm = buildBoardModel(def, this.mats);
    this.bm.group.position.y = -this.bm.pivotY;
    this.roll.add(this.bm.group);
    this.kick = 1;
  }

  dispose(): void {
    this.world.onFrame = null;
    this.world.scene.remove(this.stage);
    this.bm?.dispose();
    this.bm = null;
    this.own.forEach((r) => r.dispose());
    this.mats.dispose();
    this.world.camera.clearViewOffset();
  }
}

// ------------------------------------------------------------------ the painted pieces

const PINK = 0xff3b5c, BLUE = 0x1f8fff, YELLOW = 0xffe14a, INK = '#1a1020';
/** Each park's sticker colour. */
const PARK_COLOR: Record<ParkId, number> = { plaza: BLUE, yard: 0xff8a1f, roofs: 0x8a4dff };
const PARK_STICKER = { w: 470, h: 118 };
/** The goals flyer and the grip-tape slab under the turntable. */
export const SETUP_FLYER = { w: 650, h: 316 };
const GRIP = { w: 650, h: 368 };
const NAME_STICKER = { w: 400, h: 62 };
const START_BTN = { w: 460, h: 120 }, BACK_BTN = { w: 280, h: 84 }, ARROW = 96;
const TITLE_STYLE: LabelStyle = { size: 36, fill: ['#fffbe0', '#ffe14a', '#ff9a1f'], stroke: INK, strokeWidth: 7 };
const PARK_NAME: LabelStyle = { size: 40, color: '#ffffff', stroke: INK, strokeWidth: 7 };
const PARK_SUB: LabelStyle = { size: 19, color: '#ffffff', stroke: INK, strokeWidth: 5, shadow: false, body: true };
const BOARD_NAME: LabelStyle = { size: 30, color: '#ffffff', stroke: INK, strokeWidth: 6 };
const LOCKED_HEAD: LabelStyle = { size: 38, color: '#e8264a', stroke: null, shadow: false };
const KEYS_STYLE: LabelStyle = { size: 19, color: '#c9c3dc', stroke: null, shadow: false, body: true };
const BTN = { start: 50, back: 32 };
/** The backdrop: a dark wall with spray-paint glows (painted small, shown full screen). */
const BG = { w: 240, h: 428 };

function backdropTexture(scene: Phaser.Scene): string {
  return bake(scene, 'kp-setup-bg', BG.w, BG.h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, BG.h);
    g.addColorStop(0, '#13213a'); g.addColorStop(0.5, '#0d1628'); g.addColorStop(1, '#070b16');
    c.fillStyle = g; c.fillRect(0, 0, BG.w, BG.h);
    const blob = (x: number, y: number, r: number, col: string) => {
      const b = c.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, col); b.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = b; c.fillRect(0, 0, BG.w, BG.h);
    };
    blob(30, 40, 120, 'rgba(255,59,92,0.28)');
    blob(220, 260, 140, 'rgba(31,143,255,0.24)');
    blob(60, 400, 110, 'rgba(255,225,74,0.12)');
    // concrete speckle
    let k = 11;
    const r = () => { k = (k * 16807) % 2147483647; return k / 2147483647; };
    for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)'; c.fillRect(r() * BG.w, r() * BG.h, 1, 1); }
  });
}

/** A tick in a green dot (a goal done) or an empty ink ring (to do), drawn on the flyer. */
function markTexture(scene: Phaser.Scene, done: boolean): string {
  return bake(scene, done ? 'kp-goal-done' : 'kp-goal-todo', 30, 30, (c) => {
    c.lineWidth = 3;
    if (done) {
      c.fillStyle = '#2fae5a'; c.beginPath(); c.arc(15, 15, 12, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(9, 15); c.lineTo(14, 20); c.lineTo(22, 10); c.stroke();
    } else {
      c.strokeStyle = 'rgba(26,16,32,0.55)'; c.beginPath(); c.arc(15, 15, 11, 0, Math.PI * 2); c.stroke();
    }
  });
}

const parkSubStyle = PARK_SUB;

/**
 * Paints everything the setup shows (the theme's `prebake`, in Boot under the intro): the stickers
 * in every colour and state, the grip-tape slab, the arrows and buttons, the backdrop, the goal
 * marks and every fixed label in the current language. Opening the setup paints nothing.
 */
export function prebakeSetup(scene: Phaser.Scene): void {
  for (const id of PARKS) for (const st of ['up', 'off'] as SkinState[]) skinTexture(scene, 'button', PARK_STICKER.w, PARK_STICKER.h, st, PARK_COLOR[id]);
  skinTexture(scene, 'board', GRIP.w, GRIP.h);
  for (const c of Object.values(RARITY_COLOR)) for (const st of ['up', 'off'] as SkinState[]) skinTexture(scene, 'plate', NAME_STICKER.w, NAME_STICKER.h, st, c);
  for (const st of ['up', 'over', 'down'] as SkinState[]) {
    skinTexture(scene, 'round', ARROW, ARROW, st, YELLOW);
    skinTexture(scene, 'button', BACK_BTN.w, BACK_BTN.h, st, BLUE);
  }
  for (const st of ['up', 'over', 'down', 'off'] as SkinState[]) skinTexture(scene, 'button', START_BTN.w, START_BTN.h, st, PINK);
  backdropTexture(scene);
  markTexture(scene, true); markTexture(scene, false);
  labelTexture(scene, t('setupTitle'), TITLE_STYLE);
  for (const id of PARKS) { labelTexture(scene, t('park_' + id), PARK_NAME); labelTexture(scene, t('parkSub_' + id), parkSubStyle); }
  // every board (the models may still be parsing: boardReady is asked when the setup opens)
  for (const b of BOARDS) labelTexture(scene, loc(b.name), BOARD_NAME);
  labelTexture(scene, t('lockedShort'), LOCKED_HEAD);
  labelTexture(scene, t('setupKeys'), KEYS_STYLE);
  for (const k of ['start', 'lockedShort']) labelTexture(scene, t(k), { size: BTN.start });
  for (const k of ['back', 'done']) labelTexture(scene, t(k), { size: BTN.back });
  // the arrows' (empty) label
  labelTexture(scene, '', { size: 30 });
}

// ------------------------------------------------------------------ the setup panel

/** The park card's and the board picker's centre lines. */
const PARK_Y = 168, GOALS_Y = 408, BOARD_Y = 742, START_Y = 1004, HINT_Y = 1088, BACK_Y = 1158;

export interface SetupOptions {
  /** 'garage': the menu's PARK & BOARD page (its way out reads DONE); 'play': PLAY's first setup. */
  mode?: 'play' | 'garage';
}

export class Setup {
  private root: Phaser.GameObjects.Container;
  private card: Phaser.GameObjects.Container;
  private boardC: Phaser.GameObjects.Container;
  private under: Phaser.GameObjects.GameObject[] = [];
  private go: SkinButton;
  /** Under START while it is locked: what to do instead. */
  private hint: Phaser.GameObjects.Text;
  private pulse: Phaser.Tweens.Tween;
  private table: Turntable;
  private idx = 0;
  private boards: BoardDef[];
  private bIdx = 0;
  private openedAt: number;
  private done = false;
  private swipe: { x: number; y: number; zone: 'park' | 'board' } | null = null;
  // the park sticker and the board's name sticker (their textures change with the choice)
  private parkSticker!: Phaser.GameObjects.Image;
  private parkName!: Phaser.GameObjects.Image;
  private parkSub!: Phaser.GameObjects.Image;
  private nameSticker!: Phaser.GameObjects.Image;
  private boardName!: Phaser.GameObjects.Image;

  constructor(private scene: Phaser.Scene, world: World3D, private meta: Meta, private onStart: () => void, private onBack: () => void, o: SetupOptions = {}) {
    const s = scene;
    const { width, height } = s.scale;
    this.openedAt = s.time.now;
    this.idx = Math.max(0, PARKS.indexOf(meta.park));
    this.boards = BOARDS.filter(boardReady);
    this.bIdx = Math.max(0, this.boards.findIndex((b) => b.id === usableBoard(meta.board).id));
    this.root = s.add.container(0, 0).setDepth(9200);
    // the wall, the flyer and the grip tape sit under the turntable's 3D image (WORLD_DEPTH −100);
    // the stickers, text and buttons above it
    const bg = s.add.image(0, 0, backdropTexture(s)).setOrigin(0).setDisplaySize(width, height).setDepth(-300);
    const flyer = themeCard(s, width / 2, GOALS_Y, SETUP_FLYER.w, SETUP_FLYER.h).setDepth(-250);
    const grip = skinImage(s, width / 2, BOARD_Y + 14, 'board', GRIP.w, GRIP.h).setDepth(-250);
    const frame = frameBorder(s).map((f) => (f as Phaser.GameObjects.Image).setDepth(9190));
    this.under = [bg, flyer, grip, ...frame];
    const title = themeLabel(s, width / 2, 56, t('setupTitle'), TITLE_STYLE);
    title.setScale(Math.min(1, 560 / title.width));
    this.root.add(title);
    // sticker arrows: parks at the top, boards beside the turntable
    const arrow = (x: number, y: number, d: number, icon: string, on: (d: number) => void) => {
      const b = new SkinButton(s, x, y, '', () => on(d), { width: ARROW, height: ARROW, kind: 'round', color: YELLOW, baked: true, sfx: '' });
      b.add(s.add.image(0, 0, icon).setDisplaySize(44, 44).setTint(0x1a1020));
      this.root.add(b);
    };
    // swipes: across the park card or the goals for parks, across the turntable for boards
    const swipeZone = (x: number, y: number, w: number, h: number, zone: 'park' | 'board') => {
      const z = s.add.zone(x, y, w, h).setInteractive();
      z.on('pointerdown', (p: Phaser.Input.Pointer) => { this.swipe = { x: p.x, y: p.y, zone }; });
      this.root.add(z);
      return z;
    };
    swipeZone(width / 2, (PARK_Y + GOALS_Y) / 2 + 30, 520, 470, 'park');
    swipeZone(width / 2, BOARD_Y, 380, 230, 'board');
    s.input.on('pointerup', this.onUp, this);
    // the park's sticker (under the arrows, so their taps come first)
    this.parkSticker = skinImage(s, width / 2, PARK_Y + 2, 'button', PARK_STICKER.w, PARK_STICKER.h, 'up', PARK_COLOR[this.id]);
    this.parkName = themeLabel(s, width / 2, PARK_Y - 16, t('park_' + this.id), PARK_NAME);
    this.parkSub = themeLabel(s, width / 2, PARK_Y + 30, t('parkSub_' + this.id), parkSubStyle);
    this.root.add([this.parkSticker, this.parkName, this.parkSub]);
    arrow(70, PARK_Y, -1, 'icon-arrowleft', (d) => this.step(d));
    arrow(width - 70, PARK_Y, 1, 'icon-arrowright', (d) => this.step(d));
    arrow(92, BOARD_Y, -1, 'icon-arrowleft', (d) => this.stepBoard(d));
    arrow(width - 92, BOARD_Y, 1, 'icon-arrowright', (d) => this.stepBoard(d));
    this.card = s.add.container(0, 0);
    this.boardC = s.add.container(0, 0);
    // the board's name on a sticker in its rarity colour
    this.nameSticker = skinImage(s, width / 2, BOARD_Y + 88, 'plate', NAME_STICKER.w, NAME_STICKER.h, 'up', RARITY_COLOR.common);
    this.boardName = themeLabel(s, width / 2, BOARD_Y + 87, loc(this.boards[this.bIdx]?.name ?? ''), BOARD_NAME);
    this.root.add([this.card, this.nameSticker, this.boardName, this.boardC]);
    this.go = new SkinButton(s, width / 2, START_Y, t('start'), () => this.start(), { width: START_BTN.w, height: START_BTN.h, size: BTN.start, variant: 'primary', baked: true, sfx: '' });
    this.go.onDenied = () => this.deny();
    this.hint = txt(s, width / 2, HINT_Y, '', { size: 22, color: '#ffe14a', strokeThickness: 4, stroke: INK, shadow: false });
    this.root.add(this.hint);
    const back = new SkinButton(s, width / 2, BACK_Y, t(o.mode === 'garage' ? 'done' : 'back'), () => this.back(), { width: BACK_BTN.w, height: BACK_BTN.h, size: BTN.back, color: BLUE, baked: true, sfx: '' });
    this.root.add([this.go, back]);
    if (!s.sys.game.device.input.touch) {
      const keys = themeLabel(s, width / 2, 1234, t('setupKeys'), KEYS_STYLE);
      keys.setScale(Math.min(1, 640 / keys.width));
      this.root.add(keys);
    }
    this.table = new Turntable(world, width / 2, BOARD_Y - 8, 9.5, width, height);
    this.pulse = s.tweens.add({ targets: this.go, scale: 1.04, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.draw();
    this.drawBoard(false);
    s.input.keyboard?.on('keydown', this.onKey, this);
    // Esc goes back to the menu: registered before the Play scene's own Esc (pause), which the
    // scene skips once the setup is leaving
    s.input.keyboard?.on('keydown-ESC', this.back, this);
    // in: the cards slide up
    this.root.setAlpha(0).setY(30);
    s.tweens.add({ targets: this.root, alpha: 1, y: 0, duration: 220, ease: 'Quad.easeOut' });
  }

  private get id(): ParkId { return PARKS[this.idx]; }

  private onKey(e: KeyboardEvent): void {
    if (this.done || this.scene.scene.isPaused()) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.step(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.step(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.stepBoard(-1);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.stepBoard(1);
    // not the held key that pressed PLAY on the menu
    // (a locked park or board on show: nothing happens)
    else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && this.scene.time.now - this.openedAt > 250) this.start();
    else if (e.code === 'Backspace') this.back();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const sw = this.swipe;
    this.swipe = null;
    if (!sw || this.done) return;
    const dx = p.x - sw.x, dy = p.y - sw.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (sw.zone === 'park') this.step(dx < 0 ? 1 : -1); else this.stepBoard(dx < 0 ? 1 : -1);
    } else if (sw.zone === 'board' && Math.hypot(dx, dy) < 20) this.stepBoard(1);   // a tap: the next board
  }

  // ------------------------------------------------------------------ parks

  private step(d: number): void {
    this.idx = (this.idx + d + PARKS.length) % PARKS.length;
    // an open park is the one skated from now on (remembered); a locked one is only shown
    if (unlocked(this.meta, this.id) && this.meta.park !== this.id) { this.meta.park = this.id; saveMeta(this.meta); }
    playSfx(this.scene, 'ui-click');
    this.draw();
    const slide = [this.card, this.parkSticker, this.parkName, this.parkSub];
    for (const o of slide) {
      const x = o === this.card ? 0 : this.scene.scale.width / 2;
      o.setX(x + d * 40).setAlpha(0.3);
      this.scene.tweens.add({ targets: o, x, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
    }
  }

  private draw(): void {
    const s = this.scene, { width } = s.scale;
    const c = this.card;
    c.removeAll(true);
    const id = this.id, p = park(id), m = this.meta;
    const open = unlocked(m, id);
    const done = m.goals[id];
    // the park's sticker: its colour, faded and worn while locked
    this.parkSticker.setTexture(skinTexture(s, 'button', PARK_STICKER.w, PARK_STICKER.h, open ? 'up' : 'off', PARK_COLOR[id]));
    placeLabel(this.parkName, labelTexture(s, t('park_' + id), PARK_NAME));
    this.parkName.setScale(Math.min(1, (PARK_STICKER.w - 60) / this.parkName.width)).setAlpha(open ? 1 : 0.8);
    placeLabel(this.parkSub, labelTexture(s, t('parkSub_' + id), parkSubStyle));
    this.parkSub.setScale(Math.min(1, (PARK_STICKER.w - 50) / this.parkSub.width)).setAlpha(open ? 1 : 0.8);
    // which park of three: dots between the title and the park's sticker
    PARKS.forEach((_q, i) => {
      const on = i === this.idx;
      c.add(s.add.graphics().fillStyle(0x1a1020, 0.8).fillCircle(width / 2 + (i - 1) * 26, PARK_Y - 74, on ? 9 : 7)
        .fillStyle(on ? YELLOW : 0xffffff, on ? 1 : 0.35).fillCircle(width / 2 + (i - 1) * 26, PARK_Y - 74, on ? 7 : 5));
    });
    // the goals, on the flyer (ink on paper)
    const box = s.add.container(width / 2, GOALS_Y);
    c.add(box);
    const ink = { strokeThickness: 0, shadow: false } as const;
    if (!open) {
      // a locked park: only the lock, what opens it and how far along that is (no goal list)
      const prev = PARKS[this.idx - 1], have = Math.min(UNLOCK_GOALS, m.goals[prev].length);
      box.add(s.add.image(0, -100, 'icon-locked').setDisplaySize(68, 68).setTint(0x1a1020));
      box.add(themeLabel(s, 0, -40, t('lockedShort'), LOCKED_HEAD));
      const why = txt(s, 0, -8, t('lockedWhy', { park: t('park_' + prev), n: UNLOCK_GOALS }), { size: 23, color: '#221c2a', ...ink, wrap: 540 }).setOrigin(0.5, 0);
      box.add(why);
      // one pip per goal needed, filled for those done
      const py = why.y + why.height + 26;
      for (let i = 0; i < UNLOCK_GOALS; i++) box.add(s.add.image((i - (UNLOCK_GOALS - 1) / 2) * 44, py, markTexture(s, i < have)).setScale(1.1));
      box.add(txt(s, 0, py + 38, t('lockedHave', { n: have, m: UNLOCK_GOALS }), { size: 20, color: '#5a5468', ...ink }));
      this.label();
      return;
    }
    box.add(txt(s, 0, -128, t('goalsCount', { n: done.length, m: p.goals.length }) + '   ·   ' + t('bestIn', { n: fmt(m.best[id]) }), { title: true, size: 22, color: '#c2185b', ...ink }));
    const mode = isEasy() ? 'easy' : 'normal';
    const todo = markTexture(s, false), tick = markTexture(s, true);
    p.goals.forEach((g, i) => {
      const y = -94 + i * 31;
      const ok = done.includes(g.id);
      const mark = s.add.image(-280, y, ok ? tick : todo);
      const tx = txt(s, -256, y, goalText(g, goalNeed(g, mode)), { size: 19, color: ok ? '#1d8a3c' : '#221c2a', ...ink }).setOrigin(0, 0.5);
      if (tx.width > 560) tx.setScale(560 / tx.width);
      box.add([mark, tx]);
    });
    this.label();
  }

  /** The board on show (the board picker's current entry). */
  private get shownBoard(): BoardDef | undefined { return this.boards[this.bIdx]; }

  /** Why START can't start now: a locked park or a locked board on show (null: it can). */
  private lockedChoice(): 'park' | 'board' | null {
    if (!unlocked(this.meta, this.id)) return 'park';
    const b = this.shownBoard;
    if (b && !boardIsOpen(this.meta, b.id)) return 'board';
    return null;
  }

  /** START: what it skates, or LOCKED (greyed, not pulsing) with what to do instead under it. */
  private label(): void {
    const lock = this.lockedChoice();
    this.go.setEnabled(!lock);
    if (!lock) {
      this.go.setText(t('start')).fitLabel(START_BTN.w - 60).setSub(t('park_' + this.id) + ' · ' + loc(usableBoard(this.meta.board).name), { size: 22, color: '#fff3c4' });
      this.hint.setText('');
      if (this.pulse.isPaused()) this.pulse.resume();
    } else {
      this.go.setText(t('lockedShort')).fitLabel(START_BTN.w - 60).setSub('');
      this.hint.setText(t(lock === 'park' ? 'lockedParkHint' : 'lockedBoardHint'));
      this.pulse.pause();
      this.go.setScale(1);
    }
  }

  /** A tap on a locked START: it shakes and bonks, nothing starts. */
  private deny(): void {
    if (this.done) return;
    playSfx(this.scene, 'wall', { volume: 0.7 });
    playSfx(this.scene, 'error', { volume: 0.35 });
    const x = this.scene.scale.width / 2;
    this.scene.tweens.killTweensOf(this.hint);
    this.scene.tweens.add({ targets: this.go, x: { from: x - 14, to: x }, duration: 320, ease: 'Elastic.easeOut', easeParams: [1.2, 0.25] });
    this.hint.setScale(1);
    this.scene.tweens.add({ targets: this.hint, scale: 1.12, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  // ------------------------------------------------------------------ the board picker

  private stepBoard(d: number): void {
    if (!this.boards.length) return;
    this.bIdx = (this.bIdx + d + this.boards.length) % this.boards.length;
    const b = this.boards[this.bIdx];
    // an open board is ridden at once (remembered); a locked one is only shown
    if (boardIsOpen(this.meta, b.id) && this.meta.board !== b.id) {
      this.meta.board = b.id;
      saveMeta(this.meta);
      playSfx(this.scene, 'ui-select');
    } else playSfx(this.scene, 'ui-click');
    this.drawBoard(true);
    this.label();
  }

  private drawBoard(anim: boolean): void {
    const s = this.scene, { width } = s.scale;
    const c = this.boardC;
    c.removeAll(true);
    const b = this.boards[this.bIdx];
    if (!b) return;
    this.table.show(b);
    const open = boardIsOpen(this.meta, b.id);
    const rc = '#' + RARITY_COLOR[b.rarity].toString(16).padStart(6, '0');
    c.add(txt(s, width / 2, BOARD_Y - 152, t('board') + '  ' + (this.bIdx + 1) + '/' + this.boards.length, { title: true, size: 21, color: '#ffe14a', strokeThickness: 0, shadow: false }));
    this.nameSticker.setTexture(skinTexture(s, 'plate', NAME_STICKER.w, NAME_STICKER.h, open ? 'up' : 'off', RARITY_COLOR[b.rarity]));
    placeLabel(this.boardName, labelTexture(s, loc(b.name), BOARD_NAME));
    this.boardName.setScale(Math.min(1, (NAME_STICKER.w - 40) / this.boardName.width));
    const rar = txt(s, width / 2, BOARD_Y + 132, t('rarity_' + b.rarity), { title: true, size: 17, color: rc, strokeThickness: 4, stroke: INK });
    c.add(rar);
    let status: string, col: string;
    if (!open) {
      const [have, need] = boardProgress(b, progress(this.meta));
      const u = b.unlock;
      switch (u.kind) {
        case 'score': status = t('unlock_score', { n: fmt(need) }) + ' (' + t('bestIn', { n: fmt(have) }) + ')'; break;
        case 'park': status = t('unlock_park', { park: t('park_' + u.park), n: need, prev: t('park_' + (u.park === 'yard' ? 'plaza' : 'yard')), have, need }); break;
        case 'free': status = ''; break;
        default: status = t('unlock_' + u.kind, { n: need, have, need });
      }
      col = '#ffe14a';
      c.add(s.add.image(width / 2 + 170, BOARD_Y - 80, 'icon-locked').setDisplaySize(46, 46).setTint(YELLOW));
    } else {
      status = usableBoard(this.meta.board).id === b.id ? '✓ ' + t('boardRiding') : t('boardOpen');
      col = '#7dffa0';
    }
    // one line, or two under each other when the unlock rule is long
    const st = txt(s, width / 2, BOARD_Y + 146, status, { size: 18, color: col, strokeThickness: 0, shadow: false, wrap: 600 }).setOrigin(0.5, 0);
    if (st.height > 54) st.setScale(54 / st.height);
    c.add(st);
    // where in the list: a row of rarity-coloured pips (bright: open)
    const n = this.boards.length, gap = Math.min(24, 440 / n);
    const g = s.add.graphics();
    this.boards.forEach((q, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * gap, y = BOARD_Y - 122;
      const on = boardIsOpen(this.meta, q.id);
      g.fillStyle(RARITY_COLOR[q.rarity], i === this.bIdx ? 1 : on ? 0.55 : 0.18).fillCircle(x, y, i === this.bIdx ? 6 : 4);
    });
    c.add(g);
    if (anim) {
      for (const o of [this.nameSticker, this.boardName]) {
        const k = o.scale;
        o.setScale(k * 0.8);
        s.tweens.add({ targets: o, scale: k, duration: 200, ease: 'Back.easeOut' });
      }
    }
  }

  // ------------------------------------------------------------------ out

  /** START: only with an open park and an open board on show (that board is the one ridden). */
  private start(): void {
    if (this.done || this.lockedChoice()) return;
    this.meta.park = this.id;
    this.meta.picked = true;
    saveMeta(this.meta);
    playSfx(this.scene, 'ui-select');
    this.close();
    this.onStart();
  }

  private back(): void {
    if (this.done) return;
    playSfx(this.scene, 'ui-click');
    this.close();
    this.onBack();
  }

  get open(): boolean { return !this.done; }

  /** Takes the setup off the screen and frees the turntable (the world stays for the session). */
  close(): void {
    if (this.done) return;
    this.done = true;
    const s = this.scene;
    s.input.keyboard?.off('keydown', this.onKey, this);
    s.input.keyboard?.off('keydown-ESC', this.back, this);
    s.input.off('pointerup', this.onUp, this);
    this.table.dispose();
    this.root.destroy();
    this.under.forEach((o) => o.destroy());
  }

  /** DONE / BACK, as Esc (the garage's B). */
  dismiss(): void { this.back(); }

  /** Test hooks. */
  testStep(d: number): void { this.step(d); }
  testBoard(id: string): void { const i = this.boards.findIndex((b) => b.id === id); if (i >= 0) { this.bIdx = (i - 1 + this.boards.length) % this.boards.length; this.stepBoard(1); } }
  testInfo(): { park: string; shown: string; board: string; owned: string[]; open: string[]; listed: string[]; locked: string | null; button: string; hint: string; enabled: boolean } {
    return {
      park: this.id, shown: this.boards[this.bIdx]?.id, board: this.meta.board, owned: this.meta.owned, open: BOARDS.filter((b) => boardIsOpen(this.meta, b.id)).map((b) => b.id), listed: this.boards.map((b) => b.id),
      locked: this.lockedChoice(), button: this.lockedChoice() ? t('lockedShort') : t('start'), hint: this.hint.text, enabled: this.go.enabled,
    };
  }
}
