// Kickflip Park: the parks screen, opened from the menu (the menu waits under it, so its keys do
// not start a session). One park at a time with its goals ticked off, its best score and a button
// to skate it (locked parks say what opens them), and the board picker below: the board turning on
// a small 3D turntable, its name, rarity, and whether you ride it or what unlocks it. Touch, mouse
// and keyboard (←/→ parks, ↑/↓ boards, Enter skate here, Esc back).
import Phaser from 'phaser';
import { txt, t, loc, playSfx, isEasy } from '@core';
import { World3D, THREE } from '@core/three';
import { PARKS, UNLOCK_GOALS, park, type ParkId } from './parks';
import { loadMeta, saveMeta, unlocked, boardIsOpen, progress, type Meta } from './meta';
import { BOARDS, RARITY_COLOR, boardProgress, type BoardDef } from './boards';
import { buildBoardModel, boardReady, usableBoard, type BoardModel } from './boardmodel';
import { Mats } from './kit';
import { goalText, goalNeed, fmt } from './PlayScene';

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

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, private color: number, private onTap: () => void, size = 28) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.main = txt(scene, 0, 0, '', { title: true, size, strokeThickness: 0, shadow: false });
    this.sub = txt(scene, 0, 0, '', { size: Math.round(size * 0.7), color: '#fff3c4', strokeThickness: 0, shadow: false });
    this.add([this.g, this.main, this.sub]);
    this.setSize(w, h).setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => { if (this.enabled) scene.tweens.add({ targets: this, scale: 0.95, duration: 70 }); });
    this.on('pointerout', () => scene.tweens.add({ targets: this, scale: 1, duration: 120 }));
    this.on('pointerup', () => {
      scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
      if (this.enabled) this.onTap();
    });
    this.draw();
    scene.add.existing(this);
  }

  setColor(c: number): this { if (c !== this.color) { this.color = c; this.draw(); } return this; }
  setEnabled(on: boolean): this { if (on !== this.enabled) { this.enabled = on; this.draw(); } return this; }

  setLabels(main: string, sub = ''): this {
    this.main.setText(main);
    this.sub.setText(sub).setVisible(!!sub);
    this.main.y = sub ? -13 : 0;
    this.sub.y = 20;
    return this;
  }

  private draw(): void {
    const { w, h } = this;
    const r = Math.min(26, h / 2);
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

/** The board picker's turntable: a 3D board turning over a soft shadow, drawn under the screen's UI. */
class Turntable {
  readonly world: World3D;
  private mats = new Mats();
  private holder = new THREE.Group();
  private bm: BoardModel | null = null;
  private spin = 0.6;
  private kick = 0;
  private t = 0;
  /** Rolls the board round its length (its middle on the pivot). */
  private roll = new THREE.Group();

  constructor(scene: Phaser.Scene, cx: number, cy: number, dist: number) {
    // shadows on: the renderer is shared with the menu's world under this screen
    this.world = new World3D(scene, { fov: 30, near: 0.5, far: 60, background: null, shadows: true });
    const w = this.world, sc = w.scene;
    sc.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a5a70, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-3, 6, 4);
    sc.add(sun);
    // a soft round shadow under the board
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.005;
    sc.add(blob, this.holder);
    this.holder.add(this.roll);
    const { width, height } = scene.scale;
    const cam = w.camera;
    cam.position.set(0, dist * 0.42, dist);
    cam.lookAt(0, 0.2, 0);
    // the board shows at (cx, cy) on the screen instead of the middle
    cam.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
    // it turns round, and every few seconds kickflips over to show the graphic underneath
    w.onFrame = (dt) => {
      this.kick = Math.max(0, this.kick - dt * 2.5);
      this.spin += dt * (0.7 + this.kick * 9);
      this.t += dt;
      const ph = this.t % 8, f = (k: number) => k * k * (3 - 2 * k);
      const flip = ph < 3.4 ? 0 : ph < 4 ? f((ph - 3.4) / 0.6) : ph < 7.4 ? 1 : 1 + f((ph - 7.4) / 0.6);
      const hop = ph >= 3.4 && ph < 4 ? Math.sin(Math.PI * (ph - 3.4) / 0.6) : ph >= 7.4 ? Math.sin(Math.PI * (ph - 7.4) / 0.6) : 0;
      this.holder.rotation.set(0, this.spin, 0);
      this.roll.rotation.z = flip * Math.PI;
      this.roll.position.y = (this.bm?.pivotY ?? 0.15) + hop * 0.45;
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
}

export class ParkScene extends Phaser.Scene {
  private meta!: Meta;
  private idx = 0;
  private root!: Phaser.GameObjects.Container;
  private card!: Phaser.GameObjects.Container;
  private board!: Phaser.GameObjects.Container;
  private closed = false;
  private from = 'Menu';
  private go!: Pill;
  /** Boards in the picker (those whose model is there) and the one shown. */
  private boards: BoardDef[] = [];
  private bIdx = 0;
  private table!: Turntable;
  private boardChanged = false;
  private under: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Parks'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.boardChanged = false;
    this.idx = PARKS.indexOf(this.meta.park);
    this.boards = BOARDS.filter(boardReady);
    this.bIdx = Math.max(0, this.boards.findIndex((b) => b.id === usableBoard(this.meta.board).id));
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    // an opaque backdrop: nothing of the menu shows through. It and the glass panels sit under the
    // 3D turntable's image (WORLD_DEPTH −100); the text and buttons above it.
    const dim = this.add.rectangle(0, 0, width, height, 0x070b1a, 1).setOrigin(0).setInteractive().setDepth(-300);
    const panel = this.add.container(width / 2, 650, [glass(this, 690, 1240, { alpha: 1, r: 30, sheen: false })]).setDepth(-250);
    const boardBox = this.add.container(width / 2, BOARD_Y + 30, [glass(this, 640, 380, { color: 0x0b1020, alpha: 0.85, r: 22, sheen: false })]).setDepth(-200);
    this.under = [dim, panel, boardBox];
    this.root.add(txt(this, width / 2, 84, t('parksTitle'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 7 }));
    // arrows: parks at the top, boards beside the turntable
    const arrow = (x: number, y: number, d: number, icon: string, on: (d: number) => void) => {
      const c = this.add.container(x, y);
      const g = this.add.graphics().fillStyle(0xffffff, 0.12).fillCircle(0, 0, 40).lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, 40);
      c.add([g, this.add.image(0, 0, icon).setDisplaySize(42, 42)]);
      c.setSize(96, 96).setInteractive({ useHandCursor: true }).on('pointerup', () => on(d));
      this.root.add(c);
    };
    arrow(78, 170, -1, 'icon-arrowleft', (d) => this.step(d));
    arrow(width - 78, 170, 1, 'icon-arrowright', (d) => this.step(d));
    arrow(104, BOARD_Y, -1, 'icon-arrowleft', (d) => this.stepBoard(d));
    arrow(width - 104, BOARD_Y, 1, 'icon-arrowright', (d) => this.stepBoard(d));
    // the turntable itself is tappable too: the next board
    this.root.add(this.add.zone(width / 2, BOARD_Y, 300, 190).setInteractive({ useHandCursor: true }).on('pointerup', () => this.stepBoard(1)));
    this.card = this.add.container(0, 0);
    this.board = this.add.container(0, 0);
    this.root.add([this.card, this.board]);
    this.go = new Pill(this, width / 2, 694, 420, 84, 0x2fae5a, () => this.pick(), 30);
    const back = new Pill(this, width / 2, 1206, 300, 76, 0x3b4466, () => this.close(), 26);
    back.setLabels(t('back'));
    this.root.add([this.go, back]);
    this.table = new Turntable(this, width / 2, BOARD_Y + 8, 9.5);
    this.draw();
    this.drawBoard(false);
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.step(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.step(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.stepBoard(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.stepBoard(1);
      else if (e.code === 'Enter' || e.code === 'Space') this.pick();
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    panel.setScale(0.96);
    this.tweens.add({ targets: panel, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private get id(): ParkId { return PARKS[this.idx]; }

  private step(d: number): void {
    this.idx = (this.idx + d + PARKS.length) % PARKS.length;
    playSfx(this, 'ui-click');
    this.draw();
    this.card.setX(d * 40).setAlpha(0.3);
    this.tweens.add({ targets: this.card, x: 0, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
  }

  private draw(): void {
    const { width } = this.scale;
    const c = this.card;
    c.removeAll(true);
    const id = this.id, p = park(id), m = this.meta;
    const open = unlocked(m, id);
    const done = m.goals[id];
    c.add(txt(this, width / 2, 158, t('park_' + id), { title: true, size: 36, color: '#ffffff', strokeThickness: 6 }));
    c.add(txt(this, width / 2, 204, t('parkSub_' + id), { size: 21, color: '#cfd8f0', strokeThickness: 0, shadow: false, wrap: 480 }));
    // dots: which park of three
    PARKS.forEach((_q, i) => {
      c.add(this.add.graphics().fillStyle(i === this.idx ? 0xffd23f : 0xffffff, i === this.idx ? 1 : 0.3).fillCircle(width / 2 + (i - 1) * 26, 240, 7));
    });
    const box = this.add.container(width / 2, 450, [glass(this, 620, 368, { color: 0x0b1020, alpha: 0.85, r: 22, sheen: false })]);
    c.add(box);
    box.add(txt(this, 0, -154, t('goalsCount', { n: done.length, m: p.goals.length }) + '   ·   ' + t('bestIn', { n: fmt(m.best[id]) }), { title: true, size: 22, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    const mode = isEasy() ? 'easy' : 'normal';
    p.goals.forEach((g, i) => {
      const y = -112 + i * 37;
      const ok = done.includes(g.id);
      const mark = this.add.graphics();
      if (ok) mark.fillStyle(0x2fae5a, 1).fillCircle(-268, y, 14).lineStyle(4, 0xffffff, 1).beginPath().moveTo(-275, y).lineTo(-269, y + 6).lineTo(-259, y - 6).strokePath();
      else mark.lineStyle(3, 0xffffff, 0.45).strokeCircle(-268, y, 13);
      const tx = txt(this, -240, y, goalText(g, goalNeed(g, mode)), { size: 21, color: ok ? '#9dffb8' : '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
      box.add([mark, tx]);
    });
    if (!open) {
      const prev = PARKS[this.idx - 1];
      const lock = this.add.container(0, 0, [this.add.graphics().fillStyle(0x050814, 0.86).fillRoundedRect(-310, -184, 620, 368, 22)]);
      lock.add(this.add.image(0, -60, 'icon-locked').setDisplaySize(84, 84));
      lock.add(txt(this, 0, 40, t('locked', { park: t('park_' + prev), n: UNLOCK_GOALS }), { title: true, size: 26, color: '#ffd23f', strokeThickness: 0, shadow: false, wrap: 500 }));
      box.add(lock);
    }
    const sel = m.park === id;
    this.go.setEnabled(open);
    this.go.setColor(sel ? 0x3b7fd8 : 0x2fae5a);
    this.go.setLabels(sel ? t('selected') : t('skateHere'));
  }

  // ------------------------------------------------------------------ the board picker

  private stepBoard(d: number): void {
    if (!this.boards.length) return;
    this.bIdx = (this.bIdx + d + this.boards.length) % this.boards.length;
    const b = this.boards[this.bIdx];
    // an open board is ridden at once; a locked one is only shown
    if (boardIsOpen(this.meta, b.id) && this.meta.board !== b.id) {
      this.meta.board = b.id;
      saveMeta(this.meta);
      this.boardChanged = true;
      playSfx(this, 'ui-select');
    } else playSfx(this, 'ui-click');
    this.drawBoard(true);
  }

  private drawBoard(anim: boolean): void {
    const { width } = this.scale;
    const c = this.board;
    c.removeAll(true);
    const b = this.boards[this.bIdx];
    if (!b) return;
    this.table.show(b);
    const open = boardIsOpen(this.meta, b.id);
    const rc = '#' + RARITY_COLOR[b.rarity].toString(16).padStart(6, '0');
    c.add(txt(this, width / 2, BOARD_Y - 128, t('board') + '  ' + (this.bIdx + 1) + '/' + this.boards.length, { title: true, size: 22, color: '#9fe8ff', strokeThickness: 0, shadow: false }));
    const name = txt(this, width / 2, BOARD_Y + 104, loc(b.name), { title: true, size: 30, color: '#ffffff', strokeThickness: 6 });
    const rar = txt(this, width / 2, BOARD_Y + 140, t('rarity_' + b.rarity), { title: true, size: 18, color: rc, strokeThickness: 4 });
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
      const lock = this.add.image(width / 2 + 150, BOARD_Y - 70, 'icon-locked').setDisplaySize(46, 46);
      c.add(lock);
    } else {
      status = usableBoard(this.meta.board).id === b.id ? '✓ ' + t('boardRiding') : t('boardOpen');
      col = '#7dffa0';
    }
    c.add(txt(this, width / 2, BOARD_Y + 178, status, { size: 21, color: col, strokeThickness: 0, shadow: false, wrap: 560 }));
    // dots: where in the list (a row of rarity-coloured pips)
    const n = this.boards.length, gap = Math.min(22, 440 / n);
    const g = this.add.graphics();
    this.boards.forEach((q, i) => {
      const x = width / 2 + (i - (n - 1) / 2) * gap, y = BOARD_Y - 96;
      const on = boardIsOpen(this.meta, q.id);
      g.fillStyle(RARITY_COLOR[q.rarity], i === this.bIdx ? 1 : on ? 0.55 : 0.2).fillCircle(x, y, i === this.bIdx ? 6 : 4);
    });
    c.add(g);
    if (anim) {
      name.setScale(0.8);
      this.tweens.add({ targets: name, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }
  }

  private pick(): void {
    if (!unlocked(this.meta, this.id)) { playSfx(this, 'error'); return; }
    this.meta.park = this.id;
    saveMeta(this.meta);
    playSfx(this, 'ui-select');
    this.close(true);
  }

  close(changed = false): void {
    if (this.closed) return;
    this.closed = true;
    const restart = changed || this.boardChanged;
    this.tweens.add({
      targets: [this.root, ...this.under], alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        const menu = this.scene.get(this.from);
        // the menu's backdrop shows the chosen park and board: build it again
        if (restart) menu.scene.restart();
        else { this.scene.resume(this.from); menu.events.emit('parks-closed'); }
      },
    });
  }

  /** Test hooks. */
  testStep(d: number): void { this.step(d); }
  testInfo(): { board: string; shown: string; owned: string[]; open: string[]; listed: string[] } {
    return { board: this.meta.board, shown: this.boards[this.bIdx]?.id, owned: this.meta.owned, open: BOARDS.filter((b) => boardIsOpen(this.meta, b.id)).map((b) => b.id), listed: this.boards.map((b) => b.id) };
  }
  testBoard(id: string): void { const i = this.boards.findIndex((b) => b.id === id); if (i >= 0) { this.bIdx = (i - 1 + this.boards.length) % this.boards.length; this.stepBoard(1); } }
}

/** The board picker's centre line (the turntable). */
const BOARD_Y = 880;
