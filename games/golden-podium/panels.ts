// The stadium screens drawn over the 3D world: the event card before each event, the results
// board after it, the medal table at the end, plus small HUD widgets (meters, the race strip,
// call-outs). Touch and keys (Space / Enter). The three screens wear the menu theme (theme.ts):
// the winner's certificate as the card, podium-step buttons, labels in the display face. Every
// card, face and fixed line is painted in Boot under the Ayvago intro (`prebakePodium`, the
// theme's `prebake`) and the marks and points are set from painted glyphs, so opening a screen
// only places images (the athletes' 3D portraits are rendered by the game as before).
import Phaser from 'phaser';
import { t, playSfx, hudChip, hudText, txt, themeCard, labelTexture, HUD_ROW2_Y, HUD_MARGIN, type HudChip, type LabelStyle, labelAt, fitWidth, GlyphText, Para, KitButton, bakeButton, bakePara, glyphAtlas, labelWidth } from '@core';
import { ordinal } from './strings';
import { EVENTS, RECORDS, markText } from './scoring';
import { RIVAL_NAMES } from './cast';

export const PANEL_DEPTH = 9550;
const DIM_DEPTH = 8000;

export interface Row {
  /** Texture of the athlete's 3D portrait (portraits.ts). */
  face: string;
  name: string;
  color: number;
  player: boolean;
}

const hexs = (c: number) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ the painted pieces

// the theme's colours (theme.ts imports this file, so they are repeated here)
const GOLD = 0xe2a514, RED = 0xd8382a, GREEN = 0x2f9a4c, INK = '#151a38';

/** The cards (`menuTheme.cards`): the event card and the results board / medal table. */
export const EVENT_CARD = { w: 860, h: 430 };
export const BOARD_CARD = { w: 900, h: 520 };
const BTN_H = 84;
const NUMS = '0123456789.,+';

const S = {
  caption: { size: 22, color: '#5a6080', stroke: null, shadow: false, body: true } as LabelStyle,
  event: { size: 58, fill: ['#fffbe0', '#ffd23f', '#c27a10'], stroke: INK } as LabelStyle,
  title: { size: 34, fill: ['#fffbe0', '#ffd23f', '#c27a10'], stroke: INK } as LabelStyle,
  hint: { size: 26, color: '#1d2440', stroke: null, shadow: false, body: true } as LabelStyle,
  record: { size: 22, color: '#2453b4', stroke: null, shadow: false, body: true } as LabelStyle,
  prompt: { size: 22, color: '#ffffff', body: true } as LabelStyle,
  head: { size: 18, color: '#5a6080', stroke: null, shadow: false, body: true } as LabelStyle,
  place: { size: 28, color: INK, stroke: null, shadow: false } as LabelStyle,
  first: { size: 28, color: '#b07a0a', stroke: null, shadow: false } as LabelStyle,
  name: { size: 26, color: INK, stroke: null, shadow: false } as LabelStyle,
  you: { size: 26, color: '#2453b4', stroke: null, shadow: false } as LabelStyle,
  mark: { size: 28, color: '#1d2440', stroke: null, shadow: false, body: true } as LabelStyle,
  recTag: { size: 15, color: '#c0392b', stroke: null, shadow: false } as LabelStyle,
  pts: { size: 26, color: '#2a7a3a', stroke: null, shadow: false } as LabelStyle,
  bonus: { size: 22, color: '#b07a0a', stroke: null, shadow: false } as LabelStyle,
  total: { size: 28, color: '#2453b4', stroke: null, shadow: false } as LabelStyle,
  count: { size: 28, color: INK, stroke: null, shadow: false } as LabelStyle,
  none: { size: 28, color: '#a0a6bc', stroke: null, shadow: false } as LabelStyle,
  btn: { size: 30 } as LabelStyle,
};

/** The characters of a mark: digits and the unit words of the current language. */
function markChars(): string {
  const words = [t('seconds', { s: '' }), t('metres', { m: '' }), t('pts', { n: '' })].join('');
  return [...new Set([...NUMS + words])].join('');
}

