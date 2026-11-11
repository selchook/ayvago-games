// The in-car view: a first-person camera in the player's seat and a chunky 3D dashboard drawn
// from primitives, so it matches the Kenney low-poly trucks. Everything static (dash, pods,
// pillars, roof, bonnet, steering column) is one merged vertex-coloured mesh; the gauge faces
// share one canvas atlas; the readouts that change (speed, gear, nitro cans, the map screen)
// share one small canvas. The steering wheel turns with the shared car steering, the needles
// follow a simple gear/RPM model, the rear-view mirror is a small render of the road behind,
// mud lands on the windscreen and the wipers clear it.
//
// Layout: the dashboard is placed by where each part should appear on the 1280×720 screen at
// the cockpit's field of view (`at()`), clear of the touch pad (bottom-left), the right-thumb
// buttons (bottom-right), the HUD row and the pause / camera buttons (top-right).
import { THREE } from '@core/three';
import { t, WHEEL_LOCK, STEER_CURVE } from '@core';
import type { Truck } from './truck';
import type { Track } from './tracks';
import { ordinal } from './strings';

/** Vertical field of view of the in-car camera (degrees). */
export const COCKPIT_FOV = 72;
/** Three.js layer of the dashboard: drawn only by the in-car camera (not in the mirror). */
export const COCKPIT_LAYER = 2;
/** km/h per world unit per second on the speedometer. */
const KMH = 6;
const SPEEDO_MAX = 180;
const RPM_MAX = 8000;
/** Seconds of nitro per can (the gauge drains over it). */
const NITRO_TIME = 1.6;
/** Gear tops as a share of the truck's top speed. */
const GEARS = [0.24, 0.44, 0.64, 0.84, 1.6];

/** World units per screen pixel at depth 1 (the view is 720 px tall). */
const K = Math.tan((COCKPIT_FOV * Math.PI) / 360) / 360;
/** A point `d` units in front of the eye that shows at screen pixel (sx, sy). */
const at = (sx: number, sy: number, d: number) => new THREE.Vector3((sx - 640) * K * d, -(sy - 360) * K * d, -d);
/** Size in world units of `px` screen pixels at depth d. */
const px = (n: number, d: number) => n * K * d;

/** The eye in the truck's frame (model space: -z ahead, +y up), and how far it looks down. */
const EYE = new THREE.Vector3(0, 1.42, 0.05);
const LOOK_DOWN = 0.12;
const ROLL_MAX = 0.12;
const PITCH_MAX = 0.32;

// colours (sRGB)
const DASH = 0x2c313d;
const DASH_FAR = 0x252a35;
const TRIM = 0x3e4553;
const DARK = 0x1b1e26;
const METAL = 0xc3cbd6;
const SPOKE = 0x737c8e;
const RIM = 0x262a33;
const YELLOW = 0xffd23f;
const STRIPE = 0xf2f2f2;
const LAMP = 0xfff3c2;
const TREE = 0x3fbf5a;

/** One vertex-coloured, non-indexed geometry built from many parts (one draw call). */
class Builder {
  private pos: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private c = new THREE.Color();

  add(geo: THREE.BufferGeometry, color: number, m?: THREE.Matrix4, uvRect?: [number, number, number, number]): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    const p = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    this.c.setHex(color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.col.push(this.c.r, this.c.g, this.c.b);
      if (uv && uvRect) this.uv.push(uvRect[0] + uv.getX(i) * uvRect[2], uvRect[1] + uv.getY(i) * uvRect[3]);
      else this.uv.push(0, 0);
    }
    g.dispose();
    return this;
  }

  /** A flat four-cornered face a-b-c-d. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: number): this {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()], 3));
    return this.add(g, color);
  }

  /** A box between two points (its long axis from a to b), `w` wide and `h` thick. */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: number, up = new THREE.Vector3(0, 0, 1)): this {
    const len = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(a, b, up);
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    return this.add(new THREE.BoxGeometry(w, h, len), color, m);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

const mat4 = (pos: THREE.Vector3, rot?: THREE.Euler | THREE.Quaternion, scale = 1) => {
  const q = rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler());
  return new THREE.Matrix4().compose(pos, q, new THREE.Vector3(scale, scale, scale));
};

/** The steering wheel angle (radians) for a steering value: where a thumb would hold the wheel. */
export function wheelAngle(steer: number): number {
  const a = Math.min(1, Math.abs(steer));
  return Math.sign(steer) * a ** (1 / STEER_CURVE) * WHEEL_LOCK * (Math.PI / 180);
}

// ---------------------------------------------------------------- canvas art

const FONT = '"Fredoka", "Nunito", sans-serif';

