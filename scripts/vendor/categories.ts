// Vendored verbatim from selchook/ayvago packages/shared/src (do not edit; re-copy on schema changes).
// Catalog categories: the same genres as the Ayvago Arcade games (selchook/ayvago-games
// game.json "genres"), in the same order. A game is listed under every category it has
// (manifest "categories"); its primary "category" picks the icon and the breadcrumb.
// Display labels live in the web app's message files under "categories.<key>".
export const GAME_CATEGORIES = [
  'arcade',
  'action',
  'casual',
  'puzzle',
  'retro',
  'sports',
  'strategy',
  'card',
  'word',
] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

// URL segments for category pages (/en/c/arcade).
export function categorySlug(category: GameCategory): string {
  return category.replace(/_/g, '-');
}

export function categoryFromSlug(slug: string): GameCategory | null {
  const key = slug.replace(/-/g, '_');
  return (GAME_CATEGORIES as readonly string[]).includes(key) ? (key as GameCategory) : null;
}
