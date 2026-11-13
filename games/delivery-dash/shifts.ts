// Delivery Dash: the campaign (18 shifts over three districts) and the Endless Rush. Each shift
// brings one new thing (fragile cargo, several orders at once, rush-hour traffic, VIP express
// orders, bridges, one-way streets, roadworks, rain at night, slopes, the ring road) and has an
// earnings target for one, two and three stars (tuned with balance.ts).
import type { Cargo } from './defs';

export interface ShiftDef {
  id: number;
  district: number;
  /** Seconds on the clock. */
  time: number;
  /** Traffic cars and pedestrians (before the Easy factor). */
  cars: number;
  peds: number;
  /** Orders on offer at once. */
  offers: number;
  kinds: Cargo[];
  /** Chance that a new order is a VIP express order. */
  vip: number;
  works: boolean;
  oneway: boolean;
  night: boolean;
  /** The new thing this shift brings (a string key, shown at the start and on the map). */
  intro: string;
  /** Earnings for one, two and three stars. */
  targets: [number, number, number];
  tutorial?: boolean;
  /** Traffic runs slower and bunches up (rush hour). */
  rushHour?: boolean;
}

export const DISTRICTS = [
  { id: 0, need: 0 },
  { id: 1, need: 10 },
  { id: 2, need: 24 },
];

const BASIC: Cargo[] = ['pizza', 'burger', 'parcel'];
const ALL: Cargo[] = ['pizza', 'flowers', 'cake', 'parcel', 'burger', 'icecream'];

export const SHIFTS: ShiftDef[] = [
  // Old Town
  { id: 1, district: 0, time: 150, cars: 3, peds: 6, offers: 1, kinds: BASIC, vip: 0, works: false, oneway: false, night: false, intro: 'in_first', targets: [55, 90, 150], tutorial: true },
  { id: 2, district: 0, time: 150, cars: 5, peds: 9, offers: 2, kinds: [...BASIC, 'icecream'], vip: 0, works: false, oneway: false, night: false, intro: 'in_walkers', targets: [45, 65, 130] },
  { id: 3, district: 0, time: 160, cars: 5, peds: 9, offers: 2, kinds: ['cake', 'flowers', 'pizza', 'parcel'], vip: 0, works: false, oneway: false, night: false, intro: 'in_fragile', targets: [60, 95, 145] },
  { id: 4, district: 0, time: 170, cars: 6, peds: 9, offers: 3, kinds: ALL, vip: 0, works: false, oneway: false, night: false, intro: 'in_multi', targets: [60, 85, 140] },
  { id: 5, district: 0, time: 170, cars: 13, peds: 10, offers: 3, kinds: ALL, vip: 0, works: false, oneway: false, night: false, intro: 'in_rushhour', targets: [50, 70, 120], rushHour: true },
  { id: 6, district: 0, time: 180, cars: 8, peds: 10, offers: 3, kinds: ALL, vip: 0.3, works: true, oneway: false, night: false, intro: 'in_vip', targets: [55, 80, 135] },
  // Riverside
  { id: 7, district: 1, time: 170, cars: 7, peds: 9, offers: 3, kinds: ['cake', 'flowers', 'pizza', 'parcel', 'burger'], vip: 0, works: false, oneway: false, night: false, intro: 'in_bridges', targets: [55, 90, 125] },
  { id: 8, district: 1, time: 170, cars: 8, peds: 9, offers: 3, kinds: ALL, vip: 0, works: false, oneway: true, night: false, intro: 'in_oneway', targets: [30, 50, 100] },
  { id: 9, district: 1, time: 180, cars: 8, peds: 9, offers: 3, kinds: ALL, vip: 0.1, works: true, oneway: true, night: false, intro: 'in_works', targets: [35, 55, 110] },
  { id: 10, district: 1, time: 180, cars: 7, peds: 7, offers: 3, kinds: ALL, vip: 0.1, works: false, oneway: true, night: true, intro: 'in_night', targets: [45, 70, 120] },
  { id: 11, district: 1, time: 180, cars: 14, peds: 10, offers: 3, kinds: ALL, vip: 0.15, works: false, oneway: true, night: false, intro: 'in_busy', targets: [25, 40, 90], rushHour: true },
  { id: 12, district: 1, time: 190, cars: 10, peds: 10, offers: 3, kinds: ALL, vip: 0.3, works: true, oneway: true, night: true, intro: 'in_river_vip', targets: [30, 45, 105] },
  // Hilltop
  { id: 13, district: 2, time: 180, cars: 7, peds: 8, offers: 3, kinds: ALL, vip: 0.05, works: false, oneway: false, night: false, intro: 'in_slopes', targets: [80, 110, 140] },
  { id: 14, district: 2, time: 180, cars: 13, peds: 8, offers: 3, kinds: ALL, vip: 0.1, works: false, oneway: false, night: false, intro: 'in_ring', targets: [70, 100, 135] },
  { id: 15, district: 2, time: 190, cars: 10, peds: 9, offers: 3, kinds: ALL, vip: 0.15, works: true, oneway: false, night: false, intro: 'in_hillworks', targets: [65, 90, 160] },
  { id: 16, district: 2, time: 190, cars: 9, peds: 7, offers: 3, kinds: ALL, vip: 0.15, works: false, oneway: false, night: true, intro: 'in_hillnight', targets: [95, 135, 170] },
  { id: 17, district: 2, time: 190, cars: 15, peds: 10, offers: 3, kinds: ALL, vip: 0.35, works: false, oneway: false, night: false, intro: 'in_hillvip', targets: [110, 150, 185], rushHour: true },
  { id: 18, district: 2, time: 200, cars: 14, peds: 10, offers: 3, kinds: ALL, vip: 0.35, works: true, oneway: false, night: true, intro: 'in_finale', targets: [100, 140, 170], rushHour: true },
];

export const shift = (id: number): ShiftDef => SHIFTS.find((s) => s.id === id) ?? SHIFTS[0];

/**
 * Endless Rush, in Old Town: the clock starts at RUSH.start seconds and every delivery adds time;
 * traffic grows with every delivery, evening falls and after a while it rains.
 */
export const RUSH = {
  district: 0,
  start: 90,
  offers: 3,
  kinds: ALL,
  vip: 0.15,
  carsStart: 4,
  carsMax: 16,
  peds: 10,
  /** Seconds into the run when dusk, night and rain arrive. */
  dusk: 90,
  night: 150,
  rain: 200,
};

/** The definition the simulation runs for the Rush (its numbers change during the run). */
export function rushShift(): ShiftDef {
  return {
    id: 0, district: RUSH.district, time: RUSH.start, cars: RUSH.carsStart, peds: RUSH.peds, offers: RUSH.offers, kinds: RUSH.kinds,
    vip: RUSH.vip, works: false, oneway: false, night: false, intro: 'rush', targets: [0, 0, 0],
  };
}
