import Phaser from 'phaser';
import { ArcadeScene, Button, COLORS, burst, shake, flash, popup, txt, t, rng } from '@core';
import { CW, CH, PAD, BACK, SHADOW, GLOW, SEL, faceKey, makeArt, makeFelt } from './art';

const W = 720, H = 1280;
const colX = (c: number): number => 54 + c * 102;
const TOP_Y = 206, TAB_Y = 368, TAB_BOTTOM = 1114, TRAY_Y = 1140, BTN_Y = 1210;
const DOWN_OFF = 22, UP_OFF = 46;
const MAX_PASSES = 3;
const STOCK = 0, WASTE = 1, F0 = 2, T0 = 6;      // pile indices: 0 stock, 1 waste, 2-5 foundations (by suit), 6-12 tableau
const SH_Y = 4;                                  // resting shadow offset under a card
const RING = PAD + 13;                           // nine-slice corner of the glow rings

const suitOf = (id: number): number => Math.floor(id / 13);
const rankOf = (id: number): number => (id % 13) + 1;
const isRed = (id: number): boolean => suitOf(id) === 1 || suitOf(id) === 2;
const isFound = (p: number): boolean => p >= F0 && p < T0;

interface Snap { piles: number[][]; up: boolean[]; score: number; passes: number; moves: number }
interface Move { from: number; index: number; to: number }
interface Card { box: Phaser.GameObjects.Container; face: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image; shown: boolean }
interface Flyer { id: number; x: number; y: number; vx: number; vy: number }

export class PlayScene extends ArcadeScene {
  private piles: number[][] = [];
  private up: boolean[] = [];
  private cards: Card[] = [];
  private history: Snap[] = [];
  private passes = 1;
  private moves = 0;
  private busy = false;
  private finished = false;
  private autoRun = false;
  private autoReady = false;
  private giveArmed = false;
  private giveTimer?: Phaser.Time.TimerEvent;
  private drag: { pile: number; index: number; x: number; y: number; moved: boolean } | null = null;
  private sel = { src: 0, depth: 0, on: false };
  private selRing!: Phaser.GameObjects.NineSlice;
  private glows: Phaser.GameObjects.GameObject[] = [];
  private stockSlot!: Phaser.GameObjects.Image;
  private stockText!: Phaser.GameObjects.Text;
  private passText!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private hintBtn!: Button;
  private autoBtn!: Button;
  private autoGlow!: Phaser.GameObjects.Graphics;
  private giveBtn!: Button;
  private flyers: Flyer[] = [];
  private trail?: Phaser.GameObjects.RenderTexture;
  private lastSec = -1;

