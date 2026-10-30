import Phaser from 'phaser';
import { ArcadeScene, Button, burst, shake, flash, popup, t, txt, rng, COLORS } from '@core';
import { CAP, Tubes, Move, generate, levelSpec, lowerBound, pour, unpour, pourCount, usefulMoves, solved, isDone, top } from './logic';
import { LIQUIDS, LAYER_H, TUBE_W, TUBE_H, makeTextures, drawGlass, drawLiquid, surfaceY } from './art';

const W = 720;
const LIFT = 40;
const UNDOS = 3;
const MAX_MULT = 5;

interface TubeView {
  c: Phaser.GameObjects.Container;
  liquid: Phaser.GameObjects.Graphics;
  syms: Phaser.GameObjects.Image[];
  cork: Phaser.GameObjects.Rectangle;
  hx: number;        // home position of the mouth
  hy: number;
  done: boolean;
}

export class PlayScene extends ArcadeScene {
  private tubes: Tubes = [];
  private views: TubeView[] = [];
  private history: Move[] = [];
  private level = 1;
  private moves = 0;
  private par = 0;
  private mult = 1;
  private undos = UNDOS;
  private extraUsed = false;
  private helped = false;
  private selected = -1;
  private cursor = 0;
  private busy = false;
  private running = false;
  private timeLeft = 0;
  private timeTotal = 1;
  private lastTick = 0;
  private perRow = 1;
  private stream!: Phaser.GameObjects.Graphics;
  private cursorMark!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private undoBtn!: Button;
  private tubeBtn!: Button;
  private pointerUsed = false;

  createGame(): void {
    makeTextures(this);
    this.tubes = []; this.views = []; this.history = [];
    this.level = 1; this.moves = 0; this.par = 0; this.mult = 1; this.undos = UNDOS;
    this.extraUsed = false; this.helped = false; this.selected = -1; this.cursor = 0;
    this.busy = false; this.running = false; this.timeLeft = 0; this.timeTotal = 1; this.lastTick = 0;
    this.pointerUsed = false;

    // backdrop: soft gradient and rising bubbles
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x1b1640, 0x1b1640, 0x0a0818, 0x0a0818, 1).fillRect(0, 0, W, 1280);
    this.add.particles(0, 1300, 'ws-dot', {
      x: { min: 0, max: W }, speedY: { min: -60, max: -20 }, speedX: { min: -8, max: 8 },
      scale: { min: 0.2, max: 0.7 }, alpha: { start: 0.18, end: 0 }, lifespan: 16000, frequency: 450,
      tint: [0x3ee6ff, 0xff4fa3, 0xffd23f],
    }).setDepth(-9);

    this.info = txt(this, W / 2, 112, '', { size: 30, color: '#f3f2f2' }).setDepth(50);
    this.bar = this.add.graphics().setDepth(50);
    this.stream = this.add.graphics().setDepth(30);
    this.cursorMark = this.add.graphics().setDepth(5);
    this.hint = txt(this, W / 2, 1035, '', { size: 30, color: '#ffd23f', wrap: 660 }).setDepth(60).setAlpha(0);

