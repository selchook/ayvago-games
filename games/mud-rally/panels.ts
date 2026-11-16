// The between-race screens: race results and the garage (upgrade shop). Phaser UI over the 3D
// arena, playable by touch (big buttons) and keys (arrows to choose, Enter / Space to press).
// Both wear the menu theme (theme.ts): the aluminium tread plate as the card, the steel skin's
// buttons and boards, labels in the display face. Every face, card and fixed line is painted in
// Boot under the Ayvago intro (`prebakeGarage`, the theme's `prebake`), and the changing numbers
// (times, prices, the bank) are set from painted glyphs, so opening a screen only places images.
import { Phaser, t, loc, playSfx, themeCard, labelTexture, skinTexture, type LabelStyle, labelAt, fitWidth, GlyphText, Para, KitButton, bakeButton, bakePara, glyphAtlas, labelWidth } from '@core';
import { money, ordinal } from './strings';
import { LAYOUTS } from './tracks';

export const UPGRADES = ['engine', 'tires', 'shocks', 'nitro'] as const;
export type Upgrade = (typeof UPGRADES)[number];
export const MAX_LEVEL = 5;
const BASE_PRICE: Record<Upgrade, number> = { engine: 4000, tires: 3000, shocks: 2500, nitro: 2000 };

export function price(u: Upgrade, level: number): number {
  return Math.round((BASE_PRICE[u] * Math.pow(1.6, level)) / 100) * 100;
}

// The dim backdrop sits under the HUD (score and hearts stay bright); the panel itself sits
// over the touch controls (9500) and under the pause button (9600).
const DIM_DEPTH = 8000;
const DEPTH = 9550;

/** Base for a modal panel: a dim backdrop, a container and key handling that cleans up. */
class Panel {
  readonly root: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private keyHandler: (e: KeyboardEvent) => void;
  private armed = false;
  closed = false;

  constructor(protected scene: Phaser.Scene, onKey: (code: string) => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, width, height, 0x0b1020, 0.5).setOrigin(0).setDepth(DIM_DEPTH).setScrollFactor(0).setInteractive();
    // the card is opaque from its first frame (it pops in; only the darkening behind it fades)
    this.dim.setAlpha(0);
    scene.tweens.add({ targets: this.dim, alpha: 1, duration: 220 });
    this.root.setScale(0.96);
    this.root.setPosition(640 * 0.04, 360 * 0.04);
    scene.tweens.add({ targets: this.root, scale: 1, x: 0, y: 0, duration: 220, ease: 'Back.easeOut' });
    scene.time.delayedCall(350, () => (this.armed = true));
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.armed || this.closed || e.repeat || !this.scene.scene.isActive()) return;
      onKey(e.code);
    };
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      scene.input.keyboard?.off('keydown', this.keyHandler);
    });
  }

  /** Closes the panel: a short fade, or at once (`instant`) when another panel takes its place. */
  close(instant = false): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    if (instant) {
      this.scene.tweens.killTweensOf([this.root, this.dim, ...this.root.list]);
      this.root.destroy();
      this.dim.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: [this.root, this.dim], alpha: 0, duration: 160,
      onComplete: () => { this.root.destroy(); this.dim.destroy(); },
    });
  }
}

