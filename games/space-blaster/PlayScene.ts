import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, txt, rng } from '@core';
import { BankedShip } from './BankedShip';
import { makeFx, makeNebula, makePlanet, makeStars } from './art';

type Body = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
const ADD = Phaser.BlendModes.ADD;

export class PlayScene extends ArcadeScene {
  private controls!: Controls;
  private ship!: Body;            // invisible hitbox; the visible hull is `bank`
  private bank!: BankedShip;
  private shieldFx!: Phaser.GameObjects.Image;
  private lasers!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private layers: { ts: Phaser.GameObjects.TileSprite; speed: number }[] = [];
  private planet!: Phaser.GameObjects.Image;
  private warp = 1;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private timers!: Phaser.GameObjects.Graphics;
  private timerIcons: Phaser.GameObjects.Image[] = [];
  private vig!: Phaser.GameObjects.Image;
  private hurtT = 0;
  private lives = 3;
  private wave = 0;
  private fireCd = 0;
  private spawnCd = 0;
  private pending = 0;
  private doubleShot = 0;
  private shield = 0;
  private invuln = 0;

  createGame(): void {
    const { width, height } = this.scale;
    this.lives = 3; this.wave = 0; this.pending = 0; this.fireCd = 0; this.spawnCd = 1.2;
    this.doubleShot = 0; this.shield = 0; this.invuln = 0;

    // parallax space: nebula, a far planet now and then, two star layers
    makeFx(this); makeNebula(this, width, height); makePlanet(this);
    makeStars(this, 'sb-stars-far', width, height, 260, false, 3);
    makeStars(this, 'sb-stars-near', width, height, 90, true, 9);
    this.warp = 1; this.hurtT = 0; this.lifeIcons = []; this.timerIcons = [];
    this.layers = [
      { ts: this.add.tileSprite(0, 0, width, height, 'sb-nebula').setOrigin(0).setDepth(-10), speed: 14 },
      { ts: this.add.tileSprite(0, 0, width, height, 'sb-stars-far').setOrigin(0).setDepth(-8), speed: 60 },
      { ts: this.add.tileSprite(0, 0, width, height, 'sb-stars-near').setOrigin(0).setDepth(-7), speed: 190 },
    ];
    this.planet = this.add.image(width * 0.75, -200, 'sb-planet').setDepth(-9).setAlpha(0.85);
    this.vig = this.add.image(width / 2, height / 2, 'sb-vig').setDisplaySize(width, height).setDepth(50).setAlpha(0);
    this.timers = this.add.graphics().setDepth(9000);
    for (const k of ['pu-bolt', 'pu-shield']) this.timerIcons.push(this.add.image(0, 0, k).setScale(0.55).setDepth(9001).setVisible(false));

    this.lasers = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.items = this.physics.add.group();

    this.ship = this.physics.add.image(width / 2, height * 0.82, 'ship').setDepth(10) as Body;
    this.ship.setCollideWorldBounds(true).body.setSize(70, 50);
    this.ship.setVisible(false);
    this.bank = new BankedShip(this, this.ship.x, this.ship.y, 'ship', {
      depth: 10, flameKeys: ['flame1', 'flame2'], trailTints: [0xffb347, 0xff6a3d, 0xffe08a],
      flames: [{ x: 0, y: 34, s: 1.15 }, { x: -25, y: 24, s: 0.6 }, { x: 25, y: 24, s: 0.6 }],
    });
    this.shieldFx = this.add.image(0, 0, 'shield').setDepth(11).setVisible(false).setScale(0.9);

    // Touch: floating stick anywhere (fire is automatic, so no buttons). Keyboard: arrows/WASD.
    this.controls = new Controls(this, { joystick: true });

    this.physics.add.overlap(this.lasers, this.enemies, (l, e) => this.hitEnemy(l as Body, e as Body));
    this.physics.add.overlap(this.ship, this.enemies, (_s, e) => { this.killEnemy(e as Body, false); this.hurt(); });
    this.physics.add.overlap(this.ship, this.enemyShots, (_s, b) => { (b as Body).destroy(); this.hurt(); });
    this.physics.add.overlap(this.ship, this.items, (_s, i) => this.collect(i as Body));

    this.updateHud();
    this.nextWave();
  }

  private updateHud(): void {
    // lives as little ships, top right next to the pause button
    this.hud.setRight('');
    while (this.lifeIcons.length < Math.max(0, this.lives)) {
      const i = this.lifeIcons.length;
      const im = this.add.image(this.scale.width - 130 - i * 46, 38, 'life').setDepth(9000).setScale(0);
      this.tweens.add({ targets: im, scale: 1.1, duration: 240, ease: 'Back.easeOut' });
      this.lifeIcons.push(im);
    }
    while (this.lifeIcons.length > Math.max(0, this.lives)) {
      const im = this.lifeIcons.pop()!;
      this.glow(im.x, im.y, 0xec3013, 1, 300, 9001);
      this.tweens.add({ targets: im, scale: 2, alpha: 0, duration: 300, onComplete: () => im.destroy() });
    }
    this.hud.setCenter(`${t('wave')} ${this.wave}`);
  }

