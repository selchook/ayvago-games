// Rooftop Courier: what carries over between runs, kept in the core storage: stamps (the
// currency), the satchels and caps bought and worn, the upgrade levels, the three current
// missions, whether the first-run tutorial was done and which power-ups the player has met (each
// gets a one-line hint the first time). Missions are counted within one run; a finished one pays
// its stamps at the end of the run and the next mission of the rotation takes its slot.
import { storage } from '@core';
import { THEMES, type Power } from './defs';
import { NO_UPGRADES, type Stats, type Upgrades } from './sim';

export interface Bag { id: string; color: number; flap: number; price: number }
export interface Cap { id: string; color: number | null; price: number }

export const BAGS: Bag[] = [
  { id: 'red', color: 0xc0392b, flap: 0x8e2a20, price: 0 },
  { id: 'blue', color: 0x2f6fd0, flap: 0x1f4a90, price: 60 },
  { id: 'green', color: 0x2fae5a, flap: 0x1f7a3e, price: 120 },
  { id: 'purple', color: 0x8a4fd0, flap: 0x5c3290, price: 200 },
  { id: 'gold', color: 0xf0b030, flap: 0xc08010, price: 400 },
];
export const CAPS: Cap[] = [
  { id: 'none', color: null, price: 0 },
  { id: 'red', color: 0xd03a2e, price: 80 },
  { id: 'blue', color: 0x2f6fd0, price: 120 },
  { id: 'yellow', color: 0xffc930, price: 180 },
  { id: 'black', color: 0x262630, price: 260 },
];
export { UPGRADES, UPGRADE_IDS, type UpgradeId } from './upgrades';
import { UPGRADES, UPGRADE_IDS } from './upgrades';

export type MissionKind = 'zips' | 'deliveries' | 'vaults' | 'slides' | 'rolls' | 'bounces' | 'climbs' | 'stamps' | 'flocks' | 'distance' | 'perfect' | 'rushes' | 'district' | 'gaps' | 'powers';
export interface Mission { kind: MissionKind; n: number; reward: number }

/** The rotation: missions come in this order (each a little bigger the next time round). */
const POOL: Mission[] = [
  { kind: 'deliveries', n: 3, reward: 20 }, { kind: 'zips', n: 2, reward: 20 }, { kind: 'vaults', n: 4, reward: 20 },
  { kind: 'stamps', n: 40, reward: 25 }, { kind: 'slides', n: 4, reward: 20 }, { kind: 'flocks', n: 3, reward: 20 },
  { kind: 'rolls', n: 3, reward: 25 }, { kind: 'distance', n: 800, reward: 25 }, { kind: 'gaps', n: 10, reward: 25 },
  { kind: 'bounces', n: 2, reward: 30 }, { kind: 'climbs', n: 3, reward: 25 }, { kind: 'perfect', n: 2, reward: 30 },
  { kind: 'deliveries', n: 5, reward: 35 }, { kind: 'zips', n: 3, reward: 30 }, { kind: 'district', n: 2, reward: 40 },
  { kind: 'rushes', n: 1, reward: 30 }, { kind: 'vaults', n: 10, reward: 40 }, { kind: 'stamps', n: 100, reward: 45 },
  { kind: 'distance', n: 1500, reward: 45 }, { kind: 'district', n: 3, reward: 60 },
  // 1.1: power-ups
  { kind: 'powers', n: 2, reward: 25 }, { kind: 'deliveries', n: 8, reward: 50 }, { kind: 'powers', n: 5, reward: 45 },
];

export interface Meta {
  stamps: number;
  bags: string[];
  caps: string[];
  bag: string;
  cap: string;
  upgrades: Upgrades;
  /** Index into the rotation of each of the three mission slots, and the next index to hand out. */
  missions: number[];
  nextMission: number;
  tutorial: boolean;
  runs: number;
  /** Power-ups the player has been shown a hint for. */
  seen: Power[];
}

const KEY = 'rooftop-courier:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const meta: Meta = {
    stamps: Math.max(0, m.stamps ?? 0),
    bags: Array.isArray(m.bags) ? m.bags.filter((b) => BAGS.some((q) => q.id === b)) : ['red'],
    caps: Array.isArray(m.caps) ? m.caps.filter((c) => CAPS.some((q) => q.id === c)) : ['none'],
    bag: m.bag ?? 'red',
    cap: m.cap ?? 'none',
    upgrades: Object.fromEntries(UPGRADE_IDS.map((id) => [id, Math.max(0, Math.min(UPGRADES[id].length, Math.floor(Number(m.upgrades?.[id] ?? NO_UPGRADES[id]) || 0)))])) as unknown as Upgrades,
    missions: Array.isArray(m.missions) && m.missions.length === 3 ? m.missions : [0, 1, 2],
    nextMission: m.nextMission ?? 3,
    tutorial: !!m.tutorial,
    runs: m.runs ?? 0,
    seen: Array.isArray(m.seen) ? m.seen : [],
  };
  if (!meta.bags.includes('red')) meta.bags.unshift('red');
  if (!meta.caps.includes('none')) meta.caps.unshift('none');
  if (!meta.bags.includes(meta.bag)) meta.bag = 'red';
  if (!meta.caps.includes(meta.cap)) meta.cap = 'none';
  return meta;
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** The mission at a rotation index (later rounds of the rotation ask a little more). */
export function missionAt(i: number): Mission {
  const base = POOL[i % POOL.length];
  const round = Math.floor(i / POOL.length);
  if (round === 0 || base.kind === 'district') return base;
  return { ...base, n: Math.round(base.n * (1 + round * 0.5)), reward: Math.round(base.reward * (1 + round * 0.3)) };
}

/** How far a run got on a mission. */
export function missionProgress(ms: Mission, st: Stats, district: number): number {
  switch (ms.kind) {
    case 'district': return district + 1;
    case 'distance': return Math.floor(st.distance);
    default: return st[ms.kind];
  }
}

export const districtName = (n: number): string => THEMES[(n - 1) % THEMES.length];

export function bagOf(m: Meta): Bag { return BAGS.find((b) => b.id === m.bag) ?? BAGS[0]; }
export function capOf(m: Meta): Cap { return CAPS.find((c) => c.id === m.cap) ?? CAPS[0]; }
export function lookOf(m: Meta): { bag: number; flap: number; cap: number | null } {
  const b = bagOf(m), c = capOf(m);
  return { bag: b.color, flap: b.flap, cap: c.color };
}

/** Banks a finished run: stamps, finished missions (paid and replaced). Returns the missions done. */
export function bankRun(m: Meta, stamps: number, st: Stats, district: number): Mission[] {
  const done: Mission[] = [];
  m.missions = m.missions.map((idx) => {
    const ms = missionAt(idx);
    if (missionProgress(ms, st, district) >= ms.n) {
      done.push(ms);
      m.stamps += ms.reward;
      return m.nextMission++;
    }
    return idx;
  });
  m.stamps += stamps;
  m.runs++;
  saveMeta(m);
  return done;
}
