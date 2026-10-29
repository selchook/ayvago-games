import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, txt, t, rng } from '@core';

interface Missile { x0: number; y0: number; x: number; y: number; vx: number; vy: number; ty: number; target: Site; splitAt: number; head: Phaser.GameObjects.Image }
interface Interceptor { x0: number; y0: number; x: number; y: number; tx: number; ty: number; vx: number; vy: number; marker: Phaser.GameObjects.Image }
interface Blast { x: number; y: number; r: number; max: number; t: number; grow: number; hold: number; fade: number; player: boolean; kills: number; chain: number }
interface Site { kind: 'city' | 'base'; x: number; alive: boolean; img: Phaser.GameObjects.Image; ammo: number; gun?: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }

const GROUND_Y = 1150;
const BASE_X = [70, 360, 650];
const CITY_X = [150, 220, 290, 430, 500, 570];
const AMMO = 10;
const BLAST_COLORS = [0xffffff, 0xffd23f, 0xff7b00, 0xec3013, 0xff4fa3, 0x3ee6ff];

/** City/ruin/hill textures drawn once with Graphics (no matching Kenney art). */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('city')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const blds = [[0, 22, 26], [10, 14, 40], [22, 12, 30], [32, 16, 46], [46, 18, 34]];
  const cols = [0x3e6fd8, 0x5d8af0, 0x4a5fc1, 0x6aa2ff, 0x3e6fd8];
  blds.forEach(([x, w, h], i) => {
    g.fillStyle(cols[i]).fillRect(x, 48 - h, w, h);
    g.fillStyle(0xffe27a);
    for (let wy = 48 - h + 4; wy < 44; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 5) if ((wx * 7 + wy * 3 + i) % 4) g.fillRect(wx, wy, 2, 3);
  });
  g.generateTexture('city', 64, 48);
  g.clear();
  g.fillStyle(0x4a4038).fillRect(0, 10, 64, 6);
  g.fillStyle(0x6a5a4a).fillTriangle(4, 10, 14, 2, 22, 10).fillTriangle(26, 10, 36, 4, 46, 10).fillTriangle(44, 10, 54, 0, 62, 10);
  g.generateTexture('ruin', 64, 16);
  g.clear();
  g.fillStyle(0x6b4a2a).fillTriangle(0, 60, 50, 0, 100, 60);
  g.fillStyle(0x8a6238).fillTriangle(20, 60, 50, 14, 80, 60);
  g.generateTexture('hill', 100, 60);
  g.destroy();
}

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private gfx!: Phaser.GameObjects.Graphics;
  private cross!: Phaser.GameObjects.Image;
  private sites: Site[] = [];
  private missiles: Missile[] = [];
  private shots: Interceptor[] = [];
  private blasts: Blast[] = [];
  private wave = 0;
  private toSpawn = 0;
  private spawnCd = 0;
  private tallying = false;
  private nextBonus = 10000;
  private bonusCities = 0;

  createGame(): void {
    const { width, height } = this.scale;
    makeTextures(this);
    this.sites = []; this.missiles = []; this.shots = []; this.blasts = [];
    this.wave = 0; this.toSpawn = 0; this.spawnCd = 0; this.tallying = false; this.nextBonus = 10000; this.bonusCities = 0;

    // night sky
    const sky = this.add.graphics();
    for (let i = 0; i < 16; i++) sky.fillStyle(Phaser.Display.Color.GetColor(10 + i * 2, 7 + i, 24 + i * 3)).fillRect(0, (GROUND_Y / 16) * i, width, GROUND_Y / 16 + 1);
    for (let i = 0; i < 80; i++) {
      const s = this.add.image(rng.int(0, width), rng.int(70, GROUND_Y - 150), 'star').setScale(0.06 + Math.random() * 0.16).setAlpha(0.2 + Math.random() * 0.5);
      if (i % 5 === 0) this.tweens.add({ targets: s, alpha: 0.05, duration: rng.int(500, 1500), yoyo: true, repeat: -1 });
    }
    // ground + hills under the launch bases
    this.add.rectangle(0, GROUND_Y, width, height - GROUND_Y, 0x2b1d0e).setOrigin(0);
    this.add.rectangle(0, GROUND_Y, width, 6, 0x8a6238).setOrigin(0);
    for (const x of BASE_X) {
      this.add.image(x, GROUND_Y + 2, 'hill').setOrigin(0.5, 1);
      const img = this.add.image(x, GROUND_Y - 52, 'turret').setDepth(3);
      const gun = this.add.image(x, GROUND_Y - 52, 'gun').setOrigin(0.5, 0.85).setDepth(2);
      const label = txt(this, x, GROUND_Y + 40, String(AMMO), { title: true, size: 18, color: '#3ee6ff' }).setDepth(20);
      this.sites.push({ kind: 'base', x, alive: true, img, ammo: AMMO, gun, label });
    }
    for (const x of CITY_X) {
      const img = this.add.image(x, GROUND_Y + 2, 'city').setOrigin(0.5, 1).setDepth(3);
      this.sites.push({ kind: 'city', x, alive: true, img, ammo: 0 });
    }

    this.gfx = this.add.graphics().setDepth(6);
    this.cross = this.add.image(width / 2, height * 0.45, 'crosshair').setDepth(50).setAlpha(0.9);
    this.controls = new Controls(this);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.cross.setPosition(p.x, Math.min(p.y, GROUND_Y - 90)));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > width - 130 && p.y < 130) return;   // pause button area
      this.cross.setPosition(p.x, Math.min(p.y, GROUND_Y - 90));
      this.launch(p.x, p.y);
    });
    this.nextWave();
  }

  private get mult(): number { return Math.min(6, 1 + Math.floor((this.wave - 1) / 2)); }

  private cityCount(): number { return this.sites.filter((s) => s.kind === 'city' && s.alive).length; }

  private updateHud(): void {
    this.hud.setCenter(`${t('wave')} ${this.wave}`);
    this.hud.setRight(`x${this.mult}`);
  }

  private banner(s: string, color: string, y = 0.4, hold = 1300): void {
    const { width, height } = this.scale;
    const b = txt(this, width / 2, height * y, s, { title: true, size: 36, color, wrap: width - 60 }).setDepth(7000).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: hold, duration: 400, onComplete: () => b.destroy() });
  }

  private refreshAmmo(): void {
    for (const s of this.sites) if (s.kind === 'base') {
      const txtv = !s.alive || s.ammo === 0 ? t('out') : s.ammo <= 3 ? t('low') : String(s.ammo);
      s.label!.setText(txtv).setColor(!s.alive || s.ammo === 0 ? '#ec3013' : s.ammo <= 3 ? '#ffd23f' : '#3ee6ff');
    }
  }

  private nextWave(): void {
    this.wave++;
    this.tallying = false;
    for (const s of this.sites) if (s.kind === 'base') {
      s.alive = true; s.ammo = AMMO;
      s.img.setVisible(true); s.gun!.setVisible(true);
    }
    this.refreshAmmo();
    this.updateHud();
    this.toSpawn = Math.min(34, 8 + this.wave * 3);
    this.spawnCd = 1.6;
    this.banner(`${t('wave')} ${this.wave}`, '#ffd23f');
    if (this.mult > 1) popup(this, this.scale.width / 2, this.scale.height * 0.47, `x${this.mult}`, '#ff4fa3', 30);
    this.sfx('wave', { volume: 0.35 });
  }

  // ---------- player ----------
  private launch(tx: number, ty: number): void {
    if (this.tallying || this.isOver) return;
    ty = Math.min(ty, GROUND_Y - 90);
    const bases = this.sites.filter((s) => s.kind === 'base' && s.alive && s.ammo > 0);
    if (!bases.length) { this.sfxAt('empty', tx, { volume: 0.5 }); return; }
    const b = bases.reduce((best, s) => (Math.abs(s.x - tx) < Math.abs(best.x - tx) ? s : best));
    b.ammo--;
    this.refreshAmmo();
    const x0 = b.x, y0 = GROUND_Y - 80;
    const a = Math.atan2(ty - y0, tx - x0);
    const speed = b.x === BASE_X[1] ? 1150 : 820;
    b.gun!.setRotation(a + Math.PI / 2);
    const marker = this.add.image(tx, ty, 'marker').setScale(0.5).setDepth(7);
    this.tweens.add({ targets: marker, angle: 180, duration: 600, repeat: -1 });
    this.shots.push({ x0, y0, x: x0, y: y0, tx, ty, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, marker });
    this.sfxAt('launch', x0, { volume: 0.3 });
  }

  private blast(x: number, y: number, player: boolean, max = 78, chain = 0): void {
    this.blasts.push({ x, y, r: 4, max, t: 0, grow: 0.32, hold: 0.25, fade: 0.45, player, kills: 0, chain });
    burst(this, x, y, player ? [0xffffff, 0xffd23f, 0x3ee6ff] : [0xec3013, 0xff7b00, 0xffd23f], player ? 14 : 22, 220);
    if (player) this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), x, { volume: 0.45 });
    else this.sfxAt('impact', x, { volume: 0.55 });
  }

  // ---------- enemies ----------
  private pickTarget(): Site {
    const alive = this.sites.filter((s) => s.alive);
    const pool = alive.length ? alive : this.sites;
    // cities are the main target, bases get shelled too
    const cities = pool.filter((s) => s.kind === 'city');
    return cities.length && rng.chance(0.72) ? rng.pick(cities) : rng.pick(pool);
  }

  private spawnMissile(x0?: number, y0?: number, target?: Site): void {
    const tgt = target ?? this.pickTarget();
    const sx = x0 ?? rng.int(20, this.scale.width - 20), sy = y0 ?? 60;
    const tx = tgt.x + rng.int(-10, 10), ty = GROUND_Y - 10;
    const speed = Math.min(240, 66 + this.wave * 13) * (0.85 + Math.random() * 0.3);
    const a = Math.atan2(ty - sy, tx - sx);
    const canSplit = x0 === undefined && this.wave >= 3 && rng.chance(Math.min(0.35, 0.08 + this.wave * 0.03));
    const head = this.add.image(sx, sy, 'warhead').setScale(0.35).setDepth(8);
    this.missiles.push({ x0: sx, y0: sy, x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, ty, target: tgt, splitAt: canSplit ? rng.int(300, 650) : Infinity, head });
  }

  private removeMissile(i: number): void {
    this.missiles[i].head.destroy();
    this.missiles.splice(i, 1);
  }

  private impact(m: Missile): void {
    const s = m.target;
    this.blast(m.x, GROUND_Y - 14, false, 46);
    shake(this, 0.012, 200);
    if (!s.alive) return;
    s.alive = false;
    const left = this.cityCount();
    this.sfxAt(left === 0 ? 'fallen' : 'ruin', s.x, { volume: left === 0 ? 0.9 : 0.75 });
    if (left === 1 && s.kind === 'city') this.sfx('low', { volume: 0.45, delay: 0.6 });
    flash(this, 0xec3013, 140);
    burst(this, s.x, GROUND_Y - 24, [0xec3013, 0xffd23f, 0x5d8af0, 0x888888], 40, 360);
    if (s.kind === 'city') s.img.setTexture('ruin');
    else { s.ammo = 0; s.img.setVisible(false); s.gun!.setVisible(false); this.refreshAmmo(); }
    if (this.cityCount() === 0) {
      for (const c of this.sites) if (c.kind === 'city') burst(this, c.x, GROUND_Y - 20, [0xec3013, 0xffd23f], 20, 300);
      shake(this, 0.03, 600);
      this.endGame({ title: t('fallen'), delay: 1500 });
    }
  }

  // ---------- wave end ----------
  private tally(): void {
    this.tallying = true;
    const { width, height } = this.scale;
    const ammo = this.sites.filter((s) => s.kind === 'base').reduce((n, s) => n + s.ammo, 0);
    const cities = this.sites.filter((s) => s.kind === 'city' && s.alive);
    this.banner(t('levelClear'), '#5dff7a', 0.3, 2400);
    this.sfx('clear', { volume: 0.65, exact: true });
    let delay = 600;
    for (const s of this.sites) if (s.kind === 'base' && s.ammo > 0) {
      for (let k = 0; k < s.ammo; k++) {
        this.time.delayedCall(delay, () => { this.addScore(5 * this.mult); this.sfx('tally', { volume: 0.25 }); });
        delay += 45;
      }
      const base = s;
      this.time.delayedCall(delay, () => { base.ammo = 0; this.refreshAmmo(); });
    }
    for (const c of cities) {
      delay += 200;
      this.time.delayedCall(delay, () => {
        this.addScore(100 * this.mult, c.x, GROUND_Y - 70);
        this.tweens.add({ targets: c.img, scaleY: 1.2, duration: 120, yoyo: true });
        this.sfxAt('tallyCity', c.x, { volume: 0.45 });
      });
    }
    popup(this, width / 2, height * 0.38, `${t('ammo')} ${ammo}  ${t('cities')} ${cities.length}`, '#3ee6ff', 22);
    this.time.delayedCall(delay + 500, () => {
      if (this.isOver) return;
      // bonus cities rebuild a ruin
      while (this.score >= this.nextBonus) { this.nextBonus += 10000; this.bonusCities++; }
      const ruin = this.sites.find((s) => s.kind === 'city' && !s.alive);
      if (this.bonusCities > 0 && ruin) {
        this.bonusCities--;
        ruin.alive = true; ruin.img.setTexture('city').setScale(0);
        this.tweens.add({ targets: ruin.img, scale: 1, duration: 400, ease: 'Back.easeOut' });
        this.banner(t('bonusCity'), '#ff4fa3', 0.5);
        this.sfx('bonus', { volume: 0.7 });
      }
    });
    this.time.delayedCall(delay + 1800, () => { if (!this.isOver) this.nextWave(); });
  }

  // ---------- loop ----------
  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width } = this.scale;
    const c = this.controls;

    // keyboard crosshair
    if (c.axisX || c.axisY) {
      this.cross.x = Phaser.Math.Clamp(this.cross.x + c.axisX * 720 * dt, 10, width - 10);
      this.cross.y = Phaser.Math.Clamp(this.cross.y + c.axisY * 720 * dt, 80, GROUND_Y - 90);
    }
    if (c.justA() || c.justB()) this.launch(this.cross.x, this.cross.y);
    this.cross.setScale(1 + Math.sin(this.elapsed * 8) * 0.06);

    // spawn this wave's missiles in small salvos
    if (this.toSpawn > 0 && !this.tallying) {
      this.spawnCd -= dt;
      if (this.spawnCd <= 0) {
        const salvo = Math.min(this.toSpawn, rng.int(1, Math.min(4, 1 + Math.floor(this.wave / 2))));
        for (let i = 0; i < salvo; i++) this.spawnMissile();
        this.toSpawn -= salvo;
        this.spawnCd = Math.max(0.9, 3.2 - this.wave * 0.18) * (0.6 + Math.random() * 0.6);
      }
    }

    // interceptors
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      if ((s.vy < 0 && s.y <= s.ty) || (s.vy >= 0 && s.y >= s.ty) || Phaser.Math.Distance.Between(s.x, s.y, s.tx, s.ty) < 12) {
        s.marker.destroy();
        this.shots.splice(i, 1);
        this.blast(s.tx, s.ty, true);
      }
    }

    // enemy missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      m.head.setPosition(m.x, m.y).angle += 300 * dt;
      if (m.y >= m.splitAt) {
        m.splitAt = Infinity;
        this.sfxAt('split', m.x, { volume: 0.3 });
        for (let k = 0; k < 2; k++) this.spawnMissile(m.x, m.y);
      }
      if (m.y >= m.ty) { this.impact(m); this.removeMissile(i); }
    }

    // blasts: grow, hold, fade; anything inside dies (chain reactions!)
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      if (b.t < b.grow) b.r = b.max * (b.t / b.grow);
      else if (b.t < b.grow + b.hold) b.r = b.max;
      else b.r = b.max * Math.max(0, 1 - (b.t - b.grow - b.hold) / b.fade);
      if (b.player && b.r > 6) {
        for (let j = this.missiles.length - 1; j >= 0; j--) {
          const m = this.missiles[j];
          if (Phaser.Math.Distance.Between(b.x, b.y, m.x, m.y) > b.r) continue;
          b.kills++;
          const pts = 25 * this.mult * (1 + b.chain);
          this.addScore(pts, m.x, m.y - 20);
          this.sfxAt('pop', m.x, { volume: 0.35 });
          const mx = m.x, my = m.y;
          this.removeMissile(j);
          this.blast(mx, my, true, 44, b.chain + 1);
          if (b.kills === 3) { popup(this, b.x, b.y - 60, `${t('combo')}!`, '#ff4fa3', 24); this.sfx('combo', { volume: 0.55 }); }
        }
      }
      if (b.t >= b.grow + b.hold + b.fade) this.blasts.splice(i, 1);
    }

    this.draw();

    // wave over?
    if (!this.tallying && !this.isOver && this.toSpawn === 0 && !this.missiles.length && !this.shots.length && !this.blasts.length) this.tally();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    for (const m of this.missiles) {
      g.lineStyle(3, 0xec3013, 0.85).lineBetween(m.x0, m.y0, m.x, m.y);
      g.lineStyle(1, 0xffd23f, 0.6).lineBetween(m.x0, m.y0, m.x, m.y);
    }
    for (const s of this.shots) {
      g.lineStyle(3, 0x3ee6ff, 0.9).lineBetween(s.x0, s.y0, s.x, s.y);
      g.fillStyle(0xffffff).fillCircle(s.x, s.y, 4);
    }
    const flick = Math.floor(this.elapsed * 20);
    for (const b of this.blasts) {
      const col = BLAST_COLORS[(flick + Math.floor(b.x)) % BLAST_COLORS.length];
      g.fillStyle(b.player ? col : 0xec3013, b.player ? 0.85 : 0.7).fillCircle(b.x, b.y, b.r);
      g.fillStyle(0xffffff, 0.6).fillCircle(b.x, b.y, b.r * 0.45);
    }
  }
}
