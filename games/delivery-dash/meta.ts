// Delivery Dash: what carries over between visits (core storage): the wallet, upgrades, owned
// vehicles and paints, stars per shift (the best of Easy and Normal), the mode and shift picked
// on the map, the tutorial and the best Rush.
import { storage } from '@core';
import { SHIFTS, DISTRICTS, shift } from './shifts';
import { UPGRADES, VEHICLES, PAINTS, type Upgrades, type VehicleId } from './defs';

export interface Meta {
  mode: 'shift' | 'rush';
  shift: number;
  stars: Record<number, number>;
  cash: number;
  /** Lifetime earnings (shown on the map). */
  earned: number;
  up: Upgrades;
  vehicles: VehicleId[];
  vehicle: VehicleId;
  paints: number[];
  paint: number;
  tutorial: boolean;
  rushRuns: number;
}

const KEY = 'delivery-dash:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const up = { engine: 0, handling: 0, capacity: 0, padding: 0, ...(m.up ?? {}) };
  for (const u of UPGRADES) up[u.id] = Math.max(0, Math.min(u.max, Math.floor(up[u.id] ?? 0)));
  const vehicles = (m.vehicles ?? ['van']).filter((v) => VEHICLES.some((q) => q.id === v));
  if (!vehicles.includes('van')) vehicles.unshift('van');
  const paints = (m.paints ?? [0]).filter((p) => p >= 0 && p < PAINTS.length);
  if (!paints.includes(0)) paints.unshift(0);
  const meta: Meta = {
    mode: m.mode === 'rush' ? 'rush' : 'shift',
    shift: SHIFTS.some((s) => s.id === m.shift) ? m.shift! : 1,
    stars: { ...(m.stars ?? {}) },
    cash: Math.max(0, Math.floor(m.cash ?? 0)),
    earned: Math.max(0, Math.floor(m.earned ?? 0)),
    up,
    vehicles,
    vehicle: vehicles.includes(m.vehicle as VehicleId) ? m.vehicle! : 'van',
    paints,
    paint: paints.includes(m.paint ?? 0) ? m.paint ?? 0 : 0,
    tutorial: !!m.tutorial,
    rushRuns: m.rushRuns ?? 0,
  };
  if (!shiftOpen(meta, meta.shift)) meta.shift = 1;
  return meta;
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }

export const totalStars = (m: Meta): number => Object.values(m.stars).reduce((s, v) => s + v, 0);

export function districtOpen(m: Meta, d: number): boolean { return totalStars(m) >= DISTRICTS[d].need; }

/** A shift is open when its district is and the shift before it (in the district) has a star. */
export function shiftOpen(m: Meta, id: number): boolean {
  const s = shift(id);
  if (!districtOpen(m, s.district)) return false;
  const list = SHIFTS.filter((q) => q.district === s.district);
  const i = list.findIndex((q) => q.id === id);
  return i <= 0 || (m.stars[list[i - 1].id] ?? 0) > 0;
}

/** Records a finished shift; returns the districts it opened. */
export function recordShift(m: Meta, id: number, stars: number): number[] {
  const before = DISTRICTS.filter((d) => districtOpen(m, d.id)).map((d) => d.id);
  m.stars[id] = Math.max(m.stars[id] ?? 0, stars);
  const after = DISTRICTS.filter((d) => districtOpen(m, d.id)).map((d) => d.id);
  saveMeta(m);
  return after.filter((d) => !before.includes(d));
}

/** The next open shift after this one (or null). */
export function nextShift(m: Meta, id: number): number | null {
  for (const s of SHIFTS) if (s.id > id && shiftOpen(m, s.id)) return s.id;
  return null;
}

/** Adds a run's earnings to the wallet. */
export function bank(m: Meta, amount: number): void {
  m.cash += amount;
  m.earned += amount;
  saveMeta(m);
}