export interface ResultRow {
  name: string;
  color: number;
  time: number;
  prize: number;
  player: boolean;
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

// ------------------------------------------------------------------ the painted pieces

/** The two cards (`menuTheme.cards`). */
export const RESULTS_CARD = { w: 820, h: 566 };
export const SHOP_CARD = { w: 1200, h: 610 };
const UP_W = 262, UP_H = 300, BUY_W = 224, BUY_H = 84, CONT_W = 340, CONT_H = 86, NEXT_W = 400, NEXT_H = 88;
const MONEY = '$0123456789.,';
// the theme's colours (theme.ts imports this file, so they are repeated here)
const GREEN = 0x3f9a3a, HAZARD = 0xffc21a, DARK = 0x3a3f47, INK = '#1a1410';

const S = {
  title: { size: 38, fill: ['#fff4c8', '#ffc21a', '#e0700e'], stroke: INK } as LabelStyle,
  head: { size: 18, color: '#4a525c', stroke: null, shadow: false, body: true } as LabelStyle,
  place: { size: 28, color: INK, stroke: null, shadow: false } as LabelStyle,
  first: { size: 28, color: '#c25a08', stroke: null, shadow: false } as LabelStyle,
  name: { size: 26, color: INK, stroke: null, shadow: false } as LabelStyle,
  you: { size: 26, color: '#c25a08', stroke: null, shadow: false } as LabelStyle,
  time: { size: 26, color: '#2a2e35', stroke: null, shadow: false, body: true } as LabelStyle,
  prize: { size: 26, color: '#2f7a2a', stroke: null, shadow: false } as LabelStyle,
  zero: { size: 26, color: '#8a929c', stroke: null, shadow: false } as LabelStyle,
  line: { size: 24, color: '#2a2e35', stroke: null, shadow: false, body: true } as LabelStyle,
  cash: { size: 24, color: '#b0700a', stroke: null, shadow: false } as LabelStyle,
  total: { size: 30, color: '#2f7a2a', stroke: null, shadow: false } as LabelStyle,
  note: { size: 22, color: '#c8332a', stroke: null, shadow: false } as LabelStyle,
  bank: { size: 26, color: '#2f7a2a', stroke: null, shadow: false } as LabelStyle,
  upName: { size: 26 } as LabelStyle,
  info: { size: 18, color: '#d8dde3', stroke: null, shadow: false, body: true } as LabelStyle,
  hint: { size: 18, color: '#4a525c', stroke: null, shadow: false, body: true } as LabelStyle,
  btn: { size: 30 } as LabelStyle,
  price: { size: 26 } as LabelStyle,
};

const UP_NAME: Record<Upgrade, string> = { engine: 'engine', tires: 'tires', shocks: 'shocks', nitro: 'nitroUp' };
const UP_INFO: Record<Upgrade, string> = { engine: 'engineInfo', tires: 'tiresInfo', shocks: 'shocksInfo', nitro: 'nitroInfo' };
const INFO_W = 236;

/**
 * Paints everything the results and the garage show (the theme's `prebake`, in Boot under the
 * Ayvago intro): the buttons' faces, the upgrade boards, every fixed line in the current language,
 * every price and the glyphs of the numbers.
 */
export function prebakeGarage(scene: Phaser.Scene): void {
  bakeButton(scene, 'button', CONT_W, CONT_H, GREEN);
  bakeButton(scene, 'button', NEXT_W, NEXT_H, GREEN, false, true);
  bakeButton(scene, 'button', BUY_W, BUY_H, GREEN, true, true);
  for (const lbl of [t('cont'), t('nextRace')]) labelTexture(scene, lbl, S.btn);
  // results
  for (const k of t('results', { n: '\u0001' }).split('\u0001')) if (k.trim()) labelTexture(scene, k, S.title);
  glyphAtlas(scene, S.title, '0123456789');
  labelTexture(scene, t('time'), S.head); labelTexture(scene, t('prize'), S.head);
  for (let i = 1; i <= 4; i++) labelTexture(scene, ordinal(i), i === 1 ? S.first : S.place);
  labelTexture(scene, t('you'), S.you);
  for (const k of ['driverRed', 'driverYellow', 'driverGreen']) labelTexture(scene, t(k), S.name);
  glyphAtlas(scene, S.time, '0123456789:.');
  glyphAtlas(scene, S.prize, MONEY); glyphAtlas(scene, S.zero, MONEY);
  glyphAtlas(scene, S.cash, MONEY); glyphAtlas(scene, S.total, MONEY); glyphAtlas(scene, S.bank, MONEY);
  labelTexture(scene, t('pickups'), S.line); labelTexture(scene, t('earned'), { ...S.line, size: 26 });
  for (const k of ['lostLife', 'lastLife']) labelTexture(scene, t(k), S.note);
  // garage
  labelTexture(scene, t('garage'), { ...S.title, size: 40 });
  labelTexture(scene, `${t('bank')}:`, S.bank);
  for (const u of UPGRADES) {
    labelTexture(scene, t(UP_NAME[u]), S.upName);
    bakePara(scene, t(UP_INFO[u]), S.info, INFO_W);
    for (let l = 0; l < MAX_LEVEL; l++) labelTexture(scene, money(price(u, l)), S.price);
  }
  labelTexture(scene, t('maxed'), S.price);
  for (const lay of LAYOUTS) {
    const next = t('nextTrack', { name: loc(lay.name) });
    labelTexture(scene, next, S.hint);
    labelTexture(scene, t('shopHint') + '  ·  ' + next, S.hint);
  }
}

/** The upgrade boards: the dark tread plate, plain and focused (a hazard rim). */
export const GARAGE_PIECES = [{ kind: 'board' as const, w: UP_W, h: UP_H, color: DARK, states: ['up', 'on'] as Array<'up' | 'on'> }];

/** A line in a painted style from a glyph atlas, anchored at its right edge (or left with `align` 0). */
function glyphs(scene: Phaser.Scene, x: number, y: number, s: string, o: LabelStyle, align: 0 | 0.5 | 1, chars = MONEY): GlyphText {
  return new GlyphText(scene, x, y, s, o, align, chars);
}

export class ResultsPanel extends Panel {
  constructor(scene: Phaser.Scene, race: number, rows: ResultRow[], pickups: number, earned: number, lifeNote: string, onContinue: () => void) {
    const go = () => {
      if (this.closed) return;
      // the garage (or the result screen) takes its place at once: nothing of this card shows through
      this.close(true);
      onContinue();
    };
    super(scene, (code) => {
      if (code === 'Enter' || code === 'Space' || code === 'KeyZ') {
        playSfx(scene, 'ui-click');
        go();
      }
    });
    const { w: W, h: H } = RESULTS_CARD, cx = 640, cy = 400;
    const r = this.root;
    r.add(themeCard(scene, cx, cy, W, H));
    // the title: "RACE {n} RESULTS", the words painted, the number in glyphs
    const parts = t('results', { n: '\u0001' }).split('\u0001');
    const num = String(race);
    const numW = [...num].reduce((a, ch) => a + (glyphAtlas(scene, S.title, '0123456789').adv[ch] ?? 0), 0);
    const ws = parts.map((p) => (p ? labelWidth(p, S.title) : 0));
    let x = cx - (ws[0] + numW + (ws[1] ?? 0)) / 2;
    const ty = cy - H / 2 + 50;
    if (parts[0].trim()) r.add(labelAt(scene, x, ty, parts[0], S.title, 0));
    x += ws[0];
    r.add(glyphs(scene, x, ty, num, S.title, 0, '0123456789'));
    x += numW;
    if (parts[1]?.trim()) r.add(labelAt(scene, x, ty, parts[1], S.title, 0));
    const top = cy - H / 2 + 104;
    const colX = { place: cx - 346, chip: cx - 262, name: cx - 236, time: cx + 150, prize: cx + 360 };
    r.add(labelAt(scene, colX.time, top, t('time'), S.head, 1));
    r.add(labelAt(scene, colX.prize, top, t('prize'), S.head, 1));
    rows.forEach((row, i) => {
      const y = top + 44 + i * 50;
      if (row.player) r.add(scene.add.graphics().fillStyle(HAZARD, 0.28).fillRoundedRect(cx - W / 2 + 30, y - 22, W - 60, 44, 8));
      const place = labelAt(scene, colX.place, y, ordinal(i + 1), i === 0 ? S.first : S.place, 0);
      const chip = scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(colX.chip - 14, y - 14, 28, 28, 6)
        .lineStyle(2, 0x1a1410, 0.8).strokeRoundedRect(colX.chip - 14, y - 14, 28, 28, 6);
      const name = labelAt(scene, colX.name, y, row.name, row.player ? S.you : S.name, 0);
      const time = glyphs(scene, colX.time, y, clock(row.time), S.time, 1, '0123456789:.');
      const prize = glyphs(scene, colX.prize, y, money(row.prize), row.prize ? S.prize : S.zero, 1);
      const items = [place, chip, name, time, prize];
      r.add(items);
      for (const it of items) {
        const o = it as unknown as { x: number; alpha: number };
        const x0 = o.x;
        o.x = x0 - 40;
        o.alpha = 0;
        scene.tweens.add({ targets: it, x: x0, alpha: 1, duration: 260, delay: 160 + i * 110, ease: 'Back.easeOut' });
      }
    });
    const y2 = top + 44 + 4 * 50 + 6;
    r.add(labelAt(scene, cx - 330, y2, t('pickups'), S.line, 0));
    r.add(glyphs(scene, colX.prize, y2, money(pickups), S.cash, 1));
    r.add(labelAt(scene, cx - 330, y2 + 40, t('earned'), { ...S.line, size: 26 }, 0));
    const total = glyphs(scene, colX.prize, y2 + 40, money(earned), S.total, 1);
    r.add(total);
    scene.tweens.add({ targets: total, scale: { from: 1.5, to: 1 }, duration: 380, delay: 700, ease: 'Back.easeOut' });
    if (lifeNote) {
      const note = labelAt(scene, cx, y2 + 84, lifeNote, S.note);
      r.add(note);
      scene.tweens.add({ targets: note, alpha: 0.45, duration: 520, yoyo: true, repeat: -1 });
    }
    r.add(new KitButton(scene, cx, cy + H / 2 - 56, { w: CONT_W, h: CONT_H, color: GREEN, label: t('cont'), style: S.btn }, go));
  }
}

export interface ShopState {
  bank: number;
  levels: Record<Upgrade, number>;
  nextTrack: string;
  /** Touch screen: no key hint under the cards. */
  touch?: boolean;
}
function drawIcon(g: Phaser.GameObjects.Graphics, u: Upgrade): void {
  g.clear();
  const w = 0xffffff;
  if (u === 'engine') {
    g.fillStyle(0xff8a3d).fillRoundedRect(-30, -16, 60, 38, 8);
    g.fillStyle(0xffb36b).fillRect(-22, -30, 12, 16).fillRect(-6, -30, 12, 16).fillRect(10, -30, 12, 16);
    g.fillStyle(0x2a2f45).fillCircle(0, 3, 9);
    g.lineStyle(3, w, 0.8).strokeRoundedRect(-30, -16, 60, 38, 8);
  } else if (u === 'tires') {
    g.fillStyle(0x2a2a30).fillCircle(0, 0, 30);
    g.lineStyle(4, 0x55555f).strokeCircle(0, 0, 24);
    g.fillStyle(0xc9ced9).fillCircle(0, 0, 12);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.fillStyle(0x4a4a55).fillCircle(Math.cos(a) * 28, Math.sin(a) * 28, 3.5);
    }
  } else if (u === 'shocks') {
    g.fillStyle(0x8aa0c8).fillRoundedRect(-7, -32, 14, 18, 4).fillRoundedRect(-7, 16, 14, 18, 4);
    g.lineStyle(6, 0x3ee6ff);
    g.beginPath();
    g.moveTo(-14, -14);
    for (let k = 0; k < 6; k++) g.lineTo(k % 2 ? -14 : 14, -14 + (k + 1) * 5);
    g.strokePath();
  } else {
    g.fillStyle(0xe8402f).fillRoundedRect(-18, -24, 36, 52, 9);
    g.fillStyle(0x9a2418).fillRect(-6, -32, 12, 9);
    g.fillStyle(0xffd23f).fillTriangle(-8, 4, 2, -14, 0, 0).fillTriangle(8, -4, -2, 14, 0, 0);
  }
}

