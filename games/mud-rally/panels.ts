// The between-race screens: race results and the garage (upgrade shop). Phaser UI over the 3D
// arena, playable by touch (big buttons) and keys (arrows to choose, Enter / Space to press).
import { Phaser, Button, txt, t, playSfx } from '@core';
import { money, ordinal } from './strings';

export const UPGRADES = ['engine', 'tires', 'shocks', 'nitro'] as const;
export type Upgrade = (typeof UPGRADES)[number];
export const MAX_LEVEL = 5;
const BASE_PRICE: Record<Upgrade, number> = { engine: 4000, tires: 3000, shocks: 2500, nitro: 2000 };

export function price(u: Upgrade, level: number): number {
  return Math.round((BASE_PRICE[u] * Math.pow(1.6, level)) / 100) * 100;
}

const DEPTH = 8000;

function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = 0x151b30, alpha = 0.94, r = 30): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, r);
  g.fillStyle(fill, alpha).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.lineStyle(2, 0xffffff, 0.14).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

/** Base for a modal panel: a dim backdrop, a container and key handling that cleans up. */
class Panel {
  readonly root: Phaser.GameObjects.Container;
  private keyHandler: (e: KeyboardEvent) => void;
  private armed = false;
  closed = false;

  constructor(protected scene: Phaser.Scene, onKey: (code: string) => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0);
    const dim = scene.add.rectangle(0, 0, width, height, 0x0b1020, 0.5).setOrigin(0).setInteractive();
    this.root.add(dim);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
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

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 160, onComplete: () => this.root.destroy() });
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

