import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

type Img = Phaser.GameObjects.Image;

interface Alien { img: Img; row: number; col: number; alive: boolean }
interface Bullet { img: Img; vy: number }
interface Bunker { x: number; y: number; cells: Uint8Array; g: Phaser.GameObjects.Graphics }

const COLS = 8, ROWS = 5, SPX = 72, SPY = 62;
const ROW_KEYS = [['alien-red1', 'alien-red5'], ['alien-blue3', 'alien-blue2'], ['alien-blue3', 'alien-blue2'], ['alien-green2', 'alien-green3'], ['alien-green2', 'alien-green3']];
const ROW_PTS = [30, 20, 20, 10, 10];
const ROW_TINT = [0xec7a2c, 0x3e9ec4, 0x3e9ec4, 0x6fa35a, 0x6fa35a];
const CELL = 8, BW = 15, BH = 10;
const PLAYER_Y = 1110, BUNKER_Y = 950, GROUND_Y = 1165;
const MARCH_RATES = [0.62, 0.56, 0.5, 0.45];

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private player!: Img;
  private aliens: Alien[] = [];
  private shots: Bullet[] = [];
  private bombs: Bullet[] = [];
  private bunkers: Bunker[] = [];
  private lifeIcons: Img[] = [];
  private ufo: { img: Img; vx: number } | null = null;
  private fx = 0;
  private fy = 0;
  private dir = 1;
  private frame = 0;
  private stepCd = 0;
  private bombCd = 0;
  private ufoCd = 0;
  private fireCd = 0;
  private lives = 3;
  private level = 0;
  private frozen = 0;
  private invuln = 0;
  private note = 0;
  private dead = false;
  private clearing = false;

  createGame(): void {
    const { width } = this.scale;
    this.aliens = []; this.shots = []; this.bombs = []; this.bunkers = []; this.lifeIcons = []; this.ufo = null;
    this.lives = 3; this.level = 0; this.frozen = 0; this.invuln = 0; this.note = 0; this.dead = false; this.clearing = false;
    this.fireCd = 0; this.ufoCd = rng.int(14, 20);
    this.ufoLoop = null;
    const onPause = () => this.ufoLoop?.pause();
    const onResume = () => { if (!this.isOver) this.ufoLoop?.resume(); };
    this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopUfoLoop();
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
    });

    for (let i = 0; i < 70; i++) {
      const s = this.add.image(rng.int(0, width), rng.int(0, GROUND_Y), 'star').setScale(0.06 + Math.random() * 0.18).setAlpha(0.2 + Math.random() * 0.45);
      if (i % 5 === 0) this.tweens.add({ targets: s, alpha: 0.05, duration: rng.int(500, 1500), yoyo: true, repeat: -1 });
    }
    this.add.rectangle(0, GROUND_Y, width, 4, 0x5dff7a).setOrigin(0).setAlpha(0.8);

    this.player = this.add.image(width / 2, PLAYER_Y, 'player').setScale(0.62).setDepth(10);
    this.controls = new Controls(this);
    this.updateLives();
    this.nextLevel();
  }

  // ---------- setup ----------
  private nextLevel(): void {
    this.level++;
    this.clearing = false;
    this.hud.setCenter(`${t('level')} ${this.level}`);
    for (const a of this.aliens) a.img.destroy();
    for (const b of this.bombs) b.img.destroy();
    this.aliens = []; this.bombs = [];
    this.buildBunkers();
    this.fx = 80; this.fy = 220 + Math.min(6, this.level - 1) * 28; this.dir = 1;
    this.stepCd = 1.2; this.bombCd = 2;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const img = this.add.image(this.fx + c * SPX, this.fy + r * SPY, ROW_KEYS[r][0]).setScale(0).setDepth(5);
      this.tweens.add({ targets: img, scale: 0.5, duration: 300, delay: (ROWS - r) * 90 + c * 30, ease: 'Back.easeOut' });
      this.aliens.push({ img, row: r, col: c, alive: true });
    }
    this.banner(`${t('level')} ${this.level}`, '#ffd23f');
  }

  private buildBunkers(): void {
    for (const b of this.bunkers) b.g.destroy();
    this.bunkers = [];
    const { width } = this.scale;
    for (let i = 0; i < 4; i++) {
      const cx = width * (0.15 + i * 0.233);
      const cells = new Uint8Array(BW * BH);
      for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
        const corner = (y === 0 && (x < 3 || x > BW - 4)) || (y === 1 && (x < 2 || x > BW - 3)) || (y === 2 && (x < 1 || x > BW - 2));
        const arch = y >= 6 && x >= 4 && x <= BW - 5 && !(y === 6 && (x === 4 || x === BW - 5));
        cells[y * BW + x] = corner || arch ? 0 : 1;
      }
      const b: Bunker = { x: cx - (BW * CELL) / 2, y: BUNKER_Y, cells, g: this.add.graphics().setDepth(4) };
      this.bunkers.push(b);
      this.drawBunker(b);
    }
  }

  private drawBunker(b: Bunker): void {
    b.g.clear();
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (!b.cells[y * BW + x]) continue;
      b.g.fillStyle(y < 2 ? 0x8dff9f : 0x5dff7a).fillRect(b.x + x * CELL, b.y + y * CELL, CELL, CELL);
    }
  }

  /** Erodes the bunker at (x, y) if a cell is there; returns true on a hit. */
  private hitBunker(x: number, y: number, radius: number): boolean {
    for (const b of this.bunkers) {
      const cx = Math.floor((x - b.x) / CELL), cy = Math.floor((y - b.y) / CELL);
      if (cx < 0 || cy < 0 || cx >= BW || cy >= BH || !b.cells[cy * BW + cx]) continue;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
        if (dx * dx + dy * dy <= radius * radius + 1 && (dx === 0 && dy === 0 || rng.chance(0.7))) b.cells[ny * BW + nx] = 0;
      }
      this.drawBunker(b);
      burst(this, x, y, [0x5dff7a, 0x2a8a3a], 6, 120);
      this.sfxAt('chip', x, { volume: 0.3 });
      return true;
    }
    return false;
  }

  /** Sweeps a bullet's travel segment so fast shots can't tunnel through bunker cells. */
  private sweepBunker(x: number, y0: number, y1: number, radius: number): number | null {
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0) / 5));
    for (let i = 1; i <= steps; i++) {
      const y = y0 + ((y1 - y0) * i) / steps;
      if (y < BUNKER_Y - 4 || y > BUNKER_Y + BH * CELL + 4) continue;
      if (this.hitBunker(x, y, radius)) return y;
    }
    return null;
  }

  // ---------- mystery UFO warble (a quiet loop only while it crosses) ----------
  private ufoLoop: Phaser.Sound.BaseSound | null = null;

  private startUfoLoop(): void {
    this.stopUfoLoop();
    if (!this.cache.audio.exists('ufo')) return;
    try {
      this.ufoLoop = this.sound.add('ufo', { loop: true, volume: 0.14 });
      this.ufoLoop.play();
    } catch { this.ufoLoop = null; }
  }

  private stopUfoLoop(): void {
    this.ufoLoop?.stop();
    this.ufoLoop?.destroy();
    this.ufoLoop = null;
  }

  // ---------- helpers ----------
  private banner(s: string, color: string): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * 0.55, s, { title: true, size: 38, color }).setDepth(7000).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1200, duration: 400, onComplete: () => b.destroy() });
  }

  private updateLives(): void {
    const n = Math.max(0, this.lives);
    while (this.lifeIcons.length < n) this.lifeIcons.push(this.add.image(40 + this.lifeIcons.length * 44, GROUND_Y + 50, 'life').setDepth(20));
    while (this.lifeIcons.length > n) this.lifeIcons.pop()!.destroy();
  }

  private living(): Alien[] {
    return this.aliens.filter((a) => a.alive);
  }

  // ---------- actions ----------
  private fire(): void {
    if (this.shots.length >= 1 || this.dead || this.fireCd > 0) return;
    this.fireCd = 0.12;
    const img = this.add.image(this.player.x, this.player.y - 40, 'shot').setDepth(9);
    this.shots.push({ img, vy: -1050 });
    this.sfxAt(rng.pick(['shoot1', 'shoot2']), this.player.x, { volume: 0.35 });
  }

  private killAlien(a: Alien): void {
    a.alive = false;
    this.addScore(ROW_PTS[a.row] * (1 + Math.floor((this.level - 1) / 3)), a.img.x, a.img.y);
    burst(this, a.img.x, a.img.y, [ROW_TINT[a.row], 0xffffff, 0xffd23f], 18, 260);
    this.sfxAt(rng.pick(['kill1', 'kill2', 'kill3']), a.img.x, { volume: 0.5 });
    const img = a.img;
    this.tweens.add({ targets: img, scale: 0.8, alpha: 0, duration: 160, onComplete: () => img.destroy() });
    if (this.living().length === 0) this.levelClear();
  }

  private levelClear(): void {
    this.clearing = true;
    const { width, height } = this.scale;
    this.addScore(this.level * 250, width / 2, height * 0.45);
    this.banner(t('levelClear'), '#5dff7a');
    this.sfx('level', { volume: 0.75, exact: true });
    flash(this, 0x5dff7a, 120);
    for (const b of this.bombs) b.img.destroy();
    this.bombs = [];
    this.time.delayedCall(2200, () => { if (!this.isOver) this.nextLevel(); });
  }

  private playerHit(): void {
    if (this.dead || this.invuln > 0 || this.isOver) return;
    this.lives--;
    this.updateLives();
    burst(this, this.player.x, this.player.y, [0x5dff7a, 0xffd23f, 0xec3013, 0xffffff], 50, 380);
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    this.sfxAt(this.lives <= 0 ? 'death' : 'hurt', this.player.x, { volume: this.lives <= 0 ? 0.9 : 0.8 });
    if (this.lives <= 0) { this.player.setVisible(false); this.stopUfoLoop(); this.endGame({ delay: 1200 }); return; }
    this.dead = true;
    this.player.setVisible(false);
    this.frozen = 1.4;
    for (const b of this.bombs) b.img.destroy();
    this.bombs = [];
    this.time.delayedCall(1300, () => {
      if (this.isOver) return;
      this.dead = false;
      this.invuln = 1.5;
      this.player.setPosition(this.scale.width / 2, PLAYER_Y).setVisible(true);
      if (this.lives === 1) this.sfx('low', { volume: 0.45 });
    });
  }

  private invaded(): void {
    if (this.isOver) return;
    this.lives = 0;
    this.updateLives();
    burst(this, this.player.x, this.player.y, [0xec3013, 0xffd23f], 60, 420);
    this.player.setVisible(false);
    shake(this, 0.03, 500);
    flash(this, 0xec3013, 250);
    this.stopUfoLoop();
    this.sfxAt('death', this.player.x, { volume: 0.9 });
    this.endGame({ title: t('invaded'), delay: 1200 });
  }

  private marchStep(): void {
    const alive = this.living();
    if (!alive.length) return;
    let minX = Infinity, maxX = -Infinity;
    for (const a of alive) { minX = Math.min(minX, a.col); maxX = Math.max(maxX, a.col); }
    const step = 12 + Math.min(6, this.level);
    const left = this.fx + minX * SPX - 26, right = this.fx + maxX * SPX + 26;
    if ((this.dir > 0 && right + step > this.scale.width - 10) || (this.dir < 0 && left - step < 10)) {
      this.fy += 28; this.dir *= -1;
    } else this.fx += this.dir * step;
    this.frame ^= 1;
    for (const a of alive) {
      a.img.setPosition(this.fx + a.col * SPX, this.fy + a.row * SPY).setTexture(ROW_KEYS[a.row][this.frame]);
      // aliens chew through bunkers they touch
      if (a.img.y + 22 > BUNKER_Y && a.img.y - 22 < BUNKER_Y + BH * CELL) {
        for (const b of this.bunkers) {
          let changed = false;
          for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
            const px = b.x + x * CELL + 4, py = b.y + y * CELL + 4;
            if (b.cells[y * BW + x] && Math.abs(px - a.img.x) < 26 && Math.abs(py - a.img.y) < 22) { b.cells[y * BW + x] = 0; changed = true; }
          }
          if (changed) this.drawBunker(b);
        }
      }
      if (a.img.y + 20 >= PLAYER_Y - 24) this.invaded();
    }
    this.sfx('march', { volume: 0.22, rate: MARCH_RATES[this.note++ % 4], exact: true });
  }

  private dropBomb(): void {
    const alive = this.living();
    if (!alive.length) return;
    // bottom-most alien of a column; later levels prefer the column above the player
    const cols = new Map<number, Alien>();
    for (const a of alive) { const cur = cols.get(a.col); if (!cur || a.row > cur.row) cols.set(a.col, a); }
    const shooters = [...cols.values()];
    let s = rng.pick(shooters);
    if (rng.chance(Math.min(0.6, 0.15 + this.level * 0.07))) {
      s = shooters.reduce((best, a) => (Math.abs(a.img.x - this.player.x) < Math.abs(best.img.x - this.player.x) ? a : best), s);
    }
    const img = this.add.image(s.img.x, s.img.y + 24, 'bomb').setScale(0.55).setDepth(8);
    this.bombs.push({ img, vy: 330 + Math.min(10, this.level) * 25 });
    this.sfxAt('bomb', s.img.x, { volume: 0.18 });
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;
    const c = this.controls;
    this.fireCd -= dt;
    this.invuln = Math.max(0, this.invuln - dt);

    // player: keyboard or "hold and follow your finger" (auto-fire)
    if (!this.dead) {
      const p = this.input.activePointer;
      let move = c.axisX * 460 * dt;
      let wantFire = c.a;
      if (p.isDown && !c.axisX) {
        move = Phaser.Math.Clamp(p.worldX - this.player.x, -520 * dt, 520 * dt);
        wantFire = true;
      }
      this.player.x = Phaser.Math.Clamp(this.player.x + move, 40, width - 40);
      if (wantFire) this.fire();
      this.player.setAlpha(this.invuln > 0 ? (Math.floor(this.elapsed * 12) % 2 ? 0.3 : 1) : 1);
    }

    // formation march (speeds up as the fleet thins out)
    const alive = this.living().length;
    if (this.frozen > 0) this.frozen -= dt;
    else if (alive && !this.clearing) {
      this.stepCd -= dt;
      if (this.stepCd <= 0) {
        const speedUp = 1 - Math.min(0.45, (this.level - 1) * 0.07);
        this.stepCd = (0.035 + 0.6 * (alive / (ROWS * COLS))) * speedUp;
        this.marchStep();
      }
      this.bombCd -= dt;
      if (this.bombCd <= 0) {
        this.bombCd = Math.max(0.3, 1.25 - this.level * 0.1) * (0.6 + Math.random() * 0.8);
        this.dropBomb();
      }
    }

    // player shots
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      const y0 = s.img.y;
      s.img.y += s.vy * dt;
      let hit = s.img.y < 60;
      if (!hit && this.sweepBunker(s.img.x, y0, s.img.y, 1) !== null) hit = true;
      if (!hit) for (const a of this.aliens) {
        if (a.alive && Math.abs(a.img.x - s.img.x) < 24 && s.img.y < a.img.y + 22 && y0 > a.img.y - 22) { this.killAlien(a); hit = true; break; }
      }
      if (!hit) for (let j = this.bombs.length - 1; j >= 0; j--) {
        const b = this.bombs[j];
        if (Math.abs(b.img.x - s.img.x) < 14 && Math.abs(b.img.y - s.img.y) < 30) {
          burst(this, b.img.x, b.img.y, [0xffffff, 0xec3013], 10, 160);
          this.addScore(5, b.img.x, b.img.y);
          this.sfxAt('clink', b.img.x, { volume: 0.45 });
          b.img.destroy(); this.bombs.splice(j, 1); hit = true; break;
        }
      }
      if (!hit && this.ufo && Math.abs(this.ufo.img.x - s.img.x) < 46 && Math.abs(this.ufo.img.y - s.img.y) < 30) {
        const pts = rng.pick([50, 100, 150, 300]);
        this.addScore(pts, this.ufo.img.x, this.ufo.img.y);
        popup(this, this.ufo.img.x, this.ufo.img.y + 50, t('mystery'), '#ff4fa3', 20);
        burst(this, this.ufo.img.x, this.ufo.img.y, [0xff4fa3, 0xffd23f, 0xffffff], 40, 380);
        shake(this, 0.012, 200);
        this.stopUfoLoop();
        this.sfxAt('ufo-kill', this.ufo.img.x, { volume: 0.8 });
        this.sfxAt('ufo-coins', this.ufo.img.x, { volume: 0.6, delay: 0.15 });
        this.ufo.img.destroy(); this.ufo = null; hit = true;
      }
      if (hit) { s.img.destroy(); this.shots.splice(i, 1); }
    }

    // alien bombs
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      const y0 = b.img.y;
      b.img.y += b.vy * dt;
      b.img.angle += 360 * dt;
      let hit = b.img.y > GROUND_Y;
      if (hit) burst(this, b.img.x, GROUND_Y, [0x5dff7a, 0xec3013], 6, 100);
      if (!hit && this.sweepBunker(b.img.x, y0, b.img.y, 2) !== null) hit = true;
      if (!hit && !this.dead && Math.abs(b.img.x - this.player.x) < 30 && Math.abs(b.img.y - this.player.y) < 22) {
        if (this.invuln <= 0) {
          hit = true;
          this.playerHit();
          if (this.bombs[i] !== b) break;   // respawn cleared every bomb
        }
      }
      if (hit && this.bombs[i] === b) { b.img.destroy(); this.bombs.splice(i, 1); }
    }

    // mystery UFO
    if (this.ufo) {
      this.ufo.img.x += this.ufo.vx * dt;
      this.ufo.img.y = 135 + Math.sin(this.elapsed * 5) * 6;
      if (this.ufo.img.x < -90 || this.ufo.img.x > width + 90) { this.ufo.img.destroy(); this.ufo = null; this.stopUfoLoop(); }
    } else if (!this.clearing && alive >= 6) {
      this.ufoCd -= dt;
      if (this.ufoCd <= 0) {
        this.ufoCd = rng.int(15, 25);
        const fromLeft = rng.chance(0.5);
        const img = this.add.image(fromLeft ? -70 : width + 70, 135, 'mystery').setScale(0.7).setDepth(6);
        this.ufo = { img, vx: (fromLeft ? 1 : -1) * (170 + this.level * 10) };
        this.startUfoLoop();
      }
    }
  }
}
