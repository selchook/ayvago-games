import Phaser from 'phaser';
import { ArcadeScene, Button, COLORS, burst, shake, flash, txt, t, rng } from '@core';

export const cardKey = (suit: number, rank: number): string => `card-${suit}-${rank}`;

const CW = 92, CH = 125;
const TOP_Y = 215, TAB_Y = 372, MAX_Y = 1060;
const DOWN_OFF = 20, UP_OFF = 38;
const SX = CW / 140, SY = CH / 190;    // Kenney cards are 140x190
const MAX_PASSES = 3;
const STOCK = 0, WASTE = 1, F0 = 2, T0 = 6;      // pile indices: 0 stock, 1 waste, 2-5 foundations (by suit), 6-12 tableau
const colX = (c: number): number => 60 + c * 100;

const suitOf = (id: number): number => Math.floor(id / 13);
const rankOf = (id: number): number => (id % 13) + 1;
const isRed = (id: number): boolean => suitOf(id) === 1 || suitOf(id) === 2;

interface Snap { piles: number[][]; up: boolean[]; score: number; passes: number; moves: number }
interface Move { from: number; index: number; to: number }

export class PlayScene extends ArcadeScene {
  private piles: number[][] = [];
  private up: boolean[] = [];
  private sprites: Phaser.GameObjects.Image[] = [];
  private history: Snap[] = [];
  private passes = 1;
  private moves = 0;
  private busy = false;
  private finished = false;
  private drag: { pile: number; index: number; x: number; y: number; moved: boolean } | null = null;
  private sel = { src: 0, depth: 0, on: false };
  private selBox!: Phaser.GameObjects.Rectangle;
  private info!: Phaser.GameObjects.Text;
  private recycle!: Phaser.GameObjects.Image;
  private lastSec = -1;
  private autoRun = false;

