import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, t, rng } from '@core';

type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ship!: Body;
  private shieldFx!: Phaser.GameObjects.Image;
  private lasers!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private stars!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lives = 3;
  private wave = 0;
  private fireCd = 0;
  private spawnCd = 0;
  private pending = 0;
  private doubleShot = 0;
  private shield = 0;
  private invuln = 0;
  private dragX: number | null = null;
  private dragY: number | null = null;

  createGame(): void {
    const { width, height } = this.scale;
    this.lives = 3; this.wave = 0; this.pending = 0; this.fireCd = 0; this.spawnCd = 1.2;
    this.doubleShot = 0; this.shield = 0; this.invuln = 0;

    this.stars = this.add.particles(0, -10, 'star', {
      x: { min: 0, max: width }, speedY: { min: 120, max: 420 }, scale: { min: 0.15, max: 0.5 },
      alpha: { min: 0.3, max: 0.9 }, lifespan: 6000, frequency: 60,
    });
    this.stars.fastForward(5000);

    this.lasers = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();

    this.ship = this.physics.add.image(width / 2, height * 0.82, 'ship').setDepth(10) as Body;
    this.ship.setCollideWorldBounds(true).body.setSize(70, 50);
    this.shieldFx = this.add.image(0, 0, 'shield').setDepth(11).setVisible(false).setScale(0.9);

    this.controls = new Controls(this);
    // Direct drag: the ship follows the finger with an offset so it stays visible.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragX = p.x; this.dragY = p.y; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.dragX === null || this.dragY === null) return;
      this.ship.x = Phaser.Math.Clamp(this.ship.x + p.x - this.dragX, 40, width - 40);
      this.ship.y = Phaser.Math.Clamp(this.ship.y + p.y - this.dragY, height * 0.35, height - 60);
      this.dragX = p.x; this.dragY = p.y;
    });
    this.input.on('pointerup', () => { this.dragX = this.dragY = null; });

    this.physics.add.overlap(this.lasers, this.enemies, (l, e) => this.hitEnemy(l as Body, e as Body));
    this.physics.add.overlap(this.ship, this.enemies, (_s, e) => { this.killEnemy(e as Body, false); this.hurt(); });
    this.physics.add.overlap(this.ship, this.enemyShots, (_s, b) => { (b as Body).destroy(); this.hurt(); });
    this.physics.add.overlap(this.ship, this.items, (_s, i) => this.collect(i as Body));

    this.updateHud();
    this.nextWave();
  }

  private updateHud(): void {
    this.hud.setRight(`${t('lives')} ${Math.max(0, this.lives)}`);
    this.hud.setCenter(`${t('wave')} ${this.wave}`);
  }

  private nextWave(): void {
    this.wave++;
    this.updateHud();
    if (this.wave > 1) this.sfx('wave', { volume: 0.5, exact: true });
    const { width } = this.scale;
    const n = 4 + Math.min(10, this.wave * 2);
    const pattern = this.wave % 3;
    for (let i = 0; i < n; i++) {
      this.pending++;
      this.time.delayedCall(i * Math.max(180, 450 - this.wave * 20), () => {
        this.pending--;
        if (this.isOver) return;
        const tier = Math.min(3, 1 + Math.floor(rng.int(0, this.wave) / 3));
        const color = rng.pick(['black', 'blue', 'green']);
        const x = pattern === 0 ? rng.int(60, width - 60) : pattern === 1 ? 80 + ((i * 110) % (width - 160)) : width / 2 + Math.sin(i) * (width / 2 - 80);
        const e = this.enemies.create(x, -60, `enemy-${color}${tier}`) as Body;
        e.setAngle(180).setScale(0.75);
        e.setData('hp', tier).setData('pts', tier * 50).setData('t', 0).setData('pattern', pattern).setData('x0', x);
        e.setVelocityY(110 + this.wave * 12 + rng.int(0, 60));
      });
    }
    // meteors join from wave 2
    if (this.wave >= 2) for (let i = 0; i < Math.min(6, this.wave); i++) {
      this.pending++;
      this.time.delayedCall(rng.int(0, 4000), () => {
        this.pending--;
        if (this.isOver) return;
        const big = rng.chance(0.4);
        const m = this.enemies.create(rng.int(40, width - 40), -80, big ? 'meteor-big' : 'meteor-med') as Body;
        m.setData('hp', big ? 4 : 2).setData('pts', big ? 80 : 30).setData('meteor', true).setData('t', 0);
        m.setVelocity(rng.int(-60, 60), rng.int(160, 260)).setAngularVelocity(rng.int(-90, 90));
      });
    }
  }

  private fire(): void {
    const offs = this.doubleShot > 0 ? [-22, 22] : [0];
    for (const o of offs) {
      const l = this.lasers.create(this.ship.x + o, this.ship.y - 50, 'laser') as Body;
      l.setVelocityY(-950);
    }
    this.sfxAt('shoot', this.ship.x, { volume: 0.22 });
  }

  private hitEnemy(l: Body, e: Body): void {
    l.destroy();
    const hp = (e.getData('hp') as number) - 1;
    e.setData('hp', hp);
    e.setTintFill(0xffffff);
    this.time.delayedCall(60, () => e.active && e.clearTint());
    if (hp <= 0) this.killEnemy(e, true);
    else this.sfxAt('hit', e.x, { volume: 0.4 });
  }

  private killEnemy(e: Body, scored: boolean): void {
    if (!e.active) return;
    if (scored) this.addScore(e.getData('pts') as number, e.x, e.y);
    burst(this, e.x, e.y, e.getData('meteor') ? [0xb5651d, 0x888888] : [0xffd23f, 0xec3013, 0xffffff], 22, 320);
    if (e.getData('meteor')) this.sfxAt('rock', e.x, { volume: 0.5 });
    else this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), e.x, { volume: 0.45 });
    if (scored && rng.chance(0.08)) {
      const it = this.items.create(e.x, e.y, rng.chance(0.5) ? 'pu-bolt' : 'pu-shield') as Body;
      it.setVelocityY(160);
    }
    e.destroy();
  }

  private collect(i: Body): void {
    if (i.texture.key === 'pu-bolt') this.doubleShot = 10;
    else this.shield = 8;
    this.sfxAt(i.texture.key === 'pu-bolt' ? 'power-bolt' : 'power-shield', i.x, { volume: 0.65 });
    flash(this, 0x3ee6ff, 100);
    i.destroy();
  }

  private hurt(): void {
    if (this.invuln > 0 || this.isOver) return;
    if (this.shield > 0) { this.shield = 0; this.invuln = 1; this.sfxAt('shieldhit', this.ship.x, { volume: 0.6 }); return; }
    this.lives--;
    this.invuln = 2;
    if (this.lives > 0) this.sfxAt('hurt', this.ship.x, { volume: 0.7 });
    shake(this, 0.02, 250);
    flash(this, 0xec3013, 150);
    this.updateHud();
    if (this.lives <= 0) {
      burst(this, this.ship.x, this.ship.y, [0xec3013, 0xffd23f], 60, 500);
      this.ship.setVisible(false);
      this.sfxAt('die', this.ship.x, { volume: 0.85 });
      this.endGame();
    }
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const c = this.controls;
    if (c.axisX || c.axisY) {
      this.ship.x = Phaser.Math.Clamp(this.ship.x + c.axisX * 560 * dt, 40, width - 40);
      this.ship.y = Phaser.Math.Clamp(this.ship.y + c.axisY * 560 * dt, height * 0.35, height - 60);
    }
    this.fireCd -= dt; this.spawnCd -= dt;
    this.doubleShot = Math.max(0, this.doubleShot - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.fireCd <= 0) { this.fire(); this.fireCd = 0.18; }

    this.ship.setAlpha(this.invuln > 0 && this.shield <= 0 ? (Math.floor(this.elapsed * 12) % 2 ? 0.3 : 1) : 1);
    this.shieldFx.setVisible(this.shield > 0).setPosition(this.ship.x, this.ship.y);

    for (const obj of this.enemies.getChildren() as Body[]) {
      const tt = (obj.getData('t') as number) + dt;
      obj.setData('t', tt);
      if (!obj.getData('meteor')) {
        if (obj.getData('pattern') === 2) obj.x = (obj.getData('x0') as number) + Math.sin(tt * 2.2) * 90;
        if (rng.chance(dt * (0.15 + this.wave * 0.03)) && obj.y > 0 && obj.y < height * 0.6) {
          const b = this.enemyShots.create(obj.x, obj.y + 30, 'elaser') as Body;
          const a = Phaser.Math.Angle.Between(obj.x, obj.y, this.ship.x, this.ship.y);
          b.setVelocity(Math.cos(a) * 320, Math.sin(a) * 320).setRotation(a - Math.PI / 2);
          this.sfxAt('eshot', obj.x, { volume: 0.14 });
        }
      }
      if (obj.y > height + 100) obj.destroy();
    }
    for (const g of [this.lasers, this.enemyShots, this.items]) {
      for (const o of g.getChildren() as Body[]) if (o.y < -60 || o.y > height + 60 || o.x < -60 || o.x > width + 60) o.destroy();
    }
    if (this.pending === 0 && this.enemies.countActive() === 0) {
      if (this.spawnCd <= 0) { this.spawnCd = 1.2; this.nextWave(); }
    } else this.spawnCd = Math.max(this.spawnCd, 0.8);
  }
}
