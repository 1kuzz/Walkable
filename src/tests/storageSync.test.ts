/**
 * storageSync.test.ts — Unit tests for the storageSync utility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readStorageValue,
  setStorageValue,
  deleteStorageValue,
  subscribeToStorageKey,
} from '../utils/storageSync';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// readStorageValue
// ---------------------------------------------------------------------------

describe('readStorageValue', () => {
  it('returns the defaultValue when no entry exists', () => {
    expect(readStorageValue('non_existent_key', 42)).toBe(42);
  });

  it('returns the stored string value', () => {
    localStorage.setItem('test_key', JSON.stringify('hello'));
    expect(readStorageValue('test_key', '')).toBe('hello');
  });

  it('returns the stored number value', () => {
    localStorage.setItem('num_key', JSON.stringify(123));
    expect(readStorageValue('num_key', 0)).toBe(123);
  });

  it('returns the stored boolean value', () => {
    localStorage.setItem('bool_key', JSON.stringify(true));
    expect(readStorageValue('bool_key', false)).toBe(true);
  });

  it('returns the stored object value', () => {
    const obj = { name: 'Alice', age: 30 };
    localStorage.setItem('obj_key', JSON.stringify(obj));
    expect(readStorageValue('obj_key', null)).toEqual(obj);
  });

  it('returns the stored array value', () => {
    const arr = [1, 2, 3];
    localStorage.setItem('arr_key', JSON.stringify(arr));
    expect(readStorageValue('arr_key', [])).toEqual(arr);
  });

  it('returns the defaultValue when the stored JSON is malformed', () => {
    localStorage.setItem('bad_key', 'not-valid-json{{{');
    expect(readStorageValue('bad_key', 'fallback')).toBe('fallback');
  });

  it('returns the defaultValue for null raw entry', () => {
    // Explicitly confirm null item → default
    expect(readStorageValue('absent', 'default')).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// setStorageValue
// ---------------------------------------------------------------------------

describe('setStorageValue', () => {
  it('persists a string value as JSON', () => {
    setStorageValue('str_key', 'world');
    expect(localStorage.getItem('str_key')).toBe(JSON.stringify('world'));
  });

  it('persists a number value as JSON', () => {
    setStorageValue('num_key', 99);
    expect(localStorage.getItem('num_key')).toBe(JSON.stringify(99));
  });

  it('persists a boolean value as JSON', () => {
    setStorageValue('bool_key', false);
    expect(localStorage.getItem('bool_key')).toBe(JSON.stringify(false));
  });

  it('persists an object value as JSON', () => {
    const obj = { foo: 'bar' };
    setStorageValue('obj_key', obj);
    expect(JSON.parse(localStorage.getItem('obj_key')!)).toEqual(obj);
  });

  it('overwrites an existing value', () => {
    setStorageValue('key', 'first');
    setStorageValue('key', 'second');
    expect(readStorageValue('key', '')).toBe('second');
  });

  it('notifies subscribers when a value is set', () => {
    let called = false;
    const unsubscribe = subscribeToStorageKey('notify_key', () => { called = true; });
    setStorageValue('notify_key', 'changed');
    unsubscribe();
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteStorageValue
// ---------------------------------------------------------------------------

describe('deleteStorageValue', () => {
  it('removes the stored item', () => {
    localStorage.setItem('to_delete', JSON.stringify('value'));
    deleteStorageValue('to_delete');
    expect(localStorage.getItem('to_delete')).toBeNull();
  });

  it('is safe to call when the key does not exist', () => {
    expect(() => deleteStorageValue('non_existent')).not.toThrow();
  });

  it('notifies subscribers when a value is deleted', () => {
    let called = false;
    setStorageValue('del_key', 'val');
    const unsubscribe = subscribeToStorageKey('del_key', () => { called = true; });
    deleteStorageValue('del_key');
    unsubscribe();
    expect(called).toBe(true);
  });

  it('after deletion, readStorageValue returns the defaultValue', () => {
    setStorageValue('temp', 'data');
    deleteStorageValue('temp');
    expect(readStorageValue('temp', 'default')).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// subscribeToStorageKey
// ---------------------------------------------------------------------------

describe('subscribeToStorageKey', () => {
  it('calls the listener when the subscribed key is written', () => {
    let callCount = 0;
    const unsubscribe = subscribeToStorageKey('listen_key', () => { callCount++; });
    setStorageValue('listen_key', 'v1');
    setStorageValue('listen_key', 'v2');
    unsubscribe();
    expect(callCount).toBe(2);
  });

  it('does not call the listener after unsubscribing', () => {
    let callCount = 0;
    const unsubscribe = subscribeToStorageKey('unsub_key', () => { callCount++; });
    setStorageValue('unsub_key', 'v1');
    unsubscribe();
    setStorageValue('unsub_key', 'v2');
    expect(callCount).toBe(1);
  });

  it('does not call the listener when a different key is written', () => {
    let called = false;
    const unsubscribe = subscribeToStorageKey('key_a', () => { called = true; });
    setStorageValue('key_b', 'value');
    unsubscribe();
    expect(called).toBe(false);
  });

  it('supports multiple listeners on the same key', () => {
    let count1 = 0;
    let count2 = 0;
    const u1 = subscribeToStorageKey('shared_key', () => { count1++; });
    const u2 = subscribeToStorageKey('shared_key', () => { count2++; });
    setStorageValue('shared_key', 'x');
    u1();
    u2();
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it('returns an unsubscribe function', () => {
    const unsubscribe = subscribeToStorageKey('fn_key', () => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('is safe to call unsubscribe multiple times', () => {
    const unsubscribe = subscribeToStorageKey('safe_key', () => {});
    expect(() => {
      unsubscribe();
      unsubscribe();
    }).not.toThrow();
  });
});