export class ShopPanel extends Panel {
  private focus = 0;
  private cards: { frame: Phaser.GameObjects.Image; pips: Phaser.GameObjects.Graphics; buy: KitButton; x: number }[] = [];
  private next!: KitButton;
  private bankLabel!: Phaser.GameObjects.Image;
  private bankText!: GlyphText;

  constructor(scene: Phaser.Scene, private state: ShopState, private onBuy: (u: Upgrade) => boolean, private onNext: () => void) {
    super(scene, (code) => this.key(code));
    const cx = 640, cy = 400, { w: W, h: H } = SHOP_CARD;
    const r = this.root;
    r.add(themeCard(scene, cx, cy, W, H));
    r.add(labelAt(scene, cx, cy - H / 2 + 44, t('garage'), { ...S.title, size: 40 }));
    this.bankLabel = labelAt(scene, cx, cy - H / 2 + 92, `${t('bank')}:`, S.bank, 0);
    this.bankText = glyphs(scene, cx, cy - H / 2 + 92, '', S.bank, 0);
    r.add([this.bankLabel, this.bankText]);
    UPGRADES.forEach((u, i) => {
      const x = cx + (i - 1.5) * 284, y = cy - 4;
      const frame = scene.add.image(x, y + 7, '__DEFAULT');
      const icon = scene.add.graphics({ x, y: y - 108 });
      drawIcon(icon, u);
      const name = fitWidth(labelAt(scene, x, y - 60, t(UP_NAME[u]), S.upName), UP_W - 24);
      const info = new Para(scene, x, y - 42, t(UP_INFO[u]), S.info, INFO_W, 0.5, 21);
      const pips = scene.add.graphics({ x, y: y + 38 });
      const buy = new KitButton(scene, x, y + 92, { w: BUY_W, h: BUY_H, color: GREEN, style: S.price, tapWhenOff: true }, () => this.buy(i));
      r.add([frame, icon, name, info, pips, buy]);
      const zone = scene.add.zone(x, y, UP_W, UP_H).setInteractive();
      zone.on('pointerover', () => this.setFocus(i));
      r.addAt(zone, 1);
      this.cards.push({ frame, pips, buy, x });
      // the boards pop in (opaque from the start: nothing shows through)
      frame.setScale(0.9);
      scene.tweens.add({ targets: frame, scale: 1, duration: 260, delay: 60 * i, ease: 'Back.easeOut' });
    });
    r.add(labelAt(scene, cx, cy + 186, state.touch ? state.nextTrack : t('shopHint') + '  ·  ' + state.nextTrack, S.hint));
    this.next = new KitButton(scene, cx, cy + H / 2 - 58, { w: NEXT_W, h: NEXT_H, color: GREEN, label: t('nextRace'), style: S.btn }, () => this.go());
    this.next.on('pointerover', () => this.setFocus(4));
    r.add(this.next);
    this.refresh();
  }

