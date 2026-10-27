import { storage } from './storage';

export type Lang = 'tr' | 'en';
export type Dict = Record<string, string>;
export type Strings = { tr: Dict; en: Dict };
export type Localized = { tr: string; en: string };

const common: Strings = {
  tr: {
    play: 'OYNA', retry: 'TEKRAR', menu: 'MENÜ', resume: 'DEVAM', paused: 'DURAKLATILDI',
    score: 'SKOR', best: 'EN İYİ', level: 'SEVİYE', lives: 'CAN', time: 'SÜRE', moves: 'HAMLE',
    gameOver: 'OYUN BİTTİ', newBest: 'YENİ REKOR!', youWin: 'KAZANDIN!', levelClear: 'BÖLÜM TAMAM!',
    tapToStart: 'Başlamak için dokun', howTo: 'NASIL OYNANIR', sound: 'SES', on: 'AÇIK', off: 'KAPALI',
    next: 'SONRAKİ', ready: 'HAZIR', go: 'BAŞLA!', wave: 'DALGA', combo: 'KOMBO',
  },
  en: {
    play: 'PLAY', retry: 'RETRY', menu: 'MENU', resume: 'RESUME', paused: 'PAUSED',
    score: 'SCORE', best: 'BEST', level: 'LEVEL', lives: 'LIVES', time: 'TIME', moves: 'MOVES',
    gameOver: 'GAME OVER', newBest: 'NEW BEST!', youWin: 'YOU WIN!', levelClear: 'LEVEL CLEAR!',
    tapToStart: 'Tap to start', howTo: 'HOW TO PLAY', sound: 'SOUND', on: 'ON', off: 'OFF',
    next: 'NEXT', ready: 'READY', go: 'GO!', wave: 'WAVE', combo: 'COMBO',
  },
};

let lang: Lang = detect();
let extra: Strings = { tr: {}, en: {} };

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'tr' || q === 'en') return q;
  const saved = storage.get<string | null>('lang', null);
  if (saved === 'tr' || saved === 'en') return saved;
  return (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  storage.set('lang', l);
  document.documentElement.lang = l;
}

export function registerStrings(s: Partial<Strings>): void {
  extra = { tr: { ...extra.tr, ...(s.tr ?? {}) }, en: { ...extra.en, ...(s.en ?? {}) } };
}

/** Translate a key; `{name}` placeholders are filled from vars. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = extra[lang][key] ?? common[lang][key] ?? extra.en[key] ?? common.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export function loc(v: Localized | string): string {
  return typeof v === 'string' ? v : v[lang] ?? v.en;
}

/** Locale-aware uppercase (i → İ in Turkish). */
export function upper(s: string): string {
  return s.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US');
}
