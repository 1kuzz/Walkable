import { ruAuthMessages } from './auth';
import { ruCommonMessages } from './common';
import { ruComponentMessages } from './components';
import { ruErrorMessages } from './errors';
import { ruNavMessages } from './nav';
import { ruPageMessages } from './pages';

export const ruMessages = {
  ...ruCommonMessages,
  ...ruAuthMessages,
  ...ruNavMessages,
  ...ruPageMessages,
  ...ruComponentMessages,
  ...ruErrorMessages,
} as const;