export class ResultsPanel extends Panel {
  constructor(scene: Phaser.Scene, race: number, rows: ResultRow[], pickups: number, earned: number, lifeNote: string, onContinue: () => void) {
    const go = () => {
      if (this.closed) return;
      this.close();
      onContinue();
    };
    super(scene, (code) => {
      if (code === 'Enter' || code === 'Space' || code === 'KeyZ') {
        playSfx(scene, 'ui-click');
        go();
      }
    });
    const W = 820, H = 566, cx = 640, cy = 400;
    const r = this.root;
    r.add(card(scene, cx, cy, W, H));
    r.add(txt(scene, cx, cy - H / 2 + 42, t('results', { n: race }), { title: true, size: 34, color: '#ffd23f' }));
    const top = cy - H / 2 + 100;
    const colX = { place: cx - 330, chip: cx - 262, name: cx - 236, time: cx + 150, prize: cx + 360 };
    r.add(txt(scene, colX.time, top, t('time'), { size: 18, color: '#9fb3d9' }).setOrigin(1, 0.5));
    r.add(txt(scene, colX.prize, top, t('prize'), { size: 18, color: '#9fb3d9' }).setOrigin(1, 0.5));
    rows.forEach((row, i) => {
      const y = top + 44 + i * 50;
      if (row.player) {
        const hl = scene.add.graphics().fillStyle(0x3ee6ff, 0.16).fillRoundedRect(cx - W / 2 + 30, y - 22, W - 60, 44, 14);
        r.add(hl);
      }
      const col = i === 0 ? '#ffd23f' : i === 3 ? '#ff7a7a' : '#f3f2f2';
      const place = txt(scene, colX.place, y, ordinal(i + 1), { title: true, size: 28, color: col }).setOrigin(0, 0.5);
      const chip = scene.add.graphics().fillStyle(row.color, 1).fillRoundedRect(colX.chip - 14, y - 14, 28, 28, 8)
        .lineStyle(2, 0xffffff, 0.6).strokeRoundedRect(colX.chip - 14, y - 14, 28, 28, 8);
      const name = txt(scene, colX.name, y, row.name, { title: true, size: 26, color: row.player ? '#3ee6ff' : '#f3f2f2' }).setOrigin(0, 0.5);
      const time = txt(scene, colX.time, y, clock(row.time), { size: 26 }).setOrigin(1, 0.5);
      const prize = txt(scene, colX.prize, y, money(row.prize), { title: true, size: 26, color: row.prize ? '#7dff9a' : '#7d8aa8' }).setOrigin(1, 0.5);
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
    r.add(txt(scene, cx - 330, y2, t('pickups'), { size: 24, color: '#c9d4ee' }).setOrigin(0, 0.5));
    r.add(txt(scene, colX.prize, y2, money(pickups), { title: true, size: 24, color: '#ffd23f' }).setOrigin(1, 0.5));
    r.add(txt(scene, cx - 330, y2 + 40, t('earned'), { size: 26, color: '#ffffff' }).setOrigin(0, 0.5));
    const total = txt(scene, colX.prize, y2 + 40, money(earned), { title: true, size: 30, color: '#7dff9a' }).setOrigin(1, 0.5);
    r.add(total);
    scene.tweens.add({ targets: total, scale: { from: 1.5, to: 1 }, duration: 380, delay: 700, ease: 'Back.easeOut' });
    if (lifeNote) {
      const note = txt(scene, cx, y2 + 84, lifeNote, { title: true, size: 22, color: '#ff6b6b' });
      r.add(note);
      scene.tweens.add({ targets: note, alpha: 0.45, duration: 520, yoyo: true, repeat: -1 });
    }
    r.add(new Button(scene, cx, cy + H / 2 - 56, t('cont'), go, { width: 340, height: 86, size: 30, color: 0x2fae5a }));
  }
}

export interface ShopState {
  bank: number;
  levels: Record<Upgrade, number>;
  nextTrack: string;
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
  private cards: { frame: Phaser.GameObjects.Graphics; pips: Phaser.GameObjects.Graphics; buy: Button; x: number }[] = [];
  private next!: Button;
  private bankText!: Phaser.GameObjects.Text;
  private ring!: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private state: ShopState, private onBuy: (u: Upgrade) => boolean, private onNext: () => void) {
    super(scene, (code) => this.key(code));
    const cx = 640, cy = 400, W = 1200, H = 610;
    const r = this.root;
    r.add(card(scene, cx, cy, W, H));
    r.add(txt(scene, cx, cy - H / 2 + 40, t('garage'), { title: true, size: 38, color: '#ffd23f' }));
    this.bankText = txt(scene, cx, cy - H / 2 + 86, '', { title: true, size: 26, color: '#7dff9a' });
    r.add(this.bankText);
    const names: Record<Upgrade, string> = { engine: t('engine'), tires: t('tires'), shocks: t('shocks'), nitro: t('nitroUp') };
    const infos: Record<Upgrade, string> = { engine: t('engineInfo'), tires: t('tiresInfo'), shocks: t('shocksInfo'), nitro: t('nitroInfo') };
    this.ring = scene.add.graphics();
    UPGRADES.forEach((u, i) => {
      const x = cx + (i - 1.5) * 284, y = cy - 8;
      const frame = scene.add.graphics({ x, y });
      const icon = scene.add.graphics({ x, y: y - 106 });
      drawIcon(icon, u);
      const name = txt(scene, x, y - 58, names[u], { title: true, size: 26 });
      const info = txt(scene, x, y - 36, infos[u], { size: 18, color: '#c9d4ee', wrap: 236 }).setOrigin(0.5, 0).setLineSpacing(0);
      const pips = scene.add.graphics({ x, y: y + 36 });
      const buy = new Button(scene, x, y + 96, '', () => this.buy(i), { width: 224, height: 84, size: 26, color: 0x2f7dff });
      r.add([frame, icon, name, info, pips, buy]);
      const zone = scene.add.zone(x, y, 262, 300).setInteractive();
      zone.on('pointerover', () => this.setFocus(i));
      r.addAt(zone, 1);
      this.cards.push({ frame, pips, buy, x });
      frame.setScale(0.9).setAlpha(0);
      scene.tweens.add({ targets: frame, scale: 1, alpha: 1, duration: 260, delay: 60 * i, ease: 'Back.easeOut' });
    });
    r.add(txt(scene, cx, cy + 178, t('shopHint') + '  ·  ' + state.nextTrack, { size: 18, color: '#9fb3d9' }));
    this.next = new Button(scene, cx, cy + H / 2 - 58, t('nextRace'), () => this.go(), { width: 400, height: 88, size: 30, color: 0x2fae5a });
    r.add(this.next);
    r.add(this.ring);
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
      if (this.focus === 4) this.next.press();
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
    this.bankText.setText(`${t('bank')}: ${money(s.bank)}`);
    UPGRADES.forEach((u, i) => {
      const c = this.cards[i];
      const lvl = s.levels[u];
      const focused = this.focus === i;
      c.frame.clear();
      c.frame.fillStyle(focused ? 0x26335a : 0x1d2540, 1).fillRoundedRect(-131, -150, 262, 300, 22);
      c.frame.lineStyle(focused ? 4 : 2, focused ? 0xffd23f : 0xffffff, focused ? 1 : 0.12).strokeRoundedRect(-131, -150, 262, 300, 22);
      c.pips.clear();
      for (let k = 0; k < MAX_LEVEL; k++) {
        c.pips.fillStyle(k < lvl ? 0x7dff9a : 0x3a4566, 1).fillRoundedRect(-82 + k * 34, -8, 28, 16, 6);
      }
      const max = lvl >= MAX_LEVEL;
      const p = price(u, lvl);
      c.buy.setText(max ? t('maxed') : money(p));
      c.buy.setAlpha(max ? 0.45 : s.bank >= p ? 1 : 0.6);
    });
    this.ring.clear();
    if (this.focus === 4) {
      this.ring.lineStyle(4, 0xffd23f, 1).strokeRoundedRect(640 - 212, 400 + 305 - 58 - 50, 424, 100, 34);
    }
  }
}

