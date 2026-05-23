import { useCallback, useSyncExternalStore } from 'react';

type StorageListener = () => void;

const listenersByKey = new Map<string, Set<StorageListener>>();
const globalStorageSync = globalThis as typeof globalThis & {
  __mopsStorageSyncInitialized?: boolean;
};

/**
 * Snapshot cache: keeps the last raw JSON string and parsed value per key so
 * that `useSyncExternalStore`'s `getSnapshot` returns a **stable reference**
 * when the underlying data hasn't changed.  Without this cache, `JSON.parse`
 * creates a new object on every call, which React interprets as a state change
 * and can trigger an infinite re-render loop.
 */
const snapshotCache = new Map<string, { raw: string | null; parsed: unknown }>();

function notifyStorageKey(key: string): void {
  // Invalidate the snapshot cache for this key so the next getSnapshot reads fresh data.
  snapshotCache.delete(key);

  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) {
    listener();
  }
}

function initializeStorageEventSync(): void {
  if (typeof window === 'undefined' || globalStorageSync.__mopsStorageSyncInitialized) {
    return;
  }

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    notifyStorageKey(event.key);
  });

  globalStorageSync.__mopsStorageSyncInitialized = true;
}

initializeStorageEventSync();

export function subscribeToStorageKey(key: string, listener: StorageListener): () => void {
  const listeners = listenersByKey.get(key) ?? new Set<StorageListener>();
  listeners.add(listener);
  listenersByKey.set(key, listeners);

  return () => {
    const current = listenersByKey.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByKey.delete(key);
    }
  };
}

export function readStorageValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Read a storage value with snapshot caching.  Returns the same reference as
 * long as the raw JSON string in localStorage hasn't changed, which is
 * critical for `useSyncExternalStore` stability.
 */
function readCachedStorageValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  const raw = localStorage.getItem(key);
  const cached = snapshotCache.get(key);

  if (cached && cached.raw === raw) {
    return cached.parsed as T;
  }

  let parsed: T;
  try {
    parsed = raw === null ? defaultValue : (JSON.parse(raw) as T);
  } catch {
    parsed = defaultValue;
  }

  snapshotCache.set(key, { raw, parsed });
  return parsed;
}

export function setStorageValue<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
  notifyStorageKey(key);
}

export function deleteStorageValue(key: string): void {
  localStorage.removeItem(key);
  notifyStorageKey(key);
}

export function useStorageValue<T>(key: string, defaultValue: T): T {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToStorageKey(key, listener),
    [key],
  );
  const getSnapshot = useCallback(
    () => readCachedStorageValue<T>(key, defaultValue),
    [key, defaultValue],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => defaultValue,
  );
}
