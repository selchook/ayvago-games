// Kickflip Park: goal lines and numbers as the player reads them (the HUD, the summary and the
// setup screen share them).
import { t, getLang } from '@core';
import type { GoalDef } from './parks';
import type { Mode } from './defs';

/** Numbers with thousands separators (TR: 12.345, EN: 12,345). */
export const fmt = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, getLang() === 'tr' ? '.' : ',');

/** A decimal number in the language's style (TR: 2,5 · EN: 2.5). */
export const dec = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', getLang() === 'tr' ? ',' : '.');

/** A goal's line of text (score goals scale in Easy). */
export function goalText(g: GoalDef, need: number): string {
  switch (g.kind) {
    case 'score': return t('goal_score', { n: fmt(need) });
    case 'combo': return t('goal_combo', { n: fmt(need) });
    case 'tapes': return t('goal_tapes');
    case 'rail': return t('goal_rail_' + g.tag, { n: dec(need) });
    case 'gap': return t('goal_gap_' + g.tag);
    case 'manual': return t('goal_manual', { n: dec(need) });
    case 'vert': return t('goal_vert', { n: dec(need) });
    case 'spin': return t('goal_spin', { n: need });
    case 'rails': return t('goal_rails', { n: need });
    case 'special': return t('goal_special');
  }
}

export function goalNeed(g: GoalDef, mode: Mode): number {
  const scale = mode === 'easy' ? 0.7 : 1;
  return g.kind === 'score' || g.kind === 'combo' ? Math.round(g.n * scale / 500) * 500 : g.n;
}
