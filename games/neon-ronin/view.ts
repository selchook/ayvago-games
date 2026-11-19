// Neon Ronin: the 3D view of a level (sim.ts) in a neon night city.
//   - The level: the kit's floating rooftops (Platform_4x4 decks with hazard stripes, the heavy
//     4×1 platforms' trusses, AC units and pipes hung under the floating ones), building blocks with
//     lit window strips and neon signs on their fronts, antennas, dishes, computers, lamps, fences
//     and corner signs behind the play line; one-way ledges on hanging trusses. Merged per 24 m
//     chunk (a few draw calls each).
//   - The city: two layers of far towers (instanced, lit windows), floating kit platforms in the
//     middle distance, a violet sky with a red moon, flying-car lights, fog, a static glow cloud
//     over every lamp and sign, and signs that blink on their own.
//   - The figures (figure.ts) driven by the sim's states with their own clips; turrets turning
//     their tops; pickups, levers, lootboxes, tanks, checkpoints, the exit beacon; hazards (live
//     cables, steam, lasers), falling ledges, doors and bridges.
//   - Telegraphs: red sights, "!" glows, ground marks with a warning line from the sky, the boss's
//     laser line; and juice: sparks, slash arcs, bolts, shockwaves, explosions, a camera that looks
//     ahead and shakes.
import Phaser from 'phaser';
import { THREE, World3D } from '@core/three';
import { makeMats, prop, propBox, Merger, SIGN_UV, type Mats, type Group } from './kit';
import { Figure } from './figure';
import { Sparks, glowCloud, glowQuad, beam, canvasTex, type Quad } from './fx3d';
import { glowCanvas, slashCanvas, ringCanvas, shadowCanvas, puffCanvas, windowsCanvas, skyCanvas } from './art';
import { ATTACKS, FOE_SCALE, MOVE, IAIDO_DIST, type FoeKind, type AttackKind } from './defs';
import { hazardBox, mulberry, type Sim, type SimEvent, type Foe, type Shot, type Pickup, type Prop, type Hazard, type Faller, type Gate } from './sim';

const CHUNK = 24;
const CAM_Z = 12.4;
/** The hero a little larger than the kit's figure, so it reads next to the big robots. */
const HERO_SCALE = 1.18;
/** Big foes stand a little behind the play line (the hero always in front of them). */
const FOE_Z: Partial<Record<FoeKind, number>> = { boss: -1.7, brute: -0.8, turret: -0.3, cannon: -0.3, double: -0.3 };
const FOV = 36;
/** The hero's hips above its feet (the pivot of a flip). */
const HIP = 0.85;
/**
 * How each blow is shown with the hero's own clips: another clip than the move's, a start point in
 * it, a speed factor, and a whole-body turn over the blow (`spin` turns about the upright axis,
 * `flip` head over heels, `lean` a held forward tilt), so the same few clips read as distinct moves.
 */
const STYLE: Partial<Record<AttackKind, { clip?: string; at?: number; speed?: number; spin?: number; flip?: number; lean?: number; hold?: number }>> = {
  spin: { speed: 1.25, spin: Math.PI * 4 },
  rise: { speed: 1.1, lean: -0.32 },
  air: { speed: 1.1, lean: 0.15 },
  air2: { speed: 1.15, lean: 0.1 },
  air3: { speed: 1.0, flip: Math.PI * 2 },
  dive: { hold: 0.55, lean: 0.62 },
  iaido: { hold: 0.78, lean: 0.28 },
  burst: { speed: 1.4 },
};
export function dimHex(c: number, k: number): number { return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k); }
export const NEON = { cyan: 0x3ff0ff, magenta: 0xff3fa8, yellow: 0xffe040, red: 0xff3344, orange: 0xff9a3c, lime: 0x7cff6a, violet: 0xa98bff, white: 0xffffff };

interface FoeView { f: Foe; fig: Figure | null; obj: THREE.Object3D; top: THREE.Object3D | null; shadow: THREE.Mesh; sight: Quad | null; tellT: number; last: string; dieT: number; spin: number }
interface PickView { obj: THREE.Object3D; base: number }
interface PropView { obj: THREE.Object3D; top: THREE.Object3D | null; ring: Quad | null; beam: Quad | null; done: boolean }
interface HazView { h: Hazard; group: THREE.Group; core: Quad }

export class View {
  readonly world: World3D;
  readonly mats: Mats;
  readonly hero: Figure;
  private heroShadow: THREE.Mesh;
  /** The cleave's charge: a ring on the ground under the hero. */
  private chargeRing: Quad;
  private level = new THREE.Group();
  private owned: Array<{ dispose(): void }> = [];
  private tex: Record<'glow' | 'slash' | 'ring' | 'shadow' | 'puff' | 'windows' | 'sky', THREE.Texture>;
  readonly sparks: Sparks;
  private puffs: Sparks;
  private foes = new Map<number, FoeView>();
  private shots = new Map<number, THREE.Mesh>();
  private picks = new Map<number, PickView>();
  private props = new Map<number, PropView>();
  private hazards: HazView[] = [];
  private fallers = new Map<number, THREE.Group>();
  private gates = new Map<number, THREE.Group>();
  private marks = new Map<number, { ring: Quad; line: Quad }>();
  private waves = new Map<number, Quad>();
  private slashes: Quad[] = [];
  private sky: THREE.Mesh;
  private moon: Quad;
  private cars: Array<{ m: THREE.Mesh; v: number; y: number; z: number }> = [];
  private bossLaser: Quad;
  /** The iaido's streak along its dash. */
  private streak: Quad;
  private camX = 0;
  private camY = 4;
  private shakeT = 0;
  private shakeA = 0;
  private time = 0;
  private lastAtk: unknown = null;
  private flipT = 0;
  private shotFlash = 0;
  private sim: Sim | null = null;
  private pixelScale: number;
  /** Ahead of the hero (0 = centred): the menu's backdrop frames the hero a little right. */
  offsetX = 0;
  zoom = 1;

