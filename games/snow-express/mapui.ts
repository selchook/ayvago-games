// Snow Express: the Journey map, opened from the menu (the menu waits paused under it). Three
// chapter cards with their eight levels (stars earned under each, locked ones with a padlock and
// what opens them) and the Holiday Rush card. Touch, mouse and keyboard (arrows move, Enter plays,
// Esc goes back).
import Phaser from 'phaser';
import { txt, t, playSfx, getBest, isEasy } from '@core';
import { CHAPTERS, LEVELS } from './levels';
import { loadMeta, saveMeta, levelOpen, chapterOpen, totalStars, type Meta } from './meta';
import { glass, Pill, makeArt } from './ui';
import { fmt } from './PlayScene';

const CARD_W = 660, CARD_H = 262;
const CARD_Y = [272, 556, 840];
const RUSH_Y = 1080;

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
    const shade = this.add.rectangle(0, 0, width, height, 0x0a1230, 1).setOrigin(0).setInteractive();
    this.root.add(shade);
    this.root.add(txt(this, width / 2, 56, t('mapTitle'), { title: true, size: 44, color: '#ffd23f', strokeThickness: 9 }));
    const total = totalStars(this.meta);
    const starRow = this.add.container(width / 2, 108);
    const totalTxt = txt(this, 0, 0, `${total}/72`, { title: true, size: 26, color: '#ffffff', strokeThickness: 5 }).setOrigin(0, 0.5);
    const rowW = 34 + 10 + totalTxt.width;
    totalTxt.setX(-rowW / 2 + 44);
    starRow.add([this.add.image(-rowW / 2 + 17, 0, 'icon-star').setDisplaySize(34, 34).setTint(0xffd23f), totalTxt]);
    this.root.add(starRow);

    CHAPTERS.forEach((ch, ci) => {
      const y = CARD_Y[ci];
      const open = chapterOpen(this.meta, ch.id);
      const card = this.add.container(width / 2, y);
      card.add(glass(this, CARD_W, CARD_H, { color: [0x1f3a6e, 0x1d4c6e, 0x3a2f6e][ci], alpha: 0.95 }));
      const got = ch.levels.reduce((s, id) => s + (this.meta.stars[id] ?? 0), 0);
      card.add(txt(this, -CARD_W / 2 + 26, -CARD_H / 2 + 30, t('chapterN', { n: ci + 1 }) + ' · ' + t('ch' + ci), { title: true, size: 26, color: '#ffffff', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      if (open) {
        card.add(this.add.image(CARD_W / 2 - 110, -CARD_H / 2 + 30, 'icon-star').setDisplaySize(26, 26).setTint(0xffd23f));
        card.add(txt(this, CARD_W / 2 - 92, -CARD_H / 2 + 31, `${got}/24`, { title: true, size: 22, color: '#ffe9a0', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
      } else {
        // a locked chapter shows what opens it in its header: a padlock and the stars it needs
        const hy = -CARD_H / 2 + 30;
        card.add(this.add.image(CARD_W / 2 - 36, hy, 'icon-star').setDisplaySize(26, 26).setTint(0xffd23f));
        const need = txt(this, CARD_W / 2 - 54, hy + 1, String(ch.need), { title: true, size: 22, color: '#ffe9a0', strokeThickness: 0, shadow: false }).setOrigin(1, 0.5);
        card.add(need);
        card.add(this.add.image(need.x - need.width - 20, hy, 'icon-locked').setDisplaySize(26, 26));
      }
      this.root.add(card);
      ch.levels.forEach((id, k) => {
        const col = k % 4, row = Math.floor(k / 4);
        const x = width / 2 - 234 + col * 156, yy = y - 30 + row * 108;
        const lvOpen = open && levelOpen(this.meta, id);
        const box = this.add.container(x, yy);
        const g = this.add.graphics();
        const cur = this.meta.mode === 'journey' && this.meta.level === id;
        const c = lvOpen ? (cur ? 0x2f9f5a : 0x2f7fd8) : 0x46507a;
        g.fillStyle(0x000000, 0.3).fillRoundedRect(-60, -34, 120, 70, 22);
        g.fillStyle(c, 1).fillRoundedRect(-60, -38, 120, 70, 22);
        g.fillStyle(0xffffff, 0.16).fillRoundedRect(-55, -34, 110, 26, 12);
        if (cur) g.lineStyle(3, 0xffd23f, 1).strokeRoundedRect(-60, -38, 120, 70, 22);
        box.add(g);
        if (lvOpen) box.add(txt(this, 0, -4, String(id), { title: true, size: 32, color: '#ffffff', strokeThickness: 0, shadow: false }));
        else box.add(this.add.image(0, -4, 'icon-locked').setDisplaySize(34, 34).setAlpha(0.8));
        const st = this.meta.stars[id] ?? 0;
        for (let s = 0; s < 3; s++) box.add(this.add.image(-26 + s * 26, 46, 'icon-star').setDisplaySize(24, 24).setTint(s < st ? 0xffd23f : 0x3a4266));
        box.setSize(140, 110).setInteractive({ useHandCursor: true });
        box.on('pointerup', () => this.choose(this.cells.findIndex((q) => q.id === id)));
        this.root.add(box);
        this.cells.push({ id, x, y: yy, open: lvOpen, box });
      });
    });

    // Holiday Rush
    const rush = this.add.container(width / 2, RUSH_Y);
    rush.add(glass(this, CARD_W, 160, { color: 0x6e1f3a, alpha: 0.95, rim: this.meta.mode === 'rush' ? 0xffd23f : undefined }));
    rush.add(txt(this, -CARD_W / 2 + 26, -50, t('rush'), { title: true, size: 30, color: '#ffd23f', strokeThickness: 0, shadow: false }).setOrigin(0, 0.5));
    rush.add(txt(this, -CARD_W / 2 + 26, -24, t('rushDesc'), { size: 19, color: '#ffe4ee', strokeThickness: 0, shadow: false, wrap: 400 }).setOrigin(0, 0).setAlign('left'));
    const best = getBest('snow-express');
    rush.add(txt(this, CARD_W / 2 - 120, -46, t('rushBest', { n: fmt(best) }), { size: 20, color: '#ffffff', strokeThickness: 0, shadow: false }));
    const go = new Pill(this, CARD_W / 2 - 120, 22, 190, 70, 0xe8453c, () => this.choose(this.cells.length - 1), 26);
    go.setLabels(t('playIt'));
    rush.add(go);
    this.root.add(rush);
    this.cells.push({ id: 'rush', x: width / 2 + CARD_W / 2 - 120, y: RUSH_Y + 22, open: true, box: rush });
    void isEasy;

    const back = new Pill(this, width / 2, 1218, 300, 76, 0x3b4466, () => this.close(), 26);
    back.setLabels(t('back'));
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
    const w = c.id === 'rush' ? 206 : 132, h = c.id === 'rush' ? 86 : 84;
    g.lineStyle(5, 0xffd23f, 1).strokeRoundedRect(c.x - w / 2, c.y - h / 2 - (c.id === 'rush' ? 0 : 4), w, h, 26);
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
        const tip = txt(this, this.scale.width / 2, c.y - 70, t('needStars', { n: ch.need }), { title: true, size: 26, color: '#ffe9a0', strokeThickness: 7 });
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
