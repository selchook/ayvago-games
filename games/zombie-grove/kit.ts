// Zombie Grove: the 3D kit. What the game loads (Kenney Mini Forest and Mini Characters), and how
// it is turned into few draw calls:
//   - The grove's props share one texture, so each patch of the forest is one merged mesh.
//   - Zombies are Mini Characters split into rigid parts by bone (the model's own triangles) and
//     posed from their own clips sampled once: one InstancedMesh per part and model, so a horde
//     of hundreds costs a couple of dozen draw calls. A small shader adds the zombie palette, the
//     hit flash, burning and the dissolve per instance.
//   - The Hulk carries a sword baked into its arm part, and every zombie gets a rim light (a soft
//     edge in its own colour, per instance) so the crowd reads from the high camera.
//   - keepPrograms() compiles a copy of every material kind behind the menu, so the first Play
//     frame finds its shader programs ready.
import Phaser from 'phaser';
import { THREE, model, modelClips, loadModel, kenney3d, loadMiniCharacter, loadCharacter3d, miniKey } from '@core/three';
import { FOREST_MODELS, type ForestModel } from './arena';
import { HEROES, HERO_IDS, type HeroId } from './defs';

export const FOREST = 'mini-forest';
export const fkey = (m: string): string => 'mf:' + m;

/** Roster models (instanced) and the extra people (heroes, the robot, bosses). */
export const ROSTER = ['character-zombie', 'character-raider', 'character-alien', 'character-worker'] as const;
export type RosterModel = (typeof ROSTER)[number];
export const PEOPLE = ['character-knight', 'character-robot', ...ROSTER] as const;
export const WEAPON_MODELS = ['weapon-sword', 'weapon-spear', 'weapon-shooter', 'weapon-arrow', 'shield-round', 'shield-rectangle', 'weapon-bow'] as const;

export function loadKit(load: Phaser.Loader.LoaderPlugin): void {
  for (const m of FOREST_MODELS) loadModel(load, fkey(m), kenney3d(FOREST, m));
  loadModel(load, fkey('character-archer'), kenney3d(FOREST, 'character-archer'));
  for (const p of PEOPLE) loadMiniCharacter(load, p);
  // the heroes' own models (the Mini Forest archer is loaded above)
  for (const h of HERO_IDS) { const m = HEROES[h].model; if (m !== 'own' && !m.startsWith('mf:')) loadMiniCharacter(load, m); }
  for (const w of WEAPON_MODELS) loadMiniCharacter(load, w);
  loadCharacter3d(load);
}

/** Model key of a hero ('survivor' is the player's own platform character, `own`). */
export function heroKey(h: HeroId, own: string): string {
  const m = HEROES[h].model;
  return m === 'own' ? own : m.startsWith('mf:') ? fkey(m.slice(3)) : miniKey(m);
}

/** Mini Characters are about 0.67 units tall; the game draws people at this scale. */
export const PERSON = 1.75;

// ------------------------------------------------------------------ the forest

/** The shared material of a loaded model (its first mesh's). */
function firstMesh(key: string): THREE.Mesh {
  let m: THREE.Mesh | null = null;
  model(key, { shadows: false }).traverse((o) => { if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh; });
  return m!;
}

const geoCache = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Matrix4 }>();

/** A model's geometry (position, normal, uv) and its matrix inside the file. */
export function modelGeo(key: string): { geo: THREE.BufferGeometry; mat: THREE.Matrix4 } {
  let g = geoCache.get(key);
  if (g) return g;
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  root.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
  const m = mesh! as THREE.Mesh;
  g = { geo: m.geometry, mat: m.matrixWorld.clone() };
  geoCache.set(key, g);
  return g;
}

/** The texture every model of a pack shares. */
export function packMap(key: string): THREE.Texture | null {
  return ((firstMesh(key).material as THREE.MeshStandardMaterial).map ?? null);
}

export interface PropPlacement { m: ForestModel; x: number; y: number; z: number; rot: number; s: number; sy?: number }

