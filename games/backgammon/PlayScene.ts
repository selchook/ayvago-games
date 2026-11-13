import Phaser from 'phaser';
import {
  ArcadeScene, burst, shake, flash, popup, txt, t, rng, net, currentGame,
  quickChat, isModalOpen, openPlayerCard, isPlayerCardOpen, portraitKey, lifetimeRows, recordMatch,
  playerCharacter, peerCharacter, otherCharacters, isCharacterId, isEasy, hudChip,
  type QuickChat, type CharacterId,
} from '@core';
import {
  BAR, OFF, LEVELS, EASY_TOP, EASY_NOISE, initial, apply, legalSteps, rollDice, diceList, removeDie, playTurn, result, chooseTurn, pips, other,
  type Pos, type Side, type Step,
} from './rules';
import { makeArt, makeBoard, CK_FILL, DIE_FILL } from './art';

// Board geometry (1280 x 720). Points are drawn in the local player's own numbering: 1..6 bottom
// right (home), 7..12 bottom left, 13..18 top left, 19..24 top right; the local player moves
// counter-clockwise towards the bottom right and bears off into the tray on the right. Online,
// the guest sees the board turned around, so both players move the same way on their screen.
export const G = {
  FX0: 30, FX1: 1050, FY0: 96, FY1: 704,
  IX0: 48, IX1: 1032, IY0: 114, IY1: 686,
  BAR0: 510, BAR1: 570, BARX: 540,
  TRAY0: 1058, TRAY1: 1132, TRAYX: 1095,
  PW: 77, TRI: 250, CK: 64, MIDY: 400,
};
const MATCH = 5;
/** Display sizes: the textures carry a soft shadow around the piece. */
const CKD = G.CK / CK_FILL;
const DIED = 58 / DIE_FILL;
const GOLD = 0xffd23f;
const GREEN = 0x5dff7a;
const CYAN = 0x3ee6ff;
const THEM = 0x7fd8ff;
/** The scoreboard pill at the top (Tito's Tank style): names, match dots, game and turn. */
const HUD = { x: 640, y: 36, w: 860, h: 58 };
/** Each side's half of the pill (name and dots) and the room left for the middle label. */
const SIDE_W = 336;
const MID_W = 176;
/** Solo: after this long on a turn the CPU may ask the player to hurry. */
const SLOW_MS = 25000;

export function pointX(v: number): number {
  if (v <= 6) return G.IX1 - (v - 0.5) * G.PW;
  if (v <= 12) return G.BAR0 - (v - 6.5) * G.PW;
  if (v <= 18) return G.IX0 + (v - 12.5) * G.PW;
  return G.BAR1 + (v - 18.5) * G.PW;
}
const isTop = (v: number) => v >= 13;

/** The painted board (walnut box, felt, inlaid points, bar with hinges, trays, numbers). */
export function drawBoard(scene: Phaser.Scene, numbers = true): void {
  makeArt(scene);
  scene.add.image(0, 0, makeBoard(scene, G, pointX, numbers)).setOrigin(0).setDepth(0);
}

/** Size a checker sprite (its texture has room for a shadow). */
export function checkerSize(img: Phaser.GameObjects.Image): Phaser.GameObjects.Image {
  return img.setDisplaySize(CKD, CKD);
}

type State = 'wait' | 'move' | 'done' | 'ai' | 'remote' | 'busy';
type Wire = [number, number, number];
interface DiceMsg { d: [number, number]; n: number }
interface TurnMsg { m: Wire[]; n: number }
interface SideStats { games: number; gammons: number; hits: number }

export class PlayScene extends ArcadeScene {
  protected useHud = false;
  private pos: Pos = initial();
  private stacks: Phaser.GameObjects.Image[][][] = [];
  private counts: Phaser.GameObjects.Text[] = [];
  private state: State = 'wait';
  private mine: Side = 0;
  private turn: Side = 0;
  private roll: [number, number] = [1, 1];
  private dice: number[] = [];
  private history: Array<{ pos: Pos; dice: number[]; step: Step }> = [];
  private legal: Step[] = [];
  private sel = -1;
  private targets = new Map<number, Step[]>();
  private cur = -1;
  private hl!: Phaser.GameObjects.Graphics;
  private hlTop!: Phaser.GameObjects.Graphics;
  private hlImgs: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Text> = [];
  private bannerBand!: Phaser.GameObjects.Graphics;
  private rowGlow!: Phaser.GameObjects.Image;
  private dotsMe: Phaser.GameObjects.Arc[] = [];
  private dotsThem: Phaser.GameObjects.Arc[] = [];
  private status!: Phaser.GameObjects.Text;
  private diceImgs: Phaser.GameObjects.Image[] = [];
  private undoBtn!: Phaser.GameObjects.Container;
  private doneBtn!: Phaser.GameObjects.Container;
  private ptsMe!: Phaser.GameObjects.Text;
  private ptsThem!: Phaser.GameObjects.Text;
  private pipMe!: Phaser.GameObjects.Text;
  private pipThem!: Phaser.GameObjects.Text;
  private nameThem!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private match: [number, number] = [0, 0];
  private gameNo = 0;
  private level = 0;
  private easy = false;
  private online = false;
  private turnNo = 0;
  private inbox: Array<{ t: 'dice'; d: DiceMsg } | { t: 'turn'; d: TurnMsg }> = [];
  private remoteRoll: [number, number] | null = null;
  private rolling = false;
  private stats: [SideStats, SideStats] = [{ games: 0, gammons: 0, hits: 0 }, { games: 0, gammons: 0, hits: 0 }];
  private chat!: QuickChat;
  private hudG!: Phaser.GameObjects.Graphics;
  private gameText!: Phaser.GameObjects.Text;
  private nameMe!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private portraits: [string, string] = ['', ''];
  private looks: [CharacterId, CharacterId] = ['adventurer', 'explorer'];
  private turnAt = 0;
  private slowSaid = false;

