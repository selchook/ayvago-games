// City generator: the few shared materials that draw a whole city.
//
//   city   everything static (roads with their markings, sidewalks, kerbs, grass, buildings with
//          shader-drawn windows and shopfronts, roofs, props) and the instanced props: one
//          Lambert material with vertex colours whose fragment shader switches on a per-vertex
//          kind (aK.x). Windows, lane markings, crosswalks, paving joints, brick, corrugated
//          metal and traffic-light phases are all drawn here from UVs in metres, so geometry
//          stays simple and there are no textures to stretch.
//   water  the water plane: waves, sky reflection, sun glints, city lights at night.
//   sky    a gradient dome with the sun and stars, drawn behind everything.
//   halo   additive billboards round street lamps at night.
//
// Night is faked: a light map (RGB over the whole city, lamp pools and shop glow splatted on
// the CPU once) lights the ground and the lower walls, lit windows are emissive by a hash of
// their cell. No per-lamp lights.
import * as THREE from 'three';
import { LOOKS, type Look } from './look';
import type { LookId } from './styles';

/** Vertex kinds (aK.x). */
export const K = {
  plain: 0, facade: 1, road: 2, asphalt: 3, walk: 4, grass: 5, roof: 6, glow: 7, tiles: 8, water: 9, metal: 10,
  ground: 11, groundFar: 22, paint: 12, awning: 13, concrete: 14, sand: 16, signal: 17, parking: 18, gravel: 19, leaves: 20, glass: 21,
} as const;

/** Facade styles (packed into aK.w). */
export const FACADE = { punched: 0, glass: 1, ribbon: 2, brick: 3, shed: 4, house: 5, blank: 6 } as const;

export interface CityUniforms {
  uTime: { value: number };
  uNight: { value: number };
  uNeon: { value: number };
  uFocus: { value: THREE.Vector3 };
  uNearR: { value: number };
  uLight: { value: THREE.Texture | null };
  uGround: { value: THREE.Texture | null };
  /** x0, z0, size of the light and ground maps. */
  uMapRect: { value: THREE.Vector3 };
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uWater: { value: THREE.Color };
  uLamp: { value: THREE.Color };
  uSunGlow: { value: number };
  uStars: { value: number };
}

