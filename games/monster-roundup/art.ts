// Monster Roundup: the 2D icons, drawn once on canvases (no image files): the captured-monster count,
// the pod, the combo, the sprint energy, the clock, the five powers, stars, the credit chip, a padlock,
// the boss's crown, the four mechs' heads, the edge arrow and soft sparks. Made under the Ayvago intro
// (theme prebake) and again on demand if missing. The powers' icons, a star and a soft glow also become
// three.js textures (the sprites over pick-ups, the dizzy stars, the blob shadows).
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { MECHS, POWER_COLOR, type PowerId, type MechId } from './defs';
import { INK, ORANGE, GLOW, css, star, blobFace, mechHead, pod } from './paint';

type Painter = (c: CanvasRenderingContext2D, s: number) => void;

const POWERS: Record<PowerId, Painter> = {
  freeze: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineCap = 'round';
    for (const [w, col] of [[13, INK], [7, '#bff4ff']] as [number, string][]) {
      c.strokeStyle = col; c.lineWidth = w * u;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        c.beginPath(); c.moveTo(48 * u - Math.cos(a) * 36 * u, 48 * u - Math.sin(a) * 36 * u); c.lineTo(48 * u + Math.cos(a) * 36 * u, 48 * u + Math.sin(a) * 36 * u); c.stroke();
        for (const e of [-1, 1]) {
          const bx = 48 * u + Math.cos(a) * 24 * u * e, by = 48 * u + Math.sin(a) * 24 * u * e;
          for (const t of [-0.7, 0.7]) { c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + t + (e < 0 ? Math.PI : 0)) * 12 * u, by + Math.sin(a + t + (e < 0 ? Math.PI : 0)) * 12 * u); c.stroke(); }
        }
      }
    }
  },
  shield: (c, s) => {
    const u = s / 96;
    const g = c.createRadialGradient(40 * u, 38 * u, 4 * u, 48 * u, 48 * u, 40 * u); g.addColorStop(0, '#d8f2ff'); g.addColorStop(0.7, '#4ab8ff'); g.addColorStop(1, '#1a6ad8');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.moveTo(48 * u, 10 * u); c.lineTo(80 * u, 22 * u); c.quadraticCurveTo(80 * u, 70 * u, 48 * u, 88 * u); c.quadraticCurveTo(16 * u, 70 * u, 16 * u, 22 * u); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(30 * u, 28 * u); c.quadraticCurveTo(30 * u, 58 * u, 44 * u, 72 * u); c.stroke();
  },
  spread: (c, s) => {
    const u = s / 96;
    for (const a of [-0.45, 0, 0.45]) {
      const x = 48 * u + Math.sin(a) * 30 * u, y = 52 * u - Math.cos(a) * 30 * u;
      c.strokeStyle = INK; c.lineWidth = 12 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(48 * u, 82 * u); c.lineTo(x, y); c.stroke();
      c.strokeStyle = '#ffd070'; c.lineWidth = 6 * u; c.stroke();
      c.fillStyle = '#ffb03a'; c.strokeStyle = INK; c.lineWidth = 4 * u; c.beginPath(); c.arc(x, y, 10 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  },
  magnet: (c, s) => {
    const u = s / 96;
    c.lineCap = 'butt'; c.strokeStyle = INK; c.lineWidth = 26 * u;
    c.beginPath(); c.arc(48 * u, 44 * u, 24 * u, Math.PI, 0); c.lineTo(72 * u, 74 * u); c.moveTo(24 * u, 44 * u); c.lineTo(24 * u, 74 * u); c.stroke();
    c.strokeStyle = '#ff5a9a'; c.lineWidth = 17 * u;
    c.beginPath(); c.arc(48 * u, 44 * u, 24 * u, Math.PI, 0); c.lineTo(72 * u, 70 * u); c.moveTo(24 * u, 44 * u); c.lineTo(24 * u, 70 * u); c.stroke();
    c.fillStyle = '#e8eef8'; c.strokeStyle = INK; c.lineWidth = 4 * u;
    for (const x of [24, 72]) { c.beginPath(); c.rect((x - 11) * u, 68 * u, 22 * u, 16 * u); c.fill(); c.stroke(); }
  },
  decoy: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 5 * u;
    const g = c.createLinearGradient(0, 20 * u, 0, 86 * u); g.addColorStop(0, '#d8ffb0'); g.addColorStop(1, '#4ab83a');
    c.fillStyle = g; c.beginPath(); c.roundRect(30 * u, 24 * u, 36 * u, 62 * u, 10 * u); c.fill(); c.stroke();
    c.fillStyle = '#e8eef8'; c.beginPath(); c.roundRect(26 * u, 14 * u, 44 * u, 14 * u, 4 * u); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(36 * u, 32 * u, 6 * u, 44 * u);
    c.fillStyle = '#ffffff'; for (const [x, y] of [[20, 40], [76, 52], [16, 70]]) { c.beginPath(); c.arc(x * u, y * u, 4 * u, 0, Math.PI * 2); c.fill(); }
  },
};

