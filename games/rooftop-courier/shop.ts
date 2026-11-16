// Rooftop Courier: the courier shop, opened from the menu (the menu waits under it). Two tabs:
// UPGRADES (ten upgrades in a grid of cards: each with its level pips, what it does now and at the
// next level, and its price) and COSMETICS (satchels and caps worn on the courier). A purchase
// pops the card, fills its pip and throws a little confetti. Touch or mouse on the tabs, cards and
// swatches; keys: arrows pick, Enter buys or wears, Tab (or Q / E) switches the tab, Esc goes back.
// It wears the menu theme (menu.ts): airmail stripes round a dusk sky, the cards perforated
// postage stamps, the tabs and buttons painted street signs, every heading in Saira Stencil One.
// Everything it shows is painted under the Ayvago intro (`prebakeShop`, from main.ts): opening
// it, picking a card or switching a tab only places images.
import Phaser from 'phaser';
import {
  t, playSfx, burst, getLang, labelTexture, skinTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara,
  glyphAtlas, labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton, type LabelStyle,
} from '@core';
import { frameBorder } from '@core/menu-theme';
import { BAGS, CAPS, UPGRADES, UPGRADE_IDS, loadMeta, saveMeta, type Meta, type UpgradeId } from './meta';
import { UP, MAGNET_R, RUSH_T } from './sim';
import { TUNING } from './defs';
import { STAMP_ICON, UPGRADE_ICON, makeIcons } from './art';
import { ORANGE, INDIGO, INK } from './menu';

type Item = { kind: 'bag' | 'cap'; id: string } | { kind: 'up'; id: UpgradeId };
type Tab = 'up' | 'look';

/** A number for the player's language (TR: a decimal comma). */
const num = (v: number, d = 1): string => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  const str = Number.isInteger(r) ? String(r) : r.toFixed(d);
  return getLang() === 'tr' ? str.replace('.', ',') : str;
};

/** What an upgrade gives at a level, as the card shows it. */
export function upgradeEffect(id: UpgradeId, lv: number): string {
  switch (id) {
    case 'time': return t('ef_time', { n: num(UP.time * lv) });
    case 'flow': return t('ef_flow', { n: num(UP.flow * lv, 2) });
    case 'bonus': return t('ef_bonus', { n: Math.round((UP.bankShare[0] + UP.bankShare[1] * lv) * 100) });
    case 'dur': return t('ef_dur', { n: Math.round(UP.dur * lv * 100) });
    case 'magnet': return t('ef_magnet', { n: num(MAGNET_R + UP.magnet * lv, 2) });
    case 'shield': return t(lv ? 'ef_shieldOn' : 'ef_shieldOff');
    case 'jump': return t('ef_jump', { n: num(UP.jump * lv * 100) });
    case 'rush': return t('ef_rush', { n: num(RUSH_T + UP.rush * lv) });
    case 'stamp': return t('ef_stamp', { n: Math.round(UP.stamp * lv * 100) });
    case 'heart': return t('ef_heart', { n: TUNING.easy.hearts + UP.heart * lv });
  }
}

const COLS = 2;
const CARD_W = 322, CARD_H = 162;
const SW_W = 112, SW_H = 170;
const cardX = (i: number) => 360 + ((i % COLS) - 0.5) * (CARD_W + 16);
const cardY = (i: number) => 352 + Math.floor(i / COLS) * (CARD_H + 12);
const GREEN = 0x2fae5a, POOR = 0x8a5a62;
/** Room for the name and the line under it, right of the icon. */
const SUB_W = CARD_W - 112;

