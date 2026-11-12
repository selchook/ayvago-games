// Crystal Keep: the 3D board. The map's tiles (Kenney Tower Defense Kit) are chosen from the path
// links and merged into one mesh; around it a ring of scenery tiles; the crystal keep, the spawn
// portals, the river's moving water, the towers (three tiers each) and the range ring.
import Phaser from 'phaser';
import { THREE } from '@core/three';
import { kitMat, kitModel, kitGeo, merge, ghostMat, StaticBatch, type KitModel, type Palette } from './kit';
import { N, E, S, Wb, cellX, cellZ, type ParsedMap, type TowerKind } from './sim';

/** Height of the path surface and of the grass (tower bases). */
export const PATH_Y = 0.1;
export const GRASS_Y = 0.2;

const rand = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** The tile and its turn (quarter turns, counter-clockwise from above) for a path cell's links. */
function pathTile(bits: number, end: KitModel): [KitModel, number] {
  const n = [N, E, S, Wb].filter((b) => bits & b).length;
  if (n <= 1) return [end, ({ [S]: 0, [E]: 1, [N]: 2, [Wb]: 3 } as Record<number, number>)[bits] ?? 0];
  if (n === 2) {
    if (bits === (N | S)) return ['tile-straight', 0];
    if (bits === (E | Wb)) return ['tile-straight', 1];
    const corner: Record<number, number> = { [S | E]: 0, [E | N]: 1, [N | Wb]: 2, [Wb | S]: 3 };
    return ['tile-corner-round', corner[bits]];
  }
  if (n === 3) {
    const missing = (N | E | S | Wb) & ~bits;
    return ['tile-split', ({ [N]: 0, [Wb]: 1, [S]: 2, [E]: 3 } as Record<number, number>)[missing]];
  }
  return ['tile-split', 0]; // no map has a four-way junction
}

/** The snow version of a tile where the kit has one. */
function themed(name: KitModel, palette: Palette): KitModel {
  if (palette !== 'snow') return name;
  const s = ('snow-' + name) as KitModel;
  return (KIT_HAS_SNOW as readonly string[]).includes(s) ? s : name;
}
const KIT_HAS_SNOW = [
  'snow-tile', 'snow-tile-straight', 'snow-tile-corner-round', 'snow-tile-end-round', 'snow-tile-spawn-end-round', 'snow-tile-split',
  'snow-tile-tree', 'snow-tile-tree-double', 'snow-tile-tree-quad', 'snow-tile-rock', 'snow-tile-crystal', 'snow-tile-hill',
  'snow-detail-tree', 'snow-detail-tree-large', 'snow-detail-rocks', 'snow-detail-crystal',
] as const;

export const PALETTE_LOOK: Record<Palette, { sky: number; fog: number; sun: number; ground: number; hemi: number }> = {
  green: { sky: 0x8fd3f0, fog: 0x8fd3f0, sun: 0xfff3dc, ground: 0x6a8f5a, hemi: 0xdff3ff },
  autumn: { sky: 0xf2c48f, fog: 0xf2c48f, sun: 0xffe0b0, ground: 0x9a6a3a, hemi: 0xffead2 },
  snow: { sky: 0xb9d4ee, fog: 0xb9d4ee, sun: 0xf4f8ff, ground: 0xd3dee9, hemi: 0xeef6ff },
};

export class Board {
  readonly root = new THREE.Group();
  readonly palette: Palette;
  readonly mat: THREE.MeshLambertMaterial;
  private water: THREE.Mesh | null = null;
  private waterTex: THREE.CanvasTexture | null = null;
  keep!: THREE.Group;
  keepCrystal!: THREE.Object3D;
  keepMat!: THREE.MeshLambertMaterial;
  portals: THREE.Group[] = [];
  private portalMat!: THREE.MeshBasicMaterial;
  /** Seconds of the keep's red damage glow left. */
  hurtT = 0;
  /** GPU resources this board made (the kit's shared models and materials are not among them). */
  private own: { dispose(): void }[] = [];

