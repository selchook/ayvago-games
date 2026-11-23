// City generator: the day–night cycle. A time of day (hours, 0–24) gives the sky gradient, the
// sunrise and sunset glow, fog, ambient and sky light, the sun's arc (and the moon's at night),
// the sea's colour, how far the street lamps and windows have come on, the shop signs' glow and
// the stars. Keyframes are interpolated; nothing is allocated per call, so CityView can move the
// clock every frame. Weather (overcast) mixes in a grey sky.
import * as THREE from 'three';

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

/** Sunrise and sunset, hours. */
export const SUNRISE = 6.3;
export const SUNSET = 19.3;

/** The phase at an hour: dawn from first light to the morning, dusk from golden hour to dark. */
export function phaseAt(t: number): DayPhase {
  const h = ((t % 24) + 24) % 24;
  if (h >= 5.2 && h < 7.3) return 'dawn';
  if (h >= 7.3 && h < 18.2) return 'day';
  if (h >= 18.2 && h < 20.8) return 'dusk';
  return 'night';
}

interface Key {
  t: number;
  zenith: number; horizon: number; fog: number; sun: number; sky: number; skyGround: number; water: number; glow: number;
  sunI: number; ambient: number; night: number; neon: number; stars: number; sunGlow: number; fogNear: number; fogFar: number;
}

const NIGHT: Omit<Key, 't'> = {
  zenith: 0x04060f, horizon: 0x1a2140, fog: 0x141a30, sun: 0xffffff, sky: 0x34406e, skyGround: 0x120f18, water: 0x0a1424, glow: 0x000000,
  sunI: 0, ambient: 0.3, night: 1, neon: 1.7, stars: 1, sunGlow: 0, fogNear: 160, fogFar: 1250,
};
const DAY: Omit<Key, 't'> = {
  zenith: 0x2f7fd8, horizon: 0xcfe8ff, fog: 0xc4dcef, sun: 0xfff4e0, sky: 0xdcecff, skyGround: 0x8a7f6a, water: 0x2e6f9e, glow: 0x000000,
  sunI: 2.5, ambient: 1.25, night: 0, neon: 0.25, stars: 0, sunGlow: 0.6, fogNear: 260, fogFar: 1700,
};
const KEYS: Key[] = [
  { t: 0, ...NIGHT },
  { t: 4.6, ...NIGHT, horizon: 0x1f2a4e },
  { t: 5.5, ...NIGHT, zenith: 0x14204a, horizon: 0x5a6290, fog: 0x4a5278, sky: 0x5a6a9a, ambient: 0.42, night: 0.8, stars: 0.35, glow: 0x6a3a5a, water: 0x16284a, neon: 1.3, fogNear: 200, fogFar: 1400 },
  { t: 6.3, zenith: 0x3d5c9a, horizon: 0xf4a468, fog: 0xd9a98a, sun: 0xffa060, sky: 0x9aa8c8, skyGround: 0x6a5040, water: 0x2c4a6e, glow: 0xff8848, sunI: 1.5, ambient: 0.75, night: 0.35, neon: 0.8, stars: 0, sunGlow: 1.9, fogNear: 220, fogFar: 1500 },
  { t: 7.4, ...DAY, zenith: 0x3a80d2, horizon: 0xdfe4e6, fog: 0xcfd9e2, sun: 0xffe0b8, sunI: 2.2, ambient: 1.05, glow: 0x3a2010, sunGlow: 1.0 },
  { t: 10.5, ...DAY },
  { t: 15.5, ...DAY },
  { t: 17.3, ...DAY, sun: 0xffe6c4, horizon: 0xe2e4e2, fog: 0xd6dbe0, sunI: 2.45, glow: 0x302010, sunGlow: 0.9 },
  { t: 18.5, zenith: 0x40598f, horizon: 0xffbe7a, fog: 0xe9b88e, sun: 0xffb070, sky: 0xb7b9d6, skyGround: 0x7a5a48, water: 0x36557a, glow: 0xff9a50, sunI: 2.5, ambient: 1.0, night: 0.12, neon: 0.6, stars: 0, sunGlow: 1.7, fogNear: 220, fogFar: 1500 },
  { t: 19.3, zenith: 0x2c3a6e, horizon: 0xff8050, fog: 0xb07868, sun: 0xff6a3c, sky: 0x8a86aa, skyGround: 0x5a4038, water: 0x2a3a5a, glow: 0xff5a30, sunI: 1.4, ambient: 0.7, night: 0.45, neon: 1.0, stars: 0, sunGlow: 2.1, fogNear: 200, fogFar: 1400 },
  { t: 20.1, ...NIGHT, zenith: 0x111a3e, horizon: 0x4c4a78, fog: 0x363858, sky: 0x4a5280, ambient: 0.42, night: 0.85, stars: 0.4, glow: 0x5a2c46, water: 0x101c34, neon: 1.4, fogNear: 180, fogFar: 1300 },
  { t: 21.0, ...NIGHT },
  { t: 24, ...NIGHT },
];

