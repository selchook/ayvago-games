// Screens drawn over the 3D course: the course picker, the hole card, the scorecard and the
// big call-outs (BIRDIE!, HOLE IN ONE! …). Touch, mouse and keys (arrows, Space / Enter).
import Phaser from 'phaser';
import { Button, txt, t, upper, playSfx } from '@core';
import { callOf, type Call } from './scoring';

export const PANEL_DEPTH = 9500;

/** One played hole on the card. */
export interface CardRow {
  n: number;
  par: number;
  strokes: number | null;
  holed: boolean;
  points: number;
}

function glass(scene: Phaser.Scene, cx: number, cy: number, w: number, h: number, alpha = 0.93): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3).fillRoundedRect(cx - w / 2, cy - h / 2 + 10, w, h, 32);
  g.fillStyle(0x12203a, alpha).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 32);
  g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 32);
  return g;
}

/** Base for a modal screen: dim backdrop, a container, keys, cleanup. */
class Panel {
  readonly root: Phaser.GameObjects.Container;
  protected dim: Phaser.GameObjects.Rectangle;
  /** Wall-clock time from which input counts (the key that opened the panel must not close it). */
  private armedAt = performance.now() + 350;
  protected get armed(): boolean {
    return performance.now() >= this.armedAt;
  }
  closed = false;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(protected scene: Phaser.Scene, dimAlpha = 0.5) {
    const { width, height } = scene.scale;
    this.dim = scene.add.rectangle(0, 0, width, height, 0x07101e, dimAlpha).setOrigin(0).setDepth(PANEL_DEPTH - 1).setScrollFactor(0).setInteractive().setAlpha(0);
    this.root = scene.add.container(0, 40).setDepth(PANEL_DEPTH).setScrollFactor(0).setAlpha(0);
    scene.tweens.add({ targets: [this.root, this.dim], alpha: 1, duration: 220 });
    scene.tweens.add({ targets: this.root, y: 0, duration: 320, ease: 'Back.easeOut' });
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.armed || this.closed || e.repeat || !scene.scene.isActive()) return;
      this.key(e.code);
    };
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      scene.input.keyboard?.off('keydown', this.keyHandler);
    });
  }

  protected key(_code: string): void {}

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.scene.tweens.killTweensOf([this.root, this.dim]);
    this.dim.disableInteractive();
    this.scene.tweens.add({
      targets: [this.root, this.dim], alpha: 0, duration: 180,
      onComplete: () => { this.root.destroy(); this.dim.destroy(); },
    });
  }
}

/** The three ways to play: Meadow (1–9), Castle (10–18) or all 18 holes. */
export class CoursePicker extends Panel {
  private focus = 0;
  private rings: Phaser.GameObjects.Graphics[] = [];

  constructor(scene: Phaser.Scene, pars: [number, number, number], private onPick: (i: number) => void, start = 0) {
    super(scene, 0.35);
    const cx = scene.scale.width / 2;
    const r = this.root;
    r.add(glass(scene, cx, 615, 640, 730));
    r.add(txt(scene, cx, 315, t('pickCourse'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 0 }));
    const items: [string, string, number][] = [
      [t('meadow'), t('meadowSub'), 0x2fae5a],
      [t('castle'), t('castleSub'), 0x7a5cd6],
      [t('full'), t('fullSub'), 0xec6a13],
    ];
    items.forEach(([title, sub, color], i) => {
      const y = 450 + i * 200;
      const ring = scene.add.graphics();
      ring.lineStyle(5, 0xffd23f, 1).strokeRoundedRect(cx - 275, y - 66, 550, 132, 40);
      ring.setVisible(false);
      this.rings.push(ring);
      r.add(ring);
      const b = new Button(scene, cx, y - 8, title, () => this.pick(i), { width: 520, height: 100, size: 34, color });
      r.add(b);
      r.add(txt(scene, cx, y + 70, `${sub}  ·  ${t('par')} ${pars[i]}`, { size: 22, color: '#cfe0ff', strokeThickness: 0, wrap: 600 }));
    });
    this.focus = start;
    this.showFocus();
  }

  private showFocus(): void {
    this.rings.forEach((g, i) => g.setVisible(i === this.focus));
  }

