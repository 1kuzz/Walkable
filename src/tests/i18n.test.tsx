import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useI18n } from '../i18n';
import { LANGUAGE_STORAGE_KEY } from '../i18n/language';

function Probe() {
  const { t, setLocale, formatDate, locale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="gallery">{t('nav.gallery')}</span>
      <span data-testid="date">{formatDate('2026-01-02T00:00:00.000Z')}</span>
      <button type="button" onClick={() => setLocale('ru')}>ru</button>
      <button type="button" onClick={() => setLocale('en')}>en</button>
    </div>
  );
}

describe('i18n provider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it('defaults to browser/user locale fallback and can switch to russian', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(<I18nProvider><Probe /></I18nProvider>);

    expect(screen.getByTestId('gallery').textContent).toBe('Gallery');

    fireEvent.click(screen.getByText('ru'));
    expect(await screen.findByText('Галерея')).toBeInTheDocument();
    expect(screen.getByTestId('locale').textContent).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ru');
  });

  it('formats dates according to active locale', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    render(<I18nProvider><Probe /></I18nProvider>);

    const enDate = screen.getByTestId('date').textContent;
    expect(enDate).toContain('/');

    fireEvent.click(screen.getByText('ru'));
    await screen.findByText('Галерея');
    const ruDate = screen.getByTestId('date').textContent;
    expect(ruDate).not.toBe(enDate);
  });

  it('falls back to english for unsupported stored locale', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    const languageSpy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-DE');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('locale').textContent).toBe('en');
    languageSpy.mockRestore();
  });
});

