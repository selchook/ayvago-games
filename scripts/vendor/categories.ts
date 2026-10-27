// Vendored verbatim from selchook/ayvago packages/shared/src (do not edit; re-copy on schema changes).
// Catalog categories. Keys are stored in Firestore (games/{id}.category);
// display labels live in the web app's message files under "categories.<key>".
export const GAME_CATEGORIES = ['retro_action', 'casual', 'puzzle', 'board'] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number];

// URL segments for category pages (/en/c/retro-action).
export function categorySlug(category: GameCategory): string {
  return category.replace(/_/g, '-');
}

export function categoryFromSlug(slug: string): GameCategory | null {
  const key = slug.replace(/-/g, '_');
  return (GAME_CATEGORIES as readonly string[]).includes(key) ? (key as GameCategory) : null;
}