  createGame(): void {
    this.pos = initial();
    this.stacks = [0, 1].map(() => Array.from({ length: 26 }, () => [] as Phaser.GameObjects.Image[]));
    this.counts = [];
    this.state = 'wait'; this.turn = 0; this.roll = [1, 1]; this.dice = []; this.history = []; this.legal = [];
    this.sel = -1; this.targets = new Map(); this.cur = -1; this.diceImgs = []; this.hlImgs = []; this.dotsMe = []; this.dotsThem = [];
    this.match = [0, 0]; this.gameNo = 0; this.level = 0;
    this.easy = isEasy();
    this.online = net.active;
    this.mine = this.online ? (net.seat as Side) : 0;
    this.turnNo = 0; this.inbox = []; this.remoteRoll = null; this.rolling = false;
    this.cameras.main.setBackgroundColor('#160d07');
    drawBoard(this);
    this.hl = this.add.graphics().setDepth(5);
    this.hlTop = this.add.graphics().setDepth(12);
    this.tweens.add({ targets: [this.hl], alpha: { from: 1, to: 0.55 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.bannerBand = this.add.graphics().setDepth(79).setVisible(false);

    this.banner = txt(this, (G.IX0 + G.IX1) / 2, G.MIDY, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(80).setVisible(false);
    this.stats = [{ games: 0, gammons: 0, hits: 0 }, { games: 0, gammons: 0, hits: 0 }];
    this.slowSaid = false;
    this.turnAt = 0;
    // who sits where: the player's character, the opponent's (online) or another one for the CPU
    const me = playerCharacter();
    const them = this.online ? this.peerLook() : otherCharacters(me)[0];
    this.looks = this.mine === 0 ? [me, them] : [them, me];
    this.portraits = [0, 1].map((side) => portraitKey(this, `ch-${this.looks[side]}-front`, side === this.mine ? GOLD : THEM)) as [string, string];

    // the scoreboard pill, a HUD chip: my name and dots left, the opponent right, game and turn in
    // the middle; the side to play is lit on top of it
    hudChip(this, HUD.x, HUD.y, { align: 'center', height: HUD.h, minWidth: HUD.w, depth: 29 });
    this.hudG = this.add.graphics().setDepth(30);
    const L = HUD.x - HUD.w / 2, R = HUD.x + HUD.w / 2;
    this.add.image(L + 34, HUD.y, this.tex(this.mine)).setDisplaySize(34, 34).setDepth(31);
    this.nameMe = txt(this, L + 60, HUD.y, t('you'), { title: true, size: 26, color: '#ffd23f' }).setOrigin(0, 0.5).setDepth(31);
    this.add.image(R - 34, HUD.y, this.tex(other(this.mine))).setDisplaySize(34, 34).setDepth(31);
    this.nameThem = txt(this, R - 60, HUD.y, '', { title: true, size: 26, color: '#7fd8ff' }).setOrigin(1, 0.5).setDepth(31);
    for (let i = 0; i < MATCH; i++) {
      this.dotsMe.push(this.add.circle(L + 232 + i * 22, HUD.y, 7, 0xffffff, 0.18).setDepth(31));
      this.dotsThem.push(this.add.circle(R - 232 - i * 22, HUD.y, 7, 0xffffff, 0.18).setDepth(31));
    }
    this.gameText = txt(this, HUD.x, HUD.y - 13, '', { size: 16, color: '#b9c2dc', strokeThickness: 0 }).setDepth(31);
    this.status = txt(this, HUD.x, HUD.y + 11, '', { title: true, size: 20, color: '#ffd23f' }).setDepth(31);
    for (const [x, side] of [[L + SIDE_W / 2, this.mine], [R - SIDE_W / 2, other(this.mine)]] as const) {
      const z = this.add.zone(x, HUD.y, SIDE_W, HUD.h).setInteractive({ useHandCursor: true }).setDepth(32);
      z.on('pointerup', () => this.openCard(side));
    }

    // right panel: the race (pips), the score, undo and done
    const px = 1210;
    const plaque = this.add.graphics();
    plaque.fillStyle(0x000000, 0.45).fillRoundedRect(px - 62, 124, 124, 300, 16);
    plaque.fillStyle(0x3a1e0b, 1).fillRoundedRect(px - 64, 120, 124, 300, 16);
    plaque.lineStyle(2, 0xf0c98f, 0.35).strokeRoundedRect(px - 63, 121, 122, 298, 15);
    this.rowGlow = this.add.image(px, 210, 'tv-glow').setDisplaySize(170, 110).setTint(GOLD).setAlpha(0);
    this.tweens.add({ targets: this.rowGlow, scale: { from: this.rowGlow.scale * 0.92, to: this.rowGlow.scale * 1.05 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, px, 146, t('matchTo', { n: MATCH }), { title: true, size: 13, color: '#f0c98f', wrap: 150 });
    this.add.image(px - 36, 186, this.tex(this.mine)).setDisplaySize(30, 30);
    txt(this, px + 14, 186, t('pipsLabel'), { size: 18, color: '#d9b48a' }).setOrigin(0.5);
    this.ptsMe = txt(this, px, 224, '', { title: true, size: 30, color: '#ffd23f' });
    this.add.image(px - 36, 276, this.tex(other(this.mine))).setDisplaySize(30, 30);
    txt(this, px + 14, 276, t('pipsLabel'), { size: 18, color: '#d9b48a' }).setOrigin(0.5);
    this.ptsThem = txt(this, px, 314, '', { title: true, size: 30, color: '#7fd8ff' });
    this.pipMe = txt(this, px, 364, t('score'), { size: 17, color: '#d9b48a' });
    this.scoreText = txt(this, px, 392, '0', { title: true, size: 22, color: '#ffffff' });
    this.pipThem = this.pipMe;
    for (const [y, side] of [[230, this.mine], [300, other(this.mine)]] as const) {
      const z = this.add.zone(px, y, 124, 90).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => this.openCard(side));
    }
    this.undoBtn = this.panelButton(px, 480, 'bg-undo', t('undo'), () => this.undo());
    this.doneBtn = this.panelButton(px, 610, 'bg-ok', t('done'), () => this.confirm());
    this.setButtons();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!isModalOpen(this)) this.tapAt(p.x, p.y); });
    const kb = this.input.keyboard;
    const on = (keys: string[], fn: () => void) => { for (const k of keys) kb?.on(`keydown-${k}`, () => { if (!isModalOpen(this)) fn(); }); };
    on(['LEFT', 'A'], () => this.cycle(-1));
    on(['RIGHT', 'D'], () => this.cycle(1));
    on(['SPACE', 'ENTER', 'UP', 'W', 'Z'], () => this.act());
    on(['DOWN', 'S'], () => this.deselect());
    on(['X', 'BACKSPACE', 'U'], () => this.undo());
    on(['TAB', 'I'], () => this.openCard(this.mine));
    kb?.addCapture('TAB');

    // quick chat: bubbles under the names in the pill
    this.chat = quickChat(this, {
      button: { x: 54, y: 48, size: 76 },
      mySeat: () => this.mine,
      bots: () => (this.online ? [] : [other(this.mine)]),
      seatAnchor: (seat) => seat === this.mine ? { x: L + 120, y: HUD.y + HUD.h / 2, dir: 'down' } : { x: R - 120, y: HUD.y + HUD.h / 2, dir: 'down' },
    });
    if (!this.online) this.time.delayedCall(1800, () => this.chat.botSay(other(this.mine), 'hello', 0.4));

    if (this.online) {
      net.onScene(this, 'dice', (d: DiceMsg) => { if (d && Array.isArray(d.d)) { this.inbox.push({ t: 'dice', d }); this.takeRemote(); } });
      net.onScene(this, 'turn', (d: TurnMsg) => { if (d && Array.isArray(d.m)) { this.inbox.push({ t: 'turn', d }); this.takeRemote(); } });
    }
    if (this.online && net.isHost) {
      // the host rolls the first dice once the guest's board is up (or after a short wait), so
      // the guest always sees the opening roll
      this.setStatus(t('waitPeer'), '#7fd8ff');
      let started = false;
      const go = () => { if (!started && !this.isOver) { started = true; this.startGame(net.starter as Side); } };
      net.onScene(this, 'rdy', go);
      this.time.delayedCall(4000, go);
    } else {
      if (this.online) net.send('rdy', {});
      // solo: the first game opens with one die each, the higher die starts
      this.startGame(this.online ? (net.starter as Side) : null);
    }
  }

  /** The opponent's character: the room's peer, or the other seat at a two-seat table. */
  private peerLook(): CharacterId {
    const seat = net.seats[other(this.mine)]?.character;
    return isCharacterId(seat) ? seat : peerCharacter();
  }

  /**
   * A two-seat table on ayvago.com (the lobby; platform ADR 0026) has no bots, so nobody can play
   * a seat whose player left: the match ends as a win for the one who stayed, as in a room. The
   * player who left can come back with the table link, and the host starts a rematch.
   */
  protected onSeatLeave(): void {
    if (!this.isOver) this.endGame({ win: true, title: t('peerLeft'), delay: 300 });
  }

  private tex(side: Side): string { return side === 0 ? 'bg-w' : 'bg-b'; }

  private panelButton(x: number, y: number, icon: string, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(40);
    const face = this.add.graphics();
    const img = this.add.image(0, -14, icon).setDisplaySize(48, 48);
    const lab = txt(this, 0, 30, label, { title: true, size: 15, color: '#ffffff', strokeThickness: 0, shadow: false });
    c.add([face, img, lab]);
    c.setSize(124, 110).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => this.tweens.add({ targets: c, scale: 0.94, duration: 70 }));
    const up = () => this.tweens.add({ targets: c, scale: 1, duration: 160, ease: 'Back.easeOut' });
    c.on('pointerout', up);
    c.on('pointerup', () => { up(); if (c.getData('on')) onClick(); });
    c.setData('face', face);
    return c;
  }

  private paintButton(b: Phaser.GameObjects.Container, color: number): void {
    const g = b.getData('face') as Phaser.GameObjects.Graphics;
    const lighter = Phaser.Display.Color.IntegerToColor(color).lighten(18).color;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillRoundedRect(-62, -50, 124, 106, 18);
    g.fillStyle(color, 1).fillRoundedRect(-62, -54, 124, 104, 18);
    g.fillStyle(lighter, 0.45).fillRoundedRect(-56, -50, 112, 40, { tl: 14, tr: 14, bl: 6, br: 6 });
    g.lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(-62, -54, 124, 104, 18);
  }

  private setButtons(): void {
    const mineNow = this.turn === this.mine && (this.state === 'move' || this.state === 'done');
    const undo = mineNow && this.history.length > 0;
    const done = mineNow && this.state === 'done';
    for (const [b, on, col] of [[this.undoBtn, undo, 0x8a5428], [this.doneBtn, done, 0x2f9a48]] as const) {
      b.setData('on', on);
      b.setAlpha(on ? 1 : 0.4);
      this.paintButton(b, on ? col : 0x4a3020);
    }
    this.tweens.killTweensOf(this.doneBtn);
    this.doneBtn.setScale(1);
    if (done) this.tweens.add({ targets: this.doneBtn, scale: 1.08, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ---------------------------------------------------------------- layout
  private slot(side: Side, loc: number, k: number, n: number): { x: number; y: number } {
    const me = side === this.mine;
    if (loc === BAR) {
      const sp = n <= 1 ? 0 : Math.min(40, 200 / (n - 1));
      return { x: G.BARX, y: me ? G.MIDY + 56 + k * sp : G.MIDY - 56 - k * sp };
    }
    if (loc === OFF) return { x: G.TRAYX, y: me ? G.IY1 - 10 - k * 17 : G.IY0 + 10 + k * 17 };
    const v = me ? loc : 25 - loc;
    // stacks stay inside their half of the board: five checkers already close up a little
    const sp = n <= 1 ? 0 : Math.min(G.CK, (G.MIDY - G.IY0 - 14 - G.CK) / (n - 1));
    const y = isTop(v) ? G.IY0 + G.CK / 2 + k * sp : G.IY1 - G.CK / 2 - k * sp;
    return { x: pointX(v), y };
  }

  private makeChecker(side: Side): Phaser.GameObjects.Image {
    return checkerSize(this.add.image(G.BARX, G.MIDY, this.tex(side))).setDepth(10);
  }

  /** Moves checker sprites so they match the position (moves, hits, undo, new game). */
  private sync(ms = 260): void {
    for (const side of [0, 1] as Side[]) {
      const want = this.pos.p[side];
      const spare: Phaser.GameObjects.Image[] = [];
      const st = this.stacks[side];
      for (let loc = 0; loc <= 25; loc++) while (st[loc].length > want[loc]) spare.push(st[loc].pop()!);
      for (let loc = 0; loc <= 25; loc++) while (st[loc].length < want[loc]) st[loc].push(spare.pop() ?? this.makeChecker(side));
      spare.forEach((s) => s.destroy());
      for (let loc = 0; loc <= 25; loc++) {
        const n = st[loc].length;
        st[loc].forEach((s, k) => {
          const p = this.slot(side, loc, k, n);
          const off = loc === OFF;
          const wasOff = s.texture.key.startsWith('bg-slab');
          if (Math.abs(s.x - p.x) < 0.5 && Math.abs(s.y - p.y) < 0.5 && off === wasOff) { s.setDepth(10 + k * 0.1); return; }
          const far = Math.hypot(s.x - p.x, s.y - p.y) > 90;
          if (!off && wasOff) checkerSize(s.setTexture(this.tex(side)));
          this.tweens.killTweensOf(s);
          s.setDepth(far ? 60 : 10 + k * 0.1);
          if (ms <= 0) {
            s.setPosition(p.x, p.y);
            if (off) s.setTexture(`bg-slab-${side ? 'b' : 'w'}`).setDisplaySize(58, 14);
            return;
          }
          // the checker is lifted off the board: it grows a little on the way and lands
          // a new move of the same checker replaces the running arc
          (s.getData('arc') as Phaser.Tweens.Tween | undefined)?.stop();
          if (!wasOff) checkerSize(s);
          const sx = s.x, sy = s.y, base = s.scaleX;
          const dist = Math.hypot(p.x - sx, p.y - sy);
          const lift = Math.min(0.22, dist / 1400);
          const arcTween = this.tweens.addCounter({
            from: 0, to: 1, duration: far ? ms : ms * 0.6, ease: 'Cubic.easeInOut',
            onUpdate: (tw) => {
              const f = tw.getValue() ?? 0;
              const arc = Math.sin(f * Math.PI);
              s.setPosition(sx + (p.x - sx) * f, sy + (p.y - sy) * f - arc * Math.min(40, dist * 0.12));
              if (!off || f < 0.98) s.setScale(base * (1 + lift * arc));
            },
            onComplete: () => {
              s.setDepth(10 + k * 0.1);
              s.setPosition(p.x, p.y);
              if (off) s.setTexture(`bg-slab-${side ? 'b' : 'w'}`).setDisplaySize(58, 14);
              else s.setScale(base);
            },
          });
          s.setData('arc', arcTween);
        });
      }
    }
    this.drawCounts();
    this.updatePanel();
  }

  private drawCounts(): void {
    this.counts.forEach((c) => c.destroy());
    this.counts = [];
    for (const side of [0, 1] as Side[]) for (let loc = 1; loc <= 25; loc++) {
      const n = this.pos.p[side][loc];
      if (n < 6 && !(loc === BAR && n > 1)) continue;
      const p = this.slot(side, loc, n - 1, n);
      this.counts.push(txt(this, p.x, p.y, String(n), { title: true, size: 16, color: side ? '#ffffff' : '#201e1d', stroke: side ? '#000000' : '#ffffff', strokeThickness: 3, shadow: false }).setDepth(70));
    }
  }

  private updatePanel(): void {
    this.ptsMe.setText(String(pips(this.pos, this.mine)));
    this.ptsThem.setText(String(pips(this.pos, other(this.mine))));
    this.scoreText.setText(String(this.score));
    this.nameThem.setText(this.opponentName(14));
    fit(this.nameThem, 150);
    const fill = (dots: Phaser.GameObjects.Arc[], n: number, col: number) =>
      dots.forEach((d, i) => d.setFillStyle(i < n ? col : 0xffffff, i < n ? 1 : 0.18));
    fill(this.dotsMe, this.match[this.mine], GOLD);
    fill(this.dotsThem, this.match[other(this.mine)], THEM);
    this.gameText.setText(t('gameNo', { n: Math.max(1, this.gameNo) }));
    this.drawHud();
  }

  /** The turn label in the middle of the pill, shrunk to fit. */
  private setStatus(s: string, color: string): void {
    this.status.setText(s).setColor(color);
    fit(this.status, MID_W);
  }

  private opponentName(max = 14): string {
    return this.online ? clip(net.peerName || net.seats[other(this.mine)]?.name || t('opponent'), max) : t('d' + this.level);
  }

  /** The side to play is lit in its colour on the scoreboard chip. */
  private drawHud(): void {
    const g = this.hudG;
    if (!g) return;
    const L = HUD.x - HUD.w / 2;
    g.clear();
    if (this.turnAt <= 0 || this.isOver) return;
    const mineTurn = this.turn === this.mine;
    const x = mineTurn ? L + 4 : HUD.x + HUD.w / 2 - 4 - SIDE_W;
    g.fillStyle(mineTurn ? GOLD : THEM, 0.2).fillRoundedRect(x, HUD.y - HUD.h / 2 + 4, SIDE_W, HUD.h - 8, (HUD.h - 8) / 2);
    g.lineStyle(2, mineTurn ? GOLD : THEM, 0.9).strokeRoundedRect(x, HUD.y - HUD.h / 2 + 4, SIDE_W, HUD.h - 8, (HUD.h - 8) / 2);
  }

  /** A player's card: who they are, this match, and (for me) my record. */
  private openCard(side: Side): void {
    if (this.isOver || (isModalOpen(this) && !isPlayerCardOpen(this))) return;
    const you = side === this.mine;
    const st = this.stats[side];
    openPlayerCard(this, {
      name: you ? t('you') : this.online ? this.opponentName(18) : t('cpuName'),
      color: you ? GOLD : THEM,
      portrait: this.portraits[side],
      character: you || this.online ? this.looks[side] : null,
      bot: !you && !this.online ? t('d' + this.level) : false,
      you,
      match: [
        { label: t('stPoints'), value: this.match[side] },
        { label: t('stGames'), value: st.games },
        { label: t('stGammons'), value: st.gammons },
        { label: t('stHits'), value: st.hits },
        { label: t('stPips'), value: pips(this.pos, side) },
        { label: t('stOff'), value: this.pos.p[side][OFF] },
      ],
      lifetime: you ? lifetimeRows(currentGame().meta.id) : undefined,
    }, { onNext: () => this.openCard(other(side)) });
  }

  // ---------------------------------------------------------------- dice
  private showDice(side: Side, roll: [number, number], then: () => void): void {
    this.diceImgs.forEach((d) => d.destroy());
    this.diceImgs = [];
    const vals = diceList(roll);
    const me = side === this.mine;
    const cx = me ? (G.BAR1 + G.IX1) / 2 : (G.IX0 + G.BAR0) / 2;
    const col = side === 0 ? 'white' : 'red';
    const gap = vals.length === 4 ? 66 : 80;
    this.sfx('roll', { volume: 0.7 });
    vals.forEach((v, i) => {
      const x = cx + (i - (vals.length - 1) / 2) * gap;
      const d = this.add.image(x + (me ? 160 : -160), G.MIDY + rng.int(-40, 40), `die-${col}-${rng.int(1, 6)}`).setDisplaySize(DIED, DIED).setDepth(50);
      this.diceImgs.push(d);
      const size = d.scale;
      let n = 0;
      const spin = this.time.addEvent({ delay: 55, repeat: 6, callback: () => { n++; d.setTexture(`die-${col}-${n === 7 ? v : rng.int(1, 6)}`); } });
      // thrown in, it bounces once and settles slightly askew
      this.tweens.add({
        targets: d, x, y: G.MIDY, angle: (me ? -1 : 1) * 540 + rng.int(-14, 14), duration: 420, delay: i * 40, ease: 'Cubic.easeOut',
        onComplete: () => { spin.remove(); d.setTexture(`die-${col}-${v}`); },
      });
      this.tweens.add({ targets: d, scale: { from: size * 1.35, to: size }, duration: 420, delay: i * 40, ease: 'Bounce.easeOut' });
    });
    this.time.delayedCall(450, () => {
      this.sfx('land', { volume: 0.5 });
      if (roll[0] === roll[1]) popup(this, cx, G.MIDY - 70, t('doubles'), '#ffd23f', 26);
      then();
    });
  }

  /** Greys out the dice already used this turn. */
  private markDice(left: number[]): void {
    const rest = left.slice();
    const vals = diceList(this.roll);
    // dice are used from the right
    for (let i = vals.length - 1; i >= 0; i--) {
      const d = this.diceImgs[i];
      if (!d) continue;
      const k = rest.indexOf(vals[i]);
      if (k >= 0) { rest.splice(k, 1); d.setAlpha(1).clearTint(); } else d.setAlpha(0.35).setTint(0x888888);
    }
  }

  // ---------------------------------------------------------------- game flow
  private startGame(first: Side | null): void {
    this.gameNo++;
    this.pos = initial();
    this.history = [];
    this.stacks.forEach((side) => side.forEach((st) => { st.forEach((s) => s.destroy()); st.length = 0; }));
    this.sync(0);
    for (const side of this.stacks) for (const st of side) for (const s of st) {
      const y = s.y;
      s.setY(G.MIDY).setAlpha(0);
      this.tweens.add({ targets: s, y, alpha: 1, duration: 420, delay: rng.int(0, 300), ease: 'Back.easeOut' });
    }
    this.banner.setVisible(false);
    this.bannerBand.setVisible(false);
    this.diceImgs.forEach((d) => d.destroy());
    this.diceImgs = [];
    this.updatePanel();
    this.time.delayedCall(450, () => (first === null ? this.openingRoll() : this.beginTurn(first)));
  }

  /** One die each; the higher one plays first (a tie rolls again). */
  private openingRoll(): void {
    if (this.isOver) return;
    this.state = 'busy';
    this.setStatus(t('openRoll'), '#f0c98f');
    const mine = rng.int(1, 6), theirs = rng.int(1, 6);
    this.diceImgs.forEach((d) => d.destroy());
    this.diceImgs = [];
    this.sfx('roll', { volume: 0.7 });
    const throwDie = (side: Side, v: number) => {
      const me = side === this.mine;
      const x = me ? (G.BAR1 + G.IX1) / 2 : (G.IX0 + G.BAR0) / 2;
      const col = side === 0 ? 'white' : 'red';
      const d = this.add.image(x + (me ? 160 : -160), G.MIDY, `die-${col}-${rng.int(1, 6)}`).setDisplaySize(DIED, DIED).setDepth(50);
      const size = d.scale;
      this.diceImgs.push(d);
      let n = 0;
      const spin = this.time.addEvent({ delay: 55, repeat: 6, callback: () => { n++; d.setTexture(`die-${col}-${n === 7 ? v : rng.int(1, 6)}`); } });
      this.tweens.add({ targets: d, x, angle: (me ? -1 : 1) * 540, duration: 420, ease: 'Cubic.easeOut', onComplete: () => { spin.remove(); d.setTexture(`die-${col}-${v}`); } });
      this.tweens.add({ targets: d, scale: { from: size * 1.35, to: size }, duration: 420, ease: 'Bounce.easeOut' });
    };
    throwDie(this.mine, mine);
    throwDie(other(this.mine), theirs);
    this.time.delayedCall(480, () => {
      if (this.isOver) return;
      this.sfx('land', { volume: 0.5 });
      if (mine === theirs) {
        popup(this, (G.IX0 + G.IX1) / 2, G.MIDY - 80, t('openTie'), '#ffd23f', 28);
        this.time.delayedCall(900, () => this.openingRoll());
        return;
      }
      const first: Side = mine > theirs ? this.mine : other(this.mine);
      const win = this.diceImgs[first === this.mine ? 0 : 1];
      if (win) this.tweens.add({ targets: win, scale: win.scale * 1.18, duration: 160, yoyo: true, repeat: 1 });
      popup(this, (G.IX0 + G.IX1) / 2, G.MIDY - 80, first === this.mine ? t('youStart') : t('theyStart'), first === this.mine ? '#5dff7a' : '#7fd8ff', 30);
      this.time.delayedCall(1100, () => this.beginTurn(first));
    });
  }

  private beginTurn(side: Side): void {
    if (this.isOver) return;
    this.turn = side;
    // a warm glow behind whoever is to play
    this.rowGlow.setY(side === this.mine ? 206 : 296).setTint(side === this.mine ? GOLD : THEM);
    this.turnAt = this.time.now;
    this.tweens.add({ targets: this.rowGlow, alpha: 0.35, duration: 250 });
    this.history = [];
    this.sel = -1;
    this.clearHl();
    this.remoteRoll = null;
    if (side === this.mine) {
      this.state = 'wait';
      this.setStatus(t('yourTurn'), '#ffd23f');
      const sc = this.status.scale;
      this.tweens.add({ targets: this.status, scale: { from: sc * 1.3, to: sc }, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.nameMe, scale: { from: 1.25, to: 1 }, duration: 320, ease: 'Back.easeOut' });
      this.sfx('turn', { volume: 0.4 });
      // a big "your turn" over my half of the board
      const cue = txt(this, (G.BAR1 + G.IX1) / 2, G.MIDY - 120, t('yourTurn'), { title: true, size: 40, color: '#ffd23f' }).setDepth(75).setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: cue, scale: 1, alpha: 1, duration: 240, ease: 'Back.easeOut' });
      this.tweens.add({ targets: cue, alpha: 0, y: cue.y - 30, delay: 700, duration: 350, onComplete: () => cue.destroy() });
      this.time.delayedCall(150, () => {
        if (this.isOver) return;
        this.roll = rollDice();
        if (this.online) net.send('dice', { d: this.roll, n: this.turnNo } satisfies DiceMsg);
        this.showDice(side, this.roll, () => {
          this.dice = diceList(this.roll);
          this.startPick();
        });
      });
    } else if (this.online) {
      this.state = 'remote';
      this.setStatus(t('theirTurn'), '#7fd8ff');
      this.takeRemote();
    } else {
      this.state = 'ai';
      this.setStatus(t('aiTurn'), '#7fd8ff');
      this.time.delayedCall(300, () => this.aiTurn());
    }
    this.setButtons();
    this.drawHud();
  }

  /** The AI at the current level: evaluation noise (lower = stronger). */
  ai(): { level: number; noise: number } {
    return { level: this.level, noise: LEVELS[this.level] + (this.easy ? EASY_NOISE : 0) };
  }

  private aiTurn(): void {
    if (this.isOver || this.state !== 'ai') return;
    const side = other(this.mine);
    this.roll = rollDice();
    this.showDice(side, this.roll, () => {
      const seq = chooseTurn(this.pos, side, this.roll, this.ai().noise);
      this.time.delayedCall(350, () => this.playSteps(side, seq, () => this.endTurn(side)));
    });
  }

  private takeRemote(): void {
    while (this.state === 'remote' && !this.isOver && !this.rolling && this.inbox.length) {
      const msg = this.inbox[0];
      if (msg.d.n < this.turnNo) { this.inbox.shift(); continue; }
      if (msg.d.n > this.turnNo) return;
      if (msg.t === 'dice') {
        this.inbox.shift();
        if (this.remoteRoll) continue;
        const d = msg.d.d;
        if (![0, 1].every((i) => Number.isInteger(d[i]) && d[i] >= 1 && d[i] <= 6)) continue;
        const roll: [number, number] = [d[0], d[1]];
        this.roll = roll;
        this.rolling = true;
        this.showDice(other(this.mine), roll, () => {
          this.rolling = false;
          this.remoteRoll = roll;
          this.takeRemote();
        });
        return;
      }
      if (!this.remoteRoll) return;
      this.inbox.shift();
      const side = other(this.mine);
      const wire = msg.d.m.filter((w) => Array.isArray(w) && w.length === 3).map((w) => w.map(Number) as Wire);
      if (!playTurn(this.pos, side, this.remoteRoll, wire)) { console.warn('[backgammon] ignored an invalid turn', wire); continue; }
      // rebuild the steps (with their hits) on our copy
      let cur = this.pos, dice = diceList(this.remoteRoll);
      const steps: Step[] = [];
      for (const [from, to, die] of wire) {
        const m = legalSteps(cur, side, dice).find((x) => x.from === from && x.to === to && x.die === die)!;
        steps.push(m);
        cur = apply(cur, side, m);
        dice = removeDie(dice, die);
      }
      this.state = 'busy';
      this.playSteps(side, steps, () => this.endTurn(side));
      return;
    }
  }

  /** Animates the steps one by one (the other player or the AI). */
  private playSteps(side: Side, steps: Step[], done: () => void): void {
    if (!steps.length) {
      popup(this, (G.IX0 + G.IX1) / 2, G.MIDY - 90, t('noMoves'), '#ff7a4a', 28);
      this.sfx('error', { volume: 0.4 });
      this.time.delayedCall(1100, done);
      return;
    }
    let dice = diceList(this.roll);
    steps.forEach((m, i) => {
      this.time.delayedCall(i * 280, () => {
        if (this.isOver) return;
        this.pos = apply(this.pos, side, m);
        dice = removeDie(dice, m.die);
        this.markDice(dice);
        this.stepFx(side, m);
        this.sync(320);
      });
    });
    this.time.delayedCall(steps.length * 280 + 160, () => { if (!this.isOver) done(); });
  }

  private stepFx(side: Side, m: Step): void {
    const p = this.slot(side, m.to, Math.max(0, this.pos.p[side][m.to] - 1), this.pos.p[side][m.to]);
    this.time.delayedCall(220, () => {
      if (m.hit) {
        this.stats[side].hits++;
        // solo: the CPU reacts now and then
        if (!this.online) this.chat.botSay(other(this.mine), side === this.mine ? 'ohno' : 'haha', side === this.mine ? 0.35 : 0.2);
        this.sfxAt('hit', p.x, { volume: 0.7 });
        burst(this, p.x, p.y, side === 0 ? [0xffffff, 0xffd23f] : [0x333333, 0xff4f5e], 20, 280);
        shake(this, 0.008, 160);
        popup(this, p.x, p.y - 50, t('hit'), side === this.mine ? '#5dff7a' : '#ff7a4a', 26);
        if (side === this.mine) this.addScore(10);
      } else if (m.to === OFF) {
        this.sfxAt('off', p.x, { volume: 0.6 });
        burst(this, p.x, p.y, [0xffd23f, 0xffffff], 8, 160);
        if (side === this.mine) this.addScore(2);
      } else this.sfxAt(rng.chance(0.5) ? 'place' : 'place2', p.x, { volume: 0.6 });
    });
  }

  private startPick(): void {
    if (this.isOver) return;
    this.legal = legalSteps(this.pos, this.mine, this.dice);
    this.markDice(this.dice);
    this.sel = -1;
    if (!this.legal.length) {
      this.state = 'done';
      if (!this.history.length) {
        // nothing can be played with this roll: the turn passes
        popup(this, (G.BAR1 + G.IX1) / 2, G.MIDY - 90, t('noMoves'), '#ff7a4a', 28);
        this.sfx('error', { volume: 0.45 });
        this.clearHl();
        this.setButtons();
        this.time.delayedCall(1300, () => { if (this.state === 'done' && !this.history.length) this.confirm(); });
        return;
      }
      if (result(this.pos, this.mine)) { this.clearHl(); this.setButtons(); this.time.delayedCall(400, () => this.confirm()); return; }
      this.setStatus(t('confirm'), '#5dff7a');
      this.clearHl();
      this.setButtons();
      return;
    }
    this.state = 'move';
    this.setStatus(t('yourTurn'), '#ffd23f');
    const froms = this.sources();
    if (!froms.includes(this.cur)) this.cur = froms[0];
    if (froms.length === 1 && froms[0] === BAR) this.select(BAR, false);
    else this.drawHl();
    this.setButtons();
  }

  private sources(): number[] {
    return [...new Set(this.legal.map((m) => m.from))].sort((a, b) => b - a);
  }

  /** Where the checker on `from` can go this turn: one step, or several steps of the same checker. */
  private targetsFrom(from: number): Map<number, Step[]> {
    const res = new Map<number, Step[]>();
    const walk = (pos: Pos, dice: number[], at: number, chain: Step[]) => {
      for (const m of legalSteps(pos, this.mine, dice)) {
        if (m.from !== at) continue;
        const c = [...chain, m];
        const old = res.get(m.to);
        if (!old || old.length > c.length) res.set(m.to, c);
        if (m.to !== OFF) walk(apply(pos, this.mine, m), removeDie(dice, m.die), m.to, c);
      }
    };
    walk(this.pos, this.dice, from, []);
    return res;
  }

  private targetList(): number[] {
    // in the order the checker travels (nearest first), bearing off last
    return [...this.targets.keys()].sort((a, b) => (a === OFF ? -1 : a) - (b === OFF ? -1 : b)).reverse();
  }

  private select(from: number, sound = true): void {
    this.sel = from;
    this.targets = this.targetsFrom(from);
    const list = this.targetList();
    this.cur = list[0] ?? from;
    if (sound) this.sfx('pick', { volume: 0.5 });
    const st = this.stacks[this.mine][from];
    const top = st[st.length - 1];
    if (top) this.tweens.add({ targets: top, scale: top.scale * 1.12, duration: 90, yoyo: true });
    this.drawHl();
  }

  private deselect(): void {
    if (this.state !== 'move' || this.sel < 0) return;
    if (this.sel === BAR) return;
    this.cur = this.sel;
    this.sel = -1;
    this.drawHl();
  }

  private clearHl(): void {
    this.hl.clear();
    this.hlTop.clear();
    this.hlImgs.forEach((o) => o.destroy());
    this.hlImgs = [];
  }

  private colRect(loc: number): { x: number; y: number; w: number; h: number } {
    if (loc === BAR) return { x: G.BAR0, y: G.MIDY + 20, w: G.BAR1 - G.BAR0, h: G.IY1 - G.MIDY - 20 };
    if (loc === OFF) return { x: G.TRAY0, y: G.MIDY + 8, w: G.TRAY1 - G.TRAY0, h: G.IY1 - G.MIDY - 8 };
    const x = pointX(loc) - G.PW / 2;
    return isTop(loc) ? { x, y: G.IY0, w: G.PW, h: G.TRI + 20 } : { x, y: G.IY1 - G.TRI - 20, w: G.PW, h: G.TRI + 20 };
  }

  /** Lights up a point's triangle (or the tray) in a colour. */
  private lightPoint(loc: number, color: number, alpha: number): void {
    const g = this.hl;
    if (loc === OFF || loc === BAR) {
      const r = this.colRect(loc);
      g.fillStyle(color, alpha).fillRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8);
      return;
    }
    const x = pointX(loc), half = G.PW / 2 - 4;
    const base = isTop(loc) ? G.IY0 : G.IY1, tip = isTop(loc) ? G.IY0 + G.TRI : G.IY1 - G.TRI;
    g.fillStyle(color, alpha).fillTriangle(x - half, base, x + half, base, x, tip);
  }

  private glowAt(x: number, y: number, color: number, size: number, alpha = 0.8): void {
    this.hlImgs.push(this.add.image(x, y, 'tv-glow').setDisplaySize(size, size).setTint(color).setAlpha(alpha).setDepth(9).setBlendMode(Phaser.BlendModes.ADD));
  }

  private drawHl(): void {
    this.clearHl();
    if (this.state !== 'move') return;
    const top = this.hlTop;
    if (this.sel < 0) {
      // every checker that can move glows softly
      for (const f of this.sources()) {
        const n = this.pos.p[this.mine][f];
        const p = this.slot(this.mine, f, n - 1, n);
        this.glowAt(p.x, p.y, GREEN, G.CK * 1.9, 0.75);
        top.lineStyle(3, GREEN, 0.9).strokeCircle(p.x, p.y, G.CK / 2 + 3);
      }
    } else {
      const n = this.pos.p[this.mine][this.sel];
      const p = this.slot(this.mine, this.sel, n - 1, n);
      this.glowAt(p.x, p.y, GOLD, G.CK * 2.1, 0.9);
      top.lineStyle(4, GOLD, 1).strokeCircle(p.x, p.y, G.CK / 2 + 4);
      for (const [to, chain] of this.targets) {
        const col = chain.length > 1 ? CYAN : GREEN;
        this.lightPoint(to, col, 0.3);
        // a ghost of the checker where it would land
        const m = this.pos.p[this.mine][to];
        const q = to === OFF ? { x: G.TRAYX, y: G.IY1 - 10 - this.pos.p[this.mine][OFF] * 17 } : this.slot(this.mine, to, m, m + 1);
        if (to !== OFF) {
          const ghost = checkerSize(this.add.image(q.x, q.y, this.tex(this.mine))).setAlpha(0.42).setDepth(11);
          this.hlImgs.push(ghost);
        }
        top.lineStyle(3, col, 0.95).strokeCircle(q.x, q.y, to === OFF ? 16 : G.CK / 2 + 2);
        if (chain.length > 1) {
          // the dice this landing uses, as a small number badge
          const sum = chain.reduce((a, c) => a + c.die, 0);
          const b = txt(this, q.x, q.y, String(sum), { title: true, size: 18, color: '#0b2a33', strokeThickness: 0, shadow: false }).setDepth(13);
          this.hlImgs.push(b);
        }
      }
    }
    // keyboard cursor
    if (this.cur >= 0 && !this.sys.game.device.input.touch) {
      const r = this.colRect(this.cur);
      top.lineStyle(3, 0xffffff, 0.9).strokeRoundedRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10);
    }
  }

