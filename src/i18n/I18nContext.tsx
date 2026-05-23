import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { enMessages, type TranslationKey } from './en';
import { formatDate, formatDateTime, formatList, formatNumber, formatRelativeTime } from './format';
import { resolveInitialLocale, setStoredLocale } from './language';
import { loadMessages, translate } from './messages';
import type { Locale, MessageParams, Messages } from './types';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: MessageParams) => string;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatList: (values: string[], options?: Intl.ListFormatOptions) => string;
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
}

const defaultContextValue: I18nContextValue = {
  locale: 'en',
  setLocale: () => {},
  t: (key, params) => translate(enMessages, 'en', key, params),
  formatDate: (value, options) => formatDate(value, 'en', options),
  formatDateTime: (value, options) => formatDateTime(value, 'en', options),
  formatNumber: (value, options) => formatNumber(value, 'en', options),
  formatList: (values, options) => formatList(values, 'en', options),
  formatRelativeTime: (value, unit) => formatRelativeTime(value, unit, 'en'),
};

const I18nContext = createContext<I18nContextValue>(defaultContextValue);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());
  const [messages, setMessages] = useState<Messages>(enMessages);

  useEffect(() => {
    let cancelled = false;
    loadMessages(locale).then((loaded) => {
      if (!cancelled) setMessages(loaded);
    }).catch(() => {
      if (!cancelled) setMessages(enMessages);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      setStoredLocale(nextLocale);
      setLocaleState(nextLocale);
    },
    t: (key, params) => translate(messages, locale, key, params),
    formatDate: (valueToFormat, options) => formatDate(valueToFormat, locale, options),
    formatDateTime: (valueToFormat, options) => formatDateTime(valueToFormat, locale, options),
    formatNumber: (valueToFormat, options) => formatNumber(valueToFormat, locale, options),
    formatList: (values, options) => formatList(values, locale, options),
    formatRelativeTime: (valueToFormat, unit) => formatRelativeTime(valueToFormat, unit, locale),
  }), [messages, locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
