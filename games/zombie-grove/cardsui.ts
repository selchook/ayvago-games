// Zombie Grove: the level-up card UI. The offer button (a round HUD button with a count badge:
// the offers earned and not opened yet), and the compact card bar it opens over live play (three
// small cards, a reroll, a banish (camp upgrade) and a close button; the fight runs on in slow
// motion), with a tooltip for a card's full text (hover or long-press).
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip } from '@core';
import { RARITY_COLOR, type Card } from './cards';
import { EVOLVES_WITH, type WeaponId, type PassiveId } from './defs';
import { cardArt, OFFER } from './art';
import { glass, Pill, UI_DEPTH } from './ui';

export const DRAFT_DEPTH = 9700;
const LONG_PRESS = 0.42;

/** A card's name, one-line effect and full text. */
export function cardText(c: Card): { name: string; short: string; long: string; foot: string } {
  switch (c.kind) {
    case 'weapon': {
      const p = EVOLVES_WITH[c.id as WeaponId];
      return { name: t('w_' + c.id), short: t('ws_' + c.id), long: t('wd_' + c.id), foot: t('evolvesWith', { p: t('p_' + p) }) };
    }
    case 'evo': {
      const p = EVOLVES_WITH[c.id as WeaponId];
      return { name: t('e_' + c.id), short: t('w_' + c.id) + ' ★', long: t('ed_' + c.id), foot: t('evolves', { w: t('w_' + c.id), p: t('p_' + p) }) };
    }
    case 'passive': {
      const w = (Object.keys(EVOLVES_WITH) as WeaponId[]).find((k) => EVOLVES_WITH[k] === (c.id as PassiveId));
      return { name: t('p_' + c.id), short: t('ps_' + c.id), long: t('pd_' + c.id), foot: w ? t('evolves', { w: t('w_' + w), p: t('p_' + c.id) }) : '' };
    }
    default:
      return { name: t('c_' + c.id), short: t('cs_' + c.id), long: t('cd_' + c.id), foot: '' };
  }
}

/** "NEW", "Lv 2 → 3" … */
export function levelTag(c: Card): string {
  if (c.kind === 'evo' || c.kind === 'heal' || c.kind === 'gold') return '';
  if (c.to === c.add) return c.add > 1 ? t('cardNew') + ' · ' + t('cardLv', { n: c.to }) : t('cardNew');
  return t('cardLvUp', { a: c.to - c.add, b: c.to });
}

// ------------------------------------------------------------------ tooltip

export class CardTip {
  private root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;
  private rar: Phaser.GameObjects.Text;
  private desc: Phaser.GameObjects.Text;
  private foot: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene, depth = 9300) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.bg = scene.add.graphics();
    this.name = txt(scene, 0, 0, '', { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.rar = txt(scene, 0, 0, '', { size: 15, strokeThickness: 0, shadow: false }).setOrigin(1, 0.5);
    this.desc = txt(scene, 0, 0, '', { size: 19, color: '#e6efdf', strokeThickness: 0, shadow: false, wrap: 440, align: 'left' }).setOrigin(0, 0);
    this.foot = txt(scene, 0, 0, '', { size: 16, strokeThickness: 0, shadow: false, wrap: 440, align: 'left' }).setOrigin(0, 0);
    this.root.add([this.bg, this.name, this.rar, this.desc, this.foot]);
    this.root.setScrollFactor(0, 0, true);
  }

  show(c: Card, ax: number, ay: number): void {
    const col = RARITY_COLOR[c.rarity];
    const tx = cardText(c);
    this.name.setText(tx.name).setColor(col.text);
    this.rar.setText(t('r_' + c.rarity)).setColor(col.text);
    this.desc.setText(tx.long);
    this.foot.setText(tx.foot).setColor('#ffd27a');
    const w = Math.min(this.scene.scale.width - 24, Math.max(this.name.width + this.rar.width + 30, this.desc.width, this.foot.width) + 32);
    const h = 40 + this.desc.height + (tx.foot ? this.foot.height + 12 : 0) + 14;
    const x = Phaser.Math.Clamp(ax - w / 2, 12, this.scene.scale.width - 12 - w);
    const top = ay - 12 - h;
    this.root.setPosition(x, top);
    this.name.setPosition(16, 22);
    this.rar.setPosition(w - 16, 22);
    this.desc.setPosition(16, 40);
    this.foot.setPosition(16, 40 + this.desc.height + 10);
    const px = Phaser.Math.Clamp(ax - x, 18, w - 18);
    this.bg.clear().fillStyle(0x000000, 0.3).fillRoundedRect(0, 5, w, h, 16)
      .fillStyle(0x0d140f, 0.96).fillRoundedRect(0, 0, w, h, 16).lineStyle(2, col.frame, 0.9).strokeRoundedRect(0, 0, w, h, 16)
      .fillStyle(0x0d140f, 0.96).fillTriangle(px - 9, h, px + 9, h, px, h + 10);
    this.root.setVisible(true);
  }

  hide(): void { this.root.setVisible(false); }
  destroy(): void { this.root.destroy(); }
}

