// Crystal Keep: the talent board. Three columns of four talents (each needs the one above it),
// bought with Crystal Shards; a reset gives every shard back. Mouse, touch and keyboard.
//
// It wears the menu theme (theme.ts): a dark slate board ringed by the battlements, carved stone
// plates for the talents (emerald when owned, amethyst when affordable, grey when too dear, dark
// when locked; a gold inlay on the one in focus), glowing veins between the ranks, the shards on a
// stone chip and stone buttons. Every piece and every fixed label is painted in Boot under the
// Ayvago intro (`prebakeTalents`, the theme's `prebake`), so opening the board only places images:
// the info text is its only live text.
import Phaser from 'phaser';
import {
  txt, t, upper, SkinButton, skinImage, skinTexture, themeLabel, labelTexture, placeLabel, ThemeNumber, bake, frameBorder,
  type LabelStyle, type SkinState,
} from '@core';
import { TALENTS, TALENT, buyState, buy, resetTalents, type Meta, type TalentId, type BuyState } from './meta';
import { talentArt } from './art';
import { shardIcon } from './thumbs';
import { CRYSTAL, EMERALD, AMETHYST, STONE, SLATE } from './theme';

export const BOARD_DEPTH = 9800;
const COLS = ['col_keep', 'col_powers', 'col_mastery'];
const NW = 200, NH = 150;
const colX = (c: number) => 360 + (c - 1) * 222;
const rowY = (r: number) => 404 + r * 172;

// ------------------------------------------------------------------ the painted pieces

/** The board behind everything: dark slate (the skin's board). */
export const TALENT_PANEL = { w: 700, h: 1236 };
/** A talent's plate per state. */
const NODE_COLOR: Record<BuyState, number> = { owned: 0x2f7a4e, ok: AMETHYST, poor: 0x4a4658, locked: 0x221e30 };
const INFO = { w: 660, h: 116 };
const CHIP = { w: 220, h: 56 };
const BUY = { w: 190, h: 84 };
const ROW = { w: 230, h: 72 };
const RESET_COLOR = 0xa8443a, ARMED_COLOR = 0xd8782a;
const STROKE = '#140a24';
const SHARD_STYLE: LabelStyle = { size: 30, color: '#f0d0ff', stroke: STROKE, strokeWidth: 5 };
const nameStyle = (st: BuyState): LabelStyle => ({ size: 19, color: st === 'owned' ? '#c8ffd8' : st === 'locked' ? '#8a80a8' : '#ffffff', stroke: STROKE, strokeWidth: 4, shadow: false });
const costStyle = (ok: boolean): LabelStyle => ({ size: 22, color: ok ? '#f0d0ff' : '#9a90b8', stroke: STROKE, strokeWidth: 4, shadow: false });
const OWNED_STYLE: LabelStyle = { size: 19, color: '#9dffb8', stroke: STROKE, strokeWidth: 4, shadow: false };
const infoStyle = (owned: boolean): LabelStyle => ({ size: 25, color: owned ? '#9dffb8' : '#ffffff', stroke: STROKE, strokeWidth: 4, shadow: false });
const TITLE_STYLE: LabelStyle = { size: 46, fill: ['#ffffff', '#f2dcff', '#c58cff'], stroke: STROKE, strokeWidth: 8 };
const COL_STYLE: LabelStyle = { size: 24, color: '#d8b8ff', stroke: STROKE, strokeWidth: 4, shadow: false };
const HINT_STYLE: LabelStyle = { size: 18, color: '#c8bcd8', stroke: null, shadow: false, body: true };
const BTN = { buy: 24, row: 24 };

/** A soft glow behind a lit plate (white, tinted per state). */
function haloTexture(scene: Phaser.Scene): string {
  return bake(scene, 'ck-tal-halo', NW + 70, NH + 70, (c) => {
    c.save();
    c.shadowColor = 'rgba(255,255,255,0.95)'; c.shadowBlur = 22;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 6;
    const k = 10, x = 35, y = 35, W = NW, H = NH;
    c.beginPath();
    c.moveTo(x + k, y); c.lineTo(x + W - k, y); c.lineTo(x + W, y + k); c.lineTo(x + W, y + H - k);
    c.lineTo(x + W - k, y + H); c.lineTo(x + k, y + H); c.lineTo(x, y + H - k); c.lineTo(x, y + k); c.closePath();
    c.stroke(); c.stroke();
    c.restore();
  });
}