  createGame(): void {
    this.piles = Array.from({ length: 13 }, () => []);
    this.up = new Array(52).fill(false);
    this.cards = [];
    this.history = [];
    this.passes = 1; this.moves = 0;
    this.busy = true; this.finished = false; this.autoRun = false; this.autoReady = false;
    this.giveArmed = false; this.giveTimer = undefined;
    this.drag = null; this.sel = { src: 0, depth: 0, on: false };
    this.glows = []; this.flyers = []; this.trail = undefined; this.lastSec = -1;

    makeArt(this);
    this.add.image(0, 0, makeFelt(this, W, H, TRAY_Y)).setOrigin(0).setDepth(-10);

    // empty slots: the stock (recycle mark), the waste, a faint suit on each foundation, a K outline on each column
    this.stockSlot = this.add.image(colX(0), TOP_Y, 'sol-slot-re').setDepth(5);
    this.add.image(colX(1), TOP_Y, 'sol-slot').setDepth(5);
    for (let s = 0; s < 4; s++) this.add.image(colX(3 + s), TOP_Y, `sol-slot-f${s}`).setDepth(5);
    for (let c = 0; c < 7; c++) this.add.image(colX(c), TAB_Y, 'sol-slot-k').setDepth(5);

    // stock counter and deck passes in the free spot between the waste and the foundations
    this.stockText = txt(this, colX(2), TOP_Y - 34, '', { title: true, size: 30, color: '#f4fff6' }).setDepth(20);
    txt(this, colX(2), TOP_Y - 4, t('cards'), { size: 17, color: '#a8d8b8' }).setDepth(20);
    this.pips = this.add.graphics().setDepth(20);
    this.passText = txt(this, colX(2), TOP_Y + 54, '', { size: 17, color: '#a8d8b8' }).setDepth(20);

    this.selRing = this.add.nineslice(0, 0, SEL, undefined, CW + PAD * 2, CH + PAD * 2, RING, RING, RING, RING)
      .setDepth(3400).setVisible(false);
    this.tweens.add({ targets: this.selRing, alpha: 0.45, duration: 420, yoyo: true, repeat: -1 });

    // bottom tray
    new Button(this, 128, BTN_Y, t('undo'), () => this.undo(), { width: 212, height: 88, size: 22, color: COLORS.purple });
    this.hintBtn = new Button(this, 360, BTN_Y, t('hint'), () => this.hint(), { width: 212, height: 88, size: 22, color: 0x2a7fd4 });
    this.autoGlow = this.add.graphics().setDepth(-1).setVisible(false);
    this.autoGlow.fillStyle(0xffd23f, 0.35).fillRoundedRect(360 - 124, BTN_Y - 52, 248, 104, 34);
    this.tweens.add({ targets: this.autoGlow, alpha: 0.25, duration: 480, yoyo: true, repeat: -1 });
    this.autoBtn = new Button(this, 360, BTN_Y, t('auto'), () => this.autoFinish(), { width: 228, height: 88, size: 20, color: 0xe08a00 });
    this.autoBtn.setVisible(false);
    this.giveBtn = new Button(this, 592, BTN_Y, t('giveUp'), () => this.giveUp(), { width: 212, height: 88, size: 22, color: 0x8a3a3a });

    // the deck: every card is a container with its soft shadow and its face
    for (let id = 0; id < 52; id++) {
      const shadow = this.add.image(0, SH_Y, SHADOW).setAlpha(0.42);
      const face = this.add.image(0, 0, BACK);
      const box = this.add.container(colX(0), TOP_Y, [shadow, face]).setDepth(100 + id);
      this.cards.push({ box, face, shadow, shown: false });
    }
    const deck = rng.shuffle(Array.from({ length: 52 }, (_, i) => i));
    for (let c = 0; c < 7; c++) for (let k = 0; k <= c; k++) this.piles[T0 + c].push(deck.pop()!);
    for (let c = 0; c < 7; c++) this.up[this.piles[T0 + c][c]] = true;
    this.piles[STOCK] = deck;
    this.sfx('shuffle', { volume: 0.6 });
    this.layout({ deal: true });
    for (let k = 0; k < 4; k++) this.time.delayedCall(150 + k * 220, () => this.sfx('flip1', { volume: 0.3 }));
    this.time.delayedCall(1100, () => { this.busy = false; });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    const kb = this.input.keyboard;
    kb?.on('keydown-SPACE', () => this.clickStock());
    kb?.on('keydown-X', () => this.undo());
    kb?.on('keydown-BACKSPACE', () => this.undo());
    kb?.on('keydown-H', () => this.hint());
    kb?.on('keydown-A', () => this.autoFinish());
    kb?.on('keydown-N', () => this.giveUp());
    kb?.on('keydown-LEFT', () => this.selMove(-1, 0));
    kb?.on('keydown-RIGHT', () => this.selMove(1, 0));
    kb?.on('keydown-UP', () => this.selMove(0, 1));
    kb?.on('keydown-DOWN', () => this.selMove(0, -1));
    for (const k of ['ENTER', 'Z']) kb?.on(`keydown-${k}`, () => this.selAct());
    kb?.on('keydown', (e: KeyboardEvent) => { if (/^[1-7]$/.test(e.key)) this.selTo(Number(e.key) - 1); });

    // the win cascade runs on the scene clock, also after the round has ended
    const onUpdate = (_: number, delta: number) => this.stepFlyers(delta);
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
    this.refreshInfo();
  }

  // ---------- layout ----------
  private tabOffsets(c: number): number[] {
    const pile = this.piles[T0 + c];
    let downs = 0, ups = 0;
    pile.forEach((id, i) => { if (i < pile.length - 1) { if (this.up[id]) ups++; else downs++; } });
    const room = TAB_BOTTOM - CH / 2 - TAB_Y;
    let d = DOWN_OFF, u = UP_OFF;
    if (downs * d + ups * u > room) {
      // squeeze the hidden cards first, then the face-up ones
      d = downs ? Math.max(10, Math.min(DOWN_OFF, (room - ups * u) / downs)) : d;
      if (downs * d + ups * u > room) u = (room - downs * d) / Math.max(1, ups);
    }
    return pile.map((id) => (this.up[id] ? u : d));
  }

  private posOf(pile: number, index: number): [number, number] {
    if (pile === STOCK || pile === WASTE) {
      const k = Math.floor(Math.max(0, index) / 6);
      return [colX(pile) - k, TOP_Y - k];
    }
    if (isFound(pile)) {
      const k = Math.floor(Math.max(0, index) / 4);
      return [colX(3 + pile - F0) - k, TOP_Y - k];
    }
    const offs = this.tabOffsets(pile - T0);
    let y = TAB_Y;
    for (let i = 0; i < index; i++) y += offs[i];
    return [colX(pile - T0), y];
  }

