// Skull Isle's menu theme (src/core/menu-theme.ts): Pirata One, gold and deep red on weathered
// wood, a rope round the screen, the how-to on the treasure map's parchment (chart.ts) and a
// Jolly Roger behind the logo: a bandana'd skull over two crossed cutlasses, painted on canvas.
// Also the menu's own row (the pirate selector and the MAP button) in the same skin.
import Phaser from 'phaser';
import { t, txt, playSfx, SkinButton, skinImage, themeText, type MenuTheme } from '@core';
import { PIRATA_ONE } from '@core/fonts/pirata-one';
import { paintSheet } from './chart';
import { MAP, DOUBLOON } from './art';
import { HERO, type HeroId } from './defs';
import { loadMeta, saveMeta } from './meta';

const INK = '#2a1206';

/** One cutlass along +x: the pommel at the left, the curved blade's tip at the right (unit = size / 100). */
function cutlass(c: CanvasRenderingContext2D, u: number): void {
  c.lineJoin = 'round';
  c.lineWidth = 2.2 * u;
  c.strokeStyle = INK;
  // the blade: a broad, slightly curved back with a clipped point
  const blade = new Path2D();
  blade.moveTo(-14 * u, -3.4 * u);
  blade.quadraticCurveTo(20 * u, -5 * u, 46 * u, -13 * u);
  blade.lineTo(50 * u, -15.5 * u);
  blade.quadraticCurveTo(44 * u, -4 * u, 30 * u, 1.5 * u);
  blade.quadraticCurveTo(10 * u, 6 * u, -14 * u, 4 * u);
  blade.closePath();
  const steel = c.createLinearGradient(0, -12 * u, 0, 6 * u);
  steel.addColorStop(0, '#ffffff'); steel.addColorStop(0.45, '#c9d3dc'); steel.addColorStop(1, '#6b7985');
  c.fillStyle = steel;
  c.fill(blade);
  c.stroke(blade);
  // the fuller along the back
  c.strokeStyle = 'rgba(70,85,100,0.7)'; c.lineWidth = 1.1 * u;
  c.beginPath(); c.moveTo(-10 * u, -1 * u); c.quadraticCurveTo(18 * u, -2.5 * u, 40 * u, -9 * u); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2.2 * u;
  // the grip with its wraps
  c.fillStyle = '#5a3418';
  c.beginPath(); c.roundRect(-34 * u, -3.4 * u, 18 * u, 6.8 * u, 2 * u); c.fill(); c.stroke();
  c.lineWidth = 1 * u;
  for (let x = -31; x < -17; x += 3.4) { c.beginPath(); c.moveTo(x * u, -3.2 * u); c.lineTo((x + 2) * u, 3.2 * u); c.stroke(); }
  // the brass guard: a cross bar and a knuckle bow round to the pommel
  const gold = c.createLinearGradient(0, -10 * u, 0, 10 * u);
  gold.addColorStop(0, '#fff0a8'); gold.addColorStop(0.5, '#e0a93a'); gold.addColorStop(1, '#8a5a12');
  c.lineWidth = 2.2 * u;
  c.fillStyle = gold;
  c.beginPath(); c.roundRect(-17 * u, -10 * u, 5 * u, 20 * u, 2 * u); c.fill(); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 5.4 * u;
  c.beginPath(); c.moveTo(-15 * u, 8 * u); c.quadraticCurveTo(-26 * u, 15 * u, -37 * u, 3 * u); c.stroke();
  c.strokeStyle = gold; c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(-15 * u, 8 * u); c.quadraticCurveTo(-26 * u, 15 * u, -37 * u, 3 * u); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 2.2 * u;
  c.fillStyle = gold;
  c.beginPath(); c.arc(-37 * u, 0, 4.4 * u, 0, Math.PI * 2); c.fill(); c.stroke();
}

