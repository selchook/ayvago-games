import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, t, hudChip, hudText, HudChip, HUD_ROW2_Y, HUD_MARGIN } from '@core';
import { ftxt, fpopup, freshTextCanvases, softFlash } from './fasttext';
import { BALL_LOOK, paintTextures } from './textures';
import {
  Round, boardConfig, L, R, W, SLOTS, SLOT_W, DIV_TOP, FLOOR, DROP_Y, PEG_TOP, GHOST_Y, BUMP_R, STAR_AT, COMBO,
  type Ball, type BallKind, type BoardKind, type Peg, type SimEvent, type Slot,
} from './sim';

// Layout of the screen around the board (720 x 1280 world)
const PANEL_Y = 156, PANEL_H = 1036;
/** HUD row 2: the next balls, the combo and the goal with its bar (BAR_W wide, three stars on it). */
const BAR_W = 136, STAR_S = 24;
const HINT_Y = 1230;
const BAR_FULL = STAR_AT[2];

const ACCENT: Record<BoardKind, number> = {
  classic: 0x8b5cff, diamonds: 0x3ee6ff, bumpers: 0xff4fa3, sliders: 0x5dff7a, spinner: 0xff9f1c, waves: 0x4f8bff, funnel: 0xffd23f,
};
const SLOT_COLORS: Record<number, number> = { 5: 0x2b6cb0, 10: 0x2f855a, 20: 0x38a169, 25: 0xb7791f, 50: 0xdd6b20, 100: 0xe53e3e };
/** Pentatonic steps for the peg pings: deeper rows ring higher. */
const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

interface BallView { img: Phaser.GameObjects.Image; trail: number[]; kind: BallKind }
interface SlotView { box: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }

