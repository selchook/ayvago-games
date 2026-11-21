// Street Heat: what the player keeps between runs (this browser): cash in the bank, cars owned,
// the garage's upgrades and paint, each story mission's stars, the quick modes' bests, the chosen
// job and camera.
import { storage } from '@core';
import type { CarId, Upgrades } from './defs';
import type { Mode } from './jobs';

export interface Meta {
  cash: number;
  cars: CarId[];
  car: CarId;
  paint: number;
  up: Upgrades;
  /** Stars per story mission id (0 = not done). */
  stars: Record<number, number>;
  best: { roam: number; getaway: number; rush: number };
  /** The job PLAY starts again (RETRY): mode and mission. */
  mode: Mode;
  mission: number;
  cam: 'chase' | 'far' | 'bumper';
  seenIntro: boolean;
}

const KEY = 'street-heat:meta';

export function loadMeta(): Meta {
  const fresh: Meta = { cash: 0, cars: ['sedan'], car: 'sedan', paint: 0xd8342a, up: { engine: 0, grip: 0, armour: 0, nitro: 0 }, stars: {}, best: { roam: 0, getaway: 0, rush: 0 }, mode: 'story', mission: 1, cam: 'chase', seenIntro: false };
  const raw = storage.get<Partial<Meta> | null>(KEY, null);
  if (!raw) return fresh;
  return { ...fresh, ...raw, up: { ...fresh.up, ...raw.up }, best: { ...fresh.best, ...raw.best }, stars: { ...raw.stars } };
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }

/** Story missions done (the next one opens). */
export const missionsDone = (m: Meta): number => Object.values(m.stars).filter((s) => s > 0).length;
export const unlocked = (m: Meta, id: number): boolean => id === 1 || (m.stars[id - 1] ?? 0) > 0;
