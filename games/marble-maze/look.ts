// The four worlds' looks: colours, canvas textures, materials and decoration. Textures and
// materials are made once per page and shared by every level (the three.js renderer is shared
// too), so restarting a level never piles up GPU memory.
import { THREE, model, grounded } from '@core/three';

export type VoidKind = 'drop' | 'water' | 'chasm' | 'sky';

export interface Theme {
  key: 'wood' | 'garden' | 'ice' | 'ruins';
  bg: number;
  fog: { color: number; near: number; far: number } | null;
  sky: number;
  ground: number;
  ambient: number;
  sun: number;
  sunPower: number;
  voidKind: VoidKind;
  /** What lies far under the board (a table, the pond, a dark chasm, clouds). */
  below: number;
  belowY: number;
  marble: [number, number];   // glass colour, swirl colour
  rim: number;                // hole rim
  decor: { key: string; scale: number }[];
  accent: string;             // world colour on the level select
}

export const THEMES: Theme[] = [
  {
    key: 'wood', bg: 0x2b1d14, fog: { color: 0x2b1d14, near: 30, far: 70 }, sky: 0xfff1dc, ground: 0x6b4a33, ambient: 1.55,
    sun: 0xfff0d8, sunPower: 2.3, voidKind: 'drop', below: 0x5a3b26, belowY: -4.5, marble: [0xe8402f, 0xffffff], rim: 0xc9a227,
    decor: [{ key: 'barrel', scale: 2.2 }, { key: 'crate', scale: 2 }, { key: 'crateStrong', scale: 1.8 }],
    accent: '#ffb04a',
  },
  {
    key: 'garden', bg: 0x8fd3ff, fog: { color: 0xbfe8ff, near: 30, far: 70 }, sky: 0xeaf7ff, ground: 0x6f8f4a, ambient: 1.7,
    sun: 0xffffff, sunPower: 2.4, voidKind: 'water', below: 0x3f9fd8, belowY: -0.45, marble: [0x2f7dff, 0xffffff], rim: 0x6b4a2f,
    decor: [{ key: 'tree', scale: 2.4 }, { key: 'treeOak', scale: 2.4 }, { key: 'bush', scale: 2.2 }, { key: 'flowerRed', scale: 2.4 }, { key: 'flowerYellow', scale: 2.4 }],
    accent: '#7be05a',
  },
  {
    key: 'ice', bg: 0x0d1c33, fog: { color: 0x0d1c33, near: 26, far: 60 }, sky: 0xcfe8ff, ground: 0x2a3d5c, ambient: 1.6,
    sun: 0xdfefff, sunPower: 2.2, voidKind: 'chasm', below: 0x0a1426, belowY: -7, marble: [0xffa21f, 0xfff4d0], rim: 0x9fd8ff,
    decor: [{ key: 'stoneTall', scale: 2.4 }, { key: 'rockTall', scale: 2.2 }, { key: 'blockSnow', scale: 1.1 }],
    accent: '#7fd8ff',
  },
  {
    key: 'ruins', bg: 0x9ed6ff, fog: { color: 0xd8efff, near: 34, far: 80 }, sky: 0xfff6e8, ground: 0xb79a6a, ambient: 1.75,
    sun: 0xfff2d6, sunPower: 2.4, voidKind: 'sky', below: 0xffffff, belowY: -8, marble: [0x9b4dff, 0xffe9ff], rim: 0x8a7350,
    decor: [{ key: 'column', scale: 2.2 }, { key: 'columnBroken', scale: 2.2 }, { key: 'obelisk', scale: 2 }],
    accent: '#ffd23f',
  },
];

// ---------------------------------------------------------------- canvas textures

const texCache = new Map<string, THREE.CanvasTexture>();

