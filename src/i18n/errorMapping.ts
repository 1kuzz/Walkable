import type { TranslationKey } from './en';

export function mapBackendErrorToKey(message: string): TranslationKey {
  const lower = message.toLowerCase();
  if (lower.includes('access denied') || lower.includes('forbidden')) return 'error.accessDenied';
  if (lower.includes('timed out') || lower.includes('timeout')) return 'error.requestTimeout';
  if (lower.includes('network')) return 'error.network';
  if (lower.includes('authentication failed') || lower.includes('invalid credentials')) return 'error.authFailed';
  if (lower.includes('beta access required')) return 'error.betaAccessRequired';
  return 'error.generic';
}
