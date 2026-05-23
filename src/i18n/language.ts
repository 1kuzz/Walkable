import type { Locale } from './types';

export const LANGUAGE_STORAGE_KEY = 'mops_portal_language';
export const DEFAULT_LOCALE: Locale = 'en';

function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower.startsWith('ru')) return 'ru';
  if (lower.startsWith('en')) return 'en';
  return null;
}

export function getStoredLocale(): Locale | null {
  try {
    return normalizeLocale(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors
  }
}

export function detectBrowserLocale(): Locale {
  const detected =
    normalizeLocale(navigator.language) ??
    navigator.languages.map((value) => normalizeLocale(value)).find((value) => value !== null) ??
    DEFAULT_LOCALE;
  return detected;
}

export function resolveInitialLocale(): Locale {
  return getStoredLocale() ?? DEFAULT_LOCALE;
}
