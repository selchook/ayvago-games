// Kickflip Park: the board catalogue. Every board the player can ride is one entry here: its name,
// its model, its colours, its rarity and the rule that unlocks it. No three.js and no Phaser in
// this file (meta.ts reads the unlock rules); the 3D model is built by boardmodel.ts and the deck
// graphics of the Kenney boards are painted by boardart.ts.
//
// Since 1.2 the game rides only the owner's two board models, as skins: colour treatments of the
// one-mesh black board (its texture's grip, wood, wheel and truck colours) and per-part colourways
// of the blue one (deck, truck and wheel meshes). Both are normalised to the Kenney board's size
// (boardmodel.ts).
//
// The game-made boards of 1.1 (the Kenney Mini Skate board and its colourways) are still here, in
// KENNEY_BOARDS, switched off by KENNEY_BOARDS_ON. Their unlock rules read the same progress as
// before and a save's `owned` list is kept, so nothing earned is lost: set KENNEY_BOARDS_ON to true
// and they are back in the picker (after the skins) with what they had unlocked.
//
// Adding a skin: one entry with `model: 'boards/<file>.glb'` and its colours. On the black board
// (one mesh, one texture) `grip`, `wood`, `wheel` and `truck` recolour those parts of the texture,
// `hue` turns the hue of the whole texture; on the blue board they colour the parts by material
// name ('deck', 'truck', 'wheel'): `hue` turns the deck graphic, `wood` the deck's wooden edge.
// `gloss` and `metal` make it shiny, `glow` lights the wooden edge, `trail` and `spark` colour the
// air trail and the grind sparks. A new model: put the GLB under public/assets/boards/ (record its
// licence in docs/assets/LICENSES.md); the loader fits any board GLB into the game's board frame by
// itself (nose along the travel axis, wheels on the ground, the Kenney board's length, width, deck
// height and thickness); `fit` fixes a model the automatic fit gets wrong. A GLB that fails to load
// is left out of the game.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'special';

export const RARITY_COLOR: Record<Rarity, number> = { common: 0xcfd8f0, rare: 0x5ac8ff, epic: 0xc08aff, legendary: 0xffc93a, special: 0xff6fd8 };

/**
 * What opens a board: free; a park opening (Timber Yard: 3 goals in Maple Plaza); a best session
 * score; goals done (all parks); mixtapes ever found (different ones, all parks); or all five
 * mixtapes of one park.
 */
export type Unlock =
  | { kind: 'free' }
  | { kind: 'park'; park: 'yard' | 'roofs' }
  | { kind: 'goals'; n: number }
  | { kind: 'score'; n: number }
  | { kind: 'tapes'; n: number }
  | { kind: 'tapesPark' };

/** How a GLB is fitted into the board frame when the automatic fit needs help. */
export interface BoardFit {
  /** Turns the model first (radians, XYZ); skips the automatic orientation. */
  rotate?: [number, number, number];
  /** × the standard board length (1 = the Kenney board's 1.54 m). */
  scale?: number;
  /** Moves the fitted model (metres: x across, y up, z towards the nose). */
  offset?: [number, number, number];
  /** Turns the model round (nose and tail swapped). */
  flipNose?: boolean;
  /** false: keep the model's own proportions (no matching to the Kenney board's size). */
  normalise?: boolean;
}

