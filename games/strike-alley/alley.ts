// The bowling centre, built from shapes and canvas textures: our lane with its boards, arrows,
// dots and foul line, gutters, capping with neon, the pin deck, kickbacks, pit and curtain, the
// masking unit, the sweep bar and setting table, the ball return, overhead monitors, the
// neighbouring lanes with their racks, the settee behind the approach and the ceiling lights.
//
// The lane is glossy in two ways: an environment map made from a little neon "room" (so the
// boards, the ball and the pins pick up coloured highlights), and a fake mirror: copies of the
// pins and the ball are drawn upside down under the boards, and the boards are slightly
// see-through, so the pins stand on their own reflections.
import { THREE } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  LANE_HALF, GUTTER_W, WALL_X, GUTTER_DEPTH, HEAD_Z, PIT_Z, BACK_Z, PIN_COM, SPOTS, BALL_R, OIL_LEN,
} from './sim';

/** Distance between the centres of two neighbouring lanes. */
export const PITCH = 2 * WALL_X + 0.16;
/** Where the approach ends behind the foul line. */
export const APPROACH = 4.9;
/** Ball return: the hood's mouth and the end of the rack (where the bowler picks the ball up). */
export const RETURN_X = -(WALL_X + 0.08);
export const HOOD_Z = 3.15;
export const RACK_END_Z = 4.55;
export const RACK_Y = 0.52;

const NEON = [0xff3fa4, 0x34e7ff, 0xffd23f, 0x8a5bff];

// ------------------------------------------------------------------ textures

const texCache = new Map<string, THREE.CanvasTexture>();

export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

