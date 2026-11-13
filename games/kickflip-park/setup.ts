// Kickflip Park: the session setup, the first thing the Play scene shows when PLAY was pressed on
// the menu (a "play again" from the result screen skips it and skates the same park on the same
// board at once). From the top: the park (‹ › or a swipe; a locked park says what opens it), that
// park's goals ticked off, the board picker (the board turning on a small 3D turntable, its name,
// rarity, and whether you ride it or what unlocks it) and a big START that begins the session.
// While a locked park or a locked board is on show START reads LOCKED, greyed, with a hint under
// it, and nothing starts the session (a tap only shakes it with a bonk). The setup opens on the
// park and the board last ridden, which are always open.
// BACK returns to the menu. Keyboard: ←/→ park, ↑/↓ board, Enter (or Space) start, Esc back.
//
// The setup lives in the Play scene (not a scene of its own) so the platform's and the tests'
// "start a round" (Enter or PLAY on the menu → the Play scene runs) works unchanged; its turntable
// draws in the Play scene's World3D, which the session's View takes over on START.
import Phaser from 'phaser';
import { txt, t, loc, playSfx, isEasy } from '@core';
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

// ------------------------------------------------------------------ UI pieces

/** A frosted panel (the core's modern glass look). */
export function glass(scene: Phaser.Scene, w: number, h: number, o: { r?: number; color?: number; alpha?: number; rim?: number; sheen?: boolean } = {}): Phaser.GameObjects.Graphics {
  const r = o.r ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
  g.fillStyle(o.color ?? 0x121a33, o.alpha ?? 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  if (o.sheen !== false) g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 6, br: 6 });
  g.lineStyle(2, o.rim ?? 0xffffff, o.rim ? 0.9 : 0.16).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** A rounded, tappable button with a main label and an optional second line. */
export class Pill extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  readonly main: Phaser.GameObjects.Text;
  readonly sub: Phaser.GameObjects.Text;
  enabled = true;
  /** A tap while the button is disabled (a locked choice on show). */
  onDenied: (() => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.55), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      if (this.enabled) this.onTap();
      else this.onDenied?.();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  setLabels(main: string, sub = ''): this {
    this.main.setText(main);
    this.sub.setText(sub).setVisible(!!sub);
    this.main.y = sub ? -this.h * 0.14 : 0;
    this.sub.y = this.h * 0.24;
    return this;
  }

  private draw(): void {
    const { w, h } = this;
    const r = Math.min(30, h / 2);
    const c = this.enabled ? this.color : 0x4a5168;
    const dark = Phaser.Display.Color.IntegerToColor(c).darken(22).color;
    const g = this.g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(dark, 1).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, r);
    g.fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(-w / 2 + 5, -h / 2 + 4, w - 10, h * 0.42, { tl: r - 4, tr: r - 4, bl: 8, br: 8 });
    g.lineStyle(2, 0xffffff, 0.22).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r);
    this.main.setAlpha(this.enabled ? 1 : 0.7);
  }
}

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

// ------------------------------------------------------------------ the setup panel

/** The park card's and the board picker's centre lines. */
const PARK_Y = 168, GOALS_Y = 408, BOARD_Y = 742, START_Y = 1004, HINT_Y = 1088, BACK_Y = 1158;

export class Setup {
  private root: Phaser.GameObjects.Container;
  private card: Phaser.GameObjects.Container;
  private boardC: Phaser.GameObjects.Container;
  private under: Phaser.GameObjects.GameObject[] = [];
  private go: Pill;
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

