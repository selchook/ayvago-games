// The venues of the Ayvago Cup, built from simple shapes, canvas textures and Kenney kit props:
// the athletics stadium (track, long jump pit, podium), the outdoor pool and the archery range.
// Each venue is a group; only the one in use is visible.
import { THREE } from '@core/three';
import { canvasTex } from './athlete';
import { box, batchBoxes, lambert, mesh, prop } from './look';

export const LANE_W = 1.5;
export const LANES = 6;
/** z of a track lane centre (lane 0 is nearest the camera). */
export const laneZ = (i: number): number => (LANES / 2 - 0.5 - i) * LANE_W;
export const TRACK_HALF = (LANES * LANE_W) / 2;
/** Long jump runway and pit. */
export const JUMP_Z = TRACK_HALF + 3.6;
export const BOARD_X = 62;
/** Pool lanes. */
export const POOL_LANE_W = 2.5;
export const POOL_LANES = 6;
export const POOL_LEN = 50;
export const poolLaneZ = (i: number): number => (POOL_LANES / 2 - 0.5 - i) * POOL_LANE_W;
export const WATER_Y = -0.35;
/** Archery: target distance and face radius (m). */
export const RANGE = 50;
export const FACE_R = 0.61;
export const TARGET_Y = 1.3;
export const rangeZ = (i: number): number => -i * 4.5;

export const TEAM_COLORS = [0xff6b4a, 0x22c3b5, 0xffc233, 0x9d6bff];
const SEAT_COLORS = [0xff6b4a, 0x22c3b5, 0xffc233, 0x9d6bff, 0x3b8cff, 0xf3f2f2];
const SHIRTS = [0xff6b4a, 0x22c3b5, 0xffc233, 0x9d6bff, 0x3b8cff, 0xffffff, 0xff4fa3, 0x5dd36a, 0xf08a24, 0x2b2f4a];
const SKINS = [0xf2c9a0, 0xe0a982, 0xc48862, 0x8d5a3b, 0xf6d7b8];

// ------------------------------------------------------------------ crowd

/** Spectators on a stand: instanced bodies and heads that bounce when they cheer. */
export class Crowd {
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private seats: { x: number; y: number; z: number; ph: number; f: number }[] = [];
  private excite = 0.15;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private p = new THREE.Vector3();