  protected key(code: string): void {
    if (code === 'ArrowUp' || code === 'KeyW') { this.focus = (this.focus + 2) % 3; this.showFocus(); playSfx(this.scene, 'tick'); }
    else if (code === 'ArrowDown' || code === 'KeyS') { this.focus = (this.focus + 1) % 3; this.showFocus(); playSfx(this.scene, 'tick'); }
    else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') this.pick(Number(code.slice(5)) - 1);
    else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') this.pick(this.focus);
  }

  private pick(i: number): void {
    if (this.closed || !this.armed) return;
    playSfx(this.scene, 'ui-click');
    this.close();
    this.onPick(i);
  }
}

/** The card at the start of a hole: number, name, par and a tip. Goes away by itself. */
export function holeCard(scene: Phaser.Scene, o: { n: number; name: string; par: number; tip?: string; limit: number }): Phaser.GameObjects.Container {
  const cx = scene.scale.width / 2, cy = 300;
  const c = scene.add.container(0, 0).setDepth(PANEL_DEPTH - 10).setScrollFactor(0);
  const h = o.tip ? 250 : 200;
  c.add(glass(scene, cx, cy, 560, h, 0.82));
  c.add(txt(scene, cx, cy - h / 2 + 44, t('holeN', { n: o.n }), { title: true, size: 26, color: '#9fe7b8', strokeThickness: 0 }));
  c.add(txt(scene, cx, cy - h / 2 + 96, o.name, { title: true, size: 44, color: '#ffd23f', strokeThickness: 0 }));
  c.add(txt(scene, cx, cy - h / 2 + 148, `${upper(t('par'))} ${o.par}   ·   ${t('limit', { n: o.limit })}`, { size: 26, color: '#ffffff', strokeThickness: 0 }));
  if (o.tip) c.add(txt(scene, cx, cy - h / 2 + 200, o.tip, { size: 22, color: '#cfe0ff', strokeThickness: 0, wrap: 520 }));
  c.setAlpha(0).setScale(0.9);
  scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });
  return c;
}

const CALL_KEY: Record<Call, string> = {
  holeInOne: 'holeInOne', albatross: 'albatross', eagle: 'eagle', birdie: 'birdie', par: 'parCall',
  bogey: 'bogey', double: 'doubleBogey', worse: 'worse', pickedUp: 'pickedUp',
};
const CALL_COLOR: Record<Call, string> = {
  holeInOne: '#ffd23f', albatross: '#ffd23f', eagle: '#ffd23f', birdie: '#7dff9a', par: '#ffffff',
  bogey: '#ffb36b', double: '#ff8a6b', worse: '#ff6b6b', pickedUp: '#ff6b6b',
};

export function callText(call: Call, over: number): string {
  return call === 'worse' ? t('worse', { n: over }) : t(CALL_KEY[call]);
}

/** A big call-out in the middle of the screen. */
export function callout(scene: Phaser.Scene, text: string, color = '#ffd23f', size = 64, y = 470): void {
  const cx = scene.scale.width / 2;
  const tx = txt(scene, cx, y, text, { title: true, size, color, strokeThickness: 10, wrap: 660 }).setDepth(PANEL_DEPTH - 5).setScrollFactor(0);
  tx.setScale(0.2).setAlpha(0);
  scene.tweens.add({ targets: tx, scale: 1, alpha: 1, duration: 360, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: tx, y: y - 40, alpha: 0, delay: 1500, duration: 450, ease: 'Quad.easeIn', onComplete: () => tx.destroy() });
}

export const callColor = (c: Call): string => CALL_COLOR[c];

