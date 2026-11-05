// Levels: every level has two or three goals; finishing them all clears the level, pays a
// bonus, repaints the table in the next theme and turns the difficulty up. New table parts
// unlock on the way (the saucer, a fourth bumper, the moving guard), and every third level
// earns an extra ball.

export type Goal = 'bumpers' | 'lanes' | 'targets' | 'slings' | 'saucer' | 'points';

export interface Theme {
  name: { tr: string; en: string };
  bg: [string, string];       // playfield gradient, top → bottom
  neon: string;               // wall core colour
  glow: string;               // wall glow and playfield art
  bumper: number; flipper: number; target: number; lamp: number; sling: number;
  accent: string;             // text accent
}

export const THEMES: Theme[] = [
  { name: { tr: 'NEON GECE', en: 'NEON NIGHT' }, bg: ['#24115e', '#07051a'], neon: '#b8f7ff', glow: '#3ee6ff', bumper: 0xff4fa3, flipper: 0xff3b2a, target: 0xff8a1f, lamp: 0xffd23f, sling: 0xff4fa3, accent: '#ffd23f' },
  { name: { tr: 'OKYANUS', en: 'OCEAN' }, bg: ['#073a7a', '#020b1f'], neon: '#c8fdff', glow: '#00c8ff', bumper: 0x3ee6ff, flipper: 0xffd23f, target: 0x5dff7a, lamp: 0x7df9ff, sling: 0x3ee6ff, accent: '#7df9ff' },
  { name: { tr: 'ORMAN', en: 'JUNGLE' }, bg: ['#11542b', '#03140a'], neon: '#e0ffc4', glow: '#5dff7a', bumper: 0xb6ff3e, flipper: 0xff8a1f, target: 0xffd23f, lamp: 0x8dff6a, sling: 0xb6ff3e, accent: '#b6ff3e' },
  { name: { tr: 'CEHENNEM', en: 'INFERNO' }, bg: ['#661208', '#140302'], neon: '#ffe0b8', glow: '#ff6a1f', bumper: 0xff6a1f, flipper: 0xffd23f, target: 0xff3b3b, lamp: 0xffb13e, sling: 0xff6a1f, accent: '#ffb13e' },
  { name: { tr: 'GALAKSİ', en: 'GALAXY' }, bg: ['#420c6b', '#0a0218'], neon: '#ffd1f7', glow: '#ff4fe0', bumper: 0xd36bff, flipper: 0x3ee6ff, target: 0xff4fa3, lamp: 0xff8cf0, sling: 0xd36bff, accent: '#ff8cf0' },
  { name: { tr: 'ALTIN', en: 'GOLD' }, bg: ['#57390a', '#110b01'], neon: '#fff5cf', glow: '#ffc83e', bumper: 0xffc83e, flipper: 0xec3013, target: 0xfff3c4, lamp: 0xffe27a, sling: 0xffc83e, accent: '#ffe27a' },
];

const DEFS: [Goal, number][][] = [
  [['bumpers', 10], ['lanes', 1]],
  [['targets', 1], ['slings', 6]],
  [['saucer', 2], ['lanes', 1]],
  [['bumpers', 25], ['targets', 1]],
  [['lanes', 2], ['saucer', 2]],
  [['targets', 2], ['slings', 10], ['bumpers', 20]],
  [['points', 60000], ['saucer', 3]],
  [['lanes', 3], ['targets', 2]],
  [['bumpers', 40], ['saucer', 3], ['slings', 12]],
  [['lanes', 3], ['targets', 3], ['saucer', 4]],
];

/** Goals of level n (1-based). After the tenth level the last set repeats with bigger counts. */
export function levelGoals(n: number): [Goal, number][] {
  if (n <= DEFS.length) return DEFS[n - 1];
  const k = 1 + (n - DEFS.length) * 0.25;
  return DEFS[DEFS.length - 1].map(([g, c]) => [g, Math.ceil(c * k)] as [Goal, number]);
}

export const themeOf = (n: number): number => (n - 1) % THEMES.length;

/** Level at which each table part joins in. */
export const UNLOCK = { saucer: 2, bumper4: 4, guard: 5 } as const;

/** Every third level cleared gives an extra ball. */
export const extraBallFor = (cleared: number): boolean => cleared % 3 === 0;

export interface Tuning { gravity: number; kick: number; save: number; guard: number }

export function tuning(n: number): Tuning {
  const k = Math.min(n - 1, 12);
  return {
    gravity: 1250 * (1 + k * 0.035),
    kick: Math.min(1200, 880 + (n - 1) * 30),
    save: Math.max(3, 8 - (n - 1) * 0.5),
    guard: n >= UNLOCK.guard ? 0.9 + Math.min(n - UNLOCK.guard, 8) * 0.12 : 0,
  };
}
