/**
 * Request timeout middleware.
 *
 * Aborts long-running requests after the configured timeout and returns
 * 503 Service Unavailable so clients receive a deterministic error rather
 * than waiting indefinitely.  Health-check endpoints are excluded so that
 * monitoring probes are never affected.
 *
 * Configure with the REQUEST_TIMEOUT_MS environment variable (default: 30 000 ms).
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10);

/** Paths that are explicitly excluded from the timeout (health probes, etc.). */
const EXCLUDED_PATHS = new Set(['/health', '/api/health', '/api/health/live', '/api/health/ready']);

export function requestTimeout(req: Request, res: Response, next: NextFunction): void {
  if (EXCLUDED_PATHS.has(req.path)) {
    next();
    return;
  }

  const timer = setTimeout(() => {
    if (res.headersSent) return;
    logger.warn('[timeout] Request timed out', {
      method: req.method,
      path: req.path,
      timeoutMs: TIMEOUT_MS,
    });
    res.status(503).json({ error: 'Request timed out. Please try again.' });
  }, TIMEOUT_MS);

  // Clean up timer when the response finishes (success or error).
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));

  next();
}