/** One gauge face: dark dial, ticks, numbers, a coloured zone and a caption. */
function drawDial(c: CanvasRenderingContext2D, x0: number, y0: number, size: number, o: {
  max: number; minor: number; major: number; numbers: number[]; scale?: number; zone?: [number, number, string]; caption: string; sub?: string;
}): void {
  const cx = x0 + size / 2, cy = y0 + size / 2, R = size / 2 - 4;
  const ang = (v: number) => ((-135 + (270 * v) / o.max - 90) * Math.PI) / 180;
  const g = c.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#2f3749');
  g.addColorStop(1, '#10131a');
  c.fillStyle = g;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.lineWidth = 10; c.strokeStyle = '#07080b';
  c.beginPath(); c.arc(cx, cy, R - 5, 0, Math.PI * 2); c.stroke();
  if (o.zone) {
    c.lineWidth = 26; c.strokeStyle = o.zone[2];
    c.beginPath(); c.arc(cx, cy, R - 34, ang(o.zone[0]), ang(o.zone[1])); c.stroke();
  }
  for (let v = 0; v <= o.max + 1e-6; v += o.minor) {
    const major = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6;
    const a = ang(v), r0 = R - (major ? 70 : 48), r1 = R - 22;
    c.lineWidth = major ? 11 : 5;
    c.strokeStyle = major ? '#ffffff' : '#b8c3d6';
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
  }
  c.fillStyle = '#ffffff';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${Math.round(size * 0.13)}px ${FONT}`;
  for (const v of o.numbers) {
    const a = ang(v), r = R - 112;
    c.fillText(String(Math.round(v / (o.scale ?? 1))), cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.fillStyle = '#9fb1cc';
  c.font = `700 ${Math.round(size * 0.075)}px ${FONT}`;
  c.fillText(o.caption, cx, cy - R * 0.27);
  if (o.sub) {
    c.fillStyle = '#ffd23f';
    c.font = `700 ${Math.round(size * 0.07)}px ${FONT}`;
    c.fillText(o.sub, cx, cy - R * 0.36);
  }
}

/** The nitro gauge face: an empty-to-full sweep in orange with a bolt. */
function drawNitroDial(c: CanvasRenderingContext2D, x0: number, y0: number, size: number): void {
  const cx = x0 + size / 2, cy = y0 + size / 2, R = size / 2 - 4;
  const ang = (v: number) => ((-120 + 240 * v - 90) * Math.PI) / 180;
  const g = c.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#3a2a24');
  g.addColorStop(1, '#130d0b');
  c.fillStyle = g;
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.lineWidth = 12; c.strokeStyle = '#07080b';
  c.beginPath(); c.arc(cx, cy, R - 6, 0, Math.PI * 2); c.stroke();
  const zone = c.createLinearGradient(cx - R, 0, cx + R, 0);
  zone.addColorStop(0, '#ff3b30'); zone.addColorStop(0.35, '#ff7a1a'); zone.addColorStop(1, '#ffd23f');
  c.lineWidth = 46; c.strokeStyle = zone;
  c.beginPath(); c.arc(cx, cy, R - 52, ang(0), ang(1)); c.stroke();
  c.lineWidth = 8; c.strokeStyle = '#ffffff';
  for (let i = 0; i <= 4; i++) {
    const a = ang(i / 4);
    c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 84), cy + Math.sin(a) * (R - 84)); c.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); c.stroke();
  }
  c.fillStyle = '#ffffff';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${Math.round(size * 0.15)}px ${FONT}`;
  c.fillText('E', cx + Math.cos(ang(0)) * (R - 130), cy + Math.sin(ang(0)) * (R - 130));
  c.fillText('F', cx + Math.cos(ang(1)) * (R - 130), cy + Math.sin(ang(1)) * (R - 130));
  // a bolt above the hub
  c.fillStyle = '#ffd23f';
  const s = size / 512;
  c.beginPath();
  c.moveTo(cx + 18 * s, cy - 150 * s); c.lineTo(cx - 40 * s, cy - 60 * s); c.lineTo(cx - 2 * s, cy - 60 * s);
  c.lineTo(cx - 22 * s, cy + 6 * s); c.lineTo(cx + 40 * s, cy - 84 * s); c.lineTo(cx + 2 * s, cy - 84 * s);
  c.closePath(); c.fill();
}

/** A tiny pine-tree air freshener's colours are vertex colours; the mud is a canvas. */
function mudBlob(c: CanvasRenderingContext2D, x: number, y: number, r: number, water: boolean): void {
  const col = water ? `rgba(150,120,90,${0.35 + Math.random() * 0.2})` : Math.random() < 0.5 ? 'rgba(74,44,22,0.92)' : 'rgba(107,66,36,0.9)';
  c.fillStyle = col;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  // splatter: a few drops around the blob, and a drip running down
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = r * (1.1 + Math.random() * 0.9);
    c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.15 + Math.random() * 0.3), 0, Math.PI * 2); c.fill();
  }
  if (!water && Math.random() < 0.6) {
    const w = r * (0.25 + Math.random() * 0.2);
    c.fillRect(x - w / 2, y, w, r * (1 + Math.random() * 1.6));
    c.beginPath(); c.arc(x, y + r * 1.6, w * 0.8, 0, Math.PI * 2); c.fill();
  }
}

// ---------------------------------------------------------------- the cockpit

export interface CockpitInput {
  truck: Truck;
  /** Steering shown on the wheel, -1..1 (the shared CarSteering value). */
  steer: number;
  /** The truck's top speed now (without nitro), for the gear model. */
  top: number;
  /** Gas held (revs on the grid, revs in the air). */
  gas: boolean;
  /** The race is on (otherwise the engine idles or revs on the grid). */
  racing: boolean;
  /** Screen shake from the scene (decays there): landings, hits. */
  shake: number;
  /** Extra nitro lens kick, 0..1. */
  kick: number;
  /** Rough ground under the wheels: 0 smooth .. 1 heavy mud. */
  rough: number;
  /** Trucks for the map screen. */
  trucks: Truck[];
}

export class Cockpit {
  /** Follows the truck's pose; the eye and the dashboard ride in it. */
  readonly rig = new THREE.Group();
  /** The eye: where the camera sits, looking a little down. Dashboard parts are its children. */
  private base = new THREE.Group();
  private wheel = new THREE.Group();
  private needles: { obj: THREE.Mesh; v: number }[] = [];
  private ornament = new THREE.Group();
  private wipers: THREE.Mesh[] = [];
  private mirrorCam = new THREE.PerspectiveCamera(16, 4.1, 0.4, 95);
  private rt: THREE.WebGLRenderTarget;
  private atlas: THREE.CanvasTexture;
  private dyn: THREE.CanvasTexture;
  private dynCtx: CanvasRenderingContext2D;
  private mud: THREE.CanvasTexture;
  private mudCtx: CanvasRenderingContext2D;
  private mapBg: HTMLCanvasElement | null = null;
  private mapFit = { s: 1, x: 0, y: 0 };
  private track: Track | null = null;
  private disposables: { dispose(): void }[] = [];