/** The Jolly Roger behind the logo: two crossed cutlasses, a skull in a red bandana with glinting eyes. */
export function skullEmblem(c: CanvasRenderingContext2D, size: number): void {
  const u = size / 100;
  c.save();
  c.translate(size / 2, size / 2);
  // a soft gold glow so the emblem stands off the backdrop
  const halo = c.createRadialGradient(0, -6 * u, 6 * u, 0, -6 * u, 50 * u);
  halo.addColorStop(0, 'rgba(255,200,90,0.35)'); halo.addColorStop(1, 'rgba(255,200,90,0)');
  c.fillStyle = halo;
  c.fillRect(-50 * u, -50 * u, 100 * u, 100 * u);
  // handles up: the brass hilts stand out over the skull's shoulders, the blades cross behind it
  for (const s of [1, -1]) {
    c.save();
    c.scale(s, 1);
    c.translate(0, 9 * u);
    c.rotate(0.62);
    cutlass(c, u * 1.18);
    c.restore();
  }
  c.shadowColor = 'transparent';
  c.lineJoin = 'round';
  c.lineWidth = 2.4 * u;
  c.strokeStyle = INK;
  // the skull
  const head = new Path2D();
  head.moveTo(-25 * u, 2 * u);
  head.bezierCurveTo(-29 * u, -22 * u, -15 * u, -34 * u, 0, -34 * u);
  head.bezierCurveTo(15 * u, -34 * u, 29 * u, -22 * u, 25 * u, 2 * u);
  head.quadraticCurveTo(23.5 * u, 10 * u, 17 * u, 13 * u);
  head.lineTo(15.5 * u, 23 * u);
  head.quadraticCurveTo(0, 30 * u, -15.5 * u, 23 * u);
  head.lineTo(-17 * u, 13 * u);
  head.quadraticCurveTo(-23.5 * u, 10 * u, -25 * u, 2 * u);
  head.closePath();
  const bone = c.createRadialGradient(-8 * u, -16 * u, 2 * u, 0, -4 * u, 36 * u);
  bone.addColorStop(0, '#fffdf2'); bone.addColorStop(0.6, '#efe2bf'); bone.addColorStop(1, '#bfa874');
  c.fillStyle = bone;
  c.fill(head);
  c.stroke(head);
  // eye sockets with a red glint, the nose, the teeth, a crack
  c.fillStyle = INK;
  for (const s of [-1, 1]) {
    c.beginPath(); c.ellipse(s * 10.5 * u, -3 * u, 7.6 * u, 8.6 * u, s * 0.25, 0, Math.PI * 2); c.fill();
  }
  c.save();
  c.shadowColor = 'rgba(255,60,40,0.95)'; c.shadowBlur = 6 * u;
  c.fillStyle = '#ff4a2e';
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 10 * u, -2 * u, 2.3 * u, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.fillStyle = INK;
  c.beginPath(); c.moveTo(0, 5 * u); c.lineTo(-3.8 * u, 12 * u); c.quadraticCurveTo(0, 13.8 * u, 3.8 * u, 12 * u); c.closePath(); c.fill();
  c.lineWidth = 1.6 * u;
  c.beginPath(); c.moveTo(-12 * u, 19 * u); c.quadraticCurveTo(0, 21.5 * u, 12 * u, 19 * u); c.stroke();
  for (const x of [-8, -4, 0, 4, 8]) { c.beginPath(); c.moveTo(x * u, 15.5 * u + Math.abs(x) * 0.12 * u); c.lineTo(x * u, 24 * u - Math.abs(x) * 0.2 * u); c.stroke(); }
  c.lineWidth = 1.4 * u;
  c.beginPath(); c.moveTo(-14 * u, -18 * u); c.lineTo(-11 * u, -14 * u); c.lineTo(-14.5 * u, -11 * u); c.stroke();
  // the bandana over the crown, knotted on the right, its tails flying
  c.lineWidth = 2.2 * u;
  const red = c.createLinearGradient(0, -36 * u, 0, -12 * u);
  red.addColorStop(0, '#d8343c'); red.addColorStop(1, '#8e1c22');
  c.fillStyle = red;
  const band = new Path2D();
  band.moveTo(-26.5 * u, -11 * u);
  band.bezierCurveTo(-28 * u, -27 * u, -15 * u, -36.5 * u, 0, -36.5 * u);
  band.bezierCurveTo(15 * u, -36.5 * u, 28 * u, -27 * u, 26.5 * u, -11 * u);
  band.quadraticCurveTo(0, -19 * u, -26.5 * u, -11 * u);
  band.closePath();
  c.fill(band); c.stroke(band);
  c.fillStyle = 'rgba(255,240,215,0.9)';
  for (const [x, y] of [[-15, -25], [-3, -31], [9, -27], [19, -20], [-21, -16], [3, -22]]) {
    c.beginPath(); c.arc(x * u, y * u, 1.7 * u, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = red;
  for (const [x1, y1, x2, y2] of [[38, -8, 36, -2], [40, -18, 43, -13]]) {
    c.beginPath(); c.moveTo(25 * u, -14 * u); c.quadraticCurveTo(32 * u, -14 * u, x1 * u, y1 * u); c.lineTo(x2 * u, y2 * u); c.quadraticCurveTo(30 * u, -8 * u, 25 * u, -10 * u); c.closePath(); c.fill(); c.stroke();
  }
  c.beginPath(); c.arc(26 * u, -12.5 * u, 3.6 * u, 0, Math.PI * 2); c.fill(); c.stroke();
  c.restore();
}

export const SKULL_THEME: MenuTheme = {
  font: PIRATA_ONE,
  palette: {
    primary: 0x8e1c22, secondary: 0x8a5a2e, board: 0x3d2614, trim: 0xe0a93a,
    label: '#ffe39a', labelStroke: '#2a1206', muted: '#c9a77a', accent: '#ffd23f',
    heading: '#8e1c22', body: '#3a2210', icon: 0xfff0c8, shade: 0x061018,
  },
  logo: {
    fill: ['#fff7c8', '#ffd23f', '#f0a020', '#a85a0c'],
    outline: INK,
    rim: '#7a1018',
    depth: '#5a0e12',
    size: 150,
    emblem: { draw: skullEmblem, size: 250, overlap: 0.28 },
  },
  skin: 'plank',
  // the pirate board, its arrow knobs and the MAP button (menuRow)
  pieces: [{ kind: 'board', w: 420, h: 104 }, { kind: 'round', w: 56, h: 56 }, { kind: 'button', w: 196, h: 104 }],
  // dim: the backdrop's darkening (main.ts drew it as its own layer before the theme)
  frame: { border: 'rope', notes: (c, w, h) => paintSheet(c, w, h, 31), vignette: 0.6, dim: 0.34 },
};

/**
 * The pirate selector and the MAP button, the row under the difficulty switch (H and M on the
 * keyboard). `onHero` swaps the backdrop's pirate; `open` shows the treasure map.
 */
export function menuRow(scene: Phaser.Scene, x: number, y: number, onHero: (id: HeroId) => void, open: () => void): { refresh: () => void } {
  const touch = scene.sys.game.device.input.touch;
  const sel = scene.add.container(x - 112, y + 4);
  sel.add(skinImage(scene, 0, 0, 'board', 420, 104));
  const name = themeText(scene, 0, -22, '', { size: 40 });
  const desc = txt(scene, 0, 18, '', { size: 16, color: '#f3e3c0', strokeThickness: 0, shadow: false, wrap: 270 });
  sel.add([name, desc]);
  const arrow = (dx: number, dir: 1 | -1) => {
    const knob = skinImage(scene, dx, 0, 'round', 56, 56);
    const g = scene.add.graphics();
    g.fillStyle(0x2a1206, 1).fillTriangle(dx + dir * 14, 1, dx - dir * 9, -14, dx - dir * 9, 16);
    g.fillStyle(0xffd23f, 1).fillTriangle(dx + dir * 12, 0, dx - dir * 7, -11, dx - dir * 7, 11);
    const hit = scene.add.zone(dx, 0, 90, 104).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => knob.setScale(0.92));
    hit.on('pointerout', () => knob.setScale(1));
    hit.on('pointerup', () => { knob.setScale(1); cycle(dir); });
    sel.add([knob, g, hit]);
  };
  arrow(-170, -1);
  arrow(170, 1);
  const show = () => {
    const mm = loadMeta();
    name.setText(t('h_' + mm.hero)).setScale(1);
    if (name.width > 270) name.setScale(270 / name.width);
    desc.setText(t('hd_' + mm.hero));
    desc.setScale(desc.height > 44 ? 44 / desc.height : 1);
    name.setColor('#' + Phaser.Display.Color.IntegerToColor(HERO[mm.hero].color).lighten(12).color.toString(16).padStart(6, '0'));
  };
  const cycle = (dir: 1 | -1) => {
    const mm = loadMeta();
    const list = mm.heroes;
    const i = list.indexOf(mm.hero);
    mm.hero = list[(i + dir + list.length) % list.length] as HeroId;
    saveMeta(mm);
    playSfx(scene, 'move', { volume: 0.4 });
    show();
    scene.tweens.add({ targets: sel, scale: 1.04, duration: 80, yoyo: true });
    onHero(mm.hero);
  };
  show();

  const map = new SkinButton(scene, x + 220, y + 4, t('map'), open, { width: 196, height: 104, size: 36 });
  const mapIcon = scene.add.image(0, 0, MAP).setDisplaySize(40, 40);
  const coin = scene.add.image(0, 0, DOUBLOON).setDisplaySize(24, 24);
  const count = txt(scene, 0, 0, '', { size: 22, color: '#fff3c4', strokeThickness: 4 });
  map.add([mapIcon, coin, count]);
  const label = () => {
    map.setText(t('map')).fitLabel(196 - 84);
    count.setText(String(loadMeta().doubloons));
    const lw = map.label.displayWidth, total = 40 + 8 + lw;
    mapIcon.setPosition(-total / 2 + 20, -16);
    map.label.setX(-total / 2 + 48 + lw / 2);
    map.setLabelY(-16);
    const cw = 24 + 6 + count.width;
    coin.setPosition(-cw / 2 + 12, 24);
    count.setPosition(-cw / 2 + 30 + count.width / 2, 24);
  };
  label();
  scene.input.keyboard?.on('keydown-H', () => cycle(1));
  if (!touch) txt(scene, x, y + 76, t('heroKeys'), { size: 17, color: '#e8d6a8', strokeThickness: 3, shadow: false });
  return { refresh: () => { label(); show(); } };
}
