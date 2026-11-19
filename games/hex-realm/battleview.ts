// Hex Realm: a battle in 3D. The arena (arena.ts) merges into one mesh (1.3: the Medieval Village
// and Nature pieces and the arena's painted ground, on the scenery's array texture); the hero and the foes
// are rigged Quaternius models from pools (recoloured per foe kind, animation LOD with distance);
// warnings, health bars, shots, drops, sparks, embers and slashes are instanced billboards. It reads
// the simulation (battle.ts) every frame and turns its events into effects: each combo move has its
// own trail and impact (slash arcs, a spin, a cleave's shockwave lane, a thrust's streak, a launcher's
// sparks, a plunge's landing ring, a lance, rains and meteors), the hero leaps and spins with its own
// clips and launched foes fly.
// 1.2: the loose crates (one merged mesh, rebuilt as they break), a ring under the soft target, the
// heavy charge as a filling gold ring on the ground and a glow on the weapon hand (no pips over the
// head), the perfect dodge, and the foes' states shown on them (burning embers, stun stars, roots).
import { THREE } from '@core/three';
import { FOE, CLASS, POWER_COLOR, CHARGE_T, type FoeKind, type ArenaKind, type ClassId, type ComboId } from './defs';
import { buildArena, type ArenaLayout, type ArenaLook } from './arena';
import type { Battle, BattleEvent, Foe } from './battle';
import { Figure, FigurePool } from './figure';
import { heroKey, modelKey } from './kit';
import { villageKey, type Placed } from './keys';
import { mergeScenery, sceneryMaterial, sceneryTexture, sceneryReady, groundExtra, type Extra } from './scenery';
import { Billboards, Particles, Telegraphs, HealthBars, TEX, SHAPE, stepBar, type BarState } from './fx3d';
import { WeaponRack } from './weaponview';
import { FOE_GEAR, type WeaponModel } from './weapons';

/** Model sizes: the RPG heroes are 2.9 units tall, the pirate skeletons 1.5. */
export const HERO_SCALE = 0.4;
export const modelScale = (model: string): number => (model === 'skeleton' || model === 'headless' ? 0.78 : HERO_SCALE);

/**
 * Each arena's sky, fog and light, and its ground (1.3: painted per vertex, sRGB: `ground` the base,
 * `patch` the darker or greener spots, `worn` the trodden middle; `y` its height).
 */
export const ARENA_LOOK: Record<ArenaKind, { sky: number; fog: number; ground: number; patch: number; worn?: number; y?: number; sun: number; amb: number; hemi: [number, number] }> = {
  field: { sky: 0x8ec8e8, fog: 0x9ccbe0, ground: 0x6a9a44, patch: 0x4f8636, worn: 0x9a8a5a, sun: 2.3, amb: 1.5, hemi: [0xe4f4ff, 0x6a5a40] },
  forest: { sky: 0x7ab0a8, fog: 0x86b8a8, ground: 0x4f7f36, patch: 0x3a6a2c, worn: 0x7a6a44, sun: 2.0, amb: 1.4, hemi: [0xdff0e0, 0x4a5a30] },
  farm: { sky: 0xf0c890, fog: 0xe8c898, ground: 0x7a9a44, patch: 0x5f8a38, worn: 0xa8875a, sun: 2.4, amb: 1.5, hemi: [0xfff0d8, 0x7a6040] },
  mine: { sky: 0x14100c, fog: 0x1a140e, ground: 0x6a5a48, patch: 0x4a4038, worn: 0x7a6852, sun: 1.5, amb: 1.6, hemi: [0xffe0b8, 0x5a4a38] },
  cavern: { sky: 0x120e10, fog: 0x18121a, ground: 0x5a5058, patch: 0x3e3640, worn: 0x6a5e5a, sun: 1.6, amb: 1.7, hemi: [0xffd8b0, 0x50465a] },
  fort: { sky: 0xb8c8d8, fog: 0xb0c0cc, ground: 0x6a8a48, patch: 0x56703c, worn: 0x8a7e60, sun: 2.2, amb: 1.4, hemi: [0xe8f0ff, 0x5a5040] },
  tower: { sky: 0x2a1a3a, fog: 0x2a1c3a, ground: 0x3a2e48, patch: 0x302640, sun: 1.3, amb: 1.4, hemi: [0xe0d0ff, 0x302040] },
  spire: { sky: 0x3a1e5a, fog: 0x4a2a6a, ground: 0x2a1a3a, patch: 0x22162e, y: -3, sun: 1.6, amb: 1.4, hemi: [0xe8d8ff, 0x382050] },
  docks: { sky: 0x9ad0f0, fog: 0xa8d4ec, ground: 0x2a5a6a, patch: 0x3a6a5a, y: -0.9, sun: 2.3, amb: 1.5, hemi: [0xeaf6ff, 0x405a6a] },
  court: { sky: 0x4a3a4a, fog: 0x4a3c48, ground: 0x4a4440, patch: 0x3a3634, sun: 1.6, amb: 1.35, hemi: [0xf0d8d8, 0x3a3030] },
  hall: { sky: 0x1a1218, fog: 0x1e141a, ground: 0x2a2024, patch: 0x221a1e, sun: 1.2, amb: 1.35, hemi: [0xffd8c8, 0x302020] },
  throne: { sky: 0x200a10, fog: 0x2a0c14, ground: 0x2a1418, patch: 0x221014, sun: 1.3, amb: 1.35, hemi: [0xffc8c8, 0x401818] },
  rift: { sky: 0x160a24, fog: 0x24103a, ground: 0x1a1028, patch: 0x241438, y: -9, sun: 1.3, amb: 1.4, hemi: [0xd8c8ff, 0x281838] },
};

/** A smooth value noise in 0…1 (the ground's patches). */
function noise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => { const t = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return t - Math.floor(t); };
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

/** The north's meadows are stonier, its forests under patches of snow. */
const NORTH_GROUND: Partial<Record<ArenaKind, { ground: number; patch: number; worn: number }>> = {
  field: { ground: 0x6c8a52, patch: 0x8c9088, worn: 0x8a8068 },
  forest: { ground: 0x5a7a46, patch: 0xe4eaf2, worn: 0x8a8678 },
};

/** The arena's ground: its look's colours in soft patches, the middle worn where the fights go. */
function arenaGround(kind: ArenaKind, layout: ArenaLayout, seed: number, look: ArenaLook): Extra {
  const L = { ...ARENA_LOOK[kind], ...(look === 'north' ? NORTH_GROUND[kind] : undefined) };
  const lin = (hex: number) => { const c = new THREE.Color().setHex(hex); return [c.r, c.g, c.b]; };
  const base = lin(L.ground), patch = lin(L.patch), worn = L.worn !== undefined ? lin(L.worn) : null;
  return groundExtra(96, 96, 1.6, L.y ?? -0.02, (x, z) => {
    const n = noise(x * 0.18, z * 0.18, seed) * 0.65 + noise(x * 0.6, z * 0.6, seed + 3) * 0.35;
    const k = Math.min(1, Math.max(0, (n - 0.42) * 3.2));
    const c = [0, 1, 2].map((i) => base[i] + (patch[i] - base[i]) * k);
    if (worn) {
      const e = Math.hypot(x / (layout.hx * 0.75), z / (layout.hz * 0.8));
      const w = Math.max(0, Math.min(1, (1.15 - e) * 2.2)) * (0.45 + noise(x * 0.5, z * 0.5, seed + 9) * 0.55);
      for (let i = 0; i < 3; i++) c[i] += (worn[i] - c[i]) * w * 0.75;
    }
    return c as [number, number, number];
  });
}

interface ArenaBuilt {
  group: THREE.Group; layout: ArenaLayout; water: THREE.Mesh | null; shrine: THREE.Mesh; crates: THREE.Mesh | null; mask: string; seed: number; look: ArenaLook;
  /** Built with the scenery kits in (else the ground alone, completed when they arrive). */
  full: boolean;
  /** The pieces round the floor (they cast shadows), the backdrop beyond (they do not), the ground. */
  near: THREE.Mesh; far: THREE.Mesh; ground: THREE.Mesh;
}

