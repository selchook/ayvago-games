// Snow Express: the Journey map, opened from the menu (the menu waits paused under it). Three
// chapter cards with their eight levels (stars earned under each, locked ones with a padlock and
// what opens them) and the Holiday Rush card. Touch, mouse and keyboard (arrows move, Enter plays,
// Esc goes back).
// It wears the menu theme (theme.ts): a night sky with the railway round the screen, the chapters
// and the Rush on frosty postcards, the levels and buttons on ice plates, every word in Baloo 2.
// Everything it shows is painted under the Ayvago intro (`prebakeMap`, from main.ts), so opening
// it only places images.
import Phaser from 'phaser';
import {
  t, playSfx, getBest, themeCard, skinTexture, labelTexture, SKIN_PAD, bake, bakeButton, bakeFmt, bakePara,
  glyphAtlas, labelAt, fitWidth, GlyphText, FmtLine, Para, KitButton,
} from '@core';
import { frameBorder } from '@core/menu-theme';
import { CHAPTERS } from './levels';
import { loadMeta, saveMeta, levelOpen, chapterOpen, totalStars, type Meta } from './meta';
import { makeArt } from './ui';
import { fmt } from './PlayScene';
import { ICE, RED, NAVY, MAP_CARD, RUSH_CARD } from './theme';

const CARD_W = MAP_CARD.w, CARD_H = MAP_CARD.h;
const CARD_Y = [272, 556, 840];
const RUSH_Y = 1080;
const TILE_W = 120, TILE_H = 62;
const GREEN = 0x2f9f5a, SLATE = 0x6a7aa0;
/** The chapters' ink on the postcards. */
const CH_INK = ['#1f4f9a', '#17676a', '#5a3f9a'];

// the styles (shared with the prebake, so the painted keys match)
const TITLE = { size: 56, fill: ['#ffd0d0', '#ef3b47', '#a3121f'], stroke: '#ffffff', strokeWidth: 9 };
const TOTAL = { size: 30, color: '#ffffff', stroke: NAVY };
const HEAD = (ci: number) => ({ size: 30, color: CH_INK[ci], stroke: null, shadow: false });
const COUNT = { size: 26, color: NAVY, stroke: null, shadow: false };
const NUM = { size: 36, color: '#ffffff', stroke: NAVY, strokeWidth: 6 };
const TIP = { size: 30, color: '#ffe9a0', stroke: NAVY, strokeWidth: 7 };
const RUSH_HEAD = { size: 36, color: '#c8202e', stroke: null, shadow: false };
const BODY = { size: 19, color: '#16325a', stroke: null, shadow: false, body: true };
const BEST = { size: 21, color: NAVY, stroke: null, shadow: false, body: true };
const BTN = { size: 32 };

const header = (ci: number): string => t('chapterN', { n: ci + 1 }) + ' · ' + t('ch' + ci);

/** Paints the map's every texture in the current language (Boot, under the Ayvago intro). */
export function prebakeMap(scene: Phaser.Scene): void {
  skyTexture(scene);
  labelTexture(scene, t('mapTitle'), TITLE);
  CHAPTERS.forEach((ch, ci) => {
    labelTexture(scene, header(ci), HEAD(ci));
    if (ch.need) labelTexture(scene, t('needStars', { n: ch.need }), TIP);
  });
  for (const o of [TOTAL, COUNT, NUM]) glyphAtlas(scene, o);
  labelTexture(scene, t('rush'), RUSH_HEAD);
  bakePara(scene, t('rushDesc'), BODY, 400);
  bakeFmt(scene, 'rushBest', ['n'], BEST);
  for (const k of ['playIt', 'back']) labelTexture(scene, t(k), BTN);
  bakeButton(scene, 'button', TILE_W, TILE_H, ICE);
  bakeButton(scene, 'button', TILE_W, TILE_H, GREEN, false, true);
  bakeButton(scene, 'button', TILE_W, TILE_H, SLATE, true);
  bakeButton(scene, 'button', 190, 70, RED);
  bakeButton(scene, 'button', 300, 76, ICE);
  bakeButton(scene, 'plate', 220, 58, ICE);
}

/** The night sky behind the map: deep blue to the horizon's glow (a small gradient, scaled up). */
function skyTexture(scene: Phaser.Scene): string {
  return bake(scene, 'se-map-sky', 8, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#081028'); g.addColorStop(0.55, '#10245a'); g.addColorStop(1, '#1d3f7a');
    c.fillStyle = g; c.fillRect(0, 0, 8, 128);
  });
}

