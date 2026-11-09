import Phaser from 'phaser';
import {
  ArcadeScene, Button, burst, flash, shake, net, t, txt, popup, COLORS, upper, currentGame,
  quickChat, isModalOpen, openPlayerCard, isPlayerCardOpen, portraitKey, avatar, lifetimeRows, recordMatch,
  playerCharacter, peerCharacter, otherCharacters, isCharacterId, isEasy,
  type QuickChat, type CharacterId,
} from '@core';
import {
  analyse, botDiscard, botTakesDiscard, deal, faceOf, findFinish, makeTiles, rng, winKind, BOT_EASY, BOT_NORMAL,
  type BotSkill, type Finish, type Tile, type WinKind,
} from './logic';
import { TILE_H, TILE_W, makeRack, makeTable, makeTiles as makeTileArt, tileKey } from './art';

// ---------- layout (landscape 1280 × 720) ----------
const W = 1280;
const SLOT = 76;
const SLOTS = 14;                       // per rack row
const ROW_Y = [566, 660];
const RACK_X0 = W / 2 - (SLOTS * SLOT) / 2 + SLOT / 2;
const PILE = { x: 586, y: 296 };
const IND = { x: 694, y: 296 };
const MID = { x: 640, y: 296 };
/** Where each relative seat sits: 0 me (bottom), 1 right, 2 top, 3 left. */
const SEAT_POS = [{ x: 640, y: 520 }, { x: 1180, y: 282 }, { x: 640, y: 128 }, { x: 100, y: 282 }];
/** Discard corner between relative seat r and the next one. */
const CORNER = [{ x: 1086, y: 440 }, { x: 1086, y: 176 }, { x: 194, y: 176 }, { x: 194, y: 440 }];
/** Seat colours by relative seat (me, right, top, left): avatar rings, HUD chips, cards. */
const SEAT_COL = [0x3ec7e6, 0xff7a6b, 0xffc83d, 0xb18cff];
const SEAT_HEX = ['#3ec7e6', '#ff7a6b', '#ffc83d', '#b18cff'];
const AVATAR = 78;
const HUD_Y = 36;
/** HUD chips in turn order from me: me, right, top, left (play passes to the right). */
const CHIP_W = 162;
const CHIP_X = [640 - 78 - 8 - CHIP_W * 1.5, 640 - 78 - CHIP_W / 2, 640 + 78 + CHIP_W / 2, 640 + 78 + 8 + CHIP_W * 1.5];
const PILL = { x: CHIP_X[0] - CHIP_W / 2 - 12, w: (CHIP_X[3] - CHIP_X[0]) + CHIP_W + 24 };
const HANDS_PER_MATCH = 5;
const BOT_DELAY = [650, 1150];
/** Online: a human's turn; when it runs out their own game plays the turn for them. */
const TURN_MS = 30000;
/** Solo: after this long a bot may ask the player to hurry. */
const SLOW_MS = 22000;

type Act = { s: number; a: 'draw' | 'take' | 'discard' | 'finish'; id?: number; n: number };
type Phase = 'draw' | 'discard' | 'over';

/** A table that a re-joining player receives from the host (set by the menu, read by Play). */
export let pendingSync: SyncData | null = null;
export function setPendingSync(s: SyncData | null): void { pendingSync = s; }
export interface SyncData { seat: number; base: number; hand: number; startDealer: number; scores: number[]; log: Act[]; stats?: SeatStats[] }

interface Seat { name: string; bot: boolean; character: CharacterId | null; portrait: string }
interface SeatStats { won: number; okey: number; pairs: number; streak: number }
interface SeatUi {
  avatar: Phaser.GameObjects.Container;
  plate: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  countBg: Phaser.GameObjects.Graphics;
  backs: Phaser.GameObjects.Container;
}
interface Chip { name: Phaser.GameObjects.Text; pts: Phaser.GameObjects.Text }

const newStats = (): SeatStats[] => [0, 1, 2, 3].map(() => ({ won: 0, okey: 0, pairs: 0, streak: 0 }));

export class PlayScene extends ArcadeScene {
  protected useHud = false;
  private tiles: Tile[] = [];
  private seats: Seat[] = [];
  private me = 0;
  private base = 0;
  private hand = 0;
  private startDealer = 0;
  private scores = [0, 0, 0, 0];
  private stats: SeatStats[] = newStats();
  private handStart: { scores: number[]; stats: SeatStats[] } = { scores: [0, 0, 0, 0], stats: newStats() };
  private lastGain = [0, 0, 0, 0];
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
  private easy = false;
  private turnSeat = -1;
  private turnStarted = 0;
  private autoAt = 0;
  private lastTick = 0;
  private slowSaid = false;
  private endToken = 0;
  private finCache: { key: string; fin: Finish | null } = { key: '', fin: null };
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
  private cornerUnder: (Phaser.GameObjects.Image | null)[] = [null, null, null, null];
  private seatUi: SeatUi[] = [];
  private chips: Chip[] = [];
  private hudG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private handText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hintBg!: Phaser.GameObjects.Graphics;
  private rackGlow!: Phaser.GameObjects.Graphics;
  private sortRunsBtn!: Button;
  private sortPairsBtn!: Button;
  private discardBtn!: Button;
  private finishBtn!: Button;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private chat!: QuickChat;