const ICONS: Record<string, Painter> = {
  monster: (c, s) => blobFace(c, s / 2, s * 0.54, s * 0.38, 0x5ad66a),
  dizzy: (c, s) => blobFace(c, s / 2, s * 0.54, s * 0.38, 0xffb03a, true),
  pod: (c, s) => pod(c, s / 2, s / 2, s * 0.44),
  combo: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#ffd23a'; c.strokeStyle = INK; c.lineWidth = 5 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(56 * u, 8 * u); c.lineTo(22 * u, 54 * u); c.lineTo(46 * u, 54 * u); c.lineTo(38 * u, 88 * u); c.lineTo(78 * u, 38 * u); c.lineTo(54 * u, 38 * u); c.closePath(); c.fill(); c.stroke();
  },
  energy: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 5 * u; c.lineJoin = 'round';
    for (const [x, col] of [[30, '#7ae8ff'], [52, '#4ab8ff']] as [number, string][]) {
      c.fillStyle = col; c.beginPath(); c.moveTo(x * u, 20 * u); c.lineTo((x + 26) * u, 48 * u); c.lineTo(x * u, 76 * u); c.lineTo((x + 10) * u, 48 * u); c.closePath(); c.fill(); c.stroke();
    }
  },
  clock: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#e8eef8'; c.strokeStyle = INK; c.lineWidth = 6 * u;
    c.beginPath(); c.arc(48 * u, 52 * u, 34 * u, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(40 * u, 8 * u, 16 * u, 10 * u);
    c.lineWidth = 6 * u; c.beginPath(); c.moveTo(48 * u, 52 * u); c.lineTo(48 * u, 32 * u); c.moveTo(48 * u, 52 * u); c.lineTo(62 * u, 60 * u); c.stroke();
  },
  star: (c, s) => star(c, s / 2, s / 2 + s * 0.03, s * 0.44),
  'star-empty': (c, s) => star(c, s / 2, s / 2 + s * 0.03, s * 0.44, 0x4a5262, 'rgba(11,16,32,0.9)'),
  credit: (c, s) => {
    const u = s / 96;
    const g = c.createRadialGradient(40 * u, 38 * u, 4 * u, 48 * u, 48 * u, 38 * u); g.addColorStop(0, '#d8fff6'); g.addColorStop(1, '#18a9a0');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; c.lineTo(48 * u + Math.cos(a) * 36 * u, 48 * u + Math.sin(a) * 36 * u); }
    c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(10,60,56,0.8)'; c.lineWidth = 3 * u;
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; c.lineTo(48 * u + Math.cos(a) * 24 * u, 48 * u + Math.sin(a) * 24 * u); } c.closePath(); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(48 * u, 48 * u, 9 * u, 0, Math.PI * 2); c.fill();
  },
  lock: (c, s) => {
    const u = s / 96;
    c.strokeStyle = INK; c.lineWidth = 14 * u; c.beginPath(); c.arc(48 * u, 40 * u, 18 * u, Math.PI, 0); c.lineTo(66 * u, 48 * u); c.moveTo(30 * u, 48 * u); c.lineTo(30 * u, 40 * u); c.stroke();
    c.strokeStyle = '#b8c0cc'; c.lineWidth = 7 * u; c.stroke();
    c.fillStyle = '#ffb030'; c.strokeStyle = INK; c.lineWidth = 5 * u; c.beginPath(); c.roundRect(20 * u, 46 * u, 56 * u, 40 * u, 8 * u); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(48 * u, 62 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.fillRect(45 * u, 62 * u, 6 * u, 14 * u);
  },
  crown: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#ffd23a'; c.strokeStyle = INK; c.lineWidth = 5 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(14 * u, 74 * u); c.lineTo(10 * u, 28 * u); c.lineTo(32 * u, 48 * u); c.lineTo(48 * u, 18 * u); c.lineTo(64 * u, 48 * u); c.lineTo(86 * u, 28 * u); c.lineTo(82 * u, 74 * u); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ff5a6a'; for (const x of [30, 48, 66]) { c.beginPath(); c.arc(x * u, 64 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.stroke(); }
  },
  arrow: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#ffffff'; c.strokeStyle = INK; c.lineWidth = 7 * u; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(48 * u, 10 * u); c.lineTo(84 * u, 70 * u); c.lineTo(48 * u, 56 * u); c.lineTo(12 * u, 70 * u); c.closePath(); c.fill(); c.stroke();
  },
  exit: (c, s) => {
    const u = s / 96;
    c.fillStyle = '#5aff9a'; c.strokeStyle = INK; c.lineWidth = 5 * u;
    c.beginPath(); c.ellipse(48 * u, 74 * u, 34 * u, 12 * u, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(90,255,154,0.45)'; c.fillRect(22 * u, 14 * u, 52 * u, 60 * u);
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(48 * u, 18 * u); c.lineTo(66 * u, 42 * u); c.lineTo(54 * u, 42 * u); c.lineTo(54 * u, 62 * u); c.lineTo(42 * u, 62 * u); c.lineTo(42 * u, 42 * u); c.lineTo(30 * u, 42 * u); c.closePath(); c.fill(); c.lineWidth = 4 * u; c.stroke();
  },
  spark: (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  },
  dot: (c, s) => { c.fillStyle = css(ORANGE, 0.95); c.strokeStyle = INK; c.lineWidth = s * 0.12; c.beginPath(); c.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); c.fill(); c.stroke(); },
  ring: (c, s) => { c.strokeStyle = css(GLOW); c.lineWidth = s * 0.12; c.beginPath(); c.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2); c.stroke(); },
};
for (const [id, p] of Object.entries(POWERS)) ICONS['p-' + id] = p;
for (const [id, m] of Object.entries(MECHS)) ICONS['mech-' + id] = (c, s) => mechHead(c, s / 2, s * 0.56, s * 0.38, m.color);