  constructor(private scene: Phaser.Scene, parent: THREE.Object3D, readonly map: ParsedMap) {
    this.palette = map.def.theme;
    this.mat = kitMat(scene, this.palette === 'autumn' ? 'autumn' : 'green');
    parent.add(this.root);
    this.buildTiles();
    this.buildKeep();
    this.buildPortals();
  }

  X(c: number): number { return cellX(this.map.W, c); }
  Z(r: number): number { return cellZ(this.map.H, r); }

  private buildTiles(): void {
    const { W, H, grid, links } = this.map;
    const pal = this.palette;
    const batch = new StaticBatch();
    const rnd = rand(W * 131 + H * 7 + this.map.def.id.length * 977);
    const turn = (k: number) => (k * Math.PI) / 2;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const ch = grid[r][c];
      const x = this.X(c), z = this.Z(r);
      const bits = links.get(`${c},${r}`) ?? 0;
      switch (ch) {
        case '#': case 'K': {
          const [t, k] = pathTile(bits, 'tile-end-round');
          batch.add(themed(t, pal), x, 0, z, turn(k));
          break;
        }
        case 'S': {
          const [t, k] = pathTile(bits, 'tile-spawn-end-round');
          batch.add(themed(t, pal), x, 0, z, turn(k));
          break;
        }
        case '=': batch.add('tile-river-bridge', x, 0, z, 0); break;
        case '~': batch.add('tile-river-straight', x, 0, z, 0); break;
        case 't': batch.add(themed((['tile-tree', 'tile-tree-double', 'tile-tree-quad'] as const)[Math.floor(rnd() * 3)], pal), x, 0, z, turn(Math.floor(rnd() * 4))); break;
        case 'r': batch.add(themed('tile-rock', pal), x, 0, z, turn(Math.floor(rnd() * 4))); break;
        case 'c': batch.add(themed('tile-crystal', pal), x, 0, z, turn(Math.floor(rnd() * 4))); break;
        case 'h': batch.add(themed('tile-hill', pal), x, 0, z, turn(Math.floor(rnd() * 4))); break;
        default: batch.add(themed('tile', pal), x, 0, z, 0);
      }
    }
    // a ring of scenery around the field: forest, rocks and hills; the river runs on through it
    const ring = 3;
    const riverCols = new Set<number>();
    grid.forEach((row) => row.forEach((ch, c) => { if (ch === '~' || ch === '=') riverCols.add(c); }));
    for (let r = -ring; r < H + ring; r++) for (let c = -ring; c < W + ring; c++) {
      if (c >= 0 && r >= 0 && c < W && r < H) continue;
      const x = this.X(c), z = this.Z(r);
      const edge = Math.max(-c, -r, c - W + 1, r - H + 1); // 1 = next to the field
      if (riverCols.has(c) && (r < 0 || r >= H)) { batch.add('tile-river-straight', x, 0, z, 0); continue; }
      const p = rnd();
      let t: KitModel = 'tile';
      if (p < 0.34 + edge * 0.1) t = (['tile-tree', 'tile-tree-double', 'tile-tree-quad'] as const)[Math.floor(rnd() * 3)];
      else if (p < 0.44 + edge * 0.1) t = 'tile-rock';
      else if (p < 0.5 + edge * 0.1) t = 'tile-hill';
      else if (p < 0.53 + edge * 0.1) t = 'tile-crystal';
      batch.add(themed(t, pal), x, 0, z, turn(Math.floor(rnd() * 4)));
      if (t === 'tile' && rnd() < 0.55) {
        const d = (['detail-tree', 'detail-tree-large', 'detail-rocks', 'detail-crystal'] as const)[Math.floor(rnd() * 4)];
        batch.add(themed(d, pal), x + (rnd() - 0.5) * 0.5, GRASS_Y, z + (rnd() - 0.5) * 0.5, rnd() * 6.28);
      }
    }
    const { land, water } = batch.build(this.mat);
    this.root.add(land);
    this.own.push(land.geometry);
    // a wide ground slab under everything, so the island sits on land instead of in the sky
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: PALETTE_LOOK[pal].ground }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = -0.02;
    slab.receiveShadow = true;
    this.root.add(slab);
    this.own.push(slab.geometry, slab.material as THREE.Material);
    if (water) this.buildWater(water);
  }

  private buildWater(geo: THREE.BufferGeometry): void {
    // the kit paints water one flat colour: give it moving ripples (world-space UVs)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5, pos.getZ(i) * 0.5);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = this.palette === 'autumn' ? '#6fb9e8' : '#8fd8f0';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const x = (i * 47) % 128, y = (i * 29) % 128, w = 14 + (i % 3) * 8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w / 2, y - 4, x + w, y);
      g.stroke();
    }
    this.waterTex = new THREE.CanvasTexture(cv);
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.colorSpace = THREE.SRGBColorSpace;
    this.water = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.waterTex }));
    this.water.receiveShadow = true;
    this.root.add(this.water);
    this.own.push(geo, this.waterTex, this.water.material as THREE.Material);
  }

  private buildKeep(): void {
    const k = this.map.keep;
    const g = new THREE.Group();
    g.position.set(this.X(k.c), PATH_Y, this.Z(k.r));
    let y = 0;
    const stack = (name: KitModel, h: number, s = 1) => {
      const o = kitModel(name, this.mat);
      o.position.y = y;
      o.scale.setScalar(s);
      g.add(o);
      y += h * s;
    };
    stack('tower-square-bottom-b', 0.5, 1.05);
    stack('tower-square-middle-a', 0.5, 1.05);
    stack('tower-square-top-a', 0.08, 1.05);
    const crystals = kitModel('tower-round-crystals', this.mat);
    crystals.position.y = y;
    crystals.scale.setScalar(0.95);
    g.add(crystals);
    // the big floating crystal: glows, spins and turns red when the keep is hurt
    this.keepMat = new THREE.MeshLambertMaterial({ map: this.mat.map, emissive: 0xc04cff, emissiveIntensity: 0.55 });
    this.own.push(this.keepMat);
    this.keepCrystal = kitModel('detail-crystal-large', this.keepMat);
    this.keepCrystal.scale.setScalar(1.25);
    this.keepCrystal.position.y = y + 0.75;
    g.add(this.keepCrystal);
    this.keep = g;
    this.root.add(g);
  }

  private buildPortals(): void {
    this.portalMat = new THREE.MeshBasicMaterial({ color: 0xb04cff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ringGeo = new THREE.TorusGeometry(0.3, 0.05, 8, 24);
    const discGeo = new THREE.CircleGeometry(0.28, 24);
    this.own.push(this.portalMat, ringGeo, discGeo);
    for (const s of this.map.spawns) {
      const g = new THREE.Group();
      g.position.set(this.X(s.c), PATH_Y + 0.12, this.Z(s.r));
      const disc = new THREE.Mesh(discGeo, this.portalMat);
      disc.rotation.x = -Math.PI / 2;
      g.add(disc);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(ringGeo, this.portalMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = i * 0.22;
        ring.userData.i = i;
        g.add(ring);
      }
      this.portals.push(g);
      this.root.add(g);
    }
  }

  /** Takes the board out of the world and frees what it made. */
  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const r of this.own) r.dispose();
    this.own = [];
  }

  /** Animates water, portals and the keep crystal (lives share 0..1). */
  update(dt: number, time: number, livesK: number): void {
    if (this.waterTex) this.waterTex.offset.set(Math.sin(time * 0.4) * 0.05, -time * 0.18);
    for (const p of this.portals) {
      p.children.forEach((ch) => {
        const i = ch.userData.i as number | undefined;
        if (i === undefined) { ch.rotation.z = time * 2; return; }
        const u = ((time * 0.6 + i / 3) % 1);
        ch.position.y = u * 0.7;
        const s = 1 - u * 0.5;
        ch.scale.set(s, s, s);
      });
    }
    this.portalMat.opacity = 0.55 + Math.sin(time * 5) * 0.15;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const c = this.keepCrystal;
    c.rotation.y += dt * (0.8 + (1 - livesK) * 2.5);
    c.position.y = 1.45 + Math.sin(time * 2) * 0.08;
    const pulse = 0.45 + Math.sin(time * 3) * 0.15;
    const hurt = this.hurtT > 0 ? 1 : 0;
    const low = livesK < 0.35 ? (Math.sin(time * 9) * 0.5 + 0.5) * 0.6 : 0;
    this.keepMat.emissive.setRGB(0.75 + Math.max(hurt, low) * 0.25, 0.3 * (1 - Math.max(hurt, low)), 1 * (1 - Math.max(hurt, low) * 0.85));
    this.keepMat.emissiveIntensity = pulse + hurt * 0.8;
  }

  /** The keep's crystal position in the world (lost lives fly from here). */
  keepTop(): THREE.Vector3 {
    return this.keep.position.clone().add(new THREE.Vector3(0, 1.5, 0));
  }
}