/** Merges placed props into one geometry (position, normal, uv). */
export function mergeProps(list: PropPlacement[]): THREE.BufferGeometry {
  let verts = 0;
  const parts = list.map((p) => {
    const { geo, mat } = modelGeo(fkey(p.m));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(p.s, p.sy ?? p.s, p.s)).multiply(mat);
    g.applyMatrix4(m);
    verts += g.getAttribute('position').count;
    return g;
  });
  const P = new Float32Array(verts * 3), N = new Float32Array(verts * 3), U = new Float32Array(verts * 2);
  let o = 0;
  for (const g of parts) {
    const n = g.getAttribute('position').count;
    P.set(g.getAttribute('position').array as Float32Array, o * 3);
    N.set(g.getAttribute('normal').array as Float32Array, o * 3);
    const uv = g.getAttribute('uv');
    if (uv) U.set(uv.array as Float32Array, o * 2);
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ------------------------------------------------------------------ baked people

export const CLIPS = ['walk', 'sprint', 'attack-melee-right', 'die', 'idle'] as const;
export type BakedClip = (typeof CLIPS)[number];
export const FRAMES = 16;

export interface ClipPoses { dur: number; frames: THREE.Matrix4[][] }
export interface Baked { parts: { joint: number; geo: THREE.BufferGeometry }[]; clips: Map<BakedClip, ClipPoses>; map: THREE.Texture | null }

const baked = new Map<string, Baked>();

/** A weapon held in a character's fist, in the arm bone's space (model units), as Figure.hold places it. */
export function fistMatrix(side: 'left' | 'right', scale = 1): THREE.Matrix4 {
  const g = new THREE.Matrix4().compose(new THREE.Vector3(side === 'left' ? 0.17 : -0.17, -0.05, 0.06), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(scale, scale, scale));
  return g.multiply(new THREE.Matrix4().makeTranslation(-0.06, -0.02, -0.04));
}

/** Weapons baked into a roster model's arm (the Hulk's sword). */
const BAKED_WEAPON: Partial<Record<string, { model: string; side: 'left' | 'right'; scale: number }>> = {
  'character-raider': { model: 'weapon-sword', side: 'right', scale: 1.45 },
};

/** Splits a rigged Mini Character into rigid parts (by bone) and samples its clips. */
export function bake(name: string): Baked {
  const hit = baked.get(name);
  if (hit) return hit;
  const key = miniKey(name);
  const root = model(key, { shadows: false });
  root.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  const bones = skinned[0].skeleton.bones;
  const map = (skinned[0].material as THREE.MeshStandardMaterial).map ?? null;
  const byJoint = new Map<number, THREE.BufferGeometry[]>();
  for (const sm of skinned) {
    const g = sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry.clone();
    const si = g.getAttribute('skinIndex') as THREE.BufferAttribute, sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
    const tris = new Map<number, number[]>();
    for (let t = 0; t < g.getAttribute('position').count; t += 3) {
      let j = si.getX(t), w = sw.getX(t);
      if (sw.getY(t) > w) { j = si.getY(t); w = sw.getY(t); }
      if (sw.getZ(t) > w) j = si.getZ(t);
      const bi = bones.indexOf(sm.skeleton.bones[j]);
      if (!tris.has(bi)) tris.set(bi, []);
      tris.get(bi)!.push(t);
    }
    const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (const [bi, list] of tris) {
      const P = new Float32Array(list.length * 9), N = new Float32Array(list.length * 9), U = new Float32Array(list.length * 6);
      list.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const v = t + k, o = i * 3 + k;
          P[o * 3] = pos.getX(v); P[o * 3 + 1] = pos.getY(v); P[o * 3 + 2] = pos.getZ(v);
          N[o * 3] = nor.getX(v); N[o * 3 + 1] = nor.getY(v); N[o * 3 + 2] = nor.getZ(v);
          U[o * 2] = uv.getX(v); U[o * 2 + 1] = uv.getY(v);
        }
      });
      const part = new THREE.BufferGeometry();
      part.setAttribute('position', new THREE.BufferAttribute(P, 3));
      part.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      part.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      part.applyMatrix4(sm.bindMatrix);
      if (!byJoint.has(bi)) byJoint.set(bi, []);
      byJoint.get(bi)!.push(part);
    }
    g.dispose();
  }
  // a weapon in the fist: its triangles join the arm's part, placed in the bind pose
  const wpn = BAKED_WEAPON[name];
  if (wpn) {
    const bi = bones.findIndex((b) => b.name === 'arm-' + wpn.side);
    if (bi >= 0 && byJoint.has(bi)) {
      const src = modelGeo(miniKey(wpn.model));
      const wg = (src.geo.index ? src.geo.toNonIndexed() : src.geo.clone());
      for (const k of Object.keys(wg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) wg.deleteAttribute(k);
      const bind = new THREE.Matrix4().copy(skinned[0].skeleton.boneInverses[bi]).invert();
      wg.applyMatrix4(bind.multiply(fistMatrix(wpn.side, wpn.scale)).multiply(src.mat));
      byJoint.get(bi)!.push(wg);
    }
  }
  const parts: Baked['parts'] = [];
  for (const [joint, geos] of byJoint) {
    let n = 0;
    for (const g of geos) n += g.getAttribute('position').count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    let o = 0;
    for (const g of geos) {
      P.set(g.getAttribute('position').array as Float32Array, o * 3);
      N.set(g.getAttribute('normal').array as Float32Array, o * 3);
      U.set(g.getAttribute('uv').array as Float32Array, o * 2);
      o += g.getAttribute('position').count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
    parts.push({ joint, geo });
  }
  const inverses = skinned[0].skeleton.boneInverses;
  const mixer = new THREE.AnimationMixer(root);
  const all = modelClips(key);
  const clips = new Map<BakedClip, ClipPoses>();
  for (const cn of CLIPS) {
    const clip = all.find((c) => c.name === cn);
    if (!clip) continue;
    mixer.stopAllAction();
    const act = mixer.clipAction(clip);
    act.play();
    const frames: THREE.Matrix4[][] = [];
    // the death clip holds its last pose; loops are sampled over their whole length
    const n = FRAMES;
    for (let f = 0; f < n; f++) {
      const t = cn === 'die' ? (f / (n - 1)) * clip.duration * 0.999 : (f / n) * clip.duration;
      mixer.setTime(t);
      root.updateMatrixWorld(true);
      frames.push(parts.map((p) => new THREE.Matrix4().multiplyMatrices(bones[p.joint].matrixWorld, inverses[p.joint])));
    }
    clips.set(cn, { dur: clip.duration, frames });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  const b = { parts, clips, map };
  baked.set(name, b);
  return b;
}

// ------------------------------------------------------------------ the horde material

/**
 * Lambert with per-instance effects (attribute `aFx`): x dissolve (0–1), y white flash, z the
 * zombie palette (greys the skin and greens it), w ember glow on the dissolving edge; and a rim
 * light (attribute `aRim`: colour and strength).
 */
export function hordeMaterial(map: THREE.Texture | null): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFx;\nattribute vec4 aRim;\nvarying vec4 vFx;\nvarying vec4 vRim;\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = aFx;\nvRim = aRim;\n#ifdef USE_INSTANCING\nvWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFx;\nvarying vec4 vRim;\nvarying vec3 vWp;')
      .replace('#include <map_fragment>', [
        '#include <map_fragment>',
        'float zl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
        'diffuseColor.rgb = mix(diffuseColor.rgb, (vec3(zl) * 0.85 + 0.16) * vec3(0.7, 1.0, 0.58) * 1.12, vFx.z);',
        'float dn = fract(sin(dot(floor(vWp * 13.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
        'if (dn < vFx.x) discard;',
      ].join('\n'))
      .replace('#include <opaque_fragment>', [
        'float rimF = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);',
        'outgoingLight += vRim.rgb * rimF * vRim.a;',
        'outgoingLight = mix(outgoingLight, vec3(1.0, 0.97, 0.92), vFx.y);',
        'if (vFx.x > 0.0 && dn < vFx.x + 0.14) outgoingLight += vec3(1.0, 0.42, 0.08) * vFx.w;',
        '#include <opaque_fragment>',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'zg-horde';
  return mat;
}

/**
 * A rim light on a Figure's (cloned) standard material: a bright edge in `color` so a boss reads
 * against the dark grass. Returns the uniform so the colour can change (the Rot King's rage).
 */
export function addRim(mat: THREE.MeshStandardMaterial, color: number, k: number): { value: THREE.Color } {
  const u = { value: new THREE.Color(color).multiplyScalar(k) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = u;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <opaque_fragment>', 'outgoingLight += uRim * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'zg-rim';
  return u;
}

// ------------------------------------------------------------------ the grove's material

/**
 * Lambert for the grove with a see-through: whatever stands between the camera and the hero (a
 * tree, a tent) is dithered away in a soft cylinder round the line of sight, so the hero and the
 * zombies next to them always show. `hero` and `cam` are updated every frame.
 */
export function groveMaterial(map: THREE.Texture | null, hero: THREE.Vector3, cam: THREE.Vector3): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHero = { value: hero };
    sh.uniforms.uCam = { value: cam };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGp;\nuniform vec3 uHero;\nuniform vec3 uCam;')
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        'vec3 sl = uHero - uCam;',
        'float sll = length(sl);',
        'vec3 sd = sl / sll;',
        'float along = dot(vGp - uCam, sd);',
        'if (along < sll - 0.9 && vGp.y > 0.35) {',
        '  float side = length(vGp - uCam - sd * along);',
        '  float k = smoothstep(3.0, 1.6, side) * smoothstep(sll - 0.9, sll - 3.0, along);',
        '  vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);',
        '  float th = (cell.x * 4.0 + cell.y + mod(cell.x + cell.y, 2.0) * 7.0) / 16.0;',
        '  if (fract(th) < k * 0.82) discard;',
        '}',
      ].join('\n'));
  };
  mat.customProgramCacheKey = () => 'zg-grove';
  return mat;
}

// ------------------------------------------------------------------ shader programs

const warmed = new WeakSet<THREE.WebGLRenderer>();
const keepers: THREE.Scene[] = [];

/**
 * Keeps the shader programs of everything in `world` alive. A World3D frees its materials when its
 * scene shuts down, which drops their programs too, so the Play scene's first frame would compile
 * them all again. This compiles a copy of every material and object kind behind the menu, under
 * the same lights and fog, into a keeper scene that is never freed.
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
      if (sk) { s.add(o.clone()); continue; }
      const c = mat.clone();
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      let k: THREE.Mesh;
      if (kind === 'mesh') k = new THREE.Mesh(m.geometry, c);
      else {
        const ki = new THREE.InstancedMesh(m.geometry, c, 1);
        if (inst.instanceColor) ki.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
        k = ki;
      }
      k.castShadow = o.castShadow;
      k.receiveShadow = o.receiveShadow;
      s.add(k);
    }
  });
  renderer.compile(s, camera);
  keepers.push(s);
}

function materialKey(m: THREE.Material): unknown {
  const a = m as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
  return [!!a.map, !!a.vertexColors, a.transparent, a.blending, !!a.flatShading, a.side, a.fog, !!a.emissiveMap, a.depthWrite];
}
