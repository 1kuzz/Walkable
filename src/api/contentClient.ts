import { apiFetch } from './apiClient';
import type { UploadedContent } from '../services/uploadedContent';

export type { ContentStatus } from '../services/uploadedContent';

export interface PendingItem {
  id: string;
  name: string;
  description: string;
  uploadedBy: string;
  submittedAt: string;
  thumbnailPath?: string | null;
  status: string;
  reviewNote?: string | null;
  gitUrl?: string | null;
}

export function listContent(): Promise<UploadedContent[]> {
  return apiFetch<UploadedContent[]>('/api/content');
}

export function listPendingReview(): Promise<PendingItem[]> {
  return apiFetch<PendingItem[]>('/api/content/pending');
}

export function submitForReview(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}/submit-review`, {
    method: 'POST',
  });
}

export function reviewProject(
  id: string,
  action: 'approve' | 'reject',
  note?: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note }),
  });
}

export function uploadFromGitHub(
  gitUrl: string,
  name: string,
  description?: string,
  build?: boolean,
): Promise<{ id: string; buildLog?: string | null }> {
  return apiFetch<{ id: string; buildLog?: string | null }>('/api/content/github', {
    method: 'POST',
    body: JSON.stringify({ gitUrl, name, description, build }),
  });
}

export function deleteContent(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function stopBackend(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/content/${encodeURIComponent(id)}/stop`, { method: 'POST' });
}

export function restartBackend(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/content/${encodeURIComponent(id)}/restart`, { method: 'POST' });
}

export function updateContent(
  id: string,
  fields: { name?: string; description?: string },
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export interface GitHubRepo {
  full_name: string;
  name: string;
  private: boolean;
  description: string | null;
  updated_at: string;
  html_url: string;
}

export async function listGitHubRepos(page = 1): Promise<GitHubRepo[]> {
  const res = await fetch(`/api/github/repos?page=${page}`, { credentials: 'include' });
  if (!res.ok) return [];
  return res.json() as Promise<GitHubRepo[]>;
}
