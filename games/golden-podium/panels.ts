// The stadium screens drawn over the 3D world: the event card before each event, the results
// board after it, the medal table at the end, plus small HUD widgets (meters, the race strip,
// call-outs). Jumbotron look: a dark screen with a frame of bulbs. Touch and keys (Space / Enter).
import Phaser from 'phaser';
import { Button, txt, t, playSfx, hudChip, hudText, HUD_ROW2_Y, HUD_MARGIN, type HudChip } from '@core';
import { ordinal } from './strings';

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

/** A dark rounded screen with a frame of blinking bulbs. */
function screen(scene: Phaser.Scene, root: Phaser.GameObjects.Container, cx: number, cy: number, w: number, h: number): void {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(cx - w / 2, cy - h / 2 + 12, w, h, 28);
  g.fillStyle(0x2b3350, 1).fillRoundedRect(cx - w / 2 - 10, cy - h / 2 - 10, w + 20, h + 20, 34);
  g.fillStyle(0x0b1028, 0.97).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 26);
  // fine LED grid
  g.fillStyle(0xffffff, 0.035);
  for (let y = cy - h / 2 + 8; y < cy + h / 2 - 6; y += 6) g.fillRect(cx - w / 2 + 10, y, w - 20, 2);
  root.add(g);
  const bulbs: Phaser.GameObjects.Arc[] = [];
  const step = 34;
  const add = (x: number, y: number, i: number) => {
    const b = scene.add.circle(x, y, 3.6, i % 2 ? 0xffc233 : 0xffffff, 1);
    bulbs.push(b);
    root.add(b);
  };
  let i = 0;
  for (let x = cx - w / 2 + 20; x <= cx + w / 2 - 20; x += step) { add(x, cy - h / 2 - 5, i++); add(x, cy + h / 2 + 5, i++); }
  for (let y = cy - h / 2 + 20; y <= cy + h / 2 - 20; y += step) { add(cx - w / 2 - 5, y, i++); add(cx + w / 2 + 5, y, i++); }
  const odd = bulbs.filter((_, k) => k % 2), even = bulbs.filter((_, k) => !(k % 2));
  scene.tweens.add({ targets: odd, alpha: 0.25, duration: 380, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: even, alpha: 0.25, duration: 380, yoyo: true, repeat: -1, delay: 380 });
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

  protected button(x: number, y: number, label: string, color = 0x2fae5a, w = 300): Button {
    const b = new Button(this.scene, x, y, label, () => this.go(), { width: w, height: 84, size: 30, color });
    this.root.add(b);
    return b;
  }
}