export interface BoardDef {
  id: string;
  name: { en: string; tr: string };
  /**
   * 'kenney': the Kenney Mini Skate board, split into deck graphic, grip, edges, wheels and trucks.
   * Otherwise a GLB path under public/assets ('boards/blueskateboard3d.glb').
   */
  model: 'kenney' | string;
  /** Kenney board: the deck graphic under the board (DECK_ART id in boardart.ts). */
  deck?: string;
  /**
   * Grip tape, deck edges and wheels. On a GLB they colour the materials named 'grip', 'edge',
   * 'wheel' and 'truck' (the owner's board has 'deck', 'truck' and 'wheel').
   */
  grip?: number;
  edge?: number;
  wheel?: number;
  truck?: number;
  /** GLB: turns the hue of the deck's texture (degrees; the material named 'deck'). */
  hue?: number;
  /** Kenney board: a longer (or shorter) deck, the trucks moved with it (1 = standard). */
  length?: number;
  /** GLB: multiplies every colour of the model (0xffffff or none keeps its own materials). */
  tint?: number;
  /** GLB: the deck's wood (the black board's underside and edges, the blue board's edge). */
  wood?: number;
  /** GLB: shiny (0 … 1: Phong highlights); `metal` makes the trucks (and gold parts) metallic. */
  gloss?: number;
  metal?: boolean;
  /** GLB: the deck's wooden edge glows in this colour (emissive). */
  glow?: number;
  /** A glow trail behind the board in the air, and the colour of its grind sparks. */
  trail?: number;
  spark?: number;
  rarity: Rarity;
  unlock: Unlock;
  fit?: BoardFit;
  /** Ids of the 1.0 decks and wheels this board stands for (saved progress maps onto it). */
  legacy?: { deck?: string; wheel?: string };
  /** false: kept in the catalogue but not in the game (see KENNEY_BOARDS_ON). */
  enabled?: boolean;
}

const BLACK = 'boards/skateboard3d_black.glb', BLUE = 'boards/blueskateboard3d.glb';

/**
 * The skins, in the picker's order. The unlock ladder: Black Pro to start with, Blue Cruiser when
 * Timber Yard opens, then best session scores of 15k, 40k, 80k, 130k and 200k, one skin for a
 * park's five mixtapes, one for 10 goals, one when Skyline Roofs opens, one for every mixtape and
 * the glowing Lava Pro for all 24 goals.
 */
export const SKINS: BoardDef[] = [
  { id: 'black', name: { en: 'Black Pro', tr: 'Siyah Pro' }, model: BLACK, trail: 0xdfe6ff, spark: 0xffd23f, rarity: 'special', unlock: { kind: 'free' } },
  { id: 'blue', name: { en: 'Blue Cruiser', tr: 'Mavi Kruvazör' }, model: BLUE, trail: 0x5ac8ff, spark: 0xffb03a, rarity: 'special', unlock: { kind: 'park', park: 'yard' } },
  { id: 'arctic', name: { en: 'Arctic Pro', tr: 'Kutup Pro' }, model: BLACK, grip: 0xe9eef7, wood: 0x9fb4cc, wheel: 0x8fdcff, truck: 0xd8dee8, rarity: 'common', unlock: { kind: 'score', n: 15000 } },
  { id: 'pinkgrip', name: { en: 'Bubblegum Pro', tr: 'Sakız Pro' }, model: BLACK, grip: 0xff6fb5, wood: 0xffd0e6, wheel: 0xfff4fa, truck: 0x6a5a70, rarity: 'common', unlock: { kind: 'score', n: 15000 } },
  { id: 'crimson', name: { en: 'Crimson Cruiser', tr: 'Kızıl Kruvazör' }, model: BLUE, hue: 140, wheel: 0xf4f1ea, trail: 0xff5a4f, spark: 0xffd23f, rarity: 'rare', unlock: { kind: 'score', n: 40000 } },
  { id: 'goldrush', name: { en: 'Gold Wheels', tr: 'Altın Teker' }, model: BLACK, wheel: 0xffc93a, truck: 0xffd86a, gloss: 0.8, metal: true, spark: 0xffe27a, rarity: 'rare', unlock: { kind: 'goals', n: 10 } },
  { id: 'grape', name: { en: 'Grape Cruiser', tr: 'Üzüm Kruvazör' }, model: BLUE, hue: 62, wood: 0xe8d0ff, wheel: 0x7dffa0, truck: 0x4a3a6a, trail: 0xc08aff, rarity: 'rare', unlock: { kind: 'tapesPark' } },
  { id: 'jade', name: { en: 'Jade Cruiser', tr: 'Yeşim Kruvazör' }, model: BLUE, hue: -95, wheel: 0xff6fb5, truck: 0x3a3a44, trail: 0x5fe0b0, spark: 0x7dffa0, rarity: 'epic', unlock: { kind: 'score', n: 80000 } },
  { id: 'steel', name: { en: 'Chrome Pro', tr: 'Krom Pro' }, model: BLACK, grip: 0x1f2a3c, wood: 0x8a98ae, wheel: 0x2a2e36, truck: 0xeef3fa, gloss: 1, metal: true, trail: 0xbfd4ff, spark: 0xffffff, rarity: 'epic', unlock: { kind: 'score', n: 80000 } },
  { id: 'neonpro', name: { en: 'Neon Night', tr: 'Neon Gece' }, model: BLACK, grip: 0x24124a, wood: 0x1c3550, glow: 0x3cf0ff, wheel: 0x9dff4a, truck: 0x2a2440, gloss: 0.5, trail: 0x3cf0ff, spark: 0xff4fd8, rarity: 'epic', unlock: { kind: 'park', park: 'roofs' } },
  { id: 'ice', name: { en: 'Ice Cruiser', tr: 'Buz Kruvazör' }, model: BLUE, hue: -40, wood: 0xeaf6ff, wheel: 0xffffff, truck: 0xe6eef8, gloss: 1, metal: true, trail: 0x9fe8ff, spark: 0x9fe8ff, rarity: 'epic', unlock: { kind: 'score', n: 130000 } },
  { id: 'mixcruiser', name: { en: 'Mixtape Cruiser', tr: 'Kaset Kruvazör' }, model: BLUE, hue: 100, wood: 0x6a2058, glow: 0xff6fd8, wheel: 0xffd23f, truck: 0x2a2433, gloss: 0.5, trail: 0xff6fd8, spark: 0xff6fd8, rarity: 'epic', unlock: { kind: 'tapes', n: 15 } },
  { id: 'royalgold', name: { en: 'Royal Gold', tr: 'Kraliyet Altını' }, model: BLUE, hue: 180, wood: 0xffe9a8, wheel: 0xffc93a, truck: 0xffd86a, gloss: 1, metal: true, trail: 0xffc93a, spark: 0xffe27a, rarity: 'legendary', unlock: { kind: 'score', n: 200000 } },
  { id: 'lavapro', name: { en: 'Lava Pro', tr: 'Lav Pro' }, model: BLACK, grip: 0x221816, wood: 0x3a1a10, glow: 0xff5a1a, wheel: 0x2a2a30, truck: 0x4a3a36, gloss: 0.6, trail: 0xff6a1a, spark: 0xff6a1a, rarity: 'legendary', unlock: { kind: 'goals', n: 24 } },
];

