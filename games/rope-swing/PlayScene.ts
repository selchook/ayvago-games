import Phaser from 'phaser';
import { ArcadeScene, CHARACTER_FRAME, burst, shake, flash, popup, ensurePixel, t, txt, rng, COLORS } from '@core';

/** pixel-platformer tilemap_packed frames (21 px tiles, 30 per row). */
export const F = {
  topL: 121, top: 122, top2: 123, topR: 124, fill: 152,
  rock: 332, rockEdge: 302, spike: 70, coin: 78,
};

const W = 1280, H = 720;
const S = 3, T = 21 * S;                       // tile scale and size in world px
const TOPS = [H - 2 * T, H - 3 * T];           // ground heights
const CEILS = [T, 2 * T, 3 * T];               // ceiling bottoms
const GRAV = 1900;
const ROPE_ANGLE = Phaser.Math.DegToRad(52);   // fixed firing angle above the horizontal
const ROPE_MAX = 720;
const HAND = 46;                               // hand (rope point) above the feet
const HEAD = 30;                               // head above the hand
const HALF_W = 16;
const SCREEN_X = 420;                          // hero's x on screen
const MAX_V = 1050;                            // grows to 1500 with difficulty
const HOOK_HOP = 420;                          // upward pop when the rope is fired from the ground

// The hero is the player's chosen character (pc-* textures), 76 px tall, anchored at the hand so
// it can lean along the rope while swinging.
export const HERO_SCALE = 76 / CHARACTER_FRAME.standHeight;
const HERO_ORIGIN_Y = CHARACTER_FRAME.originY - HAND / (HERO_SCALE * CHARACTER_FRAME.height);

interface Ground { x: number; w: number; top: number; spikeA: number; spikeB: number; objs: Phaser.GameObjects.GameObject[] }
interface Ceil { x: number; w: number; bottom: number; spikeA: number; spikeB: number; objs: Phaser.GameObjects.GameObject[] }
interface Coin { img: Phaser.GameObjects.Image; x: number; y: number }

export class PlayScene extends ArcadeScene {
  private hero!: Phaser.GameObjects.Sprite;
  private rope!: Phaser.GameObjects.Graphics;
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private grounds: Ground[] = [];
  private ceils: Ceil[] = [];
  private coins: Coin[] = [];
  private keys: Phaser.Input.Keyboard.Key[] = [];
  private px = 0; private py = 0; private vx = 0; private vy = 0;
  private startX = 0;
  private grounded = true;
  private attached = false;
  private ax = 0; private ay = 0; private ropeLen = 0; private ropeTarget = 0;
  private ropeShow = 0;                 // rope tip travel (0..1) for the firing animation
  private missRope: { x: number; y: number; t: number } | null = null;
  private held = false;
  private retry = 0;
  private started = false;
  private startT = 0;
  private dead = false;
  private genX = 0;
  private ceilX = 0;
  private coinCount = 0;
  private meters = 0;
  private nextMilestone = 250;
  private animT = 0;
  private lean = 0;
  private runSpeed = 340;