  constructor(private scene: Phaser.Scene, world: World3D, private meta: Meta, private onStart: () => void, private onBack: () => void) {
    const s = scene;
    const { width, height } = s.scale;
    this.openedAt = s.time.now;
    this.idx = Math.max(0, PARKS.indexOf(meta.park));
    this.boards = BOARDS.filter(boardReady);
    this.bIdx = Math.max(0, this.boards.findIndex((b) => b.id === usableBoard(meta.board).id));
    this.root = s.add.container(0, 0).setDepth(9200);
    // an opaque backdrop and the glass boxes sit under the turntable's 3D image (WORLD_DEPTH −100);
    // the text and buttons above it
    const bg = s.add.graphics().setDepth(-300);
    bg.fillGradientStyle(0x0d1a2e, 0x0d1a2e, 0x060a18, 0x060a18, 1).fillRect(0, 0, width, height);
    const goalsBox = s.add.container(width / 2, GOALS_Y, [glass(s, 650, 316, { color: 0x0b1020, alpha: 0.88, r: 24, sheen: false })]).setDepth(-250);
    const boardBox = s.add.container(width / 2, BOARD_Y + 14, [glass(s, 650, 368, { color: 0x0b1020, alpha: 0.88, r: 24, sheen: false })]).setDepth(-250);
    this.under = [bg, goalsBox, boardBox];
    this.root.add(txt(s, width / 2, 58, t('setupTitle'), { title: true, size: 26, color: '#9fe8ff', strokeThickness: 0, shadow: false }));
    // arrows: parks at the top, boards beside the turntable
    const arrow = (x: number, y: number, d: number, icon: string, on: (d: number) => void) => {
      const c = s.add.container(x, y);
      const g = s.add.graphics().fillStyle(0xffffff, 0.12).fillCircle(0, 0, 40).lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, 40);
      c.add([g, s.add.image(0, 0, icon).setDisplaySize(42, 42)]);
      c.setSize(96, 96).setInteractive({ useHandCursor: true }).on('pointerup', () => on(d));
      this.root.add(c);
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
    arrow(70, PARK_Y, -1, 'icon-arrowleft', (d) => this.step(d));
    arrow(width - 70, PARK_Y, 1, 'icon-arrowright', (d) => this.step(d));
    arrow(96, BOARD_Y, -1, 'icon-arrowleft', (d) => this.stepBoard(d));
    arrow(width - 96, BOARD_Y, 1, 'icon-arrowright', (d) => this.stepBoard(d));
    this.card = s.add.container(0, 0);
    this.boardC = s.add.container(0, 0);
    this.root.add([this.card, this.boardC]);
    this.go = new Pill(s, width / 2, START_Y, 460, 120, 0x2fae5a, () => this.start(), 44);
    this.go.onDenied = () => this.deny();
    this.hint = txt(s, width / 2, HINT_Y, '', { size: 21, color: '#ffd23f', strokeThickness: 0, shadow: false });
    this.root.add(this.hint);
    const back = new Pill(s, width / 2, BACK_Y, 280, 84, 0x3b4466, () => this.back(), 28);
    back.setLabels(t('back'));
    this.root.add([this.go, back]);
    if (!s.sys.game.device.input.touch) this.root.add(txt(s, width / 2, 1234, t('setupKeys'), { size: 20, color: '#8f9bc0', strokeThickness: 0, shadow: false }));
    this.table = new Turntable(world, width / 2, BOARD_Y + 4, 9.5, width, height);
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
    this.card.setX(d * 40).setAlpha(0.3);
    this.scene.tweens.add({ targets: this.card, x: 0, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
  }

  private draw(): void {
    const s = this.scene, { width } = s.scale;
    const c = this.card;
    c.removeAll(true);
    const id = this.id, p = park(id), m = this.meta;
    const open = unlocked(m, id);
    const done = m.goals[id];
    c.add(txt(s, width / 2, PARK_Y - 18, t('park_' + id), { title: true, size: 36, color: '#ffffff', strokeThickness: 6 }));
    const sub = txt(s, width / 2, PARK_Y + 16, t('parkSub_' + id), { size: 19, color: '#cfd8f0', strokeThickness: 0, shadow: false, wrap: 480 }).setOrigin(0.5, 0);
    c.add(sub);
    // which park of three: dots between the title and the park's name
    PARKS.forEach((_q, i) => {
      c.add(s.add.graphics().fillStyle(i === this.idx ? 0xffd23f : 0xffffff, i === this.idx ? 1 : 0.3).fillCircle(width / 2 + (i - 1) * 26, PARK_Y - 62, 7));
    });
    // the goals, compact
    const box = s.add.container(width / 2, GOALS_Y);
    c.add(box);
    if (!open) {
      // a locked park: only the lock, what opens it and how far along that is (no goal list)
      const prev = PARKS[this.idx - 1], have = Math.min(UNLOCK_GOALS, m.goals[prev].length);
      box.add(s.add.image(0, -104, 'icon-locked').setDisplaySize(72, 72).setTint(0xffd23f));
      box.add(txt(s, 0, -42, t('lockedShort'), { title: true, size: 34, color: '#ffd23f', strokeThickness: 0, shadow: false }));
      const why = txt(s, 0, -10, t('lockedWhy', { park: t('park_' + prev), n: UNLOCK_GOALS }), { size: 23, color: '#ffffff', strokeThickness: 0, shadow: false, wrap: 540 }).setOrigin(0.5, 0);
      box.add(why);
      // one pip per goal needed, filled for those done
      const py = why.y + why.height + 26;
      const pips = s.add.graphics();
      for (let i = 0; i < UNLOCK_GOALS; i++) {
        const x = (i - (UNLOCK_GOALS - 1) / 2) * 44;
        if (i < have) pips.fillStyle(0x2fae5a, 1).fillCircle(x, py, 14).lineStyle(3, 0xffffff, 0.9).strokeCircle(x, py, 14);
        else pips.lineStyle(3, 0xffffff, 0.4).strokeCircle(x, py, 13);
      }
      box.add(pips);
      box.add(txt(s, 0, py + 38, t('lockedHave', { n: have, m: UNLOCK_GOALS }), { size: 20, color: '#cfd8f0', strokeThickness: 0, shadow: false }));
      this.label();
      return;
    }
    box.add(txt(s, 0, -132, t('goalsCount', { n: done.length, m: p.goals.length }) + '   ·   ' + t('bestIn', { n: fmt(m.best[id]) }), { title: true, size: 21, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    const mode = isEasy() ? 'easy' : 'normal';
    p.goals.forEach((g, i) => {
      const y = -96 + i * 31;
      const ok = done.includes(g.id);
      const mark = s.add.graphics();
      if (ok) mark.fillStyle(0x2fae5a, 1).fillCircle(-280, y, 12).lineStyle(4, 0xffffff, 1).beginPath().moveTo(-286, y).lineTo(-281, y + 5).lineTo(-273, y - 5).strokePath();
      else mark.lineStyle(3, 0xffffff, 0.45).strokeCircle(-280, y, 11);
      const tx = txt(s, -256, y, goalText(g, goalNeed(g, mode)), { size: 19, color: ok ? '#9dffb8' : '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
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
      this.go.setLabels(t('start'), t('park_' + this.id) + ' · ' + loc(usableBoard(this.meta.board).name));
      this.hint.setText('');
      if (this.pulse.isPaused()) this.pulse.resume();
    } else {
      this.go.setLabels(t('lockedShort'));
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
    c.add(txt(s, width / 2, BOARD_Y - 150, t('board') + '  ' + (this.bIdx + 1) + '/' + this.boards.length, { title: true, size: 21, color: '#9fe8ff', strokeThickness: 0, shadow: false }));
    const name = txt(s, width / 2, BOARD_Y + 92, loc(b.name), { title: true, size: 30, color: '#ffffff', strokeThickness: 6 });
    const rar = txt(s, width / 2, BOARD_Y + 128, t('rarity_' + b.rarity), { title: true, size: 17, color: rc, strokeThickness: 4 });
    c.add([name, rar]);
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
      col = '#ffd23f';
      c.add(s.add.image(width / 2 + 160, BOARD_Y - 74, 'icon-locked').setDisplaySize(46, 46));
    } else {
      status = usableBoard(this.meta.board).id === b.id ? '✓ ' + t('boardRiding') : t('boardOpen');
      col = '#7dffa0';
    }
    c.add(txt(s, width / 2, BOARD_Y + 164, status, { size: 19, color: col, strokeThickness: 0, shadow: false, wrap: 580 }));
    // where in the list: a row of rarity-coloured pips (bright: open)
    const n = this.boards.length, gap = Math.min(24, 440 / n);
    const g = s.add.graphics();
    this.boards.forEach((q, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * gap, y = BOARD_Y - 120;
      const on = boardIsOpen(this.meta, q.id);
      g.fillStyle(RARITY_COLOR[q.rarity], i === this.bIdx ? 1 : on ? 0.55 : 0.18).fillCircle(x, y, i === this.bIdx ? 6 : 4);
    });
    c.add(g);
    if (anim) {
      name.setScale(0.8);
      s.tweens.add({ targets: name, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }
  }

  // ------------------------------------------------------------------ out

  /** START: only with an open park and an open board on show (that board is the one ridden). */
  private start(): void {
    if (this.done || this.lockedChoice()) return;
    this.meta.park = this.id;
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

  /** Test hooks. */
  testStep(d: number): void { this.step(d); }
  testBoard(id: string): void { const i = this.boards.findIndex((b) => b.id === id); if (i >= 0) { this.bIdx = (i - 1 + this.boards.length) % this.boards.length; this.stepBoard(1); } }
  testInfo(): { park: string; shown: string; board: string; owned: string[]; open: string[]; listed: string[]; locked: string | null; button: string; hint: string; enabled: boolean } {
    return {
      park: this.id, shown: this.boards[this.bIdx]?.id, board: this.meta.board, owned: this.meta.owned, open: BOARDS.filter((b) => boardIsOpen(this.meta, b.id)).map((b) => b.id), listed: this.boards.map((b) => b.id),
      locked: this.lockedChoice(), button: this.go.main.text, hint: this.hint.text, enabled: this.go.enabled,
    };
  }
}