/** The game-made boards of 1.1 (Kenney Mini Skate). Off since 1.2; true brings them back. */
export const KENNEY_BOARDS_ON = false;

// 1.1's ladder for these: the classic board free, colourways and decks at best session scores of
// 15k, 40k, 80k (130k and 200k for the last two), one board for a park's five mixtapes, one when
// Skyline Roofs opens, one for every mixtape, one for 16 goals and the glowing Lava board for all 24.
const KENNEY_BOARDS: BoardDef[] = ([
  { id: 'classic', name: { en: 'Classic', tr: 'Klasik' }, model: 'kenney', deck: 'classic', grip: 0x3c3c48, edge: 0xdb845d, wheel: 0xf4f1ea, rarity: 'common', unlock: { kind: 'free' }, legacy: { deck: 'classic', wheel: 'white' } },
  { id: 'flame', name: { en: 'Flame', tr: 'Alev' }, model: 'kenney', deck: 'flame', grip: 0x26222e, edge: 0x3a2f3a, wheel: 0xffd23f, spark: 0xff7a1a, rarity: 'common', unlock: { kind: 'score', n: 15000 }, legacy: { deck: 'flame' } },
  { id: 'mint', name: { en: 'Mint', tr: 'Nane' }, model: 'kenney', deck: 'mint', grip: 0x2f4a44, edge: 0xe8fff4, wheel: 0x5fe0b0, rarity: 'common', unlock: { kind: 'score', n: 15000 }, legacy: { wheel: 'mint' } },
  { id: 'checker', name: { en: 'Checker', tr: 'Dama' }, model: 'kenney', deck: 'checker', grip: 0x1e1e26, edge: 0xf4f1ea, wheel: 0xff5a4f, rarity: 'common', unlock: { kind: 'score', n: 15000 }, legacy: { deck: 'checker' } },
  { id: 'wave', name: { en: 'Wave', tr: 'Dalga' }, model: 'kenney', deck: 'wave', grip: 0x1f3550, edge: 0x2f7fd8, wheel: 0x9fe8ff, spark: 0x9fe8ff, rarity: 'rare', unlock: { kind: 'score', n: 40000 }, legacy: { deck: 'wave' } },
  { id: 'bubblegum', name: { en: 'Bubblegum', tr: 'Sakız' }, model: 'kenney', deck: 'bubblegum', grip: 0x4a2a44, edge: 0xffb3d9, wheel: 0xff6fb5, rarity: 'rare', unlock: { kind: 'score', n: 40000 }, legacy: { wheel: 'pink' } },
  { id: 'cassette', name: { en: 'Mixtape', tr: 'Kaset' }, model: 'kenney', deck: 'cassette', grip: 0x2a2433, edge: 0xff6fd8, wheel: 0xffd23f, trail: 0xff6fd8, rarity: 'rare', unlock: { kind: 'tapesPark' } },
  { id: 'skyline', name: { en: 'Skyline', tr: 'Şehir Silüeti' }, model: 'kenney', deck: 'skyline', grip: 0x24304a, edge: 0x5ac8ff, wheel: 0x5ac8ff, rarity: 'epic', unlock: { kind: 'score', n: 80000 }, legacy: { wheel: 'sky' } },
  { id: 'galaxy', name: { en: 'Galaxy', tr: 'Galaksi' }, model: 'kenney', deck: 'galaxy', grip: 0x1a0f3a, edge: 0x7a2fb8, wheel: 0xc08aff, trail: 0xc08aff, rarity: 'epic', unlock: { kind: 'score', n: 80000 }, legacy: { deck: 'galaxy' } },
  { id: 'neon', name: { en: 'Neon Grid', tr: 'Neon Izgara' }, model: 'kenney', deck: 'neon', grip: 0x14102a, edge: 0x3cf0ff, wheel: 0x3cf0ff, trail: 0x3cf0ff, spark: 0xff4fd8, rarity: 'epic', unlock: { kind: 'park', park: 'roofs' } },
  { id: 'nightowl', name: { en: 'Night Owl', tr: 'Gece Baykuşu' }, model: 'kenney', deck: 'nightowl', grip: 0x1c1830, edge: 0x4a3a7a, wheel: 0xa678ff, trail: 0xa678ff, rarity: 'epic', unlock: { kind: 'score', n: 130000 }, legacy: { wheel: 'violet' } },
  { id: 'sunset', name: { en: 'Sunset Longboard', tr: 'Gün Batımı Longboard' }, model: 'kenney', deck: 'sunset', length: 1.28, grip: 0x3a2a30, edge: 0xffb070, wheel: 0xffe07a, trail: 0xff9a4a, rarity: 'epic', unlock: { kind: 'tapes', n: 15 } },
  { id: 'royal', name: { en: 'Royal', tr: 'Kraliyet' }, model: 'kenney', deck: 'royal', grip: 0x2a1240, edge: 0xffc93a, wheel: 0xffc93a, trail: 0xffc93a, spark: 0xffe27a, rarity: 'legendary', unlock: { kind: 'score', n: 200000 }, legacy: { wheel: 'gold' } },
  { id: 'gold', name: { en: 'Gold', tr: 'Altın' }, model: 'kenney', deck: 'gold', grip: 0x3a3020, edge: 0xffd86a, wheel: 0xfff2a8, trail: 0xffd23f, spark: 0xffe27a, rarity: 'legendary', unlock: { kind: 'goals', n: 16 }, legacy: { deck: 'gold' } },
  { id: 'lava', name: { en: 'Lava', tr: 'Lav' }, model: 'kenney', deck: 'lava', grip: 0x2a1410, edge: 0xff5a1a, wheel: 0x2a2a30, trail: 0xff6a1a, spark: 0xff6a1a, rarity: 'legendary', unlock: { kind: 'goals', n: 24 } },
] as BoardDef[]).map((b) => ({ ...b, enabled: KENNEY_BOARDS_ON }));

