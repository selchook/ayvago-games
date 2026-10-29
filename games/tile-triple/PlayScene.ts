import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, popup, txt, t, rng, COLORS } from '@core';

/** Animal faces in the order new levels introduce them (most distinct first). */
export const ANIMALS = ['chick', 'frog', 'pig', 'panda', 'parrot', 'hippo', 'monkey', 'penguin', 'cow', 'elephant', 'crocodile', 'giraffe', 'chicken', 'zebra'];
const TINTS: Record<string, number> = {
  chick: 0xffd23f, frog: 0x5dff7a, pig: 0xff8fd8, panda: 0xffffff, parrot: 0xec3013, hippo: 0x3e8ef0, monkey: 0xb07040,
  penguin: 0x3a6a78, cow: 0xff8fd8, elephant: 0xc0c0c8, crocodile: 0x2ecc71, giraffe: 0xffc020, chicken: 0xff4040, zebra: 0xdddddd,
};

const TW = 88;               // tile footprint (world px)
const TH = 96;
const BOARD_TOP = 150;
const BOARD_BOTTOM = 880;
const TRAY_Y = 975;
const TRAY_SLOTS = 7;
const SLOT_W = 92;
const LIFT = 6;              // visual lift per layer

interface Tile {
  id: number;
  type: number;
  gx: number;                // half-tile grid units
  gy: number;
  layer: number;
  onBoard: boolean;
  inTray: boolean;
  free: boolean;
  view: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Image;
  pic: Phaser.GameObjects.Image;
}

