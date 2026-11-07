import Phaser from 'phaser';
import { ArcadeScene, Button, burst, net, t, txt, popup, COLORS } from '@core';
import {
  analyse, botDiscard, botTakesDiscard, deal, faceOf, findFinish, handPoints, makeTiles, rng, winKind,
  type Tile, type WinKind,
} from './logic';
import { TILE_H, TILE_W, makeRack, makeTable, makeTiles as makeTileArt, tileKey } from './art';

// ---------- layout (landscape 1280 × 720) ----------
const W = 1280;
const SLOT = 76;
const SLOTS = 14;                       // per rack row
const ROW_Y = [566, 660];
const RACK_X0 = W / 2 - (SLOTS * SLOT) / 2 + SLOT / 2;
const PILE = { x: 586, y: 318 };
const IND = { x: 694, y: 318 };
/** Where each relative seat sits: 0 me (bottom), 1 right, 2 top, 3 left. */
const SEAT_POS = [{ x: 640, y: 470 }, { x: 1176, y: 300 }, { x: 640, y: 118 }, { x: 104, y: 300 }];
/** Discard corner between relative seat r and the next one. */
const CORNER = [{ x: 1086, y: 440 }, { x: 1086, y: 176 }, { x: 194, y: 176 }, { x: 194, y: 440 }];
const HANDS_PER_MATCH = 5;
const BOT_DELAY = [650, 1150];

type Act = { s: number; a: 'draw' | 'take' | 'discard' | 'finish'; id?: number; n: number };
type Phase = 'draw' | 'discard' | 'over';

/** A table that a re-joining player receives from the host (set by the menu, read by Play). */
export let pendingSync: SyncData | null = null;
export function setPendingSync(s: SyncData | null): void { pendingSync = s; }
export interface SyncData { seat: number; base: number; hand: number; startDealer: number; scores: number[]; log: Act[] }

interface Seat { name: string; bot: boolean }

export class PlayScene extends ArcadeScene {
  private tiles: Tile[] = [];
  private seats: Seat[] = [];
  private me = 0;
  private base = 0;
  private hand = 0;
  private startDealer = 0;
  private scores = [0, 0, 0, 0];
  // the current hand
  private hands: number[][] = [];
  private pile: number[] = [];
  private discards: number[][] = [[], [], [], []];
  private indicator = 0;
  private okey = { color: 0, num: 1 };
  private dealer = 0;
  private turn = 0;
  private phase: Phase = 'draw';
  private log: Act[] = [];
  private away = new Set<number>();
  private botTimer: Phaser.Time.TimerEvent | null = null;
  private rand: () => number = Math.random;
  // my rack: slot index → tile id
  private rack: (number | null)[] = [];
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private selected: number | null = null;
  private drag: { id: number; dx: number; dy: number; moved: boolean } | null = null;
  // table furniture
  private pileImg!: Phaser.GameObjects.Image;
  private pileText!: Phaser.GameObjects.Text;
  private indImg!: Phaser.GameObjects.Image;
  private cornerImgs: (Phaser.GameObjects.Image | null)[] = [null, null, null, null];
  private seatUi: { ring: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; pts: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text; backs: Phaser.GameObjects.Container }[] = [];
  private hint!: Phaser.GameObjects.Text;
  private sortRunsBtn!: Button;
  private sortPairsBtn!: Button;
  private discardBtn!: Button;
  private finishBtn!: Button;
  private overlay: Phaser.GameObjects.GameObject[] = [];

  createGame(): void {
    this.tiles = makeTiles();
    makeTileArt(this, '"Fredoka", "Nunito", sans-serif');
    this.add.image(0, 0, makeTable(this, W, 720)).setOrigin(0).setDepth(-10);
    this.add.image(W / 2, (ROW_Y[0] + ROW_Y[1]) / 2 + 2, makeRack(this, SLOTS * SLOT + 36, 196)).setDepth(-5);

    // seats: the platform's table (protocol 2.3) or me and three bots
    if (net.isTable) {
      this.seats = net.seats.map((s) => ({ name: s.name, bot: s.bot }));
      this.me = net.playerIndex;
      this.base = net.seed || 1;
    } else {
      this.seats = [{ name: t('you'), bot: false }, ...[0, 1, 2].map((i) => ({ name: t(`bot${i}`), bot: true }))];
      this.me = 0;
      this.base = Math.floor(Math.random() * 2 ** 31);
    }
    while (this.seats.length < 4) this.seats.push({ name: t(`bot${this.seats.length - 1}`), bot: true });
    this.startDealer = this.base % 4;
    this.scores = [0, 0, 0, 0];
    this.hand = 0;
    this.away = new Set();
    this.overlay = [];

    this.buildTable();
    this.bindInput();
    this.bindNet();

    const sync = pendingSync && pendingSync.seat === this.me ? pendingSync : null;
    setPendingSync(null);
    if (sync) this.applySync(sync);
    else this.startHand();
  }

