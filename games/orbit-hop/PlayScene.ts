import Phaser from 'phaser';
import { ArcadeScene, burst, shake, popup, txt, t, rng, ensurePixel } from '@core';

const LAUNCH_V = 640;          // px/s along the tangent
const CAPTURE = 26;            // capture band outside an orbit ring
const SHIP_HIT = 26;
const PLANET_COLS = [0xe8433a, 0x3b6fe0, 0xffd83a, 0x35b85a, 0x9b4fd8, 0x45dcf2, 0xff8a1f, 0xff6fc8];

type Kind = 'normal' | 'shrink' | 'moving';

interface Planet {
  idx: number;
  x: number;
  y: number;
  baseX: number;
  r: number;
  orbit: number;
  orbit0: number;
  kind: Kind;
  swing: number;              // moving planets: horizontal amplitude
  phase: number;
  dir: number;                // orbit direction a ship would get by default (for the ring arrows)
  col: number;
  body: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  visited: boolean;
}

interface Comet {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  trail: Phaser.GameObjects.Particles.ParticleEmitter;
  warn?: Phaser.GameObjects.Container;
  delay: number;
}

interface Pickup { img: Phaser.GameObjects.Image; taken: boolean }

export class PlayScene extends ArcadeScene {
  private planets: Planet[] = [];
  private comets: Comet[] = [];
  private pickups: Pickup[] = [];
  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hint!: Phaser.GameObjects.Text;
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private mode: 'orbit' | 'fly' | 'dead' = 'orbit';
  private cur!: Planet;
  private left: Planet | null = null;
  private ang = 0;
  private rad = 0;
  private dir = 1;
  private vx = 0;
  private vy = 0;
  private reached = 0;
  private stars = 0;
  private level = 1;
  private started = false;
  private cometTimer = 0;
  private flyTime = 0;
  private clock = 0;
  private warnRing = 0;
  private made = 0;
  private camY = 0;             // where the camera is heading (it eases there after a catch)

