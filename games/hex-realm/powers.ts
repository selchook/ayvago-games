// Hex Realm: the powers on top of gear and talents, pure data shared by the simulation, the
// campaign, the bot and the screens.
//   - The Shrine of Powers (village): every class has five tracks, its two skills and its three
//     combo finishers, with three ranks each. Rank I is more power; ranks II and III change what the
//     move does (Whirl pulls foes in, Cleave leaves a burning line, Plunge stuns, Fireball splits …).
//     Paid with gold and Sigils, a rare currency from bosses, mini-bosses, camps, elites and the rift.
//   - Power cards: after a won chapter, camp or rift floor and on a level-up the game deals three
//     cards (common, rare, epic, legendary; one reroll); a card lasts until the journey (the
//     session) ends. Up to HAND_MAX cards, never the same one twice.
import { CLASS, type ClassId, type ComboId, type Rarity } from './defs';

// ------------------------------------------------------------------ the Shrine of Powers

/** What a rank adds to a move (cumulative over the ranks). */
export interface Mods {
  /** Damage multiplier. */
  dmg?: number;
  /** Cooldown multiplier (skills). */
  cd?: number;
  /** Pulls the foes round the hero in before the blow. */
  pull?: boolean;
  /** The blow strikes a second time a moment later. */
  twice?: boolean;
  /** Sets the foes hit burning (seconds). */
  burn?: number;
  stun?: number;
  /** Reach / radius multiplier. */
  wide?: number;
  /** Throws the foes hit into the air. */
  lift?: number;
  /** More projectiles. */
  shots?: number;
  pierce?: boolean;
  /** Shots burst on impact (radius). */
  explode?: number;
  /** Kills foes under this health fraction outright (bosses take double damage instead). */
  execute?: number;
  /** Heals this fraction of max health (per foe hit for finishers; flat for skills). */
  heal?: number;
  /** A ward of this many hits. */
  ward?: number;
  /** Hidden for this long after. */
  hide?: number;
  /** Lasts this much longer (seconds). */
  longer?: number;
  /** A second wave, volley or meteor. */
  again?: boolean;
  /** Roots the foes hit (seconds). */
  root?: number;
  /** Freezes the foes hit (seconds). */
  freeze?: number;
  /** All round instead of ahead (Iron Palm's ring). */
  ring?: boolean;
  /** The skill's cooldown resets when it kills. */
  reset?: boolean;
  /** Frozen foes take more damage. */
  shatter?: boolean;
  /** Breaks guards. */
  breaks?: boolean;
}

export type TrackKind = 'skill1' | 'skill2' | ComboId;
export const TRACK_KINDS: TrackKind[] = ['skill1', 'skill2', 'chain', 'heavy', 'dash'];
export const MAX_RANK = 3;