  createGame(): void {
    this.grounds = []; this.ceils = []; this.coins = []; this.keys = [];
    this.vx = 0; this.vy = 0; this.grounded = true; this.attached = false; this.ropeShow = 0; this.missRope = null;
    this.held = false; this.retry = 0; this.started = false; this.startT = 0; this.dead = false;
    this.coinCount = 0; this.meters = 0; this.nextMilestone = 250; this.animT = 0; this.lean = 0; this.runSpeed = 340;
    this.cameras.main.setScroll(0, 0);

    this.add.rectangle(0, 0, W, H, 0xd3f3f7).setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.bgFar = this.add.tileSprite(0, 250, W, 189, 'ppbg', 0).setOrigin(0).setTileScale(3).setScrollFactor(0).setDepth(-9);
    this.bgNear = this.add.tileSprite(0, 400, W, 189, 'ppbg', 1).setOrigin(0).setTileScale(3).setScrollFactor(0).setDepth(-8).setAlpha(0.85);
    const pit = this.add.graphics().setScrollFactor(0).setDepth(-7);
    pit.fillGradientStyle(0x3d5a1a, 0x3d5a1a, 0x0b1206, 0x0b1206, 1).fillRect(0, 560, W, 160);

    // opening stretch: flat ground, solid ceiling, nothing to fear
    this.addGround(0, 26, TOPS[0], 0, 0);
    this.genX = 26 * T;
    this.ceilX = 0;
    this.generate();

    this.startX = 5 * T;
    this.px = this.startX; this.py = TOPS[0] - HAND;
    this.rope = this.add.graphics().setDepth(19);
    this.hero = this.add.sprite(this.px, this.py, 'pc-stand').setScale(HERO_SCALE).setOrigin(0.5, HERO_ORIGIN_Y).setDepth(20);
    this.dust = this.add.particles(0, 0, ensurePixel(this), {
      speedX: { min: -120, max: -30 }, speedY: { min: -80, max: -10 }, lifespan: 380,
      scale: { start: 2.2, end: 0 }, tint: [0xc8a26a, 0x8b6a3e], emitting: false,
    }).setDepth(18);

    this.hud.setCenter(t('meters', { n: 0 }));
    this.hud.setRight(`${t('coins')} 0`);

    const go = txt(this, W / 2, H * 0.36, t('go'), { title: true, size: 64, color: '#ffd23f' }).setScrollFactor(0).setDepth(9000).setScale(0.2);
    this.tweens.add({ targets: go, scale: 1, duration: 300, ease: 'Back.easeOut', delay: 300 });
    this.tweens.add({ targets: go, alpha: 0, delay: 1300, duration: 300, onComplete: () => go.destroy() });
    const tip = txt(this, W / 2, H * 0.5, t('tutorial'), { size: 34, color: '#ffffff', strokeThickness: 6 }).setScrollFactor(0).setDepth(9000);
    this.tweens.add({ targets: tip, alpha: 0, delay: 4200, duration: 500, onComplete: () => tip.destroy() });

    const kb = this.input.keyboard;
    if (kb) for (const k of ['SPACE', 'UP', 'W', 'Z', 'ENTER']) this.keys.push(kb.addKey(k, true));
  }

  // ---------- world generation ----------

  private difficulty(): number {
    return Phaser.Math.Clamp(this.meters / 1600, 0, 1);
  }

  private addGround(x: number, tiles: number, top: number, spikeA: number, spikeB: number): Ground {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const w = tiles * T;
    objs.push(this.add.image(x, top, 'pp', F.topL).setOrigin(0).setScale(S).setDepth(5));
    if (tiles > 2) objs.push(this.add.tileSprite(x + T, top, w - 2 * T, T, 'pp', F.top).setOrigin(0).setTileScale(S).setDepth(5));
    objs.push(this.add.image(x + w - T, top, 'pp', F.topR).setOrigin(0).setScale(S).setDepth(5));
    objs.push(this.add.tileSprite(x, top + T, w, H - top, 'pp', F.fill).setOrigin(0).setTileScale(S).setDepth(5));
    for (let sx = spikeA; sx < spikeB; sx += T) objs.push(this.add.image(sx, top - T, 'pp', F.spike).setOrigin(0).setScale(S).setDepth(6));
    const g: Ground = { x, w, top, spikeA, spikeB, objs };
    this.grounds.push(g);
    return g;
  }

  private addCeil(x: number, tiles: number, bottom: number, spikeA: number, spikeB: number): void {
    const objs: Phaser.GameObjects.GameObject[] = [];
    const w = tiles * T;
    if (bottom > T) objs.push(this.add.tileSprite(x, 0, w, bottom - T, 'pp', F.rock).setOrigin(0).setTileScale(S).setDepth(5));
    for (let i = 0; i < tiles; i++) objs.push(this.add.image(x + i * T, bottom - T, 'pp', F.rockEdge).setOrigin(0).setScale(S).setFlipY(true).setDepth(5));
    for (let sx = spikeA; sx < spikeB; sx += T) objs.push(this.add.image(sx, bottom, 'pp', F.spike).setOrigin(0).setScale(S).setFlipY(true).setDepth(6));
    this.ceils.push({ x, w, bottom, spikeA, spikeB, objs });
  }

  private addCoin(x: number, y: number): void {
    const img = this.add.image(x, y, 'pp', F.coin).setScale(S).setDepth(8);
    this.tweens.add({ targets: img, scaleX: 0.6, duration: 320, yoyo: true, repeat: -1, delay: rng.int(0, 300) });
    this.coins.push({ img, x, y });
  }

