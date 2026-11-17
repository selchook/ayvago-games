// Hex Realm: the 3D kit. What the game loads and how it is turned into few draw calls:
//   - the six Quaternius RPG heroes (one skinned mesh and one 512 x 768 atlas each), also worn,
//     recoloured, by the bandits, archers, brutes, acolytes, knights, cultists and the bosses;
//     the Quaternius pirate skeletons for the undead;
//   - the Kenney Hexagon Kit: every overworld tile, road, river and building merges into one mesh
//     on its one colour map; a per-vertex hex number lets the fog of war darken unexplored hexes;
//   - the Kenney Retro Fantasy Kit: its ten 64 px pixel textures go into one atlas at run time and
//     every arena merges into one mesh with one material (each vertex carries its texture's cell,
//     the shader repeats inside the cell);
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import { WEAPON_MODELS, weaponIcon } from './weapons';
import { WEAPONS_KEY } from './weaponview';
import Phaser from 'phaser';
import { THREE, model, loadModel, kenney3d } from '@core/three';
import { asset } from '@core';
import { CLASS_IDS } from './defs';

import { heroKey, pirateKey, retroKey, hexKey, type Placed } from './keys';

export { heroKey, pirateKey, retroKey, hexKey, type Placed };

/** Model keys of the foes' looks (FOE[].model). */
export function modelKey(m: string): string {
  return m === 'skeleton' || m === 'headless' ? pirateKey(m) : heroKey(m);
}

export const RETRO_MODELS = [
  'floor', 'floor-flat', 'floor-steps', 'wall', 'wall-half', 'wall-low', 'wall-detail', 'wall-door', 'wall-window', 'wall-gate',
  'wall-fortified', 'wall-fortified-gate', 'wall-fortified-window', 'wall-fortified-paint', 'wall-fortified-paint-gate',
  'wall-paint', 'wall-paint-window', 'column', 'column-damaged', 'column-wood', 'column-paint', 'tower', 'tower-base', 'tower-top',
  'tower-edge', 'tower-paint-base', 'battlement', 'battlement-corner-outer', 'bricks', 'barrels', 'detail-barrel', 'detail-crate',
  'detail-crate-small', 'detail-crate-ropes', 'fence-wood', 'tree-large', 'tree-shrub', 'wood-floor', 'wood-floor-railing',
  'dock-side', 'dock-corner', 'structure', 'structure-poles', 'pulley-crate', 'ladder', 'stairs-stone', 'overhang-round-railing',
] as const;

export const HEX_MODELS = [
  'grass', 'grass-forest', 'grass-hill', 'stone', 'stone-hill', 'stone-mountain', 'stone-rocks', 'sand', 'sand-rocks',
  'water', 'water-rocks', 'water-island', 'dirt', 'dirt-lumber', 'river-straight', 'river-corner', 'river-corner-sharp',
  'river-end', 'bridge', 'path-straight', 'path-corner', 'path-corner-sharp', 'path-end', 'path-crossing',
  'path-intersectionA', 'path-intersectionB', 'path-intersectionC', 'path-intersectionD', 'path-intersectionE',
  'path-intersectionF', 'path-intersectionG', 'path-intersectionH', 'building-castle', 'building-village', 'building-market',
  'building-house', 'building-farm', 'building-sheep', 'building-mill', 'building-mine', 'building-wizard-tower',
  'building-tower', 'building-port', 'building-dock', 'building-walls', 'building-wall', 'building-watermill',
  'building-cabin', 'building-smelter', 'building-archery', 'unit-tree', 'unit-ship', 'unit-house', 'unit-wall-tower', 'unit-tower',
] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const c of CLASS_IDS) loadModel(load, heroKey(c), asset(`quaternius/rpg-characters/${c}.glb`));
  for (const m of ['skeleton', 'headless']) loadModel(load, pirateKey(m), asset(`quaternius/pirate-kit/${m}.glb`));
  for (const m of RETRO_MODELS) loadModel(load, retroKey(m), kenney3d('retro-fantasy-kit', m));
  for (const m of HEX_MODELS) loadModel(load, hexKey(m), kenney3d('hexagon-kit', m));
  // 1.2: the Medieval Weapons (one GLB) and their icons
  loadModel(load, WEAPONS_KEY, asset('quaternius/medieval-weapons/weapons.glb'));
  for (const m of WEAPON_MODELS) if (m !== 'Arrow') load.image(weaponIcon(m), asset(`quaternius/medieval-weapons/icons/${m}.png`));
}