function rnd(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Maple boards: 39 strips with their own tone and grain (repeats along the lane). */
function boardsTexture(): THREE.CanvasTexture {
  const t = canvasTex('boards', 512, 1024, (g, w, h) => {
    const r = rnd(7);
    const bw = w / 39;
    for (let i = 0; i < 39; i++) {
      const tone = 0.86 + r() * 0.14;
      const base = [232 * tone, 186 * tone, 128 * tone];
      g.fillStyle = `rgb(${base.map((v) => Math.round(v)).join(',')})`;
      g.fillRect(i * bw, 0, bw + 1, h);
      // grain
      for (let k = 0; k < 26; k++) {
        const x = i * bw + r() * bw;
        g.strokeStyle = `rgba(${120 + r() * 40},${70 + r() * 30},${30},${0.06 + r() * 0.08})`;
        g.lineWidth = 0.6 + r() * 1.2;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 64) g.lineTo(x + Math.sin(y * 0.01 + k) * 1.5, y);
        g.stroke();
      }
      // a butt joint now and then
      const j = r() * h;
      g.fillStyle = 'rgba(90,50,20,0.25)';
      g.fillRect(i * bw, j, bw, 1.5);
      g.fillStyle = 'rgba(70,40,15,0.45)';
      g.fillRect(i * bw, 0, 1, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The ball's marbled resin with three finger holes. */
export function ballTexture(colors: [string, string, string]): THREE.CanvasTexture {
  return canvasTex('ball:' + colors.join(), 512, 256, (g, w, h) => {
    const r = rnd(11);
    g.fillStyle = colors[0];
    g.fillRect(0, 0, w, h);
    // swirls
    for (let k = 0; k < 70; k++) {
      g.strokeStyle = k % 3 ? colors[1] : colors[2];
      g.globalAlpha = 0.25 + r() * 0.5;
      g.lineWidth = 3 + r() * 14;
      g.beginPath();
      let x = r() * w, y = r() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 140; y += (r() - 0.5) * 70;
        g.quadraticCurveTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 80, x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    // finger holes near the top (one thumb, two fingers)
    const hole = (x: number, y: number, rr: number) => {
      const gr = g.createRadialGradient(x, y, rr * 0.2, x, y, rr);
      gr.addColorStop(0, '#000');
      gr.addColorStop(0.75, '#111');
      gr.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, rr, rr * 1.6, 0, 0, Math.PI * 2);
      g.fill();
    };
    hole(w * 0.25, h * 0.2, 9);
    hole(w * 0.22, h * 0.31, 7);
    hole(w * 0.28, h * 0.31, 7);
  });
}

/** The masking unit's art over the pins: neon stripes, stars and a big pin, lane number 7. */
function maskingTexture(seed: number, hue: number): THREE.CanvasTexture {
  return canvasTex('mask' + seed, 512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1a0f3a');
    gr.addColorStop(1, '#2c0f45');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const cols = ['#ff3fa4', '#34e7ff', '#ffd23f', '#8a5bff'];
    const r = rnd(seed);
    // diagonal speed stripes
    for (let i = 0; i < 5; i++) {
      g.fillStyle = cols[(i + hue) % 4];
      g.globalAlpha = 0.85;
      g.beginPath();
      const x = 40 + i * 46 + r() * 8;
      g.moveTo(x, h);
      g.lineTo(x + 26, h);
      g.lineTo(x + 26 + 90, 0);
      g.lineTo(x + 90, 0);
      g.fill();
    }
    g.globalAlpha = 1;
    // stars
    for (let i = 0; i < 14; i++) {
      const x = r() * w, y = r() * h * 0.8, s = 3 + r() * 7;
      g.fillStyle = cols[(i + seed) % 4];
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? s * 0.45 : s;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
    // a big pin on the right
    const px = w * 0.76, py = h * 0.52;
    g.save();
    g.translate(px, py);
    g.rotate(0.25);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, 30, 34, 52, 0, 0, Math.PI * 2);
    g.ellipse(0, -52, 18, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-11, -42, 22, 40);
    g.fillStyle = '#ff2f4f';
    g.fillRect(-13, -30, 26, 6);
    g.fillRect(-13, -20, 26, 6);
    g.restore();
    // the lane number
    g.font = 'bold 96px Fredoka, Nunito, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#0b0620';
    g.strokeText(String(seed), w * 0.45, h * 0.55);
    g.fillStyle = cols[(seed + 1) % 4];
    g.fillText(String(seed), w * 0.45, h * 0.55);
  });
}

/** A soft round shadow. */
export function blobTexture(): THREE.CanvasTexture {
  return canvasTex('blob', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

// ------------------------------------------------------------------ pin and ball geometry

/** Real pin profile: [height above the base, radius] in inches. */
const PROFILE_IN: [number, number][] = [
  [0, 1.0], [0.4, 1.25], [1.2, 1.62], [2.25, 1.97], [3.375, 2.26], [4.5, 2.383], [5.875, 2.31], [7.25, 1.98],
  [8.4, 1.5], [9.3, 1.12], [10.0, 0.93], [10.8, 0.92], [11.75, 1.05], [12.6, 1.2], [13.5, 1.27], [14.2, 1.13], [14.7, 0.82], [14.95, 0.35], [15, 0],
];

let pinGeo: THREE.BufferGeometry | null = null;

/** A lathed pin, origin at its centre of mass, white with two red neck stripes (vertex colours). */
export function pinGeometry(): THREE.BufferGeometry {
  if (pinGeo) return pinGeo;
  const curve = new THREE.SplineCurve(PROFILE_IN.map(([hh, r]) => new THREE.Vector2(r * 0.0254, hh * 0.0254)));
  const pts = curve.getPoints(48).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 1.0 * 0.0254;
  const geo = new THREE.LatheGeometry(pts, 22);
  // a flat base
  const base = new THREE.CircleGeometry(1.0 * 0.0254, 22).rotateX(Math.PI / 2);
  const parts = [geo.toNonIndexed(), base.toNonIndexed()];
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts)!;
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color(0xfbfaf6), red = new THREE.Color(0xe0182d);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 0.0254;
    const c = (y > 9.05 && y < 9.55) || (y > 10.05 && y < 10.55) ? red : white;
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, -PIN_COM, 0);
  g.computeVertexNormals();
  pinGeo = g;
  return g;
}

let pinMat: THREE.MeshStandardMaterial | null = null;
export function pinMaterial(): THREE.MeshStandardMaterial {
  pinMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0, envMapIntensity: 0.9 });
  return pinMat;
}

// ------------------------------------------------------------------ the room's reflections

/** Neon "room" rendered into an environment map for the gloss on boards, ball and pins. */
export function neonEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x0d0820);
  const mat = (c: number, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 60), mat(0x140c2a));
  box.position.y = 3;
  room.add(box);
  const strip = (x: number, y: number, z: number, w: number, h: number, d: number, c: number, k: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
    m.position.set(x, y, z);
    room.add(m);
  };
  // ceiling light rows down the hall
  for (let z = -25; z <= 25; z += 4) for (const x of [-9, -3, 3, 9]) strip(x, 6.8, z, 0.5, 0.1, 1.6, 0xfff2dc, 1.1);
  // neon along the walls
  strip(-14.5, 2.5, 0, 0.2, 0.25, 56, NEON[0], 2.2);
  strip(14.5, 2.5, 0, 0.2, 0.25, 56, NEON[1], 2.2);
  strip(-14.5, 4.5, 0, 0.2, 0.15, 56, NEON[3], 2);
  strip(14.5, 4.5, 0, 0.2, 0.15, 56, NEON[2], 2);
  // the bright pin deck at the far end and the screens behind
  strip(0, 1.5, -29.5, 12, 2, 0.2, 0xffffff, 1.6);
  strip(0, 3.2, 29.5, 10, 1.6, 0.2, NEON[1], 1.2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(room, 0.03).texture;
  pm.dispose();
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
  return tex;
}