  /** Is the ground solid and spike-free all the way from a to b? */
  private safeGround(a: number, b: number): boolean {
    for (let x = a; x <= b; x += 20) {
      const g = this.groundAt(x);
      if (!g || (x >= g.spikeA - 30 && x <= g.spikeB + 30)) return false;
    }
    return true;
  }

  private generate(): void {
    const camRight = this.cameras.main.scrollX + W;
    while (this.genX < camRight + 1800) {
      const d = this.difficulty();
      const last = this.grounds[this.grounds.length - 1];
      const pitTiles = rng.int(2, 3 + Math.floor(d * 8));
      const x = this.genX + pitTiles * T;
      // coins along a swing over the pit
      if (rng.chance(0.5)) {
        const n = Math.min(5, Math.max(3, pitTiles));
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          this.addCoin(this.genX + k * pitTiles * T, Math.min(last.top, TOPS[1]) - 110 - Math.sin(k * Math.PI) * 120);
        }
      }
      const tiles = rng.int(Math.max(3, 7 - Math.floor(d * 4)), 12 - Math.floor(d * 5));
      const top = rng.pick(TOPS);
      let spikeA = 0, spikeB = 0;
      if (tiles >= 5 && rng.chance(0.2 + d * 0.45)) {
        const len = rng.int(2, Math.min(tiles - 3, 2 + Math.floor(d * 5)));
        const start = rng.int(2, tiles - len - 1);
        spikeA = x + start * T; spikeB = spikeA + len * T;
      }
      this.addGround(x, tiles, top, spikeA, spikeB);
      if (!spikeA && rng.chance(0.25)) for (let i = 0; i < 3; i++) this.addCoin(x + T + i * 56, top - 60);
      if (spikeA) for (let i = 0; i < (spikeB - spikeA) / T; i++) this.addCoin(spikeA + T / 2 + i * T, top - 240);
      this.genX = x + tiles * T;
    }
    // the ceiling follows a little behind the ground, so a gap in it can check the ground below
    while (this.ceilX < this.genX - 400) {
      const d = this.difficulty();
      const tiles = rng.int(3, 8);
      const bottom = this.ceilX < 20 * T ? CEILS[1] : rng.pick(CEILS);
      let spikeA = 0, spikeB = 0;
      if (bottom <= CEILS[1] && tiles >= 4 && this.ceilX > 30 * T && rng.chance(0.15 + d * 0.3)) {
        spikeA = this.ceilX + rng.int(1, tiles - 3) * T; spikeB = spikeA + rng.int(1, 2) * T;
      }
      this.addCeil(this.ceilX, tiles, bottom, spikeA, spikeB);
      this.ceilX += tiles * T;
      // an open patch with nothing to hook on, only where the hero can run underneath
      const gap = rng.int(2, 3) * T;
      if (this.ceilX > 30 * T && rng.chance(0.15 + d * 0.2) && this.safeGround(this.ceilX - 260, this.ceilX + gap + 160)) this.ceilX += gap;
    }
  }

  private groundAt(x: number): Ground | null {
    for (const g of this.grounds) if (x >= g.x && x <= g.x + g.w) return g;
    return null;
  }

  private ceilAt(x: number): Ceil | null {
    for (const c of this.ceils) if (x >= c.x && x <= c.x + c.w) return c;
    return null;
  }

  private cleanup(): void {
    const left = this.cameras.main.scrollX - 300;
    const keepG: Ground[] = [];
    for (const g of this.grounds) {
      if (g.x + g.w < left) g.objs.forEach((o) => o.destroy());
      else keepG.push(g);
    }
    this.grounds = keepG;
    const keepC: Ceil[] = [];
    for (const c of this.ceils) {
      if (c.x + c.w < left) c.objs.forEach((o) => o.destroy());
      else keepC.push(c);
    }
    this.ceils = keepC;
    this.coins = this.coins.filter((c) => {
      // the spin tween repeats forever: stop it with the coin, or it keeps running on a dead image
      if (c.x < left) { this.tweens.killTweensOf(c.img); c.img.destroy(); return false; }
      return true;
    });
  }

  // ---------- rope ----------

  private fireRope(): void {
    const dx = Math.cos(ROPE_ANGLE), dy = -Math.sin(ROPE_ANGLE);
    for (let s = 20; s <= ROPE_MAX; s += 5) {
      const x = this.px + dx * s, y = this.py + dy * s;
      if (y < 0) break;
      const c = this.ceilAt(x);
      if (c && y <= c.bottom) {
        this.attached = true;
        this.ax = x; this.ay = c.bottom;
        this.ropeLen = Math.hypot(this.ax - this.px, this.ay - this.py);
        // reel in so the bottom of the swing clears the highest ground
        this.ropeTarget = Math.max(140, Math.min(this.ropeLen * 0.8, TOPS[1] - 40 - HAND - this.ay));
        // the hook bites: the hero keeps at least running speed along the swing
        const rx = this.px - this.ax, ry = this.py - this.ay, d = Math.hypot(rx, ry) || 1;
        const tx = -ry / d, ty = rx / d;
        const along = this.vx * tx + this.vy * ty;
        const want = Math.max(Math.abs(along), this.runSpeed * 1.15) * (along < -40 ? -1 : 1);
        this.vx += tx * (want - along); this.vy += ty * (want - along);
        // fired from the ground, the hook yanks the hero off it at once; without the hop the swing
        // drags the feet along the ground for a third of the rope, straight into spikes ahead
        if (this.grounded) this.vy = Math.min(this.vy, -HOOK_HOP);
        this.ropeShow = 0;
        this.grounded = false;
        this.sfxAt('fire', this.px - this.cameras.main.scrollX, { volume: 0.4 });
        this.time.delayedCall(70, () => {
          if (this.attached) {
            this.sfxAt('attach', this.ax - this.cameras.main.scrollX, { volume: 0.45 });
            burst(this, this.ax, this.ay, [0xb0b8c0, 0xffffff], 6, 120);
          }
        });
        return;
      }
    }
    // nothing to hook on: the rope flies out and drops
    this.missRope = { x: this.px + dx * 260, y: this.py + dy * 260, t: 0.25 };
    this.sfx('miss', { volume: 0.35 });
    popup(this, this.px + 60, this.py - 80, t('miss'), '#ff4fa3', 18);
  }

  private releaseRope(): void {
    if (!this.attached) return;
    this.attached = false;
    if (this.vx > 0) { this.vx *= 1.05; this.vy *= 1.05; }
    this.sfxAt('release', SCREEN_X, { volume: 0.4 });
  }

  // ---------- death ----------

  private die(spiked: boolean): void {
    if (this.dead) return;
    this.dead = true;
    this.attached = false;
    this.rope.clear();
    this.hero.setTexture('pc-hit');
    shake(this, 0.015, 300);
    flash(this, COLORS.red, 160, 0.3);
    if (spiked) {
      this.sfx('spike', { volume: 0.8 });
      burst(this, this.px, this.py, [COLORS.red, 0xffffff], 30, 380);
      // knocked up, then down out of the screen
      this.tweens.add({ targets: this.hero, y: this.py - 140, duration: 280, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: this.hero, y: H + 200, x: this.px - 60, delay: 280, duration: 800, ease: 'Quad.easeIn' });
    } else {
      this.sfx('fall', { volume: 0.7 });
      this.tweens.add({ targets: this.hero, y: H + 200, duration: 600, ease: 'Quad.easeIn' });
    }
    this.tweens.add({ targets: this.hero, angle: spiked ? -540 : 200, duration: 1100 });
    this.endGame({ title: spiked ? t('spiked') : t('fell'), delay: 1300 });
  }

  // ---------- frame ----------

  private inputHeld(): boolean {
    if (this.keys.some((k) => k.isDown)) return true;
    for (const p of this.input.manager.pointers) {
      if (p && p.isDown && !(p.x > W - 130 && p.y < 130)) return true;
    }
    return false;
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.startT += dt;
    if (!this.started) {
      if (this.startT > 0.9) { this.started = true; this.hero.setTexture('pc-walk1'); }
      else { this.render(dt); return; }
    }
    if (this.isOver) return;

    // input: hold fires the rope (retrying while held), release lets go
    const held = this.inputHeld() && !this.dead;
    this.retry -= dt;
    if (held && !this.attached && (!this.held || this.retry <= 0)) {
      this.retry = 0.3;
      this.fireRope();
    }
    if (!held && this.held) this.releaseRope();
    this.held = held;

    this.runSpeed = 340 + 300 * this.difficulty();
    const n = Math.max(1, Math.ceil(dt / 0.006));
    for (let i = 0; i < n && !this.isOverOrDead(); i++) this.physics1(dt / n);

    // coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (Math.abs(c.x - this.px) < 44 && Math.abs(c.y - (this.py + 10)) < 56 && !this.dead) {
        this.coinCount++;
        this.sfxAt('coin', c.x - this.cameras.main.scrollX, { volume: 0.5 });
        burst(this, c.x, c.y, [0xffd23f, 0xffffff], 8, 160);
        this.tweens.killTweensOf(c.img);
        this.tweens.add({ targets: c.img, y: c.y - 50, alpha: 0, scale: 4, duration: 220, onComplete: () => c.img.destroy() });
        this.coins.splice(i, 1);
        this.hud.setRight(`${t('coins')} ${this.coinCount}`);
      }
    }

    // distance and score
    const m = Math.max(0, Math.floor((this.px - this.startX) / 50));
    if (m > this.meters) this.meters = m;
    this.setScore(this.meters + this.coinCount * 10);
    this.hud.setCenter(t('meters', { n: this.meters }));
    if (this.meters >= this.nextMilestone && !this.dead) {
      const label = `${this.nextMilestone} m!`;
      this.nextMilestone += 250;
      this.sfx('milestone', { volume: 0.6 });
      const b = txt(this, W / 2, H * 0.3, `${label}\n${t('faster')}`, { title: true, size: 34, color: '#5dff7a', strokeThickness: 8 })
        .setScrollFactor(0).setDepth(9000).setScale(0.3);
      this.tweens.add({ targets: b, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: b, alpha: 0, delay: 1200, duration: 300, onComplete: () => b.destroy() });
    }

    this.generate();
    this.cleanup();
    this.render(dt);
  }

  private isOverOrDead(): boolean {
    return this.dead || this.isOver;
  }

  private physics1(dt: number): void {
    const prevFeet = this.py + HAND;
    if (this.grounded && !this.attached) {
      this.vx += (this.runSpeed - this.vx) * Math.min(1, 6 * dt);
      this.vy = 0;
      this.px += this.vx * dt;
      const g = this.groundAt(this.px);
      if (!g || g.top > prevFeet + 2) this.grounded = false;
      else this.py = g.top - HAND;
    } else {
      this.vy += GRAV * dt;
      if (this.attached) {
        // reel in a little (a lift off the ground) and keep the swing going
        this.ropeLen += Phaser.Math.Clamp(this.ropeTarget - this.ropeLen, -520 * dt, 520 * dt);
        const rx = this.px - this.ax, ry = this.py - this.ay;
        const d = Math.hypot(rx, ry) || 1;
        const tx = -ry / d, ty = rx / d;                 // tangent (clockwise)
        const along = this.vx * tx + this.vy * ty;
        if (this.py > this.ay) {
          const push = (220 + 200 * this.difficulty()) * Math.sign(along || 1) * dt;
          this.vx += tx * push; this.vy += ty * push;
        }
      }
      const sp = Math.hypot(this.vx, this.vy);
      const maxV = MAX_V + 450 * this.difficulty();
      if (sp > maxV) { this.vx *= maxV / sp; this.vy *= maxV / sp; }
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      if (this.attached) {
        const rx = this.px - this.ax, ry = this.py - this.ay;
        const d = Math.hypot(rx, ry);
        if (d > this.ropeLen && d > 0) {
          const nx = rx / d, ny = ry / d;
          this.px = this.ax + nx * this.ropeLen;
          this.py = this.ay + ny * this.ropeLen;
          const out = this.vx * nx + this.vy * ny;
          if (out > 0) { this.vx -= nx * out; this.vy -= ny * out; }
        }
      }
    }

    // ground: landing on top, steps and walls
    const feet = this.py + HAND;
    for (const g of this.grounds) {
      if (this.px + HALF_W < g.x || this.px - HALF_W > g.x + g.w) continue;
      if (feet < g.top) continue;
      const inside = this.px >= g.x && this.px <= g.x + g.w;
      if (prevFeet <= g.top + 4 && this.vy >= 0 && inside) {
        this.py = g.top - HAND;
        if (!this.grounded && !this.attached) this.land();
        if (!this.attached) { this.grounded = true; this.vy = 0; }
        else { this.vy = Math.min(this.vy, 0); }
      } else if (feet - g.top < 34 && this.vy >= -50) {
        this.py = g.top - HAND;                      // small step up
      } else if (this.px < g.x + 10) {
        this.px = g.x - HALF_W;                       // ran into the side: bounce off
        if (this.vx > 0) this.vx = -this.vx * 0.25;
        this.sfx('bonk', { volume: 0.4 });
      }
    }
    // spikes on the ground
    const g = this.groundAt(this.px);
    if (g && g.spikeB > g.spikeA && this.px + HALF_W > g.spikeA + 8 && this.px - HALF_W < g.spikeB - 8 && this.py + HAND > g.top - 22) {
      this.die(true);
      return;
    }
    // ceiling: bump the head, spikes kill
    const c = this.ceilAt(this.px);
    if (c && this.py - HEAD < c.bottom) {
      if (c.spikeB > c.spikeA && this.px > c.spikeA - 6 && this.px < c.spikeB + 6) { this.die(true); return; }
      this.py = c.bottom + HEAD;
      if (this.vy < 0) { this.vy = 0; this.sfx('bonk', { volume: 0.3 }); }
    } else if (c && c.spikeB > c.spikeA && this.px > c.spikeA - 6 && this.px < c.spikeB + 6 && this.py - HEAD < c.bottom + 24) {
      this.die(true);
      return;
    }
    if (this.py > H + 80) this.die(false);
  }

  private land(): void {
    this.sfxAt('land', SCREEN_X, { volume: 0.45 });
    this.dust.explode(8, this.px, this.py + HAND);
    if (this.vy > 900) shake(this, 0.004, 100);
  }

  private render(dt: number): void {
    const cam = this.cameras.main;
    const target = this.px - SCREEN_X;
    cam.scrollX += (target - cam.scrollX) * Math.min(1, 7 * dt);
    if (cam.scrollX < 0) cam.scrollX = 0;
    this.bgFar.tilePositionX = cam.scrollX * 0.15 / S;
    this.bgNear.tilePositionX = cam.scrollX * 0.4 / S;

    this.hero.setPosition(this.px, this.py);
    this.animT += dt;
    if (!this.dead) {
      let lean = 0;
      if (!this.started) this.hero.setTexture('pc-stand');
      else if (this.grounded && !this.attached) {
        this.hero.setTexture(Math.floor(this.animT * (6 + this.runSpeed / 60)) % 2 ? 'pc-walk2' : 'pc-walk1');
        if (Math.floor(this.animT * 12) % 3 === 0) this.dust.emitParticleAt(this.px - 8, this.py + HAND, 1);
      } else {
        this.hero.setTexture('pc-jump');
        if (this.attached) lean = Math.atan2(this.ax - this.px, this.py - this.ay) * 0.8;
        else lean = Phaser.Math.Clamp(this.vy / 2400, -0.35, 0.35);
      }
      this.lean += (lean - this.lean) * Math.min(1, 12 * dt);
      this.hero.setRotation(this.lean);
    }

    const r = this.rope;
    r.clear();
    if (this.attached && !this.dead) {
      this.ropeShow = Math.min(1, this.ropeShow + dt / 0.07);
      const hx = this.px + Math.sin(this.lean) * 6, hy = this.py - 4;
      const ex = hx + (this.ax - hx) * this.ropeShow, ey = hy + (this.ay - hy) * this.ropeShow;
      r.lineStyle(6, 0x4a2c12, 1).lineBetween(hx, hy, ex, ey);
      r.lineStyle(3, 0xc8925a, 1).lineBetween(hx, hy, ex, ey);
      if (this.ropeShow >= 1) r.fillStyle(0x9aa3ad, 1).fillCircle(this.ax, this.ay + 3, 7).fillStyle(0x4a4f56, 1).fillCircle(this.ax, this.ay + 3, 3);
    } else if (this.missRope) {
      this.missRope.t -= dt;
      const k = Math.max(0, this.missRope.t / 0.25);
      r.lineStyle(3, 0xc8925a, k).lineBetween(this.px, this.py - 4, this.missRope.x, this.missRope.y + (1 - k) * 120);
      if (this.missRope.t <= 0) this.missRope = null;
    }
  }
}