  // ---------------------------------------------------------------- input
  private locAt(x: number, y: number): number {
    if (y < G.IY0 - 10 || y > G.IY1 + 10) return -1;
    if (x >= G.TRAY0 - 6 && x <= G.TRAY1 + 10) return OFF;
    if (x >= G.BAR0 && x < G.BAR1) return BAR;
    if (x < G.IX0 || x >= G.IX1) return -1;
    const top = y < G.MIDY;
    if (x >= G.BAR1) {
      return top ? 19 + Math.floor((x - G.BAR1) / G.PW) : 1 + Math.floor((G.IX1 - x) / G.PW);
    }
    return top ? 13 + Math.floor((x - G.IX0) / G.PW) : 7 + Math.floor((G.BAR0 - x) / G.PW);
  }

  private tapAt(x: number, y: number): void {
    if (this.state !== 'move' || this.isOver) return;
    const loc = this.locAt(x, y);
    if (loc < 0) return;
    this.cur = loc;
    if (this.sel >= 0 && this.targets.has(loc)) { this.moveTo(loc); return; }
    if (this.sel === loc) {
      const first = this.targetList()[0];
      if (first !== undefined) this.moveTo(first);
      return;
    }
    if (this.sources().includes(loc)) { this.select(loc); return; }
    if (this.pos.p[this.mine][loc] > 0 && loc !== OFF) {
      this.sfx('error', { volume: 0.4 });
      const n = this.pos.p[this.mine][loc];
      const p = this.slot(this.mine, loc, n - 1, n);
      popup(this, p.x, p.y + (isTop(loc) ? 50 : -50), this.pos.p[this.mine][BAR] ? t('barFirst') : t('cantMove'), '#ff7a4a', 20);
    }
    this.drawHl();
  }

