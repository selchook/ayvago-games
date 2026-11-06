import Phaser from 'phaser';
import { makeField, makeFx } from './art';

/**
 * Menu backdrop: a dimmed battlefield with a road along the bottom. Tanks and soldiers roll by,
 * planes fly over, and three towers track them and fire.
 */
export function menuScene(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const cell = 80, cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const roadY = height - 44;
  makeFx(scene);
  makeField(scene, 'td-menu-field', cols, rows, cell, [{ x: -60, y: roadY }, { x: width + 60, y: roadY }], (_c, r) => r === rows - 1);
  scene.add.image(0, 0, 'td-menu-field').setOrigin(0);
  scene.add.rectangle(0, 0, width, height, 0x08100b, 0.42).setOrigin(0);

  const ADD = Phaser.BlendModes.ADD;
  const towers = [
    { x: width * 0.12, y: height * 0.53, base: 'td-b2', head: 'td-h2', s: 1.6, air: true, rate: 1.9 },
    { x: width * 0.88, y: height * 0.53, base: 'td-b0', head: 'td-h0', s: 1.6, air: true, rate: 0.5 },
    { x: width * 0.79, y: height * 0.81, base: 'td-b1', head: 'td-h1', s: 1.15, air: false, rate: 1.4 },
  ].map((d) => {
    scene.add.image(d.x + 4, d.y + d.s * 16, 'td-shade').setScale(1.3 * d.s, 1.1 * d.s);
    scene.add.image(d.x, d.y, d.base).setScale(d.s);
    const head = scene.add.image(d.x, d.y, d.head).setScale(d.s).setAngle(-60);
    return { ...d, head, cd: Math.random() * d.rate };
  });

  type Unit = { spr: Phaser.GameObjects.Image; top?: Phaser.GameObjects.Image; shade: Phaser.GameObjects.Image; vx: number; vy: number; air: boolean };
  const units: Unit[] = [];
  const spawn = (kind: 'tank' | 'squad' | 'plane') => {
    if (kind === 'plane') {
      const y = Phaser.Math.Between(90, 260);
      const spr = scene.add.image(-80, y, 'td-plane').setScale(1.2).setDepth(3);
      const shade = scene.add.image(-60, y + 40, 'td-shadow').setScale(1.1).setAlpha(0.3).setDepth(2);
      spr.rotation = Math.atan2(14, 150); shade.rotation = spr.rotation;
      units.push({ spr, shade, vx: 150, vy: 14, air: true });
      return;
    }
    if (kind === 'tank') {
      const big = Math.random() < 0.4;
      const spr = scene.add.image(-60, roadY, big ? 'td-tank2' : 'td-tank').setScale(1.1).setDepth(1);
      const top = scene.add.image(-60, roadY, big ? 'td-tank2-t' : 'td-tank-t').setScale(1.1).setDepth(1);
      const shade = scene.add.image(-60, roadY + 8, 'td-shade').setScale(1.1).setDepth(0.5);
      units.push({ spr, top, shade, vx: 46, vy: 0, air: false });
      return;
    }
    for (let i = 0; i < 3; i++) {
      const spr = scene.add.image(-50 - i * 44, roadY + (i % 2 ? -12 : 12), Phaser.Utils.Array.GetRandom(['td-e0', 'td-e1', 'td-e2'])).setScale(1.2).setDepth(1);
      const shade = scene.add.image(spr.x, spr.y + 6, 'td-shade').setScale(0.55).setDepth(0.5);
      units.push({ spr, shade, vx: 70, vy: 0, air: false });
    }
  };
  spawn('tank');
  units[0].spr.x = width * 0.3;
  let tT = 3.5, pT = 2, sT = 6;

  const update = (_t: number, delta: number) => {
    const dt = Math.min(0.05, delta / 1000);
    tT -= dt; pT -= dt; sT -= dt;
    if (tT <= 0) { spawn('tank'); tT = 9 + Math.random() * 4; }
    if (sT <= 0) { spawn('squad'); sT = 10 + Math.random() * 4; }
    if (pT <= 0) { spawn('plane'); pT = 7 + Math.random() * 5; }
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      u.spr.x += u.vx * dt; u.spr.y += u.vy * dt;
      u.top?.setPosition(u.spr.x, u.spr.y);
      u.shade.setPosition(u.spr.x + (u.air ? 20 : 2), u.spr.y + (u.air ? 40 : 8));
      if (u.spr.x > width + 120) { u.spr.destroy(); u.top?.destroy(); u.shade.destroy(); units.splice(i, 1); }
    }
    for (const tw of towers) {
      let best: Unit | null = null, bd = 1e9;
      for (const u of units) {
        if (u.air && !tw.air) continue;
        const d = Phaser.Math.Distance.Between(tw.x, tw.y, u.spr.x, u.spr.y);
        if (d < 520 && d < bd) { bd = d; best = u; }
      }
      tw.cd -= dt;
      if (!best) { tw.head.rotation += Math.sin(scene.time.now / 900 + tw.x) * 0.4 * dt; continue; }
      const ang = Phaser.Math.Angle.Between(tw.x, tw.y, best.spr.x, best.spr.y) + Math.PI / 2;
      tw.head.rotation = Phaser.Math.Angle.RotateTo(tw.head.rotation, ang, 4 * dt);
      if (tw.cd > 0 || Math.abs(Phaser.Math.Angle.Wrap(tw.head.rotation - ang)) > 0.2) continue;
      tw.cd = tw.rate;
      const r = 30 * tw.s;
      const fl = scene.add.image(tw.x + Math.sin(tw.head.rotation) * r, tw.y - Math.cos(tw.head.rotation) * r, 'td-flash')
        .setBlendMode(ADD).setRotation(tw.head.rotation).setScale(tw.rate < 1 ? 0.6 : 1);
      scene.tweens.add({ targets: fl, alpha: 0, scale: fl.scale * 1.5, duration: 110, onComplete: () => fl.destroy() });
      const k = tw.rate < 1 ? 3 : 7;
      tw.head.setPosition(tw.x - Math.sin(tw.head.rotation) * k, tw.y + Math.cos(tw.head.rotation) * k);
      scene.tweens.add({ targets: tw.head, x: tw.x, y: tw.y, duration: 160, ease: 'Quad.easeOut' });
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
}