/** The rows' names: the player and every rival the cup may pick. */
const names = (): string[] => [t('you'), ...Object.values(RIVAL_NAMES)];
const cupLine = (n: number): string => `${t('cup')}  ·  ${t('eventN', { n })}`;
const recordLine = (id: (typeof EVENTS)[number]): string => `${t('record').replace('!', '')}: ${markText(id, RECORDS[id])}`;
const HINT_W = EVENT_CARD.w - 260;

/**
 * Paints everything the event card, the results board and the medal table show (the theme's
 * `prebake`, in Boot under the Ayvago intro): the buttons' faces, every fixed line in the current
 * language (event names, hints, records, the athletes' names) and the glyphs of the marks.
 */
export function prebakePodium(scene: Phaser.Scene): void {
  bakeButton(scene, 'button', 320, BTN_H, RED);
  bakeButton(scene, 'button', 380, BTN_H, RED);
  bakeButton(scene, 'button', 280, BTN_H, GREEN);
  bakeButton(scene, 'button', 340, BTN_H, GREEN);
  for (const k of ['ready', 'next', 'medalTable', 'ceremony']) labelTexture(scene, t(k), S.btn);
  labelTexture(scene, t('tapToStart'), S.prompt); labelTexture(scene, t('keyToStart'), S.prompt);
  for (let n = 1; n <= EVENTS.length; n++) labelTexture(scene, cupLine(n), S.caption);
  for (const id of EVENTS) {
    labelTexture(scene, t('ev_' + id), S.event);
    labelTexture(scene, `${t('ev_' + id)}  ·  ${t('results')}`, S.title);
    for (const k of ['t', 'k']) bakePara(scene, t(`h_${id}_${k}`), S.hint, HINT_W);
    labelTexture(scene, recordLine(id), S.record);
    if (id === 'longjump') labelTexture(scene, t('foul').replace('!', ''), S.mark);
  }
  labelTexture(scene, t('dq'), S.mark);
  labelTexture(scene, `${t('cup')}  ·  ${t('standings')}`, S.title);
  for (const k of ['perf', 'points']) labelTexture(scene, t(k), S.head);
  labelTexture(scene, t('record'), S.recTag);
  labelTexture(scene, `${t('total')}:`, S.total);
  for (let i = 1; i <= 4; i++) { labelTexture(scene, ordinal(i), i === 1 ? S.first : S.place); labelTexture(scene, ordinal(i), { ...(i === 1 ? S.first : S.place), size: 30 }); }
  for (const n of names()) { labelTexture(scene, n, S.name); labelTexture(scene, n, S.you); }
  glyphAtlas(scene, S.mark, markChars());
  for (const o of [S.pts, S.bonus, S.total, S.count, S.none]) glyphAtlas(scene, o, NUMS);
  glyphAtlas(scene, { ...S.pts, size: 28 }, NUMS);
}

/** Base for a modal screen: dim backdrop, a container, Space/Enter to go on, cleanup. */
export class Panel {
  readonly root: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private keyHandler: (e: KeyboardEvent) => void;
  private armed = false;
  closed = false;

  constructor(protected scene: Phaser.Scene, private onGo: () => void, dimAlpha = 0.45) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setDepth(PANEL_DEPTH).setScrollFactor(0);
    this.dim = scene.add.rectangle(0, 0, width, height, 0x0b1020, dimAlpha).setOrigin(0).setDepth(DIM_DEPTH).setScrollFactor(0).setInteractive();
    this.root.setAlpha(0);
    this.dim.setAlpha(0);
    this.root.y = 30;
    scene.tweens.add({ targets: [this.root, this.dim], alpha: 1, duration: 240 });
    scene.tweens.add({ targets: this.root, y: 0, duration: 320, ease: 'Back.easeOut' });
    scene.time.delayedCall(450, () => (this.armed = true));
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.armed || this.closed || e.repeat || !this.scene.scene.isActive()) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        playSfx(scene, 'ui-click');
        this.go();
      }
    };
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closed = true;
      scene.input.keyboard?.off('keydown', this.keyHandler);
    });
  }

  /** Goes on (button, key or a tap on the backdrop for cards). */
  go(): void {
    if (this.closed || !this.armed) return;
    this.close();
    this.onGo();
  }

  /** Lets a tap anywhere go on (the event card). */
  tapAnywhere(): void {
    this.dim.on('pointerup', () => this.go());
  }

  close(): void {
    if (this.closed && !this.root.active) return;
    this.closed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.scene.tweens.add({
      targets: [this.root, this.dim], alpha: 0, duration: 180,
      onComplete: () => { this.root.destroy(); this.dim.destroy(); },
    });
  }

  protected button(x: number, y: number, label: string, color = GREEN, w = 300): KitButton {
    const b = new KitButton(this.scene, x, y, { w, h: BTN_H, color, label, style: S.btn }, () => this.go());
    this.root.add(b);
    return b;
  }
}