// ------------------------------------------------------------------ building

export interface Alley {
  root: THREE.Group;
  /** The mirrored world under the boards (pins and ball reflections). */
  mirror: THREE.Group;
  pins: THREE.Mesh[];
  mirrorPins: THREE.Mesh[];
  ball: THREE.Mesh;
  mirrorBall: THREE.Mesh;
  /** The sweep bar (move y to lower, z to sweep). */
  sweep: THREE.Group;
  /** The setting table (y lowers it onto the deck). */
  table: THREE.Group;
  /** Neon materials and their base colours (flashed and cycled on strikes). */
  neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  glows: THREE.Mesh[];
  /** Overhead monitor: redraw with `drawScreen`. */
  screen: { tex: THREE.CanvasTexture; canvas: HTMLCanvasElement };
  /** Spots for spectators (on the settee) and neighbours (on their approaches). */
  seats: THREE.Vector3[];
  /** Animated lane lights (arrow markers that light up on a strike). */
  laneLights: THREE.MeshBasicMaterial;
}

const lambert = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const std = (c: number, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, o: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = o.cast ?? false;
  m.receiveShadow = o.receive ?? false;
  parent.add(m);
  return m;
}

/** A half-pipe gutter along z (top edge at y = 0). */
function gutterGeo(len: number): THREE.BufferGeometry {
  const r = GUTTER_W / 2;
  // the lower half of an open cylinder lying along z (seen from inside: double-sided material)
  const g = new THREE.CylinderGeometry(r, r, len, 18, 1, true, Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  g.scale(1, GUTTER_DEPTH / r, 1);
  return g;
}

/** The arrows, dots and foul line on our lane, merged into one flat mesh. */
function markings(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const board = (2 * LANE_HALF) / 39;
  const bx = (b: number) => LANE_HALF - (b - 0.5) * board;   // board 1 is the right edge
  // seven arrows at 15 ft, in a shallow V (the middle one furthest)
  for (const b of [5, 10, 15, 20, 25, 30, 35]) {
    const off = Math.abs(b - 20) / 5;
    const z = -(4.57 + (3 - off) * 0.3048 / 3);
    const s = new THREE.Shape();
    s.moveTo(0, 0.17);
    s.lineTo(-0.028, -0.06);
    s.lineTo(0.028, -0.06);
    s.closePath();
    const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
    g.translate(bx(b), 0.0015, z);
    parts.push(g);
  }
  // guide dots at 7 ft
  for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
    parts.push(new THREE.CircleGeometry(0.011, 10).rotateX(-Math.PI / 2).translate(bx(b), 0.0015, -2.13));
  }
  // approach dots at 12 and 15 ft behind the line
  for (const z of [3.66, 4.57]) for (const b of [3, 5, 8, 11, 14, 20, 26, 29, 32, 35, 37]) {
    parts.push(new THREE.CircleGeometry(0.013, 10).rotateX(-Math.PI / 2).translate(bx(b), 0.0015, z));
  }
  // range finders, the long thin marks past the arrows
  for (const b of [10, 30]) {
    parts.push(new THREE.PlaneGeometry(0.012, 0.9).rotateX(-Math.PI / 2).translate(bx(b), 0.0015, -12.4));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
}

/** Static geometry collected per material and merged into one mesh each (few draw calls). */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).translate(x, y, z);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }
  build(parent: THREE.Object3D): void {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list)!, mat);
      m.receiveShadow = true;
      parent.add(m);
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
  }
}

