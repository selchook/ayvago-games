// Astro Crew: the two kinds of progression (§7g), pure data shared by the simulation, the bot and
// the screens.
//   - Base modules: seven tracks with three ranks each, bought with crystals between missions and
//     kept between runs. Rank I is mostly more of something; ranks II and III change behaviour
//     (regeneration, a revive, a drone, a frost drone, a second drone, power shots, a shockwave and
//     a decoy after a dodge, a second skill charge ...), and every rank grows the 3D base.
//   - Power cards: every level-up in a run offers 1 of 3 (common, rare, epic, legendary; one reroll
//     per draft). Cards last the whole run; commons stack three times, rares twice.

export type UpgradeId = 'hull' | 'solar' | 'radar' | 'drone' | 'armory' | 'thrusters' | 'lab';
export const UPGRADE_IDS: UpgradeId[] = ['hull', 'armory', 'lab', 'thrusters', 'solar', 'radar', 'drone'];
export const MAX_RANK = 3;

/** Price of each rank (I, II, III) and the icon of each track. */
export const UPGRADE: Record<UpgradeId, { price: [number, number, number]; icon: string }> = {
  hull: { price: [60, 150, 300], icon: 'dome' },
  armory: { price: [70, 170, 330], icon: 'building-l' },
  lab: { price: [70, 170, 320], icon: 'house-long' },
  thrusters: { price: [60, 150, 290], icon: 'ship-bee' },
  solar: { price: [60, 140, 280], icon: 'solar-ground' },
  radar: { price: [50, 130, 260], icon: 'roof-radar' },
  drone: { price: [80, 180, 340], icon: 'roof-antenna' },
};

export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => Object.fromEntries(UPGRADE_IDS.map((u) => [u, 0])) as Ranks;

// ------------------------------------------------------------------ power cards

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type CardId =
  | 'rapid' | 'power' | 'range' | 'armor' | 'boots' | 'magnet' | 'medic' | 'roll'
  | 'twin' | 'pierce' | 'crit' | 'bubble' | 'buddy' | 'frost' | 'battery' | 'bounce'
  | 'flame' | 'chain' | 'blades' | 'vampire' | 'overclock' | 'blast'
  | 'nova' | 'titan' | 'storm' | 'angel';

export interface CardDef { id: CardId; rarity: Rarity; icon: string; max: number; value: number }
const K = (id: CardId, rarity: Rarity, icon: string, value: number): CardDef => ({ id, rarity, icon, value, max: rarity === 'common' ? 3 : rarity === 'rare' ? 2 : 1 });

export const CARDS: CardDef[] = [
  K('rapid', 'common', 'p-rapid', 5),
  K('power', 'common', 'p-power', 5),
  K('range', 'common', 'p-range', 3),
  K('armor', 'common', 'p-armor', 4),
  K('boots', 'common', 'p-boots', 3),
  K('magnet', 'common', 'p-magnet', 3),
  K('medic', 'common', 'health', 3),
  K('roll', 'common', 'p-roll', 3),
  K('twin', 'rare', 'p-twin', 8),
  K('pierce', 'rare', 'p-pierce', 6),
  K('crit', 'rare', 'p-crit', 7),
  K('bubble', 'rare', 'p-bubble', 6),
  K('buddy', 'rare', 'p-drone', 6),
  K('frost', 'rare', 'p-frost', 5),
  K('battery', 'rare', 'thunder', 5),
  K('bounce', 'rare', 'p-bounce', 6),
  K('flame', 'epic', 'p-flame', 8),
  K('chain', 'epic', 'p-chain', 8),
  K('blades', 'epic', 'p-blades', 8),
  K('vampire', 'epic', 'p-heart', 7),
  K('overclock', 'epic', 'p-clockfast', 7),
  K('blast', 'epic', 'p-blast', 8),
  K('nova', 'legendary', 'p-nova', 10),
  K('titan', 'legendary', 'mech-frog', 9),
  K('storm', 'legendary', 'p-storm', 10),
  K('angel', 'legendary', 'p-angel', 9),
];
export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

/** Draft odds per rarity (weights). */
const WEIGHTS: Record<Rarity, number> = { common: 52, rare: 30, epic: 13, legendary: 5 };

export const stacks = (held: CardId[], id: CardId): number => held.reduce((n, c) => n + (c === id ? 1 : 0), 0);