// the styles (shared with the prebake, so the painted keys match)
const TITLE: LabelStyle = { size: 48, fill: ['#fff6dc', '#ffd27a', '#ff8a3a'], stroke: INK, strokeWidth: 8 };
const WALLET: LabelStyle = { size: 30, color: '#fff6e6', stroke: INK };
const TAB: LabelStyle = { size: 30 };
const NAME: LabelStyle = { size: 23, color: INK, stroke: null, shadow: false };
const SUB: LabelStyle = { size: 15, color: '#5a4c70', stroke: null, shadow: false, body: true };
const EFF: LabelStyle = { size: 17, color: '#3b3d8c', stroke: null, shadow: false, body: true };
const EFF_DONE: LabelStyle = { size: 17, color: '#1f7a3e', stroke: null, shadow: false, body: true };
const PRICE: LabelStyle = { size: 24, color: '#fff6e6', stroke: INK, strokeWidth: 4 };
const BTN_SMALL: LabelStyle = { size: 22 };
const SECTION: LabelStyle = { size: 32, color: '#fff6e6', stroke: INK, strokeWidth: 6 };
const SW_NAME: LabelStyle = { size: 17, color: INK, stroke: null, shadow: false, body: true };
const TAG_WORN: LabelStyle = { size: 21, color: '#1f7a3e', stroke: null, shadow: false };
const TAG_WEAR: LabelStyle = { size: 21, color: '#3b3d8c', stroke: null, shadow: false };
const TAG_OK: LabelStyle = { size: 21, color: '#c4401a', stroke: null, shadow: false };
const TAG_POOR: LabelStyle = { size: 21, color: '#8a7a90', stroke: null, shadow: false };
const POP: LabelStyle = { size: 34, color: '#7dffa0', stroke: INK, strokeWidth: 8 };
const NEED: LabelStyle = { size: 26, color: '#ff9a7a', stroke: INK, strokeWidth: 7 };
const KEYS: LabelStyle = { size: 17, color: '#c8c0e0', stroke: INK, strokeWidth: 3, body: true };
const BTN: LabelStyle = { size: 34 };

const effectLine = (id: UpgradeId, lv: number): string => (lv >= UPGRADES[id].length ? t('shopNow', { v: upgradeEffect(id, lv) }) : `${upgradeEffect(id, lv)}  →  ${upgradeEffect(id, lv + 1)}`);

/** Paints the shop's every texture in the current language (Boot, under the Ayvago intro). */
export function prebakeShop(scene: Phaser.Scene): void {
  skyTexture(scene);
  skinTexture(scene, 'button', 470, 88, 'up', INDIGO);
  labelTexture(scene, t('shopTitle'), TITLE);
  bakeButton(scene, 'plate', 240, 58, INDIGO);
  for (const o of [WALLET, PRICE, TAG_OK, TAG_POOR]) glyphAtlas(scene, o);
  bakeButton(scene, 'button', 306, 74, INDIGO);
  bakeButton(scene, 'button', 306, 74, ORANGE, false, true);
  for (const k of ['shopUpgrades', 'shopCosmetics']) labelTexture(scene, t(k), TAB);
  cardTexture(scene, CARD_W, CARD_H);
  cardTexture(scene, SW_W, SW_H);
  let most = 0;
  for (const id of UPGRADE_IDS) {
    labelTexture(scene, t('up_' + id), NAME);
    bakePara(scene, t('up_' + id + 'Sub'), SUB, SUB_W);
    const max = UPGRADES[id].length;
    most = Math.max(most, max);
    for (let lv = 0; lv <= max; lv++) labelTexture(scene, effectLine(id, lv), lv >= max ? EFF_DONE : EFF);
  }
  for (const c of [GREEN, POOR]) bakeButton(scene, 'button', 128, 46, c);
  bakeButton(scene, 'button', 128, 46, INDIGO, true);
  labelTexture(scene, t('maxed'), BTN_SMALL);
  for (let n = 1; n <= most; n++) labelTexture(scene, t('shopLevelUp', { n }), POP);
  bakeFmt(scene, 'shopNeed', ['n'], NEED);
  for (const k of ['shopBags', 'shopCaps']) labelTexture(scene, t(k), SECTION);
  for (const b of BAGS) labelTexture(scene, t('bag_' + b.id), SW_NAME);
  for (const c of CAPS) labelTexture(scene, t('cap_' + c.id), SW_NAME);
  labelTexture(scene, t('worn'), TAG_WORN);
  labelTexture(scene, t('wear'), TAG_WEAR);
  labelTexture(scene, t('shopKeys'), KEYS);
  labelTexture(scene, t('back'), BTN);
  bakeButton(scene, 'button', 300, 84, INDIGO);
}