const ballSize = (b: { r: number }) => (b.r * 2 * 64) / 60;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private round: Round | null = null;
  private boardN = 1;
  private carry = 0;
  private between = true;
  private dropX = 360;
  private aiming = false;
  private dropCd = 0;
  private roundT = 0;
  private lastPing = 0;
  private gateX = 0;
  private shownScore = 0;
  private starsLit = 0;

  private glowBg!: Phaser.GameObjects.Image;
  private frameG!: Phaser.GameObjects.Graphics;
  private boardG!: Phaser.GameObjects.Graphics;
  private trailG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private barG!: Phaser.GameObjects.Graphics;
  private holder!: Phaser.GameObjects.Image;
  private dropper!: Phaser.GameObjects.Image;
  private nextIcons: Phaser.GameObjects.Image[] = [];
  private nextChip!: HudChip;
  private goalText!: HudChip;
  private comboText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private gateText!: Phaser.GameObjects.Text;
  private starIcons: Phaser.GameObjects.Image[] = [];

  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private pegImgs = new Map<number, Phaser.GameObjects.Image>();
  private pegGlows = new Map<number, Phaser.GameObjects.Image>();
  private barImgs = new Map<number, Phaser.GameObjects.Image>();
  private spinImgs = new Map<number, Phaser.GameObjects.Image[]>();
  private ballViews = new Map<number, BallView>();
  private slotViews: SlotView[] = [];
  private slotFlash: number[] = [];

  createGame(): void {
    freshTextCanvases(this);
    paintTextures(this);
    this.round = null;
    this.boardN = 1; this.carry = 0; this.between = true;
    this.dropX = 360; this.aiming = false; this.dropCd = 0; this.roundT = 0; this.lastPing = 0;
    this.gateX = 0; this.shownScore = 0; this.starsLit = 0;
    this.nextIcons = []; this.starIcons = []; this.boardObjs = []; this.slotViews = []; this.slotFlash = [];
    this.pegImgs = new Map(); this.pegGlows = new Map(); this.barImgs = new Map(); this.spinImgs = new Map(); this.ballViews = new Map();

    // painted backdrop, coloured glow per board, glass panel
    this.add.image(0, 0, 'pk-bg').setOrigin(0).setDepth(-20);
    this.glowBg = this.add.image(360, 640, 'pk-glow').setDisplaySize(1300, 1300).setAlpha(0.22).setDepth(-19)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.glowBg, y: 600, scale: this.glowBg.scale * 1.08, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.image(L - 14, PANEL_Y, 'pk-panel').setOrigin(0).setDepth(-10);
    this.frameG = this.add.graphics().setDepth(-9);
    this.boardG = this.add.graphics().setDepth(1);
    this.trailG = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.fxG = this.add.graphics().setDepth(7);
    this.barG = this.add.graphics();

    // slots: a bucket container per pocket, anchored at the floor so it squashes when hit
    for (let i = 0; i < SLOTS; i++) {
      const g = this.add.graphics();
      const label = ftxt(this, 0, -46, '', { title: true, size: 24, strokeThickness: 5 });
      const box = this.add.container(L + SLOT_W * (i + 0.5), FLOOR, [g, label]).setDepth(2);
      this.slotViews.push({ box, g, label });
      this.slotFlash.push(0);
    }
    this.gateText = ftxt(this, 0, DIV_TOP + 12, 'x2', { title: true, size: 24, color: '#ff4fa3', strokeThickness: 6 }).setDepth(8).setVisible(false);

    // dropper on its rail
    this.dropper = this.add.image(this.dropX, DROP_Y - 30, 'pk-dropper').setDepth(6);
    this.holder = this.add.image(this.dropX, DROP_Y, 'pk-ball-normal').setDepth(6);

    // HUD row 2: the next balls left (and, while a streak runs, the combo the next ball earns),
    // the goal with its bar and three stars right
    for (let k = 0; k < 3; k++) {
      const sz = 30 - k * 4;
      this.nextIcons.push(this.add.image(0, 0, 'pk-ball-normal').setDisplaySize(sz, sz).setData('size', sz).setData('chipWidth', sz));
    }
    this.comboText = hudText(this, '', 19, '#ff9f1c').setVisible(false);
    this.nextChip = hudChip(this, HUD_MARGIN, HUD_ROW2_Y, { label: t('nextBalls'), items: [...this.nextIcons, this.comboText] });
    for (let s = 0; s < 3; s++) {
      const x = -BAR_W / 2 + (BAR_W * STAR_AT[s]) / BAR_FULL;
      this.starIcons.push(this.add.image(x, 0, 'pk-star-off').setDisplaySize(STAR_S, STAR_S));
    }
    const bar = this.add.container(0, 0, [this.barG, ...this.starIcons]).setData('chipWidth', BAR_W + STAR_S / 2);
    this.goalText = hudChip(this, 720 - HUD_MARGIN, HUD_ROW2_Y, { align: 'right', label: t('goal'), text: '0/0', size: 20, color: '#ffd23f', items: [bar] });
    this.hintText = ftxt(this, 360, HINT_Y, t('hint'), { size: 24, color: '#b9b4d6', wrap: 680 }).setDepth(10);

    this.controls = new Controls(this);
    for (const k of ['SPACE', 'Z', 'ENTER', 'DOWN', 'S']) this.input.keyboard?.on(`keydown-${k}`, () => this.drop());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 590 && p.y < 140) return;                 // pause button
      this.aiming = true;
      this.dropX = this.clampDrop(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.aiming && p.isDown) this.dropX = this.clampDrop(p.x);
    });
    this.input.on('pointerup', () => {
      if (!this.aiming) return;
      this.aiming = false;
      this.drop();
    });

    this.startBoard();
  }

  private clampDrop(x: number): number {
    return Phaser.Math.Clamp(x, L + 22, R - 22);
  }

  private accent(): number {
    return ACCENT[this.round?.cfg.kind ?? 'classic'];
  }

  // ---------------------------------------------------------------- boards
  private startBoard(): void {
    const n = this.boardN;
    const cfg = boardConfig(n, this.carry, Math.random);
    this.carry = 0;
    this.round = new Round(cfg);
    const r = this.round;
    this.between = true;
    this.shownScore = 0;
    this.starsLit = 0;
    this.gateX = r.gateSlot >= 0 ? L + SLOT_W * (r.gateSlot + 0.5) : 0;
    const acc = this.accent();
    this.glowBg.setTint(acc);
    this.drawFrame(acc);
    for (const s of this.starIcons) s.setTexture('pk-star-off').setDisplaySize(STAR_S, STAR_S);

    // pegs and their glows fall into place row by row
    for (const p of r.pegs) {
      const img = this.add.image(p.x, p.y, p.kind === 'bump' ? 'pk-bump' : p.kind === 'gold' ? 'pk-gold' : 'pk-peg').setDepth(3);
      const size = p.kind === 'bump' ? (80 * BUMP_R) / 30 : 32;
      img.setDisplaySize(size, size).setData('base', img.scale);
      const glow = this.add.image(p.x, p.y, 'pk-glow').setDepth(2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(p.kind === 'bump' ? 120 : 56, p.kind === 'bump' ? 120 : 56).setTint(p.kind === 'gold' ? 0xffd23f : acc);
      this.pegImgs.set(p.id, img);
      this.pegGlows.set(p.id, glow);
      this.boardObjs.push(img, glow);
      this.dropIn(img, p.y, 80 + (p.y - PEG_TOP) * 0.7 + Math.random() * 120);
    }
    for (const bar of r.bars) {
      const img = this.add.image(bar.x, bar.y, 'pk-bar').setDisplaySize(bar.half * 2 + 20, 24).setDepth(3);
      this.barImgs.set(bar.id, img);
      this.boardObjs.push(img);
      this.dropIn(img, bar.y, 300);
    }
    for (const s of r.spinners) {
      const arms = [0, 1].map(() => this.add.image(s.x, s.y, 'pk-spin').setDisplaySize(s.len * 2 + 18, 20).setDepth(3));
      const hub = this.add.image(s.x, s.y, 'pk-hub').setDisplaySize(30, 30).setDepth(3);
      this.spinImgs.set(s.id, [...arms, hub]);
      this.boardObjs.push(...arms, hub);
      for (const o of [...arms, hub]) this.dropIn(o, s.y, 350);
    }
    // pockets
    this.slotViews.forEach((v, i) => {
      this.drawSlot(i);
      v.box.setScale(1, 0).setAlpha(1);
      this.tweens.add({ targets: v.box, scaleY: 1, duration: 380, delay: 350 + i * 45, ease: 'Back.easeOut' });
    });

    this.hud.setLevel(n);
    this.updateHud();
    const lines = [`${t('goalLine', { g: cfg.goal, b: cfg.balls })}`];
    if (cfg.newBall) lines.push(t('newBall', { n: t(`bname_${cfg.newBall}`) }));
    this.banner(`${t('board')} ${n}`, '#ffd23f', [t(`bn_${cfg.kind}`), ...lines], 1500);
    this.sfx('round', { volume: 0.5 });
    this.time.delayedCall(1000, () => { if (!this.isOver && this.round === r) this.between = false; });
  }

  private dropIn(o: Phaser.GameObjects.Image, y: number, delay: number): void {
    o.y = y - 50;
    o.setAlpha(0);
    this.tweens.add({ targets: o, y, alpha: 1, duration: 360, delay, ease: 'Back.easeOut' });
  }

  /** Board exit: everything on the field drops away, then the next board starts. */
  private clearBoard(then: () => void): void {
    const objs = this.boardObjs;
    this.boardObjs = [];
    this.pegImgs.clear(); this.pegGlows.clear(); this.barImgs.clear(); this.spinImgs.clear();
    for (const v of this.ballViews.values()) v.img.destroy();
    this.ballViews.clear();
    for (const o of objs) {
      const img = o as Phaser.GameObjects.Image;
      this.tweens.killTweensOf(img);
      if (img.alpha === 0) { img.destroy(); continue; }
      this.tweens.add({
        targets: img, y: img.y + 70 + Math.random() * 40, alpha: 0, duration: 420, delay: Math.random() * 220,
        ease: 'Quad.easeIn', onComplete: () => img.destroy(),
      });
    }
    this.slotViews.forEach((v, i) => this.tweens.add({ targets: v.box, scaleY: 0, duration: 260, delay: i * 30, ease: 'Back.easeIn' }));
    this.time.delayedCall(720, () => { if (!this.isOver) then(); });
  }

  private finishBoard(): void {
    const r = this.round;
    if (!r) return;
    this.between = true;
    if (r.score >= r.cfg.goal) {
      const bonus = r.bonus();
      this.addScore(bonus);
      if (r.stars === 3) this.carry = 1;
      this.sfx('clear', { volume: 0.8, exact: true });
      softFlash(this, 0x5dff7a, 180, 0.22);
      burst(this, 360, 560, [0xffd23f, 0x5dff7a, 0x3ee6ff], 50, 520);
      this.clearCard(r.stars, bonus);
      this.time.delayedCall(2500, () => {
        if (this.isOver) return;
        this.clearBoard(() => { this.boardN++; this.startBoard(); });
      });
    } else {
      this.sfx('fail', { volume: 0.7 });
      shake(this, 0.012, 300);
      softFlash(this, 0xec3013, 200, 0.25);
      this.banner(t('goalMissed'), '#ec3013', [`${r.score} / ${r.cfg.goal}`], 1400);
      this.endGame({ delay: 1700, title: t('goalMissed') });
    }
  }

  private clearCard(stars: number, bonus: number): void {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const g = this.add.graphics().setDepth(50);
    g.fillStyle(0x0b0820, 0.9).fillRoundedRect(110, 440, 500, 330, 30);
    g.lineStyle(5, this.accent(), 1).strokeRoundedRect(110, 440, 500, 330, 30);
    objs.push(g);
    objs.push(ftxt(this, 360, 495, t('boardClear'), { title: true, size: 38, color: '#5dff7a', strokeThickness: 8 }).setDepth(51));
    for (let s = 0; s < 3; s++) {
      const on = s < stars;
      const img = this.add.image(250 + s * 110, 595, on ? 'pk-star' : 'pk-star-off').setDisplaySize(84, 84).setDepth(51);
      const base = img.scale;
      img.setScale(0);
      objs.push(img);
      this.tweens.add({
        targets: img, scale: base, duration: 380, delay: 250 + s * 280, ease: 'Back.easeOut',
        onStart: () => {
          if (!on) return;
          this.sfx('star', { volume: 0.7, rate: 1 + s * 0.2 });
          burst(this, img.x, img.y, [0xffd23f, 0xffffff], 16, 260);
        },
      });
    }
    const b = ftxt(this, 360, 680, t('bonus', { n: bonus }), { title: true, size: 28, color: '#ffd23f' }).setDepth(51).setAlpha(0);
    objs.push(b);
    this.tweens.add({ targets: b, alpha: 1, duration: 300, delay: 1100 });
    if (stars === 3) {
      const c = ftxt(this, 360, 728, t('carry'), { title: true, size: 20, color: '#3ee6ff' }).setDepth(51).setAlpha(0);
      objs.push(c);
      this.tweens.add({ targets: c, alpha: 1, duration: 300, delay: 1300 });
    }
    const all = objs as unknown as Phaser.GameObjects.Components.Alpha[];
    this.tweens.add({
      targets: all, alpha: 0, delay: 2250, duration: 300,
      onComplete: () => objs.forEach((o) => o.destroy()),
    });
  }

  private banner(main: string, color: string, subs: string[] = [], hold = 1250): void {
    // a dark glass strip behind the text keeps it readable over the pegs
    const h = 110 + subs.length * 44;
    const back = this.add.graphics().setDepth(39).setAlpha(0);
    back.fillStyle(0x0b0820, 0.82).fillRoundedRect(70, 480, 580, h, 26);
    back.lineStyle(4, this.accent(), 0.9).strokeRoundedRect(70, 480, 580, h, 26);
    this.tweens.add({ targets: back, alpha: 1, duration: 200 });
    const a = ftxt(this, 360, 538, main, { title: true, size: 46, color, strokeThickness: 9, wrap: 560 }).setDepth(40).setScale(0.2);
    const parts: Array<Phaser.GameObjects.Text | Phaser.GameObjects.Graphics> = [back, a];
    subs.forEach((s, k) => {
      const b = ftxt(this, 360, 604 + k * 44, s, { title: true, size: k === 0 ? 28 : 22, color: k === 0 ? '#ffffff' : '#3ee6ff', strokeThickness: 6, wrap: 560 })
        .setDepth(40).setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, duration: 220, delay: 120 + k * 100 });
      parts.push(b);
    });
    this.tweens.add({ targets: a, scale: 1, duration: 340, ease: 'Back.easeOut' });
    this.tweens.add({ targets: parts, alpha: 0, delay: hold, duration: 300, onComplete: () => parts.forEach((p) => p.destroy()) });
  }

  // ---------------------------------------------------------------- drawing helpers
  private drawFrame(acc: number): void {
    const g = this.frameG;
    g.clear();
    g.lineStyle(14, acc, 0.18).strokeRoundedRect(L - 14, PANEL_Y, W + 28, PANEL_H, 28);
    g.lineStyle(5, acc, 1).strokeRoundedRect(L - 14, PANEL_Y, W + 28, PANEL_H, 28);
    // dropper rail
    g.fillStyle(0x000000, 0.35).fillRoundedRect(L, DROP_Y - 52, W, 10, 5);
    g.fillStyle(acc, 0.7).fillRoundedRect(L, DROP_Y - 54, W, 6, 3);
    const b = this.boardG;
    b.clear();
    // slot dividers and floor
    for (let i = 1; i < SLOTS; i++) {
      b.fillStyle(0x000000, 0.35).fillRoundedRect(L + i * SLOT_W - 3, DIV_TOP + 4, 8, FLOOR - DIV_TOP, 4);
      b.fillStyle(0xe8e4ff, 1).fillRoundedRect(L + i * SLOT_W - 4, DIV_TOP, 8, FLOOR - DIV_TOP, 4);
    }
    b.fillStyle(acc, 1).fillRoundedRect(L - 6, FLOOR, W + 12, 10, 5);
  }

  private drawSlot(i: number): void {
    const r = this.round;
    if (!r) return;
    const s = r.slots[i];
    const v = this.slotViews[i];
    const h = FLOOR - DIV_TOP - 30, w = SLOT_W - 8;
    const col = s.kind === 'ball' ? 0x1f9a4a : s.kind === 'zero' ? 0x2a2440 : SLOT_COLORS[s.value] ?? 0x555555;
    const top = Phaser.Display.Color.IntegerToColor(col).lighten(18).color;
    v.g.clear();
    v.g.fillGradientStyle(top, top, col, col, 0.95).fillRect(-w / 2, -h, w, h);
    v.g.fillStyle(0xffffff, 0.22).fillRect(-w / 2, -h, w, 6);
    v.g.fillStyle(0x000000, 0.25).fillRect(-w / 2, -10, w, 10);
    v.label.setText(s.kind === 'ball' ? t('extraShort') : String(s.value));
    v.label.setColor(s.kind === 'ball' ? '#b6ffc4' : s.kind === 'zero' ? '#7d7799' : s.value >= 100 ? '#ffe066' : '#ffffff');
    v.label.setFontSize(s.value >= 100 ? 26 : 24);
  }

  private updateHud(): void {
    const r = this.round;
    if (!r) return;
    this.hud.setRight(`${t('balls')} ${r.ballsLeft}`);
    this.goalText.setText(`${r.score}/${r.cfg.goal}`);
    this.goalText.setTextColor(r.score >= r.cfg.goal ? '#5dff7a' : '#ffd23f');
    // the ball in the dropper and the next three
    const cur = r.queue[0];
    this.holder.setVisible(!!cur);
    if (cur) {
      this.holder.setTexture(`pk-ball-${cur}`);
      const sz = ballSize({ r: cur === 'heavy' ? 17 : 15 });
      if (!this.tweens.isTweening(this.holder)) this.holder.setDisplaySize(sz, sz);
      this.holder.setData('size', sz);
    }
    this.nextIcons.forEach((ic, k) => {
      const kind = r.queue[k + 1];
      ic.setAlpha(kind ? 1 : 0);   // an empty slot keeps its place, so the chip does not jump
      if (kind) ic.setTexture(`pk-ball-${kind}`).setDisplaySize(ic.getData('size'), ic.getData('size'));
    });
    this.nextChip.caption?.setAlpha(r.queue.length > 1 ? 0.78 : 0.35);
    const special = cur && cur !== 'normal';
    this.hintText.setText(special ? t(`desc_${cur}`) : t('hint'));
    this.hintText.setColor(special ? Phaser.Display.Color.IntegerToColor(BALL_LOOK[cur].trail).rgba : '#b9b4d6');
    const nextCombo = COMBO[Math.min(r.streak + 1, COMBO.length - 1)];
    this.comboText.setVisible(r.streak >= 1 && nextCombo > 1).setText(t('comboX', { n: nextCombo }));
    this.nextChip.layout();
  }

  // ---------------------------------------------------------------- dropping
  private drop(): void {
    const r = this.round;
    if (!r || this.between || this.isOver || this.dropCd > 0 || !r.queue.length) return;
    const b = r.drop(this.dropX);
    if (!b) return;
    this.dropCd = 0.35;
    this.addBallView(b);
    this.sfxAt('drop', this.dropX, { volume: 0.45 });
    this.tweens.add({ targets: this.dropper, scaleY: 0.8, duration: 70, yoyo: true });
    this.holder.setScale(0);
    this.updateHud();
    const sz = this.holder.getData('size') as number;
    this.tweens.add({ targets: this.holder, displayWidth: sz, displayHeight: sz, duration: 220, delay: 140, ease: 'Back.easeOut' });
  }

  private addBallView(b: Ball): void {
    const img = this.add.image(b.x, b.y, `pk-ball-${b.kind}`).setDisplaySize(ballSize(b), ballSize(b)).setDepth(5);
    this.ballViews.set(b.id, { img, trail: [], kind: b.kind });
  }

  // ---------------------------------------------------------------- events from the board
  private ping(rate: number, x: number, volume = 0.3): void {
    const now = this.time.now;
    if (now - this.lastPing < 40) return;
    this.lastPing = now;
    this.sfxAt('ping', x, { volume, rate });
  }

  private pegHit(p: Peg, tint?: number): void {
    const img = this.pegImgs.get(p.id);
    const glow = this.pegGlows.get(p.id);
    if (glow) {
      if (tint !== undefined) glow.setTint(tint);
      this.tweens.killTweensOf(glow);
      glow.setAlpha(0.95);
      this.tweens.add({ targets: glow, alpha: 0, duration: 420, ease: 'Quad.easeOut' });
    }
    if (img) {
      const base = img.getData('base') as number;
      this.tweens.killTweensOf(img);
      img.setAlpha(1).setY(p.y).setScale(base * 1.4);
      this.tweens.add({ targets: img, scale: base, duration: 240, ease: 'Quad.easeOut' });
    }
  }

  private handle(e: SimEvent): void {
    switch (e.t) {
      case 'peg': {
        this.pegHit(e.p);
        this.ping(0.7 * Math.pow(2, NOTES[Math.min(e.p.row, NOTES.length - 1)] / 12), e.p.x);
        break;
      }
      case 'gold': {
        this.pegHit(e.p, 0xffd23f);
        this.addScore(e.pts);
        this.sfxAt('gold', e.p.x, { volume: 0.55 });
        burst(this, e.p.x, e.p.y, [0xffd23f, 0xffffff], 14, 240);
        fpopup(this, e.p.x, e.p.y - 22, `+${e.pts}`, '#ffd23f', 22);
        const img = this.pegImgs.get(e.p.id);
        if (img && e.p.alive) { img.setTexture('pk-peg').setDisplaySize(32, 32).setData('base', img.scale); }
        const glow = this.pegGlows.get(e.p.id);
        const acc = this.accent();
        this.time.delayedCall(450, () => { if (glow?.active) glow.setTint(acc); });
        break;
      }
      case 'allGold':
        this.addScore(e.pts);
        this.sfx('allgold', { volume: 0.75 });
        softFlash(this, 0xffd23f, 160, 0.2);
        this.banner(t('allGold', { n: e.pts }), '#ffd23f', [], 900);
        break;
      case 'bump': {
        this.pegHit(e.p);
        this.addScore(e.pts);
        this.sfxAt('bump', e.p.x, { volume: 0.45 });
        burst(this, e.p.x, e.p.y, [ACCENT.bumpers, 0xffffff], 10, 240);
        break;
      }
      case 'smash': {
        this.addScore(e.pts);
        this.sfxAt('smash', e.p.x, { volume: 0.6 });
        shake(this, 0.004, 90);
        burst(this, e.p.x, e.p.y, [0xb8c2d8, 0xffffff, this.accent()], 14, 300);
        const img = this.pegImgs.get(e.p.id);
        const glow = this.pegGlows.get(e.p.id);
        this.pegImgs.delete(e.p.id); this.pegGlows.delete(e.p.id);
        if (img) { this.tweens.killTweensOf(img); this.tweens.add({ targets: img, scale: img.scale * 2, alpha: 0, angle: 90, duration: 260, onComplete: () => img.destroy() }); }
        glow?.destroy();
        fpopup(this, e.p.x, e.p.y - 20, `+${e.pts}`, '#d8deff', 20);
        break;
      }
      case 'bar': {
        this.ping(1.5, e.b.x, 0.25);
        const img = this.barImgs.get(e.bar.id);
        if (img) { img.setTintFill(0xffffff); this.time.delayedCall(70, () => img.active && img.clearTint()); }
        break;
      }
      case 'spin':
        if (e.pts) {
          this.addScore(e.pts);
          this.ping(1.2, e.b.x, 0.3);
          const hub = this.spinImgs.get(e.s.id)?.[2];
          if (hub && !this.tweens.isTweening(hub)) { this.tweens.add({ targets: hub, displayWidth: 40, displayHeight: 40, duration: 90, yoyo: true }); }
        }
        break;
      case 'split': {
        this.sfxAt('split', e.b.x, { volume: 0.6 });
        burst(this, e.b.x, e.b.y, [0xff4fa3, 0xffffff], 22, 320);
        fpopup(this, e.b.x, e.b.y - 30, t('split'), '#ff4fa3', 22);
        const v = this.ballViews.get(e.b.id);
        if (v) { v.kind = 'shard'; v.img.setTexture('pk-ball-shard').setDisplaySize(ballSize(e.b), ballSize(e.b)); }
        for (const k of e.kids) this.addBallView(k);
        break;
      }
      case 'solid': {
        this.sfxAt('solid', e.b.x, { volume: 0.5 });
        burst(this, e.b.x, e.b.y, [0xcfc9ff, 0xffffff], 12, 200);
        break;
      }
      case 'gate':
        break;
      case 'extra': {
        const cx = L + SLOT_W * (e.i + 0.5);
        this.landFx(e.b, e.i);
        this.sfxAt('extra', cx, { volume: 0.7, exact: true });
        burst(this, cx, FLOOR - 40, [0x5dff7a, 0xffffff], 24, 320);
        fpopup(this, cx, FLOOR - 140, t('extraBall'), '#5dff7a', 24);
        this.drawSlot(e.i);
        this.tweens.add({ targets: this.holder, scale: this.holder.scale * 1.3, duration: 120, yoyo: true });
        break;
      }
      case 'land':
        this.onLand(e.b, e.i, e.slot, e.pts, e.gate, e.combo, e.jackpot);
        break;
      case 'goal':
        this.sfx('goal', { volume: 0.7 });
        softFlash(this, 0x5dff7a, 160, 0.16);
        this.lightStar(0);
        fpopup(this, 360, 330, t('goalReached'), '#5dff7a', 34);
        break;
      case 'star':
        this.lightStar(e.n - 1);
        break;
    }
  }

  private lightStar(s: number): void {
    const img = this.starIcons[s];
    if (!img) return;
    this.starsLit = Math.max(this.starsLit, s + 1);
    img.setTexture('pk-star').setDisplaySize(STAR_S, STAR_S);
    const base = img.scale;
    img.setScale(base * 2.2);
    this.tweens.add({ targets: img, scale: base, duration: 380, ease: 'Back.easeOut' });
    this.sfx('star', { volume: 0.7, rate: 1 + s * 0.2 });
    const m = img.getWorldTransformMatrix();   // the star sits in the goal chip
    burst(this, m.tx, m.ty, [0xffd23f, 0xffffff], 18, 220);
  }

  private landFx(b: Ball, i: number): void {
    const v = this.ballViews.get(b.id);
    if (v) { v.img.destroy(); this.ballViews.delete(b.id); }
    this.slotFlash[i] = 1;
    const box = this.slotViews[i].box;
    this.tweens.killTweensOf(box);
    box.setScale(1.08, 0.82);
    this.tweens.add({ targets: box, scaleX: 1, scaleY: 1, duration: 420, ease: 'Elastic.easeOut' });
  }

  private onLand(b: Ball, i: number, s: Slot, pts: number, gate: number, combo: number, jackpot: boolean): void {
    const cx = L + SLOT_W * (i + 0.5);
    this.landFx(b, i);
    if (s.kind === 'zero') {
      this.sfxAt('zero', cx, { volume: 0.5 });
      burst(this, cx, FLOOR - 40, [0x555566, 0x8a84a8], 12, 160);
      fpopup(this, cx, FLOOR - 140, '0', '#8a84a8', 28);
      this.updateHud();
      return;
    }
    this.addScore(pts);
    const big = pts >= 100;
    const boosted = gate > 1 || combo > 1 || b.kind === 'gold';
    if (big) this.sfxAt('big', cx, { volume: 0.75 });
    else this.sfxAt('land', cx, { volume: 0.55, rate: 0.9 + Math.min(0.4, pts / 150) });
    burst(this, cx, FLOOR - 40, [SLOT_COLORS[s.value] ?? 0xffffff, 0xffd23f, 0xffffff], big ? 40 : 18, big ? 440 : 260);
    if (big) shake(this, Math.min(0.016, 0.005 + pts / 40000), 200);
    if (boosted) softFlash(this, gate > 1 ? 0xff4fa3 : 0xffd23f, 110, 0.14);
    const tag = [gate > 1 ? `x${gate}` : '', b.kind === 'gold' ? 'x2' : '', combo > 1 ? `x${combo}` : ''].filter(Boolean).join(' ');
    fpopup(this, cx, FLOOR - 140, `+${pts}`, boosted ? '#ff9fd0' : '#ffd23f', big ? 34 : 26);
    if (tag) fpopup(this, cx, FLOOR - 186, tag, '#ff4fa3', 20);
    if (combo > 1) {
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setScale(1.3);
      this.tweens.add({ targets: this.comboText, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    if (jackpot) this.jackpot(cx);
    this.updateHud();
  }

  private jackpot(cx: number): void {
    this.sfx('jackpot', { volume: 0.85, exact: true });
    this.sfx('allgold', { volume: 0.6 });
    shake(this, 0.016, 380);
    softFlash(this, 0xffd23f, 260, 0.3);
    const txt = ftxt(this, 360, 470, t('jackpot'), { title: true, size: 56, color: '#ffd23f', strokeThickness: 10, wrap: 680 }).setDepth(45).setScale(0.2);
    this.tweens.add({ targets: txt, scale: 1, angle: { from: -8, to: 0 }, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: txt, alpha: 0, y: 430, delay: 1200, duration: 350, onComplete: () => txt.destroy() });
    const em = this.add.particles(0, 0, 'spark', {
      x: { min: 60, max: 660 }, y: -20, speedY: { min: 300, max: 620 }, speedX: { min: -80, max: 80 },
      scale: { start: 0.14, end: 0.04 }, rotate: { min: 0, max: 360 }, lifespan: 1700, quantity: 3, frequency: 30,
      tint: [0xffd23f, 0xff4fa3, 0x3ee6ff, 0x5dff7a, 0xffffff], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(44);
    this.time.delayedCall(900, () => em.stop());
    this.time.delayedCall(2800, () => em.destroy());
    for (let k = 0; k < 4; k++) {
      this.time.delayedCall(k * 160, () => burst(this, cx + (Math.random() - 0.5) * 160, FLOOR - 80 - Math.random() * 200, [0xffd23f, 0xff4fa3, 0xffffff], 26, 420));
    }
  }

  // ---------------------------------------------------------------- loop
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.roundT += dt;
    this.dropCd = Math.max(0, this.dropCd - dt);
    const c = this.controls;
    if (c.axisX) this.dropX = this.clampDrop(this.dropX + c.axisX * 520 * dt);
    const r = this.round;
    if (!r) return;

    r.update(dt);
    if (r.events.length) {
      const evs = r.events.splice(0);
      for (const e of evs) this.handle(e);
      this.updateHud();
    }

    // dropper and the ball it holds
    const bob = Math.sin(this.roundT * 4) * 3;
    this.dropper.setPosition(this.dropX, DROP_Y - 30);
    this.holder.setPosition(this.dropX, DROP_Y + (this.aiming || c.axisX ? 0 : bob));
    this.holder.rotation = Math.sin(this.roundT * 2) * 0.2;

    // moving parts
    for (const p of r.pegs) {
      if (!p.amp) continue;
      this.pegImgs.get(p.id)?.setX(p.x);
      this.pegGlows.get(p.id)?.setX(p.x);
    }
    for (const bar of r.bars) this.barImgs.get(bar.id)?.setX(bar.x);
    for (const s of r.spinners) {
      const imgs = this.spinImgs.get(s.id);
      if (!imgs) continue;
      imgs[0].rotation = s.angle;
      imgs[1].rotation = s.angle + Math.PI / 2;
      imgs[2].rotation = -s.angle;
    }

    // balls and trails
    const tg = this.trailG;
    tg.clear();
    for (const b of r.balls) {
      const v = this.ballViews.get(b.id);
      if (!v) continue;
      v.img.setPosition(b.x, b.y);
      v.img.rotation += b.vx * dt * 0.02;
      v.img.setAlpha(b.ghost ? 0.55 + Math.sin(this.roundT * 14) * 0.15 : 1);
      v.trail.push(b.x, b.y);
      if (v.trail.length > 20) v.trail.splice(0, 2);
      const col = BALL_LOOK[b.kind].trail;
      const n = v.trail.length / 2;
      for (let k = 0; k < n - 1; k++) {
        const f = (k + 1) / n;
        tg.fillStyle(col, f * (b.ghost ? 0.2 : 0.32)).fillCircle(v.trail[k * 2], v.trail[k * 2 + 1], b.r * (0.3 + 0.6 * f));
      }
    }

    this.drawFx(r, dt);
    if (!this.between && r.done) this.finishBoard();
  }

  private drawFx(r: Round, dt: number): void {
    const g = this.fxG;
    g.clear();
    // aiming guide: only the start of the fall, never where the ball ends up
    const cur = r.queue[0];
    if (cur && !this.between) {
      const end = cur === 'ghost' ? GHOST_Y : PEG_TOP - 14;
      const col = BALL_LOOK[cur].trail;
      const y0 = DROP_Y + 20;
      g.fillStyle(col, 0.08).fillRect(this.dropX - 9, y0, 18, end - y0);
      for (let y = y0 + ((this.roundT * 36) % 14); y < end; y += 14) {
        const a = 0.85 * (1 - (y - y0) / (end - y0 + 20));
        g.fillStyle(col, a).fillCircle(this.dropX, y, 4);
      }
    }
    // pockets: flash on landing, hot pockets glow during a combo
    const h = FLOOR - DIV_TOP - 30;
    for (let i = 0; i < SLOTS; i++) {
      const x = L + i * SLOT_W + 4;
      if (this.slotFlash[i] > 0) {
        g.fillStyle(0xffffff, this.slotFlash[i] * 0.55).fillRect(x, FLOOR - h, SLOT_W - 8, h);
        this.slotFlash[i] = Math.max(0, this.slotFlash[i] - dt * 3);
      }
      const s = r.slots[i];
      if (s.kind === 'pts' && s.value >= 50 && r.streak >= 1) {
        const a = 0.45 + Math.sin(this.roundT * 9) * 0.3;
        g.lineStyle(4, 0xff9f1c, a).strokeRect(x - 1, FLOOR - h - 1, SLOT_W - 6, h + 2);
      }
    }
    // the moving multiplier gate
    if (r.gateSlot >= 0) {
      const tx = L + SLOT_W * (r.gateSlot + 0.5);
      this.gateX += (tx - this.gateX) * Math.min(1, dt * 14);
      const a = 0.6 + Math.sin(this.roundT * 10) * 0.25;
      g.fillStyle(0xff4fa3, 0.16).fillRect(this.gateX - SLOT_W / 2 + 4, DIV_TOP, SLOT_W - 8, FLOOR - DIV_TOP);
      g.lineStyle(4, 0xff4fa3, a).strokeRect(this.gateX - SLOT_W / 2 + 4, DIV_TOP, SLOT_W - 8, FLOOR - DIV_TOP);
      this.gateText.setVisible(true).setText(`x${r.cfg.gateMult}`).setPosition(this.gateX, DIV_TOP + 14);
    } else this.gateText.setVisible(false);
    // goal bar: fills to the three-star mark
    this.shownScore += (r.score - this.shownScore) * Math.min(1, dt * 8);
    const bg = this.barG;
    bg.clear();
    const BAR_X = -BAR_W / 2, BAR_Y = 0;
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(BAR_X, BAR_Y - 7, BAR_W, 14, 7);
    const pr = Math.min(1, this.shownScore / (r.cfg.goal * BAR_FULL));
    const reached = r.score >= r.cfg.goal;
    if (pr > 0.005) {
      bg.fillStyle(reached ? 0x5dff7a : 0xffd23f, 1).fillRoundedRect(BAR_X, BAR_Y - 7, Math.max(14, BAR_W * pr), 14, 7);
      bg.fillStyle(0xffffff, 0.35).fillRoundedRect(BAR_X + 4, BAR_Y - 5, Math.max(6, BAR_W * pr - 8), 4, 2);
    }
  }
}
