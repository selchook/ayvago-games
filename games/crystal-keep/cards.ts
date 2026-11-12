// Crystal Keep: the power cards. After every third wave and after every boss the game stops on a
// draft of three cards (four with a talent); the picked card lasts for the rest of the map.
// The rules behind each card live in sim.ts (CARD_FX); this file says which exist, how rare they
// are, how often they stack and when one is worth offering.
import { TOWER_KINDS, ENEMIES, type Sim, type CardId, type TowerKind, type PowerId } from './sim';

export type Rarity = 'common' | 'rare' | 'epic';

export interface CardDef {
  id: CardId;
  rarity: Rarity;
  /** How many times it can be picked in one map. */
  max: number;
  /** The towers it changes (they glow when it is picked); 'all' for every tower. */
  towers?: TowerKind[] | 'all';
  /** The power it improves (only offered when that power is equipped). */
  power?: PowerId;
}

export const CARDS: CardDef[] = [
  // towers
  { id: 'ballistaMastery', rarity: 'common', max: 3, towers: ['ballista'] },
  { id: 'siegeEngineer', rarity: 'common', max: 2, towers: ['cannon', 'catapult'] },
  { id: 'overclock', rarity: 'common', max: 3, towers: ['turret'] },
  { id: 'eagleEye', rarity: 'rare', max: 2, towers: 'all' },
  // economy
  { id: 'goldRush', rarity: 'common', max: 3 },
  { id: 'goldRain', rarity: 'common', max: 9 },
  { id: 'salvage', rarity: 'common', max: 1 },
  { id: 'interest', rarity: 'rare', max: 1 },
  { id: 'cheapMasonry', rarity: 'rare', max: 1 },
  // defence
  { id: 'crystalShield', rarity: 'common', max: 3 },
  { id: 'regeneration', rarity: 'common', max: 2 },
  { id: 'frostAura', rarity: 'common', max: 1 },
  { id: 'thorns', rarity: 'rare', max: 1 },
  { id: 'weakeningCurse', rarity: 'rare', max: 1 },
  // powers
  { id: 'quickRecharge', rarity: 'rare', max: 2 },
  { id: 'deepFreeze', rarity: 'rare', max: 1, power: 'frost' },
  { id: 'overcharge', rarity: 'rare', max: 1, power: 'lightning' },
  { id: 'veterans', rarity: 'rare', max: 1, power: 'knights' },
  { id: 'goldenTouch', rarity: 'rare', max: 1 },
  { id: 'meteorStorm', rarity: 'epic', max: 1, power: 'meteor' },
  { id: 'chainReaction', rarity: 'epic', max: 1 },
  { id: 'criticalStrikes', rarity: 'epic', max: 2, towers: 'all' },
  { id: 'armourPiercer', rarity: 'epic', max: 1, towers: ['ballista', 'turret'] },
];

export const CARD: Record<CardId, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

/** Frame and glow colours per rarity. */
export const RARITY_COLOR: Record<Rarity, { frame: number; glow: number; text: string; dark: number }> = {
  common: { frame: 0xc9d4ea, glow: 0x9fb0d8, text: '#d8e2f6', dark: 0x22304a },
  rare: { frame: 0x4fb2ff, glow: 0x2f8cff, text: '#8fd0ff', dark: 0x163a66 },
  epic: { frame: 0xd27bff, glow: 0xb04cff, text: '#e3a8ff', dark: 0x3c1660 },
};

/** Draft odds per rarity, and with the Fortune talent. */
const WEIGHTS: Record<Rarity, [number, number]> = { common: [62, 54], rare: [29, 34], epic: [9, 12] };

/** True when a card would change something now or later in this map (no dead picks). */
export function useful(sim: Sim, id: CardId): boolean {
  const def = CARD[id];
  if (sim.stacks(id) >= def.max) return false;
  if (def.power && !sim.powers.includes(def.power)) return false;
  const has = (k: TowerKind) => sim.towers.some((t) => t.kind === k);
  const ahead = sim.kindsAhead();
  const left = sim.totalWaves - sim.wave;
  switch (id) {
    case 'ballistaMastery': return has('ballista');
    case 'siegeEngineer': return has('cannon') || has('catapult');
    case 'overclock': return has('turret');
    case 'armourPiercer': return (has('ballista') || has('turret')) && [...ahead].some((k) => ENEMIES[k].armor > 0);
    case 'eagleEye': case 'criticalStrikes': return sim.towers.length > 0;
    case 'salvage': return sim.towers.length > 0;
    case 'weakeningCurse': return [...ahead].some((k) => ENEMIES[k].armor > 0);
    case 'goldenTouch': return [...ahead].some((k) => ENEMIES[k].boss) && sim.wave < sim.totalWaves;
    case 'regeneration': return left >= 3;
    case 'interest': case 'cheapMasonry': case 'goldRush': return left >= 2;
    case 'quickRecharge': return sim.powers.length > 0;
    default: return true;
  }
}

/** `n` different cards for a draft, by rarity odds, never one that would do nothing. */
export function rollDraft(sim: Sim, n = sim.talents.draftN, rnd: () => number = Math.random): CardId[] {
  const pool = CARDS.filter((c) => useful(sim, c.id));
  const out: CardId[] = [];
  const luck = sim.talents.luck ? 1 : 0;
  while (out.length < n && pool.length) {
    // pick a rarity first (one that is still in the pool), then a card of it
    const rarities = (['common', 'rare', 'epic'] as Rarity[]).filter((r) => pool.some((c) => c.rarity === r));
    const total = rarities.reduce((s, r) => s + WEIGHTS[r][luck], 0);
    let x = rnd() * total;
    let rar = rarities[0];
    for (const r of rarities) { x -= WEIGHTS[r][luck]; if (x <= 0) { rar = r; break; } }
    const of = pool.filter((c) => c.rarity === rar);
    const c = of[Math.floor(rnd() * of.length)];
    out.push(c.id);
    pool.splice(pool.indexOf(c), 1);
  }
  return out;
}

/** The towers that glow when a card is picked. */
export function glowTowers(sim: Sim, id: CardId): number[] {
  const t = CARD[id].towers;
  if (!t) return [];
  return sim.towers.filter((tw) => t === 'all' || t.includes(tw.kind)).map((tw) => tw.id);
}

export { TOWER_KINDS };