/** One lane's static parts (gutters, capping, approach, deck sides, pit), into the batch. */
function buildLane(batch: Batch, cx: number, opts: { neonMat: THREE.MeshBasicMaterial; capMat: THREE.Material; gutterMat: THREE.Material; darkMat: THREE.Material; apMat: THREE.Material; boardMat: THREE.Material | null }): void {
  const len = -PIT_Z + 0.02;
  // the boards of a neighbouring lane (ours is its own, see-through mesh)
  if (opts.boardMat) batch.add(opts.boardMat, new THREE.PlaneGeometry(LANE_HALF * 2, len).rotateX(-Math.PI / 2), cx, 0, -len / 2);
  // the approach
  batch.add(opts.apMat, new THREE.PlaneGeometry(WALL_X * 2, APPROACH).rotateX(-Math.PI / 2), cx, 0, APPROACH / 2);
  // gutters
  const gg = gutterGeo(len);
  for (const s of [-1, 1]) batch.add(opts.gutterMat, gg, cx + s * (LANE_HALF + GUTTER_W / 2), 0, -len / 2);
  // capping and its neon edge on the right side (shared with the neighbour)
  const capLen = -HEAD_Z - 0.4;
  batch.add(opts.capMat, new THREE.BoxGeometry(0.16, 0.05, capLen), cx + WALL_X + 0.08, 0.025, -capLen / 2);
  batch.add(opts.neonMat, new THREE.BoxGeometry(0.03, 0.012, capLen), cx + WALL_X + 0.08, 0.056, -capLen / 2);
  // kickbacks beside the deck
  const kbLen = HEAD_Z + 0.6 - BACK_Z;
  for (const s of [-1, 1]) batch.add(opts.darkMat, new THREE.BoxGeometry(0.06, 0.62, kbLen), cx + s * (WALL_X + 0.03), 0.31, HEAD_Z + 0.6 - kbLen / 2);
  // the pit and the curtain behind it
  batch.add(opts.darkMat, new THREE.BoxGeometry(WALL_X * 2, 0.02, PIT_Z - BACK_Z), cx, -0.37, (PIT_Z + BACK_Z) / 2);
  batch.add(opts.darkMat, new THREE.PlaneGeometry(WALL_X * 2, 1.4), cx, 0.3, BACK_Z);
}

/** Our lane's boards: glossy and slightly see-through over the mirrored pins. */
function ourLane(parent: THREE.Group, boards: THREE.Texture): void {
  const len = -PIT_Z + 0.02;
  const laneMat = new THREE.MeshStandardMaterial({ map: boards.clone(), roughness: 0.16, metalness: 0, envMapIntensity: 1.25, transparent: true, opacity: 0.86 });
  laneMat.map!.repeat.set(1, len / 2.4);
  laneMat.map!.needsUpdate = true;
  const lane = add(parent, new THREE.PlaneGeometry(LANE_HALF * 2, len).rotateX(-Math.PI / 2), laneMat, 0, 0, -len / 2, { receive: true });
  lane.userData.ownMaterial = true;
  lane.renderOrder = 1;
}