  constructor(private scene: Phaser.Scene, opts: { quality?: number } = {}) {
    const q = opts.quality ?? 0.75;
    this.world = new World3D(scene, { fov: FOV, near: 0.4, far: 240, background: 0x0a0618, fog: { color: 0x1c0e3a, near: 26, far: 115 }, shadows: false, quality: q });
    const w = this.world;
    this.mats = makeMats(scene);
    this.pixelScale = (720 * q) / (2 * Math.tan((FOV / 2) * Math.PI / 180));
    // a cool moonlight, magenta and cyan neon from behind, a violet sky
    w.scene.add(new THREE.HemisphereLight(0x8a7cff, 0x3a1030, 1.15));
    const moon = new THREE.DirectionalLight(0xcfe0ff, 1.5);
    moon.position.set(-6, 10, 12);
    const rimM = new THREE.DirectionalLight(0xff3fa8, 1.6);
    rimM.position.set(8, 5, -10);
    const rimC = new THREE.DirectionalLight(0x3ff0ff, 1.0);
    rimC.position.set(-9, 3, -6);
    w.scene.add(moon, rimM, rimC);
    this.tex = {
      glow: canvasTex(glowCanvas()), slash: canvasTex(slashCanvas()), ring: canvasTex(ringCanvas()), shadow: canvasTex(shadowCanvas()),
      puff: canvasTex(puffCanvas()), windows: canvasTex(windowsCanvas()), sky: canvasTex(skyCanvas()),
    };
    this.mats.windows.map = this.tex.windows;
    this.mats.windows.needsUpdate = true;
    this.sparks = new Sparks(700, this.tex.glow, this.pixelScale);
    this.puffs = new Sparks(160, this.tex.puff, this.pixelScale);
    (this.puffs.points.material as THREE.ShaderMaterial).blending = THREE.NormalBlending;
    w.scene.add(this.sparks.points, this.puffs.points, this.level);
    // the sky and the moon follow the camera
    const skyM = new THREE.MeshBasicMaterial({ map: this.tex.sky, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(new THREE.PlaneGeometry(520, 230), skyM);
    this.sky.position.set(0, 30, -170);
    this.sky.renderOrder = -10;
    this.moon = glowQuad(this.tex.glow, 0xff4a7a, 70, 70);
    this.moon.material.fog = false;
    this.moon.position.set(0, 38, -160);
    this.moon.renderOrder = -9;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: 0xff5a7a, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    disc.position.set(0, 0, 0.1);
    this.moon.add(disc);
    w.scene.add(this.sky, this.moon);
    // flying cars: little light streaks crossing the city
    const r = mulberry(99);
    for (let i = 0; i < 14; i++) {
      const m = glowQuad(this.tex.glow, [NEON.cyan, NEON.magenta, NEON.yellow, 0xffffff][i % 4], 1.4, 0.5);
      const z = -30 - r() * 50;
      m.position.set(r() * 120, 12 + r() * 22, z);
      w.scene.add(m);
      this.cars.push({ m, v: (r() < 0.5 ? -1 : 1) * (6 + r() * 10), y: m.position.y, z });
    }
    // the boss's laser beam (one at a time)
    this.bossLaser = beam(NEON.red, 0.9);
    this.bossLaser.visible = false;
    w.scene.add(this.bossLaser);
    this.streak = beam(0xffffff, 0);
    this.streak.visible = false;
    w.scene.add(this.streak);
    for (let i = 0; i < 6; i++) {
      const s = glowQuad(this.tex.slash, NEON.cyan, 3, 3);
      s.visible = false;
      w.scene.add(s);
      this.slashes.push(s);
    }
    this.hero = new Figure('hero', HERO_SCALE, this.mats);
    this.hero.rim(0x3ff0ff, 0.9);
    this.hero.show(['body', 'sword']);
    this.heroShadow = this.blob(1.1);
    this.chargeRing = glowQuad(this.tex.ring, NEON.cyan, 2.2, 2.2);
    this.chargeRing.rotation.x = -Math.PI / 2;
    this.chargeRing.visible = false;
    w.scene.add(this.chargeRing);
    w.scene.add(this.hero.root);
    this.hero.play('Idle_Sword');
  }

  private blob(size: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.5), new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, depthWrite: false, fog: false }));
    m.renderOrder = 2;
    this.world.scene.add(m);
    return m;
  }

  // ---------------------------------------------------------------- the level

  /** Builds the level of a new simulation (the previous one is freed). */
  build(sim: Sim): void {
    this.clearLevel();
    this.sim = sim;
    const L = this.level;
    const rnd = mulberry(sim.levelIndex * 131 + 7);
    const W = sim.W, H = sim.H;
    const chunks = new Map<number, Merger>();
    const mergerAt = (x: number): Merger => {
      const k = Math.floor(x / CHUNK);
      let m = chunks.get(k);
      if (!m) { m = new Merger(); chunks.set(k, m); }
      return m;
    };
    const glows: Array<{ x: number; y: number; z: number; size: number; color: number; alpha: number }> = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3();
    const put = (name: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, grp: Group = 'sign'): void => {
      Q.setFromEuler(new THREE.Euler(0, ry, 0));
      M.compose(T.set(x, y, z), Q, S.set(sx, sy, sz));
      mergerAt(x).addProp(name, M, grp);
    };
    const solid = (x: number, y: number) => sim.tile(x, y) === 1;
    // ---- building blocks: greedy rectangles of solid cells
    const used = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!solid(x, y) || used[y * W + x]) continue;
        let x1 = x;
        while (x1 + 1 < W && solid(x1 + 1, y) && !used[y * W + x1 + 1] && (x1 + 1) % CHUNK !== 0) x1++;
        let y1 = y;
        const rowOk = (yy: number) => { for (let i = x; i <= x1; i++) if (!solid(i, yy) || used[yy * W + i]) return false; return true; };
        while (y1 + 1 < H && rowOk(y1 + 1)) y1++;
        for (let yy = y; yy <= y1; yy++) for (let i = x; i <= x1; i++) used[yy * W + i] = 1;
        const top = y1 + 1, bottom = y === 0 ? -42 : y;
        const m = mergerAt(x);
        const exposed = !solid(x, top) || !solid(x1, top);
        m.addBox('wall', x, bottom, -3.3, x1 + 1, exposed ? top - 0.12 : top, -0.55, 0x2c2742, 0x4e4a66, 0x1c1830);
        this.facade(m, put, glows, rnd, x, x1 + 1, Math.max(bottom, top - 9), top, y === 0);
      }
    }
    // ---- rooftops: a deck with hazard stripes on every top, the city's clutter behind the play line
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!(solid(x, y) && !solid(x, y + 1))) { x++; continue; }
        let x1 = x;
        while (x1 + 1 < W && solid(x1 + 1, y) && !solid(x1 + 1, y + 1)) x1++;
        const top = y + 1, w = x1 + 1 - x;
        const n = Math.max(1, Math.round(w / 3.9));
        for (let i = 0; i < n; i++) {
          put('slab-4x4', x + (i + 0.5) * w / n, top - 0.1, -1.18, (w / n) / 3.86, 1, 1.08);
          // the heavy platform's trusses, pipes and machines hang under the front edge
          put('plat-4x1', x + (i + 0.5) * w / n, top - 0.16, 0.12, (w / n) / 3.86, 1, 1.0, 0);
        }
        if (w >= 3 && top < H) this.roofClutter(put, glows, rnd, x, x1 + 1, top);
        x = x1 + 1;
      }
    }
    // ---- one-way ledges on hanging trusses
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (sim.tile(x, y) !== 2) { x++; continue; }
        let x1 = x;
        while (x1 + 1 < W && sim.tile(x1 + 1, y) === 2) x1++;
        const w = x1 + 1 - x, top = y + 1;
        const n = Math.max(1, Math.round(w / 3.9));
        for (let i = 0; i < n; i++) put('slab-4x1', x + (i + 0.5) * w / n, top - 0.1, -0.2, (w / n) / 3.86, 1, 1.5);
        put('support-short', x + 0.3, top - 1.25, -0.25, 1, 1, 1, 0);
        put('support-short', x1 + 0.7, top - 1.25, -0.25, -1, 1, 1, 0);
        glows.push({ x: x + w / 2, y: top - 0.25, z: 0.4, size: 2.2, color: NEON.cyan, alpha: 0.35 });
        x = x1 + 1;
      }
    }
    // ---- the city behind
    this.skyline(rnd, W, glows);
    for (const m of chunks.values()) this.own(m.build(L, this.mats));
    if (glows.length) { const g = glowCloud(glows, this.tex.glow, this.pixelScale); L.add(g); this.own([g]); }
    // ---- the dynamic parts
    for (const h of sim.hazards) this.addHazard(h);
    for (const f of sim.fallers) this.addFaller(f);
    for (const g of sim.gates) this.addGate(g);
    for (const p of sim.props) this.addProp(p);
    this.camX = Phaser.Math.Clamp(sim.p.x + 2, 9, Math.max(9, W - 9));
    this.camY = sim.p.y;
  }

  /** A quad made for a level piece: freed with the level. */
  private reg<T extends THREE.Mesh>(m: T): T {
    this.owned.push(m.geometry, m.material as THREE.Material);
    return m;
  }

  private own(list: Array<THREE.Mesh | THREE.Points | THREE.InstancedMesh>): void {
    for (const m of list) { this.owned.push(m.geometry); if ((m as THREE.InstancedMesh).isInstancedMesh) this.owned.push(m as THREE.InstancedMesh); if (m instanceof THREE.Points) this.owned.push(m.material as THREE.Material); }
  }

  /** The front of a building block: lit window strips, neon signs, AC units, pipes, cables, screens. */
  private facade(m: Merger, put: (n: string, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, ry?: number, g?: Group) => void, glows: Array<{ x: number; y: number; z: number; size: number; color: number; alpha: number }>, r: () => number, x0: number, x1: number, y0: number, top: number, ground: boolean): void {
    const w = x1 - x0;
    const cols = [NEON.cyan, NEON.magenta, NEON.yellow, NEON.violet];
    // window strips down the front
    if (ground) {
      for (let y = top - 2.6; y > y0 - 6; y -= 2.2 + r() * 1.4) {
        if (r() < 0.55) {
          const sx = x0 + 0.4 + r() * Math.max(0.1, w - 3), sw = Math.min(w - 0.8, 1.5 + r() * 5);
          if (sw > 0.6) {
            const col = cols[Math.floor(r() * cols.length)];
            for (let wx = sx + 0.25; wx < sx + sw; wx += 0.55) if (r() < 0.8) m.addQuad('glow', wx, y, -0.53, 0.32, 0.42, null, dimHex(col, 0.35 + r() * 0.4));
          }
        }
      }
    }
    for (let x = x0 + 1 + r() * 2; x < x1 - 1; x += 2.6 + r() * 3.2) {
      const k = r();
      const y = top - 1.1 - r() * (ground ? 4.5 : 0.6);
      if (y < y0 + 0.4 && !ground) continue;
      if (k < 0.24) {
        // a neon sign on the front
        const uv = SIGN_UV[Math.floor(r() * SIGN_UV.length)];
        const aw = uv[2] - uv[0], ah = uv[3] - uv[1];
        const tall = ah > aw * 1.4;
        const h = tall ? 2.2 : 0.75, sw = h * aw / ah;
        const grp: Group = r() < 0.3 ? 'signB' : r() < 0.5 ? 'signC' : 'sign';
        m.addQuad(grp, x, y - (tall ? 0.8 : 0), -0.5, sw, h, uv);
        glows.push({ x, y: y - (tall ? 0.8 : 0), z: -0.2, size: Math.max(sw, h) * 2.0, color: cols[Math.floor(r() * cols.length)], alpha: 0.3 });
      } else if (k < 0.42) put('ac', x, y, -0.2, 1, 1, 1, 0);
      else if (k < 0.55) put('ac-side', x, y, -0.2, 1, 1, 1, 0);
      else if (k < 0.66) put('pipe-2', x + 1, y - 0.3, -0.25, 1, 1, 1, 0);
      else if (k < 0.76) { put('light-square', x, y, -0.3, 1.2, 1.2, 1.2, 0); glows.push({ x, y: y + 0.25, z: 0, size: 2.0, color: 0xfff0c0, alpha: 0.55 }); }
      else if (k < 0.86) put('cable-small', x, top - 0.25, -0.3, 1, 1.4, 1, 0);
      else put('tv-2', x, y - 0.3, -0.3, 1, 1, 1, 0);
    }
  }

  /** Antennas, dishes, machines, lamps and fences behind the play line of a rooftop. */
  private roofClutter(put: (n: string, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number, ry?: number, g?: Group) => void, glows: Array<{ x: number; y: number; z: number; size: number; color: number; alpha: number }>, r: () => number, x0: number, x1: number, top: number): void {
    const n = Math.max(1, Math.round((x1 - x0) / 2.3));
    for (let i = 0; i < n; i++) put('rail-long', x0 + (i + 0.5) * (x1 - x0) / n, top, -3.05, ((x1 - x0) / n) / 2.29, 1, 1);
    for (let x = x0 + 0.8 + r() * 1.5; x < x1 - 0.6; x += 1.8 + r() * 3.2) {
      const k = r(), z = -2.4 + r() * 0.7;
      if (k < 0.16) put('antenna-1', x, top, z, 1.2, 1.2, 1.2, r() * 3);
      else if (k < 0.28) put('antenna-2', x, top + 0.4, z, 1.6, 1.6, 1.6, r() * 3);
      else if (k < 0.42) put('ac', x, top + 0.3, z, 1.1, 1.1, 1.1, Math.PI);
      else if (k < 0.52) put('computer', x, top, z, 1.2, 1.2, 1.2, 0);
      else if (k < 0.62) { put('light-street-1', x, top, z - 0.3, 1, 1, 1, 0); glows.push({ x, y: top + 2.8, z: z - 0.1, size: 3.2, color: 0xffe0b0, alpha: 0.6 }); }
      else if (k < 0.7) put('ac-stacked', x, top + 0.55, z, 1.1, 1.1, 1.1, 0);
      else if (k < 0.78) put('fence', x, top, -2.9, 1.4, 1.2, 1, 0);
      else if (k < 0.86) { put('tv-3', x, top, z, 1, 1, 1, 0); glows.push({ x, y: top + 1.8, z, size: 1.8, color: NEON.magenta, alpha: 0.35 }); }
      else if (k < 0.93) put('computer-large', x, top, z - 0.2, 1, 1, 1, 0);
      else { put('light-square', x, top, z, 1.3, 1.3, 1.3, 0); glows.push({ x, y: top + 0.35, z, size: 1.6, color: 0xfff0c0, alpha: 0.5 }); }
    }
    if (r() < 0.7) put('sign-corner-1', x1 - 0.1, top + 1.4, -2.0, 1.2, 1.2, 1.2, 0, r() < 0.5 ? 'signB' : 'sign');
  }

  /** Far towers, floating platforms in the middle distance. */
  private skyline(r: () => number, W: number, glows: Array<{ x: number; y: number; z: number; size: number; color: number; alpha: number }>): void {
    const L = this.level;
    const items: Array<{ x: number; z: number; w: number; d: number; h: number; c: number }> = [];
    for (let x = -60; x < W + 60; x += 5 + r() * 7) items.push({ x, z: -60 - r() * 45, w: 7 + r() * 12, d: 8 + r() * 10, h: 30 + r() * 70, c: 0x8090ff });
    for (let x = -40; x < W + 40; x += 7 + r() * 9) items.push({ x, z: -34 - r() * 14, w: 5 + r() * 8, d: 6, h: 22 + r() * 40, c: 0xc0a0ff });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const im = new THREE.InstancedMesh(box, this.mats.windows, items.length);
    const M = new THREE.Matrix4(), c = new THREE.Color();
    items.forEach((it, i) => {
      M.compose(new THREE.Vector3(it.x, -40 + it.h / 2, it.z), new THREE.Quaternion(), new THREE.Vector3(it.w, it.h, it.d));
      im.setMatrixAt(i, M);
      c.setHex(it.c).multiplyScalar(0.55 + r() * 0.5);
      im.setColorAt(i, c);
      if (r() < 0.35) glows.push({ x: it.x, y: -40 + it.h + 1, z: it.z, size: 6 + r() * 5, color: r() < 0.5 ? NEON.magenta : NEON.cyan, alpha: 0.3 });
    });
    im.frustumCulled = false;
    L.add(im);
    this.own([im]);
    // floating kit platforms in the middle distance, with neon signs
    const mids = new Map<number, Merger>();
    const M2 = new THREE.Matrix4(), Q = new THREE.Quaternion();
    const kinds = ['plat-4x4', 'plat-2x2', 'plat-4x2'];
    for (let x = -20; x < W + 20; x += 11 + r() * 12) {
      const key = Math.floor(x / 40);
      let mid = mids.get(key);
      if (!mid) { mid = new Merger(); mids.set(key, mid); }
      const k = kinds[Math.floor(r() * kinds.length)];
      const y = 1 + r() * 13, z = -15 - r() * 10, s = 1.2 + r() * 0.8;
      Q.setFromEuler(new THREE.Euler(0, (r() - 0.5) * 0.8, 0));
      M2.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(s, s, s));
      mid.addProp(k, M2, r() < 0.4 ? 'signB' : 'sign');
      if (r() < 0.6) {
        const uv = SIGN_UV[Math.floor(r() * 9)];
        const aw = uv[2] - uv[0], ah = uv[3] - uv[1];
        const h = ah > aw * 1.4 ? 3.2 : 1.3;
        mid.addQuad(r() < 0.5 ? 'signC' : 'sign', x + (r() - 0.5) * 3, y - 2.2, z + 2.6, h * aw / ah, h, uv);
        glows.push({ x, y: y - 2.2, z: z + 2.8, size: 6, color: r() < 0.5 ? NEON.magenta : NEON.cyan, alpha: 0.3 });
      }
      glows.push({ x: x + (r() - 0.5) * 3, y: y + 0.6, z: z + 1, size: 3, color: 0xfff0c0, alpha: 0.4 });
    }
    for (const mid of mids.values()) this.own(mid.build(L, this.mats));
  }

  private clearLevel(): void {
    // the level's own geometry (merged chunks, boxes, quads); the kit's stays
    for (const o of this.owned) o.dispose();
    this.owned = [];
    this.shotKit = null;
    this.level.clear();
    for (const v of this.foes.values()) this.dropFoe(v);
    this.foes.clear();
    for (const m of this.shots.values()) this.world.scene.remove(m);
    this.shots.clear();
    for (const p of this.picks.values()) this.world.scene.remove(p.obj);
    this.picks.clear();
    for (const p of this.props.values()) this.world.scene.remove(p.obj);
    this.props.clear();
    for (const h of this.hazards) this.world.scene.remove(h.group);
    this.hazards = [];
    for (const g of this.fallers.values()) this.world.scene.remove(g);
    this.fallers.clear();
    for (const g of this.gates.values()) this.world.scene.remove(g);
    this.gates.clear();
    for (const m of this.marks.values()) { this.world.scene.remove(m.ring, m.line); m.ring.material.dispose(); m.ring.geometry.dispose(); m.line.geometry.dispose(); (m.line.material as THREE.Material).dispose(); }
    this.marks.clear();
    for (const w of this.waves.values()) { this.world.scene.remove(w); w.geometry.dispose(); (w.material as THREE.Material).dispose(); }
    this.waves.clear();
  }

  // ---------------------------------------------------------------- dynamic pieces

  private addHazard(h: Hazard): void {
    const g = new THREE.Group();
    const [x0, y0, x1, y1] = hazardBox(h);
    const cx = (x0 + x1) / 2;
    let core: Quad;
    if (h.kind === 'cable') {
      const c = prop('cable-long', this.mats);
      c.scale.set(2.6, (y1 - y0) / 2.51, 2.6);
      c.position.set(cx, y1, 0);
      g.add(c);
      core = this.reg(beam(0x9ffcff, 0));
      core.scale.set(0.16, y1 - y0, 1);
      core.position.set(cx, (y0 + y1) / 2, 0.15);
    } else if (h.kind === 'laser') {
      for (const yy of [y0 - 0.05, y1 + 0.05]) {
        const e = prop('light-square', this.mats);
        e.scale.set(1.3, 0.6, 1.3);
        e.position.set(cx, yy - (yy < y1 ? 0.25 : 0), 0);
        g.add(e);
      }
      core = this.reg(beam(0xff2a6a, 0));
      core.scale.set(0.2, y1 - y0, 1);
      core.position.set(cx, (y0 + y1) / 2, 0);
    } else {
      const v = prop('pipe-1', this.mats);
      v.scale.set(0.45, 1.6, 1.6);
      v.position.set(cx, y0 + 0.05, 0);
      g.add(v);
      core = this.reg(beam(0xffffff, 0));
      core.scale.set(0.01, 0.01, 1);
    }
    g.add(core);
    this.world.scene.add(g);
    this.hazards.push({ h, group: g, core });
  }

  private addFaller(f: Faller): void {
    const g = new THREE.Group();
    const w = f.x1 - f.x0;
    const s = prop('slab-2x1', this.mats);
    s.scale.set(w / 1.89, 1.2, 1.6);
    s.position.set(w / 2, -0.1, -0.1);
    g.add(s);
    const strip = this.reg(beam(NEON.orange, 0.8));
    strip.scale.set(w - 0.1, 0.06, 1);
    strip.position.set(w / 2, -0.2, 0.55);
    g.add(strip);
    g.position.set(f.x0, f.y + 1, 0);
    this.world.scene.add(g);
    this.fallers.set(f.id, g);
  }

  private addGate(gt: Gate): void {
    const g = new THREE.Group();
    if (gt.kind === 'door') {
      const d = prop('door', this.mats);
      d.scale.set(1.5, (gt.y1 - gt.y0) / 1.16, 3);
      d.position.set(0.5, 0, 0);
      g.add(d);
      const glow = this.reg(beam(NEON.red, 0.7));
      glow.scale.set(0.08, gt.y1 - gt.y0 - 0.2, 1);
      glow.position.set(0.5, (gt.y1 - gt.y0) / 2, 0.25);
      glow.name = 'lamp';
      g.add(glow);
      g.position.set(gt.x0, gt.y0, 0);
    } else {
      const w = gt.x1 - gt.x0;
      const n = Math.max(1, Math.round(w / 3.9));
      for (let i = 0; i < n; i++) {
        const s = prop('slab-4x1', this.mats);
        s.scale.set((w / n) / 3.86, 1.3, 1.6);
        s.position.set((i + 0.5) * w / n, -0.1, -0.1);
        g.add(s);
      }
      g.position.set(gt.x0, gt.y1 + 9, 0);
      g.visible = false;
    }
    this.world.scene.add(g);
    this.gates.set(gt.id, g);
  }

  private addProp(p: Prop): void {
    const v: PropView = { obj: new THREE.Group(), top: null, ring: null, beam: null, done: false };
    switch (p.kind) {
      case 'lever': { const o = prop('lever', this.mats); o.scale.setScalar(1.7); o.rotation.y = Math.PI / 2; v.obj.add(o); v.top = o.getObjectByName('top') ?? null; const ring = this.reg(glowQuad(this.tex.glow, NEON.yellow, 1.6, 1.6)); ring.position.set(0, 0.7, 0.3); v.obj.add(ring); v.ring = ring; break; }
      case 'lootbox': { const o = prop('lootbox', this.mats); o.scale.setScalar(1.45); v.obj.add(o); v.top = o.getObjectByName('top') ?? null; break; }
      case 'barrel': { const o = prop('barrel', this.mats); o.scale.setScalar(1.1); o.position.y = 0.46; v.obj.add(o); const ring = this.reg(glowQuad(this.tex.glow, NEON.red, 1.4, 1.4)); ring.position.set(0, 0.6, 0.4); v.obj.add(ring); v.ring = ring; break; }
      case 'checkpoint': {
        const o = prop('light-street-2', this.mats);
        o.position.set(0, 0, -0.9);
        v.obj.add(o);
        const ring = this.reg(glowQuad(this.tex.ring, NEON.magenta, 1.6, 1.6));
        ring.position.set(0, 1.4, 0);
        v.obj.add(ring);
        v.ring = ring;
        const b = this.reg(glowQuad(this.tex.glow, NEON.magenta, 1.4, 5));
        b.position.set(0, 2.5, -0.3);
        v.obj.add(b);
        v.beam = b;
        break;
      }
      case 'exit': {
        const o = prop('teleporter', this.mats);
        o.scale.setScalar(2.2);
        v.obj.add(o);
        const b = this.reg(glowQuad(this.tex.glow, NEON.cyan, 3.2, 14));
        b.position.set(0, 6, 0);
        v.obj.add(b);
        v.beam = b;
        const ring = this.reg(glowQuad(this.tex.ring, NEON.cyan, 2.6, 2.6));
        ring.position.set(0, 1.2, 0.2);
        v.obj.add(ring);
        v.ring = ring;
        break;
      }
    }
    v.obj.position.set(p.x, p.y, 0);
    this.world.scene.add(v.obj);
    this.props.set(p.id, v);
  }

  private makePick(k: Pickup): PickView {
    const name = k.kind === 'gear' ? 'gear' : k.kind === 'chip' ? 'chip' : k.kind === 'health' ? 'health' : k.kind === 'heart' ? 'heart' : 'tank';
    const o = new THREE.Group();
    const m = prop(name, this.mats);
    const box = propBox(name);
    const size = box.getSize(new THREE.Vector3());
    const sc = (k.kind === 'gear' ? 0.55 : k.kind === 'chip' ? 1.0 : 0.7) / Math.max(size.x, size.y);
    m.scale.setScalar(sc);
    m.position.y = -(box.min.y + size.y / 2) * sc;
    o.add(m);
    const color = k.kind === 'gear' ? NEON.orange : k.kind === 'chip' ? NEON.lime : k.kind === 'heart' ? NEON.red : k.kind === 'tank' ? NEON.cyan : NEON.lime;
    const g = this.reg(glowQuad(this.tex.glow, color, k.kind === 'chip' ? 2.4 : 1.3, k.kind === 'chip' ? 2.4 : 1.3));
    g.position.z = -0.2;
    o.add(g);
    this.world.scene.add(o);
    return { obj: o, base: k.y };
  }

  private makeFoe(f: Foe): FoeView {
    let fig: Figure | null = null, obj: THREE.Object3D, top: THREE.Object3D | null = null;
    const sc = FOE_SCALE[f.kind];
    switch (f.kind) {
      case 'walker': case 'gunner': fig = new Figure('walker', sc, this.mats); fig.show([f.kind === 'gunner' ? 'gun' : 'plain']); fig.play('Walk'); break;
      case 'drone': case 'gdrone': fig = new Figure('drone', sc, this.mats); fig.show([f.kind === 'gdrone' ? 'gun' : 'plain']); fig.play('Idle'); break;
      case 'brute': fig = new Figure('brute', sc, this.mats); fig.play('Walk'); break;
      case 'boss': fig = new Figure('mech', sc, this.mats); fig.play('Idle'); break;
      default: {
        const name = f.kind === 'turret' ? 'turret-gun' : f.kind === 'cannon' ? 'turret-cannon' : f.kind === 'double' ? 'turret-double' : 'teleporter';
        const o = prop(name, this.mats);
        o.scale.setScalar(sc);
        top = o.getObjectByName('top') ?? null;
        obj = new THREE.Group();
        obj.add(o);
        if (f.kind === 'tele') { const ring = this.reg(glowQuad(this.tex.ring, NEON.magenta, 2, 2)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; obj.add(ring); }
      }
    }
    if (fig) obj = fig.root;
    const shadow = this.blob(f.w * 1.4);
    this.world.scene.add(obj!);
    if (f.spawned) { obj!.scale.setScalar(0.01); this.sparks.burst(f.x, f.y + 0.8, 0, NEON.magenta, 24, 6, 0.4, 0.6, 0); }
    return { f, fig, obj: obj!, top, shadow, sight: null, tellT: 0, last: '', dieT: 0, spin: 0 };
  }

  private dropFoe(v: FoeView): void {
    this.world.scene.remove(v.obj, v.shadow);
    v.shadow.geometry.dispose();
    (v.shadow.material as THREE.Material).dispose();
    if (v.sight) { this.world.scene.remove(v.sight); v.sight.geometry.dispose(); (v.sight.material as THREE.Material).dispose(); }
    v.fig?.dispose();
    if (v.fig) (v.fig as unknown as { flashMat: THREE.Material }).flashMat.dispose();
  }

  // ---------------------------------------------------------------- per frame

  sync(sim: Sim, dt: number): void {
    this.time += dt;
    const frozen = sim.hitStop > 0;
    const fdt = frozen ? 0 : dt;
    this.syncHero(sim, fdt, dt);
    this.syncFoes(sim, fdt, dt);
    this.syncShots(sim);
    this.syncPicks(sim, dt);
    this.syncProps(sim, dt);
    this.syncWorld(sim, dt);
    this.sparks.update(dt);
    this.puffs.update(dt);
    this.camera(sim, dt);
  }

  private syncHero(sim: Sim, dt: number, rdt: number): void {
    const p = sim.p, f = this.hero;
    f.root.position.set(p.x, p.y, 0.35);
    const want = p.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    f.root.rotation.y += (want - f.root.rotation.y) * Math.min(1, rdt * 22);
    const shooting = (p.shootT > 0 && p.state !== 'attack' && p.state !== 'roll' && p.state !== 'dead') || (p.state === 'attack' && p.atk?.kind === 'burst');
    f.setPart('sword', !shooting);
    let spin = 0, flip = 0;
    this.flipT -= dt;
    const run = MOVE.run;
    switch (p.state) {
      case 'dead': f.play('Death', { once: true, fade: 0.1 }); break;
      case 'win': f.play('Wave', { fade: 0.2 }); break;
      case 'hurt': f.play('HitRecieve', { once: true, speed: 1.8, fade: 0.05 }); break;
      case 'roll': f.play('Roll', { once: true, speed: f.clipLength('Roll') / MOVE.roll, fade: 0.05 }); break;
      case 'dash': f.play('Roll', { once: true, speed: 5, fade: 0.04 }); break;
      case 'attack': {
        const a = p.atk!;
        const def = ATTACKS[a.kind];
        const st = STYLE[a.kind] ?? {};
        const clip = st.clip ?? def.clip;
        if (st.hold !== undefined) f.pose(clip, st.hold, 0.05);
        else if (a !== this.lastAtk) f.play(clip, { once: true, restart: true, speed: f.clipLength(clip) * 0.8 / def.dur * (st.speed ?? 1), fade: 0.05, at: st.at });
        this.lastAtk = a;
        // the whole body's turn over the active part of the blow
        const k = Phaser.Math.Clamp((a.t - def.on * 0.5) / Math.max(0.05, Math.min(def.dur, def.off + 0.08) - def.on * 0.5), 0, 1);
        const ease = 1 - Math.pow(1 - k, 2);
        if (st.spin) spin = st.spin * ease;
        if (st.flip) flip = st.flip * ease;
        if (st.lean) flip += st.lean * (a.landed !== undefined ? Math.max(0, 1 - (a.t - a.landed) * 8) : 1);
        if (a.kind === 'dive' && Math.random() < 0.9) this.sparks.emit(p.x - p.face * 0.2, p.y + 0.8, 0.3, -p.face * 2, 3, 0, 0.3, 0.55, NEON.cyan, 0);
        if (a.kind === 'spin' && Math.random() < 0.8) { const ang = this.time * 30; this.sparks.emit(p.x + Math.cos(ang) * 1.5, p.y + 0.9, 0.3 + Math.sin(ang) * 0.5, Math.cos(ang) * 3, 0.5, 0, 0.25, 0.4, NEON.cyan, 0); }
        break;
      }
      case 'charge':
        if (p.chargeKind === 'iaido') { f.pose('Sword_Slash', 0.02); flip = 0.22; }
        else f.pose('Sword_Slash', 0.1);
        break;
      case 'slam': f.pose('Kick_Right', 0.35); break;
      default:
        if (shooting) {
          if (p.ground && Math.abs(p.vx) > 1) f.play('Run_Shoot', { speed: Math.abs(p.vx) / run * 1.2, fade: 0.06 });
          else f.play('Gun_Shoot', { fade: 0.05 });
        } else if (this.flipT > 0) f.play('Roll', { once: true, speed: 2.6, fade: 0.04 });
        else if (p.state === 'air') f.pose('Run', p.vy > 2 ? 0.12 : p.vy > -4 ? 0.3 : 0.62, 0.12);
        else if (p.state === 'wall') f.pose('HitRecieve_2', 0.25);
        else if (p.state === 'run') f.play('Run', { speed: Math.max(0.6, Math.abs(p.vx) / run * 1.25), fade: 0.1 });
        else f.play('Idle_Sword', { fade: 0.15 });
    }
    if (p.state !== 'attack') this.lastAtk = null;
    f.turn(spin * p.face, flip, HIP);
    // blink while invulnerable after a hit; a rim glow while charging
    f.root.visible = !(p.iframes > 0 && p.state !== 'roll' && p.state !== 'dash' && p.state !== 'attack' && Math.floor(this.time * 18) % 2 === 0 && sim.p.state !== 'dead');
    f.setGlow(p.state === 'charge' ? (p.charge >= 1 ? 0x802060 : 0x401030) : p.coolant > 0 ? 0x062a30 : 0);
    const chargeCol = p.chargeKind === 'iaido' ? (p.charge >= 1 ? 0xffffff : NEON.yellow) : p.charge >= 1 ? NEON.magenta : NEON.cyan;
    if (p.state === 'charge' && Math.random() < 0.6) this.sparks.emit(p.x + p.face * 0.5 + (Math.random() - 0.5), p.y + 0.4 + Math.random() * 1.2, 0.3, 0, 2 + Math.random() * 2, 0, 0.4, 0.25, chargeCol, -2);
    if (p.state === 'dash' && Math.random() < 0.9) this.sparks.emit(p.x, p.y + 0.7, 0, -p.face * 2, 0, 0, 0.3, 0.6, NEON.cyan, 0);
    if (p.state === 'run' && Math.random() < 0.08) this.puffs.emit(p.x - p.face * 0.3, p.y + 0.1, 0.2, -p.face * 0.5, 0.6, 0, 0.5, 0.5, 0x8a80c0, 0);
    f.update(dt);
    const gy = sim.groundBelow(p.x, p.y + 0.2);
    this.heroShadow.position.set(p.x, gy + 0.02, 0.1);
    this.heroShadow.rotation.x = -Math.PI / 2;
    const hgt = Math.max(0, p.y - gy);
    this.heroShadow.scale.setScalar(Math.max(0.3, 1 - hgt * 0.12));
    this.heroShadow.visible = p.state !== 'dead' && hgt < 8;
    const charging = p.state === 'charge';
    this.chargeRing.visible = charging;
    if (charging) {
      this.chargeRing.position.set(p.x, gy + 0.05, 0.1);
      this.chargeRing.scale.setScalar(0.4 + p.charge * 0.8 + (p.charge >= 1 ? Math.sin(this.time * 30) * 0.06 : 0));
      this.chargeRing.material.color.setHex(chargeCol);
    }
  }

  private syncFoes(sim: Sim, dt: number, rdt: number): void {
    const seen = new Set<number>();
    const camX = this.camX;
    for (const f of sim.foes) {
      seen.add(f.id);
      let v = this.foes.get(f.id);
      if (!v) { v = this.makeFoe(f); this.foes.set(f.id, v); }
      const far = Math.abs(f.x - camX) > 24 && f.kind !== 'boss';
      v.obj.visible = !far;
      v.shadow.visible = !far && f.state !== 'dead';
      if (far) continue;
      const sc = FOE_SCALE[f.kind];
      if (f.spawned && v.obj.scale.x < 1 && f.state !== 'dead') v.obj.scale.setScalar(Math.min(1, v.obj.scale.x + rdt * 2.5));
      v.obj.position.set(f.x, f.y, FOE_Z[f.kind] ?? 0);
      if (v.fig) {
        const want = f.face > 0 ? Math.PI / 2 : -Math.PI / 2;
        v.obj.rotation.y += (want - v.obj.rotation.y) * Math.min(1, rdt * 10);
        this.animFoe(v, f, dt);
        if (f.flash > 0.06) v.fig.flash(0.05, f.kind === 'boss' || f.kind === 'brute' ? 0.14 : 0.32);
        v.fig.update(dt);
      } else if (v.top) {
        // turrets turn their tops to the hero
        const ang = Math.atan2(sim.p.x - f.x, 0.001);
        v.top.rotation.y += (ang - v.top.rotation.y) * Math.min(1, rdt * 6);
      }
      // the death: sink, flash and burst
      if (f.state === 'dead') {
        v.dieT += rdt;
        if (v.dieT > 0.7 && !v.fig) v.obj.visible = false;
        if (v.fig && v.dieT > 1.1) v.obj.scale.setScalar(Math.max(0.01, 1 - (v.dieT - 1.1) * 2.5) * (f.spawned ? 1 : 1));
        if (v.fig && v.dieT > 1.1 && v.dieT - rdt <= 1.1) this.sparks.burst(f.x, f.y + f.h / 2, 0, NEON.orange, 26, 7, 0.4, 0.7, 6);
      }
      void sc;
      // brute armour and stun
      if (f.kind === 'brute' && f.state !== 'dead') {
        if (f.armour > 0 && Math.random() < 0.25) this.sparks.emit(f.x + (Math.random() - 0.5) * f.w * 1.3, f.y + Math.random() * f.h, 0.4, 0, 0.5, 0, 0.35, 0.3, NEON.cyan, 0);
        if (f.state === 'stun' && Math.random() < 0.5) this.sparks.emit(f.x + (Math.random() - 0.5), f.y + f.h + 0.2, 0.3, (Math.random() - 0.5) * 3, 2, 0, 0.4, 0.3, NEON.yellow, 4);
      }
      if (f.kind === 'boss' && f.state === 'vent' && Math.random() < 0.5) this.puffs.emit(f.x + (Math.random() - 0.5) * 2, f.y + 3, 0.3, (Math.random() - 0.5), 2.5, 0, 0.9, 1.4, 0xd0d0ff, -1);
      // the telegraphs: a red glow over the head, the sights
      const telling = f.state === 'tell' && f.move !== 'intro';
      if (telling && Math.random() < 0.5) this.sparks.emit(f.x, f.y + f.h + 0.4, 0.5, 0, 0, 0, 0.12, f.kind === 'boss' ? 1.8 : 0.9, NEON.red, 0);
      const aiming = (f.state === 'tell' && (f.move === 'aim' || f.move === 'dive' || f.move === 'volley') && f.aim) || (f.state === 'tell' && (f.move === 'laserLow' || f.move === 'laserHigh'));
      if (aiming) {
        if (!v.sight) { v.sight = beam(NEON.red, 0.6); this.world.scene.add(v.sight); }
        let ox = f.x + f.face * (f.kind === 'boss' ? 1.6 : 0.5), oy = f.y + (f.kind === 'boss' ? 2.4 : f.kind === 'gunner' ? 1.0 : FOE_SCALE[f.kind] > 1.2 ? 0.55 : 0.5);
        let tx = f.aim?.x ?? f.x, ty = f.aim?.y ?? f.y;
        if (f.move === 'laserLow' || f.move === 'laserHigh') {
          oy = f.y + (f.move === 'laserLow' ? 0.42 : 1.32);
          ty = oy;
          tx = f.face > 0 ? sim.W : 0;
          ox = f.x;
        }
        const dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy);
        v.sight.position.set((ox + tx) / 2, (oy + ty) / 2, 0.2);
        v.sight.rotation.z = Math.atan2(dy, dx);
        v.sight.scale.set(len, f.move?.startsWith('laser') ? 0.06 : 0.035, 1);
        v.sight.material.opacity = 0.35 + Math.abs(Math.sin(this.time * 30)) * 0.55;
        v.sight.visible = true;
      } else if (v.sight) v.sight.visible = false;
      // the blob shadow
      const gy = sim.groundBelow(f.x, f.y + 0.3);
      v.shadow.position.set(f.x, gy + 0.03, 0.05);
      v.shadow.rotation.x = -Math.PI / 2;
    }
    for (const [id, v] of this.foes) if (!seen.has(id)) { this.dropFoe(v); this.foes.delete(id); }
    // the boss's beam
    const b = sim.boss;
    if (b && b.state === 'act' && (b.move === 'laserLow' || b.move === 'laserHigh')) {
      const y = b.y + (b.move === 'laserLow' ? 0.42 : 1.32);
      const x0 = b.face > 0 ? b.x : 0, x1 = b.face > 0 ? sim.W : b.x;
      this.bossLaser.visible = true;
      this.bossLaser.position.set((x0 + x1) / 2, y, 0.3);
      this.bossLaser.scale.set(x1 - x0, 0.45 + Math.sin(this.time * 60) * 0.08, 1);
      if (Math.random() < 0.8) this.sparks.emit(x0 + Math.random() * (x1 - x0), y, 0.4, 0, (Math.random() - 0.5) * 3, 0, 0.25, 0.4, NEON.red, 0);
    } else this.bossLaser.visible = false;
  }

  private animFoe(v: FoeView, f: Foe, dt: number): void {
    const fig = v.fig!;
    const key = f.state + ':' + f.move;
    const changed = key !== v.last;
    v.last = key;
    void dt;
    switch (f.kind) {
      case 'walker': case 'gunner':
        if (f.state === 'dead') fig.play('Death', { once: true });
        else if (f.state === 'tell') fig.play(f.kind === 'walker' ? 'Jump' : 'Idle', { once: f.kind === 'walker', restart: changed, speed: f.kind === 'walker' ? 0.9 : 1.5 });
        else if (f.state === 'act') fig.play('Run', { speed: 1.6 });
        else if (f.state === 'recover' && f.kind === 'gunner' && changed) fig.play('Shoot', { once: true, restart: true });
        else if (f.state === 'stun' || f.flinch > 0) fig.play('Idle', { speed: 0.4 });
        else if (Math.abs(f.vx) > 0.3) fig.play('Walk', { speed: 1.5 });
        else fig.play('Idle');
        break;
      case 'drone': case 'gdrone':
        if (f.state === 'dead') fig.play('Dead', { once: true });
        else if (f.state === 'tell') fig.play(f.kind === 'drone' ? 'Attack' : 'Idle', { once: true, restart: changed });
        else if (f.state === 'act') fig.play('Run', { speed: 1.5 });
        else if (f.state === 'recover' && f.kind === 'gdrone' && changed) fig.play('Shoot', { once: true, restart: true });
        else fig.play(Math.abs(f.vx) > 1 ? 'Run' : 'Idle');
        break;
      case 'brute':
        if (f.state === 'dead') fig.play('Death', { once: true });
        else if (f.state === 'tell') fig.play('Attack', { once: true, restart: changed, speed: 0.75 });
        else if (f.state === 'act') { if (changed) fig.play('Attack.001', { once: true, restart: true, speed: 2 }); }
        else if (f.state === 'stun') fig.play('Idle', { speed: 0.25 });
        else if (Math.abs(f.vx) > 1.5) fig.play('Run');
        else if (Math.abs(f.vx) > 0.3) fig.play('Walk');
        else fig.play('Idle');
        break;
      case 'boss':
        if (f.state === 'dead') fig.play('Death', { once: true });
        else if (f.state === 'jump') fig.play('Jump', { once: true, restart: changed, speed: 0.8 });
        else if (f.state === 'tell') fig.play(f.move === 'volley' ? 'Shoot' : f.move === 'stomp' ? 'Jump' : f.move.startsWith('laser') ? 'Attack.001' : 'Attack', { once: true, restart: changed, speed: f.move === 'stomp' ? 0.5 : 0.6 });
        else if (f.state === 'act') { if (changed) fig.play(f.move === 'volley' ? 'Shoot' : 'Attack', { once: true, restart: true, speed: 1.4 }); }
        else if (f.state === 'vent') fig.play('Idle', { speed: 0.35 });
        else fig.play(Math.abs(f.vx) > 0.3 ? 'Walk' : 'Idle');
        fig.setGlow(f.state === 'vent' ? 0x401010 : 0);
        break;
    }
  }

  private syncShots(sim: Sim): void {
    const seen = new Set<number>();
    for (const s of sim.shots) {
      seen.add(s.id);
      let m = this.shots.get(s.id);
      if (!m) { m = this.makeShot(s); this.shots.set(s.id, m); }
      m.position.set(s.x, s.y, 0.1);
      if (s.kind !== 'shell') m.rotation.z = Math.atan2(s.vy, s.vx);
      else m.rotation.z += 0.3;
      if (Math.random() < 0.7) this.sparks.emit(s.x, s.y, 0.1, -s.vx * 0.05, -s.vy * 0.05, 0, 0.18, s.kind === 'crescent' || s.kind === 'heavy' || s.kind === 'mirror' ? 0.9 : 0.4, s.kind === 'mirror' ? NEON.yellow : s.hero ? (s.kind === 'heavy' ? NEON.magenta : NEON.cyan) : s.kind === 'shell' ? NEON.yellow : NEON.orange, 0);
    }
    for (const [id, m] of this.shots) if (!seen.has(id)) { this.world.scene.remove(m); this.shots.delete(id); }
  }

  /** Shared pieces of every bolt (no allocation per shot). */
  private shotKit: { quad: THREE.PlaneGeometry; glow: Record<number, THREE.MeshBasicMaterial>; crescent: THREE.MeshBasicMaterial } | null = null;

  private makeShot(s: Shot): THREE.Mesh {
    if (!this.shotKit) {
      const add = (map: THREE.Texture, color: number) => new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      this.shotKit = { quad: new THREE.PlaneGeometry(1, 1), glow: {}, crescent: add(this.tex.slash, NEON.cyan) };
      for (const c of [NEON.magenta, NEON.cyan, NEON.yellow, NEON.red, 0xffffff]) this.shotKit.glow[c] = add(this.tex.glow, c);
      this.owned.push(this.shotKit.quad, this.shotKit.crescent, ...Object.values(this.shotKit.glow));
    }
    const k = this.shotKit;
    // a glowing streak along the flight with a white-hot core (the cleave's crescent: an arc)
    const col = s.kind === 'mirror' ? NEON.yellow : s.hero ? (s.kind === 'heavy' ? NEON.magenta : NEON.cyan) : s.kind === 'shell' ? NEON.yellow : NEON.red;
    let m: THREE.Mesh;
    if (s.kind === 'crescent') {
      m = new THREE.Mesh(k.quad, k.crescent);
      m.scale.set(2.4, 2.4, 1);
    } else {
      m = new THREE.Mesh(k.quad, k.glow[col]);
      const [len, th] = s.kind === 'heavy' ? [2.0, 0.9] : s.kind === 'mirror' ? [2.2, 0.75] : s.kind === 'shell' ? [0.8, 0.8] : s.kind === 'foeBolt' ? [1.0, 0.55] : [1.5, 0.42];
      m.scale.set(len, th, 1);
      const core = new THREE.Mesh(k.quad, k.glow[0xffffff]);
      core.scale.set(0.55, 0.3, 1);
      core.renderOrder = 7;
      m.add(core);
    }
    m.renderOrder = 6;
    this.world.scene.add(m);
    return m;
  }

  private syncPicks(sim: Sim, dt: number): void {
    const seen = new Set<number>();
    for (const k of sim.picks) {
      seen.add(k.id);
      let v = this.picks.get(k.id);
      if (!v) { v = this.makePick(k); this.picks.set(k.id, v); }
      const far = Math.abs(k.x - this.camX) > 22;
      v.obj.visible = !far;
      if (far) continue;
      v.obj.position.set(k.x, k.y + (k.loose ? 0 : Math.sin(this.time * 3 + k.id) * 0.12), 0);
      v.obj.rotation.y += dt * (k.kind === 'gear' ? 3 : 1.6);
      if (k.kind === 'chip' && Math.random() < 0.08) this.sparks.emit(k.x + (Math.random() - 0.5) * 0.6, k.y, 0.2, 0, 1.2, 0, 0.6, 0.25, NEON.lime, 0);
    }
    for (const [id, v] of this.picks) if (!seen.has(id)) { this.world.scene.remove(v.obj); this.picks.delete(id); }
  }

  private syncProps(sim: Sim, dt: number): void {
    for (const p of sim.props) {
      const v = this.props.get(p.id);
      if (!v) continue;
      switch (p.kind) {
        case 'lever':
          if (v.top) v.top.rotation.x += ((p.on ? -0.9 : 0.6) - v.top.rotation.x) * Math.min(1, dt * 10);
          if (v.ring) { v.ring.visible = !p.on; v.ring.material.opacity = 0.4 + Math.sin(this.time * 6) * 0.3; }
          break;
        case 'lootbox':
          if (p.on && v.top) { v.top.position.y += (1.4 - v.top.position.y) * Math.min(1, dt * 8); v.top.rotation.x += (-1.6 - v.top.rotation.x) * Math.min(1, dt * 8); }
          break;
        case 'barrel':
          if (v.ring) { const fuse = p.on && p.t > 0; v.ring.material.opacity = fuse ? (Math.floor(this.time * 20) % 2 ? 1 : 0.2) : 0.35 + Math.sin(this.time * 4) * 0.2; v.ring.scale.setScalar(fuse ? 1.6 : 1); }
          if (p.on && p.t < 0 && !v.done) { v.done = true; v.obj.visible = false; }
          break;
        case 'checkpoint':
          if (v.ring) { v.ring.material.color.setHex(p.on ? NEON.cyan : NEON.magenta); v.ring.rotation.z += dt * (p.on ? 3 : 1); v.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.08); }
          if (v.beam) { v.beam.material.color.setHex(p.on ? NEON.cyan : NEON.magenta); v.beam.material.opacity = 0.3 + Math.sin(this.time * 3) * 0.15; }
          break;
        case 'exit':
          v.obj.visible = true;
          if (v.beam) { v.beam.visible = sim.exitOpen; v.beam.material.opacity = 0.55 + Math.sin(this.time * 5) * 0.2; }
          if (v.ring) { v.ring.visible = sim.exitOpen; v.ring.rotation.z += dt * 2; v.ring.position.y = 1 + (this.time * 1.6) % 4; v.ring.material.opacity = 1 - ((this.time * 1.6) % 4) / 4; }
          if (sim.exitOpen && Math.random() < 0.25) this.sparks.emit(p.x + (Math.random() - 0.5) * 1.6, p.y + 0.2, 0.2, 0, 4 + Math.random() * 3, 0, 0.9, 0.3, NEON.cyan, -1);
          break;
      }
    }
  }

  private syncWorld(sim: Sim, dt: number): void {
    // hazards
    for (const hv of this.hazards) {
      const h = hv.h;
      const core = hv.core;
      const near = Math.abs(h.x - this.camX) < 22;
      if (!near) continue;
      const [x0, y0, x1, y1] = hazardBox(h);
      const cx = (x0 + x1) / 2;
      if (h.kind === 'steam') {
        if (h.phase === 'warn' && Math.random() < 0.4) this.puffs.emit(cx, y0 + 0.2, 0.2, (Math.random() - 0.5) * 0.6, 1.5, 0, 0.5, 0.5, 0xc0c0ff, 0);
        if (h.phase === 'on') for (let k = 0; k < 2; k++) this.puffs.emit(cx + (Math.random() - 0.5) * 0.4, y0 + 0.2, 0.2, (Math.random() - 0.5) * 1.2, 7 + Math.random() * 3, 0, 0.45, 1.1, 0xe8e8ff, 0);
      } else {
        const on = h.phase === 'on', warn = h.phase === 'warn';
        core.material.opacity = on ? 0.75 + Math.random() * 0.25 : warn ? (Math.random() < 0.5 ? 0.4 : 0.1) : 0.1;
        core.scale.x = h.kind === 'laser' ? (on ? 0.22 : 0.06) : on ? 0.2 + Math.random() * 0.15 : 0.1;
        if ((on || (warn && Math.random() < 0.3)) && Math.random() < 0.7) this.sparks.emit(cx + (Math.random() - 0.5) * 0.3, y0 + Math.random() * (y1 - y0), 0.3, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0, 0.18, 0.35, h.kind === 'laser' ? 0xff2a6a : 0x9ffcff, 0);
      }
    }
    // falling ledges
    for (const f of sim.fallers) {
      const g = this.fallers.get(f.id);
      if (!g) continue;
      g.visible = f.state !== 'gone';
      const shake = f.state === 'shake' ? (Math.random() - 0.5) * 0.08 : 0;
      g.position.set(f.x0 + shake, f.y + 1 + f.dy, 0);
      const strip = g.children[1] as Quad;
      strip.material.opacity = f.state === 'shake' ? (Math.floor(this.time * 16) % 2 ? 1 : 0.2) : 0.7;
    }
    // doors slide up, bridges drop in
    for (const gt of sim.gates) {
      const g = this.gates.get(gt.id);
      if (!g) continue;
      if (gt.kind === 'door') {
        const k = Math.min(1, gt.t / 0.7);
        g.position.y = gt.y0 + (gt.open ? k * (gt.y1 - gt.y0 + 0.2) : 0);
        const lamp = g.getObjectByName('lamp') as Quad | undefined;
        if (lamp) lamp.material.color.setHex(gt.open ? NEON.lime : NEON.red);
      } else {
        g.visible = gt.open;
        if (gt.open) {
          const k = Math.min(1, gt.t / 0.6);
          const e = 1 - Math.pow(1 - k, 3);
          g.position.y = gt.y1 + (1 - e) * 9;
        }
      }
    }
    // marks on the ground (cannon shells and the boss's barrage): a ring and a line from the sky
    const seen = new Set<number>();
    for (const m of sim.marks) {
      seen.add(m.id);
      let v = this.marks.get(m.id);
      if (!v) {
        const ring = glowQuad(this.tex.ring, NEON.red, m.r * 2, m.r * 2);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(m.x, m.y + 0.06, 0);
        const line = beam(NEON.red, 0.4);
        line.scale.set(0.05, 14, 1);
        line.position.set(m.x, m.y + 7, 0.1);
        this.world.scene.add(ring, line);
        v = { ring, line };
        this.marks.set(m.id, v);
      }
      const pulse = 0.5 + Math.abs(Math.sin(this.time * (m.t < 0.4 ? 30 : 12))) * 0.5;
      v.ring.material.opacity = pulse;
      (v.line.material as THREE.MeshBasicMaterial).opacity = pulse * 0.4;
      v.ring.scale.setScalar(0.7 + Math.min(1, m.t) * 0.5);
    }
    for (const [id, v] of this.marks) if (!seen.has(id)) { this.world.scene.remove(v.ring, v.line); v.ring.geometry.dispose(); v.ring.material.dispose(); v.line.geometry.dispose(); (v.line.material as THREE.Material).dispose(); this.marks.delete(id); }
    // shockwaves
    const wseen = new Set<number>();
    for (const w of sim.waves) {
      wseen.add(w.id);
      let m = this.waves.get(w.id);
      if (!m) { m = glowQuad(this.tex.ring, w.hero ? NEON.cyan : NEON.orange, 1.6, 1.0); this.world.scene.add(m); this.waves.set(w.id, m); }
      m.position.set(w.x, w.y + 0.35, 0.3);
      if (Math.random() < 0.9) this.sparks.emit(w.x, w.y + 0.1, 0.3, -w.dir * 1.5, 3 + Math.random() * 3, 0, 0.35, 0.4, w.hero ? NEON.cyan : NEON.orange, 10);
    }
    for (const [id, m] of this.waves) if (!wseen.has(id)) { this.world.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.waves.delete(id); }
    // the iaido's streak fades
    if (this.streak.visible) { this.streak.material.opacity -= dt * 2.6; this.streak.scale.y *= 1 - dt * 3; if (this.streak.material.opacity <= 0) this.streak.visible = false; }
    // slash arcs fade
    for (const s of this.slashes) if (s.visible) { s.material.opacity -= dt * 6; s.scale.multiplyScalar(1 + dt * 1.5); if (s.material.opacity <= 0) s.visible = false; }
    // blinking signs and the city
    const t = this.time;
    this.mats.signB.color.setScalar(Math.sin(t * 7.3) > -0.6 ? (Math.sin(t * 31) > 0.85 ? 0.3 : 1) : 0.15);
    this.mats.signC.color.setScalar(((t * 0.7) % 3) < 2.4 ? 1 : (Math.floor(t * 12) % 2 ? 1 : 0.1));
    for (const c of this.cars) {
      c.m.position.x += c.v * dt;
      if (c.m.position.x < this.camX - 90) c.m.position.x += 180;
      if (c.m.position.x > this.camX + 90) c.m.position.x -= 180;
    }
    this.shotFlash -= dt;
  }

  // ---------------------------------------------------------------- the camera

  private camera(sim: Sim, dt: number): void {
    const p = sim.p;
    const cam = this.world.camera;
    const look = p.state === 'dead' ? 0 : p.face * 2.0 + p.vx * 0.1;
    let tx = p.x + look + this.offsetX;
    const half = 8 * this.zoom;
    if (sim.L.boss) tx = Phaser.Math.Clamp((p.x + (sim.boss?.x ?? p.x)) / 2, half, Math.max(half, sim.W - half));
    tx = Phaser.Math.Clamp(tx, half - 1, Math.max(half - 1, sim.W - half + 1));
    this.camX += (tx - this.camX) * Math.min(1, dt * 3.6);
    // vertical: follow the ground the hero stands on, and big jumps or falls
    let ty = this.camY;
    if (p.ground || p.state === 'wall') ty = p.y;
    // up in the air (a launcher, a juggle, a double jump): follow sooner, so the hero stays in frame
    else if (p.y > this.camY + 1.8) ty = p.y - 1.8;
    else if (p.y < this.camY - 1.5) ty = p.y + 1.5;
    if (sim.L.boss) ty = Math.max(ty, 5.4);
    this.camY += (Math.max(2.5, ty) - this.camY) * Math.min(1, dt * 3);
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * Math.min(1, this.shakeT * 6);
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
    }
    const z = CAM_Z * this.zoom * (sim.L.boss ? 1.14 : 1);
    cam.position.set(this.camX + sx, this.camY + 2.6 + sy, z);
    cam.lookAt(this.camX + sx * 0.5, this.camY + 1.25 + sy * 0.5, 0);
    this.sky.position.set(this.camX, this.camY + 36, -170);
    this.moon.position.set(this.camX * 0.92 + 26, this.camY + 22, -160);
  }

  /** Puts the camera on its target at once (after a jump ahead). */
  snap(sim: Sim): void {
    this.camX = sim.p.x + sim.p.face * 2;
    this.camY = sim.p.y;
    this.camera(sim, 1);
  }

  shake(a: number, t = 0.25): void {
    if (a >= this.shakeA * Math.min(1, this.shakeT * 6)) { this.shakeA = a; this.shakeT = t; }
  }

  /** Game pixels of a world point. */
  screen(x: number, y: number, z = 0): { x: number; y: number } {
    const s = this.world.toScreen(new THREE.Vector3(x, y, z));
    return { x: s.x, y: s.y };
  }

  // ---------------------------------------------------------------- one-shot effects

  handle(e: SimEvent, sim: Sim): void {
    const p = sim.p;
    const sp = this.sparks;
    switch (e.type) {
      case 'jump':
        if (e.air) { this.flipT = 0.32; sp.burst(p.x, p.y, 0, NEON.cyan, 10, 4, 0.35, 0.35, 0); }
        else this.puffs.burst(p.x, p.y + 0.1, 0.2, 0x9a90d0, 5, 1.5, 0.6, 0.45, 0);
        if (e.wall) sp.burst(p.x, p.y + 0.8, 0, NEON.violet, 10, 5, 0.35, 0.35, 2);
        break;
      case 'land': this.puffs.burst(p.x, p.y + 0.1, 0.2, 0x9a90d0, e.hard ? 10 : 5, e.hard ? 3 : 1.6, 0.7, 0.5, 0); if (e.hard) this.shake(0.12, 0.12); break;
      case 'roll': this.puffs.burst(p.x, p.y + 0.1, 0.2, 0x9a90d0, 6, 2, 0.6, 0.4, 0); break;
      case 'dash': sp.burst(p.x, p.y + 0.7, 0, NEON.cyan, 16, 5, 0.4, 0.3, 0); this.shake(0.08, 0.1); break;
      case 'swing': {
        if (e.kind === 'slam') break;
        const def = ATTACKS[e.kind];
        const big = e.kind === 'slash' || e.kind === 'cleave' || e.kind === 'lunge' || e.kind === 'air3' || e.kind === 'spin' || e.kind === 'rise';
        const color = e.kind === 'cleave' || e.kind === 'air3' ? NEON.magenta : e.kind === 'rise' ? NEON.yellow : e.kind === 'punch' || e.kind === 'kick' || e.kind === 'air2' ? NEON.violet : e.kind === 'iaido' ? 0xffffff : NEON.cyan;
        const r = (big ? 1.4 : 0.9) * (def.reach / 2);
        const arc = (x: number, y: number, sx: number, sy: number, rot: number, col = color, op = big ? 1 : 0.7): void => {
          const s = this.slashes.find((q) => !q.visible) ?? this.slashes[0];
          s.material.color.setHex(col);
          s.material.opacity = op;
          s.visible = true;
          s.scale.set(sx, sy, 1);
          s.position.set(x, y, 0.4);
          s.rotation.z = rot;
        };
        switch (e.kind) {
          case 'spin':
            // a ring of blade light all round the hero
            arc(p.x + p.face * 0.7, p.y + 0.9, p.face * 1.3, 1.1, 0);
            arc(p.x - p.face * 0.7, p.y + 0.9, -p.face * 1.3, 1.1, Math.PI, NEON.violet);
            sp.burst(p.x, p.y + 0.9, 0.3, NEON.cyan, 18, 7, 0.35, 0.35, 0);
            break;
          case 'rise':
            // an upward crescent and a column of sparks
            arc(p.x + p.face * 0.7, p.y + 1.4, p.face * 1.15, 1.35, p.face * 0.85);
            for (let i = 0; i < 14; i++) sp.emit(p.x + p.face * (0.6 + Math.random() * 0.8), p.y + Math.random() * 0.6, 0.3, (Math.random() - 0.5) * 2, 8 + Math.random() * 6, 0, 0.45, 0.4, i % 2 ? NEON.yellow : 0xffffff, 6);
            break;
          case 'air3':
            arc(p.x + p.face * 0.9, p.y + 0.8, p.face * 1.5, 1.5, -p.face * 0.5, NEON.magenta, 1);
            sp.burst(p.x + p.face * 0.8, p.y + 0.8, 0.3, NEON.magenta, 20, 7, 0.4, 0.35, -6);
            break;
          case 'dive':
            arc(p.x + p.face * 0.7, p.y + 0.4, p.face * 1.2, 1.0, -p.face * 0.8, NEON.cyan, 0.9);
            break;
          case 'iaido': {
            // a white streak along the whole dash, a flash at the start
            const x0 = p.x, x1 = p.x + p.face * IAIDO_DIST;
            this.streak.visible = true;
            this.streak.material.color.setHex(0xffffff);
            this.streak.material.opacity = 1;
            this.streak.position.set((x0 + x1) / 2, p.y + 1.0, 0.5);
            this.streak.rotation.z = 0;
            this.streak.scale.set(IAIDO_DIST + 1, 0.16, 1);
            sp.burst(p.x, p.y + 1, 0.4, 0xffffff, 26, 9, 0.35, 0.3, 0);
            this.shake(0.15, 0.1);
            break;
          }
          case 'burst':
            for (let i = 0; i < 26; i++) { const a = (Math.random() - 0.5) * 0.8; sp.emit(p.x + p.face * 1, p.y + 0.95, 0.3, Math.cos(a) * p.face * (8 + Math.random() * 10), Math.sin(a) * 9, 0, 0.3, 0.45, i % 3 ? NEON.magenta : 0xffffff, 0); }
            this.shake(0.2, 0.15);
            break;
          default:
            arc(p.x + p.face * def.reach * 0.45, p.y + 0.9, p.face * r * 1.6, r * 1.6, e.kind === 'kick' || e.kind === 'air2' ? -0.6 * p.face : e.kind === 'punch' ? 0.2 * p.face : 0);
        }
        break;
      }
      case 'charge': if (e.kind === 'iaido') sp.burst(p.x, p.y + 0.9, 0.3, NEON.yellow, 14, 3, 0.3, 0.4, 0); break;
      case 'reflect': {
        sp.burst(e.x, e.y, 0.5, NEON.yellow, 30, 9, 0.45, 0.4, 0);
        sp.burst(e.x, e.y, 0.5, 0xffffff, 12, 5, 0.6, 0.2, 0);
        const s = this.slashes.find((q) => !q.visible) ?? this.slashes[0];
        s.material.color.setHex(NEON.yellow); s.material.opacity = 1; s.visible = true;
        s.scale.set(0.75, 0.75, 1); s.position.set(e.x, e.y, 0.5); s.rotation.z = Math.random() * 6;
        this.shake(0.18, 0.12);
        break;
      }
      case 'launch': {
        const f = e.foe;
        for (let i = 0; i < 18; i++) sp.emit(f.x + (Math.random() - 0.5) * f.w, f.y + Math.random() * 0.4, 0.3, (Math.random() - 0.5) * 2, 6 + Math.random() * 8, 0, 0.5, 0.45, i % 2 ? NEON.yellow : NEON.cyan, 8);
        this.puffs.burst(f.x, f.y + 0.1, 0.2, 0x9a90d0, 6, 2, 0.6, 0.5, 0);
        break;
      }
      case 'cut': {
        // the delayed iaido cut: a white X on the foe, a burst, a hard shake
        for (const rot of [0.7, -0.7]) {
          const s = this.slashes.find((q) => !q.visible) ?? this.slashes[0];
          s.material.color.setHex(0xffffff); s.material.opacity = 1; s.visible = true;
          s.scale.set(1.0, 1.0, 1); s.position.set(e.x, e.y, 0.6); s.rotation.z = rot;
        }
        sp.burst(e.x, e.y, 0.5, 0xffffff, 30, 10, 0.4, 0.45, 2);
        sp.burst(e.x, e.y, 0.5, NEON.yellow, 16, 7, 0.35, 0.5, 6);
        this.shake(0.4, 0.22);
        break;
      }
      case 'diveLand':
        sp.burst(e.x + p.face * 0.6, e.y + 0.1, 0.4, NEON.cyan, 26, 8, 0.4, 0.35, 8);
        this.puffs.burst(e.x, e.y + 0.1, 0.2, 0x9a90d0, 10, 3, 0.8, 0.5, 0);
        this.shake(0.3, 0.18);
        break;
      case 'crash':
        sp.burst(e.x, e.y + 0.2, 0.4, NEON.magenta, 28, 8, 0.4, 0.4, 8);
        this.puffs.burst(e.x, e.y + 0.1, 0.2, 0x9a90d0, 10, 3, 0.9, 0.6, 0);
        this.shake(0.35, 0.2);
        break;
      case 'implant': sp.burst(e.x, e.y + 1.4, 0.3, NEON.violet, 36, 6, 0.45, 0.8, -2); break;
      case 'chargeReady': sp.burst(p.x, p.y + 0.9, 0.3, NEON.magenta, 22, 6, 0.4, 0.4, 0); break;
      case 'shoot': {
        sp.burst(e.x, e.y, 0.2, e.heavy ? NEON.magenta : NEON.cyan, e.heavy ? 14 : 6, e.heavy ? 6 : 3.5, 0.35, 0.18, 0);
        this.shotFlash = 0.05;
        break;
      }
      case 'overheat': for (let i = 0; i < 12; i++) this.puffs.emit(p.x + p.face * 0.5, p.y + 1, 0.3, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, 0, 0.8, 0.8, 0xffd0c0, -1); break;
      case 'hit': {
        const f = e.foe;
        const col = e.big ? NEON.cyan : 0xffffff;
        sp.burst(e.x, e.y, 0.4, col, e.big ? 22 : 10, e.big ? 9 : 6, e.big ? 0.45 : 0.32, 0.4, 8);
        sp.burst(e.x, e.y, 0.4, NEON.orange, e.big ? 8 : 4, 5, 0.25, 0.5, 14);
        if (e.big) this.shake(0.22, 0.18);
        void f;
        break;
      }
      case 'armour': sp.burst(e.foe.x, e.foe.y + e.foe.h * 0.6, 0.4, e.broken ? NEON.yellow : NEON.cyan, e.broken ? 40 : 6, e.broken ? 10 : 4, 0.4, 0.6, 6); if (e.broken) this.shake(0.3, 0.25); break;
      case 'kill': {
        const f = e.foe;
        sp.burst(f.x, f.y + f.h / 2, 0.4, NEON.orange, f.kind === 'boss' ? 80 : 30, f.kind === 'boss' ? 14 : 8, 0.5, 0.7, 6);
        sp.burst(f.x, f.y + f.h / 2, 0.4, 0xffffff, 12, 5, 0.6, 0.25, 0);
        this.puffs.burst(f.x, f.y + f.h / 2, 0.3, 0x605878, 6, 2, 1.2, 0.8, -1);
        this.shake(f.kind === 'boss' ? 0.8 : f.kind === 'brute' ? 0.35 : 0.15, f.kind === 'boss' ? 0.8 : 0.2);
        break;
      }
      case 'parry': sp.burst(e.x, e.y, 0.4, NEON.yellow, 10, 6, 0.3, 0.3, 4); break;
      case 'tell': if (e.foe.kind === 'tele') sp.burst(e.foe.x, e.foe.y + 0.5, 0.3, NEON.magenta, 30, 3, 0.5, 1.0, -4); break;
      case 'foeFire':
        if (e.move === 'slam' || e.move === 'stompLand') this.shake(e.move === 'stompLand' ? 0.6 : 0.3, 0.3);
        if (e.move === 'stomp') this.puffs.burst(e.foe.x, e.foe.y + 0.2, 0.3, 0x9088c0, 12, 4, 1.2, 0.6, 0);
        break;
      case 'hurt': sp.burst(e.x, e.y, 0.5, NEON.red, 20, 7, 0.4, 0.45, 6); this.shake(0.35, 0.25); this.hero.flash(0.15); break;
      case 'blocked': sp.burst(e.x, e.y, 0.5, NEON.cyan, 26, 7, 0.4, 0.4, 0); break;
      case 'die': sp.burst(p.x, p.y + 0.8, 0.4, NEON.magenta, 40, 8, 0.5, 0.8, 4); this.shake(0.5, 0.4); break;
      case 'respawn': sp.burst(p.x, p.y + 0.8, 0.3, NEON.cyan, 40, 5, 0.45, 0.8, -3); break;
      case 'pit': this.shake(0.3, 0.2); break;
      case 'pickup': sp.burst(e.x, e.y, 0.3, e.kind === 'gear' ? NEON.orange : e.kind === 'heart' ? NEON.red : NEON.lime, e.kind === 'gear' ? 6 : 18, 4, 0.3, 0.35, 0); break;
      case 'chip': sp.burst(e.x, e.y, 0.3, NEON.lime, 40, 7, 0.45, 0.7, 0); this.shake(0.12, 0.12); break;
      case 'checkpoint': sp.burst(e.x, e.y + 1.4, 0.3, NEON.cyan, 40, 6, 0.45, 0.8, -2); break;
      case 'lever': sp.burst(e.x, e.y + 0.6, 0.3, NEON.yellow, 20, 5, 0.35, 0.5, 4); break;
      case 'gate': if (e.gate.kind === 'bridge') sp.burst((e.gate.x0 + e.gate.x1) / 2, e.gate.y1, 0.3, NEON.cyan, 30, 6, 0.4, 0.6, 4); break;
      case 'loot': sp.burst(e.x, e.y + 0.6, 0.3, NEON.orange, 24, 6, 0.35, 0.6, 6); break;
      case 'boom': {
        sp.burst(e.x, e.y, 0.5, NEON.orange, Math.round(26 * e.r), 9 * e.r * 0.6, 0.6, 0.6, 4);
        sp.burst(e.x, e.y, 0.5, NEON.yellow, Math.round(12 * e.r), 5 * e.r * 0.6, 1.2, 0.3, 0);
        this.puffs.burst(e.x, e.y, 0.4, 0x505068, 10, 3, 1.6, 1.0, -1.5);
        this.shake(Math.min(0.6, 0.18 * e.r), 0.3);
        break;
      }
      case 'slamLand': sp.burst(e.x, e.y + 0.2, 0.4, NEON.orange, 30, 8, 0.45, 0.4, 8); this.shake(0.45, 0.3); break;
      case 'wave': sp.burst(e.x, e.y + 1, 0.3, NEON.cyan, 16, 6, 0.4, 0.3, 0); break;
      case 'spawn': sp.burst(e.foe.x, e.foe.y + 0.8, 0.3, NEON.magenta, 30, 5, 0.45, 0.7, -2); break;
      case 'bossDown': for (let i = 0; i < 5; i++) sp.burst(e.x + (Math.random() - 0.5) * 3, e.y + Math.random() * 4, 0.4, [NEON.orange, NEON.yellow, NEON.magenta][i % 3], 40, 10, 0.6, 1.0, 4); this.shake(1, 1); break;
      case 'clear': sp.burst(p.x, p.y + 1, 0.3, NEON.cyan, 60, 8, 0.5, 1.0, -2); break;
      case 'heal': sp.burst(p.x, p.y + 0.9, 0.3, NEON.lime, 20, 4, 0.35, 0.6, -3); break;
      case 'coolant': sp.burst(p.x, p.y + 0.9, 0.3, NEON.cyan, 20, 4, 0.35, 0.6, -3); break;
      case 'secondHeart': sp.burst(p.x, p.y + 0.9, 0.3, NEON.yellow, 50, 7, 0.45, 0.8, -2); break;
    }
  }

  dispose(): void {
    this.clearLevel();
    this.hero.dispose();
    for (const v of this.foes.values()) v.fig?.dispose();
  }
}
