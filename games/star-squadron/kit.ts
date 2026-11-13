// Star Squadron: the Kenney Space Kit as shared, instanced 3D parts.
//   - The kit's own materials are fully metallic (they look black without reflections), so every
//     model is recoloured from a palette into our own MeshStandardMaterials, per role.
//   - Ships of the same kind are one InstancedMesh per material part, with a per-instance hit flash.
//   - Static scenery is merged into one mesh per material.
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import Phaser from 'phaser';
import { kenney } from '@core';
import { THREE, model, loadKenney3d } from '@core/three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EnemyKind, BossKind } from './defs';

export const KIT = 'space-kit';

/** Every Space Kit model the game loads (tools/import-kenney.py SPACE_KIT keeps only these). */
export const SPACE_MODELS = [
  'craft_speederA', 'craft_speederB', 'craft_speederC', 'craft_speederD', 'craft_racer', 'craft_miner',
  'craft_cargoA', 'craft_cargoB', 'meteor', 'meteor_detailed', 'rock_largeA', 'rock_crystalsLargeA',
  'rock_crystals', 'turret_double', 'turret_single', 'machine_generatorLarge', 'hangar_roundGlass',
  'hangar_roundA', 'hangar_largeA', 'satelliteDish_large', 'satelliteDish_detailed',
  'structure_detailed', 'pipe_straight', 'pipe_ring', 'platform_large', 'rocket_baseA', 'rocket_fuelA',
  'rocket_topA', 'rocket_finsA', 'rocket_sidesA', 'craterLarge', 'crater', 'gate_complex',
  'machine_wireless', 'corridor',
] as const;
export type SpaceModel = (typeof SPACE_MODELS)[number];

/** The four planets of the sky (Kenney Planets). */
export const PLANETS = ['planet02', 'planet07', 'planet03', 'planet09'] as const;

export const mkey = (n: SpaceModel): string => 'sk:' + n;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const n of SPACE_MODELS) loadKenney3d(load, mkey(n), KIT, n);
  for (const p of PLANETS) load.image('ss-' + p, kenney(`planets/planets/${p}.png`));
}

// ------------------------------------------------------------------ palettes

/** Colours for the kit's material names: metal, metalDark, metalRed (the accent), dark, glass … */
export interface Palette {
  metal: number;
  metalDark: number;
  accent: number;
  dark: number;
  glass: number;
  rock?: number;
  rockDark?: number;
  crystal?: number;
  /** How much the accent glows. */
  glow?: number;
  /** Shiny (ships) or matte (rock, ground). */
  gloss?: number;
}

export const PLAYER_PAL: Palette = { metal: 0xf4f7fc, metalDark: 0xaebbd0, accent: 0x22c8ff, dark: 0x2a3348, glass: 0x7ff3ff, glow: 0.55, gloss: 0.8 };

export const ENEMY_PAL: Record<EnemyKind, Palette> = {
  scout: { metal: 0x5d6274, metalDark: 0x434858, accent: 0xff3b5c, dark: 0x1b1e28, glass: 0xff7a8f, glow: 0.6 },
  fighter: { metal: 0x666b7e, metalDark: 0x474b5c, accent: 0xff7a1a, dark: 0x1c1f29, glass: 0xffb36a, glow: 0.6 },
  striker: { metal: 0x6e6a60, metalDark: 0x4b4840, accent: 0xffd23f, dark: 0x201e18, glass: 0xffe48a, glow: 0.7 },
  gunship: { metal: 0x5f5878, metalDark: 0x433d58, accent: 0xa66bff, dark: 0x1d1a28, glass: 0xc9a8ff, glow: 0.6 },
  bomber: { metal: 0x56685e, metalDark: 0x3d4c44, accent: 0x3ddc84, dark: 0x18211c, glass: 0x9dffc4, glow: 0.6 },
  carrier: { metal: 0x6d5d6a, metalDark: 0x4d404b, accent: 0xff4fa3, dark: 0x22181f, glass: 0xffa6d0, glow: 0.6 },
  rock: { metal: 0x777777, metalDark: 0x555555, accent: 0x888888, dark: 0x333333, glass: 0xffffff, rock: 0xc9926c, rockDark: 0x8f6048, glow: 0, gloss: 0.1 },
  crystal: { metal: 0x777777, metalDark: 0x555555, accent: 0x888888, dark: 0x333333, glass: 0xffffff, rock: 0xa98fb8, rockDark: 0x765f88, crystal: 0x4dffd2, glow: 1, gloss: 0.1 },
};

