// Star Squadron: the power cards. Every cleared wave and every boss earns a card offer of three
// cards (four with a talent), rolled at that moment; the player opens it whenever they like while
// the run flows on. A picked card lasts for the whole run and most of them stack.
// Two owned cards can unlock a synergy card (gold frame) that combines them into something stronger.
// Pure data and rules: what each card does to the ship is in `shipStats()`.

export type Rarity = 'common' | 'rare' | 'epic' | 'synergy';

export type CardId =
  // common
  | 'rapidFire' | 'heavyRounds' | 'plating' | 'magnet' | 'bounty' | 'capacitors' | 'thrusters' | 'repair'
  // rare
  | 'spread' | 'pierce' | 'homing' | 'drone' | 'shieldGen' | 'crit' | 'megaBomb' | 'ricochet' | 'nanoRepair'
  // epic
  | 'chain' | 'reflex' | 'overload' | 'phoenix'
  // synergies
  | 'stormMissiles' | 'laserFan' | 'sniperDrones' | 'trickShot' | 'siphon';

export interface CardDef {
  id: CardId;
  rarity: Rarity;
  /** Times it can be taken in one run. */
  max: number;
  /** Synergy cards: the two cards they need. */
  needs?: [CardId, CardId];
  /** Icon colour on the card art. */
  hue: number;
}

export const CARDS: CardDef[] = [
  { id: 'rapidFire', rarity: 'common', max: 5, hue: 0xffd23f },
  { id: 'heavyRounds', rarity: 'common', max: 5, hue: 0xff8a3d },
  { id: 'plating', rarity: 'common', max: 4, hue: 0x9fe870 },
  { id: 'magnet', rarity: 'common', max: 3, hue: 0x5ad1ff },
  { id: 'bounty', rarity: 'common', max: 3, hue: 0xffd23f },
  { id: 'capacitors', rarity: 'common', max: 3, hue: 0x7aa8ff },
  { id: 'thrusters', rarity: 'common', max: 2, hue: 0x5affd1 },
  { id: 'repair', rarity: 'common', max: 99, hue: 0x6dff8a },
  { id: 'spread', rarity: 'rare', max: 3, hue: 0x5ad1ff },
  { id: 'pierce', rarity: 'rare', max: 3, hue: 0xb07cff },
  { id: 'homing', rarity: 'rare', max: 3, hue: 0xff6a4d },
  { id: 'drone', rarity: 'rare', max: 3, hue: 0x5affd1 },
  { id: 'shieldGen', rarity: 'rare', max: 3, hue: 0x5ad1ff },
  { id: 'crit', rarity: 'rare', max: 4, hue: 0xff4fa3 },
  { id: 'megaBomb', rarity: 'rare', max: 2, hue: 0xff8a3d },
  { id: 'ricochet', rarity: 'rare', max: 2, hue: 0xffe28a },
  { id: 'nanoRepair', rarity: 'rare', max: 2, hue: 0x6dff8a },
  { id: 'chain', rarity: 'epic', max: 2, hue: 0x8fd0ff },
  { id: 'reflex', rarity: 'epic', max: 1, hue: 0xc07cff },
  { id: 'overload', rarity: 'epic', max: 1, hue: 0xffd23f },
  { id: 'phoenix', rarity: 'epic', max: 1, hue: 0xff6a4d },
  { id: 'stormMissiles', rarity: 'synergy', max: 1, needs: ['homing', 'chain'], hue: 0x8fd0ff },
  { id: 'laserFan', rarity: 'synergy', max: 1, needs: ['spread', 'pierce'], hue: 0xb07cff },
  { id: 'sniperDrones', rarity: 'synergy', max: 1, needs: ['drone', 'crit'], hue: 0xff4fa3 },
  { id: 'trickShot', rarity: 'synergy', max: 1, needs: ['ricochet', 'crit'], hue: 0xffe28a },
  { id: 'siphon', rarity: 'synergy', max: 1, needs: ['shieldGen', 'magnet'], hue: 0x5ad1ff },
];

export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;
export const CARD_IDS = CARDS.map((c) => c.id);

/** Frame and glow colours per rarity (synergy: gold). */
export const RARITY_COLOR: Record<Rarity, { frame: number; glow: number; text: string; dark: number }> = {
  common: { frame: 0xc9d4ea, glow: 0x9fb0d8, text: '#d8e2f6', dark: 0x1e2a44 },
  rare: { frame: 0x4fb2ff, glow: 0x2f8cff, text: '#8fd0ff', dark: 0x123663 },
  epic: { frame: 0xd27bff, glow: 0xb04cff, text: '#e3a8ff', dark: 0x37145c },
  synergy: { frame: 0xffd23f, glow: 0xffb020, text: '#ffe28a', dark: 0x4a3008 },
};

/** Talent effects that change the ship (meta.ts fills them in). */
export interface TalentFx {
  hull: number;
  shield: number;
  creditK: number;
  damageK: number;
  fireK: number;
  drones: number;
  crit: number;
  cdK: number;
  freeRerolls: number;
  luck: boolean;
  draftN: number;
  phoenix: number;
}

export const NO_TALENTS: TalentFx = {
  hull: 0, shield: 0, creditK: 1, damageK: 1, fireK: 1, drones: 0, crit: 0, cdK: 1, freeRerolls: 0, luck: false, draftN: 3, phoenix: 0,
};

