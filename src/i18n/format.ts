import type { Locale } from './types';

const LOCALE_TAG: Record<Locale, string> = {
  en: 'en-US',
  ru: 'ru-RU',
};

export function localeTag(locale: Locale): string {
  return LOCALE_TAG[locale];
}

export function formatDate(value: string | Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(localeTag(locale), options);
}

export function formatDateTime(value: string | Date, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(localeTag(locale), options);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

export function formatList(values: string[], locale: Locale, options?: Intl.ListFormatOptions): string {
  return new Intl.ListFormat(localeTag(locale), options).format(values);
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: Locale): string {
  return new Intl.RelativeTimeFormat(localeTag(locale), { numeric: 'auto' }).format(value, unit);
}