/** Dusk over the rooftops behind the shop: indigo night to an orange glow (a small gradient, scaled up). */
function skyTexture(scene: Phaser.Scene): string {
  return bake(scene, 'rc-shop-sky', 8, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#0d0a20'); g.addColorStop(0.55, '#231a4a'); g.addColorStop(0.85, '#4a2a5a'); g.addColorStop(1, '#7a3a4a');
    c.fillStyle = g; c.fillRect(0, 0, 8, 128);
  });
}

const PAD = 14;

/**
 * A postage stamp as a card: cream paper with its perforated edge, an indigo frame with an orange
 * rule inside and faint postmark waves in a corner. Painted once per size (cached).
 */
function cardTexture(scene: Phaser.Scene, w: number, h: number): string {
  return bake(scene, `rc-stampcard-${w}x${h}`, w + PAD * 2, h + PAD * 3, (c) => {
    let seed = w * 31 + h;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const p = cv.getContext('2d')!;
    const paper = p.createLinearGradient(0, 0, 0, h);
    paper.addColorStop(0, '#fbf4e4'); paper.addColorStop(1, '#efe2c6');
    p.fillStyle = paper; p.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.004; i++) { p.fillStyle = r() < 0.5 ? 'rgba(120,90,50,0.08)' : 'rgba(255,255,255,0.3)'; p.fillRect(r() * w, r() * h, 1.5, 1.5); }
    p.strokeStyle = 'rgba(59,61,140,0.9)'; p.lineWidth = 3;
    p.strokeRect(11, 11, w - 22, h - 22);
    p.strokeStyle = 'rgba(232,105,42,0.7)'; p.lineWidth = 1.5;
    p.strokeRect(16, 16, w - 32, h - 32);
    if (w > 200) {
      // postmark waves, faint, top right
      p.strokeStyle = 'rgba(40,28,70,0.12)'; p.lineWidth = 2.5;
      for (let i = 0; i < 3; i++) {
        const y = 26 + i * 9;
        p.beginPath();
        for (let x = w - 120; x <= w - 24; x += 4) { const yy = y + Math.sin(x * 0.14) * 2.5; x === w - 120 ? p.moveTo(x, yy) : p.lineTo(x, yy); }
        p.stroke();
      }
    }
    // the perforation: holes cut along every edge
    p.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number) => { p.beginPath(); p.arc(x, y, 5, 0, Math.PI * 2); p.fill(); };
    const nx = Math.max(2, Math.round(w / 16)), ny = Math.max(2, Math.round(h / 16));
    for (let i = 0; i <= nx; i++) { hole((w * i) / nx, 0); hole((w * i) / nx, h); }
    for (let i = 0; i <= ny; i++) { hole(0, (h * i) / ny); hole(w, (h * i) / ny); }
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
    c.drawImage(cv, PAD, PAD);
    c.restore();
  });
}

const stampCard = (scene: Phaser.Scene, w: number, h: number): Phaser.GameObjects.Image => scene.add.image(0, PAD / 2, cardTexture(scene, w, h));

export class ShopScene extends Phaser.Scene {
  private meta!: Meta;
  private root!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private stampsText!: GlyphText;
  private stampChip!: Phaser.GameObjects.Container;
  private tabs: { id: Tab; b: KitButton }[] = [];
  private tab: Tab = 'up';
  private items: Item[] = [];
  private sel = 0;
  private closed = false;
  private from = 'Menu';
  private changed = false;
  /** The card or swatch of each item as drawn (the purchase pop). */
  private cellOf = new Map<string, Phaser.GameObjects.Container>();

