import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';

const BLOCK_H = 56;
const START_W = 420;
const MAX_W = 420;
const PERFECT = 9;          // px tolerance for a perfect drop
const GROW = 18;            // px regained per perfect drop once the streak is 3+
const FLOORS_PER_LEVEL = 10;
const MAX_LIVES = 3;
const MERCY_W = 160;       // after a miss the top block is rebuilt to at least this width
const ARM_TIME = 0.35;      // a fresh block can't be dropped instantly (stops accidental double taps)
const SKY = [0x7ec8f5, 0x9d92ee, 0xe98aa6, 0x6a3f9a, 0x251a52, 0x0b0820];

/** Block colour for floor n: a slow hue walk so the tower looks like a rainbow. */
export function blockColor(n: number): number {
  const h = (0.02 + n * 0.031) % 1;
  return Phaser.Display.Color.HSVToRGB(h, 0.62, 0.96).color as number;
}

interface Block {
  x: number;
  y: number;
  w: number;
  c: Phaser.GameObjects.Container;
}


/** Screen flash that never fully covers the view (the core camera flash starts opaque). */
function softFlash(scene: Phaser.Scene, color: number, ms = 120): void {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(0, 0, width, height, color, 0.4).setOrigin(0).setScrollFactor(0).setDepth(8000);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms * 2, onComplete: () => r.destroy() });
}

export class PlayScene extends ArcadeScene {
  private stack: Block[] = [];
  private cur!: Block;
  private dir = 1;
  private speed = 300;
  private floors = 0;
  private level = 1;
  private streak = 0;
  private dead = false;
  private lives = MAX_LIVES;
  private armT = 0;
  private hearts: Phaser.GameObjects.Image[] = [];
  private started = false;
  private bigNum!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private stars!: Phaser.GameObjects.TileSprite;
  private clouds: Phaser.GameObjects.Ellipse[] = [];

  createGame(): void {
    const { width, height } = this.scale;
    this.stack = []; this.clouds = [];
    this.dir = 1; this.speed = 300; this.floors = 0; this.level = 1; this.streak = 0;
    this.dead = false; this.started = false;
    this.lives = MAX_LIVES; this.armT = 0; this.hearts = [];
    const cam = this.cameras.main;
    cam.setScroll(0, 0).setBackgroundColor(SKY[0]);
    ensurePixel(this);

    if (!this.textures.exists('st-stars')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < 50; i++) {
        g.fillStyle(0xffffff, rng.int(40, 100) / 100);
        const s = rng.chance(0.2) ? 4 : 2;
        g.fillRect(rng.int(0, 254), rng.int(0, 254), s, s);
      }
      g.generateTexture('st-stars', 256, 256);
      g.destroy();
    }
    this.stars = this.add.tileSprite(0, 0, width, height, 'st-stars').setOrigin(0).setScrollFactor(0).setDepth(-20).setAlpha(0);
    for (let i = 0; i < 7; i++) {
      const cl = this.add.ellipse(rng.int(0, width), height - 300 - i * 420, rng.int(160, 260), rng.int(44, 70), 0xffffff, 0.35)
        .setDepth(-15);
      this.clouds.push(cl);
    }

    // ground + plinth
    this.add.rectangle(width / 2, height - 40, width, 120, 0x2f6b3a).setDepth(-5);
    this.add.rectangle(width / 2, height - 98, width, 10, 0x4caf50).setDepth(-5);
    const baseY = height - 100 - BLOCK_H / 2;
    const base = this.makeBlock(width / 2, baseY, START_W, 0x4b4b5c);
    this.stack.push(base);

    this.bigNum = txt(this, width / 2, 210, '0', { title: true, size: 80, color: '#ffffff', strokeThickness: 0, shadow: false })
      .setScrollFactor(0).setDepth(50).setAlpha(0.9);
    this.hint = txt(this, width / 2, 330, t('tapDrop'), { size: 34 }).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    if (!this.textures.exists('st-heart')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (const [key, fill] of [['st-heart', 0xec3013], ['st-heart-empty', 0x3a3550]] as const) {
        g.clear();
        g.fillStyle(0x000000).fillCircle(11, 13, 11).fillCircle(29, 13, 11).fillTriangle(1, 18, 39, 18, 20, 38);
        g.fillStyle(fill).fillCircle(11, 13, 8).fillCircle(29, 13, 8).fillTriangle(4, 16, 36, 16, 20, 34);
        g.generateTexture(key, 40, 40);
      }
      g.destroy();
    }
    for (let i = 0; i < MAX_LIVES; i++) {
      this.hearts.push(this.add.image(width - 150 - (MAX_LIVES - 1 - i) * 42, 88, 'st-heart').setScale(0.9).setScrollFactor(0).setDepth(9000));
    }