  private go(): void {
    if (this.closed) return;
    this.close();
    this.onNext();
  }

  private buy(i: number): void {
    if (this.closed) return;
    this.setFocus(i);
    const u = UPGRADES[i];
    const ok = this.onBuy(u);
    const c = this.cards[i];
    if (ok) {
      this.scene.tweens.add({ targets: c.frame, scale: { from: 1.06, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    } else {
      this.scene.tweens.add({ targets: c.buy, x: c.x + 10, duration: 50, yoyo: true, repeat: 3 });
    }
    this.refresh();
  }

  private key(code: string): void {
    if (code === 'ArrowLeft' || code === 'KeyA') this.setFocus(this.focus === 4 ? 0 : Math.max(0, this.focus - 1), true);
    else if (code === 'ArrowRight' || code === 'KeyD') this.setFocus(this.focus === 4 ? 3 : Math.min(3, this.focus + 1), true);
    else if (code === 'ArrowDown' || code === 'KeyS') this.setFocus(4, true);
    else if (code === 'ArrowUp' || code === 'KeyW') this.setFocus(this.focus === 4 ? 0 : this.focus, true);
    else if (code === 'Enter' || code === 'Space' || code === 'KeyZ') {
      if (this.focus === 4) { playSfx(this.scene, 'ui-click'); this.go(); }
      else this.buy(this.focus);
    }
  }

  private setFocus(i: number, sound = false): void {
    if (i === this.focus) return;
    this.focus = i;
    if (sound) playSfx(this.scene, 'move', { volume: 0.5 });
    this.refresh();
  }

  refresh(): void {
    const s = this.state;
    this.bankText.setText(money(s.bank));
    const lw = labelWidth(`${t('bank')}:`, S.bank) + 10;
    const x0 = 640 - (lw + this.bankText.textWidth) / 2;
    this.bankLabel.x = x0;
    this.bankText.x = x0 + lw;
    UPGRADES.forEach((u, i) => {
      const c = this.cards[i];
      const lvl = s.levels[u];
      const focused = this.focus === i;
      c.frame.setTexture(skinBoard(this.scene, focused));
      c.pips.clear();
      for (let k = 0; k < MAX_LEVEL; k++) {
        c.pips.fillStyle(k < lvl ? 0x7dff9a : 0x23262b, 1).fillRoundedRect(-82 + k * 34, -8, 28, 16, 4);
        c.pips.lineStyle(1.5, 0x000000, 0.6).strokeRoundedRect(-82 + k * 34, -8, 28, 16, 4);
      }
      const max = lvl >= MAX_LEVEL;
      const p = price(u, lvl);
      c.buy.setLabel(max ? t('maxed') : money(p));
      c.buy.setEnabled(!max && s.bank >= p);
      c.buy.setSelected(focused);
    });
    this.next.setSelected(this.focus === 4);
  }
}

function skinBoard(scene: Phaser.Scene, on: boolean): string {
  return skinTexture(scene, 'board', UP_W, UP_H, on ? 'on' : 'up', DARK);
}
