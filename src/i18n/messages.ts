import { enMessages, type TranslationKey } from './en';
import type { Locale, MessageParams, MessageValue, Messages } from './types';
import { ruMessages } from './ru';
import { DEFAULT_LOCALE } from './language';

const localeLoaders: Record<Locale, () => Promise<Messages>> = {
  en: async () => enMessages,
  ru: async () => ruMessages,
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  const loader = localeLoaders[locale] ?? localeLoaders.en;
  return loader();
}

function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ''));
}

function resolvePlural(value: Exclude<MessageValue, string>, locale: Locale, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  if (category === 'one' && value.one) return value.one;
  if (category === 'few' && value.few) return value.few;
  if (category === 'many' && value.many) return value.many;
  return value.other;
}

export function translate(
  messages: Messages,
  locale: Locale,
  key: TranslationKey,
  params?: MessageParams,
): string {
  const value = messages[key] ?? enMessages[key] ?? key;
  if (typeof value === 'string') {
    return interpolate(value, params);
  }
  const countRaw = params?.count;
  const count = typeof countRaw === 'number' ? countRaw : Number(countRaw ?? 0);
  return interpolate(resolvePlural(value, locale, Number.isNaN(count) ? 0 : count), params);
}

export function localeFromDocument(): Locale {
  const lang = document.documentElement.lang.toLowerCase();
  if (lang.startsWith('ru')) return 'ru';
  if (lang.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

export function translateStatic(
  key: TranslationKey,
  params?: MessageParams,
): string {
  const locale = localeFromDocument();
  const messages = locale === 'ru' ? ruMessages : enMessages;
  return translate(messages, locale, key, params);
}
