// The archipelago: the home cove in the middle (a dock, huts, a watchtower and the pirate flag,
// with a repair berth on the water), and a ring of palm and rock islands made from the Pirate Kit,
// laid out from a seed. Forts are towers raised on an island for the fort waves.
import { rng } from '@core';
import { THREE, model, grounded } from '@core/three';

export interface Island {
  x: number;
  z: number;
  /** Collision radius. */
  r: number;
  root: THREE.Group;
  fort?: Fort;
}

export interface Fort {
  island: Island;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  reload: number;
  root: THREE.Group;
  tower: THREE.Object3D;
  cannon: THREE.Object3D;
  falling: number;
}

/** The playable sea: a circle of this radius around the cove. */
export const MAP_R = 150;
/** Where the repair berth is, relative to the cove centre. */
export const BERTH = { x: 0, z: 19, r: 9 };

const PALMS = ['palm-bend', 'palm-straight', 'palm-detailed-bend'];
const ROCKS = ['rocks-a', 'rocks-b', 'rocks-c'];
const SAND_ROCKS = ['rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c'];

/** Every model the archipelago uses (loaded in main.ts). */
export const ISLAND_MODELS = [
  ...PALMS, ...ROCKS, ...SAND_ROCKS, 'patch-sand', 'patch-sand-foliage', 'patch-grass-foliage',
  'tower-complete-small', 'tower-watch', 'castle-wall', 'castle-gate', 'cannon',
  'structure', 'structure-roof', 'structure-platform-dock', 'flag-pirate-high', 'crate', 'barrel', 'ship-wreck',
];

/** A fresh copy of a Pirate Kit model (loaded as 'pk:<name>'). */
const pk = (name: string): THREE.Object3D => model('pk:' + name);

const place = (o: THREE.Object3D, x: number, y: number, z: number, s: number, ry: number): THREE.Object3D => {
  o.position.set(x, y, z);
  o.scale.setScalar(s);
  o.rotation.y = ry;
  return o;
};

/** A white foam ring around an island's shore. */
function foam(r: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.08, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.3;
  m.userData.ownMaterial = true;
  m.userData.ownGeometry = true;
  m.userData.foam = true;
  return m;
}

function sandIsland(rand: () => number, r: number, lush: boolean): THREE.Group {
  const g = new THREE.Group();
  // the sand patch is 7.7 × 6 (and 0.25 high): stretch it to the radius, thicker so waves do not wash it away
  const sand = grounded(pk(lush ? 'patch-sand-foliage' : 'patch-sand'));
  sand.scale.set(r / 3.4, 3, r / 3.4);
  sand.position.y = -0.35;
  g.add(sand);
  if (lush && r > 7) {
    const grass = grounded(pk('patch-grass-foliage'));
    grass.scale.set(r / 5.4, 2.4, r / 5.4);
    grass.position.set((rand() - 0.5) * r * 0.3, 0.35, (rand() - 0.5) * r * 0.3);
    grass.rotation.y = rand() * 6;
    g.add(grass);
  }
  const palms = Math.round(1 + rand() * (r / 3.5));
  for (let i = 0; i < palms; i++) {
    const a = rand() * Math.PI * 2, d = rand() * r * 0.55;
    g.add(place(grounded(pk(PALMS[Math.floor(rand() * 3)])), Math.cos(a) * d, 0.35, Math.sin(a) * d, 1.3 + rand() * 0.6, rand() * 6));
  }
  if (rand() < 0.7) {
    const a = rand() * Math.PI * 2;
    g.add(place(grounded(pk(SAND_ROCKS[Math.floor(rand() * 3)])), Math.cos(a) * r * 0.6, -0.3, Math.sin(a) * r * 0.6, 0.9 + rand() * 0.6, rand() * 6));
  }
  return g;
}

function rockIsland(rand: () => number, r: number): THREE.Group {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(), d = i ? r * 0.45 : 0;
    g.add(place(grounded(pk(ROCKS[Math.floor(rand() * 3)])), Math.cos(a) * d, -0.6, Math.sin(a) * d, (r / 3.2) * (i ? 0.7 : 1), rand() * 6));
  }
  return g;
}

/** The home cove: a big island with a dock pointing at the repair berth (+z). */
function cove(): THREE.Group {
  const g = new THREE.Group();
  const sand = grounded(pk('patch-sand-foliage'));
  sand.scale.set(2.9, 3, 3.3);
  sand.position.y = -0.35;
  g.add(sand);
  const grass = grounded(pk('patch-grass-foliage'));
  grass.scale.set(2, 2.4, 2);
  grass.position.set(-2, 0.35, -3);
  g.add(grass);
  g.add(place(grounded(pk('tower-watch')), -6, 0.35, -2, 1.4, 0.4));
  g.add(place(grounded(pk('structure')), 4, 0.35, -4, 1.3, -0.3));
  g.add(place(grounded(pk('structure-roof')), 4, 0.35 + 2.2 * 1.3, -4, 1.3, -0.3));
  g.add(place(grounded(pk('flag-pirate-high')), 1.2, 0.35, 4.5, 1.6, 0));
  // the dock runs out over the water towards the berth
  for (let i = 0; i < 3; i++) g.add(place(grounded(pk('structure-platform-dock')), 0, -0.6, 7.5 + i * 2.45, 1, 0));
  g.add(place(grounded(pk('crate')), 1.4, 0.35, 6.3, 1, 0.4));
  g.add(place(grounded(pk('barrel')), -1.4, 0.35, 6.6, 0.9, 0));
  for (const [x, z, s] of [[-9, 3, 1.5], [8, 2, 1.4], [7, -9, 1.6], [-9, -8, 1.3], [-1, -10, 1.5]]) {
    g.add(place(grounded(pk(PALMS[(x + 20) % 3])), x, 0.35, z, s, x * 0.7));
  }
  g.add(place(grounded(pk('rocks-sand-a')), 11, -0.3, -4, 1.1, 1));
  return g;
}

