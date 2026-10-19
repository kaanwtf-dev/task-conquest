// Languages: English (written right in the code) and Turkish (src/i18n/tr/*). Text the player sees goes
// through t('English text', { params }); tn() picks the singular or plural English form first. Turkish
// entries are keyed by the English text, so a missing one simply shows English (and a test lists it).
// The language is a module-level setting: the app sets it from Options (or the phone), the reminder
// sender sets it per player.
import { TR } from './tr';

export type Lang = 'en' | 'tr';
export type LangPref = 'auto' | Lang;
export const LANGS: { id: LangPref; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' },
];

let current: Lang = 'en';

/** Turkish when the phone's language is Turkish, or when it's set to Turkey's time zone; English otherwise. */
export function detectLang(): Lang {
  try {
    const langs = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
    if (langs.some((l) => typeof l === 'string' && /^tr\b/i.test(l))) return 'tr';
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Europe/Istanbul' || zone === 'Asia/Istanbul') return 'tr';
  } catch {
    // no navigator or Intl: English
  }
  return 'en';
}

export function resolveLang(pref: LangPref | undefined): Lang {
  return pref === 'en' || pref === 'tr' ? pref : detectLang();
}

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang; // Turkish casing for CSS uppercase (i → İ)
}

export const getLang = (): Lang => current;
/** For dates and numbers. */
export const locale = (): string => (current === 'tr' ? 'tr-TR' : 'en-US');
/** Upper case with the language's rules (Turkish: i → İ, ı → I). */
export const upper = (s: string): string => s.toLocaleUpperCase(locale());

function fill(s: string, params?: Record<string, string | number>): string {
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/**
 * Marks English text in a data table (a monster's name, an item's description) that is shown through t()
 * later, so the completeness test finds it. Returns the text unchanged.
 */
export const tk = (en: string): string => en;

/** The text in the current language. `en` is the English text, with {name} placeholders filled from params. */
export function t(en: string, params?: Record<string, string | number>): string {
  return fill(current === 'tr' ? (TR[en] ?? en) : en, params);
}

/**
 * Like t, for an English word with more than one meaning: Turkish is looked up as 'English|context' (e.g.
 * tc('earned', 'Title') → 'Unvan', while t('Title') for a quest's name field → 'Başlık').
 */
export function tc(context: string, en: string, params?: Record<string, string | number>): string {
  return fill(current === 'tr' ? (TR[`${en}|${context}`] ?? TR[en] ?? en) : en, params);
}

/** Like t, choosing the English singular or plural by n (n is also available as {n}). */
export function tn(n: number, one: string, other: string, params?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...params });
}
