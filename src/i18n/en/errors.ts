import type { Messages } from '../types';

export const enErrorMessages = {
  'error.generic': 'Something went wrong. Please try again.',
  'error.network': 'Network error. Please check your connection.',
  'error.authFailed': 'Authentication failed. Please try again.',
  'error.accessDenied': 'Access denied.',
  'error.requestTimeout': 'Request timed out. Please try again.',
  'error.betaAccessRequired': 'Beta access required.',
  'error.accountLocked':
    'Account temporarily locked due to too many failed attempts. Try again in {{minutes}} minute(s).',
} satisfies Messages;