/** A small iron padlock on a dark stone tile (a locked talent). */
export function lockTexture(scene: Phaser.Scene): string {
  return bake(scene, 'ck-tal-lock', 52, 52, (c) => {
    c.fillStyle = 'rgba(20,12,36,0.9)';
    c.beginPath(); c.roundRect(2, 2, 48, 48, 8); c.fill();
    c.strokeStyle = 'rgba(197,140,255,0.5)'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#b8b0cc'; c.lineWidth = 5;
    c.beginPath(); c.arc(26, 20, 9, Math.PI, 0); c.lineTo(35, 26); c.moveTo(17, 26); c.lineTo(17, 20); c.stroke();
    c.fillStyle = '#b8b0cc';
    c.beginPath(); c.roundRect(13, 24, 26, 20, 4); c.fill();
    c.fillStyle = '#221e30';
    c.beginPath(); c.arc(26, 32, 3, 0, Math.PI * 2); c.fill(); c.fillRect(24.8, 33, 2.4, 6);
  });
}

/**
 * Paints everything the talent board shows (the theme's `prebake`, in Boot under the intro): the
 * plates in their states, the chip, the info board, the buttons, the halo, the padlock and every
 * fixed label in the current language. Opening the board then creates no texture.
 */
export function prebakeTalents(scene: Phaser.Scene): void {
  skinTexture(scene, 'board', TALENT_PANEL.w, TALENT_PANEL.h);
  for (const st of Object.keys(NODE_COLOR) as BuyState[]) for (const s of ['up', 'on'] as SkinState[]) skinTexture(scene, 'plate', NW, NH, s, NODE_COLOR[st]);
  skinTexture(scene, 'plate', CHIP.w, CHIP.h, 'up', SLATE);
  skinTexture(scene, 'board', INFO.w, INFO.h);
  const states: SkinState[] = ['up', 'over', 'down', 'off'];
  for (const s of states) {
    skinTexture(scene, 'button', BUY.w, BUY.h, s, AMETHYST);
    skinTexture(scene, 'button', BUY.w, BUY.h, s, NODE_COLOR.owned);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, RESET_COLOR);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, ARMED_COLOR);
    skinTexture(scene, 'button', ROW.w, ROW.h, s, EMERALD);
  }
  haloTexture(scene);
  lockTexture(scene);
  labelTexture(scene, t('talentsTitle'), TITLE_STYLE);
  labelTexture(scene, t('talentsKeys'), HINT_STYLE);
  labelTexture(scene, t('talentsTouch'), HINT_STYLE);
  for (const k of COLS) labelTexture(scene, t(k), COL_STYLE);
  for (const tl of TALENTS) {
    for (const st of Object.keys(NODE_COLOR) as BuyState[]) labelTexture(scene, upper(t('tl_' + tl.id)), nameStyle(st));
    labelTexture(scene, upper(t('tl_' + tl.id)), infoStyle(false));
    labelTexture(scene, upper(t('tl_' + tl.id)), infoStyle(true));
  }
  for (const c of new Set(TALENTS.map((tl) => tl.cost))) { labelTexture(scene, String(c), costStyle(true)); labelTexture(scene, String(c), costStyle(false)); }
  labelTexture(scene, t('ownedTalent'), OWNED_STYLE);
  for (const k of ['unlock', 'ownedTalent']) labelTexture(scene, t(k), { size: BTN.buy });
  for (const k of ['reset', 'sure', 'close']) labelTexture(scene, t(k), { size: BTN.row });
  new ThemeNumber(scene, 0, 0, 0, SHARD_STYLE).destroy();
}

interface Node {
  id: TalentId; box: Phaser.GameObjects.Container; plate: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Image; cost: Phaser.GameObjects.Image; gem: Phaser.GameObjects.Image; art: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image;
}

export class TalentBoard {
  private root: Phaser.GameObjects.Container;
  private nodes: Node[] = [];
  private lines: Phaser.GameObjects.Graphics;
  private shards: ThemeNumber;
  private shardChip: Phaser.GameObjects.Container;
  private infoName: Phaser.GameObjects.Image;
  private infoDesc: Phaser.GameObjects.Text;
  private buyBtn: SkinButton;
  private buyGem: Phaser.GameObjects.Image;
  private resetBtn: SkinButton;
  private focus: TalentId;
  private resetArmed = false;
  closed = false;