  createGame(): void {
    this.tiles = makeTiles();
    this.easy = isEasy();
    makeTileArt(this, '"Fredoka", "Nunito", sans-serif');
    this.add.image(0, 0, makeTable(this, W, 720)).setOrigin(0).setDepth(-10);
    this.add.image(W / 2, (ROW_Y[0] + ROW_Y[1]) / 2 + 2, makeRack(this, SLOTS * SLOT + 36, 196)).setDepth(-5);

    // seats: the platform's table (protocol 2.3), a two-player room, or me and three bots
    const mine = playerCharacter();
    if (net.isTable) {
      this.me = net.playerIndex;
      this.seats = net.seats.map((s, i) => ({
        name: s.name, bot: s.bot,
        character: i === this.me ? (isCharacterId(s.character) ? s.character : mine) : isCharacterId(s.character) ? s.character : null,
        portrait: '',
      }));
      this.base = net.seed || 1;
    } else if (net.active) {
      this.me = net.seat;
      const peer = { name: net.peerName || t('opponent'), bot: false, character: peerCharacter(), portrait: '' };
      const self = { name: t('you'), bot: false, character: mine, portrait: '' };
      this.seats = net.seat === 0 ? [self, peer] : [peer, self];
      this.base = net.seed || 1;
    } else {
      this.seats = [{ name: t('you'), bot: false, character: mine, portrait: '' }];
      this.me = 0;
      this.base = Math.floor(Math.random() * 2 ** 31);
    }
    while (this.seats.length < 4) this.seats.push({ name: t(`bot${this.seats.length - 1}`), bot: true, character: null, portrait: '' });
    // portraits: a chosen character; bots get the characters nobody chose, in seat order (the same
    // on every screen); a player without a character gets an initial
    const spare = otherCharacters(...this.seats.map((s) => s.character).filter((c): c is CharacterId => !!c));
    if (!spare.length) spare.push(...otherCharacters());
    let k = 0;
    this.seats.forEach((s, seat) => {
      const look = s.character ?? (s.bot ? spare[k++ % spare.length] : null);
      s.portrait = look ? portraitKey(this, `ch-${look}-front`, SEAT_COL[this.rel(seat)]) : '';
    });
    this.startDealer = this.base % 4;
    this.scores = [0, 0, 0, 0];
    this.stats = newStats();
    this.lastGain = [0, 0, 0, 0];
    this.hand = 0;
    this.away = new Set();
    this.overlay = [];
    this.endToken = 0;
    this.turnSeat = -1;
    this.finCache = { key: '', fin: null };
    this.sprites = new Map();
    this.cornerImgs = [null, null, null, null];
    this.cornerUnder = [null, null, null, null];
    this.selected = null;
    this.drag = null;

    this.buildTable();
    this.buildHud();
    this.bindInput();
    this.bindNet();
    this.chat = quickChat(this, {
      button: { x: 62, y: 58, size: 80 },
      mySeat: () => this.me,
      bots: () => [0, 1, 2, 3].filter((s) => s !== this.me && this.seats[s].bot),
      seatAnchor: (seat) => this.seatAnchor(seat),
    });

    const sync = pendingSync && pendingSync.seat === this.me ? pendingSync : null;
    setPendingSync(null);
    if (sync) this.applySync(sync);
    else this.startHand();
    // a friendly hello from one of the bots, now and then
    if (!net.active) this.time.delayedCall(1600, () => this.chat.botSay(1 + Math.floor(Math.random() * 3), 'hello', 0.4));
  }

  // ---------- helpers ----------
  private rel(seat: number): number { return (seat - this.me + 4) % 4; }
  private next(seat: number): number { return (seat + 1) % 4; }
  private prev(seat: number): number { return (seat + 3) % 4; }
  private isMine(seat: number): boolean { return seat === this.me; }
  private nameOf(seat: number): string { return seat === this.me ? t('you') : this.seats[seat].name; }
  /** Seats this game plays: bots and away players on the host (or solo) side. */
  private controls(seat: number): boolean {
    if (seat === this.me) return false;
    if (!net.active) return true;
    return net.isHost && (this.seats[seat].bot || this.away.has(seat));
  }
  private isHuman(seat: number): boolean { return !this.seats[seat].bot && !this.away.has(seat); }
  private slotPos(i: number): { x: number; y: number } {
    return { x: RACK_X0 + (i % SLOTS) * SLOT, y: ROW_Y[Math.floor(i / SLOTS)] };
  }
  private seatAnchor(seat: number): { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' } {
    const r = this.rel(seat);
    if (r === 0) return { x: 640, y: 506, dir: 'up' };
    if (r === 2) return { x: SEAT_POS[2].x + 44, y: SEAT_POS[2].y, dir: 'right' };
    return { x: SEAT_POS[r].x, y: SEAT_POS[r].y - 44, dir: 'up' };
  }
  /** My best finish right now (cached per hand). */
  private myFinish(): Finish | null {
    const hand = this.hands[this.me] ?? [];
    const key = `${this.okey.color}:${this.okey.num}|${[...hand].sort((a, b) => a - b).join(',')}`;
    if (this.finCache.key !== key) this.finCache = { key, fin: hand.length === 15 ? findFinish(hand, this.tiles, this.okey) : null };
    return this.finCache.fin;
  }

