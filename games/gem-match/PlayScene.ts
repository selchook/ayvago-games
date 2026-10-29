import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

export const GEM_FILES = ['red_diamond', 'blue_polygon', 'green_square', 'yellow_polygon', 'purple_diamond', 'grey_square'];
const GEM_TINTS = [0xff4a3a, 0x3eb4ff, 0x8be03a, 0xffd23f, 0xb07cff, 0xe0e0e0];
const GEM_SIZE = [70, 70, 58, 70, 70, 58];

const COLS = 8, ROWS = 8, S = 84;
const X0 = (720 - COLS * S) / 2, Y0 = 350;

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
  private drag: (Cell & { x: number; y: number }) | null = null;
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
  private bar!: Phaser.GameObjects.Rectangle;
  private layer!: Phaser.GameObjects.Container;

  createGame(): void {
    this.gen++;
    this.g = []; this.busy = false; this.sel = null; this.cursor = { r: 3, c: 3 }; this.kbMode = false;
    this.drag = null; this.level = 0; this.idle = 0; this.hinting = false;
    this.makeTextures();

    // background board
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(X0 - 14, Y0 - 14, COLS * S + 28, ROWS * S + 28, 18);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      bg.fillStyle((r + c) % 2 ? 0x2a1d4a : 0x33255a, 1).fillRect(X0 + c * S, Y0 + r * S, S, S);
    }
    bg.lineStyle(4, 0x8b5cff, 0.8).strokeRoundedRect(X0 - 14, Y0 - 14, COLS * S + 28, ROWS * S + 28, 18);
    this.layer = this.add.container(0, 0);
    const mask = this.make.graphics({}, false).fillRect(X0, Y0, COLS * S, ROWS * S).createGeometryMask();
    this.layer.setMask(mask);

    // top panel: level | target | moves
    const panel = (x: number, label: string, color: string): Phaser.GameObjects.Text => {
      this.add.rectangle(x, 190, 200, 104, 0x000000, 0.4).setStrokeStyle(3, 0xffffff, 0.25);
      txt(this, x, 162, label, { title: true, size: 16, color });
      return txt(this, x, 208, '', { title: true, size: 28 });
    };
    this.levelTxt = panel(130, t('level'), '#3ee6ff');
    this.targetTxt = panel(360, t('target'), '#ffd23f');
    this.movesTxt = panel(590, t('moves'), '#ff4fa3');
    this.add.rectangle(360, 280, 640, 22, 0x000000, 0.5).setStrokeStyle(3, 0xffffff, 0.3);
    this.bar = this.add.rectangle(42, 280, 0, 16, 0x5dff7a).setOrigin(0, 0.5);
    txt(this, 360, Y0 + ROWS * S + 70, t('hint'), { size: 30, color: '#d8c8ff' });

    this.selImg = this.add.image(0, 0, 'gm-selector').setDisplaySize(S + 6, S + 6).setVisible(false).setDepth(20).setTint(0xffd23f);
    this.cursorImg = this.add.image(0, 0, 'gm-selector').setDisplaySize(S + 6, S + 6).setVisible(false).setDepth(21);
    this.tweens.add({ targets: this.selImg, alpha: 0.4, duration: 300, yoyo: true, repeat: -1 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => (this.drag = null));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    this.startLevel();
  }

  // ---------- textures ----------
  private makeTextures(): void {
    if (this.textures.exists('gm-rainbow')) return;
    const g = this.make.graphics({}, false);
    const cols = [0xff4a3a, 0xffa53a, 0xffd23f, 0x8be03a, 0x3eb4ff, 0xb07cff];
    cols.forEach((c, i) => g.fillStyle(c).fillCircle(36, 36, 34 - i * 5));
    g.fillStyle(0xffffff, 0.9).fillCircle(26, 24, 6);
    g.generateTexture('gm-rainbow', 72, 72);
    g.clear();
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(8, 30, 56, 12);
    g.fillTriangle(0, 36, 14, 22, 14, 50).fillTriangle(72, 36, 58, 22, 58, 50);
    g.generateTexture('gm-line', 72, 72);
    g.clear();
    g.lineStyle(6, 0xffffff, 1).strokeCircle(36, 36, 30);
    g.fillStyle(0xffffff, 1).fillCircle(36, 36, 8);
    g.generateTexture('gm-bomb', 72, 72);
    g.destroy();
  }

  // ---------- level flow ----------
  private startLevel(): void {
    const [target, moves, colors] = LEVELS[this.level];
    this.target = target; this.moves = moves; this.colors = colors; this.levelScore = 0;
    this.updateUi();
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
    if (!this.findMove()) this.reshuffleColors();
    this.busy = true;
    const gen = this.gen;
    this.dropAll().then(() => { if (gen === this.gen) this.busy = false; });
    const banner = txt(this, 360, 640, `${t('level')} ${this.level + 1}`, { title: true, size: 48, color: '#ffd23f' }).setDepth(50).setScale(0.3);
    this.tweens.add({ targets: banner, scale: 1, duration: 400, ease: 'Back.easeOut', hold: 700, yoyo: true, onComplete: () => banner.destroy() });
  }

  private updateUi(): void {
    this.levelTxt.setText(`${this.level + 1}/${LEVELS.length}`);
    this.targetTxt.setText(String(this.target));
    this.movesTxt.setText(String(this.moves));
    this.movesTxt.setColor(this.moves <= 3 ? '#ec3013' : '#ffffff');
    const k = Math.min(1, this.levelScore / this.target);
    this.tweens.add({ targets: this.bar, width: 636 * k, duration: 250 });
    this.bar.setFillStyle(k >= 1 ? 0xffd23f : 0x5dff7a);
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
    if (!cell || this.busy) return;
    this.kbMode = false; this.cursorImg.setVisible(false);
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
    if (!this.drag || !p.isDown || this.busy || this.isOver) return;
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
    const pick = e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ';
    if (!d && !pick) return;
    this.idle = 0;
    if (!this.kbMode) { this.kbMode = true; this.placeCursor(); if (!pick) return; }
    if (this.busy) return;
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
    if (!ga || !gb || this.busy || this.isOver) return;
    this.busy = true;
    const gen = this.gen;
    this.sfx('swap', { volume: 0.45 });
    this.g[a.r][a.c] = gb; this.g[b.r][b.c] = ga;
    await Promise.all([this.moveGem(ga, b.r, b.c, 160), this.moveGem(gb, a.r, a.c, 160)]);
    if (gen !== this.gen) return;

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
      this.sfx('bad', { volume: 0.45 });
      this.g[a.r][a.c] = ga; this.g[b.r][b.c] = gb;
      await Promise.all([this.moveGem(ga, a.r, a.c, 160), this.moveGem(gb, b.r, b.c, 160)]);
      if (gen === this.gen) this.busy = false;
      return;
    }
    this.moves--;
    this.updateUi();
    if (this.moves === 3 && this.levelScore < this.target) this.sfx('low', { volume: 0.35 });
    await this.resolve(b, forced);
    if (gen !== this.gen || this.isOver) return;
    this.afterMove();
  }

  private afterMove(): void {
    if (this.levelScore >= this.target) { this.levelComplete(); return; }
    if (this.moves <= 0) {
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
    }
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

  /** Runs match → clear → fall → refill until the board is stable. */
  private async resolve(focus: Cell, forced: Set<string> | null): Promise<void> {
    const gen = this.gen;
    let chain = 0;
    while (true) {
      const groups = forced ? [] : this.findGroups();
      if (!forced && !groups.length) break;
      chain++;
      const clear = new Set<string>(forced ?? []);
      const creates: Array<{ r: number; c: number; sp: Special; color: number }> = [];
      for (const grp of groups) {
        grp.cells.forEach((k) => clear.add(k));
        if (grp.special) {
          const inFocus = chain === 1 && grp.cells.includes(`${focus.r},${focus.c}`);
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
        burst(this, gem.img.x, gem.img.y, gem.color >= 0 ? GEM_TINTS[gem.color] : [0xffffff, 0xffd23f], 8, 220);
        this.tweens.killTweensOf(gem.img);
        this.tweens.add({ targets: gem.ov ? [gem.img, gem.ov] : gem.img, scale: 0, alpha: 0, duration: 180, onComplete: () => this.killGem(gem) });
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
      if (chain >= 2) {
        const word = chain >= 4 ? t('awesome') : chain === 3 ? t('great') : t('nice');
        popup(this, 360, Y0 - 20, `${word} x${chain}`, '#3ee6ff', 30);
        if (chain >= 3) this.sfx('combo', { volume: 0.55, delay: 0.1 });
      }
      this.updateUi();
      await this.wait(200);
      if (gen !== this.gen) return;
      this.collapse();
      await this.dropAll();
      if (gen !== this.gen) return;
    }
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
          const beam = gem.special === 'h'
            ? this.add.rectangle(360, this.py(r), COLS * S, 26, 0xffffff, 0.9)
            : this.add.rectangle(this.px(c), Y0 + (ROWS * S) / 2, 26, ROWS * S, 0xffffff, 0.9);
          this.tweens.add({ targets: beam, alpha: 0, scaleY: gem.special === 'h' ? 0.1 : 1, scaleX: gem.special === 'v' ? 0.1 : 1, duration: 350, onComplete: () => beam.destroy() });
          this.sfxAt('line', gem.img.x, { volume: 0.45 });
          shake(this, 0.006, 120);
        } else if (gem.special === 'bomb') {
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) clear.add(`${rr},${cc}`);
          }
          burst(this, gem.img.x, gem.img.y, [0xffd23f, 0xec3013, 0xffffff], 40, 420);
          this.sfxAt('bomb', gem.img.x, { volume: 0.6 });
          shake(this, 0.014, 200);
        } else if (gem.special === 'rainbow') {
          const counts = new Array(this.colors).fill(0);
          for (const row of this.g) for (const x of row) if (x && x.color >= 0) counts[x.color]++;
          const target = counts.indexOf(Math.max(...counts));
          for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (this.g[rr][cc]?.color === target) clear.add(`${rr},${cc}`);
          this.sfx('rainbow', { volume: 0.6 });
          flash(this, 0xffffff, 100);
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