  // smoothed pose and motion
  private pitch = 0;
  private roll = 0;
  private lastHeading = 0;
  private lastSpeed = 0;
  private yawRate = 0;
  private accel = 0;
  private bobT = 0;
  private rpm = 900;
  private gear = 'N';
  private nitroShown = 0;
  private swing = { s: 0, sv: 0, f: 0, fv: 0 };
  private dynT = 0;
  private dynKey = '';
  private blink = 0;
  /** Wipers: seconds into the current sweep (-1 idle), sweeps still to do, and the last angle. */
  private wipeT = -1;
  private wipesLeft = 0;
  private wipeA = 0;
  private mudDirty = false;
  private mudFade = 0;
  /** The mirror is drawn on the next frame (only while the in-car view is shown). */
  mirrorOn = false;
  /** Plays a sound (wipers, splats). */
  onSound: ((key: string, cfg: { volume?: number; rate?: number }) => void) | null = null;

  /** World pose of the camera this frame, and its field of view. */
  readonly camPos = new THREE.Vector3();
  readonly camQuat = new THREE.Quaternion();
  fov = COCKPIT_FOV;

  // the windscreen plane: origin (bottom centre), up along the glass, width and slant height
  private glassO = new THREE.Vector3(0, -0.272, -0.862);
  private glassV = new THREE.Vector3();
  private glassH = 0;
  private readonly glassW = 2.4;
  private readonly mudW = 640;
  private mudH = 0;
  private wiperPivots: [number, number][] = [[-0.62, 0.04], [0.2, 0.04]];
  private readonly wiperLen = 0.62;

  constructor(paint: number) {
    this.rig.rotation.order = 'YXZ';
    this.base.position.copy(EYE);
    this.base.rotation.x = -LOOK_DOWN;
    this.rig.add(this.base);

    const top = new THREE.Vector3(0, 0.33, -0.565);
    this.glassV.copy(top).sub(this.glassO);
    this.glassH = this.glassV.length();
    this.glassV.normalize();
    this.mudH = Math.round((this.mudW * this.glassH) / this.glassW);

    // canvases: the gauge atlas (static), the readouts (redrawn when they change), the mud
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasCanvas.height = 1024;
    this.drawAtlas(atlasCanvas.getContext('2d')!);
    this.atlas = this.tex(atlasCanvas);
    const dynCanvas = document.createElement('canvas');
    dynCanvas.width = 512; dynCanvas.height = 256;
    this.dynCtx = dynCanvas.getContext('2d')!;
    this.dyn = this.tex(dynCanvas);
    const mudCanvas = document.createElement('canvas');
    mudCanvas.width = this.mudW; mudCanvas.height = this.mudH;
    this.mudCtx = mudCanvas.getContext('2d')!;
    this.mud = this.tex(mudCanvas);
    this.rt = new THREE.WebGLRenderTarget(400, 98);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(this.rt);

    this.build(paint);
    this.rig.traverse((o) => o.layers.set(COCKPIT_LAYER));
  }

