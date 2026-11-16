// Screens drawn over the 3D course: the course picker, the hole card, the scorecard and the
// big call-outs (BIRDIE!, HOLE IN ONE! …). Touch, mouse and keys (arrows, Space / Enter).
// The picker, the hole card and the scorecard wear the menu theme (theme.ts): the wooden
// scorecard as the card, felt buttons, labels in the display face. Every card, face and fixed line
// is painted in Boot under the Ayvago intro (`prebakeCourse`, the theme's `prebake`) and the
// numbers are set from painted glyphs, so opening a screen only places images.
import Phaser from 'phaser';
import { t, upper, loc, playSfx, txt, themeCard, labelTexture, labelAt, fitWidth, GlyphText, Para, KitButton, bakeButton, bakePara, glyphAtlas, type LabelStyle } from '@core';
import { callOf, TUNING, type Call } from './scoring';
import { HOLES, MEADOW, CASTLE } from './holes';

export const PANEL_DEPTH = 9500;

/** One played hole on the card. */
export interface CardRow {
  n: number;
  par: number;
  strokes: number | null;
  holed: boolean;
  points: number;
}

// ------------------------------------------------------------------ the painted pieces

// the theme's colours (theme.ts imports this file, so they are repeated here)
const RED = 0xe0392b, FELT = 0x2e8b45, ORANGE = 0xec7a1a, PURPLE = 0x7a5cd6, INK = '#173016';

/** The cards (`menuTheme.cards`): the picker, the hole card (with and without a tip), the scorecard (9 and 18 holes). */
export const PICK_CARD = { w: 640, h: 730 };
const HOLE_W = 560;
const CARD_W = 680, BLOCK_H = 230;
const cardH = (blocks: number): number => 250 + blocks * BLOCK_H + 40;
export const COURSE_CARDS = [PICK_CARD, { w: HOLE_W, h: 200 }, { w: HOLE_W, h: 250 }, { w: CARD_W, h: cardH(1) }, { w: CARD_W, h: cardH(2) }];
const PICK_BTN = { w: 520, h: 100 }, GO_BTN = { w: 400, h: 92 };
const DIGITS = '0123456789';

const S = {
  title: { size: 40, fill: ['#ffffff', '#fff2a8', '#ffc21a'], stroke: INK } as LabelStyle,
  sub: { size: 22, color: '#3a3020', stroke: null, shadow: false, body: true } as LabelStyle,
  btn: { size: 34 } as LabelStyle,
  go: { size: 32 } as LabelStyle,
  holeN: { size: 26, color: '#2e8b45', stroke: null, shadow: false } as LabelStyle,
  name: { size: 44, fill: ['#ffffff', '#fff2a8', '#ffc21a'], stroke: INK } as LabelStyle,
  parLine: { size: 26, color: '#2a2014', stroke: null, shadow: false, body: true } as LabelStyle,
  tip: { size: 22, color: '#4a4030', stroke: null, shadow: false, body: true } as LabelStyle,
  card: { size: 36, fill: ['#ffffff', '#fff2a8', '#ffc21a'], stroke: INK } as LabelStyle,
  row: { size: 20, color: '#3a5a3a', stroke: null, shadow: false, body: true } as LabelStyle,
  num: { size: 20, color: '#2a2014', stroke: null, shadow: false } as LabelStyle,
  cur: { size: 20, color: '#b5281e', stroke: null, shadow: false } as LabelStyle,
  par: { size: 22, color: '#2a2014', stroke: null, shadow: false, body: true } as LabelStyle,
  pts: { size: 18, color: '#2e8b45', stroke: null, shadow: false, body: true } as LabelStyle,
  sum: { size: 26, color: '#2a2014', stroke: null, shadow: false, body: true } as LabelStyle,
  total: { size: 32, color: '#b5281e', stroke: null, shadow: false } as LabelStyle,
};

/** The colours of the stroke marks on the card (on paper: darker than the call-outs). */
const INK_CALL: Record<Call, string> = {
  holeInOne: '#c08a00', albatross: '#c08a00', eagle: '#c08a00', birdie: '#1f8a3a', par: '#2a2014',
  bogey: '#d0661a', double: '#c8401e', worse: '#b5281e', pickedUp: '#b5281e',
};
const strokeStyle = (c: Call): LabelStyle => ({ size: 22, color: INK_CALL[c], stroke: null, shadow: false });

