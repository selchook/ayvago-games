// Blacktop Kings: the street court and the city round it.
//   - The court, the sidewalk, the backboard face, the chain-link fence, the net and the ball are
//     canvas textures drawn here (no network loads, nothing copied from any real court).
//   - The skyline is Kenney City Kit Commercial, the street lamps and the road Kenney City Kit
//     Roads: each kit becomes ONE merged mesh with one material (its colormap).
//   - The hoop (pole, arm, padding, backboard, rim, net) is built from simple shapes: no Kenney
//     kit has one.
//   - keepPrograms() keeps the shader programs of the menu's court alive, so the Play scene's
//     first frame does not compile them again after the menu's World3D freed its materials.
import Phaser from 'phaser';
import { THREE, model, loadKenney3d, loadMiniCharacter, loadCharacter3d, MINI_MALES, CHARACTER_MODELS, miniKey } from '@core/three';
import { playerCharacter, peerCharacter, net } from '@core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARC_R, ARC_SIDE, BALL_R, BOARD_HALF_W, BOARD_X, BOARD_Y0, BOARD_Y1, COURT_L, HALF_W, HOOP_X, HOOP_Z, KEY_L, KEY_W, RIM_R, RIM_Y,
} from './court';

export const CITY = 'city-kit-commercial';
export const ROADS = 'city-kit-roads';
/** City Kit Commercial models the game loads (tools/import-kenney.py CITY_KIT_COMMERCIAL). */
export const CITY_MODELS = [
  'building-a', 'building-c', 'building-e', 'building-g', 'building-h', 'building-k',
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c',
  'low-detail-building-a', 'low-detail-building-c', 'low-detail-building-wide-a', 'detail-parasol-a',
] as const;
/** City Kit Roads models (CITY_KIT_ROADS). */
export const ROAD_MODELS = ['light-square', 'light-curved', 'road-straight', 'construction-cone'] as const;
const ck = (n: string) => 'ck:' + n;
const rk = (n: string) => 'rk:' + n;
/** One city block of the kits in metres. */
const BLOCK = 10;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of CITY_MODELS) loadKenney3d(load, ck(n), CITY, n);
  for (const n of ROAD_MODELS) loadKenney3d(load, rk(n), ROADS, n);
  for (const m of MINI_MALES) loadMiniCharacter(load, m);
  loadCharacter3d(load, playerCharacter());
  if (net.active || peerCharacter() !== playerCharacter()) loadCharacter3d(load, peerCharacter());
}

/** Model key of a platform character's Mini Character. */
export const charKey = (id: keyof typeof CHARACTER_MODELS): string => miniKey(CHARACTER_MODELS[id]);

// ------------------------------------------------------------------ canvas textures

const canvases = new Map<string, HTMLCanvasElement>();

/** A canvas drawn once per page; each world wraps it in its own texture (freed with the world). */
function canvas(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  let c = canvases.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!, w, h);
    canvases.set(key, c);
  }
  return c;
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.name = [...canvases.entries()].find(([, v]) => v === c)?.[0] ?? '';
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Deterministic noise for the textures (the same court on every load). */
function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The court picture covers x -3.5..14 and z -9.5..9.5 (metres), 110 px a metre. */
const CX0 = -3.5, CX1 = 14, CZ0 = -9.5, CZ1 = 9.5;
const PX = 64;

