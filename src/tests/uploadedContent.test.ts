import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAllUploadedContent,
  getVisibleContent,
  addUploadedContent,
  updateUploadedContent,
  deleteUploadedContent,
  generateContentId,
  type UploadedContent,
} from '../services/uploadedContent';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_HTML = `<!DOCTYPE html><html><body><h1>Hello</h1></body></html>`;

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetch(responseBody: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Test item factory
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<UploadedContent> = {}): UploadedContent {
  return {
    id: generateContentId(),
    name: 'Test Page',
    description: 'A test HTML upload',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'KL\\TestUser',
    visibility: 'all',
    allowedUsers: '',
    fileCount: 1,
    htmlContent: '<h1>Hello</h1>',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getAllUploadedContent — calls GET /api/content
// ---------------------------------------------------------------------------

describe('getAllUploadedContent', () => {
  it('calls GET /api/content', async () => {
    mockFetch([]);
    await getAllUploadedContent();
    expect(fetch).toHaveBeenCalledWith('/api/content', expect.any(Object));
  });

  it('returns the items from the backend', async () => {
    const items = [makeItem({ name: 'First Upload' })];
    mockFetch(items);
    const result = await getAllUploadedContent();
    expect(result).toEqual(items);
  });

  it('returns an empty array when the backend returns []', async () => {
    mockFetch([]);
    expect(await getAllUploadedContent()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addUploadedContent — calls POST /api/content/seed
// ---------------------------------------------------------------------------

describe('addUploadedContent', () => {
  it('calls POST /api/content/seed', async () => {
    mockFetch({ id: 'new-id' });
    await addUploadedContent(makeItem({ name: 'First Upload' }));
    expect(fetch).toHaveBeenCalledWith(
      '/api/content/seed',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes item fields in the request body', async () => {
    mockFetch({ id: 'new-id' });
    const item = makeItem({ name: 'My App', visibility: 'specific', allowedUsers: 'KL\\Alice' });
    await addUploadedContent(item);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe('My App');
    expect(body.visibility).toBe('specific');
    expect(body.allowedUsers).toBe('KL\\Alice');
    expect(body.htmlContent).toBe('<h1>Hello</h1>');
  });
});

// ---------------------------------------------------------------------------
// updateUploadedContent — calls PATCH /api/content/:id
// ---------------------------------------------------------------------------

describe('updateUploadedContent', () => {
  it('calls PATCH /api/content/:id', async () => {
    mockFetch({ success: true });
    await updateUploadedContent('item-123', { name: 'New Name' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/content/item-123',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('sends only the requested fields in the body', async () => {
    mockFetch({ success: true });
    await updateUploadedContent('item-123', { visibility: 'specific', allowedUsers: 'KL\\Admin' });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.visibility).toBe('specific');
    expect(body.allowedUsers).toBe('KL\\Admin');
    expect(body.name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteUploadedContent — calls DELETE /api/content/:id
// ---------------------------------------------------------------------------

describe('deleteUploadedContent', () => {
  it('calls DELETE /api/content/:id', async () => {
    mockFetch({ success: true });
    await deleteUploadedContent('item-abc');
    expect(fetch).toHaveBeenCalledWith(
      '/api/content/item-abc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ---------------------------------------------------------------------------
// getVisibleContent — pure utility; no fetch needed
// ---------------------------------------------------------------------------

describe('getVisibleContent', () => {
  it('returns items with visibility=all for any user', () => {
    const items = [makeItem({ visibility: 'all' })];
    expect(getVisibleContent(items, 'KL\\AnyUser')).toHaveLength(1);
  });

  it('returns specific-visibility items for listed users', () => {
    const items = [makeItem({ visibility: 'specific', allowedUsers: 'KL\\Alice, KL\\Bob' })];
    expect(getVisibleContent(items, 'KL\\Alice')).toHaveLength(1);
    expect(getVisibleContent(items, 'KL\\Bob')).toHaveLength(1);
  });

  it('hides specific-visibility items from users not in the list', () => {
    const items = [makeItem({ visibility: 'specific', allowedUsers: 'KL\\Alice' })];
    expect(getVisibleContent(items, 'KL\\Eve')).toHaveLength(0);
  });

  it('is case-insensitive for user login matching', () => {
    const items = [makeItem({ visibility: 'specific', allowedUsers: 'KL\\ALICE' })];
    expect(getVisibleContent(items, 'kl\\alice')).toHaveLength(1);
  });

  it('hides specific-visibility items when allowedUsers is empty', () => {
    const items = [makeItem({ visibility: 'specific', allowedUsers: '' })];
    expect(getVisibleContent(items, 'KL\\Alice')).toHaveLength(0);
  });

  it('returns a mix of all and specific items correctly', () => {
    const items = [
      makeItem({ name: 'Public', visibility: 'all' }),
      makeItem({ name: 'Private', visibility: 'specific', allowedUsers: 'KL\\Admin' }),
    ];
    expect(getVisibleContent(items, 'KL\\Admin')).toHaveLength(2);
    expect(getVisibleContent(items, 'KL\\Regular')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// generateContentId
// ---------------------------------------------------------------------------

describe('generateContentId', () => {
  it('returns a non-empty string', () => {
    expect(generateContentId().length).toBeGreaterThan(0);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateContentId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Visibility round-trip tests (using pure getVisibleContent)
// ---------------------------------------------------------------------------

describe('Visibility round-trips (pure utility)', () => {
  it('admin uploads an HTML app with visibility=all — all users can see it', () => {
    const items = [makeItem({ name: 'Team Dashboard', visibility: 'all', htmlContent: TEST_HTML })];
    expect(getVisibleContent(items, 'KL\\Kuznetsov_il')).toHaveLength(1);
    expect(getVisibleContent(items, 'KL\\RandomUser')).toHaveLength(1);
  });

  it('admin changes visibility from restricted to public — all users see it', () => {
    const item = makeItem({ name: 'Internal Tool', visibility: 'specific', allowedUsers: 'KL\\Kuznetsov_il' });

    // Before: only admin sees it
    expect(getVisibleContent([item], 'KL\\Kuznetsov_il')).toHaveLength(1);
    expect(getVisibleContent([item], 'KL\\OtherUser')).toHaveLength(0);

    // After visibility change (simulate the server update by creating a new snapshot)
    const updatedItem = { ...item, visibility: 'all' as const, allowedUsers: '' };
    expect(getVisibleContent([updatedItem], 'KL\\Kuznetsov_il')).toHaveLength(1);
    expect(getVisibleContent([updatedItem], 'KL\\OtherUser')).toHaveLength(1);
  });

  it('admin restricts a public app — non-listed users lose access', () => {
    const item = makeItem({ name: 'Public App', visibility: 'all' });
    expect(getVisibleContent([item], 'KL\\UserA')).toHaveLength(1);

    const restricted = { ...item, visibility: 'specific' as const, allowedUsers: 'KL\\UserA' };
    expect(getVisibleContent([restricted], 'KL\\UserA')).toHaveLength(1);
    expect(getVisibleContent([restricted], 'KL\\UserB')).toHaveLength(0);
  });

  it('multiple apps with mixed visibility work correctly', () => {
    const items: UploadedContent[] = [
      makeItem({ name: 'Public Dashboard', visibility: 'all' }),
      makeItem({ name: 'Admin Only Tool', visibility: 'specific', allowedUsers: 'KL\\Kuznetsov_il' }),
      makeItem({ name: 'Team Tool', visibility: 'specific', allowedUsers: 'KL\\UserA, KL\\UserB' }),
    ];

    expect(getVisibleContent(items, 'KL\\Kuznetsov_il')).toHaveLength(2);
    expect(getVisibleContent(items, 'KL\\UserA')).toHaveLength(2);
    expect(getVisibleContent(items, 'KL\\UserB')).toHaveLength(2);
    expect(getVisibleContent(items, 'KL\\RandomUser')).toHaveLength(1);
    expect(getVisibleContent(items, 'KL\\RandomUser')[0].name).toBe('Public Dashboard');
  });
});

// ---------------------------------------------------------------------------
// CRUD API call sequence tests (using mocked fetch)
// ---------------------------------------------------------------------------

describe('Admin HTML upload → API round-trip', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('addUploadedContent sends the item to the seed endpoint', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ id: 'seed-id' }), text: () => Promise.resolve(''),
    });
    const item = makeItem({ name: 'Dashboard', htmlContent: TEST_HTML });
    await addUploadedContent(item);
    expect(fetch).toHaveBeenCalledWith('/api/content/seed', expect.objectContaining({ method: 'POST' }));
  });

  it('updateUploadedContent sends PATCH with the new visibility', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ success: true }), text: () => Promise.resolve(''),
    });
    await updateUploadedContent('some-id', { visibility: 'all', allowedUsers: '' });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body as string);
    expect(body.visibility).toBe('all');
    expect(body.allowedUsers).toBe('');
  });

  it('deleteUploadedContent sends DELETE to the correct URL', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, json: () => Promise.resolve({ success: true }), text: () => Promise.resolve(''),
    });
    await deleteUploadedContent('to-remove');
    expect(fetch).toHaveBeenCalledWith('/api/content/to-remove', expect.objectContaining({ method: 'DELETE' }));
  });
});