interface Cell { id: number | 'rush'; x: number; y: number; open: boolean; box: Phaser.GameObjects.Container }

export class MapScene extends Phaser.Scene {
  private meta!: Meta;
  private cells: Cell[] = [];
  private cursor = 0;
  private sel!: Phaser.GameObjects.Graphics;
  private closed = false;
  private from = 'Menu';
  private root!: Phaser.GameObjects.Container;

  constructor() { super('Map'); }

  create(data: { from?: string }): void {
    this.from = data?.from ?? 'Menu';
    this.meta = loadMeta();
    this.closed = false;
    this.cells = [];
    makeArt(this);
    const { width, height } = this.scale;
    this.root = this.add.container(0, 0);
    const shade = this.add.image(0, 0, skyTexture(this)).setOrigin(0).setDisplaySize(width, height).setInteractive();
    this.root.add(shade);
    this.root.add(frameBorder(this));
    this.root.add(fitWidth(labelAt(this, width / 2, 58, t('mapTitle'), TITLE), width - 120));
    // the stars won so far, on an ice plate
    const total = totalStars(this.meta);
    const plate = this.add.container(width / 2, 120);
    plate.add(this.add.image(0, SKIN_PAD / 2, skinTexture(this, 'plate', 220, 58, 'up', ICE)));
    const totalTxt = new GlyphText(this, 0, 0, `${total}/72`, TOTAL, 0);
    const rowW = 34 + 10 + totalTxt.textWidth;
    totalTxt.setX(-rowW / 2 + 44);
    plate.add([this.add.image(-rowW / 2 + 17, 0, 'icon-star').setDisplaySize(34, 34).setTint(0xffd23f), totalTxt]);
    this.root.add(plate);

    CHAPTERS.forEach((ch, ci) => {
      const y = CARD_Y[ci];
      const open = chapterOpen(this.meta, ch.id);
      const card = this.add.container(width / 2, y);
      const face = themeCard(this, 0, 0, CARD_W, CARD_H);
      // a chapter still locked is iced over
      if (!open) face.setTint(0xb4c4dc);
      card.add(face);
      const hy = -CARD_H / 2 + 33;
      card.add(fitWidth(labelAt(this, -CARD_W / 2 + 30, hy, header(ci), HEAD(ci), 0), CARD_W - 230));
      const got = ch.levels.reduce((s, id) => s + (this.meta.stars[id] ?? 0), 0);
      if (open) {
        card.add(this.add.image(CARD_W / 2 - 112, hy, 'icon-star').setDisplaySize(28, 28).setTint(0xf2b81c));
        card.add(new GlyphText(this, CARD_W / 2 - 94, hy, `${got}/24`, COUNT, 0));
      } else {
        // what opens it: a padlock and the stars it needs
        card.add(this.add.image(CARD_W / 2 - 38, hy, 'icon-star').setDisplaySize(28, 28).setTint(0xf2b81c));
        const need = new GlyphText(this, CARD_W / 2 - 58, hy, String(ch.need), COUNT, 1);
        card.add(need);
        card.add(this.add.image(need.x - need.textWidth - 20, hy, 'icon-locked').setDisplaySize(28, 28).setTint(0x16325a));
      }
      this.root.add(card);
      ch.levels.forEach((id, k) => {
        const col = k % 4, row = Math.floor(k / 4);
        const x = width / 2 - 234 + col * 156, yy = y - 40 + row * 100;
        const lvOpen = open && levelOpen(this.meta, id);
        const cur = this.meta.mode === 'journey' && this.meta.level === id;
        const box = new KitButton(this, x, yy, { w: TILE_W, h: TILE_H, color: lvOpen ? (cur ? GREEN : ICE) : SLATE, on: cur, tapWhenOff: true, sfx: null }, () => this.choose(this.cells.findIndex((q) => q.id === id)));
        if (!lvOpen) box.setEnabled(false);
        if (lvOpen) box.addContent(new GlyphText(this, 0, -2, String(id), NUM));
        else box.addContent(this.add.image(0, -2, 'icon-locked').setDisplaySize(34, 34).setAlpha(0.85));
        const st = this.meta.stars[id] ?? 0;
        for (let s = 0; s < 3; s++) box.add(this.add.image(-26 + s * 26, 44, 'icon-star').setDisplaySize(24, 24).setTint(s < st ? 0xf2b81c : 0xbccbe0));
        // the whole cell (the stars too) takes the tap
        box.setHit(154, 100, 0, 12);
        this.root.add(box);
        this.cells.push({ id, x, y: yy, open: lvOpen, box });
      });
    });

    // Holiday Rush
    const rush = this.add.container(width / 2, RUSH_Y);
    rush.add(themeCard(this, 0, 0, RUSH_CARD.w, RUSH_CARD.h));
    if (this.meta.mode === 'rush') rush.add(this.add.graphics().lineStyle(5, 0xffc93a, 1).strokeRoundedRect(-CARD_W / 2 - 4, -RUSH_CARD.h / 2 - 4, CARD_W + 8, RUSH_CARD.h + 8, 26));
    rush.add(fitWidth(labelAt(this, -CARD_W / 2 + 30, -40, t('rush'), RUSH_HEAD, 0), 380));
    rush.add(new Para(this, -CARD_W / 2 + 30, -18, t('rushDesc'), BODY, 400, 0, 23));
    const best = getBest('snow-express');
    rush.add(new FmtLine(this, CARD_W / 2 - 120, -40, BEST, 0.5).set('rushBest', { n: fmt(best) }));
    const go = new KitButton(this, CARD_W / 2 - 120, 24, { w: 190, h: 70, color: RED, label: t('playIt'), style: BTN, sfx: null }, () => this.choose(this.cells.length - 1));
    rush.add(go);
    this.root.add(rush);
    this.cells.push({ id: 'rush', x: width / 2 + CARD_W / 2 - 120, y: RUSH_Y + 24, open: true, box: rush });

    const back = new KitButton(this, width / 2, 1214, { w: 300, h: 76, color: ICE, label: t('back'), style: BTN }, () => this.close());
    this.root.add(back);

    this.sel = this.add.graphics();
    this.root.add(this.sel);
    this.cursor = Math.max(0, this.cells.findIndex((c) => (this.meta.mode === 'rush' ? c.id === 'rush' : c.id === this.meta.level)));
    this.drawCursor();
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.closed) return;
      const n = this.cells.length;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move(1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.move(this.cursor >= n - 5 ? n - 1 - this.cursor : 4);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') this.move(this.cursor === n - 1 ? -4 : -4);
      else if (e.code === 'Enter' || e.code === 'Space') this.choose(this.cursor);
      else if (e.code === 'Escape' || e.code === 'Backspace') this.close();
    });
    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 160 });
  }

  private move(d: number): void {
    this.cursor = Phaser.Math.Clamp(this.cursor + d, 0, this.cells.length - 1);
    playSfx(this, 'tick', { volume: 0.3 });
    this.drawCursor();
  }

  private drawCursor(): void {
    const c = this.cells[this.cursor];
    const g = this.sel.clear();
    if (!c) return;
    const w = c.id === 'rush' ? 206 : 134, h = c.id === 'rush' ? 86 : 76;
    g.lineStyle(5, 0xffd23f, 1).strokeRoundedRect(c.x - w / 2, c.y - h / 2, w, h, 24);
  }

  private choose(i: number): void {
    const c = this.cells[i];
    if (!c || this.closed) return;
    this.cursor = i;
    this.drawCursor();
    if (!c.open) {
      playSfx(this, 'error', { volume: 0.4 });
      this.tweens.add({ targets: c.box, x: c.box.x + 8, duration: 50, yoyo: true, repeat: 2 });
      // a locked chapter says what opens it
      const ch = CHAPTERS.find((q) => typeof c.id === 'number' && q.levels.includes(c.id));
      if (ch && !chapterOpen(this.meta, ch.id)) {
        const tip = labelAt(this, this.scale.width / 2, c.y - 70, t('needStars', { n: ch.need }), TIP);
        this.root.add(tip);
        this.tweens.add({ targets: tip, y: tip.y - 30, alpha: 0, delay: 900, duration: 400, onComplete: () => tip.destroy() });
      }
      return;
    }
    if (c.id === 'rush') this.meta.mode = 'rush';
    else { this.meta.mode = 'journey'; this.meta.level = c.id; }
    saveMeta(this.meta);
    playSfx(this, 'ui-select');
    this.closed = true;
    this.scene.stop(this.from);
    this.scene.start('Play');
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.tweens.add({
      targets: this.root, alpha: 0, duration: 150, onComplete: () => {
        this.scene.stop();
        this.scene.resume(this.from);
        this.scene.get(this.from).events.emit('map-closed');
      },
    });
  }

  /** Test hook: plays a level (or 'rush'). */
  testChoose(id: number | 'rush'): void { this.choose(this.cells.findIndex((c) => c.id === id)); }
}
