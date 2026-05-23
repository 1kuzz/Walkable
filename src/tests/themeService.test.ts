/**
 * themeService.test.ts — Unit tests for the theme management service.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTheme,
  setTheme,
  applyTheme,
  initializeTheme,
  getSsoPreference,
  setSsoPreference,
} from '../services/themeService';

const THEME_KEY = 'mops_theme';
const SSO_PREF_KEY = 'mops_sso_preferred';

beforeEach(() => {
  localStorage.clear();
  // Reset document root classes between tests
  document.documentElement.className = '';
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
});

// ---------------------------------------------------------------------------
// getTheme
// ---------------------------------------------------------------------------

describe('getTheme', () => {
  it('returns "light" by default when no preference is stored', () => {
    expect(getTheme()).toBe('light');
  });

  it('returns "dark" when the stored preference is "dark"', () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('dark'));
    expect(getTheme()).toBe('dark');
  });

  it('returns "light" when the stored preference is "light"', () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('light'));
    expect(getTheme()).toBe('light');
  });

  it('falls back to "light" for an unrecognised stored value', () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('rainbow'));
    expect(getTheme()).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  it('adds theme-dark and removes theme-light for dark theme', () => {
    document.documentElement.classList.add('theme-light');
    applyTheme('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });

  it('adds theme-light and removes theme-dark for light theme', () => {
    document.documentElement.classList.add('theme-dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
  });

  it('is idempotent when called multiple times with the same theme', () => {
    applyTheme('dark');
    applyTheme('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setTheme
// ---------------------------------------------------------------------------

describe('setTheme', () => {
  it('persists "dark" to localStorage', () => {
    setTheme('dark');
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toBe('dark');
  });

  it('persists "light" to localStorage', () => {
    setTheme('light');
    expect(JSON.parse(localStorage.getItem(THEME_KEY)!)).toBe('light');
  });

  it('applies the dark theme class to the document', () => {
    setTheme('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('applies the light theme class to the document', () => {
    setTheme('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('switching from dark to light removes the dark class', () => {
    setTheme('dark');
    setTheme('light');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('round-trips through getTheme', () => {
    setTheme('dark');
    expect(getTheme()).toBe('dark');

    setTheme('light');
    expect(getTheme()).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// initializeTheme
// ---------------------------------------------------------------------------

describe('initializeTheme', () => {
  it('applies the stored theme on initialization', () => {
    localStorage.setItem(THEME_KEY, JSON.stringify('dark'));
    initializeTheme();
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('defaults to light theme when no preference is stored', () => {
    initializeTheme();
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSsoPreference / setSsoPreference
// ---------------------------------------------------------------------------

describe('getSsoPreference', () => {
  it('returns false by default when no preference is stored', () => {
    expect(getSsoPreference()).toBe(false);
  });

  it('returns true when the stored preference is true', () => {
    localStorage.setItem(SSO_PREF_KEY, JSON.stringify(true));
    expect(getSsoPreference()).toBe(true);
  });

  it('returns false when the stored preference is false', () => {
    localStorage.setItem(SSO_PREF_KEY, JSON.stringify(false));
    expect(getSsoPreference()).toBe(false);
  });
});

describe('setSsoPreference', () => {
  it('persists true to localStorage', () => {
    setSsoPreference(true);
    expect(JSON.parse(localStorage.getItem(SSO_PREF_KEY)!)).toBe(true);
  });

  it('persists false to localStorage', () => {
    setSsoPreference(false);
    expect(JSON.parse(localStorage.getItem(SSO_PREF_KEY)!)).toBe(false);
  });

  it('round-trips through getSsoPreference', () => {
    setSsoPreference(true);
    expect(getSsoPreference()).toBe(true);

    setSsoPreference(false);
    expect(getSsoPreference()).toBe(false);
  });
});
