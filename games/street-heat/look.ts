// Street Heat: how the city is drawn. One array texture holds the Downtown kit's materials (15
// layers of 256 px, import-textures.py); everything static in the city (buildings, roads, curbs,
// props, trees) draws with one flat-shaded Lambert material that maps those layers in world space
// (box mapping by the face's normal), so a chunk of the city is one draw call. Vehicles draw with a
// second material that reads each vertex's kind (paint, lights, glass, beacons).
//
// The night is faked in the same shaders: the nearest street lamps (sodium pools), the player's
// headlights (a cone), the police beacons (red and blue points) and the job markers add light per
// fragment, and window glass lights up by a hash of its position. Nothing here allocates per frame.
import { THREE } from '@core/three';
import { asset } from '@core';

/** The array texture's layers (same order as import-textures.py). `lod` is drawn procedurally. */
export const LAYERS = ['white', 'asphalt', 'pavement', 'metal', 'brick', 'palebrick', 'trim', 'slate', 'ornaments', 'dirt', 'grass',
  'paint', 'decals', 'glass', 'concrete'] as const;
export type Layer = (typeof LAYERS)[number] | 'lod' | 'water' | 'glow';
export const L: Record<Layer, number> = Object.fromEntries([...LAYERS.map((n, i) => [n, i]), ['lod', 15], ['water', 16], ['glow', 17]]) as Record<Layer, number>;
/** Metres per texture repeat, per layer. */
const SCALE = [1, 6, 3, 4, 3, 3, 4, 3, 3, 4, 6, 3, 1, 3, 4, 3, 1, 1];
const TEX = 256;

/** Vertex kinds of vehicles (import-city.mjs KIND). */
export const KIND = { body: 0, paint: 1, head: 2, tail: 3, glass: 4, red: 5, blue: 6, lampR: 7, lampY: 8, lampG: 9 } as const;

// ------------------------------------------------------------------ the layers

let layerData: Uint8Array | null = null;
let layerPromise: Promise<void> | null = null;

/** Loads layers.jpg and the decal alpha once per page (after the menu is up). */
export function loadLayers(): Promise<void> {
  if (layerPromise) return layerPromise;
  const img = (path: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error(path));
    i.src = asset(path);
  });
  layerPromise = Promise.all([img('quaternius/downtown-city/layers.jpg'), img('quaternius/downtown-city/decals-alpha.png')]).then(([sheet, alpha]) => {
    const n = LAYERS.length;
    const cv = document.createElement('canvas');
    cv.width = TEX; cv.height = TEX * n;
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(sheet, 0, 0);
    const data = new Uint8Array(g.getImageData(0, 0, TEX, TEX * n).data.buffer);
    g.clearRect(0, 0, TEX, TEX);
    g.drawImage(alpha, 0, 0, TEX, TEX);
    const a = g.getImageData(0, 0, TEX, TEX).data;
    const off = L.decals * TEX * TEX * 4;
    for (let i = 0; i < TEX * TEX; i++) data[off + i * 4 + 3] = a[i * 4];
    layerData = data;
  }, (err) => {
    console.error('[street-heat] city textures failed to load', err);
    layerPromise = null;
  });
  return layerPromise;
}

export const layersReady = (): boolean => !!layerData;

type LayerTexture = THREE.DataArrayTexture & { painted: boolean; refresh(): void };
let layerTex: LayerTexture | null = null;

/**
 * The layers as an array texture (a flat grey until they arrive; `refresh()` swaps them in).
 * One texture for the whole session, kept on the GPU across scenes like the loaded models: it is
 * not a material property, so World3D does not free it, and the menu and every round reuse it
 * instead of uploading 18 layers and building their mipmaps again.
 */
export function layerTexture(): LayerTexture {
  if (!layerTex) layerTex = makeLayerTexture();
  return layerTex;
}