const SIZES: Record<string, number> = { spark: 32, dot: 24 };

/** Texture key of an icon. */
export const ic = (name: string): string => 'mrd-' + name;

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

export const mechIcon = (id: MechId): string => ic('mech-' + id);

// ------------------------------------------------------------------ three.js textures

const powerTex = new Map<PowerId, THREE.Texture>();
/** A power's icon on a dark round badge, for the sprite over its pick-up. */
export function powerTexture(id: PowerId): THREE.Texture {
  let t = powerTex.get(id);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(11,16,32,0.8)'; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.fill();
  x.strokeStyle = css(POWER_COLOR[id]); x.lineWidth = 6; x.stroke();
  x.translate(16, 16);
  x.lineJoin = 'round'; x.lineCap = 'round';
  POWERS[id](x, 96);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  powerTex.set(id, t);
  return t;
}

let starTex: THREE.Texture | null = null;
/** A small yellow star (the dizzy stars). */
export function starTexture(): THREE.Texture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.lineJoin = 'round';
  star(x, 32, 34, 27, 0xffe23a);
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

let crownTex: THREE.Texture | null = null;
/** The boss's crown (a sprite over its head). */
export function crownTexture(): THREE.Texture {
  if (crownTex) return crownTex;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  x.lineJoin = 'round'; x.lineCap = 'round';
  ICONS.crown(x, 96);
  crownTex = new THREE.CanvasTexture(c);
  crownTex.colorSpace = THREE.SRGBColorSpace;
  return crownTex;
}

let glowTex: THREE.Texture | null = null;
/** A soft round falloff (blob shadows). */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
