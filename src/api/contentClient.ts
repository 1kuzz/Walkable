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

export interface BackendConfig {
  entryPoint: string;
  prefix: string;
  provisionDb: boolean;
  envVars?: Record<string, string>;
}

export function configureBackend(
  id: string,
  config: BackendConfig,
): Promise<{ ok: true; port: number; prefix: string }> {
  return apiFetch(`/api/content/${encodeURIComponent(id)}/configure-backend`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// ── Queue API ─────────────────────────────────────────────────────────────────

export interface StorageInfo {
  status: 'ok' | 'low' | 'critical';
  freeMB: number;
  totalMB: number;
  percentUsed: number;
}

export interface QueueItem {
  id: string;
  name: string;
  git_url: string;
  build: boolean;
  queued_at: string;
  status: 'waiting' | 'processing' | 'done' | 'failed' | 'cancelled';
  result_id?: string | null;
  error?: string | null;
  position?: number;
}

export interface QueueState {
  items: QueueItem[];
  storageInfo: StorageInfo;
  totalWaiting: number;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const res = await fetch('/api/queue/storage');
  if (!res.ok) return { status: 'ok', freeMB: 9999, totalMB: 9999, percentUsed: 0 };
  return res.json() as Promise<StorageInfo>;
}

export async function getQueue(): Promise<QueueState> {
  return apiFetch<QueueState>('/api/queue');
}

export async function enqueueGitHub(
  gitUrl: string, name: string, description?: string, build?: boolean,
): Promise<{ id: string; position: number; message: string }> {
  return apiFetch('/api/queue', {
    method: 'POST',
    body: JSON.stringify({ gitUrl, name, description, build }),
  });
}

export async function cancelQueueItem(id: string): Promise<void> {
  await apiFetch(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

/** Replace the uploaded files for an existing project while keeping its share link. */
export async function replaceArchive(
  id: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ projectPath: string; fileCount: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('archive', file);
    xhr.open('PUT', `/api/content/${encodeURIComponent(id)}/archive`);
    xhr.withCredentials = true;
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error ?? 'Upload failed')); }
        catch { reject(new Error('Upload failed')); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}