/** Ranks II and III of every track (rank I is the same for all: more power). */
const R: Record<ClassId, Record<TrackKind, [Mods, Mods]>> = {
  warrior: {
    skill1: [{ wide: 1.8 }, { breaks: true, stun: 0.6 }],
    skill2: [{ pull: true }, { longer: 0.9 }],
    chain: [{ pull: true }, { twice: true }],
    heavy: [{ burn: 3 }, { wide: 1.5, stun: 0.8 }],
    dash: [{ stun: 1.0 }, { wide: 1.35, lift: 0.8 }],
  },
  rogue: {
    skill1: [{ hide: 1.5 }, { reset: true }],
    skill2: [{ burn: 3 }, { longer: 3 }],
    chain: [{ shots: 6 }, { twice: true }],
    heavy: [{ burn: 4 }, { execute: 0.25 }],
    dash: [{ stun: 1.0 }, { hide: 2 }],
  },
  ranger: {
    skill1: [{ shots: 4 }, { again: true }],
    skill2: [{ burn: 3 }, { shots: 3 }],
    chain: [{ shots: 2 }, { pierce: true }],
    heavy: [{ explode: 2.2 }, { wide: 1.8, stun: 0.8 }],
    dash: [{ again: true }, { root: 2.5 }],
  },
  monk: {
    skill1: [{ again: true }, { longer: 0.4 }],
    skill2: [{ stun: 1.2 }, { wide: 1.6 }],
    chain: [{ pull: true }, { twice: true }],
    heavy: [{ stun: 1.0 }, { ring: true }],
    dash: [{ stun: 1.0 }, { wide: 1.35, lift: 0.8 }],
  },
  cleric: {
    skill1: [{ ward: 2 }, { longer: 4 }],
    skill2: [{ again: true }, { stun: 1.5 }],
    chain: [{ heal: 0.03 }, { wide: 1.5 }],
    heavy: [{ burn: 3 }, { heal: 0.04 }],
    dash: [{ stun: 1.0 }, { heal: 0.08 }],
  },
  wizard: {
    skill1: [{ shots: 3 }, { explode: 3.8, burn: 4 }],
    skill2: [{ wide: 1.5 }, { shatter: true }],
    chain: [{ shots: 2 }, { pierce: true }],
    heavy: [{ burn: 3 }, { wide: 1.6, stun: 0.8 }],
    dash: [{ burn: 4 }, { again: true }],
  },
};

/** Rank I: finishers hit harder; skills cool down sooner and hit a little harder. */
const RANK1: Record<'skill' | 'combo', Mods> = { skill: { cd: 0.85, dmg: 1.1 }, combo: { dmg: 1.2 } };

/** The id a track's rank is saved under (skill ids and `<class>_<combo>` are unique). */
export function trackId(cls: ClassId, kind: TrackKind): string {
  if (kind === 'skill1') return CLASS[cls].skills[0].id;
  if (kind === 'skill2') return CLASS[cls].skills[1].id;
  return cls + '_' + kind;
}

/** The mods of a track at a rank (0 = none). */
export function trackMods(cls: ClassId, kind: TrackKind, rank: number): Mods {
  if (rank <= 0) return {};
  const base = kind === 'skill1' || kind === 'skill2' ? RANK1.skill : RANK1.combo;
  let m: Mods = { ...base };
  const [two, three] = R[cls][kind];
  if (rank >= 2) m = { ...m, ...two };
  if (rank >= 3) m = { ...m, ...three };
  return m;
}

/** The i18n key of what rank r (1–3) of a track does. */
export function rankKey(cls: ClassId, kind: TrackKind, r: number): string {
  if (r <= 1) return kind === 'skill1' || kind === 'skill2' ? 'up_skill1' : 'up_combo1';
  return `up_${trackId(cls, kind)}_${r}`;
}

/** The price of the next rank: gold and Sigils. */
export const RANK_GOLD = [90, 240, 480];
export const RANK_SIGILS = [1, 2, 3];
export function rankPrice(rank: number, cycle: number): { gold: number; sigils: number } {
  return { gold: Math.round(RANK_GOLD[rank] * (1 + cycle * 0.5)), sigils: RANK_SIGILS[rank] };
}

/** The ranks of a class's moves, from the save's map. */
export function classRanks(cls: ClassId, ranks: Record<string, number>): Record<TrackKind, number> {
  return Object.fromEntries(TRACK_KINDS.map((k) => [k, ranks[trackId(cls, k)] ?? 0])) as Record<TrackKind, number>;
}

// ------------------------------------------------------------------ power cards

export type CardRarity = Exclude<Rarity, 'uncommon'>;
export const CARD_RARITIES: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface CardDef {
  id: string;
  rarity: CardRarity;
  /** Only for this class. */
  cls?: ClassId;
  /** Its picture (an icon key of art.ts). */
  icon: string;
  /** A rough worth for the bot's pick (higher is better). */
  value: number;
}

const K = (id: string, rarity: CardRarity, icon: string, value: number, cls?: ClassId): CardDef => ({ id, rarity, icon, value, cls });

