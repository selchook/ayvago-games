import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, t, rng, net, upper } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';

// Lane geometry (720 x 1280 world, top-down, pins at the top)
const LANE_L = 230, LANE_R = 490, LANE_C = 360, GUT = 30;
const FOUL_Y = 1110, BALL_Y = 1150, PIT_Y = 232, OIL_END = 780;
const BALL_R = 22, PIN_R = 13, DOWN_R = 20;
const HOOK = 330, SUB = 5;
const SPOTS: Array<[number, number]> = [
  [360, 440], [330, 388], [390, 388], [300, 336], [360, 336], [420, 336], [270, 284], [330, 284], [390, 284], [450, 284],
];
// card layout
const CARD_X = 24, CARD_Y = 94, FW = 64, LAST_W = 96, CARD_H = 86;

// online card: two rows (own row on top), no core HUD
const ON_X = 80, ON_FW = 60, ON_LAST = 90, ON_Y = [10, 80], ON_BOX = 30, ON_ROW = 62;
const SEND_MS = 50;           // ~20 snapshots per second while a throw is on

type Phase = 'position' | 'power' | 'spin' | 'rolling' | 'settle' | 'wait';
const PHASES: Phase[] = ['position', 'power', 'spin', 'rolling', 'settle', 'wait'];
/** Throw snapshot: turn number, phase, ball [x, y, gone], aim/power/spin ×1000, pins [x, y, state, angle]×10. */
interface ThrowSnap { t: number; ph: number; b: number[]; a: number; w: number; s: number; p?: number[] }
/** Final result of a roll: turn number, pins knocked, bitmask of the pins still standing, gutter ball. */
interface RollMsg { t: number; k: number; u: number; g: number }
interface Pin { i: number; x: number; y: number; vx: number; vy: number; up: boolean; out: boolean; img: Phaser.GameObjects.Image; hitSfx: number }

