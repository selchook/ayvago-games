// Zombie Grove: the level-up draft. Every level earns an offer of three cards, rolled at that
// moment and banked: the player opens it whenever they like while the fight runs on in slow motion.
// A card is a new weapon, a weapon upgrade, a trinket (passive), an evolution (a level-5 weapon
// with its paired trinket in the bag) or, when nothing is left, a meal or a gold pouch.
// Rarity is rolled per card: a rare card gives two levels, an epic one three; luck shifts the odds.
import {
  EVOLVES_WITH, MAX_LEVEL, MAX_PASSIVES, MAX_WEAPONS, PASSIVE_IDS, WEAPON_IDS, type PassiveId, type WeaponId,
} from './defs';

export type Rarity = 'common' | 'rare' | 'epic' | 'legend';
export type CardKind = 'weapon' | 'passive' | 'evo' | 'heal' | 'gold';

export interface Card {
  kind: CardKind;
  /** WeaponId, PassiveId, or 'heal' / 'gold'. */
  id: string;
  rarity: Rarity;
  /** Levels it adds (weapon or trinket), and the level it leads to. */
  add: number;
  to: number;
}

export interface OwnedWeapon { id: WeaponId; lv: number; evo: boolean }
export interface OwnedPassive { id: PassiveId; lv: number }

export interface Bag {
  weapons: OwnedWeapon[];
  passives: OwnedPassive[];
  /** Weapons that may appear in the drafts (camp unlocks). */
  allowed: WeaponId[];
}

export const RARITY_COLOR: Record<Rarity, { frame: number; glow: number; text: string; dark: number }> = {
  common: { frame: 0xc9d4c0, glow: 0x9fb09a, text: '#e2ead8', dark: 0x1f2a22 },
  rare: { frame: 0x4fc0ff, glow: 0x2f8cff, text: '#9fdcff', dark: 0x12324f },
  epic: { frame: 0xd27bff, glow: 0xb04cff, text: '#e8b8ff', dark: 0x37145c },
  legend: { frame: 0xffc83f, glow: 0xff9a20, text: '#ffe28a', dark: 0x4a2c08 },
};

/** Evolutions that can be taken now. */
export function evolutions(bag: Bag): WeaponId[] {
  return bag.weapons.filter((w) => !w.evo && w.lv >= MAX_LEVEL && bag.passives.some((p) => p.id === EVOLVES_WITH[w.id])).map((w) => w.id);
}

function rollRarity(luck: number, rnd: () => number, boost: boolean): Rarity {
  const r = rnd();
  const epic = 0.035 + luck * 0.05 + (boost ? 0.12 : 0);
  const rare = epic + 0.2 + luck * 0.1 + (boost ? 0.2 : 0);
  return r < epic ? 'epic' : r < rare ? 'rare' : 'common';
}

const STEP: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legend: 1 };
const fromStep = (n: number): Rarity => (n >= 3 ? 'epic' : n === 2 ? 'rare' : 'common');

/**
 * `n` different cards for an offer. `boost` (a mini-boss chest) raises the rarity odds and always
 * offers an evolution that is ready.
 */
export function rollOffer(bag: Bag, n: number, luck: number, rnd: () => number, boost = false, exclude: string[] = []): Card[] {
  type C = { kind: CardKind; id: string; w: number; lv: number };
  const pool: C[] = [];
  for (const id of evolutions(bag)) pool.push({ kind: 'evo', id, w: boost ? 1000 : 45, lv: 0 });
  const nw = bag.weapons.length;
  for (const w of bag.weapons) if (!w.evo && w.lv < MAX_LEVEL) pool.push({ kind: 'weapon', id: w.id, w: 10, lv: w.lv });
  if (nw < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) {
      if (!bag.allowed.includes(id) || bag.weapons.some((w) => w.id === id)) continue;
      pool.push({ kind: 'weapon', id, w: nw < 3 ? 11 : 6, lv: 0 });
    }
  }
  for (const p of bag.passives) if (p.lv < MAX_LEVEL) pool.push({ kind: 'passive', id: p.id, w: 7, lv: p.lv });
  if (bag.passives.length < MAX_PASSIVES) {
    for (const id of PASSIVE_IDS) {
      if (bag.passives.some((p) => p.id === id)) continue;
      // trinkets that evolve an owned weapon come up a little more often
      const pairs = bag.weapons.some((w) => EVOLVES_WITH[w.id] === id);
      pool.push({ kind: 'passive', id, w: pairs ? 7 : 4.5, lv: 0 });
    }
  }
  const out: Card[] = [];
  const left = pool.filter((c) => !exclude.includes(c.kind + ':' + c.id));
  while (out.length < n && left.length) {
    const total = left.reduce((s, c) => s + c.w, 0);
    let x = rnd() * total;
    let k = 0;
    for (; k < left.length - 1; k++) { x -= left[k].w; if (x <= 0) break; }
    const c = left.splice(k, 1)[0];
    if (c.kind === 'evo') { out.push({ kind: 'evo', id: c.id, rarity: 'legend', add: 1, to: MAX_LEVEL }); continue; }
    const room = MAX_LEVEL - c.lv;
    const add = Math.min(room, STEP[rollRarity(luck, rnd, boost)]);
    out.push({ kind: c.kind, id: c.id, rarity: fromStep(add), add, to: c.lv + add });
  }
  // fillers when the bag is full
  const fill: Card[] = [
    { kind: 'heal', id: 'heal', rarity: 'common', add: 0, to: 0 },
    { kind: 'gold', id: 'gold', rarity: 'common', add: 0, to: 0 },
  ];
  for (const f of fill) if (out.length < n && !exclude.includes(f.kind + ':' + f.id)) out.push(f);
  return out;
}

/** A card's key ('weapon:bow'), so offers never repeat a card. */
export const cardKey = (c: Card): string => c.kind + ':' + c.id;
