// 2D screens over the alley: the ten-frame scorecard (a HUD chip, and big on the summary), the
// call-outs (STRIKE!, SPARE!, TURKEY! …) and the end-of-game summary.
import Phaser from 'phaser';
import { Button, txt, t, playSfx, hudChip, HudChip } from '@core';
import { ScoreSheet, FRAMES } from './scoring';

export const PANEL_DEPTH = 9500;
const MARK_COLOR: Record<string, string> = { X: '#ffd23f', '/': '#34e7ff', '-': '#8f97b8' };

/** The ten frames: frame number, ball boxes and running total; the current frame lit. */
export class CardView {
  readonly root: Phaser.GameObjects.Container;
  readonly width: number;
  private g: Phaser.GameObjects.Graphics;
  private nums: Phaser.GameObjects.Text[] = [];
  private marks: Phaser.GameObjects.Text[][] = [];
  private totals: Phaser.GameObjects.Text[] = [];
  private cellW: number;
  private lastW: number;
  readonly h: number;

  constructor(private scene: Phaser.Scene, o: { cell?: number; last?: number; height?: number; scale?: number } = {}) {
    this.cellW = o.cell ?? 62;
    this.lastW = o.last ?? 92;
    this.h = o.height ?? 86;
    this.width = this.cellW * 9 + this.lastW;
    this.root = scene.add.container(0, 0);
    this.g = scene.add.graphics();
    this.root.add(this.g);
    const big = this.h > 100;
    for (let f = 0; f < FRAMES; f++) {
      const x0 = this.x0(f);
      const num = txt(scene, x0 + 6, -this.h / 2 + 11, String(f + 1), { size: big ? 18 : 14, color: '#aab4dd', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
      this.nums.push(num);
      const boxes = f === FRAMES - 1 ? 3 : 2;
      const row: Phaser.GameObjects.Text[] = [];
      for (let b = 0; b < boxes; b++) {
        const bx = this.boxX(f, b);
        row.push(txt(scene, bx, -this.h / 2 + this.boxS() / 2 + 3, '', { title: true, size: big ? 26 : 19, color: '#ffffff', strokeThickness: 0, shadow: false }));
      }
      this.marks.push(row);
      this.totals.push(txt(scene, x0 + this.w(f) / 2, this.h * 0.2, '', { title: true, size: big ? 34 : 24, color: '#ffffff', strokeThickness: 0, shadow: false }));
      this.root.add([num, ...row, this.totals[f]]);
    }
    this.root.setData('chipWidth', this.width);
  }

  private w(f: number): number { return f === FRAMES - 1 ? this.lastW : this.cellW; }
  private x0(f: number): number { return -this.width / 2 + f * this.cellW; }
  private boxS(): number { return Math.round(this.h * 0.32); }
  private boxX(f: number, b: number): number {
    const s = this.boxS(), n = f === FRAMES - 1 ? 3 : 2;
    return this.x0(f) + this.w(f) - (n - b) * s + s / 2 - 1;
  }

  update(sheet: ScoreSheet, current: number): void {
    const g = this.g;
    g.clear();
    const top = -this.h / 2, s = this.boxS();
    const totals = sheet.totals();
    for (let f = 0; f < FRAMES; f++) {
      const x0 = this.x0(f), w = this.w(f);
      if (f === current) {
        g.fillStyle(0xffd23f, 0.2).fillRoundedRect(x0 + 1, top + 1, w - 2, this.h - 2, 8);
        g.lineStyle(2, 0xffd23f, 0.9).strokeRoundedRect(x0 + 1, top + 1, w - 2, this.h - 2, 8);
      }
      if (f > 0) g.lineStyle(1, 0xffffff, 0.22).lineBetween(x0, top + 4, x0, top + this.h - 4);
      // the ball boxes
      const n = f === FRAMES - 1 ? 3 : 2;
      for (let b = 0; b < n; b++) {
        const bx = this.boxX(f, b) - s / 2;
        g.lineStyle(1, 0xffffff, 0.25).strokeRect(bx, top + 3, s, s);
      }
      const m = sheet.marks(f);
      this.marks[f].forEach((tx, b) => {
        const v = m[b] ?? '';
        tx.setText(v).setColor(MARK_COLOR[v] ?? '#ffffff');
        if (v === 'X' || v === '/') {
          g.fillStyle(v === 'X' ? 0xffd23f : 0x34e7ff, 0.22).fillRect(this.boxX(f, b) - s / 2 + 1, top + 4, s - 2, s - 2);
        }
      });
      this.totals[f].setText(totals[f] === null ? '' : String(totals[f]));
      this.nums[f].setColor(f === current ? '#ffd23f' : '#aab4dd');
    }
  }

  /** Pops the frame's total (a new number came in). */
  pulse(f: number): void {
    const tx = this.totals[f];
    if (!tx) return;
    this.scene.tweens.add({ targets: tx, scale: { from: 1.5, to: 1 }, duration: 320, ease: 'Back.easeOut' });
  }
}

/** The scorecard in a glass HUD chip under the top row. */
export function scorecardChip(scene: Phaser.Scene, y: number): { chip: HudChip; card: CardView } {
  const card = new CardView(scene);
  const chip = hudChip(scene, scene.scale.width / 2, y, { align: 'center', items: [card.root], height: card.h + 8 });
  return { chip, card };
}

let lastCallout: Phaser.GameObjects.Container | null = null;

/** A big call-out over the alley with an optional line under it (replaces the one showing). */
export function callout(scene: Phaser.Scene, text: string, sub = '', color = '#ffd23f', size = 78, y = 420): void {
  const cx = scene.scale.width / 2;
  if (lastCallout?.scene) { scene.tweens.killTweensOf([lastCallout, ...lastCallout.list]); lastCallout.destroy(); }
  const c = scene.add.container(cx, y).setDepth(PANEL_DEPTH - 5).setScrollFactor(0);
  lastCallout = c;
  const tx = txt(scene, 0, 0, text, { title: true, size, color, strokeThickness: 12, stroke: '#1a0b2e', wrap: 680 });
  c.add(tx);
  if (sub) c.add(txt(scene, 0, size * 0.5 + 34, sub, { size: 30, color: '#ffffff', strokeThickness: 6, stroke: '#1a0b2e', wrap: 640 }));
  c.setScale(0.2).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: tx, angle: { from: -4, to: 4 }, duration: 520, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
  scene.tweens.add({ targets: c, y: y - 50, alpha: 0, delay: 1700, duration: 450, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
}

/** End of the game: the full card, the counts and FINISH. */
export class Summary {
  readonly root: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private closed = false;
  private armedAt = performance.now() + 500;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(private scene: Phaser.Scene, sheet: ScoreSheet, private onDone: () => void) {
    const { width, height } = scene.scale;
    const cx = width / 2, cy = height / 2;
    this.dim = scene.add.rectangle(0, 0, width, height, 0x07051a, 0.55).setOrigin(0).setDepth(PANEL_DEPTH - 1).setScrollFactor(0).setInteractive().setAlpha(0);
    this.root = scene.add.container(0, 40).setDepth(PANEL_DEPTH).setScrollFactor(0).setAlpha(0);
    this.root.name = 'summary';
    const pw = 700, ph = 640;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(cx - pw / 2, cy - ph / 2 + 10, pw, ph, 32);
    g.fillStyle(0x16113a, 0.95).fillRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 32);
    g.fillStyle(0xffffff, 0.05).fillRoundedRect(cx - pw / 2 + 6, cy - ph / 2 + 6, pw - 12, 70, { tl: 28, tr: 28, bl: 6, br: 6 });
    g.lineStyle(2, 0xff3fa4, 0.6).strokeRoundedRect(cx - pw / 2, cy - ph / 2, pw, ph, 32);
    this.root.add(g);
    const top = cy - ph / 2;
    this.root.add(txt(scene, cx, top + 46, t('scorecard'), { title: true, size: 40, color: '#ffd23f', strokeThickness: 0 }));
    const card = new CardView(scene, { cell: 64, last: 100, height: 118 });
    card.root.setPosition(cx - 2, top + 160);
    card.update(sheet, -1);
    const cardBg = scene.add.graphics();
    cardBg.fillStyle(0xffffff, 0.07).fillRoundedRect(cx - card.width / 2 - 8, top + 160 - 66, card.width + 12, 132, 14);
    this.root.add([cardBg, card.root]);
    const st = sheet.stats();
    const rows: [string, number, string][] = [[t('strikes'), st.strikes, '#ffd23f'], [t('spares'), st.spares, '#34e7ff'], [t('opens'), st.opens, '#c9cfee']];
    rows.forEach(([label, v, col], i) => {
      const x = cx - 220 + i * 220;
      this.root.add(txt(scene, x, top + 290, String(v), { title: true, size: 46, color: col, strokeThickness: 0 }));
      this.root.add(txt(scene, x, top + 336, label, { size: 24, color: '#cfd6ff', strokeThickness: 0 }));
    });
    this.root.add(txt(scene, cx, top + 404, t('total'), { size: 26, color: '#cfd6ff', strokeThickness: 0 }));
    const total = txt(scene, cx, top + 462, String(sheet.total()), { title: true, size: 72, color: '#ffffff', strokeThickness: 0 });
    this.root.add(total);
    const btn = new Button(scene, cx, top + ph - 70, t('finish'), () => this.go(), { width: 380, height: 92, size: 34, color: 0xff3f8e });
    this.root.add(btn);
    scene.tweens.add({ targets: [this.root, this.dim], alpha: 1, duration: 240 });
    scene.tweens.add({ targets: this.root, y: 0, duration: 360, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: total, scale: { from: 0.4, to: 1 }, duration: 600, delay: 250, ease: 'Back.easeOut' });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat || !scene.scene.isActive()) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        playSfx(scene, 'ui-click');
        this.go();
      }
    };
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown', this.keyHandler));
  }

