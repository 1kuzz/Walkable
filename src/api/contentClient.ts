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
