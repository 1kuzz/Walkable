import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/apiClient';

export type ContentVisibility = 'all' | 'specific';
export type ContentStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface UploadedContent {
  id: string;
  name: string;
  description: string;
  /** Timestamp when uploaded */
  uploadedAt: string;
  /** Who uploaded it */
  uploadedBy: string;
  /** Visibility setting */
  visibility: ContentVisibility;
  /** Comma-separated logins (only used when visibility = 'specific') */
  allowedUsers: string;
  /** Number of files in this upload */
  fileCount: number;
  /**
   * Raw HTML string — only present when an item is constructed for seed/import
   * purposes and sent to POST /api/content/seed. The GET /api/content list
   * endpoint never returns this field; use /api/content/:id/render to display content.
   */
  htmlContent?: string;
  /** Path to a multi-file project served from public dir (e.g. '/uploaded-apps/my-app/index.html') */
  projectPath?: string;
  /**
   * True when the record has non-empty html_content in the database.
   * Returned by the list endpoint to allow zombie-seed detection without
   * exposing the full HTML payload.
   */
  hasContent?: boolean;
  /** Relative path to the thumbnail image served via /api/content/:id/thumbnail */
  thumbnailPath?: string | null;
  /**
   * Internal portal route this entry links to (e.g. '/email-center').
   * When set the item is a portal-link card — clicking it navigates to the route
   * instead of opening an iframe preview.
   */
  portalRoute?: string | null;
  /** Review workflow status */
  status?: ContentStatus;
  /** Admin note left when rejecting */
  reviewNote?: string | null;
  /** When the item was submitted for review */
  submittedAt?: string | null;
  /** GitHub URL if imported from GitHub */
  gitUrl?: string | null;
}

/**
 * Get all uploaded content items the current user is allowed to see.
 * Admins receive every item; regular users receive only items whose
 * visibility includes them (filtering is applied server-side).
 */
export async function getAllUploadedContent(): Promise<UploadedContent[]> {
  return apiFetch<UploadedContent[]>('/api/content');
}

/**
 * Filter a list of uploaded content items down to those visible to `userLogin`.
 * This is a pure client-side utility — useful for tests or local computation
 * over a snapshot already retrieved from the server.
 */
export function getVisibleContent(items: UploadedContent[], userLogin: string): UploadedContent[] {
  return items.filter((item) => {
    if (item.visibility === 'all') return true;
    if (!item.allowedUsers) return false;
    const allowed = item.allowedUsers
      .split(',')
      .map((s) => s.trim().toLowerCase());
    return allowed.includes(userLogin.toLowerCase());
  });
}

/**
 * Add a new uploaded content item via the JSON seed endpoint.
 * Used for programmatic seeding (e.g. pre-installed apps).
 * For user-facing file uploads use multipart POST to /api/content directly.
 */
export async function addUploadedContent(item: UploadedContent): Promise<void> {
  await apiFetch<{ id: string }>('/api/content/seed', {
    method: 'POST',
    body: JSON.stringify({
      id: item.id,
      name: item.name,
      description: item.description,
      uploadedAt: item.uploadedAt,
      uploadedBy: item.uploadedBy,
      visibility: item.visibility,
      allowedUsers: item.allowedUsers,
      fileCount: item.fileCount,
      htmlContent: item.htmlContent,
      projectPath: item.projectPath ?? null,
      portalRoute: item.portalRoute ?? null,
    }),
  });
}

/** Update an uploaded content item's metadata. */
export async function updateUploadedContent(
  id: string,
  updates: Partial<Pick<UploadedContent, 'name' | 'description' | 'visibility' | 'allowedUsers'>>,
): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** Delete an uploaded content item. */
export async function deleteUploadedContent(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/content/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Reactive uploaded content list fetched from the backend.
 * Returns both the current items array and a `refresh` function that
 * callers can invoke after mutations to get an immediate update.
 */
export function useUploadedContentItems(): { items: UploadedContent[]; refresh: () => void } {
  const [items, setItems] = useState<UploadedContent[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => setRefreshCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        const data = await apiFetch<UploadedContent[]>('/api/content');
        if (!cancelled) setItems(data);
      } catch {
        // Network or auth errors are non-fatal; keep the last known list.
      }
    };

    void doFetch();
    const interval = setInterval(() => void doFetch(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshCount]);

  return { items, refresh };
}

/** Generate a unique ID for uploaded content. */
export function generateContentId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