    this.spawnNext();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;     // pause button
      this.drop();
    });
    for (const k of ['SPACE', 'ENTER']) {
      this.input.keyboard?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.drop(); });
    }
    this.updateHud();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('level')} ${this.level}`);
    this.bigNum.setText(String(this.floors));
    this.hearts.forEach((h, i) => h.setTexture(i < this.lives ? 'st-heart' : 'st-heart-empty'));
  }

  private makeBlock(x: number, y: number, w: number, color: number): Block {
    const key = ensurePixel(this);
    const col = Phaser.Display.Color.IntegerToColor(color);
    const light = col.clone().lighten(18).color;
    const dark = col.clone().darken(22).color;
    const frameCol = col.clone().darken(42).color;
    const c = this.add.container(x, y);
    const frame = this.add.image(0, 0, key).setDisplaySize(w, BLOCK_H).setTint(frameCol);
    const body = this.add.image(0, 0, key).setDisplaySize(Math.max(1, w - 8), BLOCK_H - 8).setTint(color);
    const top = this.add.image(0, -BLOCK_H / 2 + 8, key).setDisplaySize(Math.max(1, w - 8), 8).setTint(light);
    const bot = this.add.image(0, BLOCK_H / 2 - 8, key).setDisplaySize(Math.max(1, w - 8), 8).setTint(dark);
    c.add([frame, body, top, bot]);
    return { x, y, w, c };
  }

  private spawnNext(): void {
    const { width } = this.scale;
    const top = this.stack[this.stack.length - 1];
    const y = top.y - BLOCK_H;
    this.dir = this.floors % 2 === 0 ? 1 : -1;
    // the new block appears just clear of the tower and slides across it
    const x = Phaser.Math.Clamp(top.x - this.dir * (top.w + 30), width / 2 - 330, width / 2 + 330);
    this.cur = this.makeBlock(x, y, top.w, blockColor(this.floors + 1));
    this.cur.c.setAlpha(0);
    this.tweens.add({ targets: this.cur.c, alpha: 1, duration: 150 });
    this.armT = ARM_TIME;
    // speed ramps per floor; later levels add a random wobble so the rhythm can't be memorised
    const base = Math.min(860, 300 + this.floors * 11);
    this.speed = this.level >= 3 ? base * rng.int(85, 118) / 100 : base;
  }

  private drop(): void {
    if (this.dead || this.isOver || this.armT > 0) return;
    if (!this.started) {
      this.started = true;
      this.tweens.killTweensOf(this.hint);
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 200 });
    }
    const top = this.stack[this.stack.length - 1];
    const cur = this.cur;
    const dx = cur.x - top.x;
    const overlap = top.w - Math.abs(dx);

    if (overlap <= 0) {
      this.miss(cur);
      return;
    }

    let nx: number, nw: number;
    let perfect = false;
    if (Math.abs(dx) <= PERFECT) {
      perfect = true;
      this.streak++;
      nx = top.x;
      nw = top.w;
      if (this.streak >= 3) nw = Math.min(MAX_W, nw + GROW);
    } else {
      this.streak = 0;
      nx = top.x + dx / 2;
      nw = overlap;
      // the overhang becomes a falling slice
      const cw = Math.abs(dx);
      const cx = dx > 0 ? nx + nw / 2 + cw / 2 : nx - nw / 2 - cw / 2;
      const slice = this.makeBlock(cx, cur.y, cw, blockColor(this.floors + 1));
      this.tweens.add({
        targets: slice.c, y: cur.y + 900, x: cx + Math.sign(dx) * 140, angle: Math.sign(dx) * rng.int(60, 140), alpha: 0,
        duration: 1100, ease: 'Quad.easeIn', onComplete: () => slice.c.destroy(),
      });
      this.sfxAt('cut', cx, { volume: 0.5 });
      shake(this, 0.004, 100);
    }

    cur.c.destroy();
    const placed = this.makeBlock(nx, cur.y, nw, blockColor(this.floors + 1));
    this.stack.push(placed);
    this.floors++;

    // juice: squash + dust
    placed.c.setScale(1.04, 0.8);
    this.tweens.add({ targets: placed.c, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
    burst(this, nx - nw / 2, cur.y + BLOCK_H / 2, [0xffffff, blockColor(this.floors)], 8, 160);
    burst(this, nx + nw / 2, cur.y + BLOCK_H / 2, [0xffffff, blockColor(this.floors)], 8, 160);
    this.sfxAt(rng.pick(['place1', 'place2', 'place3']), nx, { volume: 0.55 });

    if (perfect) {
      const bonus = 10 * Math.min(this.streak, 10);
      this.addScore(10 + bonus);
      // one step up the scale per perfect in a row
      this.sfxAt('perfect', nx, { volume: 0.5, rate: 2 ** (Math.min(this.streak - 1, 8) * 1.5 / 12), exact: true });
      const ring = this.add.rectangle(nx, cur.y, nw + 8, BLOCK_H + 8).setStrokeStyle(6, 0xffffff, 1);
      this.tweens.add({ targets: ring, scaleX: 1.25, scaleY: 1.8, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
      popup(this, nx, cur.y - 60, `${t('perfect')} x${this.streak}`, '#ffffff', 26);
      if (this.streak >= 3 && nw > top.w) {
        this.sfxAt('grow', nx, { volume: 0.45 });
        popup(this, nx, cur.y - 110, t('grow'), '#5dff7a', 22);
        burst(this, nx, cur.y, [0x5dff7a, 0xffffff], 20, 300);
      }
    } else {
      this.addScore(10);
    }

    if (this.floors % FLOORS_PER_LEVEL === 0) this.levelUp();
    this.updateHud();
    this.tweens.add({ targets: this.bigNum, scale: 1.25, duration: 80, yoyo: true });

    // camera climbs so the top of the tower sits in the upper middle
    const { height } = this.scale;
    const targetScroll = Math.min(0, placed.y - height * 0.58);
    this.tweens.add({ targets: this.cameras.main, scrollY: targetScroll, duration: 350, ease: 'Sine.easeOut' });
    this.spawnNext();
  }

  private levelUp(): void {
    const { width, height } = this.scale;
    this.level++;
    this.addScore(50 * this.level);
    this.sfx('level', { volume: 0.6, exact: true });
    softFlash(this, 0xffffff, 100);
    const b = txt(this, width / 2, height * 0.42, `${t('level')} ${this.level}`, { title: true, size: 46, color: '#ffd23f' })
      .setScrollFactor(0).setDepth(60).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 900, duration: 400, onComplete: () => b.destroy() });
  }

  private miss(cur: Block): void {
    this.dead = true;
    this.streak = 0;
    this.lives--;
    this.sfxAt('miss', cur.c.x, { volume: 0.55 });
    this.tweens.add({
      targets: cur.c, y: cur.y + 1100, angle: this.dir * 160, duration: 1100, ease: 'Quad.easeIn',
      onComplete: () => { this.sfxAt('crash', cur.c.x, { volume: 0.6 }); cur.c.destroy(); },
    });
    shake(this, 0.02, 350);
    softFlash(this, 0xec3013, 150);
    // the tower wobbles
    this.stack.slice(-6).forEach((b, i) => {
      this.tweens.add({ targets: b.c, angle: (i % 2 ? 2 : -2), duration: 90, yoyo: true, repeat: 3 });
    });
    this.updateHud();
    this.tweens.add({ targets: this.hearts[Math.max(0, this.lives)], scale: 1.5, duration: 120, yoyo: true });
    if (this.lives <= 0) {
      this.endGame({ title: t('down'), delay: 1300 });
      return;
    }
    // try again on the same floor; a too-thin top block is patched up so the retry is fair
    this.time.delayedCall(700, () => {
      if (this.isOver) return;
      const top = this.stack[this.stack.length - 1];
      if (top.w < MERCY_W && this.stack.length > 1) {
        const { width } = this.scale;
        const nx = Phaser.Math.Clamp(top.x, MERCY_W / 2 + 20, width - MERCY_W / 2 - 20);
        const fixed = this.makeBlock(nx, top.y, MERCY_W, blockColor(this.stack.length - 1));
        fixed.c.setScale(top.w / MERCY_W, 1);
        top.c.destroy();
        this.stack[this.stack.length - 1] = fixed;
        this.tweens.add({ targets: fixed.c, scaleX: 1, duration: 300, ease: 'Back.easeOut' });
        burst(this, nx, top.y, [0x5dff7a, 0xffffff], 16, 240);
        this.sfxAt('grow', nx, { volume: 0.45 });
      }
    });
    this.time.delayedCall(1200, () => {
      if (this.isOver) return;
      this.dead = false;
      this.spawnNext();
    });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const cam = this.cameras.main;

    // sky darkens as the tower climbs
    const h = Math.min(SKY.length - 1.001, this.floors / 14);
    const i = Math.floor(h), f = h - i;
    const a = Phaser.Display.Color.IntegerToColor(SKY[i]), b = Phaser.Display.Color.IntegerToColor(SKY[i + 1]);
    const mix = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 1, f);
    cam.setBackgroundColor(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b));
    this.stars.setAlpha(Math.min(1, Math.max(0, (this.floors - 20) / 30)));
    this.stars.tilePositionY = cam.scrollY * 0.2;
    for (const cl of this.clouds) {
      cl.x += 20 * dt * (cl.width > 210 ? 1 : 0.6);
      if (cl.x > width + 150) cl.x = -150;
      if (cl.y - cam.scrollY > height + 100) cl.y -= 7 * 420;
    }

    if (this.dead) return;
    this.armT = Math.max(0, this.armT - dt);
    const cur = this.cur;
    cur.x += this.dir * this.speed * dt;
    const lim = 330;
    if (cur.x > width / 2 + lim) { cur.x = width / 2 + lim; this.dir = -1; }
    if (cur.x < width / 2 - lim) { cur.x = width / 2 - lim; this.dir = 1; }
    cur.c.x = cur.x;
  }
}