/** Three different cards the run can still take. */
export function rollCards(held: CardId[], rnd: () => number, n = 3): CardId[] {
  const pool = CARDS.filter((c) => stacks(held, c.id) < c.max);
  const out: CardId[] = [];
  while (out.length < n && pool.length) {
    const rars = RARITIES.filter((r) => pool.some((c) => c.rarity === r));
    const total = rars.reduce((s, r) => s + WEIGHTS[r], 0);
    let x = rnd() * total, rar = rars[0];
    for (const r of rars) { x -= WEIGHTS[r]; if (x <= 0) { rar = r; break; } }
    const of = pool.filter((c) => c.rarity === rar);
    const c = of[Math.floor(rnd() * of.length)];
    out.push(c.id);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}

/** A rarity's colours on the card: the frame, its ink and the glow. */
export const RARITY_COLOR: Record<Rarity, { frame: number; ink: string; glow: number }> = {
  common: { frame: 0x8fa6c8, ink: '#c8d8f0', glow: 0x5a7aa8 },
  rare: { frame: 0x38c8ff, ink: '#7ae0ff', glow: 0x1a78c8 },
  epic: { frame: 0xc06aff, ink: '#dca8ff', glow: 0x8a2ad0 },
  legendary: { frame: 0xffc83a, ink: '#ffe08a', glow: 0xd88a10 },
};

// ------------------------------------------------------------------ what they do (read by the sim)

/** Everything upgrades and cards change, folded into one set of numbers and switches. */
export interface Mods {
  dmg: number;
  rate: number;
  range: number;
  hp: number;
  speed: number;
  magnet: number;
  heal: number;
  dodgeCd: number;
  shots: number;
  pierce: number;
  crit: number;
  bubble: number;
  drones: number;
  droneFrost: boolean;
  frost: boolean;
  mechCharge: number;
  mechTime: number;
  mechStart: number;
  bounce: number;
  burn: boolean;
  chain: boolean;
  blades: number;
  vampire: boolean;
  skillCd: number;
  skillPower: number;
  skillCharges: number;
  blast: boolean;
  nova: boolean;
  angel: boolean;
  regen: boolean;
  revive: boolean;
  xp: number;
  jars: boolean;
  powerShot: boolean;
  dodgeWave: boolean;
  decoy: boolean;
}

export function mods(r: Ranks, cards: CardId[]): Mods {
  const n = (c: CardId) => stacks(cards, c);
  const has = (c: CardId) => n(c) > 0;
  return {
    dmg: (r.armory >= 1 ? 1.15 : 1) * (1 + 0.15 * n('power')),
    rate: (1 + 0.12 * n('rapid')) * (has('storm') ? 1.2 : 1),
    range: 1 + 0.15 * n('range'),
    hp: (r.hull >= 1 ? 1.2 : 1) * (1 + 0.15 * n('armor')),
    speed: 1 + 0.08 * n('boots'),
    magnet: (r.radar >= 1 ? 1.6 : 1) * (1 + 0.5 * n('magnet')),
    heal: 1 + 0.4 * n('medic'),
    dodgeCd: (r.thrusters >= 1 ? 0.75 : 1) * Math.pow(0.8, n('roll')),
    shots: n('twin') + (has('storm') ? 2 : 0),
    pierce: n('pierce') + (r.armory >= 2 ? 1 : 0),
    crit: 0.05 + 0.12 * n('crit'),
    bubble: has('bubble') ? 10 - 2 * n('bubble') : 0,
    drones: (r.drone >= 1 ? 1 : 0) + (r.drone >= 3 ? 1 : 0) + n('buddy'),
    droneFrost: r.drone >= 2,
    frost: has('frost'),
    mechCharge: (r.solar >= 1 ? 1.3 : 1) * (1 + 0.35 * n('battery')),
    mechTime: (8 + (r.solar >= 2 ? 3 : 0)) * (has('titan') ? 1.5 : 1),
    mechStart: Math.max(r.solar >= 3 ? 0.5 : 0, has('titan') ? 0.6 : 0),
    bounce: n('bounce'),
    burn: has('flame'),
    chain: has('chain'),
    blades: has('blades') ? 2 : 0,
    vampire: has('vampire'),
    skillCd: (r.lab >= 1 ? 0.8 : 1) * (has('overclock') ? 0.7 : 1),
    skillPower: r.lab >= 2 ? 1.5 : 1,
    skillCharges: r.lab >= 3 ? 2 : 1,
    blast: has('blast'),
    nova: has('nova'),
    angel: has('angel'),
    regen: r.hull >= 2,
    revive: r.hull >= 3,
    xp: r.radar >= 2 ? 1.2 : 1,
    jars: r.radar >= 3,
    powerShot: r.armory >= 3,
    dodgeWave: r.thrusters >= 2,
    decoy: r.thrusters >= 3,
  };
}