export function makeBowlingTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('bw-pin')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x000000, 0.25).fillCircle(18, 19, 14);
  g.fillStyle(0xf7f4ee, 1).fillCircle(16, 16, 13);
  g.lineStyle(3, 0xd62828, 1).strokeCircle(16, 16, 7);
  g.fillStyle(0xffffff, 1).fillCircle(16, 16, 4);
  g.generateTexture('bw-pin', 34, 34);
  g.clear();
  // fallen pin seen from above: belly, neck stripes, head
  g.fillStyle(0x000000, 0.25).fillEllipse(26, 14, 46, 16);
  g.fillStyle(0xf7f4ee, 1).fillEllipse(16, 12, 26, 18).fillRoundedRect(16, 8, 20, 8, 4).fillCircle(38, 12, 6);
  g.fillStyle(0xd62828, 1).fillRect(26, 7, 3, 10).fillRect(31, 7, 3, 10);
  g.generateTexture('bw-pin-down', 46, 24);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private laneG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private cardG!: Phaser.GameObjects.Graphics;
  private ball!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private marks: Phaser.GameObjects.Text[] = [];
  private totals: Phaser.GameObjects.Text[] = [];
  private pins: Pin[] = [];
  private frames: number[][] = [];
  private frame = 0;
  private standingAtThrow = 0;
  private phase: Phase = 'wait';
  private phaseT = 0;
  private startX = LANE_C;
  private bx = LANE_C; private by = BALL_Y; private bvx = 0; private bvy = 0;
  private aim = 0; private power = 0; private spin = 0;
  private gutter = false;
  private ballGone = false;
  private settleT = 0;
  private strikeRun = 0;
  private dragId = -1;
  private dragStartX = 0;
  private dragBallX = 0;
  private dragMoved = false;
  private rollSfxT = 0;
  private crashPlayed = false;
  // online: players alternate frames (the round's starter, net.starter, first); the thrower is
  // authoritative for its throw
  private online = false;
  private seat: 0 | 1 = 0;
  private turnSeat: 0 | 1 = 0;
  private turnNo = 0;                         // frame * 2 + order (0 = starter) of the turn being bowled
  private allFrames: number[][][] = [[], []];
  private rowMarks: Phaser.GameObjects.Text[][] = [[], []];
  private rowTotals: Phaser.GameObjects.Text[][] = [[], []];
  private runs: number[] = [0, 0];
  private turnText!: Phaser.GameObjects.Text;
  private sendT = 0;
  private started = false;
  private watchBx = LANE_C; private watchBy = BALL_Y;
  private pinTargets: number[] | null = null;

  createGame(): void {
    freshTextCanvases(this);
    makeBowlingTextures(this);
    this.textures.get('ball').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.pins = []; this.frames = []; this.marks = []; this.totals = [];
    this.startX = LANE_C; this.frame = 0; this.standingAtThrow = 0; this.phase = 'wait'; this.phaseT = 0;
    this.bx = LANE_C; this.by = BALL_Y; this.bvx = this.bvy = 0; this.aim = this.power = this.spin = 0;
    this.gutter = false; this.ballGone = false; this.settleT = 0; this.strikeRun = 0;
    this.dragId = -1; this.dragMoved = false; this.rollSfxT = 0; this.crashPlayed = false;
    this.online = net.active; this.seat = net.seat; this.turnSeat = this.online ? net.starter : 0; this.turnNo = 0;
    this.allFrames = [[], []]; this.rowMarks = [[], []]; this.rowTotals = [[], []]; this.runs = [0, 0];
    this.sendT = 0; this.started = false; this.watchBx = LANE_C; this.watchBy = BALL_Y; this.pinTargets = null;
    this.useHud = !this.online;

    this.laneG = this.add.graphics().setDepth(0);
    this.cardG = this.add.graphics().setDepth(10);
    this.fxG = this.add.graphics().setDepth(4);
    this.drawLane();
    if (this.online) this.buildOnlineCard(); else this.buildCard();
    this.ball = this.add.image(this.bx, this.by, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2).setDepth(5);
    this.hint = ftxt(this, 360, 1196, '', { size: 26, color: '#ffd23f' }).setDepth(12);

    this.controls = new Controls(this);
    for (const k of ['SPACE', 'Z', 'ENTER', 'UP', 'W']) this.input.keyboard?.on(`keydown-${k}`, () => this.lock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 590 && p.y < 140) return;
      this.dragId = p.id; this.dragStartX = p.x; this.dragBallX = this.bx; this.dragMoved = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.dragId || !p.isDown || this.phase !== 'position' || !this.myTurn()) return;
      if (Math.abs(p.x - this.dragStartX) > 14) this.dragMoved = true;
      if (this.dragMoved) this.bx = this.clampBallX(this.dragBallX + (p.x - this.dragStartX));
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.dragId) return;
      this.dragId = -1;
      if (!this.dragMoved) this.lock();
    });

    this.hud.setRight(`${t('frame')} 1/10`);
    this.rack(true);
    if (this.online) { this.setupOnline(); return; }
    this.time.delayedCall(700, () => this.newThrow());
  }

  // ---------------------------------------------------------------- drawing
  private drawLane(): void {
    const g = this.laneG;
    g.clear();
    g.fillStyle(0x120c18, 1).fillRect(0, 0, 720, 1280);
    // side walls / masking
    g.fillStyle(0x2a1d38, 1).fillRect(LANE_L - GUT - 26, 186, LANE_R - LANE_L + GUT * 2 + 52, 1094);
    // gutters
    g.fillStyle(0x3b3f4a, 1).fillRoundedRect(LANE_L - GUT, 200, GUT, FOUL_Y - 200 + 70, 12).fillRoundedRect(LANE_R, 200, GUT, FOUL_Y - 200 + 70, 12);
    g.fillStyle(0x23262e, 1).fillRect(LANE_L - GUT + 8, 200, GUT - 16, FOUL_Y - 130).fillRect(LANE_R + 8, 200, GUT - 16, FOUL_Y - 130);
    // pit
    g.fillStyle(0x07050a, 1).fillRect(LANE_L - GUT, 186, LANE_R - LANE_L + GUT * 2, PIT_Y - 186);
    // wood
    g.fillStyle(0xd9a066, 1).fillRect(LANE_L, PIT_Y, LANE_R - LANE_L, FOUL_Y - PIT_Y);
    g.fillStyle(0xe6b67e, 1).fillRect(LANE_L, PIT_Y, LANE_R - LANE_L, 250);          // pin deck (lighter maple)
    for (let x = LANE_L + 13; x < LANE_R; x += 13) {
      g.fillStyle(0x000000, (x / 13) % 2 ? 0.06 : 0.03).fillRect(x, PIT_Y, 1, FOUL_Y - PIT_Y);
    }
    // oil sheen on the front part of the lane
    g.fillStyle(0xffffff, 0.07).fillRect(LANE_L, OIL_END, LANE_R - LANE_L, FOUL_Y - OIL_END);
    // targeting arrows and dots
    g.fillStyle(0x7a3b12, 1);
    for (let i = -3; i <= 3; i++) {
      const x = LANE_C + i * 33, y = 860 + Math.abs(i) * 22;
      g.fillTriangle(x, y - 14, x - 8, y + 10, x + 8, y + 10);
    }
    for (let i = -4; i <= 4; i++) if (i) g.fillCircle(LANE_C + i * 26, 1040, 3);
    // pin spots
    g.fillStyle(0x8a5a2b, 0.5);
    for (const [x, y] of SPOTS) g.fillCircle(x, y, 4);
    // foul line + approach
    g.fillStyle(0xc9302c, 1).fillRect(LANE_L - GUT, FOUL_Y, LANE_R - LANE_L + GUT * 2, 5);
    g.fillStyle(0xc89058, 1).fillRect(LANE_L - GUT, FOUL_Y + 5, LANE_R - LANE_L + GUT * 2, 70);
    // meters
    g.fillStyle(0x000000, 0.5).fillRoundedRect(600, 640, 44, 460, 10);
    g.lineStyle(4, 0xffffff, 0.7).strokeRoundedRect(600, 640, 44, 460, 10);
    g.fillStyle(0x000000, 0.5).fillRoundedRect(160, 1232, 400, 28, 10);
    g.lineStyle(4, 0xffffff, 0.7).strokeRoundedRect(160, 1232, 400, 28, 10);
    g.fillStyle(0xffffff, 0.5).fillRect(358, 1232, 4, 28);
    ftxt(this, 622, 616, t('power'), { title: true, size: 14, color: '#f3f2f2' }).setDepth(2);
    ftxt(this, 110, 1246, t('spin'), { title: true, size: 14, color: '#f3f2f2' }).setDepth(2);
    // mini rack panel
    g.fillStyle(0x000000, 0.45).fillRoundedRect(25, 622, 160, 168, 14);
  }

  private buildCard(): void {
    const g = this.cardG;
    g.clear();
    for (let f = 0; f < 10; f++) {
      const x = CARD_X + f * FW, w = f === 9 ? LAST_W : FW;
      g.fillStyle(0xf3f2f2, 1).fillRect(x, CARD_Y, w, CARD_H);
      g.lineStyle(3, 0x201e1d, 1).strokeRect(x, CARD_Y, w, CARD_H);
      const boxes = f === 9 ? 3 : 2;
      const bw = f === 9 ? 32 : 30;
      for (let b = 0; b < boxes; b++) {
        const bx = x + w - (boxes - b) * bw;
        g.lineStyle(2, 0x201e1d, 1).strokeRect(bx, CARD_Y, bw, 36);
        this.marks.push(ftxt(this, bx + bw / 2, CARD_Y + 19, '', { title: true, size: 16, color: '#201e1d', strokeThickness: 0, shadow: false }).setDepth(11));
      }
      this.totals.push(ftxt(this, x + w / 2, CARD_Y + 62, '', { title: true, size: 18, color: '#201e1d', strokeThickness: 0, shadow: false }).setDepth(11));
    }
  }

  // ---------------------------------------------------------------- pins
  private rack(full: boolean): void {
    if (full) {
      for (const p of this.pins) p.img.destroy();
      this.pins = SPOTS.map(([x, y], i) => {
        const img = this.add.image(x, y - 40, 'bw-pin').setDepth(3).setAlpha(0);
        this.tweens.add({ targets: img, y, alpha: 1, duration: 260, delay: i * 35, ease: 'Bounce.easeOut' });
        return { i, x, y, vx: 0, vy: 0, up: true, out: false, img, hitSfx: 0 };
      });
      this.sfx('reset', { volume: 0.4 });
    } else {
      // sweep fallen pins, re-spot standing ones
      for (const p of this.pins) {
        if (!p.up && !p.out) {
          p.out = true;
          this.tweens.add({ targets: p.img, alpha: 0, y: p.img.y - 30, duration: 300 });
        } else if (p.up) {
          p.x = SPOTS[p.i][0]; p.y = SPOTS[p.i][1]; p.vx = p.vy = 0;
          this.tweens.add({ targets: p.img, x: p.x, y: p.y, angle: 0, duration: 250 });
        }
      }
    }
  }

  private standingCount(): number {
    return this.pins.filter((p) => p.up && !p.out).length;
  }

  // ---------------------------------------------------------------- throw cycle
  private clampBallX(x: number): number {
    return Phaser.Math.Clamp(x, LANE_L + BALL_R + 2, LANE_R - BALL_R - 2);
  }

  private newThrow(): void {
    if (this.isOver) return;
    this.phase = 'position';
    this.phaseT = rng.int(0, 100) / 100;
    this.bx = this.startX; this.by = BALL_Y; this.bvx = this.bvy = 0;
    this.gutter = false; this.ballGone = false; this.crashPlayed = false;
    this.ball.setPosition(this.bx, this.by).setDisplaySize(BALL_R * 2, BALL_R * 2).setAlpha(0).setAngle(0);
    this.tweens.add({ targets: this.ball, alpha: 1, duration: 200 });
    this.standingAtThrow = this.standingCount();
    this.hint.setText(t('aimHint'));
    const f = this.frames[this.frame] ?? [];
    if (this.frame === 9 && f.length === 2) this.banner(t('bonusRoll'), '#3ee6ff');
    else if (this.frame === 9 && f.length === 0) this.banner(t('lastFrame'), '#3ee6ff');
  }

  /** Speed of the oscillating meters rises frame by frame. */
  private meterSpeed(): number {
    return 1 + this.frame * 0.09;
  }

  private lock(): void {
    if (this.isOver || !this.myTurn()) return;
    if (this.phase === 'position') {
      this.phase = 'power'; this.phaseT = 0;
      this.hint.setText(t('powerHint'));
      this.sfx('lock', { volume: 0.5 });
    } else if (this.phase === 'power') {
      this.phase = 'spin'; this.phaseT = 0;
      this.hint.setText(t('spinHint'));
      this.sfx('lock', { volume: 0.5, rate: 1.15 });
    } else if (this.phase === 'spin') {
      this.sfx('lock', { volume: 0.5, rate: 1.3 });
      this.release();
    }
  }

  private release(): void {
    this.phase = 'rolling';
    this.startX = this.bx;
    this.hint.setText('');
    const speed = 640 + this.power * 660;
    this.bvx = Math.sin(this.aim) * speed;
    this.bvy = -Math.cos(this.aim) * speed;
    this.rollSfxT = 0;
    this.sfx('throw', { volume: 0.6 });
    shake(this, 0.003, 120);
  }

  private onRollDone(): void {
    const knocked = this.standingAtThrow - this.standingCount();
    if (this.online) this.sendRoll(knocked);
    this.resolveRoll(knocked);
  }

  /** Records a roll of the current player, shows the feedback and moves the game on. */
  private resolveRoll(knocked: number): void {
    const f = (this.frames[this.frame] ??= []);
    f.push(knocked);
    const first = f.length === 1;
    const total10 = f.reduce((a, b) => a + b, 0);
    // feedback
    let strike = false, spare = false;
    if (this.frame < 9) {
      strike = first && knocked === 10;
      spare = !first && f[0] + f[1] === 10;
    } else {
      strike = knocked === 10 && this.standingAtThrow === 10;
      spare = !strike && this.standingAtThrow < 10 && this.standingCount() === 0;
    }
    if (strike) {
      this.strikeRun++;
      const label = this.strikeRun >= 3 ? t('turkey') : this.strikeRun === 2 ? t('double') : t('strike');
      this.banner(label, '#ffd23f', 52);
      this.sfx('strike', { volume: 0.6 });
      softFlash(this, 0xffd23f, 200);
      shake(this, 0.014, 350);
      for (let i = 0; i < 3; i++) this.time.delayedCall(i * 160, () => burst(this, rng.int(260, 460), rng.int(260, 460), [0xffd23f, 0xec3013, 0x3ee6ff, 0xffffff], 40, 520));
    } else if (spare) {
      this.strikeRun = 0;
      this.banner(t('spare'), '#5dff7a', 48);
      this.sfx('spare', { volume: 0.6 });
      softFlash(this, 0x5dff7a, 150);
      burst(this, 360, 360, [0x5dff7a, 0xffffff], 40, 420);
    } else {
      this.strikeRun = 0;
      if (this.gutter && knocked === 0) { this.banner(t('gutter'), '#ec3013', 40); this.sfx('meh', { volume: 0.5 }); }
      else if (knocked === 0) { this.banner(t('nopins'), '#ec3013', 34); this.sfx('meh', { volume: 0.5 }); }
      else if (first && this.isSplit()) this.banner(t('split'), '#ff4fa3', 40);
      else fpopup(this, 360, 560, t('pins', { n: knocked }), '#ffffff', 30);
    }
    this.updateCard();

    // advance
    let frameDone: boolean, resetRack: boolean;
    if (this.frame < 9) {
      frameDone = strike || f.length === 2;
      resetRack = frameDone;
    } else {
      const bonus = f[0] === 10 || (f.length >= 2 && f[0] + f[1] === 10);
      frameDone = f.length === 3 || (f.length === 2 && !bonus);
      resetRack = !frameDone && this.standingCount() === 0;
      void total10;
    }
    this.phase = 'wait';
    this.time.delayedCall(1100, () => {
      if (this.isOver) return;
      if (this.online) { this.advanceOnline(frameDone, resetRack); return; }
      if (frameDone) {
        if (this.frame === 9) { this.finish(); return; }
        this.frame++;
        this.hud.setRight(`${t('frame')} ${this.frame + 1}/10`);
        this.rack(true);
      } else this.rack(resetRack);
      this.time.delayedCall(450, () => this.newThrow());
    });
  }

  private isSplit(): boolean {
    const up = this.pins.filter((p) => p.up && !p.out).map((p) => p.i);
    if (up.length < 2 || up.includes(0)) return false;
    // standing pins that are not neighbours of each other (columns differ by more than one gap)
    const xs = up.map((i) => SPOTS[i][0]).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 70) return true;
    return false;
  }

  private finish(): void {
    const total = this.computeTotals().filter((v) => v !== null).pop() ?? 0;
    this.setScore(total as number);
    this.endGame({ win: total >= 150, title: total === 300 ? t('perfect') : undefined, delay: 500 });
  }

  // ---------------------------------------------------------------- scoring
  private computeTotals(): Array<number | null> {
    const rolls = this.frames.flat();
    const out: Array<number | null> = [];
    let i = 0, sum = 0;
    for (let f = 0; f < 10; f++) {
      const fr = this.frames[f];
      if (!fr || !fr.length) { out.push(null); continue; }
      if (f === 9) {
        const bonus = fr[0] === 10 || (fr.length >= 2 && fr[0] + fr[1] === 10);
        const done = fr.length === 3 || (fr.length === 2 && !bonus);
        if (!done) { out.push(null); continue; }
        sum += fr.reduce((a, b) => a + b, 0);
        out.push(sum);
        continue;
      }
      if (fr[0] === 10) {
        if (rolls[i + 1] === undefined || rolls[i + 2] === undefined) { out.push(null); i += 1; continue; }
        sum += 10 + rolls[i + 1] + rolls[i + 2];
        i += 1;
      } else if (fr.length === 2 && fr[0] + fr[1] === 10) {
        if (rolls[i + 2] === undefined) { out.push(null); i += 2; continue; }
        sum += 10 + rolls[i + 2];
        i += 2;
      } else if (fr.length === 2) {
        sum += fr[0] + fr[1];
        i += 2;
      } else { out.push(null); i += fr.length; continue; }
      out.push(sum);
    }
    // a frame can only show a total once every earlier frame has one
    for (let f = 1; f < 10; f++) if (out[f - 1] === null) out[f] = null;
    return out;
  }

  private markFor(f: number): string[] {
    const fr = this.frames[f] ?? [];
    const d = (n: number) => (n === 0 ? '-' : String(n));
    if (f < 9) {
      if (fr[0] === 10) return ['', 'X'];
      const a = fr[0] === undefined ? '' : d(fr[0]);
      const b = fr[1] === undefined ? '' : fr[0] + fr[1] === 10 ? '/' : d(fr[1]);
      return [a, b];
    }
    const m = ['', '', ''];
    if (fr[0] !== undefined) m[0] = fr[0] === 10 ? 'X' : d(fr[0]);
    if (fr[1] !== undefined) m[1] = fr[0] === 10 ? (fr[1] === 10 ? 'X' : d(fr[1])) : fr[0] + fr[1] === 10 ? '/' : d(fr[1]);
    if (fr[2] !== undefined) {
      const fresh = fr[0] === 10 ? fr[1] === 10 : true;   // pins were reset before the third ball
      m[2] = fresh ? (fr[2] === 10 ? 'X' : d(fr[2])) : fr[1] + fr[2] === 10 ? '/' : d(fr[2]);
    }
    return m;
  }

  private updateCard(): void {
    let k = 0;
    for (let f = 0; f < 10; f++) {
      const m = this.markFor(f);
      for (const s of m) {
        const tx = this.marks[k++];
        if (tx.text !== s) {
          tx.setText(s).setColor(s === 'X' ? '#d62828' : s === '/' ? '#1f7a3a' : '#201e1d').setScale(1.8);
          this.tweens.add({ targets: tx, scale: 1, duration: 260, ease: 'Back.easeOut' });
        }
      }
    }
    const tots = this.computeTotals();
    tots.forEach((v, f) => this.totals[f].setText(v === null ? '' : String(v)));
    const last = tots.filter((v) => v !== null).pop();
    if (this.online) { this.updateOnlineTotals(); return; }
    this.setScore((last as number | undefined) ?? 0);
  }

  private banner(text: string, color: string, size = 44): void {
    const a = ftxt(this, 360, 600, text, { title: true, size, color, strokeThickness: 10, wrap: 660 }).setDepth(20).setScale(0.2);
    this.tweens.add({ targets: a, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: a, alpha: 0, y: 560, delay: 1000, duration: 300, onComplete: () => a.destroy() });
  }

  // ---------------------------------------------------------------- physics
  private collide(ax: number, ay: number, ar: number, am: number, avx: number, avy: number,
                  p: Pin, pr: number): { nvx: number; nvy: number; ox: number; oy: number; j: number } | null {
    const dx = p.x - ax, dy = p.y - ay, min = ar + pr, d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) return null;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const vrel = (avx - p.vx) * nx + (avy - p.vy) * ny;
    const over = min - d;
    const pm = 1;
    const ox = -nx * over * (pm / (am + pm)), oy = -ny * over * (pm / (am + pm));
    p.x += nx * over * (am / (am + pm)); p.y += ny * over * (am / (am + pm));
    if (vrel <= 0) return { nvx: avx, nvy: avy, ox, oy, j: 0 };
    const e = 0.82;
    const j = ((1 + e) * vrel) / (1 / am + 1 / pm);
    // a little randomness in the scatter keeps every throw different
    const rot = (rng.int(-60, 60) / 1000);
    const cx = Math.cos(rot), sx = Math.sin(rot);
    const jx = (nx * cx - ny * sx) * j, jy = (nx * sx + ny * cx) * j;
    p.vx += jx / pm; p.vy += jy / pm;
    return { nvx: avx - (nx * j) / am, nvy: avy - (ny * j) / am, ox, oy, j };
  }

  private knock(p: Pin, speed: number): void {
    if (p.up && speed > 70) {
      p.up = false;
      p.img.setTexture('bw-pin-down');
      p.img.rotation = Math.atan2(p.vy, p.vx);
      burst(this, p.x, p.y, [0xffffff, 0xd62828], 8, 200);
    } else if (p.up) {
      this.tweens.add({ targets: p.img, angle: rng.pick([-14, 14]), duration: 70, yoyo: true, repeat: 2 });
    }
    if (this.time.now - p.hitSfx > 90 && speed > 40) {
      p.hitSfx = this.time.now;
      this.sfx(rng.pick(['pin1', 'pin2', 'pin3']), { volume: Math.min(0.7, 0.2 + speed / 2500), rate: 0.9 + Math.random() * 0.3, x: p.x });
    }
  }

  private physicsStep(dt: number): void {
    // ball
    if (!this.ballGone) {
      if (!this.gutter && this.by < OIL_END) this.bvx += this.spin * HOOK * dt;
      this.bx += this.bvx * dt; this.by += this.bvy * dt;
      if (!this.gutter && (this.bx < LANE_L || this.bx > LANE_R) && this.by > PIT_Y) {
        this.gutter = true;
        this.bvx = 0;
        this.bx = this.bx < LANE_C ? LANE_L - GUT / 2 : LANE_R + GUT / 2;
        this.sfx('gutter', { volume: 0.5, x: this.bx });
        shake(this, 0.004, 120);
      }
      if (!this.gutter) {
        for (const p of this.pins) {
          if (p.out) continue;
          const r = this.collide(this.bx, this.by, BALL_R, 8 + Math.abs(this.spin) * 5, this.bvx, this.bvy, p, p.up ? PIN_R : DOWN_R);
          if (!r) continue;
          this.bx += r.ox; this.by += r.oy; this.bvx = r.nvx; this.bvy = r.nvy;
          this.knock(p, r.j);
          if (!this.crashPlayed && r.j > 300) {
            this.crashPlayed = true;
            this.sfx('crash', { volume: 0.7 });
            shake(this, 0.006, 160);
          }
        }
      }
      if (this.by < PIT_Y - 30) {
        this.ballGone = true;
        this.tweens.add({ targets: this.ball, alpha: 0, scale: this.ball.scale * 0.6, duration: 200 });
      }
    }
    // pins
    const live = this.pins.filter((p) => !p.out);
    for (let i = 0; i < live.length; i++) for (let k = i + 1; k < live.length; k++) {
      const a = live[i], b = live[k];
      const ar = a.up ? PIN_R : DOWN_R, br = b.up ? PIN_R : DOWN_R;
      const dx = b.x - a.x, dy = b.y - a.y, min = ar + br, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = (min - d) / 2;
      a.x -= nx * over; a.y -= ny * over; b.x += nx * over; b.y += ny * over;
      const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vrel <= 0) continue;
      const j = ((1 + 0.8) * vrel) / 2;
      a.vx -= nx * j; a.vy -= ny * j; b.vx += nx * j; b.vy += ny * j;
      this.knock(a, j * 1.1);
      this.knock(b, j * 1.1);
    }
    const fr = Math.exp(-2.2 * dt);
    for (const p of live) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= fr; p.vy *= fr;
      const sp = Math.hypot(p.vx, p.vy);
      if (!p.up && sp > 30) p.img.rotation += (p.vx > 0 ? 1 : -1) * sp * dt * 0.012;
      if (p.x < LANE_L - 4 || p.x > LANE_R + 4 || p.y < PIT_Y - 8) {
        // into the gutter or the pit
        if (p.up) { p.up = false; p.img.setTexture('bw-pin-down'); }
        p.out = true;
        const gx = p.x < LANE_L ? LANE_L - GUT / 2 : p.x > LANE_R ? LANE_R + GUT / 2 : p.x;
        this.tweens.add({ targets: p.img, x: gx, y: Math.min(p.y, PIT_Y - 20), alpha: 0.0, duration: 450 });
      }
    }
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.online && !this.myTurn()) { this.watchUpdate(dt); return; }
    this.phaseT += dt;
    const sp = this.meterSpeed();
    const c = this.controls;

    if (this.phase === 'position') {
      if (c.axisX) this.bx = this.clampBallX(this.bx + c.axisX * 260 * dt);
      this.aim = Math.sin(this.phaseT * 2.1 * sp) * 0.11;
    } else if (this.phase === 'power') {
      this.power = (1 - Math.cos(this.phaseT * 3.4 * sp)) / 2;
    } else if (this.phase === 'spin') {
      this.spin = Math.sin(this.phaseT * 3.1 * sp);
    } else if (this.phase === 'rolling' || this.phase === 'settle') {
      const h = dt / SUB;
      for (let s = 0; s < SUB; s++) this.physicsStep(h);
      if (!this.ballGone) {
        this.ball.setPosition(this.bx, this.by);
        this.ball.rotation += (Math.hypot(this.bvx, this.bvy) * dt) / BALL_R * 0.4 + this.spin * dt * 6;
        this.rollSfxT -= dt;
        if (this.rollSfxT <= 0 && !this.gutter) { this.rollSfxT = 0.16; this.sfx('roll', { volume: 0.18, rate: 0.6 }); }
      }
      for (const p of this.pins) if (!p.out) p.img.setPosition(p.x, p.y);
      if (this.phase === 'rolling' && this.ballGone) { this.phase = 'settle'; this.settleT = 0; }
      if (this.phase === 'settle') {
        this.settleT += dt;
        const moving = this.pins.some((p) => !p.out && Math.hypot(p.vx, p.vy) > 12);
        if ((!moving && this.settleT > 0.7) || this.settleT > 2.6) this.onRollDone();
      }
    }
    if (this.phase === 'position' || this.phase === 'power' || this.phase === 'spin') this.ball.setPosition(this.bx, this.by);
    this.drawFx();
    if (this.online && this.started) this.streamThrow();
  }

  private drawFx(): void {
    const g = this.fxG;
    g.clear();
    // current frame highlight on the card
    if (this.online) {
      const fx = ON_X + this.frame * ON_FW, fw = this.frame === 9 ? ON_LAST : ON_FW, fy = ON_Y[this.turnSeat === this.seat ? 0 : 1];
      g.lineStyle(5, 0xec3013, 0.6 + Math.sin(this.elapsed * 6) * 0.3).strokeRect(fx - 2, fy - 2, fw + 4, ON_ROW + 4);
    } else {
      const fx = CARD_X + this.frame * FW, fw = this.frame === 9 ? LAST_W : FW;
      g.lineStyle(5, 0xec3013, 0.6 + Math.sin(this.elapsed * 6) * 0.3).strokeRect(fx - 2, CARD_Y - 2, fw + 4, CARD_H + 4);
    }
    g.setDepth(12);
    const aiming = this.phase === 'position' || this.phase === 'power' || this.phase === 'spin';
    if (aiming) {
      // aim line
      const len = 230;
      const ex = this.bx + Math.sin(this.aim) * len, ey = this.by - Math.cos(this.aim) * len;
      g.lineStyle(4, 0xffffff, 0.8);
      for (let k = 0.15; k < 1; k += 0.12) {
        const x1 = this.bx + (ex - this.bx) * k, y1 = this.by + (ey - this.by) * k;
        const x2 = this.bx + (ex - this.bx) * (k + 0.06), y2 = this.by + (ey - this.by) * (k + 0.06);
        g.lineBetween(x1, y1, x2, y2);
      }
      const a = Math.atan2(ey - this.by, ex - this.bx);
      g.fillStyle(0xffffff, 0.9).fillTriangle(
        ex + Math.cos(a) * 16, ey + Math.sin(a) * 16,
        ex + Math.cos(a + 2.4) * 14, ey + Math.sin(a + 2.4) * 14,
        ex + Math.cos(a - 2.4) * 14, ey + Math.sin(a - 2.4) * 14,
      );
    }
    // power meter
    const pw = this.phase === 'power' || this.phase === 'spin' || this.phase === 'rolling' || this.phase === 'settle' ? this.power : 0;
    const h = 452 * pw;
    const col = pw > 0.8 ? 0xec3013 : pw > 0.5 ? 0xffd23f : 0x5dff7a;
    if (pw > 0) g.fillStyle(col, this.phase === 'power' ? 1 : 0.6).fillRoundedRect(604, 1096 - h, 36, h, 8);
    // spin meter
    if (this.phase === 'spin' || this.phase === 'rolling' || this.phase === 'settle') {
      const x = 360 + this.spin * 190;
      g.fillStyle(0x3ee6ff, this.phase === 'spin' ? 1 : 0.6).fillRoundedRect(x - 10, 1228, 20, 36, 6);
    }
    // mini rack: which pins are still standing
    for (const p of this.pins) {
      const [sx, sy] = SPOTS[p.i];
      const mx = 105 + (sx - 360) * 0.75, my = 720 + (sy - 380) * 0.75;
      g.fillStyle(p.up && !p.out ? 0xffffff : 0x4a3d5c, 1).fillCircle(mx, my, 9);
    }
  }

  // ================================================================ online two-player
  // Players alternate frames (the round's starter first), 10 frames each, on one two-row scorecard. The thrower
  // simulates its own throw and streams snapshots ('bs', ~20/s) to the watcher, then sends the
  // final pin result ('roll'); both sides then score and advance with the same rules.

  private myTurn(): boolean {
    return !this.online || this.turnSeat === this.seat;
  }

  private setupOnline(): void {
    this.turnText = ftxt(this, 360, 164, '', { title: true, size: 18, color: '#ffd23f' }).setDepth(12);
    net.onScene(this, 'bs', (d: ThrowSnap) => this.applyThrowSnap(d));
    net.onScene(this, 'roll', (d: RollMsg) => this.applyRoll(d));
    this.selectTurn(net.starter, 0);
    if (net.myTurnFirst) {
      // first throw once the other side's table is up (or after 2.5 s at the latest)
      const go = () => {
        if (this.started || this.isOver) return;
        this.started = true;
        this.beginTurn();
      };
      net.onScene(this, 'hi', go);
      this.time.delayedCall(2500, go);
    } else {
      net.send('hi', 1);
      this.started = true;
      this.beginTurn();
    }
  }

  private buildOnlineCard(): void {
    const g = this.cardG;
    g.clear();
    for (const seat of [0, 1] as const) {
      const mine = seat === this.seat;
      const y = ON_Y[mine ? 0 : 1];
      g.fillStyle(mine ? 0x5dff7a : 0x3ee6ff, 1).fillRect(8, y, ON_X - 12, ON_ROW);
      g.lineStyle(3, 0x201e1d, 1).strokeRect(8, y, ON_X - 12, ON_ROW);
      const name = mine ? t('you') : upper(net.peerName || t('opponent')).slice(0, 5);
      ftxt(this, 8 + (ON_X - 12) / 2, y + ON_ROW / 2, name, { title: true, size: 12, color: '#201e1d', strokeThickness: 0, shadow: false }).setDepth(11);
      for (let f = 0; f < 10; f++) {
        const x = ON_X + f * ON_FW, w = f === 9 ? ON_LAST : ON_FW;
        g.fillStyle(0xf3f2f2, 1).fillRect(x, y, w, ON_ROW);
        g.lineStyle(3, 0x201e1d, 1).strokeRect(x, y, w, ON_ROW);
        const boxes = f === 9 ? 3 : 2;
        const bw = f === 9 ? 30 : 28;
        for (let b = 0; b < boxes; b++) {
          const bx = x + w - (boxes - b) * bw;
          g.lineStyle(2, 0x201e1d, 1).strokeRect(bx, y, bw, ON_BOX);
          this.rowMarks[seat].push(ftxt(this, bx + bw / 2, y + 16, '', { title: true, size: 14, color: '#201e1d', strokeThickness: 0, shadow: false }).setDepth(11));
        }
        this.rowTotals[seat].push(ftxt(this, x + w / 2, y + 47, '', { title: true, size: 16, color: '#201e1d', strokeThickness: 0, shadow: false }).setDepth(11));
      }
    }
  }

  /** Points the single-player bookkeeping (frames, card row, strike run) at the given player. */
  private selectTurn(seat: 0 | 1, frame: number): void {
    this.runs[this.turnSeat] = this.strikeRun;
    this.turnSeat = seat;
    this.frame = frame;
    this.turnNo = frame * 2 + (seat === net.starter ? 0 : 1);
    this.frames = this.allFrames[seat];
    this.marks = this.rowMarks[seat];
    this.totals = this.rowTotals[seat];
    this.strikeRun = this.runs[seat];
    const mine = seat === this.seat;
    if (mine && this.online && this.turnNo > 0) this.sfx('turn', { volume: 0.45 });
    this.turnText.setText(`${t('frame')} ${frame + 1}/10 · ${mine ? t('yourTurn') : t('theirTurn')}`).setColor(mine ? '#5dff7a' : '#3ee6ff');
  }

  /** Next ball: the thrower starts aiming, the other side watches. */
  private beginTurn(): void {
    if (this.isOver) return;
    if (this.myTurn()) { this.newThrow(); return; }
    this.phase = 'wait';
    this.gutter = false; this.ballGone = false; this.crashPlayed = false;
    this.pinTargets = null;
    this.standingAtThrow = this.standingCount();
    this.ball.setAlpha(0).setAngle(0).setDisplaySize(BALL_R * 2, BALL_R * 2);
    this.hint.setText(t('theirTurn'));
  }

  private advanceOnline(frameDone: boolean, resetRack: boolean): void {
    if (frameDone) {
      // the starter bowls each frame first; the frame ends with the other player's turn
      if (this.turnSeat !== net.starter && this.frame === 9) { this.finishOnline(); return; }
      const next: 0 | 1 = this.turnSeat === 0 ? 1 : 0;
      this.selectTurn(next, next === net.starter ? this.frame + 1 : this.frame);
      this.rack(true);
      const mine = next === this.seat;
      this.turnText.setScale(1.5);
      this.tweens.add({ targets: this.turnText, scale: 1, duration: 400, ease: 'Back.easeOut' });
      fpopup(this, 360, 1000, mine ? t('yourTurn') : t('theirTurn'), mine ? '#5dff7a' : '#3ee6ff', 30);
    } else this.rack(resetRack);
    this.time.delayedCall(450, () => this.beginTurn());
  }

  private totalOf(seat: number): number {
    const keep = this.frames;
    this.frames = this.allFrames[seat];
    const v = this.computeTotals().filter((x) => x !== null).pop();
    this.frames = keep;
    return (v as number | undefined) ?? 0;
  }

  private updateOnlineTotals(): void {
    this.setScore(this.totalOf(this.seat));
  }

  private finishOnline(): void {
    const me = this.totalOf(this.seat), opp = this.totalOf(1 - this.seat);
    this.setScore(me);
    const win = me > opp;
    this.endGame({ win, title: me === opp ? t('draw') : win ? t('youWin') : t('youLose'), draw: me === opp, delay: 700 });
  }

  /** Thrower: stream the throw (aim, meters, ball and pins) to the watcher. */
  private streamThrow(): void {
    if (this.phase === 'wait') return;
    const now = this.time.now;
    if (now - this.sendT < SEND_MS) return;
    this.sendT = now;
    const r = Math.round;
    const d: ThrowSnap = {
      t: this.turnNo, ph: PHASES.indexOf(this.phase), b: [r(this.bx), r(this.by), this.ballGone ? 1 : 0],
      a: r(this.aim * 1000), w: r(this.power * 1000), s: r(this.spin * 1000),
    };
    if (this.phase === 'rolling' || this.phase === 'settle') d.p = this.pins.flatMap((p) => [r(p.x), r(p.y), p.out ? 2 : p.up ? 0 : 1, r(p.img.angle)]);
    net.send('bs', d);
  }

  private sendRoll(knocked: number): void {
    let mask = 0;
    this.pins.forEach((p, i) => { if (p.up && !p.out) mask |= 1 << i; });
    net.send('roll', { t: this.turnNo, k: knocked, u: mask, g: this.gutter ? 1 : 0 });
  }

  /** Watcher: a throw snapshot from the thrower. */
  private applyThrowSnap(d: ThrowSnap): void {
    if (this.isOver || this.myTurn() || d.t !== this.turnNo) return;
    const ph = PHASES[d.ph] ?? 'wait';
    if (ph === 'rolling' && this.phase !== 'rolling' && this.phase !== 'settle') {
      this.sfx('throw', { volume: 0.6 });
      shake(this, 0.003, 120);
      this.hint.setText('');
    } else if ((ph === 'power' && this.phase === 'position') || (ph === 'spin' && this.phase === 'power')) {
      this.sfx('lock', { volume: 0.4, rate: ph === 'power' ? 1 : 1.15 });
    }
    if (this.phase === 'wait' && ph === 'position') {
      this.bx = d.b[0]; this.by = d.b[1];
      this.tweens.add({ targets: this.ball, alpha: 1, duration: 200 });
    }
    this.phase = ph;
    this.watchBx = d.b[0]; this.watchBy = d.b[1];
    if (d.b[2] && !this.ballGone) {
      this.ballGone = true;
      this.tweens.add({ targets: this.ball, alpha: 0, scale: this.ball.scale * 0.6, duration: 200 });
    }
    this.aim = d.a / 1000; this.power = d.w / 1000; this.spin = d.s / 1000;
    if (d.p) this.pinTargets = d.p;
  }

  /** Watcher: the thrower's final pin result. */
  private applyRoll(d: RollMsg): void {
    if (this.isOver || this.myTurn() || d.t !== this.turnNo) return;
    this.pins.forEach((p, i) => {
      const up = ((d.u >> i) & 1) === 1;
      if (!up && p.up) { p.up = false; p.img.setTexture('bw-pin-down'); }
    });
    this.gutter = d.g === 1;
    if (!this.ballGone) {
      this.ballGone = true;
      this.tweens.add({ targets: this.ball, alpha: 0, duration: 200 });
    }
    this.pinTargets = null;
    this.resolveRoll(d.k);
  }

  /** Watcher: render the streamed throw smoothly. */
  private watchUpdate(dt: number): void {
    const k = Math.min(1, dt * 18);
    if (this.phase !== 'wait' && !this.ballGone) {
      const ox = this.bx, oy = this.by;
      const rolling = this.phase === 'rolling' || this.phase === 'settle';
      // while rolling, keep moving between snapshots at the ball's speed
      if (rolling) {
        const dx = this.watchBx - this.bx, dy = this.watchBy - this.by;
        this.bx += dx * k; this.by += dy * k;
      } else { this.bx = this.watchBx; this.by = this.watchBy; }
      this.ball.setPosition(this.bx, this.by);
      const dist = Math.hypot(this.bx - ox, this.by - oy);
      this.ball.rotation += dist / BALL_R * 0.4 + (rolling ? this.spin * dt * 6 : 0);
      if (rolling) {
        this.rollSfxT -= dt;
        if (this.rollSfxT <= 0 && dist > 1) { this.rollSfxT = 0.16; this.sfx('roll', { volume: 0.18, rate: 0.6 }); }
      }
    }
    const pt = this.pinTargets;
    if (pt) {
      const kp = Math.min(1, dt * 16);
      this.pins.forEach((p, i) => {
        if (p.out) return;
        const o = i * 4;
        if (pt[o] === undefined) return;
        p.x += (pt[o] - p.x) * kp; p.y += (pt[o + 1] - p.y) * kp;
        if (pt[o + 2] >= 1 && p.up) {
          p.up = false;
          p.img.setTexture('bw-pin-down');
          burst(this, p.x, p.y, [0xffffff, 0xd62828], 8, 200);
          this.sfx(rng.pick(['pin1', 'pin2', 'pin3']), { volume: 0.45, rate: 0.9 + Math.random() * 0.3, x: p.x });
          if (!this.crashPlayed) { this.crashPlayed = true; this.sfx('crash', { volume: 0.7 }); shake(this, 0.006, 160); }
        }
        if (!p.up) p.img.angle = pt[o + 3];
        if (pt[o + 2] === 2) {
          p.out = true;
          const gx = p.x < LANE_L ? LANE_L - GUT / 2 : p.x > LANE_R ? LANE_R + GUT / 2 : p.x;
          this.tweens.add({ targets: p.img, x: gx, y: Math.min(p.y, PIT_Y - 20), alpha: 0.0, duration: 450 });
          return;
        }
        p.img.setPosition(p.x, p.y);
      });
    }
    this.drawFx();
  }
}