/** The scorecard after each hole (and at the end of the round). */
export class Scorecard extends Panel {
  constructor(scene: Phaser.Scene, o: { rows: CardRow[]; current: number; last: boolean; total: number; title?: string }, private onGo: () => void) {
    super(scene, 0.55);
    this.root.name = 'scorecard';
    const cx = scene.scale.width / 2;
    const r = this.root;
    const blocks = o.rows.length > 9 ? 2 : 1;
    const blockH = 230;
    const h = 250 + blocks * blockH + 40;
    const cy = 640;
    const top = cy - h / 2;
    r.add(glass(scene, cx, cy, 680, h));
    r.add(txt(scene, cx, top + 50, o.title ?? t('scorecard'), { title: true, size: 36, color: '#ffd23f', strokeThickness: 0 }));

    const labelW = 112, colW = 54, x0 = cx - 330 + 8;
    for (let b = 0; b < blocks; b++) {
      const rows = o.rows.slice(b * 9, b * 9 + 9);
      const y0 = top + 100 + b * blockH;
      const g = scene.add.graphics();
      g.fillStyle(0xffffff, 0.06).fillRoundedRect(x0, y0, 660 - 16, blockH - 20, 18);
      g.fillStyle(0x2fae5a, 0.25).fillRoundedRect(x0, y0, 660 - 16, 44, { tl: 18, tr: 18, bl: 0, br: 0 });
      r.add(g);
      const lines: [string, number][] = [[t('hole'), 22], [t('par'), 72], [t('strokes'), 124], [t('points'), 176]];
      for (const [label, dy] of lines) r.add(txt(scene, x0 + 12, y0 + dy, label, { size: 20, color: '#cfe0ff', strokeThickness: 0, align: 'left' }).setOrigin(0, 0.5));
      rows.forEach((row, i) => {
        const x = x0 + labelW + colW * i + colW / 2;
        const cur = row.n - 1 === o.current;
        if (cur) {
          const hl = scene.add.graphics();
          hl.fillStyle(0xffd23f, 0.16).fillRoundedRect(x - colW / 2 + 2, y0 + 2, colW - 4, blockH - 24, 10);
          r.add(hl);
        }
        r.add(txt(scene, x, y0 + 22, String(row.n), { title: true, size: 20, color: cur ? '#ffd23f' : '#ffffff', strokeThickness: 0 }));
        r.add(txt(scene, x, y0 + 72, String(row.par), { size: 22, color: '#ffffff', strokeThickness: 0 }));
        if (row.strokes !== null) {
          const call = callOf(row.par, row.strokes, row.holed);
          const mark = scene.add.graphics();
          const my = y0 + 124;
          mark.lineStyle(3, Phaser.Display.Color.HexStringToColor(CALL_COLOR[call]).color, 0.95);
          // golf card marks: circles under par, squares over par
          if (call === 'birdie' || call === 'eagle' || call === 'albatross' || call === 'holeInOne') {
            mark.strokeCircle(x, my, 19);
            if (call !== 'birdie') mark.strokeCircle(x, my, 14);
          } else if (call !== 'par') {
            mark.strokeRect(x - 18, my - 18, 36, 36);
            if (call !== 'bogey') mark.strokeRect(x - 13, my - 13, 26, 26);
          }
          r.add(mark);
          r.add(txt(scene, x, my, row.holed ? String(row.strokes) : `${row.strokes}`, { title: true, size: 22, color: CALL_COLOR[call], strokeThickness: 0 }));
          r.add(txt(scene, x, y0 + 176, String(row.points), { size: 18, color: '#9fe7b8', strokeThickness: 0 }));
        }
      });
    }
    // totals
    const played = o.rows.filter((x) => x.strokes !== null);
    const strokes = played.reduce((s, x) => s + (x.strokes ?? 0), 0);
    const par = played.reduce((s, x) => s + x.par, 0);
    const diff = strokes - par;
    const rel = diff === 0 ? t('evenPar') : diff < 0 ? t('underPar', { n: -diff }) : t('overPar', { n: diff });
    const yT = top + 100 + blocks * blockH + 10;
    r.add(txt(scene, cx, yT, `${t('strokes')} ${strokes} / ${t('par')} ${par}  ·  ${rel}`, { size: 26, color: '#ffffff', strokeThickness: 0 }));
    r.add(txt(scene, cx, yT + 44, `${t('points')}: ${o.total}`, { title: true, size: 32, color: '#ffd23f', strokeThickness: 0 }));
    const btn = new Button(scene, cx, top + h - 6, o.last ? t('finish') : t('next'), () => this.go(), { width: 400, height: 92, size: 32, color: o.last ? 0xec6a13 : 0x2fae5a });
    r.add(btn);
  }

  protected key(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
      playSfx(this.scene, 'ui-click');
      this.go();
    }
  }

  private go(): void {
    if (this.closed || !this.armed) return;
    this.close();
    this.onGo();
  }
}