/** A mark as painted text: glyphs for a number, the painted word for a foul or a disqualification. */
function markObj(scene: Phaser.Scene, x: number, y: number, s: string): Phaser.GameObjects.GameObject {
  const chars = markChars();
  if ([...s].every((ch) => chars.includes(ch))) return new GlyphText(scene, x, y, s, S.mark, 1, chars);
  return labelAt(scene, x, y, s, S.mark, 1);
}

/**
 * Reveals rows one after another from a single counter: each row slides in (`dx`) and fades in
 * over `dur` ms from its own start `at`; when the counter ends every row is shown in full, so a
 * slow frame rate can never leave a row hidden. `onRow` runs as each row starts (a tick).
 */
function revealRows(scene: Phaser.Scene, rows: Array<{ items: Phaser.GameObjects.GameObject[]; at: number }>, dx: number, dur: number, onRow?: (i: number) => void): void {
  type T = { x: number; alpha: number; active: boolean };
  const state = rows.map((r) => ({ started: false, items: r.items.map((it) => { const o = it as unknown as T; const x0 = o.x; o.alpha = 0; o.x = x0 - dx; return { o, x0 }; }) }));
  const end = Math.max(0, ...rows.map((r) => r.at)) + dur;
  const ease = Phaser.Math.Easing.Back.Out;
  const apply = (v: number) => rows.forEach((r, i) => {
    const k = Phaser.Math.Clamp((v - r.at) / dur, 0, 1);
    if (k > 0 && !state[i].started) { state[i].started = true; onRow?.(i); }
    for (const { o, x0 } of state[i].items) {
      if (!o.active) continue;
      o.alpha = k;
      o.x = x0 - dx * (1 - ease(k));
    }
  });
  scene.tweens.addCounter({ from: 0, to: end, duration: end, onUpdate: (tw) => apply(tw.getValue() ?? 0), onComplete: () => apply(end) });
}

