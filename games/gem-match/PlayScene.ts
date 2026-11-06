import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';
import { THEMES, makeBackdrop, makeBoard, makeFx, makeGlass } from './art';

export const GEM_FILES = ['red_diamond', 'blue_polygon', 'green_square', 'yellow_polygon', 'purple_diamond', 'grey_square'];
const GEM_TINTS = [0xff4a3a, 0x3eb4ff, 0x8be03a, 0xffd23f, 0xb07cff, 0xe0e0e0];
const GEM_SIZE = [70, 70, 58, 70, 70, 58];

const COLS = 8, ROWS = 8, S = 84;
const X0 = (720 - COLS * S) / 2, Y0 = 350;
const PAD = 14;                 // glass border around the cells

type Special = '' | 'h' | 'v' | 'bomb' | 'rainbow';
interface Gem { color: number; special: Special; img: Phaser.GameObjects.Image; ov?: Phaser.GameObjects.Image }
interface Cell { r: number; c: number }

// target score, moves, colour count
const LEVELS: Array<[number, number, number]> = [
  [600, 18, 5], [900, 18, 5], [1200, 20, 5], [1100, 20, 6], [1400, 20, 6],
  [1700, 22, 6], [2000, 22, 6], [2300, 23, 6], [2600, 24, 6], [3000, 25, 6],
];

export class PlayScene extends ArcadeScene {
  private g: (Gem | null)[][] = [];
  private busy = false;
  private sel: Cell | null = null;
  private cursor: Cell = { r: 3, c: 3 };
  private kbMode = false;
  private drag: (Cell & { x: number; y: number; undo?: boolean }) | null = null;
  private level = 0;
  private moves = 0;
  private levelScore = 0;
  private target = 0;
  private colors = 5;
  private gen = 0;
  private idle = 0;
  private hinting = false;
  private cursorImg!: Phaser.GameObjects.Image;
  private selImg!: Phaser.GameObjects.Image;
  private levelTxt!: Phaser.GameObjects.Text;
  private movesTxt!: Phaser.GameObjects.Text;
  private targetTxt!: Phaser.GameObjects.Text;
  private barFill!: Phaser.GameObjects.Image;
  private barTip!: Phaser.GameObjects.Image;
  private barK = 0;
  private layer!: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Image;
  private orbs: Phaser.GameObjects.Image[] = [];
  private theme = -1;
  // Double move: a swap that matches nothing waits here; a second swap that makes a match turns
  // both into one move, so 4s and 5s can be built. Nothing matched after both: both go back.
  private pending: { a: Cell; b: Cell } | null = null;
  private pendingRings: Phaser.GameObjects.Image[] = [];
  private hintText!: Phaser.GameObjects.Text;
  // Combo move: after a swap that matches, one more swap is free while the matches clear and fall
  // (it runs at the next step of the chain) and for a moment after; its matches keep the chain going.
  private resolving = false;
  private comboOpen = false;
  private comboUsed = false;
  private comboTimer = 0;
  private comboQueued: { ga: Gem; gb: Gem } | null = null;
  private comboFocus: Cell | null = null;
  private swapUntil = 0;
  private comboRings: Phaser.GameObjects.Image[] = [];
  private comboBar!: Phaser.GameObjects.Graphics;
  private lastChain = 0;

