import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/apiClient';

export type UpdateType = 'portal' | 'app' | 'news';

export interface Update {
  id: string;
  title: string;
  description: string;
  date: string;
  type: UpdateType;
  appName?: string | null;
  version?: string | null;
  tagId?: string | null;
  tagLabel?: string | null;
  tagColor?: string | null;
  publishedBy: string;
  isPinned: boolean;
  createdAt: string;
}

export interface UpdatesResponse {
  updates: Update[];
  total: number;
  unreadCount: number;
}

export interface UpdatesFilter {
  type?: string;
  tagId?: string;
  q?: string;
}

export async function fetchUpdates(
  filter: UpdatesFilter = {},
  limit = 20,
  offset = 0,
): Promise<UpdatesResponse> {
  const params = new URLSearchParams();
  if (filter.type && filter.type !== 'all') params.set('type', filter.type);
  if (filter.tagId) params.set('tagId', filter.tagId);
  if (filter.q) params.set('q', filter.q);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return apiFetch<UpdatesResponse>(`/api/updates?${params}`);
}

export async function createUpdate(update: {
  id: string; title: string; description: string; date: string;
  type?: UpdateType; appName?: string; version?: string; tagId?: string | null;
}): Promise<void> {
  await apiFetch<{ id: string }>('/api/updates', {
    method: 'POST',
    body: JSON.stringify(update),
  });
}

export async function editUpdate(id: string, fields: {
  title: string; description: string; date: string;
  type?: UpdateType; appName?: string | null; version?: string | null; tagId?: string | null;
}): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/updates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export async function deleteUpdate(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/updates/${id}`, { method: 'DELETE' });
}

export async function pinUpdate(id: string): Promise<boolean> {
  const res = await apiFetch<{ isPinned: boolean }>(`/api/updates/${id}/pin`, { method: 'POST' });
  return res.isPinned;
}

export async function markUpdatesRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await apiFetch<{ success: boolean }>('/api/updates/mark-read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count: number }>('/api/updates/unread-count');
  return res.count;
}

export function generateUpdateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `upd_${crypto.randomUUID()}`;
  return `upd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const PAGE_SIZE = 10;

export function useUpdates(filter: UpdatesFilter) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);

  // Reset when filter changes
  useEffect(() => {
    setUpdates([]);
    setOffset(0);
  }, [filter.type, filter.tagId, filter.q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUpdates(filter, PAGE_SIZE, offset)
      .then((res) => {
        if (cancelled) return;
        setUpdates((prev) => offset === 0 ? res.updates : [...prev, ...res.updates]);
        setTotal(res.total);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.type, filter.tagId, filter.q, offset, tick]);

  const loadMore = useCallback(() => setOffset((o) => o + PAGE_SIZE), []);
  const reload = useCallback(() => { setOffset(0); setTick((t) => t + 1); }, []);
  const hasMore = updates.length < total;

  return { updates, total, unreadCount, loading, hasMore, loadMore, reload };
}

export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => getUnreadCount().then((c) => { if (!cancelled) setCount(c); }).catch(() => {});
    void fetch();
    const interval = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return count;
}