/** Before each event: its name, the one-line hint, the cup record and READY. */
export class EventCard extends Panel {
  constructor(scene: Phaser.Scene, o: { n: number; name: string; hint: string; record: string; picture: string; touch: boolean }, onGo: () => void) {
    super(scene, onGo, 0.25);
    const cx = 640, cy = 372, { w, h } = EVENT_CARD;
    const r = this.root;
    r.add(themeCard(scene, cx, cy, w, h));
    r.add(labelAt(scene, cx, cy - h / 2 + 46, cupLine(o.n), S.caption));
    r.add(fitWidth(labelAt(scene, cx + 70, cy - 92, o.name, S.event), w - 260));
    const pic = scene.add.image(cx - w / 2 + 120, cy - 40, o.picture).setScale(0.8);
    r.add(pic);
    scene.tweens.add({ targets: pic, y: pic.y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const hint = new Para(scene, cx + 70, cy - 24, o.hint, S.hint, HINT_W, 0.5, 32);
    hint.y = cy + 4 - hint.textHeight / 2;
    r.add(hint);
    r.add(labelAt(scene, cx + 70, cy + 82, o.record, S.record));
    this.button(cx, cy + h / 2 - 2, t('ready'), RED, 320);
    const prompt = labelAt(scene, cx, cy + h / 2 + 62, o.touch ? t('tapToStart') : t('keyToStart'), S.prompt);
    r.add(prompt);
    scene.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.tapAnywhere();
  }
}

export interface ResultLine extends Row {
  place: number;
  mark: string;
  points: number;
  bonus: number;
  record: boolean;
}

function medalKey(place: number): string | null {
  return place === 0 ? 'medal-gold' : place === 1 ? 'medal-silver' : place === 2 ? 'medal-bronze' : null;
}

/** The player's row: a soft gold band behind it. */
function band(scene: Phaser.Scene, cx: number, y: number, w: number): Phaser.GameObjects.Graphics {
  return scene.add.graphics().fillStyle(GOLD, 0.22).fillRoundedRect(cx - w / 2 + 30, y - 30, w - 60, 60, 12)
    .lineStyle(2, GOLD, 0.6).strokeRoundedRect(cx - w / 2 + 30, y - 30, w - 60, 60, 12);
}

/** After each event: places, marks, points (with medal and record bonuses). */
export class ResultsBoard extends Panel {
  constructor(scene: Phaser.Scene, title: string, lines: ResultLine[], total: number, last: boolean, onGo: () => void) {
    super(scene, onGo);
    const cx = 640, cy = 360, { w, h } = BOARD_CARD;
    const r = this.root;
    r.add(themeCard(scene, cx, cy, w, h));
    r.add(fitWidth(labelAt(scene, cx, cy - h / 2 + 50, `${title}  ·  ${t('results')}`, S.title), w - 80));
    const top = cy - h / 2 + 104;
    const col = { place: cx - 400, medal: cx - 300, pic: cx - 244, name: cx - 206, mark: cx + 180, pts: cx + 400 };
    r.add(labelAt(scene, col.mark, top, t('perf'), S.head, 1));
    r.add(labelAt(scene, col.pts, top, t('points'), S.head, 1));
    const sorted = [...lines].sort((a, b) => a.place - b.place);
    const reveal: Array<{ items: Phaser.GameObjects.GameObject[]; at: number }> = [];
    sorted.forEach((row, i) => {
      const y = top + 52 + i * 70;
      const items: Phaser.GameObjects.GameObject[] = [];
      if (row.player) items.push(band(scene, cx, y, w));
      items.push(scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(col.place - 12, y - 24, 8, 48, 4));
      items.push(labelAt(scene, col.place + 8, y, ordinal(row.place + 1), row.place === 0 ? S.first : S.place, 0));
      const mk = medalKey(row.place);
      if (mk) items.push(scene.add.image(col.medal, y, mk).setScale(0.62));
      items.push(scene.add.image(col.pic, y, row.face).setScale(0.5));
      items.push(fitWidth(labelAt(scene, col.name, y, row.name, row.player ? S.you : S.name, 0), col.mark - col.name - 150));
      items.push(markObj(scene, col.mark, y - (row.record ? 9 : 0), row.mark));
      if (row.record) items.push(labelAt(scene, col.mark, y + 17, t('record'), S.recTag, 1));
      const bonus = row.bonus ? `+${row.bonus}` : '';
      items.push(new GlyphText(scene, col.pts - (bonus ? 74 : 0), y, String(row.points), S.pts, 1, NUMS));
      if (bonus) items.push(new GlyphText(scene, col.pts, y, bonus, S.bonus, 1, NUMS));
      r.add(items);
      // the last place first, the winner last
      reveal.push({ items, at: 200 + (3 - i) * 160 });
    });
    revealRows(scene, reveal, 50, 280, () => playSfx(scene, 'tick', { volume: 0.5 }));
    const ty = cy + h / 2 - 54, tx = cx - w / 2 + 44;
    r.add(labelAt(scene, tx, ty, `${t('total')}:`, S.total, 0));
    r.add(new GlyphText(scene, tx + labelWidth(`${t('total')}:`, S.total) + 12, ty, String(total), S.total, 0, NUMS));
    this.button(cx + w / 2 - 190, cy + h / 2 - 2, last ? t('medalTable') : t('next'), GREEN, last ? 340 : 280);
  }
}

export interface TableLine extends Row {
  medals: [number, number, number];
  total: number;
}

/** The end of the cup: medals and total points, ordered by points. */
export class MedalTable extends Panel {
  constructor(scene: Phaser.Scene, lines: TableLine[], onGo: () => void) {
    super(scene, onGo);
    const cx = 640, cy = 360, { w, h } = BOARD_CARD;
    const r = this.root;
    r.add(themeCard(scene, cx, cy, w, h));
    r.add(labelAt(scene, cx, cy - h / 2 + 50, `${t('cup')}  ·  ${t('standings')}`, S.title));
    const top = cy - h / 2 + 106;
    const col = { place: cx - 400, pic: cx - 300, name: cx - 258, g: cx + 70, s: cx + 150, b: cx + 230, pts: cx + 400 };
    r.add(scene.add.image(col.g, top, 'medal-gold').setScale(0.48));
    r.add(scene.add.image(col.s, top, 'medal-silver').setScale(0.48));
    r.add(scene.add.image(col.b, top, 'medal-bronze').setScale(0.48));
    r.add(labelAt(scene, col.pts, top, t('points'), S.head, 1));
    const reveal: Array<{ items: Phaser.GameObjects.GameObject[]; at: number }> = [];
    lines.forEach((row, i) => {
      const y = top + 62 + i * 70;
      const items: Phaser.GameObjects.GameObject[] = [];
      if (row.player) items.push(band(scene, cx, y, w));
      items.push(scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(col.place - 12, y - 24, 8, 48, 4));
      items.push(labelAt(scene, col.place + 8, y, ordinal(i + 1), { ...(i === 0 ? S.first : S.place), size: 30 }, 0));
      items.push(scene.add.image(col.pic, y, row.face).setScale(0.5));
      items.push(fitWidth(labelAt(scene, col.name, y, row.name, row.player ? S.you : S.name, 0), col.g - col.name - 50));
      row.medals.forEach((m, k) => items.push(new GlyphText(scene, [col.g, col.s, col.b][k], y, String(m), m ? S.count : S.none, 0.5, NUMS)));
      items.push(new GlyphText(scene, col.pts, y, String(row.total), { ...S.pts, size: 28 }, 1, NUMS));
      r.add(items);
      reveal.push({ items, at: 250 + (3 - i) * 260 });
    });
    revealRows(scene, reveal, 0, 300);
    this.button(cx, cy + h / 2 - 2, t('ceremony'), RED, 380);
  }
}

// ------------------------------------------------------------------ HUD widgets
// Every always-visible readout during an event sits in a core HUD chip (frosted glass).

/** Bottom centre line of the event meters (speed, air): above the hint line, between the thumbs. */
export const METER_Y = 636;

/** A horizontal meter with its caption, in a chip (speed, air). */
export class Meter {
  readonly root: HudChip;
  private bar: Phaser.GameObjects.Graphics;
  private value = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, private w: number, label: string, private colors: [number, number, number] = [0x3ee6ff, 0xffd23f, 0xff6b4a], private h = 20) {
    const slot = scene.add.container(0, 0).setData('chipWidth', w);
    const track = scene.add.graphics();
    track.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.bar = scene.add.graphics();
    slot.add([track, this.bar]).setScrollFactor(0, 0, true);
    this.root = hudChip(scene, x, y, { align: 'center', label, items: [slot] });
  }

  set(v: number, mark?: number): void {
    this.value = Phaser.Math.Clamp(v, 0, 1);
    const g = this.bar;
    g.clear();
    const c = this.value > 0.85 ? this.colors[1] : this.value < 0.25 ? this.colors[2] : this.colors[0];
    g.fillStyle(c, 1).fillRoundedRect(-this.w / 2, -this.h / 2, Math.max(this.h, this.w * this.value), this.h, this.h / 2);
    g.fillStyle(0xffffff, 0.3).fillRoundedRect(-this.w / 2 + 4, -this.h / 2 + 3, Math.max(this.h - 8, this.w * this.value - 8), this.h * 0.3, 4);
    if (mark !== undefined) g.fillStyle(0xffffff, 0.9).fillRect(-this.w / 2 + this.w * mark - 2, -this.h / 2 - 4, 4, this.h + 8);
  }
}

/**
 * The race strip: one dot per athlete from start to finish, in a wide chip on the second HUD row
 * (under the event title, clear of the score, clock and pause button).
 */
export class RaceStrip {
  readonly root: HudChip;
  private dots: Phaser.GameObjects.Arc[] = [];

