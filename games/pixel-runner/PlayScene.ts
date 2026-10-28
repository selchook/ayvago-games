import Phaser from 'phaser';
import { ArcadeScene, burst, shake, flash, popup, t, txt, rng } from '@core';

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
};
const S = 3, T = 21 * S;                     // scale and tile size in world px
const PX = 300;                              // runner's screen x
const GRAV = 2700, JUMP = -1000, JUMP2 = -900, CUT = -380;
const HW = 18, HH = 26;                      // runner half extents (hitbox)
const TOPS = [720 - 2 * T, 720 - 3 * T, 720 - 4 * T];

interface Seg { x: number; w: number; top: number; float: boolean; objs: Phaser.GameObjects.GameObject[] }
interface Coin { img: Phaser.GameObjects.Image; x: number; y: number }
interface Enemy { kind: 'slime' | 'bee' | 'spike'; img: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; baseY: number; t: number; alive: boolean }

export class PlayScene extends ArcadeScene {
  private player!: Phaser.GameObjects.Sprite;
  private segs: Seg[] = [];
  private coins: Coin[] = [];
  private enemies: Enemy[] = [];
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private hearts: Phaser.GameObjects.Image[] = [];
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

  createGame(): void {
    const { width, height } = this.scale;
    this.segs = []; this.coins = []; this.enemies = []; this.hearts = [];
    this.scroll = 0; this.speed = 380; this.vy = 0; this.grounded = true; this.jumps = 0; this.coyote = 0; this.buffer = 0;
    this.holding = false; this.invuln = 0; this.lives = 3; this.coinCount = 0; this.meters = 0; this.nextMilestone = 250;
    this.genX = 0; this.lastTop = TOPS[0]; this.animT = 0; this.dead = false; this.stompChain = 0;
    this.cameras.main.setScroll(0, 0);

    this.add.rectangle(0, 0, width, height, 0xd3f3f7).setOrigin(0).setScrollFactor(0).setDepth(-10);
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
    this.player = this.add.sprite(PX, this.py, 'pp', F.run[0]).setScale(S).setDepth(20);

    for (let i = 0; i < 3; i++) this.hearts.push(this.add.image(40 + i * 54, 92, 'pp', F.heart).setScale(2.4).setScrollFactor(0).setDepth(9000));
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
      const n = gap + 1;
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        this.addCoin(gapStart + k * gap * T, Math.min(this.lastTop, top) - 70 - Math.sin(k * Math.PI) * 120);
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
      if (roll < 30 + d * 25) this.addEnemy('slime', at, top);
      else if (roll < 50 + d * 30) {
        const n = d > 0.5 && rng.chance(0.5) ? 2 : 1;
        for (let i = 0; i < n; i++) this.addEnemy('spike', at + i * T, top);
      } else if (roll < 65 + d * 20) this.addEnemy('bee', at, top - rng.int(90, 160));
      if (rng.chance(0.5)) {
        const cx = seg.x + T;
        const ny = rng.chance(0.5) ? top - 40 : top - 150;
        for (let i = 0; i < Math.min(5, len - 2); i++) this.addCoin(cx + i * T * 0.75 + T / 2, ny);
      }
      if (d > 0.4 && rng.chance(0.3) && len > 8) this.addEnemy('slime', seg.x + (len - 2) * T, top);
    }
    this.genX += len * T;
  }

  private addCoin(x: number, y: number): void {
    const img = this.add.image(x, y, 'pp', F.coin).setScale(S).setDepth(8);
    this.tweens.add({ targets: img, scaleX: 0.6, duration: 260, yoyo: true, repeat: -1, delay: (x % 500) });
    this.coins.push({ img, x, y });
  }

  private addEnemy(kind: Enemy['kind'], x: number, y: number): void {
    const frame = kind === 'slime' ? F.slime[0] : kind === 'bee' ? F.bee[0] : F.spike;
    const img = this.add.sprite(x, 0, 'pp', frame).setScale(S).setDepth(9).setOrigin(0.5, 1);
    const e: Enemy = { kind, img, x, y, vx: kind === 'slime' ? -rng.int(40, 90) : 0, baseY: y, t: rng.int(0, 100) / 10, alive: true };
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
    this.sfx(double ? 'jump2' : 'jump', { volume: 0.35 });
    const wx = this.scroll + PX;
    if (double) {
      burst(this, wx, this.py + HH, [0xffffff, 0x3ee6ff], 12, 200);
      this.tweens.add({ targets: this.player, angle: 360, duration: 380, onComplete: () => this.player.setAngle(0) });
    } else burst(this, wx - 10, this.py + HH, 0xe6d3a3, 6, 120);
  }

  // ---------- rules ----------

  private updateHud(): void {
    this.hud.setCenter(t('meters', { n: Math.floor(this.meters) }));
    this.hud.setRight(`${t('coins')} ${this.coinCount}`);
    this.hearts.forEach((h, i) => h.setFrame(i < this.lives ? F.heart : F.heartEmpty));
  }

  private hurt(fell = false): void {
    if (this.dead || (!fell && this.invuln > 0)) return;
    this.lives--;
    this.invuln = 1.6;
    this.stompChain = 0;
    const h = this.hearts[this.lives];
    if (h) this.tweens.add({ targets: h, scale: 3.4, duration: 120, yoyo: true });
    this.updateHud();
    this.sfx(fell ? 'fall' : 'hurt', { volume: 0.5 });
    shake(this, 0.015, 250);
    flash(this, 0xec3013, 150);
    if (this.lives <= 0) { this.die(); return; }
    if (fell) this.respawn();
    else { this.vy = -650; this.grounded = false; this.jumps = 1; }
  }

  private respawn(): void {
    const wx = this.scroll + PX;
    const seg = this.segs.find((s) => !s.float && s.x > wx - 10);
    if (!seg) return;
    this.scroll = seg.x + T * 1.5 - PX;
    // clear hazards near the landing spot
    for (const e of this.enemies) if (e.alive && Math.abs(e.x - (this.scroll + PX)) < T * 4) this.killEnemy(e, false);
    this.py = seg.top - 260; this.vy = 0; this.grounded = false; this.jumps = 1;
    popup(this, this.scroll + PX, seg.top - 320, t('fell'), '#ec3013', 26);
  }

  private die(): void {
    this.dead = true;
    this.player.setFrame(F.hurt).setFlipY(true);
    this.vy = -900;
    burst(this, this.scroll + PX, this.py, [0xec3013, 0xffd23f], 30, 380);
    this.endGame({ delay: 1300 });
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
      this.sfx('milestone', { volume: 0.45 });
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
        this.sfx('land', { volume: 0.3 });
        burst(this, wx - 12, this.py + HH, 0xe6d3a3, 5, 100);
        this.stompChain = 0;
        if (this.buffer > 0) this.jump(false);
      }
      if (this.grounded) { this.jumps = 0; this.coyote = 0.09; }
    } else if (wasGrounded && this.vy >= 0) this.coyote = 0.09;
    if (this.py > 800) this.hurt(true);

    // runner sprite
    this.animT += dt * (this.speed / 380);
    if (this.grounded) this.player.setFrame(F.run[Math.floor(this.animT * 9) % 2]);
    else this.player.setFrame(F.jump);
    this.player.setPosition(this.scroll + PX, this.py - 4);
    this.player.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 14) % 2 ? 0.35 : 1) : 1);
    this.cameras.main.scrollX = this.scroll;
    this.bgFar.tilePositionX = this.scroll * 0.05;
    this.bgNear.tilePositionX = this.scroll * 0.12;

    // coins
    for (const c of this.coins) {
      if (!c.img.active) continue;
      if (Math.abs(c.x - wx) < 34 && Math.abs(c.y - this.py) < 46) {
        this.coinCount++;
        this.addScore(10);
        this.sfx('coin', { volume: 0.3, rate: 1 + Math.min(0.5, (this.coinCount % 10) * 0.05) });
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
          this.sfx('stomp', { volume: 0.6 });
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
