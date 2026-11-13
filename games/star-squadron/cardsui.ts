// Star Squadron: the power-card UI. A card face (rarity frame, glow, art, name, text), the draft
// screen that deals three or four of them (face down, then flipped one by one), the tray of owned
// cards in the HUD (hover or long-press for a tooltip, a tap opens the full list) and that list.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip, HUD_GAP } from '@core';
import { CARD, RARITY_COLOR, type CardId, type Rarity } from './cards';
import { cardArt, COIN } from './art';
import { glass, Pill } from './ui';

export const DRAFT_DEPTH = 9700;

/** What a card face needs to know about the run. */
export interface CardContext { stack: (id: CardId) => number }

// ------------------------------------------------------------------ card face

export class CardFace extends Phaser.GameObjects.Container {
  static W = 212;
  static H = 350;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly front: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Container;
  private shine: Phaser.GameObjects.Graphics | null = null;
  private lift: Phaser.GameObjects.Graphics;
  focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly id: CardId, ctx: CardContext) {
    super(scene, x, y);
    const { W, H } = CardFace;
    const rar = CARD[id].rarity;
    const col = RARITY_COLOR[rar];
    this.glow = scene.add.graphics();
    for (let i = 6; i >= 1; i--) this.glow.lineStyle(i * 5, col.glow, rar === 'common' ? 0.04 : 0.08).strokeRoundedRect(-W / 2, -H / 2, W, H, 24);
    this.lift = scene.add.graphics();
    this.front = scene.add.container(0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-W / 2, -H / 2 + 10, W, H, 22);
    bg.fillStyle(col.dark, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    bg.fillStyle(0x070b18, 0.6).fillRoundedRect(-W / 2 + 10, -H / 2 + 42, W - 20, 136, 16);
    bg.fillStyle(0xffffff, 0.07).fillRoundedRect(-W / 2 + 5, -H / 2 + 5, W - 10, H * 0.3, { tl: 18, tr: 18, bl: 6, br: 6 });
    bg.lineStyle(5, col.frame, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
    bg.lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(-W / 2 + 6, -H / 2 + 6, W - 12, H - 12, 17);
    const tag = txt(scene, 0, -H / 2 + 23, t('r_' + rar), { title: true, size: 17, color: col.text, strokeThickness: 0, shadow: false });
    const art = scene.add.image(0, -H / 2 + 110, cardArt(id)).setDisplaySize(132, 132);
    // the name on one line when it fits (shrunk a little if need be), else on two
    let name = txt(scene, 0, 4, t('c_' + id), { title: true, size: 23, strokeThickness: 0, shadow: false }).setOrigin(0.5, 0);
    if (name.width > W - 22) {
      if ((W - 22) / name.width >= 0.8) name.setScale((W - 22) / name.width);
      else {
        name.destroy();
        name = txt(scene, 0, 4, t('c_' + id), { title: true, size: 22, strokeThickness: 0, wrap: W - 22, shadow: false }).setOrigin(0.5, 0);
        if (name.height > 58) name.setScale(58 / name.height);
      }
    }
    const desc = txt(scene, 0, 0, t('cd_' + id), { size: 18, color: '#dfe7fb', strokeThickness: 0, wrap: W - 24, shadow: false });
    desc.setOrigin(0.5, 0).setY(4 + name.displayHeight + 8);
    const n = ctx.stack(id);
    const def = CARD[id];
    const foot = n > 0 || def.needs;
    const bottom = H / 2 - (foot ? 34 : 14);
    if (desc.y + desc.height > bottom) desc.setScale((bottom - desc.y) / desc.height);
    this.front.add([bg, tag, art, name, desc]);
    if (def.needs) {
      const f = txt(scene, 0, H / 2 - 20, t('needsBoth', { a: t('c_' + def.needs[0]), b: t('c_' + def.needs[1]) }), { size: 15, color: col.text, strokeThickness: 0, shadow: false });
      f.setScale(Math.min(1, (W - 22) / f.width));
      this.front.add(f);
    } else if (n > 0 && def.max < 50) {
      this.front.add(txt(scene, 0, H / 2 - 20, t('ownedN', { n }) + ' → ×' + (n + 1), { size: 16, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    }
    if (rar === 'epic' || rar === 'synergy') {
      this.shine = scene.add.graphics();
      this.shine.lineStyle(3, rar === 'synergy' ? 0xfff3b0 : 0xffe28a, 1).strokeRoundedRect(-W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 20);
      this.shine.setVisible(false);
      this.front.add(this.shine);
    }
    // the back: a star emblem in the rarity's colour
    this.back = scene.add.container(0, 0);
    const bb = scene.add.graphics();
    bb.fillStyle(0x000000, 0.35).fillRoundedRect(-W / 2, -H / 2 + 10, W, H, 22);
    bb.fillStyle(0x10142c, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    for (let i = 0; i < 5; i++) bb.lineStyle(2, col.frame, 0.12 + i * 0.05).strokeCircle(0, 0, 26 + i * 18);
    bb.lineStyle(5, col.frame, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 44; pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    bb.fillStyle(col.frame, 1).fillPoints(pts, true);
    this.back.add(bb);
    this.add([this.glow, this.lift, this.back, this.front]);
    this.front.setVisible(false);
    scene.add.existing(this);
  }

  /** Turns the card face up, squashing through the middle. */
  flip(delay: number, onFace?: () => void): void {
    this.scene.tweens.add({
      targets: this, scaleX: 0, duration: 130, delay, ease: 'Quad.easeIn',
      onComplete: () => {
        this.back.setVisible(false);
        this.front.setVisible(true);
        onFace?.();
        this.scene.tweens.add({ targets: this, scaleX: 1, duration: 170, ease: 'Back.easeOut' });
        if (this.shine) {
          this.shine.setVisible(true).setAlpha(0.2);
          this.scene.tweens.add({ targets: this.shine, alpha: 1, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
      },
    });
  }

  setFocus(on: boolean): void {
    if (on === this.focused) return;
    this.focused = on;
    const { W, H } = CardFace;
    this.lift.clear();
    if (on) this.lift.lineStyle(6, 0xfff3a0, 1).strokeRoundedRect(-W / 2 - 7, -H / 2 - 7, W + 14, H + 14, 28);
    this.scene.tweens.add({ targets: this, y: (this.getData('y0') as number) - (on ? 22 : 0), duration: 140, ease: 'Quad.easeOut' });
  }
}

// ------------------------------------------------------------------ draft

export interface DraftOptions {
  ctx: CardContext;
  sub: string;
  offer: CardId[];
  input: 'mouse' | 'touch' | 'keys';
  /** Credits now and what a reroll costs (0: free). */
  credits: () => number;
  rerollCost: () => number;
  /** Rolls a new offer; null when the player cannot afford it. */
  roll: () => CardId[] | null;
  onPick: (id: CardId, from: CardFace) => void;
  sfx: (key: string, volume?: number) => void;
}

/** The "choose a card" screen: the run waits while it is open. */
export class DraftScreen {
  private root: Phaser.GameObjects.Container;
  private cards: CardFace[] = [];
  private focus = -1;
  private rerollBtn: Pill;
  private takeBtn: Pill;
  private busy = true;
  done = false;

  constructor(private scene: Phaser.Scene, private o: DraftOptions) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(DRAFT_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x050814, 0.6).setOrigin(0).setInteractive();
    const four = o.offer.length > 3;
    const ty = four ? 170 : 300;
    const title = txt(scene, width / 2, ty, t('chooseCard'), { title: true, size: 48, color: '#ffd23f', strokeThickness: 8 });
    const sub = txt(scene, width / 2, ty + 54, o.sub, { size: 24, color: '#e6ecff', strokeThickness: 4, wrap: 660 });
    const by = four ? 1128 : 930;
    this.takeBtn = new Pill(scene, width / 2 + 130, by, 220, 88, 0x2f9e56, () => { if (this.focus >= 0) this.pick(this.focus); }, 28);
    this.takeBtn.setLabels(t('take')).setEnabled(false);
    this.rerollBtn = new Pill(scene, width / 2 - 130, by, 220, 88, 0x3d5a9e, () => this.reroll(), 26);
    this.rerollBtn.setIcon(COIN);
    this.syncReroll();
    const hint = txt(scene, width / 2, by + 80, o.input === 'keys' ? t('draftKeys') : o.input === 'touch' ? t('draftTouch') : t('draftMouse'), { size: 20, color: '#cfd8f0', strokeThickness: 4 });
    this.root.add([dim, title, sub, this.takeBtn, this.rerollBtn, hint]);
    this.root.setScrollFactor(0, 0, true);
    title.setScale(0.4).setAlpha(0);
    scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    dim.setAlpha(0);
    scene.tweens.add({ targets: dim, alpha: 1, duration: 220 });
    this.deal(o.offer, 240);
  }

  private syncReroll(): void {
    const cost = this.o.rerollCost();
    this.rerollBtn.setLabels(t('reroll'), cost > 0 ? String(cost) : t('rerollFree'));
    this.rerollBtn.setIcon(cost > 0 ? COIN : null);
    this.rerollBtn.setEnabled(this.o.credits() >= cost);
  }

  private deal(offer: CardId[], delay: number): void {
    const { width } = this.scene.scale;
    const four = offer.length > 3;
    const W = CardFace.W, H = CardFace.H;
    this.busy = true;
    this.o.sfx('cardFan', 0.6);
    offer.forEach((id, i) => {
      const x = four ? width / 2 + (i % 2 ? 1 : -1) * (W / 2 + 12) : width / 2 + (i - (offer.length - 1) / 2) * (W + 16);
      const y = four ? 470 + Math.floor(i / 2) * (H + 24) : 650;
      const c = new CardFace(this.scene, x, y + 520, id, this.o.ctx);
      c.setData('y0', y).setData('ix', i);
      this.root.add(c);
      c.setScrollFactor(0, 0, true);
      this.cards.push(c);
      c.setAngle((i - 1) * 8);
      this.scene.tweens.add({ targets: c, y, angle: 0, duration: 360, delay: delay + i * 90, ease: 'Cubic.easeOut', onStart: () => this.o.sfx('cardSlide', 0.45) });
      c.flip(delay + 380 + i * 160, () => {
        this.o.sfx('cardFlip', 0.55);
        const r = CARD[id].rarity;
        if (r === 'epic' || r === 'synergy') {
          this.o.sfx('epic', 0.6);
          const burst = this.scene.add.graphics();
          burst.lineStyle(6, RARITY_COLOR[r].frame, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
          burst.setPosition(c.x, c.y);
          this.root.add(burst);
          this.scene.tweens.add({ targets: burst, scale: 1.35, alpha: 0, duration: 520, onComplete: () => burst.destroy() });
        }
        if (i === offer.length - 1) this.busy = false;
      });
      c.setSize(W, H).setInteractive({ useHandCursor: true });
      c.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && !this.busy) this.setFocus(i); });
      c.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.busy || this.done) return;
        // the mouse takes at once; a finger first lifts the card, a second tap takes it
        if (!p.wasTouch || this.focus === i) this.pick(i);
        else { this.setFocus(i); this.o.sfx('move', 0.4); }
      });
    });
    for (const c of this.cards) this.scene.tweens.add({ targets: c.glow, alpha: { from: 1, to: 0.45 }, duration: 900, yoyo: true, repeat: -1 });
  }

  private setFocus(i: number): void {
    this.focus = i;
    this.cards.forEach((c, k) => c.setFocus(k === i));
    this.takeBtn.setEnabled(i >= 0);
  }

  private reroll(): void {
    if (this.busy || this.done) return;
    const next = this.o.roll();
    if (!next) { this.o.sfx('error', 0.4); this.scene.tweens.add({ targets: this.rerollBtn, x: { from: this.rerollBtn.x - 8, to: this.rerollBtn.x }, duration: 260, ease: 'Elastic.easeOut' }); return; }
    this.o.sfx('reroll', 0.6);
    this.syncReroll();
    const old = this.cards;
    this.cards = [];
    this.setFocus(-1);
    old.forEach((c, i) => this.scene.tweens.add({ targets: c, y: c.y + 720, angle: (i - 1) * 14, duration: 280, delay: i * 50, ease: 'Cubic.easeIn', onComplete: () => c.destroy() }));
    this.deal(next, 260);
  }

  /** Keyboard: arrows move, Enter / Space / 1–4 take, R rerolls. */
  key(code: string): void {
    if (this.busy || this.done) return;
    const n = this.cards.length;
    const four = n > 3;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, KeyA: -1, KeyD: 1, ArrowUp: four ? -2 : 0, ArrowDown: four ? 2 : 0 };
    if (step[code]) {
      this.setFocus(this.focus < 0 ? 0 : (this.focus + step[code] + n) % n);
      this.o.sfx('move', 0.4);
      return;
    }
    const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (num >= 0 && num < n) { this.pick(num); return; }
    if (code === 'Enter' || code === 'Space') {
      if (this.focus >= 0) this.pick(this.focus); else this.setFocus(0);
    }
    if (code === 'KeyR') this.reroll();
  }

  private pick(i: number): void {
    if (this.done || this.busy) return;
    this.done = true;
    const c = this.cards[i];
    this.o.sfx('cardPick', 0.75);
    this.cards.forEach((o, k) => {
      if (k !== i) this.scene.tweens.add({ targets: o, y: o.y + 640, alpha: 0, angle: (k - i) * 10, duration: 320, ease: 'Cubic.easeIn' });
    });
    this.root.bringToTop(c);
    this.scene.tweens.add({ targets: c, scale: 1.12, duration: 160, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.o.onPick(c.id, c) });
  }

  close(): void {
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 240, onComplete: () => this.root.destroy() });
  }

  /** Test hook: takes card i. */
  testPick(i: number): void { this.busy = false; this.pick(i); }
  get offer(): CardId[] { return this.cards.map((c) => c.id); }
  get ready(): boolean { return !this.busy; }
}