  /** Where the next card of a pile would go (the slot itself when it is empty). */
  private landing(pile: number): [number, number] {
    const p = this.piles[pile];
    return p.length ? this.posOf(pile, p.length - 1) : this.posOf(pile, 0);
  }

  private baseDepth(pile: number): number {
    return pile === STOCK ? 100 : pile === WASTE ? 200 : isFound(pile) ? 300 : 500;
  }

  private layout(o: { deal?: boolean; dur?: number } = {}): void {
    let n = 0;
    this.piles.forEach((pile, pi) => pile.forEach((id, i) => {
      const card = this.cards[id];
      const b = card.box;
      const faceUp = pi !== STOCK && this.up[id];
      const [x, y] = this.posOf(pi, i);
      const depth = this.baseDepth(pi) + i;
      // squared piles (stock, waste, foundations) would stack 24 shadows into a black halo
      card.shadow.setVisible(pi >= T0 || i === 0 || i === pile.length - 1);
      this.tweens.killTweensOf(b);
      this.tweens.killTweensOf(card.shadow);
      const dur = o.deal ? 320 : o.dur ?? 210;
      const delay = o.deal ? n * 28 : 0;
      if (Math.abs(b.x - x) > 0.5 || Math.abs(b.y - y) > 0.5) {
        n++;
        // a moving card flies over everything and keeps its pile order
        b.setDepth(1500 + depth);
        this.tweens.add({ targets: b, x, y, duration: dur, delay, ease: 'Cubic.easeOut', onComplete: () => b.setDepth(depth) });
      } else b.setDepth(depth);
      if (card.shown !== faceUp) this.flip(card, id, faceUp, o.deal ? delay + dur * 0.7 : 0);
      else if (b.scaleX !== 1 || b.scaleY !== 1) this.tweens.add({ targets: b, scaleX: 1, scaleY: 1, duration: 170, ease: 'Back.easeOut' });
      if (card.shadow.x !== 0 || card.shadow.y !== SH_Y) this.tweens.add({ targets: card.shadow, x: 0, y: SH_Y, alpha: 0.42, duration: 170 });
    }));
    const noStock = !this.piles[STOCK].length;
    this.stockSlot.setTexture(noStock && this.passes >= MAX_PASSES ? 'sol-slot-x' : 'sol-slot-re');
    this.updateSel();
  }

  /** Turns a card over: it narrows to an edge, swaps its face and widens again. */
  private flip(card: Card, id: number, up: boolean, delay: number): void {
    const b = card.box;
    this.tweens.add({
      targets: b, scaleX: 0, scaleY: 1.07, duration: 95, delay, ease: 'Quad.easeIn',
      onComplete: () => {
        card.shown = up;
        card.face.setTexture(up ? faceKey(suitOf(id), rankOf(id)) : BACK);
        this.tweens.add({ targets: b, scaleX: 1, scaleY: 1, duration: 115, ease: 'Quad.easeOut' });
      },
    });
  }

  private refreshInfo(): void {
    const n = this.piles[STOCK].length;
    this.stockText.setText(String(n));
    this.passText.setText(t('passN', { n: this.passes, m: MAX_PASSES }));
    const g = this.pips.clear();
    for (let k = 0; k < MAX_PASSES; k++) {
      const x = colX(2) + (k - 1) * 22, y = TOP_Y + 28;
      if (k >= this.passes - 1) g.fillStyle(0xffd23f, 1).fillCircle(x, y, 7);
      g.lineStyle(2, 0xffe9a8, 0.7).strokeCircle(x, y, 7);
    }
    this.hud.setCenter(`${t('moves')} ${this.moves}`);
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
    if ((m.from === WASTE || isFound(m.from)) && !single) return false;
    if (isFound(m.to)) return single && m.to === F0 + suitOf(id) && this.canFound(id);
    if (m.to >= T0) return this.canTab(id, m.to - T0);
    return false;
  }