/** Generates the procedural tile face texture once per game. */
function makeTileTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('tt-face')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.35).fillRoundedRect(2, 10, TW - 4, TH - 4, 16);
  g.fillStyle(0xb8925a, 1).fillRoundedRect(2, 6, TW - 4, TH - 6, 16);
  g.fillStyle(0xfff4dc, 1).fillRoundedRect(2, 0, TW - 4, TH - 10, 16);
  g.fillStyle(0xffffff, 0.7).fillRoundedRect(10, 4, TW - 20, 8, 4);
  g.lineStyle(3, 0x6b4a22, 1).strokeRoundedRect(2, 0, TW - 4, TH - 4, 16);
  g.generateTexture('tt-face', TW, TH + 6);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private level = 1;
  private tiles: Tile[] = [];
  private tray: Tile[] = [];
  private history: Tile[] = [];
  private undos = 3;
  private shuffles = 2;
  private busy = false;
  private combo = 0;
  private lastClearAt = -99;
  private boardX = 0;
  private boardY = 0;
  private totalTiles = 0;
  private cursor: Tile | null = null;
  private kbActive = false;

  private trayBg!: Phaser.GameObjects.Graphics;
  private trayWarn!: Phaser.GameObjects.Rectangle;
  private cursorBox!: Phaser.GameObjects.Rectangle;
  private progress!: Phaser.GameObjects.Rectangle;
  private undoBtn!: Button;
  private shuffleBtn!: Button;
  private flashRect!: Phaser.GameObjects.Rectangle;

  createGame(): void {
    makeTileTexture(this);
    this.level = 1;
    this.tiles = [];
    this.tray = [];
    this.history = [];
    this.undos = 3;
    this.shuffles = 2;
    this.busy = false;
    this.combo = 0;
    this.lastClearAt = -99;
    this.cursor = null;
    this.kbActive = false;

    const { width, height } = this.scale;
    // progress bar (tiles left)
    this.add.rectangle(width / 2, 92, width - 48, 14, 0x000000, 0.55).setStrokeStyle(2, 0xffffff, 0.35);
    this.progress = this.add.rectangle(26, 92, width - 52, 8, COLORS.cyan).setOrigin(0, 0.5);

    // tray
    const trayW = TRAY_SLOTS * SLOT_W + 24;
    this.trayWarn = this.add.rectangle(width / 2, TRAY_Y, trayW + 16, 136, COLORS.red, 0).setDepth(1990);
    this.trayBg = this.add.graphics().setDepth(1995);
    this.trayBg.fillStyle(0x2b1a10, 0.95).fillRoundedRect(width / 2 - trayW / 2, TRAY_Y - 62, trayW, 124, 20);
    this.trayBg.lineStyle(6, 0xb8925a, 1).strokeRoundedRect(width / 2 - trayW / 2, TRAY_Y - 62, trayW, 124, 20);
    for (let i = 0; i < TRAY_SLOTS; i++) {
      this.trayBg.fillStyle(0x000000, 0.35).fillRoundedRect(this.slotX(i) - SLOT_W / 2 + 4, TRAY_Y - 50, SLOT_W - 8, 100, 12);
    }

    this.cursorBox = this.add.rectangle(0, 0, TW + 8, TH + 4).setStrokeStyle(6, COLORS.magenta).setDepth(1900).setVisible(false);
    this.tweens.add({ targets: this.cursorBox, alpha: 0.4, duration: 350, yoyo: true, repeat: -1 });

    this.undoBtn = new Button(this, 190, height - 120, '', () => this.undo(), { width: 300, height: 96, size: 24, color: COLORS.purple });
    this.shuffleBtn = new Button(this, 530, height - 120, '', () => this.shuffle(), { width: 300, height: 96, size: 24, color: 0x2a9d8f });
    this.undoBtn.setDepth(2100);
    this.shuffleBtn.setDepth(2100);
    this.flashRect = this.add.rectangle(0, 0, width, height, 0xffffff, 0).setOrigin(0).setDepth(7000);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointer(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.buildLevel();
  }

  // ---------------------------------------------------------------- level generation

  private levelSpec(): { cols: number; rows: number; layers: number; types: number; window: number; keep: number } {
    const L = this.level;
    return {
      cols: Math.min(5 + Math.floor(L / 3), 7),
      rows: Math.min(5 + Math.floor(L / 2), 7),
      layers: Math.min(2 + Math.floor((L - 1) / 2), 5),
      types: L === 1 ? 3 : Math.min(3 + L, 12),
      window: L <= 2 ? 1 : L <= 5 ? 2 : 3,
      keep: Math.max(0.68, 0.9 - L * 0.02),
    };
  }

  private buildLevel(): void {
    this.tiles.forEach((tl) => tl.view.destroy());
    this.tiles = [];
    this.tray = [];
    this.history = [];
    this.cursor = null;
    this.combo = 0;

    const S = this.levelSpec();
    type Pos = { gx: number; gy: number; layer: number };
    const pos: Pos[] = [];
    for (let layer = 0; layer < S.layers; layer++) {
      // pyramid: every layer sits half a tile inside the one below
      const cols = S.cols - layer, rows = S.rows - layer;
      if (cols < 1 || rows < 1) break;
      const ox = layer, oy = layer;
      const keep = layer === 0 ? Math.min(1, S.keep + 0.05) : S.keep;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < Math.ceil(cols / 2); c++) {
          if (!rng.chance(keep)) continue;
          pos.push({ gx: ox + c * 2, gy: oy + r * 2, layer });
          const mirror = cols - 1 - c;
          if (mirror !== c) pos.push({ gx: ox + mirror * 2, gy: oy + r * 2, layer });
        }
      }
    }
    // trim the top-most tiles until the count is a multiple of 3
    pos.sort((a, b) => a.layer - b.layer);
    while (pos.length % 3 !== 0) pos.splice(pos.length - 1 - rng.int(0, Math.min(3, pos.length - 1)), 1);

    // removal order: repeatedly take a random free tile, so a solution always exists
    const order: number[] = [];
    const alive = pos.map(() => true);
    for (let k = 0; k < pos.length; k++) {
      const free = pos.map((_, i) => i).filter((i) => alive[i] && !pos.some((q, j) => alive[j] && q.layer > pos[i].layer && this.overlaps(q, pos[i])));
      const pick = rng.pick(free);
      alive[pick] = false;
      order.push(pick);
    }
    // assign types in shuffled windows of `window` triples along that order
    const types: number[] = new Array(pos.length).fill(0);
    const pool = Array.from({ length: S.types }, (_, i) => i);
    let bag: number[] = [];
    for (let w = 0; w < order.length; w += S.window * 3) {
      const chunk = order.slice(w, w + S.window * 3);
      const kinds: number[] = [];
      for (let k = 0; k < chunk.length / 3; k++) {
        if (!bag.length) bag = rng.shuffle([...pool]);
        kinds.push(bag.pop()!);
      }
      const seq = rng.shuffle(kinds.flatMap((k) => [k, k, k]));
      chunk.forEach((idx, i) => { types[idx] = seq[i]; });
    }

    // centre the board
    const maxGx = Math.max(...pos.map((p) => p.gx)) + 2, maxGy = Math.max(...pos.map((p) => p.gy)) + 2;
    this.boardX = this.scale.width / 2 - (maxGx * TW / 2) / 2;
    this.boardY = (BOARD_TOP + BOARD_BOTTOM) / 2 - (maxGy * TH / 2) / 2;

    pos.forEach((p, i) => {
      const type = types[i];
      const view = this.add.container(0, 0);
      const face = this.add.image(0, 0, 'tt-face');
      const pic = this.add.image(0, -4, 'an-' + ANIMALS[type]);
      const sc = 62 / Math.max(pic.width, pic.height);
      pic.setScale(sc).setData('base', sc);
      view.add([face, pic]);
      const tile: Tile = { id: i, type, gx: p.gx, gy: p.gy, layer: p.layer, onBoard: true, inTray: false, free: false, view, face, pic };
      const [x, y] = this.boardPos(tile);
      view.setPosition(x, y - 400).setAlpha(0).setDepth(this.depthOf(tile));
      this.tweens.add({ targets: view, y, alpha: 1, duration: 420, delay: p.layer * 160 + (p.gy * 7 + p.gx) * 6, ease: 'Bounce.easeOut' });
      this.tiles.push(tile);
    });
    this.totalTiles = this.tiles.length;
    this.refreshFree();
    this.refreshUi();
    this.busy = true;
    this.time.delayedCall(700 + S.layers * 160, () => { this.busy = false; });
    this.sfx('deal', { volume: 0.5 });

    const banner = txt(this, this.scale.width / 2, 520, `${t('level')} ${this.level}`, { title: true, size: 48, color: '#ffd23f' }).setDepth(3000).setScale(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 380, ease: 'Back.easeOut', yoyo: true, hold: 500, onComplete: () => banner.destroy() });
  }

  private overlaps(a: { gx: number; gy: number }, b: { gx: number; gy: number }): boolean {
    return Math.abs(a.gx - b.gx) < 2 && Math.abs(a.gy - b.gy) < 2;
  }

  private boardPos(tl: Tile): [number, number] {
    return [this.boardX + tl.gx * TW / 2 + TW / 2 - tl.layer * 2, this.boardY + tl.gy * TH / 2 + TH / 2 - tl.layer * LIFT];
  }

  private depthOf(tl: Tile): number {
    return 10 + tl.layer * 100 + tl.gy * 2 + tl.gx * 0.01;
  }

  private slotX(i: number): number {
    return this.scale.width / 2 + (i - (TRAY_SLOTS - 1) / 2) * SLOT_W;
  }

  private refreshFree(): void {
    for (const tl of this.tiles) {
      if (!tl.onBoard) continue;
      const free = !this.tiles.some((o) => o.onBoard && o.layer > tl.layer && this.overlaps(o, tl));
      if (free !== tl.free || !tl.face.getData('init')) {
        tl.free = free;
        tl.face.setData('init', true);
        const g = Math.min(200, 105 + tl.layer * 24);   // deeper layers sit darker
        const tint = free ? 0xffffff : Phaser.Display.Color.GetColor(g, g - 6, g + 10);
        tl.face.setTint(tint);
        tl.pic.setTint(tint);
      }
    }
    if (this.cursor && (!this.cursor.onBoard || !this.cursor.free)) this.cursor = this.nearestFree(this.cursor.view.x, this.cursor.view.y);
    this.drawCursor();
  }

  private refreshUi(): void {
    const left = this.tiles.filter((x) => x.onBoard || x.inTray).length;
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.progress.width = (this.scale.width - 52) * (this.totalTiles ? left / this.totalTiles : 0);
    this.undoBtn.setText(`${t('undo')} ${this.undos}`).setAlpha(this.undos > 0 ? 1 : 0.45);
    this.shuffleBtn.setText(`${t('shuffle')} ${this.shuffles}`).setAlpha(this.shuffles > 0 ? 1 : 0.45);
    const danger = this.tray.length >= TRAY_SLOTS - 2;
    this.tweens.killTweensOf(this.trayWarn);
    if (danger) {
      this.trayWarn.setFillStyle(COLORS.red, 0.6);
      this.tweens.add({ targets: this.trayWarn, alpha: 0.15, duration: 260, yoyo: true, repeat: -1 });
    } else this.trayWarn.setFillStyle(COLORS.red, 0).setAlpha(1);
  }

  // ---------------------------------------------------------------- input

  private tileAt(x: number, y: number): Tile | null {
    let best: Tile | null = null;
    for (const tl of this.tiles) {
      if (!tl.onBoard) continue;
      const [tx, ty] = this.boardPos(tl);
      if (Math.abs(x - tx) <= TW / 2 && Math.abs(y - ty) <= TH / 2 && (!best || this.depthOf(tl) > this.depthOf(best))) best = tl;
    }
    return best;
  }

  private onPointer(p: Phaser.Input.Pointer): void {
    if (this.isOver || this.busy) return;
    const tl = this.tileAt(p.x, p.y);
    if (!tl) return;
    this.kbActive = false;
    this.cursorBox.setVisible(false);
    this.pick(tl);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.code]) {
      if (!this.kbActive || !this.cursor) {
        this.kbActive = true;
        this.cursor = this.cursor?.onBoard && this.cursor.free ? this.cursor : this.nearestFree(this.scale.width / 2, 500);
      } else this.moveCursor(...dirs[e.code]);
      this.sfx('tick', { volume: 0.35 });
      this.drawCursor();
    } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') {
      if (this.busy) return;
      this.kbActive = true;
      if (!this.cursor || !this.cursor.onBoard) this.cursor = this.nearestFree(this.scale.width / 2, 500);
      if (this.cursor) this.pick(this.cursor);
    } else if (e.code === 'KeyU' || e.code === 'KeyX' || e.code === 'Backspace') this.undoBtn.press();
    else if (e.code === 'KeyS' || e.code === 'KeyC') this.shuffleBtn.press();
  }

  private nearestFree(x: number, y: number): Tile | null {
    let best: Tile | null = null, bd = Infinity;
    for (const tl of this.tiles) {
      if (!tl.onBoard || !tl.free) continue;
      const d = Phaser.Math.Distance.Between(x, y, tl.view.x, tl.view.y);
      if (d < bd) { bd = d; best = tl; }
    }
    return best;
  }

  private moveCursor(dx: number, dy: number): void {
    if (!this.cursor) return;
    const cx = this.cursor.view.x, cy = this.cursor.view.y;
    let best: Tile | null = null, bs = Infinity;
    for (const tl of this.tiles) {
      if (!tl.onBoard || !tl.free || tl === this.cursor) continue;
      const vx = tl.view.x - cx, vy = tl.view.y - cy;
      const along = vx * dx + vy * dy;
      if (along <= 10) continue;
      const side = Math.abs(vx * dy - vy * dx);
      const s = along + side * 2.2;
      if (s < bs) { bs = s; best = tl; }
    }
    if (best) this.cursor = best;
  }

  private drawCursor(): void {
    if (!this.kbActive || !this.cursor || !this.cursor.onBoard) { this.cursorBox.setVisible(false); return; }
    const [x, y] = this.boardPos(this.cursor);
    this.cursorBox.setPosition(x, y + 2).setVisible(true).setDepth(this.depthOf(this.cursor) + 0.5);
  }

  // ---------------------------------------------------------------- game logic

  private pick(tl: Tile): void {
    if (!tl.free) {
      this.sfxAt('blocked', tl.view.x, { volume: 0.35 });
      this.tweens.add({ targets: tl.view, x: tl.view.x + 6, duration: 40, yoyo: true, repeat: 2 });
      return;
    }
    if (this.tray.length >= TRAY_SLOTS) return;
    tl.onBoard = false;
    tl.inTray = true;
    this.history.push(tl);
    // insert next to its twins
    let at = this.tray.length;
    for (let i = this.tray.length - 1; i >= 0; i--) if (this.tray[i].type === tl.type) { at = i + 1; break; }
    this.tray.splice(at, 0, tl);
    tl.view.setDepth(2000 + at);
    this.addScore(5);
    // the pick tone climbs as the tray fills: an audible warning before it overflows
    this.sfxAt('pick', tl.view.x, { volume: 0.55, rate: 1 + (this.tray.length - 1) * 0.06, exact: true });
    burst(this, tl.view.x, tl.view.y, TINTS[ANIMALS[tl.type]] ?? 0xffffff, 8, 160);

    const same = this.tray.filter((x) => x.type === tl.type);
    let cleared: Tile[] = [];
    if (same.length >= 3) {
      cleared = same.slice(0, 3);
      this.tray = this.tray.filter((x) => !cleared.includes(x));
      cleared.forEach((c) => { c.inTray = false; });
      this.history = this.history.filter((x) => !cleared.includes(x));
    }
    this.layoutTray(cleared, at);
    this.refreshFree();

    if (cleared.length) this.time.delayedCall(260, () => this.clearTriple(cleared));
    if (this.tray.length >= TRAY_SLOTS) this.lose();
    else if (!cleared.length && this.tray.length === TRAY_SLOTS - 1) this.sfx('warn', { volume: 0.5 });
    this.refreshUi();
    if (!this.tiles.some((x) => x.onBoard || x.inTray)) this.time.delayedCall(700, () => this.levelClear());
  }

  /** Tweens every tray tile to its slot; cleared triples gather on their middle slot. */
  private layoutTray(cleared: Tile[], insertAt: number): void {
    this.tray.forEach((x, i) => {
      x.view.setDepth(2000 + i);
      this.tweens.add({ targets: x.view, x: this.slotX(i), y: TRAY_Y, scale: 0.92, duration: 220, ease: 'Quad.easeOut' });
    });
    if (cleared.length) {
      const mid = this.slotX(Math.min(insertAt, TRAY_SLOTS - 1));
      cleared.forEach((x, i) => {
        x.view.setDepth(2050 + i);
        this.tweens.add({ targets: x.view, x: mid + (i - 1) * 60, y: TRAY_Y, scale: 0.92, duration: 220, ease: 'Quad.easeOut' });
      });
    }
  }

  private clearTriple(cleared: Tile[]): void {
    if (!cleared[0]?.view.active) return;
    const cx = cleared[1].view.x, cy = TRAY_Y;
    this.tweens.add({
      targets: cleared.map((c) => c.view), x: cx, scale: 1.2, duration: 140, ease: 'Quad.easeIn',
      onComplete: () => {
        cleared.forEach((c) => this.tweens.add({ targets: c.view, scale: 0, alpha: 0, duration: 160, onComplete: () => c.view.setVisible(false) }));
        burst(this, cx, cy, [TINTS[ANIMALS[cleared[0].type]] ?? 0xffffff, 0xffd23f, 0xffffff], 26, 340);
        shake(this, 0.005, 120);
      },
    });
    this.combo = this.elapsed - this.lastClearAt < 3.5 ? this.combo + 1 : 1;
    this.lastClearAt = this.elapsed;
    const pts = (30 + this.level * 10) * Math.min(this.combo, 5);
    this.addScore(pts, cx, cy - 80);
    if (this.combo > 1) popup(this, cx, cy - 140, `${t('combo')} x${Math.min(this.combo, 5)}`, '#ff4fa3', 22);
    if (this.combo > 1) this.sfxAt('combo', cx, { volume: 0.6, rate: 1 + (Math.min(this.combo, 5) - 2) * 0.06, exact: true });
    else this.sfxAt('match', cx, { volume: 0.55 });
  }

  private undo(): void {
    if (this.isOver || this.busy) return;
    const tl = this.history[this.history.length - 1];
    if (this.undos <= 0 || !tl || !tl.inTray) {
      this.sfx('blocked', { volume: 0.4 });
      return;
    }
    this.undos--;
    this.history.pop();
    this.tray = this.tray.filter((x) => x !== tl);
    tl.inTray = false;
    tl.onBoard = true;
    const [x, y] = this.boardPos(tl);
    tl.view.setDepth(this.depthOf(tl));
    this.tweens.add({ targets: tl.view, x, y, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.layoutTray([], 0);
    this.refreshFree();
    this.refreshUi();
    this.sfx('undo', { volume: 0.5 });
  }

  private shuffle(): void {
    if (this.isOver || this.busy) return;
    const board = this.tiles.filter((x) => x.onBoard);
    if (this.shuffles <= 0 || board.length < 2) {
      this.sfx('blocked', { volume: 0.4 });
      return;
    }
    this.shuffles--;
    this.busy = true;
    const kinds = rng.shuffle(board.map((x) => x.type));
    this.sfx('shuffle', { volume: 0.55 });
    this.flashLocal(0x3ee6ff, 0.25);
    board.forEach((tl, i) => {
      this.tweens.add({
        targets: tl.view, scaleX: 0, duration: 150, delay: (i % 12) * 12, yoyo: true,
        onYoyo: () => {
          tl.type = kinds[i];
          const base = 62 / Math.max(this.textures.getFrame('an-' + ANIMALS[tl.type]).width, this.textures.getFrame('an-' + ANIMALS[tl.type]).height);
          tl.pic.setTexture('an-' + ANIMALS[tl.type]).setScale(base);
        },
      });
    });
    this.time.delayedCall(450, () => { this.busy = false; });
    this.refreshUi();
  }

  private lose(): void {
    this.busy = true;
    this.cursorBox.setVisible(false);
    shake(this, 0.014, 320);
    this.flashLocal(COLORS.red, 0.35);
    this.sfx('lose', { volume: 0.6 });
    this.tray.forEach((x, i) => this.tweens.add({ targets: x.view, angle: rng.int(-25, 25), y: TRAY_Y + 10, duration: 200, delay: i * 50 }));
    this.endGame({ title: t('trayFull'), delay: 1200 });
  }

  private levelClear(): void {
    if (this.isOver) return;
    this.busy = true;
    const { width } = this.scale;
    const bonus = 200 * this.level;
    this.flashLocal(0xffffff, 0.35);
    shake(this, 0.008, 200);
    this.sfx('clear', { volume: 0.7, exact: true });
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 110, () => burst(this, rng.int(100, width - 100), rng.int(250, 750), [0xffd23f, 0xff4fa3, 0x5dff7a, 0x3ee6ff], 24, 380));
    const banner = txt(this, width / 2, 460, t('levelClear'), { title: true, size: 40, color: '#5dff7a', wrap: width - 60 }).setDepth(3000).setScale(0);
    this.tweens.add({ targets: banner, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.time.delayedCall(400, () => this.addScore(bonus, width / 2, 560));
    this.time.delayedCall(1800, () => {
      banner.destroy();
      this.level++;
      this.undos = Math.min(this.undos + 1, 5);
      this.shuffles = Math.min(this.shuffles + 1, 5);
      this.buildLevel();
    });
  }

  private flashLocal(color: number, alpha: number): void {
    this.flashRect.setFillStyle(color, 1).setAlpha(alpha);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 260 });
  }

  updateGame(): void {
    /* turn-based: everything happens in input handlers and tweens */
  }
}