  constructor(parent: THREE.Object3D, seats: { x: number; y: number; z: number }[], faceRotY: number) {
    const n = seats.length;
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.55, 0.3), lambert(0xffffff), n);
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.27, 0.27, 0.25), lambert(0xffffff), n);
    for (const im of [this.bodies, this.heads]) {
      im.userData.ownMaterial = true;
      im.castShadow = false;
      im.receiveShadow = true;
      parent.add(im);
    }
    const c = new THREE.Color();
    seats.forEach((st, i) => {
      this.seats.push({ ...st, ph: Math.random() * Math.PI * 2, f: 7 + Math.random() * 5 });
      this.bodies.setColorAt(i, c.setHex(SHIRTS[(Math.random() * SHIRTS.length) | 0]));
      this.heads.setColorAt(i, c.setHex(SKINS[(Math.random() * SKINS.length) | 0]));
    });
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceRotY);
    this.update(0, 0);
  }

  /** A roar: everyone jumps for a while. */
  cheer(level = 1): void {
    this.excite = Math.max(this.excite, level);
  }

  update(dt: number, time: number): void {
    this.excite = Math.max(0.12, this.excite - dt * 0.35);
    const e = this.excite;
    this.seats.forEach((st, i) => {
      const hop = Math.max(0, Math.sin(time * st.f * (0.5 + e * 0.5) + st.ph)) * 0.32 * e;
      this.p.set(st.x, st.y + 0.28 + hop, st.z);
      this.m.compose(this.p, this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      this.p.set(st.x, st.y + 0.7 + hop, st.z);
      this.m.compose(this.p, this.q, this.s);
      this.heads.setMatrixAt(i, this.m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A stepped stand along x (from x0 to x1), its front edge at z = zFront, rising away from the
 * camera (towards -z), with a roof on posts. Returns the seats for a crowd.
 */
function stand(g: THREE.Group, x0: number, x1: number, zFront: number, rows: number, fill = 0.72): { x: number; y: number; z: number }[] {
  const seats: { x: number; y: number; z: number }[] = [];
  const len = x1 - x0, cx = (x0 + x1) / 2;
  const STEP_H = 0.55, STEP_D = 1.0;
  // front wall
  g.add(box(len, 1.2, 0.3, 0x2b3350, cx, 0.6, zFront + 0.15));
  for (let r = 0; r < rows; r++) {
    const y = 1.2 + r * STEP_H, z = zFront - 0.5 - r * STEP_D;
    g.add(box(len, y, STEP_D, r % 2 ? 0xc9ccd6 : 0xb5b9c6, cx, y / 2, z, 'receive'));
    // seat blocks in team colours
    const block = 6;
    for (let bx = x0; bx < x1 - 0.1; bx += block) {
      const w = Math.min(block, x1 - bx) - 0.4;
      const col = SEAT_COLORS[(Math.floor((bx - x0) / block) + r) % SEAT_COLORS.length];
      g.add(box(w, 0.18, 0.45, col, bx + w / 2 + 0.2, y + 0.09, z + 0.15, 'none'));
      for (let sx = bx + 0.5; sx < bx + w; sx += 0.62) if (Math.random() < fill) seats.push({ x: sx + (Math.random() - 0.5) * 0.1, y: y + 0.12, z: z + 0.05 });
    }
  }
  // back wall and roof
  const backZ = zFront - 0.5 - rows * STEP_D;
  const topY = 1.2 + rows * STEP_H;
  g.add(box(len, topY + 2.6, 0.4, 0x2b3350, cx, (topY + 2.6) / 2, backZ));
  const roofD = rows * STEP_D * 0.75;
  const roof = box(len + 1, 0.3, roofD, 0xf3f2f2, cx, topY + 4.2, backZ + roofD / 2 - 0.3, 'cast');
  roof.rotation.x = -0.08;
  g.add(roof);
  g.add(box(len + 1, 0.5, 0.35, 0xec3013, cx, topY + 4.1, backZ + roofD - 0.3, 'none'));
  for (let x = x0; x <= x1 + 0.01; x += 12) g.add(box(0.3, topY + 4.2, 0.3, 0xdfe3ea, x, (topY + 4.2) / 2, backZ + 0.2));
  return seats;
}

/** Advertising boards in front of a stand: AYVAGO and stars in team colours. */
function boards(g: THREE.Group, x0: number, x1: number, z: number, cup: string): void {
  const tex = canvasTex('boards:' + cup, 1024, 64, (c) => {
    const cols = ['#ec3013', '#22c3b5', '#ffc233', '#9d6bff'];
    for (let i = 0; i < 4; i++) {
      c.fillStyle = cols[i];
      c.fillRect(i * 256, 0, 256, 64);
      c.fillStyle = i === 2 ? '#201e1d' : '#ffffff';
      fitText(c, i % 2 ? '★ ★ ★' : cup, i * 256 + 128, 34, 38, 232);
    }
  }, [Math.max(1, Math.round((x1 - x0) / 24)), 1]);
  const m = mesh(new THREE.PlaneGeometry(x1 - x0, 0.9), new THREE.MeshLambertMaterial({ map: tex }), 'receive');
  m.position.set((x0 + x1) / 2, 0.45, z);
  g.add(m);
}

/** Centred bold text, shrunk to fit a width. */
function fitText(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, maxW: number): void {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `bold ${size}px "Fredoka", "Nunito", sans-serif`;
  const w = c.measureText(s).width;
  if (w > maxW) c.font = `bold ${Math.floor((size * maxW) / w)}px "Fredoka", "Nunito", sans-serif`;
  c.fillText(s, x, y);
}

function sky(scene: THREE.Scene): void {
  const geo = new THREE.SphereGeometry(380, 24, 12);
  const top = new THREE.Color(0x3d8fe0), mid = new THREE.Color(0x8fd0ff), low = new THREE.Color(0xdff3ff);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const cols: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 380;
    if (h > 0.25) c.copy(mid).lerp(top, Math.min(1, (h - 0.25) / 0.6));
    else c.copy(low).lerp(mid, Math.max(0, h / 0.25));
    c.toArray(cols, i * 3);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }), 'none');
  m.renderOrder = -10;
  scene.add(m);
  // a few puffy clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbfd8ee, emissiveIntensity: 0.5, fog: false });
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Group();
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const s = mesh(new THREE.SphereGeometry(6 + Math.random() * 5, 10, 8), cloudMat, 'none');
      s.position.set(k * 7 - n * 3.5, Math.random() * 3, Math.random() * 4);
      s.scale.y = 0.55;
      cl.add(s);
    }
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    cl.position.set(Math.cos(a) * 250, 70 + Math.random() * 60, Math.sin(a) * 250);
    cl.lookAt(0, cl.position.y, 0);
    scene.add(cl);
  }
}

