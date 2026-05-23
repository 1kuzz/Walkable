import { useState, useCallback, useEffect } from 'react';
import { type UploadedContent } from '../services/uploadedContent';
import { apiFetch } from '../api/apiClient';

export const HOT_BUTTON_COUNT = 3;

export interface HotButtonSlot {
  appId: string | null;
  appName: string | null;
  appProjectPath: string | null;
}

/** Shape returned by the backend GET /api/quick-buttons */
interface QuickButtonRow {
  slot_index: number;
  app_id: string | null;
  app_name: string | null;
  app_project_path: string | null;
}

const STORAGE_KEY_PREFIX = 'mops_hotbuttons_';

function lsKey(login: string): string {
  return `${STORAGE_KEY_PREFIX}${login.replace(/[\\/:]/g, '_')}`;
}

function emptySlots(): HotButtonSlot[] {
  return Array.from({ length: HOT_BUTTON_COUNT }, () => ({
    appId: null,
    appName: null,
    appProjectPath: null,
  }));
}

/**
 * Load quick buttons from the backend for the given user.
 * Falls back to a list of empty slots on error (non-fatal).
 */
async function fetchSlots(login: string): Promise<HotButtonSlot[]> {
  try {
    const rows = await apiFetch<QuickButtonRow[]>('/api/quick-buttons');
    const base = emptySlots();
    for (const row of rows) {
      if (row.slot_index >= 0 && row.slot_index < HOT_BUTTON_COUNT) {
        base[row.slot_index] = {
          appId: row.app_id,
          appName: row.app_name,
          appProjectPath: row.app_project_path,
        };
      }
    }
    // Persist to localStorage as a local cache so the UI has instant data on next mount.
    try { localStorage.setItem(lsKey(login), JSON.stringify(base)); } catch { /* ignore */ }
    return base;
  } catch {
    // Fall back to localStorage cache while the API is unavailable.
    try {
      const raw = localStorage.getItem(lsKey(login));
      if (raw) {
        const parsed = JSON.parse(raw) as HotButtonSlot[];
        if (Array.isArray(parsed) && parsed.length === HOT_BUTTON_COUNT) return parsed;
      }
    } catch { /* ignore malformed storage */ }
    return emptySlots();
  }
}

export function useHotButtons(login: string) {
  // Seed with localStorage cache immediately so the UI doesn't flash.
  const [slots, setSlots] = useState<HotButtonSlot[]>(() => {
    try {
      const raw = localStorage.getItem(lsKey(login));
      if (raw) {
        const parsed = JSON.parse(raw) as HotButtonSlot[];
        if (Array.isArray(parsed) && parsed.length === HOT_BUTTON_COUNT) return parsed;
      }
    } catch { /* ignore */ }
    return emptySlots();
  });

  // Fetch from backend on mount (and when login changes).
  useEffect(() => {
    let cancelled = false;
    fetchSlots(login).then((fetched) => {
      if (!cancelled) setSlots(fetched);
    });
    return () => { cancelled = true; };
  }, [login]);

  const updateSlot = useCallback(
    (index: number, app: UploadedContent | null) => {
      const updated: HotButtonSlot = {
        appId: app?.id ?? null,
        appName: app?.name ?? null,
        appProjectPath: app?.projectPath ?? null,
      };

      // Optimistic update
      setSlots((prev) => prev.map((s, i) => (i === index ? updated : s)));

      // Persist to localStorage cache
      setSlots((prev) => {
        const next = prev.map((s, i) => (i === index ? updated : s));
          try { localStorage.setItem(lsKey(login), JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });

      // Persist to backend
      if (app) {
        apiFetch('/api/quick-buttons/' + index, {
          method: 'PUT',
          body: JSON.stringify({
            appId: app.id,
            appName: app.name,
            appProjectPath: app.projectPath ?? null,
          }),
        }).catch(() => { /* non-fatal: localStorage cache remains correct */ });
      } else {
        apiFetch('/api/quick-buttons/' + index, { method: 'DELETE' }).catch(() => { /* non-fatal */ });
      }
    },
    [login],
  );

  return { slots, updateSlot };
}