  createGame(): void {
    this.piles = Array.from({ length: 13 }, () => []);
    this.up = new Array(52).fill(false);
    this.sprites = [];
    this.history = [];
    this.passes = 1; this.moves = 0; this.busy = true; this.finished = false; this.drag = null;
    this.sel = { src: 0, depth: 0, on: false }; this.lastSec = -1; this.autoRun = false;
    this.cameras.main.setBackgroundColor('#0f3d26');
    const { width } = this.scale;

    // felt slots
    const g = this.add.graphics();
    const slot = (x: number, y: number) => {
      g.fillStyle(0x000000, 0.18).fillRoundedRect(x - CW / 2, y - CH / 2, CW, CH, 8);
      g.lineStyle(3, 0x3f8f62, 0.8).strokeRoundedRect(x - CW / 2, y - CH / 2, CW, CH, 8);
    };
    slot(colX(0), TOP_Y); slot(colX(1), TOP_Y);
    for (let s = 0; s < 4; s++) {
      slot(colX(3 + s), TOP_Y);
      this.add.image(colX(3 + s), TOP_Y, cardKey(s, 1)).setDisplaySize(CW, CH).setAlpha(0.15);
    }
    for (let c = 0; c < 7; c++) slot(colX(c), TAB_Y);
    this.recycle = this.add.image(colX(0), TOP_Y, 'icon-return').setDisplaySize(54, 54).setAlpha(0.6);

    this.selBox = this.add.rectangle(0, 0, CW + 10, CH + 10).setStrokeStyle(5, 0xffd23f).setDepth(3000).setVisible(false);
    this.tweens.add({ targets: this.selBox, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });

    this.info = txt(this, width / 2, 1112, '', { size: 26, color: '#a8d8b8' });
    new Button(this, 190, 1195, t('undo'), () => this.undo(), { width: 260, height: 84, size: 24, color: COLORS.purple });
    new Button(this, 530, 1195, t('hint'), () => this.hint(), { width: 260, height: 84, size: 24, color: 0x2a7fd4 });

    // deal
    const deck = rng.shuffle(Array.from({ length: 52 }, (_, i) => i));
    for (let id = 0; id < 52; id++) {
      this.sprites.push(this.add.image(colX(0), TOP_Y, 'card-back').setScale(SX, SY));
    }
    for (let c = 0; c < 7; c++) for (let k = 0; k <= c; k++) this.piles[T0 + c].push(deck.pop()!);
    for (let c = 0; c < 7; c++) this.up[this.piles[T0 + c][c]] = true;
    this.piles[STOCK] = deck;
    this.sfx('shuffle', { volume: 0.6 });
    this.layout(true);
    this.time.delayedCall(900, () => { this.busy = false; });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => this.clickStock());
    kb?.on('keydown-X', () => this.undo());
    kb?.on('keydown-BACKSPACE', () => this.undo());
    kb?.on('keydown-H', () => this.hint());
    kb?.on('keydown-LEFT', () => this.selMove(-1, 0));
    kb?.on('keydown-RIGHT', () => this.selMove(1, 0));
    kb?.on('keydown-UP', () => this.selMove(0, 1));
    kb?.on('keydown-DOWN', () => this.selMove(0, -1));
    for (const k of ['ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.selAct());
    this.refreshInfo();
  }

  // ---------- layout ----------
  private tabOffsets(c: number): number[] {
    const pile = this.piles[T0 + c];
    const offs = pile.map((id) => (this.up[id] ? UP_OFF : DOWN_OFF));
    const total = offs.slice(0, -1).reduce((a, b) => a + b, 0);
    const k = total > MAX_Y - TAB_Y ? (MAX_Y - TAB_Y) / total : 1;
    return offs.map((o) => o * k);
  }

  private posOf(pile: number, index: number): [number, number] {
    if (pile === STOCK) return [colX(0), TOP_Y];
    if (pile === WASTE) return [colX(1), TOP_Y];
    if (pile < T0) return [colX(3 + pile - F0), TOP_Y];
    const offs = this.tabOffsets(pile - T0);
    let y = TAB_Y;
    for (let i = 0; i < index; i++) y += offs[i];
    return [colX(pile - T0), y];
  }

  private layout(deal = false): void {
    let n = 0;
    this.piles.forEach((pile, pi) => pile.forEach((id, i) => {
      const s = this.sprites[id];
      const faceUp = pi !== STOCK && this.up[id];
      const key = faceUp ? cardKey(suitOf(id), rankOf(id)) : 'card-back';
      this.tweens.killTweensOf(s);
      s.setScale(SX, SY);
      if (s.texture.key !== key) {
        const flip = faceUp && !deal && s.texture.key === 'card-back';
        s.setTexture(key);
        if (flip) {
          s.scaleX = 0;
          this.tweens.add({ targets: s, scaleX: SX, duration: 160, ease: 'Quad.easeOut' });
        }
      }
      const [x, y] = this.posOf(pi, i);
      s.setDepth((pi < T0 ? 100 : 500) + i);
      if (s.x !== x || s.y !== y) {
        this.tweens.add({ targets: s, x, y, duration: deal ? 260 : 160, delay: deal ? n++ * 18 : 0, ease: 'Quad.easeOut' });
      }
    }));
    this.recycle.setVisible(this.piles[STOCK].length === 0 && this.passes < MAX_PASSES && this.piles[WASTE].length > 0);
    this.updateSel();
  }

  private refreshInfo(): void {
    this.info.setText(`${t('movesN', { n: this.moves })}   ·   ${t('deck', { n: this.passes, m: MAX_PASSES })}`);
  }

  // ---------- rules ----------
  private canFound(id: number): boolean {
    return rankOf(id) === this.piles[F0 + suitOf(id)].length + 1;
  }

  private canTab(id: number, c: number): boolean {
    const pile = this.piles[T0 + c];
    if (!pile.length) return rankOf(id) === 13;
    const top = pile[pile.length - 1];
    return this.up[top] && isRed(top) !== isRed(id) && rankOf(top) === rankOf(id) + 1;
  }

  private legal(m: Move): boolean {
    const src = this.piles[m.from];
    if (m.index < 0 || m.index >= src.length || m.from === m.to) return false;
    const id = src[m.index];
    if (!this.up[id] || m.from === STOCK) return false;
    const single = m.index === src.length - 1;
    if (m.from === WASTE || (m.from >= F0 && m.from < T0)) if (!single) return false;
    if (m.to >= F0 && m.to < T0) return single && m.to === F0 + suitOf(id) && this.canFound(id);
    if (m.to >= T0) return this.canTab(id, m.to - T0);
    return false;
  }

  /** Best destination for tapping the card at (pile, index). */
  private autoTarget(pile: number, index: number): number {
    const src = this.piles[pile];
    const id = src[index];
    if (pile < F0 + 4 && pile >= F0) {
      for (let c = 0; c < 7; c++) if (this.legal({ from: pile, index, to: T0 + c })) return T0 + c;
      return -1;
    }
    if (index === src.length - 1 && this.canFound(id)) return F0 + suitOf(id);
    let empty = -1;
    for (let k = 1; k <= 7; k++) {
      const c = pile >= T0 ? (pile - T0 + k) % 7 : k - 1;
      if (T0 + c === pile || !this.legal({ from: pile, index, to: T0 + c })) continue;
      if (this.piles[T0 + c].length) return T0 + c;
      if (empty < 0 && !(pile >= T0 && index === 0)) empty = T0 + c;
    }
    return empty;
  }

  /** Moves that make progress (used for hints and stuck detection). */
  private usefulMoves(): Move[] {
    const out: Move[] = [];
    const w = this.piles[WASTE];
    if (w.length) {
      const i = w.length - 1;
      for (let to = F0; to <= T0 + 6; to++) if (this.legal({ from: WASTE, index: i, to })) out.push({ from: WASTE, index: i, to });
    }
    for (let c = 0; c < 7; c++) {
      const pile = this.piles[T0 + c];
      for (let i = 0; i < pile.length; i++) {
        if (!this.up[pile[i]]) continue;
        if (i === pile.length - 1) {
          const f = F0 + suitOf(pile[i]);
          if (this.legal({ from: T0 + c, index: i, to: f })) out.push({ from: T0 + c, index: i, to: f });
        }
        const reveals = i > 0 && !this.up[pile[i - 1]];
        const empties = i === 0 && rankOf(pile[i]) !== 13;
        if (!reveals && !empties) continue;
        for (let d = 0; d < 7; d++) if (d !== c && this.legal({ from: T0 + c, index: i, to: T0 + d })) out.push({ from: T0 + c, index: i, to: T0 + d });
      }
    }
    return out;
  }

  private canDraw(): boolean {
    return this.piles[STOCK].length > 0 || (this.piles[WASTE].length > 0 && this.passes < MAX_PASSES);
  }

  // ---------- actions ----------
  private snapshot(): void {
    this.history.push({ piles: this.piles.map((p) => p.slice()), up: this.up.slice(), score: this.score, passes: this.passes, moves: this.moves });
    if (this.history.length > 200) this.history.shift();
  }

  private undo(): void {
    if (this.busy || this.isOver || this.finished) return;
    const s = this.history.pop();
    if (!s) { this.sfx('error', { volume: 0.4 }); return; }
    this.piles = s.piles; this.up = s.up; this.passes = s.passes; this.moves = s.moves;
    this.setScore(s.score);
    this.sfx('undo', { volume: 0.6 });
    this.layout(); this.refreshInfo();
  }

  private clickStock(): void {
    if (this.busy || this.isOver || this.finished) return;
    const st = this.piles[STOCK], w = this.piles[WASTE];
    if (st.length) {
      this.snapshot();
      const id = st.pop()!;
      this.up[id] = true;
      w.push(id);
      this.sfx('flip', { volume: 0.6 });
    } else if (w.length && this.passes < MAX_PASSES) {
      this.snapshot();
      this.piles[STOCK] = w.reverse().map((id) => { this.up[id] = false; return id; });
      this.piles[WASTE] = [];
      this.passes++;
      this.addScore(-50, colX(0), TOP_Y);
      this.sfx('shuffle', { volume: 0.5 });
    } else {
      this.sfx('error', { volume: 0.4 });
      return;
    }
    this.moves++;
    this.afterAction();
  }

  private doMove(m: Move): void {
    this.snapshot();
    const src = this.piles[m.from];
    const ids = src.splice(m.index);
    this.piles[m.to].push(...ids);
    const toFound = m.to >= F0 && m.to < T0;
    let pts = 0;
    if (toFound) pts += 10;
    else if (m.from === WASTE) pts += 5;
    else if (m.from >= F0 && m.from < T0) pts -= 15;
    if (m.from >= T0 && src.length && !this.up[src[src.length - 1]]) {
      this.up[src[src.length - 1]] = true;
      pts += 5;
    }
    this.moves++;
    const [x, y] = this.posOf(m.to, this.piles[m.to].length - 1);
    if (pts) this.addScore(pts, x, y - 50);
    if (toFound) {
      this.sfx('found', { volume: 0.45 });
      this.time.delayedCall(150, () => burst(this, x, y, isRed(ids[0]) ? [0xec3013, 0xffffff] : [0x222222, 0xffffff, 0xffd23f], 16, 240));
    } else this.sfx(rng.chance(0.5) ? 'place' : 'place2', { volume: 0.6 });
    this.afterAction();
  }

  private afterAction(): void {
    this.layout();
    this.refreshInfo();
    if (this.piles.slice(F0, T0).every((p) => p.length === 13)) return this.win();
    // everything revealed and the deck is empty: auto-finish
    const allUp = this.piles.slice(T0).every((p) => p.every((id) => this.up[id]));
    if (allUp && !this.piles[STOCK].length && !this.piles[WASTE].length) return this.autoFinish();
    if (!this.canDraw() && !this.usefulMoves().length) this.stuck();
  }

  private autoFinish(): void {
    if (this.autoRun) return;
    this.autoRun = true;
    this.busy = true;
    const step = () => {
      if (this.isOver) return;
      for (let c = 0; c < 7; c++) {
        const p = this.piles[T0 + c];
        if (p.length && this.canFound(p[p.length - 1])) {
          this.busy = false;
          this.doMove({ from: T0 + c, index: p.length - 1, to: F0 + suitOf(p[p.length - 1]) });
          this.busy = true;
          if (!this.finished) this.time.delayedCall(110, step);
          return;
        }
      }
      this.busy = false;
      this.autoRun = false;
    };
    this.time.delayedCall(250, step);
  }

  private win(): void {
    this.finished = true; this.busy = true;
    const bonus = 500 + Math.max(0, Math.round(1500 - this.elapsed * 2));
    this.addScore(bonus, 360, 640);
    flash(this, 0xffd23f, 200);
    txt(this, 360, 560, t('solved'), { title: true, size: 52, color: '#5dff7a', strokeThickness: 10 }).setDepth(4000);
    this.sprites.forEach((s, i) => {
      this.tweens.add({ targets: s, x: rng.int(40, 680), y: rng.int(300, 1100), angle: rng.int(-180, 180), delay: i * 25, duration: 600, ease: 'Back.easeOut' });
    });
    for (let k = 0; k < 8; k++) this.time.delayedCall(k * 150, () => burst(this, rng.int(100, 620), rng.int(300, 900), [0xffd23f, 0xec3013, 0xffffff, 0x3ee6ff], 24, 380));
    this.endGame({ win: true, delay: 2400 });
  }

  private stuck(): void {
    this.finished = true;
    this.sfx('stuck');
    shake(this, 0.01, 300);
    txt(this, 360, 620, t('noMoves'), { title: true, size: 40, color: '#ec3013', strokeThickness: 10 }).setDepth(4000);
    this.endGame({ delay: 1800 });
  }

  private hint(): void {
    if (this.busy || this.isOver || this.finished) return;
    const m = this.usefulMoves()[0];
    if (!m) {
      if (this.canDraw()) this.pulse(this.piles[STOCK].length ? this.sprites[this.piles[STOCK][this.piles[STOCK].length - 1]] : this.recycle);
      else this.sfx('error');
      return;
    }
    this.addScore(-5);
    this.pulse(this.sprites[this.piles[m.from][m.index]]);
    const tp = this.piles[m.to];
    if (tp.length) this.pulse(this.sprites[tp[tp.length - 1]]);
  }

  private pulse(o: Phaser.GameObjects.Image): void {
    this.sfx('fan', { volume: 0.5 });
    o.setTint(0xfff27a);
    this.tweens.add({ targets: o, y: o.y - 14, duration: 140, yoyo: true, repeat: 2, onComplete: () => o.clearTint() });
  }

  // ---------- pointer ----------
  private hit(x: number, y: number): { pile: number; index: number } | null {
    const inside = (cx: number, cy: number, h = CH) => Math.abs(x - cx) <= CW / 2 && y >= cy - CH / 2 && y <= cy - CH / 2 + h;
    if (inside(colX(0), TOP_Y)) return { pile: STOCK, index: this.piles[STOCK].length - 1 };
    for (let pi = WASTE; pi < T0; pi++) {
      const p = this.piles[pi];
      if (p.length && inside(...this.posOf(pi, p.length - 1))) return { pile: pi, index: p.length - 1 };
    }
    for (let c = 0; c < 7; c++) {
      const p = this.piles[T0 + c];
      for (let i = p.length - 1; i >= 0; i--) if (inside(...this.posOf(T0 + c, i))) return { pile: T0 + c, index: i };
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.busy || this.isOver || this.finished) return;
    const h = this.hit(p.x, p.y);
    if (!h) return;
    this.sel.on = false; this.updateSel();
    if (h.pile === STOCK) { this.clickStock(); return; }
    if (!this.up[this.piles[h.pile][h.index]]) return;
    this.drag = { ...h, x: p.x, y: p.y, moved: false };
  }

  private dragIds(): number[] {
    return this.drag ? this.piles[this.drag.pile].slice(this.drag.index) : [];
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d || !p.isDown || this.isOver) return;
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 12) return;
    d.moved = true;
    this.dragIds().forEach((id, k) => {
      const [x, y] = this.posOf(d.pile, d.index + k);
      const s = this.sprites[id];
      this.tweens.killTweensOf(s);
      s.setScale(SX, SY).setPosition(x + p.x - d.x, y + p.y - d.y).setDepth(2000 + k);
    });
  }

  private onUp(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || this.busy || this.isOver || this.finished) { if (d) this.layout(); return; }
    if (this.piles[d.pile][d.index] === undefined) return;
    if (!d.moved) return this.tapCard(d.pile, d.index);
    // drop: nearest column / foundation under the dragged card's centre
    const s = this.sprites[this.piles[d.pile][d.index]];
    let to = -1;
    const c = Math.round((s.x - 60) / 100);
    if (c >= 0 && c < 7 && Math.abs(s.x - colX(c)) < 70) {
      if (s.y < TOP_Y + CH * 0.8) { if (c >= 3) to = F0 + c - 3; }
      else to = T0 + c;
    }
    if (to >= 0 && this.legal({ from: d.pile, index: d.index, to })) this.doMove({ from: d.pile, index: d.index, to });
    else { this.layout(); if (to !== d.pile) this.sfx('error', { volume: 0.3 }); }
  }

  private tapCard(pile: number, index: number): void {
    const to = this.autoTarget(pile, index);
    if (to >= 0) return this.doMove({ from: pile, index, to });
    this.sfx('error', { volume: 0.35 });
    const ids = this.piles[pile].slice(index);
    ids.forEach((id) => this.tweens.add({ targets: this.sprites[id], x: this.sprites[id].x + 8, duration: 45, yoyo: true, repeat: 2 }));
  }

  // ---------- keyboard selection (src 0 = waste, 1..7 = tableau columns) ----------
  private selPile(): number { return this.sel.src === 0 ? WASTE : T0 + this.sel.src - 1; }

  private selIndex(): number {
    const p = this.piles[this.selPile()];
    if (!p.length) return -1;
    let firstUp = p.length - 1;
    while (firstUp > 0 && this.up[p[firstUp - 1]]) firstUp--;
    if (this.sel.src === 0) return p.length - 1;
    this.sel.depth = Phaser.Math.Clamp(this.sel.depth, 0, p.length - 1 - firstUp);
    return p.length - 1 - this.sel.depth;
  }

  private selMove(dx: number, dy: number): void {
    if (this.busy || this.isOver || this.finished) return;
    if (!this.sel.on) this.sel.on = true;
    else if (dx) { this.sel.src = Phaser.Math.Wrap(this.sel.src + dx, 0, 8); this.sel.depth = 0; }
    else this.sel.depth = Math.max(0, this.sel.depth + dy);
    this.sfx('slide', { volume: 0.3 });
    this.updateSel();
  }

  private updateSel(): void {
    if (!this.sel.on) { this.selBox.setVisible(false); return; }
    const pile = this.selPile(), i = this.selIndex();
    const [x, y] = i >= 0 ? this.posOf(pile, i) : pile === WASTE ? [colX(1), TOP_Y] : [colX(pile - T0), TAB_Y];
    this.selBox.setVisible(true).setPosition(x, y);
  }

  private selAct(): void {
    if (this.busy || this.isOver || this.finished) return;
    if (!this.sel.on) { this.sel.on = true; this.updateSel(); return; }
    const i = this.selIndex();
    if (i < 0) { this.sfx('error', { volume: 0.35 }); return; }
    this.tapCard(this.selPile(), i);
    this.sel.depth = 0;
    this.updateSel();
  }

  updateGame(): void {
    const sec = Math.floor(this.elapsed);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.hud.setRight(`${t('time')} ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    }
  }
}