function drawCourt(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = noise(7);
  const X = (x: number) => (x - CX0) * PX, Z = (z: number) => (z - CZ0) * PX;
  // asphalt round the court
  g.fillStyle = '#4a4d55';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) {
    const v = 60 + r() * 50;
    g.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + r() * 0.3})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
  }
  // the painted court: blue, the lane and the circle terracotta
  g.fillStyle = '#2d6f9e';
  g.fillRect(X(0), Z(-HALF_W), COURT_L * PX, 15 * PX);
  // the area inside the arc a shade lighter
  g.save();
  g.beginPath();
  g.rect(X(0), Z(-HALF_W), COURT_L * PX, 15 * PX);
  g.clip();
  g.fillStyle = '#3580b3';
  g.beginPath();
  const a0 = Math.asin(ARC_SIDE / ARC_R);
  g.moveTo(X(COURT_L), Z(-ARC_SIDE));
  g.lineTo(X(HOOP_X - Math.cos(a0) * ARC_R + 0.0001), Z(-ARC_SIDE));
  g.arc(X(HOOP_X), Z(HOOP_Z), ARC_R * PX, Math.PI + a0, Math.PI - a0, true);
  g.lineTo(X(COURT_L), Z(ARC_SIDE));
  g.closePath();
  g.fill();
  g.fillStyle = '#c4553a';
  g.fillRect(X(COURT_L - KEY_L), Z(-KEY_W / 2), KEY_L * PX, KEY_W * PX);
  g.beginPath();
  g.arc(X(0), Z(0), 1.8 * PX, -Math.PI / 2, Math.PI / 2);
  g.fill();
  g.restore();
  // wear: lighter scuffs and dark rubber marks
  for (let i = 0; i < 9000; i++) {
    const x = r() * w, y = r() * h;
    g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.04})` : `rgba(0,0,0,${0.04 + r() * 0.05})`;
    g.fillRect(x, y, 3 + r() * 6, 2 + r() * 4);
  }
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(20,20,24,${0.12 + r() * 0.12})`;
    g.lineWidth = 3 + r() * 5;
    g.beginPath();
    const x = X(r() * 12), y = Z(-7 + r() * 14);
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 160, y + (r() - 0.5) * 160, x + (r() - 0.5) * 260, y + (r() - 0.5) * 260);
    g.stroke();
  }
  // cracks in the asphalt
  g.strokeStyle = 'rgba(25,25,28,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    let x = r() * w, y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  // lines
  g.strokeStyle = '#f4f1e8';
  g.lineWidth = 0.06 * PX;
  g.lineCap = 'butt';
  const line = (pts: Array<[number, number]>) => { g.beginPath(); g.moveTo(X(pts[0][0]), Z(pts[0][1])); for (const p of pts.slice(1)) g.lineTo(X(p[0]), Z(p[1])); g.stroke(); };
  g.strokeRect(X(0), Z(-HALF_W), COURT_L * PX, 15 * PX);
  line([[COURT_L, -ARC_SIDE], [HOOP_X - Math.cos(a0) * ARC_R, -ARC_SIDE]]);
  line([[COURT_L, ARC_SIDE], [HOOP_X - Math.cos(a0) * ARC_R, ARC_SIDE]]);
  g.beginPath(); g.arc(X(HOOP_X), Z(HOOP_Z), ARC_R * PX, Math.PI + a0, Math.PI - a0, true); g.stroke();
  g.strokeRect(X(COURT_L - KEY_L), Z(-KEY_W / 2), KEY_L * PX, KEY_W * PX);
  g.beginPath(); g.arc(X(COURT_L - KEY_L), Z(0), 1.8 * PX, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.setLineDash([0.35 * PX, 0.3 * PX]);
  g.beginPath(); g.arc(X(COURT_L - KEY_L), Z(0), 1.8 * PX, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.setLineDash([]);
  g.beginPath(); g.arc(X(HOOP_X), Z(HOOP_Z), 1.25 * PX, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 1.8 * PX, -Math.PI / 2, Math.PI / 2); g.stroke();
  // a crown stencil at the top of the key (the game's own mark)
  g.save();
  g.translate(X(1.35), Z(0));
  g.rotate(Math.PI / 2);
  g.fillStyle = 'rgba(255,210,63,0.85)';
  const s = 0.32 * PX;
  g.beginPath();
  g.moveTo(-2 * s, s); g.lineTo(-2 * s, -s); g.lineTo(-s, 0); g.lineTo(0, -1.4 * s); g.lineTo(s, 0); g.lineTo(2 * s, -s); g.lineTo(2 * s, s);
  g.closePath(); g.fill();
  g.restore();
  // paint wears off the lines a little
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(60,70,80,${0.15 + r() * 0.25})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 3);
  }
}

