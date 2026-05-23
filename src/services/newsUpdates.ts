import { useState, useEffect } from 'react';
import { apiFetch } from '../api/apiClient';

export type UpdateTag = 'major_release' | 'hot_fix' | 'bug_fix';

export const TAG_LABELS: Record<UpdateTag, string> = {
  major_release: 'Major Release',
  hot_fix: 'Hot Fix',
  bug_fix: 'Bug Fix',
};

export interface NewsUpdate {
  id: string;
  title: string;
  description: string;
  date: string;
  tag?: UpdateTag | null;
  createdBy: string;
}

export async function getNewsUpdates(): Promise<NewsUpdate[]> {
  return apiFetch<NewsUpdate[]>('/api/news-updates');
}

export async function createNewsUpdate(
  update: Omit<NewsUpdate, 'createdBy'>,
): Promise<void> {
  await apiFetch<{ id: string }>('/api/news-updates', {
    method: 'POST',
    body: JSON.stringify(update),
  });
}

export async function updateNewsUpdate(
  id: string,
  fields: Pick<NewsUpdate, 'title' | 'description' | 'date' | 'tag'>,
): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/news-updates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

export async function deleteNewsUpdate(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/news-updates/${id}`, {
    method: 'DELETE',
  });
}

export function generateNewsUpdateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `nu_${crypto.randomUUID()}`;
  }
  return `nu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const POLL_INTERVAL_MS = 60_000;

export function useNewsUpdates(): {
  updates: NewsUpdate[];
  reload: () => void;
} {
  const [updates, setUpdates] = useState<NewsUpdate[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const data = await getNewsUpdates();
        if (!cancelled) setUpdates(data);
      } catch {
        // non-fatal
      }
    };

    void doFetch();
    const interval = setInterval(() => void doFetch(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tick]);

  return { updates, reload: () => setTick((t) => t + 1) };
}
