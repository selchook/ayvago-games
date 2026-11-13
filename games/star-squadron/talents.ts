// Star Squadron: the talent board's rules (pure, so the balance run can use them). Every run earns
// Stardust; the board spends it on lasting upgrades in three columns of four, each node needing
// the one above it. Saving and loading is in meta.ts.
import { NO_TALENTS, type TalentFx } from './cards';

export type TalentId =
  | 'plating' | 'shields' | 'salvage' | 'phoenix'
  | 'calibration' | 'loader' | 'wingman' | 'optics'
  | 'capacitor' | 'reroll' | 'luck' | 'wide';

export interface TalentDef {
  id: TalentId;
  cost: number;
  req?: TalentId;
  /** Column (0 hull, 1 weapons, 2 tactics) and row. */
  col: number;
  row: number;
  /** Icon colour. */
  hue: number;
}

export const TALENTS: TalentDef[] = [
  { id: 'plating', cost: 6, col: 0, row: 0, hue: 0x9fe870 },
  { id: 'shields', cost: 9, req: 'plating', col: 0, row: 1, hue: 0x5ad1ff },
  { id: 'salvage', cost: 14, req: 'shields', col: 0, row: 2, hue: 0xffd23f },
  { id: 'phoenix', cost: 20, req: 'salvage', col: 0, row: 3, hue: 0xff6a4d },
  { id: 'calibration', cost: 6, col: 1, row: 0, hue: 0xff8a3d },
  { id: 'loader', cost: 9, req: 'calibration', col: 1, row: 1, hue: 0xffd23f },
  { id: 'wingman', cost: 14, req: 'loader', col: 1, row: 2, hue: 0x5affd1 },
  { id: 'optics', cost: 20, req: 'wingman', col: 1, row: 3, hue: 0xff4fa3 },
  { id: 'capacitor', cost: 6, col: 2, row: 0, hue: 0x7aa8ff },
  { id: 'reroll', cost: 9, req: 'capacitor', col: 2, row: 1, hue: 0xc9d4ea },
  { id: 'luck', cost: 14, req: 'reroll', col: 2, row: 2, hue: 0xd27bff },
  { id: 'wide', cost: 20, req: 'luck', col: 2, row: 3, hue: 0xffd23f },
];

export const TALENT: Record<TalentId, TalentDef> = Object.fromEntries(TALENTS.map((t) => [t.id, t])) as Record<TalentId, TalentDef>;
export const TALENT_TOTAL = TALENTS.reduce((s, t) => s + t.cost, 0);
export const ALL_TALENTS: TalentId[] = TALENTS.map((t) => t.id);

/** What the owned talents do in a run. */
export function talentFx(owned: readonly TalentId[]): TalentFx {
  const has = (id: TalentId) => owned.includes(id);
  return {
    ...NO_TALENTS,
    hull: has('plating') ? 15 : 0,
    shield: has('shields') ? 20 : 0,
    creditK: has('salvage') ? 1.3 : 1,
    phoenix: has('phoenix') ? 1 : 0,
    damageK: has('calibration') ? 1.1 : 1,
    fireK: has('loader') ? 1.1 : 1,
    drones: has('wingman') ? 1 : 0,
    crit: has('optics') ? 0.08 : 0,
    cdK: has('capacitor') ? 0.88 : 1,
    freeRerolls: has('reroll') ? 1 : 0,
    luck: has('luck'),
    draftN: has('wide') ? 4 : 3,
  };
}

/**
 * Stardust for a run: one for flying, one per wave cleared, three per boss, one per 80 credits
 * picked up; Easy runs earn half (rounded up).
 */
export function stardustFor(waves: number, bosses: number, credits: number, easy: boolean): number {
  const base = 1 + waves + 3 * bosses + Math.floor(credits / 80);
  return easy ? Math.ceil(base / 2) : base;
}
