// Moon Rover: the 2D icons, drawn once on canvases (no image files): the battery, a crystal, the crew
// helmet, a supply crate, the five powers, hearts (full, half, empty), stars, the credit chip, a
// clock, a padlock, the alien, a generator, the rocket, a soft spark and the map's dots. Made under
// the Ayvago intro (theme prebake) and again on demand if missing. The powers' icons also become
// three.js textures for the sprites over the pick-ups.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import type { PowerId } from './defs';
import { INK, ORANGE, css, star, helmet, crystal, roverSide } from './paint';

type Painter = (c: CanvasRenderingContext2D, s: number) => void;

const heart = (fill: 'full' | 'half' | 'empty'): Painter => (c, s) => {
  const u = s / 96;
  const path = () => { c.beginPath(); c.moveTo(48 * u, 82 * u); c.bezierCurveTo(10 * u, 58 * u, 8 * u, 26 * u, 28 * u, 18 * u); c.bezierCurveTo(40 * u, 13 * u, 48 * u, 24 * u, 48 * u, 30 * u); c.bezierCurveTo(48 * u, 24 * u, 56 * u, 13 * u, 68 * u, 18 * u); c.bezierCurveTo(88 * u, 26 * u, 86 * u, 58 * u, 48 * u, 82 * u); c.closePath(); };
  path();
  c.fillStyle = '#3a3f4c'; c.fill();
  if (fill !== 'empty') {
    c.save(); path(); c.clip();
    const g = c.createLinearGradient(0, 14 * u, 0, 82 * u); g.addColorStop(0, '#ff7a8a'); g.addColorStop(1, '#d8203a');
    c.fillStyle = g; c.fillRect(0, 0, fill === 'half' ? 48 * u : s, s);
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(30 * u, 32 * u, 9 * u, 6 * u, -0.6, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  path(); c.lineWidth = 6 * u; c.strokeStyle = INK; c.stroke();
};

const POWERS: Record<PowerId, Painter> = {
  boost: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#ffb04a'; c.strokeStyle = INK; c.lineWidth = 5 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(54 * u, 8 * u); c.lineTo(20 * u, 54 * u); c.lineTo(44 * u, 54 * u); c.lineTo(36 * u, 88 * u); c.lineTo(76 * u, 38 * u); c.lineTo(52 * u, 38 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(50 * u, 18 * u); c.lineTo(30 * u, 48 * u); c.lineTo(38 * u, 48 * u); c.closePath(); c.fill();
  },
  shield: (c, s) => {
    const u = s / 96;
    const g = c.createRadialGradient(40 * u, 38 * u, 4 * u, 48 * u, 48 * u, 40 * u); g.addColorStop(0, '#d8f2ff'); g.addColorStop(0.7, '#4ab8ff'); g.addColorStop(1, '#1a6ad8');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.arc(48 * u, 50 * u, 36 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 4 * u; c.beginPath(); c.arc(48 * u, 50 * u, 26 * u, -2.6, -1.4); c.stroke();
    roverSide(c, 48 * u, 70 * u, 34 * u, ORANGE);
  },
  magnet: (c, s) => {
    const u = s / 96;
    c.lineCap = 'butt'; c.strokeStyle = INK; c.lineWidth = 26 * u;
    c.beginPath(); c.arc(48 * u, 44 * u, 24 * u, Math.PI, 0); c.lineTo(72 * u, 74 * u); c.moveTo(24 * u, 44 * u); c.lineTo(24 * u, 74 * u); c.stroke();
    c.strokeStyle = '#ff4a7a'; c.lineWidth = 17 * u;
    c.beginPath(); c.arc(48 * u, 44 * u, 24 * u, Math.PI, 0); c.lineTo(72 * u, 70 * u); c.moveTo(24 * u, 44 * u); c.lineTo(24 * u, 70 * u); c.stroke();
    c.fillStyle = '#e8eef8'; c.strokeStyle = INK; c.lineWidth = 4 * u;
    for (const x of [24, 72]) { c.beginPath(); c.rect((x - 11) * u, 68 * u, 22 * u, 16 * u); c.fill(); c.stroke(); }
  },
  hover: (c, s) => {
    const u = s / 96;
    roverSide(c, 48 * u, 50 * u, 52 * u, ORANGE);
    for (const x of [26, 48, 70]) {
      const g = c.createLinearGradient(0, 56 * u, 0, 90 * u); g.addColorStop(0, '#e8fff6'); g.addColorStop(1, 'rgba(122,255,200,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo((x - 8) * u, 56 * u); c.lineTo((x + 8) * u, 56 * u); c.lineTo(x * u, 92 * u); c.closePath(); c.fill();
    }
  },
  emp: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 5 * u;
    for (const [r, col] of [[38, '#c890ff'], [26, '#e0c8ff']] as [number, string][]) { c.strokeStyle = INK; c.lineWidth = 9 * u; c.beginPath(); c.arc(48 * u, 48 * u, r * u, 0, Math.PI * 2); c.stroke(); c.strokeStyle = col; c.lineWidth = 5 * u; c.stroke(); }
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 4 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(52 * u, 28 * u); c.lineTo(38 * u, 52 * u); c.lineTo(50 * u, 52 * u); c.lineTo(44 * u, 70 * u); c.lineTo(60 * u, 44 * u); c.lineTo(48 * u, 44 * u); c.closePath(); c.fill(); c.stroke();
  },
};

const ICONS: Record<string, Painter> = {
  battery: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#e8eef8'; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.roundRect(14 * u, 26 * u, 62 * u, 44 * u, 8 * u); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(76 * u, 38 * u, 8 * u, 20 * u);
    c.fillStyle = '#4ae08a'; c.beginPath(); c.roundRect(20 * u, 32 * u, 50 * u, 32 * u, 4 * u); c.fill();
    c.fillStyle = INK; c.beginPath(); c.moveTo(50 * u, 34 * u); c.lineTo(36 * u, 50 * u); c.lineTo(46 * u, 50 * u); c.lineTo(42 * u, 62 * u); c.lineTo(56 * u, 46 * u); c.lineTo(46 * u, 46 * u); c.closePath(); c.fill();
  },
  crystal: (c, s) => crystal(c, s / 2, s / 2, s * 0.4),
  crew: (c, s) => helmet(c, s / 2, s / 2, s * 0.38),
  crate: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#ffc040'; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.roundRect(18 * u, 22 * u, 60 * u, 56 * u, 6 * u); c.fill(); c.stroke();
    c.fillStyle = '#e8eef8'; c.fillRect(18 * u, 42 * u, 60 * u, 14 * u); c.strokeRect(18 * u, 42 * u, 60 * u, 14 * u);
    c.fillStyle = INK; c.font = `900 ${12 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('+', 48 * u, 54 * u);
  },
  heart: heart('full'), 'heart-half': heart('half'), 'heart-empty': heart('empty'),
  star: (c, s) => star(c, s / 2, s / 2 + s * 0.03, s * 0.44),
  'star-empty': (c, s) => star(c, s / 2, s / 2 + s * 0.03, s * 0.44, 0x4a5262, 'rgba(11,16,32,0.9)'),
  credit: (c, s) => {
    const u = s / 96;
    const g = c.createRadialGradient(40 * u, 38 * u, 4 * u, 48 * u, 48 * u, 38 * u); g.addColorStop(0, '#fff2b0'); g.addColorStop(1, '#e8a020');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.arc(48 * u, 48 * u, 34 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(120,70,10,0.8)'; c.lineWidth = 3 * u; c.beginPath(); c.arc(48 * u, 48 * u, 25 * u, 0, Math.PI * 2); c.stroke();
    star(c, 48 * u, 50 * u, 16 * u, 0xfff6d0, 'rgba(120,70,10,0.9)');
  },
  clock: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#e8eef8'; c.strokeStyle = INK; c.lineWidth = 6 * u;
    c.beginPath(); c.arc(48 * u, 52 * u, 34 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(40 * u, 8 * u, 16 * u, 10 * u);
    c.lineWidth = 6 * u; c.beginPath(); c.moveTo(48 * u, 52 * u); c.lineTo(48 * u, 32 * u); c.moveTo(48 * u, 52 * u); c.lineTo(62 * u, 60 * u); c.stroke();
  },
  lock: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 14 * u; c.beginPath(); c.arc(48 * u, 40 * u, 18 * u, Math.PI, 0); c.lineTo(66 * u, 48 * u); c.moveTo(30 * u, 48 * u); c.lineTo(30 * u, 40 * u); c.stroke();
    c.strokeStyle = '#b8c0cc'; c.lineWidth = 7 * u; c.stroke();
    c.fillStyle = '#ffb030'; c.strokeStyle = INK; c.lineWidth = 5 * u; c.beginPath(); c.roundRect(20 * u, 46 * u, 56 * u, 40 * u, 8 * u); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(48 * u, 62 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.fillRect(45 * u, 62 * u, 6 * u, 14 * u);
  },
  alien: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#3ae0a0'; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.roundRect(24 * u, 26 * u, 48 * u, 50 * u, 12 * u); c.fill(); c.stroke();
    for (const x of [36, 60]) { c.beginPath(); c.moveTo(x * u, 26 * u); c.lineTo(x * u, 12 * u); c.stroke(); c.beginPath(); c.arc(x * u, 11 * u, 5 * u, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.fillStyle = INK; for (const x of [38, 58]) { c.beginPath(); c.ellipse(x * u, 46 * u, 5 * u, 8 * u, 0, 0, Math.PI * 2); c.fill(); }
    c.fillRect(40 * u, 62 * u, 16 * u, 4 * u);
  },
  generator: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#c8d0dc'; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.roundRect(16 * u, 30 * u, 64 * u, 50 * u, 8 * u); c.fill(); c.stroke();
    c.fillStyle = '#ff4a3a'; c.beginPath(); c.arc(48 * u, 30 * u, 12 * u, Math.PI, 0); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.moveTo(52 * u, 40 * u); c.lineTo(40 * u, 58 * u); c.lineTo(50 * u, 58 * u); c.lineTo(44 * u, 74 * u); c.lineTo(58 * u, 52 * u); c.lineTo(48 * u, 52 * u); c.closePath(); c.fill();
  },
  rocket: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 5 * u; c.lineJoin = 'round';
    c.fillStyle = '#ff8a1a'; c.beginPath(); c.moveTo(30 * u, 74 * u); c.lineTo(20 * u, 88 * u); c.lineTo(36 * u, 82 * u); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(66 * u, 74 * u); c.lineTo(76 * u, 88 * u); c.lineTo(60 * u, 82 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#eef2f8'; c.beginPath(); c.moveTo(48 * u, 6 * u); c.bezierCurveTo(68 * u, 24 * u, 66 * u, 60 * u, 62 * u, 82 * u); c.lineTo(34 * u, 82 * u); c.bezierCurveTo(30 * u, 60 * u, 28 * u, 24 * u, 48 * u, 6 * u); c.fill(); c.stroke();
    c.fillStyle = '#4ab8ff'; c.beginPath(); c.arc(48 * u, 40 * u, 8 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ff8a1a'; c.fillRect(34 * u, 60 * u, 28 * u, 7 * u);
  },
  rover: (c, s) => roverSide(c, s / 2, s * 0.78, s * 0.72),
  spark: (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  },
  dot: (c, s) => { c.fillStyle = css(0xffc21a, 0.95); c.strokeStyle = INK; c.lineWidth = s * 0.12; c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); c.fill(); c.stroke(); },
};
for (const [id, p] of Object.entries(POWERS)) ICONS['p-' + id] = p;

const SIZES: Record<string, number> = { spark: 32, dot: 24 };

/** Texture key of an icon. */
export const ic = (name: string): string => 'mr-' + name;

export function makeArt(scene: Phaser.Scene): void {
  for (const [name, draw] of Object.entries(ICONS)) {
    const key = ic(name);
    if (scene.textures.exists(key)) continue;
    const s = SIZES[name] ?? 96;
    const t = scene.textures.createCanvas(key, s, s);
    if (!t) continue;
    const c = t.getContext();
    c.lineJoin = 'round'; c.lineCap = 'round';
    draw(c, s);
    t.refresh();
  }
}

/** An icon image at a size. */
export function icon(scene: Phaser.Scene, x: number, y: number, name: string, size: number): Phaser.GameObjects.Image {
  makeArt(scene);
  return scene.add.image(x, y, ic(name)).setDisplaySize(size, size);
}

const powerTex = new Map<PowerId, THREE.Texture>();
/** A power's icon on a dark round badge, for the sprite over its pick-up. */
export function powerTexture(id: PowerId): THREE.Texture {
  let t = powerTex.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(11,16,32,0.78)'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 5; x.stroke();
  x.translate(16, 16);
  x.lineJoin = 'round'; x.lineCap = 'round';
  POWERS[id](x, 96);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  powerTex.set(id, t);
  return t;
}