export class Archipelago {
  islands: Island[] = [];
  forts: Fort[] = [];
  readonly home: Island;
  /** The wreck lying on the reef: scenery only. */
  private wreck: THREE.Object3D | null = null;

  constructor(private scene: THREE.Scene, seed: number) {
    const rand = rng.seeded(seed);
    const homeRoot = cove();
    scene.add(homeRoot);
    homeRoot.add(foam(14));
    this.home = { x: 0, z: 0, r: 12, root: homeRoot };
    this.islands.push(this.home);
    // a ring of islands, kept apart so ships can sail between them
    let tries = 0;
    while (this.islands.length < 13 && tries++ < 600) {
      const a = rand() * Math.PI * 2, d = 40 + rand() * (MAP_R - 55);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const rock = rand() < 0.3;
      const r = rock ? 4.5 + rand() * 3 : 6 + rand() * 6;
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 26)) continue;
      // keep the berth's approach (+z of the cove) open
      if (Math.abs(x) < 20 && z > 0 && z < 70) continue;
      const root = rock ? rockIsland(rand, r) : sandIsland(rand, r, rand() < 0.6);
      root.add(foam(r * (rock ? 1.15 : 1.2)));
      root.position.set(x, 0, z);
      root.rotation.y = rand() * 6;
      // the root turns, the foam stays a ring anyway
      scene.add(root);
      this.islands.push({ x, z, r: r * (rock ? 1 : 1.06), root });
    }
    // a wreck on a reef for flavour
    const far = this.islands.filter((i) => i !== this.home && Math.hypot(i.x, i.z) > 60);
    const reef = far[Math.floor(rand() * far.length)];
    if (reef) {
      const w = grounded(pk('ship-wreck'));
      const a = rand() * 6;
      w.position.set(reef.x + Math.cos(a) * (reef.r + 5), -1.6, reef.z + Math.sin(a) * (reef.r + 5));
      w.rotation.set(0.1, a, 0.18);
      scene.add(w);
      this.wreck = w;
      this.islands.push({ x: w.position.x, z: w.position.z, r: 4, root: new THREE.Group() });
    }
  }

  /** Islands as shallows for the sea colouring. */
  shoals(): { x: number; z: number; r: number }[] {
    return this.islands.filter((i) => i.root.children.length).map((i) => ({ x: i.x, z: i.z, r: i.r + (i === this.home ? 4 : 1.5) }));
  }

  /** Raises a fort on a free island at a good distance from (px, pz). */
  addFort(px: number, pz: number, hp: number): Fort | null {
    const free = this.islands.filter((i) => i !== this.home && !i.fort && i.r >= 6 && i.root.children.length > 1);
    free.sort((a, b) => Math.abs(Math.hypot(a.x - px, a.z - pz) - 70) - Math.abs(Math.hypot(b.x - px, b.z - pz) - 70));
    const island = free[0];
    if (!island) return null;
    const root = new THREE.Group();
    const tower = grounded(pk('tower-complete-small'));
    tower.scale.setScalar(1.55);
    root.add(tower);
    const cannon = grounded(pk('cannon'));
    cannon.scale.setScalar(1.3);
    cannon.position.y = 6.78 * 1.55 - 1.2;
    root.add(cannon);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      root.add(place(grounded(pk(i === 0 ? 'castle-gate' : 'castle-wall')), Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6, 0.9, -a + Math.PI / 2));
    }
    root.position.set(island.x, 0.3, island.z);
    this.scene.add(root);
    const fort: Fort = { island, x: island.x, z: island.z, hp, maxHp: hp, reload: 2.5 + Math.random() * 2, root, tower, cannon, falling: -1 };
    island.fort = fort;
    this.forts.push(fort);
    return fort;
  }

  removeFort(f: Fort): void {
    this.scene.remove(f.root);
    f.island.fort = undefined;
    this.forts = this.forts.filter((o) => o !== f);
  }

  /** Foam rings breathe with the swell. */
  update(t: number): void {
    for (const i of this.islands) {
      for (const c of i.root.children) {
        if (!c.userData.foam) continue;
        const k = 1 + Math.sin(t * 1.3 + i.x) * 0.05;
        c.scale.set(k, k, 1);
        ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(t * 1.3 + i.x) * 0.12;
      }
    }
  }

  /** The island a point is inside of (with a margin), if any. */
  hitIsland(x: number, z: number, pad: number): Island | null {
    for (const i of this.islands) if (Math.hypot(x - i.x, z - i.z) < i.r + pad) return i;
    return null;
  }

  dispose(): void {
    for (const i of this.islands) this.scene.remove(i.root);
    for (const f of this.forts) this.scene.remove(f.root);
    if (this.wreck) this.scene.remove(this.wreck);
  }
}
