// Neon Ronin: the two kinds of progression (new-game skill §7g).
//   - Cyberware: six persistent upgrade tracks bought with gears at the ripperdoc between levels,
//     three ranks each; ranks change behaviour, not only numbers (Katana II dashes the finisher,
//     Katana III throws a neon wave, Blaster II twin bolts, Blaster III piercing, Boots II the
//     air-dash, Armour III a shield ...).
//   - Implant chips (power cards): a level's first checkpoint earns one, banked without stopping
//     play; it is picked (1 of 3, common to legendary, one reroll) on the results screen or, at the
//     player's choice, from the pause. A boss gives one more on the district card. They last for
//     the district run.
//   - The blade moves (MOVES): some from the start, others unlocked by level clears, bosses and the
//     Katana / Blaster ranks.
// Pure data and rules: no Phaser.

export type UpgradeId = 'sword' | 'gun' | 'boots' | 'armor' | 'magnet' | 'heat';
export const UPGRADE_IDS: UpgradeId[] = ['sword', 'gun', 'boots', 'armor', 'magnet', 'heat'];
export const MAX_RANK = 3;
export type Ranks = Record<UpgradeId, number>;
export const noRanks = (): Ranks => ({ sword: 0, gun: 0, boots: 0, armor: 0, magnet: 0, heat: 0 });

export const UPGRADE: Record<UpgradeId, { icon: string; price: number[]; color: number }> = {
  sword: { icon: 'katana', price: [60, 160, 320], color: 0x3ff0ff },
  gun: { icon: 'blaster', price: [60, 160, 320], color: 0xff3fa8 },
  boots: { icon: 'boots', price: [80, 200, 360], color: 0xffe040 },
  armor: { icon: 'armor', price: [90, 220, 380], color: 0x7cff6a },
  magnet: { icon: 'magnet', price: [40, 110, 240], color: 0xff9a3c },
  heat: { icon: 'heat', price: [50, 140, 280], color: 0x8a7aff },
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, { frame: number; glow: number; css: string }> = {
  common: { frame: 0x9aa8c0, glow: 0x5a6a88, css: '#c6d2e6' },
  rare: { frame: 0x3ff0ff, glow: 0x1a8aaa, css: '#5ff4ff' },
  epic: { frame: 0xc04bff, glow: 0x7a1ab0, css: '#d98bff' },
  legendary: { frame: 0xffd23f, glow: 0xc07a10, css: '#ffe27a' },
};
const WEIGHT: Record<Rarity, number> = { common: 56, rare: 28, epic: 12, legendary: 4 };

export type CardId =
  | 'overclock' | 'hotRounds' | 'chainEdge' | 'ricochet' | 'voltBlade' | 'glassCannon' | 'executioner' | 'kitsune'
  | 'nanoWeave' | 'ghostStep' | 'reflex' | 'vampire' | 'secondHeart' | 'gravAnchor'
  | 'springCoils' | 'tripleJump' | 'afterburner'
  | 'cryo' | 'ventBurst' | 'twinBarrel'
  | 'magnetCard' | 'luckyLoot' | 'bounty' | 'neonStreak' | 'momentum';

export interface CardDef { id: CardId; rarity: Rarity; icon: string; group: 'offence' | 'defence' | 'move' | 'gun' | 'economy' }

export const CARDS: CardDef[] = [
  { id: 'overclock', rarity: 'common', icon: 'katana', group: 'offence' },
  { id: 'hotRounds', rarity: 'common', icon: 'blaster', group: 'gun' },
  { id: 'chainEdge', rarity: 'rare', icon: 'slash', group: 'offence' },
  { id: 'ricochet', rarity: 'rare', icon: 'bounce', group: 'gun' },
  { id: 'voltBlade', rarity: 'epic', icon: 'bolt', group: 'offence' },
  { id: 'glassCannon', rarity: 'epic', icon: 'skull', group: 'offence' },
  { id: 'executioner', rarity: 'rare', icon: 'target', group: 'offence' },
  { id: 'kitsune', rarity: 'legendary', icon: 'fox', group: 'gun' },
  { id: 'nanoWeave', rarity: 'common', icon: 'armor', group: 'defence' },
  { id: 'ghostStep', rarity: 'common', icon: 'ghost', group: 'defence' },
  { id: 'reflex', rarity: 'rare', icon: 'shield', group: 'defence' },
  { id: 'vampire', rarity: 'rare', icon: 'fang', group: 'defence' },
  { id: 'secondHeart', rarity: 'legendary', icon: 'heart', group: 'defence' },
  { id: 'gravAnchor', rarity: 'common', icon: 'anchor', group: 'defence' },
  { id: 'springCoils', rarity: 'common', icon: 'spring', group: 'move' },
  { id: 'tripleJump', rarity: 'epic', icon: 'wings', group: 'move' },
  { id: 'afterburner', rarity: 'rare', icon: 'boots', group: 'move' },
  { id: 'cryo', rarity: 'common', icon: 'snow', group: 'gun' },
  { id: 'ventBurst', rarity: 'rare', icon: 'heat', group: 'gun' },
  { id: 'twinBarrel', rarity: 'epic', icon: 'twin', group: 'gun' },
  { id: 'magnetCard', rarity: 'common', icon: 'magnet', group: 'economy' },
  { id: 'luckyLoot', rarity: 'rare', icon: 'box', group: 'economy' },
  { id: 'bounty', rarity: 'rare', icon: 'gear', group: 'economy' },
  { id: 'neonStreak', rarity: 'epic', icon: 'streak', group: 'economy' },
  { id: 'momentum', rarity: 'epic', icon: 'clock', group: 'offence' },
];
export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

/** Three different cards the run does not hold yet, weighted by rarity. */
export function rollCards(have: CardId[], rnd: () => number): CardId[] {
  const pool = CARDS.filter((c) => !have.includes(c.id));
  const out: CardId[] = [];
  while (out.length < 3 && pool.length) {
    const total = pool.reduce((s, c) => s + WEIGHT[c.rarity], 0);
    let r = rnd() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= WEIGHT[pool[i].rarity]; if (r <= 0) break; }
    out.push(pool[i].id);
    pool.splice(i, 1);
  }
  return out;
}