  // ---------- table ----------
  private buildTable(): void {
    // centre pile and indicator
    for (let i = 0; i < 4; i++) this.add.image(PILE.x - i * 1.5, PILE.y - i * 2.5, 'ok-t-back').setDepth(1);
    this.pileImg = this.add.image(PILE.x - 6, PILE.y - 10, 'ok-t-back').setDepth(2).setInteractive({ useHandCursor: true });
    this.pileText = txt(this, PILE.x - 4, PILE.y + 64, '', { size: 22, color: '#f3f2f2' }).setDepth(3);
    this.indImg = this.add.image(IND.x, IND.y, 'ok-t-back').setDepth(2).setAngle(8);
    txt(this, IND.x + 4, IND.y + 64, t('indicator'), { size: 22, color: '#ffe8a3' }).setDepth(3);
    this.pileImg.on('pointerup', () => this.humanDraw('draw'));

    // seats around the table (I sit at the rack)
    this.seatUi = [];
    for (let r = 0; r < 4; r++) {
      const seat = (this.me + r) % 4;
      const p = SEAT_POS[r];
      const s = this.seats[seat];
      const backs = this.add.container(p.x, p.y).setDepth(3);
      const av = avatar(this, p.x, p.y, AVATAR, { portrait: s.portrait, color: SEAT_COL[r], name: s.name, ring: SEAT_COL[r] }).setDepth(5);
      const plate = this.add.graphics().setDepth(5);
      const name = txt(this, p.x, p.y + 64, '', { size: 22, color: '#ffffff' }).setDepth(6);
      const countBg = this.add.graphics().setDepth(6);
      const count = txt(this, p.x + 34, p.y - 32, '', { size: 18, color: '#1b1d2e', strokeThickness: 0, shadow: false }).setDepth(7);
      if (r === 0) { av.setVisible(false); name.setVisible(false); count.setVisible(false); }
      else {
        // a little fan of face-down tiles beside the avatar
        for (let k = 0; k < 5; k++) backs.add(this.add.image((k - 2) * 12, -8, 'ok-t-back').setScale(0.42).setAngle((k - 2) * 9).setAlpha(0.95));
        if (r === 1) backs.setPosition(p.x - 70, p.y + 4).setAngle(-90);
        else if (r === 3) backs.setPosition(p.x + 70, p.y + 4).setAngle(90);
        else backs.setPosition(p.x - 110, p.y + 4);
        name.setText(s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name);
        const w = name.width + (s.bot ? 64 : 28);
        plate.fillStyle(0x0b1020, 0.62).fillRoundedRect(p.x - w / 2, p.y + 48, w, 34, 17);
        if (s.bot) {
          name.setX(p.x - 18);
          plate.fillStyle(0x3b6bd6, 1).fillRoundedRect(p.x + w / 2 - 50, p.y + 54, 42, 22, 11);
          txt(this, p.x + w / 2 - 29, p.y + 65, t('botTag'), { size: 14, color: '#ffffff', strokeThickness: 0, shadow: false }).setDepth(6);
        }
        // tap the seat for the player's card
        const zone = this.add.zone(p.x, p.y + 18, 150, 140).setInteractive({ useHandCursor: true }).setDepth(8);
        zone.on('pointerup', () => this.openCard(seat));
      }
      this.seatUi.push({ avatar: av, plate, name, count, countBg, backs });
    }
    // the discard corners
    for (let r = 0; r < 4; r++) {
      const c = CORNER[r];
      const g = this.add.graphics().setDepth(0);
      g.lineStyle(2, SEAT_COL[r], 0.28).strokeRoundedRect(c.x - TILE_W / 2 - 6, c.y - TILE_H / 2 - 6, TILE_W + 12, TILE_H + 12, 10);
    }
    const take = this.add.zone(CORNER[3].x, CORNER[3].y, TILE_W + 30, TILE_H + 30).setInteractive({ useHandCursor: true });
    take.on('pointerup', () => this.humanDraw('take'));

    this.fxG = this.add.graphics().setDepth(4);
    this.rackGlow = this.add.graphics().setDepth(-4);
    this.hintBg = this.add.graphics().setDepth(19);
    this.hint = txt(this, W / 2, 398, '', { size: 25, color: '#fff3c4' }).setDepth(20);
    const by = 462;
    const opt = (color: number, size = 22) => ({ width: 170, height: 66, size, color });
    this.sortRunsBtn = new Button(this, 378, by, t('sortRuns'), () => this.sortRack('runs'), opt(0x2f6b4a, 21));
    this.sortPairsBtn = new Button(this, 560, by, t('sortPairs'), () => this.sortRack('pairs'), opt(0x2f6b4a, 21));
    this.discardBtn = new Button(this, 742, by, t('discard'), () => this.humanDiscard(), opt(COLORS.red, 24));
    this.finishBtn = new Button(this, 924, by, t('finish'), () => this.humanFinish(), opt(0xd99a1e, 24));
    for (const b of [this.sortRunsBtn, this.sortPairsBtn, this.discardBtn, this.finishBtn]) b.setDepth(30);
    this.tweens.add({ targets: this.finishBtn, scale: 1.08, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** The scoreboard pill at the top: a chip per player in turn order, the hand in the middle. */
  private buildHud(): void {
    this.hudG = this.add.graphics().setDepth(9000);
    this.handText = txt(this, W / 2, HUD_Y, '', { title: true, size: 24, color: '#ffffff' }).setDepth(9002);
    this.chips = [];
    for (let r = 0; r < 4; r++) {
      const seat = (this.me + r) % 4;
      const x = CHIP_X[r];
      const label = r === 0 ? t('you') : this.seats[seat].name;
      const name = txt(this, x - CHIP_W / 2 + 30, HUD_Y, label.length > 9 ? label.slice(0, 8) + '…' : label, { title: true, size: 22, color: SEAT_HEX[r] }).setOrigin(0, 0.5).setDepth(9002);
      // long names shrink to fit between the dot and the points badge
      const room = CHIP_W - 30 - 48;
      if (name.width > room) name.setScale(room / name.width);
      const pts = txt(this, x + CHIP_W / 2 - 24, HUD_Y, '0', { title: true, size: 21, color: '#1b1d2e', strokeThickness: 0, shadow: false }).setDepth(9003);
      const zone = this.add.zone(x, HUD_Y, CHIP_W, 52).setInteractive({ useHandCursor: true }).setDepth(9004);
      zone.on('pointerup', () => this.openCard(seat));
      this.chips.push({ name, pts });
    }
  }

  private drawHud(): void {
    const g = this.hudG;
    g.clear();
    g.fillStyle(0x0b1020, 0.66).fillRoundedRect(PILL.x, HUD_Y - 28, PILL.w, 56, 28);
    g.lineStyle(2, 0xffffff, 0.1).strokeRoundedRect(PILL.x, HUD_Y - 28, PILL.w, 56, 28);
    const leader = Math.max(...this.scores);
    for (let r = 0; r < 4; r++) {
      const seat = (this.me + r) % 4;
      const x = CHIP_X[r];
      const active = seat === this.turn && this.phase !== 'over';
      if (active) {
        g.fillStyle(SEAT_COL[r], 0.26).fillRoundedRect(x - CHIP_W / 2, HUD_Y - 22, CHIP_W, 44, 22);
        g.lineStyle(2, SEAT_COL[r], 0.95).strokeRoundedRect(x - CHIP_W / 2, HUD_Y - 22, CHIP_W, 44, 22);
      }
      g.fillStyle(this.away.has(seat) ? 0x6b7280 : SEAT_COL[r], 1).fillCircle(x - CHIP_W / 2 + 16, HUD_Y, 7);
      // points in a badge; the leader's is gold
      const lead = leader > 0 && this.scores[seat] === leader;
      g.fillStyle(lead ? 0xffd23f : 0xe9edf7, 1).fillCircle(x + CHIP_W / 2 - 24, HUD_Y, 17);
      this.chips[r].pts.setText(String(this.scores[seat]));
      this.chips[r].name.setAlpha(this.away.has(seat) ? 0.5 : 1);
    }
    this.handText.setText(t('handOf', { n: this.hand + 1, m: HANDS_PER_MATCH }));
  }

  // ---------- hand flow ----------
  private startHand(): void {
    this.clearOverlay();
    this.endToken++;
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
    this.turnSeat = -1;
    this.slowSaid = false;
    this.handStart = { scores: [...this.scores], stats: this.stats.map((s) => ({ ...s })) };
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    for (const c of [...this.cornerImgs, ...this.cornerUnder]) c?.destroy();
    this.cornerImgs = [null, null, null, null];
    this.cornerUnder = [null, null, null, null];
    this.indImg.setTexture(tileKey(this.tiles[this.indicator]));
    this.tweens.add({ targets: this.indImg, scale: { from: 0.4, to: 1 }, duration: 420, ease: 'Back.easeOut' });

    // my rack: deal the tiles in a sorted order, then let the player rearrange
    this.rack = new Array(SLOTS * 2).fill(null);
    const mine = this.sortedIds(this.hands[this.me], 'runs');
    mine.forEach((id, i) => {
      this.rack[i] = id;
      const p = this.slotPos(i);
      const img = this.tileSprite(id, PILE.x, PILE.y);
      img.setScale(0.6).setAlpha(0);
      this.tweens.add({ targets: img, x: p.x, y: p.y, scale: 1, alpha: 1, duration: 380, delay: 30 * i, ease: 'Cubic.easeOut' });
    });
    // the others' fans slide in
    for (let r = 1; r < 4; r++) this.tweens.add({ targets: this.seatUi[r].backs, alpha: { from: 0, to: 1 }, duration: 500, delay: 120 * r });
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
    if (this.turn !== this.turnSeat) {
      // a new turn: restart the clock, and tell me when it is mine
      this.turnSeat = this.turn;
      this.turnStarted = this.time.now;
      this.autoAt = 0;
      this.lastTick = 0;
      if (this.turn === this.me) this.myTurnCue();
    }
    this.refresh();
    if (this.controls(this.turn)) {
      this.botTimer?.remove();
      this.botTimer = this.time.delayedCall(Phaser.Math.Between(BOT_DELAY[0], BOT_DELAY[1]), () => this.botMove());
    }
  }

  private myTurnCue(): void {
    this.sfx('turn', { volume: 0.5, exact: true });
    const cue = txt(this, W / 2, 506, t('yourTurn'), { title: true, size: 44, color: '#ffd23f' }).setDepth(60).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: cue, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: cue, alpha: 0, y: 470, delay: 750, duration: 380, onComplete: () => cue.destroy() });
  }

  /** How the bots play: Easy bots (solo practice) are weaker; online is always Normal. */
  ai(): BotSkill {
    return this.easy ? BOT_EASY : BOT_NORMAL;
  }

  private botMove(): void {
    if (this.phase === 'over' || !this.controls(this.turn)) return;
    const seat = this.turn;
    const hand = this.hands[seat];
    const skill = this.ai();
    if (this.phase === 'draw') {
      const top = this.discards[this.prev(seat)].at(-1);
      if (top !== undefined && botTakesDiscard(hand, top, this.tiles, this.okey, skill, this.rand)) this.doAct({ s: seat, a: 'take', n: this.log.length });
      else this.doAct({ s: seat, a: 'draw', n: this.log.length });
      return;
    }
    // findFinish scores every finish, so a spare okey is always the tile thrown; an Easy bot
    // mostly passes up that finish and plays on (the okey then usually ends in a plain finish)
    const fin = findFinish(hand, this.tiles, this.okey);
    const passUp = fin?.withOkey && skill.okeyFinish < 1 && this.rand() >= skill.okeyFinish;
    if (fin && !passUp) { this.doAct({ s: seat, a: 'finish', id: fin.discard, n: this.log.length }); return; }
    this.doAct({ s: seat, a: 'discard', id: botDiscard(hand, this.tiles, this.okey, this.rand, skill), n: this.log.length });
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
      this.nextAction();
      return true;
    }
    if (this.phase !== 'discard' || a.id === undefined || !hand.includes(a.id)) return false;
    if (a.a === 'finish') {
      // The rule on every screen alike: when an okey is spare, the finish throws the okey (×2),
      // whichever tile the finishing player picked.
      const best = findFinish(hand, this.tiles, this.okey, a.id);
      if (!best) return false;
      let id = a.id;
      if (best.withOkey && !faceOf(this.tiles[id], this.okey).wild) id = best.discard;
      const kind = winKind(hand.filter((x) => x !== id), this.tiles, this.okey);
      if (!kind) return false;
      hand.splice(hand.indexOf(id), 1);
      this.log.push(a);
      this.endHand({ seat, kind, withOkey: faceOf(this.tiles[id], this.okey).wild, last: id });
      return true;
    }
    hand.splice(hand.indexOf(a.id), 1);
    this.discards[seat].push(a.id);
    this.log.push(a);
    this.animateDiscard(seat, a.id);
    this.turn = this.next(seat);
    this.phase = 'draw';
    this.nextAction();
    return true;
  }