  private cycle(d: number): void {
    if (this.state !== 'move') return;
    const list = this.sel >= 0 ? this.targetList() : this.sources();
    if (!list.length) return;
    const k = list.indexOf(this.cur);
    this.cur = list[Phaser.Math.Wrap((k < 0 ? 0 : k) + d, 0, list.length)];
    this.sfx('move', { volume: 0.3 });
    this.drawHl();
  }

  /** Space / Enter / Up: pick up the checker under the cursor, put it down, or end the turn. */
  private act(): void {
    if (this.isOver) return;
    if (this.state === 'done') { this.confirm(); return; }
    if (this.state !== 'move') return;
    if (this.sel < 0) {
      const src = this.sources();
      this.select(src.includes(this.cur) ? this.cur : src[0]);
      return;
    }
    const to = this.targets.has(this.cur) ? this.cur : this.targetList()[0];
    if (to !== undefined) this.moveTo(to);
  }

  private moveTo(to: number): void {
    const chain = this.targets.get(to);
    if (!chain || this.state !== 'move') return;
    this.state = 'busy';
    this.clearHl();
    this.sel = -1;
    chain.forEach((m, i) => {
      this.time.delayedCall(i * 230, () => {
        this.history.push({ pos: this.pos, dice: this.dice, step: m });
        this.pos = apply(this.pos, this.mine, m);
        this.dice = removeDie(this.dice, m.die);
        this.markDice(this.dice);
        this.stepFx(this.mine, m);
        this.sync(240);
      });
    });
    this.time.delayedCall(chain.length * 230 + 60, () => {
      if (this.isOver) return;
      this.cur = to === OFF ? -1 : to;
      this.startPick();
    });
  }

