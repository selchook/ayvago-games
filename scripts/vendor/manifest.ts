// Vendored verbatim from selchook/ayvago packages/shared/src (do not edit; re-copy on schema changes).
import { z } from 'zod';
import { GAME_CATEGORIES } from './categories';
import type { Locale } from './locales';

// Schema for ayvago.json, the manifest every game serves from its own origin.
// The import CLI, the admin panel and (later) developer submissions all validate against it.

// Game-provided text per platform locale. English is required (it is the fallback locale);
// other supported locales are optional and fall back to English when missing.
const localizedText = z.strictObject({
  en: z.string().trim().min(1),
  tr: z.string().trim().min(1).optional(),
});

// Placement ids such as "continue" or "double_reward"; reported in ad analytics.
const placementId = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/, 'placement must be snake_case');

// Assets may be absolute https URLs or paths relative to the game's origin ("/ayvago/icon-512.png").
const assetRef = z
  .string()
  .refine(
    (value) => value.startsWith('/') || isAllowedUrl(value),
    'asset must be a path or https URL',
  );

function isAllowedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  // Plain http is only acceptable for local development builds.
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

export const scoringSchema = z
  .strictObject({
    metric: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
    order: z.enum(['asc', 'desc']),
    format: z.enum(['number', 'time']),
    label: localizedText,
    // When true the leaderboard sums results (e.g. total wins) instead of keeping the best one.
    accumulate: z.boolean().default(false),
    // Anti-cheat limits checked by the finishSession function; calibrated during internal testing.
    minDurationMs: z.number().int().nonnegative(),
    maxPerSecond: z.number().positive(),
    maxScore: z.number().positive(),
  })
  .refine((s) => !(s.accumulate && s.format === 'time'), {
    message: 'time-based scores cannot accumulate',
    path: ['accumulate'],
  });

export const gameManifestSchema = z
  .strictObject({
    $schema: z.string().optional(),
    // Lowercase alphanumeric, no hyphens: also used as the Firestore document id.
    id: z.string().regex(/^[a-z0-9]{3,32}$/, 'id must be 3-32 lowercase letters or digits'),
    title: localizedText,
    description: localizedText,
    category: z.enum(GAME_CATEGORIES),
    tags: z
      .array(z.string().regex(/^[a-z0-9-]{2,24}$/))
      .max(10)
      .default([]),
    entry: z.string().refine(isAllowedUrl, 'entry must be an https URL'),
    orientation: z.enum(['portrait', 'landscape', 'any']),
    input: z.array(z.enum(['touch', 'mouse', 'keyboard', 'gamepad', 'gyroscope'])).min(1),
    players: z.strictObject({
      min: z.number().int().min(1),
      max: z.number().int().max(8),
    }),
    scoring: scoringSchema,
    ads: z
      .strictObject({
        rewarded: z.array(placementId).default([]),
        interstitial: z.array(placementId).default([]),
      })
      .default({ rewarded: [], interstitial: [] }),
    ageRating: z.enum(['3+', '7+', '12+', '16+', '18+']),
    sdkVersion: z.literal(2),
    assets: z.strictObject({
      icon: assetRef,
      cover: assetRef,
      preview: assetRef.optional(),
    }),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
    // Enables ?ayvagoTest=... hooks used by the automated harness; ignored in production.
    testHooks: z.boolean().default(false),
  })
  .refine((m) => m.players.max >= m.players.min, {
    message: 'players.max must be >= players.min',
    path: ['players', 'max'],
  });

export type LocalizedText = z.infer<typeof localizedText>;
export type GameManifest = z.infer<typeof gameManifestSchema>;
export type GameManifestInput = z.input<typeof gameManifestSchema>;

export type ManifestResult =
  { ok: true; manifest: GameManifest } | { ok: false; issues: { path: string; message: string }[] };

export function parseGameManifest(input: unknown): ManifestResult {
  const result = gameManifestSchema.safeParse(input);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    })),
  };
}

// Resolves an asset reference from the manifest against the game's entry URL.
export function resolveAssetUrl(manifest: Pick<GameManifest, 'entry'>, ref: string): string {
  return new URL(ref, manifest.entry).toString();
}

// Picks the text for a locale, falling back to English.
export function pickLocalized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en;
}