function grassTex(): THREE.Texture {
  return canvasTex('grass', 256, 256, (c) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#5fae4a' : '#68b851';
      c.fillRect(i * 32, 0, 32, 256);
    }
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(40,90,30,0.12)' : 'rgba(200,255,160,0.10)';
      c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  }, [40, 40]);
}

function ground(g: THREE.Group, w: number, d: number, cx = 0, cz = 0): void {
  const tex = grassTex().clone();
  tex.needsUpdate = true;
  tex.repeat.set(w / 8, d / 8);
  const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }), 'receive');
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0, cz);
  g.add(m);
}

const TRACK_RED = '#c8553d';

function trackTex(lanes: number): THREE.Texture {
  return canvasTex('track' + lanes, 512, 64 * lanes, (c) => {
    const H = 64 * lanes;
    c.fillStyle = TRACK_RED;
    c.fillRect(0, 0, 512, H);
    for (let i = 0; i < 5000; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,220,200,0.08)';
      c.fillRect(Math.random() * 512, Math.random() * H, 2, 2);
    }
    c.fillStyle = '#ffffff';
    for (let l = 0; l <= lanes; l++) c.fillRect(0, Math.min(H - 4, Math.max(0, l * 64 - 2)), 512, 4);
  }, [1, 1]);
}

/** A white line across the track at x (start, finish). */
function lineAcross(g: THREE.Group, x: number, width: number, z0: number, z1: number, color = 0xffffff, y = 0.012): void {
  const m = mesh(new THREE.PlaneGeometry(width, z1 - z0), new THREE.MeshLambertMaterial({ color }), 'receive');
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, (z0 + z1) / 2);
  g.add(m);
}

/** A number painted flat on the ground (lane numbers, distance marks). */
function groundLabel(g: THREE.Group, text: string, x: number, z: number, size: number, color = '#ffffff', rot = 0): void {
  const tex = canvasTex(`lbl:${text}:${color}`, 128, 128, (c) => {
    c.fillStyle = color;
    c.font = 'bold 92px "Fredoka", "Nunito", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 70);
  });
  const m = mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }), 'none');
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  m.position.set(x, 0.015, z);
  g.add(m);
}

/** A sign board on a post (distance marks along the far side of the track). */
function signBoard(g: THREE.Group, text: string, x: number, z: number): void {
  const tex = canvasTex(`sign:${text}`, 128, 64, (c) => {
    c.fillStyle = '#201e1d';
    c.fillRect(0, 0, 128, 64);
    c.fillStyle = '#ffd23f';
    c.font = 'bold 44px "Fredoka", "Nunito", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 35);
  });
  const m = mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshLambertMaterial({ map: tex }), 'none');
  m.position.set(x, 1.15, z);
  g.add(m, box(0.08, 0.85, 0.08, 0xdfe3ea, x, 0.42, z - 0.05, 'cast'));
}

function trees(g: THREE.Group, keys: string[], count: number, area: () => [number, number]): void {
  for (let i = 0; i < count; i++) {
    const [x, z] = area();
    g.add(prop(keys[i % keys.length], 5 + Math.random() * 3, x, z, Math.random() * 6));
  }
}