// ------------------------------------------------------------------ tray

const SLOT = 40;
const TRAY_MAX = 7;

/** The cards owned in this run, as small icons in a HUD chip. Hover / long-press: a tooltip; tap: the list. */
export class CardTray {
  readonly chip: HudChip;
  private row: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Container[] = [];
  private tip: Phaser.GameObjects.Container;
  private tipBg: Phaser.GameObjects.Graphics;
  private tipName: Phaser.GameObjects.Text;
  private tipDesc: Phaser.GameObjects.Text;
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
    this.tip = scene.add.container(0, y + 78).setScrollFactor(0, 0, true).setDepth(9300).setVisible(false);
    this.tipBg = scene.add.graphics();
    this.tipName = txt(scene, 0, -16, '', { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.tipDesc = txt(scene, 0, 14, '', { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 440, align: 'left' }).setOrigin(0, 0);
    this.tip.add([this.tipBg, this.tipName, this.tipDesc]);
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
      hit.on('pointerout', () => { if (this.tipT <= 0) this.tip.setVisible(false); });
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
      if (!this.press.long && this.press.t > 0.42 && this.press.id) {
        this.press.long = true;
        const slot = this.slots.find((s) => s.getData('id') === this.press!.id);
        if (slot) { this.showTip(this.press.id, stack, slot); this.tipT = 2.4; }
      }
    }
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.tip.setVisible(false); }
  }

  private showTip(id: CardId, stack: (id: CardId) => number, slot: Phaser.GameObjects.Container): void {
    const col = RARITY_COLOR[CARD[id].rarity];
    const n = stack(id);
    this.tipName.setText(t('c_' + id) + (n > 1 ? ' ×' + n : '')).setColor(col.text);
    this.tipDesc.setText(t('cd_' + id));
    const w = Math.max(this.tipName.width, this.tipDesc.width) + 32, h = 40 + this.tipDesc.height + 16;
    const sx = this.chip.x + this.row.x + slot.x;
    const x = Phaser.Math.Clamp(sx - 30, 12, this.scene.scale.width - 12 - w);
    this.tip.setPosition(x, this.y + 34 + h / 2);
    this.tipName.setPosition(16, -h / 2 + 22);
    this.tipDesc.setPosition(16, -h / 2 + 40);
    this.tipBg.clear().fillStyle(0x000000, 0.3).fillRoundedRect(0, -h / 2 + 5, w, h, 16)
      .fillStyle(0x0b1020, 0.94).fillRoundedRect(0, -h / 2, w, h, 16).lineStyle(2, col.frame, 0.9).strokeRoundedRect(0, -h / 2, w, h, 16);
    const px = Phaser.Math.Clamp(sx - x, 18, w - 18);
    this.tipBg.fillStyle(0x0b1020, 0.94).fillTriangle(px - 9, -h / 2, px + 9, -h / 2, px, -h / 2 - 10);
    this.tip.setVisible(true);
  }

  setVisible(on: boolean): void {
    this.chip.setData('show', on);
    this.chip.setVisible(on && this.ids.length > 0);
    if (!on) this.tip.setVisible(false);
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