// ------------------------------------------------------------------ geometry

interface Part { geo: THREE.BufferGeometry; mat: THREE.Matrix4; map: THREE.Texture | null }
const partCache = new Map<string, Part[]>();

/** A static model's meshes, their matrices inside the file and their textures (one per group). */
export function modelParts(key: string): Part[] {
  let parts = partCache.get(key);
  if (parts) return parts;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  parts = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.length > 1 && m.geometry.groups.length) {
      // a multi-material mesh: one part per group (its own index range)
      for (const g of m.geometry.groups) {
        const sub = m.geometry.clone();
        const idx = m.geometry.index!;
        sub.setIndex(Array.from({ length: g.count }, (_, i) => idx.getX(g.start + i)));
        sub.clearGroups();
        parts!.push({ geo: sub, mat: m.matrixWorld.clone(), map: (mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial).map ?? null });
      }
    } else parts!.push({ geo: m.geometry, mat: m.matrixWorld.clone(), map: (mats[0] as THREE.MeshStandardMaterial).map ?? null });
  });
  partCache.set(key, parts);
  return parts;
}


const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpNM = new THREE.Matrix3();

/**
 * Merges placed models into one plain geometry: position, normal, uv, and per vertex `aCell` (the
 * texture's cell in the retro atlas, `cells`) or `aHex` (the hex it belongs to). Reads every
 * attribute through getX…, so quantized files come out right.
 */
export function mergeModels(list: Placed[], o: { cells?: Map<string, number>; hex?: boolean } = {}): THREE.BufferGeometry {
  const jobs: { part: Part; m: THREE.Matrix4; hex: number }[] = [];
  let verts = 0;
  for (const p of list) {
    const place = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rot, 0, 'YXZ')),
      new THREE.Vector3(p.s, p.sy ?? p.s, p.s),
    );
    for (const part of modelParts(p.key)) {
      jobs.push({ part, m: place.clone().multiply(part.mat), hex: p.hex ?? 0 });
      verts += part.geo.index ? part.geo.index.count : part.geo.getAttribute('position').count;
    }
  }
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), U = new Float32Array(verts * 2);
  const X = o.cells || o.hex ? new Float32Array(verts) : null;
  let k = 0;
  for (const { part, m, hex } of jobs) {
    const geo = part.geo;
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
    tmpNM.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    const cell = o.cells ? o.cells.get(part.map?.name ?? '') ?? 0 : hex;
    for (let i = 0; i < n; i++, k++) {
      // a mirrored placement turns the winding: swap two corners of each triangle
      const ii = flip ? i - (i % 3) + [0, 2, 1][i % 3] : i;
      const v = idx ? idx.getX(ii) : ii;
      tmpV.set(pos.getX(v), pos.getY(v), pos.getZ(v)).applyMatrix4(m);
      P[k * 3] = tmpV.x; P[k * 3 + 1] = tmpV.y; P[k * 3 + 2] = tmpV.z;
      if (nor) { tmpN.set(nor.getX(v), nor.getY(v), nor.getZ(v)).applyMatrix3(tmpNM).normalize(); N[k * 3] = tmpN.x; N[k * 3 + 1] = tmpN.y; N[k * 3 + 2] = tmpN.z; }
      if (uv) { U[k * 2] = uv.getX(v); U[k * 2 + 1] = uv.getY(v); }
      if (X) X[k] = cell;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (X) out.setAttribute(o.cells ? 'aCell' : 'aHex', new THREE.BufferAttribute(X, 1));
  out.computeBoundingSphere();
  return out;
}

/** One model as a single geometry centred on x/z and standing on y = 0 (for instancing). */
const soloCache = new Map<string, THREE.BufferGeometry>();
export function soloGeometry(key: string, o: { cells?: Map<string, number> } = {}): THREE.BufferGeometry {
  let g = soloCache.get(key);
  if (g) return g;
  g = mergeModels([{ key, x: 0, y: 0, z: 0, rot: 0, s: 1 }], o);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.computeBoundingSphere();
  soloCache.set(key, g);
  return g;
}

// ------------------------------------------------------------------ the retro atlas

export const RETRO_TEXTURES = ['barrel', 'cobblestone', 'cobblestoneAlternative', 'cobblestonePainted', 'details', 'fence', 'planks', 'roof', 'tree', 'water'];
const ATLAS_COLS = 4, ATLAS_ROWS = 3, CELL = 64;

let atlasCanvas: HTMLCanvasElement | null = null;
export const RETRO_CELLS = new Map<string, number>(RETRO_TEXTURES.map((n, i) => [n, i]));

/** The retro kit's textures side by side (painted once per page from the loaded models). */
function retroAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * CELL; cv.height = ATLAS_ROWS * CELL;
  const g = cv.getContext('2d')!;
  const found = new Map<string, CanvasImageSource>();
  for (const m of RETRO_MODELS) {
    for (const p of modelParts(retroKey(m))) {
      const img = p.map?.image as CanvasImageSource | undefined;
      if (p.map && img && !found.has(p.map.name)) found.set(p.map.name, img);
    }
  }
  RETRO_TEXTURES.forEach((n, i) => {
    const img = found.get(n);
    const x = (i % ATLAS_COLS) * CELL, y = Math.floor(i / ATLAS_COLS) * CELL;
    if (img) g.drawImage(img, x, y, CELL, CELL);
    else { g.fillStyle = '#8a8478'; g.fillRect(x, y, CELL, CELL); }
  });
  atlasCanvas = cv;
  return cv;
}