function flagPoles(g: THREE.Group, xs: number[], z: number, y: number): void {
  xs.forEach((x, i) => {
    const f = prop(i % 2 ? 'flagGreen' : 'flagRed', 3.2, x, z, Math.PI / 2);
    f.position.y = y;
    g.add(f);
  });
}

// ------------------------------------------------------------------ venues

export interface Venues {
  track: THREE.Group;
  pool: THREE.Group;
  range: THREE.Group;
  crowds: { venue: THREE.Group; crowd: Crowd }[];
  water: THREE.Mesh;
  waterBase: Float32Array;
  podium: THREE.Group;
  /** The flags along the archery range (turned and stretched by the wind). */
  windFlags: THREE.Object3D[];
}

export function buildVenues(scene: THREE.Scene, cup: string): Venues {
  sky(scene);
  const crowds: Venues['crowds'] = [];

  // ---------------- athletics stadium
  const track = new THREE.Group();
  ground(track, 320, 140, 50, -10);
  const tTex = trackTex(LANES);
  tTex.wrapS = THREE.RepeatWrapping;
  tTex.repeat.set(170 / 8, 1);
  const tr = mesh(new THREE.PlaneGeometry(170, LANES * LANE_W + 0.6), new THREE.MeshLambertMaterial({ map: tTex }), 'receive');
  tr.rotation.x = -Math.PI / 2;
  tr.position.set(55, 0.006, 0);
  track.add(tr);
  // a red apron either side and a kerb
  for (const s of [-1, 1]) track.add(box(170, 0.06, 0.25, 0xf3f2f2, 55, 0.03, s * (TRACK_HALF + 0.45), 'receive'));
  lineAcross(track, 0, 0.1, -TRACK_HALF, TRACK_HALF);
  lineAcross(track, 100, 0.12, -TRACK_HALF, TRACK_HALF);
  for (let l = 0; l < LANES; l++) groundLabel(track, String(l + 1), -2.2, laneZ(l), 1.0, '#ffffff', 0);
  for (let d = 10; d < 100; d += 10) signBoard(track, String(d), d, -TRACK_HALF - 1.2);
  // finish gantry: two posts and a chequered banner
  const chk = canvasTex('chequer', 256, 32, (c) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      c.fillStyle = (i + j) % 2 ? '#201e1d' : '#ffffff';
      c.fillRect(i * 16, j * 16, 16, 16);
    }
  });
  for (const s of [-1, 1]) track.add(box(0.25, 4.6, 0.25, 0xdfe3ea, 100, 2.3, s * (TRACK_HALF + 0.9), 'cast'));
  const banner = mesh(new THREE.BoxGeometry(0.2, 0.7, LANES * LANE_W + 2), new THREE.MeshLambertMaterial({ map: chk }), 'cast');
  banner.position.set(100, 4.4, 0);
  track.add(banner);
  // far side: boards, a long stand, light towers and trees
  boards(track, -30, 140, -TRACK_HALF - 2.6, cup);
  const seats = stand(track, -30, 140, -TRACK_HALF - 4.2, 9);
  crowds.push({ venue: track, crowd: new Crowd(track, seats, 0) });
  for (const x of [-20, 25, 70, 115]) track.add(prop('light', 16, x, -TRACK_HALF - 17, 0));
  flagPoles(track, [-10, 10, 30, 50, 70, 90, 110, 130], -TRACK_HALF - 13.6, 11.2);
  trees(track, ['treeA', 'treeB', 'treeC'], 14, () => [-60 + Math.random() * 230, -TRACK_HALF - 22 - Math.random() * 18]);
  // the jumbotron at the end of the stand
  const jt = canvasTex('jumbo:' + cup, 512, 256, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#1b2350');
    gr.addColorStop(1, '#0b1020');
    c.fillStyle = gr;
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = '#ffd23f';
    fitText(c, cup, 256, 112, 66, 470);
    c.fillStyle = '#ffffff';
    c.font = 'bold 40px "Fredoka", sans-serif';
    c.fillText('★ ★ ★ ★ ★', 256, 190);
  });
  const jumbo = new THREE.Group();
  const screen = mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: jt }), 'none');
  screen.position.set(0, 9, 0.26);
  jumbo.add(screen, box(14.6, 7.6, 0.5, 0x201e1d, 0, 9, 0, 'cast'), box(1, 6, 1, 0x2b3350, 0, 3, 0));
  jumbo.position.set(150, 0, -TRACK_HALF - 8);
  jumbo.rotation.y = -0.7;
  track.add(jumbo);
  // near side: long jump runway and sand pit, tents
  const run = mesh(new THREE.PlaneGeometry(BOARD_X + 6, 1.4), new THREE.MeshLambertMaterial({ color: 0xc8553d }), 'receive');
  run.rotation.x = -Math.PI / 2;
  run.position.set((BOARD_X - 6) / 2 + 0, 0.008, JUMP_Z);
  track.add(run);
  for (const s of [-1, 1]) lineAcross(track, (BOARD_X - 6) / 2, BOARD_X + 6, JUMP_Z + s * 0.68 - 0.03, JUMP_Z + s * 0.68 + 0.03);
  track.add(box(0.2, 0.03, 1.3, 0xffffff, BOARD_X - 0.1, 0.02, JUMP_Z, 'receive'));
  track.add(box(0.1, 0.035, 1.3, 0x8a8f9e, BOARD_X + 0.05, 0.02, JUMP_Z, 'receive'));
  const sand = canvasTex('sand', 128, 128, (c) => {
    c.fillStyle = '#e8cf95';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(150,110,60,0.18)' : 'rgba(255,250,220,0.25)';
      c.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
    }
  }, [4, 1]);
  const pit = mesh(new THREE.PlaneGeometry(10, 3), new THREE.MeshLambertMaterial({ map: sand }), 'receive');
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(BOARD_X + 1 + 5, 0.01, JUMP_Z);
  track.add(pit);
  for (const s of [-1, 1]) track.add(box(10.4, 0.12, 0.2, 0xf3f2f2, BOARD_X + 6, 0.06, JUMP_Z + s * 1.6, 'receive'));
  track.add(box(0.2, 0.12, 3.4, 0xf3f2f2, BOARD_X + 11.1, 0.06, JUMP_Z, 'receive'));
  for (let m = 5; m <= 9; m++) {
    groundLabel(track, String(m), BOARD_X + m, JUMP_Z - 2.1, 0.75, '#ffffff', 0);
    track.add(box(0.05, 0.02, 0.4, 0xffffff, BOARD_X + m, 0.13, JUMP_Z - 1.6, 'none'));
  }
  track.add(prop('tent', 4, 20, JUMP_Z + 6, Math.PI), prop('tent', 4, 86, JUMP_Z + 6, Math.PI));
  trees(track, ['treeA', 'treeB'], 6, () => [-40 + Math.random() * 190, JUMP_Z + 18 + Math.random() * 14]);

  // podium beside the start, in front of the crowd
  const podium = new THREE.Group();
  const heights = [1.0, 0.7, 0.45];
  const xs = [0, -2.1, 2.1];
  const pcol = [0xffc233, 0xc9d1e0, 0xd08a4e];
  for (let i = 0; i < 3; i++) {
    const tex = canvasTex('pod' + i, 128, 128, (c) => {
      c.fillStyle = '#' + pcol[i].toString(16).padStart(6, '0');
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#ffffff';
      c.font = 'bold 84px "Fredoka", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), 64, 70);
    });
    const mats = [lambert(pcol[i]), lambert(pcol[i]), lambert(0xffffff), lambert(pcol[i]), new THREE.MeshLambertMaterial({ map: tex }), lambert(pcol[i])];
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, heights[i], 1.6), mats);
    // (a material list: World3D only frees single materials)
    b.castShadow = b.receiveShadow = true;
    b.position.set(xs[i], heights[i] / 2, 0);
    podium.add(b);
  }
  podium.position.set(-14, 0, JUMP_Z - 0.5);
  track.add(podium);
  scene.add(track);

  // ---------------- pool (an outdoor pool far from the stadium)
  const pool = new THREE.Group();
  pool.position.set(0, 0, 400);
  const W = POOL_LANES * POOL_LANE_W;
  const tiles = canvasTex('deck', 128, 128, (c) => {
    c.fillStyle = '#e9edf2';
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(120,130,150,0.35)';
    c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, 128); c.stroke();
      c.beginPath(); c.moveTo(0, i * 32); c.lineTo(128, i * 32); c.stroke();
    }
  }, [1, 1]);
  // deck: four slabs around the basin
  const deck = (w: number, d: number, x: number, z: number) => {
    const t = tiles.clone();
    t.needsUpdate = true;
    t.repeat.set(w / 2, d / 2);
    const m = mesh(new THREE.BoxGeometry(w, 0.4, d), new THREE.MeshLambertMaterial({ map: t }), 'receive');
    m.position.set(x, -0.2, z);
    pool.add(m);
  };
  deck(POOL_LEN + 16, 8, POOL_LEN / 2, W / 2 + 4);
  deck(POOL_LEN + 16, 10, POOL_LEN / 2, -W / 2 - 5);
  deck(8, W, -4, 0);
  deck(8, W, POOL_LEN + 4, 0);
  ground(pool, 300, 160, 25, -20);
  pool.children[pool.children.length - 1].position.y = -0.41;
  // basin: floor with lane stripes, walls
  const floorTex = canvasTex('poolfloor', 512, 64 * POOL_LANES, (c) => {
    c.fillStyle = '#5cc6ec';
    c.fillRect(0, 0, 512, 64 * POOL_LANES);
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 512; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64 * POOL_LANES); c.stroke(); }
    for (let i = 0; i < 64 * POOL_LANES; i += 16) { c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke(); }
    c.fillStyle = '#1d3f8a';
    for (let l = 0; l < POOL_LANES; l++) c.fillRect(20, l * 64 + 28, 472, 8);
  });
  const floor = mesh(new THREE.PlaneGeometry(POOL_LEN, W), new THREE.MeshLambertMaterial({ map: floorTex }), 'receive');
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(POOL_LEN / 2, -2, 0);
  pool.add(floor);
  for (const s of [-1, 1]) {
    pool.add(box(POOL_LEN, 2, 0.1, 0x7fd3f0, POOL_LEN / 2, -1, s * W / 2, 'receive'));
    pool.add(box(0.1, 2, W, 0x7fd3f0, POOL_LEN / 2 + s * POOL_LEN / 2, -1, 0, 'receive'));
  }
  // water: a wavy, see-through surface
  const wgeo = new THREE.PlaneGeometry(POOL_LEN, W, 100, 30);
  wgeo.rotateX(-Math.PI / 2);
  const water = mesh(wgeo, new THREE.MeshPhongMaterial({ color: 0x1fa0e0, transparent: true, opacity: 0.72, shininess: 90, specular: 0xffffff, depthWrite: false }), 'none');
  water.position.set(POOL_LEN / 2, WATER_Y, 0);
  water.renderOrder = 2;
  pool.add(water);
  const waterBase = Float32Array.from((wgeo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array);
  // lane ropes: floats in rows, red near the walls
  const per = Math.round(POOL_LEN / 0.3);
  const ropes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), lambert(0xffffff), (POOL_LANES + 1) * per);
  ropes.userData.ownMaterial = true;
  const mm = new THREE.Matrix4(), cc = new THREE.Color();
  let k = 0;
  for (let l = 0; l <= POOL_LANES; l++) {
    const z = W / 2 - l * POOL_LANE_W - (l === 0 ? 0.15 : l === POOL_LANES ? -0.15 : 0);
    for (let i = 0; i < per; i++) {
      const x = 0.15 + i * 0.3;
      mm.makeScale(1.3, 1, 1).setPosition(x, WATER_Y + 0.02, z);
      ropes.setMatrixAt(k, mm);
      const near = x < 5 || x > POOL_LEN - 5;
      ropes.setColorAt(k, cc.setHex(near ? 0xec3013 : (Math.floor(i / 4) % 2 ? 0xffffff : 0x3b8cff)));
      k++;
    }
  }
  pool.add(ropes);
  // starting blocks and flag lines over the water
  for (let l = 0; l < POOL_LANES; l++) {
    pool.add(box(0.7, 0.55, 0.6, 0xf3f2f2, -0.45, 0.27, poolLaneZ(l), 'both'));
    pool.add(box(0.72, 0.12, 0.62, TEAM_COLORS[l % 4], -0.45, 0.58, poolLaneZ(l), 'none'));
  }
  for (const fx of [5, POOL_LEN - 5]) {
    for (const s of [-1, 1]) pool.add(box(0.12, 2.6, 0.12, 0xdfe3ea, fx, 1.3, s * (W / 2 + 0.8), 'cast'));
    const flags = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.38, 3), lambert(0xffffff), 30);
    flags.userData.ownMaterial = true;
    for (let i = 0; i < 30; i++) {
      mm.makeRotationX(Math.PI).setPosition(fx, 2.25, -W / 2 - 0.6 + i * ((W + 1.2) / 29));
      flags.setMatrixAt(i, mm);
      flags.setColorAt(i, cc.setHex(TEAM_COLORS[i % 4]));
    }
    pool.add(flags);
  }
  lineAcross(pool, POOL_LEN + 0.1, 0.2, -W / 2, W / 2, 0xec3013, 0.01);
  // far side stand and trees
  const pSeats = stand(pool, -6, POOL_LEN + 6, -W / 2 - 10, 7, 0.75);
  crowds.push({ venue: pool, crowd: new Crowd(pool, pSeats, 0) });
  boards(pool, -6, POOL_LEN + 6, -W / 2 - 9.6, cup);
  pool.children[pool.children.length - 1].position.y = 0.45;
  trees(pool, ['palm', 'treeA', 'palmB'], 10, () => [-30 + Math.random() * 110, -W / 2 - 22 - Math.random() * 15]);
  trees(pool, ['palm', 'palmB'], 5, () => [-25 + Math.random() * 100, W / 2 + 12 + Math.random() * 12]);
  pool.add(prop('tent', 4, -10, W / 2 + 6, Math.PI), prop('tent', 4, POOL_LEN + 10, W / 2 + 6, Math.PI));
  pool.visible = false;
  scene.add(pool);

  // ---------------- archery range
  const range = new THREE.Group();
  range.position.set(0, 0, -400);
  ground(range, 300, 200, 30, -20);
  lineAcross(range, 0, 0.1, rangeZ(3) - 2, rangeZ(0) + 2);
  const face = canvasTex('face', 256, 256, (c) => {
    const ring = ['#f3f2f2', '#f3f2f2', '#201e1d', '#201e1d', '#2f8fe6', '#2f8fe6', '#e8402f', '#e8402f', '#ffd23f', '#ffd23f'];
    c.fillStyle = 'rgba(0,0,0,0)';
    c.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 10; i++) {
      c.beginPath();
      c.arc(128, 128, 127 - i * 12.7, 0, Math.PI * 2);
      c.fillStyle = ring[i];
      c.fill();
      c.lineWidth = 1;
      c.strokeStyle = i === 2 || i === 3 ? '#ffffff' : '#201e1d';
      c.stroke();
    }
    c.beginPath();
    c.arc(128, 128, 2, 0, Math.PI * 2);
    c.fillStyle = '#201e1d';
    c.fill();
  });
  for (let i = 0; i < 4; i++) {
    const z = rangeZ(i);
    const boss = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.35, 32), lambert(0xd9c58a), 'both');
    boss.rotation.z = Math.PI / 2;
    boss.position.set(RANGE + 0.2, TARGET_Y, z);
    const fm = mesh(new THREE.CircleGeometry(FACE_R, 48), new THREE.MeshLambertMaterial({ map: face }), 'receive');
    fm.rotation.y = -Math.PI / 2;
    fm.position.set(RANGE, TARGET_Y, z);
    range.add(boss, fm);
    for (const s of [-1, 1]) {
      const leg = box(0.1, 2.3, 0.1, 0x7d5234, RANGE + 0.45, 1.05, z + s * 0.55, 'cast');
      leg.rotation.x = s * 0.18;
      range.add(leg);
    }
    range.add(box(0.1, 1.6, 0.1, 0x7d5234, RANGE + 0.9, 0.7, z, 'cast'));
    const num = canvasTex('tnum' + i, 64, 64, (c) => {
      c.fillStyle = '#' + TEAM_COLORS[i].toString(16).padStart(6, '0');
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = '#ffffff';
      c.font = 'bold 44px "Fredoka", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), 32, 36);
    });
    const plate = mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshLambertMaterial({ map: num }), 'none');
    plate.rotation.y = -Math.PI / 2;
    plate.position.set(RANGE - 0.05, 0.3, z + 0.62);
    range.add(plate);
    // a mat on the shooting line
    range.add(box(1.4, 0.04, 1.4, 0x3d4a6b, -0.5, 0.02, z, 'receive'));
  }
  // wind flags halfway down the range
  const windFlags: THREE.Object3D[] = [];
  for (const fx of [18, 34]) {
    for (const z of [rangeZ(0) + 4.5, rangeZ(3) - 4.5]) {
      range.add(box(0.08, 4, 0.08, 0xdfe3ea, fx, 2, z, 'cast'));
      const flag = new THREE.Group();
      const cloth = mesh(new THREE.ConeGeometry(0.35, 1.6, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0xec3013, side: THREE.DoubleSide }), 'cast');
      cloth.rotation.x = Math.PI / 2;
      cloth.position.z = 0.8;
      flag.add(cloth);
      flag.position.set(fx, 3.65, z);
      range.add(flag);
      windFlags.push(flag);
    }
  }
  // a hedge behind the targets (a clean backdrop in the sight), trees beyond and along the side
  range.add(box(4, 3.2, 44, 0x3f8a3a, RANGE + 7, 1.6, rangeZ(1.5), 'both'));
  trees(range, ['treeA', 'treeB', 'treeC'], 14, () => {
    const side = Math.random() < 0.5;
    return side ? [-6 + Math.random() * 70, 14 + Math.random() * 20] : [RANGE + 14 + Math.random() * 25, -32 + Math.random() * 50];
  });
  // spectators on the far side of the range
  const rSeats = stand(range, 0, 42, rangeZ(3) - 9, 5, 0.8);
  crowds.push({ venue: range, crowd: new Crowd(range, rSeats, 0) });
  boards(range, 0, 42, rangeZ(3) - 8.6, cup);
  range.add(prop('tent', 4, -10, rangeZ(1), Math.PI / 2), prop('tent', 4, -10, rangeZ(2.6), Math.PI / 2));
  range.visible = false;
  scene.add(range);

  for (const g of [track, pool, range]) batchBoxes(g);
  return { track, pool, range, crowds, water, waterBase, podium, windFlags };
}

/** Moves the pool's water: small ripples plus a wake behind each swimmer. */
export function waveWater(v: Venues, time: number, wakes: { x: number; z: number; s: number }[]): void {
  const pos = (v.water.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
  const b = v.waterBase;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3] + POOL_LEN / 2, z = b[i * 3 + 2];
    let y = Math.sin(x * 0.9 + time * 2.1) * 0.025 + Math.sin(z * 1.7 - time * 1.6 + x * 0.3) * 0.02;
    for (const w of wakes) {
      const dx = w.x - x, dz = (w.z - z) * 2.2;
      if (dx > -1.2 && dx < 6) {
        const d = dx * dx * 0.15 + dz * dz;
        if (d < 4) y += Math.sin(dx * 3 - time * 10) * 0.07 * w.s * Math.exp(-d);
      }
    }
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  (v.water.geometry as THREE.BufferGeometry).computeVertexNormals();
}
