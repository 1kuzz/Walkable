/** Theme management service — persists user preference and applies theme class. */

import { readStorageValue, setStorageValue } from '../utils/storageSync';

const THEME_KEY = 'mops_theme';
const SSO_PREF_KEY = 'mops_sso_preferred';

export type Theme = 'light' | 'dark';

const DEFAULT_THEME: Theme = 'dark';

/** Read the persisted theme preference (defaults to 'light'). */
export function getTheme(): Theme {
  const stored = readStorageValue<string>(THEME_KEY, DEFAULT_THEME);
  return stored === 'dark' ? 'dark' : 'light';
}

/** Persist and apply a theme. */
export function setTheme(theme: Theme): void {
  setStorageValue(THEME_KEY, theme);
  applyTheme(theme);
}

/** Apply the theme class to the document root element. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('theme-dark');
    root.classList.remove('theme-light');
  } else {
    root.classList.add('theme-light');
    root.classList.remove('theme-dark');
  }
}

/** Initialize theme on app startup. */
export function initializeTheme(): void {
  applyTheme(getTheme());
}

/** Read the SSO preference (defaults to false). */
export function getSsoPreference(): boolean {
  return readStorageValue<boolean>(SSO_PREF_KEY, false);
}

/** Persist the SSO preference. */
export function setSsoPreference(value: boolean): void {
  setStorageValue(SSO_PREF_KEY, value);
}