/** Every board ever made, on or off (saved ids and owned boards are looked up here). */
export const ALL_BOARDS: BoardDef[] = [...SKINS, ...KENNEY_BOARDS];

/** The boards in the game: the picker's list, the unlock checks, the NEW BOARD moment. */
export const BOARDS: BoardDef[] = ALL_BOARDS.filter((b) => b.enabled !== false);

/**
 * The board new players ride, and the one a save falls back to when its board is off (a 1.1 Kenney
 * board) or unknown: the owner's black board.
 */
export const DEFAULT_BOARD = 'black';
export const FALLBACK_BOARD = DEFAULT_BOARD;
/**
 * Boards that stand in when a board's model is not there, in order. The Kenney board is built from
 * the kit and is always there: the last resort if the owner's files ever fail to load.
 */
export const FALLBACKS = ['black', 'blue', 'classic'];

/** The board of an id, on or off (unknown ids get the default board). */
export function boardDef(id: string): BoardDef {
  return ALL_BOARDS.find((b) => b.id === id) ?? ALL_BOARDS[0];
}

/** Is a board in the game (not switched off)? */
export const boardOn = (id: string): boolean => BOARDS.some((b) => b.id === id);

/** The model key a GLB board loads under (colourways of one file share it). */
export const boardModelKey = (b: BoardDef): string => 'board:' + b.model;

