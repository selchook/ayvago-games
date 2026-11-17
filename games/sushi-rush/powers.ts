// Sushi Rush: the two kinds of progression (§7g), pure data shared by the simulation, the bot and
// the screens.
//   - Upgrades: eight tracks with three ranks each, bought with coins between days and kept
//     between runs. Rank I is mostly more of something; ranks II and III change what the station
//     or the chef does, and every rank shows in the restaurant (sandals' dust trail, a spare slice
//     on the board, the rice cooker, a second pot, a second basket, tea on the bar, lanterns and
//     the sakura tree, more stools, the bell on the counter).
//   - Power cards: at the start of every day the player picks 1 of 3 (common, rare, epic,
//     legendary; one reroll). A card lasts the whole run; never the same card twice.

export type UpgradeId = 'sandals' | 'knife' | 'rice' | 'pot' | 'steamer' | 'tea' | 'decor' | 'seats' | 'bell';
export const UPGRADE_IDS: UpgradeId[] = ['sandals', 'knife', 'rice', 'pot', 'steamer', 'tea', 'decor', 'seats', 'bell'];
export const MAX_RANK = 3;

/** Price of each rank (I, II, III) and the icon (icons.ts) of each track. */
export const UPGRADE: Record<UpgradeId, { price: [number, number, number]; icon: string }> = {
  sandals: { price: [100, 270, 610], icon: 'p-geta' },
  knife: { price: [110, 300, 670], icon: 'knives' },
  rice: { price: [80, 260, 540], icon: 'rice' },
  pot: { price: [130, 350, 670], icon: 'pot1' },
  steamer: { price: [130, 350, 670], icon: 'steamer' },
  tea: { price: [110, 320, 700], icon: 'p-teapot' },
  decor: { price: [140, 380, 770], icon: 'lantern' },
  seats: { price: [180, 420, 830], icon: 'stool' },
  bell: { price: [100, 290, 640], icon: 'bell' },
};
/** The day a track can first be bought (a pot before the menu has noodles is no use). */
export const UPGRADE_DAY: Record<UpgradeId, number> = { sandals: 1, knife: 1, rice: 1, pot: 3, steamer: 4, tea: 1, decor: 2, seats: 2, bell: 2 };

export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => Object.fromEntries(UPGRADE_IDS.map((u) => [u, 0])) as Ranks;

// ------------------------------------------------------------------ power cards

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type CardId =
  | 'happyHour' | 'freshCatch' | 'quickFeet' | 'warmWelcome' | 'pennyJar' | 'noodleLove' | 'steamTeam' | 'stickyRice'
  | 'luckyCat' | 'prepAhead' | 'zenTea' | 'rushHour' | 'goldenPlate' | 'doubleOrder' | 'regulars' | 'overtime'
  | 'critic' | 'secondWind' | 'streak' | 'masterChef' | 'luckyCoins'
  | 'manekiNeko' | 'goldenHour' | 'feast';

export interface CardDef { id: CardId; rarity: Rarity; icon: string; value: number }
const K = (id: CardId, rarity: Rarity, icon: string, value: number): CardDef => ({ id, rarity, icon, value });

export const CARDS: CardDef[] = [
  K('happyHour', 'common', 'sakura-flower', 4),
  K('freshCatch', 'common', 'tuna', 3),
  K('quickFeet', 'common', 'p-geta', 4),
  K('warmWelcome', 'common', 'p-teapot', 4),
  K('pennyJar', 'common', 'p-coin', 3),
  K('noodleLove', 'common', 'ramen', 2),
  K('steamTeam', 'common', 'gyoza', 2),
  K('stickyRice', 'common', 'rice', 3),
  K('luckyCat', 'rare', 'p-cat', 5),
  K('prepAhead', 'rare', 'roll', 5),
  K('zenTea', 'rare', 'p-teapot', 5),
  K('rushHour', 'rare', 'p-clock', 5),
  K('goldenPlate', 'rare', 'plate', 5),
  K('doubleOrder', 'rare', 'salmon-roll', 4),
  K('regulars', 'rare', 'stool', 5),
  K('overtime', 'rare', 'p-clock', 5),
  K('critic', 'epic', 'critic', 6),
  K('secondWind', 'epic', 'p-heart', 7),
  K('streak', 'epic', 'p-flame', 7),
  K('masterChef', 'epic', 'knives', 8),
  K('luckyCoins', 'epic', 'p-coin', 6),
  K('manekiNeko', 'legendary', 'p-cat', 9),
  K('goldenHour', 'legendary', 'p-clock', 8),
  K('feast', 'legendary', 'dango', 9),
];
export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