export function buildAlley(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Alley {
  const root = new THREE.Group();
  scene.add(root);
  scene.environment = neonEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  const boards = boardsTexture();
  const neonMat = new THREE.MeshBasicMaterial({ color: NEON[1], toneMapped: false });
  const neonPink = new THREE.MeshBasicMaterial({ color: NEON[0], toneMapped: false });
  const neonGold = new THREE.MeshBasicMaterial({ color: NEON[2], toneMapped: false });
  const neonViolet = new THREE.MeshBasicMaterial({ color: NEON[3], toneMapped: false });
  const capMat = std(0x2a2440, 0.35);
  const gutterMat = std(0x26232f, 0.22, 0.55);
  gutterMat.side = THREE.DoubleSide;
  const darkMat = lambert(0x0c0a14);
  const opts = { neonMat, capMat, gutterMat, darkMat };

  // the mirror world under our lane (drawn first, seen through the boards)
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  root.add(mirror);
  const under = add(root, new THREE.PlaneGeometry(LANE_HALF * 2, -PIT_Z).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a1018 }), 0, -0.9, PIT_Z / 2);
  under.renderOrder = -1;

  const len = -PIT_Z + 0.02;
  const boardMat = new THREE.MeshStandardMaterial({ map: boards.clone(), roughness: 0.2, envMapIntensity: 1.1 });
  boardMat.map!.repeat.set(1, len / 2.4);
  boardMat.map!.needsUpdate = true;
  const apMat = new THREE.MeshStandardMaterial({ map: boards.clone(), roughness: 0.3, envMapIntensity: 0.8 });
  apMat.map!.repeat.set(1.18, APPROACH / 2.4);
  apMat.map!.needsUpdate = true;
  const batch = new Batch();
  ourLane(root, boards);
  for (let i = -2; i <= 2; i++) buildLane(batch, i * PITCH, { ...opts, apMat, boardMat: i === 0 ? null : boardMat });
  // the far wall of capping on the left of lane -2 and right of +2
  const markMat = new THREE.MeshStandardMaterial({ color: 0x3a1c0c, roughness: 0.3 });
  add(root, markings(), markMat, 0, 0, 0);
  // foul line (and a little red light at each end)
  add(root, new THREE.PlaneGeometry(WALL_X * 2, 0.012).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x15151b }), 0, 0.0016, 0);
  // lane lights: small marks beside the arrows that light up on a strike
  const laneLights = new THREE.MeshBasicMaterial({ color: 0x34e7ff, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const ll: THREE.BufferGeometry[] = [];
  for (let z = -1.2; z > -OIL_LEN; z -= 1.1) for (const s of [-1, 1]) ll.push(new THREE.PlaneGeometry(0.03, 0.4).rotateX(-Math.PI / 2).translate(s * (LANE_HALF - 0.012), 0.002, z).toNonIndexed());
  const llm = add(root, mergeGeometries(ll)!, laneLights, 0, 0, 0);
  llm.renderOrder = 3;

  // overhead: the masking units over every deck, with neon tubes along their lower edge
  const maskW = PITCH * 2 - 0.1;
  for (let i = -1; i <= 1; i++) {
    const tex = maskingTexture(7 + i * 2, i + 1);
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mk = add(root, new THREE.PlaneGeometry(maskW, 1.5), m, i * PITCH * 2 + PITCH / 2, 1.75, HEAD_Z + 0.75);
    mk.userData.ownMaterial = true;
    // the facade around the masking unit
    add(root, new THREE.BoxGeometry(maskW, 0.12, 0.25), capMat, i * PITCH * 2 + PITCH / 2, 0.96, HEAD_Z + 0.78);
  }
  const neon: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [neonMat, neonPink, neonGold, neonViolet].map((m) => ({ mat: m, base: m.color.clone() }));
  const glows: THREE.Mesh[] = [];
  // a neon tube under the masking units, one across the hall, each with a soft band of glow
  const bandTex = canvasTex('band', 8, 64, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 64);
  });
  const tube = (x: number, y: number, z: number, w: number, mat: THREE.MeshBasicMaterial) => {
    add(root, new THREE.CylinderGeometry(0.018, 0.018, w, 8).rotateZ(Math.PI / 2), mat, x, y, z);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.45), new THREE.MeshBasicMaterial({ map: bandTex, color: mat.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glow.position.set(x, y, z + 0.03);
    glow.userData.ownMaterial = true;
    root.add(glow);
    glows.push(glow);
  };
  tube(0, 0.9, HEAD_Z + 0.92, PITCH * 6, neonPink);
  tube(0, 2.58, HEAD_Z + 0.92, PITCH * 6, neonMat);

  // the deck light and the pinsetter's setting table and sweep bar
  // the deck is lit by a warm strip under the masking unit (an emissive bar, no real light: a
  // point light would put a hot spot in the glossy boards right in front of the pins)
  const deckGlow = new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false });
  add(root, new THREE.BoxGeometry(WALL_X * 2, 0.03, 0.06), deckGlow, 0, 0.89, HEAD_Z + 0.68);
  const table = new THREE.Group();
  const tableTop = add(table, new THREE.BoxGeometry(WALL_X * 2 - 0.05, 0.08, 1.05), std(0x3b3f4c, 0.5, 0.4), 0, 0, -0.42, { cast: true });
  tableTop.castShadow = true;
  table.position.set(0, 1.25, HEAD_Z);
  root.add(table);
  const sweep = new THREE.Group();
  add(sweep, new THREE.BoxGeometry(WALL_X * 2 - 0.02, 0.16, 0.05), std(0xd8dce6, 0.35, 0.6), 0, 0.08, 0, { cast: true });
  add(sweep, new THREE.BoxGeometry(WALL_X * 2 - 0.02, 0.03, 0.055), neonGold, 0, 0.17, 0);
  for (const s of [-1, 1]) add(sweep, new THREE.BoxGeometry(0.04, 0.9, 0.04), std(0x9aa0ad, 0.4, 0.6), s * (WALL_X - 0.04), 0.6, 0);
  sweep.position.set(0, 0.95, HEAD_Z + 0.36);
  root.add(sweep);

  // our pins and their reflections
  const pg = pinGeometry(), pmat = pinMaterial();
  const pins: THREE.Mesh[] = [], mirrorPins: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const p = new THREE.Mesh(pg, pmat);
    p.castShadow = true;
    p.receiveShadow = true;
    root.add(p);
    pins.push(p);
    const mp = new THREE.Mesh(pg, pmat);
    mirror.add(mp);
    mirrorPins.push(mp);
  }
  // racks on the neighbouring lanes (one instanced mesh)
  const others = new THREE.InstancedMesh(pg, pmat, 40);
  const mm = new THREE.Matrix4();
  let n = 0;
  for (const lane of [-2, -1, 1, 2]) for (const s of SPOTS) {
    mm.makeTranslation(lane * PITCH + s.x, PIN_COM, s.z);
    others.setMatrixAt(n++, mm);
  }
  others.castShadow = true;
  root.add(others);

  // the ball and its reflection
  const ballMat = new THREE.MeshPhysicalMaterial({ map: ballTexture(['#1d2bff', '#ff3fa4', '#2ef0ff']), roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 });
  const ballGeo = new THREE.SphereGeometry(BALL_R, 36, 24);
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  root.add(ball);
  const mirrorBall = new THREE.Mesh(ballGeo, ballMat);
  mirror.add(mirrorBall);

  // ball return between our lane and the left one: hood, rails, the rack
  const railMat = std(0xc9ced8, 0.25, 0.8);
  const retMat = std(0x232838, 0.3, 0.3);
  const hood = add(root, new THREE.CylinderGeometry(0.27, 0.27, 0.52, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), retMat, RETURN_X, 0.42, HOOD_Z, { cast: true });
  hood.scale.set(1, 1.15, 1);
  add(root, new THREE.BoxGeometry(0.54, 0.42, 0.52), retMat, RETURN_X, 0.21, HOOD_Z, { cast: true, receive: true });
  add(root, new THREE.BoxGeometry(0.4, 0.04, 0.03), neonPink, RETURN_X, 0.66, HOOD_Z + 0.27);
  // the hood's dark mouth
  add(root, new THREE.CircleGeometry(0.15, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x050308 }), RETURN_X, 0.43, HOOD_Z + 0.262);
  const railLen = RACK_END_Z - HOOD_Z - 0.2;
  for (const s of [-1, 1]) {
    const rail = add(root, new THREE.CylinderGeometry(0.012, 0.012, railLen, 8).rotateX(Math.PI / 2), railMat, RETURN_X + s * 0.065, RACK_Y, HOOD_Z + 0.2 + railLen / 2);
    rail.rotation.x = 0.03;
  }
  add(root, new THREE.BoxGeometry(0.3, RACK_Y - 0.05, 0.1), retMat, RETURN_X, (RACK_Y - 0.05) / 2, RACK_END_Z + 0.05, { cast: true });

  // the scoring monitor over the settee, facing the lanes (seen behind the bowler)
  const sc = document.createElement('canvas');
  sc.width = 512;
  sc.height = 256;
  const stex = new THREE.CanvasTexture(sc);
  stex.colorSpace = THREE.SRGBColorSpace;
  const screen = { tex: stex, canvas: sc };
  const scrMat = new THREE.MeshBasicMaterial({ map: stex, toneMapped: false });
  const mon = new THREE.Group();
  mon.position.set(0, 2.55, APPROACH + 1.2);
  mon.rotation.set(-0.12, Math.PI, 0);
  add(mon, new THREE.BoxGeometry(1.9, 1.02, 0.08), lambert(0x101018), 0, 0, -0.045);
  add(mon, new THREE.PlaneGeometry(1.8, 0.92), scrMat, 0, 0, 0.0);
  add(mon, new THREE.BoxGeometry(1.9, 0.03, 0.03), neonPink, 0, -0.53, 0.0);
  root.add(mon);
  for (const s of [-1, 1]) add(root, new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), railMat, s * 0.7, 3.4, APPROACH + 1.22);

  // ceiling: dark with light strips running down the hall
  add(root, new THREE.PlaneGeometry(PITCH * 7, 36).rotateX(Math.PI / 2), lambert(0x120c22), 0, 3.6, -12);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });
  const lightGeos: THREE.BufferGeometry[] = [];
  for (let z = 2; z > -17; z -= 2.4) for (const x of [-PITCH * 1.5, -PITCH / 2, PITCH / 2, PITCH * 1.5]) {
    lightGeos.push(new THREE.PlaneGeometry(0.12, 1.3).rotateX(Math.PI / 2).translate(x, 3.58, z).toNonIndexed());
  }
  add(root, mergeGeometries(lightGeos)!, lightMat, 0, 0, 0);
  // side walls with neon bands
  for (const s of [-1, 1]) {
    add(root, new THREE.PlaneGeometry(40, 3.6).rotateY(-s * Math.PI / 2), lambert(0x1a1030), s * PITCH * 3.3, 1.8, -12);
    add(root, new THREE.BoxGeometry(0.04, 0.05, 40), s < 0 ? neonViolet : neonGold, s * (PITCH * 3.3 - 0.03), 2.2, -12);
    add(root, new THREE.BoxGeometry(0.04, 0.05, 40), s < 0 ? neonPink : neonMat, s * (PITCH * 3.3 - 0.03), 1.0, -12);
  }

  // behind the approach: carpet, the settee and the back wall with a neon sign
  add(root, new THREE.PlaneGeometry(PITCH * 7, 6).rotateX(-Math.PI / 2), lambert(0x2a1846), 0, -0.002, APPROACH + 3, { receive: true });
  const seatMat = std(0xff3f6e, 0.6);
  const seatMat2 = std(0x2fc4ff, 0.6);
  const seats: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const x = s * 1.25;
    add(root, new THREE.BoxGeometry(1.5, 0.42, 0.55), s < 0 ? seatMat : seatMat2, x, 0.21, APPROACH + 1.9, { cast: true, receive: true });
    add(root, new THREE.BoxGeometry(1.5, 0.55, 0.14), s < 0 ? seatMat : seatMat2, x, 0.62, APPROACH + 2.15, { cast: true, receive: true });
    seats.push(new THREE.Vector3(x - 0.35, 0.42, APPROACH + 1.85), new THREE.Vector3(x + 0.35, 0.42, APPROACH + 1.85));
  }
  add(root, new THREE.PlaneGeometry(PITCH * 7, 3.8), lambert(0x1c1236), 0, 1.8, APPROACH + 4.2);
  // a neon pin-and-ball sign on the back wall
  const sign = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 40), neonMat);
  sign.add(ring);
  const pinOutline = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 30), neonPink);
  pinOutline.position.set(0.75, 0.05, 0);
  pinOutline.scale.set(0.8, 1.6, 1);
  sign.add(pinOutline);
  sign.position.set(0, 2.2, APPROACH + 4.15);
  sign.rotation.y = Math.PI;
  root.add(sign);

  batch.build(root);
  return { root, mirror, pins, mirrorPins, ball, mirrorBall, sweep, table, neon, glows, screen, seats, laneLights };
}

