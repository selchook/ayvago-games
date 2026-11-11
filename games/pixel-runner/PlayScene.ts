import Phaser from 'phaser';
import { ArcadeScene, CHARACTER_FRAME, burst, shake, flash, popup, t, txt, rng } from '@core';

/** A banded pixel sky with a sun (drawn small, shown 8x for chunky pixels), pixel clouds and a ground shadow. */
export function makeSky(scene: Phaser.Scene): void {
  const tex = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    if (scene.textures.exists(key)) return;
    const ct = scene.textures.createCanvas(key, w, h);
    if (!ct) return;
    draw(ct.getContext());
    ct.refresh();
  };
  tex('pr-sky', 160, 90, (c) => {
    const bands = ['#4a8fd6', '#5a9ddd', '#6aabe3', '#7cb9e8', '#8fc6ec', '#a3d2ef', '#b7ddf1', '#c9e7f3', '#d6eef4'];
    bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 7, 160, 7); });
    c.fillStyle = '#d6eef4'; c.fillRect(0, 63, 160, 27);
    // the sun with a ring of light
    c.fillStyle = 'rgba(255,240,180,0.35)'; c.fillRect(118, 6, 20, 20); c.fillRect(114, 10, 28, 12); c.fillRect(122, 2, 12, 28);
    c.fillStyle = '#fff3b0'; c.fillRect(121, 9, 14, 14); c.fillRect(119, 11, 18, 10); c.fillRect(123, 7, 10, 18);
    c.fillStyle = '#ffffff'; c.fillRect(124, 11, 4, 3);
  });
  tex('pr-clouds', 80, 25, (c) => {
    const cloud = (x: number, y: number, w: number) => {
      c.fillStyle = '#ffffff';
      c.fillRect(x, y + 3, w, 4); c.fillRect(x + 2, y + 1, w - 6, 3); c.fillRect(x + 4, y, w - 12, 2);
      c.fillStyle = '#dceef6'; c.fillRect(x + 1, y + 6, w - 2, 1);
    };
    cloud(4, 4, 22); cloud(40, 12, 16); cloud(60, 2, 14);
  });
  tex('pr-shadow', 16, 4, (c) => {
    c.fillStyle = 'rgba(0,0,0,1)'; c.fillRect(2, 0, 12, 4); c.fillRect(0, 1, 16, 2);
  });
}

/** pixel-platformer tilemap_packed frames (21 px tiles, 30 per row). */
export const F = {
  run: [19, 20], jump: 21, hurt: 22,
  topL: 121, top: 122, top2: 123, topR: 124, fill: 152,
  platL: 158, platR: 159,
  coin: 78, bigCoin: 179,
  slime: [230, 231], slimeFlat: 229,
  bee: [354, 355], beeDead: 356,
  spike: 70,
  heart: 373, heartEmpty: 375,
  tuft: 46, rock: 48, shroom: 108, star: 106,
  flag: [311, 341],
  gems: [285, 286, 376, 377, 378],
};
const S = 3, T = 21 * S;                     // scale and tile size in world px
const PX = 300;                              // runner's screen x
const GRAV = 2700, JUMP = -1000, JUMP2 = -900, CUT = -380;
const HW = 18, HH = 26;                      // runner half extents (hitbox)
// The runner is the player's chosen character (pc-* textures, see main.ts), drawn as tall as the
// old 21 px tile at scale 3 and centred on its frame, so its feet land on the hitbox bottom.
export const HERO_SCALE = 62 / CHARACTER_FRAME.standHeight;
const HERO_FEET = (CHARACTER_FRAME.originY - 0.5) * CHARACTER_FRAME.height * HERO_SCALE;
const SLIME_HW = 26;
const TOPS = [720 - 2 * T, 720 - 3 * T, 720 - 4 * T];

interface Seg { x: number; w: number; top: number; float: boolean; objs: Phaser.GameObjects.GameObject[] }
interface Coin { img: Phaser.GameObjects.Image; x: number; y: number; gem?: boolean }
interface Enemy { kind: 'slime' | 'bee' | 'spike'; img: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; baseY: number; t: number; alive: boolean; minX: number; maxX: number }