/** What progress opens boards (from meta.ts). */
export interface BoardProgress {
  goals: number;
  best: number;
  tapes: number;
  /** Most mixtapes found in one park. */
  tapesPark: number;
  /** Goals done in Maple Plaza and Timber Yard (each opens the next park). */
  plazaGoals: number;
  yardGoals: number;
  /** Boards a save keeps whatever the rules say (1.0 unlocks; see meta.ts). */
  owned?: readonly string[];
}

/** Goals in the park before it that open Timber Yard and Skyline Roofs (parks.ts UNLOCK_GOALS). */
export const PARK_GOALS = 3;

export function boardOpen(b: BoardDef, p: BoardProgress): boolean {
  if (p.owned?.includes(b.id)) return true;
  const [have, need] = boardProgress(b, p);
  return have >= need;
}

/** How far the player is towards a board: [have, need] (need 0 for free boards). */
export function boardProgress(b: BoardDef, p: BoardProgress): [number, number] {
  const u = b.unlock;
  switch (u.kind) {
    case 'free': return [0, 0];
    case 'park': return [Math.min(u.park === 'yard' ? p.plazaGoals : p.yardGoals, PARK_GOALS), PARK_GOALS];
    case 'goals': return [Math.min(p.goals, u.n), u.n];
    case 'score': return [Math.min(p.best, u.n), u.n];
    case 'tapes': return [Math.min(p.tapes, u.n), u.n];
    case 'tapesPark': return [Math.min(p.tapesPark, 5), 5];
  }
}

/** 1.0's rules: decks by goals done, wheels by best score (a 1.0 save keeps what they opened). */
const OLD_DECK_GOALS: Record<string, number> = { classic: 0, flame: 2, checker: 5, wave: 9, galaxy: 14, gold: 20 };
const OLD_WHEEL_SCORE: Record<string, number> = { white: 0, mint: 15000, pink: 40000, sky: 80000, violet: 130000, gold: 200000 };

/** The boards a 1.0 save had opened (its decks and wheel colours as boards). */
export function legacyOwned(goals: number, best: number): string[] {
  const out: string[] = [];
  for (const b of ALL_BOARDS) {
    const d = b.legacy?.deck, w = b.legacy?.wheel;
    if ((d && goals >= OLD_DECK_GOALS[d]) || (w && best >= OLD_WHEEL_SCORE[w])) out.push(b.id);
  }
  return out;
}

/**
 * The board of a save without one: a 1.0 save keeps its look (its deck, else its wheels, else the
 * classic board it rode); a new player gets the default board.
 */
export function legacyBoard(deck?: string, wheel?: string): string {
  if (deck === undefined && wheel === undefined) return DEFAULT_BOARD;
  if (deck && deck !== 'classic') { const b = ALL_BOARDS.find((q) => q.legacy?.deck === deck); if (b) return b.id; }
  if (wheel && wheel !== 'white') { const b = ALL_BOARDS.find((q) => q.legacy?.wheel === wheel); if (b) return b.id; }
  return 'classic';
}
