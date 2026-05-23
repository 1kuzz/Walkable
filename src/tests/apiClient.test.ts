/**
 * apiClient.test.ts — Unit tests for the shared apiFetch HTTP client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch } from '../api/apiClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
}

function mockFetchError(status: number, statusText: string, bodyText = '') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(bodyText),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

// ---------------------------------------------------------------------------
// Basic fetch behaviour
// ---------------------------------------------------------------------------

describe('apiFetch — basic behaviour', () => {
  it('calls the correct path', async () => {
    mockFetchOk({ ok: true });
    await apiFetch('/api/test');
    expect(fetch).toHaveBeenCalledWith('/api/test', expect.any(Object));
  });

  it('returns the parsed JSON response', async () => {
    mockFetchOk({ items: [1, 2, 3] });
    const result = await apiFetch<{ items: number[] }>('/api/items');
    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('sets Content-Type: application/json by default', async () => {
    mockFetchOk({});
    await apiFetch('/api/test');
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('passes through request options (method, body)', async () => {
    mockFetchOk({ id: 'new' });
    await apiFetch('/api/items', { method: 'POST', body: JSON.stringify({ name: 'X' }) });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify({ name: 'X' }));
  });
});

// ---------------------------------------------------------------------------
// Authorization header
// ---------------------------------------------------------------------------

describe('apiFetch — Authorization header', () => {
  beforeEach(() => sessionStorage.clear());

  it('attaches Bearer token from sessionStorage when present', async () => {
    sessionStorage.setItem('mops_auth_token', 'my-token-123');
    mockFetchOk({});
    await apiFetch('/api/protected');
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token-123');
  });

  it('does not attach Authorization header when no token is stored', async () => {
    mockFetchOk({});
    await apiFetch('/api/public');
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('updates the token used when sessionStorage changes between calls', async () => {
    sessionStorage.setItem('mops_auth_token', 'first-token');
    mockFetchOk({});
    await apiFetch('/api/first');

    sessionStorage.setItem('mops_auth_token', 'second-token');
    await apiFetch('/api/second');

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[0][1].headers as Record<string, string>)['Authorization']).toBe('Bearer first-token');
    expect((calls[1][1].headers as Record<string, string>)['Authorization']).toBe('Bearer second-token');
  });
});

// ---------------------------------------------------------------------------
// FormData — Content-Type omitted
// ---------------------------------------------------------------------------

describe('apiFetch — FormData body', () => {
  it('does not set Content-Type when body is FormData', async () => {
    mockFetchOk({ uploaded: true });
    const formData = new FormData();
    formData.append('file', new Blob(['content'], { type: 'text/html' }), 'test.html');
    await apiFetch('/api/upload', { method: 'POST', body: formData });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling — non-2xx responses
// ---------------------------------------------------------------------------

describe('apiFetch — error handling', () => {
  it('throws an error on a 401 response', async () => {
    mockFetchError(401, 'Unauthorized', 'You must log in');
    await expect(apiFetch('/api/secure')).rejects.toThrow('401');
  });

  it('throws an error on a 404 response', async () => {
    mockFetchError(404, 'Not Found', 'Resource missing');
    await expect(apiFetch('/api/missing')).rejects.toThrow('404');
  });

  it('throws an error on a 500 response', async () => {
    mockFetchError(500, 'Internal Server Error', 'Something broke');
    await expect(apiFetch('/api/broken')).rejects.toThrow('500');
  });

  it('includes the status text in the error message', async () => {
    mockFetchError(403, 'Forbidden', '');
    await expect(apiFetch('/api/admin')).rejects.toThrow('Forbidden');
  });

  it('includes the response body text in the error message', async () => {
    mockFetchError(422, 'Unprocessable Entity', 'Validation failed: name is required');
    await expect(apiFetch('/api/data')).rejects.toThrow('Validation failed');
  });

  it('does not throw when body text cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: () => Promise.reject(new Error('stream error')),
    }));
    await expect(apiFetch('/api/down')).rejects.toThrow('503');
  });
});

// ---------------------------------------------------------------------------
// Custom headers
// ---------------------------------------------------------------------------

describe('apiFetch — custom headers', () => {
  it('merges caller-supplied headers with defaults', async () => {
    mockFetchOk({});
    await apiFetch('/api/test', {
      headers: { 'X-Custom-Header': 'value' },
    });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['X-Custom-Header']).toBe('value');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('allows caller to override Content-Type', async () => {
    mockFetchOk({});
    await apiFetch('/api/test', {
      headers: { 'Content-Type': 'text/plain' },
    });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/plain');
  });
});
