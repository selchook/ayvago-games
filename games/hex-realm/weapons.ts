// Hex Realm 1.2: the weapons (Quaternius "Medieval Weapons", CC0; public/assets/quaternius/
// medieval-weapons/weapons.glb, made by import-weapons.mjs). Pure data, shared by the simulation,
// the campaign and the views:
//   - every class has a family of weapon models by rarity (a weapon item shows its model in the
//     hero's hand, on the ground when it drops and as its icon); the monk fights with wraps and the
//     wizard with the staff it is modelled with;
//   - a weapon's kind changes how the combos feel: light (quick, a little weaker), balanced, heavy
//     (slow and hard, wider, a heavier hit-stop, every finisher breaks shields) and reach (longer);
//   - the warrior's off hand carries a shield that follows the armour's rarity;
//   - foes carry fitting weapons (bandits hatchets, knights heater shields, the brute a warhammer,
//     Lord Varek a claymore).
import type { ClassId, FoeKind, Rarity } from './defs';
import { RARITIES } from './defs';

export const WEAPON_MODELS = [
  'Sword', 'Sword_2', 'Sword_Big', 'Sword_Golden', 'Claymore', 'Axe', 'Axe_Small', 'Axe_Double', 'Hammer_Small', 'Hammer_Double',
  'Dagger', 'Dagger_2', 'Spear', 'Scythe', 'Bow_Wooden', 'Bow_Wooden2', 'Bow_Evil', 'Bow_Golden',
  'Shield_Round', 'Shield_Round_2', 'Shield_Heater', 'Shield_Heater_2', 'Shield_Celtic_Golden', 'Arrow',
] as const;
export type WeaponModel = (typeof WEAPON_MODELS)[number];

/** How a weapon fights: 'plain' (bows, staves, wraps) changes nothing. */
export type WeaponType = 'plain' | 'balanced' | 'light' | 'heavy' | 'reach';
export const WEAPON_TYPES: Exclude<WeaponType, 'plain'>[] = ['balanced', 'light', 'heavy', 'reach'];

export interface WeaponFeel {
  /** Attack speed, damage, the melee blows' reach and their cone. */
  speed: number;
  dmg: number;
  reach: number;
  arc: number;
  /** Every combo finisher breaks shields and guards. */
  breaks: boolean;
  /** Hit-stop on melee hits (×). */
  stop: number;
}

export const WEAPON_FEEL: Record<WeaponType, WeaponFeel> = {
  plain: { speed: 1, dmg: 1, reach: 1, arc: 1, breaks: false, stop: 1 },
  balanced: { speed: 1, dmg: 1.02, reach: 1, arc: 1, breaks: false, stop: 1 },
  light: { speed: 1.13, dmg: 0.92, reach: 0.95, arc: 1, breaks: false, stop: 0.8 },
  heavy: { speed: 0.86, dmg: 1.18, reach: 1.08, arc: 1.15, breaks: true, stop: 1.7 },
  reach: { speed: 0.96, dmg: 1.02, reach: 1.28, arc: 0.85, breaks: false, stop: 1 },
};

export interface WeaponVariant {
  /** The model in hand (null: the class's own, welded into the hero). */
  model: WeaponModel | null;
  type: WeaponType;
  /** The item's noun (i18n key). */
  noun: string;
  /** The rarity tier it first appears at (0 common … 4 legendary). */
  tier: number;
}

const V = (model: WeaponModel | null, type: WeaponType, noun: string, tier: number): WeaponVariant => ({ model, type, noun, tier });

/** Each class's weapons by rarity. */
export const FAMILY: Record<ClassId, WeaponVariant[]> = {
  warrior: [
    V('Sword', 'balanced', 'w_sword', 0), V('Axe', 'balanced', 'w_axe', 1), V('Sword_2', 'balanced', 'w_sword', 1), V('Spear', 'reach', 'w_spear', 2),
    V('Sword_Big', 'heavy', 'w_broadsword', 2), V('Axe_Double', 'heavy', 'w_greataxe', 3), V('Claymore', 'heavy', 'w_claymore', 3), V('Sword_Golden', 'balanced', 'w_sword', 4),
  ],
  rogue: [V('Dagger', 'light', 'w_rogue', 0), V('Axe_Small', 'light', 'w_hatchet', 1), V('Dagger_2', 'light', 'w_rogue', 2)],
  ranger: [V('Bow_Wooden', 'plain', 'w_ranger', 0), V('Bow_Wooden2', 'plain', 'w_ranger', 1), V('Bow_Evil', 'plain', 'w_ranger', 3), V('Bow_Golden', 'plain', 'w_ranger', 4)],
  monk: [V(null, 'plain', 'w_monk', 0)],
  cleric: [V(null, 'plain', 'w_cleric', 0), V('Hammer_Small', 'balanced', 'w_mace', 1), V('Spear', 'reach', 'w_spear', 2), V('Hammer_Double', 'heavy', 'w_warhammer', 3), V('Scythe', 'reach', 'w_scythe', 4)],
  wizard: [V(null, 'plain', 'w_wizard', 0)],
};

/** Every item noun the game can show (prebaked with every tier). */
export const ITEM_NOUNS = [...new Set(Object.values(FAMILY).flatMap((f) => f.map((v) => v.noun))), 'i_armor', 'i_ring', 'i_amulet', 'i_charm'];

/**
 * The weapon an item is for this class: one of the variants of its rarity's tier (or the tier
 * below), picked by the item's id, so the same item always shows the same weapon (old saves too).
 */
export function weaponOf(it: { id: number; rarity: Rarity }, cls: ClassId): WeaponVariant {
  const r = RARITIES.indexOf(it.rarity);
  const fam = FAMILY[cls];
  let opts = fam.filter((v) => v.tier <= r && v.tier >= r - 1);
  if (!opts.length) { const top = Math.max(...fam.filter((v) => v.tier <= r).map((v) => v.tier)); opts = fam.filter((v) => v.tier === top); }
  const h = Math.imul(it.id ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  return opts[h % opts.length];
}

/** The warrior's shield by the armour's rarity. */
export const SHIELD_BY_RARITY: Record<Rarity, WeaponModel> = {
  common: 'Shield_Round', uncommon: 'Shield_Round_2', rare: 'Shield_Heater', epic: 'Shield_Heater_2', legendary: 'Shield_Celtic_Golden',
};

/** What foes carry instead of their model's own weapon (hand) and in the off hand (shield). */
export const FOE_GEAR: Partial<Record<FoeKind, { hand?: WeaponModel; shield?: WeaponModel }>> = {
  bandit: { hand: 'Axe_Small' }, chief: { hand: 'Axe' }, archer: { hand: 'Bow_Wooden2' }, captain: { hand: 'Bow_Evil' },
  brute: { hand: 'Hammer_Double' }, troll: { hand: 'Hammer_Double' }, acolyte: { hand: 'Hammer_Small' }, cultist: { hand: 'Scythe' },
  knight: { hand: 'Sword_2', shield: 'Shield_Heater' }, lord: { hand: 'Claymore' },
};

/** The icon texture of a weapon model (public/assets/quaternius/medieval-weapons/icons). */
export const weaponIcon = (m: WeaponModel): string => 'hr-wp-' + m;
