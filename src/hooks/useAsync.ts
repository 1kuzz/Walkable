import { useEffect, useCallback, useRef, useReducer } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Reducer

type State<T> = { data: T | null; loading: boolean; error: Error | null };

type Action<T> =
  | { type: 'start' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: Error };

function createInitialState<T>(): State<T> {
  return { data: null, loading: true, error: null };
}

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'start':
      return { data: state.data, loading: true, error: null };
    case 'success':
      return { data: action.data, loading: false, error: null };
    case 'error':
      return { data: null, loading: false, error: action.error };
  }
}

// Hook

/** Generic hook for async data fetching with loading/error state. */
export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [state, dispatch] = useReducer(reducer<T>, undefined, createInitialState<T>);

  // Keep a stable reference so the callback only changes when fn changes.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const execute = useCallback(() => {
    let cancelled = false;

    dispatch({ type: 'start' });

    fnRef
      .current()
      .then((data) => {
        if (!cancelled) dispatch({ type: 'success', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'error',
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = execute();
    return cancel;
  }, [execute]);

  return { ...state, refetch: execute };
}