/** Redraws the overhead monitors. */
export function drawScreen(a: Alley, o: { title: string; big: string; sub: string; color: string; standing?: boolean[] }): void {
  const g = a.screen.canvas.getContext('2d')!;
  const w = 512, h = 256;
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#13204a');
  gr.addColorStop(1, '#0a0f26');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let y = 0; y < h; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#9fb4ff';
  g.font = 'bold 34px Fredoka, Nunito, sans-serif';
  g.fillText(o.title, w / 2, 44);
  g.fillStyle = o.color;
  g.font = 'bold 104px Fredoka, Nunito, sans-serif';
  g.fillText(o.big, w / 2, 136);
  g.fillStyle = '#ffffff';
  g.font = 'bold 32px Nunito, sans-serif';
  g.fillText(o.sub, o.standing ? w * 0.4 : w / 2, 220);
  if (o.standing) {
    // the rack in the corner, standing pins lit
    let i = 0;
    for (let row = 0; row < 4; row++) for (let j = 0; j <= row; j++, i++) {
      const x = w - 70 + (j - row / 2) * 26, y = 200 - row * 22;
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      if (o.standing[i]) { g.fillStyle = '#ffffff'; g.fill(); } else { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.stroke(); }
    }
  }
  a.screen.tex.needsUpdate = true;
}