  constructor(scene: Phaser.Scene, rows: Row[], private len = 520, y = HUD_ROW2_Y) {
    const slot = scene.add.container(0, 0).setData('chipWidth', len + 24);
    const g = scene.add.graphics();
    g.lineStyle(3, 0xffffff, 0.55).lineBetween(-len / 2, 0, len / 2, 0);
    g.fillStyle(0xffffff, 0.55).fillRect(-len / 2 - 1, -9, 3, 18);
    g.fillStyle(0xffffff, 1).fillRect(len / 2 - 2, -15, 4, 30);
    slot.add(g);
    rows.forEach((r, i) => {
      const c = scene.add.circle(-len / 2, (i - 1.5) * 6, r.player ? 10 : 7.5, r.color).setStrokeStyle(r.player ? 3 : 2, 0xffffff);
      this.dots.push(c);
    });
    // the rivals under the player's dot, the first rival on top of the others
    slot.add([...this.dots].reverse());
    slot.bringToTop(this.dots[0]);
    slot.setScrollFactor(0, 0, true);
    this.root = hudChip(scene, scene.scale.width / 2, y, { align: 'center', items: [slot] });
  }

  set(i: number, f: number): void {
    this.dots[i].x = -this.len / 2 + this.len * Phaser.Math.Clamp(f, 0, 1);
  }
}

/** Width of a standings row's content (dot, name, value). */
const BOARD_ROW_W = 196;
const BOARD_ROW_H = 40;

/**
 * The event's standings at the right (archery totals, long jump bests): a caption chip and one
 * chip per athlete, under the pause button. `values[i]` is entrant i's number.
 */
export class ChipBoard {
  readonly root: Phaser.GameObjects.Container;
  readonly values: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, title: string, rows: Row[], empty: string) {
    const x = scene.scale.width - HUD_MARGIN, w = BOARD_ROW_W;
    this.root = scene.add.container(0, 0).setDepth(9000);
    const head = hudChip(scene, x, HUD_ROW2_Y - 4, { align: 'right', label: title, height: 34, minWidth: w + 36 });
    this.root.add(head);
    rows.forEach((r, i) => {
      const slot = scene.add.container(0, 0).setData('chipWidth', w);
      const dot = scene.add.circle(-w / 2 + 8, 0, 8, r.color).setStrokeStyle(2, 0xffffff);
      const name = hudText(scene, r.name, 20, r.player ? '#3ee6ff' : '#ffffff').setOrigin(0, 0.5).setPosition(-w / 2 + 24, 1);
      const v = hudText(scene, empty, 22).setOrigin(1, 0.5).setPosition(w / 2, 1);
      // a long name gives way to the number
      const room = w - 24 - 56;
      if (name.width > room) name.setScale(room / name.width);
      slot.add([dot, name, v]).setScrollFactor(0, 0, true);
      this.values.push(v);
      const chip = hudChip(scene, x, HUD_ROW2_Y + 44 + i * (BOARD_ROW_H + 6), { align: 'right', height: BOARD_ROW_H, items: [slot] });
      this.root.add(chip);
    });
  }
}

/** A big word in the middle of the screen that pops and fades. */
export function callout(scene: Phaser.Scene, s: string, color = '#ffd23f', o: { y?: number; size?: number; hold?: number } = {}): Phaser.GameObjects.Text {
  const text = txt(scene, 640, o.y ?? 250, s, { title: true, size: o.size ?? 64, color, strokeThickness: 10 }).setDepth(9100).setScrollFactor(0);
  text.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: text, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: text, alpha: 0, y: text.y - 30, delay: o.hold ?? 750, duration: 350, onComplete: () => text.destroy() });
  return text;
}

export { hexs };