export const CARDS: CardDef[] = [
  // offence
  K('edge', 'common', 'sword', 4),
  K('hawk', 'common', 'eye', 3),
  K('berserk', 'rare', 'pw-rage', 5),
  K('execute', 'epic', 'skull', 7),
  K('ember', 'rare', 'flame', 5),
  // defence
  K('iron', 'common', 'armor', 4),
  K('vamp', 'rare', 'heart', 5),
  K('ward', 'rare', 'pw-shield', 4),
  K('frost', 'rare', 'sk-nova', 4),
  K('alchemist', 'common', 'potion', 3),
  // combos
  K('tempo', 'common', 'pw-haste', 4),
  K('finale', 'rare', 'cb-chain', 6),
  K('quick', 'rare', 'cb-heavy', 4),
  K('wind', 'common', 'cb-dash', 3),
  K('echo', 'epic', 'sk-whirl', 7),
  // skills
  K('flow', 'common', 'amulet', 4),
  K('bloodlust', 'epic', 'sk-flurry', 6),
  K('mastery', 'rare', 'sk-smite', 5),
  K('kindle', 'epic', 'pw-gold', 5),
  // economy
  K('greed', 'common', 'coin', 2),
  K('scholar', 'common', 'charm', 2),
  K('glory', 'rare', 'banner', 3),
  K('sigil', 'epic', 'sigil', 4),
  // legendary
  K('phoenix', 'legendary', 'flame', 9),
  K('avatar', 'legendary', 'hero', 10),
  K('midas', 'legendary', 'pw-gold', 7),
  // one per class
  K('bulwark', 'rare', 'sk-bash', 5, 'warrior'),
  K('venom', 'epic', 'sk-smoke', 7, 'rogue'),
  K('ricochet', 'rare', 'sk-volley', 5, 'ranger'),
  K('chi', 'rare', 'sk-palm', 5, 'monk'),
  K('aura', 'epic', 'sk-heal', 6, 'cleric'),
  K('frostbite', 'rare', 'sk-nova', 5, 'wizard'),
];
export const CARD: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** Cards held at most in one journey. */
export const HAND_MAX = 8;

/** Draft odds per rarity: a normal draft and the one after a boss or a camp. */
const WEIGHTS: Record<CardRarity, [number, number]> = { common: [52, 30], rare: [30, 33], epic: [13, 25], legendary: [5, 12] };

/** Three different cards the hero does not hold yet (class cards only for their class). */
export function rollCards(cls: ClassId, held: string[], rnd: () => number, rich = false, n = 3): string[] {
  const pool = CARDS.filter((c) => !held.includes(c.id) && (!c.cls || c.cls === cls));
  const out: string[] = [];
  const w = rich ? 1 : 0;
  while (out.length < n && pool.length) {
    const rars = CARD_RARITIES.filter((r) => pool.some((c) => c.rarity === r));
    const total = rars.reduce((s, r) => s + WEIGHTS[r][w], 0);
    let x = rnd() * total, rar = rars[0];
    for (const r of rars) { x -= WEIGHTS[r][w]; if (x <= 0) { rar = r; break; } }
    const of = pool.filter((c) => c.rarity === rar);
    const c = of[Math.floor(rnd() * of.length)];
    out.push(c.id);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}

/** The colours of a rarity on the vellum: the frame's gem and the ink of its name. */
export const CARD_COLOR: Record<CardRarity, { gem: number; ink: string; glow: number }> = {
  common: { gem: 0x9a948a, ink: '#5a5044', glow: 0xd8d0c0 },
  rare: { gem: 0x2c6ad8, ink: '#1f4a9a', glow: 0x7ab0ff },
  epic: { gem: 0x8a2ac8, ink: '#6a1aa0', glow: 0xd08aff },
  legendary: { gem: 0xe08a10, ink: '#a0520a', glow: 0xffc85a },
};
