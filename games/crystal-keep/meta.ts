// Crystal Keep: what carries over from run to run. Clearing a map earns Crystal Shards (by stars
// and difficulty); the talent board spends them on lasting bonuses and new powers. Kept in the
// core storage next to the map stars. A reset refunds every shard.
import { storage } from '@core';
import { NO_TALENTS, POWER_IDS, type TalentFx, type PowerId } from './sim';

export type TalentId =
  | 'gold1' | 'gold2' | 'lives' | 'hunter'
  | 'frost' | 'lightning' | 'slot3' | 'knights'
  | 'focus' | 'reroll' | 'luck' | 'wide';

export interface TalentDef {
  id: TalentId;
  cost: number;
  /** The node above it in its column, owned first. */
  req?: TalentId;
  /** Column (0 keep, 1 powers, 2 mastery) and row on the board. */
  col: number;
  row: number;
  /** A power this unlocks. */
  power?: PowerId;
}

/** Three columns of four: each node needs the one above it. */
export const TALENTS: TalentDef[] = [
  { id: 'gold1', cost: 3, col: 0, row: 0 },
  { id: 'gold2', cost: 5, req: 'gold1', col: 0, row: 1 },
  { id: 'lives', cost: 6, req: 'gold2', col: 0, row: 2 },
  { id: 'hunter', cost: 8, req: 'lives', col: 0, row: 3 },
  { id: 'frost', cost: 4, col: 1, row: 0, power: 'frost' },
  { id: 'lightning', cost: 6, req: 'frost', col: 1, row: 1, power: 'lightning' },
  { id: 'slot3', cost: 7, req: 'lightning', col: 1, row: 2 },
  { id: 'knights', cost: 9, req: 'slot3', col: 1, row: 3, power: 'knights' },
  { id: 'focus', cost: 4, col: 2, row: 0 },
  { id: 'reroll', cost: 5, req: 'focus', col: 2, row: 1 },
  { id: 'luck', cost: 7, req: 'reroll', col: 2, row: 2 },
  { id: 'wide', cost: 9, req: 'luck', col: 2, row: 3 },
];
export const TALENT: Record<TalentId, TalentDef> = Object.fromEntries(TALENTS.map((t) => [t.id, t])) as Record<TalentId, TalentDef>;
export const TALENT_TOTAL = TALENTS.reduce((s, t) => s + t.cost, 0);

export interface Meta {
  shards: number;
  talents: TalentId[];
  /** Equipped powers for the next map. */
  loadout: PowerId[];
  /** The talent board was opened once (the "new" badge goes away). */
  seenBoard: boolean;
  /** Shards earned in all (for the stats line). */
  earned: number;
}

const KEY = 'crystal-keep:meta';

export function loadMeta(): Meta {
  const m = storage.get<Partial<Meta>>(KEY, {});
  const talents = (m.talents ?? []).filter((t): t is TalentId => t in TALENT);
  const meta: Meta = {
    shards: Math.max(0, m.shards ?? 0), talents, loadout: [], seenBoard: !!m.seenBoard, earned: m.earned ?? 0,
  };
  meta.loadout = (m.loadout ?? ['meteor']).filter((p): p is PowerId => POWER_IDS.includes(p as PowerId) && powerUnlocked(meta, p as PowerId)).slice(0, slots(meta));
  if (!meta.loadout.length) meta.loadout = ['meteor'];
  return meta;
}

export function saveMeta(m: Meta): void {
  storage.set(KEY, m);
}

export const owns = (m: Meta, id: TalentId): boolean => m.talents.includes(id);

/** Powers a run may equip at once. */
export const slots = (m: Meta): number => (owns(m, 'slot3') ? 3 : 2);

export function powerUnlocked(m: Meta, p: PowerId): boolean {
  return p === 'meteor' || owns(m, p as TalentId);
}

export type BuyState = 'owned' | 'ok' | 'poor' | 'locked';

export function buyState(m: Meta, id: TalentId): BuyState {
  const t = TALENT[id];
  if (owns(m, id)) return 'owned';
  if (t.req && !owns(m, t.req)) return 'locked';
  return m.shards >= t.cost ? 'ok' : 'poor';
}

/** Buys a talent; a new power goes into the loadout when a slot is free. */
export function buy(m: Meta, id: TalentId): boolean {
  if (buyState(m, id) !== 'ok') return false;
  m.shards -= TALENT[id].cost;
  m.talents.push(id);
  const p = TALENT[id].power;
  if (p && m.loadout.length < slots(m) && !m.loadout.includes(p)) m.loadout.push(p);
  saveMeta(m);
  return true;
}

/** Gives every spent shard back. */
export function resetTalents(m: Meta): number {
  const back = m.talents.reduce((s, id) => s + TALENT[id].cost, 0);
  m.shards += back;
  m.talents = [];
  m.loadout = ['meteor'];
  saveMeta(m);
  return back;
}

/** Equips or takes off a power; false when it is locked or every slot is full. */
export function toggleLoadout(m: Meta, p: PowerId): boolean {
  if (!powerUnlocked(m, p)) return false;
  const i = m.loadout.indexOf(p);
  if (i >= 0) {
    if (m.loadout.length <= 1) return false;
    m.loadout.splice(i, 1);
  } else {
    if (m.loadout.length >= slots(m)) return false;
    m.loadout.push(p);
    m.loadout.sort((a, b) => POWER_IDS.indexOf(a) - POWER_IDS.indexOf(b));
  }
  saveMeta(m);
  return true;
}

/** What the owned talents do in a run. */
export function talentFx(owned: readonly TalentId[]): TalentFx {
  const has = (id: TalentId) => owned.includes(id);
  return {
    ...NO_TALENTS,
    gold: (has('gold1') ? TALENT_GOLD : 0) + (has('gold2') ? TALENT_GOLD : 0),
    lives: has('lives') ? 2 : 0,
    cdK: has('focus') ? 0.92 : 1,
    draftN: has('wide') ? 4 : 3,
    rerolls: has('reroll') ? 2 : 1,
    luck: has('luck'),
  };
}

/** Starting gold of each Treasury talent. */
export const TALENT_GOLD = 10;

/** Every talent (the balance check's "full board"). */
export const ALL_TALENTS: TalentId[] = TALENTS.map((t) => t.id);

/**
 * Crystal Shards for a cleared map: a base that grows with the map, two per star, half on Easy,
 * plus one for every star better than the map's old record; Shard Hunter adds a quarter.
 */
export function shardsFor(mapIx: number, stars: number, easy: boolean, newStars: number, hunter = false): number {
  const base = Math.ceil((2 + mapIx + stars * 2) * (easy ? 0.5 : 1)) + Math.max(0, newStars);
  return hunter ? Math.ceil(base * 1.25) : base;
}
