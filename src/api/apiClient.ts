/** Shared HTTP client for backend requests. */

/**
 * Fetch wrapper that:
 * - Attaches `Authorization: Bearer <token>` from sessionStorage.
 * - Sets `Content-Type: application/json` for non-FormData bodies.
 * - Throws an Error on non-2xx responses with the status and body text.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };

  const token = sessionStorage.getItem('mops_auth_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, { ...options, headers, credentials: 'include' });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return response.json() as Promise<T>;
}