/** The characters of the totals lines: digits and the words in them (the current language). */
function sumChars(): string {
  const words = [t('strokes'), t('par'), t('evenPar'), t('underPar', { n: '' }), t('overPar', { n: '' }), t('points')].join('');
  return [...new Set([...DIGITS + '/·: ' + words])].join('');
}
const sumLine = (strokes: number, par: number, rel: string): string => `${t('strokes')} ${strokes} / ${t('par')} ${par}  ·  ${rel}`;
const parLine = (par: number, limit: number): string => `${upper(t('par'))} ${par}   ·   ${t('limit', { n: limit })}`;
const COURSES = (): Array<[string, string, number]> => [[t('meadow'), t('meadowSub'), FELT], [t('castle'), t('castleSub'), PURPLE], [t('full'), t('fullSub'), ORANGE]];
const parsOf = (): number[] => {
  const m = MEADOW.reduce((a, h) => a + h.par, 0), c = CASTLE.reduce((a, h) => a + h.par, 0);
  return [m, c, m + c];
};

/**
 * Paints everything the picker, the hole cards and the scorecard show (the theme's `prebake`, in
 * Boot under the Ayvago intro): the buttons' faces, every fixed line in the current language
 * (courses, holes' names, tips and par lines) and the glyphs of the numbers.
 */
