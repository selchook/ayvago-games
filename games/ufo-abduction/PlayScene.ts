import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';

/** Animal kinds: key, points, weight (heavier = slower lift), level they appear from. */
export const ANIMALS = [
  { k: 'chick', pts: 10, w: 0.8, lv: 1 },
  { k: 'pig', pts: 25, w: 1.1, lv: 1 },
  { k: 'cow', pts: 40, w: 1.4, lv: 1 },
  { k: 'chicken', pts: 15, w: 0.9, lv: 1 },
  { k: 'rabbit', pts: 20, w: 0.95, lv: 2 },
  { k: 'duck', pts: 15, w: 0.9, lv: 2 },
  { k: 'goat', pts: 30, w: 1.25, lv: 3 },
  { k: 'horse', pts: 45, w: 1.5, lv: 3 },
  { k: 'elephant', pts: 90, w: 2.1, lv: 4 },
];

const W = 720, H = 1280;
const GROUND = 1150;
const TOP = 190, BOTTOM = 700;

/** Generated textures shared by the menu and the play scene. */
export function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('sky')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // night sky with a soft horizon glow
  g.fillGradientStyle(0x0b0920, 0x0b0920, 0x2a1f5c, 0x2a1f5c, 1).fillRect(0, 0, W, H);
  g.fillGradientStyle(0x2a1f5c, 0x2a1f5c, 0x51407e, 0x51407e, 1).fillRect(0, 900, W, 380);
  for (let i = 0; i < 90; i++) {
    g.fillStyle(0xffffff, rng.pick([0.3, 0.5, 0.8])).fillRect(rng.int(0, W), rng.int(0, 880), rng.pick([2, 2, 3, 4]), rng.pick([2, 2, 3, 4]));
  }
  g.fillStyle(0xfff6c8, 0.15).fillCircle(570, 330, 92);
  g.fillStyle(0xfff6c8, 1).fillCircle(570, 330, 62);
  g.fillStyle(0xe8dca0, 1).fillCircle(548, 314, 12).fillCircle(590, 350, 9).fillCircle(582, 300, 6);
  // far hills + barn silhouette
  g.fillStyle(0x1d3a3a, 1);
  g.fillEllipse(140, 1120, 520, 260).fillEllipse(560, 1130, 600, 230);
  g.fillStyle(0x15292b, 1);
  g.fillRect(470, 990, 120, 100).fillTriangle(458, 992, 602, 992, 530, 930);
  g.fillStyle(0xffd27a, 0.9).fillRect(518, 1030, 24, 30);
  g.fillStyle(0x15292b, 1).fillRect(610, 960, 26, 130).fillEllipse(623, 960, 26, 20);
  g.generateTexture('sky', W, H);
  g.clear();
  // missile 16x48
  g.fillStyle(0x555b66).fillTriangle(0, 46, 6, 34, 6, 46).fillTriangle(16, 46, 10, 34, 10, 46);
  g.fillStyle(0xd9dde4).fillRect(4, 12, 8, 34);
  g.fillStyle(0xec3013).fillTriangle(4, 12, 12, 12, 8, 0);
  g.fillStyle(0xec3013).fillRect(4, 26, 8, 4);
  g.generateTexture('missile', 16, 48);
  g.clear();
  // ground warning marker
  g.fillStyle(0xec3013).fillTriangle(0, 40, 48, 40, 24, 0);
  g.fillStyle(0xffffff).fillRect(21, 12, 6, 16).fillRect(21, 31, 6, 5);
  g.generateTexture('warn', 48, 42);
  g.clear();
  // side arrow (points right)
  g.fillStyle(0xffd23f).fillTriangle(0, 0, 44, 26, 0, 52);
  g.fillStyle(0xec3013).fillRect(8, 20, 14, 12);
  g.generateTexture('arrow', 44, 52);
  g.destroy();
}

