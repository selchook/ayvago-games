// Events, marks, points and the rivals' form. Lower is better for races, higher for the jump
// and archery. Points work like a combined-events table: a fixed curve per event, plus a medal
// bonus and a bonus for beating the cup record.
import { t } from '@core';
import { metres, secs } from './strings';

export const EVENTS = ['sprint', 'hurdles', 'longjump', 'swim', 'archery'] as const;
export type EventId = (typeof EVENTS)[number];

export const lowerIsBetter = (e: EventId): boolean => e === 'sprint' || e === 'hurdles' || e === 'swim';

/** Cup records: beating one is worth RECORD_BONUS. */
export const RECORDS: Record<EventId, number> = { sprint: 9.85, hurdles: 12.9, longjump: 8.6, swim: 22.7, archery: 58 };
export const RECORD_BONUS = 150;
export const MEDAL_BONUS = [200, 120, 60, 0];

/** A missing mark (disqualified, three fouls). */
export const NO_MARK = NaN;

export function basePoints(e: EventId, v: number): number {
  if (Number.isNaN(v)) return 0;
  const p = e === 'sprint' ? (14.5 - v) * 225
    : e === 'hurdles' ? (19 - v) * 170
      : e === 'longjump' ? v * 125
        : e === 'swim' ? (36 - v) * 78
          : v * 17;
  return Math.max(0, Math.round(p));
}

export function beatsRecord(e: EventId, v: number): boolean {
  if (Number.isNaN(v)) return false;
  return lowerIsBetter(e) ? v < RECORDS[e] : v > RECORDS[e];
}

/** Places (0 = first) for the marks; the player (index 0) wins a tie. */
export function ranking(e: EventId, marks: number[]): number[] {
  const order = marks.map((_, i) => i).sort((a, b) => {
    const va = marks[a], vb = marks[b];
    const na = Number.isNaN(va), nb = Number.isNaN(vb);
    if (na !== nb) return na ? 1 : -1;
    if (na && nb) return a - b;
    if (va === vb) return a - b;
    return lowerIsBetter(e) ? va - vb : vb - va;
  });
  const place: number[] = [];
  order.forEach((idx, p) => (place[idx] = p));
  return place;
}

export function markText(e: EventId, v: number): string {
  if (Number.isNaN(v)) return e === 'longjump' ? t('foul').replace('!', '') : t('dq');
  if (e === 'longjump') return metres(v);
  if (e === 'archery') return t('pts', { n: v });
  return secs(v);
}

/**
 * The rivals' form: a mark between their best (strong = 0) and worst (1) day, per difficulty.
 * Normal is tuned so a good run wins gold and an average one a lower medal.
 */
export const RIVAL_FORM: Record<EventId, { normal: [number, number]; easy: [number, number]; noise: number }> = {
  sprint: { normal: [10.1, 11.1], easy: [10.95, 12.2], noise: 0.08 },
  hurdles: { normal: [13.0, 14.6], easy: [14.6, 16.4], noise: 0.12 },
  longjump: { normal: [8.15, 7.15], easy: [7.25, 6.2], noise: 0.12 },
  swim: { normal: [23.0, 25.3], easy: [25.2, 28.2], noise: 0.25 },
  archery: { normal: [55, 46], easy: [49, 39], noise: 1.6 },
};

export function rivalMark(e: EventId, weakness: number, easy: boolean): number {
  const f = RIVAL_FORM[e];
  const [best, worst] = easy ? f.easy : f.normal;
  let v = best + (worst - best) * Math.max(0, Math.min(1, weakness)) + (Math.random() * 2 - 1) * f.noise;
  if (e === 'archery') v = Math.max(20, Math.min(60, Math.round(v)));
  else v = Math.round(v * 100) / 100;
  return v;
}
