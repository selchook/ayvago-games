// Crystal Keep: the power-card UI. A card face (rarity frame, glow, art, name, text), the draft
// screen that deals three or four of them, the tray of owned cards in the HUD (tooltips on hover,
// a tap opens the full list) and that list.
import Phaser from 'phaser';
import { txt, t, hudChip, HudChip, HUD_GAP, HUD_ROW2_Y } from '@core';
import { CARD, RARITY_COLOR, type Rarity } from './cards';
import { cardArt } from './art';
import { glass, Pill } from './ui';
import type { CardId, Sim } from './sim';

export const DRAFT_DEPTH = 9700;

/** A card's text (Gold Rain names its gold). */
export function cardDesc(sim: Sim, id: CardId): string {
  return t('cd_' + id, { n: sim.goldRainGold() });
}

// ------------------------------------------------------------------ card face

export class CardFace extends Phaser.GameObjects.Container {
  static W = 210;
  static H = 360;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly front: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Container;
  private shine: Phaser.GameObjects.Graphics | null = null;
  private lift: Phaser.GameObjects.Graphics;
  focused = false;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly id: CardId, sim: Sim) {
    super(scene, x, y);
    const { W, H } = CardFace;
    const rar = CARD[id].rarity;
    const col = RARITY_COLOR[rar];
    this.glow = scene.add.graphics();
    for (let i = 6; i >= 1; i--) this.glow.lineStyle(i * 5, col.glow, 0.05 + (rar === 'common' ? 0 : 0.035)).strokeRoundedRect(-W / 2, -H / 2, W, H, 24);
    this.glow.setAlpha(rar === 'common' ? 0.5 : 1);
    this.lift = scene.add.graphics();
    // the face
    this.front = scene.add.container(0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(-W / 2, -H / 2 + 10, W, H, 22);
    bg.fillStyle(col.dark, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    bg.fillStyle(0x0b1020, 0.55).fillRoundedRect(-W / 2 + 10, -H / 2 + 44, W - 20, 138, 16);
    bg.fillStyle(0xffffff, 0.07).fillRoundedRect(-W / 2 + 5, -H / 2 + 5, W - 10, H * 0.3, { tl: 18, tr: 18, bl: 6, br: 6 });
    bg.lineStyle(5, col.frame, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
    bg.lineStyle(2, 0xffffff, 0.25).strokeRoundedRect(-W / 2 + 6, -H / 2 + 6, W - 12, H - 12, 17);
    const tag = txt(scene, 0, -H / 2 + 24, t('r_' + rar), { title: true, size: 17, color: col.text, strokeThickness: 0, shadow: false });
    const art = scene.add.image(0, -H / 2 + 113, scene.textures.exists(cardArt(id)) ? cardArt(id) : '__WHITE').setDisplaySize(136, 136);
    const name = txt(scene, 0, 10, t('c_' + id), { title: true, size: 24, strokeThickness: 0, wrap: W - 22, shadow: false }).setOrigin(0.5, 0);
    if (name.height > 64) name.setScale(64 / name.height);
    const desc = txt(scene, 0, 0, cardDesc(sim, id), { size: 18, color: '#dfe7fb', strokeThickness: 0, wrap: W - 24, shadow: false });
    desc.setOrigin(0.5, 0).setY(10 + name.displayHeight + 8);
    const bottom = H / 2 - (sim.stacks(id) > 0 ? 34 : 14);
    if (desc.y + desc.height > bottom) desc.setScale((bottom - desc.y) / desc.height);
    this.front.add([bg, tag, art, name, desc]);
    const n = sim.stacks(id);
    if (n > 0) this.front.add(txt(scene, 0, H / 2 - 20, t('ownedN', { n }) + ' → ×' + (n + 1), { size: 16, color: '#ffd23f', strokeThickness: 0, shadow: false }));
    if (rar === 'epic') {
      // epic cards: a second, shimmering gold frame
      this.shine = scene.add.graphics();
      this.shine.lineStyle(3, 0xffe28a, 1).strokeRoundedRect(-W / 2 + 3, -H / 2 + 3, W - 6, H - 6, 20);
      this.shine.setVisible(false);
      this.front.add(this.shine);
    }
    // the back: the keep's crystal on the rarity's colour
    this.back = scene.add.container(0, 0);
    const bb = scene.add.graphics();
    bb.fillStyle(0x000000, 0.35).fillRoundedRect(-W / 2, -H / 2 + 10, W, H, 22);
    bb.fillStyle(0x1a1430, 1).fillRoundedRect(-W / 2, -H / 2, W, H, 22);
    for (let i = 0; i < 5; i++) bb.lineStyle(2, col.frame, 0.12 + i * 0.04).strokeCircle(0, 0, 30 + i * 18);
    bb.lineStyle(5, col.frame, 1).strokeRoundedRect(-W / 2, -H / 2, W, H, 22);
    const crystal = scene.add.image(0, 0, scene.textures.exists('ck-crystal-keep') ? 'ck-crystal-keep' : '__WHITE').setDisplaySize(110, 110);
    this.back.add([bb, crystal]);
    this.add([this.glow, this.lift, this.back, this.front]);
    this.front.setVisible(false);
    scene.add.existing(this);
  }

  /** Turns the card over (face up), with a squash in the middle. */
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
    this.scene.tweens.add({ targets: this, y: this.getData('y0') - (on ? 22 : 0), duration: 140, ease: 'Quad.easeOut' });
  }
}

// ------------------------------------------------------------------ draft

export interface DraftOptions {
  sim: Sim;
  wave: number;
  offer: CardId[];
  rerolls: number;
  input: 'mouse' | 'touch' | 'keys';
  /** Rolls a new offer (a reroll). */
  roll: () => CardId[];
  /** The card was taken: from where it flies (screen point). */
  onPick: (id: CardId, from: CardFace) => void;
  sfx: (key: string, volume?: number) => void;
}

/** The "choose a card" screen: the game waits while it is open. */
export class DraftScreen {
  private root: Phaser.GameObjects.Container;
  private cards: CardFace[] = [];
  private focus = -1;
  private rerolls: number;
  private rerollBtn: Pill | null = null;
  private takeBtn: Pill;
  private busy = true;
  done = false;

  constructor(private scene: Phaser.Scene, private o: DraftOptions) {
    const { width, height } = scene.scale;
    this.rerolls = o.rerolls;
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(DRAFT_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x070a14, 0.66).setOrigin(0).setInteractive();
    const four = o.offer.length > 3;
    const ty = four ? 176 : 290;
    const title = txt(scene, width / 2, ty, t('chooseCard'), { title: true, size: 46, color: '#ffd23f', strokeThickness: 8 });
    const sub = txt(scene, width / 2, ty + 52, t('draftSub', { n: o.wave }), { size: 22, color: '#e6ecff', strokeThickness: 4, wrap: 660 });
    const by = four ? 1120 : 920;
    this.takeBtn = new Pill(scene, width / 2 + 130, by, 220, 84, 0x2f9e56, () => { if (this.focus >= 0) this.pick(this.focus); }, 26);
    this.takeBtn.setLabels(t('take')).setEnabled(false);
    const hint = txt(scene, width / 2, by + 78, o.input === 'keys' ? t('draftKeys') : o.input === 'touch' ? t('draftTouch') : t('draftMouse'), { size: 20, color: '#cfd8f0', strokeThickness: 4 });
    this.root.add([dim, title, sub, this.takeBtn, hint]);
    if (this.rerolls > 0) {
      this.rerollBtn = new Pill(scene, width / 2 - 130, by, 220, 84, 0x3d5a9e, () => this.reroll(), 24);
      this.rerollBtn.setLabels(t('reroll', { n: this.rerolls }));
      this.root.add(this.rerollBtn);
    }
    this.root.setScrollFactor(0, 0, true);
    title.setScale(0.4).setAlpha(0);
    scene.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    dim.setAlpha(0);
    scene.tweens.add({ targets: dim, alpha: 1, duration: 220 });
    this.deal(o.offer, 260);
  }

  /** Lays out a hand of cards face down and flips them one after another. */
  private deal(offer: CardId[], delay: number): void {
    const { width } = this.scene.scale;
    const four = offer.length > 3;
    const W = CardFace.W, H = CardFace.H;
    this.busy = true;
    this.o.sfx('cardFan', 0.6);
    offer.forEach((id, i) => {
      const x = four ? width / 2 + (i % 2 ? 1 : -1) * (W / 2 + 12) : width / 2 + (i - (offer.length - 1) / 2) * (W + 18);
      const y = four ? 470 + Math.floor(i / 2) * (H + 26) : 650;
      const c = new CardFace(this.scene, x, y + 500, id, this.o.sim);
      c.setData('y0', y).setData('ix', i);
      this.root.add(c);
      c.setScrollFactor(0, 0, true);
      this.cards.push(c);
      c.setAngle((i - 1) * 8);
      this.scene.tweens.add({ targets: c, y, angle: 0, duration: 360, delay: delay + i * 90, ease: 'Cubic.easeOut', onStart: () => this.o.sfx('cardSlide', 0.45) });
      c.flip(delay + 380 + i * 160, () => {
        this.o.sfx('cardFlip', 0.55);
        if (CARD[id].rarity === 'epic') this.o.sfx('epic', 0.6);
        if (i === offer.length - 1) this.busy = false;
      });
      c.setSize(W, H).setInteractive({ useHandCursor: true });
      c.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && !this.busy) this.setFocus(i); });
      c.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.busy || this.done) return;
        // the mouse picks at once; a finger first lifts the card, a second tap takes it
        if (!p.wasTouch || this.focus === i) this.pick(i);
        else { this.setFocus(i); this.o.sfx('move', 0.4); }
      });
    });
    // glows breathe
    for (const c of this.cards) this.scene.tweens.add({ targets: c.glow, alpha: { from: c.glow.alpha, to: c.glow.alpha * 0.45 }, duration: 900, yoyo: true, repeat: -1 });
  }

  private setFocus(i: number): void {
    this.focus = i;
    this.cards.forEach((c, k) => c.setFocus(k === i));
    this.takeBtn.setEnabled(i >= 0);
  }

  private reroll(): void {
    if (this.busy || this.done || this.rerolls <= 0) return;
    this.rerolls--;
    this.o.sfx('reroll', 0.6);
    this.rerollBtn?.setLabels(t('reroll', { n: this.rerolls })).setEnabled(this.rerolls > 0);
    const old = this.cards;
    this.cards = [];
    this.setFocus(-1);
    old.forEach((c, i) => this.scene.tweens.add({ targets: c, y: c.y + 700, angle: (i - 1) * 14, duration: 280, delay: i * 50, ease: 'Cubic.easeIn', onComplete: () => c.destroy() }));
    this.deal(this.o.roll(), 260);
  }

  /** Keyboard: arrows move, Enter / Space / 1–4 take, R rerolls. */
  key(code: string): void {
    if (this.busy || this.done) return;
    const n = this.cards.length;
    const four = n > 3;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: four ? -2 : 0, ArrowDown: four ? 2 : 0 };
    if (code in step && step[code]) {
      const f = this.focus < 0 ? 0 : (this.focus + step[code] + n) % n;
      this.setFocus(f);
      this.o.sfx('move', 0.4);
      return;
    }
    const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (num >= 0 && num < n) { this.pick(num); return; }
    if ((code === 'Enter' || code === 'Space') && this.focus >= 0) this.pick(this.focus);
    else if (code === 'Enter' || code === 'Space') this.setFocus(0);
    if (code === 'KeyR') this.reroll();
  }

  private pick(i: number): void {
    if (this.done || this.busy) return;
    this.done = true;
    const c = this.cards[i];
    this.o.sfx('cardPick', 0.75);
    this.cards.forEach((o, k) => {
      if (k === i) return;
      this.scene.tweens.add({ targets: o, y: o.y + 640, alpha: 0, angle: (k - i) * 10, duration: 320, ease: 'Cubic.easeIn' });
    });
    this.root.bringToTop(c);
    this.scene.tweens.add({ targets: c, scale: 1.12, duration: 160, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.o.onPick(c.id, c) });
  }

  /** Fades the screen out (the picked card has its own flight). */
  close(): void {
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 260, onComplete: () => this.root.destroy() });
  }

  /** Test hook: takes card i. */
  testPick(i: number): void { this.busy = false; this.pick(i); }
  get offer(): CardId[] { return this.cards.map((c) => c.id); }
}