// ------------------------------------------------------------------ towers

/** The tower's look per kind: round (red) or square (purple) masonry. */
const STYLE: Record<TowerKind, 'round' | 'square'> = { ballista: 'round', catapult: 'round', cannon: 'square', turret: 'square' };
const WEAPON: Record<TowerKind, KitModel> = { ballista: 'weapon-ballista', cannon: 'weapon-cannon', catapult: 'weapon-catapult', turret: 'weapon-turret' };
const MOVING: Record<TowerKind, string> = { ballista: 'arrow', cannon: 'barrel', catapult: 'catapult', turret: 'barrel' };

/** Stacks per tier: [model, height]. */
const STACKS: Record<'round' | 'square', [KitModel, number][][]> = {
  round: [
    [['tower-round-bottom-a', 0.6]],
    [['tower-round-bottom-c', 0.6], ['tower-round-middle-a', 0.6]],
    [['tower-round-bottom-c', 0.6], ['tower-round-middle-c', 0.6], ['tower-round-middle-a', 0.6], ['tower-round-top-b', 0.08]],
  ],
  square: [
    [['tower-square-bottom-a', 0.5]],
    [['tower-square-bottom-b', 0.5], ['tower-square-middle-a', 0.5]],
    [['tower-square-bottom-c', 0.5], ['tower-square-middle-b', 0.5], ['tower-square-middle-a', 0.5], ['tower-square-top-a', 0.08]],
  ],
};