// ------------------------------------------------------------------ offer button

/** The round HUD button of the card offers: a card fan with a count badge. Tap or E opens it. */
export class OfferButton {
  static R = 50;
  readonly chip: HudChip;
  private box: Phaser.GameObjects.Container;
  private icon: Phaser.GameObjects.Image;
  private rim: Phaser.GameObjects.Graphics;
  private badge: Phaser.GameObjects.Container;
  private badgeBg: Phaser.GameObjects.Graphics;
  private badgeTxt: Phaser.GameObjects.Text;
  private count = -1;
  private open = false;
  private flashT = 0;

  constructor(private scene: Phaser.Scene, x: number, y: number, showKey: boolean, onTap: () => void) {
    const R = OfferButton.R;
    this.box = scene.add.container(0, 0);
    this.box.setData('chipWidth', R * 2 - 18);
    this.rim = scene.add.graphics();
    this.icon = scene.add.image(0, 0, OFFER).setDisplaySize(R * 1.5, R * 1.5);
    const key = txt(scene, -R * 0.6, R * 0.55, 'E', { title: true, size: 17, color: '#d8f0ff', strokeThickness: 4 }).setVisible(showKey);
    this.badgeBg = scene.add.graphics();
    this.badgeTxt = txt(scene, 0, 1, '', { title: true, size: 19, strokeThickness: 0, shadow: false });
    this.badge = scene.add.container(R * 0.62, -R * 0.62, [this.badgeBg, this.badgeTxt]).setVisible(false);
    this.box.add([this.rim, this.icon, key, this.badge]);
    this.chip = hudChip(scene, x, y, { align: 'center', height: R * 2, minWidth: R * 2, items: [this.box], depth: UI_DEPTH });
    const hit = scene.add.zone(x, y, R * 2 + 16, R * 2 + 24).setScrollFactor(0).setDepth(UI_DEPTH + 1).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onTap();
      scene.tweens.add({ targets: this.chip, scale: 0.9, duration: 60, yoyo: true });
    });
    this.set(0, false);
  }

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

  bump(): void {
    this.scene.tweens.add({ targets: this.chip, scale: 1.22, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    this.badge.setScale(0.2);
    this.scene.tweens.add({ targets: this.badge, scale: 1, duration: 380, ease: 'Back.easeOut', easeParams: [3] });
  }

  flash(): void {
    this.flashT = 2.2;
    this.scene.tweens.add({ targets: this.chip, scale: 1.16, duration: 160, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
  }

  update(dt: number, time: number): void {
    const R = OfferButton.R - 6;
    const g = this.rim.clear();
    if (this.flashT > 0) this.flashT -= dt;
    if (this.open) g.lineStyle(5, 0xffffff, 0.9).strokeCircle(0, 0, R + 1);
    else if (this.count > 0) {
      const k = this.flashT > 0 ? (Math.floor(this.flashT * 10) % 2 ? 1 : 0.2) : 0.5 + 0.4 * Math.sin(time * 5);
      g.lineStyle(this.flashT > 0 ? 7 : 4, 0xffd23f, k).strokeCircle(0, 0, R + 1);
      this.icon.setScale((OfferButton.R * 1.5 / this.icon.width) * (1 + 0.06 * Math.sin(time * 4)));
    }
  }

  get x(): number { return this.chip.x; }
  get y(): number { return this.chip.y; }
}

// ------------------------------------------------------------------ the card bar

class MiniCard extends Phaser.GameObjects.Container {
  private lift: Phaser.GameObjects.Graphics;
  readonly w: number;
  readonly h: number;
  focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, readonly card: Card, key: string) {
    super(scene, x, y);
    this.w = w; this.h = h;
    const rar = card.rarity;
    const col = RARITY_COLOR[rar];
    const g = scene.add.graphics();
    for (let i = 4; i >= 1; i--) g.lineStyle(i * 5, col.glow, rar === 'common' ? 0.05 : 0.11).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, 18);
    g.fillStyle(col.dark, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.32, { tl: 15, tr: 15, bl: 6, br: 6 });
    g.lineStyle(4, col.frame, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.lift = scene.add.graphics();
    const tx = cardText(card);
    const tag = txt(scene, -w / 2 + 14, -h / 2 + 17, t('r_' + rar), { title: true, size: 13, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const lvl = levelTag(card);
    const lvTxt = txt(scene, w / 2 - 12, -h / 2 + 17, lvl, { title: true, size: 14, color: card.to === card.add ? '#7affc0' : '#ffd23f', strokeThickness: 3 }).setOrigin(1, 0.5);
    if (tag.width + lvTxt.width > w - 28) tag.setVisible(false);
    const art = scene.add.image(0, -h / 2 + 64, cardArt(card.kind, card.id)).setDisplaySize(78, 78);
    const name = txt(scene, 0, h / 2 - 50, tx.name, { title: true, size: 19, strokeThickness: 0, shadow: false });
    if (name.width > w - 14) name.setScale((w - 14) / name.width);
    const fx = txt(scene, 0, h / 2 - 22, tx.short, { size: 17, color: '#e6efdf', strokeThickness: 0, shadow: false });
    if (fx.width > w - 14) fx.setScale((w - 14) / fx.width);
    this.add([g, this.lift, tag, lvTxt, art, name, fx]);
    if (key) {
      const kb = scene.add.graphics();
      kb.fillStyle(0x060914, 0.75).fillRoundedRect(w / 2 - 34, -h / 2 + 34, 26, 26, 7).lineStyle(2, 0xcfe6ff, 0.7).strokeRoundedRect(w / 2 - 34, -h / 2 + 34, 26, 26, 7);
      this.add([kb, txt(scene, w / 2 - 21, -h / 2 + 47, key, { title: true, size: 15, color: '#cfe6ff', strokeThickness: 0, shadow: false })]);
    }
    if (rar === 'epic' || rar === 'legend') {
      const shine = scene.add.graphics();
      shine.lineStyle(3, rar === 'legend' ? 0xfff3b0 : 0xf0c8ff, 1).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 16);
      this.add(shine);
      scene.tweens.add({ targets: shine, alpha: { from: 0.15, to: 1 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.setSize(w, h);
    scene.add.existing(this);
  }

  private banishMark: Phaser.GameObjects.Container | null = null;

  /** Banish mode: a red veil and a cross over the card. */
  setBanish(on: boolean): void {
    if (!on) { this.banishMark?.destroy(); this.banishMark = null; return; }
    if (this.banishMark) return;
    const g = this.scene.add.graphics();
    g.fillStyle(0x3a0010, 0.45).fillRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 18);
    g.lineStyle(4, 0xff4a5a, 1).strokeRoundedRect(-this.w / 2, -this.h / 2, this.w, this.h, 18);
    g.lineStyle(8, 0xff4a5a, 0.85).lineBetween(-22, -this.h / 2 + 42, 22, -this.h / 2 + 86).lineBetween(22, -this.h / 2 + 42, -22, -this.h / 2 + 86);
    this.banishMark = this.scene.add.container(0, 0, [g]);
    this.add(this.banishMark);
    this.scene.tweens.add({ targets: g, alpha: { from: 0.55, to: 1 }, duration: 380, yoyo: true, repeat: -1 });
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
  cards: Card[];
  sub: string;
  input: 'touch' | 'desk';
  rerolls: () => number;
  roll: () => Card[] | null;
  /** Banishes left, and banishing card k (its replacement, or null when it may not go). */
  banishes: () => number;
  banish: (k: number) => Card | null;
  onPick: (k: number, x: number, y: number) => void;
  onClose: () => void;
  sfx: (key: string, volume?: number) => void;
}

export const BAR_BOTTOM = 1096;
const BAR_W = 700;
const BAR_HEAD = 50;
const CARD_H = 172;
export const BAR_H = BAR_HEAD + CARD_H + 24;

/** The card bar: a strip over the lower screen with the front offer's cards; the run never stops. */
export class CardBar {
  private root: Phaser.GameObjects.Container;
  private cards: MiniCard[] = [];
  private rerollBtn: Pill;
  private banishBtn: Pill | null = null;
  /** Banish mode: the next card picked is banished instead of taken. */
  private banishing = false;
  private banishHint: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private more: Phaser.GameObjects.Text;
  private tip: CardTip;
  private press: { i: number; t: number; long: boolean } | null = null;
  private busy = true;
  private y0: number;
  private focusI = -1;
  done = false;

  constructor(private scene: Phaser.Scene, private o: BarOptions, waiting: number) {
    const { width } = scene.scale;
    this.y0 = BAR_BOTTOM - BAR_H / 2;
    this.root = scene.add.container(width / 2, this.y0).setDepth(DRAFT_DEPTH);
    // the panel swallows taps, so a finger on it never starts the stick
    const panel = scene.add.zone(0, 0, BAR_W, BAR_H).setInteractive();
    panel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
    const bg = glass(scene, BAR_W, BAR_H, { alpha: 0.55, r: 24 });
    const top = -BAR_H / 2;
    const title = txt(scene, -BAR_W / 2 + 22, top + BAR_HEAD / 2 + 2, t('barTitle'), { title: true, size: 24, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.sub = txt(scene, title.x + title.width + 12, top + BAR_HEAD / 2 + 3, o.sub, { size: 18, color: '#d8e6d0', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.more = txt(scene, 0, top + BAR_HEAD / 2 + 3, '', { title: true, size: 16, color: '#ff9aab', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    const close = new Pill(scene, BAR_W / 2 - 34, top + BAR_HEAD / 2 + 2, 52, 42, 0x5a3048, () => this.close(), 22);
    close.setLabels('✕');
    this.rerollBtn = new Pill(scene, BAR_W / 2 - 150, top + BAR_HEAD / 2 + 2, 160, 42, 0x3d7a5e, () => this.reroll(), 18);
    this.syncReroll();
    const canBanish = o.banishes() > 0;
    const hint = txt(scene, 0, BAR_H / 2 - 12, o.input === 'touch' ? t('barTouch') : canBanish ? t('barDesk2') : t('barDesk'), { size: 16, color: '#b8c8b0', strokeThickness: 0, shadow: false });
    if (hint.width > BAR_W - 30) hint.setScale((BAR_W - 30) / hint.width);
    this.banishHint = txt(scene, 0, BAR_H / 2 - 12, t('banishPick'), { title: true, size: 17, color: '#ff8a9a', strokeThickness: 0, shadow: false }).setVisible(false);
    this.root.add([panel, bg, title, this.sub, this.more, this.rerollBtn, close, hint, this.banishHint]);
    if (canBanish) {
      this.banishBtn = new Pill(scene, BAR_W / 2 - 150 - 80 - 8 - 66, top + BAR_HEAD / 2 + 2, 132, 42, 0x8a3048, () => this.toggleBanish(), 17);
      this.root.add(this.banishBtn);
      this.syncBanish();
    }
    this.hintText = hint;
    this.tip = new CardTip(scene, DRAFT_DEPTH + 5);
    this.setWaiting(waiting);
    this.root.setScrollFactor(0, 0, true);
    this.root.y = this.y0 + 320;
    this.root.setAlpha(0.4);
    scene.tweens.add({ targets: this.root, y: this.y0, alpha: 1, duration: 260, ease: 'Back.easeOut', easeParams: [1.1] });
    this.deal(o.cards, 90);
  }

  setWaiting(n: number): void {
    this.more.setText(n > 0 ? t('barMore', { n }) : '');
    const room = BAR_W / 2 - 150 - 80 - 10 - this.sub.x - (this.banishBtn ? 140 : 0);
    const need = this.sub.width + (n > 0 ? 10 + this.more.width : 0);
    const k = Math.min(1, room / need);
    this.sub.setScale(k);
    this.more.setScale(k).setX(this.sub.x + this.sub.width * k + 10 * k);
  }

  private syncBanish(): void {
    if (!this.banishBtn) return;
    const n = this.o.banishes();
    this.banishBtn.setLabels(this.banishing ? t('banishCancel') : t('banishBtn', { n }));
    this.banishBtn.setEnabled(n > 0 || this.banishing);
    this.banishBtn.setColor(this.banishing ? 0xd04060 : 0x8a3048);
  }

  private toggleBanish(): void {
    if (this.busy || this.done || !this.banishBtn) return;
    if (!this.banishing && this.o.banishes() <= 0) { this.o.sfx('error', 0.4); return; }
    this.banishing = !this.banishing;
    this.o.sfx(this.banishing ? 'offer' : 'move', 0.4);
    this.hintText.setVisible(!this.banishing);
    this.banishHint.setVisible(this.banishing);
    this.cards.forEach((c) => c.setBanish(this.banishing && (c.card.kind === 'weapon' || c.card.kind === 'passive')));
    this.syncBanish();
  }

  /** Banishes card i: it crumbles away and a new card is dealt into its place. */
  private banishCard(i: number): void {
    const c = this.cards[i];
    if (!c || (c.card.kind !== 'weapon' && c.card.kind !== 'passive')) { this.o.sfx('error', 0.4); return; }
    const next = this.o.banish(i);
    if (!next) { this.o.sfx('error', 0.4); return; }
    this.o.sfx('banish', 0.6);
    this.tip.hide();
    this.busy = true;
    c.disableInteractive();
    const stamp = txt(this.scene, c.x, c.y, t('banished'), { title: true, size: 22, color: '#ff4a5a', strokeThickness: 5 }).setAngle(-12).setScale(1.8).setAlpha(0);
    this.root.add(stamp);
    this.scene.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: [c, stamp], alpha: 0, y: c.y + 50, angle: 14, delay: 420, duration: 220, ease: 'Quad.easeIn', onComplete: () => { c.destroy(); stamp.destroy(); } });
    this.banishing = false;
    this.banishHint.setVisible(false);
    this.hintText.setVisible(true);
    this.cards.forEach((q) => q.setBanish(false));
    this.syncBanish();
    this.dealOne(next, i, this.cards.length, 560, true);
  }

  private syncReroll(): void {
    const n = this.o.rerolls();
    this.rerollBtn.setLabels(`${t('reroll')} ×${n}`);
    this.rerollBtn.setEnabled(n > 0);
  }

  private deal(offer: Card[], delay: number): void {
    this.busy = true;
    this.o.sfx('cardFan', 0.45);
    offer.forEach((card, i) => this.dealOne(card, i, offer.length, delay + i * 60, i === offer.length - 1));
  }

  /** Deals one card into slot i of n; `last` frees the bar when it lands. */
  private dealOne(card: Card, i: number, n: number, delay: number, last: boolean): void {
    const gap = 12;
    const w = Math.floor((BAR_W - 24 - gap * (n - 1)) / n);
    const y = -BAR_H / 2 + BAR_HEAD + CARD_H / 2;
    {
      const x = -BAR_W / 2 + 12 + w / 2 + i * (w + gap);
      const c = new MiniCard(this.scene, x, y + 40, w, CARD_H, card, this.o.input === 'desk' ? String(i + 1) : '');
      c.setData('y0', y);
      c.setAlpha(0).setScale(0.8);
      this.root.add(c);
      c.setScrollFactor(0, 0, true);
      this.cards[i] = c;
      this.scene.tweens.add({
        targets: c, y, alpha: 1, scale: 1, duration: 220, delay, ease: 'Back.easeOut',
        onStart: () => this.o.sfx('cardSlide', 0.3),
        onComplete: () => {
          const r = card.rarity;
          if (r === 'epic' || r === 'legend') {
            this.o.sfx('epic', 0.4);
            const burst = this.scene.add.graphics();
            burst.lineStyle(5, RARITY_COLOR[r].frame, 1).strokeRoundedRect(-w / 2, -CARD_H / 2, w, CARD_H, 18);
            burst.setPosition(c.x, c.y);
            this.root.add(burst);
            this.scene.tweens.add({ targets: burst, scale: 1.25, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
          }
          if (last) this.busy = false;
        },
      });
      c.setInteractive({ useHandCursor: true });
      c.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch || this.done) return;
        this.setFocus(i);
      });
      c.on('pointerout', (p: Phaser.Input.Pointer) => {
        if (p.wasTouch) return;
        this.tip.hide();
        c.setFocus(false);
        this.focusI = -1;
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
    }
  }

  private setFocus(i: number): void {
    this.focusI = i;
    this.cards.forEach((c, k) => c.setFocus(k === i));
    const c = this.cards[i];
    if (c) this.tip.show(c.card, this.root.x + c.x, this.root.y - BAR_H / 2);
    else this.tip.hide();
  }

  update(dt: number): void {
    const pr = this.press;
    if (!pr || pr.long || this.done) return;
    pr.t += dt;
    if (pr.t > LONG_PRESS && this.cards[pr.i]) {
      pr.long = true;
      this.setFocus(pr.i);
      this.o.sfx('move', 0.3);
    }
  }

  private reroll(): void {
    if (this.busy || this.done) return;
    if (this.banishing) this.toggleBanish();
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

  /** Keyboard: 1–3 take, ←/→ + Enter, R rerolls. True when the key was the bar's. */
  key(code: string): boolean {
    const num = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(code) % 3;
    if (num >= 0) { if (num < this.cards.length) this.pick(num); return true; }
    if (code === 'KeyR') { this.reroll(); return true; }
    if (code === 'KeyB') { if (this.banishBtn) this.toggleBanish(); return true; }
    if (code === 'Enter' && this.focusI >= 0) { this.pick(this.focusI); return true; }
    return false;
  }

  private pick(i: number): void {
    if (this.done || this.busy || !this.cards[i]) return;
    if (this.banishing) { this.banishCard(i); return; }
    this.done = true;
    this.tip.hide();
    const c = this.cards[i];
    this.o.sfx('cardPick', 0.7);
    this.cards.forEach((q, k) => {
      q.disableInteractive();
      if (k !== i) this.scene.tweens.add({ targets: q, y: q.y + 80, alpha: 0, duration: 200, ease: 'Quad.easeIn' });
    });
    this.root.bringToTop(c);
    const ix = this.root.x + c.x, iy = this.y0 + c.y - CARD_H / 2 + 64;
    this.scene.tweens.add({ targets: c, scale: 1.1, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.o.onPick(i, ix, iy);
    this.slideAway(120);
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    this.tip.hide();
    this.o.sfx('move', 0.35);
    this.slideAway(0);
    this.o.onClose();
  }

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

  testPick(i: number): void { this.busy = false; this.pick(i); }
  get ready(): boolean { return !this.busy && !this.done; }
}