function makeLayerTexture(): LayerTexture {
  const n = LAYERS.length;
  const grey = new Uint8Array(n * 4 * 4 * 4).fill(140);
  const t = new THREE.DataArrayTexture((layerData ?? grey) as unknown as BufferSource, layerData ? TEX : 4, layerData ? TEX : 4, n) as THREE.DataArrayTexture & { painted: boolean; refresh(): void };
  t.painted = !!layerData;
  t.refresh = () => {
    if (t.painted || !layerData) return;
    t.image = { data: layerData, width: TEX, height: TEX, depth: n } as never;
    t.dispose();
    t.painted = true;
    t.needsUpdate = true;
  };
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ the lights (shared uniforms)

/** How many street lamps light a frame (the nearest ones). */
export const MAX_LAMPS = 10;
/** Police beacons and other coloured point lights. */
export const MAX_POINTS = 6;

/**
 * The night's light, shared by every material of a world: set each frame by the view, read by
 * the shaders as uniforms (no allocation).
 */
export class NightLights {
  /** 0 = day, 1 = full night. */
  readonly night = { value: 1 };
  readonly time = { value: 0 };
  readonly lamps = { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, -100, 0, 0)) };
  readonly lampColor = { value: new THREE.Color(1.0, 0.6, 0.26) };
  /** Coloured points: xyz position, w radius; colour in pointColors. */
  readonly points = { value: Array.from({ length: MAX_POINTS }, () => new THREE.Vector4(0, -100, 0, 0)) };
  readonly pointColors = { value: Array.from({ length: MAX_POINTS }, () => new THREE.Color(0, 0, 0)) };
  /** The player's headlights: position (w = on) and direction. */
  readonly headPos = { value: new THREE.Vector4(0, -100, 0, 0) };
  readonly headDir = { value: new THREE.Vector3(0, 0, 1) };
  /** Sky and ground colours of the ambient light and the fog's (for the lit windows' distance fade). */
  readonly windowGlow = { value: 1 };

  /** The lamps nearest to (x, z) from a flat list [x, y, z, ...]. */
  setLamps(list: Float32Array, x: number, z: number): void {
    const best: number[] = [];
    const dist: number[] = [];
    for (let i = 0; i < list.length; i += 3) {
      const d = (list[i] - x) ** 2 + (list[i + 2] - z) ** 2;
      if (d > 110 * 110) continue;
      let k = best.length;
      if (k < MAX_LAMPS) { best.push(i); dist.push(d); } else if (d < dist[MAX_LAMPS - 1]) k = MAX_LAMPS - 1; else continue;
      best[k] = i; dist[k] = d;
      while (k > 0 && dist[k] < dist[k - 1]) {
        [dist[k], dist[k - 1]] = [dist[k - 1], dist[k]];
        [best[k], best[k - 1]] = [best[k - 1], best[k]];
        k--;
      }
    }
    const v = this.lamps.value;
    for (let k = 0; k < MAX_LAMPS; k++) {
      if (k < best.length) v[k].set(list[best[k]], list[best[k] + 1], list[best[k] + 2], 1);
      else v[k].set(0, -100, 0, 0);
    }
  }
}