/** The atlas as a texture (each world wraps the canvas in its own texture, freed with it). */
export function retroAtlas(): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(retroAtlasCanvas());
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  return t;
}

/**
 * The arenas' material: Lambert on the retro atlas, each vertex's texture repeated inside its
 * cell. `see` (the hero and the camera) dithers away walls between the camera and the hero.
 */
export function retroMaterial(map: THREE.Texture, hero: THREE.Vector3, cam: THREE.Vector3): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHero = { value: hero };
    sh.uniforms.uCam = { value: cam };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;\nvarying vec2 vCell;\nvarying vec2 vRep;\nvarying vec3 vGp;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCell = vec2(mod(aCell, 4.0), floor(aCell / 4.0));\nvRep = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCell;\nvarying vec2 vRep;\nvarying vec3 vGp;\nuniform vec3 uHero;\nuniform vec3 uCam;')
      .replace('#include <map_fragment>', [
        'vec2 cuv = (vCell + (0.5 + fract(vRep) * 63.0) / 64.0) / vec2(4.0, 3.0);',
        'vec4 sampledDiffuseColor = texture2D(map, cuv);',
        'diffuseColor *= sampledDiffuseColor;',
      ].join('\n'))
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);',
        'float th = fract((cell.x * 4.0 + cell.y + mod(cell.x + cell.y, 2.0) * 7.0) / 16.0);',
        'vec3 sl = uHero - uCam;',
        'float sll = length(sl);',
        'vec3 sd = sl / max(sll, 0.001);',
        'float along = dot(vGp - uCam, sd);',
        'if (uHero.y > -50.0 && along < sll - 0.8 && vGp.y > 0.5) {',
        '  float side = length(vGp - uCam - sd * along);',
        '  float k = smoothstep(2.4, 1.2, side) * smoothstep(sll - 0.8, sll - 2.6, along);',
        '  if (th < k * 0.85) discard;',
        '}',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'hr-retro';
  return mat;
}

/** The Hexagon Kit's shared colour map. */
export function hexMap(): THREE.Texture | null {
  return modelParts(hexKey('grass'))[0]?.map ?? null;
}

