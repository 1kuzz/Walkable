import { enAuthMessages } from './auth';
import { enCommonMessages } from './common';
import { enComponentMessages } from './components';
import { enErrorMessages } from './errors';
import { enNavMessages } from './nav';
import { enPageMessages } from './pages';

export const enMessages = {
  ...enCommonMessages,
  ...enAuthMessages,
  ...enNavMessages,
  ...enPageMessages,
  ...enComponentMessages,
  ...enErrorMessages,
} as const;

export type TranslationKey = keyof typeof enMessages;
