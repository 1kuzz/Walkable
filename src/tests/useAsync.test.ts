/**
 * useAsync.test.ts — tests for the generic async data-fetching hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsync } from '../hooks/useAsync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAfter<T>(value: T, ms = 0): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function rejectAfter(message: string, ms = 0): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
}

// ---------------------------------------------------------------------------
// Successful fetch
// ---------------------------------------------------------------------------

describe('useAsync — successful fetch', () => {
  it('starts with loading=true and data=null', () => {
    const fn = () => resolveAfter([1, 2, 3], 100);
    const { result } = renderHook(() => useAsync(fn));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets data and clears loading after resolution', async () => {
    const fn = () => resolveAfter([1, 2, 3]);
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
  });

  it('returns the resolved value correctly', async () => {
    const fn = () => resolveAfter({ id: 42, name: 'Alice' });
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: 42, name: 'Alice' });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('useAsync — error handling', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets error and clears loading when the promise rejects', async () => {
    const fn = () => rejectAfter('Network failure');
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network failure');
    expect(result.current.data).toBeNull();
  });

  it('wraps non-Error rejections in an Error object', async () => {
    const fn = () => Promise.reject('raw string error');
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('raw string error');
  });
});

// ---------------------------------------------------------------------------
// refetch
// ---------------------------------------------------------------------------

describe('useAsync — refetch', () => {
  it('re-runs the function and updates data', async () => {
    let callCount = 0;
    const fn = () => resolveAfter(++callCount);
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBe(2);
    });
  });

  it('clears error on refetch', async () => {
    let shouldFail = true;
    const fn = () => shouldFail ? rejectAfter('oops') : resolveAfter('ok');
    const { result } = renderHook(() => useAsync(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();

    shouldFail = false;
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toBe('ok');
    });
  });
});