export const BOSS_PAL: Record<BossKind, Palette> = {
  dread: { metal: 0x5a5e72, metalDark: 0x3d4052, accent: 0xff3b3b, dark: 0x16171f, glass: 0xff6a6a, glow: 0.75 },
  hive: { metal: 0x4f6a63, metalDark: 0x37504a, accent: 0x5dff9d, dark: 0x141c1a, glass: 0x8affc6, glow: 0.8 },
  fortress: { metal: 0x666074, metalDark: 0x474156, accent: 0xff9a2e, dark: 0x1a1720, glass: 0xffc27a, glow: 0.7 },
  titan: { metal: 0x5e5470, metalDark: 0x40384f, accent: 0xd65cff, dark: 0x18141f, glass: 0xe7a8ff, glow: 0.8 },
};

/** Scenery colours per sector. */
export const SCENERY_PAL: Palette[] = [
  { metal: 0xd9dde6, metalDark: 0x9aa3b5, accent: 0xff9a3c, dark: 0x3a3f4c, glass: 0x8fe4ff, rock: 0xc4724f, rockDark: 0x8c4a35, crystal: 0x4dffd2, glow: 0.4, gloss: 0.3 },
  { metal: 0x8a90a6, metalDark: 0x5f6478, accent: 0x5ad1ff, dark: 0x2c3242, glass: 0x8fe4ff, rock: 0x5e5c6c, rockDark: 0x3e3c4a, crystal: 0x5ad1ff, glow: 0.5, gloss: 0.1 },
  { metal: 0x7a8296, metalDark: 0x555d70, accent: 0xd89a2a, dark: 0x22262f, glass: 0x9fe8ff, rock: 0x6e6a78, rockDark: 0x4a4656, crystal: 0xffd23f, glow: 0.35, gloss: 0.3 },
  { metal: 0xb7a9d6, metalDark: 0x7d6fa3, accent: 0xff5cc8, dark: 0x262035, glass: 0xe0a8ff, rock: 0x4e4268, rockDark: 0x352c48, crystal: 0xff7ae0, glow: 0.6, gloss: 0.1 },
];

function colourOf(name: string, pal: Palette): { color: number; emissive: number } {
  const g = pal.glow ?? 0.5;
  const em = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
  switch (name) {
    case 'metal': return { color: pal.metal, emissive: 0 };
    case 'metalDark': return { color: pal.metalDark, emissive: 0 };
    case 'metalRed': return { color: pal.accent, emissive: em(pal.accent, g * 0.5) };
    case 'dark': return { color: pal.dark, emissive: 0 };
    case '_defaultMat': return { color: pal.glass, emissive: em(pal.glass, g * 0.8) };
    case 'rock': case 'rockTrack': return { color: pal.rock ?? 0x8a7468, emissive: 0 };
    case 'rockDark': return { color: pal.rockDark ?? 0x5e4c44, emissive: 0 };
    case 'crystal': return { color: pal.crystal ?? 0x4dffd2, emissive: em(pal.crystal ?? 0x4dffd2, g) };
    default: return { color: pal.metal, emissive: 0 };
  }
}

/** A palette's materials, one per kit material name, made once per palette and world. */
export class Materials {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  constructor(private flash = false) {}

  get(name: string, pal: Palette): THREE.MeshStandardMaterial {
    const key = name + ':' + JSON.stringify(pal);
    let m = this.cache.get(key);
    if (m) return m;
    const c = colourOf(name, pal);
    const gloss = pal.gloss ?? 0.6;
    m = new THREE.MeshStandardMaterial({
      color: c.color, emissive: c.emissive, metalness: 0.05 + gloss * 0.2, roughness: 0.72 - gloss * 0.35, flatShading: true,
    });
    if (this.flash) withFlash(m);
    this.cache.set(key, m);
    return m;
  }
}

/**
 * Adds a per-instance hit flash to a material: an instanced `aFlash` attribute (0–1) mixes the
 * lit colour towards white.
 */
export function withFlash(m: THREE.Material): void {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlash;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.97, 0.92), vFlash);\n#include <dithering_fragment>');
  };
  m.customProgramCacheKey = () => 'ss-flash';
}

// ------------------------------------------------------------------ model parts

export interface Part { geometry: THREE.BufferGeometry; name: string; matrix: THREE.Matrix4; node: string }

/**
 * A model's meshes with their matrices relative to the model, centred on x/z, standing on y = 0
 * (or centred on y with `centreY`), scaled by `scale`.
 */
export function modelParts(key: SpaceModel, scale: number, centreY = false): Part[] {
  const root = model(mkey(key), { shadows: false });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const off = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-c.x, centreY ? -c.y : -box.min.y, -c.z));
  const out: Part[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    // the kit's meshes have one material each
    let node = '';
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p.name === 'turret') node = 'turret';
    out.push({ geometry: m.geometry, name: mats[0].name, matrix: off.clone().multiply(m.matrixWorld), node });
  });
  return out;
}

