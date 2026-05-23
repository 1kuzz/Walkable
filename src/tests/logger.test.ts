import { describe, it, expect, beforeEach } from 'vitest';
import {
  logger,
  getLogEntries,
  clearLogs,
  type LogEntry,
} from '../services/logger';

beforeEach(() => {
  localStorage.clear();
});

describe('logger.info / logger.error / logger.warn / logger.debug', () => {
  it('persists an info entry', () => {
    logger.info('TestCtx', 'hello world');
    const entries = getLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('info');
    expect(entries[0].context).toBe('TestCtx');
    expect(entries[0].message).toBe('hello world');
    expect(entries[0].id).toMatch(/^log_/);
    expect(entries[0].timestamp).toBeTruthy();
  });

  it('persists a warn entry with data', () => {
    logger.warn('AuthProvider', 'Token expired', { userId: 'KL\\User' });
    const entries = getLogEntries();
    expect(entries[0].level).toBe('warn');
    expect(entries[0].data).toContain('KL\\\\User');
  });

  it('persists an error entry from an Error object', () => {
    const err = new Error('Something failed');
    logger.error('ErrorBoundary', err.message, err);
    const entries = getLogEntries();
    expect(entries[0].level).toBe('error');
    expect(entries[0].message).toBe('Something failed');
    expect(entries[0].data).toContain('Something failed');
  });

  it('persists a debug entry', () => {
    logger.debug('GalleryPage', 'Debug message');
    const entries = getLogEntries();
    expect(entries[0].level).toBe('debug');
  });

  it('returns entries newest-first', () => {
    logger.info('Ctx', 'first');
    logger.warn('Ctx', 'second');
    logger.error('Ctx', 'third');
    const entries = getLogEntries();
    expect(entries[0].message).toBe('third');
    expect(entries[1].message).toBe('second');
    expect(entries[2].message).toBe('first');
  });

  it('limits stored entries to MAX_ENTRIES (300)', () => {
    for (let i = 0; i < 310; i++) {
      logger.debug('Ctx', `msg-${i}`);
    }
    const entries = getLogEntries(400);
    expect(entries.length).toBeLessThanOrEqual(300);
  });
});

describe('getLogEntries', () => {
  it('returns empty array when no entries exist', () => {
    expect(getLogEntries()).toHaveLength(0);
  });

  it('respects the count limit', () => {
    for (let i = 0; i < 10; i++) logger.info('Ctx', `msg-${i}`);
    const entries = getLogEntries(3);
    expect(entries).toHaveLength(3);
  });

  it('handles malformed localStorage gracefully', () => {
    localStorage.setItem('mops_debug_log', 'not-valid-json');
    expect(() => getLogEntries()).not.toThrow();
    expect(getLogEntries()).toHaveLength(0);
  });
});

describe('clearLogs', () => {
  it('removes all stored log entries', () => {
    logger.info('Ctx', 'msg1');
    logger.error('Ctx', 'msg2');
    expect(getLogEntries()).toHaveLength(2);
    clearLogs();
    expect(getLogEntries()).toHaveLength(0);
  });

  it('is safe to call when there are no entries', () => {
    expect(() => clearLogs()).not.toThrow();
  });
});

describe('LogEntry shape', () => {
  it('entry without data has no data field', () => {
    logger.info('Ctx', 'no data');
    const entry: LogEntry = getLogEntries()[0];
    expect(entry.data).toBeUndefined();
  });

  it('entry with object data serializes to JSON string', () => {
    logger.info('Ctx', 'with data', { key: 'value' });
    const entry: LogEntry = getLogEntries()[0];
    expect(entry.data).toBe('{\n  "key": "value"\n}');
  });
});