type Mode = 'walk' | 'lift' | 'fall' | 'gone';
interface Animal {
  img: Phaser.GameObjects.Image;
  kind: (typeof ANIMALS)[number];
  mode: Mode;
  vx: number;
  vy: number;
  hop: number;
  baseY: number;
  golden: boolean;
}
interface Missile { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; }
interface Plane { img: Phaser.GameObjects.Sprite; vx: number; }

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ufo!: Phaser.GameObjects.Image;
  private beamG!: Phaser.GameObjects.Graphics;
  private barG!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private animals: Animal[] = [];
  private missiles: Missile[] = [];
  private planes: Plane[] = [];
  private vx = 0;
  private vy = 0;
  private hp = 3;
  private level = 1;
  private caught = 0;
  private quota = 6;
  private energy = 100;
  private overheated = false;
  private beaming = false;
  private invuln = 0;
  private combo = 0;
  private lastCatch = -10;
  private missileCd = 3;
  private planeCd = 8;
  private spawnCd = 0;
  private beamPhase = 0;
  private dead = false;

  createGame(): void {
    makeTextures(this);
    this.animals = []; this.missiles = []; this.planes = [];
    this.vx = 0; this.vy = 0; this.hp = 3; this.level = 1; this.caught = 0; this.quota = this.quotaFor(1);
    this.energy = 100; this.overheated = false; this.beaming = false; this.invuln = 0;
    this.combo = 0; this.lastCatch = -10; this.missileCd = 3.5; this.planeCd = 9; this.spawnCd = 0;
    this.beamPhase = 0; this.dead = false;

    this.add.image(0, 0, 'sky').setOrigin(0);
    this.add.tileSprite(0, GROUND, W, H - GROUND, 'grass').setOrigin(0).setTileScale(0.8);
    this.beamG = this.add.graphics().setDepth(5);
    this.barG = this.add.graphics().setDepth(9000);
    this.ufo = this.add.image(W / 2, 470, 'ufo0').setDepth(20);
    this.trail = this.add.particles(0, 0, 'puff', {
      lifespan: 600, speed: { min: 5, max: 30 }, scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.7, end: 0 },
      tint: [0xcccccc, 0xffaa55], emitting: false,
    }).setDepth(8);

    if (!this.anims.exists('plane-fly')) {
      this.anims.create({ key: 'plane-fly', frames: [{ key: 'plane1' }, { key: 'plane2' }, { key: 'plane3' }, { key: 'plane2' }], frameRate: 20, repeat: -1 });
    }

    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
    this.infoText = txt(this, 24, 70, '', { title: true, size: 18, color: '#7dffb0' }).setOrigin(0, 0).setDepth(9000);
    for (let i = 0; i < 4; i++) this.spawnAnimal(rng.int(80, W - 80));
    this.updateHud();
    this.banner(t('levelUp', { n: 1 }), t('goal', { n: this.quota }));
  }

  private quotaFor(lv: number): number {
    return 5 + lv * 2;
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.hp)}`);
    this.infoText.setText(`${t('level')} ${this.level}  ·  ${t('caught')} ${this.caught}/${this.quota}`);
  }

  private banner(title: string, sub?: string): void {
    const a = txt(this, W / 2, 560, title, { title: true, size: 44, color: '#ffd23f' }).setDepth(9100).setScale(0.3);
    const b = sub ? txt(this, W / 2, 630, sub, { size: 34 }).setDepth(9100).setAlpha(0) : null;
    this.tweens.add({ targets: a, scale: 1, duration: 400, ease: 'Back.easeOut' });
    if (b) this.tweens.add({ targets: b, alpha: 1, duration: 300, delay: 200 });
    this.tweens.add({ targets: b ? [a, b] : [a], alpha: 0, delay: 1700, duration: 400, onComplete: () => { a.destroy(); b?.destroy(); } });
  }

  private spawnAnimal(x?: number): void {
    const pool = ANIMALS.filter((a) => a.lv <= this.level);
    const kind = rng.pick(pool);
    const fromLeft = rng.chance(0.5);
    const img = this.add.image(x ?? (fromLeft ? -60 : W + 60), 0, 'an-' + kind.k).setDepth(10);
    img.setScale(0.36 + kind.w * 0.12);
    const golden = this.level >= 2 && rng.chance(0.08);
    if (golden) img.setTint(0xffe066);
    const baseY = GROUND + 8 - img.displayHeight / 2;
    img.y = baseY;
    const speed = rng.int(45, 85) + this.level * 7;
    const vx = x !== undefined ? rng.pick([-1, 1]) * speed : (fromLeft ? speed : -speed);
    this.animals.push({ img, kind, mode: 'walk', vx, vy: 0, hop: rng.int(0, 100) / 10, baseY, golden });
    img.setScale(0);
    this.tweens.add({ targets: img, scale: 0.36 + kind.w * 0.12, duration: 250, ease: 'Back.easeOut' });
  }

  private hurt(): void {
    if (this.invuln > 0 || this.dead) return;
    this.hp--;
    this.invuln = 1.8;
    this.sfxAt('hurt', this.ufo.x, { volume: 0.6 });
    if (this.hp > 0) this.sfxAt('boom', this.ufo.x, { volume: 0.55 });
    shake(this, 0.02, 300);
    flash(this, 0xec3013, 160);
    burst(this, this.ufo.x, this.ufo.y, [0xff4fa3, 0xffd23f, 0xffffff], 30, 380);
    this.boomFx(this.ufo.x, this.ufo.y, 0.7);
    for (const a of this.animals) if (a.mode === 'lift') { a.mode = 'fall'; a.vy = 0; }
    this.updateHud();
    if (this.hp <= 0) {
      this.dead = true;
      this.sfxAt('die', this.ufo.x, { volume: 0.85 });
      this.boomFx(this.ufo.x, this.ufo.y, 1.4);
      burst(this, this.ufo.x, this.ufo.y, [0x6fe0b0, 0xff4fa3, 0xffd23f], 70, 560);
      shake(this, 0.035, 500);
      this.ufo.setVisible(false);
      this.beamG.clear();
      this.endGame({ delay: 1200 });
    } else {
      this.ufo.setTexture('ufo' + (3 - this.hp));
    }
  }

  private boomFx(x: number, y: number, s: number): void {
    const b = this.add.image(x, y, 'boom').setDepth(40).setScale(0.2 * s).setAngle(rng.int(0, 360));
    this.tweens.add({ targets: b, scale: s, alpha: 0, angle: b.angle + 60, duration: 420, ease: 'Cubic.easeOut', onComplete: () => b.destroy() });
  }

  private abduct(a: Animal): void {
    a.mode = 'gone';
    const since = this.elapsed - this.lastCatch;
    this.combo = since < 2.5 ? Math.min(5, this.combo + 1) : 1;
    this.lastCatch = this.elapsed;
    const pts = (a.golden ? a.kind.pts * 3 : a.kind.pts) * this.combo;
    this.addScore(pts, this.ufo.x, this.ufo.y - 70);
    if (this.combo > 1) {
      popup(this, this.ufo.x + 90, this.ufo.y - 20, `x${this.combo}`, '#ff4fa3', 30);
      this.sfxAt('combo', this.ufo.x, { volume: 0.5, rate: 1 + (this.combo - 2) * 0.08, exact: true });
    } else this.sfxAt(a.golden ? 'golden' : 'grab', this.ufo.x, { volume: a.golden ? 0.55 : 0.45 });
    if (a.golden) { this.energy = 100; this.overheated = false; flash(this, 0xffe066, 120); }
    burst(this, this.ufo.x, this.ufo.y + 20, [0x7dffb0, 0xffffff], 18, 240);
    this.tweens.add({ targets: a.img, scale: 0, y: this.ufo.y, x: this.ufo.x, angle: 360, duration: 220, onComplete: () => a.img.destroy() });
    this.tweens.add({ targets: this.ufo, scaleX: 1.12, scaleY: 0.9, duration: 90, yoyo: true });
    this.caught++;
    if (this.caught >= this.quota) this.levelUp();
    this.updateHud();
  }

  private levelUp(): void {
    this.addScore(this.level * 100, W / 2, 700);
    this.level++;
    this.caught = 0;
    this.quota = this.quotaFor(this.level);
    this.sfx('level', { volume: 0.55, exact: true });
    flash(this, 0x7dffb0, 200);
    // clear the sky of hazards for a short breather
    for (const m of this.missiles) { burst(this, m.img.x, m.img.y, [0xffd23f, 0xaaaaaa], 10, 200); m.img.destroy(); }
    this.missiles = [];
    this.missileCd = 2.5; this.planeCd = Math.max(this.planeCd, 4);
    let sub = t('goal', { n: this.quota });
    if (this.hp < 3) {
      this.hp++;
      this.ufo.setTexture('ufo' + (3 - this.hp));
      sub = t('repaired');
    }
    this.banner(t('levelUp', { n: this.level }), sub);
  }

  private launchMissile(): void {
    const x = Phaser.Math.Clamp(this.ufo.x + rng.int(-260, 260), 40, W - 40);
    const warn = this.add.image(x, GROUND - 30, 'warn').setDepth(30);
    this.sfxAt('warn', x, { volume: 0.35 });
    this.tweens.add({ targets: warn, alpha: 0.2, duration: 120, yoyo: true, repeat: 3 });
    this.time.delayedCall(950, () => {
      warn.destroy();
      if (this.isOver) return;
      const img = this.add.image(x, GROUND, 'missile').setDepth(25).setScale(1.4);
      const speed = 330 + this.level * 22;
      this.missiles.push({ img, vx: 0, vy: -speed, life: 5 });
      const fx = this.add.image(x, GROUND + 6, 'gburst').setOrigin(0.5, 1).setDepth(9).setScale(0.4).setTint(0xffaa55);
      this.tweens.add({ targets: fx, scale: 0.8, alpha: 0, duration: 450, onComplete: () => fx.destroy() });
      this.sfxAt('launch', x, { volume: 0.4 });
      burst(this, x, GROUND, [0xffaa55, 0xaaaaaa], 12, 180);
    });
  }

  private launchPlane(): void {
    const y = Phaser.Math.Clamp(this.ufo.y + rng.int(-110, 110), TOP, BOTTOM);
    const fromLeft = rng.chance(0.5);
    const arrow = this.add.image(fromLeft ? 34 : W - 34, y, 'arrow').setDepth(30).setFlipX(!fromLeft);
    this.sfxAt('warnplane', fromLeft ? 0 : W, { volume: 0.4 });
    this.tweens.add({ targets: arrow, alpha: 0.2, duration: 140, yoyo: true, repeat: 4 });
    this.time.delayedCall(1250, () => {
      arrow.destroy();
      if (this.isOver) return;
      const img = this.add.sprite(fromLeft ? -80 : W + 80, y, 'plane1').setDepth(26).setScale(1.25).setFlipX(!fromLeft);
      img.play('plane-fly');
      const speed = 520 + this.level * 35;
      this.planes.push({ img, vx: fromLeft ? speed : -speed });
      this.sfxAt('jet', fromLeft ? 0 : W, { volume: 0.35 });
    });
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dead) return;
    const c = this.controls;

    // --- beam / energy
    const wantBeam = c.a;
    if (this.overheated && this.energy >= 30) { this.overheated = false; this.sfx('ready', { volume: 0.35 }); }
    const canBeam = wantBeam && !this.overheated;
    if (canBeam && !this.beaming) this.sfxAt('beam', this.ufo.x, { volume: 0.3 });
    this.beaming = canBeam;
    if (this.beaming) {
      this.energy -= (15 + this.level) * dt;
      if (this.energy <= 0) {
        this.energy = 0; this.overheated = true; this.beaming = false;
        popup(this, this.ufo.x, this.ufo.y - 80, t('overheat'), '#ec3013', 24);
        this.sfxAt('overheat', this.ufo.x, { volume: 0.45 });
      }
    } else this.energy = Math.min(100, this.energy + 22 * dt);

    // --- movement (slower while beaming)
    const sp = this.beaming ? 250 : 470;
    this.vx = Phaser.Math.Linear(this.vx, c.axisX * sp, Math.min(1, dt * 8));
    this.vy = Phaser.Math.Linear(this.vy, c.axisY * sp * 0.8, Math.min(1, dt * 8));
    this.ufo.x = Phaser.Math.Clamp(this.ufo.x + this.vx * dt, 70, W - 70);
    this.ufo.y = Phaser.Math.Clamp(this.ufo.y + this.vy * dt, TOP, BOTTOM);
    this.ufo.setAngle(this.vx / 30);
    const bob = Math.sin(this.elapsed * 3) * 4;
    const ux = this.ufo.x, uy = this.ufo.y + bob;
    this.ufo.setAlpha(this.invuln > 0 ? (Math.floor(this.elapsed * 14) % 2 ? 0.35 : 1) : 1);

    // --- beam drawing
    this.beamPhase = (this.beamPhase + dt * 2.2) % 1;
    const g = this.beamG;
    g.clear();
    const top = uy + 26;
    const halfAt = (y: number) => 26 + (y - top) * 0.11;
    if (this.beaming) {
      const pts = [
        new Phaser.Geom.Point(ux - 26, top), new Phaser.Geom.Point(ux + 26, top),
        new Phaser.Geom.Point(ux + halfAt(GROUND), GROUND + 10), new Phaser.Geom.Point(ux - halfAt(GROUND), GROUND + 10),
      ];
      g.fillStyle(0x7dffb0, 0.22).fillPoints(pts, true);
      g.lineStyle(3, 0xb8ffd6, 0.5).strokePoints(pts, true);
      for (let i = 0; i < 6; i++) {
        const f = (i / 6 + 1 - this.beamPhase) % 1;
        const y = top + (GROUND - top) * f;
        g.lineStyle(4, 0xe6fff0, 0.35 * (1 - f) + 0.1).lineBetween(ux - halfAt(y), y, ux + halfAt(y), y);
      }
      g.fillStyle(0x7dffb0, 0.3).fillEllipse(ux, GROUND + 6, halfAt(GROUND) * 2.2, 26);
    }

    // --- energy bar
    const bg = this.barG;
    bg.clear();
    bg.fillStyle(0x000000, 0.6).fillRect(24, 104, 284, 26);
    const col = this.overheated ? (Math.floor(this.elapsed * 8) % 2 ? 0xec3013 : 0x661111) : this.energy < 30 ? 0xffd23f : 0x7dffb0;
    bg.fillStyle(col, 1).fillRect(28, 108, 276 * (this.energy / 100), 18);
    bg.lineStyle(3, 0xffffff, 0.8).strokeRect(24, 104, 284, 26);

    // --- animals
    const target = Math.min(4 + this.level, 9);
    this.spawnCd -= dt;
    const alive = this.animals.filter((a) => a.mode !== 'gone').length;
    if (alive < target && this.spawnCd <= 0) { this.spawnAnimal(); this.spawnCd = rng.int(6, 14) / 10; }
    for (const a of this.animals) {
      if (a.mode === 'gone') continue;
      const img = a.img;
      const inBeam = this.beaming && Math.abs(img.x - ux) < halfAt(img.y) + 10 && img.y > top;
      if (inBeam && a.mode !== 'lift') { a.mode = 'lift'; a.vy = 0; }
      if (!inBeam && a.mode === 'lift') { a.mode = 'fall'; a.vy = 0; }
      if (a.mode === 'walk') {
        a.hop += dt * 9;
        img.x += a.vx * dt;
        img.y = a.baseY - Math.abs(Math.sin(a.hop)) * 10;
        img.setAngle(Math.sin(a.hop) * 6);
        if (rng.chance(dt * 0.12)) a.vx = -a.vx;
        if (img.x < -110 || img.x > W + 110) { a.mode = 'gone'; img.destroy(); }
      } else if (a.mode === 'lift') {
        const lift = 470 / a.kind.w;
        img.y -= lift * dt;
        img.x += (ux - img.x) * Math.min(1, dt * 4);
        img.setAngle(Math.sin(this.elapsed * 10 + a.hop) * 18);
        if (img.y <= uy + 40) this.abduct(a);
      } else if (a.mode === 'fall') {
        a.vy += 1600 * dt;
        img.y += a.vy * dt;
        img.angle += 200 * dt;
        if (img.y >= a.baseY) {
          img.y = a.baseY;
          img.setAngle(0);
          if (a.vy > 700) {
            this.sfxAt('bonk', img.x, { volume: 0.5 });
            burst(this, img.x, GROUND, [0x8b5a2b, 0x6fbf3f], 10, 160);
            this.tweens.add({ targets: img, scaleY: img.scaleY * 0.7, duration: 80, yoyo: true });
          }
          a.mode = 'walk'; a.vy = 0;
        }
      }
    }
    this.animals = this.animals.filter((a) => a.mode !== 'gone' || a.img.active);
    if (this.animals.length > 40) this.animals = this.animals.filter((a) => a.mode !== 'gone');

    // --- hazards
    this.missileCd -= dt;
    if (this.missileCd <= 0) {
      this.launchMissile();
      if (this.level >= 4 && rng.chance(0.3)) this.time.delayedCall(350, () => !this.isOver && this.launchMissile());
      this.missileCd = Math.max(0.9, 3.4 - this.level * 0.32) * (rng.int(70, 130) / 100);
    }
    if (this.level >= 2) {
      this.planeCd -= dt;
      if (this.planeCd <= 0) { this.launchPlane(); this.planeCd = Math.max(2.2, 8 - this.level * 0.7) * (rng.int(75, 125) / 100); }
    }
    const turn = 0.9 + this.level * 0.18;
    for (const m of this.missiles) {
      m.life -= dt;
      const speed = Math.hypot(m.vx, m.vy);
      let ang = Math.atan2(m.vy, m.vx);
      if (m.img.y > uy + 40) {
        const want = Math.atan2(uy - m.img.y, ux - m.img.x);
        const diff = Phaser.Math.Angle.Wrap(want - ang);
        ang += Phaser.Math.Clamp(diff, -turn * dt, turn * dt);
      }
      m.vx = Math.cos(ang) * speed; m.vy = Math.sin(ang) * speed;
      m.img.x += m.vx * dt; m.img.y += m.vy * dt;
      m.img.setRotation(ang + Math.PI / 2);
      this.trail.emitParticleAt(m.img.x - Math.cos(ang) * 30, m.img.y - Math.sin(ang) * 30, 1);
      if (Phaser.Math.Distance.Between(m.img.x, m.img.y, ux, uy) < 52) {
        m.life = -1;
        this.boomFx(m.img.x, m.img.y, 0.6);
        this.hurt();
      }
      if (m.life <= 0 || m.img.y < -60) {
        if (m.img.y > 0) { burst(this, m.img.x, m.img.y, [0xffd23f, 0xec3013], 14, 220); this.sfxAt('fizzle', m.img.x, { volume: 0.25 }); }
        m.img.destroy();
      }
    }
    this.missiles = this.missiles.filter((m) => m.img.active);
    for (const p of this.planes) {
      p.img.x += p.vx * dt;
      p.img.y += Math.sin(this.elapsed * 4 + p.img.x * 0.01) * 20 * dt;
      if (Math.random() < 0.5) this.trail.emitParticleAt(p.img.x - Math.sign(p.vx) * 60, p.img.y + 10, 1);
      if (Math.abs(p.img.x - ux) < 95 && Math.abs(p.img.y - uy) < 55) {
        this.boomFx(p.img.x, p.img.y, 0.8);
        burst(this, p.img.x, p.img.y, [0xec3013, 0xffd23f, 0x333333], 26, 360);
        p.img.destroy();
        this.hurt();
        continue;
      }
      if (p.img.x < -160 || p.img.x > W + 160) p.img.destroy();
    }
    this.planes = this.planes.filter((p) => p.img.active);
  }
}