/** GLSL: the night's lights at a world point with a normal, times the surface colour. */
const LIGHT_GLSL = /* glsl */ `
uniform float uNight;
uniform float uTime;
uniform vec4 uLamps[${MAX_LAMPS}];
uniform vec3 uLampColor;
uniform vec4 uPoints[${MAX_POINTS}];
uniform vec3 uPointColors[${MAX_POINTS}];
uniform vec4 uHeadPos;
uniform vec3 uHeadDir;
vec3 nightLight(vec3 wp, vec3 wn) {
  vec3 sum = vec3(0.0);
  // far off the fog has the last word: no lights there
  if (uNight < 0.01 || distance(wp, cameraPosition) > 150.0) return sum;
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    vec4 l = uLamps[i];
    if (l.w < 0.5) continue;
    vec3 d = l.xyz - wp;
    float d2 = dot(d, d);
    float att = l.w * max(0.0, 1.0 - d2 / 260.0);
    att *= att;
    float lam = max(dot(wn, d * inversesqrt(d2 + 0.01)), 0.0) * 0.8 + 0.2;
    sum += uLampColor * att * lam * 0.95;
  }
  for (int i = 0; i < ${MAX_POINTS}; i++) {
    vec4 p = uPoints[i];
    if (p.w < 0.5) continue;
    vec3 d = p.xyz - wp;
    float d2 = dot(d, d);
    float att = max(0.0, 1.0 - d2 / (p.w * p.w + 0.001));
    sum += uPointColors[i] * att * att * (max(dot(wn, normalize(d)), 0.0) * 0.6 + 0.4);
  }
  if (uHeadPos.w > 0.5) {
    vec3 d = wp - uHeadPos.xyz;
    float dist = length(d);
    float c = dot(d / max(dist, 0.001), uHeadDir);
    float cone = smoothstep(0.82, 0.95, c) * max(0.0, 1.0 - dist / 38.0);
    float near = max(0.0, 1.0 - dist / 5.0) * 0.4;
    sum += vec3(1.0, 0.93, 0.78) * (cone * 1.8 + near) * (max(dot(wn, -d / max(dist, 0.001)), 0.0) * 0.8 + 0.2);
  }
  return sum * uNight;
}
`;

function bindLights(sh: { uniforms: Record<string, THREE.IUniform> }, lights: NightLights): void {
  sh.uniforms.uNight = lights.night;
  sh.uniforms.uTime = lights.time;
  sh.uniforms.uLamps = lights.lamps;
  sh.uniforms.uLampColor = lights.lampColor;
  sh.uniforms.uPoints = lights.points;
  sh.uniforms.uPointColors = lights.pointColors;
  sh.uniforms.uHeadPos = lights.headPos;
  sh.uniforms.uHeadDir = lights.headDir;
}

/** Vertex shader lines that put the world position (instancing included) into vWp. */
const WORLD_POS = /* glsl */ `
vec4 shWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
shWp = instanceMatrix * shWp;
#endif
vWp = (modelMatrix * shWp).xyz;
`;

// ------------------------------------------------------------------ the city material

/**
 * Everything static: the array texture by layer (aLayer), mapped in world space, times the
 * vertex colour; window glass lit at night by a hash of its 3 m cell; `lod` boxes draw a
 * procedural facade of windows; road markings (`decals`) read their own UVs (aUv).
 */
export function cityMaterial(tex: THREE.DataArrayTexture, lights: NightLights): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    bindLights(sh, lights);
    sh.uniforms.uLayers = { value: tex };
    sh.uniforms.uScale = { value: SCALE };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nattribute vec2 aUv;\nvarying float vLayer;\nvarying vec3 vWp;\nvarying vec2 vDecal;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLayer = aLayer;\nvDecal = aUv;\n' + WORLD_POS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uLayers;
