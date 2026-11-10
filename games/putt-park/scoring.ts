// Points per hole (higher is better, the platform's leaderboard convention): strokes against par
// as golfers count them, turned into points. A perfect 18 (every hole in one) is the ceiling.
import { isEasy } from '@core';

export const POINTS = {
  holeInOne: 300,
  albatross: 250,
  eagle: 200,
  birdie: 150,
  par: 100,
  bogey: 60,
  double: 30,
  worse: 10,
  pickedUp: 0,
};

/** Normal and Easy side by side (see the new-game skill §7c). */
export const TUNING = {
  normal: { extraStrokes: 4, preview: false, cupScale: 1, magnet: 0 },
  easy: { extraStrokes: 6, preview: true, cupScale: 1.3, magnet: 0.9 },
};

export const tuning = () => (isEasy() ? TUNING.easy : TUNING.normal);

/** The stroke limit of a hole: reaching it without holing out ends the hole. */
export const strokeLimit = (par: number): number => par + tuning().extraStrokes;

export type Call = 'holeInOne' | 'albatross' | 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'worse' | 'pickedUp';

export function callOf(par: number, strokes: number, holed: boolean): Call {
  if (!holed) return 'pickedUp';
  if (strokes === 1) return 'holeInOne';
  const d = strokes - par;
  if (d <= -3) return 'albatross';
  if (d === -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  if (d === 2) return 'double';
  return 'worse';
}

export const pointsOf = (c: Call): number => POINTS[c];

/** Highest possible round score for n holes (the platform's maxScore). */
export const maxScore = (holes: number): number => holes * POINTS.holeInOne;