/** Abilities unlocked by the campaign (shown on the results card the first time). */
export type AbilityId = 'wall' | 'rise' | 'cleave' | 'iaido' | 'slam';
export const ABILITY_IDS: AbilityId[] = ['wall', 'rise', 'cleave', 'iaido', 'slam'];
/** The level (index into LEVELS) whose clear unlocks each ability. */
export const ABILITY_AT: Record<AbilityId, number> = { wall: 1, rise: 2, cleave: 3, iaido: 5, slam: 7 };

/** The blade moves, in the order the Moves screen lists them. */
export type MoveId = 'neonCut' | 'cyclone' | 'lunge' | 'sky' | 'dive' | 'rise' | 'cleave' | 'iaido' | 'slam' | 'mirror' | 'burst';
export type MoveUnlock = { kind: 'start' } | { kind: 'ability'; id: AbilityId } | { kind: 'rank'; track: 'sword' | 'gun'; rank: number };
export interface MoveDef { id: MoveId; icon: string; name: string; unlock: MoveUnlock }
export const MOVES: MoveDef[] = [
  { id: 'neonCut', icon: 'slash', name: 'fNeonCut', unlock: { kind: 'start' } },
  { id: 'cyclone', icon: 'spin', name: 'fCyclone', unlock: { kind: 'start' } },
  { id: 'lunge', icon: 'roll', name: 'fLunge', unlock: { kind: 'start' } },
  { id: 'sky', icon: 'sky', name: 'fSky', unlock: { kind: 'start' } },
  { id: 'dive', icon: 'dive', name: 'fDive', unlock: { kind: 'start' } },
  { id: 'rise', icon: 'rise', name: 'fRise', unlock: { kind: 'ability', id: 'rise' } },
  { id: 'cleave', icon: 'cleave', name: 'fCleave', unlock: { kind: 'ability', id: 'cleave' } },
  { id: 'iaido', icon: 'iaido', name: 'fIaido', unlock: { kind: 'ability', id: 'iaido' } },
  { id: 'slam', icon: 'slam', name: 'fSlam', unlock: { kind: 'ability', id: 'slam' } },
  { id: 'mirror', icon: 'mirror', name: 'fMirror', unlock: { kind: 'rank', track: 'sword', rank: 1 } },
  { id: 'burst', icon: 'burst', name: 'fBurst', unlock: { kind: 'rank', track: 'gun', rank: 1 } },
];
export const MOVE_IDS = MOVES.map((m) => m.id);

/** Is a move open with these abilities and cyberware ranks? */
export function moveOpen(id: MoveId, abilities: AbilityId[], ranks: Ranks): boolean {
  const u = MOVES.find((m) => m.id === id)!.unlock;
  if (u.kind === 'start') return true;
  if (u.kind === 'ability') return abilities.includes(u.id);
  return ranks[u.track] >= u.rank;
}
