/**
 * Minimal structured logger for the MOPS Portal backend.
 *
 * - In production (NODE_ENV=production) each log line is a single JSON object
 *   suitable for ingestion by ELK / Azure Monitor / any log aggregator.
 * - In development the same data is pretty-printed for readability.
 *
 * Log levels (ascending severity): debug < info < warn < error
 * Set LOG_LEVEL env var to control the minimum emitted level (default: info).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel: LogLevel = (() => {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (raw in LEVELS ? raw : 'info') as LogLevel;
})();

const isProduction = process.env.NODE_ENV === 'production';

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[configuredLevel]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = isProduction ? JSON.stringify(entry) : formatDev(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/** Human-readable format for development. */
function formatDev(entry: Record<string, unknown>): string {
  const { timestamp, level, message, ...rest } = entry;
  const colour = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' }[
    String(level)
  ] ?? '';
  const reset = '\x1b[0m';
  const ts = String(timestamp).slice(11, 23); // HH:MM:SS.mmm
  const extras = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${colour}[${String(level).toUpperCase()}]${reset} ${ts} ${String(message)}${extras}`;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