/** Height of the weapon's base per kind and tier (the simulation's muzzle sits a little above). */
export function weaponY(kind: TowerKind, tier: number): number {
  return STACKS[STYLE[kind]][tier].reduce((a, [, h]) => a + h, 0);
}

export interface TowerView {
  root: THREE.Group;
  parts: THREE.Object3D[];
  weapon: THREE.Group;
  moving: THREE.Object3D | null;
  movingRest: THREE.Vector3;
  kick: number;
  yaw: number;
}

/** A tower's masonry as one geometry per style and tier (one draw call instead of up to four). */
const stackGeos = new Map<string, THREE.BufferGeometry>();
function stackGeo(kind: TowerKind, tier: number): THREE.BufferGeometry {
  const key = `${STYLE[kind]}${tier}`;
  let g = stackGeos.get(key);
  if (!g) {
    let y = 0;
    const parts: THREE.BufferGeometry[] = [];
    for (const [name, h] of STACKS[STYLE[kind]][tier]) {
      parts.push(kitGeo(name).clone().translate(0, y, 0));
      y += h;
    }
    g = merge(parts);
    for (const p of parts) p.dispose();
    stackGeos.set(key, g);
  }
  return g;
}

/**
 * Builds a tower's model (for a tier) at the origin of a new group. `mat` may be the ghost.
 * `merged`: the masonry as one mesh (a standing tower); otherwise one mesh per piece, so the
 * build animation can drop them in turn.
 */