/** Draft odds per rarity (weights). */
const WEIGHTS: Record<Rarity, number> = { common: 52, rare: 31, epic: 13, legendary: 4 };

/** Three different cards not held yet. */
export function rollCards(held: CardId[], rnd: () => number, n = 3): CardId[] {
  const pool = CARDS.filter((c) => !held.includes(c.id));
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

/** A rarity's colours on the paper card: the frame, its ink and the glow. */
export const RARITY_COLOR: Record<Rarity, { frame: number; ink: string; glow: number }> = {
  common: { frame: 0x8a7a64, ink: '#5a4a38', glow: 0xe8dcc4 },
  rare: { frame: 0x2a6ab8, ink: '#1f4a8a', glow: 0x8ac0ff },
  epic: { frame: 0x9a2ab0, ink: '#6a1a88', glow: 0xe09aff },
  legendary: { frame: 0xd88a10, ink: '#a0520a', glow: 0xffd060 },
};

// ------------------------------------------------------------------ what they do (read by the sim)

/** Everything upgrades and cards change, folded into one set of numbers and switches. */
export interface Mods {
  speed: number;
  dash: boolean;
  chop: number;
  spareSlice: boolean;
  instantChop: boolean;
  riceInstant: boolean;
  autoRice: boolean;
  ricePay: number;
  cookPot: number;
  pots: number;
  noBurn: boolean;
  cookSteam: number;
  baskets: number;
  steamTwo: boolean;
  patience: number;
  drain: number;
  teapot: boolean;
  tea: boolean;
  tips: number;
  decor: number;
  seats: number;
  arrive: number;
  bell: boolean;
  bellTip: boolean;
  // cards
  happyHour: boolean;
  fishPay: number;
  noodlePay: number;
  steamPay: number;
  flat: number;
  luckyCat: boolean;
  prep: number;
  zenTea: boolean;
  pay: number;
  goldenPlate: boolean;
  doubleOrder: boolean;
  overtime: number;
  critic: boolean;
  hearts: number;
  streak: boolean;
  work: number;
  luckyCoins: boolean;
  goldenHour: boolean;
  feast: boolean;
}

export function mods(r: Ranks, cards: CardId[]): Mods {
  const has = (c: CardId) => cards.includes(c);
  const m: Mods = {
    speed: [1, 1.2, 1.4, 1.5][r.sandals] * (has('quickFeet') ? 1.12 : 1),
    dash: r.sandals >= 3,
    chop: [1, 0.62, 0.55, 0.5][r.knife],
    spareSlice: r.knife >= 2,
    instantChop: r.knife >= 3,
    riceInstant: r.rice >= 1 || has('stickyRice'),
    autoRice: r.rice >= 2,
    ricePay: (r.rice >= 3 ? 2 : 0) + (has('stickyRice') ? 1 : 0),
    cookPot: r.pot >= 1 ? 0.75 : 1,
    pots: r.pot >= 2 ? 2 : 1,
    noBurn: r.pot >= 3,
    cookSteam: (r.steamer >= 1 ? 0.75 : 1) * (has('steamTeam') ? 0.7 : 1),
    baskets: r.steamer >= 2 ? 2 : 1,
    steamTwo: r.steamer >= 3,
    patience: [1, 1.15, 1.3, 1.3][r.tea] * (has('warmWelcome') ? 1.1 : 1),
    drain: has('regulars') ? 0.85 : 1,
    teapot: r.tea >= 3,
    tea: r.tea >= 2,
    tips: [1, 1.15, 1.3, 1.45][r.decor] + (has('manekiNeko') ? 0.5 : 0),
    decor: r.decor,
    seats: [4, 5, 6, 7][r.seats],
    arrive: r.bell >= 1 ? 0.86 : 1,
    bell: r.bell >= 2,
    bellTip: r.bell >= 3,
    happyHour: has('happyHour'),
    fishPay: has('freshCatch') ? 1.15 : 1,
    noodlePay: has('noodleLove') ? 1.25 : 1,
    steamPay: 1,
    flat: has('pennyJar') ? 1 : 0,
    luckyCat: has('luckyCat'),
    prep: has('prepAhead') ? 2 : 0,
    zenTea: has('zenTea'),
    pay: has('rushHour') ? 1.15 : 1,
    goldenPlate: has('goldenPlate'),
    doubleOrder: has('doubleOrder'),
    overtime: has('overtime') ? 15 : 0,
    critic: has('critic'),
    hearts: has('secondWind') ? 1 : 0,
    streak: has('streak'),
    work: has('masterChef') ? 0.75 : 1,
    luckyCoins: has('luckyCoins'),
    goldenHour: has('goldenHour'),
    feast: has('feast'),
  };
  if (has('rushHour')) m.arrive *= 0.78;
  return m;
}