  // ---------- effects ----------
  private glow(x: number, y: number, tint: number, scale: number, ms: number, depth = 20): void {
    const g = this.add.image(x, y, 'sb-glow').setBlendMode(ADD).setTint(tint).setScale(scale * 0.4).setDepth(depth);
    this.tweens.add({ targets: g, scale, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  private ring(x: number, y: number, tint: number, scale: number, ms: number): void {
    const r = this.add.image(x, y, 'sb-ring').setBlendMode(ADD).setTint(tint).setScale(0.1).setDepth(21);
    this.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  /** The hull breaks into four tumbling pieces. */
  private debris(e: Phaser.GameObjects.Image): void {
    const key = e.texture.key, fw = e.width, fh = e.height;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const p = this.add.image(e.x, e.y, key).setScale(e.scaleX, e.scaleY).setAngle(e.angle).setCrop(i * fw / 2, j * fh / 2, fw / 2, fh / 2).setDepth(9);
      const a = Math.atan2(j - 0.5, i - 0.5) + rng.int(-40, 40) / 100, d = rng.int(70, 150);
      this.tweens.add({ targets: p, x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d + 60, angle: p.angle + rng.int(-240, 240), duration: 700, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: p, alpha: 0, delay: 350, duration: 350, onComplete: () => p.destroy() });
      p.setTintFill(0xffd2a0);
      this.time.delayedCall(70, () => p.active && p.setTint(0x9a8a80));
    }
  }

  /** A big meteor throws smaller rocks. */
  private rocks(x: number, y: number, big: boolean): void {
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const r = this.add.image(x, y, rng.chance(0.5) ? 'meteor-small' : 'meteor-tiny').setDepth(9).setAngle(rng.int(0, 359));
      const a = rng.int(0, 628) / 100, d = rng.int(60, big ? 170 : 110);
      this.tweens.add({ targets: r, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 80, angle: r.angle + rng.int(-300, 300), duration: 800, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: r, alpha: 0, scale: 0.5, delay: 450, duration: 350, onComplete: () => r.destroy() });
    }
  }

  /** Wave start: the stars streak past for a moment and a ribbon names the wave. */
  private waveBanner(): void {
    const { width, height } = this.scale;
    this.tweens.addCounter({ from: 6, to: 1, duration: 1100, ease: 'Cubic.easeOut', onUpdate: (tw) => { this.warp = tw.getValue() ?? 1; } });
    for (let i = 0; i < 18; i++) {
      const sp = this.add.image(rng.int(10, width - 10), rng.int(-200, height), 'speed').setBlendMode(ADD).setAlpha(0.6).setScale(1, rng.int(15, 40) / 10).setDepth(-6);
      this.tweens.add({ targets: sp, y: sp.y + height, alpha: 0, duration: rng.int(500, 900), ease: 'Quad.easeIn', onComplete: () => sp.destroy() });
    }
    const y = height * 0.38;
    const band = this.add.image(width / 2, y, 'sb-ribbon').setDisplaySize(width, 110).setTint(0x3ee6ff).setDepth(60);
    const sy = band.scaleY;
    band.scaleY = 0;
    const lbl = txt(this, width + 300, y, `${t('wave')} ${this.wave}`, { title: true, size: 44, color: '#ffd23f' }).setDepth(61);
    this.tweens.add({ targets: band, scaleY: sy, duration: 160 });
    this.tweens.add({ targets: lbl, x: width / 2, duration: 340, ease: 'Back.easeOut' });
    this.time.delayedCall(1150, () => {
      this.tweens.add({ targets: lbl, x: -300, duration: 260, ease: 'Cubic.easeIn', onComplete: () => lbl.destroy() });
      this.tweens.add({ targets: band, scaleY: 0, delay: 140, duration: 180, onComplete: () => band.destroy() });
    });
  }

  private nextWave(): void {
    this.wave++;
    this.updateHud();
    if (this.wave > 1) this.sfx('wave', { volume: 0.5, exact: true });
    this.waveBanner();
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
      l.setVelocityY(-950).setBlendMode(ADD);
      const m = this.add.image(this.ship.x + o, this.ship.y - 46, 'sb-glow').setBlendMode(ADD).setTint(0xff6a4d).setScale(0.32).setDepth(12);
      this.tweens.add({ targets: m, scale: 0.12, alpha: 0, duration: 90, onComplete: () => m.destroy() });
    }
    this.sfxAt('shoot', this.ship.x, { volume: 0.22 });
  }

  private hitEnemy(l: Body, e: Body): void {
    const fx = this.add.image(l.x, l.y - 10, 'impact').setBlendMode(ADD).setDepth(21).setScale(0.6).setAngle(rng.int(0, 90));
    this.tweens.add({ targets: fx, scale: 1.2, alpha: 0, duration: 140, onComplete: () => fx.destroy() });
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
    const meteor = !!e.getData('meteor');
    burst(this, e.x, e.y, meteor ? [0xb5651d, 0x888888, 0xd9b38c] : [0xffd23f, 0xec3013, 0xffffff], meteor ? 18 : 30, meteor ? 260 : 380);
    if (meteor) {
      this.rocks(e.x, e.y, e.texture.key === 'meteor-big');
      this.glow(e.x, e.y, 0xd9a066, 1.4, 300);
    } else {
      const big = (e.getData('pts') as number) >= 100;
      this.glow(e.x, e.y, 0xffa040, big ? 2.6 : 2, 380);
      this.glow(e.x, e.y, 0xffffff, 0.9, 160, 22);
      this.ring(e.x, e.y, 0xffd2a0, big ? 2.2 : 1.6, 360);
      this.debris(e);
      // a couple of smaller blasts follow
      for (let i = 0; i < (big ? 3 : 2); i++) {
        const ox = e.x + rng.int(-34, 34), oy = e.y + rng.int(-30, 30);
        this.time.delayedCall(80 + i * 90, () => { this.glow(ox, oy, 0xff6a3d, 1.1, 260); burst(this, ox, oy, [0xffd23f, 0xff6a3d], 8, 200); });
      }
      if (big) shake(this, 0.006, 120);
    }
    if (e.getData('meteor')) this.sfxAt('rock', e.x, { volume: 0.5 });
    else this.sfxAt(rng.pick(['boom1', 'boom2', 'boom3']), e.x, { volume: 0.45 });
    if (scored && rng.chance(0.08)) {
      const bolt = rng.chance(0.5);
      const it = this.items.create(e.x, e.y, bolt ? 'pu-bolt' : 'pu-shield') as Body;
      it.setVelocityY(160);
      const halo = this.add.image(e.x, e.y, 'sb-glow').setBlendMode(ADD).setTint(bolt ? 0xff5a4d : 0x3ea8ff).setScale(0.9).setDepth(8);
      this.tweens.add({ targets: halo, scale: 1.25, alpha: 0.5, duration: 420, yoyo: true, repeat: -1 });
      it.setData('halo', halo);
      this.tweens.add({ targets: it, angle: { from: -12, to: 12 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    e.destroy();
  }

  private collect(i: Body): void {
    const bolt = i.texture.key === 'pu-bolt';
    if (bolt) this.doubleShot = 10;
    else this.shield = 8;
    this.sfxAt(bolt ? 'power-bolt' : 'power-shield', i.x, { volume: 0.65 });
    flash(this, bolt ? 0xff5a4d : 0x3ee6ff, 100);
    this.ring(i.x, i.y, bolt ? 0xff5a4d : 0x3ea8ff, 1.6, 360);
    this.glow(this.ship.x, this.ship.y, bolt ? 0xff5a4d : 0x3ea8ff, 2.2, 420, 12);
    popup(this, this.ship.x, this.ship.y - 80, t(bolt ? 'pBolt' : 'pShield'), bolt ? '#ff8a7a' : '#7fd4ff', 22);
    (i.getData('halo') as Phaser.GameObjects.Image | undefined)?.destroy();
    i.destroy();
  }

  private hurt(): void {
    if (this.invuln > 0 || this.isOver) return;
    if (this.shield > 0) {
      this.shield = 0; this.invuln = 1; this.sfxAt('shieldhit', this.ship.x, { volume: 0.6 });
      this.ring(this.ship.x, this.ship.y, 0x3ea8ff, 2.4, 420);
      return;
    }
    this.lives--;
    this.invuln = 2;
    if (this.lives > 0) this.sfxAt('hurt', this.ship.x, { volume: 0.7 });
    shake(this, 0.02, 250);
    this.hurtT = 0.8;
    this.glow(this.ship.x, this.ship.y, 0xec3013, 2, 360, 12);
    this.updateHud();
    if (this.lives <= 0) {
      burst(this, this.ship.x, this.ship.y, [0xec3013, 0xffd23f], 60, 500);
      flash(this, 0xffffff, 160);
      for (let i = 0; i < 5; i++) {
        const ox = this.ship.x + rng.int(-50, 50), oy = this.ship.y + rng.int(-50, 50);
        this.time.delayedCall(i * 110, () => { this.glow(ox, oy, 0xffa040, 2.4, 420, 30); this.ring(ox, oy, 0xffd2a0, 2, 400); burst(this, ox, oy, [0xffd23f, 0xec3013, 0xffffff], 16, 340); });
      }
      this.bank.setVisible(false);
      this.sfxAt('die', this.ship.x, { volume: 0.85 });
      this.endGame();
    }
  }

  updateGame(_time: number, delta: number): void {
    const dt = delta / 1000;
    const { width, height } = this.scale;
    const c = this.controls;
    for (const l of this.layers) l.ts.tilePositionY -= l.speed * this.warp * dt;
    this.planet.y += 9 * this.warp * dt;
    if (this.planet.y > height + 160) { this.planet.setPosition(rng.int(80, width - 80), -900 - rng.int(0, 1200)).setScale(rng.int(50, 110) / 100).setFlipX(rng.chance(0.5)); }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.5);
    this.vig.setAlpha(Math.max(this.hurtT, this.lives === 1 && !this.isOver ? 0.18 + 0.1 * Math.sin(this.time.now / 180) : 0));
    this.drawTimers();
    // speed scales with how far the stick is pushed (keys give full speed)
    if (c.axisX || c.axisY) {
      this.ship.x = Phaser.Math.Clamp(this.ship.x + c.axisX * 600 * dt, 40, width - 40);
      this.ship.y = Phaser.Math.Clamp(this.ship.y + c.axisY * 600 * dt, height * 0.35, height - 60);
    }
    this.fireCd -= dt; this.spawnCd -= dt;
    this.doubleShot = Math.max(0, this.doubleShot - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.fireCd <= 0) { this.fire(); this.fireCd = 0.18; }

    this.bank.x = this.ship.x; this.bank.y = this.ship.y;
    this.bank.update(dt);
    this.bank.setAlpha(this.invuln > 0 && this.shield <= 0 ? (Math.floor(this.elapsed * 12) % 2 ? 0.3 : 1) : 1);
    this.shieldFx.setVisible(this.shield > 0 && (this.shield > 2 || Math.floor(this.time.now / 120) % 2 === 0))
      .setPosition(this.ship.x, this.ship.y).setRotation(this.bank.root.rotation).setAlpha(0.75 + 0.25 * Math.sin(this.time.now / 90));
    for (const it of this.items.getChildren() as Body[]) (it.getData('halo') as Phaser.GameObjects.Image | undefined)?.setPosition(it.x, it.y);

    for (const obj of this.enemies.getChildren() as Body[]) {
      const tt = (obj.getData('t') as number) + dt;
      obj.setData('t', tt);
      if (!obj.getData('meteor')) {
        if (obj.getData('pattern') === 2) obj.x = (obj.getData('x0') as number) + Math.sin(tt * 2.2) * 90;
        if (rng.chance(dt * (0.15 + this.wave * 0.03)) && obj.y > 0 && obj.y < height * 0.6) {
          const b = this.enemyShots.create(obj.x, obj.y + 30, 'elaser') as Body;
          b.setBlendMode(ADD);
          const a = Phaser.Math.Angle.Between(obj.x, obj.y, this.ship.x, this.ship.y);
          b.setVelocity(Math.cos(a) * 320, Math.sin(a) * 320).setRotation(a - Math.PI / 2);
          this.sfxAt('eshot', obj.x, { volume: 0.14 });
        }
      }
      if (obj.y > height + 100) obj.destroy();
    }
    for (const g of [this.lasers, this.enemyShots, this.items]) {
      for (const o of g.getChildren() as Body[]) if (o.y < -60 || o.y > height + 60 || o.x < -60 || o.x > width + 60) { (o.getData('halo') as Phaser.GameObjects.Image | undefined)?.destroy(); o.destroy(); }
    }
    if (this.pending === 0 && this.enemies.countActive() === 0) {
      if (this.spawnCd <= 0) { this.spawnCd = 1.2; this.nextWave(); }
    } else this.spawnCd = Math.max(this.spawnCd, 0.8);
  }

  /** Remaining double-shot and shield time, under the lives. */
  private drawTimers(): void {
    const g = this.timers;
    g.clear();
    const x0 = this.scale.width - 230;
    let y = 82;
    [[this.doubleShot, 10, 0xff5a4d], [this.shield, 8, 0x3ea8ff]].forEach(([v, max, col], i) => {
      const icon = this.timerIcons[i];
      icon.setVisible(v > 0);
      if (v <= 0) return;
      icon.setPosition(x0, y);
      g.fillStyle(0x000000, 0.65).fillRoundedRect(x0 + 20, y - 7, 120, 14, 7);
      g.fillStyle(col, 1).fillRoundedRect(x0 + 22, y - 5, 116 * (v / max), 10, 5);
      y += 32;
    });
  }
}
