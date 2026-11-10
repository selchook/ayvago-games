// Builds a level in three.js: the board (floor, walls, holes merged into a few meshes), its
// pieces (gems, keys, switches, gates, bumpers, jump pads, platforms, checkpoints, the goal),
// the marble and the scenery around and below the board. `sync()` moves everything to the
// simulation's state each frame.
import { THREE } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { R, T, type ParsedLevel, type Sim, type Dir } from './sim';
import { mats, marbleMat, prop, type Theme } from './look';

export const CHANNEL_COLORS = [0xff4f6d, 0x3ea2ff, 0x5dd65d];
const FLOOR_T = 0.3;
const WALL_H = 0.55;
const HOLE_R = 0.43;

const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** Studio reflections for the glass marble and the gems (made once per renderer). */
export function envMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  let t = envCache.get(renderer);
  if (!t) {
    const pm = new THREE.PMREMGenerator(renderer);
    t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    envCache.set(renderer, t);
  }
  return t;
}

/** Deterministic random numbers for decoration. */
function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Prepares a geometry for merging: moved into place, non-indexed, with a vertex colour. */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4, tint: number, uvRot = 0): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(tint);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvRot) {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      let u = uv.getX(i) - 0.5, v = uv.getY(i) - 0.5;
      for (let k = 0; k < uvRot; k++) [u, v] = [-v, u];
      uv.setXY(i, u + 0.5, v + 0.5);
    }
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

let gemMaterial: THREE.MeshPhysicalMaterial | null = null;
/** Cut-glass cyan for every gem (the kit's jewel is yellow; the HUD's gem is cyan). */
function gemMat(env: THREE.Texture | null): THREE.MeshPhysicalMaterial {
  gemMaterial ??= new THREE.MeshPhysicalMaterial({ color: 0x45dfff, emissive: 0x0a6f9a, emissiveIntensity: 0.45, roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true });
  if (env && gemMaterial.envMap !== env) { gemMaterial.envMap = env; gemMaterial.needsUpdate = true; }
  return gemMaterial;
}

let islandMat: THREE.MeshLambertMaterial | null = null;

const DIR_ROT: Record<Dir, number> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };

interface Piece { obj: THREE.Object3D; x: number; y: number; phase: number }

