/**
 * Request timeout middleware.
 * Default: 30s. Upload/build endpoints get 5 minutes (GitHub import can be slow).
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10);
const UPLOAD_TIMEOUT_MS  = 5 * 60 * 1000; // 5 min for uploads + builds

const EXCLUDED_PATHS = new Set(['/health', '/api/health', '/api/health/live', '/api/health/ready']);

/** Paths that need a longer timeout (file upload + GitHub download + npm build). */
const UPLOAD_PATHS = ['/api/content', '/api/queue'];

function getTimeout(path: string): number {
  if (UPLOAD_PATHS.some(p => path.startsWith(p))) return UPLOAD_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

export function requestTimeout(req: Request, res: Response, next: NextFunction): void {
  if (EXCLUDED_PATHS.has(req.path)) { next(); return; }

  const timeout = getTimeout(req.path);
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    logger.warn('[timeout] Request timed out', { method: req.method, path: req.path, timeoutMs: timeout });
    res.status(503).json({ error: 'Request timed out. For large repos or builds this can take up to 5 minutes — please retry.' });
  }, timeout);

  res.on('finish', () => clearTimeout(timer));
  res.on('close',  () => clearTimeout(timer));
  next();
}