export function buildTower(kind: TowerKind, tier: number, mat: THREE.Material, merged = false): TowerView {
  const root = new THREE.Group();
  const parts: THREE.Object3D[] = [];
  let y = 0;
  if (merged) {
    const m = new THREE.Mesh(stackGeo(kind, tier), mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    parts.push(m);
    y = weaponY(kind, tier);
  } else for (const [name, h] of STACKS[STYLE[kind]][tier]) {
    const o = kitModel(name, mat);
    o.position.y = y;
    root.add(o);
    parts.push(o);
    y += h;
  }
  const weapon = new THREE.Group();
  weapon.position.y = y;
  const w = kitModel(WEAPON[kind], mat);
  w.scale.setScalar(1.25 + tier * 0.12);
  weapon.add(w);
  root.add(weapon);
  parts.push(weapon);
  const moving = w.getObjectByName(MOVING[kind]) ?? null;
  return { root, parts, weapon, moving, movingRest: moving ? moving.position.clone() : new THREE.Vector3(), kick: 0, yaw: Math.PI };
}

/** Turns the weapon towards `aim` and plays the shot recoil. */
export function animateTower(v: TowerView, kind: TowerKind, aim: number, dt: number): void {
  let d = aim - v.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  v.yaw += d * Math.min(1, dt * 10);
  v.weapon.rotation.y = v.yaw;
  v.kick = Math.max(0, v.kick - dt * 3.2);
  if (!v.moving) return;
  const k = v.kick;
  if (kind === 'catapult') {
    // the arm swings up and over, then winds back down
    const swing = k > 0.7 ? (1 - k) / 0.3 : k / 0.7;
    v.moving.rotation.x = -swing * 1.4;
  } else if (kind === 'ballista') {
    // the bolt leaves; a new one slides in
    v.moving.visible = k < 0.75;
    v.moving.position.z = v.movingRest.z - k * 0.25;
  } else {
    v.moving.position.z = v.movingRest.z - Math.sin(Math.min(1, k) * Math.PI) * (kind === 'turret' ? 0.05 : 0.12);
  }
}

// ------------------------------------------------------------------ markers

/** The range ring and the build cursor. */
export class Markers {
  readonly ring = new THREE.Group();
  readonly cursor: THREE.Object3D;
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  private fillMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  ghost: TowerView | null = null;
  private ghostKey = '';

  constructor(private scene: Phaser.Scene, parent: THREE.Object3D, mat: THREE.Material) {
    const edge = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 64), this.ringMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.965, 64), this.fillMat);
    for (const m of [edge, fill]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 5; this.ring.add(m); }
    this.ring.visible = false;
    parent.add(this.ring);
    this.cursor = kitModel('selection-a', mat, false);
    this.cursor.visible = false;
    parent.add(this.cursor);
    this.parent = parent;
  }
  private parent: THREE.Object3D;

  showRing(x: number, z: number, range: number, color: number): void {
    this.ring.visible = true;
    this.ring.position.set(x, GRASS_Y + 0.04, z);
    this.ring.scale.setScalar(range);
    this.ringMat.color.setHex(color);
    this.fillMat.color.setHex(color);
  }

  hideRing(): void { this.ring.visible = false; }

  showGhost(kind: TowerKind | null, tier: number, x: number, z: number): void {
    const key = kind ? `${kind}${tier}` : '';
    if (key !== this.ghostKey) {
      if (this.ghost) this.parent.remove(this.ghost.root);
      this.ghost = kind ? buildTower(kind, tier, ghostMat(this.scene), true) : null;
      if (this.ghost) {
        this.ghost.root.traverse((o) => { o.castShadow = false; });
        this.parent.add(this.ghost.root);
      }
      this.ghostKey = key;
    }
    if (this.ghost) this.ghost.root.position.set(x, GRASS_Y, z);
  }

  update(time: number): void {
    this.ringMat.opacity = 0.7 + Math.sin(time * 6) * 0.15;
    if (this.cursor.visible) this.cursor.scale.setScalar(1 + Math.sin(time * 5) * 0.04);
    if (this.ghost) this.ghost.weapon.rotation.y = time * 0.8;
  }
}
