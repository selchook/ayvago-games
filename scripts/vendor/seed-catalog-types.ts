// The SeedGame / CatalogStatus types from selchook/ayvago packages/shared/src/seed-catalog.ts.
import type { GameManifestInput } from './manifest';

export type CatalogStatus = 'live' | 'coming_soon';

export type SeedGame = {
  slug: string;
  repo: string;
  status: CatalogStatus;
  addedAt: string;
  featured?: boolean;
  generatedCover?: boolean;
  manifest: GameManifestInput;
};