export class Board3D {
  /** Rotated by the tilt around the camera's focus; the board sits inside it. */
  readonly pivot = new THREE.Group();
  readonly board = new THREE.Group();
  readonly marble: THREE.Mesh;
  /** A soft glow ring under the marble on dark worlds and a light for the goal. */
  readonly goalRing: THREE.Mesh;
  private geos: THREE.BufferGeometry[] = [];
  private ownMats: THREE.Material[] = [];
  gems: Piece[] = [];
  keys: Piece[] = [];
  checkpoints: { ring: THREE.Mesh; flag: THREE.Object3D; mat: THREE.MeshStandardMaterial }[] = [];
  switches: { cap: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  gates: { obj: THREE.Group; ch: number; open: number }[] = [];
  bumpers: { obj: THREE.Object3D; hit: number }[] = [];
  pads: { obj: THREE.Object3D; hit: number }[] = [];
  movers: THREE.Mesh[] = [];
  private goalMat: THREE.MeshStandardMaterial;
  private water: THREE.Mesh | null = null;
  private clouds: THREE.Object3D[] = [];
  private last = { x: 0, y: 0 };

  constructor(readonly scene: THREE.Scene, readonly L: ParsedLevel, readonly th: Theme, env: THREE.Texture | null, seed: number) {
    this.pivot.add(this.board);
    scene.add(this.pivot);
    const M = mats(th);
    const rnd = seeded(seed + 1);

    // ------------------------------------------------ floor, walls and holes (merged)
    const lists: Record<string, THREE.BufferGeometry[]> = { floor: [], wall: [], bridge: [], ice: [], sand: [], rim: [], tube: [] };
    const tile = new THREE.BoxGeometry(1, FLOOR_T, 1);
    const plank = new THREE.BoxGeometry(1, FLOOR_T * 0.6, 0.98);
    const wallGeo = new RoundedBoxGeometry(0.98, WALL_H + FLOOR_T, 0.98, 2, 0.07);
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5); shape.lineTo(0.5, -0.5); shape.lineTo(0.5, 0.5); shape.lineTo(-0.5, 0.5); shape.lineTo(-0.5, -0.5);
    const hole = new THREE.Path();
    hole.absarc(0, 0, HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const holeTile = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_T, bevelEnabled: false, curveSegments: 20 });
    holeTile.rotateX(-Math.PI / 2);   // extruded along +z → now up along +y, from 0 to FLOOR_T
    holeTile.translate(0.5, -FLOOR_T, 0.5);
    // the extrude UVs are the shape's x/y in -0.5..0.5: move them into 0..1
    const huv = holeTile.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) + 0.5, huv.getY(i) + 0.5);
    const rimGeo = new THREE.TorusGeometry(HOLE_R, 0.035, 8, 28);
    rimGeo.rotateX(Math.PI / 2);
    const tubeGeo = new THREE.CylinderGeometry(HOLE_R, HOLE_R, 0.9, 24, 1, true);
    const tubeEnd = new THREE.CircleGeometry(HOLE_R, 24);
    tubeEnd.rotateX(-Math.PI / 2);
    const mtx = new THREE.Matrix4();
    const at = (x: number, y: number, z: number) => mtx.makeTranslation(x, y, z);
    const tint = () => new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rnd() * 0.12).getHex();
    for (let cy = 0; cy < L.h; cy++) {
      for (let cx = 0; cx < L.w; cx++) {
        const t = L.tiles[cy * L.w + cx];
        const x = cx + 0.5, z = cy + 0.5;
        const rot = (rnd() * 4) | 0;
        if (t === T.WALL) lists.wall.push(bake(wallGeo, at(x, (WALL_H - FLOOR_T) / 2, z), tint(), rot));
        else if (t === T.FLOOR || t === T.GATE) lists.floor.push(bake(tile, at(x, -FLOOR_T / 2, z), tint(), rot));
        else if (t === T.BRIDGE) lists.bridge.push(bake(plank, at(x, -FLOOR_T * 0.3, z), tint(), 0));
        else if (t === T.ICE) lists.ice.push(bake(tile, at(x, -FLOOR_T / 2, z), 0xffffff, rot));
        else if (t === T.SAND) lists.sand.push(bake(tile, at(x, -FLOOR_T / 2, z), tint(), rot));
        else if (t === T.HOLE) {
          // the tile around a hole matches its neighbours (ice or sand next to ice or sand)
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => L.tiles[(cy + dy) * L.w + cx + dx]);
          const kind = near.filter((q) => q === T.ICE).length >= 2 ? 'ice' : near.filter((q) => q === T.SAND).length >= 2 ? 'sand' : 'floor';
          lists[kind].push(bake(holeTile, at(cx, 0, cy), kind === 'ice' ? 0xffffff : tint()));
          lists.rim.push(bake(rimGeo, at(x, 0.004, z), 0xffffff));
          lists.tube.push(bake(tubeGeo, at(x, -0.45, z), 0xffffff));
          lists.tube.push(bake(tubeEnd, at(x, -0.85, z), 0xffffff));
        }
      }
    }
    const matFor: Record<string, THREE.Material> = { floor: M.floor, wall: M.wall, bridge: M.bridge, ice: M.ice, sand: M.sand, rim: M.rim, tube: M.tube };
    for (const [k, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      this.geos.push(merged);
      const mesh = new THREE.Mesh(merged, matFor[k]);
      mesh.receiveShadow = k !== 'tube';
      mesh.castShadow = k === 'wall' || k === 'floor' || k === 'bridge';
      this.board.add(mesh);
    }
    [tile, plank, wallGeo, holeTile, rimGeo, tubeGeo, tubeEnd].forEach((g) => g.dispose());

    // ------------------------------------------------ pieces
    for (const g of L.gems) {
      const gem = prop('jewel', 1.8, true);
      gem.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = gemMat(env);
      });
      gem.position.set(g.x, 0.22, g.y);
      this.board.add(gem);
      this.gems.push({ obj: gem, x: g.x, y: g.y, phase: rnd() * 6 });
    }
    for (const k of L.keys) {
      const key = prop('key', 2.3, true);
      key.position.set(k.x, 0.12, k.y);
      this.board.add(key);
      this.keys.push({ obj: key, x: k.x, y: k.y, phase: rnd() * 6 });
    }
    // goal: a chequered cup with a glowing rim and a flag
    const cupGeo = new THREE.CircleGeometry(0.44, 32);
    cupGeo.rotateX(-Math.PI / 2);
    this.geos.push(cupGeo);
    const cup = new THREE.Mesh(cupGeo, M.checker);
    cup.position.set(L.goal.x, 0.006, L.goal.y);
    cup.receiveShadow = true;
    this.board.add(cup);
    const ringGeo = new THREE.TorusGeometry(0.44, 0.05, 10, 32);
    ringGeo.rotateX(Math.PI / 2);
    this.geos.push(ringGeo);
    this.goalMat = new THREE.MeshStandardMaterial({ color: 0x5dff7a, emissive: 0x2bd14a, emissiveIntensity: 0.9, roughness: 0.3 });
    this.ownMats.push(this.goalMat);
    this.goalRing = new THREE.Mesh(ringGeo, this.goalMat);
    this.goalRing.position.set(L.goal.x, 0.03, L.goal.y);
    this.board.add(this.goalRing);
    const flag = prop('flag', 1.7, true);
    flag.position.set(L.goal.x + 0.3, 0, L.goal.y - 0.3);
    this.board.add(flag);

    const ringSmall = new THREE.TorusGeometry(0.36, 0.045, 8, 28);
    ringSmall.rotateX(Math.PI / 2);
    this.geos.push(ringSmall);
    for (const c of L.checkpoints) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, emissive: 0x000000, roughness: 0.4 });
      this.ownMats.push(mat);
      const ring = new THREE.Mesh(ringSmall, mat);
      ring.position.set(c.x, 0.03, c.y);
      this.board.add(ring);
      const pole = this.pole(mat);
      pole.position.set(c.x - 0.32, 0, c.y - 0.32);
      this.board.add(pole);
      this.checkpoints.push({ ring, flag: pole, mat });
    }

    const capGeo = new THREE.CylinderGeometry(0.3, 0.33, 0.12, 24);
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24);
    this.geos.push(capGeo, baseGeo);
    for (const s of L.switches) {
      const col = CHANNEL_COLORS[(s.ch - 1) % 3];
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.35 });
      this.ownMats.push(mat);
      const base = new THREE.Mesh(baseGeo, M.rim);
      base.position.set(s.x, 0.015, s.y);
      base.receiveShadow = true;
      const cap = new THREE.Mesh(capGeo, mat);
      cap.position.set(s.x, 0.07, s.y);
      cap.castShadow = true;
      this.board.add(base, cap);
      this.switches.push({ cap, mat });
    }
    const barGeo = new THREE.CylinderGeometry(0.07, 0.07, WALL_H + 0.05, 10);
    const beamGeo = new THREE.BoxGeometry(0.96, 0.1, 0.16);
    const fieldGeo = new THREE.BoxGeometry(0.9, WALL_H, 0.1);
    this.geos.push(barGeo, beamGeo, fieldGeo);
    for (const g of L.gates) {
      const col = CHANNEL_COLORS[(g.ch - 1) % 3];
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.3 });
      this.ownMats.push(mat);
      const grp = new THREE.Group();
      // bars across the gap, the way the gate closes the corridor
      const side = (dx: number) => L.tiles[g.cy * L.w + g.cx + dx];
      const horiz = [side(-1), side(1)].some((q) => q === T.WALL || q === T.GATE);
      for (const o of [-0.3, 0, 0.3]) {
        const bar = new THREE.Mesh(barGeo, mat);
        bar.position.set(horiz ? o : 0, (WALL_H + 0.05) / 2, horiz ? 0 : o);
        bar.castShadow = true;
        grp.add(bar);
      }
      // a glowing field between the bars, so the gate reads from above
      const fieldMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false });
      this.ownMats.push(fieldMat);
      const field = new THREE.Mesh(fieldGeo, fieldMat);
      field.position.y = WALL_H / 2;
      if (!horiz) field.rotation.y = Math.PI / 2;
      grp.add(field);
      const beam = new THREE.Mesh(beamGeo, mat);
      beam.position.y = WALL_H;
      if (!horiz) beam.rotation.y = Math.PI / 2;
      beam.castShadow = true;
      grp.add(beam);
      grp.position.set(g.cx + 0.5, 0, g.cy + 0.5);
      this.board.add(grp);
      this.gates.push({ obj: grp, ch: g.ch, open: 0 });
    }
    // bumpers: a yellow post with a red rubber ring and a white dome (clear from above)
    const postGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.38, 20);
    const ringRub = new THREE.TorusGeometry(0.25, 0.065, 10, 24);
    ringRub.rotateX(Math.PI / 2);
    const domeGeo = new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.geos.push(postGeo, ringRub, domeGeo);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xff8a00, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.2 });
    const rubMat = new THREE.MeshStandardMaterial({ color: 0xec3013, roughness: 0.6 });
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c0, emissiveIntensity: 0.3, roughness: 0.25 });
    this.ownMats.push(postMat, rubMat, domeMat);
    for (const b of L.bumpers) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 0.19;
      post.castShadow = true;
      const rub = new THREE.Mesh(ringRub, rubMat);
      rub.position.y = 0.2;
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = 0.38;
      g.add(post, rub, dome);
      g.position.set(b.x, 0, b.y);
      this.board.add(g);
      this.bumpers.push({ obj: g, hit: 0 });
    }
    const padGeo = new THREE.PlaneGeometry(0.86, 0.86);
    padGeo.rotateX(-Math.PI / 2);
    const padBase = new THREE.BoxGeometry(0.92, 0.06, 0.92);
    this.geos.push(padGeo, padBase);
    const padBaseMat = new THREE.MeshStandardMaterial({ color: 0x3a3b44, roughness: 0.5, metalness: 0.3 });
    this.ownMats.push(padBaseMat);
    for (const s of L.springs) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(padBase, padBaseMat);
      base.position.y = 0.03;
      base.receiveShadow = true;
      const top = new THREE.Mesh(padGeo, M.pad);
      top.position.y = 0.065;
      top.rotation.y = DIR_ROT[s.dir];
      top.receiveShadow = true;
      g.add(base, top);
      g.position.set(s.x, 0, s.y);
      this.board.add(g);
      this.pads.push({ obj: g, hit: 0 });
    }
    for (const m of L.movers) {
      const geo = new THREE.BoxGeometry(m.w - 0.04, 0.24, m.h - 0.04);
      const n = geo.getAttribute('position').count;
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      this.geos.push(geo);
      const mesh = new THREE.Mesh(geo, M.mover);
      mesh.castShadow = mesh.receiveShadow = true;
      this.board.add(mesh);
      this.movers.push(mesh);
    }

    // ------------------------------------------------ the marble
    const ballGeo = new THREE.SphereGeometry(R, 40, 28);
    this.geos.push(ballGeo);
    this.marble = new THREE.Mesh(ballGeo, marbleMat(th, env));
    this.marble.castShadow = true;
    this.marble.position.set(L.start.x, R, L.start.y);
    this.board.add(this.marble);
    this.last = { x: L.start.x, y: L.start.y };

    this.scenery(rnd);
  }

  private pole(mat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), mat);
    stick.position.y = 0.3;
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.24), mat);
    cloth.position.set(0, 0.5, 0.12);
    this.geos.push(stick.geometry, cloth.geometry);
    stick.castShadow = cloth.castShadow = true;
    g.add(stick, cloth);
    return g;
  }

  /** What surrounds the board: the ground, the pond, the chasm or the clouds, and props. */
  private scenery(rnd: () => number): void {
    const { L, th } = this;
    const M = mats(th);
    const cx = L.w / 2, cz = L.h / 2;
    const below = new THREE.PlaneGeometry(160, 160);
    below.rotateX(-Math.PI / 2);
    this.geos.push(below);
    const plane = new THREE.Mesh(below, M.below);
    plane.position.set(cx, th.belowY, cz);
    plane.receiveShadow = th.voidKind !== 'sky';
    if (th.voidKind !== 'sky') this.board.add(plane);
    if (th.voidKind === 'water') this.water = plane;

    // ground slabs around the board (garden lawn, cave snow)
    if (th.key === 'garden' || th.key === 'ice') {
      const col = th.key === 'garden' ? 0x6dbb4a : 0x8fa6c4;
      const mat = new THREE.MeshLambertMaterial({ color: col });
      this.ownMats.push(mat);
      const pad = 30;
      for (const [x0, z0, x1, z1] of [[-pad, -pad, L.w + pad, -0.02], [-pad, L.h + 0.02, L.w + pad, L.h + pad], [-pad, 0, -0.02, L.h], [L.w + 0.02, 0, L.w + pad, L.h]]) {
        const geo = new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0);
        this.geos.push(geo);
        const m = new THREE.Mesh(geo, mat);
        m.position.set((x0 + x1) / 2, -0.62, (z0 + z1) / 2);
        m.receiveShadow = true;
        this.board.add(m);
      }
    }
    // props along the edges (seen at the top and bottom of the board and on wide phones)
    const groundY = th.key === 'garden' || th.key === 'ice' ? -0.32 : th.key === 'wood' ? th.belowY : -2.5;
    const spots: [number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const along = rnd();
      const off = 0.9 + rnd() * 3.2;
      if (side === 0) spots.push([-off, along * L.h]);
      else if (side === 1) spots.push([L.w + off, along * L.h]);
      else if (side === 2) spots.push([along * L.w, -off]);
      else spots.push([along * L.w, L.h + off]);
    }
    for (const [x, z] of spots) {
      const d = th.decor[(rnd() * th.decor.length) | 0];
      const p = prop(d.key, d.scale * (0.8 + rnd() * 0.4), false);
      p.position.set(x, groundY, z);
      p.rotation.y = rnd() * Math.PI * 2;
      if (th.key === 'ruins') {
        // the columns stand on little floating islands
        islandMat ??= new THREE.MeshLambertMaterial({ color: 0xc9b48a, flatShading: true });
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.35, 1.2, 7), islandMat);
        this.geos.push(isl.geometry);
        isl.position.set(x, groundY - 0.6, z);
        this.board.add(isl);
      }
      this.board.add(p);
    }
    // clouds drifting below the sky ruins
    if (th.voidKind === 'sky') {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.95 });
      this.geos.push(geo);
      this.ownMats.push(mat);
      for (let i = 0; i < 22; i++) {
        const c = new THREE.Mesh(geo, mat);
        c.scale.set(2 + rnd() * 3.5, 0.8 + rnd(), 1.6 + rnd() * 2.4);
        c.position.set(cx + (rnd() - 0.5) * 34, -5 - rnd() * 6, cz + (rnd() - 0.5) * 40);
        this.board.add(c);
        this.clouds.push(c);
      }
    }
  }

  /** Brings the 3D board in line with the simulation (call every frame). */
  sync(sim: Sim, dt: number, time: number, marbleOn = true): void {
    // movers
    sim.L.movers.forEach((m, i) => {
      const p = sim.moverPos[i];
      this.movers[i].position.set(p.x + m.w / 2, -0.12, p.y + m.h / 2);
    });
    // the marble rolls without slipping: it turns about the axis across its motion
    if (marbleOn) {
      const dx = sim.x - this.last.x, dz = sim.y - this.last.y;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 1.5 && sim.h <= 0.0001) {
        const axis = new THREE.Vector3(dz / d, 0, -dx / d);
        const q = new THREE.Quaternion().setFromAxisAngle(axis, d / R);
        this.marble.quaternion.premultiply(q);
      }
      this.marble.position.set(sim.x, R + sim.h, sim.y);
      this.last = { x: sim.x, y: sim.y };
    }
    // pieces
    for (const g of this.gems) {
      g.obj.rotation.y += dt * 2.2;
      if (g.obj.visible && g.obj.scale.x > 0.5) g.obj.position.y = 0.22 + Math.sin(time * 3 + g.phase) * 0.06;
    }
    for (const k of this.keys) {
      k.obj.rotation.y += dt * 1.8;
      if (k.obj.visible && k.obj.scale.x > 0.5) k.obj.position.y = 0.12 + Math.sin(time * 2.6 + k.phase) * 0.05;
    }
    this.goalMat.emissiveIntensity = 0.6 + Math.sin(time * 4) * 0.35;
    for (const g of this.gates) {
      const want = sim.open.has(g.ch) ? 1 : 0;
      g.open += (want - g.open) * Math.min(1, dt * 4);
      g.obj.position.y = -g.open * (WALL_H + 0.1);
      g.obj.visible = g.open < 0.98;
    }
    sim.L.switches.forEach((s, i) => {
      const sw = this.switches[i];
      const down = s.taken ? 0.025 : 0.07;
      sw.cap.position.y += (down - sw.cap.position.y) * Math.min(1, dt * 10);
      sw.mat.emissiveIntensity = s.taken ? 0.9 : 0.25 + Math.sin(time * 5) * 0.12;
    });
    for (const b of this.bumpers) {
      b.hit = Math.max(0, b.hit - dt * 4);
      const s = 1 + b.hit * 0.35;
      b.obj.scale.setScalar(s);
    }
    for (const p of this.pads) {
      p.hit = Math.max(0, p.hit - dt * 3);
      p.obj.position.y = Math.sin(p.hit * Math.PI) * 0.12;
    }
    for (const c of this.clouds) {
      c.position.x += dt * 0.25;
      if (c.position.x > this.L.w / 2 + 20) c.position.x -= 40;
    }
    if (this.water) this.water.position.y = this.th.belowY + Math.sin(time * 1.2) * 0.02;
  }

  setGoalLocked(locked: boolean): void {
    const c = locked ? 0xff7a3a : 0x5dff7a;
    this.goalMat.color.setHex(c);
    this.goalMat.emissive.setHex(locked ? 0xd14a1a : 0x2bd14a);
  }

  checkpointOn(i: number): void {
    const c = this.checkpoints[i];
    if (!c) return;
    c.mat.color.setHex(0x5dff7a);
    c.mat.emissive.setHex(0x2bd14a);
    c.mat.emissiveIntensity = 0.8;
  }

  dispose(): void {
    this.scene.remove(this.pivot);
    this.geos.forEach((g) => g.dispose());
    this.ownMats.forEach((m) => m.dispose());
    this.geos = [];
    this.ownMats = [];
  }
}