    this.undoBtn = new Button(this, 200, 1150, '', () => this.undo(), { width: 290, height: 100, size: 24, color: COLORS.purple });
    this.tubeBtn = new Button(this, 520, 1150, '', () => this.addTube(), { width: 290, height: 100, size: 24, color: 0x2a9d8f });
    txt(this, W / 2, 1238, t('keysHint'), { size: 22, color: '#9a94b8' }).setDepth(50);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y > 1080 || (p.x > W - 130 && p.y < 130)) return;   // buttons, pause corner
      const i = this.tubeAt(p.x, p.y);
      this.pointerUsed = true;
      if (i >= 0) this.tap(i);
      else if (this.selected >= 0 && !this.busy) this.deselect();
    });
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', () => this.moveCursor(-1, 0));
    kb?.on('keydown-RIGHT', () => this.moveCursor(1, 0));
    kb?.on('keydown-A', () => this.moveCursor(-1, 0));
    kb?.on('keydown-D', () => this.moveCursor(1, 0));
    kb?.on('keydown-UP', () => this.moveCursor(0, -1));
    kb?.on('keydown-DOWN', () => this.moveCursor(0, 1));
    kb?.on('keydown-W', () => this.moveCursor(0, -1));
    kb?.on('keydown-S', () => this.moveCursor(0, 1));
    const act = () => { this.pointerUsed = false; this.tap(this.cursor); };
    kb?.on('keydown-SPACE', act);
    kb?.on('keydown-ENTER', act);
    kb?.on('keydown-Z', () => this.undo());
    kb?.on('keydown-U', () => this.undo());
    kb?.on('keydown-BACKSPACE', () => this.undo());
    kb?.on('keydown-X', () => this.addTube());
    kb?.on('keydown-T', () => this.addTube());

    this.startLevel();
  }

  // ---------- levels ----------

  private startLevel(): void {
    const spec = levelSpec(this.level);
    this.tubes = generate(spec);
    this.history = []; this.moves = 0; this.undos = UNDOS; this.extraUsed = false; this.helped = false;
    this.selected = -1; this.cursor = 0;
    this.par = Math.ceil(lowerBound(this.tubes) * 1.3) + 2;
    this.timeTotal = Math.round(spec.colours * Math.max(8, 13 - this.level * 0.25) + 15);
    this.timeLeft = this.timeTotal; this.lastTick = 0;
    this.hud.setCenter(`${t('level')} ${this.level}`);
    this.buildViews(true);
    this.updateUi();
    this.busy = true;
    this.time.delayedCall(450, () => { this.busy = false; this.running = true; });
  }

  private buildViews(intro: boolean): void {
    for (const v of this.views) v.c.destroy();
    this.views = [];
    this.tubes.forEach((_, i) => this.views.push(this.makeView(i)));
    this.layout(false);
    if (intro) {
      this.views.forEach((v, i) => {
        v.c.setScale(0.2).setAlpha(0);
        this.tweens.add({ targets: v.c, scale: 1, alpha: 1, duration: 320, delay: i * 45, ease: 'Back.easeOut' });
      });
    }
    this.views.forEach((_, i) => this.redraw(i));
  }

  private makeView(i: number): TubeView {
    const c = this.add.container(0, 0).setDepth(10);
    const liquid = this.add.graphics();
    const glass = this.add.graphics();
    drawGlass(glass);
    const syms: Phaser.GameObjects.Image[] = [];
    for (let k = 0; k < CAP; k++) syms.push(this.add.image(0, surfaceY(k) - LAYER_H / 2, 'sym-0').setVisible(false));
    const cork = this.add.rectangle(0, -10, TUBE_W - 6, 22, 0xc58b4e).setStrokeStyle(4, 0x5b3a1e).setVisible(false);
    c.add([liquid, ...syms, glass, cork]);
    return { c, liquid, syms, cork, hx: 0, hy: 0, done: isDone(this.tubes[i]) };
  }

  /** Places the tubes in one or two rows, centred; animates when the count changes. */
  private layout(animate: boolean): void {
    const n = this.views.length;
    const rows = n <= 6 ? 1 : 2;
    this.perRow = Math.ceil(n / rows);
    const gap = Math.min(116, 690 / this.perRow);
    this.views.forEach((v, i) => {
      const row = Math.floor(i / this.perRow);
      const inRow = row === rows - 1 ? n - row * this.perRow : this.perRow;
      const col = i - row * this.perRow;
      v.hx = W / 2 + (col - (inRow - 1) / 2) * gap;
      v.hy = rows === 1 ? 470 : 270 + row * 390;
      const y = v.hy - (i === this.selected ? LIFT : 0);
      if (animate) {
        this.tweens.killTweensOf(v.c);
        this.tweens.add({ targets: v.c, x: v.hx, y, rotation: 0, duration: 260, ease: 'Cubic.easeOut' });
      } else v.c.setPosition(v.hx, y).setRotation(0);
    });
    this.drawCursor();
  }

  private redraw(i: number, drain = 0, extra?: { colour: number; amount: number }): void {
    const v = this.views[i], layers = this.tubes[i];
    drawLiquid(v.liquid, layers, drain, extra);
    const shown = Math.round(layers.length - drain);
    for (let k = 0; k < CAP; k++) {
      const s = v.syms[k];
      if (k < shown) s.setTexture(`sym-${layers[k]}`).setVisible(true).setY(surfaceY(k) - LAYER_H / 2);
      else if (extra && k - layers.length < Math.round(extra.amount) && k >= layers.length) {
        s.setTexture(`sym-${extra.colour}`).setVisible(true).setY(surfaceY(k) - LAYER_H / 2);
      } else s.setVisible(false);
    }
    v.cork.setVisible(isDone(layers));
  }

  // ---------- input ----------

  private tubeAt(x: number, y: number): number {
    const n = this.views.length;
    const gap = Math.min(116, 690 / this.perRow);
    for (let i = 0; i < n; i++) {
      const v = this.views[i];
      if (Math.abs(x - v.hx) <= Math.max(gap / 2, 45) && y >= v.hy - LIFT - 50 && y <= v.hy + TUBE_H + 20) return i;
    }
    return -1;
  }

  private moveCursor(dx: number, dy: number): void {
    const n = this.views.length;
    if (!n) return;
    this.pointerUsed = false;
    let c = this.cursor;
    if (dx) c = (c + dx + n) % n;
    if (dy) {
      const next = c + dy * this.perRow;
      if (next >= 0 && next < n) c = next;
      else if (dy > 0 && this.perRow < n && c < this.perRow) c = n - 1;
    }
    this.cursor = c;
    this.drawCursor();
    this.sfx('tick', { volume: 0.25 });
  }

  private drawCursor(): void {
    const g = this.cursorMark;
    g.clear();
    const v = this.views[this.cursor];
    if (!v || this.pointerUsed) return;
    g.lineStyle(6, 0xffd23f, 1).strokeRoundedRect(v.hx - TUBE_W / 2 - 14, v.hy - LIFT - 30, TUBE_W + 28, TUBE_H + LIFT + 54, 16);
  }

  private tap(i: number): void {
    if (this.busy || !this.running || this.isOver) return;
    this.cursor = i;
    this.drawCursor();
    if (this.selected < 0) {
      this.select(i);
      return;
    }
    if (this.selected === i) {
      this.deselect();
      return;
    }
    const from = this.selected;
    if (pourCount(this.tubes, from, i) > 0) {
      this.doPour(from, i);
      return;
    }
    // cannot pour there: pick that tube instead when it can be lifted
    if (this.tubes[i].length && !isDone(this.tubes[i])) {
      this.deselect(true);
      this.select(i);
    } else {
      this.sfx('error', { volume: 0.5 });
      this.wiggle(i);
    }
  }

  private select(i: number): void {
    const layers = this.tubes[i];
    if (!layers.length || isDone(layers)) {
      this.sfx('error', { volume: 0.5 });
      this.wiggle(i);
      return;
    }
    this.selected = i;
    const v = this.views[i];
    this.tweens.killTweensOf(v.c);
    this.tweens.add({ targets: v.c, y: v.hy - LIFT, x: v.hx, rotation: 0, duration: 120, ease: 'Back.easeOut' });
    this.sfxAt('pick', v.hx, { volume: 0.5 });
  }

  private deselect(quiet = false): void {
    const i = this.selected;
    this.selected = -1;
    if (i < 0) return;
    const v = this.views[i];
    this.tweens.killTweensOf(v.c);
    this.tweens.add({ targets: v.c, y: v.hy, x: v.hx, rotation: 0, duration: 140, ease: 'Cubic.easeOut' });
    if (!quiet) this.sfxAt('putback', v.hx, { volume: 0.4 });
  }

  private wiggle(i: number): void {
    const v = this.views[i];
    if (!v) return;
    this.tweens.killTweensOf(v.c);
    v.c.setPosition(v.hx, v.hy).setRotation(0);
    this.tweens.add({ targets: v.c, rotation: { from: -0.08, to: 0.08 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => v.c.setRotation(0) });
  }

  // ---------- pouring ----------

  private doPour(a: number, b: number): void {
    const before = this.tubes[a].slice();
    const tgtBefore = this.tubes[b].slice();
    const colour = top(before);
    const m = pour(this.tubes, a, b)!;
    this.history.push(m);
    this.moves++;
    this.selected = -1;
    this.busy = true;
    this.updateUi();

    const src = this.views[a], dst = this.views[b];
    const side = dst.hx > W / 2 ? -1 : 1;          // the glass leans in from the screen centre
    const ang = side < 0 ? 1.2 : -1.2;
    const mouthX = dst.hx + side * 16, mouthY = dst.hy - 64;
    src.c.setDepth(20);
    this.tweens.killTweensOf(src.c);
    // draw the layers being poured from the old contents while the model already moved on
    const srcModel = this.tubes[a];
    this.tubes[a] = before;
    this.tubes[b] = tgtBefore;
    this.tweens.add({
      targets: src.c, x: mouthX, y: mouthY, rotation: ang, duration: 170, ease: 'Sine.easeOut',
      onComplete: () => {
        this.sfxAt(rng.pick(['pour1', 'pour2', 'pour3']), dst.hx, { volume: 0.7 });
        const p = { v: 0 };
        this.tweens.add({
          targets: p, v: 1, duration: 140 + m.n * 110, ease: 'Sine.easeInOut',
          onUpdate: () => {
            const amt = p.v * m.n;
            this.redraw(a, amt);
            this.redraw(b, 0, { colour, amount: amt });
            const surf = dst.hy + surfaceY(tgtBefore.length + amt);
            this.stream.clear().fillStyle(LIQUIDS[colour], 1).fillRect(dst.hx - 5, mouthY + 4, 10, Math.max(0, surf - mouthY - 4));
          },
          onComplete: () => {
            this.stream.clear();
            this.tubes[a] = srcModel;
            this.tubes[b] = tgtBefore.concat(Array(m.n).fill(colour));
            this.redraw(a); this.redraw(b);
            burst(this, dst.hx, dst.hy + surfaceY(this.tubes[b].length), LIQUIDS[colour], 8, 140);
            this.tweens.add({
              targets: src.c, x: src.hx, y: src.hy, rotation: 0, duration: 170, ease: 'Sine.easeIn',
              onComplete: () => src.c.setDepth(10),
            });
            this.afterPour(b);
          },
        });
      },
    });
  }

  private afterPour(b: number): void {
    const v = this.views[b];
    if (isDone(this.tubes[b]) && !v.done) {
      v.done = true;
      const col = this.tubes[b][0];
      burst(this, v.hx, v.hy + 20, [LIQUIDS[col], 0xffffff, 0xffd23f], 26, 300);
      v.cork.setScale(1.8).setAlpha(0);
      this.tweens.add({ targets: v.cork, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
      this.tweens.add({ targets: v.c, scaleX: 1.08, scaleY: 0.94, duration: 90, yoyo: true });
      this.sfxAt('full', v.hx, { volume: 0.6 });
    }
    if (solved(this.tubes)) {
      this.levelClear();
      return;
    }
    this.busy = false;
    this.checkStuck();
  }

  private checkStuck(): void {
    if (usefulMoves(this.tubes).length) { this.hideHint(); return; }
    if (this.undos > 0 || !this.extraUsed) {
      this.showHint(t('noMoves'));
      this.sfx('error', { volume: 0.4 });
      return;
    }
    this.fail(t('stuck'));
  }

  private showHint(s: string): void {
    this.tweens.killTweensOf(this.hint);
    this.hint.setText(s).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.hint, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  private hideHint(): void {
    if (this.hint.alpha <= 0) return;
    this.tweens.killTweensOf(this.hint);
    this.tweens.add({ targets: this.hint, alpha: 0, duration: 200 });
  }

  // ---------- helps ----------

  private undo(): void {
    if (this.busy || !this.running || this.isOver) return;
    if (!this.history.length || this.undos <= 0) {
      this.sfx('error', { volume: 0.4 });
      this.tweens.add({ targets: this.undoBtn, x: { from: 192, to: 208 }, duration: 50, yoyo: true, repeat: 2, onComplete: () => this.undoBtn.setX(200) });
      return;
    }
    if (this.selected >= 0) this.deselect(true);
    const m = this.history.pop()!;
    unpour(this.tubes, m);
    this.undos--;
    this.helped = true;
    this.views[m.to].done = isDone(this.tubes[m.to]);
    this.redraw(m.from); this.redraw(m.to);
    const v = this.views[m.from];
    burst(this, v.hx, v.hy + surfaceY(this.tubes[m.from].length), LIQUIDS[top(this.tubes[m.from])], 8, 120);
    this.sfx('undo', { volume: 0.55 });
    this.updateUi();
    this.checkStuck();
  }

  private addTube(): void {
    if (this.busy || !this.running || this.isOver) return;
    if (this.extraUsed) {
      this.sfx('error', { volume: 0.4 });
      return;
    }
    if (this.selected >= 0) this.deselect(true);
    this.extraUsed = true;
    this.helped = true;
    this.tubes.push([]);
    const v = this.makeView(this.tubes.length - 1);
    this.views.push(v);
    this.layout(true);
    v.c.setPosition(v.hx, v.hy + 400).setAlpha(0);
    this.tweens.killTweensOf(v.c);
    this.tweens.add({ targets: v.c, y: v.hy, alpha: 1, duration: 380, ease: 'Back.easeOut' });
    this.redraw(this.tubes.length - 1);
    this.sfx('addtube', { volume: 0.6 });
    flash(this, 0x3ee6ff, 120, 0.2);
    this.updateUi();
    this.hideHint();
  }

  // ---------- results ----------

  private levelClear(): void {
    this.running = false;
    this.busy = true;
    this.hideHint();
    const timeBonus = Math.ceil(this.timeLeft) * 5;
    const fewBonus = Math.max(0, this.par - this.moves) * 30;
    const base = 100 + 50 * this.level;
    const gained = (base + timeBonus + fewBonus) * this.mult;
    const clean = !this.helped;
    const nextMult = clean ? Math.min(MAX_MULT, this.mult + 1) : 1;
    this.time.delayedCall(350, () => {
      this.sfx('clear', { volume: 0.7, exact: true });
      shake(this, 0.006, 200);
      for (const v of this.views) {
        if (this.tubes[this.views.indexOf(v)].length) burst(this, v.hx, v.hy + 60, [0xffd23f, 0xffffff, 0x3ee6ff, 0xff4fa3], 18, 380);
        this.tweens.add({ targets: v.c, y: v.hy - 30, duration: 160, yoyo: true, ease: 'Sine.easeOut' });
      }
      this.addScore(gained, W / 2, 640);
      const lines = [t('levelClear'), `+${gained}`];
      if (fewBonus) lines.push(t('fewMoves', { n: fewBonus }));
      if (timeBonus) lines.push(t('timeBonus', { n: timeBonus }));
      if (clean) lines.push(t('clean', { n: nextMult }));
      const banner = txt(this, W / 2, 600, lines.join('\n'), { title: true, size: 26, color: '#5dff7a', strokeThickness: 8 }).setDepth(80).setScale(0.3);
      const panel = this.add.rectangle(W / 2, 600, 680, banner.height + 50, 0x0a0818, 0.85).setStrokeStyle(4, 0x5dff7a).setDepth(79).setScale(0.3);
      this.tweens.add({ targets: [banner, panel], scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: [banner, panel], alpha: 0, delay: 1500, duration: 300, onComplete: () => { banner.destroy(); panel.destroy(); } });
    });
    this.mult = nextMult;
    if (clean) this.time.delayedCall(700, () => this.sfx('bonus', { volume: 0.5 }));
    this.time.delayedCall(2100, () => {
      if (this.isOver) return;
      for (const v of this.views) this.tweens.add({ targets: v.c, y: v.hy - 900, alpha: 0, duration: 300, ease: 'Cubic.easeIn' });
      this.time.delayedCall(320, () => {
        if (this.isOver) return;
        this.level++;
        this.startLevel();
      });
    });
  }

  private fail(title: string): void {
    if (this.isOver) return;
    this.running = false;
    this.sfx('fail', { volume: 0.7 });
    shake(this, 0.012, 300);
    flash(this, COLORS.red, 200, 0.3);
    for (const v of this.views) this.tweens.add({ targets: v.c, angle: rng.int(-12, 12), duration: 300, ease: 'Sine.easeOut' });
    this.endGame({ title, delay: 1100 });
  }

  private updateUi(): void {
    this.info.setText(`${t('moves')} ${this.moves}  ·  ${t('par')} ${this.par}  ·  ${t('mult')} x${this.mult}`);
    this.undoBtn.setText(`${t('undo')} ${this.undos}`).setAlpha(this.undos > 0 ? 1 : 0.45);
    this.tubeBtn.setText(this.extraUsed ? t('used') : t('addTube')).setAlpha(this.extraUsed ? 0.45 : 1);
    this.drawBar();
  }

  private drawBar(): void {
    const g = this.bar;
    const k = Phaser.Math.Clamp(this.timeLeft / this.timeTotal, 0, 1);
    const low = this.timeLeft < 10;
    g.clear();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(60, 146, 600, 18, 9);
    g.fillStyle(low ? 0xec3013 : k < 0.4 ? 0xffd23f : 0x5dff7a, 1).fillRoundedRect(60, 146, Math.max(18, 600 * k), 18, 9);
    this.hud.setRight(`${Math.ceil(this.timeLeft)}s`);
  }

  updateGame(_time: number, delta: number): void {
    if (!this.running) return;
    this.timeLeft -= delta / 1000;
    const sec = Math.ceil(this.timeLeft);
    if (this.timeLeft < 10 && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      this.sfx('tick', { volume: 0.5 });
      if (sec === 9) this.showHint(t('hurry'));
      if (sec === 7) this.hideHint();
    }
    this.drawBar();
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.drawBar();
      this.fail(t('timeUp'));
    }
  }
}