  constructor(private scene: Phaser.Scene, private meta: Meta, private o: { input: 'mouse' | 'touch' | 'keys'; focus?: TalentId; sfx: (k: string, v?: number) => void; onClose: () => void; onChange: () => void }) {
    const { width, height } = scene.scale;
    this.focus = o.focus ?? (TALENTS.find((tl) => buyState(meta, tl.id) === 'ok')?.id ?? 'gold1');
    this.root = scene.add.container(0, 0).setScrollFactor(0, 0, true).setDepth(BOARD_DEPTH);
    const dim = scene.add.rectangle(0, 0, width, height, 0x070a14, 0.7).setOrigin(0).setInteractive();
    const panel = scene.add.container(width / 2, 652);
    panel.add(skinImage(scene, 0, 0, 'board', TALENT_PANEL.w, TALENT_PANEL.h));
    this.root.add([dim, ...frameBorder(scene), panel]);
    const title = themeLabel(scene, width / 2, 96, t('talentsTitle'), TITLE_STYLE);
    title.setScale(Math.min(1, 600 / title.width));
    this.root.add(title);
    // the shards on a stone chip
    this.shardChip = scene.add.container(width / 2, 160);
    this.shards = new ThemeNumber(scene, 20, 0, meta.shards, SHARD_STYLE);
    this.shardChip.add([skinImage(scene, 0, 0, 'plate', CHIP.w, CHIP.h, 'up', SLATE), scene.add.image(-66, 0, shardIcon()).setDisplaySize(44, 44), this.shards]);
    this.root.add(this.shardChip);
    COLS.forEach((k, c) => {
      const l = themeLabel(scene, colX(c), 252, t(k), COL_STYLE);
      l.setScale(Math.min(1, 200 / l.width));
      this.root.add(l);
    });
    this.lines = scene.add.graphics();
    this.root.add(this.lines);
    const lockKey = lockTexture(scene), haloKey = haloTexture(scene);
    for (const tl of TALENTS) {
      const box = scene.add.container(colX(tl.col), rowY(tl.row));
      const halo = scene.add.image(0, 0, haloKey).setVisible(false);
      const plate = skinImage(scene, 0, 0, 'plate', NW, NH, 'up', NODE_COLOR.ok);
      const art = scene.add.image(0, -24, talentArt(tl.id)).setDisplaySize(86, 86);
      const name = themeLabel(scene, 0, 30, upper(t('tl_' + tl.id)), nameStyle('ok'));
      const gem = scene.add.image(-18, 56, shardIcon()).setDisplaySize(28, 28);
      const cost = themeLabel(scene, 4, 56, String(tl.cost), costStyle(true)).setOrigin(0, 0.5);
      const lock = scene.add.image(60, -44, lockKey).setVisible(false);
      const hit = scene.add.zone(0, 0, NW, NH).setInteractive({ useHandCursor: true });
      hit.on('pointerover', (p: Phaser.Input.Pointer) => { if (!p.wasTouch && tl.id !== this.focus) this.scene.tweens.add({ targets: box, scale: 1.04, duration: 90 }); });
      hit.on('pointerout', () => { if (tl.id !== this.focus) this.scene.tweens.add({ targets: box, scale: 1, duration: 90 }); });
      hit.on('pointerup', () => {
        if (this.focus === tl.id) this.tryBuy();
        else { this.setFocus(tl.id); }
      });
      box.add([halo, plate, art, name, gem, cost, lock, hit]);
      this.root.add(box);
      this.nodes.push({ id: tl.id, box, plate, halo, name, cost, gem, art, lock });
    }
    // what the focused talent does, and the buy button
    const info = scene.add.container(width / 2, 1086);
    info.add(skinImage(scene, 0, 0, 'board', INFO.w, INFO.h));
    this.infoName = themeLabel(scene, -300, -30, upper(t('tl_' + this.focus)), infoStyle(false)).setOrigin(0, 0.5);
    this.infoDesc = txt(scene, -300, -10, '', { size: 19, color: '#e8e0f8', strokeThickness: 0, shadow: false, wrap: 410, align: 'left' }).setOrigin(0, 0);
    this.buyBtn = new SkinButton(scene, 216, 0, t('unlock'), () => this.tryBuy(), { width: BUY.w, height: BUY.h, size: BTN.buy, color: AMETHYST, baked: true, sfx: '' });
    this.buyBtn.onDenied = () => this.tryBuy();
    this.buyGem = scene.add.image(0, 0, shardIcon()).setDisplaySize(26, 26);
    this.buyBtn.add(this.buyGem);
    info.add([this.infoName, this.infoDesc, this.buyBtn]);
    this.root.add(info);
    this.resetBtn = new SkinButton(scene, width / 2 - 170, 1190, t('reset'), () => this.reset(), { width: ROW.w, height: ROW.h, size: BTN.row, color: RESET_COLOR, baked: true, sfx: '' });
    const closeBtn = new SkinButton(scene, width / 2 + 170, 1190, t('close'), () => this.close(), { width: ROW.w, height: ROW.h, size: BTN.row, color: EMERALD, baked: true, sfx: '' });
    this.root.add([this.resetBtn, closeBtn]);
    const hint = themeLabel(scene, width / 2, 1250, o.input === 'touch' ? t('talentsTouch') : t('talentsKeys'), HINT_STYLE);
    hint.setScale(Math.min(1, 640 / hint.width));
    this.root.add(hint);
    this.root.setScrollFactor(0, 0, true);
    this.root.setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 200 });
    panel.setScale(0.94);
    scene.tweens.add({ targets: panel, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.draw();
  }

  private setFocus(id: TalentId, sound = true): void {
    if (id === this.focus) return;
    this.focus = id;
    if (sound) this.o.sfx('move', 0.4);
    this.draw();
  }

  private draw(): void {
    const m = this.meta;
    this.shards.setValue(m.shards);
    // the veins between the ranks: crystal-lit once the rank above is owned
    const g = this.lines.clear();
    for (const tl of TALENTS) {
      if (!tl.req) continue;
      const a = TALENT[tl.req];
      const on = m.talents.includes(tl.req);
      const x0 = colX(a.col), y0 = rowY(a.row) + NH / 2 - 4, x1 = colX(tl.col), y1 = rowY(tl.row) - NH / 2 + 4;
      g.lineStyle(14, 0x0c0816, 0.9).lineBetween(x0, y0, x1, y1);
      if (on) {
        g.lineStyle(16, CRYSTAL, 0.22).lineBetween(x0, y0, x1, y1);
        g.lineStyle(6, CRYSTAL, 1).lineBetween(x0, y0, x1, y1);
        g.lineStyle(2, 0xffffff, 0.8).lineBetween(x0, y0, x1, y1);
      } else g.lineStyle(4, STONE, 1).lineBetween(x0, y0, x1, y1);
    }
    for (const n of this.nodes) {
      const st = buyState(m, n.id);
      const on = n.id === this.focus;
      n.plate.setTexture(skinTexture(this.scene, 'plate', NW, NH, on ? 'on' : 'up', NODE_COLOR[st]));
      n.halo.setVisible(st === 'owned' || st === 'ok' || on).setTint(on ? 0xffe6a0 : st === 'owned' ? 0x7dffa0 : CRYSTAL).setAlpha(on ? 0.75 : st === 'owned' ? 0.5 : 0.35);
      n.art.setAlpha(st === 'locked' ? 0.3 : st === 'poor' ? 0.6 : 1);
      placeLabel(n.name, labelTexture(this.scene, upper(t('tl_' + n.id)), nameStyle(st)));
      n.name.setScale(Math.min(1, (NW - 20) / n.name.width));
      n.box.setScale(on ? 1.05 : 1);
      if (st === 'owned') {
        placeLabel(n.cost, labelTexture(this.scene, t('ownedTalent'), OWNED_STYLE)).setOrigin(0.5, n.cost.originY).setX(0);
        n.cost.setScale(Math.min(1, (NW - 20) / n.cost.width));
        n.gem.setVisible(false);
      } else {
        placeLabel(n.cost, labelTexture(this.scene, String(TALENT[n.id].cost), costStyle(st === 'ok'))).setOrigin(0, n.cost.originY).setX(4).setScale(1);
        n.gem.setVisible(true).setAlpha(st === 'ok' ? 1 : 0.5);
      }
      n.lock.setVisible(st === 'locked');
    }
    const st = buyState(m, this.focus);
    const tl = TALENT[this.focus];
    placeLabel(this.infoName, labelTexture(this.scene, upper(t('tl_' + this.focus)), infoStyle(st === 'owned'))).setOrigin(0, this.infoName.originY);
    this.infoName.setScale(Math.min(1, 400 / this.infoName.width));
    this.infoDesc.setText(st === 'locked' && tl.req ? `${t('td_' + this.focus)}\n${t('needs', { name: t('tl_' + tl.req) })}` : t('td_' + this.focus));
    this.infoDesc.setScale(Math.min(1, 62 / this.infoDesc.height));
    if (st === 'owned') {
      this.buyBtn.setText(t('ownedTalent')).setSub('').setColor(NODE_COLOR.owned).setEnabled(false);
      this.buyGem.setVisible(false);
    } else {
      this.buyBtn.setText(t('unlock')).setSub(String(tl.cost), { color: st === 'ok' ? '#fff3c4' : '#c0c8dc' }).setColor(AMETHYST).setEnabled(st === 'ok');
      const sub = this.buyBtn.sub!;
      const w = sub.width * sub.scaleX + 30;
      this.buyGem.setVisible(true).setAlpha(st === 'ok' ? 1 : 0.6).setPosition(-w / 2 + 12, sub.y);
      sub.setX(-w / 2 + 30 + (sub.width * sub.scaleX) / 2);
    }
    this.resetBtn.setText(this.resetArmed ? t('sure') : t('reset')).setColor(this.resetArmed ? ARMED_COLOR : RESET_COLOR).setEnabled(m.talents.length > 0);
  }

  private tryBuy(): void {
    const id = this.focus;
    const st = buyState(this.meta, id);
    const n = this.nodes.find((q) => q.id === id)!;
    if (st !== 'ok') {
      this.o.sfx('error', 0.4);
      this.scene.tweens.add({ targets: n.box, x: { from: n.box.x - 8, to: n.box.x }, duration: 260, ease: 'Elastic.easeOut', easeParams: [1.4, 0.25] });
      if (st === 'poor') this.flash(t('notEnoughShards'));
      return;
    }
    buy(this.meta, id);
    this.resetArmed = false;
    this.o.sfx('talent', 0.75);
    this.o.onChange();
    // shards fly from the counter into the talent, which pops
    for (let i = 0; i < 6; i++) {
      const s = this.scene.add.image(this.shardChip.x - 70, this.shardChip.y, shardIcon()).setDisplaySize(30, 30);
      this.root.add(s);
      this.scene.tweens.add({ targets: s, x: n.box.x + (Math.random() - 0.5) * 40, y: n.box.y + (Math.random() - 0.5) * 30, duration: 380 + i * 50, delay: i * 30, ease: 'Cubic.easeIn', onComplete: () => s.destroy() });
    }
    this.scene.time.delayedCall(420, () => {
      if (this.closed) return;
      this.scene.tweens.add({ targets: n.box, scale: 1.18, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
      const ring = this.scene.add.image(n.box.x, n.box.y, haloTexture(this.scene)).setTint(0x7dffa0);
      this.root.add(ring);
      this.scene.tweens.add({ targets: ring, scale: 1.35, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
      this.o.sfx('star', 0.5);
    });
    this.draw();
  }

  private reset(): void {
    if (!this.meta.talents.length) return;
    if (!this.resetArmed) { this.resetArmed = true; this.o.sfx('move', 0.5); this.draw(); return; }
    this.resetArmed = false;
    const back = resetTalents(this.meta);
    this.o.sfx('refund', 0.7);
    this.o.onChange();
    this.flash(t('refunded', { n: back }), '#f0d0ff');
    this.scene.tweens.add({ targets: this.shardChip, scale: 1.2, duration: 120, yoyo: true });
    this.draw();
  }

  private flash(s: string, color = '#ffb0a0'): void {
    const p = txt(this.scene, this.scene.scale.width / 2, 1000, s, { size: 26, color, strokeThickness: 5 });
    this.root.add(p);
    this.scene.tweens.add({ targets: p, y: 960, alpha: 0, delay: 700, duration: 500, onComplete: () => p.destroy() });
  }

  /** Keyboard: arrows move, Enter unlocks, Backspace resets (twice), Esc / T close. */
  key(code: string): void {
    if (this.closed) return;
    const tl = TALENT[this.focus];
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[code]) {
      const c = Phaser.Math.Clamp(tl.col + move[code][0], 0, 2), r = Phaser.Math.Clamp(tl.row + move[code][1], 0, 3);
      const to = TALENTS.find((q) => q.col === c && q.row === r);
      if (to) this.setFocus(to.id);
      return;
    }
    if (code === 'Enter' || code === 'Space') this.tryBuy();
    else if (code === 'Backspace' || code === 'Delete') this.reset();
    else if (code === 'Escape' || code === 'KeyT') this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.o.sfx('move', 0.4);
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 160, onComplete: () => this.root.destroy() });
    this.o.onClose();
  }

  /** Test hook. */
  testFocus(id: TalentId): void { this.setFocus(id, false); }
}

