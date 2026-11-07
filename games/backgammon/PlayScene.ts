import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, txt, t, rng, net } from '@core';
import {
  BAR, OFF, LEVELS, initial, apply, legalSteps, rollDice, diceList, removeDie, playTurn, result, chooseTurn, pips, other,
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

export class PlayScene extends ArcadeScene {
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
  private online = false;
  private turnNo = 0;
  private inbox: Array<{ t: 'dice'; d: DiceMsg } | { t: 'turn'; d: TurnMsg }> = [];
  private remoteRoll: [number, number] | null = null;
  private rolling = false;

  createGame(): void {
    this.pos = initial();
    this.stacks = [0, 1].map(() => Array.from({ length: 26 }, () => [] as Phaser.GameObjects.Image[]));
    this.counts = [];
    this.state = 'wait'; this.turn = 0; this.roll = [1, 1]; this.dice = []; this.history = []; this.legal = [];
    this.sel = -1; this.targets = new Map(); this.cur = -1; this.diceImgs = []; this.hlImgs = []; this.dotsMe = []; this.dotsThem = [];
    this.match = [0, 0]; this.gameNo = 0; this.level = 0;
    this.online = net.active;
    this.mine = this.online ? (net.seat as Side) : 0;
    this.turnNo = 0; this.inbox = []; this.remoteRoll = null; this.rolling = false;
    this.cameras.main.setBackgroundColor('#160d07');
    drawBoard(this);
    this.hl = this.add.graphics().setDepth(5);
    this.hlTop = this.add.graphics().setDepth(12);
    this.tweens.add({ targets: [this.hl], alpha: { from: 1, to: 0.55 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.bannerBand = this.add.graphics().setDepth(79).setVisible(false);

    this.status = txt(this, 560, 48, '', { title: true, size: 22, color: '#ffd23f' }).setDepth(30);
    this.banner = txt(this, (G.IX0 + G.IX1) / 2, G.MIDY, '', { title: true, size: 46, strokeThickness: 10 }).setDepth(80).setVisible(false);

    // right panel: match score, pips, undo and done
    const px = 1210;
    const plaque = this.add.graphics();
    plaque.fillStyle(0x000000, 0.45).fillRoundedRect(px - 62, 124, 124, 300, 16);
    plaque.fillStyle(0x3a1e0b, 1).fillRoundedRect(px - 64, 120, 124, 300, 16);
    plaque.lineStyle(2, 0xf0c98f, 0.35).strokeRoundedRect(px - 63, 121, 122, 298, 15);
    this.rowGlow = this.add.image(px, 236, 'tv-glow').setDisplaySize(170, 120).setTint(GOLD).setAlpha(0);
    this.tweens.add({ targets: this.rowGlow, scale: { from: this.rowGlow.scale * 0.92, to: this.rowGlow.scale * 1.05 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    txt(this, px, 148, t('matchTo', { n: MATCH }), { title: true, size: 13, color: '#f0c98f', wrap: 150 });
    this.add.image(px - 40, 196, this.tex(this.mine)).setDisplaySize(34, 34);
    txt(this, px + 14, 196, t('you'), { size: 22, color: '#ffffff' }).setOrigin(0.5);
    this.ptsMe = txt(this, px, 236, '0', { title: true, size: 32, color: '#ffd23f' });
    this.pipMe = txt(this, px, 266, '', { size: 18, color: '#d9b48a' });
    this.add.image(px - 40, 316, this.tex(other(this.mine))).setDisplaySize(34, 34);
    for (let i = 0; i < MATCH; i++) {
      const dx = px - 32 + i * 16;
      this.dotsMe.push(this.add.circle(dx, 290, 5, 0x000000, 0.4).setStrokeStyle(1.5, GOLD, 0.7));
      this.dotsThem.push(this.add.circle(dx, 410, 5, 0x000000, 0.4).setStrokeStyle(1.5, 0x7fd8ff, 0.7));
    }
    this.nameThem = txt(this, px + 14, 316, '', { size: 20, color: '#ffffff', wrap: 100 }).setOrigin(0.5);
    this.ptsThem = txt(this, px, 356, '0', { title: true, size: 32, color: '#7fd8ff' });
    this.pipThem = txt(this, px, 386, '', { size: 18, color: '#d9b48a' });
    this.undoBtn = this.panelButton(px, 480, 'bg-undo', t('undo'), () => this.undo());
    this.doneBtn = this.panelButton(px, 610, 'bg-ok', t('done'), () => this.confirm());
    this.setButtons();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tapAt(p.x, p.y));
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.cycle(-1)); kb?.on('keydown-A', () => this.cycle(-1));
    kb?.on('keydown-RIGHT', () => this.cycle(1)); kb?.on('keydown-D', () => this.cycle(1));
    for (const k of ['SPACE', 'ENTER', 'UP', 'W', 'Z']) kb?.on(`keydown-${k}`, () => this.act());
    kb?.on('keydown-DOWN', () => this.deselect()); kb?.on('keydown-S', () => this.deselect());
    for (const k of ['X', 'BACKSPACE', 'U']) kb?.on(`keydown-${k}`, () => this.undo());

    if (this.online) {
      net.onScene(this, 'dice', (d: DiceMsg) => { if (d && Array.isArray(d.d)) { this.inbox.push({ t: 'dice', d }); this.takeRemote(); } });
      net.onScene(this, 'turn', (d: TurnMsg) => { if (d && Array.isArray(d.m)) { this.inbox.push({ t: 'turn', d }); this.takeRemote(); } });
    }
    if (this.online && net.isHost) {
      // the host rolls the first dice once the guest's board is up (or after a short wait), so
      // the guest always sees the opening roll
      this.status.setText(t('waitPeer')).setColor('#7fd8ff');
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
    this.ptsMe.setText(String(this.match[this.mine]));
    this.ptsThem.setText(String(this.match[other(this.mine)]));
    this.pipMe.setText(t('pips', { n: pips(this.pos, this.mine) }));
    this.pipThem.setText(t('pips', { n: pips(this.pos, other(this.mine)) }));
    const name = this.online ? clip(net.peerName || t('opponent'), 10) : t('d' + this.level);
    this.nameThem.setText(name);
    this.dotsMe.forEach((d, i) => d.setFillStyle(i < this.match[this.mine] ? GOLD : 0x000000, i < this.match[this.mine] ? 1 : 0.4));
    this.dotsThem.forEach((d, i) => d.setFillStyle(i < this.match[other(this.mine)] ? 0x7fd8ff : 0x000000, i < this.match[other(this.mine)] ? 1 : 0.4));
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
    this.status.setText(t('openRoll')).setColor('#f0c98f');
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
    this.rowGlow.setY(side === this.mine ? 236 : 356).setTint(side === this.mine ? GOLD : 0x7fd8ff);
    this.tweens.add({ targets: this.rowGlow, alpha: 0.35, duration: 250 });
    this.history = [];
    this.sel = -1;
    this.clearHl();
    this.remoteRoll = null;
    if (side === this.mine) {
      this.state = 'wait';
      this.status.setText(t('yourTurn')).setColor('#ffd23f');
      this.tweens.add({ targets: this.status, scale: { from: 1.3, to: 1 }, duration: 260, ease: 'Back.easeOut' });
      this.sfx('turn', { volume: 0.4 });
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
      this.status.setText(t('theirTurn')).setColor('#7fd8ff');
      this.takeRemote();
    } else {
      this.state = 'ai';
      this.status.setText(t('aiTurn')).setColor('#7fd8ff');
      this.time.delayedCall(300, () => this.aiTurn());
    }
    this.setButtons();
  }

  private aiTurn(): void {
    if (this.isOver || this.state !== 'ai') return;
    const side = other(this.mine);
    this.roll = rollDice();
    this.showDice(side, this.roll, () => {
      const seq = chooseTurn(this.pos, side, this.roll, LEVELS[this.level]);
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
      this.status.setText(t('confirm')).setColor('#5dff7a');
      this.clearHl();
      this.setButtons();
      return;
    }
    this.state = 'move';
    this.status.setText(t('yourTurn')).setColor('#ffd23f');
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
    const t0 = win ? this.ptsMe : this.ptsThem;
    t0.setScale(1.8);
    this.tweens.add({ targets: t0, scale: 1, duration: 500, ease: 'Back.easeOut' });
    if (!this.online && win) this.level = Math.min(this.level + 1, LEVELS.length - 1);

    const me = this.match[this.mine], them = this.match[other(this.mine)];
    if (me >= MATCH || them >= MATCH) {
      const matchWin = me >= MATCH;
      if (matchWin) this.addScore(300 + 50 * (me - them));
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

  updateGame(): void {
    /* turn-based: driven by input, timers and tweens */
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