/** A recoloured, non-instanced copy of a model (the player, bosses), wrapped so its centre is at 0. */
export function buildModel(key: SpaceModel, scale: number, pal: Palette, mats: Materials, centreY = false): THREE.Group {
  const g = new THREE.Group();
  const turret = new THREE.Group();
  turret.name = 'turret';
  for (const p of modelParts(key, scale, centreY)) {
    const mesh = new THREE.Mesh(p.geometry, mats.get(p.name, pal));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(p.matrix);
    (p.node === 'turret' ? turret : g).add(mesh);
  }
  if (turret.children.length) g.add(turret);
  return g;
}

/**
 * One InstancedMesh per part of a model: draw many ships of the same kind in a few draw calls.
 * Each instance has a matrix and a hit flash.
 */
export class InstancedModel {
  readonly meshes: THREE.InstancedMesh[] = [];
  private parts: Part[];
  private flash: THREE.InstancedBufferAttribute[] = [];
  private m = new THREE.Matrix4();
  count = 0;

  constructor(scene: THREE.Object3D, key: SpaceModel, scale: number, pal: Palette, mats: Materials, readonly capacity: number, centreY = true) {
    this.parts = modelParts(key, scale, centreY);
    for (const p of this.parts) {
      const geo = p.geometry.clone();
      const fa = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      fa.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFlash', fa);
      const mesh = new THREE.InstancedMesh(geo, mats.get(p.name, pal), capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.flash.push(fa);
    }
  }

  begin(): void { this.count = 0; }

  /** Adds an instance with the ship's world matrix. */
  add(world: THREE.Matrix4, flash = 0): void {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    for (let k = 0; k < this.parts.length; k++) {
      this.m.multiplyMatrices(world, this.parts[k].matrix);
      this.meshes[k].setMatrixAt(i, this.m);
      this.flash[k].setX(i, flash);
    }
  }

  end(): void {
    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k];
      mesh.count = this.count;
      if (this.count) {
        mesh.instanceMatrix.needsUpdate = true;
        this.flash[k].needsUpdate = true;
      }
    }
  }
}

/**
 * Merges models placed by `items` into one mesh per material (static scenery): a handful of draw
 * calls for a whole strip of ground.
 */
export function mergeModels(items: { key: SpaceModel; matrix: THREE.Matrix4; scale?: number }[], pal: Palette, mats: Materials): THREE.Group {
  const byMat = new Map<string, THREE.BufferGeometry[]>();
  const m = new THREE.Matrix4();
  for (const it of items) {
    for (const p of modelParts(it.key, it.scale ?? 1)) {
      const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      m.multiplyMatrices(it.matrix, p.matrix);
      g.applyMatrix4(m);
      const list = byMat.get(p.name) ?? [];
      list.push(g);
      byMat.set(p.name, list);
    }
  }
  const group = new THREE.Group();
  for (const [name, list] of byMat) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats.get(name, pal));
    group.add(mesh);
  }
  return group;
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when its
 * scene shuts down, which drops their programs too, so the Play scene's first frame would compile
 * them all again (a frozen first frame on a slow phone). This compiles a copy of every material and
 * object kind of the scene behind the menu, under the same lights and fog, into a keeper scene that
 * is never freed: the Play scene then finds its programs ready.
 */
export function keepPrograms(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera): void {
  if (warmed.has(renderer)) return;
  warmed.add(renderer);
  const s = new THREE.Scene();
  s.fog = world.fog;
  s.environment = null;
  const seen = new Set<string>();
  world.traverse((o) => {
    if ((o as THREE.Light).isLight) {
      const l = (o as THREE.Light).clone();
      s.add(l);
      if ((l as THREE.DirectionalLight).target) s.add((l as THREE.DirectionalLight).target);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const inst = o as THREE.InstancedMesh;
      const pts = (o as THREE.Points).isPoints;
      const kind = pts ? 'pts' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const key = kind + ':' + mat.type + ':' + (mat.customProgramCacheKey?.() ?? '') + ':' + JSON.stringify(materialKey(mat));
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      let k: THREE.Object3D;
      if (pts) k = new THREE.Points(m.geometry, c as THREE.PointsMaterial);
      else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}

/** The material settings that change its shader program. */
function materialKey(m: THREE.Material): unknown {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [!!a.map, !!a.vertexColors, a.transparent, a.blending, !!a.flatShading, a.side, a.fog];
}