/** Before each event: its name, the one-line hint, the cup record and READY. */
export class EventCard extends Panel {
  constructor(scene: Phaser.Scene, o: { n: number; name: string; hint: string; record: string; picture: string; touch: boolean }, onGo: () => void) {
    super(scene, onGo, 0.25);
    const cx = 640, cy = 372, w = 860, h = 430;
    const r = this.root;
    screen(scene, r, cx, cy, w, h);
    r.add(txt(scene, cx, cy - h / 2 + 46, `${t('cup')}  ·  ${t('eventN', { n: o.n })}`, { size: 22, color: '#9fb3d9', strokeThickness: 0 }));
    const title = txt(scene, cx + 70, cy - 92, o.name, { title: true, size: 58, color: '#ffd23f', strokeThickness: 8 });
    r.add(title);
    const pic = scene.add.image(cx - w / 2 + 120, cy - 40, o.picture).setScale(0.8);
    r.add(pic);
    scene.tweens.add({ targets: pic, y: pic.y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    r.add(txt(scene, cx + 70, cy + 4, o.hint, { size: 26, wrap: w - 260, color: '#f3f2f2', strokeThickness: 0 }));
    r.add(txt(scene, cx + 70, cy + 82, o.record, { size: 22, color: '#7ee6ff', strokeThickness: 0 }));
    this.button(cx, cy + h / 2 - 2, t('ready'), 0xec3013, 320);
    const prompt = txt(scene, cx, cy + h / 2 + 62, o.touch ? t('tapToStart') : t('keyToStart'), { size: 22, color: '#ffffff' });
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

/** After each event: places, marks, points (with medal and record bonuses). */
export class ResultsBoard extends Panel {
  constructor(scene: Phaser.Scene, title: string, lines: ResultLine[], total: number, last: boolean, onGo: () => void) {
    super(scene, onGo);
    const cx = 640, cy = 360, w = 900, h = 520;
    const r = this.root;
    screen(scene, r, cx, cy, w, h);
    r.add(txt(scene, cx, cy - h / 2 + 44, `${title}  ·  ${t('results')}`, { title: true, size: 34, color: '#ffd23f' }));
    const top = cy - h / 2 + 104;
    const col = { place: cx - 400, medal: cx - 300, pic: cx - 244, name: cx - 206, mark: cx + 180, pts: cx + 400 };
    r.add(txt(scene, col.mark, top, t('perf'), { size: 18, color: '#9fb3d9', strokeThickness: 0 }).setOrigin(1, 0.5));
    r.add(txt(scene, col.pts, top, t('points'), { size: 18, color: '#9fb3d9', strokeThickness: 0 }).setOrigin(1, 0.5));
    const sorted = [...lines].sort((a, b) => a.place - b.place);
    sorted.forEach((row, i) => {
      const y = top + 52 + i * 70;
      const items: Phaser.GameObjects.GameObject[] = [];
      if (row.player) {
        const hl = scene.add.graphics().fillStyle(0x3ee6ff, 0.16).fillRoundedRect(cx - w / 2 + 24, y - 30, w - 48, 60, 16);
        items.push(hl);
      }
      const chip = scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(col.place - 12, y - 24, 8, 48, 4);
      items.push(chip);
      items.push(txt(scene, col.place + 8, y, ordinal(row.place + 1), { title: true, size: 28, color: row.place === 0 ? '#ffd23f' : '#f3f2f2' }).setOrigin(0, 0.5));
      const mk = medalKey(row.place);
      if (mk) items.push(scene.add.image(col.medal, y, mk).setScale(0.62));
      items.push(scene.add.image(col.pic, y, row.face).setScale(0.5));
      items.push(txt(scene, col.name, y, row.name, { title: true, size: 26, color: row.player ? '#3ee6ff' : '#f3f2f2' }).setOrigin(0, 0.5));
      items.push(txt(scene, col.mark, y - (row.record ? 9 : 0), row.mark, { size: 28, color: '#ffffff' }).setOrigin(1, 0.5));
      if (row.record) items.push(txt(scene, col.mark, y + 17, t('record'), { size: 15, color: '#ffd23f', strokeThickness: 3 }).setOrigin(1, 0.5));
      const bonus = row.bonus ? ` +${row.bonus}` : '';
      items.push(txt(scene, col.pts - (bonus ? 74 : 0), y, String(row.points), { title: true, size: 26, color: '#7dff9a' }).setOrigin(1, 0.5));
      if (bonus) items.push(txt(scene, col.pts, y, bonus, { size: 22, color: '#ffd23f' }).setOrigin(1, 0.5));
      r.add(items);
      for (const it of items) {
        const o = it as unknown as { x: number; alpha: number };
        const x0 = o.x;
        o.x = x0 - 50;
        o.alpha = 0;
        scene.tweens.add({ targets: it, x: x0, alpha: 1, duration: 280, delay: 200 + (3 - i) * 160, ease: 'Back.easeOut' });
      }
      scene.time.delayedCall(200 + (3 - i) * 160, () => playSfx(scene, 'tick', { volume: 0.5 }));
    });
    r.add(txt(scene, cx - w / 2 + 40, cy + h / 2 - 48, `${t('total')}: ${total}`, { title: true, size: 28, color: '#3ee6ff' }).setOrigin(0, 0.5));
    this.button(cx + w / 2 - 170, cy + h / 2 - 2, last ? t('medalTable') : t('next'), 0x2fae5a, last ? 340 : 280);
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
    const cx = 640, cy = 360, w = 900, h = 520;
    const r = this.root;
    screen(scene, r, cx, cy, w, h);
    r.add(txt(scene, cx, cy - h / 2 + 44, `${t('cup')}  ·  ${t('standings')}`, { title: true, size: 34, color: '#ffd23f' }));
    const top = cy - h / 2 + 106;
    const col = { place: cx - 400, pic: cx - 300, name: cx - 258, g: cx + 70, s: cx + 150, b: cx + 230, pts: cx + 400 };
    r.add(scene.add.image(col.g, top, 'medal-gold').setScale(0.48));
    r.add(scene.add.image(col.s, top, 'medal-silver').setScale(0.48));
    r.add(scene.add.image(col.b, top, 'medal-bronze').setScale(0.48));
    r.add(txt(scene, col.pts, top, t('points'), { size: 18, color: '#9fb3d9', strokeThickness: 0 }).setOrigin(1, 0.5));
    lines.forEach((row, i) => {
      const y = top + 62 + i * 70;
      const items: Phaser.GameObjects.GameObject[] = [];
      if (row.player) items.push(scene.add.graphics().fillStyle(0x3ee6ff, 0.16).fillRoundedRect(cx - w / 2 + 24, y - 30, w - 48, 60, 16));
      items.push(scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(col.place - 12, y - 24, 8, 48, 4));
      items.push(txt(scene, col.place + 8, y, ordinal(i + 1), { title: true, size: 30, color: i === 0 ? '#ffd23f' : '#f3f2f2' }).setOrigin(0, 0.5));
      items.push(scene.add.image(col.pic, y, row.face).setScale(0.5));
      items.push(txt(scene, col.name, y, row.name, { title: true, size: 26, color: row.player ? '#3ee6ff' : '#f3f2f2' }).setOrigin(0, 0.5));
      row.medals.forEach((m, k) => items.push(txt(scene, [col.g, col.s, col.b][k], y, String(m), { title: true, size: 28, color: m ? '#ffffff' : '#56607e' })));
      items.push(txt(scene, col.pts, y, String(row.total), { title: true, size: 28, color: '#7dff9a' }).setOrigin(1, 0.5));
      r.add(items);
      for (const it of items) {
        const o = it as unknown as { alpha: number; scale: number };
        o.alpha = 0;
        scene.tweens.add({ targets: it, alpha: 1, duration: 300, delay: 250 + (3 - i) * 260 });
      }
    });
    this.button(cx, cy + h / 2 - 2, t('ceremony'), 0xec3013, 380);
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