  createGame(): void {
    this.planets = []; this.comets = []; this.pickups = [];
    this.mode = 'orbit'; this.left = null; this.ang = -Math.PI / 2; this.dir = 1; this.vx = 0; this.vy = 0;
    this.reached = 0; this.stars = 0; this.level = 1; this.started = false; this.cometTimer = 4; this.flyTime = 0;
    this.clock = 0; this.warnRing = 0; this.made = 0; this.camY = 0;
    this.cameras.main.setScroll(0, 0);
    this.makeTextures();

    this.far = this.add.tileSprite(0, 0, 720, 1280, 'oh-stars-far').setOrigin(0).setScrollFactor(0).setDepth(-20);
    this.near = this.add.tileSprite(0, 0, 720, 1280, 'oh-stars-near').setOrigin(0).setScrollFactor(0).setDepth(-19);

    this.addPlanet(360, 900);
    while (this.planets.length < 6) this.addPlanet();
    this.cur = this.planets[0];
    this.cur.visited = true;
    this.rad = this.cur.orbit;

    this.flame = this.add.particles(0, 0, ensurePixel(this), {
      lifespan: 300, frequency: 30, speed: { min: 0, max: 15 }, scale: { start: 2.4, end: 0 },
      alpha: { start: 0.55, end: 0 }, tint: [0xffd23f, 0xff8a1f, 0xffffff], emitting: true,
    }).setDepth(19);
    this.ship = this.add.image(0, 0, 'oh-ship').setScale(0.52).setDepth(20);
    this.placeOnOrbit();

    this.hint = txt(this, 360, 1150, t('hint'), { size: 30, wrap: 640 }).setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: this.hint, alpha: 0.4, duration: 650, yoyo: true, repeat: -1 });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > 600 && p.y < 130) return;
      this.launch();
    });
    for (const k of ['SPACE', 'UP', 'W', 'Z']) {
      this.input.keyboard?.on(`keydown-${k}`, (e: KeyboardEvent) => { if (!e.repeat) this.launch(); });
    }
    this.updateHud();
  }

  private makeTextures(): void {
    for (const [key, n, a] of [['oh-stars-far', 90, 0.35], ['oh-stars-near', 40, 0.7]] as const) {
      if (this.textures.exists(key)) continue;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      for (let i = 0; i < n; i++) {
        g.fillStyle(rng.pick([0xffffff, 0xbdd8ff, 0xffe6b0]), Phaser.Math.FloatBetween(a * 0.4, a));
        const s = key === 'oh-stars-near' && rng.chance(0.3) ? 3 : 2;
        g.fillRect(rng.int(0, 254), rng.int(0, 254), s, s);
      }
      g.generateTexture(key, 256, 256);
      g.destroy();
    }
    if (!this.textures.exists('oh-star')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 9 : 21;
        pts.push(new Phaser.Math.Vector2(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr));
      }
      g.fillStyle(0xffd23f, 0.25).fillCircle(24, 24, 23);
      g.fillStyle(0xffd23f, 1).fillPoints(pts, true);
      g.lineStyle(3, 0x000000, 0.7).strokePoints(pts, true);
      g.fillStyle(0xffffff, 0.7).fillCircle(20, 19, 4);
      g.generateTexture('oh-star', 48, 48);
      g.destroy();
    }
  }

  private updateHud(): void {
    this.hud.setRight(`${t('planets')} ${this.reached}`);
  }

  // ---------- planets ----------
  private addPlanet(fx?: number, fy?: number): void {
    const idx = this.made++;
    const prev = this.planets[this.planets.length - 1];
    const lvl = 1 + Math.floor(idx / 6);
    const orbit = fx !== undefined ? 120 : Math.max(62, rng.int(88, 125) - lvl * 5);
    const r = Math.max(24, Math.min(orbit - 26, rng.int(30, 50)));
    let x = fx ?? 360, y = fy ?? 0;
    if (prev) {
      const dy = rng.int(310, 390) + Math.min(110, lvl * 12);
      y = prev.y - dy;
      for (let tries = 0; tries < 12; tries++) {
        x = rng.int(70 + orbit, 650 - orbit);
        if (Math.abs(x - prev.x) > 90 || tries > 8) break;
      }
      // keep the two orbits apart
      const d = Math.hypot(x - prev.x, y - prev.y);
      if (d < orbit + prev.orbit0 + 70) y -= orbit + prev.orbit0 + 70 - d;
    }
    let kind: Kind = 'normal';
    if (idx >= 7 && rng.chance(Math.min(0.4, 0.15 + idx * 0.008))) kind = 'shrink';
    else if (idx >= 12 && rng.chance(Math.min(0.45, 0.2 + idx * 0.008))) kind = 'moving';
    const col = PLANET_COLS[idx % PLANET_COLS.length];
    const body = this.add.container(x, y).setDepth(10);
    const g = this.add.graphics();
    g.fillStyle(col, 0.18).fillCircle(0, 0, r + 14);
    g.fillStyle(col, 1).fillCircle(0, 0, r);
    g.fillStyle(0x000000, 0.22).fillCircle(r * 0.32, r * 0.3, r * 0.82);
    g.fillStyle(col, 1).fillCircle(-r * 0.12, -r * 0.12, r * 0.74);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x000000, 0.16).fillCircle(rng.int(-r * 0.5, r * 0.4), rng.int(-r * 0.5, r * 0.4), rng.int(4, Math.max(5, r * 0.22)));
    }
    g.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.4, -r * 0.42, r * 0.18);
    body.add(g);
    if (rng.chance(0.35)) {
      const ringG = this.add.graphics();
      ringG.lineStyle(5, 0xffffff, 0.45).strokeEllipse(0, 0, r * 2.9, r * 0.8);
      ringG.angle = rng.int(-25, 25);
      body.add(ringG);
    }
    const ring = this.add.graphics({ x, y }).setDepth(9);
    const p: Planet = {
      idx, x, y, baseX: x, r, orbit, orbit0: orbit, kind, swing: kind === 'moving' ? rng.int(50, 90) : 0,
      phase: rng.int(0, 628) / 100, dir: rng.chance(0.5) ? 1 : -1, col, body, ring, visited: false,
    };
    if (p.kind === 'moving') {
      p.swing = Math.min(p.swing, 650 - orbit - x, x - 70 - orbit, 90);
      if (p.swing < 30) p.kind = 'normal';
    }
    body.setScale(0);
    this.tweens.add({ targets: body, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.planets.push(p);
    this.drawRing(p);

    // pickups between the previous planet and this one
    if (prev && idx > 1 && rng.chance(0.75)) {
      const n = rng.int(1, 3);
      const mx = (prev.x + x) / 2, my = (prev.y + y) / 2;
      for (let i = 0; i < n; i++) {
        const sx = Phaser.Math.Clamp(mx + rng.int(-140, 140), 50, 670), sy = my + rng.int(-60, 60);
        const img = this.add.image(sx, sy, 'oh-star').setDepth(12);
        this.tweens.add({ targets: img, angle: 360, duration: 3000, repeat: -1 });
        this.tweens.add({ targets: img, scale: 1.2, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.pickups.push({ img, taken: false });
      }
    }
  }

  private drawRing(p: Planet): void {
    const g = p.ring;
    g.clear();
    const shrink = p.kind === 'shrink';
    const col = shrink ? 0xff5a4a : 0xffffff;
    const a = p.visited && p !== this.cur ? 0.2 : shrink ? 0.9 : 0.75;
    // orbit ring: a faint band where the ship gets caught, and a dotted line on the orbit
    g.lineStyle(CAPTURE, col, a * 0.1).strokeCircle(0, 0, p.orbit + CAPTURE / 2);
    const n = Math.max(24, Math.floor(p.orbit / 3.4));
    for (let i = 0; i < n; i++) {
      if (shrink && i % 2) continue;
      const t0 = (i / n) * Math.PI * 2 + (shrink ? this.clock * 0.6 : 0);
      g.fillStyle(col, a).fillCircle(Math.cos(t0) * p.orbit, Math.sin(t0) * p.orbit, shrink ? 4 : 3);
    }
    if (shrink) {
      // inward chevrons: this orbit closes in
      for (let i = 0; i < 4; i++) {
        const t0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const ox = Math.cos(t0) * (p.orbit + 14), oy = Math.sin(t0) * (p.orbit + 14);
        const ix = Math.cos(t0) * (p.orbit + 2), iy = Math.sin(t0) * (p.orbit + 2);
        const px = -Math.sin(t0) * 8, py = Math.cos(t0) * 8;
        g.lineStyle(4, col, a).beginPath().moveTo(ox + px, oy + py).lineTo(ix, iy).lineTo(ox - px, oy - py).strokePath();
      }
    }
  }

  // ---------- ship ----------
  private placeOnOrbit(): void {
    const p = this.cur;
    this.ship.setPosition(p.x + Math.cos(this.ang) * this.rad, p.y + Math.sin(this.ang) * this.rad);
    const heading = this.ang + (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.ship.rotation = heading + Math.PI / 2;      // the sprite points up
    this.flame.setPosition(this.ship.x - Math.cos(heading) * 20, this.ship.y - Math.sin(heading) * 20);
  }

  private launch(): void {
    if (this.mode !== 'orbit' || this.isOver) return;
    if (!this.started) {
      this.started = true;
      this.tweens.killTweensOf(this.hint);
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 250 });
    }
    const heading = this.ang + (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const speed = LAUNCH_V + Math.min(160, this.level * 14);
    this.vx = Math.cos(heading) * speed;
    this.vy = Math.sin(heading) * speed;
    this.left = this.cur;
    this.ship.clearTint();
    this.mode = 'fly';
    this.flyTime = 0;
    this.flame.setConfig({
      lifespan: 380, frequency: 10, speed: { min: 0, max: 30 }, scale: { start: 4, end: 0 },
      alpha: { start: 1, end: 0 }, tint: [0xffd23f, 0xff8a1f, 0xffffff],
    });
    this.sfx('launch', { volume: 0.5 });
    this.tweens.add({ targets: this.ship, scale: 0.62, duration: 80, yoyo: true });
    this.drawRing(this.cur);
  }

  private capture(p: Planet, d: number): void {
    const rx = this.ship.x - p.x, ry = this.ship.y - p.y;
    this.dir = rx * this.vy - ry * this.vx >= 0 ? 1 : -1;
    this.ang = Math.atan2(ry, rx);
    this.rad = d;
    this.cur = p;
    this.mode = 'orbit';
    this.flame.setConfig({
      lifespan: 300, frequency: 30, speed: { min: 0, max: 15 }, scale: { start: 2.4, end: 0 },
      alpha: { start: 0.55, end: 0 }, tint: [0xffd23f, 0xff8a1f, 0xffffff],
    });
    burst(this, this.ship.x, this.ship.y, [p.col, 0xffffff], 18, 240);
    this.tweens.add({ targets: p.body, scale: 1.12, duration: 90, yoyo: true });
    if (!p.visited) {
      p.visited = true;
      const jumped = p.idx - (this.left?.idx ?? 0);
      this.reached++;
      const perfect = Math.abs(d - p.orbit) < 12;
      const pts = 10 * Math.max(1, jumped) + (perfect ? 5 : 0);
      this.addScore(pts, p.x, p.y - p.orbit - 40);
      if (perfect) popup(this, p.x, p.y - p.orbit - 90, t('perfect'), '#5dff7a', 20);
      if (jumped > 1) popup(this, p.x, p.y + p.orbit + 30, t('skip'), '#ff4fa3', 20);
      this.sfxAt('catch', p.x, { volume: 0.55, exact: true, rate: 1 + Math.min(8, this.reached % 9) * 0.04 });
      const lvl = 1 + Math.floor(this.reached / 6);
      if (lvl > this.level) {
        this.level = lvl;
        this.sfx('level', { volume: 0.55, exact: true });
        const b = txt(this, 360, 330, `${t('level')} ${lvl}`, { title: true, size: 44, color: '#ffd23f' }).setScrollFactor(0).setDepth(60).setScale(0.3);
        this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
        this.tweens.add({ targets: b, alpha: 0, delay: 1000, duration: 400, onComplete: () => b.destroy() });
      }
      this.updateHud();
    } else {
      this.sfx('catch', { volume: 0.35, rate: 0.8, exact: true });
    }
    if (p.kind === 'shrink') {
      p.orbit = p.orbit0;
      this.sfx('alarm', { volume: 0.35 });
    }
    // camera brings the new planet down
    this.camY = Math.min(this.camY, p.y - 860);
    this.tweens.add({ targets: this.cameras.main, scrollY: this.camY, duration: 700, ease: 'Sine.easeInOut' });
    this.drawRing(p);
    if (this.left && this.left !== p) this.drawRing(this.left);
    while (this.made - p.idx < 5) this.addPlanet();
    // forget planets far below the view
    const bottom = this.cameras.main.scrollY + 2200;
    this.planets = this.planets.filter((q) => {
      if (q === p || q === this.left || q.y < bottom) return true;
      q.body.destroy();
      q.ring.destroy();
      return false;
    });
    this.pickups = this.pickups.filter((s) => {
      if (s.taken) return false;
      if (s.img.y < bottom + 400) return true;
      this.tweens.killTweensOf(s.img);
      s.img.destroy();
      return false;
    });
  }

  // ---------- update ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.clock += dt;
    const cam = this.cameras.main;
    this.far.tilePositionY = cam.scrollY * 0.15;
    this.near.tilePositionY = cam.scrollY * 0.4;

    for (const p of this.planets) {
      if (p.kind === 'moving') {
        p.x = p.baseX + Math.sin(this.clock * 1.1 + p.phase) * p.swing;
        p.body.x = p.x;
        p.ring.x = p.x;
      }
      if (p.kind === 'shrink') this.drawRing(p);
    }
    for (const s of this.pickups) if (!s.taken && s.img.y > cam.scrollY + 1400) s.img.setVisible(false);

    if (this.mode === 'dead') { this.updateComets(dt); return; }

    if (this.mode === 'orbit') {
      const p = this.cur;
      if (p.kind === 'shrink' && this.started) {
        // the orbit closes in a set number of laps (fewer as the levels go up), so the ship always
        // passes every launch direction before it burns up
        const lap = (2 * Math.PI * p.orbit0) / (250 + Math.min(150, this.level * 14));
        const laps = Math.max(1.6, 3.2 - this.level * 0.2);
        p.orbit = Math.max(p.r - 4, p.orbit - ((p.orbit0 - p.r - 6) / (laps * lap)) * dt);
        this.warnRing += dt;
        if (p.orbit < p.r + 30 && Math.floor(this.warnRing * 6) % 2 === 0) this.ship.setTint(0xff6b5a); else this.ship.clearTint();
      }
      this.rad += (p.orbit - this.rad) * Math.min(1, dt * 4);
      const linear = 250 + Math.min(150, this.level * 14);
      this.ang += this.dir * (linear / Math.max(40, this.rad)) * dt;
      this.placeOnOrbit();
      if (this.rad <= p.r + 6) { this.die(t('burned')); return; }
    } else {
      const heading = Math.atan2(this.vy, this.vx);
      this.ship.rotation = heading + Math.PI / 2;
      // small steps, so a slow frame never carries the ship across a capture band
      const n = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vy) * dt) / 10));
      flight: for (let i = 0; i < n; i++) {
        this.flyTime += dt / n;
        this.ship.x += (this.vx * dt) / n;
        this.ship.y += (this.vy * dt) / n;
        for (const p of this.planets) {
          const d = Math.hypot(this.ship.x - p.x, this.ship.y - p.y);
          if (d < p.r + 6) { this.die(t('crashed')); return; }
          if (p === this.left && this.flyTime < 0.35) continue;
          if (d < p.orbit + CAPTURE) { this.capture(p, d); break flight; }
        }
      }
      if (this.mode === 'fly') {
        this.flame.setPosition(this.ship.x - Math.cos(heading) * 22, this.ship.y - Math.sin(heading) * 22);
        // drifting away (measured from where the camera is heading: it may still be catching up)
        const sx = this.ship.x;
        const top = this.ship.y - Math.min(cam.scrollY, this.camY), bottom = this.ship.y - Math.max(cam.scrollY, this.camY);
        if (sx < -40 || sx > 760 || bottom > 1320 || top < -160) { this.lost(); return; }
      }
    }

    // pickups
    for (const s of this.pickups) {
      if (s.taken || !s.img.visible) continue;
      if (Phaser.Math.Distance.Between(s.img.x, s.img.y, this.ship.x, this.ship.y) < 40) {
        s.taken = true;
        this.stars++;
        this.addScore(5, s.img.x, s.img.y - 30);
        this.sfxAt('star', s.img.x, { volume: 0.5 });
        burst(this, s.img.x, s.img.y, [0xffd23f, 0xffffff], 16, 260);
        this.tweens.killTweensOf(s.img);
        this.tweens.add({ targets: s.img, scale: 2, alpha: 0, duration: 250, onComplete: () => s.img.destroy() });
      }
    }

    this.updateComets(dt);
  }

  private updateComets(dt: number): void {
    const cam = this.cameras.main;
    if (this.started && this.mode !== 'dead' && this.level >= 2) {
      this.cometTimer -= dt;
      if (this.cometTimer <= 0) {
        this.spawnComet();
        this.cometTimer = Math.max(1.6, 5.5 - this.level * 0.45) * Phaser.Math.FloatBetween(0.8, 1.3);
      }
    }
    for (const c of [...this.comets]) {
      if (c.delay > 0) {
        c.delay -= dt;
        if (c.delay <= 0) {
          if (c.warn) { this.tweens.killTweensOf(c.warn); c.warn.destroy(); c.warn = undefined; }
          c.img.setVisible(true);
          c.trail.start();
        }
        continue;
      }
      c.img.x += c.vx * dt;
      c.img.y += c.vy * dt;
      c.img.angle += dt * 120;
      if (this.mode !== 'dead' && Phaser.Math.Distance.Between(c.img.x, c.img.y, this.ship.x, this.ship.y) < SHIP_HIT + c.img.displayWidth * 0.32) {
        this.die(t('comet'));
      }
      if (c.img.x < -200 || c.img.x > 920 || c.img.y > cam.scrollY + 1500) {
        c.trail.destroy();
        c.img.destroy();
        this.comets.splice(this.comets.indexOf(c), 1);
      }
    }
  }

  private spawnComet(): void {
    const cam = this.cameras.main;
    const fromLeft = rng.chance(0.5);
    // comets threaten the flights, never the orbit the ship is on (it can't dodge there)
    let y = cam.scrollY + rng.int(260, 1000);
    for (let tries = 0; tries < 10 && Math.abs(y - this.cur.y) < this.cur.orbit0 + 70; tries++) y = cam.scrollY + rng.int(200, 1000);
    if (Math.abs(y - this.cur.y) < this.cur.orbit0 + 70) return;
    const x = fromLeft ? -80 : 800;
    const speed = rng.int(260, 340) + this.level * 18;
    const vy = rng.int(-60, 60);
    const img = this.add.image(x, y, rng.pick(['oh-meteor1', 'oh-meteor2'])).setScale(rng.pick([0.6, 0.75])).setDepth(15).setVisible(false);
    const trail = this.add.particles(0, 0, ensurePixel(this), {
      follow: img, lifespan: 500, frequency: 14, speed: { min: 10, max: 40 }, scale: { start: 5, end: 0 },
      alpha: { start: 0.6, end: 0 }, tint: [0xff8a1f, 0xffd23f, 0x9a8f88], emitting: false,
    }).setDepth(14);
    // warning sign at the screen edge
    const warn = this.add.container(fromLeft ? 44 : 676, y).setDepth(60);
    const wg = this.add.graphics();
    wg.fillStyle(0xec3013, 1).fillTriangle(0, -26, 26, 20, -26, 20).lineStyle(3, 0xffffff, 1).strokeTriangle(0, -26, 26, 20, -26, 20);
    warn.add([wg, txt(this, 0, 4, '!', { title: true, size: 20, strokeThickness: 0, shadow: false })]);
    this.tweens.add({ targets: warn, alpha: 0.3, duration: 150, yoyo: true, repeat: -1 });
    this.sfx('warn', { volume: 0.35 });
    this.comets.push({ img, vx: fromLeft ? speed : -speed, vy, trail, warn, delay: 1.1 });
  }

  private die(reason: string): void {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    const { x, y } = this.ship;
    this.ship.setVisible(false);
    this.flame.stop();
    burst(this, x, y, [0xffd23f, 0xff8a1f, 0xffffff, 0x3b6fe0], 60, 520);
    this.sfxAt('boom', x, { volume: 0.6 });
    shake(this, 0.03, 400);
    this.flashRed();
    popup(this, x, y - 50, reason, '#ec3013', 22);
    this.endGame({ title: reason, delay: 1200 });
  }

  private lost(): void {
    if (this.mode === 'dead') return;
    this.mode = 'dead';
    this.flame.stop();
    this.sfx('lost', { volume: 0.5 });
    // keep drifting and fade out
    this.tweens.add({ targets: this.ship, x: this.ship.x + this.vx * 0.6, y: this.ship.y + this.vy * 0.6, alpha: 0, scale: 0.2, angle: this.ship.angle + 360, duration: 900 });
    shake(this, 0.01, 200);
    this.endGame({ title: t('lost'), delay: 1200 });
  }

  private flashRed(): void {
    const r = this.add.rectangle(0, 0, 720, 1280, 0xec3013, 0.35).setOrigin(0).setScrollFactor(0).setDepth(8000);
    this.tweens.add({ targets: r, alpha: 0, duration: 320, onComplete: () => r.destroy() });
  }
}