  /** Best destination for tapping the card at (pile, index): its foundation first, then a column. */
  private autoTarget(pile: number, index: number): number {
    const src = this.piles[pile];
    const id = src[index];
    if (isFound(pile)) {
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

  /** Moves that make progress, each with a weight (used for hints and stuck detection). */
  private usefulMoves(): (Move & { w: number })[] {
    const out: (Move & { w: number })[] = [];
    const w = this.piles[WASTE];
    if (w.length) {
      const i = w.length - 1;
      for (let to = F0; to <= T0 + 6; to++) {
        if (this.legal({ from: WASTE, index: i, to })) out.push({ from: WASTE, index: i, to, w: isFound(to) ? 90 : 50 });
      }
    }
    for (let c = 0; c < 7; c++) {
      const pile = this.piles[T0 + c];
      const hidden = pile.filter((id) => !this.up[id]).length;
      for (let i = 0; i < pile.length; i++) {
        if (!this.up[pile[i]]) continue;
        const reveals = i > 0 && !this.up[pile[i - 1]];
        if (i === pile.length - 1) {
          const f = F0 + suitOf(pile[i]);
          if (this.legal({ from: T0 + c, index: i, to: f })) out.push({ from: T0 + c, index: i, to: f, w: 100 + (reveals ? 30 + hidden : 0) });
        }
        const empties = i === 0 && rankOf(pile[i]) !== 13;
        // moving the run away lets the face-up card under it go up to its foundation
        const frees = i > 0 && this.up[pile[i - 1]] && this.canFound(pile[i - 1]);
        if (!reveals && !empties && !frees) continue;
        const weight = reveals ? 80 + hidden : frees ? 70 : 30;
        for (let d = 0; d < 7; d++) if (d !== c && this.legal({ from: T0 + c, index: i, to: T0 + d })) out.push({ from: T0 + c, index: i, to: T0 + d, w: weight });
      }
    }
    return out.sort((a, b) => b.w - a.w);
  }

  private canDraw(): boolean {
    return this.piles[STOCK].length > 0 || (this.piles[WASTE].length > 0 && this.passes < MAX_PASSES);
  }

  /** True when every hidden card is up and the deal finishes by drawing and foundation moves alone. */
  private canAutoFinish(): boolean {
    if (!this.piles.slice(T0).every((p) => p.every((id) => this.up[id]))) return false;
    const found = [0, 1, 2, 3].map((s) => this.piles[F0 + s].length);
    const tabs = this.piles.slice(T0).map((p) => p.slice());
    let stock = this.piles[STOCK].slice(), waste = this.piles[WASTE].slice(), passes = this.passes;
    const fits = (id: number | undefined) => id !== undefined && rankOf(id) === found[suitOf(id)] + 1;
    for (let guard = 0; guard < 2000; guard++) {
      if (found.every((n) => n === 13)) return true;
      const col = tabs.find((p) => fits(p[p.length - 1]));
      if (col) { found[suitOf(col.pop()!)]++; continue; }
      if (fits(waste[waste.length - 1])) { found[suitOf(waste.pop()!)]++; continue; }
      if (stock.length) { waste.push(stock.pop()!); continue; }
      if (waste.length && passes < MAX_PASSES) { stock = waste.reverse(); waste = []; passes++; continue; }
      return false;
    }
    return false;
  }

  // ---------- actions ----------
  private snapshot(): void {
    this.history.push({ piles: this.piles.map((p) => p.slice()), up: this.up.slice(), score: this.score, passes: this.passes, moves: this.moves });
    if (this.history.length > 300) this.history.shift();
  }

  private blocked(): boolean {
    return this.busy || this.isOver || this.finished;
  }

  private undo(): void {
    if (this.blocked()) return;
    const s = this.history.pop();
    if (!s) { this.sfx('error', { volume: 0.3 }); return; }
    this.clearHint();
    this.piles = s.piles; this.up = s.up; this.passes = s.passes; this.moves = s.moves;
    this.setScore(s.score);
    this.sfx('undo', { volume: 0.5 });
    this.sfx(rng.pick(['flip1', 'flip2']), { volume: 0.35, rate: 0.85 });
    this.layout({ dur: 260 });
    this.refreshInfo();
    this.updateAuto();
  }

  private clickStock(): void {
    if (this.blocked()) return;
    this.clearHint();
    if (this.drawStock()) { this.afterAction(); return; }
    this.sfx('error', { volume: 0.3 });
    this.tweens.add({ targets: this.stockSlot, x: colX(0) + 6, duration: 45, yoyo: true, repeat: 2, onComplete: () => this.stockSlot.setX(colX(0)) });
  }

  /** Turns the top stock card onto the waste, or recycles the waste. False when neither is possible. */
  private drawStock(): boolean {
    const st = this.piles[STOCK], w = this.piles[WASTE];
    if (st.length) {
      this.snapshot();
      const id = st.pop()!;
      this.up[id] = true;
      w.push(id);
      this.sfxAt(rng.pick(['flip1', 'flip2']), colX(0), { volume: 0.6 });
    } else if (w.length && this.passes < MAX_PASSES) {
      this.snapshot();
      this.piles[STOCK] = w.reverse().map((id) => { this.up[id] = false; return id; });
      this.piles[WASTE] = [];
      this.passes++;
      this.addScore(-50, colX(0), TOP_Y - 70);
      this.sfxAt('recycle', colX(0), { volume: 0.6 });
    } else return false;
    this.moves++;
    this.layout({ dur: this.autoRun ? 150 : 230 });
    return true;
  }

  private doMove(m: Move): void {
    this.clearHint();
    this.snapshot();
    const src = this.piles[m.from];
    const ids = src.splice(m.index);
    this.piles[m.to].push(...ids);
    const toFound = isFound(m.to);
    let pts = 0;
    if (toFound) pts += 10;
    else if (m.from === WASTE) pts += 5;
    else if (isFound(m.from)) pts -= 15;
    const dur = this.autoRun ? 150 : 210;
    if (m.from >= T0 && src.length && !this.up[src[src.length - 1]]) {
      this.up[src[src.length - 1]] = true;
      pts += 5;
      const [rx, ry] = this.posOf(m.from, src.length - 1);
      this.time.delayedCall(140, () => {
        this.sfxAt('reveal', rx, { volume: 0.3 });
        burst(this, rx, ry, [0xffffff, 0xbff5d0], 8, 140);
      });
    }
    this.moves++;
    this.layout({ dur });
    const [x, y] = this.posOf(m.to, this.piles[m.to].length - 1);
    // popups over foundations start on the card so they do not drift into the HUD
    if (pts && this.autoRun) this.addScore(pts);   // no popup storm during the auto-finish cascade
    else if (pts) this.addScore(pts, x, toFound ? y + 10 : y - 70);
    if (toFound) {
      // the chime climbs as the foundations fill up
      const filled = this.piles.slice(F0, T0).reduce((n, p) => n + p.length, 0);
      this.sfxAt(rng.pick(['place1', 'place2', 'place3']), x, { volume: 0.45 });
      this.time.delayedCall(dur - 40, () => {
        if (this.piles[m.to].length === 13) {
          this.sfxAt('suit', x, { volume: 0.6, exact: true });
          shake(this, 0.004, 160);
        } else this.sfxAt('found', x, { volume: 0.4, rate: 0.85 + filled * 0.014 });
        this.sparkle(x, y, isRed(ids[0]), this.piles[m.to].length === 13);
      });
    } else this.sfxAt(rng.pick(['place1', 'place2', 'place3']), x, { volume: 0.6 });
    this.afterAction();
  }

  private sparkle(x: number, y: number, red: boolean, big: boolean): void {
    burst(this, x, y, [0xffe27a, 0xffffff, red ? 0xff7a8a : 0x9fd0ff], big ? 34 : 16, big ? 360 : 230);
    const star = this.add.image(x, y - CH / 2 + 4, 'icon-star').setTint(0xffc83a).setScale(0.15).setDepth(3600);
    this.tweens.add({ targets: star, y: star.y - 30, scale: big ? 0.9 : 0.6, angle: 140, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => star.destroy() });
    const ring = this.add.image(x, y, GLOW).setDepth(3500);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.12, duration: 380, onComplete: () => ring.destroy() });
  }