function drawSidewalk(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = noise(11);
  g.fillStyle = '#9a968c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = 130 + r() * 40;
    g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.35)`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
  g.strokeStyle = 'rgba(70,68,62,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(0, (i * h) / 4); g.lineTo(w, (i * h) / 4); g.stroke();
    g.beginPath(); g.moveTo((i * w) / 4, 0); g.lineTo((i * w) / 4, h); g.stroke();
  }
}

function drawChain(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(205,210,215,1)';
  g.lineWidth = 3;
  // diamond mesh: two families of diagonals
  for (let i = -h; i < w + h; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
  }
}

function drawNet(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  for (let i = -h; i < w + h; i += 24) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h * 0.6, h); g.stroke();
    g.beginPath(); g.moveTo(i, h); g.lineTo(i + h * 0.6, 0); g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, 6);
}

function drawBoard(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#1c1f26';
  g.lineWidth = 14;
  g.strokeRect(7, 7, w - 14, h - 14);
  // the shooter's square above the rim (0.59 × 0.45 m on a 1.8 × 1.05 m board)
  const sw = (0.59 / 1.8) * w, sh = (0.45 / 1.05) * h;
  g.strokeStyle = '#e8402e';
  g.lineWidth = 10;
  g.strokeRect(w / 2 - sw / 2, h - sh - (0.15 / 1.05) * h, sw, sh);
  // a little grime
  const r = noise(5);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 6, 6); }
}

function drawBall(g: CanvasRenderingContext2D, w: number, h: number): void {
  const r = noise(3);
  g.fillStyle = '#e2742c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(120,40,10,${0.1 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 2, 2); }
  g.strokeStyle = '#1d140f';
  g.lineWidth = 5;
  for (const x of [0, w / 4, w / 2, (3 * w) / 4, w]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  for (const sgn of [1, -1]) {
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = h / 2 + sgn * Math.cos((x / w) * Math.PI * 2) * h * 0.3;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function drawSky(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3d76c4');
  gr.addColorStop(0.45, '#7fb2e3');
  gr.addColorStop(0.8, '#f2c9a0');
  gr.addColorStop(1, '#f6b98a');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

/** A soft round glow (particles, shadows). */
export function drawGlow(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

function drawBlob(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.6)');
  gr.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}

export const glowCanvas = () => canvas('glow', 64, 64, drawGlow);
export const blobCanvas = () => canvas('blob', 64, 64, drawBlob);
export const ballCanvas = () => canvas('ball', 256, 128, drawBall);

// ------------------------------------------------------------------ helpers

/** Kenney kit models sample the kit's colormap: one matte material per kit and world. */
function kitMaterial(key: string): THREE.MeshLambertMaterial {
  let map: THREE.Texture | null = null;
  model(key, { shadows: false }).traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map) map = m.map;
  });
  const mat = new THREE.MeshLambertMaterial({ map });
  return mat;
}

/** The plain geometry (position, normal, uv) of a model placed by a matrix. */
function bake(key: string, m: THREE.Matrix4): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const obj = model(key, { shadows: false });
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, mesh.matrixWorld));
    out.push(g);
    g = null as unknown as THREE.BufferGeometry;
  });
  return out;
}

/** Bottom-centre of a kit model's box, in model units (Kenney pivots sit in a corner). */
function footOf(key: string): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(model(key, { shadows: false }));
  return new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
}

function placed(key: string, x: number, z: number, rotY: number, scale: number): THREE.Matrix4 {
  const f = footOf(key);
  return new THREE.Matrix4()
    .makeTranslation(x, 0, z)
    .multiply(new THREE.Matrix4().makeRotationY(rotY))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-f.x, -f.y, -f.z));
}

function mergedMesh(parts: THREE.BufferGeometry[], mat: THREE.Material, cast = false, receive = true): THREE.Mesh {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** A box as plain geometry with a vertex colour (merged later). */
function cbox(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return withColor(g, color);
}

function ccyl(r0: number, r1: number, h: number, x: number, y: number, z: number, color: number, seg = 10, rot?: THREE.Euler): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg).toNonIndexed();
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(x, y, z);
  return withColor(g, color);
}

function withColor(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------------ the scene

export interface Court {
  root: THREE.Group;
  /** Shakes on a rim hit or a dunk. */
  rim: THREE.Group;
  net: THREE.Mesh;
  board: THREE.Group;
  /** The 3-point arc lights up when a take-back is needed. */
  arcGlow: THREE.Mesh;
  ballMat: THREE.MeshLambertMaterial;
}

/** Builds the court, the hoop, the fence and the city into `scene`. */
export function buildCourt(scene: THREE.Scene): Court {
  const root = new THREE.Group();
  scene.add(root);
  scene.background = tex(canvas('sky', 16, 256, drawSky));

  // ground: the sidewalk round everything, the court on top
  const sideTex = tex(canvas('side', 256, 256, drawSidewalk), true);
  sideTex.repeat.set(30, 30);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshLambertMaterial({ map: sideTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(6, -0.02, -20);
  ground.receiveShadow = true;
  root.add(ground);
  const courtTex = tex(canvas('court', Math.round((CX1 - CX0) * PX), Math.round((CZ1 - CZ0) * PX), drawCourt));
  const court = new THREE.Mesh(new THREE.PlaneGeometry(CX1 - CX0, CZ1 - CZ0), new THREE.MeshLambertMaterial({ map: courtTex }));
  court.rotation.x = -Math.PI / 2;
  court.position.set((CX0 + CX1) / 2, 0, (CZ0 + CZ1) / 2);
  court.receiveShadow = true;
  root.add(court);

  // the take-back arc glow
  const a0 = Math.asin(ARC_SIDE / ARC_R);
  // the arc's ends meet its straight lines at |z| = ARC_SIDE (theta counts from +x, the plane is laid flat)
  const ring = new THREE.RingGeometry(ARC_R - 0.13, ARC_R + 0.13, 72, 1, Math.PI - a0, 2 * a0);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
  const arcGlow = new THREE.Mesh(ring, glowMat);
  arcGlow.rotation.x = -Math.PI / 2;
  arcGlow.position.set(HOOP_X, 0.02, HOOP_Z);
  arcGlow.renderOrder = 2;
  root.add(arcGlow);

  root.add(buildHoopFrame());
  const rim = new THREE.Group();
  rim.position.set(HOOP_X, RIM_Y, HOOP_Z);
  const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(RIM_R + 0.012, 0.02, 8, 36), new THREE.MeshLambertMaterial({ color: 0xff5a1f, emissive: 0x401000 }));
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.castShadow = true;
  rim.add(rimMesh);
  // the net hangs from the rim
  const netTex = tex(canvas('net', 256, 64, drawNet), true);
  netTex.repeat.set(3, 1);
  const netGeo = new THREE.CylinderGeometry(RIM_R, RIM_R * 0.58, 0.46, 18, 3, true);
  netGeo.translate(0, -0.23, 0);
  const net = new THREE.Mesh(netGeo, new THREE.MeshLambertMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
  rim.add(net);
  root.add(rim);

  const board = new THREE.Group();
  const boardTex = tex(canvas('board', 360, 210, drawBoard));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_HALF_W * 2, BOARD_Y1 - BOARD_Y0), new THREE.MeshLambertMaterial({ map: boardTex }));
  face.rotation.y = -Math.PI / 2;
  face.position.set(BOARD_X - 0.001, (BOARD_Y0 + BOARD_Y1) / 2, HOOP_Z);
  face.castShadow = false;
  board.add(face);
  root.add(board);

  buildFence(root);
  buildCity(root);

  const ballMat = new THREE.MeshLambertMaterial({ map: tex(ballCanvas()) });
  return { root, rim, net, board, arcGlow, ballMat };
}

/** Pole, arm, padding, the back of the board and the rim bracket: one vertex-coloured mesh. */
function buildHoopFrame(): THREE.Mesh {
  const poleX = COURT_L + 1.35;
  const parts = [
    ccyl(0.11, 0.11, 4.05, poleX, 2.02, 0, 0x2b3038, 12),
    cbox(0.34, 1.7, 0.34, poleX, 0.85, 0, 0x1f4e8c),
    cbox(0.6, 0.08, 0.6, poleX, 0.04, 0, 0x2b3038),
    cbox(poleX - BOARD_X - 0.05, 0.14, 0.14, (poleX + BOARD_X + 0.05) / 2, 3.45, 0, 0x2b3038),
    cbox(0.6, 0.1, 0.1, BOARD_X + 0.35, 3.05, 0.45, 0x2b3038),
    cbox(0.6, 0.1, 0.1, BOARD_X + 0.35, 3.05, -0.45, 0x2b3038),
    cbox(0.07, BOARD_Y1 - BOARD_Y0 + 0.08, BOARD_HALF_W * 2 + 0.08, BOARD_X + 0.04, (BOARD_Y0 + BOARD_Y1) / 2, 0, 0x2b3038),
    cbox(0.24, 0.06, 0.16, BOARD_X - 0.1, RIM_Y - 0.03, 0, 0xff5a1f),
    // the padding under the board
    cbox(0.1, 0.08, BOARD_HALF_W * 2 + 0.1, BOARD_X - 0.02, BOARD_Y0 - 0.04, 0, 0x1f4e8c),
  ];
  const m = mergedMesh(parts, new THREE.MeshLambertMaterial({ vertexColors: true }), true, true);
  return m;
}

/** The chain-link fence: posts and rails in one mesh, the mesh panels in another. */
function buildFence(root: THREE.Group): void {
  const H = 3.6, x0 = -3.2, x1 = 14.4, zf = -9.3, zn = 9.3;
  const runs: Array<[number, number, number, number]> = [
    [x0, zf, x1, zf],       // far side
    [x1, zf, x1, zn],       // behind the baseline
    [x0, zf, x0, zn],       // behind the half-court line
  ];
  const posts: THREE.BufferGeometry[] = [];
  const panels: THREE.BufferGeometry[] = [];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 3);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      posts.push(ccyl(0.05, 0.05, H, ax + ux * t, H / 2, az + uz * t, 0x8a9099, 8));
    }
    const ang = Math.atan2(uz, ux);
    for (const y of [H, 0.1]) {
      posts.push(ccyl(0.035, 0.035, len, (ax + bx) / 2, y, (az + bz) / 2, 0x8a9099, 6, new THREE.Euler(0, -ang, Math.PI / 2)));
    }
    const p = new THREE.PlaneGeometry(len, H - 0.1);
    const uv = p.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.9, uv.getY(i) * (H - 0.1) / 0.9);
    p.rotateY(-ang);
    p.translate((ax + bx) / 2, (H + 0.1) / 2, (az + bz) / 2);
    panels.push(p.toNonIndexed());
    p.dispose();
  }
  root.add(mergedMesh(posts, new THREE.MeshLambertMaterial({ vertexColors: true }), true, true));
  const chain = tex(canvas('chain', 64, 64, drawChain), true);
  const mat = new THREE.MeshLambertMaterial({ map: chain, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xd0d4da });
  root.add(mergedMesh(panels, mat, false, false));
}

/** The street behind the far fence, lamps along it, and the buildings round the court. */
function buildCity(root: THREE.Group): void {
  const city: THREE.BufferGeometry[] = [];
  const add = (n: string, x: number, z: number, rot: number, s = BLOCK) => city.push(...bake(ck(n), placed(ck(n), x, z, rot, s)));
  // the row across the street, facing the court (+z)
  const row: Array<[string, number]> = [
    ['building-c', -14], ['building-h', -5], ['building-e', 6], ['building-a', 17.5], ['building-g', 27], ['building-k', 39],
  ];
  for (const [n, x] of row) add(n, x, -26, 0);
  add('detail-parasol-a', 2, -20.5, 0, 6);
  add('detail-parasol-a', 9, -20.5, 0.4, 6);
  // the skyline behind
  add('building-skyscraper-b', -2, -48, 0);
  add('building-skyscraper-a', 12, -46, 0.3);
  add('building-skyscraper-c', 26, -52, 0);
  add('building-skyscraper-a', -20, -50, 0);
  for (let i = 0; i < 9; i++) add(i % 3 === 0 ? 'low-detail-building-wide-a' : i % 3 === 1 ? 'low-detail-building-a' : 'low-detail-building-c', -36 + i * 11, -72, 0, 12);
  // behind the baseline and behind the half-court line
  add('building-a', 26, 2, -Math.PI / 2);
  add('building-h', 26, 14, -Math.PI / 2);
  add('building-e', 27, -11, -Math.PI / 2);
  add('building-g', -16, 2, Math.PI / 2);
  add('building-c', -16, -10, Math.PI / 2);
  add('building-k', -17, 15, Math.PI / 2);
  root.add(mergedMesh(city, kitMaterial(ck('building-a'))));

  const roads: THREE.BufferGeometry[] = [];
  const addR = (n: string, x: number, z: number, rot: number, s = BLOCK) => roads.push(...bake(rk(n), placed(rk(n), x, z, rot, s)));
  for (let i = -4; i <= 5; i++) addR('road-straight', i * BLOCK, -15, Math.PI / 2);
  for (const x of [-2, 8, 18]) addR('light-curved', x, -10.6, Math.PI, 9);
  addR('light-square', 15.6, 9, -Math.PI / 2, 8);
  addR('light-square', -4.6, 9, Math.PI / 2, 8);
  addR('construction-cone', 14.9, 6.5, 0.3, 7);
  addR('construction-cone', 15.3, 7.4, 1.2, 7);
  root.add(mergedMesh(roads, kitMaterial(rk('road-straight'))));
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when
 * its scene shuts down, which also drops their programs, so the Play scene's first frame would
 * compile them all again (a frozen first frame on a slow phone). This compiles a copy of every
 * material and object kind of the menu's court, under the same lights and fog, into a keeper
 * scene that is never freed: the Play scene then finds its programs ready.
 */
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh, sk = o as THREE.SkinnedMesh;
      const kind = sk.isSkinnedMesh ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const key = kind + ':' + mat.type + ':' + (mat as THREE.MeshLambertMaterial).vertexColors + ':' + !!(mat as THREE.MeshLambertMaterial).map + ':' + mat.transparent + ':' + mat.alphaTest + ':' + mat.blending + ':' + m.castShadow + m.receiveShadow;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      let k: THREE.Mesh;
      if (kind === 'skin') { k = sk.clone(); k.material = c; }
      else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = m.castShadow;
      k.receiveShadow = m.receiveShadow;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}

export { BALL_R };