/**
 * The overworld's material: the hex colour map, with the fog of war. `fog` is a COLS*ROWS x 1
 * texture (red: 0 unknown … 1 seen); unknown hexes are drawn dark, blue and without colour.
 */
export function hexMaterial(map: THREE.Texture | null, fog: THREE.DataTexture | null, count: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map, side: THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFog = { value: fog };
    sh.uniforms.uCount = { value: count };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHex;\nuniform sampler2D uFog;\nuniform float uCount;\nvarying float vSeen;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeen = uCount > 0.0 ? texture2D(uFog, vec2((aHex + 0.5) / uCount, 0.5)).r : 1.0;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSeen;')
      .replace('#include <dithering_fragment>', [
        '#include <dithering_fragment>',
        'float grey = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));',
        'vec3 dark = mix(vec3(grey), vec3(0.16, 0.2, 0.32), 0.55) * 0.42;',
        'gl_FragColor.rgb = mix(dark, gl_FragColor.rgb, vSeen);',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'hr-hex';
  return mat;
}

// ------------------------------------------------------------------ the figures' material

/**
 * A figure's own Lambert on its texture (or vertex colours) with a recolour: a hue turn and a
 * saturation in the shader, then the colour multiply and an emissive glow (flashes, tints). One
 * program for every textured figure.
 */
export function figureMaterial(map: THREE.Texture | null): THREE.MeshLambertMaterial & { hue: { value: number }; sat: { value: number } } {
  const mat = new THREE.MeshLambertMaterial(map ? { map } : { vertexColors: true }) as THREE.MeshLambertMaterial & { hue: { value: number }; sat: { value: number } };
  mat.hue = { value: 0 };
  mat.sat = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = mat.hue;
    sh.uniforms.uSat = mat.sat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uHue;',
        'uniform float uSat;',
        'vec3 recolour(vec3 c) {',
        '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
        '  vec3 k = vec3(0.57735);',
        '  float ch = cos(uHue), sh = sin(uHue);',
        '  vec3 r = c * ch + cross(k, c) * sh + k * dot(k, c) * (1.0 - ch);',
        '  return mix(vec3(l), r, uSat);',
        '}',
      ].join('\n'))
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = recolour(diffuseColor.rgb);')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = recolour(diffuseColor.rgb);');
  };
  mat.customProgramCacheKey = () => (map ? 'hr-fig-map' : 'hr-fig-col');
  return mat;
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when its
 * scene shuts down, which drops their programs too, so the Play scene's first frame would compile
 * them all again. This compiles a copy of every material and object kind behind the menu, under
 * the same lights and fog, into a keeper scene that is never freed. Hidden objects count too.
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
      const inst = o as THREE.InstancedMesh;
      const sk = (o as THREE.SkinnedMesh).isSkinnedMesh;
      const kind = sk ? 'skin' : inst.isInstancedMesh ? (inst.instanceColor ? 'instc' : 'inst') : 'mesh';
      const key = kind + ':' + mat.type + ':' + (mat.customProgramCacheKey?.() ?? '') + ':' + JSON.stringify(materialKey(mat)) + (o.receiveShadow ? 'r' : '') + (o.castShadow ? 'c' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      if ((mat as THREE.ShaderMaterial).uniforms) (c as THREE.ShaderMaterial).uniforms = (mat as THREE.ShaderMaterial).uniforms;
      let k: THREE.Mesh;
      if (sk) {
        const src = o as THREE.SkinnedMesh;
        const ks = new THREE.SkinnedMesh(src.geometry, c);
        ks.bind(src.skeleton, src.bindMatrix);
        k = ks;
      } else if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = o.castShadow;
      k.receiveShadow = o.receiveShadow;
      k.frustumCulled = false;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}

function materialKey(m: THREE.Material): unknown {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [!!a.map, !!a.vertexColors, a.transparent, a.blending, !!a.flatShading, a.side, a.fog, !!a.emissiveMap, a.depthWrite, a.alphaTest > 0];
}