/** A canvas texture made once (painted by `paint`), repeating, in sRGB. */
export function canvasTex(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  paint(cv.getContext('2d')!, w, h);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Deterministic noise for the painters (same look every time). */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function speckle(c: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, colors: string[], size: number): void {
  for (let i = 0; i < n; i++) {
    c.fillStyle = colors[(r() * colors.length) | 0];
    const s = size * (0.4 + r());
    c.fillRect(r() * w, r() * h, s, s);
  }
}

/** Planks running across the tile with grain lines. */
function woodTex(key: string, base: number, dark: number, planks = 3): THREE.CanvasTexture {
  return canvasTex(key, 256, 256, (c, w, h) => {
    const r = rnd(7);
    const ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const k = 0.9 + r() * 0.2;
      const col = new THREE.Color(base).multiplyScalar(k);
      c.fillStyle = `#${col.getHexString()}`;
      c.fillRect(0, p * ph, w, ph);
      c.strokeStyle = css(dark, 0.22);
      c.lineWidth = 1.5;
      for (let g = 0; g < 7; g++) {
        const y0 = p * ph + 4 + r() * (ph - 8), amp = 1 + r() * 3, f = 0.01 + r() * 0.03, off = r() * 6;
        c.beginPath();
        for (let x = 0; x <= w; x += 8) c.lineTo(x, y0 + Math.sin(x * f + off) * amp);
        c.stroke();
      }
      // a knot now and then
      if (r() < 0.5) {
        c.fillStyle = css(dark, 0.35);
        c.beginPath();
        c.ellipse(r() * w, p * ph + ph / 2, 7, 4, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = css(dark, 0.55);
      c.fillRect(0, p * ph, w, 3);
    }
    c.strokeStyle = css(dark, 0.5);
    c.lineWidth = 3;
    c.strokeRect(1, 1, w - 2, h - 2);
  });
}

/** Square stone slabs with mortar and speckles. */
function slabTex(key: string, base: number, mortar: number, split = 2, seed = 3): THREE.CanvasTexture {
  return canvasTex(key, 256, 256, (c, w, h) => {
    const r = rnd(seed);
    const s = w / split;
    for (let y = 0; y < split; y++) {
      for (let x = 0; x < split; x++) {
        const col = new THREE.Color(base).multiplyScalar(0.92 + r() * 0.14);
        c.fillStyle = `#${col.getHexString()}`;
        c.fillRect(x * s, y * s, s, s);
      }
    }
    speckle(c, w, h, r, 900, [css(0xffffff, 0.12), css(0x000000, 0.08)], 3);
    c.strokeStyle = css(mortar, 0.85);
    c.lineWidth = 5;
    for (let i = 0; i <= split; i++) {
      c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, h); c.stroke();
      c.beginPath(); c.moveTo(0, i * s); c.lineTo(w, i * s); c.stroke();
    }
  });
}

/** The workbench far under the workshop board: big planks repeated many times. */
function tableTex(): THREE.CanvasTexture {
  const hit = texCache.get('table');
  if (hit) return hit;
  const src = woodTex('tableSrc', 0x8a5a36, 0x3a2010, 4);
  const t = src.clone();
  t.repeat.set(24, 24);
  t.needsUpdate = true;
  texCache.set('table', t as THREE.CanvasTexture);
  return t as THREE.CanvasTexture;
}

function hedgeTex(): THREE.CanvasTexture {
  return canvasTex('hedge', 128, 128, (c, w, h) => {
    const r = rnd(11);
    c.fillStyle = '#3f8a3a';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = ['#2f7030', '#55a347', '#6cbc55', '#25602a'][(r() * 4) | 0];
      c.beginPath();
      c.ellipse(r() * w, r() * h, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function iceTex(): THREE.CanvasTexture {
  return canvasTex('ice', 256, 256, (c, w, h) => {
    const r = rnd(5);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#d9f6ff');
    g.addColorStop(0.5, '#a9e4fb');
    g.addColorStop(1, '#c9f0ff');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      let x = r() * w, y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; c.lineTo(x, y); }
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(0, 0, w, 2);
    c.fillRect(0, 0, 2, h);
  });
}

function snowTex(): THREE.CanvasTexture {
  return canvasTex('snow', 128, 128, (c, w, h) => {
    const r = rnd(9);
    c.fillStyle = '#f4f8ff';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(170,200,235,0.35)' : 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.arc(r() * w, r() * h, 2 + r() * 6, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function sandTex(): THREE.CanvasTexture {
  return canvasTex('sand', 128, 128, (c, w, h) => {
    const r = rnd(13);
    c.fillStyle = '#e8c27a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(160,110,50,0.35)';
    c.lineWidth = 2;
    for (let y = 6; y < h; y += 12) {
      c.beginPath();
      for (let x = 0; x <= w; x += 4) c.lineTo(x, y + Math.sin(x * 0.12 + y) * 2.5);
      c.stroke();
    }
    speckle(c, w, h, r, 300, ['rgba(255,240,200,0.6)', 'rgba(140,100,50,0.3)'], 2);
  });
}

function arrowTex(): THREE.CanvasTexture {
  return canvasTex('arrow', 128, 128, (c, w, h) => {
    c.fillStyle = '#25262e';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 6;
    c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#ffd23f';
    // two chevrons pointing up (-v in texture space = forward)
    for (const y0 of [30, 66]) {
      c.beginPath();
      c.moveTo(w / 2, y0);
      c.lineTo(w - 24, y0 + 26);
      c.lineTo(w - 40, y0 + 34);
      c.lineTo(w / 2, y0 + 14);
      c.lineTo(40, y0 + 34);
      c.lineTo(24, y0 + 26);
      c.closePath();
      c.fill();
    }
  });
}

function checkerTex(): THREE.CanvasTexture {
  return canvasTex('checker', 64, 64, (c, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      c.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#ffffff';
      c.fillRect(x * s, y * s, s, s);
    }
  });
}

/** The marble's swirl: coloured glass with a light ribbon (shows the marble rolling). */
function marbleTex(glass: number, swirl: number): THREE.CanvasTexture {
  return canvasTex(`marble-${glass}`, 256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    const a = new THREE.Color(glass), b = a.clone().multiplyScalar(0.55);
    g.addColorStop(0, `#${b.getHexString()}`);
    g.addColorStop(0.5, `#${a.getHexString()}`);
    g.addColorStop(1, `#${b.getHexString()}`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = css(swirl, 0.95);
    c.lineCap = 'round';
    for (const [y0, amp, lw, ph] of [[h * 0.5, 26, 9, 0], [h * 0.3, 14, 4, 2], [h * 0.72, 18, 5, 4]] as const) {
      c.lineWidth = lw;
      c.beginPath();
      for (let x = -4; x <= w + 4; x += 4) c.lineTo(x, y0 + Math.sin((x / w) * Math.PI * 4 + ph) * amp);
      c.stroke();
    }
  });
}

// ---------------------------------------------------------------- materials

export interface Mats {
  floor: THREE.Material;
  wall: THREE.Material;
  bridge: THREE.Material;
  ice: THREE.Material;
  sand: THREE.Material;
  rim: THREE.Material;
  tube: THREE.Material;
  pad: THREE.Material;
  mover: THREE.Material;
  below: THREE.Material;
  checker: THREE.Material;
}

const matCache = new Map<string, Mats>();

export function mats(th: Theme): Mats {
  const hit = matCache.get(th.key);
  if (hit) return hit;
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  let floor: THREE.Material, wall: THREE.Material;
  if (th.key === 'wood') {
    floor = std({ map: woodTex('woodLight', 0xd9a36a, 0x6b3f1f), roughness: 0.62 });
    wall = std({ map: woodTex('woodDark', 0x7a4a2a, 0x2a160a, 2), roughness: 0.55 });
  } else if (th.key === 'garden') {
    floor = std({ map: slabTex('paver', 0xd8cdb2, 0x8f8467, 2, 21), roughness: 0.85 });
    wall = std({ map: hedgeTex(), roughness: 0.95 });
  } else if (th.key === 'ice') {
    floor = std({ map: slabTex('frost', 0x9fb3cc, 0x56677f, 2, 31), roughness: 0.7 });
    wall = std({ color: 0xbfeaff, map: iceTex(), roughness: 0.15, metalness: 0.05, emissive: 0x1d5f8a, emissiveIntensity: 0.25 });
  } else {
    floor = std({ map: slabTex('sandstone', 0xe2cfa3, 0xa58c5c, 3, 41), roughness: 0.8 });
    wall = std({ map: slabTex('ruinwall', 0xc9b48a, 0x7d6a48, 2, 43), roughness: 0.85 });
  }
  const m: Mats = {
    floor,
    wall,
    bridge: std({ map: woodTex('plank', 0xb98352, 0x4a2a12, 2), roughness: 0.7 }),
    ice: std({ map: iceTex(), roughness: 0.08, metalness: 0.1 }),
    sand: std({ map: th.key === 'ice' ? snowTex() : sandTex(), roughness: 1 }),
    rim: new THREE.MeshStandardMaterial({ color: th.rim, roughness: 0.35, metalness: 0.6 }),
    tube: new THREE.MeshBasicMaterial({ color: 0x07060a, side: THREE.DoubleSide }),
    pad: new THREE.MeshStandardMaterial({ map: arrowTex(), roughness: 0.5, emissive: 0x332600, emissiveIntensity: 0.6 }),
    mover: std({ map: th.key === 'garden' ? woodTex('raft', 0x9c6b3e, 0x3a2412, 4) : th.key === 'ruins' ? slabTex('floatstone', 0xd9c79c, 0x8f7a52, 1, 47) : woodTex('platform', 0xc58a4a, 0x4a2a12, 3), roughness: 0.7 }),
    below: th.voidKind === 'water'
      ? new THREE.MeshStandardMaterial({ color: th.below, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 })
      : th.key === 'wood'
        ? new THREE.MeshLambertMaterial({ color: 0xffffff, map: tableTex() })
        : new THREE.MeshLambertMaterial({ color: th.below }),
    checker: new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.6 }),
  };
  matCache.set(th.key, m);
  return m;
}

const marbleMats = new Map<string, THREE.MeshPhysicalMaterial>();

/** The glossy glass marble with its swirl; reflections from `env`. */
export function marbleMat(th: Theme, env: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  let m = marbleMats.get(th.key);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      map: marbleTex(th.marble[0], th.marble[1]), roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04,
      envMapIntensity: 1.1,
    });
    marbleMats.set(th.key, m);
  }
  if (env && m.envMap !== env) {
    m.envMap = env;
    m.needsUpdate = true;
  }
  return m;
}

// ---------------------------------------------------------------- Kenney models

const done = new WeakSet<THREE.Material>();

/** Natural colours for the nature kit (its own greens turn teal under this light). */
const RECOLOR: Record<string, number> = {
  leafsGreen: 0x4f9a3c,
  leafsDark: 0x2f7a45,
  woodBarkDark: 0x6a4029,
  grass: 0x63a843,
  stone: 0x9d978c,
  dirt: 0x9c6b45,
  woodBark: 0x7d5234,
};

/** Kenney GLB materials come with metalness 1, which turns them nearly black without an environment map. */
export function matte<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of list) {
      if (done.has(mm)) continue;
      done.add(mm);
      const s = mm as THREE.MeshStandardMaterial;
      if (s.isMeshStandardMaterial) {
        if (RECOLOR[s.name] !== undefined) s.color.setHex(RECOLOR[s.name]);
        else s.color.convertSRGBToLinear();
        s.metalness = 0;
        s.roughness = Math.max(0.55, s.roughness);
      }
    }
  });
  return obj;
}

/** A grounded, matte copy of a kit model. */
export function prop(key: string, scale: number, shadows = true): THREE.Group {
  const g = grounded(matte(model(key, { shadows })));
  g.scale.setScalar(scale);
  return g;
}