export class PlayScene extends ArcadeScene {
  private player!: Phaser.GameObjects.Sprite;
  private segs: Seg[] = [];
  private coins: Coin[] = [];
  private enemies: Enemy[] = [];
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private scroll = 0;
  private speed = 380;
  private py = 0;
  private vy = 0;
  private grounded = false;
  private jumps = 0;
  private coyote = 0;
  private buffer = 0;
  private holding = false;
  private invuln = 0;
  private lives = 3;
  private coinCount = 0;
  private meters = 0;
  private nextMilestone = 250;
  private genX = 0;
  private lastTop = TOPS[0];
  private animT = 0;
  private dead = false;
  private stompChain = 0;
  private flags: { x: number; img: Phaser.GameObjects.Sprite; pole: Phaser.GameObjects.Rectangle; m: number; done: boolean }[] = [];
  private nextFlag = 250;
  private dustT = 0;
  private shadow!: Phaser.GameObjects.Image;
  private lines: Phaser.GameObjects.Rectangle[] = [];
  private clouds!: Phaser.GameObjects.TileSprite;
  private barG!: Phaser.GameObjects.Graphics;
  private coinShown = -1;

  createGame(): void {
    const { width, height } = this.scale;
    this.segs = []; this.coins = []; this.enemies = []; this.coinShown = -1;
    this.scroll = 0; this.speed = 380; this.vy = 0; this.grounded = true; this.jumps = 0; this.coyote = 0; this.buffer = 0;
    this.holding = false; this.invuln = 0; this.lives = 3; this.coinCount = 0; this.meters = 0; this.nextMilestone = 250;
    this.genX = 0; this.lastTop = TOPS[0]; this.animT = 0; this.dead = false; this.stompChain = 0;
    this.flags = []; this.nextFlag = 250; this.dustT = 0; this.lines = [];
    makeSky(this);
    this.cameras.main.setScroll(0, 0);

    // a banded pixel sky with a sun, drifting clouds, then the two hill layers
    this.add.image(0, 0, 'pr-sky').setOrigin(0).setScale(8).setScrollFactor(0).setDepth(-12);
    this.clouds = this.add.tileSprite(0, 40, width, 200, 'pr-clouds').setOrigin(0).setTileScale(8).setScrollFactor(0).setDepth(-11);
    this.bgFar = this.add.tileSprite(0, 230, width, 189, 'ppbg', 0).setOrigin(0).setTileScale(3).setScrollFactor(0).setDepth(-9);
    this.bgNear = this.add.tileSprite(0, 395, width, 189, 'ppbg', 1).setOrigin(0).setTileScale(3).setScrollFactor(0).setDepth(-8).setAlpha(0.85);
    // dark pit below the horizon so gaps read as holes
    const pit = this.add.graphics().setScrollFactor(0).setDepth(-7);
    pit.fillGradientStyle(0x3d5a1a, 0x3d5a1a, 0x0b1206, 0x0b1206, 1).fillRect(0, 560, width, 160);

    // opening runway
    this.addSeg(0, 26, TOPS[0], false);
    this.genX = 26 * T;
    while (this.genX < width * 2) this.generate();

    this.py = TOPS[0] - HH;
    this.shadow = this.add.image(PX, TOPS[0], 'pr-shadow').setScale(3).setDepth(19).setAlpha(0.35);
    this.player = this.add.sprite(PX, this.py, 'pc-walk1').setScale(HERO_SCALE).setDepth(20);
    // speed lines that streak past once the run gets fast
    for (let i = 0; i < 10; i++) this.lines.push(this.add.rectangle(0, 0, 60, 3, 0xffffff, 0.5).setOrigin(0, 0.5).setScrollFactor(0).setDepth(30).setVisible(false));
    this.barG = this.add.graphics().setScrollFactor(0).setDepth(9000);

    // coins: a spinning coin and the count in the HUD's right chip; lives as the HUD's hearts
    this.hud.setRight('0', 'pp', F.coin);
    const coin = this.hud.rightChip.setIcon('pp', F.coin, 44).icon!;   // the frame has a wide transparent margin
    this.tweens.add({ targets: coin, scaleX: coin.scaleY * 0.25, duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.updateHud();

    const go = txt(this, width / 2, height * 0.35, t('go'), { title: true, size: 64, color: '#ffd23f' }).setScrollFactor(0).setDepth(9000).setScale(0.2);
    this.tweens.add({ targets: go, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: go, alpha: 0, delay: 900, duration: 300, onComplete: () => go.destroy() });

    const kb = this.input.keyboard;
    for (const k of ['SPACE', 'UP', 'W', 'Z']) {
      kb?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.press(); });
      kb?.on(`keyup-${k}`, () => this.release());
    }
    kb?.on('keydown-DOWN', () => { if (!this.grounded) this.vy = Math.max(this.vy, 900); });
    kb?.on('keydown-S', () => { if (!this.grounded) this.vy = Math.max(this.vy, 900); });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;     // pause button corner
      this.press();
    });
    this.input.on('pointerup', () => this.release());
  }

  // ---------- world generation ----------

  private addSeg(x: number, tiles: number, top: number, float: boolean): Seg {
    const objs: Phaser.GameObjects.GameObject[] = [];
    if (float) {
      for (let i = 0; i < tiles; i++) {
        const f = i === 0 ? F.platL : i === tiles - 1 ? F.platR : (i % 2 ? F.platR : F.platL);
        objs.push(this.add.image(x + i * T, top, 'pp', f).setOrigin(0).setScale(S).setDepth(5));
      }
    } else {
      for (let i = 0; i < tiles; i++) {
        const f = i === 0 ? F.topL : i === tiles - 1 ? F.topR : (i % 3 === 1 ? F.top2 : F.top);
        objs.push(this.add.image(x + i * T, top, 'pp', f).setOrigin(0).setScale(S).setDepth(5));
      }
      objs.push(this.add.tileSprite(x, top + T, tiles * T, 720 - top, 'pp', F.fill).setOrigin(0).setTileScale(S).setDepth(5));
      // grass tufts, rocks and mushrooms standing on the top tiles
      for (let i = 1; i < tiles - 1; i++) {
        if (!rng.chance(0.28)) continue;
        const f = rng.pick([F.tuft, F.tuft, F.tuft, F.rock, F.shroom]);
        objs.push(this.add.image(x + i * T + rng.int(4, T - 4), top + 6, 'pp', f).setOrigin(0.5, 1).setScale(S * (f === F.tuft ? 1 : 0.8)).setDepth(4));
      }
      // a checkpoint flag on the ground every 250 m
      const m0 = x / T, m1 = (x + tiles * T) / T;
      if (this.nextFlag > m0 + 1 && this.nextFlag < m1 - 1) {
        const fx = this.nextFlag * T;
        const pole = this.add.rectangle(fx - 22, top, 9, T * 1.6, 0xa9b4b8).setOrigin(0.5, 1).setDepth(6).setStrokeStyle(3, 0x6b7478);
        const flag = this.add.sprite(fx, top - T * 1.6 + 30, 'pp', F.flag[0]).setOrigin(0.5, 0.5).setScale(S).setDepth(6);
        this.flags.push({ x: fx, img: flag, pole, m: this.nextFlag, done: false });
        objs.push(pole, flag);
        this.nextFlag += 250;
      }
    }
    const s: Seg = { x, w: tiles * T, top, float, objs };
    this.segs.push(s);
    return s;
  }

  private difficulty(): number {
    return Phaser.Math.Clamp(this.meters / 2500, 0, 1);
  }

  private generate(): void {
    const d = this.difficulty();
    const airTime = (2 * -JUMP) / GRAV;
    const reach = this.speed * airTime;                       // single-jump distance
    const maxGap = Math.max(2, Math.min(7, Math.floor((reach * 0.85) / T)));
    const gap = rng.int(2, Math.max(2, Math.min(maxGap, 2 + Math.floor(d * 4))));
    let top = this.lastTop;
    if (rng.chance(0.45)) top = rng.pick(TOPS.filter((tp) => Math.abs(tp - this.lastTop) <= T));
    // coin arc over the gap
    const gapStart = this.genX;
    if (rng.chance(0.6)) {
      const n = gap + 1, gemAt = rng.chance(0.18) ? Math.floor(n / 2) : -1;
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        this.addCoin(gapStart + k * gap * T, Math.min(this.lastTop, top) - 70 - Math.sin(k * Math.PI) * 120, i === gemAt);
      }
    }
    // long gaps get a floating platform in the middle
    if (d > 0.3 && rng.chance(0.25)) {
      const extra = rng.int(3, 4);
      const pw = 3;
      const px = this.genX + (gap + 0.5) * T;
      const ptop = Math.min(this.lastTop, top) - T * 2;
      this.addSeg(px, pw, ptop, true);
      for (let i = 0; i < pw; i++) this.addCoin(px + (i + 0.5) * T, ptop - 40);
      if (rng.chance(0.4)) this.addEnemy('bee', px + pw * T * 0.5, ptop - 170);
      this.genX += (gap + pw + extra) * T;
    } else this.genX += gap * T;

    const len = rng.int(Math.max(5, 9 - Math.floor(d * 4)), 14 - Math.floor(d * 4));
    const seg = this.addSeg(this.genX, len, top, false);
    this.lastTop = top;
    // hazards and pickups on the segment
    const slots = len - 3;
    if (slots > 1) {
      const roll = rng.int(0, 99);
      const at = seg.x + rng.int(2, slots) * T + T / 2;
      if (roll < 30 + d * 25) this.addEnemy('slime', at, top, seg);
      else if (roll < 50 + d * 30) {
        const n = d > 0.5 && rng.chance(0.5) ? 2 : 1;
        for (let i = 0; i < n; i++) this.addEnemy('spike', at + i * T, top);
      } else if (roll < 65 + d * 20) this.addEnemy('bee', at, top - rng.int(90, 160));
      if (rng.chance(0.5)) {
        const cx = seg.x + T;
        const ny = rng.chance(0.5) ? top - 40 : top - 150;
        for (let i = 0; i < Math.min(5, len - 2); i++) this.addCoin(cx + i * T * 0.75 + T / 2, ny);
      }
      if (d > 0.4 && rng.chance(0.3) && len > 8) this.addEnemy('slime', seg.x + (len - 2) * T, top, seg);
    }
    this.genX += len * T;
  }

  private addCoin(x: number, y: number, gem = false): void {
    if (gem) {
      // a rare gem at the top of an arc: worth five coins
      const img = this.add.image(x, y, 'pp', rng.pick(F.gems)).setScale(S).setDepth(8);
      this.tweens.add({ targets: img, y: y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.coins.push({ img, x, y, gem: true });
      return;
    }
    const img = this.add.image(x, y, 'pp', F.coin).setScale(S).setDepth(8);
    this.tweens.add({ targets: img, scaleX: 0.6, duration: 260, yoyo: true, repeat: -1, delay: (x % 500) });
    this.coins.push({ img, x, y });
  }

  // Slimes patrol the ground segment they stand on and turn round at its edges.
  private addEnemy(kind: Enemy['kind'], x: number, y: number, seg?: Seg): void {
    const frame = kind === 'slime' ? F.slime[0] : kind === 'bee' ? F.bee[0] : F.spike;
    const img = this.add.sprite(x, 0, 'pp', frame).setScale(S).setDepth(9).setOrigin(0.5, 1);
    const e: Enemy = { kind, img, x, y, vx: kind === 'slime' ? -rng.int(40, 90) : 0, baseY: y, t: rng.int(0, 100) / 10, alive: true,
      minX: seg ? seg.x + SLIME_HW : x, maxX: seg ? seg.x + seg.w - SLIME_HW : x };
    img.setY(kind === 'bee' ? y + 30 : y + 3);
    if (kind === 'slime') img.setFlipX(false);
    this.enemies.push(e);
  }

  // ---------- input ----------

  private press(): void {
    if (this.isOver || this.dead) return;
    this.holding = true;
    if (this.grounded || this.coyote > 0) this.jump(false);
    else if (this.jumps < 2) this.jump(true);
    else this.buffer = 0.14;
  }

  private release(): void {
    this.holding = false;
    if (this.vy < CUT) this.vy = CUT;
  }

  private jump(double: boolean): void {
    this.vy = double ? JUMP2 : JUMP;
    this.jumps = double ? 2 : 1;
    this.grounded = false; this.coyote = 0; this.buffer = 0;
    this.sfx(double ? 'jump2' : 'jump', { volume: 0.4 });
    this.tweens.killTweensOf(this.player);
    this.player.setAngle(0);
    this.player.setScale(HERO_SCALE * 0.85, HERO_SCALE * 1.18);
    this.tweens.add({ targets: this.player, scaleX: HERO_SCALE, scaleY: HERO_SCALE, duration: 220, ease: 'Quad.easeOut' });
    const wx = this.scroll + PX;
    if (double) {
      burst(this, wx, this.py + HH, [0xffffff, 0x3ee6ff], 12, 200);
      this.tweens.add({ targets: this.player, angle: 360, duration: 380, onComplete: () => this.player.setAngle(0) });
    } else burst(this, wx - 10, this.py + HH, 0xe6d3a3, 6, 120);
  }

  // ---------- rules ----------

  private updateHud(): void {
    this.hud.setCenter(t('meters', { n: Math.floor(this.meters) }));
    if (this.coinShown !== this.coinCount) {
      this.coinShown = this.coinCount;
      this.hud.setRight(String(this.coinCount));
    }
    this.hud.setLives(this.lives, 3);
  }

  private hurt(fell = false): void {
    if (this.dead || (!fell && this.invuln > 0)) return;
    this.lives--;
    this.invuln = 1.6;
    this.stompChain = 0;
    this.updateHud();
    this.sfx(fell ? 'fall' : 'hurt', { volume: fell ? 0.6 : 0.65 });
    shake(this, 0.015, 250);
    flash(this, 0xec3013, 150);
    if (this.lives <= 0) { this.die(); return; }
    if (fell) this.respawn();
    else { this.vy = -650; this.grounded = false; this.jumps = 1; }
  }

  private respawn(fell = true): void {
    const wx = this.scroll + PX;
    const seg = this.segs.find((s) => !s.float && s.x > wx - 10);
    if (!seg) return;
    this.scroll = seg.x + T * 1.5 - PX;
    // clear hazards near the landing spot
    for (const e of this.enemies) if (e.alive && Math.abs(e.x - (this.scroll + PX)) < T * 4) this.killEnemy(e, false);
    this.py = seg.top - 260; this.vy = 0; this.grounded = false; this.jumps = 1;
    if (fell) popup(this, this.scroll + PX, seg.top - 320, t('fell'), '#ec3013', 26);
  }

  private die(): void {
    this.dead = true;
    this.player.setTexture('pc-hit').setFlipY(true);
    this.vy = -900;
    this.time.delayedCall(150, () => this.sfx('die', { volume: 0.6, exact: true }));
    burst(this, this.scroll + PX, this.py, [0xec3013, 0xffd23f], 30, 380);
    this.endGame({ delay: 1300 });
  }

  /**
   * Rewarded continue (core ads): the runner drops back in on the next solid ground with one
   * life and a short invulnerability; enemies near the landing spot are cleared.
   */
  revive(): void {
    this.dead = false;
    this.lives = 1;
    this.invuln = 2.5;
    this.stompChain = 0;
    this.player.setTexture('pc-jump').setFlipY(false).setAngle(0);
    this.respawn(false);
    burst(this, this.scroll + PX, this.py, [0x5dff7a, 0xffd23f, 0xffffff], 24, 300);
    this.sfx('milestone', { volume: 0.5 });
    this.updateHud();
  }

  private killEnemy(e: Enemy, stomped: boolean): void {
    e.alive = false;
    if (e.kind === 'slime') e.img.setFrame(F.slimeFlat);
    else if (e.kind === 'bee') e.img.setFrame(F.beeDead);
    burst(this, e.x, e.img.y - 20, e.kind === 'bee' ? [0xffd23f, 0x333333] : [0xff8ad8, 0xffffff], 14, 240);
    this.tweens.add({ targets: e.img, alpha: 0, y: e.img.y + (stomped ? 10 : 0), scaleY: stomped ? 1.2 : S, duration: 350, onComplete: () => e.img.destroy() });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;

    if (this.dead) {
      this.vy += GRAV * dt;
      this.py += this.vy * dt;
      this.player.setPosition(this.scroll + PX, this.py).setAngle(this.player.angle + 360 * dt);
      return;
    }

    // speed ramps towards a cap
    this.speed = 380 + 560 * (1 - Math.exp(-this.elapsed / 75));
    const dx = this.speed * dt;
    const prevBottom = this.py + HH;
    this.scroll += dx;
    this.meters += dx / T;
    const m = Math.floor(this.meters);
    if (m > Math.floor(this.meters - dx / T)) this.addScore(1);
    if (this.meters >= this.nextMilestone) {
      this.addScore(100);
      popup(this, this.scroll + width / 2, 200, `${this.nextMilestone} m!`, '#5dff7a', 34);
      this.sfx(this.nextMilestone % 500 === 0 ? 'faster' : 'milestone', { volume: 0.55 });
      if (this.nextMilestone % 500 === 0) popup(this, this.scroll + width / 2, 260, t('faster'), '#ff4fa3', 22);
      this.nextMilestone += 250;
    }

    // vertical physics
    this.invuln = Math.max(0, this.invuln - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.buffer = Math.max(0, this.buffer - dt);
    const g = this.vy < 0 && this.holding ? GRAV * 0.8 : GRAV;
    this.vy = Math.min(1500, this.vy + g * dt);
    this.py += this.vy * dt;
    const wx = this.scroll + PX;
    const wasGrounded = this.grounded;
    this.grounded = false;
    for (const s of this.segs) {
      if (wx + HW <= s.x || wx - HW >= s.x + s.w) continue;
      const bottom = this.py + HH;
      if (this.vy >= 0 && prevBottom <= s.top + 2 && bottom >= s.top) {
        this.py = s.top - HH; this.vy = 0; this.grounded = true;
      } else if (!s.float && bottom > s.top + 14 && this.py - HH < 720 && wx + HW - dx <= s.x + 2) {
        // ran into the face of a higher block: bonk and pop on top
        this.hurt();
        this.py = s.top - HH - 4; this.vy = -500;
      }
    }
    if (this.grounded) {
      if (!wasGrounded) {
        this.sfx(rng.pick(['land', 'land2']), { volume: 0.55 });
        burst(this, wx - 12, this.py + HH, 0xe6d3a3, 8, 120);
        this.player.setScale(HERO_SCALE * 1.2, HERO_SCALE * 0.8);
        this.tweens.add({ targets: this.player, scaleX: HERO_SCALE, scaleY: HERO_SCALE, duration: 180, ease: 'Back.easeOut' });
        this.stompChain = 0;
        if (this.buffer > 0) this.jump(false);
      }
      if (this.grounded) { this.jumps = 0; this.coyote = 0.09; }
    } else if (wasGrounded && this.vy >= 0) this.coyote = 0.09;
    if (this.py > 800) this.hurt(true);

    // runner sprite
    this.animT += dt * (this.speed / 380);
    if (this.grounded) this.player.setTexture(Math.floor(this.animT * 9) % 2 ? 'pc-walk2' : 'pc-walk1');
    else this.player.setTexture(this.invuln > 1.2 ? 'pc-hit' : 'pc-jump');
    this.player.setPosition(this.scroll + PX, this.py + HH - HERO_FEET);
    this.player.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 14) % 2 ? 0.35 : 1) : 1);
    this.cameras.main.scrollX = this.scroll;
    this.bgFar.tilePositionX = this.scroll * 0.05;
    this.bgNear.tilePositionX = this.scroll * 0.12;
    this.clouds.tilePositionX += dt * 2 + dx * 0.004;
    // shadow on the ground under the runner
    const under = this.segs.find((sg) => wx >= sg.x && wx <= sg.x + sg.w && sg.top >= this.py + HH - 2);
    if (under) {
      const h = under.top - (this.py + HH);
      this.shadow.setVisible(true).setPosition(wx, under.top + 2).setScale(3 * Math.max(0.4, 1 - h / 400), 3).setAlpha(0.35 * Math.max(0.2, 1 - h / 400));
    } else this.shadow.setVisible(false);
    // kicked-up dust while running
    this.dustT -= dt;
    if (this.grounded && this.dustT <= 0) { this.dustT = 0.11; burst(this, wx - 14, this.py + HH - 2, [0xe6d3a3, 0xc9b27a], 2, 70); }
    // speed lines once the run is fast
    const fast = Phaser.Math.Clamp((this.speed - 560) / 300, 0, 1);
    for (const ln of this.lines) {
      if (fast <= 0) { ln.setVisible(false); continue; }
      if (!ln.visible || ln.x < -80) ln.setVisible(true).setPosition(width + rng.int(0, 600), rng.int(150, 560)).setSize(rng.int(40, 120), 3);
      ln.x -= this.speed * 2.2 * dt;
      ln.setAlpha(0.25 + fast * 0.35);
    }
    // checkpoint flags wave, and cheer when passed
    this.flags = this.flags.filter((fl) => fl.img.active);
    for (const fl of this.flags) {
      if (!fl.img.active) continue;
      fl.img.setFrame(F.flag[Math.floor(this.elapsed * 6) % 2]);
      if (!fl.done && wx > fl.x) {
        fl.done = true;
        burst(this, fl.x, fl.img.y - 30, [0xffd23f, 0x5dff7a, 0xffffff, 0xff4fa3], 24, 320);
        this.tweens.add({ targets: fl.img, y: fl.img.y - 10, duration: 120, yoyo: true, repeat: 2 });
      }
    }
    // progress to the next milestone (top centre)
    const prev = this.nextMilestone - 250, k = Phaser.Math.Clamp((this.meters - prev) / 250, 0, 1);
    this.barG.clear();
    // the next-milestone bar, just under the HUD chips
    const by = 86;
    this.barG.fillStyle(0x1d2a3a, 0.6).fillRect(width / 2 - 124, by, 248, 14);
    this.barG.fillStyle(0x5dff7a, 1).fillRect(width / 2 - 121, by + 3, 242 * k, 8);
    this.barG.fillStyle(0xffffff, 0.5).fillRect(width / 2 - 121, by + 3, 242 * k, 2);
    this.barG.lineStyle(2, 0xffffff, 0.6).strokeRect(width / 2 - 124, by, 248, 14);

    // coins
    for (const c of this.coins) {
      if (!c.img.active) continue;
      if (Math.abs(c.x - wx) < 34 && Math.abs(c.y - this.py) < 46) {
        this.coinCount += c.gem ? 5 : 1;
        this.tweens.add({ targets: this.hud.rightChip.text, scale: 1.3, duration: 80, yoyo: true });
        this.addScore(c.gem ? 50 : 10);
        if (c.gem) { popup(this, c.x, c.y - 30, '+50', '#3ee6ff', 22); this.sfx('coin10', { volume: 0.5, rate: 1.2 }); burst(this, c.x, c.y, [0x3ee6ff, 0xffffff, 0xff8ad8], 18, 240); }
        this.sfx('coin', { volume: 0.35, rate: 1 + Math.min(0.5, (this.coinCount % 10) * 0.05) });
        if (this.coinCount % 10 === 0) this.sfx('coin10', { volume: 0.5 });
        burst(this, c.x, c.y, [0xffd23f, 0xffffff], 8, 160);
        const img = c.img;
        img.active = false;
        this.tweens.killTweensOf(img);
        this.tweens.add({ targets: img, y: img.y - 50, alpha: 0, duration: 250, onComplete: () => img.destroy() });
        this.updateHud();
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      if (e.kind === 'slime') {
        e.x += e.vx * dt;
        if ((e.x < e.minX && e.vx < 0) || (e.x > e.maxX && e.vx > 0)) {
          e.x = Phaser.Math.Clamp(e.x, e.minX, e.maxX);
          e.vx = -e.vx;
          e.img.setFlipX(e.vx > 0);
        }
        e.img.setFrame(F.slime[Math.floor(e.t * 5) % 2]);
      } else if (e.kind === 'bee') {
        e.y = e.baseY + Math.sin(e.t * 3) * 40;
        e.img.setFrame(F.bee[Math.floor(e.t * 12) % 2]);
      }
      e.img.setPosition(e.x, e.kind === 'bee' ? e.y + 30 : e.y + 3);
      const ex = e.x, ey = e.kind === 'bee' ? e.y : e.y - 18;
      const hw = e.kind === 'spike' ? 22 : 26, hh = e.kind === 'spike' ? 14 : 20;
      if (Math.abs(ex - wx) < hw + HW - 6 && Math.abs(ey - this.py) < hh + HH - 6) {
        if (e.kind !== 'spike' && this.vy > 0 && prevBottom <= ey + 6) {
          this.stompChain++;
          const pts = 50 * this.stompChain;
          this.addScore(pts, ex, ey - 40);
          this.sfxAt('stomp', ex - this.scroll, { volume: 0.6, rate: 1 + Math.min(5, this.stompChain - 1) * 0.08 });
          shake(this, 0.006, 90);
          this.killEnemy(e, true);
          this.vy = this.holding ? -900 : -650;
          this.jumps = 1;
        } else this.hurt();
      }
    }

    // generate ahead / clean up behind
    while (this.genX < this.scroll + width * 2) this.generate();
    const left = this.scroll - 200;
    this.segs = this.segs.filter((s) => {
      if (s.x + s.w > left) return true;
      s.objs.forEach((o) => o.destroy());
      return false;
    });
    this.coins = this.coins.filter((c) => { if (c.x > left && c.img.scene) return true; if (c.img.scene) c.img.destroy(); return false; });
    this.enemies = this.enemies.filter((e) => {
      if (e.x > left && (e.alive || e.img.scene)) return true;
      if (e.img.scene) e.img.destroy();
      return false;
    });
    this.updateHud();
  }
}
