// City generator: looks (time of day). Each preset sets the sky gradient, sun, ambient light,
// fog, water colour and how much "night" the shaders draw: lit windows, lamp pools from the
// light map, glowing signs and lamp halos. Pure data; the materials read it.
import type { LookId } from './styles';

export type { LookId };

export interface Look {
  id: LookId;
  name: { en: string; tr: string };
  zenith: number; horizon: number; ground: number;
  fog: number; fogNear: number; fogFar: number;
  sun: number; sunIntensity: number;
  /** Direction towards the sun (normalised later). */
  sunDir: [number, number, number];
  sky: number; skyGround: number; ambient: number;
  water: number;
  /** 0 = day … 1 = full night: windows, lamps, signs, halos. */
  night: number;
  /** Lamp light colour. */
  lamp: number;
  /** Sign glow strength. */
  neon: number;
  stars: number;
  /** Sun disc size and glow. */
  sunGlow: number;
  shadows: boolean;
}

export const LOOKS: Record<LookId, Look> = {
  day: {
    id: 'day', name: { en: 'Sunny day', tr: 'Güneşli gün' },
    zenith: 0x2f7fd8, horizon: 0xcfe8ff, ground: 0x8aa0b0,
    fog: 0xc4dcef, fogNear: 260, fogFar: 1700,
    sun: 0xfff4e0, sunIntensity: 2.5, sunDir: [-0.45, 0.85, 0.35],
    sky: 0xdcecff, skyGround: 0x8a7f6a, ambient: 1.25,
    water: 0x2e6f9e, night: 0, lamp: 0xffc070, neon: 0.25, stars: 0, sunGlow: 0.6, shadows: true,
  },
  golden: {
    id: 'golden', name: { en: 'Golden hour', tr: 'Altın saat' },
    zenith: 0x40598f, horizon: 0xffbe7a, ground: 0x7a6a60,
    fog: 0xe9b88e, fogNear: 220, fogFar: 1500,
    sun: 0xffb070, sunIntensity: 2.6, sunDir: [-0.75, 0.24, 0.55],
    sky: 0xb7b9d6, skyGround: 0x7a5a48, ambient: 1.0,
    water: 0x36557a, night: 0.22, lamp: 0xffb060, neon: 0.6, stars: 0, sunGlow: 1.6, shadows: true,
  },
  night: {
    id: 'night', name: { en: 'Neon night', tr: 'Neon gece' },
    zenith: 0x03040c, horizon: 0x2b1b4a, ground: 0x0a0a12,
    fog: 0x1b1533, fogNear: 140, fogFar: 1100,
    sun: 0x8fa8ff, sunIntensity: 0.2, sunDir: [0.4, 0.75, -0.3],
    sky: 0x34406e, skyGround: 0x120f18, ambient: 0.24,
    water: 0x0a1424, night: 1, lamp: 0xffa24a, neon: 2.2, stars: 1, sunGlow: 0, shadows: false,
  },
  overcast: {
    id: 'overcast', name: { en: 'Overcast', tr: 'Kapalı hava' },
    zenith: 0x7d8792, horizon: 0xc9ced3, ground: 0x7a7d80,
    fog: 0xb9bec3, fogNear: 160, fogFar: 1100,
    sun: 0xe8ecf0, sunIntensity: 0.9, sunDir: [-0.3, 0.9, 0.2],
    sky: 0xd0d6dc, skyGround: 0x6e6a64, ambient: 1.7,
    water: 0x45606f, night: 0.08, lamp: 0xffc070, neon: 0.4, stars: 0, sunGlow: 0, shadows: false,
  },
};

export const LOOK_IDS = Object.keys(LOOKS) as LookId[];