  createGame(): void {
    this.gen++;
    this.g = []; this.busy = false; this.sel = null; this.cursor = { r: 3, c: 3 }; this.kbMode = false;
    this.drag = null; this.level = 0; this.idle = 0; this.hinting = false;
    makeFx(this);
    this.theme = -1; this.barK = 0; this.orbs = [];

    // backdrop of the level's colour theme, drifting orbs of light, and the frosted-glass board
    this.bg = this.add.image(0, 0, makeBackdrop(this, 0)).setOrigin(0).setDepth(-10);
    for (let i = 0; i < 7; i++) {
      const o = this.add.image(rng.int(40, 680), rng.int(60, 1220), 'gm-glow').setDepth(-9).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(rng.int(60, 160) / 100).setAlpha(rng.int(12, 26) / 100);
      this.tweens.add({ targets: o, x: o.x + rng.int(-90, 90), y: o.y + rng.int(-140, 140), duration: rng.int(7000, 12000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.orbs.push(o);
    }
    this.board = this.add.image(X0 - PAD - 20, Y0 - PAD - 20, makeBoard(this, 0, X0, Y0, COLS, ROWS, S, PAD)).setOrigin(0).setDepth(-5);
    this.applyTheme(0, false);
    this.layer = this.add.container(0, 0);
    const mask = this.make.graphics({}, false).fillRect(X0, Y0, COLS * S, ROWS * S).createGeometryMask();
    this.layer.setMask(mask);

    // top panel: level | target | moves, as glass cards
    const panel = (x: number, label: string, color: string): Phaser.GameObjects.Text => {
      this.add.image(x, 190, makeGlass(this, 200, 104));
      txt(this, x, 162, label, { title: true, size: 16, color });
      return txt(this, x, 208, '', { title: true, size: 28 });
    };
    this.levelTxt = panel(130, t('level'), '#7fe9ff');
    this.targetTxt = panel(360, t('target'), '#ffd23f');
    this.movesTxt = panel(590, t('moves'), '#ff8ad8');
    // progress towards the target: a glossy bar with a light at its tip
    this.add.image(360, 280, 'gm-track');
    this.barFill = this.add.image(36, 280, 'gm-fill').setOrigin(0, 0.5).setCrop(0, 0, 0, 22);
    this.barTip = this.add.image(36, 280, 'gm-glow').setScale(0.42).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.tweens.add({ targets: this.barTip, scale: 0.55, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const hintY = Y0 + ROWS * S + 70;
    this.add.image(360, hintY, makeGlass(this, 520, 64, 32));
    this.hintText = txt(this, 360, hintY, t('hint'), { size: 28, color: '#f1e8ff', wrap: 500 });
    this.pending = null; this.pendingRings = [];
    this.resolving = false; this.comboOpen = false; this.comboUsed = false; this.comboTimer = 0; this.comboQueued = null; this.comboRings = []; this.lastChain = 0; this.comboFocus = null;
    this.comboBar = this.add.graphics().setDepth(5);

    // now and then a gem catches the light
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.glint() });

    this.selImg = this.add.image(0, 0, 'gm-ring').setDisplaySize(S * 112 / 84, S * 112 / 84).setVisible(false).setDepth(20);
    this.cursorImg = this.add.image(0, 0, 'gm-cursor').setDisplaySize(S * 112 / 84, S * 112 / 84).setVisible(false).setDepth(21);
    this.tweens.add({ targets: this.selImg, alpha: 0.55, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => {
      const d = this.drag;
      this.drag = null;
      if (d?.undo && this.pending && !this.busy) this.undoPending();
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.startLevel();
  }

  // ---------- look ----------
  /** Switches backdrop and board to the colour theme of a level, cross-fading after the first. */
  private applyTheme(i: number, fade = true): void {
    if (i === this.theme) return;
    this.theme = i;
    const bgKey = makeBackdrop(this, i);
    const boardKey = makeBoard(this, i, X0, Y0, COLS, ROWS, S, PAD);
    const th = THEMES[i];
    this.orbs.forEach((o, k) => o.setTint(Phaser.Display.Color.HexStringToColor(th.blobs[k % th.blobs.length]).color));
    if (!fade) { this.bg.setTexture(bgKey); this.board.setTexture(boardKey); return; }
    for (const [img, key, depth] of [[this.bg, bgKey, -10], [this.board, boardKey, -5]] as const) {
      const old = this.add.image(img.x, img.y, img.texture.key).setOrigin(0).setDepth(depth + 0.5);
      img.setTexture(key);
      this.tweens.add({ targets: old, alpha: 0, duration: 700, onComplete: () => old.destroy() });
    }
  }

  /** A star of light twinkles on a random gem. */
  private glint(): void {
    if (this.isOver || !this.g.length) return;
    const gem = this.g[rng.int(0, ROWS - 1)]?.[rng.int(0, COLS - 1)];
    if (!gem || !gem.img.active) return;
    const st = this.add.image(gem.img.x - 16, gem.img.y - 18, 'gm-star').setDepth(22).setScale(0).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: st, scale: 0.45, angle: 90, duration: 260, yoyo: true, ease: 'Sine.easeOut', onComplete: () => st.destroy() });
  }

  // ---------- level flow ----------
  private startLevel(): void {
    this.clearPending();
    this.closeCombo();
    const [target, moves, colors] = LEVELS[this.level];
    this.applyTheme(this.level % THEMES.length);
    this.target = target; this.moves = moves; this.colors = colors; this.levelScore = 0;
    this.updateUi();
    // specials earned on the last level carry over to the same cells of the new board
    const carry: Array<{ r: number; c: number; sp: Special }> = [];
    this.g.forEach((row, r) => row.forEach((gem, c) => { if (gem?.special) carry.push({ r, c, sp: gem.special }); }));
    for (const row of this.g) for (const gem of row) if (gem) this.killGem(gem);
    this.g = [];
    for (let r = 0; r < ROWS; r++) {
      this.g.push([]);
      for (let c = 0; c < COLS; c++) {
        let color: number;
        do color = rng.int(0, this.colors - 1);
        while ((c >= 2 && this.colorAt(r, c - 1) === color && this.colorAt(r, c - 2) === color)
          || (r >= 2 && this.colorAt(r - 1, c) === color && this.colorAt(r - 2, c) === color));
        this.g[r].push(this.makeGem(r, c, color, -ROWS + r - 1));
      }
    }
    for (const k of carry) {
      const gem = this.g[k.r][k.c];
      if (!gem) continue;
      this.setSpecial(gem, k.sp);
      if (k.sp !== 'rainbow') this.layer.bringToTop(gem.ov!);
    }
    if (!this.findMove()) this.reshuffleColors();
    this.busy = true;
    const gen = this.gen;
    this.dropAll().then(() => {
      if (gen !== this.gen) return;
      this.busy = false;
      // the carried specials announce themselves once they have landed
      for (const k of carry) {
        const gem = this.g[k.r][k.c];
        if (!gem?.special) continue;
        this.tweens.add({ targets: gem.img, scale: gem.img.scale * 1.3, duration: 160, yoyo: true });
        this.glowAt(gem.img.x, gem.img.y, gem.color >= 0 ? GEM_TINTS[gem.color] : 0xffffff, 1.3, 420);
      }
      if (carry.length) this.sfx('special', { volume: 0.45 });
    });
    const pill = this.add.image(360, 640, makeGlass(this, 360, 110, 55)).setDepth(49).setScale(0.3);
    const banner = txt(this, 360, 640, `${t('level')} ${this.level + 1}`, { title: true, size: 48, color: '#ffd23f' }).setDepth(50).setScale(0.3);
    this.tweens.add({ targets: [banner, pill], scale: 1, duration: 400, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => { banner.destroy(); pill.destroy(); } });
  }

  private updateUi(): void {
    this.levelTxt.setText(`${this.level + 1}/${LEVELS.length}`);
    this.targetTxt.setText(String(this.target));
    this.movesTxt.setText(String(this.moves));
    this.movesTxt.setColor(this.moves <= 3 ? '#ec3013' : '#ffffff');
    const k = Math.min(1, this.levelScore / this.target);
    this.tweens.add({ targets: this, barK: k, duration: 300, ease: 'Sine.easeOut' });
  }

  // ---------- gem helpers ----------
  private px(c: number): number { return X0 + c * S + S / 2; }
  private py(r: number): number { return Y0 + r * S + S / 2; }
  private colorAt(r: number, c: number): number { return this.g[r]?.[c]?.color ?? -9; }

  private makeGem(r: number, c: number, color: number, startRow = r): Gem {
    const img = this.add.image(this.px(c), this.py(startRow), `gem${color}`).setDisplaySize(GEM_SIZE[color], GEM_SIZE[color]);
    this.layer.add(img);
    return { color, special: '', img };
  }

  private setSpecial(gem: Gem, sp: Special): void {
    gem.special = sp;
    gem.ov?.destroy();
    gem.ov = undefined;
    if (sp === 'rainbow') {
      gem.color = -1;
      gem.img.setTexture('gm-rainbow').setDisplaySize(70, 70);
      const halo = this.add.image(gem.img.x, gem.img.y, 'gm-glow').setDisplaySize(120, 120).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
      this.layer.addAt(halo, this.layer.getIndex(gem.img));
      gem.ov = halo;
      this.tweens.add({ targets: halo, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: gem.img, angle: 360, duration: 3000, repeat: -1 });
      return;
    }
    const ov = this.add.image(gem.img.x, gem.img.y, sp === 'bomb' ? 'gm-bomb' : 'gm-line').setDisplaySize(52, 52);
    if (sp === 'v') ov.setAngle(90);
    this.layer.add(ov);
    gem.ov = ov;
    this.tweens.add({ targets: ov, alpha: 0.45, duration: 400, yoyo: true, repeat: -1 });
  }

  private moveGem(gem: Gem, r: number, c: number, ms: number, ease = 'Quad.easeOut'): Promise<void> {
    const targets = gem.ov ? [gem.img, gem.ov] : [gem.img];
    return new Promise((res) => this.tweens.add({ targets, x: this.px(c), y: this.py(r), duration: ms, ease, onComplete: () => res() }));
  }

  private killGem(gem: Gem): void {
    this.tweens.killTweensOf(gem.img);
    gem.img.destroy();
    if (gem.ov) { this.tweens.killTweensOf(gem.ov); gem.ov.destroy(); }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, () => res()));
  }

  private async dropAll(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const gem = this.g[r][c];
      if (gem && gem.img.y !== this.py(r)) {
        const dist = Math.abs(this.py(r) - gem.img.y) / S;
        jobs.push(this.moveGem(gem, r, c, 160 + dist * 45, 'Bounce.easeOut'));
      }
    }
    if (jobs.length) this.sfx('land', { volume: 0.35 });
    await Promise.all(jobs);
  }

  // ---------- input ----------
  private cellAt(x: number, y: number): Cell | null {
    const c = Math.floor((x - X0) / S), r = Math.floor((y - Y0) / S);
    return r >= 0 && r < ROWS && c >= 0 && c < COLS ? { r, c } : null;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.isOver) return;
    const cell = this.cellAt(p.x, p.y);
    this.idle = 0;
    if (!cell || (this.busy && !this.canComboQueue())) return;
    this.kbMode = false; this.cursorImg.setVisible(false);
    // a waiting gem: a drag makes the second swap with it, a plain tap (no drag) undoes it
    if (this.pending && !this.sel && this.isPending(cell)) { this.drag = { ...cell, x: p.x, y: p.y, undo: true }; return; }
    if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
      const a = this.sel;
      this.setSel(null);
      this.trySwap(a, cell);
      return;
    }
    if (this.sel && this.sel.r === cell.r && this.sel.c === cell.c) this.setSel(null);
    else this.setSel(cell);
    this.drag = { ...cell, x: p.x, y: p.y };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!this.drag || !p.isDown || (this.busy && !this.canComboQueue()) || this.isOver) return;
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
    if (Math.hypot(dx, dy) < 28) return;
    const from = { r: this.drag.r, c: this.drag.c };
    const to = Math.abs(dx) > Math.abs(dy) ? { r: from.r, c: from.c + Math.sign(dx) } : { r: from.r + Math.sign(dy), c: from.c };
    this.drag = null;
    this.setSel(null);
    if (to.r >= 0 && to.r < ROWS && to.c >= 0 && to.c < COLS) this.trySwap(from, to);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1],
    };
    const d = dirs[e.code];
    if ((e.code === 'Backspace' || e.code === 'KeyX') && this.pending && !this.busy) { this.undoPending(); return; }
    const pick = e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ';
    if (!d && !pick) return;
    this.idle = 0;
    if (!this.kbMode) { this.kbMode = true; this.placeCursor(); if (!pick) return; }
    if (this.busy && !this.canComboQueue()) return;
    if (pick) {
      if (this.sel && this.sel.r === this.cursor.r && this.sel.c === this.cursor.c) this.setSel(null);
      else this.setSel({ ...this.cursor });
      return;
    }
    const nr = Phaser.Math.Clamp(this.cursor.r + d[0], 0, ROWS - 1), nc = Phaser.Math.Clamp(this.cursor.c + d[1], 0, COLS - 1);
    if (this.sel) {
      const a = this.sel;
      this.setSel(null);
      if (nr !== a.r || nc !== a.c) { this.cursor = { r: nr, c: nc }; this.placeCursor(); this.trySwap(a, { r: nr, c: nc }); }
      return;
    }
    this.cursor = { r: nr, c: nc };
    this.placeCursor();
    this.sfx('cursor', { volume: 0.25 });
  }

  private placeCursor(): void {
    this.cursorImg.setVisible(true).setPosition(this.px(this.cursor.c), this.py(this.cursor.r));
  }

  private setSel(cell: Cell | null): void {
    this.sel = cell;
    this.selImg.setVisible(!!cell);
    if (cell) {
      this.selImg.setPosition(this.px(cell.c), this.py(cell.r));
      this.sfxAt('select', this.px(cell.c), { volume: 0.4 });
      const gem = this.g[cell.r][cell.c];
      if (gem) this.tweens.add({ targets: gem.img, scale: gem.img.scale * 1.12, duration: 90, yoyo: true });
    }
  }

  // ---------- core match logic ----------
  private async trySwap(a: Cell, b: Cell): Promise<void> {
    const ga = this.g[a.r][a.c], gb = this.g[b.r][b.c];
    if (!ga || !gb || this.isOver) return;
    if (this.busy) { if (this.canComboQueue()) this.queueCombo(ga, gb); return; }
    const comboMove = this.comboOpen && !this.comboUsed;
    this.busy = true;
    const gen = this.gen;
    this.sfx('swap', { volume: 0.45 });
    this.g[a.r][a.c] = gb; this.g[b.r][b.c] = ga;
    await Promise.all([this.moveGem(ga, b.r, b.c, 160), this.moveGem(gb, a.r, a.c, 160)]);
    if (gen !== this.gen) return;
    if (comboMove) { await this.comboSwap(a, b, ga, gb); return; }
    this.closeCombo();

    let forced: Set<string> | null = null;
    if (ga.special === 'rainbow' || gb.special === 'rainbow') {
      forced = new Set<string>();
      if (ga.special === 'rainbow' && gb.special === 'rainbow') {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) forced.add(`${r},${c}`);
      } else {
        const other = ga.special === 'rainbow' ? gb : ga;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.g[r][c]?.color === other.color) forced.add(`${r},${c}`);
        forced.add(ga.special === 'rainbow' ? `${b.r},${b.c}` : `${a.r},${a.c}`);
      }
      this.sfx('rainbow', { volume: 0.65 });
      flash(this, 0xffffff, 150);
    } else if (!this.findGroups().length) {
      if (!this.pending) {
        // the first half of a double move: it stays, waiting for a second swap
        this.pending = { a, b };
        this.markPending();
        this.sfx('select', { volume: 0.5, rate: 1.25 });
        if (!this.findMove()) { await this.wait(350); if (gen === this.gen) await this.undoPending(); return; }
        if (gen === this.gen) this.busy = false;
        return;
      }
      // two swaps and still no match: both go back, no move spent
      this.sfx('bad', { volume: 0.45 });
      this.g[a.r][a.c] = ga; this.g[b.r][b.c] = gb;
      await Promise.all([this.moveGem(ga, a.r, a.c, 160), this.moveGem(gb, b.r, b.c, 160)]);
      if (gen !== this.gen) return;
      await this.undoPending();
      return;
    }
    const double = !!this.pending;
    this.clearPending();
    if (double) {
      const pts = 50;
      this.levelScore += pts;
      this.addScore(pts);
      popup(this, 360, Y0 - 20, `${t('double')} +${pts}`, '#7fe9ff', 30);
      this.sfx('special', { volume: 0.5 });
    }
    this.moves--;
    this.updateUi();
    if (this.moves === 3 && this.levelScore < this.target) this.sfx('low', { volume: 0.35 });
    this.comboOpen = true; this.comboUsed = false;
    await this.resolve(b, forced, 0);
    if (gen !== this.gen || this.isOver) return;
    this.afterMove();
  }

  // ---------- combo move ----------
  /** While a chain is clearing, a combo swap is allowed (it plays at once when both gems are still). */
  private canComboQueue(): boolean {
    return this.resolving && this.comboOpen && !this.comboUsed && !this.isOver;
  }

  private queueCombo(ga: Gem, gb: Gem): void {
    if (ga.special === 'rainbow' || gb.special === 'rainbow') return;
    this.comboQueued = { ga, gb };
    this.comboUsed = true;
    this.setSel(null);
    this.playQueued();
  }

  private still(gem: Gem): boolean {
    return gem.img.active && !this.tweens.isTweening(gem.img);
  }

  /**
   * Plays the combo swap made during a chain as soon as both gems are at rest (at once, unless one
   * of them is still falling or popping). It must make a match with one of the two gems, or it
   * goes back. Its matches are cleared by the next step of the chain.
   */
  private playQueued(): void {
    const q = this.comboQueued;
    if (!q || !this.still(q.ga) || !this.still(q.gb)) return;
    this.comboQueued = null;
    const a = this.findGem(q.ga), b = this.findGem(q.gb);
    if (!a || !b || Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) { this.sfx('bad', { volume: 0.4 }); return; }
    this.g[a.r][a.c] = q.gb; this.g[b.r][b.c] = q.ga;
    const hit = this.findGroups().some((grp) => grp.cells.includes(`${a.r},${a.c}`) || grp.cells.includes(`${b.r},${b.c}`));
    if (!hit) {
      this.g[a.r][a.c] = q.ga; this.g[b.r][b.c] = q.gb;
      this.sfx('bad', { volume: 0.4 });
      const nudge = (gem: Gem, to: Cell) => this.tweens.add({ targets: gem.ov ? [gem.img, gem.ov] : gem.img, x: (this.px(to.c) + gem.img.x) / 2 - (gem.img.x - this.px(to.c)) * 0.1, y: (this.py(to.r) + gem.img.y) / 2, duration: 70, yoyo: true });
      nudge(q.ga, b); nudge(q.gb, a);
      return;
    }
    this.sfx('swap', { volume: 0.5, rate: 1.1 });
    this.moveGem(q.ga, b.r, b.c, 120);
    this.moveGem(q.gb, a.r, a.c, 120);
    this.swapUntil = this.time.now + 130;
    this.comboFocus = b;
    this.comboBonus();
  }

  private clearComboRings(): void {
    for (const r of this.comboRings) { this.tweens.killTweensOf(r); r.destroy(); }
    this.comboRings = [];
  }

  private findGem(gem: Gem): Cell | null {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.g[r][c] === gem) return { r, c };
    return null;
  }

  /** The free swap after a chain has settled: it matches and the chain goes on, or it goes back. */
  private async comboSwap(a: Cell, b: Cell, ga: Gem, gb: Gem): Promise<void> {
    const gen = this.gen;
    this.closeCombo();
    this.comboUsed = true;
    if (ga.special !== 'rainbow' && gb.special !== 'rainbow' && !this.findGroups().length) {
      this.sfx('bad', { volume: 0.45 });
      this.g[a.r][a.c] = ga; this.g[b.r][b.c] = gb;
      await Promise.all([this.moveGem(ga, a.r, a.c, 160), this.moveGem(gb, b.r, b.c, 160)]);
      if (gen === this.gen) this.busy = false;
      return;
    }
    this.comboBonus();
    let forced: Set<string> | null = null;
    if (ga.special === 'rainbow' || gb.special === 'rainbow') {
      const other = ga.special === 'rainbow' ? gb : ga;
      forced = new Set<string>([`${a.r},${a.c}`, `${b.r},${b.c}`]);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (this.g[r][c]?.color === other.color) forced.add(`${r},${c}`);
    }
    await this.resolve(b, forced, this.lastChain);
    if (gen !== this.gen || this.isOver) return;
    this.afterMove();
  }

  private comboBonus(): void {
    const pts = 100;
    this.levelScore += pts;
    this.addScore(pts);
    popup(this, 360, Y0 - 60, `${t('comboMove')} +${pts}`, '#ffd23f', 30);
    this.sfx('special', { volume: 0.55 });
    flash(this, 0xffd23f, 90);
  }

  /** After the chain: the free swap stays open for a moment, with a shrinking bar under the hint. */
  private openComboWindow(): void {
    if (this.comboUsed || !this.comboOpen) { this.closeCombo(); return; }
    this.comboTimer = 1.8;
    this.hintText.setText(t('comboNow')).setColor('#ffd23f').setFontSize(26);
  }

  private closeCombo(): void {
    this.comboOpen = false;
    this.comboTimer = 0;
    this.comboQueued = null;
    this.clearComboRings();
    this.comboBar?.clear();
    if (!this.pending) this.hintText?.setText(t('hint')).setColor('#f1e8ff').setFontSize(28);
  }

  private isPending(cell: Cell): boolean {
    const p = this.pending;
    return !!p && ((p.a.r === cell.r && p.a.c === cell.c) || (p.b.r === cell.r && p.b.c === cell.c));
  }

  /** Glowing rings on the two gems of a waiting swap, and the hint asks for the second swap. */
  private markPending(): void {
    this.clearRings();
    const p = this.pending;
    if (!p) return;
    for (const cell of [p.a, p.b]) {
      const ring = this.add.image(this.px(cell.c), this.py(cell.r), 'gm-cursor').setDisplaySize(S * 112 / 84, S * 112 / 84).setDepth(19).setAlpha(0.9);
      this.tweens.add({ targets: ring, alpha: 0.35, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.pendingRings.push(ring);
    }
    this.hintText.setText(t('secondMove')).setColor('#7fe9ff').setFontSize(24);
    this.tweens.add({ targets: this.hintText, scale: { from: 1.15, to: 1 }, duration: 220, ease: 'Back.easeOut' });
  }

  private clearRings(): void {
    for (const r of this.pendingRings) { this.tweens.killTweensOf(r); r.destroy(); }
    this.pendingRings = [];
  }

  private clearPending(): void {
    this.pending = null;
    this.clearRings();
    this.hintText?.setText(t('hint')).setColor('#f1e8ff').setFontSize(28);
  }

  /** Puts the waiting swap back. */
  private async undoPending(): Promise<void> {
    const p = this.pending;
    if (!p) { this.busy = false; return; }
    const gen = this.gen;
    this.busy = true;
    this.clearPending();
    const ga = this.g[p.a.r][p.a.c], gb = this.g[p.b.r][p.b.c];
    if (ga && gb) {
      this.g[p.a.r][p.a.c] = gb; this.g[p.b.r][p.b.c] = ga;
      this.sfx('swap', { volume: 0.35, rate: 0.85 });
      await Promise.all([this.moveGem(ga, p.b.r, p.b.c, 160), this.moveGem(gb, p.a.r, p.a.c, 160)]);
    }
    if (gen === this.gen) this.busy = false;
  }

  private afterMove(): void {
    if (this.levelScore >= this.target) { this.closeCombo(); this.levelComplete(); return; }
    if (this.moves <= 0) {
      this.closeCombo();
      const m = txt(this, 360, 640, t('outOfMoves'), { title: true, size: 40, color: '#ec3013' }).setDepth(50);
      this.tweens.add({ targets: m, scale: { from: 0.4, to: 1 }, duration: 350, ease: 'Back.easeOut' });
      shake(this, 0.01, 200);
      this.sfx('fail', { volume: 0.6 });
      this.endGame({ delay: 1400 });
      return;
    }
    if (!this.findMove()) {
      const s = txt(this, 360, 640, t('shuffle'), { title: true, size: 40, color: '#3ee6ff' }).setDepth(50);
      this.tweens.add({ targets: s, alpha: 0, delay: 700, duration: 300, onComplete: () => s.destroy() });
      this.reshuffleColors();
      this.sfx('shuffle', { volume: 0.45 });
      for (const row of this.g) for (const gem of row) if (gem) gem.img.setTexture(gem.special === 'rainbow' ? 'gm-rainbow' : `gem${gem.color}`);
      this.closeCombo();
    } else this.openComboWindow();
    this.busy = false;
  }

  private levelComplete(): void {
    this.busy = true;
    const gen = this.gen;
    const bonus = this.moves * 60;
    this.sfx('clear', { volume: 0.75, exact: true });
    flash(this, 0xffd23f, 200);
    const m = txt(this, 360, 600, t('levelClear'), { title: true, size: 40, color: '#5dff7a' }).setDepth(50);
    if (bonus) txt(this, 360, 680, `${t('bonus')} +${bonus}`, { title: true, size: 26, color: '#ffd23f' }).setDepth(50).setName('bonusTxt');
    this.addScore(bonus);
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 120, () => burst(this, rng.int(100, 620), rng.int(350, 900), [0xffd23f, 0x5dff7a, 0xff4fa3], 24, 380));
    this.time.delayedCall(1700, () => {
      if (gen !== this.gen) return;
      m.destroy();
      this.children.getByName('bonusTxt')?.destroy();
      if (this.level >= LEVELS.length - 1) { this.endGame({ win: true, delay: 200 }); return; }
      this.level++;
      this.startLevel();
    });
  }

  // ---------- explosions ----------
  private glowAt(x: number, y: number, tint: number, scale: number, ms: number, depth = 19): void {
    const g = this.add.image(x, y, 'gm-glow').setDepth(depth).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale * 0.4).setAlpha(0.95);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private shockAt(x: number, y: number, tint: number, scale: number, ms: number): void {
    const r = this.add.image(x, y, 'gm-shock').setDepth(28).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.15);
    this.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  /** Crystal shards that fly out of a popped gem and fall. */
  private shards(x: number, y: number, tint: number, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.int(-30, 30) / 100;
      const d = (50 + rng.int(0, 70)) * power;
      const p = this.add.image(x, y, 'gm-shard').setDepth(26).setTint(tint).setScale(0.5 + rng.int(0, 50) / 100).setRotation(a);
      this.tweens.add({ targets: p, x: x + Math.cos(a) * d, duration: 520, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: p, y: y + Math.sin(a) * d + 60 * power, angle: p.angle + rng.int(-300, 300), duration: 520, ease: 'Back.easeIn' });
      this.tweens.add({ targets: p, alpha: 0, scale: 0.1, delay: 260, duration: 260, onComplete: () => p.destroy() });
    }
  }

  /** Runs match → clear → fall → refill until the board is stable. */
  private async resolve(focus: Cell, forced: Set<string> | null, startChain: number): Promise<void> {
    const gen = this.gen;
    let chain = startChain;
    this.resolving = true;
    while (true) {
      // gems at rest now: a combo swap still waiting for them plays here; its moved gem decides
      // where a special appears
      this.playQueued();
      if (this.comboFocus) { focus = this.comboFocus; this.comboFocus = null; }
      // let a combo swap that is moving into place arrive before the board is read
      if (this.time.now < this.swapUntil) await this.wait(this.swapUntil - this.time.now);
      if (gen !== this.gen) return;
      const groups = forced ? [] : this.findGroups();
      if (!forced && !groups.length) break;
      chain++;
      if (this.comboOpen && !this.comboUsed) this.hintText.setText(t('comboNow')).setColor('#ffd23f').setFontSize(26);
      const clear = new Set<string>(forced ?? []);
      const creates: Array<{ r: number; c: number; sp: Special; color: number }> = [];
      for (const grp of groups) {
        grp.cells.forEach((k) => clear.add(k));
        if (grp.special) {
          const inFocus = grp.cells.includes(`${focus.r},${focus.c}`);
          const [r, c] = inFocus ? [focus.r, focus.c] : grp.anchor;
          creates.push({ r, c, sp: grp.special, color: grp.color });
        }
      }
      forced = null;
      this.expandSpecials(clear);
      // score + remove
      const pts = 10 * chain;
      let n = 0, sx = 0, sy = 0;
      for (const k of clear) {
        const [r, c] = k.split(',').map(Number);
        const gem = this.g[r][c];
        if (!gem) continue;
        n++; sx += gem.img.x; sy += gem.img.y;
        const keep = creates.find((cr) => cr.r === r && cr.c === c);
        if (keep) continue;
        this.g[r][c] = null;
        const tint = gem.color >= 0 ? GEM_TINTS[gem.color] : 0xffffff;
        burst(this, gem.img.x, gem.img.y, gem.color >= 0 ? [tint, 0xffffff] : [0xffffff, 0xffd23f], 12 + Math.min(10, chain * 2), 260 + chain * 30);
        this.glowAt(gem.img.x, gem.img.y, tint, 1.6 + Math.min(0.8, chain * 0.15), 380);
        this.shards(gem.img.x, gem.img.y, tint, clear.size > 12 ? 3 : 5, 1 + Math.min(0.6, chain * 0.12));
        if (rng.chance(0.5)) {
          const st = this.add.image(gem.img.x, gem.img.y, 'gm-star').setDepth(27).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setTint(tint);
          this.tweens.add({ targets: st, scale: 0.75, angle: 180, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => st.destroy() });
        }
        this.tweens.killTweensOf(gem.img);
        // pops: swells, flashes white and vanishes
        gem.img.setTintFill(0xffffff);
        this.tweens.add({ targets: gem.ov ? [gem.img, gem.ov] : gem.img, scale: gem.img.scale * 1.35, duration: 70, yoyo: false, onComplete: () => {
          gem.img.clearTint();
          this.tweens.add({ targets: gem.ov ? [gem.img, gem.ov] : gem.img, scale: 0, alpha: 0, duration: 150, ease: 'Quad.easeIn', onComplete: () => this.killGem(gem) });
        } });
      }
      for (const cr of creates) {
        const gem = this.g[cr.r][cr.c];
        if (!gem) continue;
        this.setSpecial(gem, cr.sp);
        this.tweens.add({ targets: gem.img, scale: gem.img.scale * 1.3, duration: 150, yoyo: true });
        this.sfxAt('special', gem.img.x, { volume: 0.55 });
      }
      const gained = n * pts + creates.length * 50;
      this.levelScore += gained;
      if (n) this.addScore(gained, sx / n, sy / n);
      this.sfxAt('match', n ? sx / n : 360, { volume: 0.5, detune: Math.min(1200, (chain - 1) * 200), exact: true });
      if (n) {
        const cx = sx / n, cy = sy / n;
        this.shockAt(cx, cy, 0xffffff, 1.2 + Math.min(2, n * 0.12 + chain * 0.25), 420);
        if (n >= 5 || chain >= 2) shake(this, Math.min(0.016, 0.003 + n * 0.0006 + chain * 0.002), 140 + chain * 30);
        if (chain >= 3) { flash(this, 0xffffff, 80, 0.25); this.shockAt(360, Y0 + (ROWS * S) / 2, 0xffd23f, 6, 600); }
      }
      if (chain >= 2) {
        const word = chain >= 4 ? t('awesome') : chain === 3 ? t('great') : t('nice');
        popup(this, 360, Y0 - 20, `${word} x${chain}`, '#3ee6ff', 30);
        if (chain >= 3) this.sfx('combo', { volume: 0.55, delay: 0.1 });
      }
      this.updateUi();
      await this.wait(200);
      if (gen !== this.gen) return;
      focus = { r: -1, c: -1 };
      this.collapse();
      await this.dropAll();
      if (gen !== this.gen) return;
    }
    this.lastChain = chain;
    this.resolving = false;
  }

  private findGroups(): Array<{ cells: string[]; special: Special; anchor: [number, number]; color: number }> {
    type Run = { cells: string[]; dir: 'h' | 'v'; color: number };
    const runs: Run[] = [];
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const col = this.colorAt(r, c);
        let e = c + 1;
        while (e < COLS && col >= 0 && this.colorAt(r, e) === col) e++;
        if (col >= 0 && e - c >= 3) runs.push({ cells: Array.from({ length: e - c }, (_, i) => `${r},${c + i}`), dir: 'h', color: col });
        c = e;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const col = this.colorAt(r, c);
        let e = r + 1;
        while (e < ROWS && col >= 0 && this.colorAt(e, c) === col) e++;
        if (col >= 0 && e - r >= 3) runs.push({ cells: Array.from({ length: e - r }, (_, i) => `${r + i},${c}`), dir: 'v', color: col });
        r = e;
      }
    }
    // merge runs sharing a cell (L / T shapes)
    const groups: Array<{ runs: Run[]; cells: Set<string> }> = [];
    for (const run of runs) {
      const hits = groups.filter((g) => run.cells.some((k) => g.cells.has(k)));
      const merged = { runs: [run], cells: new Set(run.cells) };
      for (const h of hits) {
        h.runs.forEach((x) => merged.runs.push(x));
        h.cells.forEach((x) => merged.cells.add(x));
        groups.splice(groups.indexOf(h), 1);
      }
      groups.push(merged);
    }
    return groups.map((g) => {
      const longest = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const hasH = g.runs.some((x) => x.dir === 'h'), hasV = g.runs.some((x) => x.dir === 'v');
      let special: Special = '';
      let anchorKey = longest.cells[Math.floor(longest.cells.length / 2)];
      if (longest.cells.length >= 5) special = 'rainbow';
      else if (hasH && hasV) {
        special = 'bomb';
        const h = g.runs.find((x) => x.dir === 'h')!, v = g.runs.find((x) => x.dir === 'v')!;
        anchorKey = h.cells.find((k) => v.cells.includes(k)) ?? anchorKey;
      } else if (longest.cells.length === 4) special = longest.dir;
      const [ar, ac] = anchorKey.split(',').map(Number);
      return { cells: [...g.cells], special, anchor: [ar, ac] as [number, number], color: longest.color };
    });
  }

  /** Specials caught in the clear set fire their effect (and can chain). */
  private expandSpecials(clear: Set<string>): void {
    const fired = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const k of [...clear]) {
        if (fired.has(k)) continue;
        const [r, c] = k.split(',').map(Number);
        const gem = this.g[r][c];
        if (!gem || !gem.special) continue;
        fired.add(k);
        changed = true;
        if (gem.special === 'h' || gem.special === 'v') {
          for (let i = 0; i < (gem.special === 'h' ? COLS : ROWS); i++) clear.add(gem.special === 'h' ? `${r},${i}` : `${i},${c}`);
          const horiz = gem.special === 'h';
          const beam = this.add.image(horiz ? 360 : this.px(c), horiz ? this.py(r) : Y0 + (ROWS * S) / 2, 'gm-beam')
            .setDisplaySize(COLS * S + 40, 70).setAngle(horiz ? 0 : 90).setDepth(30).setBlendMode(Phaser.BlendModes.ADD)
            .setTint(gem.color >= 0 ? GEM_TINTS[gem.color] : 0x7fe9ff);
          const core = this.add.image(beam.x, beam.y, 'gm-beam').setDisplaySize(COLS * S + 40, 22).setAngle(horiz ? 0 : 90).setDepth(31).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({ targets: [beam, core], alpha: 0, scaleY: 0.05, duration: 380, ease: 'Quad.easeIn', onComplete: () => { beam.destroy(); core.destroy(); } });
          for (let i = 0; i < (horiz ? COLS : ROWS); i++) {
            const x = horiz ? this.px(i) : this.px(c), y = horiz ? this.py(r) : this.py(i);
            this.time.delayedCall(Math.abs(i - (horiz ? c : r)) * 25, () => {
              burst(this, x, y, [gem.color >= 0 ? GEM_TINTS[gem.color] : 0x7fe9ff, 0xffffff], 6, 240);
              this.glowAt(x, y, gem.color >= 0 ? GEM_TINTS[gem.color] : 0x7fe9ff, 1, 260, 29);
            });
          }
          this.sfxAt('line', gem.img.x, { volume: 0.45 });
          shake(this, 0.01, 160);
        } else if (gem.special === 'bomb') {
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) clear.add(`${rr},${cc}`);
          }
          burst(this, gem.img.x, gem.img.y, [0xffd23f, 0xec3013, 0xffffff], 60, 520);
          this.shockAt(gem.img.x, gem.img.y, 0xffb347, 3.4, 520);
          this.shards(gem.img.x, gem.img.y, 0xffd23f, 12, 2);
          this.time.delayedCall(90, () => this.shockAt(gem.img.x, gem.img.y, 0xffffff, 2.4, 420));
          const ring = this.add.graphics().setDepth(30).setPosition(gem.img.x, gem.img.y);
          ring.lineStyle(8, 0xffffff, 0.9).strokeCircle(0, 0, 30);
          this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
          const glow = this.add.image(gem.img.x, gem.img.y, 'gm-glow').setDepth(29).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb347).setScale(1);
          this.tweens.add({ targets: glow, scale: 4.2, alpha: 0, duration: 520, onComplete: () => glow.destroy() });
          this.sfxAt('bomb', gem.img.x, { volume: 0.6 });
          shake(this, 0.02, 260);
          flash(this, 0xffb347, 90, 0.3);
        } else if (gem.special === 'rainbow') {
          const counts = new Array(this.colors).fill(0);
          for (const row of this.g) for (const x of row) if (x && x.color >= 0) counts[x.color]++;
          const target = counts.indexOf(Math.max(...counts));
          const rays = this.add.graphics().setDepth(30).setBlendMode(Phaser.BlendModes.ADD);
          for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (this.g[rr][cc]?.color === target) {
            clear.add(`${rr},${cc}`);
            const tx = this.px(cc), ty = this.py(rr);
            rays.lineStyle(10, GEM_TINTS[target] ?? 0xffffff, 0.45).lineBetween(gem.img.x, gem.img.y, tx, ty);
            rays.lineStyle(3, 0xffffff, 0.9).lineBetween(gem.img.x, gem.img.y, tx, ty);
            this.glowAt(tx, ty, GEM_TINTS[target] ?? 0xffffff, 1.4, 420, 29);
          }
          this.tweens.add({ targets: rays, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: () => rays.destroy() });
          this.shockAt(gem.img.x, gem.img.y, 0xffffff, 5, 620);
          this.glowAt(gem.img.x, gem.img.y, 0xffffff, 4, 560, 29);
          this.sfx('rainbow', { volume: 0.6 });
          flash(this, 0xffffff, 120);
          shake(this, 0.016, 240);
        }
      }
    }
  }

  private collapse(): void {
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const gem = this.g[r][c];
        if (gem) { this.g[r][c] = null; this.g[write][c] = gem; write--; }
      }
      const missing = write + 1;
      for (let r = write; r >= 0; r--) this.g[r][c] = this.makeGem(r, c, rng.int(0, this.colors - 1), r - missing - 1);
    }
  }

  private findMove(): [Cell, Cell] | null {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (this.g[r][c]?.special === 'rainbow') return [{ r, c }, { r, c: c < COLS - 1 ? c + 1 : c - 1 }];
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= ROWS || c2 >= COLS) continue;
        const a = this.g[r][c], b = this.g[r2][c2];
        if (!a || !b) continue;
        this.g[r][c] = b; this.g[r2][c2] = a;
        const ok = this.findGroups().length > 0;
        this.g[r][c] = a; this.g[r2][c2] = b;
        if (ok) return [{ r, c }, { r: r2, c: c2 }];
      }
    }
    return null;
  }

  private reshuffleColors(): void {
    for (let tries = 0; tries < 200; tries++) {
      for (const row of this.g) for (const gem of row) if (gem && gem.special !== 'rainbow') gem.color = rng.int(0, this.colors - 1);
      if (!this.findGroups().length && this.findMove()) break;
    }
    for (const row of this.g) for (const gem of row) if (gem && gem.color >= 0) gem.img.setTexture(`gem${gem.color}`).setDisplaySize(GEM_SIZE[gem.color], GEM_SIZE[gem.color]);
  }

  updateGame(_time: number, delta: number): void {
    if (this.comboQueued) this.playQueued();
    for (const r of this.comboRings) { const gem = r.getData('gem') as Gem; if (gem.img.active) r.setPosition(gem.img.x, gem.img.y); }
    if (this.comboTimer > 0 && !this.busy) {
      this.comboTimer -= delta / 1000;
      const hy = Y0 + ROWS * S + 70;
      this.comboBar.clear().fillStyle(0xffd23f, 0.85).fillRoundedRect(360 - 240 * (this.comboTimer / 1.8), hy + 26, 480 * (this.comboTimer / 1.8), 6, 3);
      if (this.comboTimer <= 0) this.closeCombo();
    }
    const fw = 648 * this.barK;
    this.barFill.setCrop(0, 0, fw, 22);
    this.barTip.setPosition(36 + fw, 280).setAlpha(this.barK > 0.01 ? 0.9 : 0).setTint(this.barK >= 1 ? 0xffd23f : 0xb8ffd0);
    if (this.busy) { this.idle = 0; return; }
    this.idle += delta / 1000;
    if (this.idle > 6 && !this.hinting) {
      const mv = this.findMove();
      if (!mv) return;
      this.hinting = true;
      const imgs = mv.map((m) => this.g[m.r][m.c]!.img);
      const base = imgs.map((i) => i.scale);
      this.tweens.add({
        targets: imgs, scale: base[0] * 1.2, duration: 220, yoyo: true, repeat: 2,
        onComplete: () => { imgs.forEach((im, i) => im.active && im.setScale(base[i])); this.hinting = false; this.idle = 2; },
      });
    }
  }
}
