// Star Squadron: the power-card UI. The offer button (a round HUD button with a count badge: the
// card offers the run has earned and not opened), the compact card bar it opens over live play
// (three or four small cards, a reroll and a close button; the fight runs on in slow motion), the
// tooltip with a card's full text (hover or long-press), the tray of owned cards in the HUD (a tap
// opens the full list) and that list.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip, HUD_GAP } from '@core';
import { CARD, RARITY_COLOR, type CardId, type Rarity } from './cards';
import { cardArt, COIN, OFFER } from './art';
import { glass, Pill, UI_DEPTH } from './ui';

export const DRAFT_DEPTH = 9700;
/** Seconds a finger must rest on a card or tray slot to show its tooltip. */
const LONG_PRESS = 0.42;

/** What the card UI needs to know about the run. */
export interface CardContext { stack: (id: CardId) => number }

// ------------------------------------------------------------------ tooltip

/** A card's full text in a small glass box: name, rarity, description, synergy parents or stack. */
export class CardTip {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private rar: Phaser.GameObjects.Text;
  private desc: Phaser.GameObjects.Text;
  private foot: Phaser.GameObjects.Text;
  id: CardId | null = null;

  constructor(private scene: Phaser.Scene, depth = 9300) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.bg = scene.add.graphics();
    this.name = txt(scene, 0, 0, '', { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.rar = txt(scene, 0, 0, '', { size: 15, strokeThickness: 0, shadow: false }).setOrigin(1, 0.5);
    this.desc = txt(scene, 0, 0, '', { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 440, align: 'left' }).setOrigin(0, 0);
    this.foot = txt(scene, 0, 0, '', { size: 16, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.root.add([this.bg, this.name, this.rar, this.desc, this.foot]);
    this.root.setScrollFactor(0, 0, true);
  }

  /** Shows card `id` pointing at (ax, ay): below it (`down`) or above it. */
  show(id: CardId, stack: (id: CardId) => number, ax: number, ay: number, dir: 'down' | 'up'): void {
    this.id = id;
    const def = CARD[id];
    const col = RARITY_COLOR[def.rarity];
    const n = stack(id);
    this.name.setText(t('c_' + id) + (n > 1 && def.max < 50 ? ' ×' + n : '')).setColor(col.text);
    this.rar.setText(t('r_' + def.rarity)).setColor(col.text);
    this.desc.setText(t('cd_' + id));
    let foot = '';
    if (def.needs) foot = t('needsBoth', { a: t('c_' + def.needs[0]), b: t('c_' + def.needs[1]) });
    this.foot.setText(foot).setColor(col.text);
    const w = Math.min(this.scene.scale.width - 24, Math.max(this.name.width + this.rar.width + 30, this.desc.width, this.foot.width) + 32);
    const h = 40 + this.desc.height + (foot ? 30 : 0) + 14;
    const x = Phaser.Math.Clamp(ax - w / 2, 12, this.scene.scale.width - 12 - w);
    const top = dir === 'down' ? ay + 12 : ay - 12 - h;
    this.root.setPosition(x, top);
    this.name.setPosition(16, 22);
    this.rar.setPosition(w - 16, 22);
    this.desc.setPosition(16, 40);
    this.foot.setPosition(16, 40 + this.desc.height + 16);
    const px = Phaser.Math.Clamp(ax - x, 18, w - 18);
    this.bg.clear().fillStyle(0x000000, 0.3).fillRoundedRect(0, 5, w, h, 16)
      .fillStyle(0x0b1020, 0.95).fillRoundedRect(0, 0, w, h, 16).lineStyle(2, col.frame, 0.9).strokeRoundedRect(0, 0, w, h, 16);
    if (dir === 'down') this.bg.fillStyle(0x0b1020, 0.95).fillTriangle(px - 9, 0, px + 9, 0, px, -10);
    else this.bg.fillStyle(0x0b1020, 0.95).fillTriangle(px - 9, h, px + 9, h, px, h + 10);
    this.root.setVisible(true);
  }

  hide(): void { this.root.setVisible(false); this.id = null; }
  get visible(): boolean { return this.root.visible; }
  destroy(): void { this.root.destroy(); }
}

// ------------------------------------------------------------------ offer button

/**
 * The round HUD button of the card offers: a card icon with a count badge. It glows and pulses
 * while offers wait; a tap (or E) opens the card bar.
 */
export class OfferButton {
  static R = 46;
  readonly chip: HudChip;
  readonly hit: Phaser.GameObjects.Zone;
  private box: Phaser.GameObjects.Container;
  private icon: Phaser.GameObjects.Image;
  private rim: Phaser.GameObjects.Graphics;
  private badge: Phaser.GameObjects.Container;
  private badgeBg: Phaser.GameObjects.Graphics;
  private badgeTxt: Phaser.GameObjects.Text;
  private keyTxt: Phaser.GameObjects.Text;
  private count = 0;
  private open = false;
  private flashT = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, showKey: boolean, onTap: () => void) {
    const R = OfferButton.R;
    this.box = scene.add.container(0, 0);
    this.box.setData('chipWidth', R * 2 - 18);
    this.rim = scene.add.graphics();
    this.icon = scene.add.image(0, 0, OFFER).setDisplaySize(R * 1.5, R * 1.5);
    this.keyTxt = txt(scene, -R * 0.6, R * 0.55, 'E', { title: true, size: 17, color: '#cfe6ff', strokeThickness: 4 }).setVisible(showKey);
    this.badgeBg = scene.add.graphics();
    this.badgeTxt = txt(scene, 0, 1, '', { title: true, size: 19, strokeThickness: 0, shadow: false });
    this.badge = scene.add.container(R * 0.62, -R * 0.62, [this.badgeBg, this.badgeTxt]).setVisible(false);
    this.box.add([this.rim, this.icon, this.keyTxt, this.badge]);
    this.chip = hudChip(scene, x, y, { align: 'center', height: R * 2, minWidth: R * 2, items: [this.box], depth: UI_DEPTH });
    this.hit = scene.add.zone(x, y, R * 2 + 8, R * 2 + 24).setScrollFactor(0).setDepth(UI_DEPTH + 1).setInteractive({ useHandCursor: true });
    this.hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onTap();
      scene.tweens.add({ targets: this.chip, scale: 0.9, duration: 60, yoyo: true });
    });
    this.set(0, false);
  }