export function makeUniforms(): CityUniforms {
  return {
    uTime: { value: 0 }, uNight: { value: 0 }, uNeon: { value: 1 },
    uFocus: { value: new THREE.Vector3() }, uNearR: { value: 0 },
    uLight: { value: null }, uGround: { value: null }, uMapRect: { value: new THREE.Vector3(0, 0, 1) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
    uWater: { value: new THREE.Color() }, uLamp: { value: new THREE.Color() },
    uSunGlow: { value: 1 }, uStars: { value: 0 },
  };
}

export function applyLook(u: CityUniforms, look: Look): void {
  u.uNight.value = look.night;
  u.uNeon.value = look.neon;
  u.uZenith.value.set(look.zenith);
  u.uHorizon.value.set(look.horizon);
  u.uSunDir.value.set(...look.sunDir).normalize();
  u.uSunCol.value.set(look.sun);
  u.uWater.value.set(look.water);
  u.uLamp.value.set(look.lamp);
  u.uSunGlow.value = look.sunGlow;
  u.uStars.value = look.stars;
}

export const lookOf = (id: LookId): Look => LOOKS[id];

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uNeon;
uniform sampler2D uLight;
uniform sampler2D uGround;
uniform vec3 uMapRect;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uLamp;
float cityHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float cityNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = cityHash(vec3(i, 1.0)), b = cityHash(vec3(i + vec2(1.0, 0.0), 1.0));
  float c = cityHash(vec3(i + vec2(0.0, 1.0), 1.0)), d = cityHash(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}
// a stripe of width w centred on c along coordinate x, anti-aliased by its screen footprint
float cityLine(float x, float c, float w) {
  float fw = max(fwidth(x), 1e-4);
  return clamp((w * 0.5 - abs(x - c)) / fw + 0.5, 0.0, 1.0) * clamp(w / (fw * 1.5), 0.0, 1.0);
}
// a box [a, b] on coordinate x, anti-aliased
float cityBand(float x, float a, float b) {
  float fw = max(fwidth(x), 1e-4);
  return clamp((x - a) / fw + 0.5, 0.0, 1.0) * clamp((b - x) / fw + 0.5, 0.0, 1.0);
}
`;

const VERT_HEAD = /* glsl */ `
attribute vec4 aK;
attribute vec2 aUv;
attribute vec2 aC;
uniform vec3 uFocus;
uniform float uNearR;
flat varying vec4 vK;
varying vec2 vUv2;
varying vec3 vWp;
varying vec3 vInst;
`;

const FRAG_HEAD = /* glsl */ `
flat varying vec4 vK;
varying vec2 vUv2;
varying vec3 vWp;
varying vec3 vInst;
`;

/** Fragment code that sets diffuseColor and cityEmit from the kind. */
const FRAG_KINDS = /* glsl */ `
float kind = floor(vK.x + 0.5);
vec3 cityEmit = vec3(0.0);
vec3 gN = normalize(cross(dFdx(vWp), dFdy(vWp)));
vec3 toCam = normalize(cameraPosition - vWp);
float dCam = length(cameraPosition - vWp);
if (kind == 1.0 || kind == 21.0) {
  // facades: windows on a grid of floors and bays
  float floorH = max(vK.y, 2.0);
  float bayW = max(vK.z, 1.0);
  float code = floor(vK.w + 0.0001);
  float seed = fract(vK.w);
  float style = mod(code, 8.0);
  float shop = mod(floor(code / 8.0), 2.0);
  float litF = floor(code / 16.0) / 10.0;
  float u = vUv2.x / bayW;
  float v = vUv2.y;
  float fy = fract(v / floorH), fl = floor(v / floorH);
  float fx = fract(u), bx = floor(u);
  float h = cityHash(vec3(bx, fl, seed * 917.0 + 3.0));
  float h2 = cityHash(vec3(bx * 1.7, fl * 3.1, seed * 211.0 + 7.0));
  vec3 base = diffuseColor.rgb;
  float win = 0.0;
  float frame = 0.0;
  if (style == 1.0) {
    // curtain wall: glass with thin mullions and spandrel bands
    win = (1.0 - cityLine(fx, 0.0, 0.06) - cityLine(fx, 1.0, 0.06)) * (1.0 - cityBand(fy, 0.0, 0.16));
  } else if (style == 2.0) {
    win = cityBand(fy, 0.34, 0.86) * (1.0 - cityLine(fx, 0.5, 0.05));
  } else if (style == 3.0) {
    // brick: courses and mortar, narrow windows with a lintel
    float course = fract(v / 0.32);
    float brickU = fract(vUv2.x / 0.9 + step(0.5, fract(v / 0.64)) * 0.5);
    float mortar = max(cityLine(course, 0.0, 0.12), cityLine(brickU, 0.0, 0.05));
    base *= 1.0 - mortar * 0.18 * clamp(30.0 / dCam, 0.0, 1.0);
    base *= 0.92 + 0.16 * cityHash(vec3(floor(vUv2.x / 0.9), floor(v / 0.32), 5.0)) * clamp(40.0 / dCam, 0.0, 1.0);
    win = cityBand(fx, 0.3, 0.7) * cityBand(fy, 0.22, 0.78);
    frame = cityBand(fx, 0.27, 0.73) * cityBand(fy, 0.78, 0.86);
  } else if (style == 4.0) {
    // corrugated metal and a band of clerestory windows
    base *= 0.86 + 0.14 * sin(vUv2.x * 20.94);
    win = cityBand(fy, 0.76, 0.88) * cityBand(fx, 0.08, 0.92);
  } else if (style == 5.0) {
    win = cityBand(fx, 0.32, 0.68) * cityBand(fy, 0.3, 0.76);
    frame = cityBand(fx, 0.28, 0.72) * cityBand(fy, 0.26, 0.8) - win;
  } else if (style == 0.0) {
    win = cityBand(fx, 0.2, 0.8) * cityBand(fy, 0.3, 0.84);
    frame = cityBand(fx, 0.17, 0.83) * cityBand(fy, 0.27, 0.87) - win;
  }
  // shopfronts on the ground floor
  float shopRow = shop * step(v, floorH * 1.05);
  if (shopRow > 0.5) {
    float sx = fract(u * 2.0);
    win = cityBand(v, 0.25, floorH * 0.82) * (1.0 - cityLine(sx, 0.0, 0.05));
    frame = 0.0;
  }
  // far away the grid melts into its average
  float aa = clamp(max(fwidth(u) * 2.2, fwidth(v / floorH) * 2.6) - 0.35, 0.0, 1.0);
  float cover = style == 1.0 ? 0.75 : style == 2.0 ? 0.5 : style == 6.0 ? 0.0 : style == 4.0 ? 0.1 : 0.32;
  win = mix(win, cover, aa);
  frame = mix(frame, 0.0, aa);
  // glass: sky reflection by day (fresnel), dark at night
  float fres = pow(1.0 - clamp(dot(gN, toCam), 0.0, 1.0), 2.0);
  vec3 sky = mix(uHorizon, uZenith, 0.35 + 0.4 * h2);
  vec3 glass = mix(vec3(0.06, 0.08, 0.11), sky * 0.85, (0.35 + 0.55 * fres) * (1.0 - uNight * 0.85));
  glass *= 0.85 + 0.3 * h2;
  if (kind == 21.0) glass = mix(glass, base, 0.25);
  diffuseColor.rgb = mix(base, glass, win);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.86), clamp(frame, 0.0, 1.0) * 0.6);
  // lit windows: a share of the cells (the litF of the building), warm or cool
  float share = litF * (0.2 + 0.7 * uNight);
  float lit = step(h, share) * step(0.02, uNight) * (0.45 + 0.55 * fract(h2 * 7.13));
  vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.88, 1.0), step(0.78, h2));
  warm = mix(warm, vec3(1.0, 0.45, 0.85), step(0.96, h2) * step(1.5, uNeon));
  float avgLit = share * 0.32 * step(0.02, uNight);
  lit = mix(lit, avgLit, aa);
  cityEmit += warm * win * lit * (0.45 + 0.55 * uNight);
  if (shopRow > 0.5) {
    vec3 sc = mix(vec3(1.0, 0.85, 0.6), vec3(0.6, 0.9, 1.0), step(0.6, h));
    sc = mix(sc, vec3(1.0, 0.4, 0.7), step(0.85, h) * step(1.0, uNeon));
    cityEmit += sc * win * uNight * 1.1;
  }
} else if (kind == 2.0) {
  // roads: lane markings, stop lines, crosswalks, parking bays, asphalt wear
  float u = vUv2.x, v = vUv2.y;
  float s0 = vK.y, s1 = vK.z;
  float code = floor(vK.w + 0.5);
  float lanes = mod(code, 4.0);
  float cls = mod(floor(code / 4.0), 4.0);
  float cwA = mod(floor(code / 16.0), 2.0), cwB = mod(floor(code / 32.0), 2.0);
  float stA = mod(floor(code / 64.0), 2.0), stB = mod(floor(code / 128.0), 2.0);
  float park = mod(floor(code / 256.0), 2.0);
  float lw = 3.4;
  float c0 = cls == 0.0 ? 2.0 : 0.15;
  float au = abs(u);
  vec3 col = diffuseColor.rgb * (0.88 + 0.2 * cityNoise(vWp.xz * 0.6) + 0.08 * cityNoise(vWp.xz * 0.07));
  // tyre tracks
  for (int k = 0; k < 3; k++) {
    if (float(k) >= lanes) break;
    float lc = c0 + (float(k) + 0.5) * lw;
    col *= 1.0 - 0.07 * (cityLine(au, lc - 0.85, 0.5) + cityLine(au, lc + 0.85, 0.5));
  }
  float white = 0.0, yellow = 0.0;
  if (cls < 3.0) {
    if (cls == 1.0) yellow += cityLine(au, 0.14, 0.11);
    if (cls == 2.0) yellow += cityLine(au, 0.0, 0.12) * step(fract(v / 8.0), 0.55);
    for (int k = 1; k < 3; k++) {
      if (float(k) >= lanes) break;
      white += cityLine(au, c0 + float(k) * lw, 0.12) * step(fract(v / 9.0), 0.4);
    }
    float edge = c0 + lanes * lw;
    if (park > 0.5) {
      white += cityLine(au, edge, 0.1) * step(fract(v / 3.0), 0.6);
      white += cityBand(au, edge, edge + 2.3) * cityLine(fract(v / 6.2), 0.5, 0.025);
    } else white += cityLine(au, edge + 0.1, 0.14);
    // stop lines and crosswalks at the junction ends
    float inner = step(au, edge);
    if (stB > 0.5) white += cityBand(v, s1 - 4.3, s1 - 3.8) * step(0.0, u) * inner;
    if (stA > 0.5) white += cityBand(v, s0 + 3.8, s0 + 4.3) * step(u, 0.0) * inner;
    float zebra = cityBand(fract(u / 1.1 + 0.25), 0.0, 0.5);
    if (cwA > 0.5) { float z = cityBand(v, s0 + 0.5, s0 + 3.3); white = max(white, z * zebra); yellow *= 1.0 - z; }
    if (cwB > 0.5) { float z = cityBand(v, s1 - 3.3, s1 - 0.5); white = max(white, z * zebra); yellow *= 1.0 - z; }
  }
  float wear = 0.75 + 0.25 * cityNoise(vWp.xz * 1.7);
  col = mix(col, vec3(0.86, 0.86, 0.84), clamp(white, 0.0, 1.0) * wear);
  col = mix(col, vec3(0.92, 0.7, 0.16), clamp(yellow, 0.0, 1.0) * wear);
  diffuseColor.rgb = col;
} else if (kind == 3.0) {
  diffuseColor.rgb *= 0.88 + 0.2 * cityNoise(vWp.xz * 0.6) + 0.08 * cityNoise(vWp.xz * 0.07);
} else if (kind == 4.0) {
  // paving slabs
  vec2 t = vWp.xz / 1.25;
  float j = max(cityLine(fract(t.x), 0.0, 0.07), cityLine(fract(t.y), 0.0, 0.07));
  diffuseColor.rgb *= (0.94 + 0.1 * cityHash(vec3(floor(t), 2.0)) * clamp(40.0 / dCam, 0.0, 1.0)) * (1.0 - j * 0.16);
} else if (kind == 5.0 || kind == 20.0) {
  float n = cityNoise(vWp.xz * 0.35) * 0.6 + cityNoise(vWp.xz * 2.1) * 0.4;
  diffuseColor.rgb *= 0.82 + 0.32 * n;
} else if (kind == 6.0) {
  diffuseColor.rgb *= 0.86 + 0.18 * cityNoise(vWp.xz * 1.3);
} else if (kind == 7.0) {
  cityEmit += diffuseColor.rgb * (vK.y + vK.z * uNight * uNeon);
} else if (kind == 8.0) {
  // roof tiles: rows along the slope
  float r = fract(vUv2.y / 0.35);
  diffuseColor.rgb *= 0.86 + 0.14 * smoothstep(0.0, 0.8, r) * clamp(40.0 / dCam, 0.0, 1.0);
} else if (kind == 9.0) {
  float w = sin(vWp.x * 1.3 + uTime * 1.6) * sin(vWp.z * 1.1 - uTime * 1.2);
  float fres = pow(1.0 - clamp(toCam.y, 0.0, 1.0), 3.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHorizon, fres * 0.5 * (1.0 - uNight)) + 0.05 * w;
  cityEmit += diffuseColor.rgb * 0.15;
} else if (kind == 10.0) {
  diffuseColor.rgb *= 0.84 + 0.16 * sin(vUv2.x * 25.0);
} else if (kind == 11.0 || kind == 22.0) {
  // ground map: alpha 0 is the sea, 0.5 a river (both show the water plane below); past the
  // map's edge (kind 22) rivers end and only the sea goes on
  vec2 guv = (vWp.xz - uMapRect.xy) / uMapRect.z;
  if (kind == 22.0 && guv.x > 0.003 && guv.y > 0.003 && guv.x < 0.997 && guv.y < 0.997) discard;
  vec4 g = texture2D(uGround, guv);
  if (g.a < 0.25 || (kind == 11.0 && g.a < 0.75)) discard;
  diffuseColor.rgb = g.a < 0.75 ? diffuseColor.rgb : g.rgb;
  if (g.a < 0.9) {
    // open country: a patchwork of fields and woods
    vec2 cell = floor(vWp.xz / 140.0 + vec2(cityNoise(vWp.xz * 0.004) * 2.0));
    float f = cityHash(vec3(cell, 9.0));
    vec3 tintC = f < 0.3 ? vec3(1.08, 1.05, 0.72) : f < 0.55 ? vec3(0.78, 0.92, 0.7) : f < 0.7 ? vec3(0.95, 0.82, 0.6) : vec3(1.0);
    diffuseColor.rgb *= tintC * (0.88 + 0.22 * cityNoise(vWp.xz * 0.02));
  }
} else if (kind == 12.0) {
  // paint: the instance colour, a little gloss towards the sky
  float fres = pow(1.0 - clamp(dot(gN, toCam), 0.0, 1.0), 3.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHorizon * 0.9, fres * 0.35 * (1.0 - uNight));
} else if (kind == 13.0) {
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), step(0.5, fract(vUv2.x / 0.9)));
} else if (kind == 14.0) {
  diffuseColor.rgb *= 0.9 + 0.14 * cityNoise(vWp.xz * 0.5) + 0.06 * cityNoise(vWp.xz * 4.0);
} else if (kind == 16.0) {
  diffuseColor.rgb *= 0.9 + 0.12 * cityNoise(vWp.xz * 0.8) + 0.05 * cityNoise(vWp.xz * 6.0);
} else if (kind == 17.0) {
  // traffic light lamps: vK.y is the lamp (0 red, 1 yellow, 2 green); instance colour r = group, g = phase
  float c = mod(uTime + vInst.g * 30.0, 30.0);
  float g = vInst.r > 0.5 ? mod(c + 15.0, 30.0) : c;
  float state = g < 12.0 ? 2.0 : g < 15.0 ? 1.0 : 0.0;
  float on = 1.0 - step(0.5, abs(vK.y - state));
  vec3 lc = vK.y < 0.5 ? vec3(1.0, 0.12, 0.08) : vK.y < 1.5 ? vec3(1.0, 0.7, 0.1) : vec3(0.15, 1.0, 0.45);
  diffuseColor.rgb = mix(lc * 0.18, lc, on);
  cityEmit += lc * on * (1.2 + 2.0 * uNight);
} else if (kind == 18.0) {
  // parking lot: asphalt with bay lines (uv: u along the lot, v in from its front)
  diffuseColor.rgb *= 0.9 + 0.16 * cityNoise(vWp.xz * 0.6);
  float bay = cityLine(fract(vUv2.x / 2.8), 0.0, 0.04) * step(fract((vUv2.y - 0.2) / 6.0), 0.92);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), bay * 0.8);
} else if (kind == 19.0) {
  diffuseColor.rgb *= 0.8 + 0.3 * cityHash(vec3(floor(vWp.xz * 6.0), 4.0)) * clamp(25.0 / dCam, 0.0, 1.0) + 0.1 * cityNoise(vWp.xz * 0.4);
}
`;

/** Night: the light map lights the ground and the lower walls. */
const FRAG_NIGHT = /* glsl */ `
if (uNight > 0.01) {
  vec3 lm = texture2D(uLight, (vWp.xz - uMapRect.xy) / uMapRect.z).rgb;
  float hf = clamp(1.0 - vWp.y / 11.0, 0.0, 1.0);
  float up = 0.45 + 0.55 * max(gN.y, 0.0);
  outgoingLight += diffuseColor.rgb * lm * hf * up * uNight * 2.6;
}
`;

function patchCity(mat: THREE.Material, u: CityUniforms, key: string): void {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// far boxes give way to the near chunks round the focus
if (aC.x + aC.y > 0.5 && distance(aC, uFocus.xz) < uNearR) transformed = vec3(0.0);`)
      .replace('#include <color_vertex>', `#include <color_vertex>
vK = aK;
vUv2 = aUv;
#ifdef USE_INSTANCING_COLOR
vInst = instanceColor;
if (abs(aK.x - 12.0) > 0.5 && abs(aK.x - 20.0) > 0.5 && abs(aK.x - 10.0) > 0.5) vColor.rgb = color.rgb;
#else
vInst = vec3(1.0);
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 cityWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
cityWp = instanceMatrix * cityWp;
#endif
vWp = (modelMatrix * cityWp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_KINDS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cityEmit;')
      .replace('#include <opaque_fragment>', FRAG_NIGHT + '#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => key;
}

export function cityMaterial(u: CityUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchCity(mat, u, 'city-v1');
  return mat;
}

/** The water plane. */
export function waterMaterial(u: CityUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.uniforms.uWater = u.uWater;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON + 'uniform vec3 uWater;\nvarying vec3 vWp;')
      .replace('#include <map_fragment>', `#include <map_fragment>
vec2 p = vWp.xz;
float t = uTime;
// only where the ground map has water (or past its edge, the sea)
vec2 guv = (vWp.xz - uMapRect.xy) / uMapRect.z;
vec4 gm = texture2D(uGround, guv);
bool inMap = guv.x > 0.0 && guv.y > 0.0 && guv.x < 1.0 && guv.y < 1.0;
if (gm.a > 0.75 || (!inMap && gm.a > 0.25)) discard;
// ripples fade out where they would alias (far away, grazing views)
float fw = length(fwidth(p));
float k1 = clamp(1.0 - fw * 0.35, 0.0, 1.0), k2 = clamp(1.0 - fw * 1.2, 0.0, 1.0);
vec3 n = normalize(vec3(
  sin(p.x * 0.21 + t * 0.9) * 0.5 * k1 + sin(p.x * 0.67 - p.y * 0.31 + t * 1.7) * 0.3 * k2 + (cityNoise(p * 0.8 + t * 0.3) - 0.5) * 0.5 * k2,
  4.0,
  sin(p.y * 0.19 - t * 0.8) * 0.5 * k1 + sin(p.y * 0.71 + p.x * 0.27 + t * 1.3) * 0.3 * k2 + (cityNoise(p * 0.8 - t * 0.25) - 0.5) * 0.5 * k2));
vec3 toCam = normalize(cameraPosition - vWp);
float fres = pow(1.0 - clamp(dot(n, toCam), 0.0, 1.0), 4.0);
vec3 refl = reflect(-toCam, n);
vec3 sky = mix(uHorizon, uZenith, clamp(refl.y * 1.5, 0.0, 1.0));
diffuseColor.rgb = mix(uWater, sky, 0.15 + 0.6 * fres);
float spec = pow(max(dot(refl, uSunDir), 0.0), 180.0) * (1.0 - uNight);
vec3 waterEmit = uSunCol * spec * 3.0 + sky * fres * 0.25;
// the city's lights shimmer on the water at night
vec3 lm = texture2D(uLight, (vWp.xz + n.xz * 6.0 - uMapRect.xy) / uMapRect.z).rgb;
waterEmit += lm * uNight * (0.5 + 0.8 * cityNoise(p * 1.5 + vec2(0.0, t))) * 0.9;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += waterEmit;');
  };
  mat.customProgramCacheKey = () => 'city-water-v1';
  return mat;
}