  private afterAction(): void {
    this.refreshInfo();
    if (this.piles.slice(F0, T0).every((p) => p.length === 13)) { this.win(); return; }
    this.updateAuto();
    if (!this.autoRun && !this.autoReady && !this.canDraw() && !this.usefulMoves().length) this.stuck();
  }

  /** Offers the auto-finish button (in the hint button's place) while the deal can finish by itself. */
  private updateAuto(): void {
    const ready = !this.autoRun && !this.finished && this.canAutoFinish();
    if (ready && !this.autoReady) {
      this.sfx('ready', { volume: 0.5 });
      this.autoBtn.setScale(0.6);
      this.tweens.add({ targets: this.autoBtn, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }
    this.autoReady = ready;
    this.autoBtn.setVisible(ready);
    this.autoGlow.setVisible(ready);
    this.hintBtn.setVisible(!ready);
  }

  private autoFinish(): void {
    if (!this.autoReady || this.blocked() || this.autoRun) return;
    this.autoRun = true;
    this.busy = true;
    this.sel.on = false;
    this.updateAuto();
    this.updateSel();
    this.sfx('fan', { volume: 0.5 });
    const step = () => {
      if (this.isOver || this.finished) return;
      // the lowest card that fits, from the waste or a column
      let best: Move | null = null, rank = 99;
      for (const p of [WASTE, T0, T0 + 1, T0 + 2, T0 + 3, T0 + 4, T0 + 5, T0 + 6]) {
        const a = this.piles[p];
        const id = a[a.length - 1];
        if (id !== undefined && this.up[id] && this.canFound(id) && rankOf(id) < rank) {
          rank = rankOf(id);
          best = { from: p, index: a.length - 1, to: F0 + suitOf(id) };
        }
      }
      if (best) this.doMove(best);
      else if (this.drawStock()) this.refreshInfo();
      else { this.autoRun = false; this.busy = false; this.afterAction(); return; }
      if (!this.finished) this.time.delayedCall(best ? 90 : 130, step);
    };
    this.time.delayedCall(120, step);
  }

  private win(): void {
    this.finished = true; this.busy = true; this.autoRun = false;
    this.sel.on = false; this.updateSel(); this.clearHint();
    this.autoBtn.setVisible(false); this.autoGlow.setVisible(false);
    const secs = Math.floor(this.elapsed);
    const bonus = 500 + Math.max(0, Math.round(1500 - this.elapsed * 2));
    this.addScore(bonus);
    flash(this, 0xffd23f, 220, 0.3);
    this.sfx('fan', { volume: 0.6 });
    this.time.delayedCall(300, () => this.sfx('win', { volume: 0.7, exact: true }));
    const title = txt(this, 360, 560, t('solved'), { title: true, size: 58, color: '#ffe27a', strokeThickness: 10 }).setDepth(4000).setScale(0);
    this.tweens.add({ targets: title, scale: 1, duration: 520, ease: 'Back.easeOut' });
    const sub = txt(this, 360, 640, t('timeBonus', { n: bonus, t: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` }), {
      size: 30, color: '#ffffff', strokeThickness: 6,
    }).setDepth(4000).setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, y: 630, delay: 350, duration: 400 });
    // the classic cascade: cards jump off the foundations, bounce on the table and leave trails
    this.trail = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(3800);
    const order: number[] = [];
    for (let r = 13; r >= 1; r--) for (let s = 0; s < 4; s++) order.push(this.piles[F0 + s][r - 1]);
    order.forEach((id, k) => this.time.delayedCall(450 + k * 75, () => {
      const card = this.cards[id];
      this.tweens.killTweensOf(card.box);
      card.box.setScale(1).setDepth(3900 + k);
      card.shadow.setVisible(false);
      const dir = rng.chance(0.5) ? -1 : 1;
      this.flyers.push({ id, x: card.box.x, y: card.box.y, vx: dir * rng.int(150, 420), vy: -rng.int(150, 650) });
      if (k % 4 === 0) this.sfxAt(rng.pick(['place1', 'place2', 'place3']), card.box.x, { volume: 0.25 });
    }));
    for (let k = 0; k < 9; k++) {
      this.time.delayedCall(200 + k * 260, () => burst(this, rng.int(80, 640), rng.int(260, 900), [0xffd23f, 0xec3013, 0xffffff, 0x3ee6ff, 0x5dff7a], 26, 380));
    }
    this.endGame({ win: true, title: t('solved'), delay: 5200 });
  }

  private stepFlyers(delta: number): void {
    if (!this.flyers.length || !this.trail) return;
    const dt = Math.min(delta, 50) / 1000;
    const floor = H - CH / 2;
    this.flyers = this.flyers.filter((f) => {
      f.vy += 1900 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.y > floor) { f.y = floor; f.vy = -f.vy * 0.72; }
      const card = this.cards[f.id];
      card.box.setPosition(f.x, f.y);
      this.trail!.stamp(faceKey(suitOf(f.id), rankOf(f.id)), undefined, f.x, f.y);
      const gone = f.x < -CW || f.x > W + CW;
      if (gone) card.box.setVisible(false);
      return !gone;
    });
  }

  private stuck(): void {
    this.finished = true;
    this.sfx('stuck', { volume: 0.6 });
    shake(this, 0.008, 300);
    const msg = txt(this, 360, 640, t('noMoves'), { title: true, size: 44, color: '#ff6b6b', strokeThickness: 10 }).setDepth(4000).setScale(0.5);
    this.tweens.add({ targets: msg, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.endGame({ title: t('noMoves'), delay: 1900 });
  }

  /** First tap arms the button, the second within a few seconds ends the round. */
  private giveUp(): void {
    if (this.blocked()) return;
    if (!this.giveArmed) {
      this.giveArmed = true;
      this.giveBtn.setText(t('sure'));
      this.sfx('hint', { volume: 0.35 });
      this.giveTimer = this.time.delayedCall(3000, () => { this.giveArmed = false; this.giveBtn.setText(t('giveUp')); });
      return;
    }
    this.giveTimer?.remove();
    this.giveBtn.setText(t('giveUp'));
    this.finished = true; this.busy = true;
    this.sel.on = false; this.updateSel(); this.clearHint();
    this.sfx('stuck', { volume: 0.5 });
    this.sfx('shuffle', { volume: 0.5 });
    // sweep the table into one pile
    this.cards.forEach((c, i) => {
      this.tweens.killTweensOf(c.box);
      this.tweens.add({
        targets: c.box, x: 360 + rng.int(-6, 6), y: 600 + rng.int(-6, 6), angle: rng.int(-25, 25), scaleX: 1, scaleY: 1,
        delay: i * 9, duration: 380, ease: 'Cubic.easeIn', onStart: () => c.box.setDepth(3000 + i),
      });
    });
    this.endGame({ title: t('gaveUp'), delay: 1200 });
  }

  private hint(): void {
    if (this.blocked()) return;
    this.clearHint();
    const m = this.usefulMoves()[0];
    if (!m) {
      if (this.canDraw()) {
        this.sfxAt('hint', colX(0), { volume: 0.45 });
        this.glowAt(colX(0), TOP_Y, CH);
      } else {
        this.sfx('error', { volume: 0.35 });
        popup(this, 360, BTN_Y - 90, t('noUseful'), '#ffd23f', 24);
        this.tweens.add({ targets: this.giveBtn, scale: 1.1, duration: 140, yoyo: true, repeat: 2 });
      }
      return;
    }
    if (this.score > 0) this.addScore(-5);
    const run = this.piles[m.from].slice(m.index);
    const [sx, sy] = this.posOf(m.from, m.index);
    const [, ey] = this.posOf(m.from, m.index + run.length - 1);
    this.glowAt(sx, (sy + ey) / 2, ey - sy + CH);
    const [tx, ty] = this.landing(m.to);
    this.glowAt(tx, ty, CH);
    this.sfxAt('hint', sx, { volume: 0.45 });
    run.forEach((id) => {
      const b = this.cards[id].box;
      this.tweens.add({ targets: b, y: b.y - 12, duration: 150, yoyo: true, repeat: 2, ease: 'Sine.easeInOut' });
    });
  }

  private glowAt(x: number, y: number, h: number): void {
    const g = this.add.nineslice(x, y, GLOW, undefined, CW + PAD * 2, h + PAD * 2, RING, RING, RING, RING)
      .setDepth(3500);
    this.glows.push(g);
    this.tweens.add({
      targets: g, alpha: 0.35, duration: 280, yoyo: true, repeat: 3,
      onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() }),
    });
  }

  private clearHint(): void {
    for (const g of this.glows) g.destroy();
    this.glows = [];
  }

  // ---------- pointer ----------
  private hit(x: number, y: number): { pile: number; index: number } | null {
    const inside = (cx: number, cy: number, h = CH) => Math.abs(x - cx) <= CW / 2 + 4 && y >= cy - CH / 2 - 4 && y <= cy - CH / 2 + h + 4;
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
    if (this.blocked()) return;
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
    if (!d || !p.isDown || this.blocked()) return;
    if (!d.moved) {
      if (Math.hypot(p.x - d.x, p.y - d.y) < 12) return;
      d.moved = true;
      this.clearHint();
      // lift the run: a little bigger, with a longer shadow
      this.dragIds().forEach((id, k) => {
        const c = this.cards[id];
        this.tweens.killTweensOf(c.box);
        this.tweens.killTweensOf(c.shadow);
        if (!c.shown) { c.shown = true; c.face.setTexture(faceKey(suitOf(id), rankOf(id))); }
        c.box.setDepth(3000 + k).setScale(1);
        c.shadow.setVisible(true);
        this.tweens.add({ targets: c.box, scaleX: 1.07, scaleY: 1.07, duration: 110, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: c.shadow, x: 8, y: 22, alpha: 0.62, duration: 110 });
      });
      this.sfx(rng.pick(['flip1', 'flip2']), { volume: 0.25 });
    }
    this.dragIds().forEach((id, k) => {
      const [x, y] = this.posOf(d.pile, d.index + k);
      this.cards[id].box.setPosition(x + p.x - d.x, y + p.y - d.y);
    });
  }

  /** The legal pile the dragged card covers the most of (foundations accept a card dropped on any of them). */
  private dropTarget(d: { pile: number; index: number }): number {
    const id = this.piles[d.pile][d.index];
    const lead = this.cards[id].box;
    const overlap = (x: number, y0: number, y1: number) => {
      const ox = Math.max(0, CW - Math.abs(lead.x - x));
      const oy = Math.max(0, Math.min(lead.y + CH / 2, y1) - Math.max(lead.y - CH / 2, y0));
      return ox * oy;
    };
    let best = -1, area = 0;
    const consider = (to: number, a: number) => {
      if (a > area && this.legal({ from: d.pile, index: d.index, to })) { best = to; area = a; }
    };
    for (let s = 0; s < 4; s++) consider(F0 + suitOf(id), overlap(colX(3 + s), TOP_Y - CH / 2, TOP_Y + CH / 2));
    for (let c = 0; c < 7; c++) {
      if (T0 + c === d.pile) continue;
      const [x, y] = this.landing(T0 + c);
      consider(T0 + c, overlap(x, y - CH / 2, Math.max(y + CH / 2, TAB_BOTTOM)));
    }
    return best;
  }

  private onUp(): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (this.blocked() || this.piles[d.pile][d.index] === undefined) { this.layout(); return; }
    if (!d.moved) { this.tapCard(d.pile, d.index); return; }
    const to = this.dropTarget(d);
    if (to >= 0) { this.doMove({ from: d.pile, index: d.index, to }); return; }
    // no legal spot under it: the run flies home with a soft swish
    this.layout({ dur: 260 });
    this.sfx('flip2', { volume: 0.35, rate: 0.8 });
    this.sfx('error', { volume: 0.12 });
  }

  private tapCard(pile: number, index: number): void {
    const to = this.autoTarget(pile, index);
    if (to >= 0) { this.doMove({ from: pile, index, to }); return; }
    this.sfx('error', { volume: 0.3 });
    const ids = this.piles[pile].slice(index);
    ids.forEach((id) => {
      const b = this.cards[id].box;
      const x = this.posOf(pile, index)[0];
      this.tweens.killTweensOf(b);
      b.setX(x);
      this.tweens.add({ targets: b, x: x + 7, duration: 45, yoyo: true, repeat: 2 });
    });
  }

  // ---------- keyboard selection (src 0 = waste, 1..7 = tableau columns) ----------
  private selPile(): number { return this.sel.src === 0 ? WASTE : T0 + this.sel.src - 1; }

  private selIndex(): number {
    const p = this.piles[this.selPile()];
    if (!p.length) return -1;
    if (this.sel.src === 0) return p.length - 1;
    let firstUp = p.length - 1;
    while (firstUp > 0 && this.up[p[firstUp - 1]]) firstUp--;
    this.sel.depth = Phaser.Math.Clamp(this.sel.depth, 0, p.length - 1 - firstUp);
    return p.length - 1 - this.sel.depth;
  }

  private selMove(dx: number, dy: number): void {
    if (this.blocked()) return;
    if (!this.sel.on) this.sel.on = true;
    else if (dx) { this.sel.src = Phaser.Math.Wrap(this.sel.src + dx, 0, 8); this.sel.depth = 0; }
    else this.sel.depth = Math.max(0, this.sel.depth + dy);
    this.sfx('cursor', { volume: 0.35 });
    this.updateSel();
  }

  private updateSel(): void {
    if (!this.sel.on || this.finished) { this.selRing.setVisible(false); return; }
    const pile = this.selPile(), i = this.selIndex();
    if (i < 0) {
      const [x, y] = this.posOf(pile, 0);
      this.selRing.setVisible(true).setPosition(x, y).setSize(CW + PAD * 2, CH + PAD * 2);
      return;
    }
    const [x, y0] = this.posOf(pile, i);
    const [, y1] = this.posOf(pile, this.piles[pile].length - 1);
    this.selRing.setVisible(true).setPosition(x, (y0 + y1) / 2).setSize(CW + PAD * 2, y1 - y0 + CH + PAD * 2);
  }

  private selAct(): void {
    if (this.blocked()) return;
    if (!this.sel.on) { this.sel.on = true; this.updateSel(); return; }
    const i = this.selIndex();
    if (i < 0) { this.sfx('error', { volume: 0.3 }); return; }
    this.tapCard(this.selPile(), i);
    this.sel.depth = 0;
    this.updateSel();
  }

  /** Number keys 1-7 send the selected card or run to that column. */
  private selTo(c: number): void {
    if (this.blocked()) return;
    const i = this.sel.on ? this.selIndex() : -1;
    const m = { from: this.selPile(), index: i, to: T0 + c };
    if (i >= 0 && this.legal(m)) { this.doMove(m); this.sel.depth = 0; this.updateSel(); return; }
    this.sfx('error', { volume: 0.3 });
  }

  updateGame(): void {
    const sec = Math.floor(this.elapsed);
    if (sec !== this.lastSec && !this.finished) {
      this.lastSec = sec;
      this.hud.setRight(`${t('time')} ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
    }
  }
}
