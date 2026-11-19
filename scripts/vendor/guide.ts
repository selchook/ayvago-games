import { z } from 'zod';

// A game guide: the long-form, server-rendered text of a game page (about, how to play,
// controls, tips, features, FAQ). Game pages need real written content of their own, beside the
// game frame, to be useful to players and search engines. Text is a `{ en, tr? }` map like the
// manifest's: English is required, other platform locales optional (the studio writes both).

const text = (max: number) =>
  z.strictObject({
    en: z.string().trim().min(1).max(max),
    tr: z.string().trim().min(1).max(max).optional(),
  });

/** One paragraph or list item. */
const item = text(500);

export const GUIDE_INPUTS = ['keyboard', 'touch', 'mouse', 'gamepad'] as const;
export type GuideInput = (typeof GUIDE_INPUTS)[number];

export const gameGuideSchema = z.strictObject({
  /** 2–3 paragraphs separated by a blank line ("\n\n"). */
  about: text(2000),
  /** Ordered steps. */
  howToPlay: z.array(item).min(3).max(8),
  /** One or two sentences per input the game supports. */
  controls: z
    .strictObject({
      keyboard: item.optional(),
      touch: item.optional(),
      mouse: item.optional(),
      gamepad: item.optional(),
    })
    .refine((c) => Object.values(c).some(Boolean), 'at least one input'),
  tips: z.array(item).min(3).max(8),
  features: z.array(item).min(2).max(8).optional(),
  faq: z
    .array(z.strictObject({ q: text(200), a: text(600) }))
    .min(2)
    .max(6)
    .optional(),
});

export type GameGuide = z.infer<typeof gameGuideSchema>;

/** The generated guide file of a catalog (the studio's platform/arcade-guides.json). */
export const guideFileSchema = z.strictObject({
  version: z.literal(1),
  guides: z.record(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), gameGuideSchema),
});

export type GuideFile = z.infer<typeof guideFileSchema>;

export function parseGuideFile(input: unknown): GuideFile {
  return guideFileSchema.parse(input);
}