// ------------------------------------------------------------------ tray

const SLOT = 42;
const TRAY_MAX = 6;

/** The cards owned in this map, as small icons in a HUD chip. Hover or long-press: a tooltip; tap: the full list. */
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

  constructor(private scene: Phaser.Scene, x: number, private onOpen: () => void) {
    this.row = scene.add.container(0, 0);
    this.row.setData('chipWidth', SLOT);
    this.chip = hudChip(scene, x, HUD_ROW2_Y, { items: [this.row], minWidth: 56 });
    this.chip.setVisible(false);
    this.tip = scene.add.container(0, HUD_ROW2_Y + 78).setScrollFactor(0, 0, true).setDepth(9300).setVisible(false);
    this.tipBg = scene.add.graphics();
    this.tipName = txt(scene, 0, -16, '', { title: true, size: 22, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5);
    this.tipDesc = txt(scene, 0, 14, '', { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 440, align: 'left' }).setOrigin(0, 0);
    this.tip.add([this.tipBg, this.tipName, this.tipDesc]);
  }

  /** Puts the tray next to the gold chip. */
  place(x: number): void { this.chip.setAnchor(x + HUD_GAP, HUD_ROW2_Y, 'left'); }

  /** A card on its way in: its slot stays empty until it lands. */
  hide(id: CardId, on: boolean): void {
    if (on) this.hidden.add(id); else this.hidden.delete(id);
    this.sig = '';
  }

  /** The screen point of a card's slot. */
  slotPos(sim: Sim, id: CardId): { x: number; y: number } {
    this.sync(sim);
    const i = Math.min(TRAY_MAX - 1, Math.max(0, this.ids.indexOf(id)));
    const s = this.slots[i];
    return s ? { x: this.chip.x + this.row.x + s.x, y: HUD_ROW2_Y } : { x: this.chip.x + 30, y: HUD_ROW2_Y };
  }

  sync(sim: Sim): void {
    const order = sim.cardOrder;
    const sig = order.map((id) => id + sim.stacks(id) + (this.hidden.has(id) ? 'h' : '')).join();
    if (sig === this.sig) return;
    this.sig = sig;
    for (const s of this.slots) s.destroy();
    this.slots = [];
    const over = order.length > TRAY_MAX;
    const shown = over ? order.slice(0, TRAY_MAX - 1) : order;
    this.ids = [...shown, ...(over ? [null] : [])];
    this.ids.forEach((id, i) => {
      const x = -((this.ids.length - 1) * SLOT) / 2 + i * SLOT;
      const slot = this.scene.add.container(x, 0);
      const g = this.scene.add.graphics();
      if (id) {
        const col = RARITY_COLOR[CARD[id].rarity];
        g.fillStyle(col.dark, 1).fillRoundedRect(-18, -18, 36, 36, 9).lineStyle(2.5, col.frame, 1).strokeRoundedRect(-18, -18, 36, 36, 9);
        slot.add([g, this.scene.add.image(0, 0, cardArt(id)).setDisplaySize(38, 38)]);
        const n = sim.stacks(id);
        if (n > 1) slot.add(txt(this.scene, 12, 11, '×' + n, { size: 14, strokeThickness: 4, color: '#ffd23f' }));
        slot.setVisible(!this.hidden.has(id));
      } else {
        g.fillStyle(0x24345a, 1).fillRoundedRect(-17, -17, 34, 34, 9);
        slot.add([g, txt(this.scene, 0, 0, '+' + (order.length - TRAY_MAX + 1), { size: 17, strokeThickness: 0, shadow: false })]);
      }
      const hit = this.scene.add.zone(0, 0, SLOT, 52).setInteractive({ useHandCursor: true });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && id) this.showTip(sim, id, slot); });
      hit.on('pointerout', () => { if (this.tipT <= 0) this.tip.setVisible(false); });
      hit.on('pointerdown', () => { this.press = { id, t: 0, long: false }; });
      hit.on('pointerup', (p: Phaser.Input.Pointer) => {
        const pr = this.press;
        this.press = null;
        if (pr?.long) return;
        // a tap: the full list (the mouse already sees the tooltip)
        if (p.wasTouch || !id) this.onOpen();
        else this.onOpen();
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

  /** Long-press shows the tooltip on touch screens. */
  update(dt: number, sim: Sim): void {
    if (this.press) {
      this.press.t += dt;
      if (!this.press.long && this.press.t > 0.42 && this.press.id) {
        this.press.long = true;
        const slot = this.slots.find((s) => s.getData('id') === this.press!.id);
        if (slot) { this.showTip(sim, this.press.id, slot); this.tipT = 2.4; }
      }
    }
    if (this.tipT > 0) { this.tipT -= dt; if (this.tipT <= 0) this.tip.setVisible(false); }
  }

  private showTip(sim: Sim, id: CardId, slot: Phaser.GameObjects.Container): void {
    const col = RARITY_COLOR[CARD[id].rarity];
    const n = sim.stacks(id);
    this.tipName.setText(t('c_' + id) + (n > 1 ? ' ×' + n : '')).setColor(col.text);
    this.tipDesc.setText(cardDesc(sim, id));
    const w = Math.max(this.tipName.width, this.tipDesc.width) + 32, h = 40 + this.tipDesc.height + 16;
    const sx = this.chip.x + this.row.x + slot.x;
    const x = Phaser.Math.Clamp(sx - 30, 12, this.scene.scale.width - 12 - w);
    this.tip.setPosition(x, HUD_ROW2_Y + 34 + h / 2);
    this.tipName.setPosition(16, -h / 2 + 22);
    this.tipDesc.setPosition(16, -h / 2 + 40);
    this.tipBg.clear().fillStyle(0x000000, 0.3).fillRoundedRect(0, -h / 2 + 5, w, h, 16)
      .fillStyle(0x0b1020, 0.92).fillRoundedRect(0, -h / 2, w, h, 16).lineStyle(2, col.frame, 0.9).strokeRoundedRect(0, -h / 2, w, h, 16);
    // a little pointer up to the slot
    const px = Phaser.Math.Clamp(sx - x, 18, w - 18);
    this.tipBg.fillStyle(0x0b1020, 0.92).fillTriangle(px - 9, -h / 2, px + 9, -h / 2, px, -h / 2 - 10);
    this.tip.setVisible(true);
  }

  hideTip(): void { this.tip.setVisible(false); this.tipT = 0; }

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
  constructor(scene: Phaser.Scene, sim: Sim, private onClose: () => void) {
    const { width, height } = scene.scale;
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(DRAFT_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x070a14, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.close());
    const ids = sim.cardOrder;
    // rows as tall as their text
    const rows = ids.map((id) => {
      const desc = txt(scene, -216, 0, cardDesc(sim, id), { size: 19, color: '#dfe7fb', strokeThickness: 0, shadow: false, wrap: 500, align: 'left' }).setOrigin(0, 0);
      return { id, desc, h: Math.max(80, 44 + desc.height + 10) };
    });
    const h = 150 + rows.reduce((a, r) => a + r.h, 0);
    const panel = scene.add.container(width / 2, height / 2 - 40);
    panel.add(glass(scene, 660, h, { alpha: 0.95 }));
    panel.add(txt(scene, 0, -h / 2 + 50, t('cardsTitle'), { title: true, size: 38, color: '#ffd23f', strokeThickness: 6 }));
    let y0 = -h / 2 + 96;
    for (const { id, desc, h: rh } of rows) {
      const col = RARITY_COLOR[CARD[id].rarity];
      const g = scene.add.graphics();
      const cy = y0 + 34;
      g.fillStyle(col.dark, 1).fillRoundedRect(-300, cy - 34, 68, 68, 14).lineStyle(3, col.frame, 1).strokeRoundedRect(-300, cy - 34, 68, 68, 14);
      const n = sim.stacks(id);
      desc.setY(y0 + 32);
      panel.add([g, scene.add.image(-266, cy, cardArt(id)).setDisplaySize(62, 62),
        txt(scene, -216, y0 + 14, t('c_' + id) + (n > 1 ? '  ×' + n : ''), { title: true, size: 24, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(0, 0.5),
        desc,
        txt(scene, 296, y0 + 14, t('r_' + CARD[id].rarity as Rarity), { size: 14, color: col.text, strokeThickness: 0, shadow: false }).setOrigin(1, 0.5)]);
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