  constructor() { super('Shop'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.changed = false;
    this.tab = 'up';
    makeIcons(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    this.root.add(this.add.image(0, 0, skyTexture(this)).setOrigin(0).setDisplaySize(width, height).setInteractive());
    this.root.add(frameBorder(this));
    // the title on a street sign
    this.root.add(this.add.image(width / 2, 70 + SKIN_PAD / 2, skinTexture(this, 'button', 470, 88, 'up', INDIGO)));
    this.root.add(fitWidth(labelAt(this, width / 2, 70, t('shopTitle'), TITLE), 430));
    const chip = this.add.container(width / 2, 150);
    chip.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', 240, 58, 'up', INDIGO)));
    chip.add(this.add.image(-80, 0, STAMP_ICON).setDisplaySize(36, 36));
    this.stampsText = new GlyphText(this, 14, 0, '', WALLET);
    chip.add(this.stampsText);
    this.stampChip = chip;
    this.root.add(chip);
    // the tabs
    this.tabs = (['up', 'look'] as Tab[]).map((id, i) => {
      const b = new KitButton(this, width / 2 + (i - 0.5) * 318, 232, { w: 306, h: 74, color: INDIGO, label: t(id === 'up' ? 'shopUpgrades' : 'shopCosmetics'), style: TAB, sfx: null }, () => this.setTab(id));
      this.root.add(b);
      return { id, b };
    });
    this.body = this.add.container(0, 0);
    this.root.add(this.body);
    const back = new KitButton(this, width / 2, 1204, { w: 300, h: 84, color: INDIGO, label: t('back'), style: BTN }, () => this.close());
    this.root.add(back);
    if (!this.sys.game.device.input.touch) this.root.add(fitWidth(labelAt(this, width / 2, 1149, t('shopKeys'), KEYS), width - 80));
    this.setTab('up', true);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      const n = this.items.length;
      if (e.code === 'Tab' || e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); this.setTab(this.tab === 'up' ? 'look' : 'up'); return; }
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.select((this.sel + 1) % n);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.select((this.sel - 1 + n) % n);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.select(this.vertical(1));
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.select(this.vertical(-1));
      else if (e.code === 'Enter' || e.code === 'Space') this.act(this.items[this.sel]);
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private setTab(id: Tab, first = false): void {
    if (id === this.tab && !first) return;
    this.tab = id;
    this.items = id === 'up'
      ? UPGRADE_IDS.map((u) => ({ kind: 'up' as const, id: u }))
      : [...BAGS.map((b) => ({ kind: 'bag' as const, id: b.id })), ...CAPS.map((c) => ({ kind: 'cap' as const, id: c.id }))];
    this.sel = id === 'up' ? 0 : Math.max(0, BAGS.findIndex((b) => b.id === this.meta.bag));
    if (!first) playSfx(this, 'ui-click');
    this.drawTabs();
    this.draw();
    this.body.setAlpha(0);
    this.tweens.add({ targets: this.body, alpha: 1, duration: 140 });
  }

  private drawTabs(): void {
    for (const { id, b } of this.tabs) b.setLook(id === this.tab ? ORANGE : INDIGO, id === this.tab);
  }

  /** Up or down a row in the grid (upgrades) or between the satchels and the caps. */
  private vertical(d: number): number {
    const it = this.items[this.sel];
    if (this.tab === 'up') {
      const j = this.sel + d * COLS;
      return j >= 0 && j < this.items.length ? j : this.sel;
    }
    const rows = ['bag', 'cap'];
    const r = clampI(rows.indexOf(it.kind) + d, 0, 1);
    const col = this.items.filter((q) => q.kind === it.kind).findIndex((q) => q.id === it.id);
    const row = this.items.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === rows[r]);
    return row[Math.min(col, row.length - 1)]?.i ?? this.sel;
  }

  private select(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    playSfx(this, 'ui-click');
    this.draw();
  }

  private price(it: Item): number {
    if (it.kind === 'bag') return BAGS.find((b) => b.id === it.id)!.price;
    if (it.kind === 'cap') return CAPS.find((c) => c.id === it.id)!.price;
    const id = it.id as UpgradeId, lv = this.meta.upgrades[id];
    return lv >= UPGRADES[id].length ? Infinity : UPGRADES[id][lv];
  }

  private owned(it: Item): boolean {
    if (it.kind === 'bag') return this.meta.bags.includes(it.id);
    if (it.kind === 'cap') return this.meta.caps.includes(it.id);
    return false;
  }

  private act(it: Item): void {
    const m = this.meta;
    const key = it.kind + ':' + it.id;
    if (it.kind !== 'up' && this.owned(it)) {
      if (it.kind === 'bag') m.bag = it.id; else m.cap = it.id;
      playSfx(this, 'ui-select');
    } else {
      const p = this.price(it);
      if (!isFinite(p) || m.stamps < p) {
        playSfx(this, 'shopNo');
        this.cameras.main.shake(120, 0.004);
        const cell = this.cellOf.get(key);
        if (cell) this.tweens.add({ targets: cell, x: cell.x + 10, duration: 50, yoyo: true, repeat: 2 });
        if (isFinite(p)) this.floatText(cell, new FmtLine(this, 0, 0, NEED).set('shopNeed', { n: p - m.stamps }));
        return;
      }
      m.stamps -= p;
      if (it.kind === 'bag') { m.bags.push(it.id); m.bag = it.id; }
      else if (it.kind === 'cap') { m.caps.push(it.id); m.cap = it.id; }
      else m.upgrades[it.id as UpgradeId]++;
      playSfx(this, 'shopBuy');
      if (it.kind === 'up') playSfx(this, 'levelUp', { volume: 0.5 });
      this.changed = true;
      saveMeta(m);
      this.draw();
      this.purchasePop(key, it.kind === 'up' ? m.upgrades[it.id as UpgradeId] : 0);
      return;
    }
    this.changed = true;
    saveMeta(m);
    this.draw();
  }

  /** The bought card pops, its pips fill, confetti flies and the stamps chip ticks down. */
  private purchasePop(key: string, level: number): void {
    const cell = this.cellOf.get(key);
    if (!cell) return;
    cell.setScale(1.12);
    this.tweens.add({ targets: cell, scale: 1, duration: 380, ease: 'Back.easeOut' });
    const wx = cell.x, wy = cell.y;
    burst(this, wx, wy, [0xffd23f, 0x7dffa0, 0xffffff, 0xff9a4a], 34, 420);
    const fw = key.startsWith('up:') ? CARD_W : SW_W, fh = key.startsWith('up:') ? CARD_H : SW_H;
    const flashR = this.add.graphics().setPosition(wx, wy);
    flashR.fillStyle(0xffffff, 0.45).fillRoundedRect(-fw / 2, -fh / 2, fw, fh, 10);
    this.tweens.add({ targets: flashR, alpha: 0, duration: 320, onComplete: () => flashR.destroy() });
    if (level) this.floatText(cell, labelAt(this, 0, 0, t('shopLevelUp', { n: level }), POP));
    this.tweens.add({ targets: this.stampChip, scale: 1.15, duration: 110, yoyo: true });
  }

  /** A word (painted ahead) pops over a card and floats away. */
  private floatText(cell: Phaser.GameObjects.Container | undefined, w: Phaser.GameObjects.Image | FmtLine): void {
    const x = cell?.x ?? this.scale.width / 2, y = (cell?.y ?? 600) - 40;
    w.setPosition(x, y).setDepth(50);
    w.setScale(0.5);
    this.tweens.add({ targets: w, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: w, y: y - 60, alpha: 0, delay: 600, duration: 400, onComplete: () => w.destroy() });
  }

  private draw(): void {
    const b = this.body;
    b.removeAll(true);
    this.cellOf.clear();
    this.stampsText.setText(String(this.meta.stamps));
    if (this.tab === 'up') this.drawUpgrades(); else this.drawLooks();
  }

  private drawUpgrades(): void {
    const m = this.meta, b = this.body;
    this.items.forEach((it, i) => {
      if (it.kind !== 'up') return;
      const id = it.id;
      const lv = m.upgrades[id], max = UPGRADES[id].length, done = lv >= max;
      const sel = i === this.sel;
      const p = this.price(it), afford = !done && m.stamps >= p;
      const c = this.add.container(cardX(i), cardY(i));
      c.add(stampCard(this, CARD_W, CARD_H));
      // the pick: an amber ring round the stamp; a finished one a green rule inside
      if (sel) c.add(this.add.graphics().lineStyle(5, 0xffc94a, 1).strokeRoundedRect(-CARD_W / 2 - 5, -CARD_H / 2 - 5, CARD_W + 10, CARD_H + 10, 12));
      if (done) c.add(this.add.graphics().lineStyle(3, 0x2fae5a, 1).strokeRect(-CARD_W / 2 + 11, -CARD_H / 2 + 11, CARD_W - 22, CARD_H - 22));
      const L = -CARD_W / 2 + 22;
      c.add(this.add.graphics().fillStyle(INDIGO, 1).fillCircle(L + 28, -CARD_H / 2 + 50, 28).lineStyle(2, 0xe8692a, 1).strokeCircle(L + 28, -CARD_H / 2 + 50, 25));
      c.add(this.add.image(L + 28, -CARD_H / 2 + 50, UPGRADE_ICON(id)).setDisplaySize(42, 42));
      c.add(fitWidth(labelAt(this, L + 66, -CARD_H / 2 + 34, t('up_' + id), NAME, 0), SUB_W));
      // what it does (up to two lines under the name)
      c.add(new Para(this, L + 66, -CARD_H / 2 + 46, t('up_' + id + 'Sub'), SUB, SUB_W, 0, 17));
      // now → next
      c.add(fitWidth(labelAt(this, L, 16, effectLine(id, lv), done ? EFF_DONE : EFF, 0), CARD_W - 44));
      // level pips
      const pips = this.add.graphics();
      for (let k = 0; k < max; k++) {
        pips.fillStyle(k < lv ? GREEN : 0x1d1230, k < lv ? 1 : 0.16).fillRoundedRect(L + k * 28, CARD_H / 2 - 36, 22, 12, 6);
        if (k < lv) pips.lineStyle(1.5, 0x1f6a3a, 1).strokeRoundedRect(L + k * 28, CARD_H / 2 - 36, 22, 12, 6);
      }
      c.add(pips);
      // the price
      const btn = new KitButton(this, CARD_W / 2 - 80, CARD_H / 2 - 32, { w: 128, h: 46, color: done ? INDIGO : afford ? GREEN : POOR, style: BTN_SMALL, sfx: null }, () => { this.sel = i; this.act(it); });
      if (done) btn.setLabel(t('maxed')).setEnabled(false);
      else {
        const price = new GlyphText(this, 14, 0, String(p), PRICE);
        btn.addContent(price, this.add.image(14 - price.textWidth / 2 - 16, 0, STAMP_ICON).setDisplaySize(24, 24));
      }
      c.add(btn);
      c.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true }).on('pointerup', () => { if (this.sel !== i) this.select(i); });
      b.add(c);
      this.cellOf.set('up:' + id, c);
    });
  }

  private drawLooks(): void {
    const m = this.meta, b = this.body;
    const section = (y: number, key: string) => b.add(labelAt(this, 60, y, t(key), SECTION, 0));
    section(318, 'shopBags');
    section(608, 'shopCaps');
    const swatchRow = (kind: 'bag' | 'cap', y: number) => {
      const list = kind === 'bag' ? BAGS : CAPS;
      list.forEach((q, i) => {
        const it: Item = { kind, id: q.id };
        const x = 104 + i * 128;
        const idx = this.items.findIndex((v) => v.kind === kind && v.id === q.id);
        const sel = idx === this.sel;
        const worn = kind === 'bag' ? m.bag === q.id : m.cap === q.id;
        const own = this.owned(it);
        const c = this.add.container(x, y);
        c.add(stampCard(this, SW_W, SW_H));
        if (worn || sel) c.add(this.add.graphics().lineStyle(5, worn ? 0x2fae5a : 0xffc94a, 1).strokeRoundedRect(-SW_W / 2 - 5, -SW_H / 2 - 5, SW_W + 10, SW_H + 10, 10));
        if (worn && sel) c.add(this.add.graphics().lineStyle(3, 0xffc94a, 1).strokeRoundedRect(-SW_W / 2 - 11, -SW_H / 2 - 11, SW_W + 22, SW_H + 22, 13));
        const g = this.add.graphics();
        const col = kind === 'bag' ? (q as typeof BAGS[number]).color : (q as typeof CAPS[number]).color;
        if (kind === 'bag') {
          const bq = q as typeof BAGS[number];
          g.fillStyle(0x000000, 0.2).fillRoundedRect(-30, -36, 60, 50, 8);
          g.lineStyle(5, bq.flap, 1).strokeCircle(0, -42, 18);
          g.fillStyle(bq.color, 1).fillRoundedRect(-32, -40, 64, 50, 8);
          g.fillStyle(bq.flap, 1).fillRoundedRect(-34, -40, 68, 22, { tl: 8, tr: 8, bl: 4, br: 4 });
          g.fillStyle(0xffd23f, 1).fillRect(-6, -22, 12, 8);
        } else if (col !== null) {
          g.fillStyle(col!, 1).fillEllipse(0, -22, 64, 44);
          g.fillRect(-32, -22, 64, 14);
          g.fillStyle(col!, 1).fillEllipse(24, -10, 46, 14);
          g.fillStyle(0xffffff, 0.25).fillEllipse(-8, -34, 26, 10);
        } else {
          g.lineStyle(4, 0x3b3d8c, 0.5).strokeCircle(0, -20, 26).lineBetween(-18, -2, 18, -38);
        }
        c.add(g);
        c.add(fitWidth(labelAt(this, 0, 30, t((kind === 'bag' ? 'bag_' : 'cap_') + q.id), SW_NAME), SW_W - 26));
        if (worn || own) c.add(fitWidth(labelAt(this, 0, 60, t(worn ? 'worn' : 'wear'), worn ? TAG_WORN : TAG_WEAR), SW_W - 24));
        else {
          const tag = new GlyphText(this, 12, 60, String(q.price), m.stamps >= q.price ? TAG_OK : TAG_POOR);
          c.add([tag, this.add.image(12 - tag.textWidth / 2 - 14, 60, STAMP_ICON).setDisplaySize(22, 22)]);
        }
        c.setSize(SW_W, SW_H).setInteractive({ useHandCursor: true }).on('pointerup', () => { this.sel = idx; this.act(it); });
        b.add(c);
        this.cellOf.set(kind + ':' + q.id, c);
      });
    };
    swatchRow('bag', 448);
    swatchRow('cap', 738);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        const menu = this.scene.get(this.from);
        // the menu's courier wears what was bought: build it again
        if (this.changed) menu.scene.restart();
        else { this.scene.resume(this.from); menu.events.emit('shop-closed'); }
      },
    });
  }
}

const clampI = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