/** The scenery split for the shadow pass: what stands near the floor casts shadows, the backdrop does not. */
function splitScenery(layout: ArenaLayout): [Placed[], Placed[]] {
  const near: Placed[] = [], far: Placed[] = [];
  for (const p of layout.deco) (Math.abs(p.x) < layout.hx + 3.5 && p.z > -layout.hz - 3.5 && p.z < layout.hz + 3.5 ? near : far).push(p);
  return [near, far];
}

const SHRINE: Placed = { key: villageKey('Prop_Chimney2'), x: 0, y: 0, z: 0, rot: 0.4, s: 0.62, sy: 0.42 };

export interface FoeView { fig: Figure; pool: FigurePool; bar: BarState; animN: number; spawnT: number }

const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

export class BattleView {
  readonly root = new THREE.Group();
  private arenas = new Map<string, ArenaBuilt>();
  private arena: ArenaBuilt | null = null;
  readonly heroPos = new THREE.Vector3(0, 0, 0);
  readonly camPos = new THREE.Vector3();
  /** 1.3: the scenery's array texture and material (scenery.ts). */
  private layers: ReturnType<typeof sceneryTexture>;
  private sceneryMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  hero: Figure;
  heroCls: ClassId;
  private heroFigs = new Map<ClassId, Figure>();
  private pools = new Map<string, FigurePool>();
  readonly foes = new Map<number, FoeView>();
  private heroAnimN = -1;
  // effects
  readonly sparks: Particles;
  readonly dust: Particles;
  readonly shadows: Billboards;
  readonly glows: Billboards;
  readonly flats: Billboards;
  readonly slashes: Billboards;
  readonly streaks: Billboards;
  readonly bubbles: Billboards;
  readonly marks: Billboards;
  readonly tele: Telegraphs;
  readonly bars: HealthBars;
  /** 1.2: every weapon in sight, one draw call. */
  readonly rack: WeaponRack;
  /** 1.2: the spoils lying on the ground after a won fight (a weapon's model, a shield, an orb), with a beam of their rarity. */
  private loot: { model: WeaponModel | null; color: number; x: number; z: number; vx: number; vz: number; t: number; spin: number }[] = [];
  private fx: { kind: string; x: number; z: number; r: number; t: number; max: number; color: number; ang: number; len?: number }[] = [];
  private time = 0;
  shakeT = 0;
  shakeK = 0;
  /** The menu's backdrop looks from a little further. */
  camDist = 1;
  lookAhead = 0;

