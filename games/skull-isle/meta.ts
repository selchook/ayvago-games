// Skull Isle: what lasts between runs, in the core storage. Doubloons (earned by every run) buy the
// nodes of the treasure map (upgrades.ts NODES) and Captain Barbarossa; the chosen hero, the
// tutorial and the first-run hints are remembered too.
import { storage } from '@core';
import { HERO_IDS, type HeroId } from './defs';
import { NODE, ALL_NODES, BARBAROSSA_COST, type NodeId } from './upgrades';

const KEY = 'skull-isle:meta';

export interface Meta {
  doubloons: number;
  nodes: NodeId[];
  heroes: HeroId[];
  hero: HeroId;
  runs: number;
  /** Most islands cleared in one run. */
  bestIslands: number;
  krakenDown: boolean;
  tutorial: boolean;
  hints: string[];
}

/** The four heroes everyone starts with; Barbarossa is unlocked later. */
export const STARTERS: HeroId[] = ['anne', 'henry', 'mako', 'sharky'];

export function cleanMeta(m: Partial<Meta>): Meta {
  const heroes = [...new Set([...STARTERS, ...(m.heroes ?? []).filter((h) => HERO_IDS.includes(h))])];
  const hero = m.hero && heroes.includes(m.hero) ? m.hero : 'anne';
  return {
    doubloons: Math.max(0, Math.floor(Number(m.doubloons) || 0)),
    nodes: [...new Set((m.nodes ?? []).filter((n) => ALL_NODES.includes(n)))],
    heroes,
    hero,
    runs: Math.max(0, Number(m.runs) || 0),
    bestIslands: Math.max(0, Number(m.bestIslands) || 0),
    krakenDown: !!m.krakenDown,
    tutorial: !!m.tutorial,
    hints: Array.isArray(m.hints) ? m.hints.filter((h) => typeof h === 'string') : [],
  };
}

export function loadMeta(): Meta { return cleanMeta(storage.get<Partial<Meta>>(KEY, {})); }
export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** 'owned', 'open' (affordable), 'poor' (not enough doubloons) or 'locked' (needs the node above). */
export function nodeState(m: Meta, id: NodeId): 'owned' | 'open' | 'poor' | 'locked' {
  if (m.nodes.includes(id)) return 'owned';
  const req = NODE[id].req;
  if (req && !m.nodes.includes(req)) return 'locked';
  return m.doubloons >= NODE[id].cost ? 'open' : 'poor';
}

export function buyNode(m: Meta, id: NodeId): boolean {
  if (nodeState(m, id) !== 'open') return false;
  m.doubloons -= NODE[id].cost;
  m.nodes.push(id);
  return true;
}

export function buyBarbarossa(m: Meta): boolean {
  if (m.heroes.includes('barbarossa') || m.doubloons < BARBAROSSA_COST) return false;
  m.doubloons -= BARBAROSSA_COST;
  m.heroes.push('barbarossa');
  return true;
}

/** Banks a finished run: Doubloons, the record, the Kraken (which frees Barbarossa). */
export function bankRun(m: Meta, o: { doubloons: number; islands: number; kraken: boolean }): { freedBarbarossa: boolean } {
  m.doubloons += o.doubloons;
  m.runs++;
  m.bestIslands = Math.max(m.bestIslands, o.islands);
  let freed = false;
  if (o.kraken) {
    m.krakenDown = true;
    if (!m.heroes.includes('barbarossa')) { m.heroes.push('barbarossa'); freed = true; }
  }
  return { freedBarbarossa: freed };
}
