import Phaser from 'phaser';
import { PIECES, SHAPES } from './PlayScene';
import { makeBackdrop, makeFx } from './art';

/** Menu backdrop: the night sky, blocks drifting down behind the menu and a shimmering stack below. */
export function menuScene(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  makeFx(scene);
  scene.add.image(0, 0, makeBackdrop(scene, 0)).setOrigin(0);

  // slow rain of pieces, faint so the menu stays readable
  const drop = (y0?: number) => {
    const p = Phaser.Math.Between(0, PIECES.length - 1), def = PIECES[p];
    const size = Phaser.Math.Between(26, 40);
    const c = scene.add.container(Phaser.Math.Between(40, width - 40), y0 ?? -80).setAlpha(0.32).setAngle(Phaser.Math.Between(0, 3) * 90);
    for (const [x, y] of SHAPES[p][0]) {
      const im = scene.add.image((x - 1.5) * size, (y - 1) * size, def.tex).setDisplaySize(size - 2, size - 2);
      if (def.tint) im.setTint(def.tint);
      c.add(im);
    }
    const dur = Phaser.Math.Between(9000, 15000);
    scene.tweens.add({ targets: c, y: height + 120, angle: c.angle + Phaser.Math.Between(-1, 1) * 90, duration: dur * (1 - (c.y + 80) / (height + 200)), onComplete: () => c.destroy() });
  };
  for (let i = 0; i < 6; i++) drop(Phaser.Math.Between(0, height * 0.75));
  scene.time.addEvent({ delay: 1400, loop: true, callback: () => drop() });

  // a little well of messy rows that shimmer
  const rows = ['ZZ.OO.TTT.', 'JZZOOLLTSS', 'JJJ.LLSSII'];
  const size = 44, x0 = width / 2 - 5 * size + size / 2, y0 = height * 0.845;
  const idx = (ch: string) => PIECES.findIndex((p) => p.name === ch);
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const def = PIECES[idx(ch)];
    const im = scene.add.image(x0 + c * size, y0 + r * size, def.tex).setDisplaySize(size - 2, size - 2);
    if (def.tint) im.setTint(def.tint);
    scene.tweens.add({ targets: im, alpha: 0.6, duration: 700, delay: (r + c) * 90, yoyo: true, repeat: -1 });
  }));
}
