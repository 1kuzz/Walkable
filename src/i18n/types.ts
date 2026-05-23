export type Locale = 'en' | 'ru';

export interface PluralMessage {
  one?: string;
  few?: string;
  many?: string;
  other: string;
}

export type MessageValue = string | PluralMessage;
export type MessageParams = Record<string, string | number | boolean | null | undefined>;
export type Messages = Record<string, MessageValue>;