  private go(): void {
    if (this.closed || performance.now() < this.armedAt) return;
    this.closed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.scene.tweens.add({ targets: [this.root, this.dim], alpha: 0, duration: 200, onComplete: () => { this.root.destroy(); this.dim.destroy(); } });
    this.onDone();
  }
}

/** The rack as ten dots, as the bowler sees it (head pin nearest): standing pins lit. */
export class RackView {
  readonly g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private sp = 23, private r = 8.5) {
    this.g = scene.add.graphics();
    this.g.setData('chipWidth', sp * 3 + r * 2 + 4);
  }

  update(standing: boolean[], split = false): void {
    const g = this.g, sp = this.sp, r = this.r;
    g.clear();
    let i = 0;
    for (let row = 0; row < 4; row++) {
      for (let j = 0; j <= row; j++, i++) {
        const x = (j - row / 2) * sp, y = (1.5 - row) * sp * 0.88;
        if (standing[i]) {
          // a pin seen from above: white, the red neck stripe as a ring, the head in the middle
          g.fillStyle(split ? 0xff9f43 : 0xffffff, 1).fillCircle(x, y, r);
          g.lineStyle(2, 0xe0182d, 1).strokeCircle(x, y, r * 0.55);
        } else {
          g.lineStyle(2, 0xffffff, 0.3).strokeCircle(x, y, r - 1);
        }
      }
    }
  }
}
