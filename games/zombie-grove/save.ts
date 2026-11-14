// Zombie Grove: the camp's purse and upgrades in the core storage (rules in meta.ts).
import { storage } from '@core';
import { cleanMeta, type Meta } from './meta';

const KEY = 'zombie-grove:meta';

export function loadMeta(): Meta {
  return cleanMeta(storage.get<Partial<Meta>>(KEY, {}));
}

export function saveMeta(m: Meta): void { storage.set(KEY, m); }
