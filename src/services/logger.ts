/** Centralized logger — console output + localStorage persistence for admin inspection. */

import { deleteStorageValue, readStorageValue, setStorageValue, useStorageValue } from '../utils/storageSync';
import { useMemo } from 'react';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: string;
}

const STORAGE_KEY = 'mops_debug_log';
const MAX_ENTRIES = 300;

function readEntries(): LogEntry[] {
  const items = readStorageValue<unknown>(STORAGE_KEY, []);
  return Array.isArray(items) ? (items as LogEntry[]) : [];
}

function writeEntries(entries: LogEntry[]): void {
  if (entries.length === 0) {
    deleteStorageValue(STORAGE_KEY);
    return;
  }
  setStorageValue(STORAGE_KEY, entries);
}

function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

const CONSOLE_METHODS: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function addEntry(level: LogLevel, context: string, message: string, data?: unknown): void {
  let dataStr: string | undefined;
  if (data !== undefined) {
    try {
      dataStr = data instanceof Error
        ? `${data.name}: ${data.message}${data.stack ? `\n${data.stack}` : ''}`
        : JSON.stringify(data, null, 2);
    } catch {
      dataStr = String(data);
    }
  }

  const entry: LogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...(dataStr !== undefined && { data: dataStr }),
  };

  // Console output
  const prefix = `[${context}]`;
  if (data !== undefined) {
    console[CONSOLE_METHODS[level]](prefix, message, data);
  } else {
    console[CONSOLE_METHODS[level]](prefix, message);
  }

  // Persist to localStorage
  try {
    const entries = readEntries();
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    writeEntries(entries);
  } catch {
    // Storage unavailable — console output still happened above
  }
}

/** Centralized logger. Writes to console and persists to localStorage. */
export const logger = {
  debug: (context: string, message: string, data?: unknown) =>
    addEntry('debug', context, message, data),
  info: (context: string, message: string, data?: unknown) =>
    addEntry('info', context, message, data),
  warn: (context: string, message: string, data?: unknown) =>
    addEntry('warn', context, message, data),
  error: (context: string, message: string, data?: unknown) =>
    addEntry('error', context, message, data),
};

/** Return recent log entries, newest first. */
export function getLogEntries(count = 200): LogEntry[] {
  const entries = readEntries();
  return entries.slice(-count).reverse();
}

/** Clear all stored log entries. */
export function clearLogs(): void {
  deleteStorageValue(STORAGE_KEY);
}

/** Reactive log entries hook (syncs same-tab and cross-tab updates). */
export function useLogEntries(): LogEntry[] {
  const items = useStorageValue<unknown>(STORAGE_KEY, []);
  return useMemo(
    () => (Array.isArray(items) ? ([...items as LogEntry[]].reverse()) : []),
    [items],
  );
}