  // ---------- helpers ----------
  private rel(seat: number): number { return (seat - this.me + 4) % 4; }
  private next(seat: number): number { return (seat + 1) % 4; }
  private prev(seat: number): number { return (seat + 3) % 4; }
  private isMine(seat: number): boolean { return seat === this.me; }
  /** Seats this game plays: bots and away players on the host (or solo) side. */
  private controls(seat: number): boolean {
    if (seat === this.me) return false;
    if (!net.active) return true;
    return net.isHost && (this.seats[seat].bot || this.away.has(seat));
  }
  private slotPos(i: number): { x: number; y: number } {
    return { x: RACK_X0 + (i % SLOTS) * SLOT, y: ROW_Y[Math.floor(i / SLOTS)] };
  }

  // ---------- table ----------
  private buildTable(): void {
    // centre pile and indicator
    for (let i = 0; i < 4; i++) this.add.image(PILE.x - i * 1.5, PILE.y - i * 2.5, 'ok-t-back').setDepth(1);
    this.pileImg = this.add.image(PILE.x - 6, PILE.y - 10, 'ok-t-back').setDepth(2).setInteractive({ useHandCursor: true });
    this.pileText = txt(this, PILE.x, PILE.y + 62, '', { size: 20, color: '#f3f2f2' }).setDepth(3);
    this.indImg = this.add.image(IND.x, IND.y, 'ok-t-back').setDepth(2).setAngle(8);
    txt(this, IND.x, IND.y + 62, t('indicator'), { size: 18, color: '#ffe8a3' }).setDepth(3);
    this.pileImg.on('pointerup', () => this.humanDraw('draw'));

    // seats
    this.seatUi = [];
    for (let r = 0; r < 4; r++) {
      const seat = (this.me + r) % 4;
      const p = SEAT_POS[r];
      const ring = this.add.image(p.x, r === 0 ? p.y : p.y, 'ok-ring').setScale(r === 0 ? 0 : 0.62).setTint(0xffd23f).setAlpha(0).setDepth(4);
      const nameY = r === 0 ? p.y - 6 : p.y;
      const plate = this.add.graphics().setDepth(4);
      if (r !== 0) {
        plate.fillStyle(0x000000, 0.35).fillCircle(p.x, p.y, 34);
        plate.fillStyle(this.seats[seat].bot ? 0x3b6bd6 : 0xd94a5c, 1).fillCircle(p.x, p.y, 28);
      }
      const initial = r !== 0 ? txt(this, p.x, p.y, (this.seats[seat].name[0] ?? '?').toLocaleUpperCase(), { size: 30, strokeThickness: 0 }).setDepth(5) : null;
      void initial;
      const name = txt(this, p.x, r === 0 ? nameY : p.y + 50, this.seats[seat].name + (this.seats[seat].bot ? ` · ${t('botTag')}` : ''), { size: 20, color: '#ffffff' }).setDepth(5);
      if (r === 0) name.setAlpha(0);
      const pts = txt(this, p.x, r === 0 ? 30 : p.y + 76, '', { size: 18, color: '#ffd23f' }).setDepth(5);
      if (r === 0) pts.setAlpha(0);
      const count = txt(this, p.x, p.y - 50, '', { size: 16, color: '#cfe9d8' }).setDepth(5);
      if (r === 0) count.setAlpha(0);
      const backs = this.add.container(p.x, p.y).setDepth(3);
      if (r !== 0) {
        // a little fan of face-down tiles behind the avatar
        for (let k = 0; k < 5; k++) {
          const b = this.add.image((k - 2) * 12, -8, 'ok-t-back').setScale(0.42).setAngle((k - 2) * 9).setAlpha(0.95);
          backs.add(b);
        }
        backs.setY(p.y - 8).setX(p.x + (r === 1 ? -58 : r === 3 ? 58 : 0)).setAngle(r === 1 ? -90 : r === 3 ? 90 : 0);
        if (r === 2) backs.setX(p.x - 90).setAngle(0);
      }
      this.seatUi.push({ ring, name, pts, count, backs });
    }
    // the corner pile I draw from glows when I may take it
    for (let r = 0; r < 4; r++) {
      const c = CORNER[r];
      const g = this.add.graphics().setDepth(0);
      g.lineStyle(2, 0xffffff, 0.15).strokeRoundedRect(c.x - TILE_W / 2 - 6, c.y - TILE_H / 2 - 6, TILE_W + 12, TILE_H + 12, 10);
    }
    const take = this.add.zone(CORNER[3].x, CORNER[3].y, TILE_W + 20, TILE_H + 20).setInteractive({ useHandCursor: true });
    take.on('pointerup', () => this.humanDraw('take'));

    this.hint = txt(this, W / 2, 412, '', { size: 24, color: '#fff3c4' }).setDepth(20);
    const by = 470;
    this.sortRunsBtn = new Button(this, 380, by, t('sortRuns'), () => this.sortRack('runs'), { width: 160, height: 52, size: 20, color: 0x2f6b4a });
    this.sortPairsBtn = new Button(this, 556, by, t('sortPairs'), () => this.sortRack('pairs'), { width: 160, height: 52, size: 20, color: 0x2f6b4a });
    this.discardBtn = new Button(this, 750, by, t('discard'), () => this.humanDiscard(), { width: 150, height: 52, size: 22, color: COLORS.red });
    this.finishBtn = new Button(this, 920, by, t('finish'), () => this.humanFinish(), { width: 160, height: 52, size: 22, color: 0xd99a1e });
    for (const b of [this.sortRunsBtn, this.sortPairsBtn, this.discardBtn, this.finishBtn]) b.setDepth(30);
    this.tweens.add({ targets: this.finishBtn, scale: 1.08, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ---------- hand flow ----------
  private startHand(): void {
    this.clearOverlay();
    this.botTimer?.remove(); this.botTimer = null;
    const seed = (this.base + this.hand * 7919) >>> 0;
    this.rand = rng(seed ^ 0x5eed);
    this.dealer = (this.startDealer + this.hand) % 4;
    const d = deal(seed, this.dealer);
    this.hands = d.hands.map((h) => [...h]);
    this.pile = [...d.pile];
    this.discards = [[], [], [], []];
    this.indicator = d.indicator;
    this.okey = d.okey;
    this.turn = this.dealer;
    this.phase = 'discard';
    this.log = [];
    this.selected = null;
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    for (const c of this.cornerImgs) c?.destroy();
    this.cornerImgs = [null, null, null, null];
    this.hud.setCenter(t('handOf', { n: this.hand + 1, m: HANDS_PER_MATCH }));
    this.indImg.setTexture(tileKey(this.tiles[this.indicator]));
    this.tweens.add({ targets: this.indImg, scale: { from: 0.4, to: 1 }, duration: 420, ease: 'Back.easeOut' });

    // my rack: deal the tiles in a sorted order, then let the player rearrange
    this.rack = new Array(SLOTS * 2).fill(null);
    const mine = this.sortedIds(this.hands[this.me], 'runs');
    mine.forEach((id, i) => {
      this.rack[i] = id;
      const p = this.slotPos(i);
      const img = this.tileSprite(id, PILE.x, PILE.y);
      this.tweens.add({ targets: img, x: p.x, y: p.y, duration: 380, delay: 30 * i, ease: 'Cubic.easeOut' });
    });
    this.sfx('shuffle', { volume: 0.5 });
    this.refresh();
    this.time.delayedCall(700, () => this.nextAction());
  }

  private tileSprite(id: number, x: number, y: number): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, tileKey(this.tiles[id])).setDepth(10).setInteractive({ useHandCursor: true, draggable: false });
    img.setData('id', id);
    this.sprites.set(id, img);
    // the okey glows gold so the player can find it
    if (faceOf(this.tiles[id], this.okey).wild) {
      img.setTint(0xffe7a0);
      const halo = this.add.image(x, y, 'ok-glow').setTint(0xffc83d).setScale(0.9).setAlpha(0.55).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: halo, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
      img.setData('halo', halo);
      img.on('destroy', () => halo.destroy());
    }
    return img;
  }

  /** Whose move it is and what they do next: bots act after a short pause, humans wait. */
  private nextAction(): void {
    if (this.phase === 'over' || this.isOver) return;
    this.refresh();
    if (this.controls(this.turn)) {
      this.botTimer?.remove();
      this.botTimer = this.time.delayedCall(Phaser.Math.Between(BOT_DELAY[0], BOT_DELAY[1]), () => this.botMove());
    }
  }

  private botMove(): void {
    if (this.phase === 'over' || !this.controls(this.turn)) return;
    const seat = this.turn;
    const hand = this.hands[seat];
    if (this.phase === 'draw') {
      const top = this.discards[this.prev(seat)].at(-1);
      if (top !== undefined && botTakesDiscard(hand, top, this.tiles, this.okey)) this.doAct({ s: seat, a: 'take', n: this.log.length });
      else if (this.pile.length) this.doAct({ s: seat, a: 'draw', n: this.log.length });
      else this.doAct({ s: seat, a: 'draw', n: this.log.length });
      return;
    }
    const fin = findFinish(hand, this.tiles, this.okey);
    if (fin) { this.doAct({ s: seat, a: 'finish', id: fin.discard, n: this.log.length }); return; }
    this.doAct({ s: seat, a: 'discard', id: botDiscard(hand, this.tiles, this.okey, this.rand), n: this.log.length });
  }

  /** Applies an action here and tells the other players. */
  private doAct(a: Act): void {
    if (!this.apply(a)) return;
    if (net.active) net.send('act', a);
  }

  /** Applies an action (local or received); false when it does not fit the table state. */
  private apply(a: Act): boolean {
    if (this.phase === 'over' || a.n !== this.log.length || a.s !== this.turn) return false;
    const seat = a.s;
    const hand = this.hands[seat];
    if (a.a === 'draw' || a.a === 'take') {
      if (this.phase !== 'draw') return false;
      let id: number | undefined;
      if (a.a === 'take') id = this.discards[this.prev(seat)].pop();
      else id = this.pile.pop();
      if (id === undefined) {
        // the centre pile ran out: the hand ends with no winner
        if (a.a === 'draw') { this.log.push(a); this.endHand(null); return true; }
        return false;
      }
      hand.push(id);
      this.log.push(a);
      this.phase = 'discard';
      this.animateDraw(seat, id, a.a === 'take' ? this.prev(seat) : null);
      this.sfx('draw', { volume: 0.45 });
      this.nextAction();
      return true;
    }
    if (this.phase !== 'discard' || a.id === undefined || !hand.includes(a.id)) return false;
    if (a.a === 'finish') {
      const rest = hand.filter((x) => x !== a.id);
      const kind = winKind(rest, this.tiles, this.okey);
      if (!kind) return false;
      hand.splice(hand.indexOf(a.id), 1);
      this.log.push(a);
      this.endHand({ seat, kind, withOkey: faceOf(this.tiles[a.id], this.okey).wild, last: a.id });
      return true;
    }
    hand.splice(hand.indexOf(a.id), 1);
    this.discards[seat].push(a.id);
    this.log.push(a);
    this.animateDiscard(seat, a.id);
    this.sfx('place', { volume: 0.5 });
    this.turn = this.next(seat);
    this.phase = 'draw';
    this.nextAction();
    return true;
  }

  // ---------- animation ----------
  private animateDraw(seat: number, id: number, fromCorner: number | null): void {
    const from = fromCorner === null ? PILE : CORNER[this.rel(fromCorner)];
    if (fromCorner !== null) this.refreshCorner(fromCorner);
    if (this.isMine(seat)) {
      const slot = this.rack.findIndex((x) => x === null);
      this.rack[slot] = id;
      const p = this.slotPos(slot);
      const img = this.tileSprite(id, from.x, from.y);
      img.setDepth(40);
      this.tweens.add({ targets: img, x: p.x, y: p.y - 16, duration: 280, ease: 'Cubic.easeOut', onComplete: () => {
        img.setDepth(10);
        this.tweens.add({ targets: img, y: p.y, duration: 160, ease: 'Bounce.easeOut' });
      } });
      this.select(id);
    } else {
      const to = SEAT_POS[this.rel(seat)];
      const ghost = this.add.image(from.x, from.y, fromCorner === null ? 'ok-t-back' : tileKey(this.tiles[id])).setDepth(40).setScale(0.8);
      this.tweens.add({ targets: ghost, x: to.x, y: to.y, scale: 0.4, alpha: 0.2, duration: 420, ease: 'Cubic.easeIn', onComplete: () => ghost.destroy() });
    }
    this.refresh();
  }

  private animateDiscard(seat: number, id: number): void {
    const r = this.rel(seat);
    const to = CORNER[r];
    let from = SEAT_POS[r];
    if (this.isMine(seat)) {
      const slot = this.rack.indexOf(id);
      if (slot >= 0) this.rack[slot] = null;
      const img = this.sprites.get(id);
      if (img) { from = { x: img.x, y: img.y }; img.destroy(); this.sprites.delete(id); }
      if (this.selected === id) this.selected = null;
    }
    const fly = this.add.image(from.x, from.y, tileKey(this.tiles[id])).setDepth(40).setScale(this.isMine(seat) ? 1 : 0.5);
    this.tweens.add({
      targets: fly, x: to.x, y: to.y, scale: 0.9, angle: Phaser.Math.Between(-8, 8), duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => { fly.destroy(); this.refreshCorner(seat); },
    });
    this.refresh();
  }

  private refreshCorner(seat: number): void {
    const r = this.rel(seat);
    const top = this.discards[seat].at(-1);
    this.cornerImgs[r]?.destroy();
    this.cornerImgs[r] = null;
    if (top === undefined) return;
    const c = CORNER[r];
    // a hint of the tiles underneath
    const img = this.add.image(c.x, c.y, tileKey(this.tiles[top])).setDepth(6).setScale(0.9).setAngle((top % 7) - 3);
    if (faceOf(this.tiles[top], this.okey).wild) img.setTint(0xfff1c4);
    this.cornerImgs[r] = img;
  }

  // ---------- my rack ----------
  private bindInput(): void {
    this.input.on('gameobjectdown', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const id = obj.getData?.('id') as number | undefined;
      if (id === undefined || !this.rack.includes(id)) return;
      const img = obj as Phaser.GameObjects.Image;
      this.drag = { id, dx: img.x - p.x, dy: img.y - p.y, moved: false };
      img.setDepth(50);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      const img = this.sprites.get(d.id);
      if (!img) return;
      if (!d.moved && Phaser.Math.Distance.Between(p.downX, p.downY, p.x, p.y) < 8) return;
      d.moved = true;
      img.setPosition(p.x + d.dx, p.y + d.dy);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const img = this.sprites.get(d.id);
      if (!img) return;
      img.setDepth(10);
      if (!d.moved) { this.select(this.selected === d.id ? null : d.id); this.layoutRack(); return; }
      // dropped on my discard corner: throw it; on the centre: finish with it
      const myCorner = CORNER[0];
      if (Phaser.Math.Distance.Between(p.x, p.y, myCorner.x, myCorner.y) < 70 && this.canDiscard()) { this.select(d.id); this.humanDiscard(); return; }
      if (Phaser.Math.Distance.Between(p.x, p.y, PILE.x, PILE.y) < 70 && this.canDiscard()) { this.select(d.id); this.humanFinish(); return; }
      // otherwise: move it to the nearest slot (swapping with a tile there)
      const slot = this.nearestSlot(img.x, img.y);
      const from = this.rack.indexOf(d.id);
      if (slot >= 0 && from >= 0 && slot !== from) {
        const other = this.rack[slot];
        this.rack[slot] = d.id;
        this.rack[from] = other;
        this.sfx('slide', { volume: 0.3 });
      }
      this.layoutRack();
      this.refresh();
    });
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  private nearestSlot(x: number, y: number): number {
    const row = Math.abs(y - ROW_Y[0]) < Math.abs(y - ROW_Y[1]) ? 0 : 1;
    const col = Phaser.Math.Clamp(Math.round((x - RACK_X0) / SLOT), 0, SLOTS - 1);
    if (y < ROW_Y[0] - 90) return -1;
    return row * SLOTS + col;
  }

  private layoutRack(): void {
    this.rack.forEach((id, i) => {
      if (id === null) return;
      const img = this.sprites.get(id);
      if (!img) return;
      const p = this.slotPos(i);
      const lift = this.selected === id ? -18 : 0;
      this.tweens.add({ targets: img, x: p.x, y: p.y + lift, duration: 140, ease: 'Quad.easeOut' });
    });
  }

  private select(id: number | null): void {
    this.selected = id;
    this.layoutRack();
    this.refresh();
  }

  private sortedIds(ids: number[], how: 'runs' | 'pairs'): number[] {
    const face = (id: number) => faceOf(this.tiles[id], this.okey);
    if (how === 'pairs') {
      return [...ids].sort((a, b) => {
        const fa = face(a), fb = face(b);
        return Number(fa.wild) - Number(fb.wild) || fa.num - fb.num || fa.color - fb.color;
      });
    }
    // groups first (as the analyser finds them), then loose tiles by colour and number
    const a = analyse(ids, this.tiles, this.okey);
    const loose = [...a.loose].sort((x, y) => face(x).color - face(y).color || face(x).num - face(y).num);
    const out: number[] = [];
    for (const g of a.groups) out.push(...g);
    return [...out, ...loose];
  }

  private sortRack(how: 'runs' | 'pairs'): void {
    const ids = this.rack.filter((x): x is number => x !== null);
    const sorted = this.sortedIds(ids, how);
    this.rack = new Array(SLOTS * 2).fill(null);
    // groups go on the top shelf with a gap between them; the rest below
    if (how === 'runs') {
      const a = analyse(ids, this.tiles, this.okey);
      let i = 0;
      for (const g of a.groups) {
        if (i + g.length > SLOTS) i = SLOTS;
        for (const id of g) this.rack[i++] = id;
        if (i < SLOTS) i++;
      }
      let j = Math.max(i, SLOTS);
      const loose = sorted.filter((id) => !a.groups.some((g) => g.includes(id)));
      for (const id of loose) { while (this.rack[j] !== null && j < SLOTS * 2) j++; this.rack[j++] = id; }
    } else {
      sorted.forEach((id, i) => { this.rack[i + Math.floor(i / 2) - (i >= 18 ? 0 : 0)] = id; });
      // keep inside the rack
      const flat = this.rack.filter((x) => x !== null) as number[];
      if (this.rack.lastIndexOf(flat[flat.length - 1]) >= SLOTS * 2) { this.rack = new Array(SLOTS * 2).fill(null); sorted.forEach((id, i) => { this.rack[i] = id; }); }
    }
    this.sfx('slide', { volume: 0.35 });
    this.layoutRack();
  }

  private canDiscard(): boolean {
    return !this.isOver && this.phase === 'discard' && this.turn === this.me && this.hands[this.me].length === 15;
  }

  private humanDraw(kind: 'draw' | 'take'): void {
    if (this.isOver || this.phase !== 'draw' || this.turn !== this.me) return;
    if (kind === 'take' && this.discards[this.prev(this.me)].length === 0) return;
    this.doAct({ s: this.me, a: kind, n: this.log.length });
  }

  private humanDiscard(): void {
    if (!this.canDiscard() || this.selected === null) {
      if (this.canDiscard()) this.flashHint(t('pickTile'));
      return;
    }
    this.doAct({ s: this.me, a: 'discard', id: this.selected, n: this.log.length });
  }

  private humanFinish(): void {
    if (!this.canDiscard()) return;
    const hand = this.hands[this.me];
    let id = this.selected;
    if (id === null || !winKind(hand.filter((x) => x !== id), this.tiles, this.okey)) {
      const fin = findFinish(hand, this.tiles, this.okey);
      if (!fin) { this.flashHint(t('cantFinish')); this.sfx('bad', { volume: 0.4 }); return; }
      id = fin.discard;
    }
    this.doAct({ s: this.me, a: 'finish', id, n: this.log.length });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver) return;
    const ids = this.rack.map((x, i) => [x, i] as const).filter(([x]) => x !== null);
    const cur = this.selected === null ? -1 : ids.findIndex(([x]) => x === this.selected);
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const dir = e.code === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey && this.selected !== null) {
        const from = this.rack.indexOf(this.selected);
        const to = Phaser.Math.Clamp(from + dir, 0, SLOTS * 2 - 1);
        [this.rack[from], this.rack[to]] = [this.rack[to], this.rack[from]];
        this.layoutRack();
        return;
      }
      const n = ids.length;
      if (!n) return;
      const k = cur < 0 ? 0 : (cur + dir + n) % n;
      this.select(ids[k][0]);
    } else if (e.code === 'Digit1' || e.code === 'KeyQ') this.humanDraw('draw');
    else if (e.code === 'Digit2' || e.code === 'KeyW') this.humanDraw('take');
    else if (e.code === 'Space' || e.code === 'Enter') {
      if (this.phase === 'draw') this.humanDraw('draw');
      else this.humanDiscard();
    } else if (e.code === 'KeyF') this.humanFinish();
    else if (e.code === 'KeyS') this.sortRack('runs');
    else if (e.code === 'KeyD') this.sortRack('pairs');
  }

  // ---------- state display ----------
  private refresh(): void {
    this.pileText.setText(t('left', { n: this.pile.length }));
    this.pileImg.setVisible(this.pile.length > 0);
    for (let seat = 0; seat < 4; seat++) {
      const ui = this.seatUi[this.rel(seat)];
      const active = seat === this.turn && this.phase !== 'over';
      ui.ring.setAlpha(active && seat !== this.me ? 1 : 0);
      ui.pts.setText(t('pts', { n: this.scores[seat] }));
      ui.count.setText(seat === this.me ? '' : String(this.hands[seat]?.length ?? 0));
      ui.name.setColor(this.away.has(seat) ? '#9aa4b2' : '#ffffff');
    }
    if (this.seatUi[1] && !this.tweens.isTweening(this.seatUi[1].ring)) {
      for (const ui of this.seatUi) this.tweens.add({ targets: ui.ring, scale: { from: 0.58, to: 0.68 }, duration: 600, yoyo: true, repeat: -1 });
    }
    const myTurn = this.turn === this.me && this.phase !== 'over';
    const fin = myTurn && this.phase === 'discard' ? findFinish(this.hands[this.me], this.tiles, this.okey) : null;
    this.finishBtn.setVisible(!!fin);
    this.discardBtn.setVisible(myTurn && this.phase === 'discard').setAlpha(this.selected === null ? 0.55 : 1);
    if (this.phase === 'over') this.hint.setText('');
    else if (myTurn) this.hint.setText(this.phase === 'draw' ? t('yourDraw') : fin ? t('canFinish') : t('yourDiscard')).setColor('#fff3c4');
    else this.hint.setText(t('waitingFor', { name: this.seats[this.turn].name })).setColor('#cfe9d8');
    // the pile I may take from glows on my draw
    const takeTop = this.cornerImgs[3];
    if (takeTop) takeTop.setScale(myTurn && this.phase === 'draw' ? 1 : 0.9);
    this.hud.setScore(this.scores[this.me] * 100);
  }

  private flashHint(s: string): void {
    this.hint.setText(s).setColor('#ff8a7a');
    this.tweens.add({ targets: this.hint, scale: { from: 1.15, to: 1 }, duration: 220 });
  }

  // ---------- hand end ----------
  private endHand(win: { seat: number; kind: WinKind; withOkey: boolean; last: number } | null): void {
    this.phase = 'over';
    this.botTimer?.remove();
    this.refresh();
    const { width, height } = this.scale;
    const ov: Phaser.GameObjects.GameObject[] = [];
    ov.push(this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setDepth(100));
    const panel = this.add.graphics().setDepth(101);
    panel.fillStyle(0x10281b, 0.96).fillRoundedRect(140, 120, 1000, 470, 26);
    panel.lineStyle(3, 0xffd23f, 0.8).strokeRoundedRect(140, 120, 1000, 470, 26);
    ov.push(panel);
    let title: string, color: string;
    if (!win) { title = t('pileOut'); color = '#cfe9d8'; }
    else {
      const pts = handPoints(win.kind, win.withOkey);
      this.scores[win.seat] += pts;
      const who = win.seat === this.me ? t('you') : this.seats[win.seat].name;
      title = t('handWon', { name: who });
      color = win.seat === this.me ? '#5dff7a' : '#ffd23f';
      const how = [win.kind === 'pairs' ? t('withPairs') : t('normalWin'), win.withOkey ? t('withOkey') : ''].filter(Boolean).join(' · ');
      ov.push(txt(this, W / 2, 238, `${how}  +${pts}`, { size: 26, color: '#fff3c4' }).setDepth(102));
      // the winning hand, grouped
      const hand = this.hands[win.seat];
      const a = analyse(hand, this.tiles, this.okey);
      const order = win.kind === 'pairs' ? this.sortedIds(hand, 'pairs') : [...a.groups.flat(), ...a.loose];
      const gap = win.kind === 'pairs' ? 2 : 0;
      let x = W / 2 - ((order.length + (win.kind === 'pairs' ? 6 : a.groups.length - 1)) * 58) / 2 + 29;
      let k = 0;
      const groupEnds = new Set<number>();
      let acc = 0;
      for (const g of a.groups) { acc += g.length; groupEnds.add(acc - 1); }
      order.forEach((id, i) => {
        const img = this.add.image(x, 330, tileKey(this.tiles[id])).setScale(0.82).setDepth(102).setAlpha(0);
        if (faceOf(this.tiles[id], this.okey).wild) img.setTint(0xfff1c4);
        this.tweens.add({ targets: img, alpha: 1, y: { from: 300, to: 330 }, delay: 40 * k++, duration: 260, ease: 'Back.easeOut' });
        ov.push(img);
        x += 58;
        if ((win.kind === 'pairs' && i % 2 === 1) || (win.kind !== 'pairs' && groupEnds.has(i))) x += 22 + gap;
      });
      const last = this.add.image(W / 2, 430, tileKey(this.tiles[win.last])).setScale(0.9).setDepth(102);
      ov.push(last, txt(this, W / 2 + 70, 430, t('lastTile'), { size: 18, color: '#cfe9d8' }).setOrigin(0, 0.5).setDepth(102));
      if (win.seat === this.me) {
        burst(this, W / 2, 200, [0xffd23f, 0x5dff7a, 0xffffff], 50, 420);
        popup(this, W / 2, 180, `+${pts * 100}`, '#ffd23f', 34);
      }
      this.sfx(win.seat === this.me ? 'win' : 'chips', { volume: 0.6 });
    }
    ov.push(txt(this, W / 2, 180, title, { title: true, size: 38, color }).setDepth(102));
    // scores
    const standings = [0, 1, 2, 3].map((s) => `${s === this.me ? t('you') : this.seats[s].name}: ${this.scores[s]}`).join('   ');
    ov.push(txt(this, W / 2, 500, standings, { size: 22, color: '#ffffff', wrap: 940 }).setDepth(102));
    this.overlay = ov;
    this.refresh();

    const last = this.hand + 1 >= HANDS_PER_MATCH;
    const proceed = () => {
      if (last) this.finishMatch();
      else { this.hand++; this.startHand(); }
    };
    if (!net.active || net.isHost) {
      const btn = new Button(this, W / 2, 556, last ? t('results') : t('nextHand'), () => {
        if (net.active) net.send('next', { hand: this.hand + 1, last });
        proceed();
      }, { width: 280, height: 64, size: 24, color: COLORS.red });
      btn.setDepth(103);
      ov.push(btn);
      this.input.keyboard?.once('keydown-ENTER', () => { if (btn.active) btn.press(); });
    } else {
      ov.push(txt(this, W / 2, 556, t('waitHostHand'), { size: 22, color: '#cfe9d8' }).setDepth(102));
    }
  }

  private clearOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  private finishMatch(): void {
    this.clearOverlay();
    const best = Math.max(...this.scores);
    const win = this.scores[this.me] === best && this.scores.filter((s) => s === best).length === 1;
    const winners = [0, 1, 2, 3].filter((s) => this.scores[s] === best).map((s) => (s === this.me ? t('you') : this.seats[s].name));
    this.score = this.scores[this.me] * 100;
    this.hud.setScore(this.score);
    this.endGame({ win, title: win ? t('matchWon') : best === 0 ? t('noWinner') : t('matchWonBy', { name: winners.join(', ') }), delay: 300 });
  }

  // ---------- online ----------
  private bindNet(): void {
    if (!net.active) return;
    net.onScene(this, 'act', (a: Act) => {
      if (!a || typeof a.s !== 'number') return;
      this.apply(a);
    });
    net.onScene(this, 'next', (d: { hand: number; last: boolean }) => {
      if (net.isHost || !d) return;
      if (d.last) this.finishMatch();
      else { this.hand = d.hand; this.startHand(); }
    });
    // the host answers a player who came back with the whole table so far
    net.onScene(this, 'hello', (_d: unknown, from: number) => {
      if (!net.isHost) return;
      this.away.delete(from);
      net.send('sync', { seat: from, base: this.base, hand: this.hand, startDealer: this.startDealer, scores: this.scores, log: this.log } satisfies SyncData);
      this.refresh();
    });
    net.onScene(this, 'sync', (d: SyncData) => {
      if (!d || d.seat !== this.me) return;
      this.applySync(d);
    });
  }

  protected onSeatLeave(seat: number): void {
    this.away.add(seat);
    this.refresh();
    // the host plays the empty seat until its player comes back
    if (net.isHost && this.turn === seat) this.nextAction();
  }

  protected onSeatJoin(seat: number): void {
    // their game starts over and says "hello"; until then the host keeps playing the seat
    this.refresh();
    void seat;
  }

  /** Replays the host's table: the same seed and the same actions. */
  private applySync(d: SyncData): void {
    this.base = d.base;
    this.startDealer = d.startDealer;
    this.hand = d.hand;
    this.scores = [...d.scores];
    this.startHand();
    this.botTimer?.remove();
    for (const a of d.log) this.apply(a);
    this.layoutRack();
    this.refresh();
  }

  updateGame(): void {
    // turn-based: everything runs on events; only the okey's glow follows its tile
    for (const img of this.sprites.values()) {
      const halo = img.getData('halo') as Phaser.GameObjects.Image | undefined;
      if (halo) halo.setPosition(img.x, img.y);
    }
  }
}