/** What the ship can do: base values with every card and talent applied. */
export interface ShipStats {
  fireRate: number;
  damage: number;
  bulletSpeed: number;
  /** Extra pairs of angled shots. */
  spread: number;
  pierce: number;
  crit: number;
  ricochet: number;
  chainChance: number;
  chainN: number;
  /** Missiles per salvo. */
  missiles: number;
  missileCd: number;
  drones: number;
  droneDmg: number;
  magnet: number;
  creditK: number;
  cdK: number;
  speed: number;
  shieldMax: number;
  shieldRegen: number;
  hullRegen: number;
  /** The ship's hit circle, relative (Thrusters make it smaller). */
  hitK: number;
  hullBonus: number;
  bombDmg: number;
  bombNova: number;
  overdriveT: number;
  overdrivePierce: boolean;
  reflex: boolean;
  storm: boolean;
  laserFan: boolean;
  sniperDrones: boolean;
  trickShot: boolean;
  siphon: boolean;
}

export type Stacks = Partial<Record<CardId, number>>;

export function shipStats(st: Stacks, tl: TalentFx = NO_TALENTS): ShipStats {
  const n = (id: CardId) => st[id] ?? 0;
  return {
    fireRate: 5.2 * (1 + 0.14 * n('rapidFire')) * tl.fireK,
    damage: 6.5 * (1 + 0.2 * n('heavyRounds')) * tl.damageK,
    bulletSpeed: 25,
    spread: n('spread'),
    pierce: n('pierce') + (n('laserFan') ? 1 : 0),
    crit: Math.min(0.75, 0.05 + 0.1 * n('crit') + tl.crit),
    ricochet: n('ricochet'),
    chainChance: n('chain') ? 0.14 + 0.1 * n('chain') : 0,
    chainN: n('chain') ? 2 + n('chain') : 0,
    missiles: n('homing'),
    missileCd: 1.5,
    drones: Math.min(4, n('drone') + tl.drones),
    droneDmg: 5 * (1 + 0.2 * n('heavyRounds')) * tl.damageK,
    magnet: 1.6 + 1.7 * n('magnet'),
    creditK: (1 + 0.35 * n('bounty')) * tl.creditK,
    cdK: Math.pow(0.86, n('capacitors')) * tl.cdK,
    speed: 8.6 * (1 + 0.15 * n('thrusters')),
    shieldMax: 18 * n('shieldGen') + tl.shield,
    shieldRegen: 2 + 1 * n('shieldGen'),
    hullRegen: 0.6 * n('nanoRepair'),
    hitK: 1 - 0.12 * n('thrusters'),
    hullBonus: 20 * n('plating') + tl.hull,
    bombDmg: 160 * (1 + 0.5 * n('megaBomb')),
    bombNova: n('megaBomb') ? 0.8 + 0.6 * n('megaBomb') : 0,
    overdriveT: 6 + (n('overload') ? 3 : 0),
    overdrivePierce: n('overload') > 0,
    reflex: n('reflex') > 0,
    storm: n('stormMissiles') > 0,
    laserFan: n('laserFan') > 0,
    sniperDrones: n('sniperDrones') > 0,
    trickShot: n('trickShot') > 0,
    siphon: n('siphon') > 0,
  };
}

/** Draft odds per rarity: [normal, with the Lucky Stars talent]. */
const WEIGHTS: Record<Exclude<Rarity, 'synergy'>, [number, number]> = { common: [60, 48], rare: [31, 37], epic: [9, 15] };

/** True when a card can still be picked and would do something. */
export function offerable(st: Stacks, id: CardId, hullFull: boolean): boolean {
  const def = CARD[id];
  if ((st[id] ?? 0) >= def.max) return false;
  if (def.needs && !def.needs.every((p) => (st[p] ?? 0) > 0)) return false;
  if (id === 'repair' && hullFull) return false;
  if (id === 'trickShot' && !(st.ricochet && st.crit)) return false;
  return true;
}

/**
 * `n` different cards for an offer (never one in `exclude`): by rarity odds, never a dead pick.
 * A synergy the player has unlocked takes one slot about half the time.
 */
export function rollDraft(st: Stacks, n: number, luck: boolean, hullFull: boolean, rnd: () => number, exclude: readonly CardId[] = []): CardId[] {
  const pool = CARDS.filter((c) => offerable(st, c.id, hullFull) && !exclude.includes(c.id));
  const out: CardId[] = [];
  const syn = pool.filter((c) => c.rarity === 'synergy');
  if (syn.length && rnd() < 0.5) {
    const c = syn[Math.floor(rnd() * syn.length)];
    out.push(c.id);
  }
  const rest = pool.filter((c) => c.rarity !== 'synergy');
  const li = luck ? 1 : 0;
  while (out.length < n && rest.length) {
    const rars = (['common', 'rare', 'epic'] as const).filter((r) => rest.some((c) => c.rarity === r));
    const total = rars.reduce((s, r) => s + WEIGHTS[r][li], 0);
    let x = rnd() * total;
    let rar: (typeof rars)[number] = rars[0];
    for (const r of rars) { x -= WEIGHTS[r][li]; if (x <= 0) { rar = r; break; } }
    const of = rest.filter((c) => c.rarity === rar);
    // Field Repair is a filler: only now and then
    let c = of[Math.floor(rnd() * of.length)];
    if (c.id === 'repair' && of.length > 1 && rnd() < 0.6) c = of.filter((q) => q.id !== 'repair')[Math.floor(rnd() * (of.length - 1))];
    out.push(c.id);
    rest.splice(rest.indexOf(c), 1);
  }
  return out;
}