  /** The number of waiting offers and whether the bar is open. */
  set(n: number, open: boolean): void {
    if (n === this.count && open === this.open) return;
    this.count = n;
    this.open = open;
    this.badge.setVisible(n > 0);
    this.badgeTxt.setText(String(n));
    const bw = Math.max(30, this.badgeTxt.width + 16);
    this.badgeBg.clear().fillStyle(0x000000, 0.35).fillRoundedRect(-bw / 2, -13, bw, 30, 15)
      .fillStyle(0xff4f6a, 1).fillRoundedRect(-bw / 2, -15, bw, 30, 15).lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-bw / 2, -15, bw, 30, 15);
    this.icon.setAlpha(n > 0 || open ? 1 : 0.38);
  }

  /** A new offer arrived: the badge pops and the button bounces. */
  bump(): void {
    this.scene.tweens.add({ targets: this.chip, scale: 1.22, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    this.badge.setScale(0.2);
    this.scene.tweens.add({ targets: this.badge, scale: 1, duration: 380, ease: 'Back.easeOut', easeParams: [3] });
  }

  /** The boss-warning nudge: a few bright flashes. */
  flash(): void {
    this.flashT = 2.2;
    this.scene.tweens.add({ targets: this.chip, scale: 1.16, duration: 160, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 3; i++) {
      const ring = this.scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH + 2).setPosition(this.chip.x, this.chip.y);
      ring.lineStyle(6, 0xffd23f, 1).strokeCircle(0, 0, OfferButton.R);
      ring.setAlpha(0);
      this.scene.tweens.add({ targets: ring, alpha: { from: 1, to: 0 }, scale: { from: 1, to: 1.9 }, delay: i * 380, duration: 620, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    }
  }

  update(dt: number, time: number): void {
    const R = OfferButton.R - 6;
    const g = this.rim.clear();
    if (this.flashT > 0) this.flashT -= dt;
    if (this.open) g.lineStyle(5, 0xffffff, 0.9).strokeCircle(0, 0, R + 1);
    else if (this.count > 0) {
      const k = this.flashT > 0 ? (Math.floor(this.flashT * 10) % 2 ? 1 : 0.2) : 0.5 + 0.4 * Math.sin(time * 5);
      g.lineStyle(this.flashT > 0 ? 7 : 4, 0xffd23f, k).strokeCircle(0, 0, R + 1);
      // a slow breathing so the eye finds it, without stealing it
      this.icon.setScale((OfferButton.R * 1.5 / this.icon.width) * (1 + 0.05 * Math.sin(time * 4)));
    }
  }

  get x(): number { return this.chip.x; }
  get y(): number { return this.chip.y; }
}

// ------------------------------------------------------------------ the card bar

/** One small card in the bar: rarity frame, icon, name and a one-line effect. */
class MiniCard extends Phaser.GameObjects.Container {
  private lift: Phaser.GameObjects.Graphics;
  private shine: Phaser.GameObjects.Graphics | null = null;
  readonly w: number;
  readonly h: number;
  focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, readonly id: CardId, ctx: CardContext, key: string) {
    super(scene, x, y);
    this.w = w; this.h = h;
    const def = CARD[id];
    const rar = def.rarity;
    const col = RARITY_COLOR[rar];
    const g = scene.add.graphics();
    for (let i = 4; i >= 1; i--) g.lineStyle(i * 5, col.glow, rar === 'common' ? 0.05 : 0.1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 18);
    g.fillStyle(col.dark, 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.32, { tl: 15, tr: 15, bl: 6, br: 6 });
    g.lineStyle(4, col.frame, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.lift = scene.add.graphics();
    const tag = txt(scene, -w / 2 + 14, -h / 2 + 17, t('r_' + rar), { title: true, size: 14, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const art = scene.add.image(0, -h / 2 + 58, cardArt(id)).setDisplaySize(70, 70);
    const name = txt(scene, 0, h / 2 - 50, t('c_' + id), { title: true, size: 19, strokeThickness: 0, shadow: false });
    if (name.width > w - 16) name.setScale((w - 16) / name.width);
    const fx = txt(scene, 0, h / 2 - 22, t('cs_' + id), { size: 17, color: '#dfe7fb', strokeThickness: 0, shadow: false });
    if (fx.width > w - 14) fx.setScale((w - 14) / fx.width);
    this.add([g, this.lift, tag, art, name, fx]);
    // the stack it would make, or the synergy mark
    const n = ctx.stack(id);
    if (n > 0 && def.max < 50) this.add(txt(scene, w / 2 - 12, -h / 2 + 17, '×' + (n + 1), { title: true, size: 16, color: '#ffd23f', strokeThickness: 4 }).setOrigin(1, 0.5));
    if (key) {
      const kb = scene.add.graphics();
      kb.fillStyle(0x060914, 0.75).fillRoundedRect(w / 2 - 34, h / 2 - 82, 26, 26, 7).lineStyle(2, 0xcfe6ff, 0.7).strokeRoundedRect(w / 2 - 34, h / 2 - 82, 26, 26, 7);
      this.add([kb, txt(scene, w / 2 - 21, h / 2 - 69, key, { title: true, size: 15, color: '#cfe6ff', strokeThickness: 0, shadow: false })]);
    }
    if (rar === 'epic' || rar === 'synergy') {
      this.shine = scene.add.graphics();
      this.shine.lineStyle(3, rar === 'synergy' ? 0xfff3b0 : 0xffe28a, 1).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 16);
      this.add(this.shine);
      scene.tweens.add({ targets: this.shine, alpha: { from: 0.15, to: 1 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.setSize(w, h);
    scene.add.existing(this);
  }

  setFocus(on: boolean): void {
    if (on === this.focused) return;
    this.focused = on;
    this.lift.clear();
    if (on) this.lift.lineStyle(5, 0xfff3a0, 1).strokeRoundedRect(-this.w / 2 - 6, -this.h / 2 - 6, this.w + 12, this.h + 12, 22);
    this.scene.tweens.add({ targets: this, y: (this.getData('y0') as number) - (on ? 10 : 0), duration: 120, ease: 'Quad.easeOut' });
  }
}

export interface BarOptions {
  ctx: CardContext;
  cards: CardId[];
  /** "Wave 3 reward" / "Boss reward". */
  sub: string;
  /** Touch screens get the tap hint; desktops the keys, with the number on every card. */
  input: 'touch' | 'desk';
  /** Credits now and what a reroll costs (0: free). */
  credits: () => number;
  rerollCost: () => number;
  /** Rolls the offer again; null when the player cannot afford it. */
  roll: () => CardId[] | null;
  /** A card was taken; (x, y) is where its icon is on screen. */
  onPick: (id: CardId, x: number, y: number) => void;
  /** The bar closed without a pick (the offer stays in the queue). */
  onClose: () => void;
  sfx: (key: string, volume?: number) => void;
}

/** Bottom edge of the bar (the hull and the power buttons sit below it). */
export const BAR_BOTTOM = 1136;
const BAR_W = 700;
const BAR_HEAD = 50;
const CARD_H = 156;
export const BAR_H = BAR_HEAD + CARD_H + 24;

/**
 * The card bar: a compact strip in the lower part of the screen with the front offer's cards, a
 * reroll and a close button. It slides up when opened and away after a pick; the run never stops.
 */
export class CardBar {
  private root: Phaser.GameObjects.Container;
  private cards: MiniCard[] = [];
  private rerollBtn: Pill;
  private sub: Phaser.GameObjects.Text;
  private more: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private tip: CardTip;
  private press: { i: number; t: number; long: boolean } | null = null;
  private busy = true;
  private y0: number;
  done = false;

  constructor(private scene: Phaser.Scene, private o: BarOptions, waiting: number) {
    const { width } = scene.scale;
    this.y0 = BAR_BOTTOM - BAR_H / 2;
    this.root = scene.add.container(width / 2, this.y0).setDepth(DRAFT_DEPTH);
    // the panel swallows taps, so a finger on it never steers the ship
    const panel = scene.add.zone(0, 0, BAR_W, BAR_H).setInteractive();
    // see-through glass: the ship may be behind it
    const bg = glass(scene, BAR_W, BAR_H, { alpha: 0.5, r: 24 });
    const top = -BAR_H / 2;
    const title = txt(scene, -BAR_W / 2 + 22, top + BAR_HEAD / 2 + 2, t('barTitle'), { title: true, size: 24, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.sub = txt(scene, title.x + title.width + 12, top + BAR_HEAD / 2 + 3, o.sub, { size: 18, color: '#cfd8f0', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.more = txt(scene, 0, top + BAR_HEAD / 2 + 3, '', { title: true, size: 16, color: '#ff9aab', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const sub = this.sub;
    // reroll (credits) and close, top right
    const close = new Pill(scene, BAR_W / 2 - 34, top + BAR_HEAD / 2 + 2, 52, 42, 0x5a3048, () => this.close(), 22);
    close.setLabels('✕');
    const closeHit = scene.add.zone(BAR_W / 2 - 34, top + BAR_HEAD / 2, 80, 80).setInteractive({ useHandCursor: true });
    closeHit.on('pointerup', () => this.close());
    this.rerollBtn = new Pill(scene, BAR_W / 2 - 160, top + BAR_HEAD / 2 + 2, 180, 42, 0x3d5a9e, () => this.reroll(), 17);
    this.syncReroll();
    this.hint = txt(scene, 0, BAR_H / 2 - 12, o.input === 'touch' ? t('barTouch') : t('barDesk', { n: o.cards.length }),
      { size: 16, color: '#aebbe0', strokeThickness: 0, shadow: false });
    if (this.hint.width > BAR_W - 30) this.hint.setScale((BAR_W - 30) / this.hint.width);
    this.root.add([panel, bg, title, sub, this.more, this.rerollBtn, close, closeHit, this.hint]);
    this.tip = new CardTip(scene, DRAFT_DEPTH + 5);
    this.setWaiting(waiting);
    this.root.setScrollFactor(0, 0, true);
    // slides up from below
    this.root.y = this.y0 + 320;
    this.root.setAlpha(0.4);
    scene.tweens.add({ targets: this.root, y: this.y0, alpha: 1, duration: 260, ease: 'Back.easeOut', easeParams: [1.1] });
    this.deal(o.cards, 90);
  }

  /** How many other offers wait behind this one. */
  setWaiting(n: number): void {
    this.more.setText(n > 0 ? t('barMore', { n }) : '');
    // the subtitle and the count share the room left of the reroll button
    const room = BAR_W / 2 - 160 - 90 - 10 - this.sub.x;
    const need = this.sub.width + (n > 0 ? 10 + this.more.width : 0);
    const k = Math.min(1, room / need);
    this.sub.setScale(k);
    this.more.setScale(k).setX(this.sub.x + this.sub.width * k + 10 * k);
  }

  private syncReroll(): void {
    const cost = this.o.rerollCost();
    this.rerollBtn.setLabels(t('reroll'), cost > 0 ? String(cost) : t('rerollFree'));
    this.rerollBtn.setIcon(cost > 0 ? COIN : null);
    // single row: the label and the price side by side
    this.rerollBtn.main.setY(-1).setX(-30);
    this.rerollBtn.sub.setY(0).setX(cost > 0 ? 54 : 46);
    const icon = this.rerollBtn.list.find((c) => c instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
    icon?.setPosition(this.rerollBtn.sub.x - this.rerollBtn.sub.width / 2 - 14, 0).setDisplaySize(20, 20);
    this.rerollBtn.setEnabled(this.o.credits() >= cost);
  }

  private deal(offer: CardId[], delay: number): void {
    const n = offer.length;
    const gap = 12;
    const w = Math.floor((BAR_W - 24 - gap * (n - 1)) / n);
    const y = -BAR_H / 2 + BAR_HEAD + CARD_H / 2;
    this.busy = true;
    this.o.sfx('cardFan', 0.45);
    offer.forEach((id, i) => {
      const x = -BAR_W / 2 + 12 + w / 2 + i * (w + gap);
      const key = this.o.input === 'desk' ? String(i + 1) : '';
      const c = new MiniCard(this.scene, x, y + 40, w, CARD_H, id, this.o.ctx, key);
      c.setData('y0', y);
      c.setAlpha(0).setScale(0.8);
      this.root.add(c);
      c.setScrollFactor(0, 0, true);
      this.cards.push(c);
      this.scene.tweens.add({
        targets: c, y, alpha: 1, scale: 1, duration: 220, delay: delay + i * 60, ease: 'Back.easeOut',
        onStart: () => this.o.sfx('cardSlide', 0.3),
        onComplete: () => {
          const r = CARD[id].rarity;
          if (r === 'epic' || r === 'synergy') {
            this.o.sfx('epic', 0.4);
            const burst = this.scene.add.graphics();
            burst.lineStyle(5, RARITY_COLOR[r].frame, 1).strokeRoundedRect(-w / 2, -CARD_H / 2, w, CARD_H, 18);
            burst.setPosition(c.x, c.y);
            this.root.add(burst);
            this.scene.tweens.add({ targets: burst, scale: 1.25, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
          }
          if (i === n - 1) this.busy = false;
        },
      });
      c.setInteractive({ useHandCursor: true });
      c.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch || this.done) return;
        this.setFocus(i);
        this.tip.show(id, this.o.ctx.stack, this.root.x + c.x, this.root.y - BAR_H / 2, 'up');
      });
      c.on('pointerout', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) return;
        if (this.tip.id === id) this.tip.hide();
        c.setFocus(false);
      });
      c.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.press = { i, t: 0, long: false };
      });
      c.on('pointerup', () => {
        const pr = this.press;
        this.press = null;
        if (pr?.long) { this.tip.hide(); this.setFocus(-1); return; }
        if (pr && pr.i !== i) return;
        this.pick(i);
      });
    });
  }

  private setFocus(i: number): void {
    this.cards.forEach((c, k) => c.setFocus(k === i));
  }

  /** A long press shows the tooltip on touch screens. */
  update(dt: number): void {
    const pr = this.press;
    if (!pr || pr.long || this.done) return;
    pr.t += dt;
    if (pr.t > LONG_PRESS && this.cards[pr.i]) {
      pr.long = true;
      const c = this.cards[pr.i];
      this.setFocus(pr.i);
      this.tip.show(c.id, this.o.ctx.stack, this.root.x + c.x, this.root.y - BAR_H / 2, 'up');
      this.o.sfx('move', 0.3);
    }
  }

  private reroll(): void {
    if (this.busy || this.done) return;
    const next = this.o.roll();
    if (!next) {
      this.o.sfx('error', 0.4);
      this.scene.tweens.add({ targets: this.rerollBtn, x: { from: this.rerollBtn.x - 8, to: this.rerollBtn.x }, duration: 260, ease: 'Elastic.easeOut' });
      return;
    }
    this.o.sfx('reroll', 0.55);
    this.tip.hide();
    this.syncReroll();
    const old = this.cards;
    this.cards = [];
    old.forEach((c, i) => {
      c.disableInteractive();
      this.scene.tweens.add({ targets: c, y: c.y + 60, alpha: 0, scaleX: 0.2, duration: 160, delay: i * 40, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
    });
    this.deal(next, 200);
  }

  /** Keyboard: 1–4 take, R rerolls. Returns true when the key was the bar's. */
  key(code: string): boolean {
    const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'].indexOf(code) % 4;
    if (num >= 0) { if (num < this.cards.length) this.pick(num); return true; }
    if (code === 'KeyR') { this.reroll(); return true; }
    return false;
  }

  private pick(i: number): void {
    if (this.done || this.busy || !this.cards[i]) return;
    this.done = true;
    this.tip.hide();
    const c = this.cards[i];
    this.o.sfx('cardPick', 0.7);
    this.cards.forEach((q, k) => {
      q.disableInteractive();
      if (k !== i) this.scene.tweens.add({ targets: q, y: q.y + 80, alpha: 0, duration: 200, ease: 'Quad.easeIn' });
    });
    this.root.bringToTop(c);
    // the icon's place on screen, for the flight into the tray
    const ix = this.root.x + c.x, iy = this.y0 + c.y - CARD_H / 2 + 58;
    this.scene.tweens.add({ targets: c, scale: 1.1, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.o.onPick(c.id, ix, iy);
    this.slideAway(120);
  }

  /** Closes without a pick: the offer stays in the queue. */
  close(): void {
    if (this.done) return;
    this.done = true;
    this.tip.hide();
    this.o.sfx('move', 0.35);
    this.slideAway(0);
    this.o.onClose();
  }

  /** Gone at once (the run ended). */
  destroy(): void {
    this.done = true;
    this.tip.destroy();
    this.root.destroy();
  }

  private slideAway(delay: number): void {
    this.scene.tweens.add({
      targets: this.root, y: this.y0 + 300, alpha: 0, delay, duration: 240, ease: 'Quad.easeIn',
      onComplete: () => { this.tip.destroy(); this.root.destroy(); },
    });
  }

  /** Test hook: takes card i. */
  testPick(i: number): void { this.busy = false; this.pick(i); }
  get offer(): CardId[] { return this.cards.map((c) => c.id); }
  get ready(): boolean { return !this.busy && !this.done; }
}

// ------------------------------------------------------------------ tray

const SLOT = 40;
const TRAY_MAX = 7;

/** The cards owned in this run, as small icons in a HUD chip. Hover / long-press: a tooltip; tap: the list. */
export class CardTray {
  readonly chip: HudChip;
  private row: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private tip: CardTip;
  private tipT = 0;
  private sig = '';
  private hidden = new Set<CardId>();
  private press: { id: CardId | null; t: number; long: boolean } | null = null;
  ids: (CardId | null)[] = [];

  constructor(private scene: Phaser.Scene, x: number, private y: number, private onOpen: () => void) {
    this.row = scene.add.container(0, 0);
    this.row.setData('chipWidth', SLOT);
    this.chip = hudChip(scene, x, y, { items: [this.row], minWidth: 56 });
    this.chip.setVisible(false);
    this.tip = new CardTip(scene);
  }

  place(x: number): void { this.chip.setAnchor(x + HUD_GAP, this.y, 'left'); }

  hide(id: CardId, on: boolean): void {
    if (on) this.hidden.add(id); else this.hidden.delete(id);
    this.sig = '';
  }

  slotPos(order: CardId[], stack: (id: CardId) => number, id: CardId): { x: number; y: number } {
    this.sync(order, stack);
    const i = Math.min(TRAY_MAX - 1, Math.max(0, this.ids.indexOf(id)));
    const s = this.slots[i];
    return s ? { x: this.chip.x + this.row.x + s.x, y: this.y } : { x: this.chip.x + 30, y: this.y };
  }

  sync(order: CardId[], stack: (id: CardId) => number): void {
    const sig = order.map((id) => id + stack(id) + (this.hidden.has(id) ? 'h' : '')).join();
    if (sig === this.sig) return;
    this.sig = sig;
    for (const s of this.slots) s.destroy();
    this.slots = [];
    const over = order.length > TRAY_MAX;
    const shown = over ? order.slice(order.length - (TRAY_MAX - 1)) : order;
    this.ids = [...(over ? [null] : []), ...shown];
    this.ids.forEach((id, i) => {
      const x = -((this.ids.length - 1) * SLOT) / 2 + i * SLOT;
      const slot = this.scene.add.container(x, 0);
      const g = this.scene.add.graphics();
      if (id) {
        const col = RARITY_COLOR[CARD[id].rarity];
        g.fillStyle(col.dark, 1).fillRoundedRect(-17, -17, 34, 34, 9).lineStyle(2.5, col.frame, 1).strokeRoundedRect(-17, -17, 34, 34, 9);
        slot.add([g, this.scene.add.image(0, 0, cardArt(id)).setDisplaySize(38, 38)]);
        const n = stack(id);
        if (n > 1) slot.add(txt(this.scene, 12, 11, '×' + n, { size: 14, strokeThickness: 4, color: '#ffd23f' }));
        slot.setVisible(!this.hidden.has(id));
      } else {
        g.fillStyle(0x24345a, 1).fillRoundedRect(-16, -16, 32, 32, 9);
        slot.add([g, txt(this.scene, 0, 0, '+' + (order.length - TRAY_MAX + 1), { size: 16, strokeThickness: 0, shadow: false })]);
      }
      const hit = this.scene.add.zone(0, 0, SLOT, 50).setInteractive({ useHandCursor: true });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && id) this.showTip(id, stack, slot); });
      hit.on('pointerout', () => { if (this.tipT <= 0) this.tip.hide(); });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); this.press = { id, t: 0, long: false }; });
      hit.on('pointerup', () => {
        const pr = this.press;
        this.press = null;
        if (pr?.long) return;
        this.onOpen();
      });
      slot.add(hit);
      slot.setData('id', id);
      this.row.add(slot);
      this.slots.push(slot);
    });
    this.row.setData('chipWidth', Math.max(SLOT, this.ids.length * SLOT - 6));
    this.chip.setItems([this.row]);
    this.chip.setVisible(order.length > 0 && this.chip.getData('show') !== false);
  }

  /** A long press shows the tooltip on touch screens. */
  update(dt: number, stack: (id: CardId) => number): void {
    if (this.press) {
      this.press.t += dt;
      if (!this.press.long && this.press.t > LONG_PRESS && this.press.id) {
        this.press.long = true;
        const slot = this.slots.find((s) => s.getData('id') === this.press!.id);
        if (slot) { this.showTip(this.press.id, stack, slot); this.tipT = 2.4; }
      }
    }
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.tip.hide(); }
  }

  private showTip(id: CardId, stack: (id: CardId) => number, slot: Phaser.GameObjects.Container): void {
    this.tip.show(id, stack, this.chip.x + this.row.x + slot.x, this.y + 22, 'down');
  }

  setVisible(on: boolean): void {
    this.chip.setData('show', on);
    this.chip.setVisible(on && this.ids.length > 0);
    if (!on) this.tip.hide();
  }

  /** A card landed: its slot pops. */
  pop(id: CardId): void {
    const slot = this.slots.find((s) => s.getData('id') === id) ?? this.slots[this.slots.length - 1];
    if (!slot) return;
    slot.setVisible(true).setScale(0.2);
    this.scene.tweens.add({ targets: slot, scale: 1, duration: 360, ease: 'Back.easeOut', easeParams: [3] });
    this.scene.tweens.add({ targets: this.chip, scale: 1.08, duration: 110, yoyo: true });
  }
}

// ------------------------------------------------------------------ the full list

/** Every owned card with its text: opened from the tray (tap) or with C. */
export class CardList {
  private root: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, order: CardId[], stack: (id: CardId) => number, private onClose: () => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(DRAFT_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x050814, 0.66).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.close());
    const rows = order.map((id) => {
      const desc = txt(scene, -216, 0, t('cd_' + id), { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 500, align: 'left' }).setOrigin(0, 0);
      return { id, desc, h: Math.max(78, 44 + desc.height + 10) };
    });
    const h = 150 + rows.reduce((a, r) => a + r.h, 0);
    const panel = scene.add.container(width / 2, height / 2 - 30);
    panel.add(glass(scene, 660, h, { alpha: 0.95 }));
    panel.add(txt(scene, 0, -h / 2 + 50, t('cardsTitle'), { title: true, size: 38, color: '#ffd23f', strokeThickness: 6 }));
    let y0 = -h / 2 + 96;
    for (const { id, desc, h: rh } of rows) {
      const col = RARITY_COLOR[CARD[id].rarity];
      const g = scene.add.graphics();
      const cy = y0 + 34;
      g.fillStyle(col.dark, 1).fillRoundedRect(-300, cy - 34, 68, 68, 14).lineStyle(3, col.frame, 1).strokeRoundedRect(-300, cy - 34, 68, 68, 14);
      const n = stack(id);
      desc.setY(y0 + 32);
      panel.add([g, scene.add.image(-266, cy, cardArt(id)).setDisplaySize(62, 62),
        txt(scene, -216, y0 + 14, t('c_' + id) + (n > 1 ? '  ×' + n : ''), { title: true, size: 24, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5),
        desc,
        txt(scene, 296, y0 + 14, t('r_' + (CARD[id].rarity as Rarity)), { size: 14, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(1, 0.5)]);
      y0 += rh;
    }
    panel.add(txt(scene, 0, h / 2 - 30, t('cardsClose'), { size: 19, color: '#9fb0d8', strokeThickness: 0, shadow: false }));
    this.root.add([dim, panel]);
    this.root.setScrollFactor(0, 0, true);
    const fit = Math.min(1, 1140 / h);
    panel.setScale(0.85 * fit).setAlpha(0);
    scene.tweens.add({ targets: panel, scale: fit, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }

  close(): void {
    if (!this.root.active) return;
    this.root.destroy();
    this.onClose();
  }
}