const OVERCAST: Omit<Key, 't'> = {
  zenith: 0x7d8792, horizon: 0xc9ced3, fog: 0xb9bec3, sun: 0xe8ecf0, sky: 0xd0d6dc, skyGround: 0x6e6a64, water: 0x45606f, glow: 0x000000,
  sunI: 0.9, ambient: 1.7, night: 0.08, neon: 0.4, stars: 0, sunGlow: 0, fogNear: 160, fogFar: 1100,
};

const COLOURS = ['zenith', 'horizon', 'fog', 'sun', 'sky', 'skyGround', 'water', 'glow'] as const;
const NUMBERS = ['sunI', 'ambient', 'night', 'neon', 'stars', 'sunGlow', 'fogNear', 'fogFar'] as const;
type ColourKey = (typeof COLOURS)[number];
type NumberKey = (typeof NUMBERS)[number];

// keyframe colours converted once (linear rgb)
const toColour = (hex: number) => new THREE.Color(hex);
const KEYC = KEYS.map((k) => Object.fromEntries(COLOURS.map((c) => [c, toColour(k[c])])) as Record<ColourKey, THREE.Color>);
const OVERC = Object.fromEntries(COLOURS.map((c) => [c, toColour(OVERCAST[c])])) as Record<ColourKey, THREE.Color>;
const MOONLIGHT = new THREE.Color(0x9ab0ff);

/** Everything the cycle drives at one moment. */
export interface Daylight {
  hours: number;
  phase: DayPhase;
  zenith: THREE.Color; horizon: THREE.Color; fog: THREE.Color; sun: THREE.Color; sky: THREE.Color; skyGround: THREE.Color; water: THREE.Color; glow: THREE.Color;
  sunI: number; ambient: number; night: number; neon: number; stars: number; sunGlow: number; fogNear: number; fogFar: number;
  /** Towards the sun and the moon (unit). */
  sunDir: THREE.Vector3; moonDir: THREE.Vector3;
  /** The light that casts the shadows: the sun by day, the moon by night (direction, colour, strength). */
  lightDir: THREE.Vector3; lightColour: THREE.Color; light: number;
  /** Lamps and windows coming on (0..1). */
  lampOn: number;
  /** Moon brightness (0..1). */
  moon: number;
}

export function makeDaylight(): Daylight {
  const d = {
    hours: 12, phase: 'day' as DayPhase, sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), lightColour: new THREE.Color(),
    light: 1, lampOn: 0, moon: 0,
  } as Daylight;
  for (const c of COLOURS) d[c] = new THREE.Color();
  for (const n of NUMBERS) d[n] = 0;
  return d;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Fills `out` for the hour `t` (wraps round 24) and an overcast amount (0 clear, 1 grey).
 * `neon` multiplies the signs' glow (a neon city glows more).
 */
export function daylightAt(t: number, out: Daylight, overcast = 0, neon = 1): Daylight {
  const h = ((t % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = smooth(0, 1, (h - a.t) / Math.max(1e-6, b.t - a.t));
  for (const c of COLOURS) out[c].copy(KEYC[i][c]).lerp(KEYC[i + 1][c], k);
  for (const n of NUMBERS) out[n] = a[n] + (b[n] - a[n]) * k;
  out.hours = h;
  out.phase = phaseAt(h);
  // the sun's arc: up at sunrise in the east, high in the south at noon, down in the west
  const day = SUNSET - SUNRISE;
  const sa = ((h - SUNRISE) / day) * Math.PI;
  const sel = Math.sin(sa) * 1.08;
  out.sunDir.set(Math.cos(sa), sel, 0.55 * Math.sin(sa) + 0.18).normalize();
  // the moon crosses the night sky the other way round
  const ma = (((h - SUNSET + 24) % 24) / (24 - day)) * Math.PI;
  out.moonDir.set(-Math.cos(ma), Math.sin(ma) * 0.8, -0.35 * Math.sin(ma) + 0.2).normalize();
  const sunUp = smooth(-0.02, 0.1, out.sunDir.y);
  const moonUp = smooth(0.0, 0.15, out.moonDir.y);
  out.moon = moonUp * smooth(0.4, 0.9, out.night);
  const sunL = out.sunI * sunUp, moonL = 0.32 * moonUp * out.night;
  if (sunL >= moonL) { out.lightDir.copy(out.sunDir); out.lightColour.copy(out.sun); out.light = sunL; }
  else { out.lightDir.copy(out.moonDir); out.lightColour.copy(MOONLIGHT); out.light = moonL; }
  // never let the shadow light graze the ground flat
  if (out.lightDir.y < 0.12) { out.lightDir.y = 0.12; out.lightDir.normalize(); }
  if (overcast > 0) {
    const w = Math.min(1, overcast);
    for (const c of COLOURS) if (c !== 'glow') out[c].lerp(OVERC[c], w * (1 - out.night * 0.7));
    out.glow.multiplyScalar(1 - w);
    out.sunGlow *= 1 - w;
    out.stars *= 1 - w;
    out.moon *= 1 - w;
    out.light *= 1 - w * 0.65;
    out.ambient += (OVERCAST.ambient - out.ambient) * w * (1 - out.night);
    out.fogNear += (OVERCAST.fogNear - out.fogNear) * w;
    out.fogFar += (OVERCAST.fogFar - out.fogFar) * w;
  }
  out.neon *= neon;
  out.lampOn = smooth(0.12, 0.62, out.night);
  return out;
}
