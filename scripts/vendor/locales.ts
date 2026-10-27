// Vendored verbatim from selchook/ayvago packages/shared/src (do not edit; re-copy on schema changes).
// Locales the platform UI ships with. Adding one requires a messages file in apps/web/messages.
export const SUPPORTED_LOCALES = ['en', 'tr'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

// Native names, shown in the language switcher regardless of the active locale.
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
};

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
