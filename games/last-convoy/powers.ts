// Last Convoy: both kinds of progression (§7g).
//   - The garage: ten upgrade tracks, three ranks each, paid with scrap (every rank) and supplies
//     (the rare currency from bosses, special chests and side goals: ranks II and III). Rank I adds
//     power; ranks II and III change how a thing behaves (the barricade gets spikes, then comes in
//     pairs; bullets pierce, then burn; the dog pins, then sniffs out supplies; the convoy gets its
//     armoured body, then a ram).
//   - The run's power cards: after every won mission (and every second Last Stand wave) a draft of
//     three, one reroll; 24 cards over offence, defence, combos, the ability, the dog, the drive,
//     the economy and one per survivor. They last the run.
import type { HeroId } from './defs';

export type UpgradeId = 'barricade' | 'flare' | 'heal' | 'warcry' | 'guns' | 'pouch' | 'melee' | 'dog' | 'convoy' | 'vest';
export const UPGRADE_IDS: UpgradeId[] = ['guns', 'melee', 'pouch', 'vest', 'dog', 'convoy', 'barricade', 'flare', 'heal', 'warcry'];
export const MAX_RANK = 3;
export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ barricade: 0, flare: 0, heal: 0, warcry: 0, guns: 0, pouch: 0, melee: 0, dog: 0, convoy: 0, vest: 0 });

export interface UpgradeDef {
  id: UpgradeId;
  /** Scrap per rank, and supplies per rank. */
  scrap: [number, number, number];
  supplies: [number, number, number];
  /** Only for this survivor (the ability tracks). */
  hero?: HeroId;
  icon: string;
}

