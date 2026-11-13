// Normal and Easy side by side. Solo play is a ladder of rival crews: crew n plays AI level
// LEVELS[min(floor(n * ramp), top)]. Easy climbs at half the pace, stops at the third level and
// plays every level softer (easier(): slower, later, wilder shots, fewer steals and blocks).
import { LEVELS, easier, type AiLevel } from './ai';

export interface Tuning { ramp: number; top: number; soft: boolean }

export const TUNING: Record<'easy' | 'normal', Tuning> = {
  normal: { ramp: 1, top: LEVELS.length - 1, soft: false },
  easy: { ramp: 0.5, top: 2, soft: true },
};

/** The AI the n-th rival crew (0 = the first) plays with. */
export function rivalLevel(t: Tuning, n: number): AiLevel {
  const l = LEVELS[Math.min(Math.floor(n * t.ramp), t.top)];
  return t.soft ? easier(l) : l;
}