  constructor(cls: ClassId, private menu = false) {
    this.layers = sceneryTexture();
    this.sceneryMat = sceneryMaterial(this.layers, this.heroPos, this.camPos);
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8ab8, transparent: true, opacity: 0.88, emissive: 0x0a2a3a });
    this.heroCls = cls;
    this.hero = this.heroFig(cls);
    this.hero.root.visible = true;
    this.sparks = new Particles(this.root, TEX.glow(), 600, 'add', 14);
    this.dust = new Particles(this.root, TEX.soft(), 300, 'normal', 13);
    this.shadows = new Billboards(this.root, TEX.shadow(), 48, { blend: 'normal', flat: true, order: 2, fade: true });
    this.glows = new Billboards(this.root, TEX.glow(), 160, { blend: 'add', order: 16 });
    this.flats = new Billboards(this.root, TEX.ring(), 64, { blend: 'add', flat: true, order: 5 });
    this.slashes = new Billboards(this.root, TEX.slash(), 24, { blend: 'add', flat: true, order: 15 });
    this.streaks = new Billboards(this.root, TEX.streak(), 64, { blend: 'add', flat: true, order: 15 });
    this.bubbles = new Billboards(this.root, TEX.bubble(), 4, { blend: 'add', order: 17 });
    this.marks = new Billboards(this.root, TEX.splat(), 40, { blend: 'normal', flat: true, order: 3, fade: true });
    this.tele = new Telegraphs(this.root, 64);
    this.bars = new HealthBars(this.root, 40);
    this.rack = new WeaponRack(this.root);
    // every foe look, one figure each ahead (so the shaders and the first spawns are ready)
    for (const m of ['rogue', 'ranger', 'skeleton', 'headless', 'monk', 'cleric', 'warrior', 'wizard']) this.pool(modelKey(m), modelScale(m), menu ? 1 : 2);
  }

  private heroFig(cls: ClassId): Figure {
    let f = this.heroFigs.get(cls);
    if (!f) {
      f = new Figure(heroKey(cls), HERO_SCALE, { shadows: true, mid: 1.4 });
      f.root.visible = false;
      this.root.add(f.root);
      this.heroFigs.set(cls, f);
    }
    return f;
  }

  setHero(cls: ClassId): void {
    if (cls === this.heroCls) return;
    this.hero.root.visible = false;
    this.heroCls = cls;
    this.hero = this.heroFig(cls);
    this.hero.reset();
    this.hero.root.visible = true;
    this.heroAnimN = -1;
  }

  private pool(key: string, scale: number, prewarm = 0): FigurePool {
    let p = this.pools.get(key);
    if (!p) { p = new FigurePool(this.root, key, scale, { shadows: true, mid: 1.4 }, prewarm); this.pools.set(key, p); }
    return p;
  }

  // ------------------------------------------------------------------ the arena

  /**
   * Shows the arena of a room (built once, kept for the round). `look` is the overworld region's
   * (the north's pines and snow). Before the scenery kits arrive it shows the ground alone and is
   * built again when they do (sync).
   */
  showArena(kind: ArenaKind, seed: number, look: ArenaLook = 'south'): ArenaLayout {
    const key = kind + ':' + seed + ':' + look;
    let a = this.arenas.get(key);
    if (!a) {
      const layout = buildArena(kind, seed, look);
      const group = new THREE.Group();
      const [nearList, farList] = splitScenery(layout);
      const near = new THREE.Mesh(mergeScenery(nearList), this.sceneryMat);
      near.receiveShadow = true; near.castShadow = true;
      const far = new THREE.Mesh(mergeScenery(farList), this.sceneryMat);
      far.receiveShadow = true;
      const ground = new THREE.Mesh(mergeScenery([], [arenaGround(kind, layout, seed, look)]), this.sceneryMat);
      ground.receiveShadow = true;
      group.add(ground, near, far);
      let water: THREE.Mesh | null = null;
      if (layout.water) {
        water = new THREE.Mesh(new THREE.PlaneGeometry(90, 90, 1, 1), this.waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.5;
        group.add(water);
      }
      // the loose crates: one mesh of the ones still standing
      let crates: THREE.Mesh | null = null;
      if (layout.breakables.length) {
        crates = new THREE.Mesh(this.crateGeometry(layout, ''), this.sceneryMat);
        crates.castShadow = true; crates.receiveShadow = true;
        group.add(crates);
      }
      // the shrine: a squat stone stack
      const shrine = new THREE.Mesh(mergeScenery([SHRINE]), this.sceneryMat);
      shrine.castShadow = true;
      shrine.visible = false;
      group.add(shrine);
      group.visible = false;
      this.root.add(group);
      a = { group, layout, water, shrine, crates, mask: '', seed, look, full: sceneryReady(), near, far, ground };
      this.arenas.set(key, a);
    }
    if (this.arena && this.arena !== a) this.arena.group.visible = false;
    this.arena = a;
    this.current = { kind, seed, look };
    a.group.visible = true;
    return a.layout;
  }

  /** The scenery arrived after the arena was shown: build its pieces now (the crates as they stand). */
  private completeArena(a: ArenaBuilt): void {
    a.full = true;
    const old = [a.near.geometry, a.far.geometry, a.shrine.geometry, a.crates?.geometry];
    const [nearList, farList] = splitScenery(a.layout);
    a.near.geometry = mergeScenery(nearList);
    a.far.geometry = mergeScenery(farList);
    a.shrine.geometry = mergeScenery([SHRINE]);
    if (a.crates) a.crates.geometry = this.crateGeometry(a.layout, a.mask);
    for (const g of old) g?.dispose();
  }

  get layout(): ArenaLayout | null { return this.arena?.layout ?? null; }

  /** The merged geometry of the crates not broken (`mask`: '1' per broken one). */
  private crateGeometry(layout: ArenaLayout, mask: string): THREE.BufferGeometry {
    const list = layout.breakables.filter((_, i) => mask[i] !== '1').map((c) => ({ key: c.key, x: c.x, y: 0, z: c.z, rot: c.rot, s: c.s }));
    return mergeScenery(list);
  }

  /** Follows the battle's broken crates (rebuilds the mesh when one breaks). */
  private syncCrates(b: Battle): void {
    const a = this.arena;
    if (!a?.crates || b.crates.length !== a.layout.breakables.length) return;
    let mask = '';
    for (const c of b.crates) mask += c.broken ? '1' : '0';
    if (mask === a.mask) return;
    a.mask = mask;
    const old = a.crates.geometry;
    a.crates.geometry = this.crateGeometry(a.layout, mask);
    old.dispose();
  }

  /** The arena shown now (to come back to after building another ahead). */
  current: { kind: ArenaKind; seed: number; look: ArenaLook } | null = null;

  /** Drops what the last battle used (foes back to their pools, effects cleared). */
  clear(): void {
    for (const fv of this.foes.values()) fv.pool.give(fv.fig);
    this.foes.clear();
    this.fx.length = 0;
    this.sparks.clear();
    this.dust.clear();
    this.rack.clear();
    this.loot.length = 0;
    this.heroAnimN = -1;
  }

  /** The spoils fall out round a spot, stand in their rarity's beam, then fly to the hero. */
  dropLoot(items: { model: WeaponModel | null; color: number }[], x: number, z: number): void {
    items.forEach((it, i) => {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2 + 0.6, v = 1.6 + (i % 2) * 0.6;
      this.loot.push({ ...it, x, z, vx: Math.sin(a) * v, vz: Math.cos(a) * v, t: -i * 0.12, spin: a });
    });
  }

  private syncLoot(b: Battle, dt: number): void {
    const h = b.hero;
    for (const l of this.loot) {
      l.t += dt;
      if (l.t < 0) continue;
      let y = 0.35 + Math.sin(this.time * 3 + l.spin) * 0.06;
      if (l.t < 0.55) { const k = l.t / 0.55; l.x += l.vx * dt; l.z += l.vz * dt; y = 0.2 + Math.sin(k * Math.PI) * 1.3; }
      else if (l.t > 1.6) {
        // drawn to the hero
        const dx = h.x - l.x, dz = h.z - l.z, d = Math.hypot(dx, dz), v = Math.min(d, dt * (6 + (l.t - 1.6) * 18));
        if (d < 0.4) { this.sparks.burst(l.x, 0.8, l.z, 14, 3, [l.color, 0xffffff], 0.45, 0.3, 1); l.t = -99; continue; }
        l.x += (dx / d) * v; l.z += (dz / d) * v; y += Math.min(0.6, (l.t - 1.6) * 1.2);
      }
      l.spin += dt * 1.8;
      // the beam of its rarity, a ring on the ground, the item itself
      const beam = Math.min(1, l.t * 3) * (l.t > 1.6 ? 0.5 : 1);
      this.glows.add(l.x, 1.7, l.z, 0.55, 3.4, 0, l.color, 0.55 * beam);
      this.glows.add(l.x, 1.7, l.z, 0.2, 3.2, 0, 0xffffff, 0.5 * beam);
      this.flats.add(l.x, 0.05, l.z, 1.4, 1.4, this.time * 2, l.color, 0.7 * beam);
      if (l.model) this.rack.onGround(l.model, l.x, l.z, y, l.spin);
      else { this.glows.add(l.x, y + 0.2, l.z, 0.8, 0.8, 0, l.color, 1); this.glows.add(l.x, y + 0.2, l.z, 0.3, 0.3, 0, 0xffffff, 1); }
    }
    this.loot = this.loot.filter((l) => l.t > -50);
  }

  /** Once the scenery kits are in: the texture's layers uploaded, the arena on show completed. */
  settle(): void {
    if (!sceneryReady()) return;
    this.layers.refresh();
    if (this.arena && !this.arena.full) this.completeArena(this.arena);
  }

  /** Frees the arenas built so far (they are rebuilt when needed). */
  dropArenas(): void {
    for (const a of this.arenas.values()) {
      if (a === this.arena) continue;
      this.root.remove(a.group);
      a.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        if (m.material !== this.sceneryMat && m.material !== this.waterMat) (m.material as THREE.Material).dispose();
      });
    }
    for (const [k, a] of [...this.arenas]) if (a !== this.arena) this.arenas.delete(k);
  }

  // ------------------------------------------------------------------ events

  handle(ev: BattleEvent, b: Battle): void {
    const fx = (kind: string, x: number, z: number, r: number, max: number, color: number, ang = 0, len?: number) => this.fx.push({ kind, x, z, r, t: 0, max, color, ang, len });
    const ahead = (d: number, a = 0): [number, number] => [b.hero.x + Math.sin(a) * d, b.hero.z + Math.cos(a) * d];
    switch (ev.type) {
      case 'swing': {
        // the trail of each move, coloured by its combo (the class's own, ember for the heavy chain, sky for the dash)
        const col = trailColor(b.st.cls, ev.chain, ev.finisher);
        const [ax, az] = ahead(0.8, ev.face);
        switch (ev.fx) {
          case 'slash': fx('slash', ax, az, ev.finisher ? 2.6 : 2.0, 0.22, col, ev.face); break;
          case 'stab': fx('slash', ax, az, 1.3, 0.16, col, ev.face); fx('streak', ev.x, ev.z, 0.35, 0.16, col, ev.face, 2.0); break;
          case 'kick': fx('slash', ax, az, 1.5, 0.18, col, ev.face); this.dust.burst(ev.x, 0.15, ev.z, 4, 1.5, [0xc8b8a0], 0.35, 0.4, 0.2); break;
          case 'spin': fx('spin', ev.x, ev.z, 2.3, 0.5, col); break;
          case 'cleave': fx('slash', ax, az, 3.2, 0.32, col, ev.face); this.sparks.burst(ev.x, 2.2, ev.z, 10, 2, [col, 0xffffff], 0.35, 0.3, 0.6); break;
          case 'thrust': fx('streak', ev.x, ev.z, 0.7, 0.28, col, ev.face, 3.6); this.dust.burst(ev.x, 0.15, ev.z, 8, 2.5, [0xc8b8a0, 0xa89880], 0.4, 0.5, 0.2); break;
          case 'rise': fx('slash', ax, az, 2.0, 0.24, col, ev.face + Math.PI); this.sparks.burst(ax, 0.4, az, 10, 2.5, [col, 0xffffff], 0.4, 0.3, 5); break;
          case 'plunge': this.dust.burst(ev.x, 0.15, ev.z, 10, 2.5, [0xc8b8a0, 0xa89880], 0.5, 0.6, 0.6); this.sparks.burst(ev.x, 0.6, ev.z, 8, 2, [col], 0.4, 0.3, 3); break;
          case 'power': this.sparks.burst(ax, 0.9, az, 12, 3, [col, 0xffffff], 0.3, 0.3, 0.3); fx('flash', ax, az, 0.9, 0.2, col); break;
          case 'burst': case 'consecrate': case 'lance': case 'palm': fx('flash', ev.x, ev.z, 1.2, 0.25, col); break;
        }
        break;
      }
      case 'strike': {
        const col = trailColor(b.st.cls, ev.chain, ev.finisher);
        switch (ev.fx) {
          case 'spin':
            fx('ring', ev.x, ev.z, ev.r, 0.35, col); fx('flash', ev.x, ev.z, ev.r * 0.8, 0.2, col);
            for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.sparks.emit(ev.x + Math.sin(a) * ev.r * 0.8, 0.8, ev.z + Math.cos(a) * ev.r * 0.8, Math.cos(a) * 4, 0.6, -Math.sin(a) * 4, 0.35, 0.3, 0.05, col, 2); }
            break;
          case 'cleave': case 'palm': {
            // the shockwave lane: a bright crack along the ground, dust and stones flying
            const len = ev.wave || 4;
            fx('streak', ev.x, ev.z, 1.0, 0.45, col, ev.face, len + 0.6);
            fx('crack', ev.x, ev.z, 1.2, 1.6, 0x1a1008, ev.face, len);
            for (let i = 1; i <= 6; i++) { const d = (i / 6) * len; this.dust.burst(ev.x + Math.sin(ev.face) * d, 0.3, ev.z + Math.cos(ev.face) * d, 4, 2, [0x9a8a70, 0x7a6a58], 0.6, 0.8, 1.2); this.sparks.burst(ev.x + Math.sin(ev.face) * d, 0.4, ev.z + Math.cos(ev.face) * d, 3, 2.5, [col, 0xffe8c0], 0.4, 0.3, 2); }
            fx('ring', ev.x + Math.sin(ev.face) * 1.6, ev.z + Math.cos(ev.face) * 1.6, 2.2, 0.35, col);
            this.shake(0.4, 0.3);
            break;
          }
          case 'plunge': {
            fx('ring', ev.x, ev.z, ev.r, 0.42, col); fx('ring', ev.x, ev.z, ev.r * 0.6, 0.3, 0xffffff); fx('flash', ev.x, ev.z, ev.r, 0.25, col);
            this.dust.burst(ev.x, 0.3, ev.z, 26, ev.r * 1.8, [0x9a8a70, 0x7a6a58, 0xc8b8a0], 0.9, 1.0, 0.8);
            this.sparks.burst(ev.x, 0.4, ev.z, 20, ev.r * 2, [col, 0xffffff], 0.5, 0.35, 2);
            this.mark(ev.x, ev.z, ev.r * 0.8, 0x2a2018);
            this.shake(0.45, 0.3);
            break;
          }
          case 'rise': { const [x, z] = ahead(1.2, ev.face); fx('flash', x, z, 1.2, 0.2, col); for (let i = 0; i < 12; i++) this.sparks.emit(x + (Math.random() - 0.5), 0.3, z + (Math.random() - 0.5), 0, 6 + Math.random() * 3, 0, 0.45, 0.28, 0.04, col, 0.5, 5); break; }
          case 'thrust': { const [x, z] = ahead(ev.r * 0.7, ev.face); this.sparks.burst(x, 0.8, z, 10, 3.5, [col, 0xffffff], 0.3, 0.3, 0.5); break; }
          case 'lance': {
            const len = ev.wave || 10;
            fx('streak', ev.x, ev.z, 1.5, 0.45, 0xc8a8ff, ev.face, len);
            fx('streak', ev.x, ev.z, 0.6, 0.45, 0xffffff, ev.face, len);
            for (let i = 1; i <= 8; i++) { const d = (i / 8) * len; this.sparks.burst(ev.x + Math.sin(ev.face) * d, 0.9, ev.z + Math.cos(ev.face) * d, 3, 2, [0xb08aff, 0xffffff, 0x7ac8ff], 0.45, 0.3, 1); }
            this.shake(0.3, 0.25);
            break;
          }
          case 'consecrate': {
            fx('ring', ev.x, ev.z, ev.r, 0.5, 0xffe27a); fx('ring', ev.x, ev.z, ev.r * 0.65, 0.4, 0xffffff); fx('flash', ev.x, ev.z, ev.r, 0.3, 0xffe27a);
            for (let i = 0; i < 20; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * ev.r; this.sparks.emit(ev.x + Math.sin(a) * d, 0.2, ev.z + Math.cos(a) * d, 0, 3 + Math.random() * 3, 0, 0.7, 0.3, 0.05, 0xffe27a, 0.5); }
            this.shake(0.3, 0.25);
            break;
          }
        }
        break;
      }
      case 'charge': {
        const col = trailColor(b.st.cls, 'heavy', true);
        if (ev.full) { fx('ring', ev.x, ev.z, 1.6, 0.3, 0xffffff); this.sparks.burst(ev.x, 1.0, ev.z, 16, 3, [col, 0xffffff], 0.35, 0.3, 1); }
        else fx('ring', ev.x, ev.z, 1.2, 0.3, col);
        break;
      }
      case 'lastStand': fx('ring', ev.x, ev.z, 3, 0.6, 0xffd86a); this.sparks.burst(ev.x, 0.8, ev.z, 40, 5, [0xffd86a, 0xff7a2a, 0xffffff], 0.8, 0.4, 2); break;
      case 'hit': {
        const y = 0.75;
        this.sparks.burst(ev.x, y, ev.z, ev.crit ? 18 : 9, ev.crit ? 7 : 5, ev.crit ? [0xffe27a, 0xffffff, 0xff9a3a] : [0xffffff, 0xffd8a0], 0.35, 0.32);
        const fv = this.foes.get(ev.id);
        if (fv) { fv.fig.flash(ev.crit ? 0.14 : 0.09); }
        if (ev.heavy) fx('ring', ev.x, ev.z, 1.0, 0.22, 0xffe8c0);
        if (ev.src === 'fireball' || ev.src === 'burn') this.sparks.burst(ev.x, 0.8, ev.z, 8, 4, [0xff7a2a, 0xffc04a], 0.5, 0.4, 1);
        break;
      }
      case 'kill': {
        this.sparks.burst(ev.x, 0.7, ev.z, ev.boss ? 60 : 22, ev.boss ? 9 : 6, [0xffffff, 0xffd27a, 0xff8a5a], 0.6, 0.45, 0.8);
        this.dust.burst(ev.x, 0.3, ev.z, ev.boss ? 30 : 10, 3, [0x8a7a6a, 0x6a5a4a], 0.9, 0.9, 0.3);
        fx('ring', ev.x, ev.z, ev.boss ? 4 : 1.3, 0.35, 0xffd27a);
        if (ev.boss) this.shake(0.5, 0.6);
        break;
      }
      case 'hurt': this.hero.flash(0.12); this.hero.hurtFlush(1); this.sparks.burst(ev.x, 0.8, ev.z, 10, 5, [0xff5a4a, 0xffffff], 0.35, 0.3); this.shake(0.18, 0.18); break;
      case 'shieldHit': fx('ring', ev.x, ev.z, 1.8, 0.3, POWER_COLOR.shield); this.sparks.burst(ev.x, 0.8, ev.z, 14, 5, [0x8ab8ff, 0xffffff], 0.4, 0.3); break;
      case 'block': this.sparks.burst(ev.x, 0.9, ev.z, ev.broke ? 24 : 8, ev.broke ? 6 : 4, [0xd8e8ff, 0xffffff], 0.3, 0.25); if (ev.broke) fx('ring', ev.x, ev.z, 2.2, 0.35, 0x9ad8ff); break;
      case 'dodge': this.dust.burst(ev.x, 0.15, ev.z, 8, 2.5, [0xc8b8a0, 0xa89880], 0.5, 0.6, 0.2); break;
      case 'skill': {
        const sd = CLASS[b.st.cls].skills.find((s) => s.id === ev.id);
        fx('ring', ev.x, ev.z, 1.8, 0.35, sd?.color ?? 0xffffff);
        this.sparks.burst(ev.x, 0.9, ev.z, 14, 4, [sd?.color ?? 0xffffff, 0xffffff], 0.5, 0.35, 1);
        if (ev.id === 'whirl') fx('whirl', ev.x, ev.z, 2.5, 1.6, sd?.color ?? 0xff6a4a);
        break;
      }
      case 'boom': {
        const col: Record<string, number> = {
          rain: 0xfff0c8, frostpatch: 0x8ae8ff, cleave: 0xffb06a, lance: 0xc8a8ff, consecrate: 0xffe27a,
          holy: 0xffe27a, smoke: 0x9aa4b8, heal: 0x7aff9a, nova: 0x8ae8ff, fire: 0xff7a2a, smite: 0xffe27a, bash: 0xffb04a, palm: 0x7ad8ff,
          whirl: 0xff6a4a, slam: 0xff9a5a, slamLand: 0xff9a5a, quake: 0xd8a070, rock: 0xb09070, frost: 0x8ae8ff, meteor: 0xff6a2a, blast: 0xff8a3a,
          cut: 0xffd0c0, blink: 0xc87aff, whirlBoss: 0xff5a4a,
        };
        const c = col[ev.kind] ?? 0xffffff;
        if (ev.kind === 'whirl') { this.sparks.burst(ev.x, 0.7, ev.z, 4, 4, [c], 0.25, 0.3); break; }
        // the shockwave lanes are drawn by their strike; their zone only adds a puff
        if (ev.kind === 'cleave' || ev.kind === 'lance' || ev.kind === 'palm' && ev.r > 2.4) { this.sparks.burst(ev.x, 0.5, ev.z, 6, 2, [c], 0.3, 0.3); break; }
        if (ev.kind === 'rain') {
          // the arrows come down: streaks falling into the circle, splinters and dust
          fx('ring', ev.x, ev.z, ev.r, 0.4, c);
          for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * ev.r; this.sparks.emit(ev.x + Math.sin(a) * d, 2.5, ev.z + Math.cos(a) * d, 0, -14, 0, 0.18, 0.22, 0.05, 0xfff0c8, 0); }
          this.dust.burst(ev.x, 0.3, ev.z, 14, ev.r * 1.4, [0x9a8a70, 0x7a6a58], 0.7, 0.8, 0.5);
          this.sparks.burst(ev.x, 0.3, ev.z, 12, ev.r * 2, [0xfff0c8, 0xd8b04a], 0.4, 0.25, 1.5);
          break;
        }
        fx('ring', ev.x, ev.z, ev.r, 0.4, c);
        if (ev.kind !== 'cut') fx('flash', ev.x, ev.z, ev.r * 0.9, 0.25, c);
        const n = Math.round(10 + ev.r * 6);
        if (ev.kind === 'smoke') this.dust.burst(ev.x, 0.6, ev.z, 40, 3.5, [0x8a90a0, 0xb8bcc8, 0x6a7080], 1.6, 1.6, 0.4);
        else if (ev.kind === 'nova' || ev.kind === 'frost') this.sparks.burst(ev.x, 0.5, ev.z, n, ev.r * 2, [0xbaf4ff, 0xffffff, 0x6ac8ff], 0.6, 0.4, 0.4);
        else if (ev.kind === 'fire' || ev.kind === 'meteor' || ev.kind === 'blast') { this.sparks.burst(ev.x, 0.5, ev.z, n, ev.r * 2.2, [0xff7a2a, 0xffc04a, 0xff3a1a], 0.7, 0.5, 1.2, 2); this.dust.burst(ev.x, 0.4, ev.z, 10, 2, [0x3a2a20], 1.2, 1.2, 0.5); this.mark(ev.x, ev.z, ev.r * 1.1, 0x1a1008); }
        else if (ev.kind === 'slam' || ev.kind === 'slamLand' || ev.kind === 'quake' || ev.kind === 'rock') { this.dust.burst(ev.x, 0.3, ev.z, n, ev.r * 1.6, [0x9a8a70, 0x7a6a58], 0.9, 1.0, 0.5); this.mark(ev.x, ev.z, ev.r * 0.9, 0x2a2018); if (ev.r > 2.2) this.shake(0.2, 0.2); }
        else this.sparks.burst(ev.x, 0.6, ev.z, n, ev.r * 1.8, [c, 0xffffff], 0.5, 0.4, 0.6);
        break;
      }
      case 'pickup': {
        const c = ev.kind === 'sigil' ? 0xff5a7a : ev.kind === 'gold' ? 0xffd23f : ev.kind === 'potion' ? 0xff5a6a : POWER_COLOR[ev.power!];
        if (ev.kind === 'sigil') fx('ring', this.heroPos.x, this.heroPos.z, 1.8, 0.45, c);
        this.sparks.burst(ev.x, 0.6, ev.z, ev.kind === 'gold' ? 4 : 18, 3, [c, 0xffffff], 0.4, 0.25, 0.8);
        if (ev.kind === 'power') fx('ring', this.heroPos.x, this.heroPos.z, 2.2, 0.45, c);
        break;
      }
      case 'potion': case 'heal': this.sparks.burst(ev.x, 0.4, ev.z, 20, 2.2, [0x7aff9a, 0xd8ffd8], 0.9, 0.3, 1.4, -1.5); fx('ring', ev.x, ev.z, 1.6, 0.4, 0x7aff9a); break;
      case 'spawn': {
        fx('spawn', ev.x, ev.z, ev.boss ? 2.2 : 0.9, 0.8, ev.boss ? 0xc8203a : 0x6a3aa8);
        this.dust.burst(ev.x, 0.2, ev.z, ev.boss ? 24 : 8, 2, [0x4a3a5a, 0x2a2030], 0.8, 0.8, 0.5);
        break;
      }
      case 'smash': {
        // splinters, dust and a puff of straw
        this.dust.burst(ev.x, 0.4, ev.z, 14, 2.4, [0x9a7a4a, 0x7a5a32, 0xc8a878], 0.6, 0.7, 1.2);
        this.sparks.burst(ev.x, 0.6, ev.z, 10, 3.2, [0xd8b078, 0xffe0a0], 0.45, 0.22, 3);
        fx('ring', ev.x, ev.z, 1.0, 0.25, 0xffe0a0);
        break;
      }
      case 'perfect': {
        fx('ring', ev.x, ev.z, 2.4, 0.45, 0x8ae8ff); fx('ring', ev.x, ev.z, 1.4, 0.35, 0xffffff); fx('flash', ev.x, ev.z, 1.6, 0.3, 0x8ae8ff);
        this.sparks.burst(ev.x, 0.9, ev.z, 22, 4.5, [0x8ae8ff, 0xffffff, 0xc8f4ff], 0.5, 0.3, 1);
        break;
      }
      case 'trap': if (ev.sprung) { this.sparks.burst(ev.x, 0.3, ev.z, 16, 4, [0xd8b04a, 0xffffff], 0.4, 0.3); fx('ring', ev.x, ev.z, 2.2, 0.35, 0xd8b04a); } break;
      case 'freeze': break;
      case 'room': this.clear(); break;
    }
  }

  private mark(x: number, z: number, r: number, color: number): void { this.fx.push({ kind: 'mark', x, z, r, t: 0, max: 4, color, ang: Math.random() * 6 }); }

  shake(k: number, t: number): void { this.shakeK = Math.max(this.shakeK, k); this.shakeT = Math.max(this.shakeT, t); }

  // ------------------------------------------------------------------ each frame

  sync(b: Battle, dt: number, cam: THREE.PerspectiveCamera, camQ: THREE.Quaternion): void {
    this.time += dt;
    this.settle();
    this.rack.begin();
    const h = b.hero;
    // the hero
    const hf = this.hero;
    hf.root.visible = true;
    // a leap lifts the hero off the ground along its arc
    hf.root.position.set(h.x, h.air, h.z);
    hf.root.rotation.y = h.face;
    if (h.animN !== this.heroAnimN) {
      this.heroAnimN = h.animN;
      const once = h.state === 'attack' || h.state === 'charge' || h.state === 'skill' || h.state === 'dodge' || h.state === 'hit' || h.state === 'dead';
      hf.play(h.anim, { speed: h.animSpeed, once, restart: once, fade: once ? 0.06 : 0.15 });
    } else if (h.state === 'run' || h.state === 'idle') hf.play(h.anim, { speed: h.animSpeed });
    // the blessed step (the cleric's dodge) glides; the whirlwind spins
    const whirl = h.state === 'skill' && b.cls.skills[h.skill - 1]?.id === 'whirl';
    // a spinning finisher turns the body full circles over the blow
    const bl = h.state === 'attack' ? h.blow : null;
    const spin = bl?.spin ? Math.min(1, h.t / (bl.dur / Math.max(0.1, h.animSpeed / bl.speed) * 0.8)) * Math.PI * 2 * bl.spin : 0;
    hf.root.rotation.y = whirl ? h.face + this.time * 16 : h.face + spin;
    // charging the heavy finisher: a pulsing ember glow, white when it is full
    const charge = h.state === 'charge' ? (h.charged ? 0x3a2c14 : 0x1c0c02) : 0;
    // i-frames: a cool sheen while the roll carries the hero through blows
    const iframes = h.state === 'dodge' && h.invuln > 0 ? (b.cls.dodgeAnim === 'Run' ? 0x3a3418 : 0x0c2430) : 0;
    hf.setGlow(charge || iframes || (h.powers.rage > 0 ? 0x2a0400 : h.hidden > 0 ? 0x101828 : 0));
    if (h.state === 'charge' && Math.random() < dt * 30) {
      // sparks drawn in towards the hero
      const a = Math.random() * Math.PI * 2, d = 1.4 + Math.random() * 0.6, col = trailColor(b.st.cls, 'heavy', true);
      this.sparks.emit(h.x + Math.sin(a) * d, 0.3 + Math.random() * 1.2, h.z + Math.cos(a) * d, -Math.sin(a) * d * 2.6, 0.4, -Math.cos(a) * d * 2.6, 0.35, 0.22, 0.05, h.charged ? 0xffffff : col, 0);
    }
    hf.mat.transparent = h.hidden > 0;
    hf.mat.opacity = h.hidden > 0 ? 0.45 : 1;
    hf.update(dt);
    // the weapon in hand (the equipped item's model) and the warrior's shield
    if (b.st.weaponModel) this.rack.inHand(hf, b.st.cls, b.st.weaponModel); else hf.hideWeapon = false;
    if (b.st.shield) this.rack.onArm(hf, b.st.shield);
    this.heroPos.set(h.x, 0.9, h.z);
    this.syncCrates(b);
    // the foes
    const live = new Set<number>();
    for (const f of b.foes) {
      live.add(f.id);
      let fv = this.foes.get(f.id);
      if (!fv) {
        const d = FOE[f.kind];
        const pool = this.pool(modelKey(d.model), modelScale(d.model));
        const fig = pool.take();
        fig.root.scale.setScalar(d.scale);
        fig.setLook(d.hue, d.sat, d.tint, d.glow);
        fv = { fig, pool, bar: { ghost: 1, hold: 0, a: 0, last: 1, seen: false }, animN: -1, spawnT: 0 };
        this.foes.set(f.id, fv);
      }
      this.syncFoe(f, fv, dt, cam);
    }
    for (const [id, fv] of this.foes) if (!live.has(id)) { fv.pool.give(fv.fig); this.foes.delete(id); }
    // the camera follows the hero, a little ahead
    const L = this.layout;
    const look = 1;
    // landscape: the camera keeps near the arena's middle sideways (the wide view shows the rest) and
    // holds the hero a little above the screen's middle, clear of the thumbs
    const cx = L ? Math.max(0, L.hx - 6.5) : 99;
    const tx = Math.max(-cx, Math.min(cx, h.x));
    const tz = h.z + 0.4 - this.lookAhead;
    const want = tmpV.set(tx, 10.6 * look * this.camDist, tz + 7.4 * look * this.camDist);
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want); else this.camPos.lerp(want, Math.min(1, dt * 6));
    this.shakeT = Math.max(0, this.shakeT - dt);
    const sk = this.shakeT > 0 ? this.shakeK * (this.shakeT / 0.3) : 0;
    if (this.shakeT <= 0) this.shakeK = 0;
    cam.position.copy(this.camPos).add(tmpV.set((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk, 0));
    cam.lookAt(this.camPos.x, 0.4, this.camPos.z - 7.4 * look * this.camDist - 1.2);
    // the effects
    this.syncFx(b, dt, camQ);
  }

  private syncFoe(f: Foe, fv: FoeView, dt: number, cam: THREE.PerspectiveCamera): void {
    const fig = fv.fig;
    const d = FOE[f.kind];
    const spawning = f.state === 'spawn';
    fig.root.visible = !spawning || f.t > -0.05;
    const rise = spawning ? Math.min(1, Math.max(0, f.t / 0.7)) : 1;
    let y = (rise - 1) * 1.2;
    // the leap: up in an arc over the wind-up
    if (f.atk === 'leap' && f.state === 'wind') { const w = d.windup * 1.3; const k = Math.max(0, (f.t - w * 0.45) / (w * 0.55)); y += Math.sin(Math.min(1, k) * Math.PI) * 3.2; }
    // thrown into the air by a launcher
    if (f.lift > 0 && f.liftMax > 0) y += Math.sin((1 - f.lift / f.liftMax) * Math.PI) * 1.5;
    fig.root.position.set(f.x, y, f.z);
    fig.root.rotation.y = f.face;
    if (f.state === 'dead') { fig.root.position.y = -Math.max(0, f.deadT - 1.4) * 0.8; }
    if (f.animN !== fv.animN) {
      fv.animN = f.animN;
      const once = f.anim === 'Death' || f.anim === 'Hit' || f.state === 'act' || f.state === 'wind';
      fig.play(f.anim, { speed: f.animSpeed, once, restart: true, fade: 0.1 });
    } else if (f.state === 'chase') fig.play(f.anim, { speed: f.animSpeed });
    // frozen: blue and still; stunned: grey glow; winding up: a warm glow
    const glow = f.freeze > 0 ? 0x0a2a4a : f.stun > 0 ? 0x1a1a1a : f.state === 'wind' && !f.boss ? 0x2a0800 : d.glow;
    fig.setGlow(glow);
    // animation LOD: far or off screen updates less often
    const dist = cam.position.distanceTo(fig.root.position);
    fig.update(f.freeze > 0 ? 0 : dt, dist > 22 ? 3 : dist > 15 ? 2 : 1);
    // the foe's own weapon and shield (hero models only; the skeletons keep theirs)
    const gear = d.model !== 'skeleton' && d.model !== 'headless' ? FOE_GEAR[f.kind] : undefined;
    if (gear?.hand && fig.root.visible) this.rack.inHand(fig, d.model, gear.hand); else fig.hideWeapon = false;
    if (gear?.shield && fig.root.visible && f.state !== 'dead') this.rack.onArm(fig, gear.shield);
  }

  private syncFx(b: Battle, dt: number, camQ: THREE.Quaternion): void {
    const h = b.hero;
    this.shadows.begin(camQ);
    this.glows.begin(camQ);
    this.flats.begin(camQ);
    this.slashes.begin(camQ);
    this.streaks.begin(camQ);
    this.bubbles.begin(camQ);
    this.marks.begin(camQ);
    this.tele.begin();
    this.bars.begin();
    // blob shadows
    this.shadows.add(h.x, 0.03, h.z, 1.3 - h.air * 0.2, 1.3 - h.air * 0.2, 0, 0xffffff, 0.8 - h.air * 0.2);
    for (const f of b.foes) if (f.state !== 'dead' || f.deadT < 1.4) this.shadows.add(f.x, 0.03, f.z, f.radius * 2.6, f.radius * 2.6, 0, 0xffffff, f.state === 'spawn' ? 0.3 : 0.75);
    // the warnings
    for (const z of b.zones) {
      if (z.done) continue;
      const fill = 1 - Math.max(0, z.delay) / Math.max(0.01, z.total);
      const col = z.side === 'hero' ? 0xffd23f : z.kind === 'frost' ? 0x6ac8ff : z.kind === 'fire' || z.kind === 'meteor' ? 0xff5a1a : 0xff2a1a;
      const pulse = fill > 0.75 ? (Math.sin(this.time * 30) * 0.5 + 0.5) : 0;
      if (z.shape === 'circle') this.tele.add(SHAPE.circle, z.x, z.z, z.r, 0, 0, 0, 0, fill, col, pulse);
      else if (z.shape === 'ring') this.tele.add(SHAPE.ring, z.x, z.z, z.r, 0, 0, 0, z.a / z.r, fill, col, pulse);
      else if (z.shape === 'cone') this.tele.add(SHAPE.cone, z.x, z.z, z.r, 0, 0, z.ang, z.a, fill, col, pulse);
      else this.tele.add(SHAPE.line, z.x, z.z, 0, z.a, z.len, z.ang, 0, fill, z.kind === 'aim' ? 0xff8a3a : col, pulse);
      if (z.kind === 'rain' && fill > 0.3 && Math.random() < 0.5) this.streaks.add(z.x + (Math.random() - 0.5) * z.r * 1.6, 4 * (1 - fill) + 0.6, z.z + (Math.random() - 0.5) * z.r * 1.6, 0.18, 0.9, 0, 0xfff0c8, 0.9);
      if ((z.kind === 'meteor' || z.kind === 'rock') && fill > 0.4) {
        // the falling stone or fire, seen coming down
        const k = (fill - 0.4) / 0.6;
        this.glows.add(z.x, 9 * (1 - k) + 0.4, z.z, 1.2, 1.2, 0, z.kind === 'meteor' ? 0xff7a2a : 0xc8a888, 0.9);
      }
    }
    // the heavy finisher's charge: a gold ring filling on the ground, the weapon hand glowing
    if (h.state === 'charge') {
      const need = CHARGE_T * (b.has('quick') ? 0.5 : 1);
      const k = Math.min(1, h.chargeT / need);
      this.tele.add(SHAPE.ring, h.x, h.z, 1.25, 0, 0, 0, 0.72, k, h.charged ? 0xfff0c0 : 0xffb04a, h.charged ? 0.5 + 0.5 * Math.sin(this.time * 20) : 0);
      const hand = this.hero.bones.get('WeaponR') ?? this.hero.bones.get('FistR');
      if (hand) {
        hand.getWorldPosition(tmpW);
        const col = h.charged ? 0xfff0c0 : trailColor(b.st.cls, 'heavy', true);
        const sz = (h.charged ? 0.9 : 0.45 + k * 0.35) * (1 + Math.sin(this.time * 22) * 0.08);
        this.glows.add(tmpW.x, tmpW.y, tmpW.z, sz, sz, 0, col, h.charged ? 1 : 0.75);
      }
    }
    // the soft target: a ring under the foe an attack would turn to
    if (h.target && h.state !== 'dead') {
      const f = b.foes.find((o) => o.id === h.target);
      if (f && f.state !== 'dead') { const r = f.radius * 2.7 + 0.3; this.flats.add(f.x, 0.06, f.z, r, r, this.time * 1.5, 0xfff2cc, 0.55); }
    }
    // the foes' states: burning embers, stun stars over the head, roots at the feet
    for (const f of b.foes) {
      if (f.state === 'dead' || f.state === 'spawn') continue;
      if (f.burn > 0 && Math.random() < dt * 14) this.sparks.emit(f.x + (Math.random() - 0.5) * f.radius * 1.6, 0.3 + Math.random() * 0.9, f.z + (Math.random() - 0.5) * f.radius * 1.6, 0, 1.2, 0, 0.5, 0.2, 0.04, Math.random() < 0.5 ? 0xff7a2a : 0xffc04a, 1, -1.5);
      if (f.stun > 0 && f.freeze <= 0 && f.lift <= 0) {
        const top = FOE[f.kind].scale * 1.25 + 0.5;
        for (let i = 0; i < 3; i++) { const a = this.time * 5 + (i * Math.PI * 2) / 3; this.glows.add(f.x + Math.sin(a) * 0.38, top, f.z + Math.cos(a) * 0.38, 0.32, 0.32, 0, 0xffe27a, 0.95); }
      }
      if (f.root > 0) this.flats.add(f.x, 0.05, f.z, f.radius * 2.4, f.radius * 2.4, 0, 0xc8a04a, 0.6);
    }
    // the trap, the shrine
    for (const t of b.traps) this.flats.add(t.x, 0.06, t.z, 1.6, 1.6, this.time, t.sprung ? 0xffffff : 0xd8b04a, 0.8);
    const sh = this.arena?.shrine;
    if (sh) {
      sh.visible = !!b.shrine;
      if (b.shrine) {
        const col = POWER_COLOR[b.shrine.power];
        sh.position.set(b.shrine.x, 0, b.shrine.z);
        const bob = Math.sin(this.time * 2.4) * 0.12;
        this.glows.add(b.shrine.x, 2.0 + bob, b.shrine.z, 1.3, 1.3, 0, col, 1);
        this.glows.add(b.shrine.x, 2.0 + bob, b.shrine.z, 0.6, 0.6, 0, 0xffffff, 1);
        this.flats.add(b.shrine.x, 0.05, b.shrine.z, 2.6 + Math.sin(this.time * 3) * 0.2, 2.6 + Math.sin(this.time * 3) * 0.2, this.time * 0.5, col, 0.7);
        if (Math.random() < dt * 8) this.sparks.emit(b.shrine.x + (Math.random() - 0.5) * 0.8, 1.6, b.shrine.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, 1, 0.2, 0.05, col, 1);
      }
    }
    // torches and braziers: flickering flames, now and then an ember
    const lit = this.arena?.layout.lights;
    if (lit) for (const [x, y, z] of lit) {
      const f = 0.86 + Math.sin(this.time * 17 + x * 3) * 0.08 + Math.sin(this.time * 29 + z * 2) * 0.06;
      this.glows.add(x, y + 0.1, z, 0.95 * f, 1.15 * f, 0, 0xff8a2a, 0.85);
      this.glows.add(x, y + 0.06, z, 0.36 * f, 0.48 * f, 0, 0xffe6a8, 1);
      if (Math.random() < dt * 3) this.sparks.emit(x, y + 0.25, z, (Math.random() - 0.5) * 0.3, 1.1, (Math.random() - 0.5) * 0.3, 0.7, 0.1, 0.03, 0xffb04a, 0);
    }
    // shots
    for (const s of b.shots) {
      const a = Math.atan2(s.vx, s.vz);
      const y = 0.85;
      if (s.kind === 'power') { this.streaks.add(s.x, y, s.z, 0.55 * (s.r / 0.45), 2.6, -a, 0xffe8a0, 1); this.glows.add(s.x, y, s.z, 1.0, 1.0, 0, 0xffd86a, 0.9); if (Math.random() < 0.6) this.sparks.emit(s.x, y, s.z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.3, 0.3, 0.05, 0xffd86a, 3); }
      else if (s.kind === 'hknife') this.streaks.add(s.x, y, s.z, 0.22, 0.9, -a, 0xc8a8ff, 1);
      else if (s.kind === 'arrow' || s.kind === 'farrow') { this.rack.arrow(s.x, y, s.z, a); this.streaks.add(s.x - Math.sin(a) * 0.5, y, s.z - Math.cos(a) * 0.5, 0.16, 1.2, -a, s.side === 'hero' ? 0xfff0c8 : 0xff8a6a, 0.7); }
      else if (s.kind === 'knife') this.streaks.add(s.x, y, s.z, 0.28, 1.4, -a, 0xff8a6a, 1);
      else {
        const col = s.kind === 'bolt' ? 0x7ac8ff : s.kind === 'fireball' ? 0xff7a2a : s.kind === 'orb' ? 0xc87aff : 0xb05aff;
        const sz = s.kind === 'fireball' ? 1.4 : 0.9;
        this.glows.add(s.x, y, s.z, sz, sz, 0, col, 1);
        this.glows.add(s.x, y, s.z, sz * 0.45, sz * 0.45, 0, 0xffffff, 1);
        if (Math.random() < 0.5) this.sparks.emit(s.x, y, s.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.35, sz * 0.45, 0.05, col, 3);
      }
    }
    // drops
    for (const d of b.drops) {
      const bob = Math.sin(this.time * 6 + d.id) * 0.08 + 0.35;
      if (d.kind === 'gold') { this.glows.add(d.x, bob, d.z, 0.42, 0.42, 0, 0xffc83a, 1); this.glows.add(d.x, bob, d.z, 0.18, 0.18, 0, 0xffffff, 1); }
      else if (d.kind === 'sigil') { this.glows.add(d.x, bob + 0.3, d.z, 1.1, 1.1, 0, 0xff3a5a, 1); this.glows.add(d.x, bob + 0.3, d.z, 0.4, 0.4, 0, 0xffd86a, 1); this.flats.add(d.x, 0.05, d.z, 1.3, 1.3, -this.time * 3, 0xff5a7a, 0.8); }
      else { const col = d.kind === 'potion' ? 0xff4a5a : POWER_COLOR[d.power!]; this.glows.add(d.x, bob + 0.25, d.z, 0.9, 0.9, 0, col, 1); this.glows.add(d.x, bob + 0.25, d.z, 0.35, 0.35, 0, 0xffffff, 1); this.flats.add(d.x, 0.05, d.z, 1.1, 1.1, this.time * 2, col, 0.7); }
    }
    // the hero's power-ups
    if (h.powers.shield > 0 || h.shieldHits > 0) this.bubbles.add(h.x, 0.75 + h.air, h.z, 2.1, 2.1, 0, 0x8ab8ff, h.powers.shield > 0 ? 0.9 : 0.6);
    if (h.powers.haste > 0 && Math.random() < dt * 20) this.sparks.emit(h.x, 0.3, h.z, 0, 0.6, 0, 0.4, 0.3, 0.05, 0x5ae8ff, 2);
    if (h.powers.rage > 0) this.glows.add(h.x, 0.9, h.z, 2.0, 2.0, 0, 0x5a1004, 1);
    if (h.powers.regen > 0 && Math.random() < dt * 10) this.sparks.emit(h.x + (Math.random() - 0.5) * 0.8, 0.2, h.z + (Math.random() - 0.5) * 0.8, 0, 1.4, 0, 0.7, 0.22, 0.05, 0x6aff8a, 0);
    if (h.powers.gold > 0 && Math.random() < dt * 8) this.sparks.emit(h.x, 1.2, h.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0.6, 0.18, 0.04, 0xffd23f, 3);
    // health bars over hurt foes
    for (const f of b.foes) {
      const fv = this.foes.get(f.id);
      if (!fv || f.boss) continue;
      const a = stepBar(fv.bar, f.hp / f.maxHp, f.state === 'dead', dt);
      const hgt = FOE[f.kind].scale * 1.15 + 0.45;
      this.bars.add(f.x, hgt, f.z, Math.max(0.9, f.radius * 2.2), 0.16, f.hp / f.maxHp, fv.bar.ghost, a, FOE[f.kind].ai === 'boss' ? 0xff7a3a : 0xff5a4a);
    }
    // timed effects
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.max;
      switch (e.kind) {
        case 'ring': this.flats.add(e.x, 0.07, e.z, e.r * 2 * (0.4 + k * 0.7), e.r * 2 * (0.4 + k * 0.7), 0, e.color, (1 - k) * 0.7); break;
        case 'flash': this.glows.add(e.x, 0.5, e.z, e.r * 1.7, e.r * 1.7, 0, e.color, (1 - k) * 0.55); break;
        case 'slash': this.slashes.add(e.x, 0.75, e.z, e.r * (0.8 + k * 0.4), e.r * (0.8 + k * 0.4), -e.ang + Math.PI, e.color, 1 - k * k); break;
        case 'whirl': this.slashes.add(this.heroPos.x, 0.7, this.heroPos.z, e.r * 2, e.r * 2, -this.time * 14, e.color, 0.8 * (1 - k)); this.slashes.add(this.heroPos.x, 0.7, this.heroPos.z, e.r * 2, e.r * 2, -this.time * 14 + Math.PI, e.color, 0.8 * (1 - k)); break;
        case 'spin': {
          // a finisher's spin: two arcs round the hero that sweep a full turn
          const a = -this.time * 20;
          this.slashes.add(this.heroPos.x, 0.75, this.heroPos.z, e.r * 2, e.r * 2, a, e.color, 0.95 * (1 - k * k));
          this.slashes.add(this.heroPos.x, 0.75, this.heroPos.z, e.r * 2, e.r * 2, a + Math.PI, e.color, 0.95 * (1 - k * k));
          this.slashes.add(this.heroPos.x, 0.75, this.heroPos.z, e.r * 1.4, e.r * 1.4, a + Math.PI / 2, 0xffffff, 0.5 * (1 - k));
          break;
        }
        case 'streak': {
          // a lane along the ground: centred half way along it, laid flat
          const len = e.len ?? 3;
          this.streaks.add(e.x + Math.sin(e.ang) * len / 2, 0.08, e.z + Math.cos(e.ang) * len / 2, e.r * (1 - k * 0.5), len, -e.ang, e.color, 0.75 * (1 - k));
          break;
        }
        case 'crack': {
          const len = e.len ?? 3;
          for (let i = 0; i < 5; i++) { const d = ((i + 0.5) / 5) * len; this.marks.add(e.x + Math.sin(e.ang) * d, 0.04, e.z + Math.cos(e.ang) * d, e.r, e.r, e.ang + i, e.color, Math.min(1, (1 - k) * 2) * 0.55); }
          break;
        }
        case 'spawn': this.flats.add(e.x, 0.06, e.z, e.r * 2 * (1.2 - k * 0.4), e.r * 2 * (1.2 - k * 0.4), this.time, e.color, Math.sin(k * Math.PI) * 0.7); break;
        case 'mark': this.marks.add(e.x, 0.04, e.z, e.r * 2, e.r * 2, e.ang, e.color, Math.min(1, (1 - k) * 2) * 0.6); break;
      }
    }
    this.syncLoot(b, dt);
    this.fx = this.fx.filter((e) => e.t < e.max);
    this.sparks.update(dt, camQ);
    this.dust.update(dt, camQ);
    this.shadows.end(); this.glows.end(); this.flats.end(); this.slashes.end(); this.streaks.end(); this.bubbles.end(); this.marks.end();
    this.tele.end(); this.bars.end();
    this.rack.end();
    if (this.arena?.water) { const w = this.arena.water; w.position.y = -0.5 + Math.sin(this.time * 1.2) * 0.05; }
  }

  /** A boss's bar is a HUD chip; this is where a foe stands on screen (the scene projects it). */
  foeTop(f: Foe): THREE.Vector3 { return tmpV.set(f.x, FOE[f.kind].scale * 1.2 + 0.6, f.z); }

  dispose(): void {
    this.rack.dispose();
    for (const p of this.pools.values()) p.dispose();
    for (const f of this.heroFigs.values()) f.dispose();
  }
}

/** The trail of a combo: the class's colour for the chain (gold on its finisher), ember for the heavy chain, sky blue for the dash. */
function trailColor(cls: ClassId, chain: ComboId, finisher: boolean): number {
  if (chain === 'heavy' && finisher) return 0xff8a3a;
  if (chain === 'dash') return finisher ? 0x9ae8ff : 0x7ac8ff;
  return finisher ? 0xffe8a0 : CLASS[cls].color;
}

export type { FoeKind };