/** Sky dome: gradient, sun disc and glow, stars at night. */
export function skyMaterial(u: CityUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uZenith: u.uZenith, uHorizon: u.uHorizon, uSunDir: u.uSunDir, uSunCol: u.uSunCol, uSunGlow: u.uSunGlow, uStars: u.uStars, uNight: u.uNight },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uSunGlow; uniform float uStars; uniform float uNight;
varying vec3 vDir;
float h3(vec3 p) { p = fract(p * vec3(0.1031, 0.103, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(y, 0.55));
  // below the horizon: haze
  col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.08, d.y));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 16.0) * 0.35 * uSunGlow + pow(s, 4.0) * 0.12 * uSunGlow);
  if (uStars > 0.0) {
    vec3 c = floor(d * 280.0);
    float st = step(0.9965, h3(c)) * smoothstep(0.05, 0.3, d.y);
    col += vec3(0.9, 0.92, 1.0) * st * uStars * (0.5 + 0.5 * h3(c + 7.0));
    // the city's glow on the horizon
    col += vec3(0.35, 0.16, 0.3) * uNight * exp(-y * 9.0) * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    depthWrite: false,
    fog: false,
    side: THREE.BackSide,
  });
}

/** Additive halos round the lamps (billboards; instance colour = tint). */
export function haloMaterial(u: CityUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uNight: u.uNight, uLamp: u.uLamp },
    vertexShader: /* glsl */ `
varying vec2 vQ;
varying float vFade;
#ifdef USE_INSTANCING_COLOR
varying vec3 vTint;
#endif
void main() {
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float size = 2.6;
  c.xy += position.xy * size;
  vQ = position.xy;
  vFade = clamp(1.0 - (-c.z - 60.0) / 500.0, 0.0, 1.0);
  #ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
  #endif
  gl_Position = projectionMatrix * c;
}`,
    fragmentShader: /* glsl */ `
uniform float uNight; uniform vec3 uLamp;
varying vec2 vQ;
varying float vFade;
#ifdef USE_INSTANCING_COLOR
varying vec3 vTint;
#endif
void main() {
  float r = length(vQ);
  float a = exp(-r * r * 5.0) * 0.55 + exp(-r * r * 40.0) * 0.6;
  vec3 c = uLamp;
  #ifdef USE_INSTANCING_COLOR
  c *= vTint;
  #endif
  gl_FragColor = vec4(c * a * uNight * vFade, 1.0);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