  private undo(): void {
    if (this.isOver || this.turn !== this.mine || (this.state !== 'move' && this.state !== 'done')) return;
    const h = this.history.pop();
    if (!h) return;
    this.pos = h.pos;
    this.dice = h.dice;
    if (h.step.hit) this.stats[this.mine].hits = Math.max(0, this.stats[this.mine].hits - 1);
    this.sfx('undo', { volume: 0.5 });
    this.sync(220);
    this.cur = h.step.from;
    this.startPick();
  }

  private confirm(): void {
    if (this.state !== 'done' || this.turn !== this.mine || this.isOver) return;
    this.state = 'busy';
    if (this.online) net.send('turn', { m: this.history.map((h) => [h.step.from, h.step.to, h.step.die] as Wire), n: this.turnNo } satisfies TurnMsg);
    this.sfx('confirm', { volume: 0.5 });
    this.setButtons();
    this.endTurn(this.mine);
  }

  private endTurn(side: Side): void {
    if (this.isOver) return;
    this.turnNo++;
    this.state = 'busy';
    this.setButtons();
    const pts = result(this.pos, side);
    if (pts) { this.gameWon(side, pts); return; }
    this.time.delayedCall(150, () => this.beginTurn(other(side)));
  }

  private showBanner(s: string, color: string): void {
    this.banner.setText(s).setColor(color).setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 400, ease: 'Back.easeOut' });
    const w = Math.max(420, this.banner.width + 120);
    const cx = (G.IX0 + G.IX1) / 2;
    this.bannerBand.clear().setVisible(true).setAlpha(0);
    this.bannerBand.fillStyle(0x0b0705, 0.82).fillRoundedRect(cx - w / 2, G.MIDY - 56, w, 112, 28);
    this.bannerBand.lineStyle(3, Phaser.Display.Color.HexStringToColor(color).color, 0.8).strokeRoundedRect(cx - w / 2, G.MIDY - 56, w, 112, 28);
    this.tweens.add({ targets: this.bannerBand, alpha: 1, duration: 200 });
  }

  private hideBanner(): void {
    this.tweens.add({ targets: [this.banner, this.bannerBand], alpha: 0, duration: 250 });
  }

  private gameWon(side: Side, pts: number): void {
    this.state = 'busy';
    this.status.setText('');
    this.clearHl();
    this.match[side] += pts;
    this.stats[side].games++;
    if (pts === 2) this.stats[side].gammons++;
    this.turnAt = 0;
    this.updatePanel();
    const win = side === this.mine;
    const label = pts === 2 ? t('mars') : win ? t('gameWin') : t('gameLose');
    const cx = (G.IX0 + G.IX1) / 2;
    if (win) {
      this.showBanner(`${label} +${pts}`, '#5dff7a');
      flash(this, 0x5dff7a, 150);
      this.sfx('win', { volume: 0.7 });
      this.addScore(100 * pts + (pts === 2 ? 50 : 0), cx, G.MIDY - 80);
      for (let k = 0; k < 6; k++) this.time.delayedCall(k * 120, () => burst(this, rng.int(G.IX0 + 60, G.IX1 - 60), rng.int(G.IY0 + 60, G.IY1 - 60), [0xffd23f, 0xffffff, 0x5dff7a], 20, 300));
    } else {
      this.showBanner(`${label} +${pts}`, '#ff4f5e');
      flash(this, 0xec3013, 200);
      shake(this, 0.012, 300);
      this.sfx('lose', { volume: 0.6 });
    }
    // the new match dots pop in the pill
    const dots = win ? this.dotsMe : this.dotsThem;
    for (let i = this.match[side] - pts; i < Math.min(MATCH, this.match[side]); i++) {
      this.tweens.add({ targets: dots[i], scale: { from: 2.2, to: 1 }, duration: 520, delay: 120 * (i - this.match[side] + pts), ease: 'Back.easeOut' });
    }
    if (!this.online) this.chat.botSay(other(this.mine), win ? (pts === 2 ? 'lucky' : 'welldone') : 'gg', win ? 0.6 : 0.3);
    if (!this.online && win) this.level = Math.min(this.level + 1, this.easy ? EASY_TOP : LEVELS.length - 1);

    const me = this.match[this.mine], them = this.match[other(this.mine)];
    if (me >= MATCH || them >= MATCH) {
      const matchWin = me >= MATCH;
      if (matchWin) this.addScore(300 + 50 * (me - them));
      recordMatch(currentGame().meta.id, { won: matchWin, score: this.score });
      this.time.delayedCall(1600, () => {
        this.showBanner(matchWin ? t('matchWin') : t('matchLose'), matchWin ? '#ffd23f' : '#ff4f5e');
        if (matchWin) this.sfx('fanfare', { volume: 0.7 });
      });
      this.time.delayedCall(2850, () => this.hideBanner());
      this.endGame({ win: matchWin, title: matchWin ? t('youWin') : t('youLose'), delay: 3200 });
      return;
    }
    // the winner of a game opens the next one
    this.time.delayedCall(2600, () => {
      if (this.isOver) return;
      this.hideBanner();
      this.sfx('clear', { volume: 0.6 });
      this.startGame(side);
    });
  }

  addScore(n: number, x?: number, y?: number): void {
    super.addScore(n, x, y);
    this.scoreText?.setText(String(this.score));
  }

  updateGame(): void {
    // turn-based: driven by input, timers and tweens; solo, a slow player may hear from the CPU
    if (!this.online && !this.slowSaid && this.turn === this.mine && this.turnAt > 0 && this.state === 'move' && this.time.now - this.turnAt > SLOW_MS) {
      this.slowSaid = true;
      this.chat.botSay(other(this.mine), 'hurry', 0.6);
    }
  }
}

/** Shrinks a text to a width (labels in the pill). */
function fit(o: Phaser.GameObjects.Text, w: number): void {
  o.setScale(1);
  if (o.width > w) o.setScale(w / o.width);
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