export const UPGRADE: Record<UpgradeId, UpgradeDef> = {
  guns: { id: 'guns', scrap: [120, 260, 480], supplies: [0, 2, 4], icon: 'i-ammo' },
  melee: { id: 'melee', scrap: [110, 240, 450], supplies: [0, 2, 4], icon: 'i-melee' },
  pouch: { id: 'pouch', scrap: [90, 200, 380], supplies: [0, 1, 3], icon: 'i-pouch' },
  vest: { id: 'vest', scrap: [130, 280, 520], supplies: [0, 2, 5], icon: 'i-vest' },
  dog: { id: 'dog', scrap: [100, 230, 420], supplies: [0, 2, 3], icon: 'i-dog' },
  convoy: { id: 'convoy', scrap: [150, 320, 560], supplies: [0, 3, 5], icon: 'i-truck' },
  barricade: { id: 'barricade', scrap: [100, 220, 420], supplies: [0, 2, 3], hero: 'matt', icon: 'a-barricade' },
  flare: { id: 'flare', scrap: [100, 220, 420], supplies: [0, 2, 3], hero: 'sam', icon: 'a-flare' },
  heal: { id: 'heal', scrap: [100, 220, 420], supplies: [0, 2, 3], hero: 'shaun', icon: 'a-heal' },
  warcry: { id: 'warcry', scrap: [100, 220, 420], supplies: [0, 2, 3], hero: 'lis', icon: 'a-warcry' },
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, { frame: number; glow: number; ink: string }> = {
  common: { frame: 0xc8c0b0, glow: 0x8a8070, ink: '#e8e0d0' },
  rare: { frame: 0x4ab4ff, glow: 0x2a6ab0, ink: '#9ad8ff' },
  epic: { frame: 0xc06aff, glow: 0x6a2ab0, ink: '#e0b0ff' },
  legendary: { frame: 0xffc83a, glow: 0xb07a10, ink: '#ffe48a' },
};

export type CardId =
  | 'hollow' | 'heavy' | 'quick' | 'mags' | 'jacket' | 'sprint' | 'scav' | 'nitro'
  | 'choke' | 'silent' | 'hound' | 'fury' | 'charged' | 'roll' | 'adren' | 'cool' | 'ram' | 'lucky'
  | 'fire' | 'chain' | 'second' | 'expert' | 'flaregun' | 'medic' | 'encore'
  | 'laugh' | 'whisper' | 'golden';

export interface CardDef { id: CardId; rarity: Rarity; icon: string; hero?: HeroId; max: number }

export const CARDS: CardDef[] = [
  // common
  { id: 'hollow', rarity: 'common', icon: 'i-ammo', max: 3 },
  { id: 'heavy', rarity: 'common', icon: 'i-melee', max: 3 },
  { id: 'quick', rarity: 'common', icon: 'i-reload', max: 2 },
  { id: 'mags', rarity: 'common', icon: 'i-pouch', max: 2 },
  { id: 'jacket', rarity: 'common', icon: 'i-vest', max: 3 },
  { id: 'sprint', rarity: 'common', icon: 'i-boot', max: 2 },
  { id: 'scav', rarity: 'common', icon: 'i-scrap', max: 2 },
  { id: 'nitro', rarity: 'common', icon: 'i-nitro', max: 2 },
  // rare
  { id: 'choke', rarity: 'rare', icon: 'i-ammo', max: 1 },
  { id: 'silent', rarity: 'rare', icon: 'i-quiet', max: 1 },
  { id: 'hound', rarity: 'rare', icon: 'i-dog', max: 1 },
  { id: 'fury', rarity: 'rare', icon: 'i-fury', max: 2 },
  { id: 'charged', rarity: 'rare', icon: 'i-charge', max: 1 },
  { id: 'roll', rarity: 'rare', icon: 'i-roll', max: 1 },
  { id: 'adren', rarity: 'rare', icon: 'i-heart', max: 1 },
  { id: 'cool', rarity: 'rare', icon: 'i-clock', max: 2 },
  { id: 'ram', rarity: 'rare', icon: 'i-truck', max: 1 },
  { id: 'lucky', rarity: 'rare', icon: 'i-chest', max: 1 },
  // epic
  { id: 'fire', rarity: 'epic', icon: 'i-fire', max: 1 },
  { id: 'chain', rarity: 'epic', icon: 'i-boom', max: 1 },
  { id: 'second', rarity: 'epic', icon: 'i-revive', max: 1 },
  { id: 'expert', rarity: 'epic', icon: 'a-barricade', hero: 'matt', max: 1 },
  { id: 'flaregun', rarity: 'epic', icon: 'a-flare', hero: 'sam', max: 1 },
  { id: 'medic', rarity: 'epic', icon: 'a-heal', hero: 'shaun', max: 1 },
  { id: 'encore', rarity: 'epic', icon: 'a-warcry', hero: 'lis', max: 1 },
  // legendary
  { id: 'laugh', rarity: 'legendary', icon: 'i-star', max: 1 },
  { id: 'whisper', rarity: 'legendary', icon: 'i-quiet', max: 1 },
  { id: 'golden', rarity: 'legendary', icon: 'i-dog', max: 1 },
];
export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

export const stacks = (cards: CardId[], id: CardId): number => cards.reduce((n, c) => n + (c === id ? 1 : 0), 0);

/** What the ranks and the cards add up to, read by the simulations. */
export interface Mods {
  gunDmg: number; meleeDmg: number; spread: number; ammoDrop: number; reload: number; ammo: number; hp: number; speed: number;
  scrap: number; nitro: number; noise: number; dogDmg: number; dogPin: number; finisher: number;
  charge: number; dashDmg: number; dashInvuln: number; killHeal: number; abilityCd: number;
  ramDmg: number; runOver: number; chests: number; burn: boolean; chain: number; second: boolean;
  pierce: number; burnRounds: boolean; knock: number; finisherWave: boolean; bleed: boolean;
  rollInvuln: number; selfRevive: boolean; dogSupplies: boolean; dogReveal: boolean;
  armor: number; plated: boolean; ramSpikes: boolean; horde: number; freeAbility: number;
  /** The ability's own rank (0..3) and its card. */
  abilityRank: number; abilityCard: boolean; goldenDog: boolean;
}

export function mods(hero: HeroId, ranks: Ranks, cards: CardId[]): Mods {
  const n = (id: CardId) => stacks(cards, id);
  const r = ranks;
  const ability = { matt: r.barricade, sam: r.flare, shaun: r.heal, lis: r.warcry }[hero];
  const abilityCard = { matt: n('expert'), sam: n('flaregun'), shaun: n('medic'), lis: n('encore') }[hero] > 0;
  return {
    gunDmg: (1 + 0.15 * Math.min(1, r.guns)) * (1 + 0.2 * n('hollow')),
    spread: n('choke'),
    ammoDrop: r.pouch >= 3 ? 2 : 1,
    meleeDmg: (1 + 0.2 * Math.min(1, r.melee)) * (1 + 0.22 * n('heavy')),
    reload: (r.pouch >= 2 ? 0.7 : 1) * (1 - 0.3 * n('quick')),
    ammo: (1 + 0.35 * Math.min(1, r.pouch)) * (1 + 0.4 * n('mags')),
    hp: (1 + 0.2 * Math.min(1, r.vest)) * (1 + 0.18 * n('jacket')),
    speed: 1 + 0.08 * n('sprint'),
    scrap: 1 + 0.3 * n('scav'),
    nitro: 2 + 2 * n('nitro') + (r.convoy >= 3 ? 1 : 0),
    noise: (n('silent') ? 0.6 : 1) * (n('whisper') ? 0.5 : 1),
    horde: n('whisper') ? 0.5 : 1,
    dogDmg: (1 + 0.3 * Math.min(1, r.dog)) * (n('hound') ? 1.6 : 1),
    dogPin: r.dog >= 2 || n('hound') ? 1.6 : 0,
    dogSupplies: r.dog >= 3 || n('golden') > 0,
    dogReveal: r.dog >= 3,
    goldenDog: n('golden') > 0,
    finisher: 1 + 0.4 * n('fury'),
    charge: n('charged') ? 0.55 : 1,
    dashDmg: n('roll') ? 2 : 1,
    dashInvuln: n('roll') ? 0.35 : 0,
    killHeal: n('adren') ? 2 : 0,
    abilityCd: (1 - 0.25 * n('cool')),
    ramDmg: n('ram') ? 0.5 : 1,
    runOver: n('ram') ? 2 : 1,
    chests: n('lucky') ? 2 : 1,
    burn: n('fire') > 0,
    chain: n('chain') ? 0.25 : 0,
    second: n('second') > 0,
    pierce: r.guns >= 2 ? 1 : 0,
    burnRounds: r.guns >= 3,
    knock: r.melee >= 2 ? 1.5 : 1,
    finisherWave: r.melee >= 2,
    bleed: r.melee >= 3,
    rollInvuln: r.vest >= 2 ? 0.15 : 0,
    selfRevive: r.vest >= 3,
    armor: (r.convoy >= 1 ? 1.25 : 1),
    plated: r.convoy >= 2,
    ramSpikes: r.convoy >= 3,
    freeAbility: n('laugh') ? 3 : 0,
    abilityRank: ability,
    abilityCard,
  };
}

/** Three cards to pick from (no maxed cards, no other survivor's card), weighted by rarity. */
export function rollCards(have: CardId[], hero: HeroId, rnd: () => number, count = 3): CardId[] {
  const weight: Record<Rarity, number> = { common: 10, rare: 5.5, epic: 2.2, legendary: 0.8 };
  const pool = CARDS.filter((c) => stacks(have, c.id) < c.max && (!c.hero || c.hero === hero));
  const out: CardId[] = [];
  while (out.length < count && pool.length) {
    const total = pool.reduce((s, c) => s + weight[c.rarity], 0);
    let x = rnd() * total;
    let k = 0;
    for (; k < pool.length - 1; k++) { x -= weight[pool[k].rarity]; if (x <= 0) break; }
    out.push(pool[k].id);
    pool.splice(k, 1);
  }
  return out;
}