export function prebakeCourse(scene: Phaser.Scene): void {
  const pars = parsOf();
  labelTexture(scene, t('pickCourse'), S.title);
  COURSES().forEach(([title, sub, color], i) => {
    bakeButton(scene, 'button', PICK_BTN.w, PICK_BTN.h, color, false, true);
    labelTexture(scene, title, S.btn);
    bakePara(scene, `${sub}  ·  ${t('par')} ${pars[i]}`, S.sub, 600);
  });
  for (let n = 1; n <= HOLES.length; n++) labelTexture(scene, t('holeN', { n }), S.holeN);
  for (const h of HOLES) {
    labelTexture(scene, loc(h.name), S.name);
    for (const tu of Object.values(TUNING)) labelTexture(scene, parLine(h.par, h.par + tu.extraStrokes), S.parLine);
    if (h.tip) bakePara(scene, loc(h.tip), S.tip, HOLE_W - 40);
  }
  labelTexture(scene, t('scorecard'), S.card);
  for (const k of ['hole', 'par', 'strokes', 'points']) labelTexture(scene, t(k), S.row);
  for (const o of [S.num, S.cur, S.par, S.pts]) glyphAtlas(scene, o, DIGITS);
  for (const c of Object.keys(INK_CALL) as Call[]) glyphAtlas(scene, strokeStyle(c), DIGITS);
  glyphAtlas(scene, S.sum, sumChars());
  glyphAtlas(scene, S.total, sumChars());
  bakeButton(scene, 'button', GO_BTN.w, GO_BTN.h, FELT);
  bakeButton(scene, 'button', GO_BTN.w, GO_BTN.h, ORANGE);
  for (const k of ['next', 'finish']) labelTexture(scene, t(k), S.go);
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
  private buttons: KitButton[] = [];

  constructor(scene: Phaser.Scene, pars: [number, number, number], private onPick: (i: number) => void, start = 0) {
    super(scene, 0.35);
    const cx = scene.scale.width / 2;
    const r = this.root;
    r.add(themeCard(scene, cx, 615, PICK_CARD.w, PICK_CARD.h));
    r.add(fitWidth(labelAt(scene, cx, 318, t('pickCourse'), S.title), PICK_CARD.w - 80));
    COURSES().forEach(([title, sub, color], i) => {
      const y = 450 + i * 200;
      const b = new KitButton(scene, cx, y - 8, { ...PICK_BTN, color, label: title, style: S.btn, sfx: null }, () => this.pick(i));
      b.on('pointerover', () => { this.focus = i; this.showFocus(); });
      this.buttons.push(b);
      r.add(b);
      const line = new Para(scene, cx, y + 58, `${sub}  ·  ${t('par')} ${pars[i]}`, S.sub, 600, 0.5, 26);
      r.add(line);
    });
    this.focus = start;
    this.showFocus();
  }

  private showFocus(): void {
    this.buttons.forEach((b, i) => b.setSelected(i === this.focus));
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
  c.add(themeCard(scene, cx, cy, HOLE_W, h));
  c.add(labelAt(scene, cx, cy - h / 2 + 46, t('holeN', { n: o.n }), S.holeN));
  c.add(fitWidth(labelAt(scene, cx, cy - h / 2 + 96, o.name, S.name), HOLE_W - 60));
  c.add(labelAt(scene, cx, cy - h / 2 + 146, parLine(o.par, o.limit), S.parLine));
  if (o.tip) {
    const tip = new Para(scene, cx, 0, o.tip, S.tip, HOLE_W - 40, 0.5, 26);
    tip.y = cy - h / 2 + 196 - tip.textHeight / 2;
    c.add(tip);
  }
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
    const h = cardH(blocks);
    const cy = 640;
    const top = cy - h / 2;
    r.add(themeCard(scene, cx, cy, CARD_W, h));
    r.add(labelAt(scene, cx, top + 56, o.title ?? t('scorecard'), S.card));

    const labelW = 112, colW = 54, x0 = cx - 330 + 8;
    for (let b = 0; b < blocks; b++) {
      const rows = o.rows.slice(b * 9, b * 9 + 9);
      const y0 = top + 100 + b * BLOCK_H;
      const g = scene.add.graphics();
      g.fillStyle(0x2e8b45, 0.07).fillRoundedRect(x0, y0, 660 - 16, BLOCK_H - 20, 12);
      g.fillStyle(0x2e8b45, 0.2).fillRoundedRect(x0, y0, 660 - 16, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.lineStyle(1.5, 0x2e8b45, 0.35).strokeRoundedRect(x0, y0, 660 - 16, BLOCK_H - 20, 12);
      for (const dy of [96, 148]) g.lineStyle(1, 0x2e8b45, 0.18).lineBetween(x0 + 8, y0 + dy, x0 + 636, y0 + dy);
      r.add(g);
      const lines: [string, number][] = [[t('hole'), 22], [t('par'), 72], [t('strokes'), 124], [t('points'), 176]];
      for (const [label, dy] of lines) r.add(fitWidth(labelAt(scene, x0 + 12, y0 + dy, label, S.row, 0), labelW - 14));
      rows.forEach((row, i) => {
        const x = x0 + labelW + colW * i + colW / 2;
        const cur = row.n - 1 === o.current;
        if (cur) {
          const hl = scene.add.graphics();
          hl.fillStyle(0xffd23f, 0.28).fillRoundedRect(x - colW / 2 + 2, y0 + 2, colW - 4, BLOCK_H - 24, 8);
          r.add(hl);
        }
        r.add(new GlyphText(scene, x, y0 + 22, String(row.n), cur ? S.cur : S.num, 0.5, DIGITS));
        r.add(new GlyphText(scene, x, y0 + 72, String(row.par), S.par, 0.5, DIGITS));
        if (row.strokes !== null) {
          const call = callOf(row.par, row.strokes, row.holed);
          const mark = scene.add.graphics();
          const my = y0 + 124;
          mark.lineStyle(3, Phaser.Display.Color.HexStringToColor(INK_CALL[call]).color, 0.95);
          // golf card marks: circles under par, squares over par
          if (call === 'birdie' || call === 'eagle' || call === 'albatross' || call === 'holeInOne') {
            mark.strokeCircle(x, my, 19);
            if (call !== 'birdie') mark.strokeCircle(x, my, 14);
          } else if (call !== 'par') {
            mark.strokeRect(x - 18, my - 18, 36, 36);
            if (call !== 'bogey') mark.strokeRect(x - 13, my - 13, 26, 26);
          }
          r.add(mark);
          r.add(new GlyphText(scene, x, my, String(row.strokes), strokeStyle(call), 0.5, DIGITS));
          r.add(new GlyphText(scene, x, y0 + 176, String(row.points), S.pts, 0.5, DIGITS));
        }
      });
    }
    // totals
    const played = o.rows.filter((x) => x.strokes !== null);
    const strokes = played.reduce((s, x) => s + (x.strokes ?? 0), 0);
    const par = played.reduce((s, x) => s + x.par, 0);
    const diff = strokes - par;
    const rel = diff === 0 ? t('evenPar') : diff < 0 ? t('underPar', { n: -diff }) : t('overPar', { n: diff });
    const yT = top + 100 + blocks * BLOCK_H + 10;
    const sum = new GlyphText(scene, cx, yT, sumLine(strokes, par, rel), S.sum, 0.5, sumChars());
    if (sum.textWidth > CARD_W - 60) sum.setScale((CARD_W - 60) / sum.textWidth);
    r.add(sum);
    r.add(new GlyphText(scene, cx, yT + 44, `${t('points')}: ${o.total}`, S.total, 0.5, sumChars()));
    const btn = new KitButton(scene, cx, top + h - 6, { ...GO_BTN, color: o.last ? ORANGE : FELT, label: o.last ? t('finish') : t('next'), style: S.go }, () => this.go());
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