  // ---------- animation ----------
  /** Moves an object along a soft arc (and calls done at the end). */
  private arc(obj: Phaser.GameObjects.Image, to: { x: number; y: number }, ms: number, lift: number, extra: (f: number) => void, done: () => void): void {
    const sx = obj.x, sy = obj.y;
    this.tweens.addCounter({
      from: 0, to: 1, duration: ms, ease: 'Cubic.easeInOut',
      onUpdate: (tw) => {
        const f = tw.getValue() ?? 0;
        obj.setPosition(sx + (to.x - sx) * f, sy + (to.y - sy) * f - Math.sin(f * Math.PI) * lift);
        extra(f);
      },
      onComplete: done,
    });
  }

  private animateDraw(seat: number, id: number, fromCorner: number | null): void {
    const from = fromCorner === null ? { x: PILE.x - 6, y: PILE.y - 10 } : CORNER[this.rel(fromCorner)];
    if (fromCorner !== null) this.refreshCorner(fromCorner);
    this.sfx('draw', { volume: 0.5 });
    if (this.isMine(seat)) {
      const slot = this.rack.findIndex((x) => x === null);
      this.rack[slot] = id;
      const p = this.slotPos(slot);
      const img = this.tileSprite(id, from.x, from.y);
      img.setDepth(40).setData('flying', true);
      // a tile from the middle comes face down and turns over on the way
      const face = img.texture.key;
      if (fromCorner === null) img.setTexture('ok-t-back');
      let flipped = fromCorner !== null;
      this.arc(img, { x: p.x, y: p.y - 18 }, 420, 70, (f) => {
        if (!flipped) {
          img.scaleX = Math.abs(Math.cos(f * Math.PI));
          if (f >= 0.5) { flipped = true; img.setTexture(face); }
        } else if (fromCorner === null) img.scaleX = Math.abs(Math.cos(f * Math.PI));
      }, () => {
        img.setScale(1).setDepth(10).setData('flying', false);
        this.sfx('place', { volume: 0.35 });
        // the slot may have changed meanwhile (sorting): land where the tile now belongs
        const at = this.rack.indexOf(id);
        const q = at >= 0 ? this.slotPos(at) : p;
        this.tweens.add({ targets: img, x: q.x, y: q.y - (this.selected === id ? 18 : 0), duration: 160, ease: 'Bounce.easeOut' });
      });
      this.select(id);
    } else {
      const to = SEAT_POS[this.rel(seat)];
      const ghost = this.add.image(from.x, from.y, fromCorner === null ? 'ok-t-back' : tileKey(this.tiles[id])).setDepth(40).setScale(0.85);
      this.arc(ghost, to, 460, 40, (f) => ghost.setScale(0.85 - 0.45 * f).setAlpha(1 - 0.6 * f), () => {
        ghost.destroy();
        const ui = this.seatUi[this.rel(seat)];
        this.tweens.add({ targets: ui.backs, scale: { from: 1.15, to: 1 }, duration: 200, ease: 'Back.easeOut' });
      });
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
    const mine = this.isMine(seat);
    const fly = this.add.image(from.x, from.y, mine ? tileKey(this.tiles[id]) : 'ok-t-back').setDepth(40).setScale(mine ? 1 : 0.5);
    const spin = Phaser.Math.Between(-8, 8);
    let flipped = mine;
    this.arc(fly, to, 380, mine ? 60 : 30, (f) => {
      fly.setAngle(spin * f);
      if (mine) fly.setScale(1 - 0.1 * f);
      else {
        fly.setScale(Math.abs(Math.cos(f * Math.PI)) * (0.5 + 0.4 * f), 0.5 + 0.4 * f);
        if (!flipped && f >= 0.5) { flipped = true; fly.setTexture(tileKey(this.tiles[id])); }
      }
    }, () => {
      fly.destroy();
      this.refreshCorner(seat);
      this.sfx('place', { volume: 0.55 });
      burst(this, to.x, to.y + 30, [0xffffff, 0xe9dcc0], 6, 90);
    });
    this.refresh();
  }

  private refreshCorner(seat: number): void {
    const r = this.rel(seat);
    const pile = this.discards[seat];
    const top = pile.at(-1);
    this.cornerImgs[r]?.destroy();
    this.cornerUnder[r]?.destroy();
    this.cornerImgs[r] = null;
    this.cornerUnder[r] = null;
    if (top === undefined) return;
    const c = CORNER[r];
    // a hint of the tiles underneath
    if (pile.length > 1) {
      const under = pile[pile.length - 2];
      this.cornerUnder[r] = this.add.image(c.x + 4, c.y + 5, tileKey(this.tiles[under])).setDepth(5).setScale(0.88).setAngle((under % 7) - 3).setTint(0xb8b0a0);
    }
    const img = this.add.image(c.x, c.y, tileKey(this.tiles[top])).setDepth(6).setScale(0.9).setAngle((top % 7) - 3);
    if (faceOf(this.tiles[top], this.okey).wild) img.setTint(0xfff1c4);
    this.cornerImgs[r] = img;
  }

  // ---------- my rack ----------
  private bindInput(): void {
    this.input.on('gameobjectdown', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (isModalOpen(this)) return;
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
      if (!d.moved) { this.select(this.selected === d.id ? null : d.id); this.sfx('slide', { volume: 0.2 }); return; }
      // dropped on my discard corner: throw it; on the centre: finish with it
      const myCorner = CORNER[0];
      if (Phaser.Math.Distance.Between(p.x, p.y, myCorner.x, myCorner.y) < 80 && this.canDiscard()) { this.select(d.id); this.humanDiscard(); return; }
      if (Phaser.Math.Distance.Between(p.x, p.y, MID.x, MID.y) < 90 && this.canDiscard()) { this.select(d.id); this.humanFinish(); return; }
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
    kb?.addCapture('TAB');
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
      if (!img || img.getData('flying')) return;
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
    if (this.phase === 'over') return;
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
      sorted.forEach((id, i) => { this.rack[i + Math.floor(i / 2)] = id; });
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
    if (this.isOver || this.phase !== 'draw' || this.turn !== this.me || isModalOpen(this)) return;
    if (kind === 'take' && this.discards[this.prev(this.me)].length === 0) return;
    this.doAct({ s: this.me, a: kind, n: this.log.length });
  }

  private humanDiscard(): void {
    if (!this.canDiscard()) return;
    // a hand that can finish never throws a tile away: the throw finishes it (with the okey if spare)
    if (this.myFinish()) { this.humanFinish(); return; }
    if (this.selected === null) { this.flashHint(t('pickTile')); return; }
    this.doAct({ s: this.me, a: 'discard', id: this.selected, n: this.log.length });
  }

  private humanFinish(): void {
    if (!this.canDiscard()) return;
    // the best finish: a spare okey is always the tile thrown (×2); otherwise the picked tile
    const fin = findFinish(this.hands[this.me], this.tiles, this.okey, this.selected);
    if (!fin) { this.flashHint(t('cantFinish')); this.sfx('bad', { volume: 0.4 }); return; }
    this.doAct({ s: this.me, a: 'finish', id: fin.discard, n: this.log.length });
  }

  /** Online: my time ran out, so my own game plays the turn (draw from the middle, then the best throw). */
  private autoPlay(): void {
    if (this.turn !== this.me || this.phase === 'over' || this.isOver) return;
    if (this.autoAt === 0) this.notice(t('timeUp'));
    this.autoAt = this.time.now;
    if (this.phase === 'draw') { this.doAct({ s: this.me, a: 'draw', n: this.log.length }); return; }
    const hand = this.hands[this.me];
    const fin = findFinish(hand, this.tiles, this.okey);
    if (fin) this.doAct({ s: this.me, a: 'finish', id: fin.discard, n: this.log.length });
    else this.doAct({ s: this.me, a: 'discard', id: this.selected ?? botDiscard(hand, this.tiles, this.okey, this.rand), n: this.log.length });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.isOver || isModalOpen(this)) return;
    if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault?.(); this.openCard(this.me); return; }
    if (this.phase === 'over') return;
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
      this.sfx('slide', { volume: 0.15 });
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
      const r = this.rel(seat);
      const ui = this.seatUi[r];
      if (r === 0) continue;
      const n = this.hands[seat]?.length ?? 0;
      ui.count.setText(String(n));
      const p = SEAT_POS[r];
      ui.countBg.clear().fillStyle(0xfff3c4, 1).fillCircle(p.x + 34, p.y - 32, 15).lineStyle(2, 0x1b1d2e, 0.5).strokeCircle(p.x + 34, p.y - 32, 15);
      ui.name.setColor(this.away.has(seat) ? '#9aa4b2' : '#ffffff');
      ui.avatar.setAlpha(this.away.has(seat) ? 0.55 : 1);
    }
    const myTurn = this.turn === this.me && this.phase !== 'over';
    const fin = myTurn && this.phase === 'discard' ? this.myFinish() : null;
    this.finishBtn.setVisible(!!fin);
    this.discardBtn.setVisible(myTurn && this.phase === 'discard' && !fin).setAlpha(this.selected === null ? 0.55 : 1);
    let hint = '';
    let col = '#cfe9d8';
    if (this.phase !== 'over') {
      if (myTurn) {
        col = '#fff3c4';
        hint = this.phase === 'draw' ? t('yourDraw') : fin ? (fin.withOkey ? t('canFinishOkey') : t('canFinish')) : t('yourDiscard');
      } else hint = t('waitingFor', { name: this.seats[this.turn].name });
    }
    this.hint.setText(hint).setColor(col);
    const g = this.hintBg.clear();
    if (hint) {
      const w = this.hint.width + 48;
      g.fillStyle(myTurn ? 0x3a2a05 : 0x0b1020, myTurn ? 0.82 : 0.5).fillRoundedRect(W / 2 - w / 2, 398 - 22, w, 44, 22);
      if (myTurn) g.lineStyle(2, fin?.withOkey ? 0xffc83d : 0xffd23f, 0.9).strokeRoundedRect(W / 2 - w / 2, 398 - 22, w, 44, 22);
    }
    // the rack lights up on my turn
    this.rackGlow.clear();
    if (myTurn) this.rackGlow.lineStyle(4, 0xffd23f, 0.85).strokeRoundedRect(W / 2 - (SLOTS * SLOT + 36) / 2 + 2, ROW_Y[0] - 56, SLOTS * SLOT + 32, 192, 18);
    // the pile I may take from grows on my draw
    const takeTop = this.cornerImgs[3];
    if (takeTop) takeTop.setScale(myTurn && this.phase === 'draw' ? 1 : 0.9);
    this.drawHud();
    this.setScore(this.scores[this.me] * 100);
  }

  private flashHint(s: string): void {
    this.hint.setText(s).setColor('#ff8a7a');
    this.tweens.add({ targets: this.hint, scale: { from: 1.15, to: 1 }, duration: 220 });
  }

  // ---------- player cards ----------
  private openCard(seat: number): void {
    if (this.isOver || isModalOpen(this) && !isPlayerCardOpen(this)) return;
    const s = this.seats[seat];
    const st = this.stats[seat];
    const you = seat === this.me;
    openPlayerCard(this, {
      name: you && !net.active ? t('you') : s.name,
      color: SEAT_COL[this.rel(seat)],
      portrait: s.portrait,
      character: s.bot ? null : s.character,
      bot: s.bot ? t('botLevel') : false,
      you,
      match: [
        { label: t('stPoints'), value: this.scores[seat] },
        { label: t('stHands'), value: st.won },
        { label: t('stOkey'), value: st.okey },
        { label: t('stPairs'), value: st.pairs },
        { label: t('stStreak'), value: st.streak },
        { label: t('stTiles'), value: this.hands[seat]?.length ?? 0 },
      ],
      lifetime: you ? lifetimeRows(currentGame().meta.id) : undefined,
    }, { onNext: () => this.openCard(this.next(seat)) });
  }

  // ---------- hand end ----------
  private endHand(win: { seat: number; kind: WinKind; withOkey: boolean; last: number } | null): void {
    this.phase = 'over';
    this.botTimer?.remove();
    this.lastGain = [0, 0, 0, 0];
    let pts = 0;
    if (win) {
      pts = 2 * (win.kind === 'pairs' ? 2 : 1) * (win.withOkey ? 2 : 1);
      this.scores[win.seat] += pts;
      this.lastGain[win.seat] = pts;
      for (let s = 0; s < 4; s++) {
        const st = this.stats[s];
        if (s === win.seat) {
          st.won++; st.streak++;
          if (win.withOkey) st.okey++;
          if (win.kind === 'pairs') st.pairs++;
        } else st.streak = 0;
      }
    }
    this.refresh();
    const token = ++this.endToken;
    const show = () => { if (token === this.endToken && this.phase === 'over' && !this.isOver) this.showHandPanel(win, pts); };
    if (!win) { this.sfx('bad', { volume: 0.4 }); this.time.delayedCall(500, show); return; }
    // the thrown tile flies to the middle; with the okey it is a celebration
    const from = this.isMine(win.seat) ? (() => {
      const img = this.sprites.get(win.last);
      const p = img ? { x: img.x, y: img.y } : SEAT_POS[0];
      const slot = this.rack.indexOf(win.last);
      if (slot >= 0) this.rack[slot] = null;
      img?.destroy();
      this.sprites.delete(win.last);
      return p;
    })() : SEAT_POS[this.rel(win.seat)];
    if (win.withOkey) this.celebrateOkey(win.seat, win.last, from, show);
    else {
      const fly = this.add.image(from.x, from.y, tileKey(this.tiles[win.last])).setDepth(110).setScale(this.isMine(win.seat) ? 1 : 0.5);
      this.overlay.push(fly);
      this.arc(fly, MID, 520, 80, (f) => fly.setScale(0.6 + 0.7 * f).setAngle(360 * f), () => {
        burst(this, MID.x, MID.y, [0xffd23f, 0xffffff], 24, 260);
        this.sfx(win.seat === this.me ? 'win' : 'chips', { volume: 0.6 });
        this.time.delayedCall(700, show);
      });
    }
    // solo: a bot congratulates me, or is pleased with itself
    if (!net.active) {
      const bots = [1, 2, 3];
      if (win.seat === this.me) this.chat.botSay(bots[Math.floor(Math.random() * 3)], win.withOkey ? 'lucky' : 'welldone', win.withOkey ? 0.7 : 0.45);
      else if (Math.random() < 0.5) this.chat.botSay(win.seat, 'haha', 0.3);
    }
  }

  /** "Finished with the okey! ×2": the okey flies to the middle in a golden glow. */
  private celebrateOkey(seat: number, id: number, from: { x: number; y: number }, then: () => void): void {
    const ov = this.overlay;
    const dim = this.add.rectangle(0, 0, W, 720, 0x000000, 0).setOrigin(0).setDepth(105);
    this.tweens.add({ targets: dim, fillAlpha: 0.45, duration: 400 });
    const glow = this.add.image(from.x, from.y, 'ok-glow').setTint(0xffc83d).setBlendMode(Phaser.BlendModes.ADD).setDepth(109).setScale(1).setAlpha(0.9);
    const fly = this.add.image(from.x, from.y, tileKey(this.tiles[id])).setDepth(110).setTint(0xfff1c4).setScale(this.isMine(seat) ? 1 : 0.5);
    ov.push(dim, glow, fly);
    this.sfx('draw', { volume: 0.6 });
    this.arc(fly, MID, 700, 120, (f) => {
      fly.setScale(0.7 + 1.0 * f).setAngle(720 * f);
      glow.setPosition(fly.x, fly.y).setScale(1 + 2.4 * f);
    }, () => {
      fly.setAngle(0);
      this.sfx('okeyfin', { volume: 0.8, exact: true });
      this.sfx('coins', { volume: 0.6 });
      flash(this, 0xffd23f, 180);
      shake(this, 0.01, 260);
      burst(this, MID.x, MID.y, [0xffd23f, 0xffc83d, 0xffffff], 70, 520);
      this.tweens.add({ targets: glow, scale: { from: 3.4, to: 3 }, alpha: { from: 1, to: 0.7 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: fly, scale: 1.85, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      for (let k = 0; k < 3; k++) {
        const ring = this.add.image(MID.x, MID.y, 'ok-ring').setTint(0xffd23f).setDepth(108).setScale(0.5).setAlpha(0.9);
        ov.push(ring);
        this.tweens.add({ targets: ring, scale: 4, alpha: 0, delay: k * 220, duration: 900, ease: 'Cubic.easeOut' });
      }
      const band = this.add.graphics().setDepth(111);
      band.fillStyle(0x1a1203, 0.9).fillRoundedRect(W / 2 - 440, 430, 880, 116, 30);
      band.lineStyle(4, 0xffd23f, 1).strokeRoundedRect(W / 2 - 440, 430, 880, 116, 30);
      const title = txt(this, W / 2, 472, t('okeyFinish'), { title: true, size: 44, color: '#ffd23f' }).setDepth(112);
      const who = txt(this, W / 2, 518, seat === this.me ? t('okeyFinishYou') : t('okeyFinishBy', { name: this.seats[seat].name }), { size: 26, color: '#fff3c4' }).setDepth(112);
      ov.push(band, title, who);
      for (const o of [band, title, who]) {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, duration: 220 });
      }
      this.tweens.add({ targets: title, scale: { from: 0.4, to: 1 }, duration: 420, ease: 'Back.easeOut' });
      if (seat === this.me) popup(this, W / 2, 380, '×2', '#ffd23f', 54);
      this.time.delayedCall(2100, then);
    });
  }

  private showHandPanel(win: { seat: number; kind: WinKind; withOkey: boolean; last: number } | null, pts: number): void {
    this.clearOverlay();
    const ov: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { ov.push(o); return o; };
    const D = 101;
    add(this.add.rectangle(0, 0, W, 720, 0x000000, 0.55).setOrigin(0).setDepth(100).setInteractive());
    const panel = add(this.add.graphics().setDepth(D));
    const px = 180, py = 74, pw = 920, ph = 610;
    panel.fillStyle(0x000000, 0.35).fillRoundedRect(px, py + 10, pw, ph, 30);
    panel.fillStyle(0x10281b, 0.97).fillRoundedRect(px, py, pw, ph, 30);
    panel.lineStyle(3, win?.withOkey ? 0xffc83d : 0xffd23f, 0.85).strokeRoundedRect(px, py, pw, ph, 30);
    let title: string, color: string;
    if (!win) { title = t('pileOut'); color = '#cfe9d8'; }
    else {
      title = win.seat === this.me ? t('handWonYou') : t('handWon', { name: this.seats[win.seat].name });
      color = win.seat === this.me ? '#5dff7a' : '#ffd23f';
      const how = [win.kind === 'pairs' ? t('withPairs') : t('normalWin'), win.withOkey ? t('withOkey') : ''].filter(Boolean).join(' · ');
      add(txt(this, W / 2, 160, `${how}   +${pts}`, { size: 26, color: '#fff3c4' }).setDepth(D + 1));
      // the winning hand, grouped, and the thrown tile at the end
      const hand = this.hands[win.seat];
      const a = analyse(hand, this.tiles, this.okey);
      const order = win.kind === 'pairs' ? this.sortedIds(hand, 'pairs') : [...a.groups.flat(), ...a.loose];
      const ends = new Set<number>();
      if (win.kind === 'pairs') order.forEach((_, i) => { if (i % 2 === 1) ends.add(i); });
      else { let acc = 0; for (const g of a.groups) { acc += g.length; ends.add(acc - 1); } }
      const step = 52, gap = 14;
      const total = (order.length + 1) * step + (ends.size) * gap;
      let x = W / 2 - total / 2 + step / 2;
      let k = 0;
      order.forEach((id, i) => {
        const img = add(this.add.image(x, 232, tileKey(this.tiles[id])).setScale(0.72).setDepth(D + 1).setAlpha(0));
        if (faceOf(this.tiles[id], this.okey).wild) img.setTint(0xfff1c4);
        this.tweens.add({ targets: img, alpha: 1, y: { from: 206, to: 232 }, delay: 35 * k++, duration: 240, ease: 'Back.easeOut' });
        x += step;
        if (ends.has(i)) x += gap;
      });
      const last = add(this.add.image(x, 232, tileKey(this.tiles[win.last])).setScale(0.72).setDepth(D + 1).setAngle(8));
      if (win.withOkey) {
        last.setTint(0xfff1c4);
        const halo = add(this.add.image(x, 232, 'ok-glow').setTint(0xffc83d).setBlendMode(Phaser.BlendModes.ADD).setDepth(D).setScale(1.1));
        this.tweens.add({ targets: halo, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
      }
      add(txt(this, x, 282, t('lastTile'), { size: 16, color: '#cfe9d8' }).setDepth(D + 1));
      if (win.seat === this.me) {
        burst(this, W / 2, 120, [0xffd23f, 0x5dff7a, 0xffffff], 50, 420);
        this.sfx('win', { volume: 0.6 });
      }
    }
    add(txt(this, W / 2, 116, title, { title: true, size: 38, color }).setDepth(D + 1));
    // the four players' points, best first
    const top = win ? 326 : 220;
    add(txt(this, 300, top, t('player'), { size: 18, color: '#9fc7ae' }).setOrigin(0, 0.5).setDepth(D + 1));
    add(txt(this, 760, top, t('thisHand'), { size: 18, color: '#9fc7ae' }).setDepth(D + 1));
    add(txt(this, 900, top, t('total'), { size: 18, color: '#9fc7ae' }).setDepth(D + 1));
    const order = [0, 1, 2, 3].sort((a, b) => this.scores[b] - this.scores[a] || this.rel(a) - this.rel(b));
    const best = Math.max(...this.scores);
    order.forEach((seat, i) => {
      const y = top + 46 + i * 54;
      const r = this.rel(seat);
      const row = add(this.add.graphics().setDepth(D));
      const hi = seat === win?.seat;
      row.fillStyle(hi ? SEAT_COL[r] : 0xffffff, hi ? 0.22 : 0.06).fillRoundedRect(250, y - 22, 780, 44, 22);
      if (seat === this.me) row.lineStyle(2, SEAT_COL[0], 0.8).strokeRoundedRect(250, y - 22, 780, 44, 22);
      add(avatar(this, 278, y, 34, { portrait: this.seats[seat].portrait, color: SEAT_COL[r], name: this.seats[seat].name, ring: SEAT_COL[r] }).setDepth(D + 1));
      const label = (best > 0 && this.scores[seat] === best ? '👑 ' : '') + this.nameOf(seat) + (this.seats[seat].bot ? ` · ${t('botTag')}` : '');
      add(txt(this, 310, y, label, { size: 22, color: SEAT_HEX[r] }).setOrigin(0, 0.5).setDepth(D + 1));
      add(txt(this, 760, y, this.lastGain[seat] ? `+${this.lastGain[seat]}` : '–', { title: true, size: 22, color: this.lastGain[seat] ? '#5dff7a' : '#7f9a8a' }).setDepth(D + 1));
      const tot = add(txt(this, 900, y, String(this.scores[seat]), { title: true, size: 24, color: '#ffffff' }).setDepth(D + 1));
      // a bar of the total
      const bar = add(this.add.graphics().setDepth(D + 1));
      const f = best > 0 ? this.scores[seat] / best : 0;
      bar.fillStyle(0x000000, 0.3).fillRoundedRect(940, y - 6, 74, 12, 6);
      if (f > 0) bar.fillStyle(SEAT_COL[r], 1).fillRoundedRect(940, y - 6, Math.max(12, 74 * f), 12, 6);
      if (this.lastGain[seat]) this.tweens.add({ targets: tot, scale: { from: 1.6, to: 1 }, duration: 420, delay: 300, ease: 'Back.easeOut' });
    });

    const last = this.hand + 1 >= HANDS_PER_MATCH;
    const proceed = () => {
      if (last) this.finishMatch();
      else { this.hand++; this.startHand(); }
    };
    const by = 640;
    if (!net.active || net.isHost) {
      const btn = new Button(this, W / 2, by, last ? t('results') : t('nextHand'), () => {
        if (this.phase !== 'over' || this.isOver) return;
        if (net.active) net.send('next', { hand: this.hand + 1, last });
        proceed();
      }, { width: 300, height: 66, size: 24, color: COLORS.red });
      btn.setDepth(D + 2);
      ov.push(btn);
      this.input.keyboard?.once('keydown-ENTER', () => { if (btn.active && !isModalOpen(this)) btn.press(); });
    } else {
      ov.push(txt(this, W / 2, by, t('waitHostHand'), { size: 22, color: '#cfe9d8' }).setDepth(D + 1));
    }
    for (const o of ov) if ('setAlpha' in o) {
      const v = o as unknown as Phaser.GameObjects.Components.Alpha;
      if (v.alpha === 1) { v.setAlpha(0); this.tweens.add({ targets: v, alpha: 1, duration: 200 }); }
    }
    this.overlay = ov;
  }

  private clearOverlay(): void {
    for (const o of this.overlay) { this.tweens.killTweensOf(o); o.destroy(); }
    this.overlay = [];
  }

  private finishMatch(): void {
    this.clearOverlay();
    const best = Math.max(...this.scores);
    const win = this.scores[this.me] === best && this.scores.filter((s) => s === best).length === 1;
    const winners = [0, 1, 2, 3].filter((s) => this.scores[s] === best).map((s) => this.nameOf(s));
    this.setScore(this.scores[this.me] * 100);
    recordMatch(currentGame().meta.id, { won: win, score: this.score });
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
      const over = this.phase === 'over';
      net.send('sync', {
        seat: from, base: this.base, hand: this.hand, startDealer: this.startDealer,
        // the replayed log scores a finished hand again, so send the totals from before it
        scores: over ? this.handStart.scores : this.scores, stats: over ? this.handStart.stats : this.stats, log: this.log,
      } satisfies SyncData);
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
    if (Array.isArray(d.stats) && d.stats.length === 4) this.stats = d.stats.map((s) => ({ ...s }));
    this.startHand();
    this.botTimer?.remove();
    for (const a of d.log) this.apply(a);
    this.layoutRack();
    this.refresh();
  }

  updateGame(): void {
    // turn-based: everything runs on events; the okey's glow follows its tile, and the turn clock
    for (const img of this.sprites.values()) {
      const halo = img.getData('halo') as Phaser.GameObjects.Image | undefined;
      if (halo) halo.setPosition(img.x, img.y).setVisible(img.visible);
    }
    this.drawTurnClock();
  }

  /** A ring around the player to act: a countdown for people online, a spinner for bots. */
  private drawTurnClock(): void {
    const g = this.fxG;
    g.clear();
    if (this.phase === 'over' || this.turnSeat < 0) return;
    const seat = this.turn;
    const r = this.rel(seat);
    const now = this.time.now;
    const spent = now - this.turnStarted;
    const timed = net.active && this.isHuman(seat);
    const left = timed ? Math.max(0, 1 - spent / TURN_MS) : 1;
    const col = left < 0.2 ? 0xff5a5a : left < 0.45 ? 0xffd23f : 0x5dff7a;
    if (r !== 0) {
      const p = SEAT_POS[r], rad = AVATAR / 2 + 10;
      const pulse = 1 + Math.sin(now / 160) * 0.04;
      g.lineStyle(6, 0x000000, 0.35).strokeCircle(p.x, p.y, rad * pulse);
      if (timed) {
        g.lineStyle(6, col, 1).beginPath().arc(p.x, p.y, rad, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2).strokePath();
      } else {
        // a bot thinking: a spinning arc
        const a = (now / 260) % (Math.PI * 2);
        g.lineStyle(6, 0xffd23f, 1).beginPath().arc(p.x, p.y, rad * pulse, a, a + Math.PI * 1.2).strokePath();
      }
    }
    // the active chip in the HUD carries a thin timer line
    const cx = CHIP_X[r];
    if (timed) g.fillStyle(col, 0.95).fillRoundedRect(cx - CHIP_W / 2 + 16, HUD_Y + 18, (CHIP_W - 32) * left, 4, 2);
    if (seat !== this.me) return;
    if (timed) {
      // my clock under the hint, ticking in the last five seconds
      g.fillStyle(0x000000, 0.35).fillRoundedRect(W / 2 - 120, 424, 240, 8, 4);
      g.fillStyle(col, 1).fillRoundedRect(W / 2 - 120, 424, 240 * left, 8, 4);
      const secs = Math.ceil((TURN_MS - spent) / 1000);
      if (secs <= 5 && secs > 0 && secs !== this.lastTick) { this.lastTick = secs; this.sfx('tick', { volume: 0.45, exact: true }); }
      if (left <= 0 && now - this.autoAt > 450) this.autoPlay();
    } else if (!net.active && !this.slowSaid && spent > SLOW_MS) {
      // solo: a bot gently asks me to hurry (once a hand, and not always)
      this.slowSaid = true;
      this.chat.botSay(this.next(this.me), 'hurry', 0.6);
    }
  }
}