uniform float uScale[18];
varying float vLayer;
varying vec3 vWp;
varying vec2 vDecal;
${LIGHT_GLSL}
float shHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `
float lay = floor(vLayer + 0.5);
vec3 shN = normalize(cross(dFdx(vWp), dFdy(vWp)));
vec3 shA = abs(shN);
vec2 shUv = shA.y > 0.6 ? vWp.xz : (shA.x > shA.z ? vWp.zy : vWp.xy);
vec3 shEmit = vec3(0.0);
int li = int(lay);
if (lay < 14.5) {
  vec2 tuv = lay == 12.0 ? vDecal : shUv / uScale[li];
  vec4 tx = texture(uLayers, vec3(tuv, lay));
  if (lay == 12.0 && tx.a < 0.45) discard;
  diffuseColor.rgb *= tx.rgb;
}
if (lay == 16.0) {
  // the river: dark water with moving glints
  float w = sin(vWp.x * 0.35 + uTime * 0.8) * sin(vWp.z * 0.5 - uTime * 0.6);
  diffuseColor.rgb = vec3(0.02, 0.05, 0.1) + vec3(0.05, 0.07, 0.1) * w;
  shEmit = vec3(0.9, 0.55, 0.25) * smoothstep(0.75, 1.0, w) * 0.25 * uNight;
}
if (lay == 17.0) shEmit = diffuseColor.rgb * (1.2 + 1.4 * uNight);
if (lay == 13.0 || lay == 15.0) {
  // windows: a 3 m cell lit or dark at night
  vec3 cell = floor(vWp / 3.0 + 0.001 * shN);
  float h = shHash(cell);
  float lit = step(0.52, h) * uNight;
  vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.72, 0.86, 1.0), step(0.86, h));
  if (lay == 15.0) {
    // far boxes: a grid of windows on the walls, the roof plain
    vec2 f = fract(shUv / vec2(3.0, 3.0));
    float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.75) * step(shA.y, 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.19, 0.25), win);
    shEmit = warm * lit * win * 1.25;
  } else {
    shEmit = warm * lit * 0.75;
  }
}
`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += shEmit;')
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * nightLight(vWp, shN);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'sh-city';
  return mat;
}

// ------------------------------------------------------------------ vehicles

/**
 * Vehicles (instanced): vertex colours, `_kind` per vertex, per instance a paint colour
 * (instanceColor) and aState = (brake or lamp, beacon on, damage, lights on).
 */
export function vehicleMaterial(lights: NightLights): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    bindLights(sh, lights);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _kind;\nattribute vec4 aState;\nvarying float vKind;\nvarying vec4 vState;\nvarying vec3 vWp;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      // only the paint takes the instance colour
      .replace('#include <color_vertex>', '#include <color_vertex>\nvKind = _kind;\nvState = aState;\n#ifdef USE_INSTANCING_COLOR\nif (abs(_kind - 1.0) > 0.5) vColor.rgb = color.rgb;\n#endif')
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_POS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vKind;\nvarying vec4 vState;\nvarying vec3 vWp;\n${LIGHT_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float k = floor(vKind + 0.5);
vec3 shN = normalize(cross(dFdx(vWp), dFdy(vWp)));
// soot: damage darkens the body
diffuseColor.rgb *= 1.0 - vState.z * 0.55 * step(k, 1.5);
float on = max(vState.w, uNight);
if (k == 2.0) totalEmissiveRadiance += vec3(1.0, 0.92, 0.7) * (0.25 + on * 1.4);
if (k == 3.0) totalEmissiveRadiance += vec3(1.0, 0.08, 0.05) * (0.15 + on * 0.5 + vState.x * 1.3);
if (k == 4.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.08, 0.12), 0.6);
float flash = step(0.5, fract(uTime * 2.6 + vWp.x * 0.001));
if (k == 5.0) totalEmissiveRadiance += vec3(1.0, 0.1, 0.08) * vState.y * flash * 2.6;
if (k == 6.0) totalEmissiveRadiance += vec3(0.15, 0.35, 1.0) * vState.y * (1.0 - flash) * 2.6;
if (k == 7.0) totalEmissiveRadiance += vec3(1.0, 0.12, 0.08) * step(abs(vState.x - 0.0), 0.1) * 2.2;
if (k == 8.0) totalEmissiveRadiance += vec3(1.0, 0.75, 0.1) * step(abs(vState.x - 1.0), 0.1) * 2.2;
if (k == 9.0) totalEmissiveRadiance += vec3(0.15, 1.0, 0.35) * step(abs(vState.x - 2.0), 0.1) * 2.2;
`)
      .replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * nightLight(vWp, shN);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'sh-vehicle';
  return mat;
}

/** Additive glow (light pools, beams, markers, beacons' halos): vertex colours, no lighting. */
export function glowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
}

/** A soft round spot (white centre to transparent edge) as a canvas texture. */
export function spotTexture(size = 64): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