  private tex(c: HTMLCanvasElement): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.disposables.push(t);
    return t;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.base): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    parent.add(m);
    this.disposables.push(geo, mat);
    return m;
  }

  // ---------------------------------------------------------------- build

  private drawAtlas(c: CanvasRenderingContext2D): void {
    c.clearRect(0, 0, 1024, 1024);
    drawDial(c, 0, 0, 512, { max: RPM_MAX, minor: 500, major: 1000, numbers: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000], scale: 1000, zone: [6500, 8000, '#ff3b30'], caption: t('rpmUnit') });
    drawDial(c, 512, 0, 512, { max: SPEEDO_MAX, minor: 10, major: 30, numbers: [0, 30, 60, 90, 120, 150, 180], zone: [150, 180, '#ff9f1a'], caption: t('speedUnit') });
    drawNitroDial(c, 0, 512, 512);
  }

  private build(paint: number): void {
    const b = new Builder();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // dash top: a dark shelf from the windscreen to the driver, two-tone
    b.quad(V(-2.2, -0.272, -0.87), V(2.2, -0.272, -0.87), V(1.9, -0.3, -0.62), V(-1.9, -0.3, -0.62), DASH_FAR);
    b.quad(V(-1.9, -0.3, -0.62), V(1.9, -0.3, -0.62), V(1.3, -0.38, -0.3), V(-1.3, -0.38, -0.3), DASH);
    // painted cowl lip at the foot of the windscreen
    b.add(new THREE.BoxGeometry(4.4, 0.016, 0.03), paint, mat4(V(0, -0.266, -0.868)));

    // air vents on the dash, out by the doors
    for (const sx of [170, 1110]) {
      const o = new THREE.Object3D();
      o.position.copy(at(sx, 600, 0.56));
      o.lookAt(0, 0, 0);
      o.updateMatrix();
      b.add(new THREE.BoxGeometry(0.13, 0.064, 0.04), DARK, o.matrix.clone().multiply(mat4(V(0, 0, -0.02))));
      for (let i = -1; i <= 1; i++) b.add(new THREE.BoxGeometry(0.114, 0.007, 0.012), TRIM, o.matrix.clone().multiply(mat4(V(0, i * 0.018, 0.002), new THREE.Euler(-0.4, 0, 0))));
    }

    // bonnet beyond the glass: painted, two racing stripes, a scoop and two rally lamps
    const hz0 = -0.9, hz1 = -1.62, hy0 = -0.302, hy1 = -0.318;
    b.quad(V(-0.8, hy0, hz0), V(0.8, hy0, hz0), V(0.64, hy1, hz1), V(-0.64, hy1, hz1), paint);
    b.quad(V(-0.64, hy1, hz1), V(0.64, hy1, hz1), V(0.62, hy1 - 0.07, hz1 - 0.04), V(-0.62, hy1 - 0.07, hz1 - 0.04), 0x1f5fcc);
    for (const sx of [-0.13, 0.13]) {
      b.quad(V(sx - 0.05, hy0 + 0.003, hz0), V(sx + 0.05, hy0 + 0.003, hz0), V(sx * 0.82 + 0.042, hy1 + 0.003, hz1), V(sx * 0.82 - 0.042, hy1 + 0.003, hz1), STRIPE);
    }
    b.add(new THREE.BoxGeometry(0.2, 0.05, 0.22), DARK, mat4(V(0, hy0 + 0.006, -1.08), new THREE.Euler(-0.05, 0, 0)));
    b.add(new THREE.BoxGeometry(0.22, 0.012, 0.24), paint, mat4(V(0, hy0 + 0.034, -1.08), new THREE.Euler(-0.05, 0, 0)));
    for (const sx of [-0.36, 0.36]) {
      b.add(new THREE.CylinderGeometry(0.055, 0.06, 0.06, 12), DARK, mat4(V(sx, hy1 + 0.045, hz1 + 0.06), new THREE.Euler(Math.PI / 2, 0, 0)));
      b.add(new THREE.CircleGeometry(0.046, 12), LAMP, mat4(V(sx, hy1 + 0.045, hz1 + 0.025), new THREE.Euler(0, Math.PI, 0)));
      b.add(new THREE.CircleGeometry(0.046, 12), LAMP, mat4(V(sx, hy1 + 0.045, hz1 + 0.094)));
    }

    // roof header and the A-pillars framing the windscreen
    b.add(new THREE.BoxGeometry(4, 0.16, 0.2), TRIM, mat4(V(0, 0.43, -0.47)));
    b.add(new THREE.BoxGeometry(4, 0.03, 0.03), DARK, mat4(V(0, 0.345, -0.565)));
    for (const s of [-1, 1]) {
      b.beam(V(s * 1.0, -0.29, -0.875), V(s * 0.8, 0.35, -0.55), 0.12, 0.06, TRIM);
      b.beam(V(s * 0.955, -0.29, -0.88), V(s * 0.765, 0.35, -0.56), 0.02, 0.064, paint);
    }

    // rear-view mirror on a stalk
    const mc = at(640, 116, 0.5);
    b.add(new THREE.BoxGeometry(0.29, 0.086, 0.045), DARK, mat4(V(mc.x, mc.y, mc.z - 0.02)));
    b.add(new THREE.BoxGeometry(0.02, 0.1, 0.02), DARK, mat4(V(mc.x, mc.y + 0.09, mc.z - 0.03)));
    const mirror = new THREE.PlaneGeometry(0.266, 0.066);
    const uv = mirror.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));   // a mirror shows left as left
    const mirrorMesh = this.mesh(mirror, new THREE.MeshBasicMaterial({ map: this.rt.texture, color: 0xe6eeff }));
    mirrorMesh.position.set(mc.x, mc.y, mc.z + 0.004);

    // the gauge pods: rev counter left of the wheel, speedometer right, nitro on the cowl
    const faces = new Builder();
    const dyn = new Builder();
    const pod = (center: THREE.Vector3, r: number, cell: [number, number, number, number], visor: boolean) => {
      const o = new THREE.Object3D();
      o.position.copy(center);
      o.lookAt(0, 0, 0);
      o.updateMatrix();
      this.base.add(o);
      const m = o.matrix;
      const part = (geo: THREE.BufferGeometry, color: number, p: THREE.Vector3, rot?: THREE.Euler) => b.add(geo, color, m.clone().multiply(mat4(p, rot)));
      part(new THREE.CylinderGeometry(r * 1.12, r * 1.2, r * 0.9, 24), DARK, V(0, 0, -r * 0.45), new THREE.Euler(Math.PI / 2, 0, 0));
      part(new THREE.TorusGeometry(r * 1.06, r * 0.1, 6, 32), METAL, V(0, 0, r * 0.03));
      if (visor) part(new THREE.CylinderGeometry(r * 1.3, r * 1.3, r * 0.75, 16, 1, true, Math.PI / 2, Math.PI), DASH, V(0, 0, r * 0.12), new THREE.Euler(Math.PI / 2, 0, 0));
      faces.add(new THREE.CircleGeometry(r, 40), 0xffffff, m.clone().multiply(mat4(V(0, 0, 0.001))), cell);
      return o;
    };
    const rTach = px(62, 0.56), rNitro = px(38, 0.82);
    const tach = pod(at(420, 550, 0.56), rTach, [0, 0.5, 0.5, 0.5], true);
    const speedo = pod(at(860, 550, 0.56), rTach, [0.5, 0.5, 0.5, 0.5], true);
    const nitro = pod(at(640, 486, 0.82), rNitro, [0, 0, 0.5, 0.5], false);
    // readouts on the faces (the dynamic canvas): speed digits, gear, nitro cans
    const dq = (o: THREE.Object3D, w: number, h: number, y: number, cell: [number, number, number, number]) =>
      dyn.add(new THREE.PlaneGeometry(w, h), 0xffffff, o.matrix.clone().multiply(mat4(V(0, y, 0.0025))), cell);
    dq(speedo, rTach * 0.72, rTach * 0.3, -rTach * 0.62, [0, 1 - 80 / 256, 192 / 512, 80 / 256]);
    dq(tach, rTach * 0.48, rTach * 0.3, -rTach * 0.62, [192 / 512, 1 - 80 / 256, 128 / 512, 80 / 256]);
    dq(nitro, rNitro * 0.95, rNitro * 0.6, -rNitro * 0.5, [320 / 512, 1 - 80 / 256, 128 / 512, 80 / 256]);
    // the dash screen: a map of the arena with every truck on it
    const lcd = new THREE.Object3D();
    lcd.position.copy(at(378, 664, 0.47));
    lcd.rotation.set(-0.2, 0, 0);   // square to the driver, leaning back a little
    lcd.updateMatrix();
    const lw = px(156, 0.47), lh = lw / 2;
    b.add(new THREE.BoxGeometry(lw * 1.12, lh * 1.22, 0.03), DARK, lcd.matrix.clone().multiply(mat4(V(0, 0, -0.016))));
    dyn.add(new THREE.PlaneGeometry(lw, lh), 0xffffff, lcd.matrix.clone().multiply(mat4(V(0, 0, 0.0005))), [0, 0, 320 / 512, 160 / 256]);

    // needles: red, tapered, with a dark cap at the hub
    const needle = (o: THREE.Object3D, r: number, len: number) => {
      const nb = new Builder();
      const shape = new THREE.Shape();
      shape.moveTo(-r * 0.07, -r * 0.18).lineTo(r * 0.07, -r * 0.18).lineTo(r * 0.025, len).lineTo(-r * 0.025, len).closePath();
      nb.add(new THREE.ShapeGeometry(shape), 0xff4a2e, mat4(V(0, 0, 0.004)));
      nb.add(new THREE.CircleGeometry(r * 0.14, 16), 0x15171d, mat4(V(0, 0, 0.0055)));
      const n = this.mesh(nb.build(), new THREE.MeshBasicMaterial({ vertexColors: true }), o);
      this.needles.push({ obj: n, v: 0 });
    };
    needle(tach, rTach, rTach * 0.84);
    needle(speedo, rTach, rTach * 0.84);
    needle(nitro, rNitro, rNitro * 0.82);

    // steering wheel: a chunky rim with a yellow top marker, three spokes and a painted hub
    const wc = at(640, 722, 0.4);
    const R = px(150, 0.4), tube = px(19, 0.4);
    const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0));
    this.wheel.position.copy(wc);
    this.wheel.quaternion.copy(tiltQ);
    this.base.add(this.wheel);
    const wb = new Builder();
    wb.add(new THREE.TorusGeometry(R, tube, 8, 40), RIM);
    wb.add(new THREE.TorusGeometry(R, tube * 1.14, 8, 6, 0.34), YELLOW, mat4(V(0, 0, 0), new THREE.Euler(0, 0, Math.PI / 2 - 0.17)));
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const len = R - 0.03;
      wb.add(new THREE.BoxGeometry(len, tube * 1.5, tube * 0.8), SPOKE, mat4(V(Math.cos(a) * (len / 2 + 0.02), Math.sin(a) * (len / 2 + 0.02) - (a === -Math.PI / 2 ? 0 : 0.012), -0.004), new THREE.Euler(0, 0, a)));
    }
    wb.add(new THREE.CylinderGeometry(0.044, 0.05, 0.034, 18), paint, mat4(V(0, 0, 0.002), new THREE.Euler(Math.PI / 2, 0, 0)));
    wb.add(new THREE.CylinderGeometry(0.022, 0.022, 0.036, 14), YELLOW, mat4(V(0, 0, 0.006), new THREE.Euler(Math.PI / 2, 0, 0)));
    this.mesh(wb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.wheel);
    // the column, into the dash
    b.add(new THREE.CylinderGeometry(0.03, 0.036, 0.34, 10), DARK, mat4(wc, tiltQ).multiply(mat4(V(0, 0, -0.17), new THREE.Euler(Math.PI / 2, 0, 0))));

    // the static cockpit and the faces
    this.mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    this.mesh(faces.build(), new THREE.MeshBasicMaterial({ map: this.atlas }));
    const dynMesh = this.mesh(dyn.build(), new THREE.MeshBasicMaterial({ map: this.dyn, transparent: true }));
    dynMesh.renderOrder = 1;

    // the windscreen: mud on a transparent layer, two wipers parked on the cowl
    const gu = new THREE.Vector3(1, 0, 0), gv = this.glassV;
    const gp = (u: number, v: number) => this.glassO.clone().addScaledVector(gu, u).addScaledVector(gv, v);
    const W = this.glassW / 2, H = this.glassH;
    const g = new THREE.BufferGeometry();
    const corners = [gp(-W, 0), gp(W, 0), gp(W, H), gp(-W, 0), gp(W, H), gp(-W, H)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((p) => p.toArray()), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    const glass = this.mesh(g, new THREE.MeshBasicMaterial({ map: this.mud, transparent: true, depthWrite: false, fog: false }));
    glass.renderOrder = 20;
    const n = new THREE.Vector3().crossVectors(gu, gv).normalize();
    const glassQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(gu, gv, n));
    for (const [u, v] of this.wiperPivots) {
      const wpb = new Builder();
      wpb.add(new THREE.BoxGeometry(this.wiperLen, 0.014, 0.01), 0x15171d, mat4(V(this.wiperLen / 2, 0, 0.008)));
      wpb.add(new THREE.BoxGeometry(this.wiperLen * 0.82, 0.02, 0.008), 0x0b0c10, mat4(V(this.wiperLen * 0.56, 0, 0.002)));
      wpb.add(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), 0x2a2e36, mat4(V(0, 0, 0.008), new THREE.Euler(Math.PI / 2, 0, 0)));
      const pivot = new THREE.Group();
      pivot.position.copy(gp(u, v)).addScaledVector(n, 0.004);
      pivot.quaternion.copy(glassQ);
      this.base.add(pivot);
      const wiper = this.mesh(wpb.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), pivot);
      wiper.rotation.z = -0.04;
      this.wipers.push(wiper);
    }

    // a little pine-tree air freshener hanging from the mirror
    this.ornament.position.set(mc.x + 0.07, mc.y - 0.043, mc.z + 0.01);
    this.ornament.scale.setScalar(0.62);
    this.base.add(this.ornament);
    const ob = new Builder();
    ob.add(new THREE.BoxGeometry(0.003, 0.07, 0.003), 0xf2f2f2, mat4(V(0, -0.035, 0)));
    ob.add(new THREE.ConeGeometry(0.026, 0.04, 5), TREE, mat4(V(0, -0.078, 0)));
    ob.add(new THREE.ConeGeometry(0.032, 0.042, 5), TREE, mat4(V(0, -0.1, 0)));
    ob.add(new THREE.BoxGeometry(0.008, 0.014, 0.008), 0x8a5a35, mat4(V(0, -0.128, 0)));
    this.mesh(ob.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.ornament);
  }

  // ---------------------------------------------------------------- per race

  /** A new track: the map screen draws its outline once. */
  setTrack(track: Track): void {
    this.track = track;
    const c = document.createElement('canvas');
    c.width = 320; c.height = 160;
    const x = c.getContext('2d')!;
    const S = track.samples;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of S) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const s = Math.min((320 - 40) / (x1 - x0), (160 - 34) / (z1 - z0));
    this.mapFit = { s, x: 160 - ((x0 + x1) / 2) * s, y: 82 - ((z0 + z1) / 2) * s };
    const P = (p: { x: number; z: number }) => [this.mapFit.x + p.x * s, this.mapFit.y + p.z * s] as const;
    const bg = x.createLinearGradient(0, 0, 0, 160);
    bg.addColorStop(0, '#0f2a30'); bg.addColorStop(1, '#081619');
    x.fillStyle = bg;
    x.fillRect(0, 0, 320, 160);
    x.strokeStyle = 'rgba(120,255,230,0.08)';
    x.lineWidth = 1;
    for (let i = 0; i < 320; i += 20) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 160); x.stroke(); }
    for (let i = 0; i < 160; i += 20) { x.beginPath(); x.moveTo(0, i); x.lineTo(320, i); x.stroke(); }
    const path = () => {
      x.beginPath();
      S.forEach((p, i) => { const [a, b2] = P(p); if (i) x.lineTo(a, b2); else x.moveTo(a, b2); });
      x.closePath();
    };
    x.lineJoin = 'round';
    path(); x.lineWidth = track.width * s; x.strokeStyle = '#1f4c55'; x.stroke();
    path(); x.lineWidth = 2.5; x.strokeStyle = '#7fe9ff'; x.stroke();
    // the start line
    const p0 = S[0];
    const [sx, sy] = P(p0);
    x.strokeStyle = '#ffffff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(sx + p0.tz * 8, sy - p0.tx * 8); x.lineTo(sx - p0.tz * 8, sy + p0.tx * 8); x.stroke();
    this.mapBg = c;
    this.dynKey = '';
  }

  /** Back to a clean windscreen and straight angles at a race start. */
  reset(truck: Truck): void {
    this.pitch = this.roll = 0;
    this.lastHeading = truck.heading;
    this.lastSpeed = 0;
    this.yawRate = this.accel = 0;
    this.rpm = 900;
    this.swing = { s: 0, sv: 0, f: 0, fv: 0 };
    this.mudCtx.clearRect(0, 0, this.mudW, this.mudH);
    this.mud.needsUpdate = true;
    this.wipeT = -1;
    this.wipesLeft = 0;
    this.nitroShown = truck.nitro > 0 ? 1 : 0;
  }

  // ---------------------------------------------------------------- mud

  /** Mud (or water) hits the windscreen: `n` blobs. The wipers follow shortly. */
  splat(n: number, water = false): void {
    const c = this.mudCtx;
    for (let i = 0; i < n; i++) {
      // inside the frame, mostly low and in the middle of the glass
      const x = this.mudW * (0.1 + Math.random() * 0.8);
      const y = this.mudH * (0.25 + Math.random() * 0.75);
      mudBlob(c, x, y, (water ? 5 : 7) + Math.random() * (water ? 10 : 16), water);
    }
    this.mudDirty = true;
    this.wipesLeft = Math.max(this.wipesLeft, water ? 1 : 2);
    if (this.wipeT < 0) this.wipeT = -0.6 - Math.random() * 0.3;   // a moment before they start
  }

  /** Erases what one wiper blade swept between two angles. */
  private wipe(a0: number, a1: number): void {
    if (Math.abs(a1 - a0) < 1e-4) return;
    const c = this.mudCtx, sx = this.mudW / this.glassW;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    for (const [u, v] of this.wiperPivots) {
      const cx = (u + this.glassW / 2) * sx, cy = this.mudH - v * sx;
      const lo = Math.min(a0, a1) - 0.05, hi = Math.max(a0, a1) + 0.05;
      c.beginPath();
      c.moveTo(cx, cy);
      // canvas y runs down, the glass's v runs up: angles flip sign
      c.arc(cx, cy, (this.wiperLen + 0.02) * sx, -hi, -lo);
      c.closePath();
      c.fill();
    }
    c.restore();
    this.mudDirty = true;
  }

  private updateWipers(dt: number): void {
    // the mud also fades slowly where the wipers do not reach
    this.mudFade += dt;
    if (this.mudFade > 0.5) {
      this.mudFade = 0;
      const c = this.mudCtx;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.06)';
      c.fillRect(0, 0, this.mudW, this.mudH);
      c.restore();
      this.mudDirty = true;
    }
    const SWEEP = 2.05, T = 0.95;
    let a = 0;
    if (this.wipeT !== -1) {
      this.wipeT += dt;
      if (this.wipeT >= 0) {
        if (this.wipeT - dt < 0) this.onSound?.('move', { volume: 0.14, rate: 0.55 });
        const k = Math.min(1, this.wipeT / T);
        a = SWEEP * Math.sin(k * Math.PI) ** 0.8;
        this.wipe(this.wipeA, a);
        if (k >= 1) {
          a = 0;
          this.wipesLeft--;
          this.wipeT = this.wipesLeft > 0 ? -0.15 : -1;
        }
      }
    }
    this.wipeA = a;
    for (const w of this.wipers) w.rotation.z = a - 0.04;
    if (this.mudDirty) {
      this.mudDirty = false;
      this.mud.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, o: CockpitInput): void {
    const tr = o.truck;
    // the body's pitch and roll, smoothed again and clamped, so the horizon never spins
    const pt = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, tr.bodyPitch));
    const rl = Math.max(-ROLL_MAX, Math.min(ROLL_MAX, tr.bodyRoll));
    this.pitch += (pt - this.pitch) * Math.min(1, dt * 8);
    this.roll += (rl - this.roll) * Math.min(1, dt * 6);
    this.rig.position.set(tr.x, tr.y + tr.suspension * 0.6, tr.z);
    this.rig.rotation.set(this.pitch, -tr.heading - Math.PI / 2, this.roll);
    this.rig.updateMatrixWorld(true);

    // motion felt in the cab: turning, braking and accelerating
    if (dt > 0) {
      let dh = tr.heading - this.lastHeading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.yawRate += (dh / dt - this.yawRate) * Math.min(1, dt * 10);
      this.accel += ((tr.forward - this.lastSpeed) / dt - this.accel) * Math.min(1, dt * 8);
    }
    this.lastHeading = tr.heading;
    this.lastSpeed = tr.forward;

    // the head: it lags the cab on bumps, shakes on hits, rumbles in mud, leans into turns
    const sp = tr.speed;
    this.bobT += dt * (9 + sp * 0.6);
    const rumble = o.rough * Math.min(1, sp / 10);
    const sh = o.shake;
    const r = () => Math.random() - 0.5;
    const head = new THREE.Vector3(
      r() * sh * 0.03 + r() * rumble * 0.006,
      -tr.suspension * 0.35 + Math.sin(this.bobT) * rumble * 0.008 + r() * sh * 0.03,
      0,
    );
    const look = new THREE.Euler(
      r() * sh * 0.05 + r() * rumble * 0.008,
      -o.steer * 0.05 * Math.min(1, sp / 6) + r() * sh * 0.04,
      r() * sh * 0.04,
    );
    const m = this.base.matrixWorld.clone().multiply(mat4(head, look));
    const s = new THREE.Vector3();
    m.decompose(this.camPos, this.camQuat, s);
    this.fov = COCKPIT_FOV + Math.min(4, sp * 0.22) + o.kick * 9;

    // the mirror looks back from where it hangs, level with the cab
    const mc = this.base.localToWorld(at(640, 116, 0.5));
    this.mirrorCam.position.copy(mc);
    this.mirrorCam.quaternion.copy(this.rig.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.04, Math.PI, 0)));
    this.mirrorCam.updateMatrixWorld();

    // steering wheel: the same angle the on-screen wheel shows
    const want = -wheelAngle(o.steer);
    const spin = this.wheel.children[0];
    if (spin) spin.rotation.z = want;

    this.updateGauges(dt, o);
    this.updateOrnament(dt, tr);
    this.updateWipers(dt);
  }

  private updateGauges(dt: number, o: CockpitInput): void {
    const tr = o.truck;
    const v = Math.abs(tr.forward);
    // a five-speed box: revs climb through each gear and drop at the shift
    let rpm: number;
    let gear: string;
    if (!o.racing) {
      rpm = o.gas ? 5200 + Math.sin(this.bobT * 3) * 300 : 900;
      gear = 'N';
    } else if (tr.forward < -0.4) {
      rpm = 1200 + Math.min(1, v / (o.top * 0.42)) * 4200;
      gear = 'R';
    } else {
      const f = v / Math.max(1, o.top);
      let i = GEARS.findIndex((g) => f < g);
      if (i < 0) i = GEARS.length - 1;
      const lo = i ? GEARS[i - 1] * 0.8 : 0;
      rpm = 1100 + Math.min(1.1, (f - lo) / (GEARS[i] - lo)) * 5800;
      if (!o.gas && v < 0.5) rpm = 900;
      else if (!o.gas) rpm *= 0.82;
      if (tr.airborne && o.gas) rpm = Math.min(7800, rpm + 1800);
      if (tr.nitroT > 0) rpm = Math.min(7900, rpm + 600);
      gear = v < 0.5 && !o.gas ? 'N' : String(i + 1);
    }
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 9);
    this.gear = gear;
    const kmh = v * KMH;
    // nitro: full while a can is ready, draining while it burns
    const nWant = tr.nitroT > 0 ? tr.nitroT / NITRO_TIME : tr.nitro > 0 ? 1 : 0;
    this.nitroShown += (nWant - this.nitroShown) * Math.min(1, dt * 6);
    const jitter = (Math.random() - 0.5) * 0.01;
    const sweep = (k: number, deg: number) => -((-deg / 2 + deg * Math.max(0, Math.min(1.02, k))) * Math.PI) / 180;
    this.needles[0].obj.rotation.z = sweep(this.rpm / RPM_MAX + jitter, 270);
    this.needles[1].obj.rotation.z = sweep(kmh / SPEEDO_MAX + (kmh > 1 ? jitter * 0.5 : 0), 270);
    this.needles[2].obj.rotation.z = sweep(this.nitroShown, 240);

    // the readouts, redrawn at most 20 times a second and only when they change
    this.blink += dt;
    this.dynT -= dt;
    if (this.dynT > 0) return;
    this.dynT = 0.05;
    const low = tr.nitro === 0 && tr.nitroT <= 0;
    const blinkOn = Math.floor(this.blink * 3) % 2 === 0;
    const pos = o.trucks.map((x) => `${x.x.toFixed(1)},${x.z.toFixed(1)}`).join(';');
    const key = `${Math.round(kmh)}|${gear}|${tr.nitro}|${low && blinkOn}|${tr.nitroT > 0}|${pos}`;
    if (key === this.dynKey) return;
    this.dynKey = key;
    this.drawReadouts(Math.round(kmh), gear, tr.nitro, low, blinkOn, tr.nitroT > 0, o.trucks);
  }

  private drawReadouts(kmh: number, gear: string, cans: number, low: boolean, blinkOn: boolean, boosting: boolean, trucks: Truck[]): void {
    const c = this.dynCtx;
    c.clearRect(0, 0, 512, 256);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // speed: digits in a dark window
    const win = (x: number, w: number) => {
      c.fillStyle = 'rgba(5,7,10,0.9)';
      c.beginPath(); c.roundRect(x + 4, 6, w - 8, 68, 16); c.fill();
    };
    win(0, 192);
    c.fillStyle = '#e9f6ff';
    c.font = `700 62px ${FONT}`;
    c.fillText(String(kmh), 96, 43);
    win(192, 128);
    c.fillStyle = gear === 'R' ? '#ff6b5a' : '#ffd23f';
    c.fillText(gear, 256, 43);
    win(320, 128);
    c.fillStyle = low ? (blinkOn ? '#ff3b30' : '#5a1a14') : boosting ? '#ffd23f' : '#ffffff';
    c.font = `700 54px ${FONT}`;
    c.fillText(`×${cans}`, 384, 43);

    // the map screen
    if (this.mapBg) c.drawImage(this.mapBg, 0, 96);
    const f = this.mapFit;
    trucks.slice().reverse().forEach((tr) => {
      const x = f.x + tr.x * f.s, y = 96 + f.y + tr.z * f.s;
      const rr = tr.isPlayer ? 10 : 8;
      c.fillStyle = '#' + tr.color.toString(16).padStart(6, '0');
      c.strokeStyle = tr.isPlayer ? '#ffffff' : '#0b1012';
      c.lineWidth = tr.isPlayer ? 4 : 3;
      c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.fill(); c.stroke();
      if (tr.isPlayer) {
        const hx = Math.cos(tr.heading), hz = Math.sin(tr.heading);
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.moveTo(x + hx * 22, y + hz * 22);
        c.lineTo(x + hx * 11 - hz * 7, y + hz * 11 + hx * 7);
        c.lineTo(x + hx * 11 + hz * 7, y + hz * 11 - hx * 7);
        c.closePath(); c.fill();
      }
    });
    // the place, in the screen's corner
    const order = trucks.slice().sort((a, b) => (b.finished ? 1e6 - b.finishTime : b.lapsDone * 1e4 + b.s) - (a.finished ? 1e6 - a.finishTime : a.lapsDone * 1e4 + a.s));
    const place = order.findIndex((x) => x.isPlayer) + 1;
    c.fillStyle = 'rgba(5,10,12,0.75)';
    c.beginPath(); c.roundRect(4, 100, 66, 40, 10); c.fill();
    c.fillStyle = place === 1 ? '#ffd23f' : '#ffffff';
    c.font = `700 30px ${FONT}`;
    c.fillText(ordinal(place), 37, 121);
    this.dyn.needsUpdate = true;
  }

  private updateOrnament(dt: number, tr: Truck): void {
    const w = this.swing;
    const latA = tr.forward * this.yawRate;   // > 0 turning right: it swings left
    const step = Math.min(dt, 1 / 30);
    for (let t = 0; t < dt - 1e-6; t += step) {
      const h = Math.min(step, dt - t);
      w.sv += (-26 * Math.sin(w.s) - 1.4 * w.sv - latA * 0.5) * h;
      w.fv += (-26 * Math.sin(w.f) - 1.4 * w.fv - this.accel * 0.45 + tr.suspension * 6) * h;
      w.s = Math.max(-1, Math.min(1, w.s + w.sv * h));
      w.f = Math.max(-0.9, Math.min(0.9, w.f + w.fv * h));
    }
    this.ornament.rotation.set(w.f, 0, w.s);
  }

  /** Draws the mirror (before the main render), when the in-car view is up. */
  renderMirror(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.mirrorOn) return;
    this.mirrorOn = false;
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;   // the mirror reuses this frame's shadows
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.mirrorCam);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = auto;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
